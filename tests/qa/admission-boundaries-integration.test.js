// Exclusive synthetic QA. Real clock and PostgreSQL only; no policy/clock mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { createPgPool } from '../../server/saas/db/pools.js';
import { createAdmission } from '../../server/saas/admission/index.js';
import { serializable } from '../../server/saas/admission/transaction.js';
import { calculateUsage } from '../../server/saas/admission/policy.js';

const path = process.env.MECANET_QA_CONNECTIONS ?? '/run/qa-secrets/connections.json';
if (!path.startsWith('/run/qa-secrets/')) throw new Error('QA_PRIVATE_CONNECTIONS_PATH_REQUIRED');
const qa = JSON.parse(await readFile(path, 'utf8'));
assert.equal(qa.connections.saas_api.host, 'postgres');
assert.equal(qa.connections.saas_api.database, 'mecanet_control');
assert.match(qa.generation, /^[a-f0-9-]{36}$/i);
const tenant = '22222222-2222-4222-8222-222222222222';
const scope = `tenant:${tenant}:ordinary`;

async function progress(service) {
  for (let i = 0; i < 20; i++) {
    await service.observeClock();
    if (service.ready()) return;
    await delay(110);
  }
  throw new Error('QA_CLOCK_NOT_PROGRESSING');
}

test('601 real committed ticks expire consumption while an active ticket keeps capacity and byte reservation', { timeout: 150000 }, async t => {
  const pool = await createPgPool({ ...qa.connections.saas_api, max: 1, connectionTimeoutMillis: 2000, statement_timeout: 2000, application_name: 'mecanet-qa-window-boundary' });
  const service = createAdmission({ pool, owner: randomUUID(), generation: qa.generation });
  let ticket; let second; let executionSettled = false; let uncertain = false;
  try {
    await pool.query('SELECT 1');
    assert.equal(Number((await pool.query("SELECT count(*) AS n FROM saas.tickets WHERE scopes @> ARRAY[$1]::text[] AND state IN ('WAITING','ACTIVE','UNCERTAIN')", [scope])).rows[0].n), 0, 'exclusive tenant fixture must start without live reservations');
    await progress(service);
    ticket = await service.admit({ tenantId: tenant, reserveBytes: 256 });
    assert.equal((await service.claim(ticket.id, { revalidate: async () => {} })).claimed, true);
    await service.startWork(ticket.id);
    const startedTick = BigInt((await pool.query('SELECT tick FROM saas.admission_fence WHERE id=1')).rows[0].tick);
    const before = calculateUsage((await pool.query('SELECT tick,qh,qc,qt FROM saas.windows WHERE scope_key=$1 AND tick<=$2', [scope, startedTick.toString()])).rows, startedTick);
    assert.ok(before.qc60 >= 1 && before.qh60 >= 1, 'real HTTP and work consumption must be present initially');
    const began = performance.now(); let heartbeatAt = began; let shortExpired = false;
    let tick = startedTick;
    while (tick - startedTick < 601n) {
      assert.ok(performance.now() - began < 135000, 'abort: authoritative clock did not complete 601 ticks within the bounded test');
      await delay(500);
      await service.observeClock();
      assert.equal(service.ready(), true, 'clock failure closes this test; it cannot synthesize elapsed ticks');
      if (performance.now() - heartbeatAt >= 5000) {
        assert.equal(await service.heartbeat(ticket.id), true);
        heartbeatAt = performance.now();
      }
      const state = (await pool.query('SELECT t.state,t.reserved_qc,t.reserved_qt,f.tick,f.generation,f.barrier FROM saas.tickets t CROSS JOIN saas.admission_fence f WHERE t.id=$1 AND f.id=1', [ticket.id])).rows[0];
      tick = BigInt(state.tick);
      assert.equal(state.generation, qa.generation); assert.equal(state.barrier, false);
      assert.equal(state.state, 'ACTIVE'); assert.equal(Number(state.reserved_qt), 256);
      assert.equal(Number(state.reserved_qc), 0);
      if (!shortExpired && tick - startedTick >= 11n) {
        const usage = calculateUsage((await pool.query('SELECT tick,qh,qc,qt FROM saas.windows WHERE scope_key=$1 AND tick<=$2', [scope, tick.toString()])).rows, tick);
        assert.equal(usage.qc1, 0); assert.equal(usage.qh1, 0); shortExpired = true;
      }
    }
    const after = calculateUsage((await pool.query('SELECT tick,qh,qc,qt FROM saas.windows WHERE scope_key=$1 AND tick<=$2', [scope, tick.toString()])).rows, tick);
    assert.equal(after.qc60, 0); assert.equal(after.qh60, 0);
    assert.ok(shortExpired);
    await progress(service);
    second = await service.admit({ tenantId: tenant, reserveBytes: 64 });
    assert.equal((await service.claim(second.id, { revalidate: async () => {} })).state, 'WAITING', 'expired windows must not free the still-active ordinary slot');
    await service.finish(second.id, { sqlSettled: true, responseSettled: true }); second = null;
    executionSettled = true; // No business work exists: all awaited control queries have completed.
    await service.finish(ticket.id, { sqlSettled: true, responseSettled: true });
    assert.equal((await service.lookup(ticket.id)).state, 'FINISHED');
    t.diagnostic(`Real clock delta=${tick - startedTick}; elapsed_ms=${Math.round(performance.now() - began)}; no synthetic tick advance`);
    ticket = null;
  } catch (error) {
    uncertain = error.code === 'COMMIT_UNCERTAIN';
    if (!uncertain) executionSettled = true;
    throw error;
  } finally {
    // This private runner can attest its own completed, awaited synthetic work;
    // it cannot attest a lost COMMIT or release a ticket already UNCERTAIN.
    for (const entry of [second, ticket].filter(Boolean)) {
      try {
        const current = await service.lookup(entry.id);
        if (!uncertain && executionSettled && ['WAITING', 'ACTIVE'].includes(current?.state)) await service.finish(entry.id, { sqlSettled: true, responseSettled: true });
        else if (current && ['WAITING', 'ACTIVE', 'UNCERTAIN'].includes(current.state)) t.diagnostic(`Capacity retained for explicit reconciliation: ${entry.id}`);
      } catch { t.diagnostic(`Cleanup not confirmed; capacity must remain closed: ${entry.id}`); }
    }
    await pool.end();
  }
});

test('real PostgreSQL deadlock yields 40P01 and bounded serializable retry without business effects', { timeout: 10000 }, async t => {
  const password = await readFile('/run/qa-secrets/bootstrap', 'utf8');
  const expectedSystemId = (await readFile('/run/qa-system-id', 'utf8')).trim();
  const pool = await createPgPool({ ...qa.connections.saas_api, user: 'qa_bootstrap', password, max: 2, connectionTimeoutMillis: 2000, statement_timeout: 2000, application_name: 'mecanet-qa-controlled-deadlock' });
  let first; let opponent; let opponentPending; let opponentError;
  try {
    first = await pool.connect(); opponent = await pool.connect();
    for (const client of [first, opponent]) {
      assert.equal(String((await client.query('SELECT system_identifier FROM pg_control_system()')).rows[0].system_identifier), expectedSystemId, 'bootstrap restricted to the explicit own QA cluster');
      await client.query("SET deadlock_timeout='50ms'");
      await client.query('SET ROLE saas_api');
      assert.equal((await client.query('SELECT current_user AS name')).rows[0].name, 'saas_api');
    }
    const rows = ['entry:auth', 'entry:operator'];
    const before = (await first.query('SELECT scope_key,last_turn FROM saas.admission_scopes WHERE scope_key=ANY($1::text[]) ORDER BY scope_key', [rows])).rows;
    assert.equal(before.length, 2);
    await opponent.query('BEGIN');
    await opponent.query('UPDATE saas.admission_scopes SET last_turn=last_turn WHERE scope_key=$1', [rows[1]]);
    let attempts = 0; const errors = []; let releases = 0;
    const clientPool = { async connect() { return { query: (...args) => first.query(...args), release(error) { releases++; if (error) throw error; } }; } };
    const result = await serializable(clientPool, async client => {
      attempts++;
      await client.query('UPDATE saas.admission_scopes SET last_turn=last_turn WHERE scope_key=$1', [rows[0]]);
      if (attempts === 1) {
        // The first wait starts before the second, so its 50ms deadlock detector
        // sees the cycle first. Both connections retain the same minimum role.
        const blocked = client.query('UPDATE saas.admission_scopes SET last_turn=last_turn WHERE scope_key=$1', [rows[1]]).then(() => null, error => error);
        await delay(20);
        opponentPending = opponent.query('UPDATE saas.admission_scopes SET last_turn=last_turn WHERE scope_key=$1', [rows[0]]).catch(error => { opponentError = error; }).finally(() => opponent.query('ROLLBACK'));
        const error = await blocked;
        if (error) { errors.push(error.code); throw error; }
      } else {
        await client.query('UPDATE saas.admission_scopes SET last_turn=last_turn WHERE scope_key=$1', [rows[1]]);
      }
      return 'central-control-only';
    });
    await opponentPending;
    assert.equal(result, 'central-control-only'); assert.equal(opponentError, undefined);
    assert.ok(errors.includes('40P01'), 'the production retry wrapper must observe an actual PostgreSQL deadlock');
    assert.ok(attempts >= 2 && attempts <= 3); assert.equal(releases, attempts);
    assert.deepEqual((await first.query('SELECT scope_key,last_turn FROM saas.admission_scopes WHERE scope_key=ANY($1::text[]) ORDER BY scope_key', [rows])).rows, before);
    t.diagnostic(`PostgreSQL40P01 observed; attempts=${attempts}; central no-op values unchanged`);
  } finally {
    // Roll back both owned sessions even if the deliberate deadlock or assertion failed.
    if (first) await first.query('ROLLBACK').catch(() => {});
    if (opponentPending) await opponentPending.catch(() => {});
    if (opponent) await opponent.query('ROLLBACK').catch(() => {});
    first?.release(); opponent?.release(); await pool.end();
  }
});
