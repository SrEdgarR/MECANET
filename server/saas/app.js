import express from 'express';
import helmet from 'helmet';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {sessionMiddlewares,csrfMiddleware,csrfToken,saveSession,regenerate} from './auth/sessions.js';
import {validateLogin,parseCatalogQuery,failure} from './auth/validation.js';
import {readCatalog} from './repositories/catalog.js';
import {canonicalWrite,canonicalUuid,parseInventoryQuery,decimal} from './writes/validation.js';

/** No .env, legacy routes, fixture import, or commercial authority in this factory. */
export function createApp({origin,sessionPool,sessionSecret,authority,admission,tenantPools,writes=null,issuer=null,trustedProxy='10.77.32.2',reportError=()=>{},checkpoint=async()=>{}}) {
 if(new URL(origin).protocol!=='https:')throw new Error('HTTPS_REQUIRED');
 const app=express();let draining=false;const active=new Set();let ingress=0;
 // Finite process envelope precedes JSON parsing, session-store access and pool queues.
 app.use((req,res,next)=>{
  if(ingress>=64){res.set('Retry-After','1');return res.status(503).json({error:'SERVICE_UNAVAILABLE'})}
  ingress++;let settled=false,released=false;req.pendingWork=0;req.deadline=performance.now()+8000;req.responseTimedOut=false;
  req.releaseIngress=()=>{if(settled&&!req.pendingWork&&!released){released=true;ingress--;clearTimeout(timer)}};
  const timer=setTimeout(()=>{req.responseTimedOut=true;req.cancelSessionIssuance?.();if(!res.headersSent)res.status(503).json({error:'SERVICE_UNAVAILABLE'});else res.destroy()},8000);timer.unref();
  const settle=()=>{settled=true;req.releaseIngress()};res.once('finish',settle);
  res.once('close',()=>{
   // A peer-aborted response is positive socket evidence, not an elapsed
   // deadline or missing heartbeat. A timeout-generated response is separate.
   if(!req.responseTimedOut&&performance.now()<req.deadline&&!res.writableFinished&&res.destroyed&&req.socket.destroyed)req.peerResponseClosed=true;
   settle();
  });next();
 });
 const wrap=fn=>(req,res,next)=>{req.pendingWork++;Promise.resolve().then(()=>fn(req,res)).catch(next).finally(()=>{req.pendingWork--;req.releaseIngress()})};
 app.disable('x-powered-by');app.set('query parser','simple');
 app.set('trust proxy',ip=>ip===trustedProxy||ip===`::ffff:${trustedProxy}`);
 app.use(helmet({contentSecurityPolicy:false}));
 app.use((req,res,next)=>{
  res.set('Cache-Control','no-store');res.set('X-Request-Id',randomUUID());
  if(req.headers.host!==new URL(origin).host)return res.status(421).json({error:'INVALID_HOST'});
  next();
 });
 app.get('/api/health/live',(_req,res)=>res.json({status:'live'}));
 app.get('/api/health/ready',wrap(async(_req,res)=>{await admission.observeClock();const ready=!draining&&admission.ready()&&(!writes?.ready||await writes.ready());res.status(ready?200:503).json({status:ready?'ready':'unavailable'})}));
 app.use(express.json({limit:'16kb',strict:true,verify:(req,_res,bytes)=>{req.jsonBytes=bytes.length}}));
 const sessions=sessionMiddlewares({pool:sessionPool,secret:sessionSecret});
 app.use('/api',(req,res,next)=>{
  if(draining)return next(failure('DRAINING'));
  // Purpose only selects an isolated standard store; authenticated authority still checks it.
  const cookie=req.headers.cookie??'';
  const present=['company','demo','operator'].filter(p=>cookie.includes(`__Host-mecanet-${p==='company'?'session':p}=`));
  if(present.length>1)return next(failure('AMBIGUOUS_SESSION',400));
  req.purpose=present[0]??(['company','demo','operator'].includes(req.body?.purpose)?req.body.purpose:'company');
  req.pendingWork++;
  sessions[req.purpose](req,res,error=>{try{next(error)}finally{req.pendingWork--;req.releaseIngress()}});
 });
 const ctx=req=>authority.authorize({sid:req.sessionID,purpose:req.purpose});
 const context=a=>({identityId:a.user.id,purpose:a.purpose,contextVersion:a.contextVersion});
 const csrf=csrfMiddleware(origin);

 async function respond(req,res,{tenantId=null,lane='auth',revalidate=async()=>{},reserveBytes=65536,workUnits=1,readOnly=false,onSettled=async()=>{}},operation){
  const deadline=req.deadline;
  await admission.observeClock();
  let ticket=await admission.admit({tenantId,lane,kind:'HTTP',reserveBytes,workUnits});
  active.add(ticket.id);let sqlSettled=false,workAttempted=false,bytesAttempted=false,payloadAccounted=false,responseOwned=false,heartbeat;
  try{
   while(ticket.state==='WAITING'&&performance.now()<deadline){await sleep(40);await admission.observeClock();ticket=await admission.claim(ticket.id,{revalidate});}
   if(ticket.state!=='ACTIVE')throw failure('QUEUE_EXPIRED',503);
   await revalidate();workAttempted=true;await admission.startWork(ticket.id);
   await checkpoint('admission.started',{ticketId:ticket.id,tenantId});
   let beating=false;heartbeat=setInterval(async()=>{if(beating)return;beating=true;try{await admission.heartbeat(ticket.id)}catch{}finally{beating=false}},5000);heartbeat.unref();
   let body;
   try{body=await operation(ticket)}catch(error){if(error.status>=400&&error.status<500){res.status(error.status);body={error:error.code}}else throw error}
   sqlSettled=true;
   if(readOnly&&req.peerResponseClosed)throw failure('RESPONSE_ABORTED');
   const payload=JSON.stringify(body);const bytes=Buffer.byteLength(payload);
   if(bytes>reserveBytes||performance.now()>deadline)throw failure('RESPONSE_LIMIT');
   bytesAttempted=true;await admission.consumeBytes(ticket.id,bytes);
   await checkpoint('admission.bytes',{ticketId:ticket.id,tenantId});
   payloadAccounted=true;
   if(req.responseTimedOut||res.destroyed||res.writableEnded||res.writableFinished||performance.now()>deadline)throw failure('RESPONSE_ABORTED');
   await new Promise(resolve=>{res.once('close',resolve);res.once('finish',resolve);responseOwned=true;res.type('json').send(payload)});
   if(responseOwned&&!req.responseTimedOut&&res.writableFinished){await admission.finish(ticket.id,{sqlSettled:true,responseSettled:true});await onSettled(ticket)}
   else await admission.markUncertain(ticket.id);
  }catch(error){
   try{
    if(!workAttempted||ticket.state==='WAITING'||(sqlSettled&&responseOwned&&!req.responseTimedOut&&res.writableFinished&&payloadAccounted)||
       // Only explicitly read-only work may use this path. The completed
       // operation has awaited its SQL/pool lease; ambiguous SQL or byte
       // accounting retains the original ticket, as do all write handlers.
       (readOnly&&sqlSettled&&req.peerResponseClosed&&(!bytesAttempted||payloadAccounted)))await admission.finish(ticket.id,{sqlSettled:true,responseSettled:true});
    else await admission.markUncertain(ticket.id);
   }catch{}
   throw error;
  }finally{clearInterval(heartbeat);active.delete(ticket.id)}
 }
 app.get('/api/auth/session',wrap(async(req,res)=>{
  await respond(req,res,{},async()=>{
   if(!req.session.csrfToken){req.session.csrfToken=csrfToken();await saveSession(req)}
   try{const a=await ctx(req);return {authenticated:true,csrfToken:req.session.csrfToken,user:a.user,purpose:a.purpose,contextVersion:a.contextVersion}}
   catch(e){if(e.status!==401)throw e;return {authenticated:false,csrfToken:req.session.csrfToken}}
  });
 }));
 app.post('/api/auth/login',csrf,wrap(async(req,res)=>{
  const input=validateLogin(req.body);if(!issuer)throw failure('AUTHORITY_UNAVAILABLE');
  const cancel=()=>{
   req.session=null;
   if(!res.headersSent)res.clearCookie(`__Host-mecanet-${req.purpose==='company'?'session':req.purpose}`,{path:'/',secure:true,httpOnly:true,sameSite:'lax'});
  };
  req.cancelSessionIssuance=cancel;
  try{await respond(req,res,{},async()=>{
   let previous=null;try{const a=await (authority.logoutContext?authority.logoutContext({sid:req.sessionID,purpose:req.purpose}):ctx(req));previous={sid:req.sessionID,identityId:a.user.id,generation:a.generation}}catch(e){if(e.status!==401)throw e}
   const identity=await issuer.verify(input);
   if(identity.purpose!==req.purpose)throw failure('PURPOSE_MISMATCH',403);
    await regenerate(req);
    await issuer.issue({sid:req.sessionID,identity,previous,deadline:req.deadline});
    req.session.csrfToken=csrfToken();req.session.identityId=identity.id;
    req.session.cookie.maxAge=identity.purpose==='demo'?1800000:28800000;
    await saveSession(req);
    const a=await ctx(req);return {authenticated:true,csrfToken:req.session.csrfToken,user:a.user,purpose:a.purpose,contextVersion:a.contextVersion};
  })}catch(error){
   // Covers store, authority, response accounting and lost/deadline responses.
   // Never reactivate the replaced registry entry or implicitly grant a cookie.
   cancel();throw error;
  }finally{req.cancelSessionIssuance=null}
 }));
 app.post('/api/auth/logout',csrf,wrap(async(req,res)=>{
  const logoutContext=()=>authority.logoutContext?authority.logoutContext({sid:req.sessionID,purpose:req.purpose}):ctx(req);
  const a=await logoutContext();
  // Revoke first. A late store upsert cannot reactivate the authoritative registry.
  await respond(req,res,{revalidate:logoutContext},async()=>{
   await authority.revoke(req.sessionID,a,{deadline:req.deadline});
   await new Promise(resolve=>req.session.destroy(()=>resolve()));
   res.clearCookie(`__Host-mecanet-${req.purpose==='company'?'session':req.purpose}`,{path:'/',secure:true,httpOnly:true,sameSite:'lax'});
   return {loggedOut:true};
  });
 }));
 app.post('/api/auth/activity',csrf,wrap(async(req,res)=>{
  const a=await ctx(req);
  await respond(req,res,{revalidate:()=>ctx(req)},async()=>{await authority.activity(req.sessionID,a);return {active:true}});
 }));
 app.get('/api/tenants',wrap(async(req,res)=>{
  const a=await ctx(req);if(a.purpose!=='company')throw failure('ACCESS_DENIED',403);
  await respond(req,res,{revalidate:()=>ctx(req)},async()=>{const result=await authority.tenants(req.sessionID,req.purpose);return {tenants:result.tenants,context:context(result.context)}});
 }));
 app.get('/api/tenants/:tenantId/catalog',wrap(async(req,res)=>{
  const query=parseCatalogQuery(req.query);
  const authorize=()=>authority.authorize({sid:req.sessionID,purpose:req.purpose,tenantId:req.params.tenantId,action:'catalog.read'});
  let a=await authorize();
  await respond(req,res,{tenantId:a.descriptor.tenantId,lane:'ordinary',readOnly:true,reserveBytes:1048576,revalidate:async()=>{a=await authorize()}},async()=>{
   const items=await tenantPools.withTenant(a.descriptor,client=>readCatalog(client,query,{deadline:req.deadline}),{deadline:req.deadline});
   return {tenantId:a.descriptor.tenantId,dataEpoch:a.descriptor.dataEpoch,context:context(a),items,nextCursor:items.length===query.limit?items.at(-1).id:null};
  });
 }));
 if(writes){
  const tenantAuthority=(req,action)=>authority.authorize({sid:req.sessionID,purpose:req.purpose,tenantId:canonicalUuid(req.params.tenantId),action});
  const company=async req=>{const a=await ctx(req);if(a.purpose!=='company')throw failure('ACCESS_DENIED',403);return authority.tenantContext({sid:req.sessionID,purpose:req.purpose,tenantId:canonicalUuid(req.params.tenantId)})};
  const writeRoute=action=>wrap(async(req,res)=>{
   let a=await tenantAuthority(req,action);
   if(req.jsonBytes>8192)throw failure('INVALID_WRITE',400);
   const operationId=canonicalUuid(req.headers['idempotency-key']);
   const dataEpoch=decimal(req.headers['x-data-epoch'],{positive:true});
   const productId=action==='inventory.receive'?canonicalUuid(req.params.productId):null;
   canonicalWrite({tenantId:a.descriptor.tenantId,actorId:a.user.id,action,dataEpoch,productId,input:req.body});
   if(dataEpoch!==String(a.descriptor.dataEpoch))throw failure('EPOCH_CONFLICT',409);
   const workUnits=await writes.classifyWork({authorityContext:a,sid:req.sessionID,operationId,deadline:req.deadline});
   await respond(req,res,{tenantId:a.descriptor.tenantId,lane:'ordinary',workUnits,revalidate:async()=>{a=await tenantAuthority(req,action)},onSettled:ticket=>writes.finish({tenantId:a.descriptor.tenantId,operationId,ticketId:ticket.id,sqlSettled:true,responseSettled:true})},async ticket=>{
    const result=await writes.write({authorityContext:a,sid:req.sessionID,action,productId,input:req.body,operationId,dataEpoch,ticketId:ticket.id,deadline:req.deadline});
    res.status(result.state==='CONFIRMED'?201:409);return result;
   });
  });
  app.post('/api/tenants/:tenantId/products',csrf,writeRoute('catalog.create'));
  app.post('/api/tenants/:tenantId/products/:productId/stock-receipts',csrf,writeRoute('inventory.receive'));
  app.get('/api/tenants/:tenantId/inventory',wrap(async(req,res)=>{
   const query=parseInventoryQuery(req.query);let a=await tenantAuthority(req,'inventory.read');
   await respond(req,res,{tenantId:a.descriptor.tenantId,lane:'ordinary',readOnly:true,revalidate:async()=>{a=await tenantAuthority(req,'inventory.read')}},()=>writes.readInventory({authorityContext:a,query,deadline:req.deadline}));
  }));
  app.get('/api/tenants/:tenantId/products/:productId/stock-movements',wrap(async(req,res)=>{
   const query=parseInventoryQuery(req.query),productId=canonicalUuid(req.params.productId);let a=await tenantAuthority(req,'inventory.read');
   await respond(req,res,{tenantId:a.descriptor.tenantId,lane:'ordinary',readOnly:true,revalidate:async()=>{a=await tenantAuthority(req,'inventory.read')}},()=>writes.readMovements({authorityContext:a,query,productId,deadline:req.deadline}));
  }));
  app.get('/api/tenants/:tenantId/operations',wrap(async(req,res)=>{
   const query=parseInventoryQuery(req.query,{pending:true}),tenantId=canonicalUuid(req.params.tenantId);let a=await company(req);
   await respond(req,res,{tenantId,lane:'ordinary',readOnly:true,revalidate:async()=>{a=await company(req)}},()=>writes.listOperations({authorityContext:a,sid:req.sessionID,tenantId,query,deadline:req.deadline}));
  }));
  app.get('/api/tenants/:tenantId/operations/:operationId',wrap(async(req,res)=>{
   if(Object.keys(req.query).length)throw failure('INVALID_QUERY',400);
   const tenantId=canonicalUuid(req.params.tenantId),operationId=canonicalUuid(req.params.operationId);let a=await company(req);
   await respond(req,res,{tenantId,lane:'ordinary',readOnly:true,revalidate:async()=>{a=await company(req)}},()=>writes.status({authorityContext:a,sid:req.sessionID,tenantId,operationId,deadline:req.deadline}));
  }));
 }
 app.use('/api',(_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
 app.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
 app.use((error,_req,res,_next)=>{
  if(res.headersSent||res.destroyed)return;
  const allowed=new Set(['INVALID_LOGIN','INVALID_CREDENTIALS','PURPOSE_MISMATCH','INVALID_TENANT','INVALID_QUERY','INVALID_ORIGIN','CSRF_REJECTED','SESSION_EXPIRED','ACCESS_DENIED','TENANT_UNAVAILABLE','TENANT_QUOTA','GLOBAL_QUOTA','CLOCK_UNAVAILABLE','QUEUE_EXPIRED','ADMISSION_CLOSED','DRAINING','AUTHORITY_UNAVAILABLE','AUTHORITY_CHANGED','INVALID_WRITE','EPOCH_CONFLICT','KEY_CONFLICT','SKU_CONFLICT','OPERATION_PENDING','PRODUCT_LIMIT','LOGICAL_QUOTA','WRITE_CLOSED','WRITE_UNCERTAIN','NOT_FOUND']);
  const code=allowed.has(error.code)?error.code:'SERVICE_UNAVAILABLE';
  const status=Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:503;
  const diagnostic=new Set([...allowed,'ADMISSION_BUSY','COMMIT_UNCERTAIN','ROLLBACK_UNCERTAIN','CLOCK_INCONSISTENT','POLICY_UNAVAILABLE','RESPONSE_LIMIT','RESPONSE_ABORTED','END_NOT_PROVEN','WORK_ALREADY_STARTED','PAYLOAD_EXCEEDS_RESERVATION','RECONCILIATION_REQUIRED','DB_DEADLINE','40001','40P01','42501','53300','57014','57P01']);
  const errorType=error instanceof TypeError?'TypeError':error instanceof RangeError?'RangeError':'Error';
  // Only these built-in source locations can enter a diagnostic, never a raw
  // stack/message, SQL or request/session data.
  const location=String(error.stack??'').match(/server\/saas\/(?:app|auth\/(?:authority|sessions)|admission\/(?:index|transaction))\.js:\d+:\d+/)?.[0];
  const causeCode=new Set(['P0001','40001','40P01','42501','42702','42703','23505','23503','23514','22003','53300','57014','57P01','COMMIT_UNCERTAIN','DB_DEADLINE']).has(error.causeCode)?error.causeCode:undefined;
  const causeReason=new Set(['CANONICAL_INPUT_INVALID','IDEMPOTENCY_CONFLICT','WRITER_FENCE_CLOSED','WRITE_SESSION_EXPIRED','WRITE_ACCESS_DENIED','WRITE_GUARDS_CHANGED','GROWTH_QUOTA','CONTROL_GROWTH_QUOTA','OPERATION_ACCESS_DENIED']).has(error.causeReason)?error.causeReason:undefined;
  const causeRelation=new Set(['balances','movements','writer_fence','quota_state','operations','audit','products','write_intents','write_growth_reservations','write_projections','tenant_writer_state']).has(error.causeRelation)?error.causeRelation:undefined;
  try{reportError({requestId:res.getHeader('X-Request-Id'),code:diagnostic.has(error.code)?error.code:'UNCLASSIFIED',status,errorType,...(location?{location}:{}),...(causeCode?{causeCode}:{}),...(causeReason?{causeReason}:{}),...(causeRelation?{causeRelation}:{})})}catch{}
  if(status===429||status===503)res.set('Retry-After','1');
  res.status(status).json({error:code});
 });
 return {app,async drain(){draining=true;const deadline=Date.now()+30000;while(active.size&&Date.now()<deadline)await sleep(25);return active.size===0},state:()=>({draining,active:active.size})};
}
