// Private CP-014 lifecycle probe. Authority comes from the standard cookie/store.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createQaClient, assertStatus } from './http-client.mjs';
import { arm, waitEvent, release } from './faults.mjs';

const stage = process.argv[2];
const checkpoint = process.argv[3] ?? 'admission.bytes';
const instance = process.argv[4] ?? 'api1';
assert.ok(['flight', 'verify'].includes(stage), 'UNKNOWN_LIFECYCLE_STAGE');
assert.ok(['admission.started', 'admission.bytes'].includes(checkpoint), 'UNKNOWN_DRAIN_CHECKPOINT');
assert.ok(['api1', 'api2'].includes(instance), 'UNKNOWN_PRIVATE_API');
const ca = await readFile('/run/qa-ca.crt', 'utf8');
const login = JSON.parse(await readFile('/run/qa-secrets/fixture-login.json', 'utf8'));
const credential = { email: 'a@qa.invalid', password: login.password };
const client = createQaClient({ ca, instance, login: credential, budget: 100 });
const web = createQaClient({ ca, instance: 'web', budget: 10 });
const tenantId = '11111111-1111-4111-8111-111111111111';
const catalogPath = `/api/tenants/${tenantId}/catalog`;
const key = `${instance}-${checkpoint.replace('.', '-')}`;
const sessionFile = `/run/qa-faults/lifecycle-${key}-private.json`;
const readyFile = `/run/qa-faults/lifecycle-${key}-ready.json`;
const resultFile = `/run/qa-results/lifecycle-${key}-${stage}.json`;
const fingerprint = items => createHash('sha256').update(JSON.stringify(items)).digest('hex');
let gate;
try {
  if (stage === 'flight') {
    await client.login();
    const before = await client.request(catalogPath);
    assertStatus(before, 200);
    assert.equal(before.json.tenantId, tenantId);
    assert.equal(before.json.items.length, 2);
    // Kept outside the evidence mount. A controller must never copy this file.
    await writeFile(sessionFile, JSON.stringify({ cookie: client.cookieHeader(), csrf: client.csrf, dataFingerprint: fingerprint(before.json.items), tenantId }), { mode: 0o600 });
    gate = await arm({ instance, stage: checkpoint, tenantId });
    const request = client.request(catalogPath);
    // Prevent an unhandled rejection while the controller reaches its checkpoint.
    request.catch(() => {});
    const event = await waitEvent(gate);
    const observedAt = new Date().toISOString();
    await writeFile(readyFile, JSON.stringify({ checkpoint, instance, gateId: gate.id, ticketId: event.ticketId, owner: event.owner, observedAt }), { mode: 0o600 });
    let unavailable = null;
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      const response = await client.request('/api/health/ready');
      if (response.status === 503) { unavailable = response; break; }
      assertStatus(response, 200);
      await delay(40);
    }
    assertStatus(unavailable ?? { status: 0 }, 503);
    assert.equal(unavailable.json.status, 'unavailable');
    const rejected = await client.request(catalogPath);
    assertStatus(rejected, 503);
    assert.equal(rejected.json.error, 'DRAINING', 'NEW_REQUEST_NOT_REJECTED_BY_DRAIN');
    // A real committed ticket remains in flight while shutdown waits. No SQL
    // timeout or admission quota is enlarged to keep the probe green.
    await delay(250);
    await release(gate);
    gate = null;
    const response = await request;
    assertStatus(response, 200);
    assert.equal(fingerprint(response.json.items), fingerprint(before.json.items));
    const result = { result: 'PASS', stage, checkpoint, instance, time: new Date().toISOString(), ticketId: event.ticketId, owner: event.owner, twoHundredForExistingFlight: true, readinessUnavailableDuringDrain: true, newRequestRejectedAsDraining: true, dataFingerprint: fingerprint(response.json.items), scope: checkpoint === 'admission.started' ? 'Committed operation in flight before catalogue execution' : 'Real SQL completed and payload accounted; operation/HTTP response still in flight' };
    await writeFile(resultFile, JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
  } else {
    const session = JSON.parse(await readFile(sessionFile, 'utf8'));
    client.setCookies(session.cookie); client.csrf = session.csrf;
    const current = await client.request('/api/auth/session');
    assertStatus(current, 200); assert.equal(current.json.authenticated, true); assert.equal(current.json.purpose, 'company');
    const catalog = await client.request(catalogPath);
    assertStatus(catalog, 200); assert.equal(catalog.json.tenantId, tenantId);
    assert.equal(fingerprint(catalog.json.items), session.dataFingerprint, 'SYNTHETIC_CATALOG_CHANGED');
    const asset = await web.request('/assets/cp014-no-such-asset.js');
    assert.equal(asset.status, 404, `ASSET_EXPECTED_404_RECEIVED_${asset.status}`);
    assert.doesNotMatch(asset.text, /<div[^>]+id=["']root["']/i, 'MISSING_ASSET_RETURNED_APP_SHELL');
    const apiMissing = await web.request('/api/cp014-no-such-endpoint');
    assertStatus(apiMissing, 404); assert.deepEqual(apiMissing.json, { error: 'NOT_FOUND' });
    const health = [];
    for (const target of ['api1', 'api2']) {
      const response = await createQaClient({ ca, instance: target, budget: 4 }).request('/api/health/ready');
      assertStatus(response, 200); health.push({ instance: target, status: response.status });
    }
    const result = { result: 'PASS', stage, checkpoint, instance, time: new Date().toISOString(), sameStandardSessionAuthenticated: true, dataFingerprintPreserved: true, dataFingerprint: session.dataFingerprint, missingAsset404: true, unknownApiJson404: true, bothApiReady: health };
    await writeFile(resultFile, JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(JSON.stringify({ result: 'FAIL', stage, checkpoint, instance, code: error.code ?? error.message ?? 'LIFECYCLE_FAILED' }));
  process.exitCode = 1;
} finally {
  if (gate) await release(gate).catch(() => {});
}
