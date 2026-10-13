// Actual loopback HTTP and Express lifecycle; SQL/admission are synthetic.
// No .env, fixture credentials, PostgreSQL, SSH or deployment is loaded.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../../server/saas/app.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const sensitive = 'SYNTHETIC_PRIVATE_SQL_PAYLOAD_TOKEN_7F4A';

async function postResponseFailure({ allowlistedCause }) {
  const secret = randomBytes(48).toString('hex');
  const sid = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  const signed = `s:${sid}.${createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '')}`;
  const operationId = randomUUID();
  const result = { operationId, state: 'CONFIRMED', productId: randomUUID(), movementId: null, onHand: '0', balanceVersion: '1', dataEpoch: '1' };
  const diagnostics = []; const events = [];
  let responses = 0; let responseEnds = 0; let secondResponseAttempts = 0; let writerFinishRejected = false;
  const authorityContext = { user: { id: randomUUID() }, purpose: 'company', generation: randomUUID(), contextVersion: '1', descriptor: { tenantId, dataEpoch: '1', schemaVersion: 2 } };
  const sessionPool = { async query(sql) {
    if (sql.startsWith('SELECT sess')) return { rows: [{ sess: { cookie: { originalMaxAge: 28800000, expires: new Date(Date.now() + 28800000).toISOString(), secure: true, httpOnly: true, path: '/', sameSite: 'lax' }, csrfToken: csrf } }] };
    return { rows: [] };
  } };
  const admission = {
    async observeClock() {}, ready: () => true,
    async admit() { return { id: randomUUID(), state: 'ACTIVE' }; },
    async startWork() {}, async heartbeat() {},
    async consumeBytes(_id, bytes) { assert.equal(bytes, Buffer.byteLength(JSON.stringify(result))); events.push('byte-accounting-ack'); },
    async finish(_id, proof) { assert.deepEqual(proof, { sqlSettled: true, responseSettled: true }); events.push('admission-finish-ack'); },
    async markUncertain() { events.push('admission-uncertain'); },
  };
  const writes = {
    async classifyWork() { return 3; },
    async write({ input }) { assert.equal(input.name, sensitive); events.push('tenant-result-known'); return result; },
    async finish() {
      events.push('writer-settlement'); writerFinishRejected = true;
      const error = Object.assign(new Error(`SELECT password FROM ${sensitive}; token=${sensitive}`), {
        code: 'WRITE_UNCERTAIN', status: 503, sql: `SELECT '${sensitive}'`, token: sensitive, payload: { private: sensitive },
        cause: new Error(sensitive),
        causeCode: allowlistedCause ? 'P0001' : sensitive,
        causeReason: allowlistedCause ? 'WRITE_GUARDS_CHANGED' : sensitive,
        causeRelation: allowlistedCause ? 'writer_fence' : sensitive,
      });
      error.stack = `Error: ${sensitive}\n at private (server/saas/${allowlistedCause ? 'admission/transaction' : 'writes/service'}.js:53:17)\nSQL=${sensitive}`;
      throw error;
    },
  };
  const instance = createApp({ origin: 'https://qa.invalid', trustedProxy: '127.0.0.1', sessionPool, sessionSecret: secret, authority: { authorize: async () => authorityContext }, admission, tenantPools: {}, writes, reportError: entry => diagnostics.push(entry) });
  const server = http.createServer((req, res) => {
    const writeHead = res.writeHead.bind(res); const end = res.end.bind(res); const setHeader = res.setHeader.bind(res);
    res.writeHead = (...args) => { responses++; if (res.headersSent || res.writableEnded) secondResponseAttempts++; return writeHead(...args); };
    res.end = (...args) => { responseEnds++; if (res.headersSent && res.writableEnded) secondResponseAttempts++; return end(...args); };
    res.setHeader = (...args) => { if (res.headersSent || res.writableEnded) secondResponseAttempts++; return setHeader(...args); };
    res.once('finish', () => events.push('http-response-finished'));
    instance.app(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const body = JSON.stringify({ sku: 'POST-DIAGNOSTIC', name: sensitive });
    const received = await new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port: server.address().port, path: `/api/tenants/${tenantId}/products`, method: 'POST', headers: { Host: 'qa.invalid', 'X-Forwarded-Proto': 'https', Origin: 'https://qa.invalid', Cookie: `__Host-mecanet-session=${encodeURIComponent(signed)}`, 'X-CSRF-Token': csrf, 'Idempotency-Key': operationId, 'X-Data-Epoch': '1', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, response => {
        const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode, requestId: response.headers['x-request-id'], body: Buffer.concat(chunks).toString('utf8') }));
      });
      request.on('error', reject); request.end(body);
    });
    const deadline = performance.now() + 1000;
    while ((!writerFinishRejected || instance.state().active) && performance.now() < deadline) await delay(5);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(instance.state().active, 0); assert.equal(writerFinishRejected, true);
    assert.equal(received.status, 201); assert.deepEqual(JSON.parse(received.body), result);
    assert.equal(responses, 1); assert.equal(responseEnds, 1); assert.equal(secondResponseAttempts, 0);
    assert(events.indexOf('byte-accounting-ack') < events.indexOf('admission-finish-ack'));
    assert(events.indexOf('http-response-finished') < events.indexOf('writer-settlement'));
    assert.equal(diagnostics.length, 1, 'A post201 settlement failure must still emit one safe diagnostic');
    const expected = { requestId: received.requestId, code: 'WRITE_UNCERTAIN', status: 503, errorType: 'Error', ...(allowlistedCause ? { location: 'server/saas/admission/transaction.js:53:17', causeCode: 'P0001', causeReason: 'WRITE_GUARDS_CHANGED', causeRelation: 'writer_fence' } : {}) };
    assert.match(received.requestId, /^[0-9a-f-]{36}$/); assert.deepEqual(diagnostics[0], expected);
    const output = JSON.stringify(diagnostics);
    for (const privateValue of [sensitive, secret, sid, csrf, signed, operationId, result.productId]) assert.equal(output.includes(privateValue), false);
    for (const forbidden of ['message', 'stack', 'sql', 'token', 'payload', 'cause', 'body', 'headers', 'cookie']) assert.equal(Object.hasOwn(diagnostics[0], forbidden), false);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('post201 writer settlement failure emits only allowlisted diagnostic fields and never sends a second response', { timeout: 5000 }, () => postResponseFailure({ allowlistedCause: true }));
test('post201 writer diagnostic omits arbitrary cause values and unlisted stack locations', { timeout: 5000 }, () => postResponseFailure({ allowlistedCause: false }));
