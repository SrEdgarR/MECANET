// Real own-QA inspection and bounded HTTP->SQL tests; never production data.
import assert from 'node:assert/strict';
import { readFile,writeFile,chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { arch } from 'node:os';
import { createPgPool } from '../../../server/saas/db/pools.js';

const TENANTS=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const code=value=>{if(!/^[0-9a-f]{40}$/.test(value??''))throw new Error('EXACT_QA_CODE_SHA_REQUIRED');return value};
export async function withQaInspection(qa,database,fn){
 if(process.env.QA_PROJECT!=='mecanet-qa-p1l2-cp017'||!['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'].includes(database)
  ||!qa?.fixture?.identities?.every(i=>i.email.endsWith('@qa.invalid'))||!/^[0-9]{10,24}$/.test(qa.systemIdentifier??''))throw new Error('OWN_QA_INSPECTION_REQUIRED');
 const [ca,password]=await Promise.all([readFile('/run/qa-ca.crt','utf8'),readFile('/run/qa-secrets/bootstrap','utf8')]);
 const pool=await createPgPool({host:'postgres',port:5432,database,user:'qa_bootstrap',password,
  ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:2000,statement_timeout:3000,application_name:'mecanet-private-readonly-writer-inspection'});
 let client;
 try{
  client=await pool.connect();await client.query('BEGIN READ ONLY');
  const observed=(await client.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier;
  if(observed!==qa.systemIdentifier)throw new Error('OWN_QA_CLUSTER_PROVENANCE_MISMATCH');
  const result=await fn(client);await client.query('COMMIT');return result;
 }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});throw error}
 finally{client?.release();await pool.end()}
}

export async function collectWriterSqlFacts({qa,sourceSha}){
 sourceSha=code(sourceSha);
 if(!qa?.fixture?.identities?.every(i=>i.email.endsWith('@qa.invalid'))||!qa.connections?.saas_writer_maintenance)throw new Error('SYNTHETIC_WRITER_FIXTURE_REQUIRED');
 const central=await withQaInspection(qa,'mecanet_control',async pool=>{
  const states=(await pool.query('SELECT * FROM saas.tenant_writer_state ORDER BY tenant_id')).rows;
  const aggregate=(await pool.query("SELECT q.used_bytes::text,q.reserved_bytes::text,q.max_bytes::text,q.barrier_max_bytes::text,saas.write_barrier_cost()::text AS barrier_bytes,(SELECT coalesce(sum(saas.write_operation_cost(r.tenant_id,r.operation_id)),0)::text FROM saas.write_growth_reservations r WHERE r.status='SETTLED') AS actual_used,(SELECT coalesce(sum(control_bytes_reserved),0)::text FROM saas.write_growth_reservations WHERE status<>'SETTLED') AS actual_reserved FROM saas.write_control_quota q WHERE id=1")).rows[0];
  assert.equal(aggregate.used_bytes,aggregate.actual_used);assert.equal(aggregate.reserved_bytes,aggregate.actual_reserved);
  assert(BigInt(aggregate.used_bytes)+BigInt(aggregate.reserved_bytes)<=BigInt(aggregate.max_bytes));
  assert(BigInt(aggregate.barrier_bytes)<=BigInt(aggregate.barrier_max_bytes));
  const shape=(await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='saas' AND table_name IN('write_intents','write_growth_reservations','write_projections','write_transitions') AND column_name IN('payload','body','preimage','sku','name','reason','stock','on_hand')")).rows[0];assert.equal(shape.n,0);
  const debt=(await pool.query("SELECT count(*)::int AS unsettled,count(*) FILTER(WHERE i.status IN('PENDING','EXECUTING','UNKNOWN'))::int AS nonterminal FROM saas.write_growth_reservations r JOIN saas.write_intents i USING(tenant_id,operation_id) WHERE r.status<>'SETTLED'")).rows[0];
  return{states,aggregate,debt,noBusinessPayload:true};
 });
 const tenants=[];
 for(let index=0;index<TENANTS.length;index++){
  const suffix=index===0?'a':'b';
  tenants.push(await withQaInspection(qa,`mecanet_tenant_${suffix}`,async pool=>{
   const environment=(await pool.query("SELECT current_setting('server_version_num') AS version,current_setting('server_encoding') AS encoding,current_setting('client_encoding') AS client,current_setting('synchronous_commit') AS sync,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
   assert.equal(environment.version,'180006');assert.equal(environment.encoding,'UTF8');assert.equal(environment.client,'UTF8');assert.equal(environment.sync,'on');assert.equal(environment.tls,true);
   const invariant=(await pool.query("SELECT q.active_products::text AS products,q.logical_bytes::text AS used,inventory.logical_usage()::text AS actual,(SELECT count(*) FROM catalog.products WHERE status='active')::text AS actual_products,(SELECT count(*) FROM inventory.operations)::text AS operations,(SELECT count(*) FROM inventory.audit)::text AS audits,(SELECT count(*) FROM inventory.movements)::text AS movements,(SELECT count(*) FROM inventory.balances b WHERE b.on_hand<>(SELECT coalesce(sum(m.quantity),0) FROM inventory.movements m WHERE m.product_id=b.product_id))::int AS balance_mismatch,(SELECT count(*) FROM inventory.operations o LEFT JOIN inventory.audit a ON a.operation_id=o.id WHERE a.operation_id IS NULL OR a.result_hash<>encode(sha256(convert_to(o.result::text,'UTF8')),'hex'))::int AS result_mismatch FROM inventory.quota_state q WHERE id=1")).rows[0];
   assert.equal(invariant.used,invariant.actual);assert.equal(invariant.products,invariant.actual_products);assert.equal(invariant.operations,invariant.audits);assert.equal(invariant.balance_mismatch,0);assert.equal(invariant.result_mismatch,0);
   const fence=(await pool.query('SELECT tenant_id,generation,data_epoch,writer_version,state FROM inventory.writer_fence WHERE id=1')).rows[0];
   const state=central.states.find(s=>s.tenant_id===TENANTS[index]);assert(state);assert.equal(fence.generation,state.generation);assert.equal(fence.data_epoch,state.data_epoch);assert.equal(fence.writer_version,state.writer_version);assert.equal(fence.state,state.state);
   assert(BigInt(state.used_bytes)<=BigInt(invariant.used));assert(BigInt(state.used_bytes)+BigInt(state.reserved_bytes)>=BigInt(invariant.used));
   assert(BigInt(state.used_products)<=BigInt(invariant.products));assert(BigInt(state.used_products)+BigInt(state.reserved_products)>=BigInt(invariant.products));
   if(state.reserved_bytes==='0')assert.equal(state.used_bytes,invariant.used);
   const privilege=(await pool.query("SELECT count(*) FILTER(WHERE r.rolcanlogin OR r.rolsuper OR r.rolbypassrls)::int AS unsafe_owners,count(*) FILTER(WHERE p.proconfig IS NULL OR NOT EXISTS(SELECT 1 FROM unnest(p.proconfig) x WHERE x LIKE 'search_path=pg_catalog,%'))::int AS unsafe_paths,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))::int AS public_exec FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='inventory' AND p.prosecdef")).rows[0];
   assert.deepEqual(privilege,{unsafe_owners:0,unsafe_paths:0,public_exec:0});
   return{tenantId:TENANTS[index],environment,invariant,fence,ownerAndPaths:privilege,conservativeCentralLedger:true};
  }));
 }
 const migrationHashes={};
 for(const path of ['003-control-writers.sql','003-tenant-writers.sql'])migrationHashes[path]=createHash('sha256').update(await readFile(new URL(`../../../server/saas/db/migrations/${path}`,import.meta.url))).digest('hex');
 return{sourceSha,observedAt:new Date().toISOString(),runtimeArch:arch(),environment:'own synthetic PostgreSQL18.6/TLS real',migrationHashes,central:{aggregate:central.aggregate,debt:central.debt,noBusinessPayload:true},tenants,secretsPrinted:false};
}

const knownTestNames=new Set([
 'writer has no free DML, DDL, fence mutation, role elevation or foreign connection',
 'SQL validates the same exact canonical UTF8 digest and derives the effect from it',
 'concurrent receipts add once each, replay cannot change product and used is the real logical sum',
]);
const knownSqlMessages=new Set(['IDEMPOTENCY_CONFLICT','CANONICAL_INPUT_INVALID','OPERATION_ACCESS_DENIED','WRITER_FENCE_CLOSED','LOGICAL_COUNTER_INCONSISTENT','LOGICAL_QUOTA','WRITE_RESULT_INVALID','WRITE_TICKET_INVALID','AUTHORITY_CHANGED','WRITE_UNCERTAIN','OWN_QA_INSPECTION_REQUIRED','OWN_QA_CLUSTER_PROVENANCE_MISMATCH']);
const publicCodes=new Set(['NO_PUBLIC_CODE','INVALID_WRITE','INVALID_QUERY','EPOCH_CONFLICT','KEY_CONFLICT','SKU_CONFLICT','OPERATION_PENDING','AUTHORITY_CHANGED','ACCESS_DENIED','SESSION_EXPIRED','PRODUCT_LIMIT','LOGICAL_QUOTA','GLOBAL_QUOTA','WRITE_CLOSED','TENANT_UNAVAILABLE','WRITE_UNCERTAIN','ADMISSION_BUSY']);
export function sanitizeSqlFailure(error){
 const errorCode=/^[0-9A-Z]{5}$/.test(error?.code??'')||['ERR_ASSERTION','ENOENT','ECONNRESET','ECONNREFUSED','ETIMEDOUT'].includes(error?.code)?error.code:'QA_SQL_FAILED';
 return{errorCode,...(knownSqlMessages.has(error?.message)?{fixedFailure:error.message}:{}),...(/^\d{1,8}$/.test(error?.position??'')?{sqlPosition:error.position}:{})};
}
export function sanitizeTapDiagnostics(stdout){
 return stdout.split(/(?=^not ok \d+ - )/m).filter(section=>/^not ok \d+ - /.test(section)).map(section=>{
  const first=section.split('\n')[0],name=/^not ok \d+ - (.*)$/.exec(first)?.[1];
  const diagnostics={test:knownTestNames.has(name)?name:'UNIDENTIFIED_TEST'};
  const codes=[...section.matchAll(/^\s*code: ['"]?([A-Z0-9_]+)['"]?\s*$/gm)].map(m=>m[1]).filter(value=>/^[0-9A-Z]{5}$/.test(value)||['ERR_ASSERTION','ERR_TEST_FAILURE','ENOENT','ECONNRESET','ECONNREFUSED','ETIMEDOUT'].includes(value));
  if(codes.length)diagnostics.codes=[...new Set(codes)];
  const http=/Expected HTTP (\d{3}), received (\d{3})\/([A-Z_]{1,60})/.exec(section);
  if(http)diagnostics.http={expected:Number(http[1]),received:Number(http[2]),publicCode:publicCodes.has(http[3])?http[3]:'UNKNOWN_PUBLIC_CODE'};
  const locations=[...section.matchAll(/(sql-writers\.test\.mjs|sql-live\.mjs|http-client\.mjs):(\d{1,6}):(\d{1,6})/g)].map(([,file,line,column])=>({file,line:Number(line),column:Number(column)}));
  if(locations.length)diagnostics.locations=locations.slice(0,4);
  const fixed=[...section.matchAll(/\b[A-Z][A-Z_]{3,79}\b/g)].map(m=>m[0]).filter(value=>knownSqlMessages.has(value));
  if(fixed.length)diagnostics.fixedMessages=[...new Set(fixed)];
  const permissions=/permission denied for (table|schema|function|relation|database) ([a-z_][a-z0-9_.]*)/.exec(section);
  if(permissions&&/^(inventory|catalog|saas|mecanet_[a-z_]+|postgres)(?:\.[a-z_]+)?$/.test(permissions[2]))diagnostics.permission={kind:permissions[1],object:permissions[2]};
  return diagnostics;
 });
}
export async function runWriterSqlTests(){
 if(process.env.QA_PROJECT!=='mecanet-qa-p1l2-cp017')throw new Error('OWN_QA_INSPECTION_REQUIRED');
 const file=new URL('./sql-writers.test.mjs',import.meta.url);
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--test','--test-reporter=tap',file.pathname],{stdio:['ignore','pipe','pipe'],env:process.env});
  let bytes=0,stdout='',stderr='',expired=false;
  const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL')},120000);
  const capture=which=>chunk=>{bytes+=chunk.length;if(bytes>1048576){child.kill('SIGKILL');return}if(which==='out')stdout+=chunk;else stderr+=chunk};
  child.stdout.on('data',capture('out'));child.stderr.on('data',capture('err'));child.on('error',error=>{clearTimeout(timer);reject(error)});
  child.on('close',async exitCode=>{
   clearTimeout(timer);const counts={};for(const field of ['tests','pass','fail','cancelled','skipped'])counts[field]=Number(new RegExp(`^# ${field} (\\d+)`,'m').exec(stdout)?.[1]??0);
   try{
    const stdoutFile='/run/qa-results/sql-tests.tap',stderrFile='/run/qa-results/sql-tests.stderr';
    await writeFile(stdoutFile,stdout,{mode:0o600});await chmod(stdoutFile,0o600);
    await writeFile(stderrFile,stderr,{mode:0o600});await chmod(stderrFile,0o600);
    resolve({exitCode,expired,counts,stdoutSha256:createHash('sha256').update(stdout).digest('hex'),stderrSha256:createHash('sha256').update(stderr).digest('hex'),diagnostics:sanitizeTapDiagnostics(stdout),rawOutputFiles:{stdout:stdoutFile,stderr:stderrFile,mode:'0600',private:true},rawOutputPrinted:false});
   }catch(error){reject(error)}
  });
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report={status:'FAIL',secretsPrinted:false};
 try{
  const file=process.env.MECANET_QA_CONNECTIONS??'/run/qa-secrets/connections.json';if(!file.startsWith('/run/qa-secrets/'))throw new Error('PRIVATE_QA_CONNECTIONS_REQUIRED');
  const qa=JSON.parse(await readFile(file,'utf8'));report.tests=await runWriterSqlTests();
  if(report.tests.exitCode===0&&!report.tests.expired&&report.tests.counts.fail===0){report.facts=await collectWriterSqlFacts({qa,sourceSha:process.env.QA_CODE_SHA});report.status='PASS'}
 }catch(error){Object.assign(report,sanitizeSqlFailure(error))}
 if(report.status!=='PASS')process.exitCode=1;
 console.log(JSON.stringify(report));
}
