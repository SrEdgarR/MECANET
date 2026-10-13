// Real PostgreSQL only. No .env, fixtures do not stand in for locks/COMMIT/grants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { createPgPool } from '../../../server/saas/db/pools.js';
import { createQaClient,assertStatus } from '../cp014/http-client.mjs';
import { withQaInspection } from './sql-live.mjs';
import {assertSqlDenied} from './quota-live.mjs';
import {extensionDenialSql,sqlCreateVector} from './sql-vectors.mjs';
const file = process.env.MECANET_QA_CONNECTIONS ?? '/run/qa-secrets/connections.json';
if (!file.startsWith('/run/qa-secrets/')) throw new Error('PRIVATE_QA_CONNECTIONS_REQUIRED');
const qa = JSON.parse(await readFile(file, 'utf8'));
const tenant = '11111111-1111-4111-8111-111111111111';
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const role = 'saas_writer_a';
async function withRole(name, fn, extra = {}) {
  const pool = await createPgPool({ ...qa.connections[name], ...extra, max: 1, statement_timeout: 3000, connectionTimeoutMillis: 2000 });
  try { return await fn(pool); } finally { await pool.end(); }
}
const matrix = (action, product, values, epoch = '2') => JSON.stringify(['mecanet-write-v1', tenant, actor, action, epoch, product, values]);
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function httpPair(){
  const login=JSON.parse(await readFile('/run/qa-secrets/fixture-login.json','utf8'));
  const ca=await readFile('/run/qa-ca.crt');
  const first=createQaClient({instance:'api1',purpose:'company',ca,login:{email:'a@qa.invalid',password:login.password},budget:24});
  await first.login();
  const second=createQaClient({instance:'api2',purpose:'company',ca,budget:24});second.setCookies(first.cookieHeader());second.csrf=first.csrf;
  return[first,second];
}
async function post(client,action,operation,input,guards,product=null){
  const path=action==='catalog.create'?`/api/tenants/${tenant}/products`:`/api/tenants/${tenant}/products/${product}/stock-receipts`;
  const reply=await client.request(path,{method:'POST',body:input,headers:{'Idempotency-Key':operation,'X-Data-Epoch':String(guards.data_epoch)}});
  assertStatus(reply,201);return reply.json.result??reply.json;
}
async function effect(pool, kind, operation, preimage, guards) {
  return (await pool.query(`SELECT * FROM inventory.${kind}($1,$2,$3,$4,$5,$6)`, [operation, preimage, hash(preimage), guards.generation, guards.data_epoch, guards.writer_version])).rows[0];
}
test('writer has no free DML, DDL, fence mutation, role elevation or foreign connection', async () => {
  const denied = [['DML_BALANCE','UPDATE inventory.balances SET on_hand=0'],['DELETE_MOVEMENT','DELETE FROM inventory.movements'],['FENCE_UPDATE','UPDATE inventory.writer_fence SET state=\'OPEN\''],['DDL','CREATE TABLE catalog.forged(id int)'],['ROLE_ELEVATION','SET ROLE saas_owner_a'],['EXTENSION',extensionDenialSql]];
  for (const [label,sql] of denied) await withRole(role,pool=>assertSqlDenied(()=>pool.query(sql),['42501','25006'],label));
  for (const [label,database] of [['FOREIGN_B','mecanet_tenant_b'],['FOREIGN_CONTROL','mecanet_control'],['FOREIGN_ADMIN','postgres']]) await assertSqlDenied(()=>withRole(role,pool=>pool.query('SELECT 1'),{database}),['42501','28000'],label);
  await withRole('saas_tenant_a',pool=>assertSqlDenied(()=>pool.query('SELECT * FROM inventory.create_product($1,$2,$3,$4,2,1)',[randomUUID(),matrix('catalog.create',null,['FORGED','forged']),'0'.repeat(64),qa.generation]),['42501'],'READER_WRITER_FUNCTION'));
});
test('SQL validates the same exact canonical UTF8 digest and derives the effect from it', async () => {
  await withQaInspection(qa,'mecanet_tenant_a', async maintenance => {
    const guard = (await maintenance.query('SELECT * FROM inventory.writer_fence WHERE id=1')).rows[0];
    await withRole(role, async writer => {
      const op = randomUUID(),vector=sqlCreateVector({tenantId:tenant,actorId:actor,operationId:op,dataEpoch:String(guard.data_epoch)}),text=vector.preimage;
      const [client]=await httpPair();await post(client,'catalog.create',op,vector.input,guard);
      const row = await effect(writer,'create_product',op,text,guard);
      assert.equal(row.result.state,'CONFIRMED'); assert.equal(row.replay,true); assert.ok(BigInt(row.logical_delta)>0n);
      const again = await effect(writer,'create_product',op,text,guard); assert.equal(again.replay,true); assert.deepEqual(again.result,row.result); assert.equal(again.logical_delta,row.logical_delta);
      await assert.rejects(effect(writer,'create_product',op,matrix('catalog.create',null,[vector.input.sku,'changed'],String(guard.data_epoch)),guard), error => error.message.includes('IDEMPOTENCY_CONFLICT'));
      await assert.rejects(writer.query('SELECT * FROM inventory.create_product($1,$2,$3,$4,$5,$6)', [randomUUID(),text,'0'.repeat(64),guard.generation,guard.data_epoch,guard.writer_version]), error => error.message.includes('CANONICAL_INPUT_INVALID'));
      const count = (await maintenance.query('SELECT count(*)::int AS n FROM inventory.audit WHERE operation_id=$1',[op])).rows[0]; assert.equal(count.n,1);
    });
  });
});
test('concurrent receipts add once each, replay cannot change product and used is the real logical sum', async () => {
  await withQaInspection(qa,'mecanet_tenant_a', async maintenance => {
    const guard = (await maintenance.query('SELECT * FROM inventory.writer_fence WHERE id=1')).rows[0];
    const [first,second]=await httpPair();
    const createId = randomUUID(); const creation = await post(first,'catalog.create',createId,{sku:`SUM-${createId.slice(0,8)}`,name:'sum fixture'},guard);
    const product = creation.productId; const op1=randomUUID(),op2=randomUUID();
    const a=matrix('inventory.receive',product,['7','first'],String(guard.data_epoch)),b=matrix('inventory.receive',product,['11','second'],String(guard.data_epoch));
    await Promise.all([post(first,'inventory.receive',op1,{quantity:'7',reason:'first'},guard,product),post(second,'inventory.receive',op2,{quantity:'11',reason:'second'},guard,product)]);
    const balance=(await maintenance.query('SELECT on_hand::text AS n FROM inventory.balances WHERE product_id=$1',[product])).rows[0]; assert.equal(balance.n,'18');
    await withRole(role, async pool => {
      assert.equal((await effect(pool,'receive_stock',op1,a,guard)).replay,true);
      await assert.rejects(effect(pool,'receive_stock',op1,matrix('inventory.receive',randomUUID(),['7','first'],String(guard.data_epoch)),guard),error=>error.message.includes('IDEMPOTENCY_CONFLICT'));
      await assert.rejects(pool.query('SELECT * FROM inventory.operation_result($1,$2,$3,$4)',[op1,randomUUID(),'inventory.receive',guard.data_epoch]),error=>error.message.includes('OPERATION_ACCESS_DENIED'));
    });
    const checks=(await maintenance.query('SELECT (SELECT logical_bytes FROM inventory.quota_state WHERE id=1)::text AS counted,inventory.logical_usage()::text AS actual,(SELECT count(*) FROM inventory.movements WHERE product_id=$1)::int AS movements',[product])).rows[0];
    assert.equal(checks.counted,checks.actual); assert.equal(checks.movements,2);
  });
});
