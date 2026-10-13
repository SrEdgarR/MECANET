// Real loopback HTTP and actual central coordinator; synthetic SQL failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../../server/saas/app.js';
import {createWriteService} from '../../server/saas/writes/service.js';
import {serializable} from '../../server/saas/admission/transaction.js';
const A='11111111-1111-4111-8111-111111111111';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}};
async function rollbackCase({aborted,rollbackLost}){
 const secret=randomBytes(48).toString('hex'),sid=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url'),generation=randomUUID();
 const signed=`s:${sid}.${createHmac('sha256',secret).update(sid).digest('base64').replace(/=+$/,'')}`;
 const context={purpose:'company',generation,user:{id:randomUUID()},contextVersion:1,descriptor:{tenantId:A,dataEpoch:'2',schemaVersion:2}};
 const entered=deferred(),release=deferred(),closed=deferred(),events=[];let finished=0,uncertain=0;
 const controlPool={async connect(){return{async query(text){
  if(text.startsWith('SELECT * FROM saas.own_write_intent')){entered.resolve();await release.promise;throw Object.assign(Error('WRITE_ACCESS_DENIED'),{code:'P0001'})}
  if(text==='ROLLBACK'){events.push('rollback-attempted');if(rollbackLost)throw Object.assign(Error('synthetic ACK loss'),{code:'ECONNRESET'});events.push('rollback-ack')}
  return{rows:[]};
 },release(error){events.push(error?'central-discarded':'central-released')}}}};
 const authority={authorize:async()=>context,tenantContext:async()=>context};
 const writes=createWriteService({controlPool,authority,writerPools:{},readerPools:{},ownerId:randomUUID(),generation});
 const sessionPool={async query(text){assert.match(text,/^SELECT sess/);return{rows:[{sess:{cookie:{originalMaxAge:28800000,expires:new Date(Date.now()+28800000).toISOString(),secure:true,httpOnly:true,path:'/',sameSite:'lax'},csrfToken:csrf}}]}}};
 const admission={async observeClock(){},ready:()=>true,async admit(){return{id:randomUUID(),state:'ACTIVE'}},async startWork(){},async heartbeat(){},async consumeBytes(){events.push('bytes-ack')},async finish(){finished++},async markUncertain(){uncertain++}};
 const app=createApp({origin:'https://qa.invalid',trustedProxy:'127.0.0.1',sessionPool,sessionSecret:secret,authority,admission,writes,tenantPools:{}});
 const server=await new Promise(r=>{const s=app.app.listen(0,'127.0.0.1',()=>r(s))});server.on('connection',socket=>socket.once('close',()=>closed.resolve()));
 let req;
 try{
  const response=new Promise((resolve,reject)=>{
   req=http.request({host:'127.0.0.1',port:server.address().port,path:`/api/tenants/${A}/operations/${randomUUID()}`,headers:{Host:'qa.invalid','X-Forwarded-Proto':'https',Cookie:`__Host-mecanet-session=${encodeURIComponent(signed)}`}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,json:JSON.parse(body)}))});req.on('error',error=>aborted?resolve(null):reject(error));req.end();
  });
  await entered.promise;if(aborted){req.destroy();await closed.promise}release.resolve();
  const result=await response;for(let i=0;i<100&&app.state().active;i++)await delay(5);assert.equal(app.state().active,0);
  assert(events.includes(rollbackLost?'central-discarded':'rollback-ack'));
  if(rollbackLost){assert.equal(finished,0,'lost ROLLBACK ACK must not become positive SQL end through a 4xx alias');assert.equal(uncertain,1);assert(!events.includes('bytes-ack'));if(!aborted){assert.equal(result.status,503);assert.deepEqual(result.json,{error:'WRITE_UNCERTAIN'})}}
  else{assert.equal(finished,1);assert.equal(uncertain,0);if(!aborted){assert.equal(result.status,403);assert.deepEqual(result.json,{error:'ACCESS_DENIED'})}}
 }finally{release.resolve();req?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r))}
}
for(const aborted of [true,false])for(const rollbackLost of [true,false])test(`${aborted?'peer-aborted':'normal'} read: ${rollbackLost?'lost':'confirmed'} ROLLBACK ACK cannot be inferred from original 4xx`,{timeout:5000},()=>rollbackCase({aborted,rollbackLost}));
test('an original retryable conflict is never retried after its rollback acknowledgement is lost',async()=>{
 let attempts=0,discard;
 const original=Object.assign(Error('synthetic conflict'),{code:'40001'}),rollback=Object.assign(Error('synthetic rollback loss'),{code:'ECONNRESET'});
 const pool={async connect(){attempts++;return{async query(text){if(text==='ROLLBACK')throw rollback;return{rows:[]}},release(error){discard=error}}}};
 await assert.rejects(serializable(pool,async()=>{throw original}),error=>error.status===503&&error.code==='ROLLBACK_UNCERTAIN');assert.equal(attempts,1);assert.equal(discard,rollback);
});
test('a ROLLBACK deadline also supersedes the original 403 and discards the client',async()=>{
 let discarded=false;const original=Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED',status:403});
 const pool={async connect(){return{async query(text){if(text==='ROLLBACK')return new Promise(()=>{});return{rows:[]}},release(error){discarded=Boolean(error)}}}};
 await assert.rejects(serializable(pool,async()=>{throw original},{deadline:performance.now()+25}),error=>error.status===503&&error.code==='ROLLBACK_UNCERTAIN'&&error.operationCause===original);assert.equal(discarded,true);
});
test('a COMMIT rejection cannot be aliased back to 403 and diagnostics remain fixed private fields',async()=>{
 const generation=randomUUID(),ctx={purpose:'company',generation,user:{id:randomUUID()},descriptor:{tenantId:A,dataEpoch:'2'}};
 const dbError=Object.assign(Error('WRITE_ACCESS_DENIED'),{code:'P0001'});
 const service=createWriteService({controlPool:{async connect(){return{async query(text){if(text==='COMMIT')throw dbError;return{rows:text.startsWith('SELECT * FROM saas.own_write_intent')?[{status:'PENDING',action:'catalog.create'}]:[]}},release(){}}}},authority:{authorize:async()=>ctx},readerPools:{},writerPools:{},ownerId:randomUUID(),generation});
 await assert.rejects(service.status({authorityContext:ctx,sid:'synthetic',tenantId:A,operationId:randomUUID()}),error=>{
  assert.equal(error.code,'WRITE_UNCERTAIN');assert.equal(error.status,503);assert.equal(error.causeCode,'P0001');assert.equal(error.causeReason,'WRITE_ACCESS_DENIED');assert.equal(Object.keys(error).includes('causeReason'),false);return true;
 });
});
