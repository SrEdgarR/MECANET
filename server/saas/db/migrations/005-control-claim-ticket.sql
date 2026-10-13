-- Correct an already-approved owner/ticket invariant; no API, role or grant change.
-- Apply only through the verified private preparer on the CLOSED own QA cohort.
SET ROLE saas_owner;
CREATE OR REPLACE FUNCTION saas.claim_write_intent(p_tenant uuid,p_operation uuid,p_sid text,p_generation uuid,p_owner uuid)
RETURNS SETOF saas.write_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE a jsonb;i saas.write_intents%ROWTYPE;t saas.tickets%ROWTYPE;
BEGIN
 UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 AND generation=p_generation AND NOT barrier;
 IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_CLOSED'; END IF;
 IF saas.write_barrier_cost()>(SELECT barrier_max_bytes-4096 FROM saas.write_control_quota WHERE id=1) THEN RAISE EXCEPTION 'CONTROL_GROWTH_QUOTA'; END IF;
 SELECT action INTO i.action FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation;
 IF NOT FOUND THEN RETURN; END IF;
 a:=saas.validate_write_authority(p_tenant,p_sid,p_generation,i.action,true);
 SELECT * INTO i FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 IF i.actor_id<>(a->>'actor')::uuid OR i.session_ref<>(a->>'sessionRef')::uuid OR i.permission_versions<>a->'permissionVersions'
  OR i.writer_version<>(a->>'writerVersion')::bigint OR i.data_epoch<>(a->>'epoch')::bigint THEN RAISE EXCEPTION 'WRITE_GUARDS_CHANGED'; END IF;
 IF i.status='PENDING' THEN
  -- The original HTTP resource cannot be adopted by another process/request.
  -- An uncertain or terminal ticket never grants permission to begin SQL.
  SELECT * INTO t FROM saas.tickets WHERE id=i.ticket_id FOR UPDATE;
  IF NOT FOUND OR t.tenant_id IS DISTINCT FROM p_tenant OR t.generation IS DISTINCT FROM p_generation
   OR i.generation IS DISTINCT FROM p_generation OR t.owner IS DISTINCT FROM p_owner
   OR t.state IS DISTINCT FROM 'ACTIVE' OR t.work_started IS DISTINCT FROM true
  THEN RETURN; END IF;
  UPDATE saas.write_intents SET status='EXECUTING',owner_id=p_owner,attempt_index=1,updated_at=clock_timestamp()
    WHERE tenant_id=p_tenant AND operation_id=p_operation AND status='PENDING';
  PERFORM saas.write_transition(p_tenant,p_operation,p_generation,'PENDING','EXECUTING','EXECUTING');
  RETURN QUERY SELECT * FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation;
 END IF;
END $$;
RESET ROLE;
