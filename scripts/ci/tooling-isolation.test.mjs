import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { blockedPackage, blockedPackages } from './tooling-isolation.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const preload = new URL('./tooling-isolation.mjs', import.meta.url).href;
const environment = Object.fromEntries(
  ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]),
);
Object.assign(environment, { NODE_ENV: 'test', CI: 'true' });

test('guard identifies standalone and nested package paths without prefix collisions', () => {
  for (const name of blockedPackages) {
    assert.equal(blockedPackage(name), name);
    assert.equal(blockedPackage(`${name}/lib/index.js`), name);
    assert.equal(blockedPackage(`file:///C:/source/node_modules/${name}/index.js`), name);
    assert.equal(blockedPackage(`C:\\source\\node_modules\\x\\node_modules\\${name}\\index.js`), name);
    assert.equal(blockedPackage(`file:///source/node_modules%2F${name}/index.js`), name);
    assert.equal(blockedPackage(`${name}-example/index.js`), null);
  }
  assert.equal(blockedPackage('node:fs'), null);
  assert.equal(blockedPackage('/source/my-tailwindcss-notes.js'), null);
});

test('benign deliberate ESM and CommonJS loads are rejected before package execution', () => {
  const clientPackage = resolve(root, 'client/package.json');
  const script = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const require = createRequire(${JSON.stringify(clientPackage)});
    for (const name of ${JSON.stringify(blockedPackages)}) {
      assert.throws(() => require(name), { code: 'ERR_P1_L1_TOOLING_ISOLATION' });
      // Resolve via a path computed before importing, so the load hook also covers aliases.
      const path = ${JSON.stringify(resolve(root, 'client/node_modules'))} + '/' + name + '/package.json';
      await assert.rejects(import(pathToFileURL(path).href, { with: { type: 'json' } }),
        { code: 'ERR_P1_L1_TOOLING_ISOLATION' });
    }
    const fs = require('node:fs');
    assert.equal(typeof fs.readFileSync, 'function');
    assert.equal(typeof (await import('node:path')).resolve, 'function');
    console.log('14 controlled loads rejected; builtins remain available');
  `;
  const result = spawnSync(process.execPath, ['--max-old-space-size=128', '--import', preload, '--input-type=module', '--eval', script], {
    cwd: root, env: environment, encoding: 'utf8', timeout: 15000,
    maxBuffer: 128 * 1024, windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /14 controlled loads rejected/);
});

test('unhandled deliberate ESM import fails closed with the isolation error', () => {
  const target = new URL('../../client/node_modules/tailwindcss/lib/index.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--max-old-space-size=128', '--import', preload, '--input-type=module', '--eval', `await import(${JSON.stringify(target)});`], {
    cwd: root, env: environment, encoding: 'utf8', timeout: 15000,
    maxBuffer: 128 * 1024, windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERR_P1_L1_TOOLING_ISOLATION/);
});

test('a benign dependency outside the isolated root is rejected before fallback', () => {
  const parent = resolve(root, '.qa-private/cp016-tooling');
  mkdirSync(parent, { recursive: true });
  const scratch = mkdtempSync(resolve(parent, 'fallback-'));
  const isolated = resolve(scratch, 'isolated/scripts/ci');
  const external = resolve(scratch, 'external/node_modules/benign-fixture');
  mkdirSync(isolated, { recursive: true });
  mkdirSync(external, { recursive: true });
  const guard = resolve(isolated, 'tooling-isolation.mjs');
  const dependency = resolve(external, 'index.mjs');
  writeFileSync(guard, readFileSync(fileURLToPath(preload)), { flag: 'wx' });
  writeFileSync(dependency, 'throw new Error("DEPENDENCY_MUST_NOT_EXECUTE");\n', { flag: 'wx' });
  try {
    const result = spawnSync(process.execPath, ['--max-old-space-size=128', '--import', pathToFileURL(guard).href, '--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(dependency).href)});`], {
      cwd: root, env: environment, encoding: 'utf8', timeout: 15000,
      maxBuffer: 128 * 1024, windowsHide: true,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ERR_P1_L1_TOOLING_FALLBACK/);
    assert.doesNotMatch(result.stderr, /Error: DEPENDENCY_MUST_NOT_EXECUTE/);
  } finally {
    unlinkSync(guard);
    unlinkSync(dependency);
    for (const directory of [isolated, resolve(scratch, 'isolated/scripts'), resolve(scratch, 'isolated'), external, resolve(scratch, 'external/node_modules'), resolve(scratch, 'external'), scratch]) rmdirSync(directory);
  }
});
