// Private integration harness; two independent authority pools, not a claim of
// two running HTTP processes. All sessions are synthetic and revoked on cleanup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import session from '../../server/saas/node_modules/express-session/index.js';
import pgSession from '../../server/saas/node_modules/connect-pg-simple/index.js';
import { createPgPool } from '../../server/saas/db/pools.js';
import { createAuthority } from '../../server/saas/auth/authority.js';
import { createFixtureIssuer } from './issuer.js';

const path = process.env.MECANET_QA_CONNECTIONS ?? '/run/qa-secrets/connections.json';
if (!path.startsWith('/run/qa-secrets/')) throw new Error('QA_PRIVATE_CONNECTIONS_PATH_REQUIRED');
const qa = JSON.parse(await readFile(path, 'utf8'));
const login = JSON.parse(await readFile('/run/qa-secrets/fixture-login.json', 'utf8'));
const PgStore = pgSession(session);
const sid = () => randomBytes(32).toString('base64url');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
async function harness(fn) {
  const roles = ['saas_api','saas_api','saas_issuer','saas_session','saas_revoker'];
  const pools = await Promise.all(roles.map((role, i) => createPgPool({ ...qa.connections[role], max: 1, connectionTimeoutMillis: 2000, statement_timeout: 2000, application_name: `mecanet-auth-integration-${i}` })));
  const [apiA,apiB,issuerPool,storePool,revoker] = pools;
  const authorityA = createAuthority(apiA, qa.generation), authorityB = createAuthority(apiB, qa.generation);
  const issuer = createFixtureIssuer({ pool: issuerPool, generation: qa.generation });
  const stores = Object.fromEntries(['company','demo','operator'].map((purpose) => [purpose, new PgStore({ pool: storePool, schemaName: 'session_store', tableName: `${purpose}_sessions`, createTableIfMissing: false, pruneSessionInterval: false, disableTouch: true, errorLog: () => {} })]));
  const created = [];
  const storeCall = (purpose, method, ...args) => new Promise((resolve, reject) => stores[purpose][method](...args, (error, value) => error ? reject(error) : resolve(value)));
  async function create(email = 'a@qa.invalid', purpose = 'company') {
    const identity = await issuer.verify({ email, purpose, password: login.password });
    const id = sid(); await issuer.issue({ sid: id, identity });
    const fixture = { sid: id, identity, purpose, generation: qa.generation };
    created.push(fixture);
    await storeCall(purpose, 'set', id, { cookie: { expires: new Date(Date.now() + 3_600_000), maxAge: 3_600_000 }, identityId: identity.id, csrfToken: randomBytes(32).toString('base64url') });
    return fixture;
  }
  async function registerExpired(purpose, createdAgo, inactiveAgo, absoluteFuture) {
    const identity = await issuer.verify({ email: purpose === 'company' ? 'a@qa.invalid' : `${purpose}@qa.invalid`, purpose, password: login.password });
    const id = sid();
    await issuerPool.query(`INSERT INTO saas.session_registry(sid,identity_id,purpose,generation,status,security_version,created_at,last_interactive_at,absolute_expires_at) VALUES($1,$2,$3,$4,'active',$5,clock_timestamp()-$6::int*interval '1 minute',clock_timestamp()-$7::int*interval '1 minute',clock_timestamp()+$8::int*interval '1 minute')`, [id,identity.id,purpose,qa.generation,identity.security_version,createdAgo,inactiveAgo,absoluteFuture]);
    const fixture = { sid: id, identity, purpose, generation: qa.generation }; created.push(fixture); return fixture;
  }
  try { return await fn({ apiA,apiB,issuerPool,storePool,revoker,authorityA,authorityB,issuer,create,registerExpired,storeCall,created }); }
  finally {
    for (const entry of created) {
      await issuerPool.query('SELECT saas.revoke_session($1,$2,$3)', [entry.sid,entry.identity.id,entry.generation]);
      await storeCall(entry.purpose, 'destroy', entry.sid);
    }
    await Promise.all(pools.filter((pool) => !pool.ending).map((pool) => pool.end()));
  }
}

test('verified identity, membership and action authorize only own company using fresh SQL snapshots', async () => harness(async ({ create, authorityA, authorityB, apiA, apiB }) => {
  const entry = await create();
  const own = await authorityA.authorize({ sid: entry.sid, purpose: 'company', tenantId: A });
  assert.equal(own.descriptor.tenantId, A); assert.equal(own.descriptor.dbName, 'mecanet_tenant_a');
  await assert.rejects(authorityB.authorize({ sid: entry.sid, purpose: 'company', tenantId: B }), { code: 'ACCESS_DENIED' });
  await assert.rejects(authorityB.authorize({ sid: entry.sid, purpose: 'company', tenantId: A, action: 'quota.change' }), { code: 'ACCESS_DENIED' });
  const pids = await Promise.all([apiA,apiB].map(async (pool) => (await pool.query('SELECT pg_backend_pid() AS id')).rows[0].id));
  assert.notEqual(pids[0], pids[1]);
}));

test('valid authenticated demo/operator sessions are forbidden from company catalogue', async () => harness(async ({ create, authorityA }) => {
  for (const purpose of ['demo','operator']) {
    const entry = await create(`${purpose}@qa.invalid`, purpose);
    assert.equal((await authorityA.authorize({ sid: entry.sid, purpose })).purpose, purpose);
    await assert.rejects(authorityA.authorize({ sid: entry.sid, purpose, tenantId: A }), { code: 'ACCESS_DENIED' });
    await assert.rejects(authorityA.authorize({ sid: entry.sid, purpose: 'company', tenantId: A }), { code: 'SESSION_EXPIRED' });
  }
}));

test('logout committed on API A defeats a late standard-store upsert observed by API B', async () => harness(async ({ create, authorityA, authorityB, storeCall }) => {
  const entry = await create(); const saved = await storeCall('company','get',entry.sid);
  const context = await authorityA.authorize({ sid: entry.sid, purpose: 'company', tenantId: A });
  await authorityA.revoke(entry.sid, context);
  await storeCall('company','destroy',entry.sid);
  await storeCall('company','set',entry.sid,saved);
  assert.ok(await storeCall('company','get',entry.sid));
  await assert.rejects(authorityB.authorize({ sid: entry.sid, purpose: 'company', tenantId: A }), { code: 'SESSION_EXPIRED' });
  await assert.rejects(authorityB.activity(entry.sid,context), { code: 'SESSION_EXPIRED' });
}));

test('rotation revokes old SID before late save and new SID retains authority', async () => harness(async ({ create, issuer, authorityA, authorityB, storeCall, created }) => {
  const old = await create(); const saved = await storeCall('company','get',old.sid); const next = sid();
  await issuer.issue({ sid: next, identity: old.identity, previous: { sid: old.sid, identityId: old.identity.id, generation: qa.generation } });
  created.push({ ...old, sid: next });
  await storeCall('company','set',next,saved); await storeCall('company','set',old.sid,saved);
  await assert.rejects(authorityB.authorize({ sid: old.sid, purpose: 'company', tenantId: A }), { code: 'SESSION_EXPIRED' });
  assert.equal((await authorityA.authorize({ sid: next, purpose: 'company', tenantId: A })).user.id, old.identity.id);
}));

test('no store-only SID or reused registry SID acquires authority', async () => harness(async ({ create, issuer, authorityB, storeCall }) => {
  const entry = await create(); const unknown = sid(); const saved = await storeCall('company','get',entry.sid);
  try {
    await storeCall('company','set',unknown,saved);
    await assert.rejects(authorityB.authorize({ sid: unknown, purpose: 'company', tenantId: A }), { code: 'SESSION_EXPIRED' });
    await assert.rejects(issuer.issue({ sid: entry.sid, identity: entry.identity }), (error) => error.code === '23505');
  } finally { await storeCall('company','destroy',unknown); }
}));

test('identity revocation is visible after COMMIT on the other authority connection', async () => harness(async ({ create, authorityA, authorityB, revoker, issuerPool }) => {
  const entry = await create(); const client = await revoker.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE saas.identities SET security_version=security_version+1 WHERE id=$1', [entry.identity.id]);
    assert.equal((await authorityA.authorize({ sid: entry.sid, purpose: 'company', tenantId: A })).user.id, entry.identity.id);
    await client.query('COMMIT');
    await assert.rejects(authorityB.authorize({ sid: entry.sid, purpose: 'company', tenantId: A }), { code: 'SESSION_EXPIRED' });
  } finally {
    await client.query('ROLLBACK');
    await issuerPool.query('SELECT saas.revoke_session($1,$2,$3)', [entry.sid,entry.identity.id,qa.generation]);
    await client.query('UPDATE saas.identities SET security_version=$2 WHERE id=$1', [entry.identity.id,entry.identity.security_version]);
    client.release();
  }
}));

test('grant revocation denies the next direct authorization without implied role permissions', async () => harness(async ({ create, authorityA, authorityB, revoker }) => {
  const entry = await create();
  await authorityA.authorize({ sid: entry.sid, purpose: 'company', tenantId: A });
  try {
    await revoker.query("UPDATE saas.action_grants SET status='revoked',version=version+1 WHERE identity_id=$1 AND tenant_id=$2 AND action='catalog.read'", [entry.identity.id,A]);
    await assert.rejects(authorityB.authorize({ sid: entry.sid, purpose: 'company', tenantId: A }), { code: 'ACCESS_DENIED' });
  } finally {
    await revoker.query("UPDATE saas.action_grants SET status='active',version=version+1 WHERE identity_id=$1 AND tenant_id=$2 AND action='catalog.read'", [entry.identity.id,A]);
  }
}));

test('absolute, inactivity and demo caps remain enforced even before purge', async () => harness(async ({ registerExpired, authorityA }) => {
  for (const [purpose,createdAgo,inactiveAgo,absoluteFuture] of [['company',120,31,360],['company',481,0,60],['operator',120,16,360],['demo',31,0,60],['company',60,0,-1]]) {
    const entry = await registerExpired(purpose,createdAgo,inactiveAgo,absoluteFuture);
    await assert.rejects(authorityA.authorize({ sid: entry.sid, purpose }), { code: 'SESSION_EXPIRED' });
  }
}));

test('wrong generation and attempted revocation of someone else fail closed', async () => harness(async ({ create, authorityA, authorityB, apiB }) => {
  const a = await create(), b = await create('b@qa.invalid');
  const ctxA = await authorityA.authorize({ sid: a.sid, purpose: 'company', tenantId: A });
  await authorityA.revoke(b.sid, ctxA);
  assert.equal((await authorityB.authorize({ sid: b.sid, purpose: 'company', tenantId: B })).user.id, b.identity.id);
  await assert.rejects(createAuthority(apiB,randomUUID()).authorize({ sid: a.sid, purpose: 'company', tenantId: A }), { code: 'SESSION_EXPIRED' });
}));

test('central outage produces an error, never a cached positive authorization', async () => harness(async ({ create, authorityA, apiA }) => {
  const entry = await create(); await authorityA.authorize({ sid: entry.sid, purpose: 'company', tenantId: A });
  await apiA.end();
  await assert.rejects(authorityA.authorize({ sid: entry.sid, purpose: 'company', tenantId: A }));
}));

test('role policy revocation removes the tenant from the list as well as denying catalogue', async () => harness(async ({ create, authorityA, authorityB }) => {
  const entry = await create();
  assert.equal((await authorityA.tenants(entry.sid,'company')).tenants.some(tenant => tenant.id === A),true);
  // Private fixture preparer only: runtime roles must not gain policy DELETE.
  const admin = await createPgPool({host:'postgres',port:5432,database:'mecanet_control',user:'qa_bootstrap',password:await readFile('/run/qa-secrets/bootstrap','utf8'),ssl:{ca:await readFile('/run/qa-ca.crt','utf8'),servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:2000,statement_timeout:2000,application_name:'mecanet-qa-role-policy-test'});
  let removed;
  try {
    const {rows:[facts]} = await admin.query("SELECT system_identifier::text,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls FROM pg_control_system()");
    assert.equal(facts.system_identifier,qa.systemIdentifier); assert.equal(facts.tls,true);
    const {rows} = await admin.query("DELETE FROM saas.role_policies WHERE role='owner' AND action='catalog.read' RETURNING role,action,version");
    assert.equal(rows.length,1); removed=rows[0];
    await assert.rejects(authorityB.authorize({sid:entry.sid,purpose:'company',tenantId:A}),{code:'ACCESS_DENIED'});
    assert.equal((await authorityB.tenants(entry.sid,'company')).tenants.some(tenant => tenant.id === A),false);
  } finally {
    try { if(removed)await admin.query('INSERT INTO saas.role_policies(role,action,version) VALUES($1,$2,$3)',[removed.role,removed.action,removed.version]); }
    finally { await admin.end(); }
  }
}));
