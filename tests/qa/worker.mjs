// Private QA composition; no HTTP server, fixture issuer, tenant credential or host socket.
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { createPgPool, validateConnection } from '../../server/saas/db/pools.js';
import { createClock } from '../../server/saas/admission/clock.js';
import { validateClockTransfer } from '../../server/saas/admission/transfer.js';
import { clockDiagnostic } from '../../server/saas/admission/diagnostics.js';
import { createReconciler } from '../../server/saas/admission/maintenance.js';
import { createPolicyAdmin } from '../../server/saas/admission/policy-admin.js';
import { ProjectionProducer } from '../../server/saas/observability/producer.js';
import { createProjectionRepository, createDatabaseSampler, createServiceSampler } from '../../server/saas/observability/repository.js';

let config;
try { config = JSON.parse(await readFile('/run/qa-secrets/worker.json', 'utf8')); }
catch { throw new Error('QA_WORKER_CONFIG_INVALID'); }
if (config.connections || config.entries || config.sessionSecret) throw new Error('WORKER_EXCESS_AUTHORITY');
const pools = [];
async function ownPool(connection, user) {
  const safe = validateConnection(connection);
  if (safe.user !== user || safe.database !== 'mecanet_control') throw new Error('WORKER_ROLE_MISMATCH');
  const pool = await createPgPool({ ...safe, max: 1, connectionTimeoutMillis: 2000, statement_timeout: 500, lock_timeout: 300, application_name: `mecanet-qa-${user}` });
  pools.push(pool);
  await pool.query('SELECT 1'); // Bootstrap TLS before readiness; never relax a request deadline.
  return pool;
}
let stopped = false; let auxiliary = null; let lastMaintenance = -Infinity; let lastAuxiliary = -Infinity;
let clock; let producer;
function stop() { stopped = true; clock?.stop(); producer?.stop(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);

try {
  const clockPool = await ownPool(config.connection, 'saas_clock');
  const measurePool = config.measurementConnection ? await ownPool(config.measurementConnection, 'saas_measure') : null;
  const reconciliationPool = config.reconcilerConnection ? await ownPool(config.reconcilerConnection, 'saas_reconciler') : null;
  const policyPool = config.policyConnection ? await ownPool(config.policyConnection, 'saas_policy') : null;
  const previous = (await clockPool.query('SELECT owner,generation,tick,clock_version FROM saas.time_authority WHERE id=1')).rows[0];
  const transfer = validateClockTransfer(config.clockTransfer, previous, config.generation);
  clock = createClock({ pool: clockPool, generation: config.generation }); // New owner on every process start.
  await clock.acquire(transfer.previousOwner);

  const scopes = new Set(['control', 'demo', 'tenant:11111111-1111-4111-8111-111111111111', 'tenant:22222222-2222-4222-8222-222222222222', 'service:worker']);
  let databaseSample;
  if (measurePool) {
    const repository = createProjectionRepository({ pool: measurePool, scopes });
    producer = new ProjectionProducer({ scopes, generation: clock.owner, sourceId: 'qa-private-worker', publish: repository.publish });
    databaseSample = createDatabaseSampler({ pool: measurePool, scopes });
  }
  const serviceSample = createServiceSampler({ scope: 'service:worker', scopes });
  const reconciler = reconciliationPool ? createReconciler({ pool: reconciliationPool, generation: config.generation, verifyRunnerStopped: async () => { throw new Error('EXTERNAL_RUNNER_END_PROOF_REQUIRED'); } }) : null;
  const policy = policyPool ? createPolicyAdmin({ pool: policyPool, generation: config.generation, authorize: async () => { throw new Error('NO_OPERATOR_ACTIONS_IN_WORKER'); } }) : null;

  async function auxiliaryWork() {
    if (producer) await producer.tick({ databaseSample, serviceSample });
    const now = performance.now();
    if (now - lastMaintenance < 5000) return;
    lastMaintenance = now;
    if (reconciler) {
      await reconciler.detectAbandoned();
      await reconciler.expireWaiting();
      await reconciler.pruneWindows();
      // No automatic uncertain-ticket release: explicit trusted end proof is required.
    }
    if (policy) await policy.expireOverrides({ maintenanceActorId: clock.owner });
  }
  while (!stopped) {
    await delay(25);
    try { await clock.advance(); }
    catch (error) {
      const code = ['COMMIT_UNCERTAIN', 'ADMISSION_BUSY', '40001', '40P01', 'CLOCK_OWNER_CONFLICT'].includes(error.code) ? error.code : 'CLOCK_FAILED';
      console.error(JSON.stringify(clockDiagnostic('advance', error, clock.state())));
      if (code === 'COMMIT_UNCERTAIN') {
        try { await clock.reconcile(); }
        catch (reconcileError) {
          stop(); process.exitCode = 1;
          console.error(JSON.stringify(clockDiagnostic('reconcile', reconcileError, clock.state())));
        }
      } else if (!['ADMISSION_BUSY', '40001', '40P01'].includes(code)) { stop(); process.exitCode = 1; }
    }
    if (!stopped && !auxiliary && performance.now() - lastAuxiliary >= 1000) {
      lastAuxiliary = performance.now();
      auxiliary = auxiliaryWork().catch(() => { console.error('QA_AUXILIARY_UNAVAILABLE'); }).finally(() => { auxiliary = null; });
    }
  }
  if (auxiliary) await auxiliary;
} catch (error) {
  const code = error.code ?? error.message;
  console.error(['CLOCK_TRANSFER_PROOF_REQUIRED', 'WORKER_ROLE_MISMATCH', 'ADMISSION_BUSY', 'CLOCK_OWNER_CONFLICT'].includes(code) ? code : 'QA_WORKER_UNAVAILABLE');
  process.exitCode = 1;
} finally {
  stop();
  await Promise.allSettled(pools.map(pool => pool.end()));
}
