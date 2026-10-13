// Private compatible-release rollback observation. No writer promotion or DML.
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createQaClient,assertStatus} from '../cp014/http-client.mjs';
import {withQaInspection,sanitizeSqlFailure} from './sql-live.mjs';
const PROJECT='mecanet-qa-p1l2-cp017',A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function compatibleWriterRelease(current,target){
 for(const prefix of ['server/saas/db/migrations/']){
  const expected=current.entries.filter(e=>e.path.startsWith(prefix));
  const names=['001-control.sql','002-tenant.sql','003-control-writers.sql','003-tenant-writers.sql','004-tenant-writers-fix.sql','005-control-claim-ticket.sql'];
  if(expected.length!==names.length||names.some(name=>!expected.some(e=>e.path===prefix+name)))throw Error('ROLLBACK_CURRENT_SCHEMA_UNPROVEN');
  if(target.entries.filter(e=>e.path.startsWith(prefix)).length!==names.length)throw Error('ROLLBACK_SCHEMA_INCOMPATIBLE');
  for(const entry of expected)if(!target.entries.some(e=>e.path===entry.path&&e.sha256===entry.sha256))throw Error('ROLLBACK_SCHEMA_INCOMPATIBLE');
 }
 assert.match(current.codeSha,/^[a-f0-9]{40}$/);assert.match(target.codeSha,/^[a-f0-9]{40}$/);
 return {schemaVersion:2,currentSourceSha:current.codeSha,targetSourceSha:target.codeSha};
}
export function validateRollbackRuntimeProof(proof,{generation,controllerSourceSha}){
 if(proof?.project!==PROJECT||proof.generation!==generation||proof.controllerSourceSha!==controllerSourceSha||proof.schemaCompatible!==true||!/^sha256:[a-f0-9]{64}$/.test(proof.runtimeDigest??'')||!/^[a-f0-9]{40}$/.test(proof.runtimeSourceSha??'')||!Array.isArray(proof.apis)||proof.apis.length!==2||new Set(proof.apis.map(a=>a.instance)).size!==2||new Set(proof.apis.map(a=>a.containerId)).size!==2||proof.apis.some(a=>!['api1','api2'].includes(a.instance)||a.sourceSha!==proof.runtimeSourceSha||a.running!==true||!/^[a-f0-9]{64}$/.test(a.containerId??'')))throw Error('ROLLBACK_ACTUAL_RUNTIME_UNPROVEN');return proof;
}
async function snapshot(qa){
 const state={};
 for(const [database,tables] of [['mecanet_control',['write_intents','write_growth_reservations','write_projections','write_transitions','write_restriction_tenants','tenant_writer_state','write_control_quota']],['mecanet_tenant_a',['products','balances','movements','operations','audit','quota_state','writer_fence']],['mecanet_tenant_b',['products','balances','movements','operations','audit','quota_state','writer_fence']]]){
  state[database]=await withQaInspection(qa,database,async p=>{
   const rows={};for(const table of tables){const schema=database==='mecanet_control'?'saas':table==='products'?'catalog':'inventory';rows[table]=digest((await p.query(`SELECT to_jsonb(x)::text AS exact FROM ${schema}.${table} x ORDER BY to_jsonb(x)::text`)).rows)}return rows;
  });
 }
 const fences=await withQaInspection(qa,'mecanet_control',async p=>(await p.query('SELECT tenant_id,generation,data_epoch,writer_version,state FROM saas.tenant_writer_state ORDER BY tenant_id')).rows);
 assert.deepEqual(fences.map(f=>f.tenant_id),[A,B]);assert(fences.every(f=>f.state==='CLOSED'&&f.generation===qa.generation));
 return {state,fences};
}
export const ROLLBACK_PLAN={project:PROJECT,stages:['capture','rollback','forward'],schemaVersion:2,sourceBeforeTarget:true,ownStoppedProcessesRequired:true,closedWriters:true,readOnlyBusiness:true,httpPerClient:32,compatibleMigrations:'all registered migration hashes must match',sharedResourcesChanged:false};
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const stage=process.argv[2],report={status:'FAIL',sourceSha:process.env.QA_CODE_SHA,stage,plan:ROLLBACK_PLAN,secretsPrinted:false,observedAt:new Date().toISOString()};
 try{
  assert.equal(process.env.QA_PROJECT,PROJECT);assert(ROLLBACK_PLAN.stages.includes(stage));
  await writeFile(`/run/qa-results/rollback-${stage}-plan.json`,JSON.stringify(report),{mode:0o600});
  const proofFile='/run/qa-results/rollback-runtime-proof.json',info=await stat(proofFile);assert(info.isFile()&&(info.mode&0o222)===0);
  const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8')),proof=validateRollbackRuntimeProof(JSON.parse(await readFile(proofFile,'utf8')),{generation:qa.generation,controllerSourceSha:report.sourceSha});assert.equal(qa.project,PROJECT);
  report.runtimeSourceSha=proof.runtimeSourceSha;report.runtimeDigest=proof.runtimeDigest;
  const before=await snapshot(qa),ca=await readFile('/run/qa-ca.crt'),login=JSON.parse(await readFile('/run/qa-secrets/fixture-login.json','utf8'));
  const actor=createQaClient({instance:'api1',purpose:'company',ca,login:{email:'a@qa.invalid',password:login.password},budget:32});
  const privatePath='/run/qa-journal/rollback-private.json';let preserved;
  if(stage==='capture'){
   await actor.login();const known=await withQaInspection(qa,'mecanet_control',async p=>(await p.query("SELECT operation_id,request_hash FROM saas.write_intents WHERE tenant_id=$1 AND actor_id=$2 AND status='CONFIRMED' ORDER BY created_at LIMIT 1",[A,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'])).rows[0]);assert(known);
   const result=await withQaInspection(qa,'mecanet_tenant_a',async p=>(await p.query('SELECT result FROM inventory.operations WHERE id=$1',[known.operation_id])).rows[0]);assert(result);
   preserved={generation:qa.generation,snapshot:before,cookie:actor.cookieHeader(),csrf:actor.csrf,known,result,sourceSha:proof.runtimeSourceSha};await writeFile(privatePath,JSON.stringify(preserved),{mode:0o600});
  }else{
   preserved=JSON.parse(await readFile(privatePath,'utf8'));assert.equal(preserved.generation,qa.generation);assert.deepEqual(before,preserved.snapshot);actor.setCookies(preserved.cookie);actor.csrf=preserved.csrf;
   const result=await withQaInspection(qa,'mecanet_tenant_a',async p=>(await p.query('SELECT result FROM inventory.operations WHERE id=$1',[preserved.known.operation_id])).rows[0]);assert.deepEqual(result,preserved.result);
  }
  for(const instance of ['api1','api2']){
   const client=createQaClient({instance,ca,budget:8});assertStatus(await client.request('/api/health/live'),200);assertStatus(await client.request('/api/health/ready'),503);
  }
  const inventory=await actor.request(`/api/tenants/${A}/inventory?limit=2`);assertStatus(inventory,403);assert.equal(inventory.json.error,'ACCESS_DENIED');assert.deepEqual(await snapshot(qa),before);
  report.status='PASS FOR COMPATIBLE CLOSED ROLLBACK ONLY';report.businessAndOriginalGuardsUnchanged=true;report.oldKnownResultUnchanged=true;report.closedBarrierDeniesOrdinaryRead=true;report.bothLiveAndWritersNotReady=true;report.snapshotDigest=digest(before);report.publicLaunch=false;
 }catch(error){Object.assign(report,sanitizeSqlFailure(error));if(/^ROLLBACK_[A-Z_]{1,60}$/.test(error.message??''))report.fixedFailure=error.message;process.exitCode=1}
 await writeFile(`/run/qa-results/rollback-${stage}.json`,JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
}
