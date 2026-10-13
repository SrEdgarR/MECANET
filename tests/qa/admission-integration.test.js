// Requires exclusive prepared QA and its private clock worker. No .env or defaults to real DB.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createPgPool } from '../../server/saas/db/pools.js';
import { createAdmission } from '../../server/saas/admission/index.js';
import { createPolicyAdmin } from '../../server/saas/admission/policy-admin.js';
import { createReconciler } from '../../server/saas/admission/maintenance.js';

const path = process.env.MECANET_QA_CONNECTIONS ?? '/run/qa-secrets/connections.json';
if (!path.startsWith('/run/qa-secrets/')) throw new Error('QA_PRIVATE_CONNECTIONS_PATH_REQUIRED');
const qa = JSON.parse(await readFile(path, 'utf8'));
const tenant = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const pools = [];
async function role(name, max = 1) {
  const pool = await createPgPool({ ...qa.connections[name], max, connectionTimeoutMillis: 2000, statement_timeout: 2000, application_name: 'mecanet-admission-integration' });
  pools.push(pool); return pool;
}
let pool1, pool2, policyPool, reconcilerPool, one, two;
async function progress() {
  for (let i = 0; i < 20; i++) { await Promise.all([one.observeClock(), two.observeClock()]); if (one.ready() && two.ready()) return; await delay(110); }
  throw new Error('QA_CLOCK_NOT_PROGRESSING');
}
async function done(service, id) { await service.finish(id, { sqlSettled: true, responseSettled: true }); }
async function count(scope, field) {
  assert.ok(['qh','qc','qt'].includes(field));
  return Number((await pool1.query(`SELECT coalesce(sum(${field}),0)::bigint AS n FROM saas.windows WHERE scope_key=$1`, [scope])).rows[0].n);
}
before(async () => {
  assert.ok(qa.generation, 'private generation metadata required');
  pool1 = await role('saas_api', 2); pool2 = await role('saas_api', 2); policyPool = await role('saas_policy'); reconcilerPool = await role('saas_reconciler');
  one = createAdmission({ pool: pool1, owner: randomUUID(), generation: qa.generation });
  two = createAdmission({ pool: pool2, owner: randomUUID(), generation: qa.generation });
  await progress();
});
after(async () => { await Promise.all(pools.map(pool => pool.end())); });

test('API cannot advance time, replace generation, change policy or lift barrier', async () => {
  for (const sql of ['UPDATE saas.time_authority SET tick=tick+1', 'UPDATE saas.admission_fence SET tick=tick+1', 'UPDATE saas.admission_fence SET clock_version=clock_version+1', 'UPDATE saas.admission_fence SET barrier=false', "UPDATE saas.policies SET limits='{}'::jsonb"]) await assert.rejects(pool1.query(sql), { code: '42501' });
});

test('old SERIALIZABLE snapshot cannot admit after a physically committed clock advance', async () => {
  const client = await pool1.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    const previous = (await client.query('SELECT tick FROM saas.admission_fence WHERE id=1')).rows[0].tick;
    let current = previous;
    for (let i = 0; i < 20 && current === previous; i++) { await delay(50); current = (await pool2.query('SELECT tick FROM saas.admission_fence WHERE id=1')).rows[0].tick; }
    assert.notEqual(current, previous);
    await assert.rejects(client.query('UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1'), { code: '40001' });
  } finally { await client.query('ROLLBACK'); client.release(); }
});

test('two independent API owners share the final ordinary slot and FIFO without duplicate HTTP charge', async () => {
  await progress();
  const before = await count(`tenant:${tenant}`, 'qh');
  const [a,b] = await Promise.all([one.admit({ tenantId: tenant, reserveBytes: 256 }), two.admit({ tenantId: tenant, reserveBytes: 256 })]);
  const [ca,cb] = await Promise.all([one.claim(a.id, { revalidate: async () => {} }), two.claim(b.id, { revalidate: async () => {} })]);
  assert.equal(Number(ca.claimed) + Number(cb.claimed), 1);
  const active = ca.claimed ? [one,a] : [two,b]; const waiting = ca.claimed ? [two,b] : [one,a];
  await active[0].startWork(active[1].id);
  await assert.rejects(active[0].startWork(active[1].id), { code: 'WORK_ALREADY_STARTED' });
  await active[0].consumeBytes(active[1].id, 37); await done(...active.map((x,i) => i ? x.id : x));
  await progress(); const claim = await waiting[0].claim(waiting[1].id, { revalidate: async () => {} }); assert.equal(claim.claimed, true);
  await waiting[0].startWork(waiting[1].id); await done(waiting[0], waiting[1].id);
  assert.equal(await count(`tenant:${tenant}`, 'qh') - before, 2);
});

test('fresh authority rejection during claim never runs work and waiting can be rejected safely', async () => {
  await progress(); const ticket = await one.admit({ tenantId: tenant, reserveBytes: 64 });
  await assert.rejects(one.claim(ticket.id, { revalidate: async () => { throw Object.assign(new Error('revoked'), { status: 403 }); } }), { status: 403 });
  assert.equal((await one.lookup(ticket.id)).state, 'WAITING'); await done(one, ticket.id);
});

test('HTTP retry and polling count new HTTP admissions, jobs consume work without fictitious HTTP', async () => {
  await progress(); const scope = `tenant:${other}`; const qh = await count(scope, 'qh'); const qc = await count(scope, 'qc');
  for (const kind of ['HTTP','HTTP','JOB']) {
    const ticket = await two.admit({ tenantId: other, kind, reserveBytes: 64 });
    assert.equal((await two.claim(ticket.id, { revalidate: async () => {} })).claimed, true);
    await two.startWork(ticket.id); await done(two, ticket.id);
  }
  assert.equal(await count(scope,'qh') - qh, 2); assert.equal(await count(scope,'qc') - qc, 3);
});

test('auth and operator use finite separate envelopes without a forged tenant', async () => {
  await progress(); const before = await count('global','qh');
  for (const lane of ['auth','operator']) {
    const ticket = await one.admit({ tenantId: null, lane, reserveBytes: 256 });
    assert.equal((await one.claim(ticket.id, { revalidate: async () => {} })).claimed, true);
    await one.startWork(ticket.id); await done(one,ticket.id);
  }
  assert.equal(await count('global','qh'), before);
  await assert.rejects(one.admit({ tenantId: tenant, lane: 'auth', reserveBytes: 64 }), TypeError);
});

test('policy CAS and audit commit atomically; duplicate mismatch and usage-only operator denied', async () => {
  const actor = { id: '44444444-4444-4444-8444-444444444444' };
  const admin = createPolicyAdmin({ pool: policyPool, generation: qa.generation, authorize: async (_actor, action) => { assert.equal(action,'quota.change'); } });
  const version = Number((await pool1.query('SELECT version FROM saas.policies WHERE scope_key=$1', [`tenant:${tenant}`])).rows[0].version);
  const request = { actor, tenantId: tenant, expectedVersion: version, requestId: randomUUID(), fields: { qh60: 120, active: 2 }, durationSeconds: 86400, reason: 'QA synthetic CAS, no commercial change' };
  const result = await admin.change(request); assert.equal(result.version, version+1);
  assert.equal((await admin.change(request)).repeated, true);
  await assert.rejects(admin.change({ ...request, reason: 'different request' }), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(admin.change({ ...request, requestId: randomUUID() }), { code: 'POLICY_VERSION_CONFLICT' });
  const audit = (await policyPool.query('SELECT version,after_limits FROM saas.policy_audit WHERE request_id=$1',[request.requestId])).rows[0];
  assert.equal(Number(audit.version),version+1); assert.equal(audit.after_limits.qh60,120);
  const reader = createPolicyAdmin({ pool: pool1, generation: qa.generation, authorize: async () => { throw Object.assign(new Error('forbidden'),{status:403}); } });
  await assert.rejects(reader.change(request),{status:403});
});

test('uncertain work retains its reservation and never releases from heartbeat expiry', async () => {
  await progress(); const ticket = await two.admit({ tenantId: other, reserveBytes: 512 });
  assert.equal((await two.claim(ticket.id,{revalidate:async()=>{}})).claimed,true);
  await two.startWork(ticket.id);
  const denied = createReconciler({pool:reconcilerPool,generation:qa.generation,verifyRunnerStopped:async()=>({runnerStopped:false})});
  await pool2.query("UPDATE saas.tickets SET heartbeat_at=clock_timestamp()-interval '16 seconds' WHERE id=$1",[ticket.id]);
  assert.ok((await denied.detectAbandoned()).includes(ticket.id));
  await assert.rejects(two.finish(ticket.id,{sqlSettled:true,responseSettled:true}),{code:'RECONCILIATION_REQUIRED'});
  const row = (await pool2.query('SELECT state,reserved_qt FROM saas.tickets WHERE id=$1',[ticket.id])).rows[0];
  assert.equal(row.state,'UNCERTAIN'); assert.equal(Number(row.reserved_qt),512);
  const next = await one.admit({tenantId:other,reserveBytes:64});
  assert.equal((await one.claim(next.id,{revalidate:async()=>{}})).claimed,false); await done(one,next.id);
  await assert.rejects(denied.reconcile(ticket.id),{code:'END_NOT_PROVEN'});
  // This test deliberately never created a tenant SQL/business runner or response.
  // Real process-death proof belongs to the deployed adapter, not to this callback test.
  const known = createReconciler({pool:reconcilerPool,generation:qa.generation,verifyRunnerStopped:async()=>({runnerStopped:true,sqlSettled:true,responseSettled:true,reference:`synthetic-no-runner:${ticket.id}`})});
  assert.equal((await known.reconcile(ticket.id)).state,'FINISHED');
  assert.equal((await reconcilerPool.query('SELECT reference FROM saas.reconciliation_audit WHERE ticket_id=$1',[ticket.id])).rowCount,1);
});

test('real SQL COMMIT with lost client acknowledgement leaves one ticket and no blind retry',async()=>{
  let drop=true;
  const ambiguousPool={query:(...args)=>pool1.query(...args),async connect(){const client=await pool1.connect();return{release:(...args)=>client.release(...args),async query(sql,values){const result=await client.query(sql,values);if(sql==='COMMIT'&&drop){drop=false;throw new Error('injected post-COMMIT acknowledgement loss');}return result;}};}};
  const service=createAdmission({pool:ambiguousPool,owner:randomUUID(),generation:qa.generation});
  await service.observeClock();await delay(150);await service.observeClock();
  const before=await count(`tenant:${other}`,'qh');let uncertain;
  try{await service.admit({tenantId:other,reserveBytes:64});assert.fail('must expose uncertainty');}catch(error){assert.equal(error.code,'COMMIT_UNCERTAIN');uncertain=error;}
  assert.ok(uncertain.ticketId);assert.equal((await service.lookup(uncertain.ticketId)).state,'WAITING');
  assert.equal(await count(`tenant:${other}`,'qh')-before,1);
  await done(service,uncertain.ticketId);
});

test('override expiry versions the base policy while preserving usage and live history',async()=>{
  const scope=`tenant:${tenant}`;
  const before=await count(scope,'qh');
  const version=Number((await policyPool.query('SELECT version FROM saas.policies WHERE scope_key=$1',[scope])).rows[0].version);
  await policyPool.query("UPDATE saas.policies SET override_expires_at=clock_timestamp()-interval '1 second' WHERE scope_key=$1 OR scope_key=$2",[scope,`${scope}:ordinary`]);
  const admin=createPolicyAdmin({pool:policyPool,generation:qa.generation,authorize:async()=>{}});
  const result=await admin.expireOverrides({maintenanceActorId:'44444444-4444-4444-8444-444444444444'});
  assert.equal(result.tenantId,tenant);assert.equal(result.version,version+1);assert.equal(await count(scope,'qh'),before);
  const current=(await policyPool.query('SELECT limits,base_limits,override_expires_at FROM saas.policies WHERE scope_key=$1',[scope])).rows[0];
  assert.deepEqual(current.limits,current.base_limits);assert.equal(current.override_expires_at,null);
});

test('quota reduction reuses the same live window and rejects at the reduced HTTP ceiling',async()=>{
  const actor={id:'44444444-4444-4444-8444-444444444444'};
  const admin=createPolicyAdmin({pool:policyPool,generation:qa.generation,authorize:async()=>{}});
  const scope=`tenant:${tenant}`;
  const priorOrdinary=(await pool1.query('SELECT coalesce(sum(w.qh),0)::int AS n FROM saas.windows w CROSS JOIN saas.admission_fence f WHERE f.id=1 AND w.scope_key=$1 AND w.tick>f.tick-601',[`${scope}:ordinary`])).rows[0].n;
  const version=Number((await policyPool.query('SELECT version FROM saas.policies WHERE scope_key=$1',[scope])).rows[0].version);
  await admin.change({actor,tenantId:tenant,expectedVersion:version,requestId:randomUUID(),fields:{qh60:24},durationSeconds:86400,reason:'QA reduced HTTP window'});
  try{
    let denied=false;
    for(let i=0;i<13;i++){
      await progress();
      try{const ticket=await one.admit({tenantId:tenant,reserveBytes:64});await done(one,ticket.id);}
      catch(error){assert.equal(error.code,'TENANT_QUOTA');denied=true;break;}
    }
    assert.equal(denied,true);
    const ordinary=(await pool1.query('SELECT coalesce(sum(w.qh),0)::int AS n FROM saas.windows w CROSS JOIN saas.admission_fence f WHERE f.id=1 AND w.scope_key=$1 AND w.tick>f.tick-601',[`${scope}:ordinary`])).rows[0].n;
    assert.ok(ordinary<=Math.max(priorOrdinary,12),'no new capacity above reduced ceiling or pre-existing debt');
  }finally{
    await policyPool.query("UPDATE saas.policies SET override_expires_at=clock_timestamp()-interval '1 second' WHERE scope_key=$1 OR scope_key=$2",[scope,`${scope}:ordinary`]);
    await admin.expireOverrides({maintenanceActorId:actor.id});
  }
});

test('expired waiting ticket has no work, returns reserves, and never refunds an admitted HTTP attempt',async()=>{
  await progress();const before=await count(`tenant:${other}`,'qh');const ticket=await one.admit({tenantId:other,reserveBytes:64});
  await pool1.query("UPDATE saas.tickets SET queue_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[ticket.id]);
  const claim=await one.claim(ticket.id,{revalidate:async()=>{}});assert.equal(claim.state,'EXPIRED');assert.equal(claim.claimed,false);
  const row=(await pool1.query('SELECT reserved_qc,reserved_qt,work_started FROM saas.tickets WHERE id=$1',[ticket.id])).rows[0];
  assert.equal(Number(row.reserved_qc),0);assert.equal(Number(row.reserved_qt),0);assert.equal(row.work_started,false);
  assert.equal(await count(`tenant:${other}`,'qh')-before,1);
});
