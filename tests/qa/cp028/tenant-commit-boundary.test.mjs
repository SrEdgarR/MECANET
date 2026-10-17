// Real generic write factory, database boundary doubles; no POS dependency.
// Kept portable for the existing L3 verification CI without publishing POS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWriteService} from '../../../server/saas/writes/service.js';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture({commitError=null,afterCommitError=null,beforeFunctionError=null,projectionError=null,afterProjectionError=null}={}){
 const tenantId=id(1),actorId=id(2),generation=id(3),operationId=id(4),ownerId=id(5),ticketId=id(6);
 const context={purpose:'company',user:{id:actorId},generation,descriptor:{tenantId,dataEpoch:'1',schemaVersion:2},writerDescriptor:{tenantId,dataEpoch:'1',schemaVersion:2}};
 const result={operationId,state:'CONFIRMED',productId:id(7),movementId:null,onHand:'0',balanceVersion:'1',dataEpoch:'1'};
 const events=[];let state='PENDING',effects=0;
 const controlPool={connect:async()=>({release(){},query:async text=>{
  if(text.includes('register_write_intent'))return{rows:[{status:state,ticket_id:ticketId,operation_id:operationId,actor_id:actorId,action:'catalog.create',data_epoch:'1'}]};
  if(text.includes('claim_write_intent'))return{rows:[{generation,data_epoch:'1',writer_version:'1'}]};
  if(text.includes('project_write_result')){if(projectionError)throw projectionError;state='CONFIRMED';events.push('projection');}
  if(text.includes('mark_write_unknown')){if(state!=='CONFIRMED')state='UNKNOWN';events.push('unknown');}
  return{rows:[]};
 }})};
 const writerPools={withTenant:async(_descriptor,work)=>work({query:async q=>{
  if(q.text.includes('inventory.create_product')){effects++;events.push('function');return{rows:[{result,logical_delta:'1024',result_hash:'a'.repeat(64)}]};}
  if(q.text==='COMMIT'){events.push('COMMIT_SENT');if(commitError)throw commitError;events.push('COMMIT_ACK');}
  if(q.text==='ROLLBACK')events.push('ROLLBACK_ACK');
  return{rows:[]};
 }})};
 const service=createWriteService({controlPool,writerPools,readerPools:{},authority:{authorize:async()=>context},ownerId,generation,checkpoint:async name=>{
  if(name==='write.beforeFunction'&&beforeFunctionError)throw beforeFunctionError;
  if(name==='write.afterTenantCommit'&&afterCommitError)throw afterCommitError;
  if(name==='write.projected'&&afterProjectionError)throw afterProjectionError;
 }});
 return{service,input:{authorityContext:context,sid:'synthetic',action:'catalog.create',input:{sku:'COMMIT-QA',name:'Ficticio'},operationId,dataEpoch:'1',ticketId},events,result,snapshot:()=>({state,effects})};
}
test('tenant COMMIT error cannot escape as the original known SQL access rejection',async()=>{
 const f=fixture({commitError:Object.assign(Error('WRITE_ACCESS_DENIED'),{code:'P0001'})});
 await assert.rejects(f.service.write(f.input),error=>error.code==='WRITE_UNCERTAIN'&&error.status===503&&error.causeCode==='P0001'&&error.causeReason==='WRITE_ACCESS_DENIED');
 assert.deepEqual(f.snapshot(),{state:'UNKNOWN',effects:1});assert.equal(f.events.includes('projection'),false);assert.equal(f.events.includes('ROLLBACK_ACK'),false);
});
test('a failure after actual tenant COMMIT ACK remains uncertain for publication',async()=>{
 const f=fixture({afterCommitError:Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED',status:403})});
 await assert.rejects(f.service.write(f.input),error=>error.code==='WRITE_UNCERTAIN'&&error.status===503);
 assert.deepEqual(f.snapshot(),{state:'UNKNOWN',effects:1});assert.equal(f.events.includes('COMMIT_ACK'),true);assert.equal(f.events.includes('projection'),false);assert.equal(f.events.includes('ROLLBACK_ACK'),false);
});
test('known rejection before a tenant effect retains 403 only after positive ROLLBACK',async()=>{
 const f=fixture({beforeFunctionError:Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED',status:403})});
 await assert.rejects(f.service.write(f.input),error=>error.code==='ACCESS_DENIED'&&error.status===403);
 assert.deepEqual(f.snapshot(),{state:'UNKNOWN',effects:0});assert.equal(f.events.includes('ROLLBACK_ACK'),true);assert.equal(f.events.includes('COMMIT_SENT'),false);
});
test('positive tenant COMMIT still publishes its exact original result once',async()=>{
 const f=fixture();assert.deepEqual(await f.service.write(f.input),f.result);
 assert.deepEqual(f.snapshot(),{state:'CONFIRMED',effects:1});assert.deepEqual(f.events,['function','COMMIT_SENT','COMMIT_ACK','projection']);
});
test('a known central projection rejection after tenant COMMIT cannot declare the write absent',async()=>{
 const f=fixture({projectionError:Object.assign(Error('WRITE_ACCESS_DENIED'),{code:'P0001'})});
 await assert.rejects(f.service.write(f.input),error=>error.code==='WRITE_UNCERTAIN'&&error.status===503);
 assert.deepEqual(f.snapshot(),{state:'UNKNOWN',effects:1});assert.equal(f.events.includes('COMMIT_ACK'),true);assert.equal(f.events.includes('projection'),false);
});
test('a lost publication after central projection does not replace the durable result with a 401',async()=>{
 const f=fixture({afterProjectionError:Object.assign(Error('SESSION_EXPIRED'),{code:'SESSION_EXPIRED',status:401})});
 await assert.rejects(f.service.write(f.input),error=>error.code==='WRITE_UNCERTAIN'&&error.status===503);
 assert.deepEqual(f.snapshot(),{state:'CONFIRMED',effects:1});assert.equal(f.events.includes('projection'),true);assert.equal(f.events.includes('ROLLBACK_ACK'),false);
});
