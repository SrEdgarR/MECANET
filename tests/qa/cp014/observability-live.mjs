// Private, bounded CP-014 integration harness. Never imported by the product.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createPgPool } from '../../../server/saas/db/pools.js';
import { ProjectionProducer } from '../../../server/saas/observability/producer.js';
import { createProjectionRepository, createDatabaseSampler, createServiceSampler } from '../../../server/saas/observability/repository.js';

const stage = process.argv[2] ?? 'before';
assert.ok(['before', 'buffer-recovery', 'after'].includes(stage), 'UNKNOWN_OBSERVABILITY_STAGE');
const resultRoot = process.env.MECANET_QA_RESULTS ?? '/run/qa-results';
assert.equal(resultRoot, '/run/qa-results', 'PRIVATE_RESULTS_PATH_REQUIRED');
const qa = JSON.parse(await readFile('/run/qa-secrets/connections.json', 'utf8'));
const pools = [];
const scopes = new Set(['control', 'demo', 'tenant:11111111-1111-4111-8111-111111111111', 'tenant:22222222-2222-4222-8222-222222222222', 'service:worker']);
async function rolePool(role) {
  assert.equal(qa.connections[role].user, role, 'FIXED_QA_ROLE_REQUIRED');
  const pool = await createPgPool({ ...qa.connections[role], max: 1, connectionTimeoutMillis: 2000, statement_timeout: 2000 });
  pools.push(pool);
  return pool;
}
function rowSummary(rows) {
  return rows.map(({ source_id, generation, metric, unit, source, quality, as_of, coverage, discontinuity, granularity }) => ({ source_id, generation, metric, unit, source, quality, asOf: new Date(as_of).toISOString(), coverage, discontinuity, granularity }));
}
async function workerSnapshot(api) {
  const clock = (await api.query('SELECT owner,generation,tick FROM saas.time_authority WHERE id=1')).rows[0];
  const repository = createProjectionRepository({ pool: api, scopes });
  for (let attempt = 0; attempt < 40; attempt++) {
    const rows = (await repository.read({ scope: 'service:worker', authorized: true })).filter(row => row.source_id === 'qa-private-worker' && row.generation === clock.owner);
    if (rows.length >= 4) {
      const first = (await api.query("SELECT metric,discontinuity FROM saas.usage_projection WHERE source_id='qa-private-worker' AND generation=$1 AND scope='service:worker' AND granularity='minute' AND bucket=(SELECT min(bucket) FROM saas.usage_projection WHERE source_id='qa-private-worker' AND generation=$1 AND scope='service:worker' AND granularity='minute') ORDER BY metric", [clock.owner])).rows;
      assert.deepEqual(first.map(row => row.metric), ['service.cpu_usec', 'service.rss_bytes']);
      assert.ok(first.every(row => row.discontinuity === true), 'INITIAL_WORKER_SAMPLE_NOT_DISCONTINUOUS');
      assert.ok(rows.every(row => row.source === 'process.self' && row.quality === 'DIRECT' && row.coverage === 1));
      assert.ok(rows.every(row => row.unit === (row.metric === 'service.cpu_usec' ? 'microseconds' : 'bytes')));
      const latest = ['service.cpu_usec', 'service.rss_bytes'].map(metric => rows.filter(row => row.metric === metric).sort((a, b) => new Date(b.as_of) - new Date(a.as_of))[0]);
      assert.ok(latest.every(row => { const age = Date.now() - new Date(row.as_of).getTime(); return age >= -5000 && age <= 45000; }), 'WORKER_SAMPLE_TOO_OLD');
      assert.ok(rows.every(row => Number.isFinite(row.value) && row.value >= 0));
      await assert.rejects(repository.read({ scope: 'service:worker', authorized: false }), { status: 403 });
      return { clockOwner: clock.owner, controlGeneration: clock.generation, tick: String(clock.tick), latestSamples: rowSummary(latest), firstCpuAndRssDiscontinuous: true };
    }
    await delay(250);
  }
  throw new Error('WORKER_PROJECTION_NOT_PUBLISHED');
}

try {
  const api = await rolePool('saas_api');
  // saas_measure has an intentional cluster-wide connection cap of one. The
  // worker owns it while running; its producer must be proven stopped before
  // the dedicated recovery stage uses this role. Never raise that cap for QA.
  const measurement = stage === 'buffer-recovery' ? await rolePool('saas_measure') : null;
  const worker = stage === 'buffer-recovery' ? null : await workerSnapshot(api);
  const result = { stage, time: new Date().toISOString(), worker, sourceAndGenerationVisible: true, qualityAndAsOfPresent: true, tenantCpuAttribution: false };
  if (stage === 'buffer-recovery') {
    const repository = createProjectionRepository({ pool: measurement, scopes });
    const reader = createProjectionRepository({ pool: api, scopes });
    const generation = randomUUID();
    const sourceId = `cp014-${randomUUID()}`;
    const sampler = createServiceSampler({ scope: 'service:worker', scopes });
    const first = await sampler();
    const second = await sampler();
    assert.ok(first.every(row => row.discontinuity));
    assert.ok(second.every(row => !row.discontinuity));
    await repository.publish({ sourceId, generation, sequence: 1, samples: first });
    await repository.publish({ sourceId, generation, sequence: 2, samples: second });
    const persisted = (await reader.read({ scope: 'service:worker', authorized: true })).filter(row => row.source_id === sourceId && row.generation === generation);
    assert.equal(persisted.length, 4);
    assert.ok(persisted.every(row => row.discontinuity === true), 'FIRST_DISCONTINUITY_NOT_PRESERVED');

    // Actual denied PostgreSQL publisher, no mocked offline network or grants edit.
    const deniedPublisher = createProjectionRepository({ pool: api, scopes });
    const sample = { scope: 'control', metric: 'db.physical_bytes', value: 123, source: 'postgres.size', quality: 'DIRECT', asOf: new Date().toISOString(), coverage: 1, password: 'CANARY_SECRET', sales: 'CANARY_BUSINESS', query: 'CANARY_SQL' };
    await assert.rejects(deniedPublisher.publish({ sourceId, generation, sequence: 3, samples: [sample] }), { code: '42501' });
    const batches = [];
    const producer = new ProjectionProducer({ scopes, sourceId: `buffer-${randomUUID()}`, generation, publish: async batch => { batches.push({ sequence: batch.sequence, bytes: Buffer.byteLength(JSON.stringify(batch)) }); await deniedPublisher.publish(batch); } });
    for (let attempt = 0; attempt < 25000; attempt++) producer.add(sample);
    assert.ok(producer.bufferBytes <= 4 * 1024 * 1024);
    assert.ok(producer.dropped > 0, 'BUFFER_BOUND_NOT_EXERCISED');
    for (let attempt = 0; attempt < 3; attempt++) assert.equal(await producer.flush(), false);
    assert.equal(new Set(batches.map(batch => batch.sequence)).size, 1, 'FAILED_BATCH_ID_CHANGED');
    assert.ok(batches.every(batch => batch.bytes <= 64 * 1024));
    const boundedBytes = producer.bufferBytes;
    producer.publish = repository.publish;
    assert.equal(await producer.flush(), true);
    assert.ok(producer.bufferBytes < boundedBytes);
    assert.equal(producer.add(sample), true);
    assert.ok(producer.queue.at(-1).sample.discontinuity);
    assert.ok(producer.queue.at(-1).sample.coverage < 1);
    assert.doesNotMatch(JSON.stringify(producer.queue), /CANARY/);

    const unavailable = await createDatabaseSampler({ pool: api, scopes })();
    assert.equal(unavailable.length, 4);
    assert.ok(unavailable.every(row => row.value === null && row.quality === 'UNAVAILABLE' && row.coverage === 0 && row.discontinuity));
    const unavailableId = `unavailable-${randomUUID()}`;
    await repository.publish({ sourceId: unavailableId, generation, sequence: 1, samples: unavailable });
    const projectedUnavailable = (await reader.read({ scope: 'control', authorized: true })).filter(row => row.source_id === unavailableId);
    assert.equal(projectedUnavailable.length, 2);
    assert.ok(projectedUnavailable.every(row => row.value === null && row.quality === 'UNAVAILABLE' && row.coverage === 0));
    const oldAsOf = new Date(Date.now() - 120000).toISOString();
    const staleId = `stale-${randomUUID()}`;
    await repository.publish({ sourceId: staleId, generation, sequence: 1, samples: [{ ...sample, asOf: oldAsOf }] });
    const stale = (await reader.read({ scope: 'control', authorized: true })).filter(row => row.source_id === staleId);
    assert.equal(stale.length, 2);
    assert.ok(stale.every(row => Date.now() - new Date(row.as_of).getTime() >= 120000));
    await assert.rejects(measurement.query('SELECT email FROM saas.identities'), { code: '42501' });
    await assert.rejects(measurement.query("UPDATE saas.policies SET limits='{}'::jsonb"), { code: '42501' });
    await assert.rejects(api.query('DELETE FROM saas.usage_projection'), { code: '42501' });
    const allProjection = (await api.query('SELECT * FROM saas.usage_projection')).rows;
    assert.doesNotMatch(JSON.stringify(allProjection), /CANARY|@qa\.invalid|filtro de ensayo|pieza de ensayo|password|token/i);
    assert.ok(allProjection.every(row => !(row.scope.startsWith('tenant:') && /^service\.(cpu|rss)/.test(row.metric))));
    Object.assign(result, { samplerFirstThenSecond: true, firstDiscontinuityPersistsInSql: true, buffer: { limitBytes: 4 * 1024 * 1024, occupiedBytes: boundedBytes, dropped: producer.dropped, failures: batches.length, maxBatchBytes: Math.max(...batches.map(batch => batch.bytes)), retrySequenceStable: true, recoverySucceeded: true }, unavailabilityIsNull: true, staleAsOfVisible: true, sensitiveCanariesAbsent: true, minimumPrivilegesVerified: true });
  } else if (stage === 'after') {
    const prior = JSON.parse(await readFile(`${resultRoot}/observability-before.json`, 'utf8'));
    assert.notEqual(worker.clockOwner, prior.worker.clockOwner, 'WORKER_NOT_RESTARTED');
    assert.equal(worker.controlGeneration, prior.worker.controlGeneration, 'CONTROL_GENERATION_RESET');
    assert.ok(BigInt(worker.tick) >= BigInt(prior.worker.tick), 'CLOCK_RESET');
    const retained = (await api.query("SELECT count(*)::int AS n FROM saas.usage_projection WHERE source_id='qa-private-worker' AND generation=$1 AND scope='service:worker'", [prior.worker.clockOwner])).rows[0].n;
    assert.ok(retained >= 4, 'PREVIOUS_GENERATION_DISAPPEARED');
    Object.assign(result, { restartedWorkerNewSeries: true, previousGenerationRetained: true, initialCpuAndRssDiscontinuityAfterRestart: true, counterNotReset: true });
  }
  result.result = 'PASS';
  await writeFile(`${resultRoot}/observability-${stage}.json`, JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ result: 'FAIL', stage, code: error.code ?? error.message ?? 'OBSERVABILITY_FAILED' }));
  process.exitCode = 1;
} finally {
  await Promise.allSettled(pools.map(pool => pool.end()));
}
