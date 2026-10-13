// Regression: real Express + express-session + connect-pg-simple on loopback.
// SQL/issuer/admission are doubles; this file is NOT PostgreSQL integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import http from 'node:http';
import {createApp} from '../../../server/saas/app.js';

for(const phase of ['store','accounting','deadline'])test(`failed login at ${phase} after registry commit cannot auto-save an authenticated cookie in a 503 response`,async()=>{
 const store=new Map(),registry=new Map();let committed=false,failed=false,csrf,cookie='';
 const identity={id:randomUUID(),email:'fixture@qa.invalid',purpose:'company',security_version:1};
 const pool={async query(text,values){
  if(text.startsWith('SELECT sess'))return {rows:store.has(values[0])?[{sess:structuredClone(store.get(values[0]))}]:[]};
  if(text.startsWith('DELETE FROM')){store.delete(values[0]);return {rows:[]}}
  if(text.startsWith('INSERT INTO')){if(phase==='store'&&committed&&!failed){failed=true;throw Object.assign(new Error('CONTROLLED_STORE_FAILURE'),{code:'CONTROLLED_STORE_FAILURE'})}store.set(values[2],structuredClone(values[0]));return {rows:[{sid:values[2]}]}}
  throw new Error('UNEXPECTED_FAKE_SQL');
 }};
 const authority={async authorize({sid}){const value=registry.get(sid);if(!value)throw Object.assign(new Error('SESSION_EXPIRED'),{code:'SESSION_EXPIRED',status:401});return {user:{id:identity.id,email:identity.email},purpose:'company',generation:value,contextVersion:'1'}},async revoke(sid){registry.delete(sid)}};
 const admission={observeClock:async()=>{},ready:()=>true,admit:async()=>({id:randomUUID(),state:'ACTIVE'}),startWork:async()=>{},consumeBytes:async()=>{if(committed&&phase!=='store'){failed=true;if(phase==='deadline')await new Promise(resolve=>setTimeout(resolve,8100));else throw new Error('CONTROLLED_ACCOUNTING_FAILURE')}},finish:async()=>{},markUncertain:async()=>{},heartbeat:async()=>{}};
 const issuer={verify:async()=>identity,async issue({sid,previous}){if(previous)registry.delete(previous.sid);registry.set(sid,randomUUID());committed=true}};
 const service=createApp({origin:'https://qa.invalid',trustedProxy:'127.0.0.1',sessionPool:pool,sessionSecret:randomBytes(48).toString('hex'),authority,admission,issuer,tenantPools:{}});
 const server=await new Promise(resolve=>{const s=service.app.listen(0,'127.0.0.1',()=>resolve(s))});
 const request=(path,body)=>new Promise((resolve,reject)=>{
  const payload=body?JSON.stringify(body):null;
  const req=http.request({host:'127.0.0.1',port:server.address().port,path,method:payload?'POST':'GET',headers:{Host:'qa.invalid','X-Forwarded-Proto':'https',Cookie:cookie,...(payload?{Origin:'https://qa.invalid','X-CSRF-Token':csrf,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,json:JSON.parse(text)}))});req.on('error',reject);if(payload)req.write(payload);req.end();
 });
 try{
  const initial=await request('/api/auth/session');assert.equal(initial.status,200);csrf=initial.json.csrfToken;cookie=initial.headers['set-cookie'][0].split(';')[0];
  const login=await request('/api/auth/login',{email:identity.email,password:'synthetic-secret'});
  assert.equal(login.status,503);assert(failed&&committed);if(phase==='deadline')await new Promise(resolve=>setTimeout(resolve,150));
  const emitted=(login.headers['set-cookie']??[]).filter(c=>!/^__Host-mecanet-session=;/.test(c));
  assert.equal(emitted.length,0,'An error after registry COMMIT must not deliver an authenticated cookie');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
