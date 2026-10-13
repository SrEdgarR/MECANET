-- Additive P1-L2 migration. An exclusive private preparer owns migration/hash
-- registration and executes this file as the existing NOLOGIN tenant owner.
-- No API startup migrations; no role passwords or global/business credentials.
DO $$ BEGIN
  IF current_setting('server_encoding') <> 'UTF8' OR current_setting('client_encoding') <> 'UTF8'
    OR (SELECT rolcanlogin OR rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user)
  THEN RAISE EXCEPTION 'WRITER_MIGRATION_OWNER_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM catalog.products WHERE sku <> upper(btrim(sku)) OR sku !~ '^[A-Z0-9][A-Z0-9._-]{0,63}$')
  THEN RAISE EXCEPTION 'SKU_PREFLIGHT_REQUIRED'; END IF;
END $$;
CREATE SCHEMA inventory;
REVOKE ALL ON SCHEMA inventory FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER TABLE catalog.products
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status='active'),
  ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN created_by uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000000';
CREATE TABLE inventory.writer_fence (
  id smallint PRIMARY KEY CHECK(id=1),tenant_id uuid NOT NULL,
  generation uuid NOT NULL,data_epoch bigint NOT NULL CHECK(data_epoch>0),
  writer_version bigint NOT NULL CHECK(writer_version>0),state text NOT NULL CHECK(state IN ('OPEN','CLOSED'))
);
CREATE TABLE inventory.quota_state (
  id smallint PRIMARY KEY CHECK(id=1),policy_version bigint NOT NULL CHECK(policy_version>0),
  active_products bigint NOT NULL CHECK(active_products>=0),logical_bytes bigint NOT NULL CHECK(logical_bytes>=0),
  max_products bigint NOT NULL CHECK(max_products>=0),max_logical_bytes bigint NOT NULL CHECK(max_logical_bytes>=0)
);
CREATE TABLE inventory.balances (
  product_id uuid PRIMARY KEY REFERENCES catalog.products(id),on_hand bigint NOT NULL CHECK(on_hand>=0),
  version bigint NOT NULL CHECK(version>0)
);
INSERT INTO inventory.balances(product_id,on_hand,version) SELECT id,0,1 FROM catalog.products;
CREATE TABLE inventory.operations (
  id uuid PRIMARY KEY,idempotency_key uuid UNIQUE NOT NULL CHECK(idempotency_key=id),
  actor_id uuid NOT NULL,action text NOT NULL CHECK(action IN ('catalog.create','inventory.receive')),
  data_epoch bigint NOT NULL CHECK(data_epoch>0),request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK(status IN ('CONFIRMED','REJECTED')),result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(octet_length(convert_to(result::text,'UTF8'))<=512),
  CHECK(result->>'operationId'=id::text AND result->>'state'=status AND result->>'dataEpoch'=data_epoch::text)
);
CREATE TABLE inventory.movements (
  id uuid PRIMARY KEY,product_id uuid NOT NULL REFERENCES catalog.products(id),
  operation_id uuid UNIQUE NOT NULL REFERENCES inventory.operations(id),
  type text NOT NULL CHECK(type='RECEIPT'),quantity bigint NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
  on_hand_after bigint NOT NULL CHECK(on_hand_after>=quantity),balance_version bigint NOT NULL CHECK(balance_version>1),
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 160),actor_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX movements_product_cursor ON inventory.movements(product_id,id);
CREATE TABLE inventory.audit (
  operation_id uuid PRIMARY KEY REFERENCES inventory.operations(id),actor_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('catalog.create','inventory.receive')),product_id uuid REFERENCES catalog.products(id),
  movement_id uuid REFERENCES inventory.movements(id),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  result_hash text NOT NULL CHECK(result_hash ~ '^[0-9a-f]{64}$')
);

CREATE FUNCTION inventory.decimal19(value bigint) RETURNS text LANGUAGE sql IMMUTABLE STRICT
  SET search_path=pg_catalog AS $$ SELECT lpad(value::text,19,'0') $$;
CREATE FUNCTION inventory.tag32(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT
  SET search_path=pg_catalog AS $$ SELECT rpad(value,32,' ') $$;
CREATE FUNCTION inventory.utc24(value timestamptz) RETURNS text LANGUAGE sql STABLE STRICT
  SET search_path=pg_catalog AS $$ SELECT to_char(value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;
CREATE FUNCTION inventory.logical_result(value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT
  SET search_path=pg_catalog,inventory AS $$
  SELECT CASE WHEN value->>'state'='CONFIRMED' THEN jsonb_build_object(
    'operationId',value->>'operationId','state',inventory.tag32(value->>'state'),
    'productId',value->'productId','movementId',value->'movementId',
    'onHand',inventory.decimal19((value->>'onHand')::bigint),
    'balanceVersion',inventory.decimal19((value->>'balanceVersion')::bigint),
    'dataEpoch',inventory.decimal19((value->>'dataEpoch')::bigint))
  ELSE jsonb_build_object('operationId',value->>'operationId','state',inventory.tag32(value->>'state'),
    'code',inventory.tag32(value->>'code'),'dataEpoch',inventory.decimal19((value->>'dataEpoch')::bigint)) END $$;

-- This is the sole logical-v1 representation, not pg_column_size or disk usage.
CREATE FUNCTION inventory.logical_cost(kind text,value jsonb) RETURNS bigint LANGUAGE plpgsql STABLE STRICT
SET search_path=pg_catalog,inventory AS $$
DECLARE shape jsonb;
BEGIN
  CASE kind
  WHEN 'product' THEN shape:=jsonb_build_object('id',value->'id','sku',value->'sku','name',value->'name',
    'status',inventory.tag32(value->>'status'),'version',inventory.decimal19((value->>'version')::bigint),
    'createdAt',inventory.utc24((value->>'created_at')::timestamptz),'createdBy',value->'created_by');
  WHEN 'balance' THEN shape:=jsonb_build_object('productId',value->'product_id',
    'onHand',inventory.decimal19((value->>'on_hand')::bigint),'version',inventory.decimal19((value->>'version')::bigint));
  WHEN 'movement' THEN shape:=jsonb_build_object('id',value->'id','productId',value->'product_id','operationId',value->'operation_id',
    'type',inventory.tag32(value->>'type'),'quantity',inventory.decimal19((value->>'quantity')::bigint),
    'onHandAfter',inventory.decimal19((value->>'on_hand_after')::bigint),'balanceVersion',inventory.decimal19((value->>'balance_version')::bigint),
    'reason',value->'reason','actorId',value->'actor_id','recordedAt',inventory.utc24((value->>'recorded_at')::timestamptz));
  WHEN 'operation' THEN shape:=jsonb_build_object('id',value->'id','idempotencyKey',value->'idempotency_key','actorId',value->'actor_id',
    'action',inventory.tag32(value->>'action'),'dataEpoch',inventory.decimal19((value->>'data_epoch')::bigint),
    'requestHash',value->'request_hash','status',inventory.tag32(value->>'status'),
    'result',inventory.logical_result(value->'result'),'createdAt',inventory.utc24((value->>'created_at')::timestamptz));
  WHEN 'audit' THEN shape:=jsonb_build_object('operationId',value->'operation_id','actorId',value->'actor_id','action',inventory.tag32(value->>'action'),
    'productId',value->'product_id','movementId',value->'movement_id','recordedAt',inventory.utc24((value->>'recorded_at')::timestamptz),'resultHash',value->'result_hash');
  WHEN 'quota' THEN shape:=jsonb_build_object('id','1','policyVersion',inventory.decimal19((value->>'policy_version')::bigint),
    'activeProducts',inventory.decimal19((value->>'active_products')::bigint),'logicalBytes',inventory.decimal19((value->>'logical_bytes')::bigint));
  WHEN 'fence' THEN shape:=jsonb_build_object('id','1','tenantId',value->'tenant_id','generation',value->'generation',
    'dataEpoch',inventory.decimal19((value->>'data_epoch')::bigint),'writerVersion',inventory.decimal19((value->>'writer_version')::bigint),'state',inventory.tag32(value->>'state'));
  ELSE RAISE EXCEPTION 'LOGICAL_SHAPE_INVALID'; END CASE;
  IF octet_length(convert_to(shape::text,'UTF8'))>4096 THEN RAISE EXCEPTION 'LOGICAL_ROW_BOUND_EXCEEDED'; END IF;
  RETURN octet_length(convert_to(shape::text,'UTF8'))+256;
END $$;
CREATE FUNCTION inventory.logical_usage() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,inventory,catalog AS $$
  SELECT coalesce(sum(cost),0)::bigint FROM (
    SELECT inventory.logical_cost('product',to_jsonb(p)) cost FROM catalog.products p
    UNION ALL SELECT inventory.logical_cost('balance',to_jsonb(b)) FROM inventory.balances b
    UNION ALL SELECT inventory.logical_cost('movement',to_jsonb(m)) FROM inventory.movements m
    UNION ALL SELECT inventory.logical_cost('operation',to_jsonb(o)) FROM inventory.operations o
    UNION ALL SELECT inventory.logical_cost('audit',to_jsonb(a)) FROM inventory.audit a
    UNION ALL SELECT inventory.logical_cost('quota',to_jsonb(q)) FROM inventory.quota_state q
    UNION ALL SELECT inventory.logical_cost('fence',to_jsonb(f)) FROM inventory.writer_fence f) rows $$;

CREATE FUNCTION inventory.operation_result(p_operation uuid,p_actor uuid,p_action text,p_epoch bigint)
RETURNS TABLE(result jsonb,logical_delta bigint,replay boolean,result_hash text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,inventory,catalog AS $$
DECLARE op inventory.operations%ROWTYPE; au inventory.audit%ROWTYPE; delta bigint;
BEGIN
  SELECT * INTO op FROM inventory.operations WHERE id=p_operation;
  IF NOT FOUND THEN RETURN; END IF;
  IF op.actor_id<>p_actor OR op.action<>p_action OR op.data_epoch<>p_epoch THEN RAISE EXCEPTION 'OPERATION_ACCESS_DENIED'; END IF;
  SELECT * INTO au FROM inventory.audit WHERE operation_id=p_operation;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPERATION_INTEGRITY_UNPROVEN'; END IF;
  delta:=inventory.logical_cost('operation',to_jsonb(op))+inventory.logical_cost('audit',to_jsonb(au));
  IF op.status='CONFIRMED' AND op.action='catalog.create' THEN
    SELECT delta+inventory.logical_cost('product',to_jsonb(p))+inventory.logical_cost('balance',to_jsonb(b)) INTO delta
      FROM catalog.products p JOIN inventory.balances b ON b.product_id=p.id WHERE p.id=au.product_id;
  ELSIF op.status='CONFIRMED' THEN
    SELECT delta+inventory.logical_cost('movement',to_jsonb(m)) INTO delta FROM inventory.movements m WHERE m.operation_id=p_operation;
  END IF;
  IF delta IS NULL OR au.result_hash<>encode(sha256(convert_to(op.result::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'OPERATION_INTEGRITY_UNPROVEN'; END IF;
  RETURN QUERY SELECT op.result,delta,true,au.result_hash;
END $$;

-- Internal shared implementation. Never EXECUTE-granted to a LOGIN role.
CREATE FUNCTION inventory.apply_write(p_action text,p_operation uuid,p_preimage text,p_hash text,p_generation uuid,p_epoch bigint,p_writer_version bigint)
RETURNS TABLE(result jsonb,logical_delta bigint,replay boolean,result_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,inventory,catalog AS $$
DECLARE doc jsonb; actor uuid; tenant uuid; product uuid; sku text; pname text; quantity bigint; reason text;
  fence inventory.writer_fence%ROWTYPE; quota inventory.quota_state%ROWTYPE; op inventory.operations%ROWTYPE;
  movement uuid; stamp timestamptz:=clock_timestamp(); balance inventory.balances%ROWTYPE;
  output jsonb; before_cost bigint; delta bigint; rejection text; added boolean; rhash text;
BEGIN
  IF p_operation IS NULL OR p_generation IS NULL OR p_epoch IS NULL OR p_writer_version IS NULL OR p_preimage IS NULL
    OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR octet_length(convert_to(p_preimage,'UTF8'))>8192
    OR p_hash<>encode(sha256(convert_to(p_preimage,'UTF8')),'hex')
  THEN RAISE EXCEPTION 'CANONICAL_INPUT_INVALID'; END IF;
  BEGIN doc:=p_preimage::jsonb; EXCEPTION WHEN invalid_text_representation OR untranslatable_character THEN RAISE EXCEPTION 'CANONICAL_INPUT_INVALID'; END;
  IF jsonb_typeof(doc)<>'array' OR jsonb_array_length(doc)<>7 OR doc->>0<>'mecanet-write-v1'
    OR doc->>3<>p_action OR jsonb_typeof(doc->6)<>'array' OR jsonb_array_length(doc->6)<>2
    OR doc->>4<>p_epoch::text OR doc->>1 !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR doc->>2 !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(doc) WITH ORDINALITY x(value,n) WHERE n IN(1,2,3,4,5) AND jsonb_typeof(value)<>'string')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(doc->6) x(value) WHERE jsonb_typeof(value)<>'string')
  THEN RAISE EXCEPTION 'CANONICAL_INPUT_INVALID'; END IF;
  tenant:=(doc->>1)::uuid;actor:=(doc->>2)::uuid;
  IF p_action='catalog.create' THEN
    IF doc->5<>'null'::jsonb THEN RAISE EXCEPTION 'CANONICAL_INPUT_INVALID'; END IF;
    sku:=doc->6->>0;pname:=doc->6->>1;
    IF sku !~ '^[A-Z0-9][A-Z0-9._-]{0,63}$' OR char_length(pname) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'CANONICAL_INPUT_INVALID'; END IF;
  ELSE
    IF jsonb_typeof(doc->5)<>'string' OR doc->>5 !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR doc->6->>0 !~ '^[1-9][0-9]{0,6}$' OR char_length(doc->6->>1) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'CANONICAL_INPUT_INVALID'; END IF;
    product:=(doc->>5)::uuid;quantity:=(doc->6->>0)::bigint;reason:=doc->6->>1;
    IF quantity>1000000 THEN RAISE EXCEPTION 'CANONICAL_INPUT_INVALID'; END IF;
  END IF;
  -- The SHARE lock is kept by the transaction through COMMIT. A restrictive
  -- UPDATE proves the close only after all preceding SHARE holders settle.
  SELECT * INTO fence FROM inventory.writer_fence WHERE id=1 FOR SHARE;
  IF NOT FOUND OR fence.state<>'OPEN' OR fence.tenant_id<>tenant OR fence.generation<>p_generation
    OR fence.data_epoch<>p_epoch OR fence.writer_version<>p_writer_version THEN RAISE EXCEPTION 'WRITER_FENCE_CLOSED'; END IF;
  SELECT * INTO quota FROM inventory.quota_state WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WRITER_POLICY_UNAVAILABLE'; END IF;
  -- Reserve the operation key via UNIQUE, not SELECT then INSERT. Its temporary
  -- rejected result is invisible outside this transaction and cannot survive an
  -- exception. Every successful return adds its matching immutable audit.
  output:=jsonb_build_object('operationId',p_operation::text,'state','REJECTED','code','NOT_EXECUTED','dataEpoch',p_epoch::text);
  INSERT INTO inventory.operations(id,idempotency_key,actor_id,action,data_epoch,request_hash,status,result,created_at)
    VALUES(p_operation,p_operation,actor,p_action,p_epoch,p_hash,'REJECTED',output,stamp)
    ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO op.id;
  added:=FOUND;
  IF NOT added THEN
    SELECT * INTO op FROM inventory.operations WHERE idempotency_key=p_operation;
    IF op.actor_id<>actor OR op.action<>p_action OR op.data_epoch<>p_epoch OR op.request_hash<>p_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN QUERY SELECT r.result,r.logical_delta,true,r.result_hash FROM inventory.operation_result(p_operation,actor,p_action,p_epoch) r;
    RETURN;
  END IF;
  before_cost:=quota.logical_bytes;
  IF before_cost<>inventory.logical_usage()-inventory.logical_cost('operation',(SELECT to_jsonb(o) FROM inventory.operations o WHERE o.id=p_operation))
    THEN RAISE EXCEPTION 'LOGICAL_COUNTER_INCONSISTENT'; END IF;
  IF p_action='catalog.create' THEN
    IF quota.active_products>=quota.max_products THEN rejection:='PRODUCT_LIMIT';
    ELSE
      product:=gen_random_uuid();
      INSERT INTO catalog.products(id,sku,name,status,version,created_at,created_by)
        VALUES(product,sku,pname,'active',1,stamp,actor) ON CONFLICT(sku) DO NOTHING;
      IF NOT FOUND THEN product:=NULL;rejection:='SKU_CONFLICT';
      ELSE
        INSERT INTO inventory.balances(product_id,on_hand,version) VALUES(product,0,1);
        balance.on_hand:=0;balance.version:=1;
        UPDATE inventory.quota_state SET active_products=active_products+1 WHERE id=1;
      END IF;
    END IF;
  ELSE
    SELECT * INTO balance FROM inventory.balances WHERE product_id=product FOR UPDATE;
    IF NOT FOUND THEN product:=NULL;rejection:='PRODUCT_NOT_FOUND';
    ELSIF balance.on_hand>9223372036854775807::bigint-quantity OR balance.version=9223372036854775807::bigint THEN rejection:='STOCK_OVERFLOW';
    ELSE
      UPDATE inventory.balances SET on_hand=on_hand+quantity,version=version+1 WHERE product_id=product RETURNING * INTO balance;
      movement:=gen_random_uuid();
      INSERT INTO inventory.movements(id,product_id,operation_id,type,quantity,on_hand_after,balance_version,reason,actor_id,recorded_at)
        VALUES(movement,product,p_operation,'RECEIPT',quantity,balance.on_hand,balance.version,reason,actor,stamp);
    END IF;
  END IF;
  IF rejection IS NULL THEN
    output:=jsonb_build_object('operationId',p_operation::text,'state','CONFIRMED','productId',product::text,'movementId',movement,
      'onHand',balance.on_hand::text,'balanceVersion',balance.version::text,'dataEpoch',p_epoch::text);
  ELSE output:=jsonb_build_object('operationId',p_operation::text,'state','REJECTED','code',rejection,'dataEpoch',p_epoch::text); END IF;
  UPDATE inventory.operations SET status=output->>'state',result=output WHERE id=p_operation;
  rhash:=encode(sha256(convert_to(output::text,'UTF8')),'hex');
  INSERT INTO inventory.audit(operation_id,actor_id,action,product_id,movement_id,recorded_at,result_hash)
    VALUES(p_operation,actor,p_action,product,movement,stamp,rhash);
  delta:=inventory.logical_usage()-before_cost;
  IF delta<0 OR delta>32768 OR before_cost>quota.max_logical_bytes-delta THEN RAISE EXCEPTION 'LOGICAL_QUOTA'; END IF;
  UPDATE inventory.quota_state SET logical_bytes=logical_bytes+delta WHERE id=1;
  IF (SELECT logical_bytes FROM inventory.quota_state WHERE id=1)<>inventory.logical_usage() THEN RAISE EXCEPTION 'LOGICAL_COUNTER_INCONSISTENT'; END IF;
  RETURN QUERY SELECT output,delta,false,rhash;
END $$;
CREATE FUNCTION inventory.create_product(p_operation uuid,p_preimage text,p_hash text,p_generation uuid,p_epoch bigint,p_writer_version bigint)
RETURNS TABLE(result jsonb,logical_delta bigint,replay boolean,result_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,inventory AS $$
  SELECT * FROM inventory.apply_write('catalog.create',p_operation,p_preimage,p_hash,p_generation,p_epoch,p_writer_version) $$;
CREATE FUNCTION inventory.receive_stock(p_operation uuid,p_preimage text,p_hash text,p_generation uuid,p_epoch bigint,p_writer_version bigint)
RETURNS TABLE(result jsonb,logical_delta bigint,replay boolean,result_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,inventory AS $$
  SELECT * FROM inventory.apply_write('inventory.receive',p_operation,p_preimage,p_hash,p_generation,p_epoch,p_writer_version) $$;

CREATE FUNCTION inventory.close_writer_fence(p_generation uuid,p_epoch bigint,p_expected bigint,p_closed bigint)
RETURNS SETOF inventory.writer_fence LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,inventory AS $$
DECLARE f inventory.writer_fence%ROWTYPE;
BEGIN
  SELECT * INTO f FROM inventory.writer_fence WHERE id=1 FOR UPDATE;
  IF f.generation<>p_generation OR f.data_epoch<>p_epoch OR p_closed<>p_expected+1
    OR NOT ((f.state='OPEN' AND f.writer_version=p_expected) OR (f.state='CLOSED' AND f.writer_version=p_closed))
  THEN RAISE EXCEPTION 'WRITER_VERSION_CONFLICT'; END IF;
  UPDATE inventory.writer_fence SET state='CLOSED',writer_version=p_closed WHERE id=1;
  RETURN QUERY SELECT * FROM inventory.writer_fence WHERE id=1;
END $$;
CREATE FUNCTION inventory.observe_writer_fence() RETURNS SETOF inventory.writer_fence
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,inventory AS $$
  SELECT * FROM inventory.writer_fence WHERE id=1 FOR SHARE $$;
CREATE FUNCTION inventory.open_writer_fence(p_generation uuid,p_epoch bigint,p_expected bigint,p_open bigint)
RETURNS SETOF inventory.writer_fence LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,inventory AS $$
DECLARE f inventory.writer_fence%ROWTYPE;
BEGIN
  SELECT * INTO f FROM inventory.writer_fence WHERE id=1 FOR UPDATE;
  IF f.generation<>p_generation OR f.data_epoch<>p_epoch OR p_open<>p_expected+1
    OR NOT ((f.state='CLOSED' AND f.writer_version=p_expected) OR (f.state='OPEN' AND f.writer_version=p_open))
  THEN RAISE EXCEPTION 'WRITER_VERSION_CONFLICT'; END IF;
  UPDATE inventory.writer_fence SET state='OPEN',writer_version=p_open WHERE id=1;
  RETURN QUERY SELECT * FROM inventory.writer_fence WHERE id=1;
END $$;
CREATE FUNCTION inventory.set_writer_policy(p_expected bigint,p_version bigint,p_products bigint,p_bytes bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,inventory AS $$
BEGIN
  PERFORM 1 FROM inventory.writer_fence WHERE id=1 AND state='CLOSED' FOR UPDATE;
  IF NOT FOUND OR p_products<0 OR p_bytes<0 OR p_version<>p_expected+1 THEN RAISE EXCEPTION 'WRITER_POLICY_CONFLICT'; END IF;
  UPDATE inventory.quota_state SET policy_version=p_version,max_products=p_products,max_logical_bytes=p_bytes
    WHERE id=1 AND policy_version=p_expected;
  IF NOT FOUND THEN RAISE EXCEPTION 'WRITER_POLICY_CONFLICT'; END IF;
  RETURN true;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA inventory FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA inventory FROM PUBLIC;
-- The private preparer grants only the two writer functions and operation_result
-- to each DB's writer; fence/policy functions exclusively to its maintainer.
