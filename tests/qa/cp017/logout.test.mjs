// Loopback HTTP and signed-cookie middleware. These tests do not prove SQL fencing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import {request} from 'node:http';
import {createApp} from '../../../server/saas/app.js';
import {createAuthority} from '../../../server/saas/auth/authority.js';

const unavailable=()=>Object.assign(Error('WRITE_UNCERTAIN'),{code:'WRITE_UNCERTAIN',status:503});
async function harness(){
 const secret=randomBytes(48).toString('hex'),sid=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
 const signed=`s:${sid}.${createHmac('sha256',secret).update(sid).digest('base64').replace(/=+$/,'')}`;
 const scope={user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'},purpose:'company',generation:randomUUID(),contextVersion:'1:fixture'};
 let acknowledged=false,destroyed=false,revokeCalls=0,logoutContexts=0;
 const sessionPool={async query(value){if(typeof value==='string'&&value.startsWith('DELETE'))destroyed=true;return {rows:[{sess:{cookie:{originalMaxAge:28800000,expires:new Date(Date.now()+28800000).toISOString(),secure:true,httpOnly:true,path:'/',sameSite:'lax'},csrfToken:csrf}}]}}};
 const authority={
  async authorize(){throw Object.assign(Error('SESSION_EXPIRED'),{code:'SESSION_EXPIRED',status:401})},
  async logoutContext(){logoutContexts++;return scope},
  async revoke(receivedSid,receivedScope,{deadline}){assert.equal(receivedSid,sid);assert.deepEqual(receivedScope,scope);assert(deadline>performance.now());revokeCalls++;if(!acknowledged)throw unavailable();return true}
 };
 const admission={observeClock:async()=>{},admit:async()=>({id:randomUUID(),state:'ACTIVE'}),startWork:async()=>{},heartbeat:async()=>{},consumeBytes:async()=>{},finish:async()=>{},markUncertain:async()=>{}};
 const service=createApp({origin:'https://qa.invalid',sessionPool,sessionSecret:secret,authority,admission,tenantPools:{}});
 const server=await new Promise(resolve=>{const s=service.app.listen(0,'127.0.0.1',()=>resolve(s))});
 async function logout(){return new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port:server.address().port,path:'/api/auth/logout',method:'POST',headers:{Host:'qa.invalid',Origin:'https://qa.invalid',Cookie:'__Host-mecanet-session='+encodeURIComponent(signed),'X-CSRF-Token':csrf,'Content-Type':'application/json'}},res=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(data),cookies:res.headers['set-cookie']??[]}))});req.on('error',reject);req.end('{}')})}
 return {logout,acknowledge(){acknowledged=true},get destroyed(){return destroyed},get revokeCalls(){return revokeCalls},get logoutContexts(){return logoutContexts},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}

test('retry of a restricted company logout remains unavailable until private close acknowledgement',async()=>{
 const h=await harness();try{
  for(let retry=0;retry<2;retry++){const reply=await h.logout();assert.equal(reply.status,503);assert.equal(reply.body.error,'WRITE_UNCERTAIN');assert.equal(reply.body.loggedOut,undefined);assert.equal(reply.cookies.length,0)}
  assert.equal(h.destroyed,false);assert.equal(h.revokeCalls,2);assert(h.logoutContexts>=2);
 }finally{await h.close()}
});

test('the same restricted logout resumes to a terminal response only after acknowledged close',async()=>{
 const h=await harness();try{
  assert.equal((await h.logout()).status,503);h.acknowledge();const reply=await h.logout();
  assert.equal(reply.status,200);assert.deepEqual(reply.body,{loggedOut:true});assert(reply.cookies.some(value=>value.includes('__Host-mecanet-session=;')));assert.equal(h.destroyed,true);
 }finally{await h.close()}
});

test('pending company logout context resumes only the session-owned close and grants no tenant capability',async()=>{
 const generation=randomUUID(),writerSessionRef=randomUUID(),actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';let statement;
 const authority=createAuthority({async query(input){statement=input;return {rows:[{id:actorId,email:'fixture@example.invalid',security_version:'7',generation,writer_session_ref:writerSessionRef,status:'revoked',session_security_version:'6',logout_pending:true}]}}},generation,{writersEnabled:true});
 const ctx=await authority.logoutContext({sid:'synthetic-signed-session',purpose:'company'});
 assert.deepEqual(ctx,{user:{id:actorId,email:'fixture@example.invalid'},purpose:'company',contextVersion:`7:${generation}`,generation,writerSessionRef,logoutPending:true});
 for(const forbidden of ['descriptor','writerDescriptor','permissions','tenantId','action'])assert.equal(Object.hasOwn(ctx,forbidden),false);
 assert.deepEqual(statement.values,['synthetic-signed-session',generation]);
 assert.match(statement.text,/x\.session_ref=r\.writer_session_ref/);assert.match(statement.text,/\(x\.identity_id IS NULL OR x\.identity_id=i\.id\)/);assert.match(statement.text,/x\.reason_code='LOGOUT'/);assert.match(statement.text,/x\.status<>'ACKNOWLEDGED'/);
});

test('without a pending session-owned logout, ordinary expired authority remains 401',async()=>{
 const generation=randomUUID();let calls=0;
 const authority=createAuthority({async query(){calls++;return {rows:calls===1?[{id:randomUUID(),generation,logout_pending:false}]:[]}}},generation,{writersEnabled:true});
 await assert.rejects(()=>authority.logoutContext({sid:'expired-fixture',purpose:'company'}),error=>error.status===401&&error.code==='SESSION_EXPIRED');assert.equal(calls,2);
});

test('demo and operator cannot adopt the company pending-close bypass',async()=>{
 for(const purpose of ['demo','operator']){let statement;const authority=createAuthority({async query(input){statement=input;return {rows:[]}}},randomUUID(),{writersEnabled:true});await assert.rejects(()=>authority.logoutContext({sid:'wrong-purpose-fixture',purpose}),error=>error.status===401);assert.doesNotMatch(statement.text,/logout_pending/);assert.equal(statement.values[1],purpose)}
});
