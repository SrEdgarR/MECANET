// Real PostgreSQL tests. Invoke with MECANET_QA_CONNECTIONS pointing only to the
// private connections.json produced by prepareQaCluster; never load .env.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPgPool, createSecretResolver, createTenantPoolManager } from '../../server/saas/db/pools.js';

const path = process.env.MECANET_QA_CONNECTIONS ?? '/run/qa-secrets/connections.json';
if (!path.startsWith('/run/qa-secrets/')) throw new Error('QA_PRIVATE_CONNECTIONS_PATH_REQUIRED');
const qa = JSON.parse(await readFile(path, 'utf8'));
const connections = qa.connections;
if (!connections?.saas_tenant_a || !qa.entries) throw new Error('QA_CONNECTIONS_REQUIRED');
async function withRole(role, fn, overrides = {}) {
  const pool = await createPgPool({ ...connections[role], ...overrides, max: 1, connectionTimeoutMillis: 2000, statement_timeout: 2000, application_name: 'mecanet-db-negative-tests' });
  try { return await fn(pool); } finally { await pool.end(); }
}
async function denied(role, sql, values = []) {
  await withRole(role, async (pool) => {
    await assert.rejects(pool.query(sql, values), (e) => ['42501','28000'].includes(e.code), `privilege must reject ${role}`);
  });
}

test('PG18.6 role connections authenticate with TLS and durability enabled', async () => {
  for (const role of ['saas_api','saas_session','saas_issuer','saas_tenant_a','saas_tenant_b','saas_demo']) {
    await withRole(role, async (pool) => {
      const { rows: [r] } = await pool.query("SELECT current_database() AS db,current_user AS role,current_setting('server_version_num') AS version,current_setting('fsync') AS fsync,current_setting('full_page_writes') AS fpw,current_setting('synchronous_commit') AS sync,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls");
      assert.equal(r.db, connections[role].database); assert.equal(r.role, role); assert.equal(r.version, '180006'); assert.equal(r.tls, true); assert.equal(r.fsync, 'on'); assert.equal(r.fpw, 'on'); assert.equal(r.sync, 'on');
    });
  }
});

test('same product UUID returns different fictitious contents through bounded tenant pools', async () => {
  const manager = createTenantPoolManager({ resolveSecret: createSecretResolver({ entries: qa.entries }) });
  try {
    const descriptors = Object.values(qa.entries).filter((e) => e.purpose === 'company');
    const [a,b] = await Promise.all(descriptors.map((d) => manager.withTenant(d, async (client) => (await client.query('SELECT id,sku,name FROM catalog.products WHERE id=$1', ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'])).rows[0])));
    assert.equal(a.id, b.id); assert.notEqual(a.sku, b.sku); assert.notEqual(a.name, b.name);
    assert.deepEqual(Object.keys(a).sort(), ['id','name','sku']);
    assert.equal(manager.snapshot().leased, 0); assert.equal(manager.snapshot().pools, 2);
  } finally { await manager.close(); }
});

test('A credentials cannot connect to B, demo, central or maintenance databases', async () => {
  for (const database of ['mecanet_tenant_b','mecanet_demo','mecanet_control','postgres','template1']) {
    await assert.rejects(withRole('saas_tenant_a', (pool) => pool.query('SELECT 1'), { database }), (e) => ['28000','42501'].includes(e.code));
  }
  await assert.rejects(withRole('saas_api', (pool) => pool.query('SELECT 1'), { database: 'mecanet_tenant_a' }), (e) => ['28000','42501'].includes(e.code));
});

test('HBA rejects plaintext and a TLS connection with an untrusted CA', async () => {
  await assert.rejects(withRole('saas_tenant_a', (pool) => pool.query('SELECT 1'), { ssl: false }), (e) => e.code === '28000');
  await assert.rejects(withRole('saas_tenant_a', (pool) => pool.query('SELECT 1'), { ssl: { rejectUnauthorized: true, ca: 'not-the-qa-ca' } }), (e) => ['SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(e.code));
});

test('tenant credentials cannot write, create, become another role or add extensions', async () => {
  for (const sql of [
    "INSERT INTO catalog.products(id,sku,name) VALUES('ffffffff-ffff-4fff-8fff-ffffffffffff','FORGED','forged')",
    "UPDATE catalog.products SET name='forged'", 'DELETE FROM catalog.products',
    'CREATE TABLE catalog.forbidden(id int)', 'CREATE TABLE public.forbidden(id int)', 'CREATE TEMP TABLE forbidden(id int)',
    'SET ROLE saas_tenant_b', 'SET ROLE saas_owner_a', 'CREATE ROLE forbidden', 'CREATE DATABASE forbidden', 'CREATE EXTENSION dblink WITH SCHEMA catalog',
  ]) await denied('saas_tenant_a', sql);
  await withRole('saas_tenant_a', async (pool) => {
    const { rows: [r] } = await pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=current_user');
    assert.ok(Object.values(r).every((value) => value === false));
    const { rows: [count] } = await pool.query('SELECT count(*)::int AS n FROM catalog.products'); assert.equal(count.n, 2);
  });
});

test('API and session store cannot alter identity, permissions or authoritative sessions', async () => {
  await denied('saas_api', 'SELECT password_hash FROM saas.identities');
  await denied('saas_api', "UPDATE saas.identities SET security_version=999");
  await denied('saas_api', "UPDATE saas.action_grants SET status='active'");
  await denied('saas_api', "UPDATE saas.session_registry SET status='active'");
  await denied('saas_session', 'SELECT * FROM saas.session_registry');
  await assert.rejects(withRole('saas_tenant_a', (pool) => pool.query('SELECT * FROM saas.identities')), (e) => e.code === '42P01');
});

test('measurement grants expose four fixed physical sizes and no business content', async () => {
  await withRole('saas_measure', async (pool) => {
    const { rows } = await pool.query('SELECT * FROM saas.measure_database_sizes()');
    assert.equal(rows.length, 4); assert.ok(rows.every((r) => r.metric === 'db.physical_bytes' && BigInt(r.value) > 0n));
    assert.deepEqual(Object.keys(rows[0]).sort(), ['metric','scope','value']);
    const { rows: [r] } = await pool.query("SELECT pg_has_role(current_user,'pg_monitor','MEMBER') AS monitor,pg_has_role(current_user,'pg_read_all_stats','MEMBER') AS stats");
    assert.equal(r.monitor, false); assert.equal(r.stats, false);
  });
  await denied('saas_measure', 'SELECT email FROM saas.identities');
  await denied('saas_measure', "UPDATE saas.action_grants SET status='active'");
  await assert.rejects(withRole('saas_measure', (pool) => pool.query('SELECT * FROM catalog.products'), { database: 'mecanet_tenant_a' }), (e) => ['28000','42501'].includes(e.code));
});
