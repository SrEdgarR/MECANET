-- Corrective version 4: remove the PL/pgSQL SKU variable/column ambiguity.
-- Existing version 3 remains immutable; owner, signature and grants are preserved.
CREATE OR REPLACE FUNCTION inventory.apply_write(p_action text,p_operation uuid,p_preimage text,p_hash text,p_generation uuid,p_epoch bigint,p_writer_version bigint)
RETURNS TABLE(result jsonb,logical_delta bigint,replay boolean,result_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,inventory,catalog AS $$
DECLARE doc jsonb; actor uuid; tenant uuid; product uuid; v_sku text; pname text; quantity bigint; reason text;
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
    v_sku:=doc->6->>0;pname:=doc->6->>1;
    IF v_sku !~ '^[A-Z0-9][A-Z0-9._-]{0,63}$' OR char_length(pname) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'CANONICAL_INPUT_INVALID'; END IF;
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
        VALUES(product,v_sku,pname,'active',1,stamp,actor) ON CONFLICT(sku) DO NOTHING;
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
