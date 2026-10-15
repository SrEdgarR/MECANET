// Pure planner/custody contracts. No SQL, restart, end-proof or recovery PASS.
import test from 'node:test';import assert from 'node:assert/strict';
import {chooseMaterial,chooseClockAddition} from '../../../server/saas/recovery/custody.js';
import {canonical,sha256} from '../../../server/saas/recovery/protocol.js';
import {makeClockRestartPlan,validateClockRestartPlan,custodyClockRestartPlan,createClockRestartController} from './clock-restart-plan.mjs';
const H='a'.repeat(64),A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const material=await chooseMaterial({project:'mecanet-qa-p1l3-r03',artifactDigest:H});
function fixture(){
 const m=material,anchors={custodyHash:sha256(m),manifestHash:H,sourceResourceHash:'b'.repeat(64),targetResourceHash:'c'.repeat(64)};
 const transfer={kind:'recovery-initial',mode:'RECOVERY',generation:m.target.generation,runId:m.recoveryId,manifestHash:H,previousOwner:m.target.seedClockOwner,nextOwner:m.target.workerClockOwner,transferId:m.target.operationIds.clockTransfer,transferHash:H,endProofHash:H,expectedClockVersion:'101',expectedTick:'99',confirmed:true,reference:'custodied-'+H};
 const run=(stage,version,global_blocked)=>({stage,version,global_blocked}),step=(method,key,expected,after,tenantId,extra={})=>({method,...(tenantId?{tenantId}:{}),args:{operationKey:key,expected,after,proofHash:H,...extra}});
 const parentPlan={schema:'target-driver-plan-v1',recoveryId:m.recoveryId,generation:m.target.generation,custodyHash:anchors.custodyHash,manifestHash:H,resourceHash:anchors.targetResourceHash,sourceEndProofHash:H,journalHeadHash:H,sourceSha:'b'.repeat(40),phases:{
  activation:{caseName:'target-activation',proofHash:H,steps:[step('activate','target-activate',run('PROMOTING','6',true),run('COMPLETE','7',false))]},
  'clock-plan':{caseName:'target-clock-plan',proofHash:H,steps:[step('prepareClock','target-clock-plan',run('CONFIGURED','2',true),run('CONFIGURED','3',true),null,{transfer})]},
  'post-worker-verify':{caseName:'target-post-worker-verify',proofHash:H,steps:[step('recordClock','target-clock-record',run('CONFIGURED','3',true),run('CLOCK_ACQUIRED','4',true),null,{transfer})]},
  'abort-close':{caseName:'target-abort-close',closure:'FROM_COMPLETE',proofHash:H,steps:[step('closeAdmission','target-close-abort',run('COMPLETE','7',false),run('COMPLETE','7',true)),step('abortBegin','target-begin-abort',run('COMPLETE','7',true),run('ABORTING','8',true))]},
  'abort-local':{caseName:'target-abort-local',proofHash:H,steps:[step('abortTenant','target-abort-a',{stage:'SEALED',version:'6'},{stage:'ABORTED_CLOSED',version:'7'},A),{...step('recordTenantProof','target-proof-abort-a',{stage:'SEALED',version:'6'},{stage:'ABORTED_CLOSED',version:'7'},A,{expectedRunVersion:'8'}),phase:'ABORTED_CLOSED'},step('abortTenant','target-abort-b',{stage:'SEALED',version:'5'},{stage:'ABORTED_CLOSED',version:'6'},B),{...step('recordTenantProof','target-proof-abort-b',{stage:'SEALED',version:'4'},{stage:'ABORTED_CLOSED',version:'5'},B,{expectedRunVersion:'8'}),phase:'ABORTED_CLOSED'}]},
  'abort-finish':{caseName:'target-abort-finish',proofHash:H,steps:[step('abortComplete','target-finish-abort',run('ABORTING','8',true),run('ABORTED_CLOSED','9',true))]}
 }};
 const workerEndProof={schema:'worker-end-v1',recoveryId:m.recoveryId,sourceResourceHash:anchors.targetResourceHash,processes:[{service:'worker',containerId:'d'.repeat(64),ownerId:m.target.workerClockOwner,exitCode:0,finishedAt:'2026-10-14T03:00:00Z'}],sqlOwners:[m.target.workerClockOwner],httpOperationIds:[]},observedWorkerEnd={resourceHash:anchors.targetResourceHash,containers:[{id:'d'.repeat(64),service:'worker',ownerId:m.target.workerClockOwner,running:false,exitCode:0,finishedAt:'2026-10-14T03:00:00Z'}],sqlOwnersPresent:[],httpPending:[]};
 const addition=chooseClockAddition({material:m,side:'target',binding:{runId:m.recoveryId,manifestHash:H,resourceHash:anchors.targetResourceHash},before:{generation:m.target.generation,owner:m.target.workerClockOwner,clockVersion:'130',tick:'127'},endProof:workerEndProof,observedEnd:observedWorkerEnd});
 const base={id:m.recoveryId,controller_owner:m.controllerOwner,mode:'RECOVERY',source_generation:m.source.generation,target_generation:m.target.generation,manifest_hash:H,custody_hash:anchors.custodyHash,journal_hash:H,source_end_proof_hash:H,source_resource_hash:anchors.sourceResourceHash,target_resource_hash:anchors.targetResourceHash,expected_tenants:[A,B],restore_restriction_ids:[m.source.operationIds.restore],seed_clock_owner:m.target.seedClockOwner,initial_worker_owner:m.target.workerClockOwner};
 const binding={runId:m.recoveryId,controller:m.controllerOwner,generation:m.target.generation,mode:'RECOVERY',manifestHash:H},target={binding,kind:'run',tenantId:null,functionName:'saas.activate_recovery',valuesHash:sha256([m.recoveryId,m.controllerOwner,'6',H])};
 const intent={sequence:0,kind:'intent',operationId:m.stageOperationIds['target-activate'],stage:'activate',recoveryId:m.recoveryId,targetHash:sha256(target),expectedHash:sha256({...base,stage:'PROMOTING',version:'6',global_blocked:true}),afterHash:sha256({...base,stage:'COMPLETE',version:'7',global_blocked:false,activation_proof_hash:H}),previousHash:'0'.repeat(64)};intent.hash=sha256(intent);
 const observed={sequence:1,kind:'observed',operationId:intent.operationId,intentHash:intent.hash,observedHash:intent.afterHash,endProofHash:H,previousHash:intent.hash};observed.hash=sha256(observed);
 return{material:m,anchors,parentPlan,parentPlanHash:sha256(parentPlan),addition,additionHash:sha256(addition),workerEndProof,observedWorkerEnd,targetJournalRecords:[intent,observed],targetJournalCheckpoint:{sequence:1,hash:observed.hash}};
}
test('second transfer is prospective7→8→9, and compensation9→10→11 leaves parent/master/local versions unchanged',()=>{
 const f=fixture(),before=canonical(f),p=makeClockRestartPlan(f);assert.equal(canonical(f),before);assert.equal(p.restart.prepare.args.expected.version,'7');assert.equal(p.restart.prepare.args.after.version,'8');assert.equal(p.restart.record.args.after.version,'9');assert.equal(p.restart.prepare.caseName,'target-clock-restart-plan');assert.equal(p.restart.record.caseName,'target-clock-restart-record');
 assert.equal(p.abortPhases['abort-close'].steps[0].args.expected.version,'9');assert.equal(p.abortPhases['abort-close'].steps[1].args.after.version,'10');assert.equal(p.abortPhases['abort-finish'].steps[0].args.after.version,'11');assert.equal(p.abortPhases['abort-local'].steps[1].args.expectedRunVersion,'10');
 for(const[i,s]of p.abortPhases['abort-local'].steps.entries()){assert.deepEqual(s.args.expected,f.parentPlan.phases['abort-local'].steps[i].args.expected);assert.deepEqual(s.args.after,f.parentPlan.phases['abort-local'].steps[i].args.after);assert.equal(s.args.operationKey,f.parentPlan.phases['abort-local'].steps[i].args.operationKey)}
 assert.equal(p.restart.record.args.after.current_clock_owner,f.addition.nextOwner);assert.equal(p.restart.prepare.args.expected.clock_version,undefined);assert.equal(p.restart.prepare.args.transfer.expectedClockVersion,'130');assert.equal(f.parentPlan.phases['abort-finish'].steps[0].args.after.version,'9');
});
test('worker still present, reused owner, altered addition or a missing activation proof blocks derivation',()=>{
 for(const change of [f=>f.observedWorkerEnd.sqlOwnersPresent=[f.addition.previousOwner],f=>f.observedWorkerEnd.containers[0].running=true,f=>f.addition.nextOwner=f.material.target.seedClockOwner,f=>f.addition.runId=f.material.source.normal.runId,f=>f.targetJournalRecords.pop(),f=>f.parentPlan.phases.activation.steps[0].args.after.version='8']){const f=fixture();change(f);assert.throws(()=>makeClockRestartPlan(f));}
});
test('a valid but different activation AFTER cannot authorize a restart',()=>{
 const f=fixture(),i=f.targetJournalRecords[0],o=f.targetJournalRecords[1];i.afterHash=H;delete i.hash;i.hash=sha256(i);o.intentHash=i.hash;o.observedHash=H;o.previousHash=i.hash;delete o.hash;o.hash=sha256(o);f.targetJournalCheckpoint.hash=o.hash;assert.throws(()=>makeClockRestartPlan(f),/ACTIVATION_NOT_PROVEN/);
});
test('an abort ID already present in the externally headed journal is never recycled',()=>{
 const f=fixture(),old=f.targetJournalRecords.at(-1),i={...f.targetJournalRecords[0],sequence:2,operationId:f.material.stageOperationIds['target-close-abort'],stage:'close-admission',previousHash:old.hash};delete i.hash;i.hash=sha256(i);const o={...f.targetJournalRecords[1],sequence:3,operationId:i.operationId,intentHash:i.hash,previousHash:i.hash};delete o.hash;o.hash=sha256(o);f.targetJournalRecords.push(i,o);f.targetJournalCheckpoint={sequence:3,hash:o.hash};assert.throws(()=>makeClockRestartPlan(f),/IDS_ALREADY_USED/);
});
test('custody validation rejects a self-hashed modification of an expected version or owner',()=>{
 const f=fixture(),p=makeClockRestartPlan(f);assert.deepEqual(validateClockRestartPlan({...f,extension:p,extensionHash:sha256(p)}),p);
 for(const change of [x=>x.restart.record.args.after.version='10',x=>x.abortPhases['abort-close'].steps[0].args.expected.current_clock_owner=f.addition.previousOwner,x=>x.parentPlanHash=H]){const x=structuredClone(p);change(x);assert.throws(()=>validateClockRestartPlan({...f,extension:x,extensionHash:sha256(x)}));}
});
test('restart plan cannot be used before immutable publication and positive readback',async()=>{
 const f=fixture(),p=makeClockRestartPlan(f),hash=sha256(p);const saved=await custodyClockRestartPlan({extension:p,extensionHash:hash,publish:async()=>({sha256:hash}),readback:async()=>({value:p,sha256:hash})});assert.equal(saved.sha256,hash);
 await assert.rejects(custodyClockRestartPlan({extension:p,extensionHash:hash,publish:async()=>({sha256:hash}),readback:async()=>({value:{...p,additionHash:H},sha256:hash})}),/NOT_DURABLE/);
});
test('the private controller uses only preregistered prospective steps and charges each command once',async()=>{
 const f=fixture(),extension=makeClockRestartPlan(f),input={...f,extension,extensionHash:sha256(extension)};let charges=0,calls=0,active;
 const scenarios=Object.fromEntries(['target-clock-restart-plan','target-clock-restart-record'].map(n=>[n,{sql:8192,http:80,journal:1000,artifactFiles:2000}]));
 const ledger={async charge(kind){assert.equal(kind,'sql');charges++},async enter(name){active=name},async snapshot(){return{schema:'cp019-budget-v1',project:'mecanet-qa-p1l3-r03',total:{sql:charges},plannedScopes:Object.fromEntries(Object.keys(scenarios).map(n=>[n,'target-window'])),plannedScenarios:scenarios}}};
 const raw={async query(){calls++;return{rows:[]}}},journal={async before(){},async after(){}},seen=[];
 const controller=createClockRestartController({input,pools:{control:raw,tenants:{[A]:raw,[B]:raw}},ledger,journal,verifyStageProof:async()=>true,controlFactory:args=>{assert.equal(args.clockAddition.additionHash,f.additionHash);return Object.fromEntries(['prepareClock','recordClock'].map(method=>[method,async x=>{seen.push([method,structuredClone(x)]);await args.onCommand('sql');await args.pools.control.query({text:'SELECT fixed_private_clock()',values:[]});return{stage:x.after.stage,version:x.after.version,reconciled:false}}]))}});
 assert.equal((await controller.prepare()).version,'8');assert.equal(active,'target-clock-restart-plan');assert.equal((await controller.record()).version,'9');assert.equal(active,'target-clock-restart-record');assert.equal(charges,2);assert.equal(calls,2);assert.equal(seen[0][1].expected.version,'7');assert.equal(seen[1][1].after.current_clock_owner,f.addition.nextOwner);
});
test('a deadline exceeded during ledger fsync cannot dispatch a restart mutation',async()=>{
 const f=fixture(),extension=makeClockRestartPlan(f);let time=0,effects=0,charges=0;const raw={async query(){effects++;return{rows:[]}}};
 const ledger={async enter(){},async charge(){charges++;time=45001},async snapshot(){return{schema:'cp019-budget-v1',project:'mecanet-qa-p1l3-r03',total:{sql:charges},plannedScopes:{'target-clock-restart-plan':'target-window'},plannedScenarios:{'target-clock-restart-plan':{sql:8192,http:80,journal:1000,artifactFiles:2000}}}}};
 const c=createClockRestartController({input:{...f,extension,extensionHash:sha256(extension)},pools:{control:raw,tenants:{[A]:raw,[B]:raw}},ledger,journal:{async before(){},async after(){}},verifyStageProof:async()=>true,now:()=>time,controlFactory:args=>({async prepareClock(){await args.onCommand('sql');return args.pools.control.query({text:'SELECT fixed_private_clock()',values:[]})}})});
 await assert.rejects(c.prepare(),/CASE_LIMIT/);assert.equal(charges,1);assert.equal(effects,0);
});
