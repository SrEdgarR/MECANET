// Real loopback HTTP + standard signed-cookie middleware; SQL remains a fake.
import test from 'node:test';import assert from 'node:assert/strict';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';import {request} from 'node:http';
import {createApp} from '../../../server/saas/app.js';
const tenantId='11111111-1111-4111-8111-111111111111',actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
async function harness({purpose='company',actionAllowed=true,terminal=false}={}){
 const secret=randomBytes(48).toString('hex'),sid=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
 const signed=`s:${sid}.${createHmac('sha256',secret).update(sid).digest('base64').replace(/=+$/,'')}`;
 const events=[];let invocation;
 const sessionPool={async query(){return {rows:[{sess:{cookie:{originalMaxAge:28800000,expires:new Date(Date.now()+28800000).toISOString(),secure:true,httpOnly:true,path:'/',sameSite:'lax'},csrfToken:csrf}}]}}};
 const authority={async authorize(args){if(args.tenantId&&(!actionAllowed||purpose!=='company'))throw Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED',status:403});return {purpose,user:{id:actorId},generation:randomUUID(),contextVersion:'1:test',descriptor:{tenantId,dataEpoch:'2'}}}};
 const admission={ready:()=>true,observeClock:async()=>{},admit:async options=>{events.push(['admit',options.workUnits]);return {id:randomUUID(),state:'ACTIVE'}},startWork:async()=>events.push(['start']),heartbeat:async()=>{},consumeBytes:async()=>events.push(['bytes']),finish:async()=>events.push(['admission-finished']),markUncertain:async()=>events.push(['uncertain'])};
 const writes={classifyWork:async()=>terminal?1:3,write:async args=>{invocation=args;events.push(['write']);return {operationId:args.operationId,state:'CONFIRMED',productId:randomUUID(),movementId:null,onHand:'0',balanceVersion:'1',dataEpoch:'2'}},finish:async()=>events.push(['growth-finished']),readInventory:async()=>({tenantId,dataEpoch:'2',items:[],nextCursor:null})};
 const service=createApp({origin:'https://qa.invalid',sessionPool,sessionSecret:secret,authority,admission,tenantPools:{},writes});
 const server=await new Promise(resolve=>{const s=service.app.listen(0,'127.0.0.1',()=>resolve(s))});
 async function send(path,body,{key=randomUUID(),epoch='2',csrfValue=csrf,origin='https://qa.invalid'}={}){return new Promise((resolve,reject)=>{const payload=JSON.stringify(body);const req=request({host:'127.0.0.1',port:server.address().port,path,method:'POST',headers:{Host:'qa.invalid',Origin:origin,Cookie:'__Host-mecanet-session='+encodeURIComponent(signed),'X-CSRF-Token':csrfValue,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),'Idempotency-Key':key,'X-Data-Epoch':epoch}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}))});req.on('error',reject);req.end(payload)})}
 return {send,events,get invocation(){return invocation},async close(){server.closeAllConnections();await new Promise(r=>server.close(r))}};
}
test('HTTP uses the pre-send ID, three UC and positive end proof before growth settlement',async()=>{const h=await harness();try{const id=randomUUID(),reply=await h.send(`/api/tenants/${tenantId}/products`,{sku:' qa-new ',name:'Nuevo ficticio'},{key:id});assert.equal(reply.status,201);assert.equal(reply.body.operationId,id);await new Promise(setImmediate);assert.equal(h.invocation.operationId,id);assert.deepEqual(h.events,[['admit',3],['start'],['write'],['bytes'],['admission-finished'],['growth-finished']])}finally{await h.close()}});
test('known terminal replay is classified as one UC query',async()=>{const h=await harness({terminal:true});try{assert.equal((await h.send(`/api/tenants/${tenantId}/products`,{sku:'A',name:'A'})).status,201);assert.deepEqual(h.events[0],['admit',1])}finally{await h.close()}});
test('invalid preimage, epoch, key, purpose, grant and CSRF produce zero writer invocations',async()=>{
 for(const config of [{},{purpose:'demo'},{actionAllowed:false}]){const h=await harness(config);try{
  const cases=config.purpose||config.actionAllowed===false?[[{sku:'A',name:'A'},{}]]:[[{sku:'A',name:'x\u0000'},{}],[{sku:'A',name:'A',tenantId},{}],[{sku:'A',name:'A'},{epoch:'1'}],[{sku:'A',name:'A'},{key:'invalid'}],[{sku:'A',name:'A'},{csrfValue:'wrong'}],[{sku:'A',name:'A'},{origin:'https://evil.invalid'}]];
  for(const [body,options]of cases){const reply=await h.send(`/api/tenants/${tenantId}/products`,body,options);assert(reply.status>=400&&reply.status<500);assert.equal(h.invocation,undefined)}
 }finally{await h.close()}}
});
