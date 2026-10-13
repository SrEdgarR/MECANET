import test from 'node:test';
import assert from 'node:assert/strict';
import { createTenantPoolManager, createSecretResolver } from '../../server/saas/db/pools.js';

const tenant = (n, version = 1) => ({ tenantId: `${n}1111111-1111-4111-8111-111111111111`, dbName: `mecanet_tenant_${n}`, secretRef: `tenant-${n}`, credentialVersion: version, dataEpoch: 1, schemaVersion: 1, status: 'active', purpose: 'company' });
const config = (d) => ({ host: 'postgres', port: 5432, database: d.dbName, user: `role_${d.dbName}`, password: 'synthetic-only', ssl: { ca: 'synthetic-ca', rejectUnauthorized: true } });
function harness(options = {}) {
  const created = [];
  const createPool = async (c) => {
    const pool = { config: c, ended: false, borrowed: 0, async connect() { this.borrowed++; return { query: async () => ({ rows: [] }), release: () => { this.borrowed--; } }; }, async end() { assert.equal(this.borrowed, 0); this.ended = true; } };
    created.push(pool); return pool;
  };
  return { created, manager: createTenantPoolManager({ createPool, resolveSecret: async (d) => config(d), ...options }) };
}
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('concurrent acquisition opens one pool and never exceeds two leases', async () => {
  const { manager, created } = harness(); const gate = deferred();
  const work = [manager.withTenant(tenant(1), () => gate.promise), manager.withTenant(tenant(1), () => gate.promise)];
  await new Promise(setImmediate);
  await assert.rejects(manager.withTenant(tenant(1), async () => {}), { code: 'POOL_BUSY' });
  assert.equal(created.length, 1); assert.equal(created[0].borrowed, 2);
  gate.resolve(); await Promise.all(work); await manager.close();
});

test('rotation drains old leases before replacement without duplicating quota', async () => {
  const { manager, created } = harness(); const gate = deferred();
  const first = manager.withTenant(tenant(1), () => gate.promise); await new Promise(setImmediate);
  await assert.rejects(manager.withTenant(tenant(1, 2), async () => {}), { code: 'POOL_DRAINING' });
  assert.equal(created.length, 1); assert.equal(created[0].ended, false);
  gate.resolve(); await first;
  await manager.withTenant(tenant(1, 2), async () => {});
  assert.equal(created.length, 2); assert.equal(created[0].ended, true); await manager.close();
});

test('full cache refuses a fifth borrowed tenant and evicts only idle pools', async () => {
  const { manager, created } = harness(); const gate = deferred();
  const pending = [1, 2, 3, 4].map((n) => manager.withTenant(tenant(n), () => gate.promise));
  await new Promise(setImmediate);
  await assert.rejects(manager.withTenant(tenant(5), async () => {}), { code: 'POOL_CAPACITY' });
  gate.resolve(); await Promise.all(pending);
  await manager.withTenant(tenant(5), async () => {});
  assert.equal(created.filter((p) => !p.ended).length, 4); await manager.close();
});

test('invalid purpose/status and mismatched secret never create a pool', async () => {
  const { manager, created } = harness({ resolveSecret: async () => config(tenant(2)) });
  await assert.rejects(manager.withTenant({ ...tenant(1), purpose: 'demo' }, async () => {}), { code: 'TENANT_UNAVAILABLE' });
  await assert.rejects(manager.withTenant({ ...tenant(1), status: 'blocked' }, async () => {}), { code: 'TENANT_UNAVAILABLE' });
  await assert.rejects(manager.withTenant(tenant(1), async () => {}), { code: 'SECRET_MISMATCH' });
  assert.equal(created.length, 0); await manager.close();
});

test('secret resolver rejects unlisted reference, epoch and unsafe TLS without fallback', async () => {
  const d = tenant(1); const resolver = createSecretResolver({ entries: { [d.secretRef]: { ...d, connection: config(d) } } });
  assert.equal((await resolver(d)).database, d.dbName);
  await assert.rejects(resolver({ ...d, secretRef: '../root' }), { code: 'SECRET_UNAVAILABLE' });
  await assert.rejects(resolver({ ...d, credentialVersion: 2 }), { code: 'SECRET_MISMATCH' });
  assert.throws(() => createSecretResolver({ entries: { [d.secretRef]: { ...d, connection: { ...config(d), ssl: false } } } }), { code: 'INVALID_DB_CONFIG' });
});

test('close refuses new leases, waits active callbacks and frees failed clients', async () => {
  const { manager, created } = harness(); const gate = deferred();
  const work = manager.withTenant(tenant(1), () => gate.promise); await new Promise(setImmediate);
  const closing = manager.close();
  await assert.rejects(manager.withTenant(tenant(1), async () => {}), { code: 'POOL_CLOSED' });
  assert.equal(created[0].ended, false); gate.resolve(); await work; await closing;
  assert.equal(created[0].ended, true);
});

test('shutdown waits for an in-progress pool creation and closes it', async () => {
  const gate = deferred(); const { manager, created } = harness({ resolveSecret: async (d) => { await gate.promise; return config(d); } });
  const work = manager.withTenant(tenant(1), async () => {}); await new Promise(setImmediate);
  let finished = false; const closing = manager.close().then(() => { finished = true; });
  await new Promise(setImmediate); assert.equal(finished, false);
  gate.resolve(); await work; await closing;
  assert.equal(created.length, 1); assert.equal(created[0].ended, true);
});
