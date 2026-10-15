import {randomUUID} from 'node:crypto';
import {serializable} from '../admission/transaction.js';
import {failure} from '../auth/validation.js';
import {canonicalUuid,decimal,validateResult} from './validation.js';

export const canReopen=reason=>['LOGOUT','IDENTITY','MEMBERSHIP','GRANT'].includes(reason);
export function assertFence(actual,expected,state){
 const version=state==='CLOSED'?expected.closed_version:expected.reopen_version;
 if(!actual||actual.generation!==expected.generation||String(actual.data_epoch)!==String(expected.data_epoch)||String(actual.writer_version)!==String(version)||actual.state!==state)throw failure('CLOSURE_NOT_PROVEN');
 return actual;
}
const reasons=new Set(['LOGOUT','IDENTITY','MEMBERSHIP','GRANT','TENANT','EPOCH','ROTATION','RESTORE','SHUTDOWN','POLICY']);

/** Private module: its maintenance pools must never be passed to createApp. */
export function createRestrictiveCoordinator({controlPool,maintenancePools,resolveDescriptor,generation,recovery=null,checkpoint=async()=>{},now=()=>performance.now(),applyRestriction=null,verifyEndProof=null,verifyPromotion=null,maxIntentsPerPass=8}={}){
 generation=canonicalUuid(generation);
 if(!controlPool||!maintenancePools||typeof resolveDescriptor!=='function'||!Number.isInteger(maxIntentsPerPass)||maxIntentsPerPass<1||maxIntentsPerPass>32)throw new Error('PRIVATE_WRITER_DEPENDENCIES_REQUIRED');
 if(recovery&&applyRestriction)throw new Error('PRIVATE_WRITER_COMPOSITION_REJECTED');
 let running=false;
 const transaction=fn=>serializable(controlPool,fn,{deadline:now()+500});
 const central=async(text,values)=>(await transaction(async client=>(await client.query(text,values)).rows));
 const normalGuard=async()=>{if(recovery&&!await recovery.maintenanceGuard())throw failure('RECOVERY_PENDING')};
 const step=async(id,tenant,phase,operation=null)=>{
  await normalGuard();
  const rows=await central('SELECT saas.restriction_step($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid) AS changed',[id,tenant,generation,phase,operation]);
  if(rows[0]?.changed!==true)throw failure('RESTRICTION_PENDING');
 };
 async function business(guard,fn){
  const descriptor=await resolveDescriptor(guard);
  if(!descriptor||descriptor.tenantId!==guard.tenant_id)throw failure('MAINTENANCE_DESCRIPTOR_MISMATCH');
  const deadline=now()+2000;
  return maintenancePools.withTenant(descriptor,async client=>{
   const budget=()=>{const n=Math.floor(deadline-now());if(n<=0)throw failure('DB_DEADLINE');return n};
   const command=(text,values)=>client.query({text,values,query_timeout:budget()});let committing=false;
   try{await command('BEGIN');const ms=budget();await command("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$1,true),set_config('synchronous_commit','on',true)",[`${ms}ms`,`${Math.min(500,ms)}ms`]);const result=await fn(command);committing=true;await command('COMMIT');budget();return result}
   catch(error){if(!committing){try{await command('ROLLBACK')}catch{}}throw error}
  },{deadline});
 }
 async function lockCentral(client,tenantId=null){
  const fence=await client.query('UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 AND generation=$1::uuid RETURNING id',[generation]);if(!fence.rows.length)throw failure('ADMISSION_CLOSED');
  if(tenantId)await client.query('SELECT tenant_id FROM saas.tenant_writer_state WHERE tenant_id=$1::uuid FOR UPDATE',[tenantId]);
 }
 async function setStage(guard,stage,{closeProven=false}={}){
  if(recovery){await step(guard.restriction_id,guard.tenant_id,stage);return}
  await transaction(async client=>{
   await lockCentral(client,guard.tenant_id);
   const values=[guard.restriction_id,guard.tenant_id,stage,closeProven];
   await client.query('UPDATE saas.write_restriction_tenants SET stage=$3::text,close_proven=close_proven OR $4::boolean WHERE restriction_id=$1::uuid AND tenant_id=$2::uuid',values);
   const cost=await client.query('SELECT saas.write_barrier_cost()<=(SELECT barrier_max_bytes FROM saas.write_control_quota WHERE id=1) AS bounded');if(cost.rows[0]?.bounded!==true)throw failure('RESTRICTION_BUDGET_EXHAUSTED');
  });
 }
 async function proveClose(guard){
  const rows=await business(guard,async command=>(await command('SELECT * FROM inventory.close_writer_fence($1::uuid,$2::bigint,$3::bigint,$4::bigint)',[guard.generation,String(guard.data_epoch),String(guard.open_version),String(guard.closed_version)])).rows);
  assertFence(rows[0],guard,'CLOSED');
  await checkpoint('restriction.localClosed',{restrictionId:guard.restriction_id,tenantId:guard.tenant_id,writerVersion:String(guard.closed_version)});
  await setStage(guard,'CLOSED',{closeProven:true});
 }
 async function resolveIntent(guard,intent){
  if(!guard.close_proven)throw failure('CLOSURE_NOT_PROVEN');
  const rows=await business(guard,async command=>{
   const observed=(await command('SELECT * FROM inventory.observe_writer_fence()')).rows[0];assertFence(observed,guard,'CLOSED');
   return (await command('SELECT * FROM inventory.operation_result($1::uuid,$2::uuid,$3::text,$4::bigint)',[intent.operation_id,intent.actor_id,intent.action,String(intent.data_epoch)])).rows;
  });
  const local=rows[0];
  if(local?.result){
   const result=validateResult(local.result);if(result.operationId!==intent.operation_id||result.dataEpoch!==String(intent.data_epoch)||typeof local.result_hash!=='string'||!/^[a-f0-9]{64}$/.test(local.result_hash)||intent.owner_id===null)throw failure('RECONCILIATION_REQUIRED');
   const delta=decimal(String(local.logical_delta));if(BigInt(delta)>32768n)throw failure('RECONCILIATION_REQUIRED');
   await central('SELECT * FROM saas.project_write_result($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint)',[intent.tenant_id,intent.operation_id,intent.owner_id,result.state,local.result_hash,delta,result.state==='CONFIRMED'&&intent.action==='catalog.create'?'1':'0']);
  }else{
   // Exclusive CLOSE plus the immutable old version proves permanent no-effect.
   // It proves neither the old HTTP nor its SQL/client lease has ended.
   if(recovery)await step(guard.restriction_id,guard.tenant_id,'NO_EFFECT',intent.operation_id);
   else await transaction(async client=>{
    await lockCentral(client,intent.tenant_id);
    const proved=await client.query(`SELECT t.close_proven FROM saas.write_restriction_tenants t JOIN saas.tenant_writer_state w ON w.tenant_id=t.tenant_id WHERE t.restriction_id=$1::uuid AND t.tenant_id=$2::uuid AND t.close_proven AND w.state='CLOSED' AND w.writer_version=t.closed_version FOR UPDATE OF t`,[guard.restriction_id,intent.tenant_id]);
    if(!proved.rows.length)throw failure('CLOSURE_NOT_PROVEN');
    const current=await client.query('SELECT * FROM saas.write_intents WHERE tenant_id=$1::uuid AND operation_id=$2::uuid FOR UPDATE',[intent.tenant_id,intent.operation_id]);
    const row=current.rows[0];if(!row)throw failure('RECONCILIATION_REQUIRED');if(['CONFIRMED','REJECTED'].includes(row.status))return;
    if(BigInt(row.writer_version)>BigInt(guard.open_version)||row.generation!==guard.generation||String(row.data_epoch)!==String(guard.data_epoch))throw failure('CLOSURE_NOT_PROVEN');
    await client.query("UPDATE saas.write_intents SET status='REJECTED',updated_at=clock_timestamp() WHERE tenant_id=$1::uuid AND operation_id=$2::uuid",[intent.tenant_id,intent.operation_id]);
    await client.query("UPDATE saas.write_projections SET state='REJECTED',reason_code='NO_EFFECT',result_hash=NULL,updated_at=clock_timestamp() WHERE tenant_id=$1::uuid AND operation_id=$2::uuid",[intent.tenant_id,intent.operation_id]);
    await client.query("UPDATE saas.write_growth_reservations SET status='PROJECTED' WHERE tenant_id=$1::uuid AND operation_id=$2::uuid AND status='RESERVED'",[intent.tenant_id,intent.operation_id]);
    await client.query("SELECT saas.write_transition($1::uuid,$2::uuid,$3::uuid,$4::text,'REJECTED','NO_EFFECT')",[intent.tenant_id,intent.operation_id,intent.generation,row.status]);
    const bounded=await client.query('SELECT saas.write_operation_cost($1::uuid,$2::uuid)<=16384 AS bounded',[intent.tenant_id,intent.operation_id]);if(bounded.rows[0]?.bounded!==true)throw failure('RECONCILIATION_REQUIRED');
   });
  }
  await checkpoint('restriction.intentResolved',{restrictionId:guard.restriction_id,tenantId:intent.tenant_id,operationId:intent.operation_id});
 }
 async function reconcile(guard){
  const rows=await central("SELECT * FROM saas.write_intents WHERE tenant_id=$1::uuid AND generation=$2::uuid AND data_epoch=$3::bigint AND writer_version<=$4::bigint AND status IN('PENDING','EXECUTING','UNKNOWN') ORDER BY operation_id LIMIT $5::integer",[guard.tenant_id,guard.generation,String(guard.data_epoch),String(guard.open_version),maxIntentsPerPass]);
  for(const intent of rows)await resolveIntent(guard,intent);
  const remaining=await central("SELECT EXISTS(SELECT 1 FROM saas.write_intents WHERE tenant_id=$1::uuid AND generation=$2::uuid AND data_epoch=$3::bigint AND writer_version<=$4::bigint AND status IN('PENDING','EXECUTING','UNKNOWN')) AS pending",[guard.tenant_id,guard.generation,String(guard.data_epoch),String(guard.open_version)]);
  if(remaining[0]?.pending)return false;await setStage(guard,'RESOLVED');return true;
 }
 async function apply(restriction){
  await transaction(async client=>{
   await lockCentral(client);
   const row=(await client.query('SELECT * FROM saas.write_restrictions WHERE id=$1::uuid FOR UPDATE',[restriction.id])).rows[0];if(!row)throw failure('RESTRICTION_MISSING');
   if(['CLOSED','REOPENING','ACKNOWLEDGED'].includes(row.status))return;
   const unresolved=await client.query("SELECT EXISTS(SELECT 1 FROM saas.write_restriction_tenants WHERE restriction_id=$1::uuid AND (NOT close_proven OR stage NOT IN('RESOLVED','REOPENING','OPEN','ACKNOWLEDGED'))) AS pending",[restriction.id]);if(unresolved.rows[0]?.pending)throw failure('CLOSURE_NOT_PROVEN');
   switch(row.reason_code){
    case 'LOGOUT':await client.query("UPDATE saas.session_registry SET status='revoked' WHERE writer_session_ref=$1::uuid AND generation=$2::uuid",[row.session_ref,row.generation]);break;
    case 'IDENTITY':await client.query("UPDATE saas.identities SET status='revoked',security_version=security_version+1 WHERE id=$1::uuid AND status<>'revoked'",[row.identity_id]);await client.query("UPDATE saas.session_registry SET status='revoked' WHERE identity_id=$1::uuid",[row.identity_id]);break;
    case 'MEMBERSHIP':await client.query("UPDATE saas.memberships SET status='revoked',version=version+1 WHERE identity_id=$1::uuid AND tenant_id=$2::uuid AND status<>'revoked'",[row.identity_id,row.tenant_id]);break;
    case 'GRANT':await client.query("UPDATE saas.action_grants SET status='revoked',version=version+1 WHERE identity_id=$1::uuid AND tenant_id=$2::uuid AND action=$3::text AND status<>'revoked'",[row.identity_id,row.tenant_id,row.action]);break;
    case 'TENANT':await client.query("UPDATE saas.tenant_directory SET status='blocked' WHERE id=$1::uuid",[row.tenant_id]);break;
    // Operational changes require their specific closed preparer/restore plan.
    // Their acknowledged barrier never silently promotes an epoch/credential.
    case 'EPOCH':case 'ROTATION':case 'RESTORE':case 'SHUTDOWN':case 'POLICY':break;
    default:throw failure('RESTRICTION_KIND_INVALID');
   }
   if(applyRestriction)await applyRestriction(client,row);
   await client.query("UPDATE saas.write_restrictions SET status='CLOSED',updated_at=clock_timestamp() WHERE id=$1::uuid",[restriction.id]);
  });
 }
 async function reopen(guard){
  if(recovery)await step(guard.restriction_id,guard.tenant_id,'PREPARE_OPEN');
  else await transaction(async client=>{
   await lockCentral(client,guard.tenant_id);
   const current=(await client.query('SELECT * FROM saas.tenant_writer_state WHERE tenant_id=$1::uuid',[guard.tenant_id])).rows[0];
   if(!current||current.state!=='CLOSED'||![String(guard.closed_version),String(guard.reopen_version)].includes(String(current.writer_version)))throw failure('CLOSURE_NOT_PROVEN');
   const other=(await client.query("SELECT EXISTS(SELECT 1 FROM saas.write_restriction_tenants t JOIN saas.write_restrictions r ON r.id=t.restriction_id WHERE t.tenant_id=$1::uuid AND t.restriction_id<>$2::uuid AND r.status<>'ACKNOWLEDGED') AS pending",[guard.tenant_id,guard.restriction_id])).rows[0];if(other?.pending)throw failure('RESTRICTION_PENDING');
   await client.query("UPDATE saas.tenant_writer_state SET writer_version=$2::bigint WHERE tenant_id=$1::uuid AND state='CLOSED'",[guard.tenant_id,String(guard.reopen_version)]);
   await client.query("UPDATE saas.write_restriction_tenants SET stage='REOPENING' WHERE restriction_id=$1::uuid AND tenant_id=$2::uuid",[guard.restriction_id,guard.tenant_id]);
  });
  const rows=await business(guard,async command=>(await command('SELECT * FROM inventory.open_writer_fence($1::uuid,$2::bigint,$3::bigint,$4::bigint)',[guard.generation,String(guard.data_epoch),String(guard.closed_version),String(guard.reopen_version)])).rows);assertFence(rows[0],guard,'OPEN');
  await checkpoint('restriction.localReopened',{restrictionId:guard.restriction_id,tenantId:guard.tenant_id,writerVersion:String(guard.reopen_version)});
  if(recovery){await step(guard.restriction_id,guard.tenant_id,'OPEN');return}
  await transaction(async client=>{
   await lockCentral(client,guard.tenant_id);
   const changed=await client.query("UPDATE saas.tenant_writer_state SET state='OPEN' WHERE tenant_id=$1::uuid AND state='CLOSED' AND writer_version=$2::bigint AND generation=$3::uuid AND data_epoch=$4::bigint RETURNING tenant_id",[guard.tenant_id,String(guard.reopen_version),guard.generation,String(guard.data_epoch)]);
   if(!changed.rows.length){const prior=(await client.query('SELECT state,writer_version FROM saas.tenant_writer_state WHERE tenant_id=$1::uuid',[guard.tenant_id])).rows[0];if(prior?.state!=='OPEN'||String(prior.writer_version)!==String(guard.reopen_version))throw failure('CLOSURE_NOT_PROVEN')}
   await client.query("UPDATE saas.write_restriction_tenants SET stage='OPEN' WHERE restriction_id=$1::uuid AND tenant_id=$2::uuid",[guard.restriction_id,guard.tenant_id]);
  });
 }
 async function processRestriction(id){
  await normalGuard();
  id=canonicalUuid(id);const restriction=(await central('SELECT * FROM saas.write_restrictions WHERE id=$1::uuid',[id]))[0];if(!restriction)throw failure('RESTRICTION_MISSING');if(restriction.status==='ACKNOWLEDGED')return {acknowledged:true,id};if(restriction.generation!==generation)throw failure('RESTRICTION_GENERATION_MISMATCH');
  if(recovery)await step(id,null,'BEGIN');else await central("UPDATE saas.write_restrictions SET status='CLOSING',updated_at=clock_timestamp() WHERE id=$1::uuid AND status='PENDING'",[id]);
  let guards=await central('SELECT * FROM saas.write_restriction_tenants WHERE restriction_id=$1::uuid ORDER BY tenant_id',[id]);
  for(let guard of guards){
   if(guard.stage==='PENDING'){await proveClose(guard);guard={...guard,stage:'CLOSED',close_proven:true}}
   if(guard.stage==='CLOSED'&&!await reconcile(guard))return {acknowledged:false,id};
  }
  if(recovery)await step(id,null,'APPLY');else await apply(restriction);
  guards=await central('SELECT * FROM saas.write_restriction_tenants WHERE restriction_id=$1::uuid ORDER BY tenant_id',[id]);
  if(canReopen(restriction.reason_code))for(const guard of guards)if(guard.stage==='RESOLVED'||guard.stage==='REOPENING')await reopen(guard);
  if(recovery)await step(id,null,'ACK');else await transaction(async client=>{
   await lockCentral(client);
   const allowed=canReopen(restriction.reason_code)?['OPEN','ACKNOWLEDGED']:['RESOLVED','ACKNOWLEDGED'];
   const states=(await client.query('SELECT stage,close_proven FROM saas.write_restriction_tenants WHERE restriction_id=$1::uuid FOR UPDATE',[id])).rows;
   if(states.some(s=>!s.close_proven||!allowed.includes(s.stage)))throw failure('CLOSURE_NOT_PROVEN');
   await client.query("UPDATE saas.write_restriction_tenants SET stage='ACKNOWLEDGED' WHERE restriction_id=$1::uuid",[id]);await client.query("UPDATE saas.write_restrictions SET status='ACKNOWLEDGED',updated_at=clock_timestamp() WHERE id=$1::uuid",[id]);
  });
  await checkpoint('restriction.acknowledged',{restrictionId:id});return {acknowledged:true,id};
 }
 async function requestRestriction({id=randomUUID(),identityId=null,sessionRef=null,tenantId=null,action=null,generation:targetGeneration=generation,reasonCode}){
  await normalGuard();
  if(!reasons.has(reasonCode))throw failure('RESTRICTION_KIND_INVALID');
  const rows=await central('SELECT * FROM saas.request_write_restriction($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text)',[canonicalUuid(id),identityId?canonicalUuid(identityId):null,sessionRef?canonicalUuid(sessionRef):null,tenantId?canonicalUuid(tenantId):null,action,canonicalUuid(targetGeneration),reasonCode]);if(!rows[0])throw failure('RESTRICTION_MISSING');return rows[0];
 }
 async function runOnce(){
  if(running)return {processed:0,pending:true};running=true;
  try{await normalGuard();const rows=await central("SELECT id FROM saas.write_restrictions WHERE status<>'ACKNOWLEDGED' AND generation=$1::uuid ORDER BY created_at,id LIMIT 1",[generation]);if(!rows.length)return {processed:0,pending:false};const result=await processRestriction(rows[0].id);return {processed:result.acknowledged?1:0,pending:!result.acknowledged}}
  catch{return {processed:0,pending:true}}finally{running=false}
 }
 async function settleResources({tenantId,operationId,ticketId,proof}){
  await normalGuard();
  if(typeof verifyEndProof!=='function')throw failure('END_NOT_PROVEN');
  const guard={tenantId:canonicalUuid(tenantId),operationId:canonicalUuid(operationId),ticketId:canonicalUuid(ticketId),generation,proof};
  // The trusted composition root proves the exact owner/connection/request end
  // and the already-settled L1 ticket, bound to the isolated cohort and IDs.
  if(await verifyEndProof(guard)!==true)throw failure('END_NOT_PROVEN');
  const rows=await central('SELECT saas.settle_closed_write_resources($1::uuid,$2::uuid,$3::uuid) AS settled',[guard.tenantId,guard.operationId,guard.ticketId]);
  if(rows[0]?.settled!==true)throw failure('RECONCILIATION_REQUIRED');
  await checkpoint('restriction.resourcesSettled',{tenantId:guard.tenantId,operationId:guard.operationId,ticketId:guard.ticketId});return {settled:true};
 }
 async function resumeOperationalBarrier(id){
  if(recovery)throw failure('PROMOTION_NOT_PROVEN');
  if(typeof verifyPromotion!=='function')throw failure('PROMOTION_NOT_PROVEN');id=canonicalUuid(id);
  const restriction=(await central('SELECT * FROM saas.write_restrictions WHERE id=$1::uuid',[id]))[0];
  if(!restriction||restriction.status!=='ACKNOWLEDGED'||canReopen(restriction.reason_code)||['TENANT','RESTORE'].includes(restriction.reason_code))throw failure('PROMOTION_NOT_PROVEN');
  const guards=await central('SELECT * FROM saas.write_restriction_tenants WHERE restriction_id=$1::uuid ORDER BY tenant_id',[id]);
  if(!guards.length||guards.some(g=>!g.close_proven))throw failure('PROMOTION_NOT_PROVEN');
  const promotion=await verifyPromotion({restriction,guards,generation});
  if(promotion?.verified!==true||!Array.isArray(promotion.tenants)||promotion.tenants.length!==guards.length)throw failure('PROMOTION_NOT_PROVEN');
  const verified=new Map();for(const tenant of promotion.tenants){const tenantId=canonicalUuid(tenant.tenantId);if(verified.has(tenantId)||canonicalUuid(tenant.generation)!==generation)throw failure('PROMOTION_NOT_PROVEN');verified.set(tenantId,{...tenant,dataEpoch:decimal(String(tenant.dataEpoch),{positive:true})})}
  for(const original of guards){
   const promoted=verified.get(original.tenant_id);if(!promoted)throw failure('PROMOTION_NOT_PROVEN');
   const guard={...original,generation,data_epoch:promoted.dataEpoch};
   const centralRows=await central('SELECT w.*,d.schema_version,d.data_epoch AS directory_epoch,d.writer_secret_ref,d.writer_credential_version FROM saas.tenant_writer_state w JOIN saas.tenant_directory d ON d.id=w.tenant_id WHERE w.tenant_id=$1::uuid',[guard.tenant_id]);
   const current=centralRows[0];if(!current||current.generation!==generation||String(current.data_epoch)!==guard.data_epoch||String(current.directory_epoch)!==guard.data_epoch||current.schema_version!==2||!current.writer_secret_ref||BigInt(current.writer_credential_version??0)<=0n)throw failure('PROMOTION_NOT_PROVEN');
   if(current.state==='OPEN'&&String(current.writer_version)===String(guard.reopen_version)){
    const rows=await business(guard,async command=>(await command('SELECT * FROM inventory.observe_writer_fence()')).rows);assertFence(rows[0],guard,'OPEN');
   }else await reopen(guard);
  }
  await transaction(async client=>{
   await lockCentral(client);
   // Historical subject restrictions and their tombstones stay active. Only
   // this explicitly verified operational barrier ceases to block new writes.
   const changed=await client.query("UPDATE saas.write_restrictions SET active=false,updated_at=clock_timestamp() WHERE id=$1::uuid AND status='ACKNOWLEDGED' AND reason_code IN('EPOCH','ROTATION','SHUTDOWN','POLICY') RETURNING id",[id]);if(!changed.rows.length)throw failure('PROMOTION_NOT_PROVEN');
  });
  await checkpoint('restriction.operationalResumed',{restrictionId:id});return {resumed:true,id};
 }
 return {requestRestriction,processRestriction,runOnce,settleResources,resumeOperationalBarrier};
}
