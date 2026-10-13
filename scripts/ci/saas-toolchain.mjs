// SC-008: one isolated toolchain for the existing SaaS sources. No deployment.
import { createHash, randomUUID } from 'node:crypto';
import { constants, openSync, closeSync, fstatSync, ftruncateSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, lstatSync, realpathSync, readdirSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, basename, delimiter, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const sourceFiles = Object.freeze([
  'client/src/saas/Catalog.jsx', 'client/src/saas/client.js', 'client/src/saas/client.test.js',
  'client/src/saas/LoginForm.jsx', 'client/src/saas/main.jsx', 'client/src/saas/retry.test.js',
  'client/src/saas/RetryAccess.jsx', 'client/src/saas/RetryAccess.test.jsx',
  'client/src/saas/SaasApp.jsx', 'client/src/saas/SaasApp.test.jsx',
  'client/src/saas/styles.css', 'client/src/saas/test-setup.js',
  // DEC-061: closed additions for the approved P1-L2 flow and its tests.
  'client/src/saas/Inventory.jsx', 'client/src/saas/Inventory.test.jsx',
  'client/src/saas/inventory-client.js', 'client/src/saas/inventory-client.test.js',
  'client/src/saas/operation-hints.js', 'client/src/saas/operation-hints.test.js',
  'client/saas.html', 'client/vite.saas.config.js',
  'client/src/utils/safeDocuments.js', 'client/src/__tests__/unit/safeDocuments.test.js',
  'scripts/ci/safe-documents.vitest.config.mjs', 'scripts/ci/tooling-isolation.mjs',
  'scripts/ci/tooling-isolation.test.mjs', 'scripts/ci/tooling-isolation-check.mjs',
]);
const packageFiles = Object.freeze([
  ['scripts/ci/saas-toolchain/package.json', 'client/package.json'],
  ['scripts/ci/saas-toolchain/package-lock.json', 'client/package-lock.json'],
]);
const root = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const maximumSourceBytes = 256 * 1024;
const maximumTotalSourceBytes = 2 * 1024 * 1024;

export function within(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\'));
}

export function checkedPath(base, name) {
  if (typeof name !== 'string' || !name || isAbsolute(name) || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('TOOLCHAIN_INVALID_RELATIVE_PATH');
  }
  const path = resolve(base, name);
  if (!within(base, path)) throw new Error('TOOLCHAIN_PATH_ESCAPE');
  let current = base;
  for (const part of name.split('/')) {
    current = resolve(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('TOOLCHAIN_SYMLINK_REJECTED');
  }
  return path;
}

function checkedDirectory(base, name) {
  const path = checkedPath(base, name);
  mkdirSync(path, { recursive: true });
  if (!lstatSync(path).isDirectory() || !within(realpathSync(base), realpathSync(path))) throw new Error('TOOLCHAIN_DIRECTORY_ESCAPE');
  return path;
}

export function readRegular(base, name, limit = maximumSourceBytes) {
  const path = checkedPath(base, name);
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit || !within(realpathSync(base), realpathSync(path))) {
    throw new Error('TOOLCHAIN_SOURCE_NOT_REGULAR_OR_BOUNDED');
  }
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size || !opened.isFile()) throw new Error('TOOLCHAIN_SOURCE_CHANGED');
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const namedAfter = lstatSync(path);
    if (bytes.length !== before.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || namedAfter.ino !== opened.ino || namedAfter.dev !== opened.dev || namedAfter.isSymbolicLink()) {
      throw new Error('TOOLCHAIN_SOURCE_CHANGED');
    }
    return bytes;
  } finally { closeSync(fd); }
}

export function writeRegular(base, name, bytes) {
  const path = checkedPath(base, name);
  const before = existsSync(path) ? lstatSync(path) : null;
  if (before && (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || !within(realpathSync(base), realpathSync(path)))) throw new Error('TOOLCHAIN_OUTPUT_NOT_REGULAR');
  // Do not truncate until the opened file is proven to be the accepted target.
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | (before ? 0 : constants.O_EXCL) | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    const opened = fstatSync(fd);
    const named = lstatSync(path);
    if (!opened.isFile() || opened.nlink !== 1 || named.isSymbolicLink() || named.ino !== opened.ino || named.dev !== opened.dev || (before && (before.ino !== opened.ino || before.dev !== opened.dev))) {
      throw new Error('TOOLCHAIN_OUTPUT_CHANGED');
    }
    ftruncateSync(fd, 0);
    writeFileSync(fd, bytes);
    const after = fstatSync(fd);
    const namedAfter = lstatSync(path);
    if (after.nlink !== 1 || namedAfter.isSymbolicLink() || namedAfter.ino !== after.ino || namedAfter.dev !== after.dev) throw new Error('TOOLCHAIN_OUTPUT_CHANGED');
  } finally { closeSync(fd); }
}

export function stageSources(base, selectedFiles = sourceFiles) {
  const realBase = realpathSync(base);
  const parent = checkedDirectory(realBase, '.qa-private/saas-toolchain');
  const path = mkdtempSync(resolve(parent, 'run-'));
  const ownership = randomUUID();
  writeFileSync(resolve(path, '.owner.json'), JSON.stringify({ purpose: 'mecanet-saas-toolchain', ownership }), { flag: 'wx' });
  const stage = { sourceRoot: realBase, root: path, parent, ownership, inputs: [] };
  try {
    let total = 0;
    for (const [source, target] of [...selectedFiles.map(name => [name, name]), ...packageFiles]) {
      const bytes = readRegular(realBase, source);
      total += bytes.length;
      if (total > maximumTotalSourceBytes) throw new Error('TOOLCHAIN_SOURCE_BUDGET');
      const destination = checkedPath(path, target);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes, { flag: 'wx' });
      stage.inputs.push({ source, target, bytes: bytes.length, sha256: sha256(bytes) });
    }
    return stage;
  } catch (error) {
    cleanupStage(stage);
    throw error;
  }
}

export function verifyInputs(stage) {
  for (const entry of stage.inputs) {
    if (sha256(readRegular(stage.sourceRoot, entry.source)) !== entry.sha256 || sha256(readRegular(stage.root, entry.target)) !== entry.sha256) {
      throw new Error('TOOLCHAIN_INPUT_PROVENANCE_CHANGED');
    }
  }
}

export function cleanupStage(stage) {
  if (!stage || !/^run-[A-Za-z0-9_-]+$/.test(relative(stage.parent, stage.root)) || !within(stage.parent, stage.root) || !within(stage.sourceRoot, stage.parent)) {
    throw new Error('TOOLCHAIN_CLEANUP_NOT_OWNED');
  }
  if (lstatSync(stage.root).isSymbolicLink() || realpathSync(stage.root) !== resolve(stage.root) || realpathSync(stage.parent) !== resolve(stage.parent)) {
    throw new Error('TOOLCHAIN_CLEANUP_SYMLINK');
  }
  const owner = JSON.parse(readRegular(stage.root, '.owner.json'));
  if (owner.purpose !== 'mecanet-saas-toolchain' || owner.ownership !== stage.ownership) throw new Error('TOOLCHAIN_CLEANUP_NOT_OWNED');
  // Validate the entire owned tree before deleting anything. No symlinks followed.
  const files = [];
  const directories = [];
  function visit(path) {
    if (!within(stage.root, path)) throw new Error('TOOLCHAIN_CLEANUP_ESCAPE');
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !within(stage.root, realpathSync(path))) throw new Error('TOOLCHAIN_CLEANUP_SYMLINK');
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) visit(resolve(path, entry));
      directories.push({ path, stat });
    } else if (stat.isFile()) files.push({ path, stat });
    else throw new Error('TOOLCHAIN_CLEANUP_UNEXPECTED_TYPE');
  }
  visit(stage.root);
  for (const entry of [...files, ...directories]) {
    const now = lstatSync(entry.path);
    if (now.isSymbolicLink() || now.ino !== entry.stat.ino || now.dev !== entry.stat.dev || !within(stage.root, realpathSync(entry.path))) throw new Error('TOOLCHAIN_CLEANUP_CHANGED');
    if (now.isFile()) unlinkSync(entry.path); else rmdirSync(entry.path);
  }
}

export function subprocessEnvironment(ambient, stage) {
  const environment = Object.fromEntries(
    ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']
      .filter(key => ambient[key] !== undefined).map(key => [key, ambient[key]]),
  );
  // Deliberately do not pass HOME, USERPROFILE, GitHub tokens, URLs, DB credentials,
  // inherited npm config, NODE_PATH, NODE_OPTIONS or arbitrary environment values.
  const support = checkedDirectory(stage.root, '.process-support');
  const userConfig = resolve(support, 'user.npmrc');
  const globalConfig = resolve(support, 'global.npmrc');
  writeFileSync(userConfig, '', { flag: 'wx' });
  writeFileSync(globalConfig, '', { flag: 'wx' });
  return {
    ...environment, NODE_ENV: 'test', CI: 'true', REAL_API: 'false', VITEST_REAL_API: 'false',
    NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_CACHE: resolve(support, 'npm-cache'),
    HOME: support, USERPROFILE: support,
    TEMP: support, TMP: support, TMPDIR: support,
  };
}

export function resolveNpmCli(ambient, nodeExecutable = process.execPath) {
  const directories = [dirname(nodeExecutable), ...(ambient.PATH ?? ambient.Path ?? '').split(delimiter)]
    .filter(path => path && isAbsolute(path));
  const candidates = [ambient.npm_execpath, ...directories.flatMap(path => [
    resolve(path, 'node_modules/npm/bin/npm-cli.js'),
    resolve(path, '../lib/node_modules/npm/bin/npm-cli.js'),
  ])].filter(Boolean);
  for (const candidate of [...new Set(candidates)]) {
    if (!isAbsolute(candidate) || basename(candidate) !== 'npm-cli.js' || !existsSync(candidate)) continue;
    const script = lstatSync(candidate);
    const packagePath = resolve(dirname(candidate), '../package.json');
    if (!script.isFile() || script.isSymbolicLink() || script.nlink !== 1 || !existsSync(packagePath)) continue;
    const metadataStat = lstatSync(packagePath);
    if (!metadataStat.isFile() || metadataStat.isSymbolicLink() || metadataStat.size > 64 * 1024) continue;
    const metadata = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (metadata.name !== 'npm' || metadata.version !== '11.9.0') continue;
    return realpathSync(candidate);
  }
  throw new Error('P1_L1_EXACT_NPM_JS_CLI_REQUIRED');
}

export function promoteAssets(stage) {
  const output = checkedPath(stage.root, 'client/dist-saas');
  const assetsPath = checkedPath(stage.root, 'client/dist-saas/assets');
  const top = readdirSync(output).sort();
  const assets = readdirSync(assetsPath).sort();
  if (JSON.stringify(top) !== JSON.stringify(['assets', 'saas.html']) || assets.length !== 2 || !assets.some(name => /^saas-[A-Za-z0-9_-]+\.js$/.test(name)) || !assets.some(name => /^saas-[A-Za-z0-9_-]+\.css$/.test(name))) {
    throw new Error('TOOLCHAIN_UNEXPECTED_BUILD_OUTPUT');
  }
  const entries = ['saas.html', ...assets.map(name => `assets/${name}`)].map(name => {
    const bytes = readRegular(stage.root, `client/dist-saas/${name}`, 1024 * 1024);
    return { name, bytes, sha256: sha256(bytes) };
  });
  // Validate every source and destination before writing the three allowlisted files.
  checkedDirectory(stage.sourceRoot, 'client/dist-saas/assets');
  for (const entry of entries) {
    const destination = checkedPath(stage.sourceRoot, `client/dist-saas/${entry.name}`);
    if (existsSync(destination) && !lstatSync(destination).isFile()) throw new Error('TOOLCHAIN_BUILD_DESTINATION_NOT_FILE');
  }
  for (const entry of entries) {
    const destination = checkedPath(stage.sourceRoot, `client/dist-saas/${entry.name}`);
    if (!existsSync(destination) || sha256(readRegular(stage.sourceRoot, `client/dist-saas/${entry.name}`, 1024 * 1024)) !== entry.sha256) {
      writeRegular(stage.sourceRoot, `client/dist-saas/${entry.name}`, entry.bytes);
    }
    if (sha256(readRegular(stage.sourceRoot, `client/dist-saas/${entry.name}`, 1024 * 1024)) !== entry.sha256) throw new Error('TOOLCHAIN_BUILD_PROMOTION_CHANGED');
  }
  return entries.map(({ name, sha256: hash, bytes }) => ({ path: `client/dist-saas/${name}`, sha256: hash, bytes: bytes.length }));
}

export function verifyToolchain(base = root, ambient = process.env) {
  if (process.version !== 'v24.21.0') throw new Error('P1_L1_EXACT_NODE_RUNTIME_REQUIRED');
  const sourceIdentity = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  if (sourceIdentity.status !== 0 || !/^[a-f0-9]{40}\s*$/.test(sourceIdentity.stdout)) throw new Error('TOOLCHAIN_GIT_IDENTITY_REQUIRED');
  const stage = stageSources(base);
  const report = { scope: 'SC-008 complete isolated SaaS toolchain; no deployment or database', sourceCodeSha: sourceIdentity.stdout.trim(), node: process.version, platform: process.platform, architecture: process.arch, inputs: stage.inputs, checks: [], fullAudit: 'NOT VERIFIED', runtimeAudit: 'NOT VERIFIED', cleanup: 'NOT VERIFIED', assets: [], legacyClientAudit: 'NOT RUN: legacy tooling not installed or used; CP-016 report retains its FAIL', limitations: ['Vite bundled internals remain; build inputs are versioned sources, no public dev server or tenant/HTTP inputs', 'Not an OS sandbox or protection against malicious code submitted by a repository author'] };
  let error;
  try {
    const environment = subprocessEnvironment(ambient, stage);
    const npmCli = resolveNpmCli(ambient);
    report.npmCliSha256 = sha256(readFileSync(npmCli));
    // Always execute the verified npm JS entry with this exact Node, not .cmd/shell.
    function npm(args, options = {}) {
      return command(process.execPath, [npmCli, ...args], options);
    }
    function command(executable, args, { json = false } = {}) {
      verifyInputs(stage);
      const result = spawnSync(executable, args, { cwd: stage.root, env: environment, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, shell: false });
      if (result.error) throw result.error;
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      const entry = { command: [executable === process.execPath ? 'node' : 'npm', ...args.map(arg => String(arg).replace(stage.root, '<owned-stage>'))], exitCode: result.status, signal: result.signal ?? null };
      report.checks.push(entry);
      if (result.signal || result.status !== 0) {
        const failure = new Error('TOOLCHAIN_CHILD_FAILED');
        failure.check = entry;
        throw failure;
      }
      return json ? JSON.parse(result.stdout) : result.stdout;
    }
    if (npm(['--version']).trim() !== '11.9.0') throw new Error('P1_L1_EXACT_NPM_RUNTIME_REQUIRED');
    npm(['ci', '--prefix', 'client', '--ignore-scripts', '--bin-links=false', '--no-audit', '--no-fund']);
    // Keep native audits strict and run them even if a later behavioral check fails.
    for (const [field, flags] of [['fullAudit', []], ['runtimeAudit', ['--omit=dev']]]) {
      try {
        const audit = npm(['audit', '--prefix', 'client', '--json', ...flags], { json: true });
        if (audit.metadata.vulnerabilities.total !== 0) throw new Error('TOOLCHAIN_AUDIT_NOT_ZERO');
        report[field] = 'PASS';
      } catch (failure) { report[field] = 'FAIL'; error ??= failure; }
    }
    if (error) throw error;
    command(process.execPath, ['--max-old-space-size=512', '--test', 'scripts/ci/tooling-isolation.test.mjs']);
    command(process.execPath, ['--max-old-space-size=512', 'scripts/ci/tooling-isolation-check.mjs']);
    verifyInputs(stage);
    report.assets = promoteAssets(stage);
    report.inputFingerprintSha256 = sha256(Buffer.from(stage.inputs.map(entry => `${entry.sha256}  ${entry.source}\n`).join('')));
  } catch (failure) { error ??= failure; }
  finally {
    try { cleanupStage(stage); report.cleanup = 'PASS'; }
    catch (failure) { report.cleanup = 'FAIL'; error ??= failure; }
    report.result = error ? 'FAIL' : 'PASS';
    const resultsDirectory = checkedDirectory(realpathSync(base), '.qa-private/saas-toolchain');
    writeRegular(realpathSync(base), '.qa-private/saas-toolchain/last-result.json', JSON.stringify(report, null, 2) + '\n');
    console.log(`SAAS_TOOLCHAIN_EVIDENCE:${JSON.stringify(report)}`);
  }
  if (error) throw error;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'verify' || process.argv.length !== 3) throw new Error('USE_SAAS_TOOLCHAIN_VERIFY');
  verifyToolchain();
}
