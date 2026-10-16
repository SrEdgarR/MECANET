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
async function acquireBefore(pool, deadline, trace) {
  const queued = pendingAcquisitions.get(pool) ?? 0;
  trace.pendingAcquisitionsAtEntry = queued;
  if (queued >= 16 || performance.now() >= deadline) {
    trace.reason = queued >= 16 ? 'POOL_QUEUE_LIMIT' : 'POOL_ACQUIRE_DEADLINE';
    throw new AdmissionError('ADMISSION_BUSY');
  }
  pendingAcquisitions.set(pool, queued + 1);
  let expired = false; let timer;
  const acquired = pool.connect().then(client => {
    if (expired) { client.release(); return null; }
    return client;
  }).finally(() => pendingAcquisitions.set(pool, (pendingAcquisitions.get(pool) ?? 1) - 1));
  try { return await Promise.race([acquired, new Promise((_resolve, reject) => { timer = setTimeout(() => { expired = true; trace.reason = 'POOL_ACQUIRE_DEADLINE'; reject(new AdmissionError('ADMISSION_BUSY')); }, Math.max(1, deadline - performance.now())); })]); }
  finally { clearTimeout(timer); }
}

// The callback may only change central control state; never execute tenant work here.
export async function serializable(pool, callback, { deadline = performance.now() + 500, onDiagnostic = null } = {}) {
  if (onDiagnostic !== null && typeof onDiagnostic !== 'function') throw new TypeError('Private diagnostic sink required');
  const started = performance.now();
  const trace = { phase:'acquire', reason:'POOL_ERROR', triggerReason:null, attempts:0, queries:0, conflicts:0, lastConflictCode:null, pendingAcquisitionsAtEntry:0, backendPid:null, statement:'NOT_DISPATCHED', failureStatement:null, sqlEnd:'NOT_DISPATCHED', lastPositiveSqlFin:null, connection:'NOT_ACQUIRED' };
  // Fixed classifications only: never retain SQL text, values or a driver message.
  const statement = sql => {
    if(typeof sql!=='string')return 'OTHER_CONTROL_QUERY';
    if(sql==='BEGIN ISOLATION LEVEL SERIALIZABLE')return 'BEGIN';
    if(sql==='COMMIT'||sql==='ROLLBACK')return sql;
    if(sql.startsWith("SELECT set_config('statement_timeout'"))return 'TIMEOUT_CONFIGURATION';
    if(sql.startsWith('UPDATE saas.admission_fence SET tick='))return 'CLOCK_FENCE_CAS';
    if(sql.startsWith('UPDATE saas.admission_fence SET clock_version='))return 'CLOCK_ACQUIRE_FENCE';
    if(sql.startsWith('UPDATE saas.time_authority SET owner='))return 'CLOCK_ACQUIRE_AUTHORITY';
    if(sql.startsWith('UPDATE saas.time_authority SET tick='))return 'CLOCK_AUTHORITY_CAS';
    if(sql.startsWith('SELECT saas.recovery_clock_guard('))return 'CLOCK_TRANSFER_GUARD';
    if(sql.startsWith('UPDATE saas.admission_fence SET admission_version='))return 'ADMISSION_FENCE_CAS';
    return 'OTHER_CONTROL_QUERY';
  };
  const safeCode = error => ['ADMISSION_BUSY','COMMIT_UNCERTAIN','ROLLBACK_UNCERTAIN','40001','40P01','53300','57014','57P01','08006','ECONNRESET','ECONNREFUSED','ETIMEDOUT','CLOCK_OWNER_CONFLICT','CLOCK_VERSION_CLOSED'].includes(error?.code) ? error.code : 'UNKNOWN';
  const report = (outcome, error) => {
    const event=Object.freeze({schema:'admission-transaction-diagnostic-v1',outcome,...trace,lastPositiveSqlFin:trace.lastPositiveSqlFin&&Object.freeze({...trace.lastPositiveSqlFin}),code:error?safeCode(error):null,elapsedMs:Math.max(0,Math.round((performance.now()-started)*1000)/1000)});
    if(error&&typeof error==='object'){try{Object.defineProperty(error,'admissionDiagnostic',{value:event,configurable:true,enumerable:false})}catch{/* A diagnostic cannot replace the original rejection. */}}
    try{const pending=onDiagnostic?.(event);if(pending&&typeof pending.then==='function')Promise.resolve(pending).catch(()=>{})}catch{/* An unavailable private sink must not change authority or transaction results. */}
  };
  const fin = kind => {trace.sqlEnd=kind;trace.lastPositiveSqlFin={kind,atMonotonicMs:performance.now()}};
  try {
  for (let attempt = 0; attempt < 3 && performance.now() < deadline; attempt++) {
    trace.attempts=attempt+1;trace.phase='acquire';trace.reason='POOL_ERROR';trace.sqlEnd='NOT_DISPATCHED';trace.statement='NOT_DISPATCHED';
    const client = await acquireBefore(pool, deadline, trace);trace.connection='ACQUIRED';
    trace.backendPid=Number.isSafeInteger(client.processID)&&client.processID>0?client.processID:null;
    let committing = false;
    let discard;
    const boundedClient = {
      async query(sql, values) {
        let timer;
        if (performance.now() >= deadline) { trace.reason='CONTROL_DEADLINE';discard = new AdmissionError('ADMISSION_BUSY'); throw discard; }
        try {
          trace.queries++;trace.sqlEnd='UNKNOWN';trace.statement=statement(sql);
          return await Promise.race([client.query(sql, values), new Promise((_resolve, reject) => { timer = setTimeout(() => { trace.reason='QUERY_DEADLINE';discard = new AdmissionError('ADMISSION_BUSY'); reject(discard); }, Math.max(1, deadline - performance.now())); })]);
        } finally { clearTimeout(timer); }
      },
    };
    try {
      const remaining = Math.floor(deadline - performance.now());
      if (remaining <= 0) {trace.reason='CONTROL_DEADLINE';throw new AdmissionError('ADMISSION_BUSY');}
      trace.phase='begin';trace.reason='SQL_ERROR';
      await boundedClient.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      trace.phase='configure';
      await boundedClient.query("SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $1, true), set_config('synchronous_commit', 'on', true)", [`${remaining}ms`]);
      trace.phase='work';trace.statement='WORK_CALLBACK';
      const result = await callback(boundedClient);
      if (performance.now() >= deadline) {trace.reason='CONTROL_DEADLINE';throw new AdmissionError('ADMISSION_BUSY');}
      committing = true;trace.phase='commit';
      await boundedClient.query('COMMIT');
      fin('COMMIT_ACK');trace.reason='COMMIT_ACK';
      return result;
    } catch (error) {
      trace.failureStatement=trace.statement;
      const conflict = error.code === '40001' || error.code === '40P01';
      if(conflict){trace.conflicts++;trace.lastConflictCode=error.code;}
      if (committing && !conflict) { trace.triggerReason=trace.reason;trace.reason='COMMIT_ACK_UNKNOWN';discard = error; throw new CommitUncertainError(error); }
      // Destroying a client is not an acknowledgement that its transaction ended.
      // Preserve the unknown boundary; in particular the clock must not treat a
      // deadline during an UPDATE as a known, rolled-back ADMISSION_BUSY result.
      if (discard) {trace.triggerReason=trace.reason;trace.reason='ROLLBACK_ACK_UNKNOWN';throw new RollbackUncertainError(discard, error);}
      try { await boundedClient.query('ROLLBACK');fin('ROLLBACK_ACK'); }
      catch (rollbackError) {
        trace.triggerReason=trace.reason;trace.phase='rollback';trace.reason='ROLLBACK_ACK_UNKNOWN';
        discard = rollbackError;
        // The original business rejection is not evidence that SQL ended.
        // Neither a 4xx alias nor a retryable conflict may escape this unknown
        // boundary or cause another attempt after a missing ROLLBACK ACK.
        throw new RollbackUncertainError(rollbackError, error);
      }
      if (!conflict) throw error;
      if (attempt === 2 || performance.now() + 5 >= deadline) {trace.reason=attempt===2?'CONFLICT_RETRY_EXHAUSTED':'CONFLICT_DEADLINE';throw new AdmissionError('ADMISSION_BUSY');}
    } finally { trace.connection=discard?'DISCARDED':'RETURNED';client.release(discard); }
    await delay(Math.min(4, Math.max(0, deadline - performance.now())));
  }
  trace.reason=trace.conflicts?'CONFLICT_DEADLINE':'CONTROL_DEADLINE';throw new AdmissionError('ADMISSION_BUSY');
  } catch(error) {report('REJECTED',error);throw error;}
  finally {if(trace.reason==='COMMIT_ACK')report('COMMITTED');}
}
