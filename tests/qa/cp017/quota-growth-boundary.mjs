// WIP preregistered A8 SQL fragments; no HTTP, no persistent fixture change.
// Imports are rebased only when root accepts copying this WIP into tests/qa/cp017.
import assert from 'node:assert/strict';
import {readFile,open,stat} from 'node:fs/promises';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {calculateUsage,checkBudget,scopesFor} from '../../../server/saas/admission/policy.js';
import {validatePromotionHostProof} from './promotion.mjs';
import {sanitizeSqlFailure} from './sql-live.mjs';

const PROJECT='mecanet-qa-p1l2-cp017',A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const MAX=9223372036854775807n,SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail=code=>{throw Object.assign(Error(code),{code})},digest=value=>createHash('sha256').update(value).digest('hex');
export const GROWTH_PLAN=Object.freeze({project:PROJECT,criteria:['L2-A8 tenant conservative reservation last byte','L2-A8 reduced quota under causally retained uncertain growth','L2-A3/A8 original-ticket owner/ACTIVE/started claim guards'],outerRollbackRequired:true,httpAcceptance:false,businessPersistentMutations:0,quotaPersistentIncreases:0,permissionChanges:0,newRoles:0,noRefund:true,maxRuntimeMs:45000,maxQueries:180,poolPerDatabase:1,maxDatabases:3,sqlMs:2000,lockMs:500,reservationBytes:'32768',controlBytes:'16384',globalMaximum:'16777216',barrierMaximum:'2097152',ephemeralTicketCount:1,claimNegatives:['wrong-owner','FINISHED-ticket','UNCERTAIN-ticket','work-not-started'],preparation:'bounded fixture inside private TX; real saas_api functions register/claim/mark_unknown; no grant or identity activation',policy:'CLOSED local real set_writer_policy under SET LOCAL maintainer, always ROLLBACK; central private policy version +1 and no counter adjustment',stillNotVerified:['HTTP/admission orchestration','coordinator live policy interleaving','whole A8 and capacity']});
function number(value){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(value)||BigInt(value)>MAX)fail('GROWTH_COUNTER_INVALID');return BigInt(value)}
export function tenantReserveBoundary({used,reserved,max}){
 const u=number(used),r=number(reserved),m=number(max),exact=u+r+32768n;
 if(exact>m||m>536870912n||exact>MAX)fail('GROWTH_SOURCE_HEADROOM_REQUIRED');
 return{below:(exact-1n).toString(),exact:exact.toString(),used,reserved,reservation:'32768'};
}
export function reducedDebtPolicy({used,reserved,max,policyVersion}){
 const u=number(used),r=number(reserved),m=number(max),v=number(policyVersion),target=u+r-1n;
 if(r<32768n||target<0n||target>m||m>536870912n||v===0n||v===MAX)fail('GROWTH_REDUCTION_INVALID');
 return{maxLogicalBytes:target.toString(),policyVersion:(v+1n).toString(),retainedBytes:reserved,used,originalMaximum:max};
}
export function validateGrowthProof({qa,proof,sourceSha}){
 validatePromotionHostProof({qa,proof,sourceSha});if(proof.workerStopped!==true||proof.webStopped!==true)fail('GROWTH_HOST_END_REQUIRED');return proof;
}
export function assertRetainedDebt(before,after){
 if(!SHA.test(before?.guardHash??'')||!SHA.test(before?.resourceHash??'')||!UUID.test(before?.owner??'')||before.status!=='UNKNOWN'||before.attempt!=='1'||before.projectionState!=='UNKNOWN'||before.projectionReason!=='UNCERTAIN'||before.resultHash!==null||before.growthState!=='RESERVED'||before.tenantReserved!=='32768'||before.controlReserved!=='16384'||before.productsReserved!=='0')fail('GROWTH_CAUSAL_UNCERTAINTY_REQUIRED');
 for(const k of ['usedBytes','reservedBytes','usedProducts','reservedProducts'])number(before[k]);
 if(number(before.reservedBytes)<32768n||!after||Object.keys(before).some(k=>after[k]!==before[k]))fail('GROWTH_DEBT_OR_GUARD_CHANGED');return true;
}
export function assertClaimStayedPending(row,originalGuard){
 if(row?.status!=='PENDING'||row.owner_id!==null||row.attempt_index!=='0'||row.events!=='REGISTERED'||!SHA.test(originalGuard??'')||row.guardHash!==originalGuard)fail('GROWTH_PENDING_CLAIM_GUARD_CHANGED');return true;
}
async function durable(path,value){const h=await open(path,'w',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync()}finally{await h.close()}}
const centralTables=['identities','tenant_directory','tenant_writer_state','write_intents','write_growth_reservations','write_projections','write_transitions','write_restrictions','write_restriction_tenants','write_control_quota','session_registry','memberships','action_grants','role_policies','tickets','windows','policies','policy_audit','admission_scopes','admission_fence','time_authority','schema_migrations'];
const businessTables=[['catalog','products'],['catalog','schema_migrations'],...['balances','movements','operations','audit','quota_state','writer_fence'].map(t=>['inventory',t])];

export async function runGrowthBoundary(){
 const sourceSha=process.env.QA_CODE_SHA;if(process.env.QA_PROJECT!==PROJECT||!/^[a-f0-9]{40}$/.test(sourceSha??''))fail('GROWTH_EXACT_SOURCE_REQUIRED');
 const started=performance.now(),report={project:PROJECT,sourceSha,status:'PREREGISTERED / NOT VERIFIED',plan:GROWTH_PLAN,harnessSha256:digest(await readFile(new URL(import.meta.url))),observedAt:new Date().toISOString(),cases:[],secretsPrinted:false};
 await durable('/run/qa-results/quota-growth-boundary-plan.json',report);
 const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8')),proofPath='/run/qa-results/operational-host-proof.json',proofStat=await stat(proofPath);
 if(!proofStat.isFile()||(proofStat.mode&0o777)!==0o400)fail('GROWTH_READ_ONLY_HOST_PROOF_REQUIRED');
 validateGrowthProof({qa,proof:JSON.parse(await readFile(proofPath,'utf8')),sourceSha});
 const [ca,password]=await Promise.all([readFile('/run/qa-ca.crt','utf8'),readFile('/run/qa-secrets/bootstrap','utf8')]);const pools=new Map();let queries=0;
 const bounded=()=>{if(performance.now()-started>GROWTH_PLAN.maxRuntimeMs||++queries>GROWTH_PLAN.maxQueries)fail('GROWTH_ENVELOPE_EXCEEDED')};
 const poolFor=async database=>{
  if(!['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'].includes(database))fail('GROWTH_FIXED_DATABASE_REQUIRED');
  if(!pools.has(database))pools.set(database,await createPgPool({host:'postgres',port:5432,database,user:'qa_bootstrap',password,ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:1500,statement_timeout:2000,lock_timeout:500,idle_in_transaction_session_timeout:2000,application_name:'mecanet-cp017-growth-rollback'}));return pools.get(database);
 };
 const command=async(c,text,values=[])=>{bounded();return c.query({text,values,query_timeout:2000})};
 const rollback=async c=>{await command(c,'ROLLBACK');return true};
 const inspect=async(database,text,values=[])=>{const c=await(await poolFor(database)).connect();let ended=false;try{await command(c,'BEGIN READ ONLY');const rows=(await command(c,text,values)).rows;ended=await rollback(c);return rows}finally{if(!ended)ended=await c.query('ROLLBACK').then(()=>true,()=>false);c.release(!ended)}};
 const central=(text,values)=>inspect('mecanet_control',text,values);
 const fingerprint=async(database,control)=>{
  const tables=control?centralTables.map(t=>['saas',t]):businessTables;
  const fields=tables.map(([schema,table])=>`'${schema}.${table}',(SELECT jsonb_build_object('n',count(*)::text,'hash',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text,'UTF8')),'hex')) FROM ${schema}.${table} t)`);
  return(await inspect(database,`SELECT jsonb_build_object(${fields.join(',')}) AS fingerprint`))[0].fingerprint;
 };
 const closed=async()=>{
  const env=(await central("SELECT current_setting('server_version_num') AS version,current_setting('server_encoding') AS encoding,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT system_identifier::text FROM pg_control_system()) AS system_id,(SELECT generation FROM saas.admission_fence WHERE id=1) AS generation,(SELECT count(*)::int FROM pg_stat_activity WHERE usename LIKE 'saas_%') AS other_clients"))[0];
  assert.equal(env.version,'180006');assert.equal(env.encoding,'UTF8');assert.equal(env.tls,true);assert.equal(env.system_id,qa.systemIdentifier);assert.equal(env.generation,qa.generation);assert.equal(env.other_clients,0);
  const states=await central('SELECT * FROM saas.tenant_writer_state ORDER BY tenant_id');assert.deepEqual(states.map(s=>s.tenant_id),[A,B]);
  for(const s of states){assert.equal(s.state,'CLOSED');assert.equal(s.generation,qa.generation);const l=(await inspect(s.tenant_id===A?'mecanet_tenant_a':'mecanet_tenant_b','SELECT * FROM inventory.writer_fence WHERE id=1'))[0];assert.equal(l.tenant_id,s.tenant_id);for(const k of ['state','generation','data_epoch','writer_version'])assert.equal(l[k],s[k])}
  return states;
 };
 const role=async(c,name)=>{if(!['saas_owner','saas_api','saas_maintainer_a','saas_maintainer_b'].includes(name))fail('GROWTH_FIXED_ROLE_REQUIRED');await command(c,`SET LOCAL ROLE ${name}`);assert.equal((await command(c,'SELECT current_user AS role')).rows[0].role,name)};
 const denied=async(c,fn)=>{let error;try{await fn()}catch(e){error=e}if(error?.code!=='P0001'||error.message!=='GROWTH_QUOTA')fail('GROWTH_CAUSAL_NEGATIVE_REQUIRED');return{sqlState:'P0001',fixedReason:'GROWTH_QUOTA',handlerCode:'LOGICAL_QUOTA',HTTP:false}};
 let outerRollback=false;
 try{
  await closed();const centralBefore=await fingerprint('mecanet_control',true),aBefore=await fingerprint('mecanet_tenant_a',false),bBefore=await fingerprint('mecanet_tenant_b',false);
  const actors=await central("SELECT d.id AS tenant_id,i.id AS actor_id,w.data_epoch,d.db_name FROM saas.identities i JOIN saas.memberships m ON m.identity_id=i.id JOIN saas.tenant_directory d ON d.id=m.tenant_id JOIN saas.tenant_writer_state w ON w.tenant_id=d.id JOIN saas.action_grants g ON g.identity_id=i.id AND g.tenant_id=d.id AND g.action='inventory.receive' JOIN saas.role_policies p ON p.role=m.role AND p.action=g.action WHERE i.status='active' AND i.verified AND i.purpose='company' AND m.status='active' AND g.status='active' AND d.status='active' AND d.purpose='company' AND d.schema_version=2 AND d.data_epoch=w.data_epoch AND w.state='CLOSED' AND w.generation=$1 AND NOT EXISTS(SELECT 1 FROM saas.write_restrictions x WHERE x.active AND x.identity_id=i.id AND(x.tenant_id IS NULL OR x.tenant_id=d.id) AND(x.action IS NULL OR x.action='inventory.receive')) ORDER BY d.id,i.id LIMIT 1",[qa.generation]);
  const a=actors[0];if(!a||![A,B].includes(a.tenant_id)||a.db_name!==(a.tenant_id===A?'mecanet_tenant_a':'mecanet_tenant_b'))fail('GROWTH_ALREADY_ACTIVE_AUTHORITY_REQUIRED');
  const database=a.db_name,maintainer=a.tenant_id===A?'saas_maintainer_a':'saas_maintainer_b',local=(await inspect(database,'SELECT q.*,f.state,f.data_epoch,f.writer_version,inventory.logical_usage()::text AS actual FROM inventory.quota_state q JOIN inventory.writer_fence f USING(id)'))[0];
  assert.equal(local.state,'CLOSED');assert.equal(local.logical_bytes,local.actual);
  const c=await(await poolFor('mecanet_control')).connect();
  try{
   await command(c,'BEGIN');await command(c,'SELECT pg_advisory_xact_lock(56321,9)');await role(c,'saas_owner');
   const f=(await command(c,'SELECT * FROM saas.admission_fence WHERE id=1 FOR UPDATE')).rows[0],w=(await command(c,'SELECT * FROM saas.tenant_writer_state WHERE tenant_id=$1 FOR UPDATE',[a.tenant_id])).rows[0],q=(await command(c,'SELECT * FROM saas.write_control_quota WHERE id=1 FOR UPDATE')).rows[0];
   assert.equal(w.state,'CLOSED');assert.equal(w.data_epoch,local.data_epoch);assert.equal(w.writer_version,local.writer_version);assert.equal(w.policy_version,local.policy_version);assert.equal(w.max_products,local.max_products);assert.equal(w.max_logical_bytes,local.max_logical_bytes);assert.equal(w.used_bytes,local.logical_bytes);assert.equal(w.used_products,local.active_products);
   assert.equal(q.max_bytes,'16777216');assert.equal(q.barrier_max_bytes,'2097152');if(number(q.used_bytes)+number(q.reserved_bytes)+16384n>number(q.max_bytes))fail('GROWTH_GLOBAL_HEADROOM_REQUIRED');
   if(number(w.max_products)>300n||number(w.writer_version)+3n>MAX)fail('GROWTH_DERIVED_LIMIT_REQUIRED');
   const points=tenantReserveBoundary({used:w.used_bytes,reserved:w.reserved_bytes,max:w.max_logical_bytes});
   await command(c,'UPDATE saas.admission_fence SET barrier=false WHERE id=1');
   await command(c,"UPDATE saas.tenant_writer_state SET state='OPEN',writer_version=writer_version+1 WHERE tenant_id=$1",[a.tenant_id]);
   await command(c,"UPDATE saas.write_restrictions SET active=false WHERE tenant_id=$1 AND identity_id IS NULL AND session_ref IS NULL AND status='ACKNOWLEDGED' AND reason_code IN('POLICY','ROTATION','EPOCH','RESTORE','SHUTDOWN')",[a.tenant_id]);
   const sid=randomBytes(32).toString('base64url'),sessionRef=randomUUID(),ticket=randomUUID(),ownerId=randomUUID(),scopes=scopesFor(a.tenant_id,'ordinary');
   await command(c,"INSERT INTO saas.session_registry(sid,identity_id,purpose,generation,status,security_version,absolute_expires_at,writer_session_ref) SELECT $1,id,'company',$2,'active',security_version,clock_timestamp()+interval '1 hour',$3 FROM saas.identities WHERE id=$4 AND status='active' AND verified AND purpose='company'",[sid,qa.generation,sessionRef,a.actor_id]);
   const policies=(await command(c,"SELECT scope_key,version::text,limits,override_expires_at,clock_timestamp() AS checked_at FROM saas.policies WHERE scope_key=ANY($1::text[]) ORDER BY scope_key",[scopes])).rows;
   if(policies.length!==4||policies.some(p=>p.override_expires_at&&p.override_expires_at<=p.checked_at))fail('GROWTH_SCOPE_POLICIES_REQUIRED');
   for(const p of policies){
    const rows=(await command(c,'SELECT tick,qh,qc,qt FROM saas.windows WHERE scope_key=$1 AND tick>$2::bigint-601',[p.scope_key,f.tick])).rows;
    const count=(await command(c,"SELECT count(*) FILTER(WHERE state IN('ACTIVE','UNCERTAIN'))::int AS active,count(*) FILTER(WHERE state='WAITING')::int AS waiting,coalesce(sum(reserved_qc),0)::bigint AS reserved_qc,coalesce(sum(reserved_qt),0)::bigint AS reserved_qt FROM saas.tickets WHERE scopes @>ARRAY[$1]::text[] AND state IN('WAITING','ACTIVE','UNCERTAIN')",[p.scope_key])).rows[0];
    const usage={...calculateUsage(rows,f.tick),active:count.active,waiting:count.waiting,reservedQc:Number(count.reserved_qc),reservedQt:Number(count.reserved_qt)};
    if(checkBudget(p.limits,usage,{qh:1,qc:3,qt:65536,active:1,waiting:0}))fail('GROWTH_REAL_ADMISSION_HEADROOM_REQUIRED');
   }
   const versions=Object.fromEntries(policies.map(p=>[p.scope_key,p.version]));
   await command(c,"INSERT INTO saas.tickets(id,tenant_id,lane,operation_kind,owner,generation,state,scopes,policy_versions,created_tick,heartbeat_at,queue_expires_at,reserved_qc,reserved_qt,work_started) VALUES($1,$2,'ordinary','HTTP',$3,$4,'ACTIVE',$5,$6,$7,clock_timestamp(),clock_timestamp()+interval '8 seconds',0,65536,true)",[ticket,a.tenant_id,ownerId,qa.generation,scopes,versions,f.tick]);
   for(const scope of scopes)await command(c,'INSERT INTO saas.windows(scope_key,tick,qh,qc,qt) VALUES($1,$2,1,3,0) ON CONFLICT(scope_key,tick) DO UPDATE SET qh=saas.windows.qh+1,qc=saas.windows.qc+3',[scope,f.tick]);
   assert.equal((await command(c,'SELECT saas.write_barrier_cost()<=(SELECT barrier_max_bytes-4096 FROM saas.write_control_quota WHERE id=1) AS room')).rows[0].room,true);
   const register=async op=>{await role(c,'saas_api');return(await command(c,'SELECT * FROM saas.register_write_intent($1,$2,$3,$4,$5,$6,$7,$8)',[op,a.tenant_id,sid,qa.generation,'inventory.receive',a.data_epoch,digest(`synthetic growth boundary:${op}`),ticket])).rows[0]};
   const op=randomUUID();await command(c,'UPDATE saas.tenant_writer_state SET max_logical_bytes=$2 WHERE tenant_id=$1',[a.tenant_id,points.below]);await command(c,'SAVEPOINT below');
   const byteDenied=await denied(c,()=>register(op));await command(c,'ROLLBACK TO SAVEPOINT below');await command(c,'RELEASE SAVEPOINT below');await role(c,'saas_owner');
   assert.equal((await command(c,'SELECT count(*)::int AS n FROM saas.write_intents WHERE tenant_id=$1 AND operation_id=$2',[a.tenant_id,op])).rows[0].n,0);
   await command(c,'UPDATE saas.tenant_writer_state SET max_logical_bytes=$2 WHERE tenant_id=$1',[a.tenant_id,points.exact]);const pending=await register(op);assert.equal(pending.status,'PENDING');assert.equal(pending.writer_version,(number(w.writer_version)+1n).toString());
   await role(c,'saas_owner');const growth=(await command(c,'SELECT tenant_bytes_reserved,control_bytes_reserved,products_reserved,status FROM saas.write_growth_reservations WHERE tenant_id=$1 AND operation_id=$2',[a.tenant_id,op])).rows[0];assert.deepEqual(growth,{tenant_bytes_reserved:'32768',control_bytes_reserved:'16384',products_reserved:'0',status:'RESERVED'});
   const afterRegister=(await command(c,'SELECT * FROM saas.tenant_writer_state WHERE tenant_id=$1',[a.tenant_id])).rows[0];assert.equal(afterRegister.used_bytes,w.used_bytes);assert.equal(afterRegister.reserved_bytes,(number(w.reserved_bytes)+32768n).toString());assert.equal(afterRegister.used_products,w.used_products);assert.equal(afterRegister.reserved_products,w.reserved_products);
   report.cases.push({id:'tenant-last-conservative-reservation-byte',status:'PASS SQL REGISTER ONLY',confirmedAt:points.exact,rejectedAt:points.below,byteDenied,reservationBytes:'32768',productsReserved:'0',globalBudgetNotExhausted:true,actualCallerRole:'saas_api',businessDatabaseAlwaysClosed:true,HTTP:false});
   const guardHashSql="SELECT encode(sha256(convert_to(jsonb_build_object('tenant',i.tenant_id,'operation',i.operation_id,'idempotency',i.idempotency_key,'actor',i.actor_id,'action',i.action,'epoch',i.data_epoch,'hash',i.request_hash,'permissions',i.permission_versions,'session',i.session_ref,'generation',i.generation,'writerVersion',i.writer_version,'ticket',i.ticket_id,'createdAt',i.created_at)::text,'UTF8')),'hex') AS hash FROM saas.write_intents i WHERE tenant_id=$1 AND operation_id=$2";
   const originalGuard=(await command(c,guardHashSql,[a.tenant_id,op])).rows[0].hash;
   for(const [id,prepare,claimOwner]of [
    ['wrong-owner',null,randomUUID()],
    ['FINISHED-ticket',"UPDATE saas.tickets SET state='FINISHED',reserved_qc=0,reserved_qt=0,finished_at=clock_timestamp() WHERE id=$1",ownerId],
    ['UNCERTAIN-ticket',"UPDATE saas.tickets SET state='UNCERTAIN' WHERE id=$1",ownerId],
    ['work-not-started','UPDATE saas.tickets SET work_started=false WHERE id=$1',ownerId],
   ]){
    await command(c,'SAVEPOINT original_ticket_guard');if(prepare)await command(c,prepare,[ticket]);
    await role(c,'saas_api');const rows=(await command(c,'SELECT * FROM saas.claim_write_intent($1,$2,$3,$4,$5)',[a.tenant_id,op,sid,qa.generation,claimOwner])).rows;assert.equal(rows.length,0,'invalid original ticket cannot grant writer execution');
    await role(c,'saas_owner');const unchanged=(await command(c,"SELECT i.status,i.owner_id,i.attempt_index::text,(SELECT string_agg(reason_code,',' ORDER BY event_index) FROM saas.write_transitions t WHERE t.tenant_id=i.tenant_id AND t.operation_id=i.operation_id) AS events FROM saas.write_intents i WHERE tenant_id=$1 AND operation_id=$2",[a.tenant_id,op])).rows[0];unchanged.guardHash=(await command(c,guardHashSql,[a.tenant_id,op])).rows[0].hash;assertClaimStayedPending(unchanged,originalGuard);
    await command(c,'ROLLBACK TO SAVEPOINT original_ticket_guard');await command(c,'RELEASE SAVEPOINT original_ticket_guard');
    report.cases.push({id:`original-ticket-claim-${id}`,status:'PASS REAL SQL GUARD ONLY',rows:0,unchangedPendingOwnerAttemptAndGuard:true,registeredTransitionOnly:true,actualCallerRole:'saas_api',fixtureRestoredBySavepoint:true,HTTP:false});
   }
   await role(c,'saas_api');const claimed=(await command(c,'SELECT * FROM saas.claim_write_intent($1,$2,$3,$4,$5)',[a.tenant_id,op,sid,qa.generation,ownerId])).rows;assert.equal(claimed.length,1);assert.equal(claimed[0].status,'EXECUTING');assert.equal(claimed[0].owner_id,ownerId);assert.equal((await command(c,'SELECT saas.mark_write_unknown($1,$2,$3) AS uncertain',[a.tenant_id,op,ownerId])).rows[0].uncertain,true);
   await role(c,'saas_owner');
   const retained=async()=>{
    const row=(await command(c,"SELECT i.owner_id AS owner,i.status,i.attempt_index::text AS attempt,p.state AS \"projectionState\",p.reason_code AS \"projectionReason\",p.result_hash AS \"resultHash\",r.status AS \"growthState\",r.tenant_bytes_reserved::text AS \"tenantReserved\",r.control_bytes_reserved::text AS \"controlReserved\",r.products_reserved::text AS \"productsReserved\",w.used_bytes::text AS \"usedBytes\",w.reserved_bytes::text AS \"reservedBytes\",w.used_products::text AS \"usedProducts\",w.reserved_products::text AS \"reservedProducts\" FROM saas.write_intents i JOIN saas.write_projections p USING(tenant_id,operation_id) JOIN saas.write_growth_reservations r USING(tenant_id,operation_id) JOIN saas.tenant_writer_state w USING(tenant_id) WHERE i.tenant_id=$1 AND i.operation_id=$2",[a.tenant_id,op])).rows[0];
    row.guardHash=(await command(c,guardHashSql,[a.tenant_id,op])).rows[0].hash;
    row.resourceHash=(await command(c,"SELECT encode(sha256(convert_to(jsonb_build_object('ticket',to_jsonb(t),'windows',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.scope_key,x.tick) FROM saas.windows x WHERE x.scope_key=ANY($2::text[])),'control',(SELECT jsonb_build_object('used',used_bytes,'reserved',reserved_bytes,'max',max_bytes,'barrierMax',barrier_max_bytes) FROM saas.write_control_quota WHERE id=1))::text,'UTF8')),'hex') AS hash FROM saas.tickets t WHERE t.id=$1",[ticket,scopes])).rows[0].hash;return row;
   };
   const debtBefore=await retained();assertRetainedDebt(debtBefore,debtBefore);assert.equal(debtBefore.guardHash,originalGuard);
   const reduced=reducedDebtPolicy({used:debtBefore.usedBytes,reserved:debtBefore.reservedBytes,max:points.exact,policyVersion:w.policy_version});
   await command(c,"UPDATE saas.tenant_writer_state SET state='CLOSED',writer_version=writer_version+1,policy_version=$2,max_logical_bytes=$3 WHERE tenant_id=$1",[a.tenant_id,reduced.policyVersion,reduced.maxLogicalBytes]);
   const lc=await(await poolFor(database)).connect();let localRollback=false;
   try{
    await command(lc,'BEGIN');await role(lc,maintainer);assert.equal((await command(lc,'SELECT inventory.set_writer_policy($1,$2,$3,$4) AS changed',[local.policy_version,reduced.policyVersion,local.max_products,reduced.maxLogicalBytes])).rows[0].changed,true);
    const changed=(await command(lc,'SELECT * FROM inventory.quota_state WHERE id=1')).rows[0];assert.equal(changed.policy_version,reduced.policyVersion);assert.equal(changed.max_logical_bytes,reduced.maxLogicalBytes);assert.equal(changed.logical_bytes,local.logical_bytes);assert.equal(changed.active_products,local.active_products);assert.equal(changed.max_products,local.max_products);localRollback=await rollback(lc);
   }finally{if(!localRollback)localRollback=await lc.query('ROLLBACK').then(()=>true,()=>false);lc.release(!localRollback)}assert.equal(localRollback,true);
   // Central OPEN exists only inside this invisible technical transaction.
   // The original UNKNOWN guard keeps old v; no owner/version/epoch is adopted.
   await command(c,"UPDATE saas.tenant_writer_state SET state='OPEN',writer_version=writer_version+1 WHERE tenant_id=$1",[a.tenant_id]);const newOp=randomUUID();await command(c,'SAVEPOINT under_debt');
   const debtDenied=await denied(c,()=>register(newOp));await command(c,'ROLLBACK TO SAVEPOINT under_debt');await command(c,'RELEASE SAVEPOINT under_debt');await role(c,'saas_owner');
   assert.equal((await command(c,'SELECT count(*)::int AS n FROM saas.write_intents WHERE tenant_id=$1 AND operation_id=$2',[a.tenant_id,newOp])).rows[0].n,0);const debtAfter=await retained();assertRetainedDebt(debtBefore,debtAfter);assert.equal(debtAfter.guardHash,originalGuard);
   const policy=(await command(c,'SELECT policy_version,max_logical_bytes,writer_version FROM saas.tenant_writer_state WHERE tenant_id=$1',[a.tenant_id])).rows[0];assert.equal(policy.policy_version,reduced.policyVersion);assert.equal(policy.max_logical_bytes,reduced.maxLogicalBytes);assert.equal(policy.writer_version,(number(pending.writer_version)+2n).toString());
   report.cases.push({id:'policy-reduction-below-retained-uncertain-32KiB',status:'PASS SQL FUNCTIONS ONLY',debtDenied,originalStatus:'UNKNOWN',projectionReason:'UNCERTAIN',growthState:'RESERVED',retainedBytes:debtAfter.tenantReserved,policyVersion:reduced.policyVersion,maxLogicalBytes:reduced.maxLogicalBytes,oldGuardHash:originalGuard,guardUnchanged:true,resourcesUnchanged:true,usedAndReservedUnchanged:true,extraIntentions:0,localPolicyActualCallerRole:maintainer,localPolicyOuterRollback:true,singleSyntheticTicket:true,HTTP:false});
  }finally{try{outerRollback=await rollback(c)}finally{c.release(!outerRollback)}}
  assert.equal(outerRollback,true);await closed();assert.deepEqual(await fingerprint('mecanet_control',true),centralBefore);assert.deepEqual(await fingerprint('mecanet_tenant_a',false),aBefore);assert.deepEqual(await fingerprint('mecanet_tenant_b',false),bBefore);
  report.outerRollbackAcknowledged=true;report.integralCentralAndBothBusinessHashesUnchanged=true;report.allFencesClosedBeforeAndAfter=true;report.originalAdmissionBarrierPreserved=true;report.noQhQcQtRefund=true;report.status='PASS FOR LISTED SQL ROLLBACK FRAGMENTS ONLY';
 }catch(error){report.status='FAIL';Object.assign(report,sanitizeSqlFailure(error));if(/^GROWTH_[A-Z0-9_]{1,80}$/.test(error.message??''))report.fixedFailure=error.message;throw error}
 finally{report.queries=queries;report.durationMs=Math.round(performance.now()-started);report.fullA8Verified=false;report.httpAcceptance=false;await durable('/run/qa-results/quota-growth-boundary.json',report);await Promise.all([...pools.values()].map(p=>p.end()));console.log(JSON.stringify({project:PROJECT,sourceSha,status:report.status,cases:report.cases,report:'/run/qa-results/quota-growth-boundary.json',secretsPrinted:false}))}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await runGrowthBoundary()}catch(error){console.log(JSON.stringify({status:'FAIL',...sanitizeSqlFailure(error),secretsPrinted:false}));process.exitCode=1}}
