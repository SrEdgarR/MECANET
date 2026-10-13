// PRIVATE CP-014. Two real Express processes, standard signed cookies and PostgreSQL.
// Run only in the own probe service; never loads .env or a production destination.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createPgPool } from '../../../server/saas/db/pools.js';
import { createReconciler } from '../../../server/saas/admission/maintenance.js';
import { createQaClient, assertStatus } from './http-client.mjs';
import { arm, waitEvent, release } from './faults.mjs';

const project = 'mecanet-qa-p1l1-cp014';
if (process.env.QA_PROJECT !== project) throw new Error('CP014_EXCLUSIVE_PROJECT_REQUIRED');
const phases = new Set(['last-cup', 'timeout', 'lost-response', 'reconcile', 'post-api-restart', 'pre-worker-transfer', 'post-worker-transfer', 'costs']);
const phase = process.argv[2]; if (!phases.has(phase)) throw new Error('CP014_ADMISSION_PHASE_REQUIRED');
let stage = `${phase}.setup`;
const statePath = '/run/qa-results/admission-state.json';
const qa = JSON.parse(await readFile('/run/qa-secrets/connections.json', 'utf8'));
const loginFixture = JSON.parse(await readFile('/run/qa-secrets/fixture-login.json', 'utf8'));
const ca = await readFile('/run/qa-ca.crt');
const tenantA = '11111111-1111-4111-8111-111111111111', tenantB = '22222222-2222-4222-8222-222222222222';
let state;
try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; state = { project, generation: qa.generation, passes: [], uncertain: [] }; }
assert.equal(state.project, project); assert.equal(state.generation, qa.generation);
const opened = [];
async function role(name) {
  const connection = qa.connections[name]; assert.equal(connection.host, 'postgres'); assert.equal(connection.database, 'mecanet_control'); assert.equal(connection.user, name);
  const pool = await createPgPool({ ...connection, max: 1, connectionTimeoutMillis: 2000, statement_timeout: 2000, application_name: `mecanet-cp014-admission-${name}` });
  opened.push(pool); return pool;
}
const reader = await role('saas_api');
function scopes(tenantId) { return ['global', 'lane:ordinary', `tenant:${tenantId}`, `tenant:${tenantId}:ordinary`]; }
async function ledger(tenantId, sinceTick) {
  const rows = (await reader.query('SELECT scope_key,coalesce(sum(qh),0)::bigint qh,coalesce(sum(qc),0)::bigint qc,coalesce(sum(qt),0)::bigint qt FROM saas.windows WHERE scope_key=ANY($1::text[]) AND tick>=$2::bigint GROUP BY scope_key ORDER BY scope_key', [scopes(tenantId), sinceTick])).rows;
  return Object.fromEntries(scopes(tenantId).map(scope => { const row = rows.find(value => value.scope_key === scope); return [scope, { qh: Number(row?.qh ?? 0), qc: Number(row?.qc ?? 0), qt: Number(row?.qt ?? 0) }]; }));
}
async function tick() { return (await reader.query('SELECT generation,tick,clock_version,barrier FROM saas.admission_fence WHERE id=1')).rows[0]; }
async function ticket(id) { return (await reader.query('SELECT id,owner,generation,tenant_id,state,work_started,reserved_qc,reserved_qt,created_tick FROM saas.tickets WHERE id=$1', [id])).rows[0]; }
async function waitTicket(id, expected, timeout = 6500) {
  const until = performance.now() + timeout;
  while (performance.now() < until) { const row = await ticket(id); if (row?.state === expected) return row; await delay(40); }
  throw Object.assign(new Error('TICKET_STATE_NOT_CONFIRMED'), { code: 'TICKET_STATE_NOT_CONFIRMED' });
}
function delta(before, after, expected) {
  for (const scope of Object.keys(before)) for (const field of ['qh', 'qc', 'qt']) if (expected[field] !== undefined) assert.equal(after[scope][field] - before[scope][field], expected[field], `Durable ${field} delta (${scope})`);
}
function assertRetainedHistory(debt, current) {
  for (const scope of [`tenant:${debt.tenantId}`, `tenant:${debt.tenantId}:ordinary`]) assert.deepEqual(current[scope], debt.ledger[scope], `Original tenant debits remain intact (${scope})`);
  // Shared scopes may legitimately include later HTTP from another company.
  // Those debits are not part of this tenant's original retained snapshot.
  for (const scope of ['global', 'lane:ordinary']) for (const field of ['qh', 'qc', 'qt']) assert(current[scope][field] >= debt.ledger[scope][field], `Original shared ${field} debit cannot decrease (${scope})`);
}
async function client(instance, tenantId = tenantA) {
  const email = tenantId === tenantA ? 'a@qa.invalid' : 'b@qa.invalid';
  assert(loginFixture.identities.some(item => item.email === email && item.purpose === 'company'));
  const result = createQaClient({ instance, purpose: 'company', ca, login: { email, password: loginFixture.password }, budget: 45 });
  await result.login(); return result;
}
const catalog = tenantId => `/api/tenants/${tenantId}/catalog?limit=20`;
async function capture(promise) { try { return { reply: await promise }; } catch (error) { return { error: ['ABORT_ERR', 'ECONNRESET'].includes(error.code) ? error.code : 'QA_RESPONSE_INTERRUPTED' }; } }
function pass(name, facts) { state.passes.push({ name, phase, at: new Date().toISOString(), ...facts }); console.log(JSON.stringify({ criterion: name, status: 'PASS', ...facts })); }
async function persist() { await writeFile(statePath, JSON.stringify(state), { mode: 0o600 }); }
const publicErrors = new Set(['TENANT_QUOTA', 'GLOBAL_QUOTA', 'SERVICE_UNAVAILABLE', 'CLOCK_UNAVAILABLE', 'QUEUE_EXPIRED', 'ADMISSION_CLOSED', 'SESSION_EXPIRED', 'ACCESS_DENIED']);
function safeReply(value, instance) {
  const reply = value.reply;
  const requestId = reply?.headers?.['x-request-id'];
  return { instance, ...(reply ? { status: reply.status, error: publicErrors.has(reply.json?.error) ? reply.json.error : reply.status === 200 ? null : 'UNCLASSIFIED_PUBLIC_ERROR', ...(typeof requestId === 'string' && /^[0-9a-f-]{36}$/i.test(requestId) ? { requestId } : {}) } : { interrupted: value.error }) };
}
async function transactionRows(instance) {
  const text = await readFile(`/run/qa-faults/${instance}/transactions.ndjson`, 'utf8');
  assert(Buffer.byteLength(text) <= 1024 * 1024, 'Exclusive transaction trace byte envelope');
  const rows = text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert(rows.length <= 2048, 'Exclusive transaction trace sample envelope');
  assert(rows.every(row => row.type === 'qa-admission-transaction' && row.instance === instance && Object.keys(row).sort().join(',') === 'conflicts,durationMs,instance,queries,result,type'), 'Only projected transaction evidence is accepted');
  assert(rows.every(row => Number.isFinite(row.durationMs) && row.durationMs >= 0 && Number.isSafeInteger(row.queries) && row.queries >= 0 && Number.isSafeInteger(row.conflicts) && row.conflicts >= 0 && ['COMMIT', 'ROLLBACK', 'DISCARDED', 'RELEASED_WITHOUT_COMMIT'].includes(row.result)), 'Finite transaction evidence is required');
  return rows;
}
async function collisionTickets(sinceTick) {
  return (await reader.query('SELECT id,state,work_started,reserved_qc,reserved_qt FROM saas.tickets WHERE tenant_id=$1 AND created_tick>=$2::bigint ORDER BY id', [tenantA, sinceTick])).rows;
}

try {
  if (phase === 'last-cup') {
    stage = 'last-cup.login';
    const one = await client('api1'), two = await client('api2');
    stage = 'last-cup.baseline';
    await delay(1800); const beforeTick = (await tick()).tick, before = await ledger(tenantA, beforeTick);
    const gate = await arm({ instance: 'api1', stage: 'admission.started', tenantId: tenantA });
    stage = 'last-cup.first-held';
    const held = capture(one.request(catalog(tenantA))); const event = await waitEvent(gate);
    const active = await ticket(event.ticketId); assert.equal(active.state, 'ACTIVE'); assert.equal(active.work_started, true); assert.equal(Number(active.reserved_qc), 0); assert.equal(Number(active.reserved_qt), 1048576);
    stage = 'last-cup.second-denied';
    const denied = await two.request(catalog(tenantA)); assertStatus(denied, 429); assert.equal(denied.json.error, 'TENANT_QUOTA'); assert(!denied.json.items);
    delta(before, await ledger(tenantA, beforeTick), { qh: 1, qc: 1, qt: 0 });
    stage = 'last-cup.first-released';
    await release(gate); const answer = await held; assertStatus(answer.reply, 200); await waitTicket(event.ticketId, 'FINISHED');
    const firstBytes = Buffer.byteLength(answer.reply.text); delta(before, await ledger(tenantA, beforeTick), { qh: 1, qc: 1, qt: firstBytes });
    stage = 'last-cup.second-admitted';
    const second = await two.request(catalog(tenantA)); assertStatus(second, 200); const secondBytes = Buffer.byteLength(second.text);
    await delay(100); delta(before, await ledger(tenantA, beforeTick), { qh: 2, qc: 2, qt: firstBytes + secondBytes });
    stage = 'last-cup.owner-proof';
    const owners = (await reader.query("SELECT DISTINCT owner FROM saas.tickets WHERE tenant_id=$1 AND created_tick>=$2 AND work_started AND state='FINISHED'", [tenantA, beforeTick])).rows.map(row => row.owner);
    assert(owners.length >= 2, 'Both actual HTTP API owners committed work');
    pass('HTTP_TWO_API_LAST_CUP_AGGREGATE_LEDGER', { twoApiOwners: owners.length, admitted: 2, denied: 1, qhDelta: 2, qcDelta: 2, qtDelta: firstBytes + secondBytes, chargedScopes: 4 });
    await persist();

    // Hold one physical fence for <500ms while the other process contends.
    // This creates a real PostgreSQL serialization conflict, with unchanged policy.
    await delay(1600);
    stage = 'collision.baseline';
    const collisionTick = (await tick()).tick, collisionBefore = await ledger(tenantA, collisionTick);
    const existingTickets = new Set((await collisionTickets(collisionTick)).map(row => row.id));
    const traceBefore = Object.fromEntries(await Promise.all(['api1', 'api2'].map(async instance => [instance, (await transactionRows(instance)).length])));
    stage = 'collision.fence-hold';
    const collisionGate = await arm({ instance: 'api1', stage: 'admission.transaction.fence' });
    const collisionA = capture(one.request(catalog(tenantA))); await waitEvent(collisionGate);
    const collisionB = capture(two.request(catalog(tenantA))); await delay(150); await release(collisionGate);
    stage = 'collision.http-and-transactions';
    const replies = [await collisionA, await collisionB];
    await delay(100);
    const traces = Object.fromEntries(await Promise.all(['api1', 'api2'].map(async instance => [instance, (await transactionRows(instance)).slice(traceBefore[instance])])));
    assert(Object.values(traces).every(rows => rows.length <= 32), 'Collision transaction evidence stays within its bounded slice');
    const newTickets = (await collisionTickets(collisionTick)).filter(row => !existingTickets.has(row.id));
    console.log(JSON.stringify({ type: 'qa-admission-diagnostic', phase, stage, replies: replies.map((value, index) => safeReply(value, `api${index + 1}`)), transactions: traces, newTickets: newTickets.map(row => ({ state: row.state, workStarted: row.work_started, reservedQc: Number(row.reserved_qc), reservedQt: Number(row.reserved_qt) })) }));
    for (const value of replies) { assert(value.reply, 'Collision returned an actual HTTP answer'); assert([200, 429, 503].includes(value.reply.status), 'Collision HTTP status is an allowed bounded outcome'); if (value.reply.status !== 200) { assert(['TENANT_QUOTA', 'SERVICE_UNAVAILABLE'].includes(value.reply.json?.error), 'Collision denial has an expected public error'); assert(!value.reply.json?.items, 'Denied collision cannot disclose catalog rows'); } }
    const collisionSuccess = replies.filter(value => value.reply.status === 200);
    stage = 'collision.conflict-proof';
    assert(Object.values(traces).flat().some(row => row.conflicts > 0), 'Collision must observe an actual SERIALIZABLE conflict');
    if (!collisionSuccess.length) {
      // Exhaustion is safe only when both exact HTTP attempts provably failed
      // before admission: three rolled-back conflict attempts per API, no work,
      // no reservation and no durable QH/QC/QT debit. Other 503 causes still fail.
      stage = 'collision.exhaustion-proof';
      assert(replies.every(value => value.reply.status === 503 && value.reply.json?.error === 'SERVICE_UNAVAILABLE'), 'Both denied HTTP attempts must be unavailable');
      for (const instance of ['api1', 'api2']) assert(traces[instance].length === 3 && traces[instance].every(row => row.result === 'ROLLBACK' && row.conflicts === 1), `Exactly three conflict rollbacks prove bounded exhaustion (${instance})`);
      assert.equal(newTickets.length, 0, 'Exhaustion must not create a ticket');
    } else {
      stage = 'collision.finished-work-proof';
      assert.equal(newTickets.length, collisionSuccess.length, 'Each successful collision HTTP has exactly one durable ticket');
      for (const row of newTickets) { await waitTicket(row.id, 'FINISHED'); const finished = await ticket(row.id); assert.equal(finished.work_started, true); assert.equal(Number(finished.reserved_qc), 0); assert.equal(Number(finished.reserved_qt), 0); }
    }
    stage = 'collision.exact-ledger';
    delta(collisionBefore, await ledger(tenantA, collisionTick), { qh: collisionSuccess.length, qc: collisionSuccess.length, qt: collisionSuccess.reduce((sum, value) => sum + Buffer.byteLength(value.reply.text), 0) });
    pass('HTTP_FENCE_COLLISION_RETRY_OR_PROVEN_EXHAUSTION', { attempts: 2, admitted: collisionSuccess.length, exhaustionProven: collisionSuccess.length === 0, conflicts: Object.values(traces).flat().reduce((sum, row) => sum + row.conflicts, 0), chargedScopes: 4, unconfirmedWorkAccepted: false });
    // A client retry is a new request; each actually admitted retry is charged once.
    stage = 'retry.baseline';
    await delay(1600); const retryTick = (await tick()).tick, retryBefore = await ledger(tenantA, retryTick);
    stage = 'retry.http';
    const retryReplies = await Promise.all([one.request(catalog(tenantA)), two.request(catalog(tenantA))]);
    const admitted = retryReplies.filter(value => value.status === 200); assert(admitted.length >= 1);
    for (const value of retryReplies) { assert([200, 429].includes(value.status)); if (value.status === 429) assert.equal(value.json.error, 'TENANT_QUOTA'); }
    stage = 'retry.exact-ledger';
    await delay(100); delta(retryBefore, await ledger(tenantA, retryTick), { qh: admitted.length, qc: admitted.length, qt: admitted.reduce((sum, value) => sum + Buffer.byteLength(value.text), 0) });
    pass('CONCURRENT_HTTP_RETRY_DEBITS_ONCE_PER_ADMISSION', { attempts: 2, admitted: admitted.length });
  }

  if (phase === 'timeout' || phase === 'lost-response') {
    const timeout = phase === 'timeout'; const instance = timeout ? 'api1' : 'api2', tenantId = timeout ? tenantA : tenantB;
    const caller = await client(instance, tenantId), deniedCaller = await client(timeout ? 'api2' : 'api1', tenantId);
    await delay(1800); const sinceTick = (await tick()).tick, before = await ledger(tenantId, sinceTick);
    const gate = await arm({ instance, stage: timeout ? 'admission.started' : 'admission.bytes', tenantId });
    const controller = new AbortController(); const held = capture(caller.request(catalog(tenantId), { signal: controller.signal }));
    const event = await waitEvent(gate); const active = await ticket(event.ticketId); assert.equal(active.state, 'ACTIVE'); assert.equal(active.work_started, true);
    if (timeout) { const response = await held; assertStatus(response.reply, 503); assert.equal(response.reply.json.error, 'SERVICE_UNAVAILABLE'); }
    else { controller.abort(); const result = await held; assert(result.error, 'The client lost the response before receiving any body'); await delay(150); }
    await release(gate); const uncertain = await waitTicket(event.ticketId, 'UNCERTAIN');
    assert.equal(Number(uncertain.reserved_qc), 0); assert(Number(uncertain.reserved_qt) > 0);
    delta(before, await ledger(tenantId, sinceTick), { qh: 1, qc: 1, ...(timeout ? { qt: 0 } : {}) });
    const retained = { id: uncertain.id, owner: uncertain.owner, tenantId, generation: uncertain.generation, reservedQt: Number(uncertain.reserved_qt), sinceTick, ledger: await ledger(tenantId, sinceTick) };
    const denied = await deniedCaller.request(catalog(tenantId)); assertStatus(denied, 429); assert.equal(denied.json.error, 'TENANT_QUOTA');
    assert.deepEqual(await ledger(tenantId, sinceTick), retained.ledger, 'An unadmitted retry cannot debit another QH/QC');
    const after = await ticket(event.ticketId); assert.equal(after.state, 'UNCERTAIN'); assert.equal(Number(after.reserved_qt), retained.reservedQt);
    state.uncertain.push(retained);
    pass(timeout ? 'HTTP_TIMEOUT_RETAINS_UNCERTAIN_DEBT' : 'HTTP_LOST_RESPONSE_RETAINS_UNCERTAIN_DEBT', { owner: event.owner, reservedQt: retained.reservedQt, lastCupDenied: true, prematureRelease: false });
  }

  if (phase === 'reconcile') {
    stage = 'reconcile.runner-proof';
    const proof = JSON.parse(await readFile('/run/qa-results/admission-runner-proof.json', 'utf8'));
    assert.equal(proof.project, project); assert.equal(proof.generation, qa.generation); assert(proof.createdAt); assert.equal(proof.tenantBackendCount, 0);
    const reconcilerPool = await role('saas_reconciler');
    const denied = createReconciler({ pool: reconcilerPool, generation: qa.generation, verifyRunnerStopped: async () => ({ runnerStopped: false, sqlSettled: true, responseSettled: true, reference: 'cp014:missing-runner-proof' }) });
    const reconciler = createReconciler({ pool: reconcilerPool, generation: qa.generation, verifyRunnerStopped: async ({ owner }) => {
      const runner = proof.runners.find(value => value.owner === owner); assert(runner, 'Actual old API owner was stopped');
      assert.equal(runner.observedState, 'exited'); assert.equal(runner.running, false); assert.equal(runner.apiBackendCount, 0); assert.equal(runner.responseEndpointsStopped, true); assert(runner.containerId && runner.finishedAt);
      return { runnerStopped: true, sqlSettled: true, responseSettled: true, reference: `cp014:docker-exited:${runner.containerId}` };
    } });
    assert.equal(state.uncertain.length, 2);
    stage = 'reconcile.current-ledger-baselines';
    const baselines = new Map();
    for (const debt of state.uncertain) {
      const before = await ledger(debt.tenantId, debt.sinceTick);
      console.log(JSON.stringify({ type: 'qa-reconcile-ledger', stage, ticketId: debt.id, tenantId: debt.tenantId, original: debt.ledger, before }));
      assertRetainedHistory(debt, before); baselines.set(debt.id, before);
    }
    for (const debt of state.uncertain) {
      stage = 'reconcile.uncertain-debt';
      let row = await ticket(debt.id); assert.equal(row.state, 'UNCERTAIN'); assert.equal(Number(row.reserved_qt), debt.reservedQt);
      stage = 'reconcile.unproven-end-denied';
      await assert.rejects(denied.reconcile(debt.id), { code: 'END_NOT_PROVEN' });
      assert.equal((await ticket(debt.id)).state, 'UNCERTAIN');
      const afterDenied = await ledger(debt.tenantId, debt.sinceTick);
      console.log(JSON.stringify({ type: 'qa-reconcile-ledger', stage, ticketId: debt.id, tenantId: debt.tenantId, before: baselines.get(debt.id), after: afterDenied }));
      delta(baselines.get(debt.id), afterDenied, { qh: 0, qc: 0, qt: 0 });
      stage = 'reconcile.proven-end';
      assert.equal((await reconciler.reconcile(debt.id)).state, 'FINISHED');
      row = await ticket(debt.id); assert.equal(Number(row.reserved_qc), 0); assert.equal(Number(row.reserved_qt), 0);
      const after = await ledger(debt.tenantId, debt.sinceTick);
      console.log(JSON.stringify({ type: 'qa-reconcile-ledger', stage, ticketId: debt.id, tenantId: debt.tenantId, before: baselines.get(debt.id), after, state: row.state, reservedQc: Number(row.reserved_qc), reservedQt: Number(row.reserved_qt) }));
      delta(baselines.get(debt.id), after, { qh: 0, qc: 0, qt: 0 });
      assertRetainedHistory(debt, after);
      stage = 'reconcile.durable-audit';
      const audit = (await reconcilerPool.query('SELECT owner,generation,reference FROM saas.reconciliation_audit WHERE ticket_id=$1', [debt.id])).rows[0]; assert.equal(audit.owner, debt.owner); assert.equal(audit.generation, qa.generation); assert(audit.reference.startsWith('cp014:docker-exited:'));
    }
    pass('UNCERTAIN_RELEASE_REQUIRES_ACTUAL_PROCESS_SQL_RESPONSE_END', { reconciled: 2, noProofDenied: 2, qhQcRefunded: false, qtRefunded: false, actualLedgerBaselinesUnchanged: true, chargedScopes: 4 });
  }

  if (phase === 'post-api-restart') {
    for (const debt of state.uncertain) { const row = await ticket(debt.id); assert.equal(row.state, 'FINISHED'); assert.equal(Number(row.reserved_qt), 0); }
    const one = await client('api1'), two = await client('api2', tenantB);
    const before = await tick(); assert.equal(before.generation, state.generation); assert.equal(before.barrier, false);
    const answers = await Promise.all([one.request(catalog(tenantA)), two.request(catalog(tenantB))]);
    for (const answer of answers) assertStatus(answer, 200);
    await delay(100);
    const currentOwners = (await reader.query("SELECT DISTINCT owner FROM saas.tickets WHERE created_tick>=$1 AND work_started AND tenant_id IS NOT NULL", [before.tick])).rows.map(row => row.owner);
    assert(currentOwners.length >= 2); assert(currentOwners.every(owner => !state.uncertain.some(debt => debt.owner === owner)));
    pass('API_RESTART_PRESERVES_LEDGER_AND_RECONCILED_HISTORY', { twoNewOwners: currentOwners.length, historicalDebtsFinished: 2, catalogHttp200: 2 });
  }

  if (phase === 'pre-worker-transfer') {
    const clock = (await reader.query('SELECT owner,generation,tick,clock_version FROM saas.time_authority WHERE id=1')).rows[0];
    state.workerBefore = { ...clock, ledgerA: await ledger(tenantA, clock.tick), ledgerB: await ledger(tenantB, clock.tick) };
    pass('WORKER_TRANSFER_BASELINE_CAPTURED', { tick: clock.tick, generation: clock.generation });
  }
  if (phase === 'post-worker-transfer') {
    assert(state.workerBefore); const current = (await reader.query('SELECT owner,generation,tick,clock_version FROM saas.time_authority WHERE id=1')).rows[0];
    assert.notEqual(current.owner, state.workerBefore.owner); assert.equal(current.generation, state.workerBefore.generation); assert(BigInt(current.tick) >= BigInt(state.workerBefore.tick)); assert(BigInt(current.clock_version) > BigInt(state.workerBefore.clock_version));
    assert.deepEqual(await ledger(tenantA, state.workerBefore.tick), state.workerBefore.ledgerA); assert.deepEqual(await ledger(tenantB, state.workerBefore.tick), state.workerBefore.ledgerB);
    const one = createQaClient({ instance: 'api1', ca, budget: 10 }), two = createQaClient({ instance: 'api2', ca, budget: 10 });
    for (const caller of [one, two]) { let reply; for (let i = 0; i < 25; i++) { reply = await caller.request('/api/health/ready'); if (reply.status === 200) break; await delay(100); } assertStatus(reply, 200); }
    pass('WORKER_RELAY_PRESERVES_TICKS_GENERATION_AND_COUNTERS', { oldOwnerExitedProofRequired: true, generationPreserved: true, tickNotReset: true, ledgerNotReset: true, twoReadyApi: true });
  }

  if (phase === 'costs') {
    const all = [];
    for (const instance of ['api1', 'api2']) {
      const text = await readFile(`/run/qa-faults/${instance}/transactions.ndjson`, 'utf8'); assert(Buffer.byteLength(text) <= 1024 * 1024);
      const rows = text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); assert(rows.length <= 2048, 'The diagnostic envelope persists across API restarts');
      assert(rows.every(row => row.type === 'qa-admission-transaction' && row.instance === instance && Object.keys(row).sort().join(',') === 'conflicts,durationMs,instance,queries,result,type'));
      assert(rows.every(row => Number.isFinite(row.durationMs) && row.durationMs >= 0 && Number.isSafeInteger(row.conflicts) && row.conflicts >= 0)); all.push(...rows);
    }
    assert(all.length > 0); const conflicts = all.reduce((sum, row) => sum + row.conflicts, 0); assert(conflicts > 0, 'At least one real bounded SERIALIZABLE retry conflict was observed');
    const durations = all.map(row => row.durationMs).sort((a, b) => a - b); const percentile = p => durations[Math.min(durations.length - 1, Math.floor(durations.length * p))];
    const results = Object.fromEntries(['COMMIT', 'ROLLBACK', 'DISCARDED', 'RELEASED_WITHOUT_COMMIT'].map(value => [value, all.filter(row => row.result === value).length]));
    pass('BOUNDED_REAL_TRANSACTION_COST_AND_CONFLICT_MEASURE', { samples: all.length, conflicts, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: durations.at(-1), outcomes: results, excludesPoolWait: true, capacityClaim: false });
  }
  await persist();
} catch (error) {
  const allowed = new Set(['ERR_ASSERTION', 'TICKET_STATE_NOT_CONFIRMED', '53300', '57014', '57P01', 'ECONNRESET', 'ECONNREFUSED', 'ENOENT']);
  console.error(JSON.stringify({ phase, stage, status: 'FAIL', code: allowed.has(error.code) ? error.code : 'CP014_ADMISSION_FAILURE', assertion: error.code === 'ERR_ASSERTION' ? String(error.message).slice(0, 180).replace(/\n.*/s, '') : undefined }));
  process.exitCode = 1;
} finally { await Promise.allSettled(opened.map(pool => pool.end())); }
