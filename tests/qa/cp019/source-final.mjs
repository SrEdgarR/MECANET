// Private source closure and capture. Passive imports; every database command
// is measured. A trusted host observation is required before effects.
import {readFile,lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPgPool,createTenantPoolManager,createSecretResolver} from '../../../server/saas/db/pools.js';
import {createRecoveryRuntime} from '../../../server/saas/recovery/runtime.js';
import {createRestrictiveCoordinator} from '../../../server/saas/writes/coordinator.js';
import {canonical,sha256} from '../../../server/saas/recovery/protocol.js';
import {createRecoveryControl} from './control.mjs';
import {validateSourceInputs,makeSourceRuntimeFixture} from './source-driver.mjs';
import {measuredPool} from './ledger.mjs';
import {sourceSnapshotSql} from './sql-probe.mjs';
import {readPrivateJson} from './prepare.mjs';
import {readSourceConfigPrivate} from './source-config.mjs';
import {publishSourceReadonly} from './source-driver.mjs';
import {openStageJournal} from '../../../server/saas/recovery/stage-journal.js';
import {newLedger} from './ledger.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const same=(a,b)=>canonical(a)===canonical(b),refuse=(ok,label)=>{if(!ok)throw Error(label)};
export const FINAL_PHASES=Object.freeze(['source-close-admission','source-close-restore','source-capture','source-closed-canary']);
export function validateFinalObservation(observation,input,phase){
 refuse(FINAL_PHASES.includes(phase)&&observation&&same(observation.resource,input.resource)&&Array.isArray(observation.runtimeConsumers),'SOURCE_FINAL_RESOURCE_WITNESS');
 const c=input.material.source;
 refuse(observation.runtimeConsumers.length===4&&new Set(observation.runtimeConsumers.map(p=>p.containerId)).size===4&&same(observation.runtimeConsumers.map(p=>p.service).sort(),['api1','api2','web','worker'])&&observation.runtimeConsumers.every(p=>typeof p.running==='boolean'&&/^[0-9a-f]{64}$/.test(p.containerId??'')&&p.ownerId===(p.service==='worker'?c.workerClockOwner:p.service==='web'?c.webOwner:c.apiOwners[p.service])),'SOURCE_FINAL_CONSUMER_IDENTITY');
 if(phase!=='source-close-admission')refuse(observation.runtimeConsumers.every(c=>c.running===false),'SOURCE_FINAL_CONSUMERS_RUNNING');
 return observation;
}
export function createSourceFinalDriver({input,ledger,journal,observeResources,poolFactory=createPgPool,now=()=>performance.now()}){
 validateSourceInputs(input);
 refuse(ledger?.charge&&ledger?.enter&&journal?.before&&journal?.after&&typeof observeResources==='function'&&typeof poolFactory==='function','SOURCE_FINAL_DEPENDENCIES');
 const {material,normalManifest,normalManifestHash,custodyHash,resource,sourceCommit}=input,source=material.source;
 const fixture=makeSourceRuntimeFixture(input),pools=new Map();let active=null;
 const bound=()=>refuse(active&&now()-active.started>=0&&now()-active.started<45000,'SOURCE_FINAL_DEADLINE');
 const measured=raw=>measuredPool(raw,{charge:async kind=>{bound();await ledger.charge(kind);bound()}});
 async function pool(scope='central',role='qa_bootstrap'){
  const key=scope+':'+role;if(pools.has(key))return pools.get(key);
  if(role==='qa_bootstrap')for(const[k,p]of pools)if(k.endsWith(':qa_bootstrap')){await p.end();pools.delete(k)}
  const ca=fixture.connections.saas_api.ssl.ca,database=scope==='central'?'mecanet_control':scope==='a'?'mecanet_tenant_a':'mecanet_tenant_b';
  const p=measured(await poolFactory({host:'postgres',port:5432,database,user:role,password:source.rolePasswords[role],ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:2000,statement_timeout:1000,lock_timeout:300,idle_in_transaction_session_timeout:1000,application_name:'cp019-final:'+material.controllerOwner}));pools.set(key,p);return p;
 }
 async function query(scope,text,values=[]){return(await(await pool(scope)).query({text,values,query_timeout:1000})).rows}
 async function one(scope,text,values=[]){const rows=await query(scope,text,values);refuse(rows.length===1,'SOURCE_FINAL_ROWSET');return rows[0]}
 async function witness(phase){
  const observed=validateFinalObservation(await observeResources({phase,resource}),input,phase);
  const facts=await one('central',"SELECT (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,host(inet_server_addr()) AS ip,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,current_setting('server_version_num') AS version");
  refuse(same(facts,{system_identifier:resource.systemIdentifier,ip:resource.networkIP,tls:true,version:'180006'}),'SOURCE_FINAL_CLUSTER');
  const run=await one('central','SELECT id,mode,stage,version,manifest_hash,target_generation,global_blocked FROM saas.recovery_runs WHERE id=$1::uuid',[normalManifest.runId]);
  refuse(run.id===normalManifest.runId&&run.mode==='NORMAL'&&run.stage==='COMPLETE'&&run.version==='4'&&run.manifest_hash===normalManifestHash&&run.target_generation===source.generation&&typeof run.global_blocked==='boolean'&&(phase==='source-close-admission'||run.global_blocked),'SOURCE_FINAL_NORMAL_STATE');
  const state=await one('central',"SELECT f.barrier,(SELECT count(*)::int FROM saas.tickets WHERE state IN('ACTIVE','WAITING','UNCERTAIN')) AS tickets,(SELECT count(*)::int FROM saas.write_growth_reservations WHERE status<>'SETTLED') AS debts,(SELECT count(*)::int FROM saas.write_intents WHERE status IN('PENDING','EXECUTING','UNKNOWN')) AS uncertain,(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND (usename LIKE 'saas_%' OR usename='qa_bootstrap')) AS consumers FROM saas.admission_fence f WHERE f.id=1");
  refuse(state.barrier===run.global_blocked&&state.tickets===0&&state.debts===0&&state.uncertain===0,'SOURCE_FINAL_DEBT');if(phase!=='source-close-admission')refuse(state.consumers===0,'SOURCE_FINAL_SQL_CONSUMERS');
  return{schema:'source-final-proof-v1',phase,runId:normalManifest.runId,generation:source.generation,resourceHash:sha256(resource),custodyHash,normalManifestHash,sourceCommit,observed,run,state};
 }
 async function control(proof,coordinator){const hash=sha256(proof);return createRecoveryControl({side:'source',material,anchors:{custodyHash,manifestHash:normalManifestHash,sourceResourceHash:sha256(resource),targetResourceHash:sha256(resource)},pools:{control:{query:async args=>(await pool()).query(args)},tenants:{[A]:{query:async args=>(await pool('a')).query(args)},[B]:{query:async args=>(await pool('b')).query(args)}}},journal,coordinator,onCommand:async()=>{},verifyStageProof:async({hash:expected,binding})=>{refuse(expected===hash&&binding.runId===normalManifest.runId,'SOURCE_FINAL_PROOF_BINDING');return{hash,recoveryId:normalManifest.runId,generation:source.generation,resourceHash:sha256(resource)}}});}
 async function closeRestore(proof){
  const central=await pool('central','saas_writer_maintenance');
  const recovery=createRecoveryRuntime({controlPool:central,generation:source.generation,expectedRunId:normalManifest.runId,manifestHash:normalManifestHash,mode:'NORMAL'});
  const manager=createTenantPoolManager({resolveSecret:createSecretResolver({entries:fixture.maintenanceEntries,access:'maintenance'}),access:'write',allowedSchemaVersions:[3],maxPools:1,maxPerPool:1,recovery,recoveryAccess:'maintenance',createPool:async c=>measured(await poolFactory({...c,max:1,application_name:'cp019-final-closure:'+material.controllerOwner}))});
  const coordinator=createRestrictiveCoordinator({controlPool:central,maintenancePools:manager,generation:source.generation,recovery,resolveDescriptor:async guard=>{const e=Object.values(fixture.maintenanceEntries).find(e=>e.tenantId===guard.tenant_id);refuse(e&&e.dataEpoch===String(guard.data_epoch),'SOURCE_FINAL_DESCRIPTOR');return e}});
  try{return await(await control(proof,coordinator)).closeSource({reason:'RESTORE',tenantId:A,operationKey:'source-close-restore',proofHash:sha256(proof)})}
  finally{await manager.close();await central.end();pools.delete('central:saas_writer_maintenance')}
 }
 async function capture(){
  const guards=[],fingerprints={},localImages={};
  const centralRows=await query('central',"SELECT w.tenant_id,w.generation,w.data_epoch::text,w.writer_version::text,w.state,w.reserved_bytes::text,w.reserved_products::text,d.schema_version FROM saas.tenant_writer_state w JOIN saas.tenant_directory d ON d.id=w.tenant_id ORDER BY w.tenant_id");
  refuse(same(centralRows.map(r=>r.tenant_id),[A,B])&&centralRows.every(r=>r.generation===source.generation&&r.data_epoch==='2'&&r.writer_version==='2'&&r.state==='CLOSED'&&r.reserved_bytes==='0'&&r.reserved_products==='0'&&r.schema_version===3),'SOURCE_FINAL_FENCES');
  const clock=await one('central','SELECT t.owner,f.generation,f.clock_version::text AS "clockVersion",f.tick::text FROM saas.admission_fence f JOIN saas.time_authority t USING(id) WHERE f.id=1');
  refuse(clock.owner===source.workerClockOwner&&clock.generation===source.generation,'SOURCE_FINAL_CLOCK');
  const verifierRows=await query('central',"SELECT rolname AS role,encode(sha256(convert_to(rolpassword,'UTF8')),'hex') AS hash FROM pg_authid WHERE rolname LIKE 'saas_%' AND rolcanlogin OR rolname='qa_bootstrap' ORDER BY rolname");
  refuse(verifierRows.length===18&&verifierRows.every(r=>/^[0-9a-f]{64}$/.test(r.hash)),'SOURCE_FINAL_VERIFIERS');
  const identity=await one('central','SELECT id,status,security_version::text FROM saas.identities WHERE id=$1::uuid',['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2']);refuse(identity.status==='active'&&identity.security_version==='1','SOURCE_FINAL_CANARY_IDENTITY');
  fingerprints.central=(await one('central',sourceSnapshotSql('mecanet_control'))).hash;
  for(const[scope,id]of [['a',A],['b',B]]){
   const local=await one(scope,"SELECT to_jsonb(f) AS fence,to_jsonb(g)||jsonb_build_object('version',g.version::text,'source_epoch',g.source_epoch::text,'target_epoch',g.target_epoch::text,'closed_version',g.closed_version::text,'open_version',g.open_version::text,'abort_version',g.abort_version::text) AS recovery,q.logical_bytes::text,inventory.logical_usage()::text AS actual,q.active_products::text,q.max_products::text,q.max_logical_bytes::text FROM inventory.writer_fence f JOIN inventory.recovery_guard g USING(id) JOIN inventory.quota_state q USING(id)");
   refuse(local.fence.tenant_id===id&&local.fence.generation===source.generation&&String(local.fence.data_epoch)==='2'&&String(local.fence.writer_version)==='2'&&local.fence.state==='CLOSED'&&local.logical_bytes===local.actual,'SOURCE_FINAL_LOCAL_FENCE');
   if(id===A)refuse(local.active_products==='4'&&BigInt(local.max_products)-4n>=8n&&BigInt(local.logical_bytes)<=1048576n&&BigInt(local.max_logical_bytes)-BigInt(local.logical_bytes)>=8n*32768n,'SOURCE_FINAL_MARGIN');
   guards.push({tenantId:id,generation:source.generation,dataEpoch:'2',writerVersion:'2',state:'CLOSED',guardHash:sha256(local.fence)});
   localImages[id]=local.recovery;
   fingerprints[id]=(await one(scope,sourceSnapshotSql('mecanet_tenant_'+scope))).hash;
  }
  return{schema:'source-capture-v1',runId:normalManifest.runId,custodyHash,normalManifestHash,resourceHash:sha256(resource),sourceCommit,sourceGuardSnapshots:guards,sourceFingerprints:fingerprints,sourceLocalImages:localImages,sourceClock:clock,roleVerifierHashes:Object.fromEntries(verifierRows.map(r=>[r.role,r.hash])),canarySecurityVersion:identity.security_version};
 }
 async function run(phase,{plan,planHash}={}){
  refuse(FINAL_PHASES.includes(phase)&&!active,'SOURCE_FINAL_PHASE');active={phase,started:now()};
  try{await ledger.enter(phase);const proof=await witness(phase);
   if(phase==='source-capture'){const result=await capture();bound();return result}
   refuse(plan&&sha256(plan)===planHash&&plan.phase===phase&&plan.runId===normalManifest.runId&&plan.custodyHash===custodyHash&&plan.normalManifestHash===normalManifestHash&&plan.resourceHash===sha256(resource),'SOURCE_FINAL_PLAN');
   const chosen=plan.proof;refuse(chosen?.phase===phase&&chosen.runId===proof.runId&&chosen.resourceHash===proof.resourceHash&&chosen.custodyHash===proof.custodyHash,'SOURCE_FINAL_PLAN_PROOF');
   refuse(chosen.normalManifestHash===normalManifestHash&&chosen.sourceCommit===sourceCommit&&chosen.generation===source.generation&&chosen.run?.id===normalManifest.runId&&chosen.run.mode==='NORMAL'&&chosen.run.stage==='COMPLETE'&&chosen.run.version==='4'&&chosen.run.manifest_hash===normalManifestHash&&chosen.run.target_generation===source.generation&&chosen.run.global_blocked===(phase!=='source-close-admission')&&chosen.state?.barrier===chosen.run.global_blocked&&chosen.state.tickets===0&&chosen.state.debts===0&&chosen.state.uncertain===0,'SOURCE_FINAL_PLAN_PROOF');
   validateFinalObservation(chosen.observed,input,phase);
   let result;if(phase==='source-close-admission')result=await(await control(chosen)).closeAdmission({operationKey:'source-close-admission',proofHash:sha256(chosen),expected:{stage:'COMPLETE',version:'4',global_blocked:false},after:{stage:'COMPLETE',version:'4',global_blocked:true}});
   else if(phase==='source-close-restore')result=await closeRestore(chosen);
   else result=await(await control(chosen)).replayCanary({operationKey:'source-closed-canary',identityId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',expectedSecurityVersion:'1',eventId:source.operationIds.postcopyCanary,proofHash:sha256(chosen)});
   const {reconciled,...outcome}=result;bound();return{schema:'source-final-receipt-v1',phase,planHash,resultHash:sha256(outcome),sourceCommit,runId:normalManifest.runId,physicalRecovery:'NOT VERIFIED'};
  }finally{active=null}
 }
 async function selectPlan(phase){refuse(FINAL_PHASES.includes(phase)&&phase!=='source-capture'&&!active,'SOURCE_FINAL_PHASE');active={phase,started:now()};try{await ledger.enter(phase);const proof=await witness(phase);if(phase==='source-close-admission')refuse(proof.run.global_blocked===false,'SOURCE_FINAL_PLAN_ALREADY_APPLIED');bound();return{schema:'source-final-plan-v1',phase,proof,runId:normalManifest.runId,custodyHash,normalManifestHash,resourceHash:sha256(resource)}}finally{active=null}}
 return Object.freeze({selectPlan,run,async close(){for(const p of pools.values())await p.end();pools.clear()}});
}

async function readFinalPrivate(path){
 const paths=new Set(['/run/qa-secrets/source-final.json',...FINAL_PHASES.map(p=>'/run/qa-secrets/'+p+'.json'),...FINAL_PHASES.map(p=>(p==='source-capture'?'/run/qa-secrets/':'/run/qa-results/')+p+'-result.json')]);refuse(paths.has(path),'SOURCE_FINAL_PRIVATE_PATH');
 const before=await lstat(path);refuse(before.isFile()&&!before.isSymbolicLink()&&(before.mode&0o777)===0o400&&before.uid===process.getuid()&&before.size<=262144,'SOURCE_FINAL_PRIVATE_FILE');
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();refuse(s.ino===before.ino&&s.dev===before.dev&&s.size===before.size,'SOURCE_FINAL_PRIVATE_CHANGED');const bytes=await h.readFile();return{value:JSON.parse(bytes),hash:sha256(bytes)}}finally{await h.close()}
}
export async function main(){
 const cfg=(await readFinalPrivate('/run/qa-secrets/source-final.json')).value;
 refuse(process.argv.length===2&&process.env.QA_PROJECT==='mecanet-qa-p1l3-r03'&&FINAL_PHASES.includes(cfg.phase)&&['atomic','run','capture'].includes(cfg.action)&&cfg.invocationId===process.env.QA_INVOCATION_ID,'SOURCE_FINAL_CLI');
 const {value:material,sha256:custodyHash}=await readPrivateJson('/run/qa-secrets/material.json');
 const foundation=(await readPrivateJson('/run/qa-secrets/source-foundation.json')).value,writers=(await readPrivateJson('/run/qa-secrets/source-writers.json')).value,correctives=(await readPrivateJson('/run/qa-secrets/source-correctives.json')).value,normalManifest=(await readSourceConfigPrivate('/run/qa-secrets/source-normal-manifest.json')).value;
 const sourceCommit=process.env.QA_CODE_SHA,input={material,custodyHash,foundation,writers,correctives,normalManifest,normalManifestHash:sha256(normalManifest),sourceCommit,resource:cfg.resource};
 const receipt=cfg.hostReceipt;
 refuse(receipt?.schema==='source-final-host-v1'&&sha256(receipt)===cfg.hostReceiptHash&&receipt.invocationId===cfg.invocationId&&receipt.controllerOwner===material.controllerOwner&&receipt.phase===cfg.phase&&receipt.custodyHash===custodyHash&&receipt.normalManifestHash===input.normalManifestHash&&receipt.producerSha===sourceCommit&&receipt.resourceHash===sha256(cfg.resource),'SOURCE_FINAL_HOST_BINDING');
 const observeResources=async()=>{const elapsed=Date.now()-Date.parse(receipt.observedAt);refuse(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<=5000,'SOURCE_FINAL_HOST_STALE');return validateFinalObservation(receipt.observedResources,input,cfg.phase)};
 await observeResources();const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:'source-window'});
 const journal=await openStageJournal({file:'/run/qa-journal/source.jsonl',heads:'/run/qa-journal/heads',plans:'/run/qa-journal/plans',create:false,recoveryId:material.source.normal.runId,controllerOwner:material.controllerOwner,resourceHash:sha256(cfg.resource),operationIds:material.stageOperationIds,charge:(kind,n)=>ledger.charge(kind,n)});
 const driver=createSourceFinalDriver({input,ledger,journal,observeResources});
 try{
  let result;if(cfg.phase==='source-capture'){refuse(cfg.action==='capture','SOURCE_FINAL_CAPTURE_MODE');result=await driver.run(cfg.phase)}
  else{
   const path='/run/qa-secrets/'+cfg.phase+'.json';let saved;
   try{saved=await readFinalPrivate(path)}catch(error){if(error.code!=='ENOENT')throw error}
   if(!saved){refuse(cfg.action==='atomic','SOURCE_FINAL_PLAN_REQUIRED');const plan=await driver.selectPlan(cfg.phase);await ledger.charge('artifactFiles');await publishSourceReadonly(path,plan);saved=await readFinalPrivate(path)}
   result=await driver.run(cfg.phase,{plan:saved.value,planHash:saved.hash});
  }
  const output=(cfg.phase==='source-capture'?'/run/qa-secrets/':'/run/qa-results/')+cfg.phase+'-result.json';let old;
  try{old=await readFinalPrivate(output)}catch(error){if(error.code!=='ENOENT')throw error}
  if(old)refuse(same(old.value,result),'SOURCE_FINAL_RESULT_CONFLICT');else{await ledger.charge('artifactFiles');await publishSourceReadonly(output,result)}
  console.log(JSON.stringify({type:'cp019-source-final',phase:cfg.phase,status:'PASS',resultHash:sha256(result),secretsPrinted:false,physicalRecovery:'NOT VERIFIED'}));
 }finally{await driver.close();await journal.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({type:'cp019-source-final-failed',code:'SOURCE_FINAL_FAILED',secretsPrinted:false}));process.exitCode=1});
