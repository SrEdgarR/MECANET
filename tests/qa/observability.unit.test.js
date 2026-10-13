import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSample, ProjectionProducer } from '../../server/saas/observability/producer.js';
import * as repositories from '../../server/saas/observability/repository.js';
const scope = 'tenant:11111111-1111-4111-8111-111111111111';
const scopes = new Set([scope, 'service:api-1']);
const sample = { scope, metric: 'db.physical_bytes', value: 123, source: 'postgres.size', quality: 'DIRECT', asOf: '2026-10-13T00:00:00.000Z', coverage: 1 };
test('projection is an explicit allowlist; business content and secrets cannot survive', () => {
  const result = normalizeSample({ ...sample, password: 'CANARY_SECRET', sql: 'CANARY_QUERY', sales: 'CANARY_SALES' }, scopes);
  assert.equal(result.unit, 'bytes');
  assert.doesNotMatch(JSON.stringify(result), /CANARY/);
});
test('unavailable measurement has null value, never fictitious zero', () => {
  assert.equal(normalizeSample({ ...sample, quality: 'UNAVAILABLE', value: 0 }, scopes).value, null);
});
test('scope/metric/source/quality/cardinality and tenant CPU attribution are denied', () => {
  for (const delta of [{ scope: 'tenant:other' }, { metric: 'sales.total' }, { source: 'pg_stat_activity' }, { quality: 'OK' }, { value: NaN }, { coverage: 2 }, { metric: 'service.rss_bytes' }]) assert.throws(() => normalizeSample({ ...sample, ...delta }, scopes));
});
test('buffer is finite during publisher failure and records coverage loss', async () => {
  const producer = new ProjectionProducer({ scopes, generation: 'qa', sourceId: 'worker-1', maxBufferBytes: 512, maxBatchBytes: 512, publish: async () => { throw new Error('offline'); } });
  for (let i = 0; i < 50; i++) producer.add(sample);
  assert.ok(producer.bufferBytes <= 512); assert.ok(producer.dropped > 0);
  assert.equal(await producer.flush(), false); assert.ok(producer.bufferBytes <= 512);
});
test('flush is bounded and serial; uncertain delivery reuses the same batch identity', async () => {
  const batches = []; let fail = true;
  const producer = new ProjectionProducer({ scopes, generation: 'qa', sourceId: 'worker-1', publish: async batch => { batches.push(batch); if (fail) { fail = false; throw new Error('lost acknowledgement'); } } });
  producer.add(sample); assert.equal(await producer.flush(), false); assert.equal(await producer.flush(), true);
  assert.deepEqual(batches[0], batches[1]); assert.equal(producer.bufferBytes, 0);
});
test('only one asynchronous sample can run and stop prevents new collection', async () => {
  let finish; let calls = 0;
  const producer = new ProjectionProducer({ scopes, generation: 'qa', sourceId: 'worker-1', publish: async () => {} });
  const first = producer.collect(async () => { calls++; await new Promise(resolve => { finish = resolve; }); return [sample]; });
  assert.equal(await producer.collect(async () => { calls++; return [sample]; }), false);
  finish(); await first; producer.stop(); assert.equal(await producer.collect(async () => []), false); assert.equal(calls, 1);
});

test('a new process sampler marks its first CPU and RSS samples as a discontinuity', async () => {
  assert.equal(typeof repositories.createServiceSampler, 'function');
  const sampleProcess = () => repositories.createServiceSampler({
    scope: 'service:api-1', scopes,
    now: () => new Date('2026-10-13T00:00:00Z'),
    usage: () => ({ rss: 1234, cpuMicroseconds: 27 }),
  });
  const firstProcess = sampleProcess();
  const initial = await firstProcess();
  assert.deepEqual(initial.map(row => [row.metric, row.value, row.discontinuity]), [
    ['service.rss_bytes', 1234, true], ['service.cpu_usec', 27, true],
  ]);
  assert.ok((await firstProcess()).every(row => row.discontinuity === false));
  assert.ok((await sampleProcess()()).every(row => row.discontinuity === true));
});

test('projection readers distinguish a restarted producer from its preceding generation', async () => {
  const sourceRows = ['old-process', 'new-process'].map((generation, index) => ({
    source_id: 'private-worker', generation, scope: 'service:api-1',
    metric: 'service.cpu_usec', unit: 'microseconds', value: index ? 3 : 2000,
    source: 'process.self', quality: 'DIRECT', as_of: sample.asOf,
    coverage: 1, discontinuity: Boolean(index), granularity: 'minute',
  }));
  // Read-only SQL projection double: returns exactly the requested columns.
  // Actual PostgreSQL integration of this changed SELECT is a separate gate.
  const pool = { async query(sql, args) {
    assert.deepEqual(args, ['service:api-1', 100]);
    const columns = /^SELECT ([a-z_,]+) FROM saas\.usage_projection /.exec(sql)?.[1].split(',');
    assert.ok(columns);
    return { rows: sourceRows.map(row => Object.fromEntries(columns.map(key => [key, row[key]]))) };
  } };
  const rows = await repositories.createProjectionRepository({ pool, scopes }).read({ scope: 'service:api-1', authorized: true });
  assert.equal(rows[0].source_id, 'private-worker');
  assert.equal(rows[1].source_id, 'private-worker');
  assert.equal(rows[0].generation, 'old-process');
  assert.equal(rows[1].generation, 'new-process');
  assert.equal(rows[1].discontinuity, true);
});
