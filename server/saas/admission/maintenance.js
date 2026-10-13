import { UUID } from './policy.js';
import { serializable, AdmissionError } from './transaction.js';

export function validateEndEvidence(evidence) {
  if (!evidence || evidence.runnerStopped !== true || evidence.sqlSettled !== true || evidence.responseSettled !== true || !/^[a-zA-Z0-9:_-]{1,160}$/.test(evidence.reference ?? '')) throw new AdmissionError('END_NOT_PROVEN');
  return { reference: evidence.reference };
}

// A callback must verify the actual process/SQL/response boundary. This module never
// equates a lease timeout or absent heartbeat to proof that an old runner has ended.
export function createReconciler({ pool, generation, verifyRunnerStopped }) {
  if (!UUID.test(generation) || typeof verifyRunnerStopped !== 'function') throw new TypeError('Private reconciliation authority required');
  async function fence(client) {
    const row = (await client.query('UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 AND generation=$1 RETURNING tick', [generation])).rows[0];
    if (!row) throw new AdmissionError('GENERATION_MISMATCH');
    return row;
  }
  return {
    async detectAbandoned() {
      return serializable(pool, async client => {
        await fence(client);
        // Detection retains every reservation and active slot.
        return (await client.query("UPDATE saas.tickets SET state='UNCERTAIN' WHERE generation=$1 AND state='ACTIVE' AND heartbeat_at<clock_timestamp()-interval '15 seconds' RETURNING id", [generation])).rows.map(row => row.id);
      });
    },
    async expireWaiting() {
      return serializable(pool, async client => {
        await fence(client);
        return (await client.query("UPDATE saas.tickets SET state='EXPIRED',reserved_qc=0,reserved_qt=0,finished_at=clock_timestamp() WHERE generation=$1 AND state='WAITING' AND queue_expires_at<clock_timestamp() RETURNING id", [generation])).rows.map(row => row.id);
      });
    },
    async reconcile(ticketId) {
      if (!UUID.test(ticketId)) throw new TypeError('Opaque ticket ID required');
      const prior = (await pool.query('SELECT id,owner,generation,state FROM saas.tickets WHERE id=$1 AND generation=$2', [ticketId, generation])).rows[0];
      if (!prior || prior.state !== 'UNCERTAIN') throw new AdmissionError('RECONCILIATION_NOT_REQUIRED');
      const evidence = validateEndEvidence(await verifyRunnerStopped({ ticketId, owner: prior.owner, generation }));
      return serializable(pool, async client => {
        await fence(client);
        const row = (await client.query('SELECT id,owner,generation,state FROM saas.tickets WHERE id=$1 FOR UPDATE', [ticketId])).rows[0];
        if (!row || row.owner !== prior.owner || row.generation !== generation || row.state !== 'UNCERTAIN') throw new AdmissionError('RECONCILIATION_CONFLICT');
        await client.query('INSERT INTO saas.reconciliation_audit(ticket_id,owner,generation,reference) VALUES($1,$2,$3,$4)', [ticketId, prior.owner, generation, evidence.reference]);
        await client.query("UPDATE saas.tickets SET state='FINISHED',reserved_qc=0,reserved_qt=0,finished_at=clock_timestamp() WHERE id=$1", [ticketId]);
        return { id: ticketId, state: 'FINISHED' };
      });
    },
    async pruneWindows() {
      return serializable(pool, async client => {
        const row = await fence(client);
        // At most 100 obsolete rows per call; never delete live reserves/tickets/audit.
        return (await client.query('DELETE FROM saas.windows WHERE (scope_key,tick) IN (SELECT scope_key,tick FROM saas.windows WHERE tick<=$1::bigint-601 ORDER BY tick,scope_key LIMIT 100) RETURNING tick', [row.tick])).rowCount;
      });
    },
  };
}
