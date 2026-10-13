// Exclusive new synthetic CP017 cluster only. No existing/production migration.
import { readFile,writeFile,rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createPgPool } from '../../../server/saas/db/pools.js';
import { applyWriterMigration } from './migrate.mjs';

const cfgPath='/run/qa-secrets/connections.json';
const sourceCommit=process.env.QA_CODE_SHA;
if(!/^[0-9a-f]{40}$/.test(sourceCommit??'')||process.env.QA_PROJECT!=='mecanet-qa-p1l2-cp017')throw new Error('MIGRATION_EXACT_ENVIRONMENT_REQUIRED');
const qa=JSON.parse(await readFile(cfgPath,'utf8'));
if(!qa.fixture?.identities?.every(i=>i.email.endsWith('@qa.invalid'))||!/^[0-9]{10,24}$/.test(qa.systemIdentifier??''))throw new Error('MIGRATION_PRIVATE_FIXTURE_REQUIRED');
const ca=await readFile('/run/qa-ca.crt','utf8');
const bootstrap=await readFile('/run/qa-secrets/bootstrap','utf8');
const adminConnection={host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password:bootstrap,ssl:{ca,servername:'postgres',rejectUnauthorized:true}};
async function privateWrite(path,value){const temporary=`${path}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(temporary,path)}
let stage='preflight';
async function pool(database,fn){const p=await createPgPool({...adminConnection,database,max:1,connectionTimeoutMillis:2000,statement_timeout:2000,application_name:'mecanet-private-migration-live'});try{return await fn(p)}finally{await p.end()}}
const checkpoint=async({connections,stage:next})=>{stage=next;qa.connections=connections;await privateWrite(cfgPath,qa)};
const inputs={adminConnection,fixture:qa.fixture,generation:qa.generation,connections:qa.connections,entries:qa.entries,checkpoint,sourceCommit};
async function snapshot(){
 const central=await pool('mecanet_control',async p=>{
  const present=(await p.query("SELECT to_regclass('saas.tenant_writer_state') IS NOT NULL AS migrated")).rows[0].migrated;
  const directories=(await p.query(present?'SELECT id,purpose,schema_version,data_epoch,writer_credential_version,writer_secret_ref FROM saas.tenant_directory ORDER BY id':'SELECT id,purpose,schema_version,data_epoch,NULL::bigint AS writer_credential_version,NULL::text AS writer_secret_ref FROM saas.tenant_directory ORDER BY id')).rows;
  const states=present?(await p.query('SELECT * FROM saas.tenant_writer_state ORDER BY tenant_id')).rows:[];
  const migrations=present?(await p.query('SELECT version,source_hash,source_commit FROM saas.schema_migrations ORDER BY version')).rows:[];
  const grants=(await p.query('SELECT identity_id,tenant_id,action,status,version FROM saas.action_grants ORDER BY identity_id,tenant_id,action')).rows;
  return{directories,states,migrations,grants};
 });
 const tenants=[];
 for(const database of ['mecanet_tenant_a','mecanet_tenant_b'])tenants.push(await pool(database,async p=>{
  const present=(await p.query("SELECT to_regclass('inventory.writer_fence') IS NOT NULL AS migrated")).rows[0].migrated;
  const products=(await p.query('SELECT id,sku,name FROM catalog.products ORDER BY id')).rows;
  const fence=present?(await p.query('SELECT * FROM inventory.writer_fence WHERE id=1')).rows[0]:null;
  const quota=present?(await p.query('SELECT * FROM inventory.quota_state WHERE id=1')).rows[0]:null;
  const migrations=present?(await p.query('SELECT version,source_hash,source_commit FROM catalog.schema_migrations ORDER BY version')).rows:[];
  return{database,products,fence,quota,migrations};
 }));
 return{central,tenants};
}
function requireClosed(value){
 if(value.central.states.some(s=>s.state!=='CLOSED')||value.tenants.some(t=>t.fence?.state==='OPEN'))throw new Error('MIGRATION_OPENED_PARTIAL_COHORT');
 if(value.central.directories.some(d=>d.purpose==='company'&&d.schema_version!==1))throw new Error('MIGRATION_PROMOTED_PARTIAL_DIRECTORY');
}
const report={sourceCommit,observedAt:new Date().toISOString(),environment:'own synthetic PostgreSQL18.6 ARM64',phases:[],secretsPrinted:false};
try{
 const identifier=await pool('postgres',async p=>(await p.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier);
 if(identifier!==qa.systemIdentifier)throw new Error('MIGRATION_CLUSTER_PROVENANCE_MISMATCH');
 const initial=await snapshot();if(initial.central.states.length||initial.tenants.some(t=>t.fence))throw new Error('MIGRATION_FRESH_L1_FIXTURE_REQUIRED');
 for(const phase of ['central','a','b']){
  stage=phase;let failure;
  try{await applyWriterMigration({...inputs,failAfter:phase})}catch(error){failure=error}
  if(failure?.message!==`QA_MIGRATION_FAULT_${phase.toUpperCase()}`)throw failure??new Error('MIGRATION_EXPECTED_FAULT_NOT_REACHED');
  const observed=await snapshot();requireClosed(observed);
  if(JSON.stringify(initial.tenants.map(t=>t.products))!==JSON.stringify(observed.tenants.map(t=>t.products)))throw new Error('MIGRATION_EXISTING_PRODUCT_CHANGED');
  report.phases.push({phase:`fault-after-${phase}`,status:'PASS',centralOpen:0,localOpen:0,directoryUnpromoted:true,sourceProductsPreserved:true});
 }
 stage='complete';const result=await applyWriterMigration(inputs);Object.assign(qa,result);await privateWrite(cfgPath,qa);
 const login=JSON.parse(await readFile('/run/qa-secrets/fixture-login.json','utf8'));login.identities=qa.fixture.identities.map(({email,purpose})=>({email,purpose}));await privateWrite('/run/qa-secrets/fixture-login.json',login);
 const beforeRerun=await snapshot();
 const privateConnectionsBefore=JSON.stringify(qa.connections);
 stage='rerun';const repeated=await applyWriterMigration(inputs);const afterRerun=await snapshot();
 if(JSON.stringify(beforeRerun)!==JSON.stringify(afterRerun)||privateConnectionsBefore!==JSON.stringify(repeated.connections))throw new Error('MIGRATION_RERUN_CHANGED_STATE');
 if(repeated.manifest.some(m=>m.reapplied))throw new Error('MIGRATION_RERUN_REAPPLIED_SOURCE');
 for(const t of afterRerun.tenants)if(t.fence?.state!=='OPEN'||t.fence.writer_version!=='1'||t.fence.data_epoch!=='2')throw new Error('MIGRATION_FINAL_FENCE_MISMATCH');
 report.phases.push({phase:'complete-and-rerun',status:'PASS',hashesVerified:true,noDataReload:true,noCredentialReset:true,noCounterReset:true});
 report.manifest=result.manifest;report.status='PASS';
 await writeFile('/run/qa-results/migration.json',JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
}catch(error){
 report.status='FAIL';report.stage=stage;report.errorCode=/^[A-Z0-9_]{3,80}$/.test(error.code??'')?error.code:'MIGRATION_FAILED';
 // SQL parse position is safe and identifies the approved source; never print
 // PostgreSQL query/detail/context which can contain bound private credentials.
 if(/^\d{1,8}$/.test(error.position??''))report.sqlPosition=error.position;
 if(/^(QA_|MIGRATION_|WRITER_)[A-Z0-9_]{1,80}$/.test(error.message??''))report.fixedFailure=error.message;
 await writeFile('/run/qa-results/migration.json',JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));process.exitCode=1;
}
