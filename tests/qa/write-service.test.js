import test from 'node:test';
import assert from 'node:assert/strict';
import {createWriteService} from '../../server/saas/writes/service.js';

const tenantId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actorId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',generation='cccccccc-cccc-4ccc-8ccc-cccccccccccc',operationId='dddddddd-dddd-4ddd-8ddd-dddddddddddd',ownerId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',ticketId='ffffffff-ffff-4fff-8fff-ffffffffffff';
const result={operationId,state:'CONFIRMED',productId:actorId,movementId:null,onHand:'0',balanceVersion:'1',dataEpoch:'1'};
function fixture({uncertain=false,preimagePause=false,projectionFailure=false,replay=false,claimConflict=false}={}){
 let effects=0,sqlEnded=false,responseEnded=false,state=replay?'CONFIRMED':'PENDING',retained=true;
 const row=()=>({operation_id:operationId,tenant_id:tenantId,actor_id:actorId,generation,data_epoch:'1',writer_version:'1',status:state,owner_id:ownerId,action:'catalog.create',ticket_id:ticketId});
 const control={async connect(){return {async query(text){
  if(text.includes('claim_write_intent')){if(claimConflict)return {rows:[]};state='EXECUTING';return {rows:[row()]}}
  if(text.includes('register_write_intent'))return {rows:[row()]};
  if(text.includes('project_write_result')){if(projectionFailure)throw Object.assign(new Error('lost control'),{code:'08006'});state='CONFIRMED';return {rows:[row()]}}
  if(text.includes('mark_write_unknown')){state='UNKNOWN';return {rows:[{marked:true}]}}
  if(text.includes('finish_write_resources')){if(sqlEnded&&responseEnded)retained=false;return {rows:[{finished:!retained}]}}
  return {rows:[]};},release(){}}},async query(){return {rows:[]}}};
 const writerPools={async withTenant(_descriptor,callback){return callback({async query(command){const text=typeof command==='string'?command:command.text;
  if(text.includes('inventory.create_product')){effects++;return {rows:[{result,logical_delta:'1024',result_hash:'a'.repeat(64),replay:false}]}}
  if(text==='COMMIT'){sqlEnded=true;if(uncertain)throw Object.assign(new Error('ACK lost'),{code:'08006'})}
  return {rows:[]};}})}};
 const readerPools={async withTenant(_d,callback){return callback({async query(command){const text=typeof command==='string'?command:command.text;return {rows:text.includes('operation_result')?[{result,logical_delta:'1024',result_hash:'a'.repeat(64),replay:true}]:[]}}})}};
 const authorityContext={user:{id:actorId},purpose:'company',generation,descriptor:{tenantId,dataEpoch:1,schemaVersion:2},writerDescriptor:{tenantId,dataEpoch:1,schemaVersion:2}};
 const service=createWriteService({controlPool:control,writerPools,readerPools,authority:{async authorize(){return authorityContext}},ownerId,checkpoint:async name=>{if(preimagePause&&name==='write.beforeTenant')throw new Error('process failed before SQL')}});
 const input={authorityContext,sid:'x'.repeat(32),action:'catalog.create',input:{sku:'A',name:'Example'},operationId,dataEpoch:'1',ticketId,deadline:performance.now()+8000};
 return {service,input,setResponseEnded(){responseEnded=true},state:()=>({effects,state,retained})};
}
test('known COMMIT projects effect but cannot release growth before a positive HTTP end',async()=>{
 const f=fixture();assert.deepEqual(await f.service.write(f.input),result);assert.deepEqual(f.state(),{effects:1,state:'CONFIRMED',retained:true});
 await assert.rejects(()=>f.service.finish({...f.input,tenantId,sqlSettled:true,responseSettled:false}),e=>e.code==='END_NOT_PROVEN');assert.equal(f.state().retained,true);
 f.setResponseEnded();await f.service.finish({...f.input,tenantId,sqlSettled:true,responseSettled:true});assert.equal(f.state().retained,false);
});
test('lost tenant COMMIT acknowledgement preserves UNKNOWN and never retries its effect',async()=>{
 const f=fixture({uncertain:true});await assert.rejects(()=>f.service.write(f.input),e=>e.code==='WRITE_UNCERTAIN'&&e.status===503);assert.deepEqual(f.state(),{effects:1,state:'UNKNOWN',retained:true});
});
test('central projection failure after known tenant effect remains UNKNOWN',async()=>{
 const f=fixture({projectionFailure:true});await assert.rejects(()=>f.service.write(f.input),e=>e.code==='WRITE_UNCERTAIN');assert.deepEqual(f.state(),{effects:1,state:'UNKNOWN',retained:true});
});
test('in-flight second claimant cannot execute a second effect',async()=>{
 const f=fixture({claimConflict:true});await assert.rejects(()=>f.service.write(f.input),e=>e.code==='OPERATION_PENDING'&&e.status===409);assert.equal(f.state().effects,0);assert.equal(f.state().retained,true);
});
test('confirmed replay reads a durable result without running the writer',async()=>{
 const f=fixture({replay:true});assert.deepEqual(await f.service.write(f.input),result);assert.equal(f.state().effects,0);
});
test('malformed input is rejected without any SQL effect',async()=>{
 const f=fixture();await assert.rejects(()=>f.service.write({...f.input,input:{sku:'A',name:'\u0000'}}),e=>e.code==='INVALID_WRITE'&&e.status===400);assert.equal(f.state().effects,0);assert.equal(f.state().state,'PENDING');
});
