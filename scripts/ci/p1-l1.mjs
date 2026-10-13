// P1-L1 local contracts only. This runner never loads .env or QA connection files.
import { readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
const tests = [
  'tests/qa/admission-clock.unit.test.js',
  'tests/qa/admission-maintenance.unit.test.js',
  'tests/qa/admission-transfer.unit.test.js',
  'tests/qa/admission.unit.test.js',
  'tests/qa/app-deadline.test.js',
  'tests/qa/auth.test.js',
  'tests/qa/db-fixture.test.js',
  'tests/qa/db-pools.test.js',
  'tests/qa/observability.unit.test.js',
  'tests/qa/preflight.test.js',
  'tests/qa/recovery.test.js',
  'tests/qa/cp014/admission-diagnostics.test.mjs',
  'tests/qa/cp014/admission-probe.test.mjs',
  'tests/qa/cp014/auth-login-failure.test.mjs',
  'tests/qa/cp014/deadlines.test.mjs',
];

// Allow only process support variables. No inherited DB URLs, session secrets,
// QA destinations or production credentials are passed into a test process.
const environment = Object.fromEntries(
  ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE']
    .filter(key => process.env[key] !== undefined)
    .map(key => [key, process.env[key]]),
);
Object.assign(environment, { NODE_ENV: 'test', CI: 'true', REAL_API: 'false', VITEST_REAL_API: 'false' });

function run(args, extraEnvironment = {}) {
  const result = spawnSync(process.execPath, args, { cwd: root, env: { ...environment, ...extraEnvironment }, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0) process.exit(result.status || 1);
}

function javascriptFiles(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true })
    .filter(entry => entry.name !== 'node_modules')
    .flatMap(entry => {
      const path = resolve(root, directory, entry.name);
      return entry.isDirectory()
        ? javascriptFiles(relative(root, path))
        : /\.(js|mjs|cjs)$/.test(entry.name) ? [path] : [];
    });
}

if (process.version !== 'v24.21.0') throw new Error('P1_L1_EXACT_NODE_RUNTIME_REQUIRED');
switch (mode) {
  case 'provenance': {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    if (result.status !== 0 || !/^[a-f0-9]{40}\s*$/.test(result.stdout)) throw new Error('CI_GIT_IDENTITY_REQUIRED');
    const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    if (status.status !== 0) throw new Error('CI_GIT_WORKTREE_STATUS_REQUIRED');
    console.log(JSON.stringify({ checkoutCommit: result.stdout.trim(), worktreeClean: status.stdout.trim() === '', node: process.version, platform: process.platform, architecture: process.arch, scope: 'local-contracts-and-frontend', postgresIntegration: 'NOT RUN', remoteQA: 'NOT USED' }));
    break;
  }
  case 'syntax': {
    const files = ['server/saas', 'tests/qa', 'scripts/ci'].flatMap(javascriptFiles).sort();
    for (const file of files) run(['--check', file]);
    console.log(`PASS: JavaScript syntax (${files.length} files; JSX parsed by the frontend build)`);
    break;
  }
  case 'test':
    console.log(`Explicit local suite: ${tests.length} files; no PostgreSQL or private QA integration`);
    run(['--test', '--test-reporter=spec', ...tests]);
    break;
  case 'frontend':
    run(['client/node_modules/vitest/vitest.mjs', 'run', '--config', 'client/vite.saas.config.js']);
    run(['client/node_modules/vite/bin/vite.js', 'build', '--config', 'client/vite.saas.config.js'], { NODE_ENV: 'production' });
    break;
  case 'sanitizer':
    run(['client/node_modules/vitest/vitest.mjs', 'run', '--config', 'scripts/ci/safe-documents.vitest.config.mjs']);
    break;
  default:
    throw new Error('USE_PROVENANCE_SYNTAX_TEST_FRONTEND_OR_SANITIZER');
}
