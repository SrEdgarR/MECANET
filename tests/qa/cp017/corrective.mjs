// Private versioned corrective migration, only the already-closed synthetic QA.
// Never restarts APIs or promotes a fence; the composition root owns those gates.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPgPool,validateConnection} from '../../../server/saas/db/pools.js';
const PROJECT='mecanet-qa-p1l2-cp017',DATABASES=['mecanet_tenant_a','mecanet_tenant_b'];
const TENANTS=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');
const migrationPath=name=>new URL(`../../../server/saas/db/migrations/${name}`,import.meta.url);
const fail=message=>{throw new Error(message)};
async function database(admin,database,fn){
 const pool=await createPgPool({...admin,database,max:1,connectionTimeoutMillis:2000,statement_timeout:4000,lock_timeout:1000,application_name:'mecanet-private-corrective-v4'});
 try{return await fn(pool)}finally{await pool.end()}
}
export function validateCorrectiveProof({adminConnection,qa,proof,sourceCommit,now=Date.now()}){
 const admin=validateConnection(adminConnection);
 if(admin.host!=='postgres'||admin.database!=='postgres'||admin.user!=='qa_bootstrap'||!/^[0-9a-f]{40}$/.test(sourceCommit??'')
  ||!uuid.test(qa?.generation??'')||!/^[0-9]{10,24}$/.test(qa?.systemIdentifier??'')||!qa?.fixture?.identities?.every(i=>i.email.endsWith('@qa.invalid')))fail('CORRECTIVE_PRIVATE_FIXTURE_REQUIRED');
 if(proof?.project!==PROJECT||proof.sourceSha!==sourceCommit||proof.systemIdentifier!==qa.systemIdentifier||proof.generation!==qa.generation
  ||!Array.isArray(proof.apis)||proof.apis.length!==2||new Set(proof.apis.map(p=>p.instance)).size!==2
  ||proof.apis.some(p=>!['api1','api2'].includes(p.instance)||p.state!=='exited'||!/^[0-9a-f]{64}$/.test(p.containerId??'')))fail('CORRECTIVE_API_STOP_PROOF_REQUIRED');
 const age=now-Date.parse(proof.observedAt);if(!Number.isFinite(age)||age<0||age>300000)fail('CORRECTIVE_RECENT_PROOF_REQUIRED');
 return admin;
}
async function tenantSnapshot(pool){
 return{
  fence:(await pool.query('SELECT * FROM inventory.writer_fence WHERE id=1')).rows[0],
  quota:(await pool.query('SELECT * FROM inventory.quota_state WHERE id=1')).rows[0],
  counts:(await pool.query('SELECT (SELECT count(*) FROM catalog.products)::text AS products,(SELECT count(*) FROM inventory.operations)::text AS operations,(SELECT count(*) FROM inventory.movements)::text AS movements,(SELECT count(*) FROM inventory.audit)::text AS audits,inventory.logical_usage()::text AS actual')).rows[0],
  function:(await pool.query("SELECT p.proowner::text,p.proacl::text,p.proconfig,r.rolcanlogin,r.rolsuper,r.rolbypassrls FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='inventory.apply_write(text,uuid,text,text,uuid,bigint,bigint)'::regprocedure")).rows[0],
 };
}
export async function applyCorrectiveMigration({adminConnection,qa,proof,sourceCommit,failAfter=null}){
 const admin=validateCorrectiveProof({adminConnection,qa,proof,sourceCommit});
 if(![null,'a','b'].includes(failAfter))fail('CORRECTIVE_FAULT_MODE_REQUIRED');
 const [controlSource,tenantSource,bytes]=await Promise.all(['003-control-writers.sql','003-tenant-writers.sql','004-tenant-writers-fix.sql'].map(name=>readFile(migrationPath(name))));
 const hash=digest(bytes),registeredHashes={central:digest(controlSource),tenant:digest(tenantSource)};
 const central=await database(admin,'mecanet_control',async pool=>{
  const identifier=(await pool.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier;
  if(identifier!==qa.systemIdentifier)fail('CORRECTIVE_CLUSTER_PROVENANCE_MISMATCH');
  const active=(await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename IN('saas_api','saas_issuer','saas_session','saas_writer_a','saas_writer_b','saas_tenant_a','saas_tenant_b','saas_demo')")).rows[0].n;
  if(active!==0)fail('CORRECTIVE_API_SQL_CLIENTS_PRESENT');
  const registered=(await pool.query('SELECT source_hash FROM saas.schema_migrations WHERE version=3')).rows[0];
  if(registered?.source_hash!==registeredHashes.central)fail('CORRECTIVE_V3_HASH_MISMATCH');
  const states=(await pool.query('SELECT * FROM saas.tenant_writer_state ORDER BY tenant_id')).rows;
  if(states.length!==2||states.some((s,index)=>s.tenant_id!==TENANTS[index]||s.state!=='CLOSED'||s.generation!==qa.generation))fail('CORRECTIVE_CENTRAL_CLOSE_REQUIRED');
  const pending=(await pool.query("SELECT count(*)::int AS n FROM saas.write_intents WHERE status IN('PENDING','EXECUTING','UNKNOWN')")).rows[0].n;
  if(pending!==0)fail('CORRECTIVE_RECONCILIATION_REQUIRED');
  for(const state of states){
   const closed=(await pool.query("SELECT EXISTS(SELECT 1 FROM saas.write_restriction_tenants t WHERE t.tenant_id=$1 AND t.generation=$2 AND t.data_epoch=$3 AND t.closed_version=$4 AND t.close_proven AND t.stage IN('RESOLVED','ACKNOWLEDGED')) AS proven",[state.tenant_id,state.generation,state.data_epoch,state.writer_version])).rows[0].proven;
   if(!closed)fail('CORRECTIVE_EXCLUSIVE_CLOSE_PROOF_REQUIRED');
  }
  return states;
 });
 const snapshots=[];
 // Preflight the whole closed cohort before changing either function.
 for(let index=0;index<DATABASES.length;index++)snapshots.push(await database(admin,DATABASES[index],async pool=>{
  const v3=(await pool.query('SELECT source_hash FROM catalog.schema_migrations WHERE version=3')).rows[0];
  if(v3?.source_hash!==registeredHashes.tenant)fail('CORRECTIVE_V3_HASH_MISMATCH');
  const value=await tenantSnapshot(pool),state=central[index];
  if(value.fence.state!=='CLOSED'||value.fence.generation!==state.generation||value.fence.data_epoch!==state.data_epoch||value.fence.writer_version!==state.writer_version)fail('CORRECTIVE_LOCAL_CLOSE_REQUIRED');
  if(value.quota.logical_bytes!==value.counts.actual||value.quota.active_products!==value.counts.products)fail('CORRECTIVE_LOGICAL_INTEGRITY_REQUIRED');
  if(!value.function||value.function.rolcanlogin||value.function.rolsuper||value.function.rolbypassrls||!value.function.proconfig?.includes('search_path=pg_catalog, inventory, catalog'))fail('CORRECTIVE_FUNCTION_OWNER_REQUIRED');
  return value;
 }));
 const manifest=[];
 for(let index=0;index<DATABASES.length;index++){
  manifest.push(await database(admin,DATABASES[index],async pool=>{
   const client=await pool.connect();
   try{
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(56321,4)');
    await client.query(index===0?'SET LOCAL ROLE saas_owner_a':'SET LOCAL ROLE saas_owner_b');
    const current=(await client.query('SELECT source_hash FROM catalog.schema_migrations WHERE version=4 FOR UPDATE')).rows[0];
    if(current&&current.source_hash!==hash)fail('CORRECTIVE_HASH_CONFLICT');
    if(!current){await client.query(bytes.toString('utf8'));await client.query('INSERT INTO catalog.schema_migrations(version,source_hash,source_commit) VALUES(4,$1,$2)',[hash,sourceCommit])}
    const after=await tenantSnapshot(client);assert.deepEqual(after,snapshots[index],'Corrective migration must preserve every fence, quota, row count, function owner and ACL');
    await client.query('COMMIT');return{database:DATABASES[index],version:4,sourceHash:hash,reapplied:!current,state:'CLOSED',integrityPreserved:true};
   }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
  }));
  if(failAfter===(index===0?'a':'b'))fail(`CORRECTIVE_FAULT_${failAfter.toUpperCase()}`);
 }
 return{sourceCommit,registeredHashes,manifest,apisStopped:true,fencesClosed:true,openedResources:0,secretsPrinted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report={observedAt:new Date().toISOString(),status:'FAIL',secretsPrinted:false};
 try{
  if(process.env.QA_PROJECT!==PROJECT)fail('CORRECTIVE_PROJECT_REQUIRED');
  const [qa,proof,ca,password]=await Promise.all([readFile('/run/qa-secrets/connections.json','utf8').then(JSON.parse),readFile('/run/qa-results/corrective-proof.json','utf8').then(JSON.parse),readFile('/run/qa-ca.crt','utf8'),readFile('/run/qa-secrets/bootstrap','utf8')]);
  const adminConnection={host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password,ssl:{ca,servername:'postgres',rejectUnauthorized:true}};
  Object.assign(report,await applyCorrectiveMigration({adminConnection,qa,proof,sourceCommit:process.env.QA_CODE_SHA}),{status:'PASS'});
 }catch(error){report.errorCode=/^[A-Z0-9_]{3,80}$/.test(error.code??'')?error.code:'CORRECTIVE_FAILED';if(/^CORRECTIVE_[A-Z0-9_]{1,80}$/.test(error.message??''))report.fixedFailure=error.message;if(/^\d{1,8}$/.test(error.position??''))report.sqlPosition=error.position;process.exitCode=1}
 await writeFile('/run/qa-results/corrective.json',JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
}
