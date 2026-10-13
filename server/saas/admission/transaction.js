import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

export class AdmissionError extends Error {
  constructor(code, status = 503) { super(code); this.name = 'AdmissionError'; this.code = code; this.status = status; }
}
export class CommitUncertainError extends AdmissionError {
  constructor(cause) { super('COMMIT_UNCERTAIN'); this.cause = cause; }
}
export class RollbackUncertainError extends AdmissionError {
  constructor(cause, operationCause) { super('ROLLBACK_UNCERTAIN'); this.cause = cause; this.operationCause = operationCause; }
}
const pendingAcquisitions = new WeakMap();
async function acquireBefore(pool, deadline) {
  const queued = pendingAcquisitions.get(pool) ?? 0;
  if (queued >= 16 || performance.now() >= deadline) throw new AdmissionError('ADMISSION_BUSY');
  pendingAcquisitions.set(pool, queued + 1);
  let expired = false; let timer;
  const acquired = pool.connect().then(client => {
    if (expired) { client.release(); return null; }
    return client;
  }).finally(() => pendingAcquisitions.set(pool, (pendingAcquisitions.get(pool) ?? 1) - 1));
  try { return await Promise.race([acquired, new Promise((_resolve, reject) => { timer = setTimeout(() => { expired = true; reject(new AdmissionError('ADMISSION_BUSY')); }, Math.max(1, deadline - performance.now())); })]); }
  finally { clearTimeout(timer); }
}

// The callback may only change central control state; never execute tenant work here.
export async function serializable(pool, callback, { deadline = performance.now() + 500 } = {}) {
  for (let attempt = 0; attempt < 3 && performance.now() < deadline; attempt++) {
    const client = await acquireBefore(pool, deadline);
    let committing = false;
    let discard;
    const boundedClient = {
      async query(sql, values) {
        let timer;
        if (performance.now() >= deadline) { discard = new AdmissionError('ADMISSION_BUSY'); throw discard; }
        try {
          return await Promise.race([client.query(sql, values), new Promise((_resolve, reject) => { timer = setTimeout(() => { discard = new AdmissionError('ADMISSION_BUSY'); reject(discard); }, Math.max(1, deadline - performance.now())); })]);
        } finally { clearTimeout(timer); }
      },
    };
    try {
      const remaining = Math.floor(deadline - performance.now());
      if (remaining <= 0) throw new AdmissionError('ADMISSION_BUSY');
      await boundedClient.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await boundedClient.query("SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $1, true), set_config('synchronous_commit', 'on', true)", [`${remaining}ms`]);
      const result = await callback(boundedClient);
      if (performance.now() >= deadline) throw new AdmissionError('ADMISSION_BUSY');
      committing = true;
      await boundedClient.query('COMMIT');
      return result;
    } catch (error) {
      const conflict = error.code === '40001' || error.code === '40P01';
      if (committing && !conflict) { discard = error; throw new CommitUncertainError(error); }
      if (discard) throw error; // Destroy connection; do not wait beyond deadline for a blocked rollback.
      try { await boundedClient.query('ROLLBACK'); }
      catch (rollbackError) {
        discard = rollbackError;
        // The original business rejection is not evidence that SQL ended.
        // Neither a 4xx alias nor a retryable conflict may escape this unknown
        // boundary or cause another attempt after a missing ROLLBACK ACK.
        throw new RollbackUncertainError(rollbackError, error);
      }
      if (!conflict) throw error;
      if (attempt === 2 || performance.now() + 5 >= deadline) throw new AdmissionError('ADMISSION_BUSY');
    } finally { client.release(discard); }
    await delay(Math.min(4, Math.max(0, deadline - performance.now())));
  }
  throw new AdmissionError('ADMISSION_BUSY');
}
