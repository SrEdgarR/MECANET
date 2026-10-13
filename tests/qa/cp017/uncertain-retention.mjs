// Private read-only assay; called by the already admitted synthetic integration.
// No TTL expiry, retry, write, maintenance action or quota change is performed.
import {setTimeout as sleep} from 'node:timers/promises';
const PROJECT='mecanet-qa-p1l2-cp017',A='11111111-1111-4111-8111-111111111111',ACTOR='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,SHA=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/,DECIMAL=/^[0-9]{1,19}$/;
const fail=code=>{throw Object.assign(Error(code),{code})};
export const UNCERTAIN_RETENTION_PLAN=Object.freeze({project:PROJECT,maxWaitMs:8000,maxSqlObservations:12,maxHttpRequests:4,scope:'existing known lost-ACK inventory.receive after durable projection',queueDeadline:'original tickets.queue_expires_at, no invented deadline',heartbeatThreshold:'15 seconds remains outside this bounded assay',maintenanceMutation:false,positiveBusinessSql:false,newOperationId:false,unknownRetry:false,ttlRelease:false});
export const UNCERTAIN_RETENTION_SQL=`SELECT i.operation_id,i.tenant_id,i.actor_id,i.generation,i.owner_id,i.ticket_id,i.status AS intent_state,i.action,i.data_epoch::text,i.request_hash,
 p.state AS projection_state,p.result_hash,r.status AS growth_state,r.tenant_bytes_reserved::text,r.control_bytes_reserved::text,r.products_reserved::text,
 t.generation AS ticket_generation,t.owner AS ticket_owner,t.state AS ticket_state,t.lane,t.operation_kind,t.work_started,t.reserved_qc::text,t.reserved_qt::text,
 t.created_at::text,t.heartbeat_at::text,t.queue_expires_at::text,clock_timestamp()>t.queue_expires_at AS queue_deadline_passed,
 floor(extract(epoch FROM t.queue_expires_at)*1000)::bigint::text AS queue_deadline_ms,floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS observed_ms,
 f.generation AS fence_generation,f.tick::text,f.clock_version::text,f.barrier,c.generation AS clock_generation,c.owner AS clock_owner,c.tick::text AS authority_tick,c.clock_version::text AS authority_version,
 (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
 (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND application_name='mecanet-qa-api:'||t.owner::text) AS original_api_backends,
 (SELECT count(DISTINCT application_name)::int FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE 'mecanet-qa-api:%') AS api_owners,
 (SELECT count(*)::int FROM pg_stat_activity WHERE application_name='mecanet-writer:'||t.owner::text AND state='active') AS active_original_writer_sql,
 encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS ticket_hash,
 encode(sha256(convert_to(jsonb_build_array(to_jsonb(i),to_jsonb(p),to_jsonb(r))::text,'UTF8')),'hex') AS write_resource_hash,
 (SELECT jsonb_build_object('used',q.used_bytes::text,'reserved',q.reserved_bytes::text,'maximum',q.max_bytes::text) FROM saas.write_control_quota q WHERE id=1) AS control_growth,
 (SELECT jsonb_build_object('usedBytes',s.used_bytes::text,'reservedBytes',s.reserved_bytes::text,'usedProducts',s.used_products::text,'reservedProducts',s.reserved_products::text) FROM saas.tenant_writer_state s WHERE s.tenant_id=i.tenant_id) AS tenant_growth,
 (SELECT jsonb_object_agg(v.scope_key,v.counters) FROM (SELECT k.scope_key,jsonb_build_object('qh',coalesce(sum(w.qh),0)::text,'qc',coalesce(sum(w.qc),0)::text,'qt',coalesce(sum(w.qt),0)::text) AS counters FROM unnest(t.scopes) k(scope_key) LEFT JOIN saas.windows w ON w.scope_key=k.scope_key GROUP BY k.scope_key) v) AS charged_counters
 FROM saas.write_intents i JOIN saas.write_projections p ON p.tenant_id=i.tenant_id AND p.operation_id=i.operation_id
 JOIN saas.write_growth_reservations r ON r.tenant_id=i.tenant_id AND r.operation_id=i.operation_id JOIN saas.tickets t ON t.id=i.ticket_id
 CROSS JOIN saas.admission_fence f CROSS JOIN saas.time_authority c WHERE i.tenant_id=$1::uuid AND i.operation_id=$2::uuid AND f.id=1 AND c.id=1`;
function provenance({qa,sourceSha,operationId,event}){
 if(qa?.project!==PROJECT||!UUID.test(qa.generation??'')||!/^\d{10,24}$/.test(qa.systemIdentifier??'')||!qa.fixture?.identities?.length||!qa.fixture.identities.every(i=>typeof i.email==='string'&&i.email.endsWith('@qa.invalid'))||!SHA.test(sourceSha??'')||!UUID.test(operationId??''))fail('RETENTION_EXACT_SYNTHETIC_SOURCE_REQUIRED');
 if(event?.stage!=='write.afterTenantCommit'||event.instance!=='api1'||event.operationId!==operationId||event.tenantId!==A||!UUID.test(event.owner??'')||!UUID.test(event.id??''))fail('RETENTION_ORIGINAL_COMMIT_EVENT_REQUIRED');
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function assertRetainedUncertain(row,{qa,operationId,event,before=null}={}){
 if(!row||row.operation_id!==operationId||row.tenant_id!==A||row.actor_id!==ACTOR||row.generation!==qa.generation||row.ticket_generation!==qa.generation||row.owner_id!==event.owner||row.ticket_owner!==event.owner||!UUID.test(row.ticket_id??'')||row.intent_state!=='CONFIRMED'||row.projection_state!=='CONFIRMED'||row.growth_state!=='PROJECTED'||row.action!=='inventory.receive'||row.data_epoch!=='2'||!HASH.test(row.request_hash??'')||!HASH.test(row.result_hash??'')||row.ticket_state!=='UNCERTAIN'||row.lane!=='ordinary'||row.operation_kind!=='HTTP'||row.work_started!==true||row.reserved_qc!=='0'||!DECIMAL.test(row.reserved_qt??'')||BigInt(row.reserved_qt)<=0n||BigInt(row.reserved_qt)>65536n||row.tenant_bytes_reserved!=='32768'||row.control_bytes_reserved!=='16384'||row.products_reserved!=='0')fail('RETENTION_ORIGINAL_DEBT_REQUIRED');
 if(row.system_identifier!==qa.systemIdentifier||row.fence_generation!==qa.generation||row.clock_generation!==qa.generation||row.barrier!==false||!UUID.test(row.clock_owner??'')||!DECIMAL.test(row.tick??'')||!DECIMAL.test(row.clock_version??'')||row.tick!==row.authority_tick||row.clock_version!==row.authority_version||!DECIMAL.test(row.observed_ms??'')||!DECIMAL.test(row.queue_deadline_ms??'')||typeof row.queue_deadline_passed!=='boolean')fail('RETENTION_CURRENT_CLOCK_PAIR_REQUIRED');
 if(!Number.isInteger(row.original_api_backends)||row.original_api_backends<1||row.api_owners!==2||row.active_original_writer_sql!==0)fail('RETENTION_LIVE_OWNER_AND_SQL_END_REQUIRED');
 if(!HASH.test(row.ticket_hash??'')||!HASH.test(row.write_resource_hash??'')||!row.control_growth||!row.tenant_growth||!row.charged_counters)fail('RETENTION_RESOURCE_FINGERPRINT_REQUIRED');
 if(before){
  for(const key of ['owner_id','ticket_id','ticket_owner','ticket_hash','write_resource_hash','heartbeat_at','queue_expires_at','queue_deadline_ms','reserved_qc','reserved_qt','tenant_bytes_reserved','control_bytes_reserved','products_reserved','request_hash','result_hash','clock_owner','control_growth','tenant_growth','charged_counters'])if(!same(row[key],before[key]))fail('RETENTION_DEBT_OR_GUARD_CHANGED');
  if(BigInt(row.tick)<BigInt(before.tick)||BigInt(row.clock_version)<BigInt(before.clock_version)||BigInt(row.observed_ms)<BigInt(before.observed_ms))fail('RETENTION_CLOCK_REGRESSED');
 }
 return row;
}
export function retainedAfterDeadline(before,after){return after.queue_deadline_passed===true&&BigInt(after.observed_ms)>BigInt(after.queue_deadline_ms)&&BigInt(after.tick)>BigInt(before.tick)&&BigInt(after.clock_version)>BigInt(before.clock_version)};
export async function observeUncertainRetention({qa,sourceSha=process.env.QA_CODE_SHA,operationId,event,readCentral,apiClients,now=()=>performance.now(),delay=sleep}={}){
 provenance({qa,sourceSha,operationId,event});
 if(typeof readCentral!=='function'||['api1','api2'].some(k=>typeof apiClients?.[k]?.request!=='function')||typeof now!=='function'||typeof delay!=='function')fail('RETENTION_TRUSTED_OBSERVERS_REQUIRED');
 const started=now(),deadline=started+UNCERTAIN_RETENTION_PLAN.maxWaitMs;let sqlObservations=0,httpRequests=0,waitedMs=0;
 const left=()=>{const n=Math.floor(deadline-now());if(n<=0)fail('RETENTION_TIME_ENVELOPE_EXCEEDED');return n};
 const live=async()=>{for(const name of ['api1','api2']){if(++httpRequests>UNCERTAIN_RETENTION_PLAN.maxHttpRequests)fail('RETENTION_HTTP_ENVELOPE_EXCEEDED');const reply=await apiClients[name].request('/api/health/live',{signal:AbortSignal.timeout(left())});left();if(reply.status!==200||reply.json?.status!=='live')fail('RETENTION_TWO_API_NOT_LIVE')}};
 const observe=async()=>{left();if(++sqlObservations>UNCERTAIN_RETENTION_PLAN.maxSqlObservations)fail('RETENTION_SQL_ENVELOPE_EXCEEDED');const rows=await readCentral(UNCERTAIN_RETENTION_SQL,[A,operationId]);left();if(rows.length!==1)fail('RETENTION_SINGLE_ORIGINAL_OPERATION_REQUIRED');return rows[0]};
 await live();const before=assertRetainedUncertain(await observe(),{qa,operationId,event});let after=before;
 do{
  // Wall-clock expiration is compared in PostgreSQL, whereas the bounded wait
  // uses the process monotonic clock. No ticket field or clock is edited.
  const untilQueue=Math.max(0,Number(BigInt(before.queue_deadline_ms)-BigInt(before.observed_ms))+1),pause=Math.min(250,untilQueue||250,left()-1);
  if(pause<=0)fail('RETENTION_TIME_ENVELOPE_EXCEEDED');await delay(pause);waitedMs+=pause;
  after=assertRetainedUncertain(await observe(),{qa,operationId,event,before});
 }while(!retainedAfterDeadline(before,after));
 await live();left();
 return{status:'PASS FOR ORIGINAL QUEUE DEADLINE RETENTION ONLY',sourceSha,generation:qa.generation,operationId,ticketId:before.ticket_id,owner:event.owner,ownerInstance:'api1',plan:UNCERTAIN_RETENTION_PLAN,sqlObservations,httpRequests,waitedMs,elapsedMs:Math.ceil(now()-started),originalQueueDeadline:before.queue_expires_at,originalHeartbeat:before.heartbeat_at,initialDeadlinePassed:before.queue_deadline_passed,observedCrossingDuringAssay:!before.queue_deadline_passed,afterDeadlinePassed:true,beforeClock:{tick:before.tick,version:before.clock_version},afterClock:{tick:after.tick,version:after.clock_version},ticketState:'UNCERTAIN',growthState:'PROJECTED',reservedQc:before.reserved_qc,reservedQt:before.reserved_qt,tenantBytesReserved:before.tenant_bytes_reserved,controlBytesReserved:before.control_bytes_reserved,ticketHash:before.ticket_hash,writeResourceHash:before.write_resource_hash,liveOriginalSqlOwner:true,twoApisLive:true,chargedQhQcQtUnchanged:true,positiveEndReconciliation:false,heartbeatAbandonmentThreshold:'NOT VERIFIED by this <=8s assay',businessSql:false,newKey:false,retry:false,secretsPrinted:false};
}
