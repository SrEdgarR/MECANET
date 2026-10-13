import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionProbe } from './admission-probe.mjs';

test('private transaction costs and conflicts are sanitized and retain driver semantics', async () => {
  const lines = []; let released; let tick = 0;
  const driver = { query: async sql => { tick += 2; if (sql.includes('sensitive')) throw Object.assign(new Error('password URI'), { code: '40001' }); return { rows: [] }; }, release: error => { released = error; } };
  const pool = { connect: async () => driver, query: (...args) => driver.query(...args), end: async () => {} };
  const probe = createTransactionProbe(pool, { instance: 'api1', write: value => lines.push(value), now: () => tick });
  const client = await probe.connect();
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await assert.rejects(client.query('SELECT sensitive', ['private-data']), { code: '40001' });
  await client.query('ROLLBACK'); client.release();
  const event = JSON.parse(lines[0]);
  assert.equal(event.durationMs, 6); assert.equal(event.conflicts, 1); assert.equal(event.queries, 3); assert.equal(event.result, 'ROLLBACK');
  assert.equal(released, undefined); assert(!lines[0].includes('private-data')); assert(!lines[0].includes('sensitive')); assert(!lines[0].includes('password'));
});

test('transaction tracing is bounded and rejects a path or identity outside exclusive QA', async () => {
  let recorded = 0;
  const driver = { query: async () => ({}), release() {} };
  const pool = { connect: async () => driver, query: async () => ({}), end: async () => {} };
  const probe = createTransactionProbe(pool, { instance: 'api2', write: () => recorded++ });
  for (let i = 0; i < 2052; i++) { const client = await probe.connect(); await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); await client.query('COMMIT'); client.release(); }
  assert.equal(recorded, 2048);
  assert.throws(() => createTransactionProbe(pool, { instance: 'other', write() {} }), TypeError);
  assert.throws(() => createTransactionProbe(pool, { instance: 'api1', root: '/data/shared', write() {} }), TypeError);
});
