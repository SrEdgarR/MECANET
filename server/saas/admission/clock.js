import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { UUID } from './policy.js';
import { serializable, AdmissionError, CommitUncertainError } from './transaction.js';

// Private worker only. Never include the clock credential in the API configuration.
export function createClock({ pool, generation, owner = randomUUID(), recoveryTransfer=null, now = () => performance.now() }) {
  if (!UUID.test(generation) || !UUID.test(owner)) throw new TypeError('Clock identity required');
  if(recoveryTransfer&&(recoveryTransfer.generation!==generation||recoveryTransfer.nextOwner!==owner||!UUID.test(recoveryTransfer.runId??'')||!/^[a-f0-9]{64}$/.test(recoveryTransfer.manifestHash??'')))throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
  const nextVersion=value=>{const n=BigInt(value);if(n<0n||n>=9223372036854775807n)throw new AdmissionError('CLOCK_VERSION_CLOSED');return String(n+1n)};
  let lastCommit = now(); let current = null; let uncertain = false; let inFlight = false; let stopped = false;let expectedAfter=null;
  async function acquire(expectedOwner) {
    if (!UUID.test(expectedOwner) || current || inFlight) throw new TypeError('Expected previous clock owner required');
    if(uncertain||stopped)throw new AdmissionError('CLOCK_OWNER_CONFLICT');
    if(recoveryTransfer&&expectedOwner!==recoveryTransfer.previousOwner)throw new AdmissionError('CLOCK_OWNER_CONFLICT');
    inFlight = true;
    try {
      current = await serializable(pool, async client => {
        const f = (await client.query(`SELECT generation,tick,clock_version${recoveryTransfer?',recovery_id':''} FROM saas.admission_fence WHERE id=1 FOR UPDATE`)).rows[0];
        const t = (await client.query('SELECT owner,generation,tick,clock_version FROM saas.time_authority WHERE id=1 FOR UPDATE')).rows[0];
        if (!f || !t || t.owner !== expectedOwner || f.generation !== generation || t.generation !== generation || f.tick !== t.tick || f.clock_version !== t.clock_version) throw new AdmissionError('CLOCK_OWNER_CONFLICT');
        if(recoveryTransfer){
          if(f.recovery_id!==recoveryTransfer.runId||String(f.clock_version)!==recoveryTransfer.expectedClockVersion||String(f.tick)!==recoveryTransfer.expectedTick)throw new AdmissionError('CLOCK_OWNER_CONFLICT');
          const allowed=(await client.query('SELECT saas.recovery_clock_guard($1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::text,$8::bigint,$9::bigint) AS allowed',[generation,recoveryTransfer.runId,recoveryTransfer.manifestHash,expectedOwner,owner,recoveryTransfer.transferId,recoveryTransfer.transferHash,recoveryTransfer.expectedClockVersion,recoveryTransfer.expectedTick])).rows[0];
          if(allowed?.allowed!==true)throw new AdmissionError('CLOCK_OWNER_CONFLICT');
        }
        const version = nextVersion(f.clock_version);expectedAfter={tick:String(f.tick),version};
        await client.query('UPDATE saas.admission_fence SET clock_version=$1 WHERE id=1', [version]);
        await client.query('UPDATE saas.time_authority SET owner=$1,clock_version=$2,advanced_at=clock_timestamp() WHERE id=1', [owner, version]);
        return { tick: String(f.tick), version };
      });
      lastCommit = now(); return owner;
    } catch (error) { if (error instanceof CommitUncertainError||error.code==='ROLLBACK_UNCERTAIN') uncertain = true;else expectedAfter=null;throw error; }
    finally { inFlight = false; }
  }
  async function reconcile() {
    const row = (await pool.query(`SELECT f.generation,f.tick,f.clock_version,t.owner,t.tick AS authority_tick,t.clock_version AS authority_version,t.generation AS authority_generation${recoveryTransfer?',f.recovery_id':''} FROM saas.admission_fence f JOIN saas.time_authority t USING(id) WHERE f.id=1`)).rows[0];
    if (!row || row.generation !== generation || row.owner !== owner || row.tick !== row.authority_tick || row.clock_version !== row.authority_version) throw new AdmissionError('CLOCK_OWNER_CONFLICT');
    const expected=uncertain?expectedAfter:current;
    if((row.authority_generation!==undefined&&row.authority_generation!==generation)||(recoveryTransfer&&row.recovery_id!==recoveryTransfer.runId)||!expected||String(row.tick)!==expected.tick||String(row.clock_version)!==expected.version)throw new AdmissionError('CLOCK_OWNER_CONFLICT');
    current = { tick: String(row.tick), version: String(row.clock_version) }; uncertain = false; lastCommit = now(); return current;
  }
  async function advance() {
    if (stopped || inFlight || !current || uncertain || now() - lastCommit < 100) return false;
    inFlight = true;
    try {
      const next = { tick: nextVersion(current.tick), version: nextVersion(current.version) };expectedAfter=next;
      await serializable(pool, async client => {
        // A real UPDATE invalidates old SERIALIZABLE snapshots; a lock alone is insufficient.
        const f = await client.query(`UPDATE saas.admission_fence SET tick=$1,clock_version=$2 WHERE id=1 AND generation=$3 AND tick=$4 AND clock_version=$5${recoveryTransfer?' AND recovery_id=$6::uuid':''} RETURNING tick`, [next.tick, next.version, generation, current.tick, current.version,...(recoveryTransfer?[recoveryTransfer.runId]:[])]);
        if (f.rowCount !== 1) throw new AdmissionError('CLOCK_OWNER_CONFLICT');
        const t = await client.query('UPDATE saas.time_authority SET tick=$1,clock_version=$2,advanced_at=clock_timestamp() WHERE id=1 AND owner=$3 AND generation=$4 AND tick=$5 AND clock_version=$6 RETURNING tick', [next.tick, next.version, owner, generation, current.tick, current.version]);
        if (t.rowCount !== 1) throw new AdmissionError('CLOCK_OWNER_CONFLICT');
      });
      current = next; lastCommit = now(); return true;
    } catch (error) { if (error instanceof CommitUncertainError||error.code==='ROLLBACK_UNCERTAIN') uncertain = true;else expectedAfter=null;throw error; }
    finally { inFlight = false; }
  }
  return { owner, acquire, reconcile, advance, stop() { stopped = true; }, state: () => ({ ...current, uncertain, stopped }) };
}
