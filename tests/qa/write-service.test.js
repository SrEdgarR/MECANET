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

test('pending pagination continues past grants revoked between SQL selection and fresh authorization',async()=>{
 const ids=[1,2,3,4,5].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
 const rows=ids.map((operation_id,index)=>({operation_id,action:index%2?'inventory.receive':'catalog.create',status:'UNKNOWN',created_at:'2026-10-13T00:00:00Z'}));
 rows[4].action='inventory.receive';const cursors=[];
 const controlPool={async connect(){return {release(){},async query(text,values){if(text.includes('own_pending_writes')){cursors.push(values[3]);return {rows:rows.filter(r=>!values[3]||r.operation_id>values[3]).slice(0,values[4])}}return {rows:[]}}}}};
 const scope={user:{id:actorId},purpose:'company',generation,contextVersion:'1:fixture',descriptor:{tenantId,dataEpoch:'1'}};
 const authority={tenantContext:async()=>scope,authorize:async({action})=>{if(action==='catalog.create')throw Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED',status:403});return scope}};
 const service=createWriteService({controlPool,authority,ownerId,writerPools:{},readerPools:{}});
 const reply=await service.listOperations({authorityContext:scope,sid:'x'.repeat(32),query:{cursor:null,limit:2}});
 assert.deepEqual(reply.items.map(r=>r.operationId),[ids[1],ids[3]]);assert.equal(reply.nextCursor,ids[3]);assert.deepEqual(cursors,[null,ids[2]]);
});

test('a filtered page cannot claim exhaustion when its finite scan budget was consumed',async()=>{
 let selected=0;
 const controlPool={async connect(){return {release(){},async query(text,values){if(!text.includes('own_pending_writes'))return {rows:[]};return {rows:Array.from({length:values[4]},()=>({operation_id:`00000000-0000-4000-8000-${String(++selected).padStart(12,'0')}`,action:'catalog.create',status:'UNKNOWN',created_at:'2026-10-13T00:00:00Z'}))}}}}};
 const scope={user:{id:actorId},purpose:'company',generation,descriptor:{tenantId,dataEpoch:'1'}};
 const authority={tenantContext:async()=>scope,authorize:async()=>{throw Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED',status:403})}};
 const service=createWriteService({controlPool,authority,ownerId,writerPools:{},readerPools:{}});
 await assert.rejects(()=>service.listOperations({authorityContext:scope,sid:'x'.repeat(32),query:{cursor:null,limit:100}}),error=>error.code==='WRITE_UNCERTAIN');assert.equal(selected,404);
});

test('session-owned logout reentry polls the original durable restriction even after ordinary authority is closed',async()=>{
 const restrictionId='99999999-9999-4999-8999-999999999999';let acknowledged=false,requests=0,authorizeCalls=0;const polled=[];
 const controlPool={async connect(){return {release(){},async query(text,values){if(text.includes('request_session_restriction')){requests++;return {rows:[{id:restrictionId,status:'PENDING'}]}}if(text.includes('own_session_restriction')){polled.push(values[0]);return {rows:[{status:acknowledged?'ACKNOWLEDGED':'PENDING'}]}}return {rows:[]}}}}};
 const authority={authorize:async()=>{authorizeCalls++;throw Object.assign(Error('SESSION_EXPIRED'),{code:'SESSION_EXPIRED',status:401})}};
 const service=createWriteService({controlPool,authority,ownerId,writerPools:{},readerPools:{}});
 const ctx={user:{id:actorId},purpose:'company',generation,logoutPending:true};
 await assert.rejects(()=>service.requestSessionRevocation({sid:'x'.repeat(32),ctx,deadline:performance.now()+12}),error=>error.code==='WRITE_UNCERTAIN');
 acknowledged=true;assert.equal(await service.requestSessionRevocation({sid:'x'.repeat(32),ctx}),true);
 assert.equal(requests,2);assert(polled.length>=2);assert(polled.every(id=>id===restrictionId));assert.equal(authorizeCalls,0);
});
