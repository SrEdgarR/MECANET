import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFence,canReopen,createRestrictiveCoordinator} from '../../server/saas/writes/coordinator.js';

const generation='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
test('closing proof binds generation, epoch, exact monotonic version and CLOSED state',()=>{
 const expected={generation,data_epoch:'1',closed_version:'8'};
 assert.doesNotThrow(()=>assertFence({generation,data_epoch:'1',writer_version:'8',state:'CLOSED'},expected,'CLOSED'));
 for(const change of [{generation:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},{data_epoch:'2'},{writer_version:'9'},{state:'OPEN'}])assert.throws(()=>assertFence({generation,data_epoch:'1',writer_version:'8',state:'CLOSED',...change},expected,'CLOSED'),e=>e.code==='CLOSURE_NOT_PROVEN');
});
test('only subject revocations may reopen other members; operational barriers stay closed',()=>{
 for(const reason of ['LOGOUT','IDENTITY','MEMBERSHIP','GRANT'])assert.equal(canReopen(reason),true);
 for(const reason of ['TENANT','EPOCH','ROTATION','RESTORE','SHUTDOWN','POLICY'])assert.equal(canReopen(reason),false);
});
test('private coordinator refuses missing private pool/resolver rather than API credential fallback',()=>{
 assert.throws(()=>createRestrictiveCoordinator({generation}),/PRIVATE_WRITER_DEPENDENCIES_REQUIRED/);
});
test('bounded queue failure yields pending and does not invent an acknowledged restriction',async()=>{
 const c=createRestrictiveCoordinator({generation,controlPool:{async connect(){return {async query(){throw Object.assign(new Error('database disconnected'),{code:'08006'})},release(){}}}},maintenancePools:{withTenant:async()=>{throw new Error('must not open')}},resolveDescriptor:async()=>{throw new Error('must not resolve')}});
 const result=await c.runOnce();assert.deepEqual(result,{processed:0,pending:true});
});

function restrictedFixture({shareHeld=false,hasEffect=false,reason='GRANT',coordinatorOptions={}}={}){
 const tenantId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actorId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',id='dddddddd-dddd-4ddd-8ddd-dddddddddddd',operationId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',ownerId='ffffffff-ffff-4fff-8fff-ffffffffffff';
 const restriction={id,generation,identity_id:actorId,tenant_id:tenantId,action:'inventory.receive',reason_code:reason,status:'PENDING'};
 const guard={restriction_id:id,tenant_id:tenantId,generation,data_epoch:'1',open_version:'7',closed_version:'8',reopen_version:'9',stage:'PENDING',close_proven:false};
 const centralFence={tenant_id:tenantId,generation,data_epoch:'1',state:'CLOSED',writer_version:'8'};
 const localFence={generation,data_epoch:'1',state:'OPEN',writer_version:'7'};
 const intent={tenant_id:tenantId,operation_id:operationId,actor_id:actorId,owner_id:ownerId,generation,data_epoch:'1',writer_version:'7',action:'inventory.receive',status:'EXECUTING'};
 const reservation={status:'RESERVED',bytes:32768,products:0};let grant='active',share=shareHeld,effect=hasEffect,projections=0;
 const terminalResult={operationId,state:'CONFIRMED',productId:actorId,movementId:id,onHand:'3',balanceVersion:'2',dataEpoch:'1'};
 async function centralQuery(command,values=[]){const text=typeof command==='string'?command:command.text;values=typeof command==='string'?values:command.values??[];
  if(text.startsWith('UPDATE saas.admission_fence'))return {rows:[{id:1}]};
  if(text.startsWith('SELECT * FROM saas.write_restrictions'))return {rows:[{...restriction}]};
  if(text.startsWith('SELECT id FROM saas.write_restrictions'))return {rows:restriction.status==='ACKNOWLEDGED'?[]:[{id}]};
  if(text.startsWith('UPDATE saas.write_restrictions')){if(text.includes("status='ACKNOWLEDGED'"))restriction.status='ACKNOWLEDGED';else if(text.includes("status='CLOSED'"))restriction.status='CLOSED';else if(restriction.status==='PENDING')restriction.status='CLOSING';return {rows:[]}}
  if(text.startsWith('SELECT * FROM saas.write_restriction_tenants'))return {rows:[{...guard}]};
  if(text.startsWith('UPDATE saas.write_restriction_tenants')){guard.stage=text.includes("stage='ACKNOWLEDGED'")?'ACKNOWLEDGED':text.includes("stage='REOPENING'")?'REOPENING':text.includes("stage='OPEN'")?'OPEN':values[2];guard.close_proven ||= values[3]===true;return {rows:[]}}
  if(text.includes('saas.write_barrier_cost()'))return {rows:[{bounded:true}]};
  if(text.startsWith('SELECT * FROM saas.write_intents'))return {rows:['CONFIRMED','REJECTED'].includes(intent.status)&&text.includes('status IN')?[]:[{...intent}]};
  if(text.startsWith('SELECT t.close_proven'))return {rows:guard.close_proven&&centralFence.state==='CLOSED'?[{close_proven:true}]:[]};
  if(text.startsWith('UPDATE saas.write_intents')){intent.status='REJECTED';return {rows:[]}}
  if(text.startsWith('UPDATE saas.write_growth_reservations')){reservation.status='PROJECTED';return {rows:[]}}
  if(text.includes('saas.write_operation_cost'))return {rows:[{bounded:true}]};
  if(text.includes('SELECT EXISTS(SELECT 1 FROM saas.write_intents'))return {rows:[{pending:!['CONFIRMED','REJECTED'].includes(intent.status)}]};
  if(text.includes('SELECT EXISTS(SELECT 1 FROM saas.write_restriction_tenants'))return {rows:[{pending:!['RESOLVED','REOPENING','OPEN','ACKNOWLEDGED'].includes(guard.stage)}]};
  if(text.startsWith('UPDATE saas.action_grants')){grant='revoked';return {rows:[]}}
  if(text.startsWith('SELECT * FROM saas.tenant_writer_state'))return {rows:[{...centralFence}]};
  if(text.startsWith('SELECT state,writer_version'))return {rows:[{...centralFence}]};
  if(text.includes('FROM saas.write_restriction_tenants t JOIN saas.write_restrictions'))return {rows:[{pending:false}]};
  if(text.startsWith('UPDATE saas.tenant_writer_state SET writer_version')){centralFence.writer_version=values[1];return {rows:[]}}
  if(text.startsWith("UPDATE saas.tenant_writer_state SET state='OPEN'")){centralFence.state='OPEN';return {rows:[{tenant_id:tenantId}]}}
  if(text.startsWith('SELECT stage,close_proven'))return {rows:[{stage:guard.stage,close_proven:guard.close_proven}]};
  if(text.includes('saas.project_write_result')){intent.status='CONFIRMED';reservation.status='PROJECTED';projections++;return {rows:[{...intent}]}}
  return {rows:[]};
 }
 const controlPool={async connect(){return {query:centralQuery,release(){}}}};
 const maintenancePools={async withTenant(_d,callback){return callback({async query(command){const text=typeof command==='string'?command:command.text;
  if(text.includes('inventory.close_writer_fence')){if(share)throw Object.assign(new Error('SHARE transaction still alive'),{code:'55P03'});localFence.state='CLOSED';localFence.writer_version='8';return {rows:[{...localFence}]}}
  if(text.includes('inventory.open_writer_fence')){localFence.state='OPEN';localFence.writer_version='9';return {rows:[{...localFence}]}}
  if(text.includes('inventory.writer_fence')||text.includes('inventory.observe_writer_fence'))return {rows:[{...localFence}]};
  if(text.includes('inventory.operation_result'))return {rows:effect?[{result:terminalResult,result_hash:'a'.repeat(64),logical_delta:'1200',replay:true}]:[]};
  return {rows:[]};
 }})}};
 const coordinator=createRestrictiveCoordinator({generation,controlPool,maintenancePools,resolveDescriptor:async()=>({tenantId}),...coordinatorOptions});
 return {coordinator,releaseShareWithEffect(){share=false;effect=true},snapshot:()=>({restriction:{...restriction},guard:{...guard},centralFence:{...centralFence},localFence:{...localFence},intent:{...intent},reservation:{...reservation},grant,projections})};
}
test('delayed old writer is permanently resolved before acknowledgement, with live resource reservations preserved',async()=>{
 const f=restrictedFixture();assert.deepEqual(await f.coordinator.runOnce(),{processed:1,pending:false});const s=f.snapshot();
 assert.equal(s.restriction.status,'ACKNOWLEDGED');assert.equal(s.intent.status,'REJECTED');assert.equal(s.intent.writer_version,'7');assert.equal(s.grant,'revoked');
 assert.equal(s.centralFence.writer_version,'9');assert.equal(s.centralFence.state,'OPEN');assert.equal(s.localFence.writer_version,'9');
 assert.equal(s.reservation.status,'PROJECTED');assert.equal(s.reservation.bytes,32768);assert.equal(s.projections,0);
});
test('a SHARE still in flight cannot be skipped; its committed result is projected before revocation acknowledgement',async()=>{
 const f=restrictedFixture({shareHeld:true});assert.deepEqual(await f.coordinator.runOnce(),{processed:0,pending:true});assert.equal(f.snapshot().restriction.status,'CLOSING');assert.equal(f.snapshot().grant,'active');assert.equal(f.snapshot().intent.status,'EXECUTING');
 f.releaseShareWithEffect();assert.deepEqual(await f.coordinator.runOnce(),{processed:1,pending:false});const s=f.snapshot();assert.equal(s.restriction.status,'ACKNOWLEDGED');assert.equal(s.intent.status,'CONFIRMED');assert.equal(s.projections,1);assert.equal(s.reservation.bytes,32768);assert.equal(s.intent.writer_version,'7');
});
test('resource settlement requires a trusted positive proof, never a fence or an arbitrary true flag',async()=>{
 const f=restrictedFixture();await assert.rejects(()=>f.coordinator.settleResources({tenantId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',operationId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',ticketId:'ffffffff-ffff-4fff-8fff-ffffffffffff',sqlSettled:true,responseSettled:true,ownerEnded:true}),e=>e.code==='END_NOT_PROVEN');assert.equal(f.snapshot().reservation.bytes,32768);
});
test('operational barrier promotion requires its own verified private callback',async()=>{
 const f=restrictedFixture();await assert.rejects(()=>f.coordinator.resumeOperationalBarrier('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),e=>e.code==='PROMOTION_NOT_PROVEN');assert.equal(f.snapshot().centralFence.state,'CLOSED');
});
test('negative and merely truthy end proofs cannot settle retained debt',async()=>{
 for(const value of [false,1,{verified:true}]){
  const f=restrictedFixture({coordinatorOptions:{verifyEndProof:async()=>value}});
  await assert.rejects(()=>f.coordinator.settleResources({tenantId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',operationId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',ticketId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}),e=>e.code==='END_NOT_PROVEN');assert.equal(f.snapshot().reservation.bytes,32768);
 }
});
test('a verified external end does not override a missing SQL-side terminal settlement proof',async()=>{
 const f=restrictedFixture({coordinatorOptions:{verifyEndProof:async()=>true}});
 await assert.rejects(()=>f.coordinator.settleResources({tenantId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',operationId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',ticketId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}),e=>e.code==='RECONCILIATION_REQUIRED');assert.equal(f.snapshot().reservation.bytes,32768);
});
test('policy acknowledgement stays closed and an incomplete promotion proof cannot reopen it',async()=>{
 const f=restrictedFixture({reason:'POLICY',coordinatorOptions:{verifyPromotion:async()=>({verified:true,tenants:[]})}});assert.deepEqual(await f.coordinator.runOnce(),{processed:1,pending:false});assert.equal(f.snapshot().centralFence.state,'CLOSED');
 await assert.rejects(()=>f.coordinator.resumeOperationalBarrier('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),e=>e.code==='PROMOTION_NOT_PROVEN');assert.equal(f.snapshot().localFence.state,'CLOSED');
});
