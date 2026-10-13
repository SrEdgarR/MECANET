import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, lstatSync, existsSync, realpathSync, symlinkSync, linkSync, unlinkSync, rmdirSync } from 'node:fs';
import { checkedPath, readRegular, writeRegular, stageSources, verifyInputs, subprocessEnvironment, resolveNpmCli, cleanupStage, promoteAssets, within } from './saas-toolchain.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const parent = resolve(root, '.qa-private/saas-toolchain-unit');
mkdirSync(parent, { recursive: true });
function fixture(callback) {
  const base = mkdtempSync(resolve(parent, 'test-'));
  const links = [];
  function write(name, content = 'synthetic source\n') {
    const path = resolve(base, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return path;
  }
  function link(target, name) {
    const path = resolve(base, name);
    symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
    links.push(path);
    return path;
  }
  write('scripts/ci/saas-toolchain/package.json', '{"private":true}\n');
  write('scripts/ci/saas-toolchain/package-lock.json', '{"lockfileVersion":3}\n');
  write('client/source.js', Buffer.from([0, 13, 10, 226, 152, 131]));
  try { callback({ base, write, link }); }
  finally {
    for (const path of links) if (existsSync(path) || (() => { try { return lstatSync(path).isSymbolicLink(); } catch { return false; } })()) unlinkSync(path);
    assert.ok(within(realpathSync(parent), realpathSync(base)));
    assert.match(relative(parent, base), /^test-[A-Za-z0-9_-]+$/);
    function remove(path) {
      assert.ok(within(base, path));
      const stat = lstatSync(path);
      assert.equal(stat.isSymbolicLink(), false);
      if (stat.isDirectory()) {
        for (const name of readdirSync(path)) remove(resolve(path, name));
        rmdirSync(path);
      } else unlinkSync(path);
    }
    remove(base);
  }
}

test('relative path boundary rejects traversal, absolute paths and ambiguous separators', () => fixture(({ base }) => {
  for (const path of ['../outside', '/absolute', 'C:\\absolute', 'client/../source', 'client//source', 'client\\source', './client']) {
    assert.throws(() => checkedPath(base, path), /INVALID_RELATIVE_PATH/);
  }
  assert.equal(checkedPath(base, 'client/source.js'), resolve(base, 'client/source.js'));
}));

test('materialization copies bytes exactly and excludes environment/unlisted files', () => fixture(({ base, write }) => {
  write('.env', 'SYNTHETIC_DO_NOT_COPY');
  write('client/unlisted.js', 'unlisted');
  const stage = stageSources(base, ['client/source.js']);
  assert.deepEqual(readFileSync(resolve(stage.root, 'client/source.js')), readFileSync(resolve(base, 'client/source.js')));
  assert.equal(stage.inputs.length, 3);
  assert.equal(existsSync(resolve(stage.root, '.env')), false);
  assert.equal(existsSync(resolve(stage.root, 'client/unlisted.js')), false);
  verifyInputs(stage);
  cleanupStage(stage);
}));

test('provenance rejects changed staged input instead of executing it', () => fixture(({ base }) => {
  const stage = stageSources(base, ['client/source.js']);
  writeFileSync(resolve(stage.root, 'client/source.js'), 'changed');
  assert.throws(() => verifyInputs(stage), /INPUT_PROVENANCE_CHANGED/);
  cleanupStage(stage);
}));

test('provenance rejects changed canonical source during a run', () => fixture(({ base, write }) => {
  const stage = stageSources(base, ['client/source.js']);
  write('client/source.js', 'changed canonical source');
  assert.throws(() => verifyInputs(stage), /INPUT_PROVENANCE_CHANGED/);
  cleanupStage(stage);
}));

test('source junction cannot cross into an unlisted directory', () => fixture(({ base, write, link }) => {
  write('foreign/source.js', 'unlisted outside source');
  link(resolve(base, 'foreign'), 'client/alias');
  assert.throws(() => readRegular(base, 'client/alias/source.js'), /SYMLINK_REJECTED/);
}));

test('oversize or nonregular source is refused', () => fixture(({ base, write }) => {
  write('client/oversize.js', Buffer.alloc(32));
  assert.throws(() => readRegular(base, 'client/oversize.js', 16), /NOT_REGULAR_OR_BOUNDED/);
  assert.throws(() => readRegular(base, 'client'), /NOT_REGULAR_OR_BOUNDED/);
}));

test('subprocesses receive explicit support only and private empty npm config/home', () => fixture(({ base }) => {
  const stage = stageSources(base, ['client/source.js']);
  const env = subprocessEnvironment({ PATH: 'synthetic-path', HOME: 'foreign', USERPROFILE: 'foreign', DATABASE_URL: 'synthetic-private', MONGODB_URI: 'synthetic-private', GITHUB_TOKEN: 'synthetic-private', NODE_OPTIONS: '--inspect', NODE_PATH: 'foreign', NPM_CONFIG_USERCONFIG: 'foreign' }, stage);
  assert.equal(env.PATH, 'synthetic-path');
  for (const key of ['DATABASE_URL', 'MONGODB_URI', 'GITHUB_TOKEN', 'NODE_OPTIONS', 'NODE_PATH']) assert.equal(env[key], undefined);
  assert.ok(within(stage.root, env.HOME));
  assert.equal(env.USERPROFILE, env.HOME);
  assert.notEqual(env.NPM_CONFIG_USERCONFIG, env.NPM_CONFIG_GLOBALCONFIG);
  assert.equal(readFileSync(env.NPM_CONFIG_USERCONFIG, 'utf8'), '');
  assert.equal(readFileSync(env.NPM_CONFIG_GLOBALCONFIG, 'utf8'), '');
  cleanupStage(stage);
}));

test('cleanup refuses a foreign ownership token without deleting contents', () => fixture(({ base }) => {
  const stage = stageSources(base, ['client/source.js']);
  assert.throws(() => cleanupStage({ ...stage, ownership: 'foreign' }), /NOT_OWNED/);
  assert.equal(existsSync(resolve(stage.root, 'client/source.js')), true);
  cleanupStage(stage);
}));

test('cleanup refuses a junction before any deletion and preserves the external target', () => fixture(({ base, write, link }) => {
  write('foreign/keep.txt', 'keep');
  const stage = stageSources(base, ['client/source.js']);
  const name = relative(base, resolve(stage.root, 'external'));
  const junction = link(resolve(base, 'foreign'), name);
  assert.throws(() => cleanupStage(stage), /CLEANUP_SYMLINK/);
  assert.equal(existsSync(resolve(stage.root, '.owner.json')), true);
  assert.equal(readFileSync(resolve(base, 'foreign/keep.txt'), 'utf8'), 'keep');
  unlinkSync(junction);
  cleanupStage(stage);
}));

test('cleanup deletes only its fresh owned stage, preserving a neighboring directory', () => fixture(({ base, write }) => {
  const stage = stageSources(base, ['client/source.js']);
  write('.qa-private/saas-toolchain/foreign/keep.txt', 'keep');
  cleanupStage(stage);
  assert.equal(existsSync(stage.root), false);
  assert.equal(readFileSync(resolve(base, '.qa-private/saas-toolchain/foreign/keep.txt'), 'utf8'), 'keep');
}));

function buildOutput(stage) {
  mkdirSync(resolve(stage.root, 'client/dist-saas/assets'), { recursive: true });
  writeFileSync(resolve(stage.root, 'client/dist-saas/saas.html'), '<p>synthetic</p>');
  writeFileSync(resolve(stage.root, 'client/dist-saas/assets/saas-test.js'), 'console.log("synthetic")');
  writeFileSync(resolve(stage.root, 'client/dist-saas/assets/saas-test.css'), 'body{color:black}');
}

test('promotion verifies three assets and preserves unrelated existing files', () => fixture(({ base, write }) => {
  write('client/dist-saas/foreign.txt', 'keep');
  const stage = stageSources(base, ['client/source.js']);
  buildOutput(stage);
  const entries = promoteAssets(stage);
  assert.equal(entries.length, 3);
  assert.equal(readFileSync(resolve(base, 'client/dist-saas/foreign.txt'), 'utf8'), 'keep');
  for (const entry of entries) assert.deepEqual(readFileSync(resolve(base, entry.path)), readFileSync(resolve(stage.root, entry.path)));
  cleanupStage(stage);
}));

test('unexpected build output cannot be promoted', () => fixture(({ base }) => {
  const stage = stageSources(base, ['client/source.js']);
  buildOutput(stage);
  writeFileSync(resolve(stage.root, 'client/dist-saas/unexpected.html'), 'unexpected');
  assert.throws(() => promoteAssets(stage), /UNEXPECTED_BUILD_OUTPUT/);
  assert.equal(existsSync(resolve(base, 'client/dist-saas')), false);
  cleanupStage(stage);
}));

test('promotion refuses a destination junction and leaves its target untouched', () => fixture(({ base, write, link }) => {
  write('foreign/keep.txt', 'keep');
  mkdirSync(resolve(base, 'client/dist-saas'), { recursive: true });
  link(resolve(base, 'foreign'), 'client/dist-saas/assets');
  const stage = stageSources(base, ['client/source.js']);
  buildOutput(stage);
  assert.throws(() => promoteAssets(stage), /SYMLINK_REJECTED/);
  assert.equal(readFileSync(resolve(base, 'foreign/keep.txt'), 'utf8'), 'keep');
  cleanupStage(stage);
}));

test('a previous result hardlink cannot overwrite another file', () => fixture(({ base, write }) => {
  const target = write('foreign/keep.txt', 'keep');
  mkdirSync(resolve(base, '.qa-private/saas-toolchain'), { recursive: true });
  linkSync(target, resolve(base, '.qa-private/saas-toolchain/last-result.json'));
  assert.throws(() => writeRegular(base, '.qa-private/saas-toolchain/last-result.json', 'replace'), /OUTPUT_NOT_REGULAR/);
  assert.equal(readFileSync(target, 'utf8'), 'keep');
}));

test('checked result writing preserves file identity and verifies the result bytes', () => fixture(({ base, write }) => {
  const path = write('.qa-private/saas-toolchain/last-result.json', 'previous');
  const before = lstatSync(path);
  writeRegular(base, '.qa-private/saas-toolchain/last-result.json', 'verified');
  assert.equal(lstatSync(path).ino, before.ino);
  assert.equal(readRegular(base, '.qa-private/saas-toolchain/last-result.json').toString(), 'verified');
}));

test('npm resolution selects a regular JS CLI with exact package identity from PATH', () => fixture(({ base, write }) => {
  const path = write('tool path/node_modules/npm/bin/npm-cli.js', '// synthetic CLI; not executed');
  write('tool path/node_modules/npm/package.json', '{"name":"npm","version":"11.9.0"}');
  assert.equal(resolveNpmCli({ PATH: resolve(base, 'tool path') }, resolve(base, 'unavailable/node')), realpathSync(path));
}));

test('npm resolution rejects an incorrect package version instead of running it', () => fixture(({ base, write }) => {
  write('tools/node_modules/npm/bin/npm-cli.js', '// synthetic wrong CLI; not executed');
  write('tools/node_modules/npm/package.json', '{"name":"npm","version":"99.0.0"}');
  assert.throws(() => resolveNpmCli({ PATH: resolve(base, 'tools') }, resolve(base, 'unavailable/node')), /EXACT_NPM_JS_CLI_REQUIRED/);
}));
