// Deterministic register/claim ordering using two HTTP ticket identities.
// The fake central CAS deliberately models the registered SQL003 contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWriteService} from '../../server/saas/writes/service.js';
const tenantId='11111111-1111-4111-8111-111111111111',actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',generation='dddddddd-dddd-4ddd-8ddd-dddddddddddd',operationId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const firstOwner='abababab-abab-4bab-8bab-abababababab',otherOwner='babababa-baba-4aba-8aba-babababababa',firstTicket='cccccccc-cccc-4ccc-8ccc-cccccccccccc',otherTicket='ffffffff-ffff-4fff-8fff-ffffffffffff';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}};
function fixture(peerOwner){
 const registered=deferred(),releaseOriginal=deferred();let state='NONE',executor=null,originalTicket=null,effects=0,claimed=0,growth='RESERVED',sqlEnded=false;
 const ended=new Set(),calls=[];
 const value={operationId,state:'CONFIRMED',productId:actorId,movementId:null,onHand:'0',balanceVersion:'1',dataEpoch:'2'};
 const row=()=>({tenant_id:tenantId,operation_id:operationId,actor_id:actorId,action:'catalog.create',data_epoch:'2',generation,writer_version:'1',ticket_id:originalTicket,owner_id:executor,status:state});
 const controlPool={async connect(){return{async query(text,args){
  if(text.includes('register_write_intent')){if(state==='NONE'){originalTicket=args[7];state='PENDING'}return{rows:[row()]}}
  if(text.includes('claim_write_intent')){calls.push({kind:'claim',owner:args[4]});if(state!=='PENDING')return{rows:[]};claimed++;executor=args[4];state='EXECUTING';return{rows:[row()]}}
  if(text.includes('project_write_result')){state='CONFIRMED';growth='PROJECTED';return{rows:[row()]}}
  if(text.includes('finish_write_resources')){calls.push({kind:'finish',owner:args[2],ticket:args[3]});const positive=sqlEnded&&ended.has(originalTicket)&&executor===args[2]&&originalTicket===args[3];if(positive)growth='SETTLED';return{rows:[{finished:positive}]}}
  return{rows:[]};
 },release(){}}}};
 const writerPools={async withTenant(_d,fn){return fn({async query(input){if(input.text.includes('inventory.create_product')){effects++;return{rows:[{result:value,logical_delta:'1024',result_hash:'a'.repeat(64)}]}}if(input.text==='COMMIT')sqlEnded=true;return{rows:[]}}})}};
 const readerPools={async withTenant(_d,fn){return fn({async query(input){return{rows:input.text.includes('inventory.operation_result')?[{result:value,logical_delta:'1024',result_hash:'a'.repeat(64)}]:[]}}})}};
 const authorityContext={user:{id:actorId},purpose:'company',generation,descriptor:{tenantId,dataEpoch:'2',schemaVersion:2},writerDescriptor:{tenantId,dataEpoch:'2',schemaVersion:2}},authority={authorize:async()=>authorityContext};
 const original=createWriteService({controlPool,authority,writerPools,readerPools,ownerId:firstOwner,generation,checkpoint:async stage=>{if(stage==='write.intentDurable'){registered.resolve();await releaseOriginal.promise}}});
 const peer=createWriteService({controlPool,authority,writerPools,readerPools,ownerId:peerOwner,generation});
 const input={authorityContext,sid:'synthetic-same-session',action:'catalog.create',input:{sku:'ORIGINAL',name:'Original ticket'},operationId,dataEpoch:'2',deadline:performance.now()+8000};
 return{original,peer,input,registered,releaseOriginal,ended,calls,value,snapshot:()=>({state,executor,originalTicket,effects,claimed,growth})};
}
for(const [label,peerOwner] of [['different API process',otherOwner],['same API process',firstOwner]])test(`a ${label} duplicate cannot execute a PENDING intention using a different HTTP ticket`,async()=>{
 const f=fixture(peerOwner),running=f.original.write({...f.input,ticketId:firstTicket});
 try{
  await f.registered.promise;
  await assert.rejects(f.peer.write({...f.input,ticketId:otherTicket}),error=>error.code==='OPERATION_PENDING'&&error.status===409);
  assert.deepEqual(f.snapshot(),{state:'PENDING',executor:null,originalTicket:firstTicket,effects:0,claimed:0,growth:'RESERVED'});
  f.ended.add(otherTicket);assert.equal(await f.peer.finish({tenantId,operationId,ticketId:otherTicket,sqlSettled:true,responseSettled:true}),false);
  f.releaseOriginal.resolve();assert.deepEqual(await running,f.value);assert.equal(f.snapshot().executor,firstOwner);assert.equal(f.snapshot().effects,1);assert.equal(f.snapshot().claimed,1);assert.equal(f.snapshot().growth,'PROJECTED');
  await assert.rejects(f.original.finish({tenantId,operationId,ticketId:firstTicket,sqlSettled:true,responseSettled:false}),{code:'END_NOT_PROVEN'});assert.equal(f.snapshot().growth,'PROJECTED');
  f.ended.add(firstTicket);assert.equal(await f.original.finish({tenantId,operationId,ticketId:firstTicket,sqlSettled:true,responseSettled:true}),true);assert.equal(f.snapshot().growth,'SETTLED');
  assert.deepEqual(await f.peer.write({...f.input,ticketId:otherTicket}),f.value,'confirmed same-key replay remains a result read');assert.equal(f.snapshot().effects,1);assert.equal(f.calls.filter(c=>c.kind==='claim').length,1);
 }finally{f.releaseOriginal.resolve();await running.catch(()=>{})}
});
