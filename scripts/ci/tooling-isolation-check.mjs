// Exercise the actual P1-L1 commands with the guard installed in Node and workers.
// Full npm audit remains mandatory and independent; no advisory is waived here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { blockedPackage, marker } from './tooling-isolation.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const preload = new URL('./tooling-isolation.mjs', import.meta.url).href;
const sha256 = value => createHash('sha256').update(value).digest('hex');
if (process.version !== 'v24.21.0') throw new Error('P1_L1_EXACT_NODE_RUNTIME_REQUIRED');

function assertConfiguration(config) {
  assert.equal(config.envDir, false, 'legacy environment loading must stay disabled');
  assert.equal(config.publicDir, false, 'legacy public assets must stay excluded');
  assert.deepEqual(config.css?.postcss?.plugins, [], 'legacy PostCSS must stay excluded');
  assert.equal(typeof config.css.postcss, 'object');
}

if (process.argv[2] === 'bundle-proof') {
  assert.equal(globalThis[marker], true);
  const { build, loadConfigFromFile } = await import('../../client/node_modules/vite/dist/node/index.js');
  const configFile = resolve(root, 'client/vite.saas.config.js');
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, configFile);
  assertConfiguration(loaded.config);
  let moduleIds = [];
  const output = await build({
    configFile, mode: 'production', build: { write: false },
    plugins: [{
      name: 'p1-l1-browser-dependency-isolation',
      generateBundle() {
        moduleIds = [...this.getModuleIds()];
        for (const id of moduleIds) assert.equal(blockedPackage(id), null, 'legacy tooling reached the browser bundle');
      },
    }],
  });
  const assets = (Array.isArray(output) ? output : [output]).flatMap(item => item.output)
    .map(item => {
      const content = item.type === 'chunk' ? item.code : item.source;
      const hash = sha256(content);
      const compiled = resolve(root, 'client/dist-saas', item.fileName);
      assert.equal(sha256(readFileSync(compiled)), hash, `inspection changed ${item.fileName}`);
      return { path: item.fileName, sha256: hash };
    }).sort((a, b) => a.path.localeCompare(b.path));
  console.log(`TOOLING_ISOLATION_EVIDENCE:${JSON.stringify({ moduleIds: moduleIds.length, standaloneBlockedPackagesInBrowser: 0, compiledAssetsIdentical: true, assets, limit: 'Vite bundled internals are not package-resolver hooks' })}`);
} else {
  const environment = Object.fromEntries(
    ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']
      .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]),
  );
  Object.assign(environment, { NODE_ENV: 'test', CI: 'true', REAL_API: 'false', VITEST_REAL_API: 'false', NODE_OPTIONS: `--import=${preload}` });
  const scratchParent = resolve(root, '.qa-private/cp016-tooling');
  mkdirSync(scratchParent, { recursive: true });
  const scratch = mkdtempSync(resolve(scratchParent, 'check-'));
  // Paths are created by this process, never accepted from an external payload.
  assert.equal(relative(scratchParent, scratch).startsWith('check-'), true);
  const created = [];
  function create(name, contents) {
    const path = resolve(scratch, name);
    writeFileSync(path, contents, { flag: 'wx' });
    created.push(path);
    return path;
  }
  function run(args, extra = {}) {
    const result = spawnSync(process.execPath, ['--max-old-space-size=512', '--import', preload, ...args], {
      cwd: root, env: { ...environment, ...extra }, stdio: 'inherit', timeout: 120000, windowsHide: true,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `guarded child failed: ${args[0]}`);
  }
  try {
    const sentinel = create('worker-sentinel.mjs', `if (globalThis[Symbol.for('mecanet.p1-l1.tooling-isolation')] !== true) throw new Error('TOOLING_GUARD_MISSING_IN_TEST_WORKER');\n`);
    function guardedConfiguration(original, name) {
      return create(name, `import base from ${JSON.stringify(pathToFileURL(resolve(root, original)).href)};\nexport default { ...base, test: { ...base.test, maxWorkers: 1, setupFiles: [...(base.test.setupFiles ?? []), ${JSON.stringify(sentinel)}] } };\n`);
    }
    const frontendConfig = guardedConfiguration('client/vite.saas.config.js', 'frontend.config.mjs');
    const sanitizerConfig = guardedConfiguration('scripts/ci/safe-documents.vitest.config.mjs', 'sanitizer.config.mjs');
    run(['client/node_modules/vitest/vitest.mjs', 'run', '--config', frontendConfig]);
    run(['client/node_modules/vitest/vitest.mjs', 'run', '--config', sanitizerConfig]);
    run(['client/node_modules/vite/bin/vite.js', 'build', '--config', 'client/vite.saas.config.js'], { NODE_ENV: 'production' });
    run(['scripts/ci/tooling-isolation-check.mjs', 'bundle-proof'], { NODE_ENV: 'production' });
    console.log('PASS: guarded SaaS tests, sanitizer tests and production build; workers acknowledged the preload');
  } finally {
    for (const path of created) unlinkSync(path);
    rmdirSync(scratch);
  }
}
