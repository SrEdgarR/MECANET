const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[a-z][a-z0-9_]{0,62}$/;
const fail = (code) => Object.assign(new Error(code), { code });

export function validateConnection(config) {
  if (!config || typeof config.host !== 'string' || !config.host || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || !NAME.test(config.database) || !NAME.test(config.user) || typeof config.password !== 'string' || !config.password || !config.ssl || config.ssl.rejectUnauthorized !== true || !config.ssl.ca || config.connectionString) throw fail('INVALID_DB_CONFIG');
  return { host: config.host, port: config.port, database: config.database, user: config.user, password: config.password, ssl: { ca: config.ssl.ca, rejectUnauthorized: true, ...(config.ssl.servername ? { servername: config.ssl.servername } : {}) } };
}

/** The trusted runtime supplies a finite registry. No environment or URI fallback. */
export function createSecretResolver({ entries }) {
  const registry = new Map(Object.entries(entries).map(([ref, entry]) => [ref, { ...entry, connection: validateConnection(entry.connection) }]));
  return async (descriptor) => {
    const entry = registry.get(descriptor.secretRef);
    if (!entry) throw fail('SECRET_UNAVAILABLE');
    for (const key of ['tenantId', 'dbName', 'credentialVersion', 'dataEpoch']) {
      if (entry[key] !== descriptor[key]) throw fail('SECRET_MISMATCH');
    }
    return { ...entry.connection, ssl: { ...entry.connection.ssl } };
  };
}

export async function createPgPool(config) {
  const { Pool } = await import('pg');
  const pool = new Pool(config);
  // Idle errors are handled by pg; never log a configuration or raw SQL error.
  pool.on('error', () => {});
  return pool;
}

/** At most four tenant pools per API; rotation never doubles a tenant's quota. */
export function createTenantPoolManager({ resolveSecret, createPool = createPgPool, maxPools = 4, maxPerPool = 2, idleMs = 60_000, now = Date.now, monotonicNow = () => performance.now() } = {}) {
  if (typeof resolveSecret !== 'function' || typeof monotonicNow !== 'function' || !Number.isInteger(maxPools) || maxPools < 1 || maxPools > 4 || !Number.isInteger(maxPerPool) || maxPerPool < 1 || maxPerPool > 2 || !Number.isSafeInteger(idleMs) || idleMs < 1) throw fail('INVALID_POOL_LIMIT');
  const pools = new Map(); let closed = false; let serial = Promise.resolve();
  const lock = async (fn) => { const before = serial; let unlock; serial = new Promise((r) => { unlock = r; }); await before; try { return await fn(); } finally { unlock(); } };
  const keyOf = (d) => [d.dbName, d.secretRef, d.credentialVersion, d.dataEpoch, d.schemaVersion].join(':');
  async function retire(entry) { await entry.pool.end(); pools.delete(entry.tenantId); entry.resolveDrained?.(); }
  async function acquire(d) {
    return lock(async () => {
      if (closed) throw fail('POOL_CLOSED');
      if (!d || !UUID.test(d.tenantId) || !NAME.test(d.dbName) || d.purpose !== 'company' || d.status !== 'active' || !Number.isSafeInteger(d.credentialVersion) || d.credentialVersion < 1 || !Number.isSafeInteger(d.dataEpoch) || d.dataEpoch < 1 || d.schemaVersion !== 1) throw fail('TENANT_UNAVAILABLE');
      let entry = pools.get(d.tenantId);
      if (entry && entry.key !== keyOf(d)) entry.draining = true;
      if (entry?.draining) {
        if (entry.active) throw fail('POOL_DRAINING');
        await retire(entry); entry = undefined;
      }
      if (!entry) {
        if (pools.size >= maxPools) {
          const idle = [...pools.values()].filter((p) => !p.active).sort((a, b) => a.lastUsed - b.lastUsed)[0];
          if (!idle) throw fail('POOL_CAPACITY');
          await retire(idle);
        }
        const config = validateConnection(await resolveSecret(d));
        if (config.database !== d.dbName) throw fail('SECRET_MISMATCH');
        const pool = await createPool({ ...config, max: maxPerPool, min: 0, idleTimeoutMillis: idleMs, connectionTimeoutMillis: 2000, statement_timeout: 2000, lock_timeout: 500, idle_in_transaction_session_timeout: 2000, options: '-c search_path=catalog,pg_catalog -c default_transaction_read_only=on', application_name: 'mecanet-tenant-api' });
        entry = { tenantId: d.tenantId, key: keyOf(d), pool, active: 0, lastUsed: now(), draining: false }; pools.set(d.tenantId, entry);
      }
      if (entry.active >= maxPerPool) throw fail('POOL_BUSY');
      entry.active++; return entry;
    });
  }
  async function withTenant(descriptor, fn, {deadline=Infinity}={}) {
    if(deadline!==Infinity&&!Number.isFinite(deadline))throw fail('INVALID_DB_DEADLINE');
    let expired=false,timer,rejectTimeout,phaseDeadline=deadline;
    const remaining=()=>Math.min(deadline,phaseDeadline)-monotonicNow();
    const timed=new Promise((_resolve,reject)=>{rejectTimeout=reject});
    const arm=()=>{
      clearTimeout(timer);
      const started=monotonicNow();phaseDeadline=Math.min(deadline,started+2000);
      timer=setTimeout(()=>{expired=true;rejectTimeout(fail('DB_DEADLINE'))},Math.max(1,phaseDeadline-started));
    };
    if(remaining()<=0)throw fail('DB_DEADLINE');
    if(deadline!==Infinity)arm();
    const work=(async()=>{
      const entry=await acquire(descriptor);let client,failed=false;
      try{
        if(expired||remaining()<=0)throw fail('DB_DEADLINE');
        client=await entry.pool.connect();
        if(expired||remaining()<=0)throw fail('DB_DEADLINE');
        if(deadline!==Infinity)arm();
        const result=await fn(client);
        if(expired||remaining()<=0)throw fail('DB_DEADLINE');
        return result;
      }catch(error){failed=true;throw error}
      finally{
        client?.release(failed||expired);
        await lock(async()=>{entry.active--;entry.lastUsed=now();if(entry.draining&&!entry.active)await retire(entry)});
      }
    })();
    // A late acquisition keeps its lease until the real client has been closed.
    // The caller times out independently and must retain its uncertain ticket.
    try{return await Promise.race([work,timed])}finally{clearTimeout(timer)}
  }
  async function drain(tenantId) {
    let pending;
    await lock(async () => { const entry = pools.get(tenantId); if (!entry) return; entry.draining = true; if (!entry.active) await retire(entry); else pending = new Promise((r) => { const previous = entry.resolveDrained; entry.resolveDrained = () => { previous?.(); r(); }; }); });
    await pending;
  }
  async function close() { closed = true; const keys = await lock(() => [...pools.keys()]); await Promise.all(keys.map(drain)); }
  return { withTenant, drain, close, snapshot: () => ({ closed, pools: pools.size, leased: [...pools.values()].reduce((sum, p) => sum + p.active, 0) }) };
}
