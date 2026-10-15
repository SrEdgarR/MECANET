-- P1-L3: private, hash-registered additive migration. The admission table was
-- created by the bootstrap owner; only its scoped ALTER runs as that owner.
RESET ROLE;
ALTER TABLE saas.admission_fence ADD COLUMN recovery_id uuid;
SET ROLE saas_owner;
DO $$ BEGIN
 IF current_setting('server_encoding')<>'UTF8' OR current_setting('client_encoding')<>'UTF8'
 OR (SELECT rolcanlogin OR rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user)
 THEN RAISE EXCEPTION 'RECOVERY_MIGRATION_OWNER_INVALID'; END IF;
END $$;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
CREATE TABLE saas.recovery_runs (
 id uuid PRIMARY KEY,controller_owner uuid NOT NULL,mode text NOT NULL CHECK(mode IN('NORMAL','RECOVERY')),
 source_generation uuid NOT NULL,target_generation uuid NOT NULL,
 manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[0-9a-f]{64}$'),
 journal_hash text CHECK(journal_hash ~ '^[0-9a-f]{64}$'),custody_hash text NOT NULL CHECK(custody_hash ~ '^[0-9a-f]{64}$'),
 source_resource_hash text NOT NULL CHECK(source_resource_hash ~ '^[0-9a-f]{64}$'),
 target_resource_hash text NOT NULL CHECK(target_resource_hash ~ '^[0-9a-f]{64}$'),
 source_end_proof_hash text CHECK(source_end_proof_hash ~ '^[0-9a-f]{64}$'),
 expected_tenants uuid[] NOT NULL CHECK(cardinality(expected_tenants)<=2),restore_restriction_ids uuid[] NOT NULL,
 seed_clock_owner uuid NOT NULL,initial_worker_owner uuid NOT NULL,current_clock_owner uuid NOT NULL,
 clock_version bigint NOT NULL CHECK(clock_version>=0),clock_tick bigint NOT NULL CHECK(clock_tick>=0),
 transfer_id uuid,previous_clock_owner uuid,next_clock_owner uuid,expected_clock_version bigint CHECK(expected_clock_version>=0),
 expected_clock_tick bigint CHECK(expected_clock_tick>=0),clock_transfer_hash text CHECK(clock_transfer_hash ~ '^[0-9a-f]{64}$'),
 clock_end_proof_hash text CHECK(clock_end_proof_hash ~ '^[0-9a-f]{64}$'),clock_proof_hash text CHECK(clock_proof_hash ~ '^[0-9a-f]{64}$'),
 config_proof_hash text CHECK(config_proof_hash ~ '^[0-9a-f]{64}$'),verified_proof_hash text CHECK(verified_proof_hash ~ '^[0-9a-f]{64}$'),
 activation_proof_hash text CHECK(activation_proof_hash ~ '^[0-9a-f]{64}$'),
 abort_id uuid,abort_proof_hash text CHECK(abort_proof_hash ~ '^[0-9a-f]{64}$'),
 journal_event_id uuid,journal_identity_id uuid,journal_identity_version bigint CHECK(journal_identity_version>0),
 journal_event_proof_hash text CHECK(journal_event_proof_hash ~ '^[0-9a-f]{64}$'),
 stage text NOT NULL CHECK(stage IN('PLANNED','CONFIGURED','CLOCK_ACQUIRED','VERIFIED','PROMOTING','COMPLETE','ABORTING','ABORTED_CLOSED')),
 version bigint NOT NULL CHECK(version>0),global_blocked boolean NOT NULL,
 CHECK((mode='NORMAL' AND source_generation=target_generation) OR(mode='RECOVERY' AND source_generation<>target_generation
 AND source_resource_hash<>target_resource_hash AND journal_hash IS NOT NULL AND source_end_proof_hash IS NOT NULL)),
 CHECK(seed_clock_owner<>initial_worker_owner),CHECK(cardinality(restore_restriction_ids)<=2)
);
CREATE TABLE saas.recovery_tenants (
 recovery_id uuid NOT NULL REFERENCES saas.recovery_runs(id),tenant_id uuid NOT NULL REFERENCES saas.tenant_directory(id),
 source_generation uuid NOT NULL,target_generation uuid NOT NULL,source_epoch bigint NOT NULL CHECK(source_epoch>0),
 target_epoch bigint NOT NULL CHECK(target_epoch>0),closed_version bigint NOT NULL CHECK(closed_version>0 AND closed_version<=9223372036854775805::bigint),
 open_version bigint NOT NULL CHECK(open_version=closed_version+1),abort_version bigint NOT NULL CHECK(abort_version=closed_version+2),
 eligibility text NOT NULL CHECK(eligibility IN('OPEN_ELIGIBLE','RESTRICTED_CLOSED')),
 closed_reason text NOT NULL CHECK(closed_reason IN('RESTORE','TENANT','IDENTITY','MEMBERSHIP','GRANT','LOGOUT','SHUTDOWN','POLICY','ROTATION','EPOCH')),
 directory_status text NOT NULL CHECK(directory_status IN('active','blocked')),
 reader_version bigint NOT NULL CHECK(reader_version>0),writer_credential_version bigint NOT NULL CHECK(writer_credential_version>0),
 reader_secret_ref text NOT NULL CHECK(length(reader_secret_ref) BETWEEN 1 AND 128),writer_secret_ref text NOT NULL CHECK(length(writer_secret_ref) BETWEEN 1 AND 128),
 restore_restriction_id uuid REFERENCES saas.write_restrictions(id),guard_hash text NOT NULL CHECK(guard_hash ~ '^[0-9a-f]{64}$'),
 configured_proof_hash text CHECK(configured_proof_hash ~ '^[0-9a-f]{64}$'),verified_proof_hash text CHECK(verified_proof_hash ~ '^[0-9a-f]{64}$'),
 local_open_proof_hash text CHECK(local_open_proof_hash ~ '^[0-9a-f]{64}$'),sealed_proof_hash text CHECK(sealed_proof_hash ~ '^[0-9a-f]{64}$'),
 abort_proof_hash text CHECK(abort_proof_hash ~ '^[0-9a-f]{64}$'),abort_id uuid,
 stage text NOT NULL CHECK(stage IN('ENROLLED','CLOSED_CONFIGURED','VERIFIED','PREPARED','LOCAL_OPEN','SEALED','ABORTED_CLOSED')),
 version bigint NOT NULL CHECK(version>0),PRIMARY KEY(recovery_id,tenant_id),
 CHECK(source_generation<>target_generation AND source_epoch<9223372036854775807::bigint AND target_epoch=source_epoch+1),
 CHECK((eligibility='OPEN_ELIGIBLE' AND directory_status='active' AND closed_reason='RESTORE' AND restore_restriction_id IS NOT NULL)
 OR(eligibility='RESTRICTED_CLOSED' AND directory_status='blocked' AND restore_restriction_id IS NULL))
);
CREATE FUNCTION saas.recovery_row_bound() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $$
BEGIN
 IF octet_length(convert_to(to_jsonb(NEW)::text,'UTF8'))>4096 THEN RAISE EXCEPTION 'RECOVERY_ROW_BOUND'; END IF;
 IF TG_OP='UPDATE' AND NEW.version<OLD.version THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION saas.recovery_binding_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $$
BEGIN
 IF ROW(NEW.id,NEW.controller_owner,NEW.mode,NEW.source_generation,NEW.target_generation,NEW.manifest_hash,
 NEW.journal_hash,NEW.custody_hash,NEW.source_resource_hash,NEW.target_resource_hash,NEW.source_end_proof_hash,
 NEW.expected_tenants,NEW.restore_restriction_ids,NEW.seed_clock_owner,NEW.initial_worker_owner)
 IS DISTINCT FROM ROW(OLD.id,OLD.controller_owner,OLD.mode,OLD.source_generation,OLD.target_generation,OLD.manifest_hash,
 OLD.journal_hash,OLD.custody_hash,OLD.source_resource_hash,OLD.target_resource_hash,OLD.source_end_proof_hash,
 OLD.expected_tenants,OLD.restore_restriction_ids,OLD.seed_clock_owner,OLD.initial_worker_owner)
 THEN RAISE EXCEPTION 'RECOVERY_BINDING_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bounded_recovery_run BEFORE INSERT OR UPDATE ON saas.recovery_runs FOR EACH ROW EXECUTE FUNCTION saas.recovery_row_bound();
CREATE TRIGGER bounded_recovery_tenant BEFORE INSERT OR UPDATE ON saas.recovery_tenants FOR EACH ROW EXECUTE FUNCTION saas.recovery_row_bound();
CREATE TRIGGER immutable_recovery_binding BEFORE UPDATE ON saas.recovery_runs FOR EACH ROW EXECUTE FUNCTION saas.recovery_binding_immutable();
CREATE OR REPLACE FUNCTION saas.write_barrier_cost() RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $$
 SELECT coalesce(sum(octet_length(convert_to(value::text,'UTF8'))+256),0)::bigint FROM (
 SELECT to_jsonb(w) value FROM saas.tenant_writer_state w UNION ALL SELECT to_jsonb(r) FROM saas.write_restrictions r
 UNION ALL SELECT to_jsonb(t) FROM saas.write_restriction_tenants t UNION ALL SELECT to_jsonb(q) FROM saas.write_control_quota q
 UNION ALL SELECT to_jsonb(r) FROM saas.recovery_runs r UNION ALL SELECT to_jsonb(t) FROM saas.recovery_tenants t) rows
$$;
CREATE FUNCTION saas.assert_recovery_budget() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM saas.write_control_quota WHERE id=1 AND used_bytes<=max_bytes-reserved_bytes
 AND saas.write_barrier_cost()<=barrier_max_bytes-4096) THEN RAISE EXCEPTION 'RECOVERY_CONTROL_QUOTA'; END IF;
END $$;
CREATE FUNCTION saas.lock_recovery(p_run uuid,p_controller uuid) RETURNS saas.recovery_runs
LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;
BEGIN
 PERFORM 1 FROM saas.admission_fence WHERE id=1 AND recovery_id=p_run FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
 SELECT * INTO r FROM saas.recovery_runs WHERE id=p_run AND controller_owner=p_controller FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
 RETURN r;
END $$;
CREATE FUNCTION saas.recovery_roster_matches(p_run uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $$
 SELECT r.expected_tenants=ARRAY(SELECT d.id FROM saas.tenant_directory d WHERE d.purpose='company' ORDER BY d.id)
 AND NOT EXISTS(SELECT 1 FROM unnest(r.expected_tenants) x(id) LEFT JOIN saas.tenant_writer_state w ON w.tenant_id=x.id WHERE w.tenant_id IS NULL)
 FROM saas.recovery_runs r WHERE r.id=p_run
$$;
CREATE FUNCTION saas.recovery_runtime_guard(p_generation uuid,p_run uuid,p_manifest text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
 SELECT coalesce(EXISTS(SELECT 1 FROM saas.recovery_runs r JOIN saas.admission_fence f ON f.recovery_id=r.id AND f.id=1
 JOIN saas.time_authority a ON a.id=1
 WHERE r.id=p_run AND r.manifest_hash=p_manifest AND r.target_generation=p_generation AND r.stage='COMPLETE'
 AND NOT r.global_blocked AND NOT f.barrier AND f.generation=p_generation AND a.generation=p_generation
 AND f.clock_version=a.clock_version AND f.tick=a.tick AND a.owner=r.current_clock_owner AND a.clock_version>=r.clock_version
 AND a.tick>=r.clock_tick AND a.clock_version-r.clock_version=a.tick-r.clock_tick
 AND saas.recovery_roster_matches(r.id) AND NOT EXISTS(SELECT 1 FROM saas.write_restrictions WHERE status<>'ACKNOWLEDGED')
 AND NOT EXISTS(SELECT 1 FROM saas.tenant_writer_state w JOIN saas.tenant_directory d ON d.id=w.tenant_id
 WHERE d.purpose='company' AND (w.generation<>p_generation OR w.data_epoch<>d.data_epoch OR d.schema_version<>3
 OR d.writer_secret_ref IS NULL OR d.writer_credential_version IS NULL OR
 (w.state='OPEN' AND d.status<>'active') OR(w.state='CLOSED' AND (d.status<>'blocked' OR NOT EXISTS(
 SELECT 1 FROM saas.write_restriction_tenants t JOIN saas.write_restrictions x ON x.id=t.restriction_id
 WHERE t.tenant_id=w.tenant_id AND t.generation=w.generation AND t.data_epoch=w.data_epoch AND t.closed_version=w.writer_version
 AND t.close_proven AND t.stage='ACKNOWLEDGED' AND x.active AND x.status='ACKNOWLEDGED') AND NOT EXISTS(
 SELECT 1 FROM saas.recovery_tenants rt JOIN saas.write_restriction_tenants t ON t.tenant_id=rt.tenant_id
 JOIN saas.write_restrictions x ON x.id=t.restriction_id
 WHERE rt.recovery_id=r.id AND rt.tenant_id=w.tenant_id AND rt.eligibility='RESTRICTED_CLOSED' AND rt.stage='SEALED'
 AND rt.target_generation=w.generation AND rt.target_epoch=w.data_epoch AND rt.closed_version=w.writer_version
 AND t.generation=rt.source_generation AND t.data_epoch=rt.source_epoch AND t.closed_version=rt.closed_version
 AND t.close_proven AND t.stage='ACKNOWLEDGED' AND x.active AND x.status='ACKNOWLEDGED' AND x.reason_code=rt.closed_reason)))))
 AND EXISTS(SELECT 1 FROM saas.write_control_quota WHERE id=1 AND used_bytes<=max_bytes-reserved_bytes AND saas.write_barrier_cost()<=barrier_max_bytes-4096)),false)
$$;
CREATE FUNCTION saas.recovery_service_state(p_generation uuid,p_run uuid,p_manifest text)
RETURNS TABLE(mode text,stage text,generation uuid,clock_owner uuid,clock_version text,tick text,ready boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
 SELECT r.mode,r.stage,r.target_generation,a.owner,a.clock_version::text,a.tick::text,
 saas.recovery_runtime_guard(p_generation,p_run,p_manifest)
 FROM saas.recovery_runs r JOIN saas.admission_fence f ON f.recovery_id=r.id AND f.id=1 JOIN saas.time_authority a ON a.id=1
 WHERE r.id=p_run AND r.target_generation=p_generation AND r.manifest_hash=p_manifest AND f.generation=p_generation AND a.generation=p_generation
$$;
CREATE FUNCTION saas.initialize_recovery_normal(p_id uuid,p_controller uuid,p_generation uuid,p_manifest text,p_custody text,
 p_resource text,p_tenants uuid[],p_worker uuid) RETURNS SETOF saas.recovery_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;f saas.admission_fence%ROWTYPE;a saas.time_authority%ROWTYPE;d saas.tenant_directory%ROWTYPE;
BEGIN
 SELECT * INTO f FROM saas.admission_fence WHERE id=1 FOR UPDATE;
 SELECT * INTO r FROM saas.recovery_runs WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
 IF f.recovery_id IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
 IF ROW(r.controller_owner,r.mode,r.target_generation,r.manifest_hash,r.custody_hash,r.target_resource_hash,r.expected_tenants,r.initial_worker_owner)
 IS DISTINCT FROM ROW(p_controller,'NORMAL'::text,p_generation,p_manifest,p_custody,p_resource,p_tenants,p_worker)
 THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;RETURN NEXT r;RETURN;END IF;
 IF p_id IS NULL OR p_controller IS NULL OR p_worker IS NULL OR p_generation IS NULL OR p_manifest IS NULL OR p_manifest !~ '^[0-9a-f]{64}$'
 OR p_custody IS NULL OR p_custody !~ '^[0-9a-f]{64}$' OR p_resource IS NULL OR p_resource !~ '^[0-9a-f]{64}$'
 OR p_tenants IS NULL OR cardinality(p_tenants)>2 OR p_tenants IS DISTINCT FROM ARRAY(SELECT DISTINCT x FROM unnest(p_tenants) x ORDER BY x)
 OR p_tenants IS DISTINCT FROM ARRAY(SELECT id FROM saas.tenant_directory WHERE purpose='company' ORDER BY id)
 OR f.id IS NULL OR f.generation<>p_generation OR f.recovery_id IS NOT NULL OR NOT f.barrier THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
 SELECT * INTO a FROM saas.time_authority WHERE id=1 FOR UPDATE;
 IF a.id IS NULL OR a.generation<>p_generation OR a.owner=p_worker OR a.clock_version<>f.clock_version OR a.tick<>f.tick
 THEN RAISE EXCEPTION 'RECOVERY_CLOCK_CONFLICT'; END IF;
 FOR d IN SELECT * FROM saas.tenant_directory WHERE purpose='company' ORDER BY id FOR UPDATE LOOP
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=d.id AND generation=p_generation AND data_epoch=d.data_epoch
 AND used_bytes<=max_logical_bytes-reserved_bytes-4352 FOR UPDATE;
 IF NOT FOUND OR d.schema_version<>2 THEN RAISE EXCEPTION 'RECOVERY_SCHEMA_CONFLICT'; END IF;
 UPDATE saas.tenant_writer_state SET used_bytes=used_bytes+4352 WHERE tenant_id=d.id;
 UPDATE saas.tenant_directory SET schema_version=3 WHERE id=d.id;
 END LOOP;
 INSERT INTO saas.recovery_runs(id,controller_owner,mode,source_generation,target_generation,manifest_hash,custody_hash,
 source_resource_hash,target_resource_hash,expected_tenants,restore_restriction_ids,seed_clock_owner,initial_worker_owner,
 current_clock_owner,clock_version,clock_tick,stage,version,global_blocked)
 VALUES(p_id,p_controller,'NORMAL',p_generation,p_generation,p_manifest,p_custody,p_resource,p_resource,p_tenants,'{}',a.owner,p_worker,a.owner,a.clock_version,a.tick,'CONFIGURED',1,true);
 UPDATE saas.admission_fence SET recovery_id=p_id WHERE id=1;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_id;
END $$;
CREATE FUNCTION saas.acknowledge_recovery_normal(p_run uuid,p_controller uuid,p_expected bigint,p_proof text)
RETURNS SETOF saas.recovery_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;a saas.time_authority%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF r.mode<>'NORMAL' OR p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'RECOVERY_INPUT_INVALID'; END IF;
 IF r.stage='COMPLETE' AND r.version=p_expected+1 AND r.activation_proof_hash=p_proof THEN RETURN NEXT r;RETURN;END IF;
 SELECT * INTO a FROM saas.time_authority WHERE id=1 FOR SHARE;
 IF r.stage<>'CLOCK_ACQUIRED' OR r.version IS DISTINCT FROM p_expected OR r.version=9223372036854775807::bigint
 OR a.id IS NULL OR a.owner<>r.current_clock_owner OR a.generation<>r.target_generation OR a.clock_version<r.clock_version
 OR NOT saas.recovery_roster_matches(p_run) OR EXISTS(SELECT 1 FROM saas.write_restrictions WHERE status<>'ACKNOWLEDGED')
 OR NOT EXISTS(SELECT 1 FROM saas.admission_fence WHERE id=1 AND tick=a.tick AND clock_version=a.clock_version AND barrier)
 THEN RAISE EXCEPTION 'RECOVERY_CLOCK_CONFLICT'; END IF;
 UPDATE saas.recovery_runs SET stage='COMPLETE',global_blocked=false,current_clock_owner=a.owner,clock_version=a.clock_version,
 clock_tick=a.tick,activation_proof_hash=p_proof,version=version+1 WHERE id=p_run;
 UPDATE saas.admission_fence SET barrier=false WHERE id=1;
 PERFORM saas.assert_recovery_budget();
 IF NOT saas.recovery_runtime_guard(r.target_generation,p_run,r.manifest_hash) THEN RAISE EXCEPTION 'RECOVERY_CONFORMITY_REQUIRED'; END IF;
 RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_run;
END $$;

CREATE FUNCTION saas.prepare_recovery_clock_transfer(p_run uuid,p_controller uuid,p_expected bigint,p_transfer uuid,p_previous uuid,p_next uuid,
 p_clock_version bigint,p_tick bigint,p_hash text,p_end_proof text) RETURNS SETOF saas.recovery_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;a saas.time_authority%ROWTYPE;f saas.admission_fence%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF p_transfer IS NULL OR p_previous IS NULL OR p_next IS NULL OR p_previous=p_next OR p_clock_version IS NULL
 OR p_clock_version<0 OR p_clock_version=9223372036854775807::bigint OR p_tick IS NULL OR p_tick<0
 OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_end_proof IS NULL OR p_end_proof !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'RECOVERY_INPUT_INVALID'; END IF;
 IF r.transfer_id=p_transfer THEN
 IF ROW(r.previous_clock_owner,r.next_clock_owner,r.expected_clock_version,r.expected_clock_tick,r.clock_transfer_hash,r.clock_end_proof_hash)
 IS DISTINCT FROM ROW(p_previous,p_next,p_clock_version,p_tick,p_hash,p_end_proof) THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
 RETURN NEXT r;RETURN;END IF;
 SELECT * INTO a FROM saas.time_authority WHERE id=1 FOR UPDATE;
 SELECT * INTO f FROM saas.admission_fence WHERE id=1;
 IF r.version IS DISTINCT FROM p_expected OR r.version=9223372036854775807::bigint OR r.stage NOT IN('CONFIGURED','CLOCK_ACQUIRED','VERIFIED','PROMOTING','COMPLETE')
 OR a.id IS NULL OR a.owner<>p_previous OR a.owner<>r.current_clock_owner OR a.generation<>r.target_generation OR f.generation<>r.target_generation
 OR a.clock_version<>p_clock_version OR a.tick<>p_tick OR f.clock_version<>p_clock_version OR f.tick<>p_tick
 OR(r.transfer_id IS NULL AND p_next<>r.initial_worker_owner)
 THEN RAISE EXCEPTION 'RECOVERY_CLOCK_CONFLICT'; END IF;
 UPDATE saas.recovery_runs SET transfer_id=p_transfer,previous_clock_owner=p_previous,next_clock_owner=p_next,
 expected_clock_version=p_clock_version,expected_clock_tick=p_tick,clock_transfer_hash=p_hash,clock_end_proof_hash=p_end_proof,version=version+1 WHERE id=p_run;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_run;
END $$;
CREATE FUNCTION saas.recovery_clock_guard(p_generation uuid,p_run uuid,p_manifest text,p_previous uuid,p_next uuid,p_transfer uuid,
 p_hash text,p_expected_version bigint,p_tick bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas AS $$
 SELECT EXISTS(SELECT 1 FROM saas.recovery_runs r JOIN saas.admission_fence f ON f.recovery_id=r.id AND f.id=1 JOIN saas.time_authority a ON a.id=1
 WHERE r.id=p_run AND r.target_generation=p_generation AND r.manifest_hash=p_manifest AND r.stage IN('CONFIGURED','CLOCK_ACQUIRED','VERIFIED','PROMOTING','COMPLETE')
 AND r.transfer_id=p_transfer AND r.clock_transfer_hash=p_hash AND r.previous_clock_owner=p_previous AND r.next_clock_owner=p_next
 AND r.expected_clock_version=p_expected_version AND r.expected_clock_tick=p_tick AND a.owner=p_previous
 AND a.generation=p_generation AND f.generation=p_generation AND a.clock_version=p_expected_version AND f.clock_version=p_expected_version
 AND a.tick=p_tick AND f.tick=p_tick)
$$;
CREATE FUNCTION saas.record_recovery_clock(p_run uuid,p_controller uuid,p_expected bigint,p_previous uuid,p_next uuid,p_hash text,p_proof text)
RETURNS SETOF saas.recovery_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;a saas.time_authority%ROWTYPE;f saas.admission_fence%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' OR r.transfer_id IS NULL OR r.previous_clock_owner IS DISTINCT FROM p_previous
 OR r.next_clock_owner IS DISTINCT FROM p_next OR r.clock_transfer_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'RECOVERY_CLOCK_CONFLICT'; END IF;
 SELECT * INTO a FROM saas.time_authority WHERE id=1 FOR SHARE;
 SELECT * INTO f FROM saas.admission_fence WHERE id=1;
 IF a.id IS NULL OR a.owner<>p_next OR a.generation<>r.target_generation OR f.generation<>r.target_generation OR a.clock_version<>f.clock_version OR a.tick<>f.tick
 OR a.clock_version<r.expected_clock_version+1 OR a.tick<r.expected_clock_tick
 OR a.clock_version-r.expected_clock_version<>a.tick-r.expected_clock_tick+1 THEN RAISE EXCEPTION 'RECOVERY_CLOCK_CONFLICT'; END IF;
 IF r.current_clock_owner=p_next AND r.clock_proof_hash=p_proof THEN RETURN NEXT r;RETURN;END IF;
 IF r.version IS DISTINCT FROM p_expected OR r.version=9223372036854775807::bigint OR r.stage NOT IN('CONFIGURED','CLOCK_ACQUIRED','VERIFIED','PROMOTING','COMPLETE')
 THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 UPDATE saas.recovery_runs SET current_clock_owner=p_next,clock_version=a.clock_version,clock_tick=a.tick,clock_proof_hash=p_proof,
 stage=CASE WHEN stage='CONFIGURED' THEN 'CLOCK_ACQUIRED' ELSE stage END,version=version+1 WHERE id=p_run;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_run;
END $$;
CREATE FUNCTION saas.verify_recovery_control(p_run uuid,p_controller uuid,p_expected bigint,p_proof text)
RETURNS SETOF saas.recovery_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' OR r.mode<>'RECOVERY' THEN RAISE EXCEPTION 'RECOVERY_INPUT_INVALID'; END IF;
 IF r.stage='VERIFIED' AND r.version=p_expected+1 AND r.verified_proof_hash=p_proof THEN RETURN NEXT r;RETURN;END IF;
 IF r.stage<>'CLOCK_ACQUIRED' OR r.version IS DISTINCT FROM p_expected OR r.version=9223372036854775807::bigint
 OR NOT saas.recovery_roster_matches(p_run) OR r.expected_tenants IS DISTINCT FROM ARRAY(SELECT tenant_id FROM saas.recovery_tenants WHERE recovery_id=p_run ORDER BY tenant_id)
 OR EXISTS(SELECT 1 FROM saas.recovery_tenants WHERE recovery_id=p_run AND stage<>'VERIFIED')
 THEN RAISE EXCEPTION 'RECOVERY_CONFORMITY_REQUIRED'; END IF;
 UPDATE saas.recovery_runs SET stage='VERIFIED',version=version+1,verified_proof_hash=p_proof WHERE id=p_run;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_run;
END $$;
CREATE FUNCTION saas.prepare_recovery_promotion(p_run uuid,p_controller uuid,p_expected bigint)
RETURNS SETOF saas.recovery_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;t saas.recovery_tenants%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF r.mode<>'RECOVERY' THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
 IF r.stage='PROMOTING' AND r.version=p_expected+1 THEN RETURN NEXT r;RETURN;END IF;
 IF r.stage<>'VERIFIED' OR r.version IS DISTINCT FROM p_expected OR r.version=9223372036854775807::bigint
 OR NOT saas.recovery_roster_matches(p_run) OR r.expected_tenants IS DISTINCT FROM ARRAY(SELECT tenant_id FROM saas.recovery_tenants WHERE recovery_id=p_run ORDER BY tenant_id)
 OR EXISTS(SELECT 1 FROM saas.recovery_tenants WHERE recovery_id=p_run AND stage<>'VERIFIED')
 OR NOT EXISTS(SELECT 1 FROM saas.admission_fence WHERE id=1 AND barrier AND generation=r.target_generation)
 THEN RAISE EXCEPTION 'RECOVERY_CONFORMITY_REQUIRED'; END IF;
 PERFORM 1 FROM saas.write_restrictions WHERE active ORDER BY id FOR UPDATE;
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=ANY(r.expected_tenants) ORDER BY tenant_id FOR UPDATE;
 FOR t IN SELECT * FROM saas.recovery_tenants WHERE recovery_id=p_run ORDER BY tenant_id FOR UPDATE LOOP
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=t.tenant_id AND state='CLOSED' AND generation=t.target_generation
 AND data_epoch=t.target_epoch AND writer_version=t.closed_version AND reserved_bytes=0 AND reserved_products=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 IF t.eligibility='OPEN_ELIGIBLE' THEN
 IF EXISTS(SELECT 1 FROM saas.write_restrictions WHERE active AND tenant_id=t.tenant_id AND identity_id IS NULL AND session_ref IS NULL AND id<>t.restore_restriction_id)
 THEN RAISE EXCEPTION 'RECOVERY_RESTRICTION_CHANGED'; END IF;
 UPDATE saas.tenant_writer_state SET writer_version=t.open_version WHERE tenant_id=t.tenant_id;
 UPDATE saas.recovery_tenants SET stage='PREPARED',version=version+1 WHERE recovery_id=p_run AND tenant_id=t.tenant_id;
 END IF;
 END LOOP;
 UPDATE saas.recovery_runs SET stage='PROMOTING',version=version+1 WHERE id=p_run;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_run;
END $$;
CREATE FUNCTION saas.activate_recovery(p_run uuid,p_controller uuid,p_expected bigint,p_proof text)
RETURNS SETOF saas.recovery_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;t saas.recovery_tenants%ROWTYPE;a saas.time_authority%ROWTYPE;d saas.tenant_directory%ROWTYPE;x saas.write_restrictions%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' OR r.mode<>'RECOVERY' THEN RAISE EXCEPTION 'RECOVERY_INPUT_INVALID'; END IF;
 IF r.stage='COMPLETE' AND r.version=p_expected+1 AND r.activation_proof_hash=p_proof THEN RETURN NEXT r;RETURN;END IF;
 IF r.stage<>'PROMOTING' OR r.version IS DISTINCT FROM p_expected OR r.version=9223372036854775807::bigint OR NOT r.global_blocked
 OR NOT saas.recovery_roster_matches(p_run) OR r.expected_tenants IS DISTINCT FROM ARRAY(SELECT tenant_id FROM saas.recovery_tenants WHERE recovery_id=p_run ORDER BY tenant_id)
 OR EXISTS(SELECT 1 FROM saas.recovery_tenants WHERE recovery_id=p_run AND (stage<>'SEALED' OR sealed_proof_hash IS NULL))
 OR EXISTS(SELECT 1 FROM saas.write_restrictions WHERE status<>'ACKNOWLEDGED')
 OR r.restore_restriction_ids IS DISTINCT FROM ARRAY(SELECT restore_restriction_id FROM saas.recovery_tenants WHERE recovery_id=p_run AND eligibility='OPEN_ELIGIBLE' ORDER BY restore_restriction_id)
 THEN RAISE EXCEPTION 'RECOVERY_CONFORMITY_REQUIRED'; END IF;
 PERFORM 1 FROM saas.write_restrictions WHERE active ORDER BY id FOR UPDATE;
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=ANY(r.expected_tenants) ORDER BY tenant_id FOR UPDATE;
 SELECT * INTO a FROM saas.time_authority WHERE id=1 FOR SHARE;
 IF a.id IS NULL OR a.owner<>r.current_clock_owner OR a.generation<>r.target_generation OR a.clock_version<r.clock_version
 OR NOT EXISTS(SELECT 1 FROM saas.admission_fence WHERE id=1 AND barrier AND generation=r.target_generation AND tick=a.tick AND clock_version=a.clock_version)
 THEN RAISE EXCEPTION 'RECOVERY_CLOCK_CONFLICT'; END IF;
 FOR t IN SELECT * FROM saas.recovery_tenants WHERE recovery_id=p_run ORDER BY tenant_id FOR UPDATE LOOP
 SELECT * INTO d FROM saas.tenant_directory WHERE id=t.tenant_id FOR UPDATE;
 IF ROW(d.data_epoch,d.schema_version,d.secret_ref,d.credential_version,d.writer_secret_ref,d.writer_credential_version)
 IS DISTINCT FROM ROW(t.target_epoch,3,t.reader_secret_ref,t.reader_version,t.writer_secret_ref,t.writer_credential_version)
 THEN RAISE EXCEPTION 'RECOVERY_DIRECTORY_CONFLICT'; END IF;
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=t.tenant_id AND state='CLOSED' AND generation=t.target_generation AND data_epoch=t.target_epoch
 AND writer_version=CASE WHEN t.eligibility='OPEN_ELIGIBLE' THEN t.open_version ELSE t.closed_version END AND reserved_bytes=0 AND reserved_products=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 IF t.eligibility='OPEN_ELIGIBLE' THEN
 SELECT * INTO x FROM saas.write_restrictions WHERE id=t.restore_restriction_id AND reason_code='RESTORE' AND status='ACKNOWLEDGED' AND active
 AND tenant_id=t.tenant_id AND identity_id IS NULL AND session_ref IS NULL AND action IS NULL AND generation=t.source_generation;
 IF NOT FOUND OR d.status<>'draining' OR(SELECT count(*) FROM saas.write_restriction_tenants WHERE restriction_id=x.id)<>1
 OR NOT EXISTS(SELECT 1 FROM saas.write_restriction_tenants q WHERE q.restriction_id=x.id AND q.tenant_id=t.tenant_id
 AND q.generation=t.source_generation AND q.data_epoch=t.source_epoch AND q.closed_version=t.closed_version AND q.close_proven AND q.stage='ACKNOWLEDGED')
 OR EXISTS(SELECT 1 FROM saas.write_restrictions q WHERE q.active AND q.tenant_id=t.tenant_id AND q.identity_id IS NULL AND q.session_ref IS NULL AND q.id<>x.id)
 THEN RAISE EXCEPTION 'RECOVERY_RESTORE_SCOPE_INVALID'; END IF;
 -- Only this mapped, proven operational RESTORE is consumed. Historical
 -- generation/epoch/versions and every subject or TENANT tombstone stay intact.
 UPDATE saas.write_restrictions SET active=false WHERE id=t.restore_restriction_id AND reason_code='RESTORE' AND status='ACKNOWLEDGED' AND active;
 UPDATE saas.tenant_writer_state SET state='OPEN' WHERE tenant_id=t.tenant_id;
 UPDATE saas.tenant_directory SET status='active' WHERE id=t.tenant_id;
 ELSIF d.status<>'blocked' THEN RAISE EXCEPTION 'RECOVERY_RESTRICTED_SCOPE_INVALID'; END IF;
 END LOOP;
 UPDATE saas.recovery_runs SET stage='COMPLETE',global_blocked=false,activation_proof_hash=p_proof,version=version+1 WHERE id=p_run;
 UPDATE saas.admission_fence SET barrier=false WHERE id=1;
 PERFORM saas.assert_recovery_budget();
 IF NOT saas.recovery_runtime_guard(r.target_generation,p_run,r.manifest_hash) THEN RAISE EXCEPTION 'RECOVERY_CONFORMITY_REQUIRED'; END IF;
 RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_run;
END $$;
CREATE FUNCTION saas.close_recovery_admission(p_run uuid,p_controller uuid,p_expected bigint)
RETURNS SETOF saas.recovery_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF r.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 UPDATE saas.admission_fence SET barrier=true WHERE id=1;
 UPDATE saas.recovery_runs SET global_blocked=true WHERE id=p_run;
 RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_run;
END $$;
CREATE FUNCTION saas.begin_recovery_abort(p_run uuid,p_controller uuid,p_expected bigint,p_abort uuid)
RETURNS SETOF saas.recovery_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;t saas.recovery_tenants%ROWTYPE;w saas.tenant_writer_state%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF r.mode<>'RECOVERY' OR p_abort IS NULL THEN RAISE EXCEPTION 'RECOVERY_INPUT_INVALID'; END IF;
 IF r.stage='ABORTING' AND r.abort_id=p_abort AND r.version=p_expected+1 THEN RETURN NEXT r;RETURN;END IF;
 IF r.version IS DISTINCT FROM p_expected OR r.version=9223372036854775807::bigint OR r.abort_id IS NOT NULL OR r.stage='ABORTED_CLOSED'
 OR NOT EXISTS(SELECT 1 FROM saas.admission_fence WHERE id=1 AND barrier) OR NOT r.global_blocked
 THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 PERFORM 1 FROM saas.write_restrictions WHERE active ORDER BY id FOR UPDATE;
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=ANY(r.expected_tenants) ORDER BY tenant_id FOR UPDATE;
 FOR t IN SELECT * FROM saas.recovery_tenants WHERE recovery_id=p_run ORDER BY tenant_id FOR UPDATE LOOP
 SELECT * INTO w FROM saas.tenant_writer_state WHERE tenant_id=t.tenant_id;
 IF w.generation<>t.target_generation OR w.data_epoch<>t.target_epoch
 OR w.writer_version NOT IN(t.closed_version,t.open_version) OR(t.eligibility='RESTRICTED_CLOSED' AND (w.state<>'CLOSED' OR w.writer_version<>t.closed_version))
 THEN RAISE EXCEPTION 'RECOVERY_RESTRICTION_CHANGED'; END IF;
 IF t.eligibility='OPEN_ELIGIBLE' THEN
 UPDATE saas.tenant_writer_state SET state='CLOSED',writer_version=t.abort_version WHERE tenant_id=t.tenant_id;
 UPDATE saas.tenant_directory SET status='draining' WHERE id=t.tenant_id;
 END IF;
 END LOOP;
 UPDATE saas.recovery_runs SET stage='ABORTING',abort_id=p_abort,global_blocked=true,version=version+1 WHERE id=p_run;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_run;
END $$;
CREATE FUNCTION saas.complete_recovery_abort(p_run uuid,p_controller uuid,p_expected bigint,p_proof text)
RETURNS SETOF saas.recovery_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'RECOVERY_INPUT_INVALID'; END IF;
 IF r.stage='ABORTED_CLOSED' AND r.version=p_expected+1 AND r.abort_proof_hash=p_proof THEN RETURN NEXT r;RETURN;END IF;
 IF r.stage<>'ABORTING' OR r.version IS DISTINCT FROM p_expected OR r.version=9223372036854775807::bigint
 OR r.expected_tenants IS DISTINCT FROM ARRAY(SELECT tenant_id FROM saas.recovery_tenants WHERE recovery_id=p_run ORDER BY tenant_id)
 OR EXISTS(SELECT 1 FROM saas.recovery_tenants t JOIN saas.tenant_writer_state w ON w.tenant_id=t.tenant_id WHERE t.recovery_id=p_run
 AND(t.stage<>'ABORTED_CLOSED' OR t.abort_id IS DISTINCT FROM r.abort_id OR t.abort_proof_hash IS NULL OR w.state<>'CLOSED'
 OR w.generation<>t.target_generation OR w.data_epoch<>t.target_epoch OR w.writer_version<>(CASE WHEN t.eligibility='OPEN_ELIGIBLE' THEN t.abort_version ELSE t.closed_version END)
 OR w.reserved_bytes<>0 OR w.reserved_products<>0))
 OR EXISTS(SELECT 1 FROM saas.tickets WHERE state IN('ACTIVE','WAITING','UNCERTAIN'))
 OR EXISTS(SELECT 1 FROM saas.write_growth_reservations WHERE status<>'SETTLED')
 THEN RAISE EXCEPTION 'RECOVERY_CLOSURE_NOT_PROVEN'; END IF;
 UPDATE saas.recovery_runs SET stage='ABORTED_CLOSED',global_blocked=true,abort_proof_hash=p_proof,version=version+1 WHERE id=p_run;
 UPDATE saas.admission_fence SET barrier=true WHERE id=1;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_run;
END $$;
-- Fixed maintenance bridge: no free DML privilege and no custom SQL callback.
CREATE FUNCTION saas.restriction_step(p_id uuid,p_tenant uuid,p_generation uuid,p_step text,p_operation uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;x saas.write_restrictions%ROWTYPE;t saas.write_restriction_tenants%ROWTYPE;
 w saas.tenant_writer_state%ROWTYPE;i saas.write_intents%ROWTYPE;allowed text[];
BEGIN
 PERFORM 1 FROM saas.admission_fence WHERE id=1 AND generation=p_generation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_CLOSED'; END IF;
 SELECT rr.* INTO r FROM saas.recovery_runs rr JOIN saas.admission_fence f ON f.recovery_id=rr.id WHERE f.id=1 FOR UPDATE OF rr;
 IF r.id IS NULL OR r.stage<>'COMPLETE' OR r.target_generation<>p_generation OR p_step IS NULL
 OR p_step NOT IN('BEGIN','CLOSED','RESOLVED','APPLY','PREPARE_OPEN','OPEN','ACK','NO_EFFECT')
 THEN RAISE EXCEPTION 'RECOVERY_CLOSED'; END IF;
 SELECT * INTO x FROM saas.write_restrictions WHERE id=p_id AND generation=p_generation FOR UPDATE;
 IF NOT FOUND OR NOT x.active THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
 IF p_tenant IS NOT NULL THEN
 SELECT * INTO w FROM saas.tenant_writer_state WHERE tenant_id=p_tenant FOR UPDATE;
 SELECT * INTO t FROM saas.write_restriction_tenants WHERE restriction_id=p_id AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR t.generation<>p_generation OR w.generation<>p_generation OR w.data_epoch<>t.data_epoch
 THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 END IF;
 IF p_step='BEGIN' THEN
 UPDATE saas.write_restrictions SET status='CLOSING',updated_at=clock_timestamp() WHERE id=p_id AND status='PENDING';
 ELSIF p_step='CLOSED' THEN
 IF p_tenant IS NULL OR w.state<>'CLOSED' OR w.writer_version<>t.closed_version OR t.stage NOT IN('PENDING','CLOSED') THEN RAISE EXCEPTION 'CLOSURE_NOT_PROVEN'; END IF;
 UPDATE saas.write_restriction_tenants SET stage='CLOSED',close_proven=true WHERE restriction_id=p_id AND tenant_id=p_tenant;
 ELSIF p_step='NO_EFFECT' THEN
 IF p_tenant IS NULL OR NOT t.close_proven OR w.state<>'CLOSED' OR w.writer_version<>t.closed_version OR p_operation IS NULL THEN RAISE EXCEPTION 'CLOSURE_NOT_PROVEN'; END IF;
 SELECT * INTO i FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 IF NOT FOUND OR i.generation<>t.generation OR i.data_epoch<>t.data_epoch OR i.writer_version>t.open_version THEN RAISE EXCEPTION 'CLOSURE_NOT_PROVEN'; END IF;
 IF i.status NOT IN('CONFIRMED','REJECTED') THEN
 UPDATE saas.write_intents SET status='REJECTED',updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND operation_id=p_operation;
 UPDATE saas.write_projections SET state='REJECTED',reason_code='NO_EFFECT',result_hash=NULL,updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND operation_id=p_operation;
 UPDATE saas.write_growth_reservations SET status='PROJECTED' WHERE tenant_id=p_tenant AND operation_id=p_operation AND status='RESERVED';
 PERFORM saas.write_transition(p_tenant,p_operation,i.generation,i.status,'REJECTED','NO_EFFECT');
 IF saas.write_operation_cost(p_tenant,p_operation)>16384 THEN RAISE EXCEPTION 'RECONCILIATION_REQUIRED'; END IF;
 END IF;
 ELSIF p_step='RESOLVED' THEN
 IF p_tenant IS NULL OR NOT t.close_proven OR t.stage NOT IN('CLOSED','RESOLVED') OR w.state<>'CLOSED' OR w.writer_version<>t.closed_version
 OR EXISTS(SELECT 1 FROM saas.write_intents WHERE tenant_id=p_tenant AND generation=t.generation AND data_epoch=t.data_epoch
 AND writer_version<=t.open_version AND status IN('PENDING','EXECUTING','UNKNOWN')) THEN RAISE EXCEPTION 'CLOSURE_NOT_PROVEN'; END IF;
 UPDATE saas.write_restriction_tenants SET stage='RESOLVED' WHERE restriction_id=p_id AND tenant_id=p_tenant;
 ELSIF p_step='APPLY' THEN
 IF x.status IN('CLOSED','REOPENING','ACKNOWLEDGED') THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM saas.write_restriction_tenants WHERE restriction_id=p_id AND(NOT close_proven OR stage NOT IN('RESOLVED','REOPENING','OPEN','ACKNOWLEDGED')))
 THEN RAISE EXCEPTION 'CLOSURE_NOT_PROVEN'; END IF;
 CASE x.reason_code
 WHEN 'LOGOUT' THEN UPDATE saas.session_registry SET status='revoked' WHERE writer_session_ref=x.session_ref;
 WHEN 'IDENTITY' THEN
 IF EXISTS(SELECT 1 FROM saas.identities WHERE id=x.identity_id AND status<>'revoked' AND security_version=9223372036854775807::bigint) THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 UPDATE saas.identities SET status='revoked',security_version=security_version+1 WHERE id=x.identity_id AND status<>'revoked';
 UPDATE saas.session_registry SET status='revoked' WHERE identity_id=x.identity_id;
 WHEN 'MEMBERSHIP' THEN UPDATE saas.memberships SET status='revoked',version=version+1 WHERE identity_id=x.identity_id AND tenant_id=x.tenant_id AND status<>'revoked';
 WHEN 'GRANT' THEN UPDATE saas.action_grants SET status='revoked',version=version+1 WHERE identity_id=x.identity_id AND tenant_id=x.tenant_id AND action=x.action AND status<>'revoked';
 WHEN 'TENANT' THEN UPDATE saas.tenant_directory SET status='blocked' WHERE id=x.tenant_id;
 WHEN 'RESTORE' THEN NULL;WHEN 'EPOCH' THEN NULL;WHEN 'ROTATION' THEN NULL;WHEN 'SHUTDOWN' THEN NULL;WHEN 'POLICY' THEN NULL;
 ELSE RAISE EXCEPTION 'RECOVERY_INPUT_INVALID';END CASE;
 UPDATE saas.write_restrictions SET status='CLOSED',updated_at=clock_timestamp() WHERE id=p_id;
 ELSIF p_step IN('PREPARE_OPEN','OPEN') THEN
 IF x.reason_code NOT IN('LOGOUT','IDENTITY','MEMBERSHIP','GRANT') OR x.status NOT IN('CLOSED','REOPENING','ACKNOWLEDGED') OR p_tenant IS NULL OR NOT t.close_proven
 OR EXISTS(SELECT 1 FROM saas.write_restriction_tenants q JOIN saas.write_restrictions y ON y.id=q.restriction_id WHERE q.tenant_id=p_tenant AND q.restriction_id<>p_id AND y.status<>'ACKNOWLEDGED')
 OR EXISTS(SELECT 1 FROM saas.write_restrictions y WHERE y.active AND y.tenant_id=p_tenant AND y.identity_id IS NULL AND y.session_ref IS NULL)
 THEN RAISE EXCEPTION 'RESTRICTION_PENDING'; END IF;
 IF p_step='PREPARE_OPEN' THEN
 IF w.state<>'CLOSED' OR w.writer_version NOT IN(t.closed_version,t.reopen_version) OR t.stage NOT IN('RESOLVED','REOPENING') THEN RAISE EXCEPTION 'CLOSURE_NOT_PROVEN'; END IF;
 UPDATE saas.tenant_writer_state SET writer_version=t.reopen_version WHERE tenant_id=p_tenant;
 UPDATE saas.write_restriction_tenants SET stage='REOPENING' WHERE restriction_id=p_id AND tenant_id=p_tenant;
 ELSE
 IF w.writer_version<>t.reopen_version OR w.state NOT IN('CLOSED','OPEN') OR t.stage NOT IN('REOPENING','OPEN') THEN RAISE EXCEPTION 'CLOSURE_NOT_PROVEN'; END IF;
 UPDATE saas.tenant_writer_state SET state='OPEN' WHERE tenant_id=p_tenant;
 UPDATE saas.write_restriction_tenants SET stage='OPEN' WHERE restriction_id=p_id AND tenant_id=p_tenant;
 END IF;
 ELSIF p_step='ACK' THEN
 allowed:=CASE WHEN x.reason_code IN('LOGOUT','IDENTITY','MEMBERSHIP','GRANT') THEN ARRAY['OPEN','ACKNOWLEDGED'] ELSE ARRAY['RESOLVED','ACKNOWLEDGED'] END;
 IF x.status NOT IN('CLOSED','REOPENING','ACKNOWLEDGED') OR EXISTS(SELECT 1 FROM saas.write_restriction_tenants WHERE restriction_id=p_id AND(NOT close_proven OR NOT stage=ANY(allowed)))
 THEN RAISE EXCEPTION 'CLOSURE_NOT_PROVEN'; END IF;
 UPDATE saas.write_restriction_tenants SET stage='ACKNOWLEDGED' WHERE restriction_id=p_id;
 UPDATE saas.write_restrictions SET status='ACKNOWLEDGED',updated_at=clock_timestamp() WHERE id=p_id;
 END IF;
 PERFORM saas.assert_recovery_budget();RETURN true;
END $$;
CREATE FUNCTION saas.revoke_closed_recovery_identity(p_run uuid,p_controller uuid,p_identity uuid,p_expected bigint,p_event uuid,p_proof text)
RETURNS SETOF saas.write_restrictions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;x saas.write_restrictions%ROWTYPE;i saas.identities%ROWTYPE;w saas.tenant_writer_state%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF p_event IS NULL OR p_identity IS NULL OR p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' OR p_expected IS NULL
 OR p_expected<=0 OR p_expected=9223372036854775807::bigint OR NOT EXISTS(SELECT 1 FROM saas.admission_fence WHERE id=1 AND barrier)
 OR NOT ((r.mode='NORMAL' AND r.stage='COMPLETE') OR(r.mode='RECOVERY' AND r.stage='PLANNED'))
 OR EXISTS(SELECT 1 FROM saas.tenant_writer_state WHERE state<>'CLOSED' OR reserved_bytes<>0 OR reserved_products<>0)
 OR EXISTS(SELECT 1 FROM saas.tickets WHERE state IN('ACTIVE','WAITING','UNCERTAIN'))
 THEN RAISE EXCEPTION 'RECOVERY_CLOSURE_NOT_PROVEN'; END IF;
 SELECT * INTO x FROM saas.write_restrictions WHERE id=p_event FOR UPDATE;
 SELECT * INTO i FROM saas.identities WHERE id=p_identity FOR UPDATE;
 IF x.id IS NOT NULL THEN
 IF x.identity_id IS DISTINCT FROM p_identity OR x.reason_code<>'IDENTITY' OR x.status<>'ACKNOWLEDGED' OR NOT x.active
 OR ROW(r.journal_event_id,r.journal_identity_id,r.journal_identity_version,r.journal_event_proof_hash)
 IS DISTINCT FROM ROW(p_event,p_identity,p_expected,p_proof)
 OR i.status<>'revoked' OR i.security_version<>p_expected+1 THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;RETURN NEXT x;RETURN;END IF;
 IF i.id IS NULL OR i.purpose<>'company' OR i.status<>'active' OR i.security_version<>p_expected OR r.journal_event_id IS NOT NULL THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
 PERFORM 1 FROM saas.tenant_writer_state ORDER BY tenant_id FOR UPDATE;
 INSERT INTO saas.write_restrictions(id,identity_id,generation,reason_code,status,active)
 VALUES(p_event,p_identity,r.source_generation,'IDENTITY','ACKNOWLEDGED',true);
 FOR w IN SELECT q.* FROM saas.tenant_writer_state q JOIN saas.memberships m ON m.tenant_id=q.tenant_id WHERE m.identity_id=p_identity ORDER BY q.tenant_id LOOP
 IF w.writer_version<=1 OR w.writer_version=9223372036854775807::bigint OR NOT EXISTS(
 SELECT 1 FROM saas.write_restriction_tenants t JOIN saas.write_restrictions y ON y.id=t.restriction_id
 WHERE t.tenant_id=w.tenant_id AND t.generation=w.generation AND t.data_epoch=w.data_epoch AND t.closed_version=w.writer_version
 AND t.stage='ACKNOWLEDGED' AND t.close_proven AND y.active AND y.status='ACKNOWLEDGED')
 THEN RAISE EXCEPTION 'RECOVERY_CLOSURE_NOT_PROVEN'; END IF;
 INSERT INTO saas.write_restriction_tenants VALUES(p_event,w.tenant_id,w.generation,w.data_epoch,w.writer_version-1,w.writer_version,w.writer_version+1,'ACKNOWLEDGED',true);
 END LOOP;
 UPDATE saas.identities SET status='revoked',security_version=security_version+1 WHERE id=p_identity;
 UPDATE saas.session_registry SET status='revoked' WHERE identity_id=p_identity;
 UPDATE saas.recovery_runs SET journal_event_id=p_event,journal_identity_id=p_identity,journal_identity_version=p_expected,journal_event_proof_hash=p_proof WHERE id=p_run;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.write_restrictions WHERE id=p_event;
END $$;

CREATE FUNCTION saas.begin_recovery(p_id uuid,p_controller uuid,p_source uuid,p_target uuid,p_manifest text,p_journal text,p_custody text,
 p_source_resource text,p_target_resource text,p_end_proof text,p_tenants uuid[],p_restores uuid[],p_seed uuid,p_worker uuid)
RETURNS SETOF saas.recovery_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;f saas.admission_fence%ROWTYPE;a saas.time_authority%ROWTYPE;
BEGIN
 SELECT * INTO f FROM saas.admission_fence WHERE id=1 FOR UPDATE;
 SELECT * INTO r FROM saas.recovery_runs WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF f.recovery_id IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
  IF ROW(r.controller_owner,r.source_generation,r.target_generation,r.manifest_hash,r.journal_hash,r.custody_hash,
  r.source_resource_hash,r.target_resource_hash,r.source_end_proof_hash,r.expected_tenants,r.restore_restriction_ids,r.seed_clock_owner,r.initial_worker_owner)
  IS DISTINCT FROM ROW(p_controller,p_source,p_target,p_manifest,p_journal,p_custody,p_source_resource,p_target_resource,p_end_proof,p_tenants,p_restores,p_seed,p_worker)
  THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;RETURN NEXT r;RETURN;
 END IF;
 IF p_id IS NULL OR p_controller IS NULL OR p_source IS NULL OR p_target IS NULL OR p_source=p_target
 OR p_seed IS NULL OR p_worker IS NULL OR p_seed=p_worker OR p_source_resource IS NULL OR p_target_resource IS NULL OR p_source_resource=p_target_resource
 OR EXISTS(SELECT 1 FROM unnest(ARRAY[p_manifest,p_journal,p_custody,p_source_resource,p_target_resource,p_end_proof]) x WHERE x IS NULL OR x !~ '^[0-9a-f]{64}$')
 OR p_tenants IS NULL OR p_restores IS NULL OR cardinality(p_tenants)>2 OR cardinality(p_restores)>2
 OR p_tenants IS DISTINCT FROM ARRAY(SELECT DISTINCT x FROM unnest(p_tenants) x ORDER BY x)
 OR p_restores IS DISTINCT FROM ARRAY(SELECT DISTINCT x FROM unnest(p_restores) x ORDER BY x)
 OR p_tenants IS DISTINCT FROM ARRAY(SELECT id FROM saas.tenant_directory WHERE purpose='company' ORDER BY id)
 OR f.id IS NULL OR f.generation<>p_source OR NOT f.barrier OR NOT EXISTS(SELECT 1 FROM saas.recovery_runs WHERE id=f.recovery_id AND mode='NORMAL' AND stage='COMPLETE')
 OR EXISTS(SELECT 1 FROM saas.tenant_writer_state WHERE tenant_id=ANY(p_tenants) AND (state<>'CLOSED' OR generation<>p_source OR reserved_bytes<>0 OR reserved_products<>0))
 OR EXISTS(SELECT 1 FROM saas.tickets WHERE state IN('ACTIVE','WAITING','UNCERTAIN'))
 OR EXISTS(SELECT 1 FROM saas.write_growth_reservations WHERE status<>'SETTLED')
 THEN RAISE EXCEPTION 'RECOVERY_SOURCE_NOT_CLOSED'; END IF;
 PERFORM 1 FROM saas.write_restrictions WHERE id=ANY(p_restores) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM unnest(p_restores) x(id) LEFT JOIN saas.write_restrictions restore_row ON restore_row.id=x.id
 WHERE restore_row.id IS NULL OR restore_row.reason_code<>'RESTORE' OR NOT restore_row.active OR restore_row.status<>'ACKNOWLEDGED' OR restore_row.generation<>p_source
 OR restore_row.tenant_id IS NULL OR restore_row.identity_id IS NOT NULL OR restore_row.session_ref IS NOT NULL OR restore_row.action IS NOT NULL
 OR NOT restore_row.tenant_id=ANY(p_tenants) OR (SELECT count(*) FROM saas.write_restriction_tenants t WHERE t.restriction_id=restore_row.id)<>1)
 THEN RAISE EXCEPTION 'RECOVERY_RESTORE_SCOPE_INVALID'; END IF;
 SELECT * INTO a FROM saas.time_authority WHERE id=1 FOR SHARE;
 INSERT INTO saas.recovery_runs(id,controller_owner,mode,source_generation,target_generation,manifest_hash,journal_hash,custody_hash,
 source_resource_hash,target_resource_hash,source_end_proof_hash,expected_tenants,restore_restriction_ids,seed_clock_owner,initial_worker_owner,
 current_clock_owner,clock_version,clock_tick,stage,version,global_blocked)
 VALUES(p_id,p_controller,'RECOVERY',p_source,p_target,p_manifest,p_journal,p_custody,p_source_resource,p_target_resource,p_end_proof,p_tenants,p_restores,
 p_seed,p_worker,p_seed,a.clock_version,a.tick,'PLANNED',1,true);
 UPDATE saas.admission_fence SET recovery_id=p_id,barrier=true WHERE id=1;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_id;
END $$;

CREATE FUNCTION saas.enroll_recovery_tenant(p_run uuid,p_controller uuid,p_tenant uuid,p_source_epoch bigint,p_closed bigint,p_target_epoch bigint,
 p_eligibility text,p_status text,p_reader_version bigint,p_writer_version bigint,p_reader_ref text,p_writer_ref text,p_restore uuid,p_guard_hash text)
RETURNS SETOF saas.recovery_tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;t saas.recovery_tenants%ROWTYPE;w saas.tenant_writer_state%ROWTYPE;d saas.tenant_directory%ROWTYPE;x saas.write_restrictions%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF p_restore IS NOT NULL THEN SELECT * INTO x FROM saas.write_restrictions WHERE id=p_restore FOR UPDATE; END IF;
 SELECT * INTO w FROM saas.tenant_writer_state WHERE tenant_id=p_tenant FOR UPDATE;
 SELECT * INTO d FROM saas.tenant_directory WHERE id=p_tenant FOR UPDATE;
 SELECT * INTO t FROM saas.recovery_tenants WHERE recovery_id=p_run AND tenant_id=p_tenant FOR UPDATE;
 IF FOUND THEN
 IF ROW(t.source_epoch,t.closed_version,t.target_epoch,t.eligibility,t.directory_status,t.reader_version,t.writer_credential_version,
 t.reader_secret_ref,t.writer_secret_ref,t.restore_restriction_id,t.guard_hash)
 IS DISTINCT FROM ROW(p_source_epoch,p_closed,p_target_epoch,p_eligibility,p_status,p_reader_version,p_writer_version,p_reader_ref,p_writer_ref,p_restore,p_guard_hash)
 THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;RETURN NEXT t;RETURN;END IF;
 IF r.stage<>'PLANNED' OR NOT p_tenant=ANY(r.expected_tenants) OR w.tenant_id IS NULL OR d.id IS NULL
 OR w.state<>'CLOSED' OR w.generation<>r.source_generation OR w.data_epoch IS DISTINCT FROM p_source_epoch OR w.writer_version IS DISTINCT FROM p_closed
 OR p_closed IS NULL OR p_closed>9223372036854775805::bigint OR p_source_epoch IS NULL OR p_source_epoch>=9223372036854775807::bigint
 OR p_target_epoch IS DISTINCT FROM p_source_epoch+1 OR d.schema_version<>3 OR p_reader_version IS DISTINCT FROM d.credential_version+1
 OR p_writer_version IS DISTINCT FROM d.writer_credential_version+1 OR d.credential_version=9223372036854775807::bigint OR d.writer_credential_version=9223372036854775807::bigint
 OR p_reader_ref IS NULL OR length(p_reader_ref) NOT BETWEEN 1 AND 128 OR p_reader_ref=d.secret_ref
 OR p_writer_ref IS NULL OR length(p_writer_ref) NOT BETWEEN 1 AND 128 OR p_writer_ref=d.writer_secret_ref
 OR p_guard_hash IS NULL OR p_guard_hash !~ '^[0-9a-f]{64}$' OR p_eligibility IS NULL OR p_status IS NULL
 THEN RAISE EXCEPTION 'RECOVERY_BINDING_CONFLICT'; END IF;
 IF p_eligibility='OPEN_ELIGIBLE' THEN
 IF p_status<>'active' OR p_restore IS NULL OR NOT p_restore=ANY(r.restore_restriction_ids) OR x.id IS NULL
 OR x.tenant_id<>p_tenant OR x.reason_code<>'RESTORE' OR x.status<>'ACKNOWLEDGED' OR NOT x.active
 OR NOT EXISTS(SELECT 1 FROM saas.write_restriction_tenants q WHERE q.restriction_id=p_restore AND q.tenant_id=p_tenant
 AND q.generation=r.source_generation AND q.data_epoch=p_source_epoch AND q.closed_version=p_closed AND q.close_proven AND q.stage='ACKNOWLEDGED')
 OR EXISTS(SELECT 1 FROM saas.write_restrictions q WHERE q.active AND q.tenant_id=p_tenant AND q.identity_id IS NULL AND q.session_ref IS NULL AND q.id<>p_restore)
 THEN RAISE EXCEPTION 'RECOVERY_RESTORE_SCOPE_INVALID'; END IF;
 ELSIF p_eligibility='RESTRICTED_CLOSED' THEN
 IF p_status<>'blocked' OR d.status<>'blocked' OR p_restore IS NOT NULL OR NOT EXISTS(
 SELECT 1 FROM saas.write_restriction_tenants q JOIN saas.write_restrictions y ON y.id=q.restriction_id
 WHERE q.tenant_id=p_tenant AND q.generation=r.source_generation AND q.data_epoch=p_source_epoch AND q.closed_version=p_closed
 AND q.close_proven AND q.stage='ACKNOWLEDGED' AND y.active AND y.status='ACKNOWLEDGED' AND y.reason_code='TENANT')
 THEN RAISE EXCEPTION 'RECOVERY_RESTRICTED_SCOPE_INVALID'; END IF;
 ELSE RAISE EXCEPTION 'RECOVERY_INPUT_INVALID'; END IF;
 INSERT INTO saas.recovery_tenants(recovery_id,tenant_id,source_generation,target_generation,source_epoch,target_epoch,closed_version,open_version,abort_version,
 eligibility,closed_reason,directory_status,reader_version,writer_credential_version,reader_secret_ref,writer_secret_ref,restore_restriction_id,guard_hash,stage,version)
 VALUES(p_run,p_tenant,r.source_generation,r.target_generation,p_source_epoch,p_target_epoch,p_closed,p_closed+1,p_closed+2,
 p_eligibility,CASE WHEN p_eligibility='OPEN_ELIGIBLE' THEN 'RESTORE' ELSE 'TENANT' END,p_status,p_reader_version,p_writer_version,p_reader_ref,p_writer_ref,p_restore,p_guard_hash,'ENROLLED',1);
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_tenants WHERE recovery_id=p_run AND tenant_id=p_tenant;
END $$;

CREATE FUNCTION saas.record_recovery_tenant_proof(p_run uuid,p_controller uuid,p_tenant uuid,p_phase text,p_run_version bigint,p_tenant_version bigint,p_proof text)
RETURNS SETOF saas.recovery_tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;t saas.recovery_tenants%ROWTYPE;w saas.tenant_writer_state%ROWTYPE;prior text;stored text;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 SELECT * INTO w FROM saas.tenant_writer_state WHERE tenant_id=p_tenant FOR UPDATE;
 SELECT * INTO t FROM saas.recovery_tenants WHERE recovery_id=p_run AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' OR p_phase IS NULL
 OR p_phase NOT IN('CLOSED_CONFIGURED','VERIFIED','LOCAL_OPEN','SEALED','ABORTED_CLOSED') OR r.version IS DISTINCT FROM p_run_version
 THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 stored:=CASE p_phase WHEN 'CLOSED_CONFIGURED' THEN t.configured_proof_hash WHEN 'VERIFIED' THEN t.verified_proof_hash
 WHEN 'LOCAL_OPEN' THEN t.local_open_proof_hash WHEN 'SEALED' THEN t.sealed_proof_hash ELSE t.abort_proof_hash END;
 IF t.stage=p_phase AND t.version=p_tenant_version+1 AND stored=p_proof THEN RETURN NEXT t;RETURN;END IF;
 prior:=CASE p_phase WHEN 'CLOSED_CONFIGURED' THEN 'ENROLLED' WHEN 'VERIFIED' THEN 'CLOSED_CONFIGURED'
 WHEN 'LOCAL_OPEN' THEN 'PREPARED' WHEN 'SEALED' THEN CASE WHEN t.eligibility='OPEN_ELIGIBLE' THEN 'LOCAL_OPEN' ELSE 'VERIFIED' END ELSE t.stage END;
 IF t.version IS DISTINCT FROM p_tenant_version OR t.version=9223372036854775807::bigint OR t.stage<>prior
 OR (p_phase='CLOSED_CONFIGURED' AND r.stage<>'PLANNED') OR(p_phase='VERIFIED' AND r.stage NOT IN('CLOCK_ACQUIRED','VERIFIED'))
 OR(p_phase IN('LOCAL_OPEN','SEALED') AND r.stage<>'PROMOTING') OR(p_phase='LOCAL_OPEN' AND t.eligibility<>'OPEN_ELIGIBLE')
 OR(p_phase='ABORTED_CLOSED' AND r.stage<>'ABORTING') THEN RAISE EXCEPTION 'RECOVERY_VERSION_CONFLICT'; END IF;
 IF p_phase='ABORTED_CLOSED' THEN
 IF w.state<>'CLOSED' OR w.writer_version<>(CASE WHEN t.eligibility='OPEN_ELIGIBLE' THEN t.abort_version ELSE t.closed_version END)
 THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 ELSIF p_phase IN('LOCAL_OPEN','SEALED') THEN
 IF w.state<>'CLOSED' OR w.writer_version<>(CASE WHEN t.eligibility='OPEN_ELIGIBLE' THEN t.open_version ELSE t.closed_version END)
 OR w.generation<>t.target_generation OR w.data_epoch<>t.target_epoch THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 END IF;
 UPDATE saas.recovery_tenants SET stage=p_phase,version=version+1,
 configured_proof_hash=CASE WHEN p_phase='CLOSED_CONFIGURED' THEN p_proof ELSE configured_proof_hash END,
 verified_proof_hash=CASE WHEN p_phase='VERIFIED' THEN p_proof ELSE verified_proof_hash END,
 local_open_proof_hash=CASE WHEN p_phase='LOCAL_OPEN' THEN p_proof ELSE local_open_proof_hash END,
 sealed_proof_hash=CASE WHEN p_phase='SEALED' THEN p_proof ELSE sealed_proof_hash END,
 abort_proof_hash=CASE WHEN p_phase='ABORTED_CLOSED' THEN p_proof ELSE abort_proof_hash END,
 abort_id=CASE WHEN p_phase='ABORTED_CLOSED' THEN r.abort_id ELSE abort_id END WHERE recovery_id=p_run AND tenant_id=p_tenant;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_tenants WHERE recovery_id=p_run AND tenant_id=p_tenant;
END $$;

CREATE FUNCTION saas.configure_recovery_control(p_run uuid,p_controller uuid,p_expected bigint,p_proof text)
RETURNS SETOF saas.recovery_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;t saas.recovery_tenants%ROWTYPE;a saas.time_authority%ROWTYPE;f saas.admission_fence%ROWTYPE;
BEGIN
 r:=saas.lock_recovery(p_run,p_controller);
 IF r.mode<>'RECOVERY' OR p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'RECOVERY_INPUT_INVALID'; END IF;
 IF r.stage='CONFIGURED' AND r.version=p_expected+1 AND r.config_proof_hash=p_proof THEN RETURN NEXT r;RETURN;END IF;
 IF r.stage<>'PLANNED' OR r.version IS DISTINCT FROM p_expected OR r.version=9223372036854775807::bigint
 OR NOT saas.recovery_roster_matches(p_run) OR r.expected_tenants IS DISTINCT FROM ARRAY(SELECT tenant_id FROM saas.recovery_tenants WHERE recovery_id=p_run ORDER BY tenant_id)
 OR EXISTS(SELECT 1 FROM saas.recovery_tenants WHERE recovery_id=p_run AND stage<>'CLOSED_CONFIGURED')
 THEN RAISE EXCEPTION 'RECOVERY_CONFORMITY_REQUIRED'; END IF;
 PERFORM 1 FROM saas.write_restrictions WHERE active ORDER BY id FOR UPDATE;
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=ANY(r.expected_tenants) ORDER BY tenant_id FOR UPDATE;
 SELECT * INTO f FROM saas.admission_fence WHERE id=1;
 SELECT * INTO a FROM saas.time_authority WHERE id=1 FOR UPDATE;
 IF a.id IS NULL OR NOT f.barrier OR f.generation<>r.source_generation OR a.generation<>r.source_generation OR a.tick<>f.tick OR a.clock_version<>f.clock_version
 OR a.clock_version=9223372036854775807::bigint THEN RAISE EXCEPTION 'RECOVERY_CLOCK_CONFLICT'; END IF;
 FOR t IN SELECT * FROM saas.recovery_tenants WHERE recovery_id=p_run ORDER BY tenant_id FOR UPDATE LOOP
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=t.tenant_id AND state='CLOSED' AND generation=t.source_generation
 AND data_epoch=t.source_epoch AND writer_version=t.closed_version AND reserved_bytes=0 AND reserved_products=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_FENCE_CONFLICT'; END IF;
 UPDATE saas.tenant_directory SET data_epoch=t.target_epoch,secret_ref=t.reader_secret_ref,credential_version=t.reader_version,
 writer_secret_ref=t.writer_secret_ref,writer_credential_version=t.writer_credential_version,schema_version=3,
 status=CASE WHEN t.eligibility='OPEN_ELIGIBLE' THEN 'draining' ELSE 'blocked' END WHERE id=t.tenant_id;
 UPDATE saas.tenant_writer_state SET generation=t.target_generation,data_epoch=t.target_epoch WHERE tenant_id=t.tenant_id;
 END LOOP;
 UPDATE saas.session_registry SET status='revoked' WHERE generation<>r.target_generation AND status<>'revoked';
 UPDATE saas.admission_fence SET generation=r.target_generation,clock_version=a.clock_version+1,barrier=true WHERE id=1;
 UPDATE saas.time_authority SET generation=r.target_generation,owner=r.seed_clock_owner,clock_version=a.clock_version+1 WHERE id=1;
 UPDATE saas.recovery_runs SET stage='CONFIGURED',config_proof_hash=p_proof,clock_version=a.clock_version+1,clock_tick=a.tick,version=version+1 WHERE id=p_run;
 PERFORM saas.assert_recovery_budget();RETURN QUERY SELECT * FROM saas.recovery_runs WHERE id=p_run;
END $$;

-- Preserve the L2 authority implementation, but require the explicit binding
-- before any public central registration, claim or result lookup reaches it.
ALTER FUNCTION saas.validate_write_authority(uuid,text,uuid,text,boolean) RENAME TO validate_write_authority_l2;
CREATE FUNCTION saas.validate_write_authority(p_tenant uuid,p_sid text,p_generation uuid,p_action text,p_writer boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $$
DECLARE r saas.recovery_runs%ROWTYPE;
BEGIN
 SELECT rr.* INTO r FROM saas.recovery_runs rr JOIN saas.admission_fence f ON f.recovery_id=rr.id WHERE f.id=1;
 IF NOT saas.recovery_runtime_guard(p_generation,r.id,r.manifest_hash) THEN RAISE EXCEPTION 'RECOVERY_CLOSED'; END IF;
 RETURN saas.validate_write_authority_l2(p_tenant,p_sid,p_generation,p_action,p_writer);
END $$;
CREATE OR REPLACE FUNCTION saas.writer_readiness(p_generation uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas AS $$
 SELECT coalesce((SELECT saas.recovery_runtime_guard(p_generation,r.id,r.manifest_hash) FROM saas.recovery_runs r
 JOIN saas.admission_fence f ON f.recovery_id=r.id WHERE f.id=1),false)
$$;
REVOKE INSERT,UPDATE,DELETE ON saas.tenant_writer_state,saas.write_control_quota,saas.write_intents,saas.write_growth_reservations,
 saas.write_projections,saas.write_transitions,saas.write_restrictions,saas.write_restriction_tenants FROM saas_writer_maintenance;
REVOKE UPDATE(status,security_version) ON saas.identities FROM saas_writer_maintenance;
REVOKE UPDATE(status,version) ON saas.memberships,saas.action_grants FROM saas_writer_maintenance;
REVOKE UPDATE(status) ON saas.session_registry,saas.tenant_directory FROM saas_writer_maintenance;
REVOKE EXECUTE ON FUNCTION saas.write_transition(uuid,uuid,uuid,text,text,text) FROM saas_writer_maintenance;
REVOKE ALL ON saas.recovery_runs,saas.recovery_tenants FROM PUBLIC,saas_api;
REVOKE ALL ON FUNCTION saas.recovery_row_bound(),saas.recovery_binding_immutable(),saas.assert_recovery_budget(),saas.lock_recovery(uuid,uuid),
 saas.recovery_roster_matches(uuid),saas.recovery_runtime_guard(uuid,uuid,text),saas.recovery_service_state(uuid,uuid,text),
 saas.initialize_recovery_normal(uuid,uuid,uuid,text,text,text,uuid[],uuid),saas.acknowledge_recovery_normal(uuid,uuid,bigint,text),
 saas.begin_recovery(uuid,uuid,uuid,uuid,text,text,text,text,text,text,uuid[],uuid[],uuid,uuid),
 saas.enroll_recovery_tenant(uuid,uuid,uuid,bigint,bigint,bigint,text,text,bigint,bigint,text,text,uuid,text),
 saas.record_recovery_tenant_proof(uuid,uuid,uuid,text,bigint,bigint,text),saas.configure_recovery_control(uuid,uuid,bigint,text),
 saas.prepare_recovery_clock_transfer(uuid,uuid,bigint,uuid,uuid,uuid,bigint,bigint,text,text),
 saas.recovery_clock_guard(uuid,uuid,text,uuid,uuid,uuid,text,bigint,bigint),saas.record_recovery_clock(uuid,uuid,bigint,uuid,uuid,text,text),saas.verify_recovery_control(uuid,uuid,bigint,text),
 saas.prepare_recovery_promotion(uuid,uuid,bigint),saas.activate_recovery(uuid,uuid,bigint,text),
 saas.close_recovery_admission(uuid,uuid,bigint),saas.begin_recovery_abort(uuid,uuid,bigint,uuid),saas.complete_recovery_abort(uuid,uuid,bigint,text),
 saas.restriction_step(uuid,uuid,uuid,text,uuid),saas.revoke_closed_recovery_identity(uuid,uuid,uuid,bigint,uuid,text),
 saas.validate_write_authority(uuid,text,uuid,text,boolean),saas.validate_write_authority_l2(uuid,text,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.recovery_runtime_guard(uuid,uuid,text),saas.recovery_service_state(uuid,uuid,text) TO saas_api,saas_writer_maintenance;
GRANT EXECUTE ON FUNCTION saas.recovery_clock_guard(uuid,uuid,text,uuid,uuid,uuid,text,bigint,bigint) TO saas_clock;
GRANT SELECT ON saas.recovery_runs,saas.recovery_tenants TO saas_writer_maintenance;
GRANT EXECUTE ON FUNCTION saas.initialize_recovery_normal(uuid,uuid,uuid,text,text,text,uuid[],uuid),
 saas.acknowledge_recovery_normal(uuid,uuid,bigint,text),saas.begin_recovery(uuid,uuid,uuid,uuid,text,text,text,text,text,text,uuid[],uuid[],uuid,uuid),
 saas.enroll_recovery_tenant(uuid,uuid,uuid,bigint,bigint,bigint,text,text,bigint,bigint,text,text,uuid,text),
 saas.record_recovery_tenant_proof(uuid,uuid,uuid,text,bigint,bigint,text),saas.configure_recovery_control(uuid,uuid,bigint,text),
 saas.prepare_recovery_clock_transfer(uuid,uuid,bigint,uuid,uuid,uuid,bigint,bigint,text,text),
 saas.record_recovery_clock(uuid,uuid,bigint,uuid,uuid,text,text),saas.verify_recovery_control(uuid,uuid,bigint,text),saas.prepare_recovery_promotion(uuid,uuid,bigint),
 saas.activate_recovery(uuid,uuid,bigint,text),saas.close_recovery_admission(uuid,uuid,bigint),saas.begin_recovery_abort(uuid,uuid,bigint,uuid),
 saas.complete_recovery_abort(uuid,uuid,bigint,text),saas.restriction_step(uuid,uuid,uuid,text,uuid),
 saas.revoke_closed_recovery_identity(uuid,uuid,uuid,bigint,uuid,text) TO saas_writer_maintenance;
RESET ROLE;
-- Only bootstrap owns this table/its grant option. NOLOGIN saas_owner receives
-- its preexisting scoped privileges; the maintenance LOGIN loses free UPDATE.
REVOKE UPDATE(admission_version) ON saas.admission_fence FROM saas_writer_maintenance;
