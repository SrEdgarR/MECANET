import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const generator = fileURLToPath(new URL('./generateJwtSecret.js', import.meta.url));
const example = fileURLToPath(new URL('../.env.example', import.meta.url));

function runSetup(t, content, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mecanet-setup-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.copyFileSync(example, path.join(directory, '.env.example'));
  if (content !== undefined) fs.writeFileSync(path.join(directory, '.env'), content);
  const env = { ...process.env };
  for (const key of ['VERCEL', 'RAILWAY_ENVIRONMENT', 'HEROKU_APP_NAME', 'APP_MODE', 'JWT_SECRET']) delete env[key];
  const result = spawnSync(process.execPath, [generator], {
    cwd: directory, env: { ...env, ...overrides }, encoding: 'utf8',
  });
  const envPath = path.join(directory, '.env');
  return { ...result, content: fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : undefined };
}

test('creates usable local settings and a secret without printing it', t => {
  const result = runSetup(t);
  assert.equal(result.status, 0, result.stderr);
  const env = dotenv.parse(result.content);
  assert.equal(env.MONGODB_URI, 'mongodb://localhost:27017/mecanet');
  assert.match(env.JWT_SECRET, /^[a-f0-9]{64}$/);
  assert.ok(!result.stdout.includes(env.JWT_SECRET));
});

test('preserves a valid unquoted secret and the entire existing configuration', t => {
  const content = `MONGODB_URI=mongodb://localhost/custom\nJWT_SECRET=${'a'.repeat(64)}\n`;
  assert.equal(runSetup(t, content).content, content);
});

test('replaces a placeholder without changing the database', t => {
  const result = runSetup(t, 'MONGODB_URI=mongodb://localhost/custom\nJWT_SECRET=CAMBIA_ESTE_VALOR_POR_UNO_SEGURO_DE_64_CARACTERES_MINIMO\n');
  assert.equal(dotenv.parse(result.content).MONGODB_URI, 'mongodb://localhost/custom');
  assert.match(dotenv.parse(result.content).JWT_SECRET, /^[a-f0-9]{64}$/);
});

for (const overrides of [{ APP_MODE: 'cloud' }, { VERCEL: '1' }, { RAILWAY_ENVIRONMENT: 'production' }, { HEROKU_APP_NAME: 'mecanet' }]) {
  test(`does not create local configuration in ${Object.keys(overrides)[0]}`, t => {
    const result = runSetup(t, undefined, overrides);
    assert.notEqual(result.status, 0);
    assert.equal(result.content, undefined);
  });
}

test('does not modify an existing cloud configuration', t => {
  const content = 'APP_MODE=cloud\nJWT_SECRET=placeholder\n';
  const result = runSetup(t, content);
  assert.notEqual(result.status, 0);
  assert.equal(result.content, content);
});
