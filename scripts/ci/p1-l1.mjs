// P1-L1 local contracts only. This runner never loads .env or QA connection files.
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sourceFiles as saasSources } from './saas-toolchain.mjs';

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
  'tests/qa/write-validation.test.js', 'tests/qa/write-service.test.js', 'tests/qa/write-coordinator.test.js',
  'tests/qa/cp017/pools.test.mjs', 'tests/qa/cp017/routes.test.mjs', 'tests/qa/cp017/migrate.unit.test.mjs', 'tests/qa/write-app.test.js', 'tests/qa/cp017/logout.test.mjs', 'tests/qa/cp017/resource-closure.test.mjs', 'tests/qa/cp017/quota.unit.test.mjs', 'tests/qa/cp017/revocation-live.test.mjs', 'tests/qa/cp017/recovery.unit.test.mjs',
  'tests/qa/cp017/promotion.unit.test.mjs', 'tests/qa/cp017/sql-vectors.unit.test.mjs', 'tests/qa/cp017/rollback.unit.test.mjs',
  'tests/qa/cp017/metadata.unit.test.mjs', 'tests/qa/cp017/integration-sku.test.mjs', 'tests/qa/cp017/promote.unit.test.mjs',
  'tests/qa/cp017/quota-boundary.test.mjs',
  'tests/qa/cp017/quota-growth-boundary.test.mjs', 'tests/qa/cp017/claim-corrective.test.mjs', 'tests/qa/cp017/uncertain-retention.test.mjs', 'tests/qa/cp017/recovery-check.test.mjs',
  'tests/qa/read-abort-lifecycle.test.js', 'tests/qa/write-ticket-owner.test.js', 'tests/qa/post-response-diagnostic.test.js', 'tests/qa/read-rollback-lifecycle.test.js', 'tests/qa/cp017/read-closure.test.mjs', 'tests/qa/cp017/concurrency.unit.test.mjs', 'tests/qa/cp017/canonical-gap.unit.test.mjs',
  'tests/qa/cp019/budget-plan.test.mjs',
  'tests/qa/cp019/acceptance-observer.test.mjs',
  'tests/qa/cp019/control.test.mjs',
  'tests/qa/cp019/copy-offline.test.mjs',
  'tests/qa/cp019/custody.test.mjs',
  'tests/qa/cp019/fixture.test.mjs',
  'tests/qa/cp019/ledger.test.mjs',
  'tests/qa/cp019/prepare-contract.test.mjs',
  'tests/qa/cp019/protocol.test.mjs',
  'tests/qa/cp019/runtime.test.mjs',
  'tests/qa/cp019/schema-check.test.mjs',
  'tests/qa/cp019/source-driver.test.mjs',
  'tests/qa/cp019/source-final.test.mjs',
  'tests/qa/cp019/runtime-driver.test.mjs',
  'tests/qa/cp019/sql-contract.test.mjs',
  'tests/qa/cp019/stage-journal.test.mjs',
  'tests/qa/cp019/target-driver.test.mjs',
  'tests/qa/cp019/target-config.test.mjs',
  'tests/qa/cp019/target-witness.test.mjs',
  'tests/qa/cp019/target-prepare.test.mjs',
  'tests/qa/cp019/target-restart.test.mjs',
  'tests/qa/cp019/browser.test.mjs',
  'tests/qa/cp019/browser-sql.test.mjs',
  'tests/qa/cp019/target-end.test.mjs',
  'tests/qa/cp019/target-runtime.test.mjs',
  'tests/qa/cp019/target-bundle-io.test.mjs',
  'tests/qa/cp019/clock-restart-plan.test.mjs',
  'tests/qa/cp019/abort-prefix-plan.test.mjs',
  'tests/qa/cp019/a5-negatives.test.mjs',
  'tests/qa/cp019/copy-negatives.test.mjs',
  'tests/qa/cp019/credential-probe.test.mjs',
  'tests/qa/cp019/journal-negatives.test.mjs',
  'tests/qa/cp019/runtime-budget.test.mjs',
  'tests/qa/cp019/schema-fault-probe.test.mjs',
  'tests/qa/cp019/target-variant-lineage.test.mjs',
  'tests/qa/cp019/commit-fault-hook.test.mjs',
  'tests/qa/cp019/commit-fault-probe.test.mjs',
  'tests/qa/cp019/readiness-variant.test.mjs',
  'tests/qa/cp019/promotion-barrier.test.mjs',
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

// These physical filesystem adapters intentionally require PostgreSQL UID999.
// Only the disposable GitHub-hosted job uses that identity; no product guard,
// test assertion or local execution is changed to simulate Unix ownership.
const filesystemTests = Object.freeze([
  'tests/qa/cp019/copy-offline.test.mjs',
  'tests/qa/cp019/stage-journal.test.mjs',
  'tests/qa/cp019/target-prepare.test.mjs',
]);
function contractTestPlan(platform, variables) {
  const isolated = platform === 'linux' && variables.GITHUB_ACTIONS === 'true'
    && variables.GITHUB_REPOSITORY === 'SrEdgarR/MECANET'
    && variables.GITHUB_SERVER_URL === 'https://github.com'
    && variables.RUNNER_ENVIRONMENT === 'github-hosted' && variables.RUNNER_OS === 'Linux';
  const filesystem = isolated ? [...filesystemTests] : [];
  const ordinary = tests.filter(file => !filesystem.includes(file));
  assert.equal(new Set([...ordinary, ...filesystem]).size, tests.length);
  assert.equal(ordinary.length + filesystem.length, tests.length);
  return { ordinary, filesystem };
}
function filesystemCommand(nodePath, args) {
  assert.match(nodePath, /^\/[^\r\n\0]+$/, 'CI_FILESYSTEM_ABSOLUTE_NODE_REQUIRED');
  return { executable: '/usr/bin/sudo', args: ['-n', '/usr/bin/setpriv', '--reuid=999', '--regid=999', '--clear-groups', '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'TMPDIR=/tmp', 'NODE_ENV=test', 'CI=true', 'REAL_API=false', 'VITEST_REAL_API=false', nodePath, ...args] };
}
function filesystemIdentity({ uid, gid, groups, version, environment: variables }) {
  assert.equal(uid, 999, 'CI_FILESYSTEM_UID_REQUIRED');
  assert.equal(gid, 999, 'CI_FILESYSTEM_GID_REQUIRED');
  assert.ok(Array.isArray(groups) && groups.includes(999) && groups.every(group => group === 999), 'CI_FILESYSTEM_GROUPS_REQUIRED');
  assert.equal(version, 'v24.21.0', 'CI_FILESYSTEM_NODE_REQUIRED');
  assert.deepEqual(variables, { PATH: '/usr/bin:/bin', TMPDIR: '/tmp', NODE_ENV: 'test', CI: 'true', REAL_API: 'false', VITEST_REAL_API: 'false' }, 'CI_FILESYSTEM_ENVIRONMENT_REQUIRED');
  return { schema: 'cp023-filesystem-identity-v1', status: 'PASS', uid, gid, groups, node: version };
}
function runFilesystem(args) {
  const command = filesystemCommand(process.execPath, args);
  const result = spawnSync(command.executable, command.args, { cwd: root, env: { PATH: '/usr/bin:/bin' }, stdio: 'inherit' });
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
  case 'self-test': {
    const github = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'SrEdgarR/MECANET', GITHUB_SERVER_URL: 'https://github.com', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux' };
    const filesystem = ['tests/qa/cp019/copy-offline.test.mjs', 'tests/qa/cp019/stage-journal.test.mjs', 'tests/qa/cp019/target-prepare.test.mjs'];
    const cases = [
      ['linux', github, true],
      ['win32', github, false],
      ['linux', {}, false],
      ['linux', { ...github, GITHUB_REPOSITORY: 'foreign/MECANET' }, false],
      ['linux', { ...github, GITHUB_SERVER_URL: 'https://foreign.example' }, false],
      ['linux', { ...github, RUNNER_ENVIRONMENT: 'self-hosted' }, false],
      ['linux', { ...github, GITHUB_ACTIONS: 'false' }, false],
      ['linux', { ...github, RUNNER_OS: 'Windows' }, false],
    ];
    for (const [platform, variables, isolated] of cases) {
      const plan = contractTestPlan(platform, variables);
      assert.deepEqual(plan.filesystem, isolated ? filesystem : []);
      assert.deepEqual(plan.ordinary, tests.filter(file => !isolated || !filesystem.includes(file)));
      const union = [...plan.ordinary, ...plan.filesystem];
      assert.equal(union.length, tests.length);
      assert.equal(new Set(union).size, tests.length);
      assert.deepEqual([...union].sort(), [...tests].sort());
    }
    const command = filesystemCommand('/opt/node/bin/node', ['--test', '--test-reporter=spec', ...filesystem]);
    assert.equal(command.executable, '/usr/bin/sudo');
    assert.deepEqual(command.args, ['-n', '/usr/bin/setpriv', '--reuid=999', '--regid=999', '--clear-groups', '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'TMPDIR=/tmp', 'NODE_ENV=test', 'CI=true', 'REAL_API=false', 'VITEST_REAL_API=false', '/opt/node/bin/node', '--test', '--test-reporter=spec', ...filesystem]);
    assert.throws(() => filesystemCommand('node', []), /CI_FILESYSTEM_ABSOLUTE_NODE_REQUIRED/);
    const identity = { uid: 999, gid: 999, groups: [999], version: 'v24.21.0', environment: { PATH: '/usr/bin:/bin', TMPDIR: '/tmp', NODE_ENV: 'test', CI: 'true', REAL_API: 'false', VITEST_REAL_API: 'false' } };
    assert.equal(filesystemIdentity(identity).status, 'PASS');
    for (const change of [{ uid: 0 }, { gid: 0 }, { groups: [999, 127] }, { version: 'v22.0.0' }, { environment: { ...identity.environment, NODE_OPTIONS: '--inspect' } }]) assert.throws(() => filesystemIdentity({ ...identity, ...change }));
    console.log(JSON.stringify({ schema: 'cp023-contract-partition-self-test-v1', status: 'PASS', partitionCases: cases.length, files: tests.length, isolatedFiles: filesystem.length, commandCases: 2, identityCases: 6, filesystemEffects: false, sudoExecuted: false, sqlCommands: 0 }));
    break;
  }
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
  case 'test': {
    console.log(`Explicit local suite: ${tests.length} files; no PostgreSQL or private QA integration`);
    const plan = contractTestPlan(process.platform, process.env);
    if (plan.filesystem.length) {
      assert.equal(process.getuid(), 1001, 'CI_FILESYSTEM_PARENT_UID_REQUIRED');
      const preflight = `import assert from 'node:assert/strict';console.log(JSON.stringify((${filesystemIdentity.toString()})({uid:process.getuid(),gid:process.getgid(),groups:process.getgroups(),version:process.version,environment:process.env})));`;
      runFilesystem(['--input-type=module', '-e', preflight]);
      console.log(`Filesystem suite: ${plan.filesystem.length} exact files as UID/GID999; remaining ${plan.ordinary.length} as UID1001`);
      runFilesystem(['--test', '--test-reporter=spec', ...plan.filesystem]);
    }
    run(['--test', '--test-reporter=spec', ...plan.ordinary]);
    break;
  }
  case 'frontend':
  case 'sanitizer':
    // DEC-060 / SC-008: both entry points use the locked SaaS lane, never the
    // legacy client toolchain. Verification includes tests, build and full audit.
    run(['scripts/ci/saas-toolchain.mjs', 'verify']);
    break;
  case 'assets': {
    // CP019 changes lookup semantics within the approved L3 baseline. This is
    // reproducible build provenance, not PostgreSQL/browser acceptance.
    if(readdirSync(resolve(root,'docs/evidence/cp019')).includes('ui-canonical-assets.json')){
      const build=JSON.parse(readFileSync(resolve(root,'docs/evidence/cp019/ui-canonical-assets.json'),'utf8'));
      assert.equal(build.schema,'cp019-ui-epoch-build-v1');assert.equal(build.status,'PASS');assert.equal(build.secretOutput,false);
      assert.equal(build.baselineSha256,'4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec');
      const sources=new Set([...saasSources,'scripts/ci/saas-toolchain/package.json','scripts/ci/saas-toolchain/package-lock.json']);
      assert.equal(build.inputs.length,sources.size);
      for(const input of build.inputs){assert.equal(sources.delete(input.source),true);assert.equal(createHash('sha256').update(readFileSync(resolve(root,input.source))).digest('hex'),input.sha256);}
      assert.equal(sources.size,0);assert.equal(build.assets.length,3);
      const files=new Set(['client/dist-saas/saas.html',...readdirSync(resolve(root,'client/dist-saas/assets')).map(n=>'client/dist-saas/assets/'+n)]);
      assert.equal(files.size,3);
      for(const entry of build.assets){assert.match(entry.path,/^client\/dist-saas\/(?:saas\.html|assets\/saas-[A-Za-z0-9_-]+\.(?:js|css))$/);assert.equal(files.delete(entry.path),true);const bytes=readFileSync(resolve(root,entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
      assert.equal(files.size,0);console.log('PASS: three L3 assets match the frozen build inputs; physical UI acceptance remains separate');break;
    }
    // P1-L2 has new approved UI. F remains the immutable historical L1 oracle.
    if(readdirSync(resolve(root,'docs/evidence/cp017')).includes('accepted-ui-assets.json')){
      const accepted=JSON.parse(readFileSync(resolve(root,'docs/evidence/cp017/accepted-ui-assets.json'),'utf8'));
      assert.equal(accepted.baselineSha256,'ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71');
      assert.equal(accepted.entries.length,3);
      const names=['client/dist-saas/saas.html',...readdirSync(resolve(root,'client/dist-saas/assets')).map(n=>'client/dist-saas/assets/'+n)];
      assert.equal(names.length,3);const remaining=new Set(names);
      for(const entry of accepted.entries){assert.match(entry.path,/^client\/dist-saas\/(?:saas\.html|assets\/saas-[A-Za-z0-9_-]+\.(?:js|css))$/);assert.equal(remaining.delete(entry.path),true);assert.equal(createHash('sha256').update(readFileSync(resolve(root,entry.path))).digest('hex'),entry.sha256)}
      assert.equal(remaining.size,0);console.log('PASS: three assets match the accepted P1-L2 artifact; SQL/browser evidence remains separate');break;
    }
    const oracle = JSON.parse(readFileSync(resolve(root, 'docs/evidence/cp015/archived-f-identity.json'), 'utf8'));
    const allowed = new Set([
      'client/dist-saas/saas.html',
      'client/dist-saas/assets/saas-DsjAOXZI.js',
      'client/dist-saas/assets/saas-DclqrR_W.css',
    ]);
    assert.equal(oracle.publicBundleEntries.length, allowed.size);
    assert.equal(oracle.entryDigestRecomputed, oracle.historicalArtifact);
    for (const entry of oracle.publicBundleEntries) {
      assert.equal(allowed.delete(entry.path), true, 'archived asset path must be unique and allowlisted');
      const actual = createHash('sha256').update(readFileSync(resolve(root, entry.path))).digest('hex');
      assert.equal(actual, entry.sha256, `SaaS build differs from archived F: ${entry.path}`);
    }
    assert.equal(allowed.size, 0);
    console.log('PASS: three compiled SaaS assets equal archived F; no new PostgreSQL/browser/restore run');
    break;
  }
  default:
    throw new Error('USE_SELF_TEST_PROVENANCE_SYNTAX_TEST_FRONTEND_SANITIZER_OR_ASSETS');
}
