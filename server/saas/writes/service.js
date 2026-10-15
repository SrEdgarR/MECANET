import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {serializable} from '../admission/transaction.js';
import {failure} from '../auth/validation.js';
import {canonicalWrite,canonicalUuid,decimal,fitPage,validateResult} from './validation.js';
import {readInventory as inventoryRows,readMovements as movementRows,readOperation} from '../repositories/inventory.js';

const terminal=new Set(['CONFIRMED','REJECTED']);
const publicState=state=>terminal.has(state)?state:state==='UNKNOWN'?'UNKNOWN':'PENDING';
const context=a=>({identityId:a.user.id,purpose:a.purpose,contextVersion:a.contextVersion});
const envelope=a=>({tenantId:a.descriptor.tenantId,dataEpoch:String(a.descriptor.dataEpoch),context:context(a)});
const ownCompany=a=>{if(a?.purpose!=='company'||!a.user?.id)throw failure('ACCESS_DENIED',403);return a};
const databaseCodes=new Set(['P0001','42501','22P02','23502','23503','23505','23514','42702','42703','42P01','42883','25006','40001','40P01','53300','57014','57P01','08006']);
const databaseReasons=new Set(['CANONICAL_INPUT_INVALID','LOGICAL_SHAPE_INVALID','LOGICAL_ROW_BOUND_EXCEEDED','LOGICAL_COUNTER_INCONSISTENT','OPERATION_INTEGRITY_UNPROVEN','WRITER_POLICY_UNAVAILABLE','WRITER_FENCE_CLOSED','WRITER_VERSION_CONFLICT','WRITER_POLICY_CONFLICT','IDEMPOTENCY_CONFLICT','CONTROL_ROW_BOUND_EXCEEDED','TRANSITION_BUDGET_EXHAUSTED','WRITE_GUARDS_IMMUTABLE','WRITE_ACCESS_DENIED','WRITE_SESSION_EXPIRED','WRITE_TICKET_INVALID','WRITE_GUARDS_CHANGED','WRITE_RESULT_INVALID','WRITE_RESULT_CONFLICT','GROWTH_QUOTA','CONTROL_GROWTH_QUOTA','LOGICAL_QUOTA','RECONCILIATION_REQUIRED','END_NOT_PROVEN','WRITER_CLOSE_NOT_PROVEN']);
const databaseRelations=new Set(['catalog.products','inventory.writer_fence','inventory.quota_state','inventory.balances','inventory.movements','inventory.operations','inventory.audit','saas.role_policies','saas.action_grants','saas.session_registry','saas.tenant_directory','saas.tenant_writer_state','saas.write_control_quota','saas.write_intents','saas.write_growth_reservations','saas.write_projections','saas.write_transitions','saas.write_restrictions','saas.write_restriction_tenants','saas.admission_fence','saas.policies','saas.tickets','saas.windows','saas.admission_scopes']);
function privateDiagnostic(result,error){
 const code=databaseCodes.has(error.causeCode)?error.causeCode:error.code;
 const reason=databaseReasons.has(error.causeReason)?error.causeReason:error.message;
 const relation=databaseRelations.has(error.causeRelation)?error.causeRelation:`${error.schema}.${error.table}`;
 // Non-enumerable and strictly fixed: never part of the public JSON/error DTO.
 for(const [field,value,allowed] of [['causeCode',code,databaseCodes],['causeReason',reason,databaseReasons],['causeRelation',relation,databaseRelations]])if(allowed.has(value))Object.defineProperty(result,field,{value});
 return result;
}
const safeError=error=>{
 // Missing transaction-end acknowledgement always wins over an original
 // domain/status alias. Diagnostics are fixed allowlisted fields only.
 if(['COMMIT_UNCERTAIN','ROLLBACK_UNCERTAIN'].includes(error.code))return privateDiagnostic(failure('WRITE_UNCERTAIN',503),error.operationCause??error.cause??error);
 const codes={INVALID_WRITE:400,INVALID_QUERY:400,EPOCH_CONFLICT:409,KEY_CONFLICT:409,SKU_CONFLICT:409,OPERATION_PENDING:409,AUTHORITY_CHANGED:409,ACCESS_DENIED:403,SESSION_EXPIRED:401,PRODUCT_LIMIT:429,LOGICAL_QUOTA:429,GLOBAL_QUOTA:429,WRITE_CLOSED:503,TENANT_UNAVAILABLE:503};
 if(Object.hasOwn(codes,error.code))return privateDiagnostic(failure(error.code,codes[error.code]),error);
 // SECURITY DEFINER exceptions use fixed messages only; no raw SQL is returned.
 if(error.code==='P0001'){
  const aliases={WRITE_ACCESS_DENIED:'ACCESS_DENIED',OPERATION_ACCESS_DENIED:'ACCESS_DENIED',WRITE_SESSION_EXPIRED:'SESSION_EXPIRED',WRITER_FENCE_CLOSED:'WRITE_CLOSED',WRITE_INPUT_INVALID:'INVALID_WRITE',IDEMPOTENCY_CONFLICT:'KEY_CONFLICT',GROWTH_QUOTA:'LOGICAL_QUOTA',CONTROL_GROWTH_QUOTA:'GLOBAL_QUOTA',WRITE_GUARDS_CHANGED:'AUTHORITY_CHANGED'};
  const code=aliases[error.message]??error.message;if(Object.hasOwn(codes,code))return privateDiagnostic(failure(code,codes[code]),error);
 }
 return privateDiagnostic(failure('WRITE_UNCERTAIN',503),error);
};

/** API-side protocol. This factory never receives a maintenance credential. */
export function createWriteService({controlPool,authority,writerPools,readerPools,ownerId,generation,recovery=null,checkpoint=async()=>{},now=()=>performance.now()}={}){
 ownerId=canonicalUuid(ownerId);
 if(!controlPool||!authority||!writerPools||!readerPools)throw new Error('WRITE_DEPENDENCIES_REQUIRED');
 const control=async(text,values,deadline=now()+500)=>{
  try{return await serializable(controlPool,async client=>(await client.query(text,values)).rows,{deadline:Math.min(deadline,now()+500)})}
  catch(error){throw safeError(error)}
 };
 const runtimeGuard=async deadline=>{if(recovery&&!await recovery.guard({deadline}))throw failure('SERVICE_UNAVAILABLE')};
 const ownIntent=async(tenantId,operationId,sid,generation,deadline)=>{
  const rows=await control('SELECT * FROM saas.own_write_intent($1::uuid,$2::uuid,$3::text,$4::uuid)',[tenantId,operationId,sid,generation],deadline);
  if(!rows[0])throw failure('NOT_FOUND',404);return rows[0];
 };
 const authorize=async(a,sid,tenantId,action)=>{ownCompany(a);return authority.authorize({sid,purpose:'company',tenantId,action})};
 async function localResult(a,intent,deadline){
  const row=await readerPools.withTenant(a.descriptor,client=>readOperation(client,{operationId:intent.operation_id,actorId:a.user.id,action:intent.action,dataEpoch:String(intent.data_epoch)},{deadline,now}),{deadline});
  if(!row?.result){
   if(intent.status==='REJECTED'&&intent.reason_code==='NO_EFFECT')return {row:null,result:validateResult({operationId:intent.operation_id,state:'REJECTED',code:'NO_EFFECT',dataEpoch:String(intent.data_epoch)})};
   throw failure('WRITE_UNCERTAIN');
  }
  const result=validateResult(row.result);
  if(result.operationId!==intent.operation_id||result.dataEpoch!==String(intent.data_epoch))throw failure('WRITE_RESULT_INVALID');return {row,result};
 }
 async function write({authorityContext,sid,action,productId=null,input,operationId,dataEpoch,ticketId,deadline=now()+8000}){
  await runtimeGuard(deadline);
  const a=ownCompany(authorityContext);if(!a.descriptor)throw failure('ACCESS_DENIED',403);
  operationId=canonicalUuid(operationId);ticketId=canonicalUuid(ticketId);
  const canonical=canonicalWrite({tenantId:a.descriptor.tenantId,actorId:a.user.id,action,productId,dataEpoch,input});
  if(canonical.dataEpoch!==String(a.descriptor.dataEpoch))throw failure('EPOCH_CONFLICT',409);
  let intent;
  try{const rows=await control('SELECT * FROM saas.register_write_intent($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::bigint,$7::text,$8::uuid)',[operationId,canonical.tenantId,sid,a.generation,action,canonical.dataEpoch,canonical.requestHash,ticketId],deadline);intent=rows[0];if(!intent)throw failure('WRITE_CLOSED')}
  catch(error){throw safeError(error)}
  await checkpoint('write.intentDurable',{tenantId:canonical.tenantId,operationId});
  if(terminal.has(intent.status)){
   if(intent.status==='REJECTED'){const projections=await control('SELECT * FROM saas.own_write_projection($1::uuid,$2::uuid,$3::text,$4::uuid)',[canonical.tenantId,operationId,sid,a.generation],deadline);intent.reason_code=projections[0]?.reason_code}
   return (await localResult(await authorize(a,sid,canonical.tenantId,action),intent,deadline)).result;
  }
  // Registration preserves its original HTTP ticket. Even a duplicate in
  // this same API process must not claim using another request's end proof.
  // A terminal same-key replay above remains an authorized result read.
  if(canonicalUuid(intent.ticket_id)!==ticketId)throw failure('OPERATION_PENDING',409);
  let claimed;
  try{const rows=await control('SELECT * FROM saas.claim_write_intent($1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid)',[canonical.tenantId,operationId,sid,a.generation,ownerId],deadline);claimed=rows[0]}
  catch(error){throw safeError(error)}
  if(!claimed)throw failure('OPERATION_PENDING',409);
  try{
   let fresh=await authorize(a,sid,canonical.tenantId,action);
   if(!fresh.writerDescriptor)throw failure('TENANT_UNAVAILABLE');
   await checkpoint('write.beforeTenant',{tenantId:canonical.tenantId,operationId,writerVersion:String(claimed.writer_version)});
   // A delayed owner retains its original fence; it also cannot outlive its
   // session just because its earlier central CAS was valid.
   fresh=await authorize(a,sid,canonical.tenantId,action);
   if(!fresh.writerDescriptor||String(fresh.writerDescriptor.dataEpoch)!==canonical.dataEpoch)throw failure('EPOCH_CONFLICT',409);
   const local=await writerPools.withTenant(fresh.writerDescriptor,async client=>{
    const end=Math.min(deadline,now()+2000);const budget=()=>{const n=Math.floor(end-now());if(n<=0)throw failure('DB_DEADLINE');return n};
    const command=(text,values)=>client.query({text,values,query_timeout:budget()});let committing=false;
    try{
     await command('BEGIN');const ms=budget();await command("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$1,true),set_config('synchronous_commit','on',true)",[`${ms}ms`,`${Math.min(500,ms)}ms`]);
     await checkpoint('write.beforeFunction',{tenantId:canonical.tenantId,operationId});
     await authorize(a,sid,canonical.tenantId,action);
     const fn=action==='catalog.create'?'inventory.create_product':'inventory.receive_stock';
     const result=await command(`SELECT * FROM ${fn}($1::uuid,$2::text,$3::text,$4::uuid,$5::bigint,$6::bigint)`,[operationId,canonical.preimage,canonical.requestHash,claimed.generation,String(claimed.data_epoch),String(claimed.writer_version)]);
     await checkpoint('write.afterFunction',{tenantId:canonical.tenantId,operationId});
     const row=result.rows[0];if(!row)throw failure('WRITE_RESULT_INVALID');validateResult(row.result);
     committing=true;await command('COMMIT');await checkpoint('write.afterTenantCommit',{tenantId:canonical.tenantId,operationId});budget();return row;
    }catch(error){
     if(!committing){
      try{await command('ROLLBACK')}
      catch{throw failure('WRITE_UNCERTAIN')}
     }
     throw error;
    }
   },{deadline});
   const result=validateResult(local.result);
   if(result.operationId!==operationId||result.dataEpoch!==canonical.dataEpoch||typeof local.result_hash!=='string'||!/^[a-f0-9]{64}$/.test(local.result_hash))throw failure('WRITE_RESULT_INVALID');
   const delta=decimal(String(local.logical_delta));if(BigInt(delta)>32768n)throw failure('WRITE_RESULT_INVALID');
   await control('SELECT * FROM saas.project_write_result($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint)',[canonical.tenantId,operationId,ownerId,result.state,local.result_hash,delta,result.state==='CONFIRMED'&&action==='catalog.create'?'1':'0'],deadline);
   await checkpoint('write.projected',{tenantId:canonical.tenantId,operationId});return result;
  }catch(error){
   try{await control('SELECT saas.mark_write_unknown($1::uuid,$2::uuid,$3::uuid) AS marked',[canonical.tenantId,operationId,ownerId])}catch{}
   throw safeError(error);
  }
 }
 async function classifyWork({authorityContext,sid,operationId,deadline=now()+8000}){
  await runtimeGuard(deadline);
  const a=ownCompany(authorityContext);if(!a.descriptor)throw failure('ACCESS_DENIED',403);
  try{const intent=await ownIntent(a.descriptor.tenantId,canonicalUuid(operationId),sid,a.generation,deadline);return terminal.has(intent.status)?1:3}
  catch(error){if(error.status===404)return 3;throw error}
 }
 async function finish({tenantId,operationId,ticketId,sqlSettled,responseSettled}){
  if(sqlSettled!==true||responseSettled!==true)throw failure('END_NOT_PROVEN');
  // The original owner is never replaced by a replaying HTTP request.
  const rows=await control('SELECT saas.finish_write_resources($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::boolean,$6::boolean) AS finished',[canonicalUuid(tenantId),canonicalUuid(operationId),ownerId,canonicalUuid(ticketId),true,true]);
  return rows[0]?.finished===true;
 }
 async function status({authorityContext,sid,tenantId=authorityContext?.descriptor?.tenantId,operationId,deadline=now()+8000}){
  await runtimeGuard(deadline);
  const a=ownCompany(authorityContext);tenantId=canonicalUuid(tenantId);operationId=canonicalUuid(operationId);
  const intent=await ownIntent(tenantId,operationId,sid,a.generation,deadline);const fresh=await authorize(a,sid,tenantId,intent.action);
  if(terminal.has(intent.status)){
   if(intent.status==='REJECTED'){const projections=await control('SELECT * FROM saas.own_write_projection($1::uuid,$2::uuid,$3::text,$4::uuid)',[tenantId,operationId,sid,a.generation],deadline);intent.reason_code=projections[0]?.reason_code}
   const {result}=await localResult(fresh,intent,deadline);return {...envelope(fresh),operationId,state:result.state,result};
  }
  return {...envelope(fresh),operationId,state:publicState(intent.status)};
 }
 async function listOperations({authorityContext,sid,tenantId=authorityContext?.descriptor?.tenantId,query,deadline=now()+8000}){
  await runtimeGuard(deadline);
  const a=ownCompany(authorityContext);tenantId=canonicalUuid(tenantId);
  const scoped=await authority.tenantContext({sid,purpose:'company',tenantId});
  const visible=[];let cursor=query.cursor,scanned=0,exhausted=false;
  // SQL filters at its snapshot; a grant may still be revoked before the fresh
  // per-row check. Continue from the last scanned key to fill this page, while
  // the public continuation remains the last INCLUDED key. A bounded scan
  // which cannot prove exhaustion must fail rather than hide later rows.
  while(visible.length<=query.limit&&!exhausted){
   if(scanned>=404||now()>=deadline)throw failure('WRITE_UNCERTAIN');
   const limit=Math.min(query.limit+1,404-scanned);
   const rows=await control('SELECT * FROM saas.own_pending_writes($1::uuid,$2::text,$3::uuid,$4::uuid,$5::integer)',[tenantId,sid,a.generation,cursor,limit],deadline);
   exhausted=rows.length<limit;
   for(const row of rows){
    if(now()>=deadline)throw failure('WRITE_UNCERTAIN');scanned++;cursor=row.operation_id;
    try{await authorize(a,sid,tenantId,row.action)}catch(error){if(error.status===403)continue;throw error}
    visible.push({operationId:row.operation_id,action:row.action,state:publicState(row.status),createdAt:new Date(row.created_at).toISOString()});
    if(visible.length>query.limit)break;
   }
  }
  return fitPage(visible,envelope(scoped),'items',{maxRows:query.limit,cursorKey:'operationId'});
 }
 async function inventory({authorityContext,query,deadline=now()+8000}){
  await runtimeGuard(deadline);
  const a=ownCompany(authorityContext);const rows=await readerPools.withTenant(a.descriptor,client=>inventoryRows(client,query,{deadline,now}),{deadline});
  return fitPage(rows,envelope(a),'items',{maxRows:query.limit});
 }
 async function movements({authorityContext,productId,query,deadline=now()+8000}){
  await runtimeGuard(deadline);
  const a=ownCompany(authorityContext);productId=canonicalUuid(productId);const rows=await readerPools.withTenant(a.descriptor,client=>movementRows(client,productId,query,{deadline,now}),{deadline});
  const values=rows.map(row=>({...row,recordedAt:new Date(row.recordedAt).toISOString()}));return fitPage(values,{...envelope(a),productId},'items',{maxRows:query.limit});
 }
 async function requestSessionRevocation({sid,ctx,deadline=now()+8000}){
  await runtimeGuard(deadline);
  const a=ownCompany(ctx);const id=randomUUID();const rows=await control('SELECT * FROM saas.request_session_restriction($1::text,$2::uuid,$3::uuid,$4::uuid)',[sid,a.user.id,a.generation,id],deadline);
  const restriction=rows[0];if(!restriction)throw failure('WRITE_CLOSED');
  while(now()<deadline){const state=await control('SELECT * FROM saas.own_session_restriction($1::uuid,$2::text,$3::uuid,$4::uuid)',[restriction.id,sid,a.user.id,a.generation],deadline);if(state[0]?.status==='ACKNOWLEDGED')return true;await sleep(Math.min(40,Math.max(1,deadline-now())))}
  throw failure('WRITE_UNCERTAIN');
 }
 async function ready(){if(recovery)return recovery.guard();try{const rows=await control('SELECT saas.writer_readiness($1::uuid) AS ready',[canonicalUuid(generation)]);return rows[0]?.ready===true}catch{return false}}
 return {write,classifyWork,finish,status,listOperations,readInventory:inventory,readMovements:movements,requestSessionRevocation,ready,ownerId};
}
