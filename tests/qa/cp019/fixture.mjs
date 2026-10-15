// Private harness only. Never import from the public application/image.
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { createPgPool, validateConnection } from '../../../server/saas/db/pools.js';

const NAME = /^[a-z][a-z0-9_]{0,62}$/;
export const QA_ROLES = Object.freeze({ saas_api: 10, saas_session: 4, saas_issuer: 2, saas_revoker: 1, saas_policy: 1, saas_clock: 1, saas_measure: 1, saas_reconciler: 1, saas_backup: 2, saas_tenant_a: 4, saas_tenant_b: 4, saas_demo: 4 });
export const QA_LOGIN_LIMITS=Object.freeze({...QA_ROLES,saas_writer_maintenance:1,saas_writer_a:4,saas_writer_b:4,saas_maintainer_a:1,saas_maintainer_b:1});
export function validateRolePasswords(passwords){
  const names=[...Object.keys(QA_LOGIN_LIMITS),'qa_bootstrap'].sort();
  if(!passwords||Object.keys(passwords).sort().join(',')!==names.join(',')||!Object.values(passwords).every(p=>typeof p==='string'&&/^[A-Za-z0-9_-]{43}$/.test(p))||new Set(Object.values(passwords)).size!==names.length)throw Error('QA_CUSTODIED_ROLES_REQUIRED');
  return passwords;
}
const OWNERS = ['saas_owner', 'saas_owner_a', 'saas_owner_b', 'saas_owner_demo', 'saas_measure_owner'];
const DATABASES = [{ db: 'mecanet_control', owner: 'saas_owner' }, { db: 'mecanet_tenant_a', owner: 'saas_owner_a', role: 'saas_tenant_a' }, { db: 'mecanet_tenant_b', owner: 'saas_owner_b', role: 'saas_tenant_b' }, { db: 'mecanet_demo', owner: 'saas_owner_demo', role: 'saas_demo' }];
const quoted = (name) => { if (!NAME.test(name)) throw new Error('INVALID_FIXED_IDENTIFIER'); return `"${name}"`; };

export function validatePreflight(p) {
  if (!p || p.project!=='mecanet-qa-p1l3-r03' || p.dataClass !== 'synthetic' || p.allowBootstrap !== true || !/^[0-9]{10,24}$/.test(p.expectedSystemIdentifier) || p.expectedHost !== 'postgres') throw new Error('QA_PREFLIGHT_REQUIRED');
  return p;
}

export function fixtureDefinition() {
  const identities = [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', email: 'a@qa.invalid', purpose: 'company' },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', email: 'b@qa.invalid', purpose: 'company' },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', email: 'demo@qa.invalid', purpose: 'demo' },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', email: 'operator@qa.invalid', purpose: 'operator' },
  ];
  const sharedProduct = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const tenants = [
    { id: '11111111-1111-4111-8111-111111111111', dbName: 'mecanet_tenant_a', secretRef: 'tenant-a-v1', role: 'saas_tenant_a', purpose: 'company', label: 'Empresa ficticia A' },
    { id: '22222222-2222-4222-8222-222222222222', dbName: 'mecanet_tenant_b', secretRef: 'tenant-b-v1', role: 'saas_tenant_b', purpose: 'company', label: 'Empresa ficticia B' },
    { id: '33333333-3333-4333-8333-333333333333', dbName: 'mecanet_demo', secretRef: 'demo-v1', role: 'saas_demo', purpose: 'demo', label: 'Demostración ficticia' },
  ].map((t, i) => ({ ...t, identityId: identities[i].id, products: i===0?[]:[{ id: sharedProduct, sku: `QA-${i + 1}-001`, name: `${t.label}: filtro de ensayo` }, { id: `dddddddd-dddd-4ddd-8ddd-ddddddddddd${i + 1}`, sku: `QA-${i + 1}-002`, name: `${t.label}: pieza de ensayo` }] }));
  return { identities, tenants, sharedProduct };
}

export function renderHba(subnet, bootstrapRole = 'qa_bootstrap') {
  const [address, prefix] = String(subnet).split('/'); const octets = address.split('.').map(Number);
  if (isIP(address) !== 4 || !/^\d{2}$/.test(prefix ?? '') || Number(prefix) < 24 || Number(prefix) > 30 || !(octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168)) || !NAME.test(bootstrapRole)) throw new Error('QA_PRIVATE_SUBNET_REQUIRED');
  const lines = [`local all ${bootstrapRole} scram-sha-256`, 'local all all reject', `hostssl all ${bootstrapRole} ${subnet} scram-sha-256`];
  for (const role of Object.keys(QA_ROLES).filter((r) => !['saas_tenant_a', 'saas_tenant_b', 'saas_demo', 'saas_backup'].includes(r))) lines.push(`hostssl mecanet_control ${role} ${subnet} scram-sha-256`);
  for (const db of DATABASES.filter((d) => d.role)) lines.push(`hostssl ${db.db} ${db.role} ${subnet} scram-sha-256`);
  lines.push(`hostssl replication saas_backup ${subnet} scram-sha-256`, 'host all all 0.0.0.0/0 reject', 'host all all ::/0 reject');
  return `${lines.join('\n')}\n`;
}

/** Fresh, exclusive cluster only. A mismatch fails before the first write. */
export async function prepareQaCluster({ preflight, adminConnection, passwordHash, rolePasswords, admissionSql, admissionSeed, observationSql, onCommand }) {
  validatePreflight(preflight);
  validateRolePasswords(rolePasswords);
  if(typeof onCommand!=='function')throw Error('QA_SHARED_BUDGET_REQUIRED');
  const config = validateConnection(adminConnection);
  if (config.host !== preflight.expectedHost || config.database !== 'postgres' || config.user !== 'qa_bootstrap' || !/^\$2[aby]\$\d\d\$/.test(passwordHash ?? '')) throw new Error('QA_PREPARER_CONFIG_REJECTED');
  const admin = await meteredPool({ ...config, max: 1, connectionTimeoutMillis: 2000, statement_timeout:2000,lock_timeout:500, application_name: 'mecanet-cp019-private-preparer' },onCommand);
  const passwords = rolePasswords;
  try {
    const facts = (await admin.query("SELECT system_identifier::text, current_setting('server_version_num')::int AS version, current_setting('fsync') AS fsync, current_setting('full_page_writes') AS full_page_writes, current_setting('synchronous_commit') AS synchronous_commit, current_setting('password_encryption') AS password_encryption, current_setting('max_connections')::int AS max_connections, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls FROM pg_control_system()")).rows[0];
    if (facts.system_identifier !== preflight.expectedSystemIdentifier || facts.version !== 180006 || facts.fsync !== 'on' || facts.full_page_writes !== 'on' || facts.synchronous_commit !== 'on' || facts.password_encryption !== 'scram-sha-256' || facts.max_connections !== 60 || facts.tls !== true) throw new Error('QA_CLUSTER_MISMATCH');
    const existing = await admin.query("SELECT datname AS name FROM pg_database WHERE datname LIKE 'mecanet_%' UNION ALL SELECT rolname FROM pg_roles WHERE rolname LIKE 'saas_%'");
    if (existing.rowCount) throw new Error('QA_CLUSTER_NOT_EMPTY');
    for (const owner of OWNERS) await admin.query(`CREATE ROLE ${quoted(owner)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    for (const [role, limit] of Object.entries(QA_ROLES)) {
      // Password is a bound parameter; dynamic DDL can use only fixed identifiers.
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('qa.role_password',$1,true)", [passwords[role]]);
        await client.query(`DO $role$ BEGIN EXECUTE format('CREATE ROLE ${quoted(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT ${role === 'saas_backup' ? 'REPLICATION' : 'NOREPLICATION'} NOBYPASSRLS CONNECTION LIMIT ${limit} PASSWORD %L', current_setting('qa.role_password')); END $role$`);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }
    for (const db of DATABASES) await admin.query(`CREATE DATABASE ${quoted(db.db)} OWNER ${quoted(db.owner)} TEMPLATE template0`);
    for (const name of ['postgres', 'template0', 'template1', ...DATABASES.map((d) => d.db)]) await admin.query(`REVOKE ALL ON DATABASE ${quoted(name)} FROM PUBLIC`);
    const centralRoles = Object.keys(QA_ROLES).filter((r) => !['saas_tenant_a', 'saas_tenant_b', 'saas_demo', 'saas_backup'].includes(r));
    await admin.query(`GRANT CONNECT ON DATABASE mecanet_control TO ${centralRoles.map(quoted).join(',')},saas_measure_owner`);
    for (const db of DATABASES.filter((d) => d.role)) await admin.query(`GRANT CONNECT ON DATABASE ${quoted(db.db)} TO ${quoted(db.role)},saas_measure_owner`);
    const central = await meteredPool({ ...config, database: 'mecanet_control', max: 1,statement_timeout:2000,lock_timeout:500 },onCommand);
    const fixture = fixtureDefinition();
    try {
      await central.query(await readFile(new URL('../../../server/saas/db/migrations/001-control.sql', import.meta.url), 'utf8'));
      if (admissionSql) await central.query(`SET ROLE saas_owner;\n${admissionSql}\nRESET ROLE;`);
      if (observationSql) await central.query(`SET ROLE saas_owner;\n${observationSql}\nRESET ROLE;`);
      for (const identity of fixture.identities) await central.query('INSERT INTO saas.identities(id,email,password_hash,purpose,status,security_version,verified,mfa_verified) VALUES($1,$2,$3,$4,\'active\',1,true,$5)', [identity.id, identity.email, passwordHash, identity.purpose, identity.purpose === 'operator']);
      await central.query("INSERT INTO saas.role_policies(role,action,version) VALUES('owner','catalog.read',1),('member','catalog.read',1),('owner','usage.read',1)");
      for (const tenant of fixture.tenants) {
        await central.query("INSERT INTO saas.tenant_directory(id,db_name,secret_ref,credential_version,schema_version,data_epoch,status,purpose) VALUES($1,$2,$3,1,1,1,'active',$4)", [tenant.id, tenant.dbName, tenant.secretRef, tenant.purpose]);
        await central.query("INSERT INTO saas.memberships(identity_id,tenant_id,role,status,version) VALUES($1,$2,$3,'active',1)", [tenant.identityId, tenant.id, tenant.purpose === 'demo' ? 'demo' : 'owner']);
        if (tenant.purpose === 'company') await central.query("INSERT INTO saas.action_grants(identity_id,tenant_id,action,status,version) VALUES($1,$2,'catalog.read','active',1)", [tenant.identityId, tenant.id]);
      }
      if (admissionSeed) await admissionSeed(central, { tenantIds: fixture.tenants.map((t) => t.id) });
    } finally { await central.end(); }
    for (const tenant of fixture.tenants) {
      const db = DATABASES.find((d) => d.db === tenant.dbName);
      const pool = await meteredPool({ ...config, database: tenant.dbName, max: 1,statement_timeout:2000,lock_timeout:500 },onCommand);
      const client = await pool.connect();
      try {
        await client.query(`SET ROLE ${quoted(db.owner)}`);
        await client.query(await readFile(new URL('../../../server/saas/db/migrations/002-tenant.sql', import.meta.url), 'utf8'));
        await client.query('ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC');
        await client.query('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
        for (const product of tenant.products) await client.query('INSERT INTO catalog.products(id,sku,name) VALUES($1,$2,$3)', [product.id, product.sku, product.name]);
        await client.query(`GRANT USAGE ON SCHEMA catalog TO ${quoted(db.role)}`);
        await client.query(`GRANT SELECT(id,sku,name) ON catalog.products TO ${quoted(db.role)}`);
        await client.query('RESET ROLE');
      } finally { client.release(true); await pool.end(); }
    }
    const connections = Object.fromEntries(Object.keys(QA_ROLES).map((role) => [role, { ...config, database: DATABASES.find((d) => d.role === role)?.db ?? 'mecanet_control', user: role, password: passwords[role] }]));
    const entries = Object.fromEntries(fixture.tenants.map((tenant) => [tenant.secretRef, { tenantId: tenant.id, dbName: tenant.dbName, secretRef: tenant.secretRef, credentialVersion: 1, dataEpoch: 1, schemaVersion: 1, status: 'active', purpose: tenant.purpose, connection: connections[tenant.role] }]));
    return { fixture, connections, entries, systemIdentifier: facts.system_identifier };
  } finally { await admin.end(); }
}

// The controller owns the cohort-wide ledger. Charge before sending SQL, including
// setup/ROLLBACK; rejection never grants another command or resets a budget.
export async function meteredPool(config,onCommand){
  if(typeof onCommand!=='function')throw Error('QA_SHARED_BUDGET_REQUIRED');
  const pool=await createPgPool(config),charge=()=>onCommand('SQL');
  const wrap=client=>({query:async(...args)=>{await charge();return client.query(...args)},release:(...args)=>client.release(...args)});
  return {query:async(...args)=>{await charge();return pool.query(...args)},connect:async()=>wrap(await pool.connect()),end:()=>pool.end()};
}
