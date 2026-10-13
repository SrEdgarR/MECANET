import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { calculateUsage, checkBudget, scopesFor, ClockObservation, UUID } from './policy.js';
import { serializable, AdmissionError, CommitUncertainError } from './transaction.js';

export { AdmissionError, CommitUncertainError } from './transaction.js';

const live = "('WAITING','ACTIVE','UNCERTAIN')";
const terminal = new Set(['FINISHED', 'REJECTED', 'EXPIRED']);

export function createAdmission({ pool, owner, generation, monotonicNow = () => performance.now() }) {
  if (!pool?.connect || !UUID.test(owner) || !UUID.test(generation)) throw new TypeError('Explicit admission pool/owner/generation required');
  const clock = new ClockObservation({ generation, now: monotonicNow });

  async function observeClock() {
    try {
      const { rows } = await pool.query('SELECT generation, tick, clock_version, barrier FROM saas.admission_fence WHERE id=1');
      return clock.observe(rows[0]);
    } catch { clock.blocked = true; return false; }
  }
  async function fence(client, allowBarrier = false) {
    const { rows } = await client.query('UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 RETURNING generation,tick,clock_version,admission_version,barrier');
    const row = rows[0];
    if (!row || row.generation !== generation || (!allowBarrier && row.barrier)) throw new AdmissionError('ADMISSION_CLOSED');
    const authority = (await client.query('SELECT generation,tick,clock_version FROM saas.time_authority WHERE id=1')).rows[0];
    if (!authority || authority.generation !== row.generation || authority.tick !== row.tick || authority.clock_version !== row.clock_version) throw new AdmissionError('CLOCK_INCONSISTENT');
    return row;
  }
  async function lockScopes(client, scopes, { allowExpired = false } = {}) {
    const policies = [];
    // Explicit ordered individual locks: global, lane, tenant total, tenant lane.
    for (const scope of scopes) {
      const { rows } = await client.query('SELECT p.scope_key,p.version,p.limits,p.override_expires_at, clock_timestamp() AS checked_at FROM saas.policies p JOIN saas.admission_scopes s USING(scope_key) WHERE p.scope_key=$1 FOR UPDATE OF s', [scope]);
      if (rows.length !== 1 || (!allowExpired && rows[0].override_expires_at && rows[0].override_expires_at <= rows[0].checked_at)) throw new AdmissionError('POLICY_UNAVAILABLE');
      policies.push(rows[0]);
    }
    return policies;
  }
  async function usage(client, scope, tick) {
    const { rows } = await client.query('SELECT tick,qh,qc,qt FROM saas.windows WHERE scope_key=$1 AND tick>$2::bigint-601', [scope, tick]);
    const counts = (await client.query(`SELECT count(*) FILTER (WHERE state IN ('ACTIVE','UNCERTAIN'))::int AS active, count(*) FILTER (WHERE state='WAITING')::int AS waiting, coalesce(sum(reserved_qc),0)::bigint AS reserved_qc, coalesce(sum(reserved_qt),0)::bigint AS reserved_qt FROM saas.tickets WHERE scopes @> ARRAY[$1]::text[] AND state IN ${live}`, [scope])).rows[0];
    return { ...calculateUsage(rows, tick), active: Number(counts.active), waiting: Number(counts.waiting), reservedQc: Number(counts.reserved_qc), reservedQt: Number(counts.reserved_qt) };
  }
  async function addWindow(client, scopes, tick, { qh = 0, qc = 0, qt = 0 }) {
    for (const scope of scopes) await client.query('INSERT INTO saas.windows(scope_key,tick,qh,qc,qt) VALUES($1,$2,$3,$4,$5) ON CONFLICT(scope_key,tick) DO UPDATE SET qh=saas.windows.qh+EXCLUDED.qh,qc=saas.windows.qc+EXCLUDED.qc,qt=saas.windows.qt+EXCLUDED.qt', [scope, tick, qh, qc, qt]);
  }
  async function loadTicket(client, id) {
    if (!UUID.test(id)) throw new AdmissionError('INVALID_TICKET', 404);
    const { rows } = await client.query('SELECT * FROM saas.tickets WHERE id=$1 AND owner=$2 AND generation=$3 FOR UPDATE', [id, owner, generation]);
    if (!rows[0]) throw new AdmissionError('TICKET_NOT_FOUND', 404);
    return rows[0];
  }
  async function lookup(id) {
    if (!UUID.test(id)) throw new AdmissionError('INVALID_TICKET', 404);
    const { rows } = await pool.query('SELECT id,tenant_id,lane,state,generation,work_started FROM saas.tickets WHERE id=$1 AND owner=$2 AND generation=$3', [id, owner, generation]);
    return rows[0] ?? null;
  }
  async function admit({ tenantId, lane = 'ordinary', kind = 'HTTP', reserveBytes = 1024 * 1024 }) {
    const entry = ['auth', 'operator'].includes(lane);
    if (entry && (tenantId !== null || kind !== 'HTTP' || reserveBytes > 65536)) throw new TypeError('Entry envelope has no tenant and a 64KiB response bound');
    const scopes = entry ? [`entry:${lane}`] : scopesFor(tenantId, lane);
    if (!['HTTP', 'JOB'].includes(kind) || !Number.isSafeInteger(reserveBytes) || reserveBytes < 0 || reserveBytes > 1024 * 1024) throw new TypeError('Unbounded admission request');
    if (!clock.ready()) throw new AdmissionError('CLOCK_UNAVAILABLE');
    const id = randomUUID();
    try {
      return await serializable(pool, async client => {
        const current = await fence(client);
        const policies = await lockScopes(client, scopes);
        for (const policy of policies) {
          const denied = checkBudget(policy.limits, await usage(client, policy.scope_key, current.tick), { qh: kind === 'HTTP' ? 1 : 0, qc: 1, qt: reserveBytes, waiting: 1 });
          if (denied) throw new AdmissionError(policy.scope_key.startsWith('tenant:') ? 'TENANT_QUOTA' : 'GLOBAL_QUOTA', policy.scope_key.startsWith('tenant:') ? 429 : 503);
        }
        await addWindow(client, scopes, current.tick, { qh: kind === 'HTTP' ? 1 : 0 });
        await client.query("INSERT INTO saas.tickets(id,tenant_id,lane,operation_kind,owner,generation,state,scopes,policy_versions,created_tick,queue_expires_at,reserved_qc,reserved_qt) VALUES($1,$2,$3,$4,$5,$6,'WAITING',$7,$8,$9,clock_timestamp()+interval '2 seconds',1,$10)", [id, tenantId, lane, kind, owner, generation, scopes, Object.fromEntries(policies.map(p => [p.scope_key, p.version])), current.tick, reserveBytes]);
        return { id, state: 'WAITING', tenantId, lane, generation };
      });
    } catch (error) {
      if (error instanceof CommitUncertainError) { error.ticketId = id; error.reconcile = () => lookup(id); }
      throw error; // Even a found WAITING ticket is not permission to repeat this admission.
    }
  }
  async function ticketTransaction(id, operation, { allowBarrier = false } = {}) {
    return serializable(pool, async client => {
      const current = await fence(client, allowBarrier);
      // Only a non-locking identity read precedes scope locks. The fence serializes all mutations.
      const head = (await client.query('SELECT scopes FROM saas.tickets WHERE id=$1 AND owner=$2 AND generation=$3', [id, owner, generation])).rows[0];
      if (!head) throw new AdmissionError('TICKET_NOT_FOUND', 404);
      const policies = await lockScopes(client, head.scopes, { allowExpired: allowBarrier });
      const ticket = await loadTicket(client, id);
      return operation(client, current, policies, ticket);
    });
  }
  async function claim(id, { revalidate } = {}) {
    if (!clock.ready()) throw new AdmissionError('CLOCK_UNAVAILABLE');
    if (typeof revalidate !== 'function') throw new TypeError('Claim requires fresh authority validation');
    await revalidate(); // New READ COMMITTED authority read before the admission transaction.
    return ticketTransaction(id, async (client, current, policies, ticket) => {
      if (ticket.state !== 'WAITING') return { id, state: ticket.state, claimed: false };
      const expired = (await client.query('SELECT clock_timestamp()>$1 AS expired', [ticket.queue_expires_at])).rows[0].expired;
      if (expired) { await client.query("UPDATE saas.tickets SET state='EXPIRED',reserved_qc=0,reserved_qt=0,finished_at=clock_timestamp() WHERE id=$1", [id]); return { id, state: 'EXPIRED', claimed: false }; }
      for (const policy of policies) {
        const count = await usage(client, policy.scope_key, current.tick);
        // Queue reservations were already admitted. Reduction may block claims without deleting debt.
        if (count.active >= policy.limits.active || checkBudget(policy.limits, { ...count, waiting: 0 }, {})) return { id, state: 'WAITING', claimed: false };
      }
      if (ticket.tenant_id === null) {
        const head = (await client.query("SELECT id FROM saas.tickets WHERE lane=$1 AND state='WAITING' AND queue_expires_at>clock_timestamp() ORDER BY created_at,id LIMIT 1", [ticket.lane])).rows[0];
        if (head?.id !== id) return { id, state: 'WAITING', claimed: false };
        await client.query("UPDATE saas.tickets SET state='ACTIVE',heartbeat_at=clock_timestamp(),policy_versions=$2 WHERE id=$1", [id, Object.fromEntries(policies.map(p => [p.scope_key, p.version]))]);
        return { id, state: 'ACTIVE', claimed: true };
      }
      // FIFO per tenant; circular last-turn order across eligible tenant heads, same lane.
      const heads = (await client.query("SELECT DISTINCT ON(t.tenant_id) t.id,t.tenant_id,t.scopes,t.created_at,s.last_turn FROM saas.tickets t JOIN saas.admission_scopes s ON s.scope_key='tenant:'||t.tenant_id::text WHERE t.state='WAITING' AND t.lane=$1 AND t.queue_expires_at>clock_timestamp() ORDER BY t.tenant_id,t.created_at,t.id", [ticket.lane])).rows;
      heads.sort((a, b) => Number(BigInt(a.last_turn) - BigInt(b.last_turn)) || a.created_at - b.created_at || a.id.localeCompare(b.id));
      let selected;
      for (const head of heads) {
        let fits = true;
        for (const scope of head.scopes.filter(s => s.startsWith('tenant:'))) {
          const policy = (await client.query('SELECT limits,override_expires_at FROM saas.policies WHERE scope_key=$1', [scope])).rows[0];
          const count = await usage(client, scope, current.tick);
          if (!policy || (policy.override_expires_at && policy.override_expires_at <= new Date()) || count.active >= policy.limits.active || checkBudget(policy.limits, { ...count, waiting: 0 }, {})) { fits = false; break; }
        }
        if (fits) { selected = head.id; break; }
      }
      if (selected !== id) return { id, state: 'WAITING', claimed: false };
      await client.query('UPDATE saas.admission_scopes SET last_turn=$1 WHERE scope_key=$2', [current.admission_version, `tenant:${ticket.tenant_id}`]);
      await client.query("UPDATE saas.tickets SET state='ACTIVE',heartbeat_at=clock_timestamp(),policy_versions=$2 WHERE id=$1", [id, Object.fromEntries(policies.map(p => [p.scope_key, p.version]))]);
      return { id, state: 'ACTIVE', claimed: true };
    });
  }
  async function startWork(id) {
    if (!clock.ready()) throw new AdmissionError('CLOCK_UNAVAILABLE');
    return ticketTransaction(id, async (client, current, policies, ticket) => {
      if (ticket.state !== 'ACTIVE' || ticket.work_started) throw new AdmissionError('WORK_ALREADY_STARTED');
      await addWindow(client, ticket.scopes, current.tick, { qc: Number(ticket.reserved_qc) });
      await client.query('UPDATE saas.tickets SET work_started=true,reserved_qc=0,heartbeat_at=clock_timestamp() WHERE id=$1', [id]);
      return true;
    });
  }
  async function consumeBytes(id, bytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new TypeError('Invalid measured payload');
    if (!clock.ready()) throw new AdmissionError('CLOCK_UNAVAILABLE');
    return ticketTransaction(id, async (client, current, policies, ticket) => {
      if (ticket.state !== 'ACTIVE' || !ticket.work_started || bytes > Number(ticket.reserved_qt)) throw new AdmissionError('PAYLOAD_EXCEEDS_RESERVATION');
      await addWindow(client, ticket.scopes, current.tick, { qt: bytes });
      await client.query('UPDATE saas.tickets SET reserved_qt=reserved_qt-$2 WHERE id=$1', [id, bytes]);
      return true;
    });
  }
  async function finish(id, { sqlSettled, responseSettled } = {}) {
    if (sqlSettled !== true || responseSettled !== true) throw new AdmissionError('END_NOT_PROVEN');
    return ticketTransaction(id, async (client, _current, _policies, ticket) => {
      if (terminal.has(ticket.state)) return { id, state: ticket.state };
      if (ticket.state === 'UNCERTAIN') throw new AdmissionError('RECONCILIATION_REQUIRED');
      await client.query("UPDATE saas.tickets SET state=$2,reserved_qc=0,reserved_qt=0,finished_at=clock_timestamp() WHERE id=$1", [id, ticket.state === 'WAITING' ? 'REJECTED' : 'FINISHED']);
      return { id, state: ticket.state === 'WAITING' ? 'REJECTED' : 'FINISHED' };
    }, { allowBarrier: true });
  }
  async function heartbeat(id) { return ticketTransaction(id, async (client, _current, _policies, ticket) => { if (ticket.state !== 'ACTIVE') return false; await client.query('UPDATE saas.tickets SET heartbeat_at=clock_timestamp() WHERE id=$1', [id]); return true; }, { allowBarrier: true }); }
  async function markUncertain(id) { return ticketTransaction(id, async (client, _current, _policies, ticket) => { if (ticket.state !== 'ACTIVE') return false; await client.query("UPDATE saas.tickets SET state='UNCERTAIN' WHERE id=$1", [id]); return true; }, { allowBarrier: true }); }
  return { observeClock, ready: () => clock.ready(), admit, claim, startWork, consumeBytes, finish, heartbeat, markUncertain, lookup };
}
