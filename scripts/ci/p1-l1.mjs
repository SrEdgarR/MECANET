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
    throw new Error('USE_PROVENANCE_SYNTAX_TEST_FRONTEND_SANITIZER_OR_ASSETS');
}
