import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import { once } from 'node:events';
import { createCorsOptions, createHealthHandler } from '../config/http.js';

test('cloud API accepts its frontend, rejects other origins and reports database availability', async t => {
  let online = true;
  const connection = { readyState: 1, db: { command: async () => {
    if (!online) throw new Error('private database connection details');
    return { ok: 1 };
  } } };
  const app = express();
  app.use(cors(createCorsOptions({ isLocalApp: false, env: { NODE_ENV: 'production' } })));
  app.get('/api/health', createHealthHandler(connection));
  app.use((error, req, res, next) => res.status(403).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/health';

  const response = await fetch(endpoint, { headers: { Origin: 'https://app.mecanet.site' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.mecanet.site');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok' });

  const preflight = await fetch(endpoint, { method: 'OPTIONS', headers: {
    Origin: 'https://app.mecanet.site',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type',
  } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/);

  for (const origin of ['https://app.mecanet.site.attacker.test', 'http://localhost:3000']) {
    const rejected = await fetch(endpoint, { headers: { Origin: origin } });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  }

  online = false;
  const unavailable = await fetch(endpoint);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { status: 'unavailable' });
  online = true;
  connection.readyState = 0;
  assert.equal((await fetch(endpoint)).status, 503);
});

test('local mode remains restricted to loopback and cloud origins are configurable', async () => {
  const allowed = (options, origin) => new Promise((resolve, reject) => {
    options.origin(origin, (error, value) => error ? reject(error) : resolve(value));
  });
  const local = createCorsOptions({ isLocalApp: true, env: { NODE_ENV: 'production' } });
  for (const origin of ['http://localhost:5000', 'http://127.0.0.1:3000', 'http://[::1]:5000']) {
    assert.equal(await allowed(local, origin), true);
  }
  await assert.rejects(allowed(local, 'https://localhost.attacker.test'), /CORS/);
  await assert.rejects(allowed(local, 'https://app.mecanet.site'), /CORS/);
  const cloud = createCorsOptions({ isLocalApp: false, env: {
    NODE_ENV: 'production', CORS_ORIGINS: 'https://app.mecanet.site, https://preview.example.com',
  } });
  assert.equal(await allowed(cloud, 'https://preview.example.com'), true);
});
