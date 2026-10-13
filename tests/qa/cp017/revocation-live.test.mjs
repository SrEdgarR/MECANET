import test from 'node:test';
import assert from 'node:assert/strict';
import {assertShareWait,assertPromotedMetadata,scenarioPlan,validateDrainStartedProof} from './revocation-live.mjs';
const tenantId='11111111-1111-4111-8111-111111111111',generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const guard={generation,data_epoch:'2',open_version:'5',closed_version:'6',reopen_version:'7',close_proven:false,status:'CLOSING'};
const central={generation,data_epoch:'2',writer_version:'6',state:'CLOSED'};
const local={generation,data_epoch:'2',writer_version:'5',state:'OPEN'};
const blocked=[{pid:51,application_name:'mecanet-tenant-write',wait_event_type:'Lock',blocking_pids:[41]},{pid:41,application_name:`mecanet-writer:${owner}`,wait_event_type:'Client',blocking_pids:[]}];
test('a real SHARE wait needs a matching old local fence, closed central version and exact writer blocker',()=>{
 assert.equal(assertShareWait({tenantId,generation,owner,guard,central,local,activities:blocked}).writerPid,41);
 for(const patch of [{guard:{...guard,close_proven:true}},{guard:{...guard,status:'ACKNOWLEDGED'}},{local:{...local,writer_version:'7'}},{central:{...central,state:'OPEN'}},{activities:[]},{activities:[blocked[0],{...blocked[1],application_name:'other-project'}]},{activities:[{...blocked[0],blocking_pids:[99]},blocked[1]]}])assert.throws(()=>assertShareWait({tenantId,generation,owner,guard,central,local,activities:blocked,...patch}),e=>e.code==='SHARE_WAIT_NOT_PROVEN');
});
const before={generation,data_epoch:'2',writer_version:'5',writer_credential_version:'1',writer_secret_ref:'writer-a-v1',schema_version:2,state:'OPEN'};
const after={...before,writer_version:'7',writer_credential_version:'2',writer_secret_ref:'writer-a-v2'};
test('rotation and epoch are distinct promotions; no version adoption, reset or implicit credential approval',()=>{
 assert.equal(assertPromotedMetadata({phase:'rotation',before,after,guard:{...guard,close_proven:true,status:'ACKNOWLEDGED'},generation}).writerVersion,'7');
 assert.equal(assertPromotedMetadata({phase:'epoch',before,after:{...before,data_epoch:'3',writer_version:'7'},guard:{...guard,close_proven:true,status:'ACKNOWLEDGED'},generation}).dataEpoch,'3');
 for(const patch of [{after:{...after,writer_version:'5'}},{after:{...after,state:'CLOSED'}},{after:{...after,generation:owner}},{after:{...after,data_epoch:'3'}},{after:{...after,writer_secret_ref:'writer-a-v1'}},{after:{...after,writer_credential_version:'1'}},{guard:{...guard,close_proven:false}}])assert.throws(()=>assertPromotedMetadata({phase:'rotation',before,after,guard:{...guard,close_proven:true,status:'ACKNOWLEDGED'},generation,...patch}),e=>e.code==='PROMOTION_NOT_PROVEN');
});
test('the preregistered scenarios have fixed bounded scope and never claim that preparation verified a real gate',()=>{
 for(const phase of ['share-logout','membership','identity','capture-rotation','capture-epoch','verify-rotation','verify-epoch','block-tenant-b','drain']){
  const plan=scenarioPlan(phase);assert.equal(plan.maxHttpPerClient,160);assert.equal(plan.maxObserverQueries,240);assert.equal(plan.maxRuntimeMs,45000);assert.equal(plan.status,'PREREGISTERED / NOT VERIFIED');assert.equal(plan.quotaChanges,false);assert.equal(plan.newActors,false);
 }
 assert.throws(()=>scenarioPlan('production'),e=>e.code==='FIXED_QA_SCENARIO_REQUIRED');
});
test('a drain start marker cannot substitute a different owner, cohort, source, container or signal',()=>{
 const context={project:'mecanet-qa-p1l2-cp017',sourceSha:'a'.repeat(40),generation,instance:'api1',owner,operationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',ticketId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'};
 const proof={...context,containerId:'e'.repeat(64),artifactDigest:'f'.repeat(64),signal:'SIGTERM',drainStartedAt:new Date().toISOString()};
 assert.equal(validateDrainStartedProof(proof,context),proof);
 for(const patch of [{project:'other-project'},{sourceSha:'b'.repeat(40)},{owner:generation},{generation:owner},{instance:'api2'},{operationId:context.ticketId},{ticketId:context.operationId},{containerId:'short'},{artifactDigest:'short'},{signal:'SIGKILL'},{drainStartedAt:new Date(Date.now()+60000).toISOString()}])assert.throws(()=>validateDrainStartedProof({...proof,...patch},context),e=>e.code==='DRAIN_START_NOT_PROVEN');
});
