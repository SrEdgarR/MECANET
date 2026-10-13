// Real loopback HTTP and standard session middleware; no database or SQL evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../../server/saas/app.js';

for (const blockedPhase of ['tenant-work', 'byte-accounting']) test(`deadline 503 retains uncertain capacity when ${blockedPhase} settles after the external response`, { timeout: 15000 }, async () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const secret = randomBytes(48).toString('hex');
  const sid = randomBytes(32).toString('base64url');
  const signed = `s:${sid}.${createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '')}`;
  const events = [];
  let releaseWork;
  const work = new Promise(resolve => { releaseWork = resolve; });
  const ticket = { id: randomUUID(), state: 'ACTIVE' };
  const sessionPool = { async query(text, values) {
    assert.match(text, /^SELECT sess FROM "session_store"\."company_sessions"/);
    assert.equal(values[0], sid);
    events.push('session-read');
    return { rows: [{ sess: { cookie: { originalMaxAge: 28800000, expires: new Date(Date.now() + 28800000).toISOString(), secure: true, httpOnly: true, path: '/', sameSite: 'lax' }, csrfToken: randomBytes(32).toString('base64url') } }] };
  } };
  const admission = {
    async observeClock() {}, ready: () => true,
    async admit() { events.push('admitted'); return ticket; },
    async startWork() { events.push('started'); },
    async heartbeat() {},
    async consumeBytes() { events.push('bytes-accounting-started'); if (blockedPhase === 'byte-accounting') await work; events.push('bytes-accounted'); },
    async finish() { events.push('finished'); },
    async markUncertain() { events.push('uncertain'); },
  };
  const instance = createApp({ origin: 'https://qa.invalid', sessionPool, sessionSecret: secret, admission,
    authority: { async authorize() { return { user: { id: randomUUID() }, purpose: 'company', contextVersion: 1, descriptor: { tenantId, dataEpoch: 1 } }; } },
    tenantPools: { async withTenant(_descriptor, callback) { events.push('tenant-open'); return callback({ async query() { if (blockedPhase === 'tenant-work') await work; events.push('sql-settled'); return { rows: [] }; } }); } },
  });
  const server = await new Promise(resolve => { const listening = instance.app.listen(0, '127.0.0.1', () => resolve(listening)); });
  try {
    const response = await new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: server.address().port, path: `/api/tenants/${tenantId}/catalog`, headers: { Host: 'qa.invalid', Cookie: `__Host-mecanet-session=${encodeURIComponent(signed)}` } }, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', data => { body += data; }); res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject); req.end();
    });
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(response.body), { error: 'SERVICE_UNAVAILABLE' });
    assert.ok(events.includes('session-read') && events.includes('tenant-open'));
    assert.equal(events.includes('sql-settled'), blockedPhase === 'byte-accounting');
    assert.ok(!events.includes('bytes-accounted'));
    releaseWork();
    for (let i = 0; instance.state().active && i < 100; i++) await delay(10);
    assert.equal(instance.state().active, 0);
    assert.ok(events.includes('sql-settled'));
    assert.equal(events.includes('bytes-accounted'), blockedPhase === 'byte-accounting');
    assert.ok(events.includes('uncertain'), 'unmetered deadline response must retain ticket as UNCERTAIN');
    assert.ok(!events.includes('finished'), 'response completion alone cannot release an unaccounted byte reservation');
  } finally {
    releaseWork();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
