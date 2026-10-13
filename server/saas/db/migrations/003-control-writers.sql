-- Central additive P1-L2 migration, only the private verified preparer.
SET ROLE saas_owner;
ALTER TABLE saas.role_policies DROP CONSTRAINT role_policies_action_check;
ALTER TABLE saas.role_policies ADD CONSTRAINT role_policies_action_check CHECK(action IN ('catalog.read','usage.read','quota.change','catalog.create','inventory.receive','inventory.read'));
ALTER TABLE saas.action_grants DROP CONSTRAINT action_grants_action_check;
ALTER TABLE saas.action_grants ADD CONSTRAINT action_grants_action_check CHECK(action IN ('catalog.read','usage.read','quota.change','catalog.create','inventory.receive','inventory.read'));
ALTER TABLE saas.session_registry ADD COLUMN writer_session_ref uuid UNIQUE NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE saas.tenant_directory ADD COLUMN writer_secret_ref text UNIQUE CHECK(length(writer_secret_ref) BETWEEN 1 AND 128),
  ADD COLUMN writer_credential_version bigint CHECK(writer_credential_version>0);
CREATE TABLE saas.tenant_writer_state (
  tenant_id uuid PRIMARY KEY REFERENCES saas.tenant_directory(id),generation uuid NOT NULL,data_epoch bigint NOT NULL CHECK(data_epoch>0),
  writer_version bigint NOT NULL CHECK(writer_version>0),state text NOT NULL CHECK(state IN ('OPEN','CLOSED')),
  policy_version bigint NOT NULL CHECK(policy_version>0),max_products bigint NOT NULL CHECK(max_products>=0),
  max_logical_bytes bigint NOT NULL CHECK(max_logical_bytes>=0),used_products bigint NOT NULL CHECK(used_products>=0),
  used_bytes bigint NOT NULL CHECK(used_bytes>=0),reserved_products bigint NOT NULL DEFAULT 0 CHECK(reserved_products>=0),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK(reserved_bytes>=0)
);
CREATE TABLE saas.write_control_quota (
  id smallint PRIMARY KEY CHECK(id=1),used_bytes bigint NOT NULL CHECK(used_bytes>=0),reserved_bytes bigint NOT NULL CHECK(reserved_bytes>=0),
  max_bytes bigint NOT NULL CHECK(max_bytes=16777216),barrier_max_bytes bigint NOT NULL CHECK(barrier_max_bytes=2097152)
);
INSERT INTO saas.write_control_quota VALUES(1,0,0,16777216,2097152);
CREATE TABLE saas.write_intents (
  tenant_id uuid NOT NULL REFERENCES saas.tenant_directory(id),operation_id uuid NOT NULL,idempotency_key uuid NOT NULL CHECK(idempotency_key=operation_id),
  actor_id uuid NOT NULL REFERENCES saas.identities(id),action text NOT NULL CHECK(action IN ('catalog.create','inventory.receive')),
  data_epoch bigint NOT NULL CHECK(data_epoch>0),request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  permission_versions jsonb NOT NULL CHECK(jsonb_typeof(permission_versions)='object'),
  session_ref uuid NOT NULL,generation uuid NOT NULL,writer_version bigint NOT NULL CHECK(writer_version>0),
  ticket_id uuid NOT NULL REFERENCES saas.tickets(id),owner_id uuid,attempt_index bigint NOT NULL DEFAULT 0 CHECK(attempt_index BETWEEN 0 AND 1),
  status text NOT NULL CHECK(status IN ('PENDING','EXECUTING','UNKNOWN','CONFIRMED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,operation_id),UNIQUE(tenant_id,idempotency_key),
  CHECK(permission_versions ?& ARRAY['identity','membership','grant','session','credential','policy'] AND
    permission_versions - ARRAY['identity','membership','grant','session','credential','policy'] = '{}'::jsonb)
);
CREATE INDEX write_intents_actor_pending ON saas.write_intents(actor_id,tenant_id,operation_id) WHERE status IN('PENDING','EXECUTING','UNKNOWN');
CREATE TABLE saas.write_growth_reservations (
  tenant_id uuid NOT NULL,operation_id uuid NOT NULL,ticket_id uuid NOT NULL REFERENCES saas.tickets(id),
  scope_keys text[] NOT NULL CHECK(cardinality(scope_keys)=4),products_reserved bigint NOT NULL CHECK(products_reserved IN(0,1)),
  tenant_bytes_reserved bigint NOT NULL CHECK(tenant_bytes_reserved=32768),control_bytes_reserved bigint NOT NULL CHECK(control_bytes_reserved=16384),
  status text NOT NULL CHECK(status IN ('RESERVED','PROJECTED','SETTLED')),
  PRIMARY KEY(tenant_id,operation_id),FOREIGN KEY(tenant_id,operation_id) REFERENCES saas.write_intents(tenant_id,operation_id)
);
CREATE TABLE saas.write_projections (
  tenant_id uuid NOT NULL,operation_id uuid NOT NULL,state text NOT NULL CHECK(state IN('PENDING','UNKNOWN','CONFIRMED','REJECTED')),
  reason_code text NOT NULL CHECK(reason_code IN('REGISTERED','EXECUTING','UNCERTAIN','RESULT_CONFIRMED','RESULT_REJECTED','NO_EFFECT','CLOSED','SETTLED')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),result_hash text CHECK(result_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(tenant_id,operation_id),FOREIGN KEY(tenant_id,operation_id) REFERENCES saas.write_intents(tenant_id,operation_id)
);
CREATE TABLE saas.write_transitions (
  tenant_id uuid NOT NULL,operation_id uuid NOT NULL,generation uuid NOT NULL,event_index bigint NOT NULL CHECK(event_index BETWEEN 1 AND 12),
  from_state text NOT NULL CHECK(from_state IN('NONE','PENDING','EXECUTING','UNKNOWN','CONFIRMED','REJECTED')),
  to_state text NOT NULL CHECK(to_state IN('PENDING','EXECUTING','UNKNOWN','CONFIRMED','REJECTED','SETTLED')),
  reason_code text NOT NULL CHECK(reason_code IN('REGISTERED','EXECUTING','UNCERTAIN','RESULT_CONFIRMED','RESULT_REJECTED','NO_EFFECT','CLOSED','SETTLED')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,operation_id,event_index),
  UNIQUE(tenant_id,operation_id,reason_code),FOREIGN KEY(tenant_id,operation_id) REFERENCES saas.write_intents(tenant_id,operation_id)
);
CREATE TABLE saas.write_restrictions (
  id uuid PRIMARY KEY,identity_id uuid REFERENCES saas.identities(id),session_ref uuid,tenant_id uuid REFERENCES saas.tenant_directory(id),
  action text CHECK(action IN('catalog.create','inventory.receive','inventory.read','catalog.read')),generation uuid NOT NULL,
  reason_code text NOT NULL CHECK(reason_code IN('LOGOUT','IDENTITY','MEMBERSHIP','GRANT','TENANT','EPOCH','ROTATION','RESTORE','SHUTDOWN','POLICY')),
  status text NOT NULL CHECK(status IN('PENDING','CLOSING','CLOSED','REOPENING','ACKNOWLEDGED')),
  active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(identity_id IS NOT NULL OR session_ref IS NOT NULL OR tenant_id IS NOT NULL)
);
CREATE TABLE saas.write_restriction_tenants (
  restriction_id uuid NOT NULL REFERENCES saas.write_restrictions(id),tenant_id uuid NOT NULL REFERENCES saas.tenant_writer_state(tenant_id),
  generation uuid NOT NULL,data_epoch bigint NOT NULL CHECK(data_epoch>0),open_version bigint NOT NULL CHECK(open_version>0),
  closed_version bigint NOT NULL CHECK(closed_version=open_version+1),reopen_version bigint NOT NULL CHECK(reopen_version=closed_version+1),
  stage text NOT NULL CHECK(stage IN('PENDING','CLOSED','RESOLVED','REOPENING','OPEN','ACKNOWLEDGED')),
  close_proven boolean NOT NULL DEFAULT false,PRIMARY KEY(restriction_id,tenant_id)
);

CREATE FUNCTION saas.write_decimal19(value bigint) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog
AS $$ SELECT lpad(value::text,19,'0') $$;
CREATE FUNCTION saas.write_tag32(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog
AS $$ SELECT rpad(value,32,' ') $$;
CREATE FUNCTION saas.write_utc24(value timestamptz) RETURNS text LANGUAGE sql STABLE STRICT SET search_path=pg_catalog
AS $$ SELECT to_char(value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;
CREATE FUNCTION saas.write_logical_cost(kind text,value jsonb) RETURNS bigint LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $$
DECLARE shape jsonb; ceiling integer;
BEGIN
CASE kind
WHEN 'intent' THEN shape:=jsonb_build_object('operationId',value->'operation_id','tenantId',value->'tenant_id','actorId',value->'actor_id',
  'action',saas.write_tag32(value->>'action'),'dataEpoch',saas.write_decimal19((value->>'data_epoch')::bigint),'requestHash',value->'request_hash',
  'permissionVersions',(SELECT jsonb_object_agg(key,saas.write_decimal19(v::bigint)) FROM jsonb_each_text(value->'permission_versions') x(key,v)),
  'sessionRef',value->'session_ref','generation',value->'generation','writerVersion',saas.write_decimal19((value->>'writer_version')::bigint),
  'ticketId',value->'ticket_id','ownerId',value->'owner_id','attemptIndex',saas.write_decimal19((value->>'attempt_index')::bigint),
  'status',saas.write_tag32(value->>'status'),'createdAt',saas.write_utc24((value->>'created_at')::timestamptz),'updatedAt',saas.write_utc24((value->>'updated_at')::timestamptz));ceiling:=2048;
WHEN 'reservation' THEN shape:=jsonb_build_object('operationId',value->'operation_id','tenantId',value->'tenant_id','ticketId',value->'ticket_id','scopeKeys',value->'scope_keys',
  'productsReserved',saas.write_decimal19((value->>'products_reserved')::bigint),'tenantBytesReserved',saas.write_decimal19((value->>'tenant_bytes_reserved')::bigint),
  'controlBytesReserved',saas.write_decimal19((value->>'control_bytes_reserved')::bigint),'status',saas.write_tag32(value->>'status'));ceiling:=2048;
WHEN 'projection' THEN shape:=jsonb_build_object('operationId',value->'operation_id','tenantId',value->'tenant_id','state',saas.write_tag32(value->>'state'),
  'reasonCode',saas.write_tag32(value->>'reason_code'),'updatedAt',saas.write_utc24((value->>'updated_at')::timestamptz),'resultHash',value->'result_hash');ceiling:=2048;
WHEN 'transition' THEN shape:=jsonb_build_object('operationId',value->'operation_id','tenantId',value->'tenant_id','generation',value->'generation',
  'eventIndex',saas.write_decimal19((value->>'event_index')::bigint),'from',saas.write_tag32(value->>'from_state'),'to',saas.write_tag32(value->>'to_state'),
  'reasonCode',saas.write_tag32(value->>'reason_code'),'recordedAt',saas.write_utc24((value->>'recorded_at')::timestamptz));ceiling:=512;
ELSE RAISE EXCEPTION 'LOGICAL_SHAPE_INVALID'; END CASE;
IF octet_length(convert_to(shape::text,'UTF8'))>ceiling THEN RAISE EXCEPTION 'CONTROL_ROW_BOUND_EXCEEDED'; END IF;
RETURN octet_length(convert_to(shape::text,'UTF8'))+256;
END $$;
CREATE FUNCTION saas.write_operation_cost(p_tenant uuid,p_operation uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
SELECT coalesce(sum(cost),0)::bigint FROM (
  SELECT saas.write_logical_cost('intent',to_jsonb(i)) cost FROM saas.write_intents i WHERE tenant_id=p_tenant AND operation_id=p_operation
  UNION ALL SELECT saas.write_logical_cost('reservation',to_jsonb(r)) FROM saas.write_growth_reservations r WHERE tenant_id=p_tenant AND operation_id=p_operation
  UNION ALL SELECT saas.write_logical_cost('projection',to_jsonb(p)) FROM saas.write_projections p WHERE tenant_id=p_tenant AND operation_id=p_operation
  UNION ALL SELECT saas.write_logical_cost('transition',to_jsonb(t)) FROM saas.write_transitions t WHERE tenant_id=p_tenant AND operation_id=p_operation) rows $$;
CREATE FUNCTION saas.write_barrier_cost() RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $$
SELECT coalesce(sum(octet_length(convert_to(value::text,'UTF8'))+256),0)::bigint FROM (
 SELECT to_jsonb(w) value FROM saas.tenant_writer_state w UNION ALL SELECT to_jsonb(r) FROM saas.write_restrictions r
 UNION ALL SELECT to_jsonb(t) FROM saas.write_restriction_tenants t UNION ALL SELECT to_jsonb(q) FROM saas.write_control_quota q) rows $$;
CREATE FUNCTION saas.write_transition(p_tenant uuid,p_operation uuid,p_generation uuid,p_from text,p_to text,p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $$
DECLARE n bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM saas.write_transitions WHERE tenant_id=p_tenant AND operation_id=p_operation AND reason_code=p_reason) THEN RETURN; END IF;
  SELECT coalesce(max(event_index),0)+1 INTO n FROM saas.write_transitions WHERE tenant_id=p_tenant AND operation_id=p_operation;
  IF n>12 OR (n=12 AND p_to NOT IN('CONFIRMED','REJECTED','SETTLED')) THEN RAISE EXCEPTION 'TRANSITION_BUDGET_EXHAUSTED'; END IF;
  INSERT INTO saas.write_transitions VALUES(p_tenant,p_operation,p_generation,n,p_from,p_to,p_reason,clock_timestamp());
END $$;
CREATE FUNCTION saas.write_guards_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.tenant_id,NEW.operation_id,NEW.idempotency_key,NEW.actor_id,NEW.action,NEW.data_epoch,NEW.request_hash,
   NEW.permission_versions,NEW.session_ref,NEW.generation,NEW.writer_version,NEW.ticket_id,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.tenant_id,OLD.operation_id,OLD.idempotency_key,OLD.actor_id,OLD.action,OLD.data_epoch,OLD.request_hash,
   OLD.permission_versions,OLD.session_ref,OLD.generation,OLD.writer_version,OLD.ticket_id,OLD.created_at)
 THEN RAISE EXCEPTION 'WRITE_GUARDS_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_write_guards BEFORE UPDATE ON saas.write_intents FOR EACH ROW EXECUTE FUNCTION saas.write_guards_immutable();

-- All functions below lock the same precreated AdmissionFence first. The caller
-- is allowed to retry only the CENTRAL transaction, never a business effect.
CREATE FUNCTION saas.validate_write_authority(p_tenant uuid,p_sid text,p_generation uuid,p_action text,p_writer boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $$
DECLARE r saas.session_registry%ROWTYPE;i saas.identities%ROWTYPE;m saas.memberships%ROWTYPE;g saas.action_grants%ROWTYPE;
 d saas.tenant_directory%ROWTYPE;w saas.tenant_writer_state%ROWTYPE;policy bigint;
BEGIN
 IF p_action NOT IN('catalog.create','inventory.receive','inventory.read','catalog.read') THEN RAISE EXCEPTION 'WRITE_ACCESS_DENIED'; END IF;
 SELECT * INTO r FROM saas.session_registry WHERE sid=p_sid FOR UPDATE;
 IF NOT FOUND OR r.purpose<>'company' OR r.status<>'active' OR r.generation<>p_generation OR r.absolute_expires_at<=clock_timestamp()
   OR r.created_at+interval '8 hours'<=clock_timestamp() OR r.last_interactive_at+interval '30 minutes'<=clock_timestamp()
 THEN RAISE EXCEPTION 'WRITE_SESSION_EXPIRED'; END IF;
 SELECT * INTO i FROM saas.identities WHERE id=r.identity_id FOR UPDATE;
 IF i.status<>'active' OR NOT i.verified OR i.purpose<>'company' OR i.security_version<>r.security_version THEN RAISE EXCEPTION 'WRITE_SESSION_EXPIRED'; END IF;
 IF EXISTS(SELECT 1 FROM saas.write_restrictions x WHERE x.active AND
   (x.identity_id=i.id OR x.session_ref=r.writer_session_ref) AND (x.tenant_id IS NULL OR x.tenant_id=p_tenant)
   AND (x.action IS NULL OR x.action=p_action)) THEN RAISE EXCEPTION 'WRITE_ACCESS_DENIED'; END IF;
 SELECT * INTO w FROM saas.tenant_writer_state WHERE tenant_id=p_tenant FOR UPDATE;
 SELECT * INTO d FROM saas.tenant_directory WHERE id=p_tenant;
 IF w.tenant_id IS NULL OR d.id IS NULL OR d.status<>'active' OR d.purpose<>'company' OR d.data_epoch<>w.data_epoch OR w.generation<>p_generation
   OR (p_writer AND (w.state<>'OPEN' OR d.writer_secret_ref IS NULL OR d.writer_credential_version IS NULL))
   OR (p_writer AND EXISTS(SELECT 1 FROM saas.write_restrictions x WHERE x.active AND x.tenant_id=p_tenant AND x.identity_id IS NULL AND x.session_ref IS NULL))
 THEN RAISE EXCEPTION 'WRITER_FENCE_CLOSED'; END IF;
 SELECT * INTO m FROM saas.memberships WHERE identity_id=i.id AND tenant_id=p_tenant FOR UPDATE;
 SELECT * INTO g FROM saas.action_grants WHERE identity_id=i.id AND tenant_id=p_tenant AND action=p_action FOR UPDATE;
 SELECT version INTO policy FROM saas.role_policies WHERE role=m.role AND action=p_action FOR SHARE;
 IF m.status IS DISTINCT FROM 'active' OR g.status IS DISTINCT FROM 'active' OR policy IS NULL THEN RAISE EXCEPTION 'WRITE_ACCESS_DENIED'; END IF;
 RETURN jsonb_build_object('actor',i.id,'sessionRef',r.writer_session_ref,'epoch',w.data_epoch,'writerVersion',w.writer_version,
   'permissionVersions',jsonb_build_object('identity',i.security_version::text,'membership',m.version::text,'grant',g.version::text,
   'session',r.security_version::text,'credential',d.writer_credential_version::text,'policy',policy::text));
END $$;

CREATE FUNCTION saas.register_write_intent(p_operation uuid,p_tenant uuid,p_sid text,p_generation uuid,p_action text,p_epoch bigint,p_hash text,p_ticket uuid)
RETURNS SETOF saas.write_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE a jsonb;i saas.write_intents%ROWTYPE;t saas.tickets%ROWTYPE;w saas.tenant_writer_state%ROWTYPE;
 q saas.write_control_quota%ROWTYPE;product bigint;scope text;expected_scopes text[];
BEGIN
 IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_operation IS NULL OR p_epoch<=0 THEN RAISE EXCEPTION 'WRITE_INPUT_INVALID'; END IF;
 UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 AND generation=p_generation AND NOT barrier;
 IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_CLOSED'; END IF;
 a:=saas.validate_write_authority(p_tenant,p_sid,p_generation,p_action,true);
 IF a->>'epoch'<>p_epoch::text THEN RAISE EXCEPTION 'EPOCH_CONFLICT'; END IF;
 expected_scopes:=ARRAY['global','lane:ordinary','tenant:'||p_tenant::text,'tenant:'||p_tenant::text||':ordinary'];
 FOREACH scope IN ARRAY expected_scopes LOOP PERFORM 1 FROM saas.admission_scopes WHERE scope_key=scope FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'POLICY_UNAVAILABLE'; END IF; END LOOP;
 SELECT * INTO i FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 IF FOUND THEN
   IF i.actor_id<>(a->>'actor')::uuid OR i.action<>p_action OR i.data_epoch<>p_epoch OR i.request_hash<>p_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN NEXT i;RETURN;
 END IF;
 SELECT * INTO t FROM saas.tickets WHERE id=p_ticket FOR UPDATE;
 IF NOT FOUND OR t.tenant_id<>p_tenant OR t.generation<>p_generation OR t.state<>'ACTIVE' OR t.scopes<>expected_scopes
 THEN RAISE EXCEPTION 'WRITE_TICKET_INVALID'; END IF;
 SELECT * INTO w FROM saas.tenant_writer_state WHERE tenant_id=p_tenant;
 SELECT * INTO q FROM saas.write_control_quota WHERE id=1 FOR UPDATE;
 product:=CASE WHEN p_action='catalog.create' THEN 1 ELSE 0 END;
 IF w.used_products+w.reserved_products>w.max_products-product OR w.used_bytes+w.reserved_bytes>w.max_logical_bytes-32768
 THEN RAISE EXCEPTION 'GROWTH_QUOTA'; END IF;
 IF q.used_bytes+q.reserved_bytes>q.max_bytes-16384 OR saas.write_barrier_cost()>q.barrier_max_bytes-4096 THEN RAISE EXCEPTION 'CONTROL_GROWTH_QUOTA'; END IF;
 INSERT INTO saas.write_intents(tenant_id,operation_id,idempotency_key,actor_id,action,data_epoch,request_hash,permission_versions,
   session_ref,generation,writer_version,ticket_id,status) VALUES(p_tenant,p_operation,p_operation,(a->>'actor')::uuid,p_action,p_epoch,p_hash,
   a->'permissionVersions',(a->>'sessionRef')::uuid,p_generation,(a->>'writerVersion')::bigint,p_ticket,'PENDING');
 INSERT INTO saas.write_growth_reservations VALUES(p_tenant,p_operation,p_ticket,expected_scopes,product,32768,16384,'RESERVED');
 INSERT INTO saas.write_projections VALUES(p_tenant,p_operation,'PENDING','REGISTERED',clock_timestamp(),NULL);
 PERFORM saas.write_transition(p_tenant,p_operation,p_generation,'NONE','PENDING','REGISTERED');
 UPDATE saas.tenant_writer_state SET reserved_products=reserved_products+product,reserved_bytes=reserved_bytes+32768 WHERE tenant_id=p_tenant;
 UPDATE saas.write_control_quota SET reserved_bytes=reserved_bytes+16384 WHERE id=1;
 IF saas.write_operation_cost(p_tenant,p_operation)>16384 THEN RAISE EXCEPTION 'CONTROL_ROW_BOUND_EXCEEDED'; END IF;
 RETURN QUERY SELECT * FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation;
END $$;

CREATE FUNCTION saas.claim_write_intent(p_tenant uuid,p_operation uuid,p_sid text,p_generation uuid,p_owner uuid)
RETURNS SETOF saas.write_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE a jsonb;i saas.write_intents%ROWTYPE;
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
  UPDATE saas.write_intents SET status='EXECUTING',owner_id=p_owner,attempt_index=1,updated_at=clock_timestamp()
    WHERE tenant_id=p_tenant AND operation_id=p_operation AND status='PENDING';
  PERFORM saas.write_transition(p_tenant,p_operation,p_generation,'PENDING','EXECUTING','EXECUTING');
  RETURN QUERY SELECT * FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation;
 END IF;
END $$;

CREATE FUNCTION saas.project_write_result(p_tenant uuid,p_operation uuid,p_owner uuid,p_state text,p_result_hash text,p_delta bigint,p_products bigint)
RETURNS SETOF saas.write_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE i saas.write_intents%ROWTYPE;r saas.write_growth_reservations%ROWTYPE;p saas.write_projections%ROWTYPE;
BEGIN
 UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1;
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=p_tenant FOR UPDATE;
 SELECT * INTO i FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 IF NOT FOUND OR p_owner IS NULL OR i.owner_id IS DISTINCT FROM p_owner OR p_state IS NULL OR p_state NOT IN('CONFIRMED','REJECTED')
   OR p_delta IS NULL OR p_delta NOT BETWEEN 0 AND 32768 OR p_result_hash IS NULL OR p_result_hash !~ '^[0-9a-f]{64}$'
   OR p_products IS NULL OR p_products<>(CASE WHEN p_state='CONFIRMED' AND i.action='catalog.create' THEN 1 ELSE 0 END)
 THEN RAISE EXCEPTION 'WRITE_RESULT_INVALID'; END IF;
 SELECT * INTO r FROM saas.write_growth_reservations WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 SELECT * INTO p FROM saas.write_projections WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 IF i.status IN('CONFIRMED','REJECTED') THEN
   IF i.status IS DISTINCT FROM p_state OR p.result_hash IS DISTINCT FROM p_result_hash THEN RAISE EXCEPTION 'WRITE_RESULT_CONFLICT'; END IF;
   RETURN NEXT i;RETURN;
 END IF;
 IF i.status NOT IN('EXECUTING','UNKNOWN') OR r.status<>'RESERVED' THEN RAISE EXCEPTION 'WRITE_RESULT_INVALID'; END IF;
 UPDATE saas.write_intents SET status=p_state,updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND operation_id=p_operation;
 UPDATE saas.write_growth_reservations SET status='PROJECTED' WHERE tenant_id=p_tenant AND operation_id=p_operation;
 UPDATE saas.write_projections SET state=p_state,reason_code=CASE WHEN p_state='CONFIRMED' THEN 'RESULT_CONFIRMED' ELSE 'RESULT_REJECTED' END,
   result_hash=p_result_hash,updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND operation_id=p_operation;
 UPDATE saas.tenant_writer_state SET used_products=used_products+p_products,used_bytes=used_bytes+p_delta WHERE tenant_id=p_tenant;
 PERFORM saas.write_transition(p_tenant,p_operation,i.generation,i.status,p_state,CASE WHEN p_state='CONFIRMED' THEN 'RESULT_CONFIRMED' ELSE 'RESULT_REJECTED' END);
 RETURN QUERY SELECT * FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation;
END $$;

CREATE FUNCTION saas.mark_write_unknown(p_tenant uuid,p_operation uuid,p_owner uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE i saas.write_intents%ROWTYPE;
BEGIN
 UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1;
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=p_tenant FOR UPDATE;
 SELECT * INTO i FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 IF NOT FOUND OR i.owner_id IS DISTINCT FROM p_owner THEN RETURN false; END IF;
 IF i.status='EXECUTING' THEN
   UPDATE saas.write_intents SET status='UNKNOWN',updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND operation_id=p_operation;
   UPDATE saas.write_projections SET state='UNKNOWN',reason_code='UNCERTAIN',updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND operation_id=p_operation;
   PERFORM saas.write_transition(p_tenant,p_operation,i.generation,'EXECUTING','UNKNOWN','UNCERTAIN');
 END IF;
 RETURN true;
END $$;
CREATE FUNCTION saas.finish_write_resources(p_tenant uuid,p_operation uuid,p_owner uuid,p_ticket uuid,p_sql_settled boolean,p_response_settled boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE i saas.write_intents%ROWTYPE;r saas.write_growth_reservations%ROWTYPE;cost bigint;
BEGIN
 IF p_sql_settled IS DISTINCT FROM true OR p_response_settled IS DISTINCT FROM true THEN RAISE EXCEPTION 'END_NOT_PROVEN'; END IF;
 UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1;
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=p_tenant FOR UPDATE;
 SELECT * INTO i FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 IF NOT FOUND OR p_owner IS NULL OR i.owner_id IS DISTINCT FROM p_owner OR i.ticket_id IS DISTINCT FROM p_ticket THEN RETURN false; END IF;
 IF i.status NOT IN('CONFIRMED','REJECTED') THEN RAISE EXCEPTION 'RECONCILIATION_REQUIRED'; END IF;
 SELECT * INTO r FROM saas.write_growth_reservations WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 IF r.status='SETTLED' THEN RETURN true; END IF;
 IF r.status<>'PROJECTED' THEN RAISE EXCEPTION 'RECONCILIATION_REQUIRED'; END IF;
 UPDATE saas.write_growth_reservations SET status='SETTLED' WHERE tenant_id=p_tenant AND operation_id=p_operation;
 PERFORM saas.write_transition(p_tenant,p_operation,i.generation,i.status,'SETTLED','SETTLED');
 cost:=saas.write_operation_cost(p_tenant,p_operation);
 IF cost>r.control_bytes_reserved THEN RAISE EXCEPTION 'CONTROL_ROW_BOUND_EXCEEDED'; END IF;
 UPDATE saas.tenant_writer_state SET reserved_products=reserved_products-r.products_reserved,reserved_bytes=reserved_bytes-r.tenant_bytes_reserved WHERE tenant_id=p_tenant;
 UPDATE saas.write_control_quota SET used_bytes=used_bytes+cost,reserved_bytes=reserved_bytes-r.control_bytes_reserved WHERE id=1;
 RETURN true;
END $$;

-- Private settlement cannot adopt an abandoned owner or finish a live HTTP.
-- The caller additionally supplies its independently verified end proof before
-- reaching this function; SQL requires the already-terminal L1 ticket and the
-- exclusive-close evidence bound to this immutable intention.
CREATE FUNCTION saas.settle_closed_write_resources(p_tenant uuid,p_operation uuid,p_ticket uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE i saas.write_intents%ROWTYPE;r saas.write_growth_reservations%ROWTYPE;t saas.tickets%ROWTYPE;cost bigint;
BEGIN
 UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1;
 PERFORM 1 FROM saas.tenant_writer_state WHERE tenant_id=p_tenant FOR UPDATE;
 SELECT * INTO i FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 IF NOT FOUND OR i.ticket_id IS DISTINCT FROM p_ticket OR i.status NOT IN('CONFIRMED','REJECTED') THEN RAISE EXCEPTION 'RECONCILIATION_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.write_restriction_tenants rt WHERE rt.tenant_id=p_tenant AND rt.generation=i.generation
   AND rt.data_epoch=i.data_epoch AND rt.close_proven AND rt.open_version>=i.writer_version
   AND rt.stage IN('RESOLVED','REOPENING','OPEN','ACKNOWLEDGED')) THEN RAISE EXCEPTION 'WRITER_CLOSE_NOT_PROVEN'; END IF;
 SELECT * INTO r FROM saas.write_growth_reservations WHERE tenant_id=p_tenant AND operation_id=p_operation FOR UPDATE;
 SELECT * INTO t FROM saas.tickets WHERE id=p_ticket FOR UPDATE;
 IF NOT FOUND OR t.state NOT IN('FINISHED','REJECTED','EXPIRED') OR t.tenant_id IS DISTINCT FROM p_tenant OR t.generation<>i.generation
 THEN RAISE EXCEPTION 'END_NOT_PROVEN'; END IF;
 IF r.status='SETTLED' THEN RETURN true; END IF;
 IF r.status<>'PROJECTED' THEN RAISE EXCEPTION 'RECONCILIATION_REQUIRED'; END IF;
 UPDATE saas.write_growth_reservations SET status='SETTLED' WHERE tenant_id=p_tenant AND operation_id=p_operation;
 PERFORM saas.write_transition(p_tenant,p_operation,i.generation,i.status,'SETTLED','SETTLED');
 cost:=saas.write_operation_cost(p_tenant,p_operation);
 IF cost>r.control_bytes_reserved THEN RAISE EXCEPTION 'CONTROL_ROW_BOUND_EXCEEDED'; END IF;
 UPDATE saas.tenant_writer_state SET reserved_products=reserved_products-r.products_reserved,reserved_bytes=reserved_bytes-r.tenant_bytes_reserved WHERE tenant_id=p_tenant;
 UPDATE saas.write_control_quota SET used_bytes=used_bytes+cost,reserved_bytes=reserved_bytes-r.control_bytes_reserved WHERE id=1;
 RETURN true;
END $$;

CREATE FUNCTION saas.own_write_intent(p_tenant uuid,p_operation uuid,p_sid text,p_generation uuid) RETURNS SETOF saas.write_intents
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE a jsonb;i saas.write_intents%ROWTYPE;
BEGIN
 SELECT * INTO i FROM saas.write_intents WHERE tenant_id=p_tenant AND operation_id=p_operation;
 IF NOT FOUND THEN RETURN; END IF;
 a:=saas.validate_write_authority(p_tenant,p_sid,p_generation,i.action,false);
 IF i.actor_id<>(a->>'actor')::uuid THEN RAISE EXCEPTION 'OPERATION_ACCESS_DENIED'; END IF;
 RETURN NEXT i;
END $$;
CREATE FUNCTION saas.own_pending_writes(p_tenant uuid,p_sid text,p_generation uuid,p_cursor uuid,p_limit integer)
RETURNS TABLE(operation_id uuid,action text,status text,created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE actor uuid;r saas.session_registry%ROWTYPE;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 101 THEN RAISE EXCEPTION 'WRITE_INPUT_INVALID'; END IF;
 SELECT * INTO r FROM saas.session_registry WHERE sid=p_sid;
 IF NOT FOUND THEN RAISE EXCEPTION 'WRITE_SESSION_EXPIRED'; END IF;
 -- Per-row authority is required: an inventory.read grant cannot disclose the
 -- caller's earlier create/receive result after its original grant is revoked.
 FOR operation_id,action,status,created_at IN SELECT i.operation_id,i.action,i.status,i.created_at FROM saas.write_intents i
 WHERE i.tenant_id=p_tenant AND i.actor_id=r.identity_id AND i.status IN('PENDING','EXECUTING','UNKNOWN') AND(p_cursor IS NULL OR i.operation_id>p_cursor)
 ORDER BY i.operation_id LOOP
   BEGIN
     PERFORM saas.validate_write_authority(p_tenant,p_sid,p_generation,action,false);
     RETURN NEXT;p_limit:=p_limit-1;IF p_limit=0 THEN RETURN; END IF;
   EXCEPTION WHEN raise_exception THEN
     IF SQLERRM NOT IN('WRITE_ACCESS_DENIED','WRITER_FENCE_CLOSED') THEN RAISE; END IF;
   END;
 END LOOP;
END $$;

CREATE FUNCTION saas.own_write_projection(p_tenant uuid,p_operation uuid,p_sid text,p_generation uuid)
RETURNS TABLE(state text,reason_code text,result_hash text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM saas.own_write_intent(p_tenant,p_operation,p_sid,p_generation)) THEN RETURN; END IF;
 RETURN QUERY SELECT p.state,p.reason_code,p.result_hash FROM saas.write_projections p WHERE p.tenant_id=p_tenant AND p.operation_id=p_operation;
END $$;
CREATE FUNCTION saas.writer_readiness(p_generation uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
 SELECT EXISTS(SELECT 1 FROM saas.admission_fence WHERE id=1 AND generation=p_generation AND NOT barrier)
 AND EXISTS(SELECT 1 FROM saas.write_control_quota WHERE id=1 AND used_bytes+reserved_bytes<=max_bytes AND saas.write_barrier_cost()<=barrier_max_bytes-4096)
 AND NOT EXISTS(SELECT 1 FROM saas.write_restrictions WHERE status<>'ACKNOWLEDGED')
 AND NOT EXISTS(SELECT 1 FROM saas.tenant_writer_state w JOIN saas.tenant_directory d ON d.id=w.tenant_id
   WHERE w.generation<>p_generation OR w.data_epoch<>d.data_epoch OR d.schema_version<>2 OR w.state<>'OPEN'
   OR d.writer_secret_ref IS NULL OR d.writer_credential_version IS NULL) $$;

CREATE FUNCTION saas.request_write_restriction(p_id uuid,p_identity uuid,p_session uuid,p_tenant uuid,p_action text,p_generation uuid,p_reason text)
RETURNS SETOF saas.write_restrictions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.write_restrictions%ROWTYPE;w saas.tenant_writer_state%ROWTYPE;
BEGIN
 UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 AND generation=p_generation;
 IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_CLOSED'; END IF;
 IF p_identity IS NULL AND p_session IS NULL AND p_tenant IS NULL THEN RAISE EXCEPTION 'RESTRICTION_SCOPE_INVALID'; END IF;
 IF p_identity IS NOT NULL THEN PERFORM 1 FROM saas.identities WHERE id=p_identity FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'RESTRICTION_SCOPE_INVALID'; END IF; END IF;
 IF p_session IS NOT NULL THEN PERFORM 1 FROM saas.session_registry WHERE writer_session_ref=p_session AND(p_identity IS NULL OR identity_id=p_identity) FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'RESTRICTION_SCOPE_INVALID'; END IF; END IF;
 SELECT * INTO r FROM saas.write_restrictions WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
   IF ROW(r.identity_id,r.session_ref,r.tenant_id,r.action,r.generation,r.reason_code) IS DISTINCT FROM ROW(p_identity,p_session,p_tenant,p_action,p_generation,p_reason)
   THEN RAISE EXCEPTION 'RESTRICTION_SCOPE_INVALID'; END IF;
   RETURN NEXT r;RETURN;
 END IF;
 INSERT INTO saas.write_restrictions(id,identity_id,session_ref,tenant_id,action,generation,reason_code,status)
   VALUES(p_id,p_identity,p_session,p_tenant,p_action,p_generation,p_reason,'PENDING');
 -- Include nonterminal intentions even if a membership has already disappeared.
 FOR w IN SELECT * FROM saas.tenant_writer_state s WHERE s.tenant_id IN (
   SELECT p_tenant WHERE p_tenant IS NOT NULL
   UNION SELECT m.tenant_id FROM saas.memberships m WHERE p_identity IS NOT NULL AND m.identity_id=p_identity AND(p_tenant IS NULL OR m.tenant_id=p_tenant)
   UNION SELECT i.tenant_id FROM saas.write_intents i WHERE i.status IN('PENDING','EXECUTING','UNKNOWN')
     AND (p_identity IS NULL OR i.actor_id=p_identity) AND(p_session IS NULL OR i.session_ref=p_session)
     AND(p_tenant IS NULL OR i.tenant_id=p_tenant) AND(p_action IS NULL OR i.action=p_action)
   UNION SELECT m.tenant_id FROM saas.memberships m JOIN saas.session_registry s ON s.identity_id=m.identity_id WHERE p_session IS NOT NULL AND s.writer_session_ref=p_session
 ) ORDER BY s.tenant_id FOR UPDATE LOOP
   IF w.state<>'OPEN' OR w.writer_version>9223372036854775805::bigint THEN RAISE EXCEPTION 'WRITER_VERSION_CONFLICT'; END IF;
   INSERT INTO saas.write_restriction_tenants VALUES(p_id,w.tenant_id,w.generation,w.data_epoch,w.writer_version,w.writer_version+1,w.writer_version+2,'PENDING',false);
   UPDATE saas.tenant_writer_state SET state='CLOSED',writer_version=w.writer_version+1 WHERE tenant_id=w.tenant_id;
 END LOOP;
 IF saas.write_barrier_cost()>(SELECT barrier_max_bytes FROM saas.write_control_quota WHERE id=1) THEN RAISE EXCEPTION 'RESTRICTION_BUDGET_EXHAUSTED'; END IF;
 RETURN QUERY SELECT * FROM saas.write_restrictions WHERE id=p_id;
END $$;
CREATE FUNCTION saas.request_session_restriction(p_sid text,p_identity uuid,p_generation uuid,p_id uuid)
RETURNS SETOF saas.write_restrictions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.session_registry%ROWTYPE;existing saas.write_restrictions%ROWTYPE;
BEGIN
 UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 AND generation=p_generation;
 IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_CLOSED'; END IF;
 SELECT * INTO r FROM saas.session_registry WHERE sid=p_sid AND identity_id=p_identity AND generation=p_generation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WRITE_SESSION_EXPIRED'; END IF;
 SELECT * INTO existing FROM saas.write_restrictions WHERE session_ref=r.writer_session_ref AND reason_code='LOGOUT' ORDER BY created_at LIMIT 1;
 IF FOUND THEN RETURN NEXT existing;RETURN; END IF;
 RETURN QUERY SELECT * FROM saas.request_write_restriction(p_id,NULL,r.writer_session_ref,NULL,NULL,p_generation,'LOGOUT');
END $$;
CREATE FUNCTION saas.own_session_restriction(p_id uuid,p_sid text,p_identity uuid,p_generation uuid)
RETURNS SETOF saas.write_restrictions LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
 SELECT x.* FROM saas.write_restrictions x JOIN saas.session_registry r ON r.writer_session_ref=x.session_ref
 WHERE x.id=p_id AND r.sid=p_sid AND r.identity_id=p_identity AND r.generation=p_generation AND x.generation=p_generation $$;

-- Preserve the L1 demo/operator behavior. The old company helper is no longer
-- an escape hatch around the writer close protocol, even via its old grants.
CREATE FUNCTION saas.lock_issuer_identity(p_identity uuid,p_purpose text,p_security_version bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
BEGIN
 IF p_purpose NOT IN('company','demo','operator') OR p_security_version<=0 THEN RETURN false; END IF;
 PERFORM 1 FROM saas.identities WHERE id=p_identity AND purpose=p_purpose AND status='active'
   AND verified AND security_version=p_security_version AND (purpose<>'operator' OR mfa_verified) FOR SHARE;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION saas.lock_issuer_identity(uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.lock_issuer_identity(uuid,text,bigint) TO saas_issuer;

CREATE OR REPLACE FUNCTION saas.revoke_session(p_sid text,p_identity uuid,p_generation uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE r saas.session_registry%ROWTYPE;restriction uuid;
BEGIN
 SELECT * INTO r FROM saas.session_registry WHERE sid=p_sid AND identity_id=p_identity AND generation=p_generation FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF r.purpose='company' THEN
   SELECT x.id INTO restriction FROM saas.write_restrictions x WHERE x.session_ref=r.writer_session_ref AND x.reason_code='LOGOUT'
     AND x.active AND NOT EXISTS(SELECT 1 FROM saas.write_restriction_tenants t WHERE t.restriction_id=x.id
       AND (NOT t.close_proven OR t.stage NOT IN('RESOLVED','REOPENING','OPEN','ACKNOWLEDGED'))) ORDER BY x.created_at LIMIT 1;
   IF restriction IS NULL THEN RAISE EXCEPTION 'WRITER_CLOSE_NOT_PROVEN'; END IF;
 END IF;
 UPDATE saas.session_registry SET status='revoked' WHERE sid=p_sid AND identity_id=p_identity AND generation=p_generation;
 RETURN true;
END $$;

-- Other L1 functions have independent owners. Revoke only this migration's
-- fixed functions; a schema-wide revoke would touch measurement ownership.
REVOKE ALL ON FUNCTION saas.write_decimal19(bigint),saas.write_tag32(text),saas.write_utc24(timestamptz),
 saas.write_logical_cost(text,jsonb),saas.write_operation_cost(uuid,uuid),saas.write_barrier_cost(),
 saas.write_transition(uuid,uuid,uuid,text,text,text),saas.write_guards_immutable(),
 saas.validate_write_authority(uuid,text,uuid,text,boolean),
 saas.register_write_intent(uuid,uuid,text,uuid,text,bigint,text,uuid),saas.claim_write_intent(uuid,uuid,text,uuid,uuid),
 saas.project_write_result(uuid,uuid,uuid,text,text,bigint,bigint),saas.mark_write_unknown(uuid,uuid,uuid),
 saas.finish_write_resources(uuid,uuid,uuid,uuid,boolean,boolean),saas.settle_closed_write_resources(uuid,uuid,uuid),
 saas.own_write_intent(uuid,uuid,text,uuid),saas.own_pending_writes(uuid,text,uuid,uuid,integer),
 saas.own_write_projection(uuid,uuid,text,uuid),saas.writer_readiness(uuid),
 saas.request_write_restriction(uuid,uuid,uuid,uuid,text,uuid,text),saas.request_session_restriction(text,uuid,uuid,uuid),
 saas.own_session_restriction(uuid,text,uuid,uuid),saas.lock_issuer_identity(uuid,text,bigint),saas.revoke_session(text,uuid,uuid)
 FROM PUBLIC;
REVOKE ALL ON saas.tenant_writer_state,saas.write_control_quota,saas.write_intents,saas.write_growth_reservations,
 saas.write_projections,saas.write_transitions,saas.write_restrictions,saas.write_restriction_tenants FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.register_write_intent(uuid,uuid,text,uuid,text,bigint,text,uuid),
 saas.claim_write_intent(uuid,uuid,text,uuid,uuid),saas.project_write_result(uuid,uuid,uuid,text,text,bigint,bigint),
 saas.mark_write_unknown(uuid,uuid,uuid),saas.finish_write_resources(uuid,uuid,uuid,uuid,boolean,boolean),
 saas.own_write_intent(uuid,uuid,text,uuid),saas.own_pending_writes(uuid,text,uuid,uuid,integer),
 saas.own_write_projection(uuid,uuid,text,uuid),saas.writer_readiness(uuid),
 saas.request_session_restriction(text,uuid,uuid,uuid),saas.own_session_restriction(uuid,text,uuid,uuid) TO saas_api;
GRANT SELECT(writer_session_ref) ON saas.session_registry TO saas_api,saas_issuer,saas_revoker;
GRANT SELECT ON saas.tenant_writer_state,saas.write_restrictions TO saas_api;
RESET ROLE;
-- The preparer grants maintenance only the restriction/intention projection
-- state and the fixed request_write_restriction function. No business database
-- credential is stored centrally and no public role receives private grants.
