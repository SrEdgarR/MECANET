// Loopback Express/session contracts with synthetic doubles, not SQL evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import {createApp} from '../../server/saas/app.js';
import {failure} from '../../server/saas/auth/validation.js';

const tenantId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',foreignTenant='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',operationId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function withApp({purpose='company',grant=true,uncertain=false}={},callback){
 const secret=randomBytes(48).toString('hex'),sid=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url'),actorId=randomUUID(),generation=randomUUID();
 const cookieName=`__Host-mecanet-${purpose==='company'?'session':purpose}`;const signed=`s:${sid}.${createHmac('sha256',secret).update(sid).digest('base64').replace(/=+$/,'')}`;
 const stats={admissions:0,effects:0,lookups:0};
 const base={user:{id:actorId},purpose,generation,contextVersion:`1:${generation}`};
 const scoped={...base,descriptor:{tenantId,dataEpoch:'1',schemaVersion:2},writerDescriptor:{tenantId,dataEpoch:'1',schemaVersion:2}};
 const authorize=async({tenantId:requested=null})=>{if(requested&&(purpose!=='company'||requested!==tenantId||!grant))throw failure('ACCESS_DENIED',403);return requested?scoped:base};
 const authority={authorize,tenantContext:authorize,revoke:async()=>{}};
 const pool={async query(text){if(text.startsWith('SELECT sess'))return {rows:[{sess:{cookie:{originalMaxAge:28800000,expires:new Date(Date.now()+28800000).toISOString(),secure:true,httpOnly:true,path:'/',sameSite:'lax'},csrfToken:csrf}}]};return {rows:[]}}};
 const admission={async observeClock(){},ready:()=>true,async admit(){stats.admissions++;return {id:randomUUID(),state:'ACTIVE'}},async startWork(){},async heartbeat(){},async consumeBytes(){},async finish(){},async markUncertain(){}};
 const writes={async classifyWork(){return 3},async ready(){return true},async write(){stats.effects++;if(uncertain)throw failure('WRITE_UNCERTAIN');return {operationId,state:'CONFIRMED',productId:randomUUID(),movementId:null,onHand:'0',balanceVersion:'1',dataEpoch:'1'}},async finish(){},async listOperations({tenantId:requested}){stats.lookups++;if(requested!==tenantId)throw failure('ACCESS_DENIED',403);return {tenantId,dataEpoch:'1',context:{identityId:actorId,purpose,contextVersion:base.contextVersion},items:[],nextCursor:null}},async status({tenantId:requested}){stats.lookups++;if(requested!==tenantId)throw failure('ACCESS_DENIED',403);return {tenantId,dataEpoch:'1',context:{identityId:actorId,purpose,contextVersion:base.contextVersion},operationId,state:'PENDING'}}};
 const service=createApp({origin:'https://qa.invalid',trustedProxy:'127.0.0.1',sessionPool:pool,sessionSecret:secret,authority,admission,tenantPools:{},writes});
 const server=await new Promise(resolve=>{const s=service.app.listen(0,'127.0.0.1',()=>resolve(s))});
 const request=(path,{body=null,headers={},method=body?'POST':'GET'}={})=>new Promise((resolve,reject)=>{
  const payload=body===null?null:JSON.stringify(body);
  const req=http.request({host:'127.0.0.1',port:server.address().port,path,method,headers:{Host:'qa.invalid','X-Forwarded-Proto':'https',Cookie:`${cookieName}=${encodeURIComponent(signed)}`,Origin:'https://qa.invalid','X-CSRF-Token':csrf,...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),'Idempotency-Key':operationId,'X-Data-Epoch':'1'}:{}),...headers}},res=>{let content='';res.on('data',chunk=>content+=chunk);res.on('end',()=>resolve({status:res.statusCode,json:JSON.parse(content)}))});req.on('error',reject);if(payload)req.write(payload);req.end();
 });
 try{await callback({request,stats})}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
for(const purpose of ['demo','operator'])test(`${purpose} cannot acquire a company write ticket or execute inventory`,async()=>withApp({purpose},async({request,stats})=>{assert.equal((await request(`/api/tenants/${tenantId}/products`,{body:{sku:'A',name:'Test'}})).status,403);assert.deepEqual(stats,{admissions:0,effects:0,lookups:0})}));
test('missing exact action grant is denied before admission and writer use',async()=>withApp({grant:false},async({request,stats})=>{assert.equal((await request(`/api/tenants/${tenantId}/products`,{body:{sku:'A',name:'Test'}})).status,403);assert.equal(stats.admissions,0);assert.equal(stats.effects,0)}));
test('forged body tenant and Unicode NUL fail before intent admission',async()=>withApp({},async({request,stats})=>{for(const body of [{sku:'A',name:'Test',tenantId:foreignTenant},{sku:'A',name:'\u0000'}])assert.equal((await request(`/api/tenants/${tenantId}/products`,{body})).status,400);assert.equal(stats.admissions,0);assert.equal(stats.effects,0)}));
test('lost or mismatched pre-send guards cannot become new write intents',async()=>withApp({},async({request,stats})=>{assert.equal((await request(`/api/tenants/${tenantId}/products`,{body:{sku:'A',name:'Test'},headers:{'Idempotency-Key':''}})).status,400);assert.equal((await request(`/api/tenants/${tenantId}/products`,{body:{sku:'A',name:'Test'},headers:{'X-Data-Epoch':'2'}})).status,409);assert.equal(stats.admissions,0);assert.equal(stats.effects,0)}));
for(const suffix of ['operations',`operations/${operationId}`])test(`foreign ${suffix} cannot consume the other tenant admission budget`,async()=>withApp({},async({request,stats})=>{assert.equal((await request(`/api/tenants/${foreignTenant}/${suffix}`)).status,403);assert.deepEqual(stats,{admissions:0,effects:0,lookups:0})}));
test('unknown effect response never claims confirmation or stock rollback',async()=>withApp({uncertain:true},async({request,stats})=>{const response=await request(`/api/tenants/${tenantId}/products`,{body:{sku:'A',name:'Test'}});assert.equal(response.status,503);assert.deepEqual(response.json,{error:'WRITE_UNCERTAIN'});assert.equal(stats.effects,1)}));
