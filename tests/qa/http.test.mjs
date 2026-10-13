import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

// Run explicitly against the approved QA tunnel. This file never reads .env,
// prints bodies/cookies/configuration or connects to another host/database.
test('Private QA HTTP authority journey (real HTTPS and API)', { timeout: 90_000 }, async t => {
  const root = await realpath(path.join(process.cwd(), '.qa-private'));
  const config = JSON.parse(await readFile(path.join(root, 'browser-config.json'), 'utf8'));
  assert.equal(config.baseUrl, 'https://app.mecanet.test:18443');
  const caPath = await realpath(path.resolve(config.caCertificatePath));
  assert(caPath.startsWith(`${root}${path.sep}`), 'CA must belong to private QA');
  const ca = await readFile(caPath);
  const jar = new Map();
  let csrf;
  let authenticated = false;
  let requests = 0;
  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  const request = (pathname, { method = 'GET', body, headers = {}, cookieOverride } = {}) => new Promise((resolve, reject) => {
    assert(pathname.startsWith('/api/') && !pathname.includes('\r') && !pathname.includes('\n'), 'Only private API paths');
    requests += 1; assert(requests <= 35, 'Bounded HTTP request budget');
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const outgoing = {
      Host: 'app.mecanet.test:18443', Accept: 'application/json',
      Cookie: cookieOverride === undefined ? cookieHeader() : cookieOverride,
      ...(method === 'POST' ? { Origin: config.baseUrl, 'X-CSRF-Token': csrf || '', 'Content-Type': 'application/json' } : {}),
      ...headers,
    };
    for (const [name, value] of Object.entries(outgoing)) if (value === undefined) delete outgoing[name];
    if (payload) outgoing['Content-Length'] = Buffer.byteLength(payload);
    const call = https.request({
      hostname: 'app.mecanet.test', port: 18443, path: pathname, method, headers: outgoing,
      ca, rejectUnauthorized: true, servername: 'app.mecanet.test', checkServerIdentity: tls.checkServerIdentity,
      agent: false,
      lookup: (_host, options, callback) => options.all
        ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4),
    }, response => {
      for (const cookie of response.headers['set-cookie'] || []) {
        const pair = /^([^=;]+)=([^;]*)/.exec(cookie);
        if (!pair) continue;
        if (!pair[2] || /Max-Age=0(?:;|$)/i.test(cookie)) jar.delete(pair[1]);
        else jar.set(pair[1], pair[2]);
      }
      let bytes = 0;
      const chunks = [];
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) { response.destroy(); reject(new Error('QA_RESPONSE_TOO_LARGE')); }
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        let json;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return reject(new Error('API_RESPONSE_NOT_JSON')); }
        resolve({ status: response.statusCode, headers: response.headers, json });
      });
    });
    call.setTimeout(10_000, () => call.destroy(new Error('QA_REQUEST_TIMEOUT')));
    call.on('error', reject);
    if (payload) call.write(payload);
    call.end();
  });
  const status = (reply, expected) => {
    const code = typeof reply.json?.error === 'string' && /^[A-Z_]{1,50}$/.test(reply.json.error) ? reply.json.error : 'NO_PUBLIC_CODE';
    assert.equal(reply.status, expected, `Expected HTTP ${expected}; received ${reply.status} (${code})`);
    assert.match(reply.headers['content-type'] || '', /application\/json/);
    assert.match(reply.headers['cache-control'] || '', /no-store/);
  };
  const catalogPath = `/api/tenants/${config.tenant.id}/catalog`;
  const session = await request('/api/auth/session');
  status(session, 200);
  assert.equal(session.json.authenticated, false, 'A fresh cookie jar must be unauthenticated');
  assert.equal(typeof session.json.csrfToken, 'string');
  csrf = session.json.csrfToken;

  await t.test('Three invalid logins are followed by a valid login without exhausting auth slots', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      status(await request('/api/auth/login', { method: 'POST', body: { email: config.user.email, password: 'incorrect-fixture-password' } }), 401);
    }
    const login = await request('/api/auth/login', { method: 'POST', body: { email: config.user.email, password: config.user.password } });
    status(login, 200);
    assert.equal(login.json.authenticated, true);
    assert.equal(login.json.purpose, 'company');
    assert.equal(typeof login.json.csrfToken, 'string');
    csrf = login.json.csrfToken;
    authenticated = true;
  });
  if (!authenticated) return;

  await t.test('Unicode CSRF, an unrelated Origin and unrelated Referer are rejected without losing the session', async () => {
    status(await request('/api/auth/activity', { method: 'POST', body: {}, headers: { 'X-CSRF-Token': `${'a'.repeat(42)}é` } }), 403);
    status(await request('/api/auth/activity', { method: 'POST', body: {}, headers: { Origin: 'https://unrelated.invalid' } }), 403);
    status(await request('/api/auth/activity', { method: 'POST', body: {}, headers: { Origin: undefined, Referer: 'https://unrelated.invalid/' } }), 403);
    status(await request('/api/auth/activity', { method: 'POST', body: {}, headers: { Origin: undefined, Referer: `${config.baseUrl}/cuenta/empresas` } }), 200);
    status(await request('/api/auth/activity', { method: 'POST', body: {} }), 200);
  });

  await t.test('A wrong Host is rejected even over a valid QA TLS connection', async () => {
    status(await request('/api/auth/session', { headers: { Host: 'wrong.mecanet.test:18443' } }), 421);
  });

  await t.test('Tenant/database query overrides and invalid limits are rejected; limit100 returns only the catalog DTO', async () => {
    for (const query of [`tenantId=${config.otherTenantId}`, 'database=unrelated_fixture', 'limit=101', 'limit=20&limit=100']) {
      status(await request(`${catalogPath}?${query}`), 400);
    }
    const reply = await request(`${catalogPath}?limit=100`);
    status(reply, 200);
    assert.equal(reply.json.tenantId, config.tenant.id);
    assert(Array.isArray(reply.json.items));
    assert(reply.json.items.length <= 100);
    assert(reply.json.items.every(item => Object.keys(item).sort().join(',') === 'id,name,sku'));
    assert(reply.json.items.some(item => item.name === config.expectedProductName));
    assert(reply.json.items.every(item => item.name !== config.forbiddenProductName));
  });

  await t.test('A valid company session cannot read the other fixture company', async () => {
    status(await request(`/api/tenants/${config.otherTenantId}/catalog?limit=20`), 403);
  });

  await t.test('Two concurrent reads respect the conservative ordinary quota and a later read obtains a slot', async () => {
    // The approved essential profile reserves an essential lane. Ordinary QT1
    // is 2MiB minus64KiB, so two simultaneous1MiB reservations need not both
    // pass. Let earlier short-window usage elapse without changing the ledger.
    await sleep(3000);
    const replies = await Promise.all([request(`${catalogPath}?limit=20`), request(`${catalogPath}?limit=20`)]);
    t.diagnostic(`Concurrent responses: ${replies.map(reply => `${reply.status}/${typeof reply.json?.error === 'string' && /^[A-Z_]{1,50}$/.test(reply.json.error) ? reply.json.error : 'OK'}`).join(', ')}`);
    for (const reply of replies) {
      assert([200, 429].includes(reply.status), 'Only admission or a conservative quota denial is expected');
      status(reply, reply.status);
      if (reply.status === 200) {
        assert.equal(reply.json.tenantId, config.tenant.id);
        assert(reply.json.items.some(item => item.name === config.expectedProductName));
      } else {
        assert.equal(reply.json.error, 'TENANT_QUOTA');
        assert(Number(reply.headers['retry-after']) >= 1);
        assert(!Array.isArray(reply.json.items), 'Denied requests expose no catalog');
      }
    }
    assert(replies.some(reply => reply.status === 200), 'At least one read must be admitted');
    assert.equal(new Set(replies.map(reply => reply.headers['x-request-id'])).size, 2);
    assert(replies.every(reply => typeof reply.headers['x-request-id'] === 'string'));
    await sleep(3000);
    status(await request(`${catalogPath}?limit=20`), 200);
    // HTTP alone does not expose the ledger. Exact quota debits belong to the
    // separate private admission/SQL tests, not this acceptance assertion.
  });

  await t.test('Logout is durable: replaying the previously valid signed cookie is unauthorized', async () => {
    const oldCookie = cookieHeader();
    assert(oldCookie.length > 0);
    status(await request('/api/auth/logout', { method: 'POST', body: {} }), 200);
    status(await request(`${catalogPath}?limit=20`, { cookieOverride: oldCookie }), 401);
  });
});
