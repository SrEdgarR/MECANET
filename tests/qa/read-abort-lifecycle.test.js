// Actual loopback socket abort and pool lifecycle, synthetic SQL/admission.
// This is contract evidence; it does not claim PostgreSQL or host QA evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../../server/saas/app.js';
import {createTenantPoolManager} from '../../server/saas/db/pools.js';

const tenantId='11111111-1111-4111-8111-111111111111';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}};
async function abortedCase(kind){
 const secret=randomBytes(48).toString('hex'),sid=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
 const signed=`s:${sid}.${createHmac('sha256',secret).update(sid).digest('base64').replace(/=+$/,'')}`;
 const descriptor={tenantId,dbName:'mecanet_tenant_a',secretRef:'tenant-a-read',credentialVersion:1,dataEpoch:1,schemaVersion:1,status:'active',purpose:'company'};
 const events=[],entered=deferred(),release=deferred(),closed=deferred();let qt=1048576,finished=0,uncertain=0,writeFinished=0;
 const scoped={user:{id:randomUUID()},purpose:'company',generation:randomUUID(),contextVersion:1,descriptor};
 const sessionPool={async query(text){assert.match(text,/^SELECT sess/);return{rows:[{sess:{cookie:{originalMaxAge:28800000,expires:new Date(Date.now()+28800000).toISOString(),secure:true,httpOnly:true,path:'/',sameSite:'lax'},csrfToken:csrf}}]}}};
 const pools=createTenantPoolManager({resolveSecret:async()=>({host:'postgres',port:5432,database:descriptor.dbName,user:'saas_tenant_a',password:'synthetic-only',ssl:{ca:'synthetic',rejectUnauthorized:true}}),createPool:async()=>({
  connect:async()=>({async query(input){
   if(input.text.startsWith('SELECT id')){events.push('read-started');if(kind!=='byte-uncertain'){entered.resolve();await release.promise}if(kind==='sql-uncertain')throw Object.assign(Error('DB_DEADLINE'),{code:'DB_DEADLINE'});return{rows:[]}}
   if(input.text==='COMMIT')events.push('read-commit-ack');return{rows:[]};
  },release(discard){events.push(discard?'client-discarded':'client-released')}}),end:async()=>{}
 })});
 const ticket={id:randomUUID(),state:'ACTIVE'};
 const admission={async observeClock(){},ready:()=>true,async admit(){events.push('admitted');return ticket},async startWork(){events.push('qc-consumed')},async heartbeat(){},async consumeBytes(){
  events.push('bytes-started');if(kind==='byte-uncertain'){entered.resolve();await release.promise;throw Object.assign(Error('COMMIT_UNCERTAIN'),{code:'COMMIT_UNCERTAIN'})}events.push('bytes-ack');
 },async finish(_id,proof){assert.deepEqual(proof,{sqlSettled:true,responseSettled:true});finished++;qt=0;events.push('finished')},async markUncertain(){uncertain++;events.push('uncertain')}};
 const writes=kind.startsWith('writer-')?{async ready(){return true},async classifyWork(){return 3},async write({operationId}){events.push('writer-commit-ack');entered.resolve();await release.promise;if(kind==='writer-uncertain')throw Object.assign(Error('WRITE_UNCERTAIN'),{code:'WRITE_UNCERTAIN',status:503});events.push('writer-confirmed-return');return{operationId,state:'CONFIRMED',productId:randomUUID(),movementId:null,onHand:'0',balanceVersion:'1',dataEpoch:'1'}},async finish(){writeFinished++}}:null;
 const instance=createApp({origin:'https://qa.invalid',trustedProxy:'127.0.0.1',sessionPool,sessionSecret:secret,authority:{authorize:async()=>scoped},admission,tenantPools:pools,writes});
 const server=await new Promise(r=>{const s=instance.app.listen(0,'127.0.0.1',()=>r(s))});
 server.on('connection',socket=>socket.once('close',()=>{events.push('server-socket-closed');closed.resolve()}));
 let req;
 try{
  const isWriter=kind.startsWith('writer-'),body=isWriter?JSON.stringify({sku:'ABORT',name:'Synthetic abort'}):null;
  req=http.request({host:'127.0.0.1',port:server.address().port,path:`/api/tenants/${tenantId}/${isWriter?'products':'catalog'}`,method:isWriter?'POST':'GET',headers:{Host:'qa.invalid','X-Forwarded-Proto':'https',Origin:'https://qa.invalid',Cookie:`__Host-mecanet-session=${encodeURIComponent(signed)}`,...(isWriter?{'X-CSRF-Token':csrf,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Idempotency-Key':randomUUID(),'X-Data-Epoch':'1'}:{})}});
  req.on('error',()=>{});if(body)req.write(body);req.end();
  await entered.promise;req.destroy();
  // The real server socket must close before SQL is released, rather than a
  // synthetic boolean or TTL being supplied as proof of response completion.
  await closed.promise;release.resolve();
  for(let i=0;i<100&&instance.state().active;i++)await delay(5);
  assert.equal(instance.state().active,0);assert.equal(pools.snapshot().leased,0);
  if(kind==='read-positive'){
   assert(events.includes('read-commit-ack'));assert(events.includes('client-released'));
   assert.equal(finished,1,'actual aborted read must release Qt/slot only after known SQL end');
   assert(events.indexOf('client-released')<events.indexOf('finished'),'lease ends before read ticket finish');
   assert.equal(qt,0);assert.equal(uncertain,0);assert(!events.includes('bytes-started'),'no payload work after the peer socket has closed');
  }else{
   assert.equal(finished,0);assert.equal(qt,1048576);assert.equal(uncertain,1);
   if(kind==='sql-uncertain')assert(!events.includes('read-commit-ack'));
   if(kind==='byte-uncertain')assert(!events.includes('bytes-ack'));
   if(kind.startsWith('writer-')){assert(events.includes('writer-commit-ack'));assert.equal(writeFinished,0);if(kind==='writer-confirmed')assert(events.includes('writer-confirmed-return'))}
  }
  return events;
 }finally{release.resolve();req?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));await pools.close()}
}
test('peer-aborted catalog read releases only after positive COMMIT and actual pool lease end',{timeout:5000},()=>abortedCase('read-positive'));
test('peer close cannot release a read with unknown SQL completion',{timeout:5000},()=>abortedCase('sql-uncertain'));
test('peer close cannot release unknown byte-accounting commit',{timeout:5000},()=>abortedCase('byte-uncertain'));
test('a writer with lost result after tenant COMMIT retains ticket and growth despite peer close',{timeout:5000},()=>abortedCase('writer-uncertain'));
test('a returned confirmed write cannot borrow the explicitly read-only peer-close finish path',{timeout:5000},()=>abortedCase('writer-confirmed'));
