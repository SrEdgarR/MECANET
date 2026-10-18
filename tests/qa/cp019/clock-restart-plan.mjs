import {CASE_LIMITS,GLOBAL_LIMITS} from './budget-limits.mjs';
// Private deterministic extension. No SQL, I/O, randomness or current-version
// adoption. The original target plan and master remain immutable.
import {canonical,sha256,verifyEndProof,validateStageRecords} from '../../../server/saas/recovery/protocol.js';
import {validateMaterial} from '../../../server/saas/recovery/custody.js';
import {validateClockAddition,createRecoveryControl} from './control.mjs';
import {measuredPool} from './ledger.mjs';
const HASH=/^[0-9a-f]{64}$/,A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const refuse=(ok,label='CLOCK_RESTART_PLAN_BINDING')=>{if(!ok)throw Error(label)},clone=x=>JSON.parse(canonical(x)),same=(a,b)=>canonical(a)===canonical(b);
function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x)}return x}
const tuple=t=>({transfer_id:t.transferId,previous_clock_owner:t.previousOwner,next_clock_owner:t.nextOwner,expected_clock_version:t.expectedClockVersion,expected_clock_tick:t.expectedTick,clock_transfer_hash:t.transferHash,clock_end_proof_hash:t.endProofHash});
const abortKeys=['target-close-abort','target-begin-abort','target-abort-a','target-proof-abort-a','target-abort-b','target-proof-abort-b','target-finish-abort'];
export const CLOCK_RESTART_PHASES=Object.freeze(['clock-restart-plan','clock-restart-record']);
/** Parent plan validity is checked by createTargetDriver before this extension
 * can execute. This factory additionally fixes every affected parent shape,
 * bindings and prior activation/unused IDs from an external journal head. */
export function makeClockRestartPlan({material,anchors,parentPlan,parentPlanHash,addition,additionHash,workerEndProof,observedWorkerEnd,targetJournalRecords,targetJournalCheckpoint}={}){
 const m=validateMaterial(material),p=clone(parentPlan),a=clone(addition);
 refuse(HASH.test(parentPlanHash??'')&&sha256(p)===parentPlanHash&&p.schema==='target-driver-plan-v1'&&p.recoveryId===m.recoveryId&&p.generation===m.target.generation&&p.custodyHash===sha256(m)&&p.manifestHash===anchors?.manifestHash&&p.resourceHash===anchors.targetResourceHash,'CLOCK_RESTART_PARENT');
 validateClockAddition({addition:a,additionHash,workerEndProof,material:m,anchors,side:'target'});
 refuse(a.previousOwner===m.target.workerClockOwner&&verifyEndProof(workerEndProof,observedWorkerEnd,{profile:'worker'})===a.endProofHash,'CLOCK_RESTART_WORKER_END');
 const activation=p.phases?.activation?.steps,initial=p.phases?.['clock-plan']?.steps?.[0]?.args?.transfer,initialRecord=p.phases?.['post-worker-verify']?.steps?.[0]?.args;
 refuse(activation?.length===1&&activation[0].method==='activate'&&activation[0].args.operationKey==='target-activate'&&same(activation[0].args.expected,{stage:'PROMOTING',version:'6',global_blocked:true})&&same(activation[0].args.after,{stage:'COMPLETE',version:'7',global_blocked:false})&&HASH.test(activation[0].args.proofHash??''),'CLOCK_RESTART_PARENT_STAGE');
 refuse(initial?.previousOwner===m.target.seedClockOwner&&initial.nextOwner===a.previousOwner&&initial.transferId===m.target.operationIds.clockTransfer&&initial.generation===m.target.generation&&initial.runId===m.recoveryId&&initial.manifestHash===anchors.manifestHash&&HASH.test(initialRecord?.proofHash??''),'CLOCK_RESTART_PARENT_CLOCK');
 const journal=clone(targetJournalRecords),validated=validateStageRecords(journal,targetJournalCheckpoint);refuse(validated.pending.length===0,'CLOCK_RESTART_JOURNAL_PENDING');
 const activationIntent=journal.find(r=>r.kind==='intent'&&r.operationId===m.stageOperationIds['target-activate']),activationObserved=journal.find(r=>r.kind==='observed'&&r.operationId===m.stageOperationIds['target-activate']);
 refuse(activationIntent?.stage==='activate'&&activationIntent.recoveryId===m.recoveryId&&activationObserved?.endProofHash===activation[0].args.proofHash,'CLOCK_RESTART_ACTIVATION_NOT_PROVEN');
 const runBase={id:m.recoveryId,controller_owner:m.controllerOwner,mode:'RECOVERY',source_generation:m.source.generation,target_generation:m.target.generation,manifest_hash:anchors.manifestHash,custody_hash:anchors.custodyHash,journal_hash:p.journalHeadHash,source_end_proof_hash:p.sourceEndProofHash,source_resource_hash:anchors.sourceResourceHash,target_resource_hash:anchors.targetResourceHash,expected_tenants:[A,B],restore_restriction_ids:[m.source.operationIds.restore],seed_clock_owner:m.target.seedClockOwner,initial_worker_owner:m.target.workerClockOwner};
 const runBinding={runId:m.recoveryId,controller:m.controllerOwner,generation:m.target.generation,mode:'RECOVERY',manifestHash:anchors.manifestHash},activationTarget={binding:runBinding,kind:'run',tenantId:null,functionName:'saas.activate_recovery',valuesHash:sha256([m.recoveryId,m.controllerOwner,'6',activation[0].args.proofHash])};
 refuse(activationIntent.expectedHash===sha256({...runBase,...activation[0].args.expected})&&activationIntent.afterHash===sha256({...runBase,...activation[0].args.after,activation_proof_hash:activation[0].args.proofHash})&&activationIntent.targetHash===sha256(activationTarget),'CLOCK_RESTART_ACTIVATION_NOT_PROVEN');
 const unused=[...abortKeys.map(k=>m.stageOperationIds[k]),a.operationIds.prepare,a.operationIds.record];refuse(journal.every(r=>!unused.includes(r.operationId)),'CLOCK_RESTART_IDS_ALREADY_USED');
 const binding={parentPlanHash,additionHash,workerEndProofHash:a.endProofHash,recoveryId:m.recoveryId,generation:m.target.generation,manifestHash:anchors.manifestHash,custodyHash:anchors.custodyHash,resourceHash:anchors.targetResourceHash};
 const proof=(stage,operationId)=>sha256({...binding,stage,operationId});
 const transfer={kind:'stopped-process',mode:'RECOVERY',generation:m.target.generation,runId:m.recoveryId,manifestHash:anchors.manifestHash,previousOwner:a.previousOwner,nextOwner:a.nextOwner,transferId:a.transferId,transferHash:a.transferHash,endProofHash:a.endProofHash,expectedClockVersion:a.expectedClockVersion,expectedTick:a.expectedTick,confirmed:true,reference:'custodied-'+additionHash,containerId:workerEndProof.processes[0].containerId,observedState:'exited',stoppedAt:workerEndProof.processes[0].finishedAt,sqlOwnerAbsent:true};
 const before={...activation[0].args.after,...tuple(initial),current_clock_owner:a.previousOwner,clock_proof_hash:initialRecord.proofHash};
 const prepared={...before,version:'8',...tuple(transfer)},recorded={...prepared,version:'9',current_clock_owner:a.nextOwner,clock_proof_hash:proof('clock-record',a.operationIds.record)};
 const restart={prepare:{caseName:'target-clock-restart-plan',method:'prepareClock',args:{operationKey:'prepare',expected:before,after:prepared,proofHash:proof('transfer-clock',a.operationIds.prepare),transfer}},record:{caseName:'target-clock-restart-record',method:'recordClock',args:{operationKey:'record',expected:prepared,after:recorded,proofHash:recorded.clock_proof_hash,transfer}}};
 const abortPhases=Object.fromEntries(['abort-close','abort-local','abort-finish'].map(name=>[name,clone(p.phases[name])]));
 const close=abortPhases['abort-close'];refuse(close.closure==='FROM_COMPLETE'&&close.steps?.length===2&&close.steps[0].method==='closeAdmission'&&close.steps[0].args.operationKey===abortKeys[0]&&close.steps[1].method==='abortBegin'&&close.steps[1].args.operationKey===abortKeys[1]&&same(close.steps[0].args.expected,activation[0].args.after)&&same(close.steps[0].args.after,{stage:'COMPLETE',version:'7',global_blocked:true})&&same(close.steps[1].args.expected,close.steps[0].args.after)&&same(close.steps[1].args.after,{stage:'ABORTING',version:'8',global_blocked:true}),'CLOCK_RESTART_PARENT_ABORT');
 const local=abortPhases['abort-local'];refuse(local.steps?.length===4&&same(local.steps.map(s=>[s.method,s.tenantId,s.args.operationKey]),[['abortTenant',A,abortKeys[2]],['recordTenantProof',A,abortKeys[3]],['abortTenant',B,abortKeys[4]],['recordTenantProof',B,abortKeys[5]]])&&local.steps[1].args.expectedRunVersion==='8'&&local.steps[3].args.expectedRunVersion==='8','CLOCK_RESTART_PARENT_ABORT');
 const finish=abortPhases['abort-finish'];refuse(finish.steps?.length===1&&finish.steps[0].method==='abortComplete'&&finish.steps[0].args.operationKey===abortKeys[6]&&same(finish.steps[0].args.expected,{stage:'ABORTING',version:'8',global_blocked:true})&&same(finish.steps[0].args.after,{stage:'ABORTED_CLOSED',version:'9',global_blocked:true}),'CLOCK_RESTART_PARENT_ABORT');
 close.steps[0].args.expected=clone(recorded);close.steps[0].args.after={...clone(recorded),global_blocked:true};close.steps[1].args.expected=clone(close.steps[0].args.after);close.steps[1].args.after={...clone(close.steps[0].args.after),stage:'ABORTING',version:'10'};
 for(const step of local.steps)if(step.method==='recordTenantProof')step.args.expectedRunVersion='10';
 finish.steps[0].args.expected=clone(close.steps[1].args.after);finish.steps[0].args.after={...clone(close.steps[1].args.after),stage:'ABORTED_CLOSED',version:'11'};
 for(const[name,phase]of Object.entries(abortPhases)){refuse(phase.caseName==='target-'+name,'CLOCK_RESTART_PARENT_ABORT');for(const step of phase.steps)step.args.proofHash=proof(name+':'+step.method,m.stageOperationIds[step.args.operationKey]);phase.proofHash=sha256({...binding,phase:name,stepsHash:sha256(phase.steps)});}
 const value={schema:'recovery-clock-restart-plan-v1',...binding,sourceSha:p.sourceSha,targetJournalCheckpoint:clone(targetJournalCheckpoint),operationIds:{prepare:a.operationIds.prepare,record:a.operationIds.record,abort:Object.fromEntries(abortKeys.map(k=>[k,m.stageOperationIds[k]]))},restart,abortPhases};
 refuse(Buffer.byteLength(canonical(value))<=262144,'CLOCK_RESTART_PLAN_SIZE');return freeze(clone(value));
}
export function validateClockRestartPlan({extension,extensionHash,...input}={}){
 refuse(HASH.test(extensionHash??'')&&sha256(extension)===extensionHash,'CLOCK_RESTART_PLAN_CUSTODY');const expected=makeClockRestartPlan(input);refuse(same(extension,expected),'CLOCK_RESTART_PLAN_TUPLE');return expected;
}
/** Publication occurs before prepare/CAS. Existing immutable material wins on
 * retry; no chooser runs and the original plan remains unchanged. */
export async function custodyClockRestartPlan({extension,extensionHash,publish,readback}={}){
 refuse(extension?.schema==='recovery-clock-restart-plan-v1'&&HASH.test(extensionHash??'')&&sha256(extension)===extensionHash&&typeof publish==='function'&&typeof readback==='function','CLOCK_RESTART_PLAN_CUSTODY');
 const written=await publish(extension,extensionHash);refuse(written?.sha256===extensionHash,'CLOCK_RESTART_PLAN_NOT_DURABLE');const saved=await readback(extensionHash);refuse(saved?.sha256===extensionHash&&same(saved.value,extension),'CLOCK_RESTART_PLAN_NOT_DURABLE');return saved;
}
/** Only the two preregistered clock phases are executable here. The host starts
 * the new custodied worker between them. A proof provider must observe its
 * real acquisition/end; this controller neither starts it nor fakes an ACK. */
export function createClockRestartController({input,proofBundle,pools,ledger,journal,verifyStageProof,controlFactory=createRecoveryControl,now=()=>performance.now()}={}){
 const x=freeze(clone(input)),extension=validateClockRestartPlan(x);
 refuse(ledger?.enter&&ledger?.charge&&ledger?.snapshot&&pools?.control?.query&&[A,B].every(id=>pools.tenants?.[id]?.query)&&journal?.before&&journal?.after&&typeof verifyStageProof==='function','CLOCK_RESTART_PRIVATE_DEPENDENCIES');
 let active=null;const bound=()=>refuse(active&&now()-active.started>=0&&now()-active.started<45000,'CLOCK_RESTART_CASE_LIMIT');
 const client=c=>new Proxy(c,{get(t,k){if(k==='query')return(...args)=>{bound();return t.query(...args)};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}});
 const pool=p=>new Proxy(p,{get(t,k){if(k==='connect')return async()=>{bound();const c=await t.connect();try{bound()}catch(e){c.release(e);throw e}return client(c)};if(k==='query')return(...args)=>{bound();return t.query(...args)};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}});
 const measured={control:measuredPool(pool(pools.control),ledger),tenants:Object.fromEntries([A,B].map(id=>[id,measuredPool(pool(pools.tenants[id]),ledger)]))};
 const control=controlFactory({side:'target',material:x.material,anchors:x.anchors,proofBundle,pools:measured,journal,clockAddition:{addition:x.addition,additionHash:x.additionHash,workerEndProof:x.workerEndProof},verifyStageProof,onCommand:async kind=>{bound();refuse(kind==='sql'&&active.commands<CASE_LIMITS.sql,'CLOCK_RESTART_CASE_LIMIT');active.commands++;}});
 async function run(name){refuse(['prepare','record'].includes(name)&&!active,'CLOCK_RESTART_PHASE');const step=extension.restart[name],started=now();active={started,commands:0};
  try{const before=await ledger.snapshot();refuse(['cp019-budget-v1','cp024-budget-continuation-v2'].includes(before.schema)&&before.project==='mecanet-qa-p1l3-r03'&&before.plannedScopes?.[step.caseName]==='target-window'&&same(before.plannedScenarios?.[step.caseName],{sql:CASE_LIMITS.sql,http:80,journal:1000,artifactFiles:2000})&&Number.isInteger(before.total?.sql)&&before.total.sql<GLOBAL_LIMITS.sql,'CLOCK_RESTART_CASE_NOT_PREREGISTERED');await ledger.enter(step.caseName);bound();const result=await control[step.method](step.args);const after=await ledger.snapshot(),delta=after.total.sql-before.total.sql;bound();refuse(Number.isInteger(delta)&&delta>=0&&delta<=CASE_LIMITS.sql&&after.total.sql<=GLOBAL_LIMITS.sql,'CLOCK_RESTART_CASE_LIMIT');return{status:'PASS',layer:'controller-boundary',phase:name,caseName:step.caseName,parentPlanHash:x.parentPlanHash,clockRestartPlanHash:x.extensionHash,additionHash:x.additionHash,stage:result.stage,version:result.version,reconciled:result.reconciled===true,sqlCommands:delta,physicalRestart:'NOT VERIFIED'};}finally{active=null}
 }
 return Object.freeze({prepare:()=>run('prepare'),record:()=>run('record')});
}
