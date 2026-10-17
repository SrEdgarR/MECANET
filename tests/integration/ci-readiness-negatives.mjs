// Real production restriction transitions, contained in two rollback-only SQL transactions.
// No free UPDATE, roster deletion, new DB, new generation or clock takeover.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sha256} from '../../server/saas/recovery/protocol.js';
import {createRecoveryRuntime} from '../../server/saas/recovery/runtime.js';
const A='11111111-1111-4111-8111-111111111111',actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const business=['tenant_writer_state','tenant_directory','write_restrictions','write_restriction_tenants','write_control_quota','memberships','action_grants','session_registry'];
const fingerprint=`SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('kind',kind,'row',value) ORDER BY kind,value::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM (${business.map(name=>`SELECT '${name}' kind,to_jsonb(r) value FROM saas.${name} r`).concat("SELECT 'identities',jsonb_build_object('id',id,'status',status,'security_version',security_version) FROM saas.identities").join(' UNION ALL ')}) rows`;
const localFingerprint="SELECT encode(sha256(convert_to(row_to_json(f)::text,'UTF8')),'hex') AS hash FROM inventory.writer_fence f WHERE id=1";
export function assertReadinessRollbackCase(r){assert.ok(r?.technicalSqlReady===true&&r.authorityDenied===true&&r.localRollback===true&&r.centralRollback===true&&/^[a-f0-9]{64}$/.test(r.controlBefore??'')&&r.controlBefore===r.controlAfter&&/^[a-f0-9]{64}$/.test(r.tenantBefore??'')&&r.tenantBefore===r.tenantAfter,'CI_READINESS_ROLLBACK_UNPROVEN');return true}
export async function exerciseCiReadinessNegatives({context:ctx,onMaterial,deadline}){
 assert.ok(ctx?.query&&ctx?.pool&&ctx?.recoveryBinding&&typeof onMaterial==='function'&&typeof deadline==='function','CI_READINESS_CONTEXT_REQUIRED');const started=performance.now();let commands=0;
 const report={schema:'cp028-ci-readiness-negatives-v1',status:'FAIL',scope:'real PostgreSQL production functions in rollback-only TX; not HTTP all-closed or zero-company roster',cases:[],limits:{sql:200,seconds:15}};
 const plan={schema:'cp028-ci-readiness-plan-v1',generation:ctx.id.generation,cases:['TENANT','IDENTITY','MEMBERSHIP'].map(reason=>({reason,id:randomUUID()}))};const receipt=await onMaterial(plan);assert.ok(receipt?.readback===true&&receipt.sha256===sha256(plan),'CI_READINESS_PLAN_CUSTODY');
 const checked=()=>{deadline();assert.ok(commands<200&&performance.now()-started<15000,'CI_READINESS_BUDGET')};
 const observe=async(db,text,values=[])=>{checked();commands++;return ctx.query(db,text,values)};
 let settled=false;for(let i=0;i<40;i++){const r=(await observe('mecanet_control',"SELECT count(*)::int AS live FROM saas.tickets WHERE state IN('ACTIVE','WAITING','UNCERTAIN')")).rows[0];if(r.live===0){settled=true;break}await new Promise(resolve=>setTimeout(resolve,25))}assert.equal(settled,true,'CI_READINESS_HTTP_SQL_FIN_MISSING');
 const sid=(await observe('mecanet_control',"SELECT sid FROM saas.session_registry WHERE identity_id=$1 AND generation=$2 AND status='active' ORDER BY created_at DESC LIMIT 1",[actor,ctx.id.generation])).rows[0]?.sid;assert.equal(typeof sid,'string','CI_READINESS_ACTOR_SESSION_REQUIRED');
 for(const scenario of plan.cases){
  const beforeControl=(await observe('mecanet_control',fingerprint)).rows[0].hash,beforeLocal=(await observe('mecanet_tenant_a',localFingerprint)).rows[0].hash;let central,local,centralOpen=false,localOpen=false,centralEnd=false,localEnd=false,failure,result;
  const command=async(client,text,values=[],cleanup=false)=>{if(!cleanup)checked();commands++;return typeof text==='string'?client.query(text,values):client.query(text)};
  try{
   central=await(await ctx.pool('mecanet_control')).connect();local=await(await ctx.pool('mecanet_tenant_a')).connect();await command(central,'BEGIN');centralOpen=true;await command(local,'BEGIN');localOpen=true;await command(central,'SET LOCAL ROLE saas_writer_maintenance');await command(local,'SET LOCAL ROLE saas_maintainer_a');
   await command(central,'SELECT * FROM saas.request_write_restriction($1::uuid,$2::uuid,NULL,$3::uuid,NULL,$4::uuid,$5::text)',[scenario.id,scenario.reason==='TENANT'?null:actor,A,ctx.id.generation,scenario.reason]);
   const guard=(await command(central,'SELECT * FROM saas.write_restriction_tenants WHERE restriction_id=$1 AND tenant_id=$2',[scenario.id,A])).rows[0];assert.ok(guard,'CI_READINESS_RESTRICTION_GUARD');
   const step=async(phase,tenant=null)=>{const r=await command(central,'SELECT saas.restriction_step($1::uuid,$2::uuid,$3::uuid,$4::text,NULL) AS changed',[scenario.id,tenant,ctx.id.generation,phase]);assert.equal(r.rows[0]?.changed,true)};
   await step('BEGIN');const closed=(await command(local,'SELECT * FROM inventory.close_writer_fence($1::uuid,$2::bigint,$3::bigint,$4::bigint)',[ctx.id.generation,guard.data_epoch,guard.open_version,guard.closed_version])).rows[0];assert.equal(closed.state,'CLOSED');assert.equal(String(closed.writer_version),String(guard.closed_version));await step('CLOSED',A);await step('RESOLVED',A);await step('APPLY');
   if(scenario.reason!=='TENANT'){await step('PREPARE_OPEN',A);const opened=(await command(local,'SELECT * FROM inventory.open_writer_fence($1::uuid,$2::bigint,$3::bigint,$4::bigint)',[ctx.id.generation,guard.data_epoch,guard.closed_version,guard.reopen_version])).rows[0];assert.equal(opened.state,'OPEN');assert.equal(String(opened.writer_version),String(guard.reopen_version));await step('OPEN',A)}
   await step('ACK');
   const runtime=createRecoveryRuntime({controlPool:{query:(...args)=>command(central,...args)},...ctx.recoveryBinding}),state=await runtime.serviceState();assert.equal(state.stage,'COMPLETE');assert.equal(state.ready,true);assert.equal(await runtime.guard(),true);
   const open=(await command(central,"SELECT count(*) FILTER(WHERE state='OPEN')::int AS open FROM saas.tenant_writer_state")).rows[0].open;assert.equal(open,scenario.reason==='TENANT'?0:1);
   await command(central,'SET LOCAL ROLE saas_owner');await command(central,'SAVEPOINT denied_authority');let denied;try{await command(central,'SELECT saas.validate_write_authority($1::uuid,$2::text,$3::uuid,$4::text,true)',[A,sid,ctx.id.generation,'catalog.create'])}catch(error){denied=error}await command(central,'ROLLBACK TO SAVEPOINT denied_authority');await command(central,'RELEASE SAVEPOINT denied_authority');assert.equal(denied?.code,'P0001');assert.equal(denied.message,scenario.reason==='TENANT'?'WRITER_FENCE_CLOSED':scenario.reason==='IDENTITY'?'WRITE_SESSION_EXPIRED':'WRITE_ACCESS_DENIED');
   await command(local,'ROLLBACK',[],true);localEnd=true;await command(central,'ROLLBACK',[],true);centralEnd=true;
   result={reason:scenario.reason,technicalSqlReady:true,authorityDenied:true,denial:denied.message,openCompaniesInTransaction:open,subjectRestrictionRetained:scenario.reason!=='TENANT',localRollback:true,centralRollback:true,controlBefore:beforeControl,tenantBefore:beforeLocal};
  }catch(error){failure=error}finally{
   const errors=[];for(const [client,opened,ended,name]of [[local,localOpen,localEnd,'local'],[central,centralOpen,centralEnd,'central']])if(client){let known=ended;try{if(opened&&!ended){await command(client,'ROLLBACK',[],true);known=true}}catch{errors.push(name+'-ROLLBACK_UNKNOWN')}finally{client.release(known||!opened?undefined:Error('CI_READINESS_SQL_END_UNKNOWN'))}}
   if(errors.length){if(!failure)failure=Error('CI_READINESS_CLEANUP_UNKNOWN');Object.defineProperty(failure,'readinessCleanup',{value:errors})}
  }
  if(failure){failure.readinessReport=report;throw failure}
  result.controlAfter=(await observe('mecanet_control',fingerprint)).rows[0].hash;result.tenantAfter=(await observe('mecanet_tenant_a',localFingerprint)).rows[0].hash;assertReadinessRollbackCase(result);report.cases.push({...result,status:'PASS'});
 }
 report.status='PASS';report.sqlCommands=commands;report.elapsedMs=Math.ceil(performance.now()-started);return report;
}
