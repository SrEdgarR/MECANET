import { appendFileSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

// Exclusive synthetic QA tracing. No SQL text, input values or connection metadata.
// The file remains private and stops growing at the finite sample/byte envelope.
export function createTransactionProbe(pool, { instance, root = '/run/qa-faults', write = null, now = () => performance.now(), checkpoint = async () => {} }) {
  if (!['api1', 'api2'].includes(instance) || root !== '/run/qa-faults') throw new TypeError('Exclusive QA transaction probe required');
  let samples = 0; let bytes = 0;
  if (!write) {
    mkdirSync(`${root}/${instance}`, { recursive: true, mode: 0o700 });
    try { bytes = statSync(`${root}/${instance}/transactions.ndjson`).size; samples = bytes > 1024 * 1024 ? 2048 : readFileSync(`${root}/${instance}/transactions.ndjson`, 'utf8').split('\n').filter(Boolean).length; }
    catch (error) { if (error.code !== 'ENOENT') { bytes = 1024 * 1024; samples = 2048; } }
  }
  const sink = write ?? (value => appendFileSync(`${root}/${instance}/transactions.ndjson`, value, { mode: 0o600 }));
  function emit(event) {
    const line = `${JSON.stringify({ type: 'qa-admission-transaction', instance, ...event })}\n`;
    const size = Buffer.byteLength(line);
    if (samples >= 2048 || bytes + size > 1024 * 1024) return;
    samples += 1; bytes += size;
    try { sink(line); } catch { /* Missing diagnostic evidence must never grant authority. */ }
  }
  return {
    query: (...args) => pool.query(...args),
    async connect() {
      const acquired = await pool.connect(); let current = null;
      const finish = result => {
        if (!current) return;
        emit({ durationMs: Math.max(0, Math.round((now() - current.started) * 1000) / 1000), queries: current.queries, conflicts: current.conflicts, result });
        current = null;
      };
      return {
        async query(sql, values) {
          const text = typeof sql === 'string' ? sql : sql?.text;
          if (text === 'BEGIN ISOLATION LEVEL SERIALIZABLE') current = { started: now(), queries: 0, conflicts: 0 };
          if (current) current.queries += 1;
          try {
            const result = await acquired.query(sql, values);
            if (current && typeof text === 'string' && text.startsWith('UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 RETURNING')) await checkpoint('admission.transaction.fence');
            if (text === 'COMMIT') finish('COMMIT');
            else if (text === 'ROLLBACK') finish('ROLLBACK');
            return result;
          } catch (error) {
            if (current && ['40001', '40P01'].includes(error?.code)) current.conflicts += 1;
            throw error;
          }
        },
        release(error) { finish(error ? 'DISCARDED' : 'RELEASED_WITHOUT_COMMIT'); acquired.release(error); },
      };
    },
    end: (...args) => pool.end(...args),
  };
}
