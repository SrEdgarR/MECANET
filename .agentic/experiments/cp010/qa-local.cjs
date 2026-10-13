'use strict';
// Isolated CP-010 environment evidence. Never import this harness into Mecanet.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const dns = require('node:dns').promises;
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { MongoClient } = require('mongodb');

const baseSha = 'f72bd2393e26eeaf97f6962baf520a71e50e356b';
const engine = 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe';
const evidenceDir = fs.realpathSync(__dirname);
const repo = fs.realpathSync(path.resolve(evidenceDir, '../../..'));
const runId = crypto.randomUUID();
const runtime = path.join(evidenceDir, '.runtime-' + runId);
const setName = 'qa_cp010_' + runId.replaceAll('-', '');
const started = Date.now();
const result = {
  experiment: 'QA-EXP-02',
  base_sha: baseSha,
  script_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  started_at: new Date().toISOString(),
  provenance: 'LOCAL — native Windows temporary Mongo replica set, fictitious data only',
  versions: { node: process.version, platform: process.platform, architecture: process.arch,
    driver: require('mongodb/package.json').version },
  limits: { elapsed_seconds: 180, mongo_rss_mib: 1024, mongo_cpu_seconds: 30,
    runtime_directory_mib: 768, wiredtiger_cache_mib: 256, oplog_mib: 16,
    node_heap_mib: 128, dataset_documents_max: 10, monitoring: 'sampled abort thresholds, not hard OS quotas' },
  checks: [], resources: { created: 0, cleanup: 'NOT VERIFIED' },
  measured: { samples: 0, peak_sampled_rss_mib: 0, cpu_seconds: 0, peak_sampled_directory_mib: 0 },
  scope_exclusions: ['existing MongoDB service', 'Atlas/VPS/Nexora', 'Mecanet APIs/resolver',
    'two API processes', 'Linux ARM64', 'MongoDB 7.0.43 compatibility',
    'backup/restore', 'HA/failover', 'production capacity or security certification']
};
let child, port, admin, monitor, abortReason, childExited = false;
const clients = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const ps = s => cp.execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', s],
  { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
function ownPath() {
  assert.equal(fs.realpathSync(evidenceDir), evidenceDir);
  assert.equal(path.dirname(path.resolve(runtime)), evidenceDir);
  assert.match(path.basename(runtime), /^\.runtime-[a-f0-9-]{36}$/);
  assert.ok(evidenceDir.startsWith(repo + path.sep));
  if (fs.existsSync(runtime)) {
    assert.ok(!fs.lstatSync(runtime).isSymbolicLink());
    assert.equal(fs.realpathSync(runtime), path.resolve(runtime));
  }
}
function directoryBytes(dir) {
  let size = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    assert.ok(!e.isSymbolicLink(), 'Unexpected runtime link');
    if (e.isDirectory()) size += directoryBytes(p);
    else size += fs.statSync(p).size;
  }
  return size;
}
function guard() {
  if (abortReason) throw Error(abortReason);
  if (Date.now() - started > 180000) throw Error('Elapsed limit');
  if (childExited) throw Error('Temporary process exited unexpectedly');
}
function sample() {
  if (!child || childExited) return;
  const m = JSON.parse(ps('$p=Get-Process -Id ' + child.pid +
    ' -ErrorAction Stop; [pscustomobject]@{rss=$p.WorkingSet64;cpu=$p.CPU} | ConvertTo-Json -Compress'));
  const bytes = directoryBytes(runtime);
  result.measured.samples++;
  result.measured.peak_sampled_rss_mib = Math.max(result.measured.peak_sampled_rss_mib, m.rss / 1048576);
  result.measured.cpu_seconds = Math.max(result.measured.cpu_seconds, m.cpu || 0);
  result.measured.peak_sampled_directory_mib = Math.max(result.measured.peak_sampled_directory_mib, bytes / 1048576);
  if (m.rss > 1073741824 || m.cpu > 30 || bytes > 805306368 || Date.now() - started > 180000)
    throw Error('Resource abort threshold exceeded');
}
function listeners() {
  const s = ps('@(Get-NetTCPConnection -State Listen -LocalPort ' + port +
    ' -ErrorAction SilentlyContinue | Select-Object LocalAddress,OwningProcess) | ConvertTo-Json -Compress');
  const v = s ? JSON.parse(s) : [];
  return Array.isArray(v) ? v : [v];
}
async function check(id, purpose, f) {
  guard();
  await f();
  result.checks.push({ id, purpose, status: 'PASS' });
  console.log(id + ' PASS: ' + purpose);
}
function makeClient(db = 'admin', user, password) {
  assert.ok(Number.isInteger(port) && port > 1024 && port <= 65535);
  const opts = { directConnection: true, serverSelectionTimeoutMS: 1500, connectTimeoutMS: 1500,
    socketTimeoutMS: 4000, maxPoolSize: 2, minPoolSize: 0, family: 4 };
  if (user) { opts.authSource = db; opts.auth = { username: user, password }; }
  const c = new MongoClient('mongodb://127.0.0.1:' + port + '/', opts);
  clients.push(c);
  return c;
}
async function denied(f) {
  try { await f(); } catch (e) { assert.equal(e.code, 13, 'Expected authorization denial, not connection error'); return; }
  throw Error('Unauthorized operation unexpectedly succeeded');
}
async function waitExit(ms) {
  const end = Date.now() + ms;
  while (!childExited && Date.now() < end) await delay(100);
  return childExited;
}
async function main() {
  assert.equal(process.platform, 'win32');
  assert.equal(fs.realpathSync(process.cwd()), repo);
  assert.equal(cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), baseSha);
  assert.ok(fs.existsSync(engine));
  result.versions.engine_sha256 = crypto.createHash('sha256').update(fs.readFileSync(engine)).digest('hex');
  const versionText = cp.execFileSync(engine, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  result.versions.mongodb = versionText.match(/db version v([^\s]+)/)?.[1];
  assert.equal(result.versions.mongodb, '8.3.11');
  const local = await dns.lookup('localhost', { all: true });
  assert.ok(local.length && local.every(x => x.address === '127.0.0.1' || x.address === '::1'));
  port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)); });
  });
  assert.deepEqual(listeners(), []);
  ownPath();
  fs.mkdirSync(runtime);
  ownPath();
  const sidText = cp.execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  const sid = sidText.match(/S-1-5-(?:\d+-)*\d+/)?.[0];
  assert.ok(sid, 'Current local SID unavailable');
  cp.execFileSync('icacls.exe', [runtime, '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F'],
    { windowsHide: true, stdio: 'pipe', timeout: 10000 });
  const dbpath = path.join(runtime, 'db');
  fs.mkdirSync(dbpath);
  const keyfile = path.join(runtime, 'keyfile');
  fs.writeFileSync(keyfile, crypto.randomBytes(384).toString('base64'), { flag: 'wx', mode: 0o600 });
  const args = ['--bind_ip', '127.0.0.1', '--port', String(port), '--dbpath', dbpath,
    '--replSet', setName, '--keyFile', keyfile, '--auth', '--wiredTigerCacheSizeGB', '0.25',
    '--oplogSize', '16', '--setParameter', 'diagnosticDataCollectionEnabled=false',
    '--logpath', path.join(runtime, 'mongod.log')];
  const mongoEnv = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
    TEMP: runtime, TMP: runtime, PATH: path.dirname(engine) };
  child = cp.spawn(engine, args, { cwd: runtime, env: mongoEnv, windowsHide: true, stdio: 'ignore' });
  child.once('exit', () => { childExited = true; });
  child.once('error', () => { abortReason = 'Temporary process could not start'; childExited = true; });
  result.resources.created = 1;
  result.resources.pid = child.pid;
  result.resources.bind = '127.0.0.1';
  result.resources.port = port;
  monitor = setInterval(() => {
    try { sample(); } catch { abortReason = 'Resource monitor failed or limit exceeded'; if (child && !childExited) child.kill(); }
  }, 2000);
  await check('QA-01', 'Dedicated process and loopback listener confirmed before Mongo connection', async () => {
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      guard();
      const rows = listeners();
      if (rows.length) {
        assert.ok(rows.every(r => r.LocalAddress === '127.0.0.1' && r.OwningProcess === child.pid));
        return;
      }
      await delay(300);
    }
    throw Error('Local listener startup deadline');
  });
  const bootstrap = makeClient();
  await bootstrap.connect();
  await bootstrap.db('admin').command({ replSetInitiate: { _id: setName, members: [{ _id: 0, host: 'localhost:' + port }] } });
  const end = Date.now() + 30000;
  let hello;
  while (Date.now() < end) {
    guard();
    hello = await bootstrap.db('admin').command({ hello: 1 });
    if (hello.isWritablePrimary) break;
    await delay(200);
  }
  assert.ok(hello.isWritablePrimary, 'No primary elected');
  const adminPassword = crypto.randomBytes(32).toString('base64url');
  await bootstrap.db('admin').command({ createUser: 'qa_root', pwd: adminPassword, roles: [{ role: 'root', db: 'admin' }] });
  await bootstrap.close();
  admin = makeClient('admin', 'qa_root', adminPassword);
  await admin.connect();
  await check('QA-02', 'Authenticated one-member PRIMARY and actual process/configuration match', async () => {
    const h = await admin.db('admin').command({ hello: 1 });
    assert.equal(h.setName, setName);
    assert.equal(h.isWritablePrimary, true);
    assert.deepEqual(h.hosts, ['localhost:' + port]);
    assert.ok(h.logicalSessionTimeoutMinutes > 0);
    const status = await admin.db('admin').command({ serverStatus: 1 });
    assert.equal(status.pid, child.pid);
    const options = await admin.db('admin').command({ getCmdLineOpts: 1 });
    assert.equal(options.parsed.net.bindIp, '127.0.0.1');
    assert.equal(options.parsed.storage.dbPath, dbpath);
    assert.equal(options.parsed.security.authorization, 'enabled');
  });
  const aDb = 'qa_a', bDb = 'qa_b', control = 'qa_control';
  const aPwd = crypto.randomBytes(32).toString('base64url'), bPwd = crypto.randomBytes(32).toString('base64url');
  for (const [db, user, pwd] of [[aDb, 'qa_a_user', aPwd], [bDb, 'qa_b_user', bPwd]])
    await admin.db(db).command({ createUser: user, pwd, roles: [{ role: 'readWrite', db }] });
  await admin.db(control).collection('canary').insertOne({ _id: 'same', scope: 'control-fictitious' });
  const a = makeClient(aDb, 'qa_a_user', aPwd), b = makeClient(bDb, 'qa_b_user', bPwd);
  await a.connect(); await b.connect();
  await check('QA-03', 'Distinct credentials read/write their own fictitious database', async () => {
    await a.db(aDb).collection('canary').insertOne({ _id: 'same', scope: 'A-fictitious' });
    await b.db(bDb).collection('canary').insertOne({ _id: 'same', scope: 'B-fictitious' });
    assert.equal((await a.db(aDb).collection('canary').findOne({ _id: 'same' })).scope, 'A-fictitious');
    assert.equal((await b.db(bDb).collection('canary').findOne({ _id: 'same' })).scope, 'B-fictitious');
  });
  await check('QA-04', 'A to B and B to A read/write denied with Mongo authorization code13', async () => {
    for (const [client, db] of [[a, bDb], [b, aDb]]) {
      await denied(() => client.db(db).collection('canary').findOne({ _id: 'same' }));
      await denied(() => client.db(db).collection('canary').insertOne({ _id: 'forbidden' }));
    }
    assert.equal(await admin.db(aDb).collection('canary').countDocuments(), 1);
    assert.equal(await admin.db(bDb).collection('canary').countDocuments(), 1);
  });
  await check('QA-05', 'Tenant credential cannot access control data or create users', async () => {
    await denied(() => a.db(control).collection('canary').findOne({ _id: 'same' }));
    await denied(() => a.db(control).collection('canary').insertOne({ _id: 'forbidden' }));
    await denied(() => a.db(aDb).command({ createUser: 'forbidden', pwd: crypto.randomBytes(16).toString('hex'), roles: [] }));
  });
  await check('QA-06', 'Unauthenticated protected read denied after bootstrap', async () => {
    const anonymous = makeClient(); await anonymous.connect();
    await denied(() => anonymous.db(aDb).collection('canary').findOne({ _id: 'same' }));
  });
  await a.db(aDb).createCollection('left');
  await a.db(aDb).createCollection('right');
  await check('QA-07', 'Real transaction commits both fictitious writes', async () => {
    const session = a.startSession();
    try {
      await session.withTransaction(async () => {
        await a.db(aDb).collection('left').insertOne({ _id: 'committed', value: 1 }, { session });
        await a.db(aDb).collection('right').insertOne({ _id: 'committed', value: 1 }, { session });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 4000 });
    } finally { await session.endSession(); }
    assert.equal(await admin.db(aDb).collection('left').countDocuments({ _id: 'committed' }), 1);
    assert.equal(await admin.db(aDb).collection('right').countDocuments({ _id: 'committed' }), 1);
  });
  await check('QA-08', 'Real transaction abort leaves neither fictitious write', async () => {
    const session = a.startSession();
    try {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      await a.db(aDb).collection('left').insertOne({ _id: 'aborted', value: 2 }, { session });
      await a.db(aDb).collection('right').insertOne({ _id: 'aborted', value: 2 }, { session });
      await session.abortTransaction();
    } finally { await session.endSession(); }
    assert.equal(await admin.db(aDb).collection('left').countDocuments({ _id: 'aborted' }), 0);
    assert.equal(await admin.db(aDb).collection('right').countDocuments({ _id: 'aborted' }), 0);
  });
  sample();
}
(async () => {
  try { await main(); result.status = 'PASS'; }
  catch (e) {
    result.status = 'FAIL';
    result.failure = { name: e.name, code: typeof e.code === 'number' ? e.code : null };
    console.log('QA experiment FAIL; sanitized error type=' + e.name + ', code=' + (typeof e.code === 'number' ? e.code : 'none'));
  } finally {
    clearInterval(monitor);
    if (admin && child && !childExited) {
      try { await admin.db('admin').command({ shutdown: 1, force: true, timeoutSecs: 2 }); } catch {}
    }
    for (const c of clients) { try { await c.close(); } catch {} }
    if (child && !childExited && !(await waitExit(5000))) { child.kill(); await waitExit(5000); }
    try {
      if (child) assert.ok(childExited, 'Temporary process still active');
      if (port) assert.deepEqual(listeners(), []);
      ownPath();
      if (fs.existsSync(runtime)) { directoryBytes(runtime); fs.rmSync(runtime, { recursive: true, force: false }); }
      assert.ok(!fs.existsSync(runtime));
      result.resources.cleanup = 'PASS — own process stopped, port released, own runtime/keyfile/data/log removed';
    } catch {
      result.resources.cleanup = 'FAIL — inspect only the recorded temporary PID/port and own runtime';
      result.status = 'FAIL';
    }
    result.ended_at = new Date().toISOString();
    result.measured.elapsed_seconds = (Date.now() - started) / 1000;
    for (const k of ['peak_sampled_rss_mib', 'cpu_seconds', 'peak_sampled_directory_mib'])
      result.measured[k] = Math.round(result.measured[k] * 100) / 100;
    fs.writeFileSync(path.join(evidenceDir, 'qa-results.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ status: result.status, checks: result.checks.length, cleanup: result.resources.cleanup,
      measured: result.measured, versions: result.versions }, null, 2));
    if (result.status !== 'PASS') process.exitCode = 1;
  }
})();
