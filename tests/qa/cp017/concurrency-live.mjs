// Preregistered CLOSED own-QA central SQL conflicts. Never application code.
import assert from 'node:assert/strict';
import {readFile,open,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {serializable} from '../../../server/saas/admission/transaction.js';
import {validatePromotionHostProof} from './promotion.mjs';
import {sanitizeSqlFailure} from './sql-live.mjs';

const PROJECT='mecanet-qa-p1l2-cp017',DATABASES=['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'];
const TENANTS=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const LOCK_NAMESPACE=56321,LOCKS=[178001,178002],hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code})};
const ROLE_METADATA_SQL="WITH roles AS(SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil::text FROM pg_roles WHERE rolname LIKE 'saas_%' OR rolname='qa_bootstrap'),memberships AS(SELECT parent.rolname AS parent,child.rolname AS member,grantor.rolname AS grantor,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member JOIN pg_roles grantor ON grantor.oid=m.grantor WHERE parent.rolname LIKE 'saas_%' OR child.rolname LIKE 'saas_%' OR parent.rolname='qa_bootstrap' OR child.rolname='qa_bootstrap') SELECT(SELECT count(*)::int FROM roles) AS role_count,(SELECT count(*)::int FROM memberships) AS membership_count,encode(sha256(convert_to(jsonb_build_object('roles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY rolname),'[]') FROM roles r),'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY parent,member,grantor),'[]') FROM memberships m))::text,'UTF8')),'hex') AS hash";
export const CONCURRENCY_PLAN=Object.freeze({project:PROJECT,criterion:'L2-A8 SQL conflicts and bounded central serializable retry only',maxRuntimeMs:45000,maxQueries:80,maxLeases:2,maxTablesPerDatabase:64,statementMs:2000,lockMs:500,deadlockMs:50,productionRetryDeadlineMs:500,productionAttemptsMax:3,allFencesClosed:true,zeroSaasClients:true,permissionChanges:0,newRoles:0,quotasChanged:0,HTTP:false,conflicts:['40001','40P01'],technicalCommits:'one preexisting policy UPDATE limits=limits changes xmin only; successful retry repeats the same no-op',deadlock:'two own-cluster advisory_xact locks in inverse order, SET LOCAL deadlock_timeout only; rival always ROLLBACK',preservation:'integral server-side JSONB-text fingerprints of all protected central/session/tenant tables including migration registries and public QA role attributes/memberships before/after; no passwords, QH/QC/Qt refund or owner adoption',stillNotVerified:['tenant-writer HTTP races','capacity','whole A8']});
export function validateConcurrencyProof({qa,proof,sourceSha}){
 validatePromotionHostProof({qa,proof,sourceSha});
 if(proof.workerStopped!==true||proof.webStopped!==true||new Set(proof.apis.map(a=>a.containerId)).size!==2||proof.apis.some(a=>!/^[a-f0-9]{40}$/.test(a.stoppedSourceSha??'')))fail('CONCURRENCY_POSITIVE_HOST_END_REQUIRED');
 return proof;
}
export function assertRealConflictEvidence({sqlState,attempts,events}){
 if(!['40001','40P01'].includes(sqlState)||!Array.isArray(events)||!Number.isInteger(attempts)||attempts<2||attempts>3)fail('CONCURRENCY_REAL_CONFLICT_REQUIRED');
 const starts=events.filter(e=>e.command==='BEGIN'&&e.outcome==='ACK'),conflicts=events.filter(e=>e.outcome==='ERROR'&&e.sqlState===sqlState);
 if(starts.length!==attempts||!conflicts.length)fail('CONCURRENCY_REAL_CONFLICT_REQUIRED');
 for(const conflict of conflicts){const position=events.indexOf(conflict),rollback=events.findIndex((e,n)=>n>position&&e.command==='ROLLBACK'&&e.outcome==='ACK'&&e.attempt===conflict.attempt),nextBegin=events.findIndex((e,n)=>n>position&&e.command==='BEGIN');if(rollback<0||nextBegin<0||rollback>=nextBegin)fail('CONCURRENCY_ROLLBACK_ACK_REQUIRED')}
 const last=events.at(-1);if(last?.command!=='COMMIT'||last.outcome!=='ACK'||last.attempt!==attempts||events.some(e=>e.command==='ROLLBACK'&&e.outcome==='ERROR'))fail('CONCURRENCY_POSITIVE_END_REQUIRED');
 return true;
}
export function assertConcurrencyPreserved(before,after){assert.deepEqual(after,before,'all protected rows, registries and guards must remain byte-exact JSONB text');return true}
export function assertConcurrencyEnvelope({elapsedMs,queries,maxObservedLeases,leases}){if(!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>CONCURRENCY_PLAN.maxRuntimeMs||!Number.isInteger(queries)||queries<1||queries>CONCURRENCY_PLAN.maxQueries||!Number.isInteger(maxObservedLeases)||maxObservedLeases<1||maxObservedLeases>CONCURRENCY_PLAN.maxLeases||leases!==0)fail('CONCURRENCY_ENVELOPE_EXCEEDED');return true}
async function durable(path,value){const h=await open(path,'w',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync()}finally{await h.close()}}
async function trusted(path){const s=await stat(path);if(!s.isFile()||(s.mode&0o777)!==0o400)fail('CONCURRENCY_READ_ONLY_HOST_PROOF_REQUIRED');return JSON.parse(await readFile(path,'utf8'))}
export async function runConcurrency(){
 const sourceSha=process.env.QA_CODE_SHA;if(process.env.QA_PROJECT!==PROJECT||!/^[a-f0-9]{40}$/.test(sourceSha??''))fail('CONCURRENCY_EXACT_SOURCE_REQUIRED');
 const started=performance.now(),report={project:PROJECT,sourceSha,status:'PREREGISTERED / NOT VERIFIED',observedAt:new Date().toISOString(),harnessHash:hash(await readFile(new URL(import.meta.url))),plan:CONCURRENCY_PLAN,cases:[],secretsPrinted:false};
 await durable('/run/qa-results/concurrency-plan.json',report);
 const [qa,proof,ca,password]=await Promise.all([readFile('/run/qa-secrets/connections.json','utf8').then(JSON.parse),trusted('/run/qa-results/operational-host-proof.json'),readFile('/run/qa-ca.crt','utf8'),readFile('/run/qa-secrets/bootstrap','utf8')]);
 validateConcurrencyProof({qa,proof,sourceSha});
 let queries=0,leases=0,maxObservedLeases=0,centralPool;
 const bounded=()=>{if(++queries>CONCURRENCY_PLAN.maxQueries||performance.now()-started>CONCURRENCY_PLAN.maxRuntimeMs)fail('CONCURRENCY_ENVELOPE_EXCEEDED')};
 const config=database=>({host:'postgres',port:5432,database,user:'qa_bootstrap',password,ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:2,connectionTimeoutMillis:1500,statement_timeout:2000,lock_timeout:500,idle_in_transaction_session_timeout:2000,application_name:'mecanet-cp017-central-conflict'});
 const command=async(c,text,values=[])=>{bounded();return c.query(text,values)};
 const acquire=async pool=>{if(leases>=2)fail('CONCURRENCY_LEASE_BUDGET_EXCEEDED');const c=await pool.connect();leases++;maxObservedLeases=Math.max(leases,maxObservedLeases);let released=false;return{query:(text,values)=>command(c,text,values),release(error){if(released)fail('CONCURRENCY_DOUBLE_RELEASE');released=true;leases--;c.release(error)}}};
 async function snapshot(){
  const value={};let policyKey;
  for(const [n,database]of DATABASES.entries()){
   const pool=await createPgPool({...config(database),max:1}),c=await acquire(pool);let ended=false;
   try{
    await c.query('BEGIN READ ONLY');
    const env=(await c.query(`SELECT current_setting('server_version_num') AS version,current_setting('server_encoding') AS encoding,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT system_identifier::text FROM pg_control_system()) AS system_id,(SELECT count(*)::int FROM pg_stat_activity WHERE usename LIKE 'saas_%') AS saas_clients${n===0?",(SELECT generation FROM saas.admission_fence WHERE id=1) AS generation,(SELECT jsonb_agg(jsonb_build_object('tenant_id',tenant_id,'state',state,'generation',generation,'writer_version',writer_version::text,'data_epoch',data_epoch::text) ORDER BY tenant_id) FROM saas.tenant_writer_state w) AS fences,(SELECT scope_key FROM saas.policies ORDER BY scope_key LIMIT 1) AS policy_key,(SELECT count(*)::int FROM pg_locks WHERE locktype='advisory' AND classid=56321::oid AND objid IN(178001::oid,178002::oid)) AS own_locks":",(SELECT jsonb_build_object('tenant_id',tenant_id,'state',state,'generation',generation,'writer_version',writer_version::text,'data_epoch',data_epoch::text) FROM inventory.writer_fence WHERE id=1) AS fence"}`)).rows[0];
    assert.equal(env.version,'180006');assert.equal(env.encoding,'UTF8');assert.equal(env.tls,true);assert.equal(env.system_id,qa.systemIdentifier);assert.equal(env.saas_clients,0);
    if(n===0){assert.equal(env.generation,qa.generation);assert.deepEqual(env.fences.map(f=>f.tenant_id),TENANTS);assert(env.fences.every(f=>f.state==='CLOSED'&&f.generation===qa.generation));assert.equal(env.own_locks,0);if(typeof env.policy_key!=='string'||!env.policy_key)fail('CONCURRENCY_PREEXISTING_POLICY_REQUIRED');policyKey=env.policy_key;value.centralFences=env.fences;const roles=(await c.query(ROLE_METADATA_SQL)).rows[0];assert(Number.isInteger(roles.role_count)&&roles.role_count>0);assert(Number.isInteger(roles.membership_count)&&roles.membership_count>=0);assert.match(roles.hash,/^[a-f0-9]{64}$/);value.publicRolesAndMemberships=roles}
    else{const f=env.fence,central=value.centralFences[n-1];assert.equal(f.tenant_id,TENANTS[n-1]);for(const k of ['state','generation','writer_version','data_epoch'])assert.equal(String(f[k]),String(central[k]));assert.equal(f.state,'CLOSED')}
    const schemas=n===0?['saas','session_store']:['catalog','inventory'];
    const tables=(await c.query('SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1::text[]) ORDER BY schemaname,tablename',[schemas])).rows;
    if(!tables.length||tables.length>CONCURRENCY_PLAN.maxTablesPerDatabase||tables.some(t=>!schemas.includes(t.schemaname)||!/^[a-z][a-z0-9_]{0,62}$/.test(t.tablename)))fail('CONCURRENCY_FIXED_TABLE_SCOPE_REQUIRED');
    const fragments=tables.map(t=>`SELECT '${t.schemaname}.${t.tablename}' AS name,jsonb_build_object('count',count(*)::text,'hash',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]')::text,'UTF8')),'hex')) AS fingerprint FROM ${t.schemaname}.${t.tablename} r`);
    value[database]=(await c.query(`SELECT jsonb_object_agg(name,fingerprint ORDER BY name) AS fingerprints FROM (${fragments.join(' UNION ALL ')}) t`)).rows[0].fingerprints;
    assert(value[database][`${n===0?'saas':'catalog'}.schema_migrations`]);
    await c.query('COMMIT');ended=true;
   }finally{if(!ended)ended=await c.query('ROLLBACK').then(()=>true,()=>false);c.release(!ended);await pool.end()}
  }
  return{fingerprints:value,policyKey};
 }
 function retryPool(pool,events){let attempt=0;return{async connect(){const c=await acquire(pool);return{async query(sql,values){const text=typeof sql==='string'?sql:sql.text,kind=/^BEGIN\b/.test(text)?'BEGIN':/^(COMMIT|ROLLBACK)$/.test(text)?text:'SQL';if(kind==='BEGIN')attempt++;try{const result=await c.query(sql,values);events.push({attempt,command:kind,outcome:'ACK'});return result}catch(error){events.push({attempt,command:kind,outcome:'ERROR',sqlState:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'NON_SQL_ERROR'});throw error}},release:error=>c.release(error)}}}}
 try{
  const before=await snapshot();report.beforeFingerprintsHash=hash(JSON.stringify(before.fingerprints));
  centralPool=await createPgPool(config(DATABASES[0]));
  const opponent=await acquire(centralPool);let opponentEnded=false;
  try{
   const events=[];let attempts=0,opponentCommitAcknowledged=false;
   const result=await serializable(retryPool(centralPool,events),async c=>{
    attempts++;await c.query('SET LOCAL ROLE saas_policy');
    const read=(await c.query('SELECT version::text,limits FROM saas.policies WHERE scope_key=$1',[before.policyKey])).rows[0];assert(read);
    if(attempts===1){await opponent.query('BEGIN');await opponent.query('SET LOCAL ROLE saas_policy');assert.equal((await opponent.query('UPDATE saas.policies SET limits=limits WHERE scope_key=$1',[before.policyKey])).rowCount,1);await opponent.query('COMMIT');opponentEnded=true;opponentCommitAcknowledged=true}
    assert.equal((await c.query('UPDATE saas.policies SET limits=limits WHERE scope_key=$1',[before.policyKey])).rowCount,1);
    return 'central-policy-no-op';
   });
   assert.equal(result,'central-policy-no-op');assert.equal(opponentCommitAcknowledged,true);assertRealConflictEvidence({sqlState:'40001',attempts,events});
   report.cases.push({id:'real-40001-preexisting-policy-xmin',status:'PASS REAL CENTRAL SQL ONLY',sqlState:'40001',attempts,opponentCommitAcknowledged,productionLibrary:true,rollbackAcknowledgedBeforeRetry:true,events,HTTP:false});
  }finally{if(!opponentEnded)opponentEnded=await opponent.query('ROLLBACK').then(()=>true,()=>false);opponent.release(!opponentEnded)}
  const rival=await acquire(centralPool);let rivalEnded=false,rivalPending,rivalError;
  try{
   await rival.query('BEGIN');await rival.query("SET LOCAL deadlock_timeout='50ms'");await rival.query('SET LOCAL ROLE saas_api');await rival.query('SELECT pg_advisory_xact_lock($1,$2)',[LOCK_NAMESPACE,LOCKS[1]]);
   const events=[];let attempts=0,blockedObserved=false;
   const result=await serializable(retryPool(centralPool,events),async c=>{
    attempts++;await c.query("SET LOCAL deadlock_timeout='50ms'");await c.query('SET LOCAL ROLE saas_api');await c.query('SELECT pg_advisory_xact_lock($1,$2)',[LOCK_NAMESPACE,LOCKS[0]]);
    if(attempts===1){
     const pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
     const blocked=c.query('SELECT pg_advisory_xact_lock($1,$2)',[LOCK_NAMESPACE,LOCKS[1]]).then(()=>null,error=>error);
     for(let check=0;check<3;check++){const row=(await rival.query('SELECT pg_backend_pid()=ANY(pg_blocking_pids($1)) AS blocked',[pid])).rows[0];if(row?.blocked===true){blockedObserved=true;break}await delay(5)}
     if(!blockedObserved)fail('CONCURRENCY_CAUSAL_FIRST_WAIT_REQUIRED');
     rivalPending=rival.query('SELECT pg_advisory_xact_lock($1,$2)',[LOCK_NAMESPACE,LOCKS[0]]).catch(error=>{rivalError=error}).then(async()=>{try{await rival.query('ROLLBACK');rivalEnded=true}catch(error){rivalError??=error}});
     const error=await blocked;if(error)throw error;
    }else await c.query('SELECT pg_advisory_xact_lock($1,$2)',[LOCK_NAMESPACE,LOCKS[1]]);
    return 'central-advisory-no-op';
   });
   await rivalPending;assert.equal(result,'central-advisory-no-op');assert.equal(rivalError,undefined);assert.equal(rivalEnded,true);assert.equal(blockedObserved,true);assertRealConflictEvidence({sqlState:'40P01',attempts,events});
   report.cases.push({id:'real-40P01-own-advisory-cycle',status:'PASS REAL CENTRAL SQL ONLY',sqlState:'40P01',attempts,productionLibrary:true,causalFirstWaitObserved:true,rivalRollbackAcknowledged:true,rollbackAcknowledgedBeforeRetry:true,localDeadlockMs:50,events,HTTP:false});
  }finally{if(rivalPending)await rivalPending.catch(()=>{});if(!rivalEnded)rivalEnded=await rival.query('ROLLBACK').then(()=>true,()=>false);rival.release(!rivalEnded)}
  await centralPool.end();centralPool=null;assert.equal(leases,0);
  const after=await snapshot();assert.equal(after.policyKey,before.policyKey);assertConcurrencyPreserved(before.fingerprints,after.fingerprints);assertConcurrencyEnvelope({elapsedMs:performance.now()-started,queries,maxObservedLeases,leases});report.afterFingerprintsHash=hash(JSON.stringify(after.fingerprints));report.integralHashesUnchanged=true;report.allFencesClosedBeforeAndAfter=true;report.noQuotaOrGrantChanges=true;report.noQhQcQtRefund=true;report.status='PASS FOR LISTED CENTRAL SQL CONFLICTS ONLY';
 }catch(error){report.status='FAIL';Object.assign(report,sanitizeSqlFailure(error));if(/^CONCURRENCY_[A-Z_]{1,80}$/.test(error.message??''))report.fixedFailure=error.message;throw error}
 finally{if(centralPool)await centralPool.end();report.queries=queries;report.maxObservedLeases=maxObservedLeases;report.leasesEnded=leases===0;report.durationMs=Math.round(performance.now()-started);report.fullA8Verified=false;await durable('/run/qa-results/concurrency.json',report);console.log(JSON.stringify({project:PROJECT,sourceSha,status:report.status,cases:report.cases.map(({events,...result})=>result),queries,maxObservedLeases,secretsPrinted:false,report:'/run/qa-results/concurrency.json'}))}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await runConcurrency()}catch(error){console.log(JSON.stringify({status:'FAIL',...sanitizeSqlFailure(error),secretsPrinted:false}));process.exitCode=1}}
