-- P1-L3 additive migration, transactionally executed by the private preparer
-- as this database's existing NOLOGIN owner. No credentials or startup DDL.
DO $$ BEGIN
 IF current_setting('server_encoding')<>'UTF8' OR current_setting('client_encoding')<>'UTF8'
 OR current_user NOT IN('saas_owner_a','saas_owner_b')
 OR (SELECT rolcanlogin OR rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user)
 THEN RAISE EXCEPTION 'RECOVERY_MIGRATION_OWNER_INVALID'; END IF;
END $$;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
CREATE TABLE inventory.recovery_guard (
 id smallint PRIMARY KEY CHECK(id=1),tenant_id uuid NOT NULL,
 recovery_id uuid,controller_owner uuid,manifest_hash text CHECK(manifest_hash ~ '^[0-9a-f]{64}$'),
 mode text NOT NULL CHECK(mode IN('UNBOUND','NORMAL','RECOVERY')),
 source_generation uuid,source_epoch bigint CHECK(source_epoch>0),closed_version bigint CHECK(closed_version>0),
 target_generation uuid,target_epoch bigint CHECK(target_epoch>0),open_version bigint CHECK(open_version>0),
 eligibility text CHECK(eligibility IN('OPEN_ELIGIBLE','RESTRICTED_CLOSED')),
 closed_reason text CHECK(closed_reason IN('NONE','TENANT','IDENTITY','MEMBERSHIP','GRANT','LOGOUT','RESTORE','SHUTDOWN','POLICY','ROTATION','EPOCH')),
 source_resource_hash text CHECK(source_resource_hash ~ '^[0-9a-f]{64}$'),
 target_resource_hash text CHECK(target_resource_hash ~ '^[0-9a-f]{64}$'),
 guard_hash text CHECK(guard_hash ~ '^[0-9a-f]{64}$'),proof_hash text CHECK(proof_hash ~ '^[0-9a-f]{64}$'),
 stage text NOT NULL CHECK(stage IN('UNBOUND','COMPLETE','CLOSED_CONFIGURED','VERIFIED','LOCAL_OPEN','SEALED','ABORTED_CLOSED')),
 version bigint NOT NULL CHECK(version>0),abort_id uuid,abort_version bigint CHECK(abort_version>0),
 CHECK(mode='UNBOUND' OR (recovery_id IS NOT NULL AND controller_owner IS NOT NULL AND manifest_hash IS NOT NULL
 AND source_generation IS NOT NULL AND target_generation IS NOT NULL AND source_epoch IS NOT NULL AND target_epoch IS NOT NULL
 AND source_resource_hash IS NOT NULL AND target_resource_hash IS NOT NULL)),
 CHECK(mode<>'RECOVERY' OR (source_generation<>target_generation AND target_epoch=source_epoch+1
 AND closed_version<=9223372036854775805::bigint AND open_version=closed_version+1 AND abort_version=closed_version+2))
);
-- A preallocated singleton keeps every later transition at the same logical
-- cost. It remains UNBOUND (never implicitly NORMAL) until fixed bootstrap.
INSERT INTO inventory.recovery_guard(id,tenant_id,mode,stage,version)
 SELECT 1,tenant_id,'UNBOUND','UNBOUND',1 FROM inventory.writer_fence WHERE id=1;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM inventory.recovery_guard WHERE id=1) THEN RAISE EXCEPTION 'RECOVERY_FENCE_MISSING'; END IF;
 PERFORM 1 FROM inventory.writer_fence WHERE id=1 FOR UPDATE;
 PERFORM 1 FROM inventory.quota_state WHERE id=1 AND logical_bytes=inventory.logical_usage()
 AND logical_bytes<=max_logical_bytes-4352 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_LOGICAL_QUOTA'; END IF;
 UPDATE inventory.quota_state SET logical_bytes=logical_bytes+4352 WHERE id=1;
END $$;
CREATE OR REPLACE FUNCTION inventory.logical_usage() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,inventory,catalog AS $$
 SELECT coalesce(sum(cost),0)::bigint FROM (
 SELECT inventory.logical_cost('product',to_jsonb(p)) cost FROM catalog.products p
 UNION ALL SELECT inventory.logical_cost('balance',to_jsonb(b)) FROM inventory.balances b
 UNION ALL SELECT inventory.logical_cost('movement',to_jsonb(m)) FROM inventory.movements m
 UNION ALL SELECT inventory.logical_cost('operation',to_jsonb(o)) FROM inventory.operations o
 UNION ALL SELECT inventory.logical_cost('audit',to_jsonb(a)) FROM inventory.audit a
 UNION ALL SELECT inventory.logical_cost('quota',to_jsonb(q)) FROM inventory.quota_state q
 UNION ALL SELECT inventory.logical_cost('fence',to_jsonb(f)) FROM inventory.writer_fence f
 UNION ALL SELECT 4352::bigint FROM inventory.recovery_guard WHERE id=1) rows
$$;
CREATE FUNCTION inventory.recovery_row_bound() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,inventory AS $$
BEGIN
 IF octet_length(convert_to(to_jsonb(NEW)::text,'UTF8'))>4096 THEN RAISE EXCEPTION 'RECOVERY_ROW_BOUND'; END IF;
 IF TG_OP='UPDATE' AND NEW.version<OLD.version THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bounded_recovery_guard BEFORE INSERT OR UPDATE ON inventory.recovery_guard
 FOR EACH ROW EXECUTE FUNCTION inventory.recovery_row_bound();

CREATE FUNCTION inventory.initialize_recovery_normal(p_run uuid,p_controller uuid,p_manifest text,p_resource text)
RETURNS SETOF inventory.recovery_guard LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,inventory AS $$
DECLARE f inventory.writer_fence%ROWTYPE;g inventory.recovery_guard%ROWTYPE;
BEGIN
 SELECT * INTO f FROM inventory.writer_fence WHERE id=1 FOR UPDATE;
 SELECT * INTO g FROM inventory.recovery_guard WHERE id=1 FOR UPDATE;
 IF f.id IS NULL OR g.id IS NULL THEN RAISE EXCEPTION 'RECOVERY_FENCE_MISSING'; END IF;
 IF p_run IS NULL OR p_controller IS NULL OR p_manifest IS NULL OR p_manifest !~ '^[0-9a-f]{64}$'
 OR p_resource IS NULL OR p_resource !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'RECOVERY_INPUT_INVALID'; END IF;
 IF g.mode='NORMAL' THEN
  IF ROW(g.recovery_id,g.controller_owner,g.manifest_hash,g.target_resource_hash,g.target_generation,g.target_epoch)
  IS DISTINCT FROM ROW(p_run,p_controller,p_manifest,p_resource,f.generation,f.data_epoch)
  THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
  RETURN NEXT g;RETURN;
 END IF;
 IF g.mode<>'UNBOUND' OR g.stage<>'UNBOUND' THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
 UPDATE inventory.recovery_guard SET recovery_id=p_run,controller_owner=p_controller,manifest_hash=p_manifest,
 mode='NORMAL',source_generation=f.generation,target_generation=f.generation,source_epoch=f.data_epoch,target_epoch=f.data_epoch,
 eligibility=CASE WHEN f.state='OPEN' THEN 'OPEN_ELIGIBLE' ELSE 'RESTRICTED_CLOSED' END,
 closed_reason=CASE WHEN f.state='OPEN' THEN 'NONE' ELSE 'TENANT' END,
 source_resource_hash=p_resource,target_resource_hash=p_resource,stage='COMPLETE',version=version+1 WHERE id=1;
 RETURN QUERY SELECT * FROM inventory.recovery_guard WHERE id=1;
END $$;

CREATE FUNCTION inventory.configure_recovery(p_run uuid,p_controller uuid,p_manifest text,p_tenant uuid,
 p_source uuid,p_target uuid,p_source_epoch bigint,p_target_epoch bigint,p_closed bigint,p_eligibility text,
 p_reason text,p_source_resource text,p_target_resource text,p_guard_hash text)
RETURNS SETOF inventory.recovery_guard LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,inventory AS $$
DECLARE f inventory.writer_fence%ROWTYPE;g inventory.recovery_guard%ROWTYPE;
BEGIN
 SELECT * INTO f FROM inventory.writer_fence WHERE id=1 FOR UPDATE;
 SELECT * INTO g FROM inventory.recovery_guard WHERE id=1 FOR UPDATE;
 IF f.id IS NULL OR g.id IS NULL THEN RAISE EXCEPTION 'RECOVERY_FENCE_MISSING'; END IF;
 IF p_run IS NULL OR p_controller IS NULL OR p_source IS NULL OR p_target IS NULL OR p_tenant IS NULL
 OR p_source=p_target OR p_source_epoch IS NULL OR p_source_epoch<=0 OR p_source_epoch=9223372036854775807::bigint
 OR p_target_epoch IS DISTINCT FROM p_source_epoch+1 OR p_closed IS NULL OR p_closed<=0 OR p_closed>9223372036854775805::bigint
 OR p_eligibility IS NULL OR p_eligibility NOT IN('OPEN_ELIGIBLE','RESTRICTED_CLOSED')
 OR p_reason IS NULL OR p_reason NOT IN('RESTORE','TENANT','IDENTITY','MEMBERSHIP','GRANT','LOGOUT','SHUTDOWN','POLICY','ROTATION','EPOCH')
 OR p_manifest IS NULL OR p_manifest !~ '^[0-9a-f]{64}$' OR p_guard_hash IS NULL OR p_guard_hash !~ '^[0-9a-f]{64}$'
 OR p_source_resource IS NULL OR p_source_resource !~ '^[0-9a-f]{64}$' OR p_target_resource IS NULL
 OR p_target_resource !~ '^[0-9a-f]{64}$' OR p_source_resource=p_target_resource
 THEN RAISE EXCEPTION 'RECOVERY_INPUT_INVALID'; END IF;
 IF g.mode='RECOVERY' AND g.recovery_id=p_run THEN
  IF ROW(g.controller_owner,g.manifest_hash,g.tenant_id,g.source_generation,g.target_generation,g.source_epoch,g.target_epoch,
   g.closed_version,g.eligibility,g.closed_reason,g.source_resource_hash,g.target_resource_hash,g.guard_hash)
  IS DISTINCT FROM ROW(p_controller,p_manifest,p_tenant,p_source,p_target,p_source_epoch,p_target_epoch,p_closed,
   p_eligibility,p_reason,p_source_resource,p_target_resource,p_guard_hash)
  THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
  IF f.generation<>p_target OR f.data_epoch<>p_target_epoch
  OR f.writer_version<>(CASE WHEN g.stage='ABORTED_CLOSED' AND g.eligibility='OPEN_ELIGIBLE' THEN g.abort_version
   WHEN g.stage IN('LOCAL_OPEN','SEALED') AND g.eligibility='OPEN_ELIGIBLE' THEN g.open_version ELSE g.closed_version END)
  OR f.state<>(CASE WHEN g.stage IN('LOCAL_OPEN','SEALED') AND g.eligibility='OPEN_ELIGIBLE' THEN 'OPEN' ELSE 'CLOSED' END)
  THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
  RETURN NEXT g;RETURN;
 END IF;
 IF g.mode<>'NORMAL' OR g.stage<>'COMPLETE' OR f.state<>'CLOSED' OR f.tenant_id<>p_tenant
 OR f.generation<>p_source OR f.data_epoch<>p_source_epoch OR f.writer_version<>p_closed
 OR NOT EXISTS(SELECT 1 FROM inventory.quota_state WHERE id=1 AND logical_bytes=inventory.logical_usage())
 THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 UPDATE inventory.writer_fence SET generation=p_target,data_epoch=p_target_epoch WHERE id=1;
 UPDATE inventory.recovery_guard SET recovery_id=p_run,controller_owner=p_controller,manifest_hash=p_manifest,mode='RECOVERY',
 source_generation=p_source,target_generation=p_target,source_epoch=p_source_epoch,target_epoch=p_target_epoch,
 closed_version=p_closed,open_version=p_closed+1,abort_version=p_closed+2,abort_id=NULL,
 eligibility=p_eligibility,closed_reason=p_reason,source_resource_hash=p_source_resource,target_resource_hash=p_target_resource,
 guard_hash=p_guard_hash,stage='CLOSED_CONFIGURED',proof_hash=NULL,version=version+1 WHERE id=1;
 RETURN QUERY SELECT * FROM inventory.recovery_guard WHERE id=1;
END $$;

CREATE FUNCTION inventory.verify_recovery(p_run uuid,p_controller uuid,p_expected bigint,p_proof text)
RETURNS SETOF inventory.recovery_guard LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,inventory AS $$
DECLARE f inventory.writer_fence%ROWTYPE;g inventory.recovery_guard%ROWTYPE;
BEGIN
 SELECT * INTO f FROM inventory.writer_fence WHERE id=1 FOR UPDATE;
 SELECT * INTO g FROM inventory.recovery_guard WHERE id=1 FOR UPDATE;
 IF f.id IS NULL OR g.id IS NULL THEN RAISE EXCEPTION 'RECOVERY_FENCE_MISSING'; END IF;
 IF g.recovery_id IS DISTINCT FROM p_run OR g.controller_owner IS DISTINCT FROM p_controller OR g.mode<>'RECOVERY'
 OR p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$'
 OR f.state<>'CLOSED' OR f.generation<>g.target_generation OR f.data_epoch<>g.target_epoch OR f.writer_version<>g.closed_version
 THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 IF g.stage='VERIFIED' AND g.version=p_expected+1 AND g.proof_hash=p_proof THEN RETURN NEXT g;RETURN; END IF;
 IF g.stage<>'CLOSED_CONFIGURED' OR g.version IS DISTINCT FROM p_expected OR g.version=9223372036854775807::bigint
 THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 UPDATE inventory.recovery_guard SET stage='VERIFIED',proof_hash=p_proof,version=version+1 WHERE id=1;
 RETURN QUERY SELECT * FROM inventory.recovery_guard WHERE id=1;
END $$;
CREATE FUNCTION inventory.prepare_recovery_open(p_run uuid,p_controller uuid,p_expected bigint)
RETURNS SETOF inventory.recovery_guard LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,inventory AS $$
DECLARE f inventory.writer_fence%ROWTYPE;g inventory.recovery_guard%ROWTYPE;
BEGIN
 SELECT * INTO f FROM inventory.writer_fence WHERE id=1 FOR UPDATE;
 SELECT * INTO g FROM inventory.recovery_guard WHERE id=1 FOR UPDATE;
 IF f.id IS NULL OR g.id IS NULL THEN RAISE EXCEPTION 'RECOVERY_FENCE_MISSING'; END IF;
 IF g.recovery_id IS DISTINCT FROM p_run OR g.controller_owner IS DISTINCT FROM p_controller OR g.mode<>'RECOVERY'
 OR g.eligibility<>'OPEN_ELIGIBLE' OR f.generation<>g.target_generation OR f.data_epoch<>g.target_epoch
 THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 IF g.stage='LOCAL_OPEN' AND g.version=p_expected+1 AND f.state='OPEN' AND f.writer_version=g.open_version THEN RETURN NEXT g;RETURN; END IF;
 IF g.stage<>'VERIFIED' OR g.version IS DISTINCT FROM p_expected OR g.version=9223372036854775807::bigint
 OR f.state<>'CLOSED' OR f.writer_version<>g.closed_version THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 UPDATE inventory.writer_fence SET state='OPEN',writer_version=g.open_version WHERE id=1;
 UPDATE inventory.recovery_guard SET stage='LOCAL_OPEN',version=version+1 WHERE id=1;
 RETURN QUERY SELECT * FROM inventory.recovery_guard WHERE id=1;
END $$;
CREATE FUNCTION inventory.seal_recovery(p_run uuid,p_controller uuid,p_expected bigint,p_proof text)
RETURNS SETOF inventory.recovery_guard LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,inventory AS $$
DECLARE f inventory.writer_fence%ROWTYPE;g inventory.recovery_guard%ROWTYPE;
BEGIN
 SELECT * INTO f FROM inventory.writer_fence WHERE id=1 FOR UPDATE;
 SELECT * INTO g FROM inventory.recovery_guard WHERE id=1 FOR UPDATE;
 IF f.id IS NULL OR g.id IS NULL THEN RAISE EXCEPTION 'RECOVERY_FENCE_MISSING'; END IF;
 IF g.recovery_id IS DISTINCT FROM p_run OR g.controller_owner IS DISTINCT FROM p_controller OR g.mode<>'RECOVERY'
 OR p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' OR f.generation<>g.target_generation OR f.data_epoch<>g.target_epoch
 OR NOT ((g.eligibility='OPEN_ELIGIBLE' AND f.state='OPEN' AND f.writer_version=g.open_version)
 OR(g.eligibility='RESTRICTED_CLOSED' AND f.state='CLOSED' AND f.writer_version=g.closed_version))
 THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 IF g.stage='SEALED' AND g.version=p_expected+1 AND g.proof_hash=p_proof THEN RETURN NEXT g;RETURN; END IF;
 IF g.version IS DISTINCT FROM p_expected OR g.version=9223372036854775807::bigint
 OR NOT ((g.eligibility='OPEN_ELIGIBLE' AND g.stage='LOCAL_OPEN') OR(g.eligibility='RESTRICTED_CLOSED' AND g.stage='VERIFIED'))
 THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 UPDATE inventory.recovery_guard SET stage='SEALED',proof_hash=p_proof,version=version+1 WHERE id=1;
 RETURN QUERY SELECT * FROM inventory.recovery_guard WHERE id=1;
END $$;
CREATE FUNCTION inventory.abort_recovery(p_run uuid,p_controller uuid,p_expected bigint,p_abort uuid)
RETURNS SETOF inventory.recovery_guard LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,inventory AS $$
DECLARE f inventory.writer_fence%ROWTYPE;g inventory.recovery_guard%ROWTYPE;
BEGIN
 SELECT * INTO f FROM inventory.writer_fence WHERE id=1 FOR UPDATE;
 SELECT * INTO g FROM inventory.recovery_guard WHERE id=1 FOR UPDATE;
 IF f.id IS NULL OR g.id IS NULL THEN RAISE EXCEPTION 'RECOVERY_FENCE_MISSING'; END IF;
 IF g.recovery_id IS DISTINCT FROM p_run OR g.controller_owner IS DISTINCT FROM p_controller OR g.mode<>'RECOVERY'
 OR p_abort IS NULL OR f.generation<>g.target_generation OR f.data_epoch<>g.target_epoch THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 IF g.stage='ABORTED_CLOSED' AND g.abort_id=p_abort AND g.version=p_expected+1 AND f.state='CLOSED'
 AND f.writer_version=(CASE WHEN g.eligibility='OPEN_ELIGIBLE' THEN g.abort_version ELSE g.closed_version END) THEN RETURN NEXT g;RETURN; END IF;
 IF g.version IS DISTINCT FROM p_expected OR g.version=9223372036854775807::bigint OR g.abort_id IS NOT NULL
 OR f.writer_version NOT IN(g.closed_version,g.open_version) OR(g.eligibility='RESTRICTED_CLOSED' AND (f.state<>'CLOSED' OR f.writer_version<>g.closed_version))
 THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 IF g.eligibility='OPEN_ELIGIBLE' THEN UPDATE inventory.writer_fence SET state='CLOSED',writer_version=g.abort_version WHERE id=1; END IF;
 UPDATE inventory.recovery_guard SET stage='ABORTED_CLOSED',abort_id=p_abort,version=version+1 WHERE id=1;
 RETURN QUERY SELECT * FROM inventory.recovery_guard WHERE id=1;
END $$;

-- No normal fence opener may bypass a pending recovered guard. Only the fixed
-- recovery opener above can create LOCAL_OPEN. Restrictions may always close.
CREATE OR REPLACE FUNCTION inventory.open_writer_fence(p_generation uuid,p_epoch bigint,p_expected bigint,p_open bigint)
RETURNS SETOF inventory.writer_fence LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,inventory AS $$
DECLARE f inventory.writer_fence%ROWTYPE;g inventory.recovery_guard%ROWTYPE;
BEGIN
 SELECT * INTO f FROM inventory.writer_fence WHERE id=1 FOR UPDATE;
 SELECT * INTO g FROM inventory.recovery_guard WHERE id=1 FOR SHARE;
 IF f.id IS NULL OR g.id IS NULL THEN RAISE EXCEPTION 'RECOVERY_FENCE_MISSING'; END IF;
 IF NOT ((g.mode='NORMAL' AND g.stage='COMPLETE') OR(g.mode='RECOVERY' AND g.stage='SEALED' AND p_expected>g.open_version)) OR p_expected=9223372036854775807::bigint
 OR f.generation<>p_generation OR f.data_epoch<>p_epoch OR p_open<>p_expected+1
 OR NOT ((f.state='CLOSED' AND f.writer_version=p_expected) OR(f.state='OPEN' AND f.writer_version=p_open))
 THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 UPDATE inventory.writer_fence SET state='OPEN',writer_version=p_open WHERE id=1;
 RETURN QUERY SELECT * FROM inventory.writer_fence WHERE id=1;
END $$;
-- The fixed writer wrappers retain the canonical parser, digest and results.
-- SEALED alone never grants central admission; central's global barrier and
-- run guard stay closed until the single activation COMMIT.
CREATE FUNCTION inventory.recovery_write_guard(p_generation uuid,p_epoch bigint,p_version bigint) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,inventory AS $$
BEGIN
 PERFORM 1 FROM inventory.writer_fence WHERE id=1 AND generation=p_generation AND data_epoch=p_epoch
 AND writer_version=p_version AND state='OPEN' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WRITER_FENCE_CLOSED'; END IF;
 PERFORM 1 FROM inventory.recovery_guard WHERE id=1 AND target_generation=p_generation AND target_epoch=p_epoch
 AND ((mode='NORMAL' AND stage='COMPLETE') OR(mode='RECOVERY' AND stage='SEALED' AND eligibility='OPEN_ELIGIBLE')) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_CLOSED'; END IF;
END $$;
CREATE OR REPLACE FUNCTION inventory.create_product(p_operation uuid,p_preimage text,p_hash text,p_generation uuid,p_epoch bigint,p_writer_version bigint)
RETURNS TABLE(result jsonb,logical_delta bigint,replay boolean,result_hash text) LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,inventory AS $$
BEGIN
 PERFORM inventory.recovery_write_guard(p_generation,p_epoch,p_writer_version);
 RETURN QUERY SELECT * FROM inventory.apply_write('catalog.create',p_operation,p_preimage,p_hash,p_generation,p_epoch,p_writer_version);
END $$;
CREATE OR REPLACE FUNCTION inventory.receive_stock(p_operation uuid,p_preimage text,p_hash text,p_generation uuid,p_epoch bigint,p_writer_version bigint)
RETURNS TABLE(result jsonb,logical_delta bigint,replay boolean,result_hash text) LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,inventory AS $$
BEGIN
 PERFORM inventory.recovery_write_guard(p_generation,p_epoch,p_writer_version);
 RETURN QUERY SELECT * FROM inventory.apply_write('inventory.receive',p_operation,p_preimage,p_hash,p_generation,p_epoch,p_writer_version);
END $$;
REVOKE ALL ON inventory.recovery_guard FROM PUBLIC;
REVOKE ALL ON FUNCTION inventory.recovery_row_bound(),inventory.recovery_write_guard(uuid,bigint,bigint),
 inventory.initialize_recovery_normal(uuid,uuid,text,text),
 inventory.configure_recovery(uuid,uuid,text,uuid,uuid,uuid,bigint,bigint,bigint,text,text,text,text,text),
 inventory.verify_recovery(uuid,uuid,bigint,text),inventory.prepare_recovery_open(uuid,uuid,bigint),
 inventory.seal_recovery(uuid,uuid,bigint,text),inventory.abort_recovery(uuid,uuid,bigint,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF current_user='saas_owner_a' THEN
 GRANT SELECT ON inventory.recovery_guard TO saas_maintainer_a;
 GRANT EXECUTE ON FUNCTION inventory.initialize_recovery_normal(uuid,uuid,text,text),
 inventory.configure_recovery(uuid,uuid,text,uuid,uuid,uuid,bigint,bigint,bigint,text,text,text,text,text),
 inventory.verify_recovery(uuid,uuid,bigint,text),inventory.prepare_recovery_open(uuid,uuid,bigint),
 inventory.seal_recovery(uuid,uuid,bigint,text),inventory.abort_recovery(uuid,uuid,bigint,uuid) TO saas_maintainer_a;
 ELSE
 GRANT SELECT ON inventory.recovery_guard TO saas_maintainer_b;
 GRANT EXECUTE ON FUNCTION inventory.initialize_recovery_normal(uuid,uuid,text,text),
 inventory.configure_recovery(uuid,uuid,text,uuid,uuid,uuid,bigint,bigint,bigint,text,text,text,text,text),
 inventory.verify_recovery(uuid,uuid,bigint,text),inventory.prepare_recovery_open(uuid,uuid,bigint),
 inventory.seal_recovery(uuid,uuid,bigint,text),inventory.abort_recovery(uuid,uuid,bigint,uuid) TO saas_maintainer_b;
 END IF;
END $$;
