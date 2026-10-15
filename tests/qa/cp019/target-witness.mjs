// Private read-only witness composition; no pool, secret, environment, process
// or resource is created here. Root supplies measured, sequential RO queries
// and fresh observations. This first slice supports ONLY closed begin/enroll.
import {canonical,sha256,validateManifest,verifyEndProof,validateStageRecords} from '../../../server/saas/recovery/protocol.js';
import {validateMaterial,ROLES} from '../../../server/saas/recovery/custody.js';
import {validateTargetPlan,TARGET_PHASES} from './target-driver.mjs';
import {sourceSnapshotSql} from './sql-probe.mjs';
import {canonicalWrite} from '../../../server/saas/writes/validation.js';
import {validateClockRestartPlan} from './clock-restart-plan.mjs';
import {validateAbortPrefixPlan} from './abort-prefix-plan.mjs';
import {validateTargetVariantLineage} from './target-variant-lineage.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',HASH=/^[0-9a-f]{64}$/;
const refuse=(ok,label='TARGET_WITNESS_BINDING')=>{if(!ok)throw Error(label)},same=(a,b)=>canonical(a)===canonical(b),clone=x=>JSON.parse(canonical(x));
const matches=(actual,wanted)=>actual&&Object.entries(wanted).every(([k,v])=>same(actual[k]??null,v));
function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x)}return x}
const strings=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(x)&&BigInt(x)<=9223372036854775807n;
export const TARGET_WITNESS_SUPPORTED_PHASES=Object.freeze([...TARGET_PHASES,'clock-restart-plan','clock-restart-record','promote-fault']);
const stages={begin:'target-begin',enroll:'enroll',configureRole:'configure-role',replayCanary:'canary',configureTenant:'configure-tenant',recordTenantProof:'proof-tenant',configureControl:'configure-control',prepareClock:'transfer-clock',recordClock:'clock-record',verifyTenant:'verify-tenant',verifyControl:'proof-central',preparePromotion:'prepare-promotion',openLocal:'open-local',seal:'seal-tenant',activate:'activate',closeAdmission:'close-admission',abortBegin:'abort-central',abortTenant:'abort-local',abortComplete:'abort-complete'};
const stringifyColumns=(alias,columns)=>columns.map(k=>`'${k}',${alias}.${k}::text`).join(',');

// Closed template. Only fields changed by recovery or the two specifically
// custodied post-restore writers are excluded; their guards/counters are
// checked independently. No request can choose a table, filter or exclusion.
function invariantSql(database){
 let text=sourceSnapshotSql(database),replace=(before,after)=>{refuse(text.split(before).length===2,'TARGET_WITNESS_SNAPSHOT_SOURCE');text=text.replace(before,after)};
 const table=(name,value='to_jsonb(r)',where='')=>replace(`SELECT '${name}' AS kind,to_jsonb(r) AS value FROM ${name} r`,`SELECT '${name}' AS kind,${value} AS value FROM ${name} r${where?' WHERE '+where:''}`);
 if(database==='mecanet_control'){
  table('saas.recovery_runs','to_jsonb(r)','r.id<>$1::uuid');table('saas.recovery_tenants','to_jsonb(r)','r.recovery_id<>$1::uuid');
  for(const[n,keys]of [['tenant_directory',['status','data_epoch','secret_ref','credential_version','writer_secret_ref','writer_credential_version']],['tenant_writer_state',['generation','data_epoch','writer_version','state','used_bytes','used_products','reserved_bytes','reserved_products']],['write_control_quota',['used_bytes','reserved_bytes']],['admission_fence',['generation','tick','clock_version','admission_version','barrier','recovery_id']],['time_authority',['generation','tick','clock_version','owner','advanced_at']],['admission_scopes',['last_turn']]])table('saas.'+n,n==='tenant_directory'?`CASE WHEN r.id IN('${A}'::uuid,'${B}'::uuid) THEN to_jsonb(r)-ARRAY[${keys.map(k=>"'"+k+"'").join(',')}] ELSE to_jsonb(r) END`:`to_jsonb(r)-ARRAY[${keys.map(k=>"'"+k+"'").join(',')}]`);
  for(const n of ['write_intents','write_growth_reservations','write_projections','write_transitions'])table('saas.'+n,'to_jsonb(r)','NOT r.operation_id=ANY($2::uuid[])');
  table('saas.session_registry',"to_jsonb(r)-'status'",'r.generation=$3::uuid');table('saas.tickets','to_jsonb(r)','r.generation=$3::uuid');
  table('saas.windows','to_jsonb(r)','false');
  table('saas.write_restrictions',`CASE WHEN r.id=$4::uuid THEN to_jsonb(r)-'active' ELSE to_jsonb(r) END`,'r.id<>$5::uuid');table('saas.write_restriction_tenants','to_jsonb(r)','r.restriction_id<>$5::uuid');
  const before="SELECT 'saas.identities',jsonb_build_object('id',id,'purpose',purpose,'status',status,'security_version',security_version,'verified',verified,'mfa_verified',mfa_verified) FROM saas.identities";
  replace(before,"SELECT 'saas.identities',CASE WHEN id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid THEN jsonb_build_object('id',id,'purpose',purpose,'verified',verified,'mfa_verified',mfa_verified) ELSE jsonb_build_object('id',id,'purpose',purpose,'status',status,'security_version',security_version,'verified',verified,'mfa_verified',mfa_verified) END FROM saas.identities");
 }else{
  table('inventory.writer_fence',"to_jsonb(r)-ARRAY['generation','data_epoch','writer_version','state']");table('inventory.recovery_guard',"to_jsonb(r)-ARRAY['recovery_id','controller_owner','manifest_hash','mode','source_generation','source_epoch','closed_version','target_generation','target_epoch','open_version','eligibility','closed_reason','source_resource_hash','target_resource_hash','guard_hash','proof_hash','stage','version','abort_id','abort_version']");
  table('inventory.quota_state',"to_jsonb(r)-ARRAY['active_products','logical_bytes']");
  for(const n of ['operations','audit'])table('inventory.'+n,'to_jsonb(r)','NOT r.'+(n==='operations'?'id':'operation_id')+'=ANY($1::uuid[])');
  table('inventory.movements','to_jsonb(r)','NOT r.operation_id=ANY($1::uuid[])');
  const where="NOT r.";table('catalog.products','to_jsonb(r)',where+"id IN(SELECT a.product_id FROM inventory.audit a WHERE a.operation_id=$2::uuid AND a.action='catalog.create')");table('inventory.balances','to_jsonb(r)',where+"product_id IN(SELECT a.product_id FROM inventory.audit a WHERE a.operation_id=$2::uuid AND a.action='catalog.create')");
 }
 return text;
}

const contextSql=`SELECT /* cp019-target-witness-context */ jsonb_build_object(
 'facts',jsonb_build_object('role',current_user,'server_address',host(inet_server_addr()),'system_identifier',(SELECT system_identifier::text FROM pg_control_system()),'version',current_setting('server_version_num'),'encoding',current_setting('server_encoding'),'client',current_setting('client_encoding'),'tls',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'read_only',current_setting('transaction_read_only')),
 'fence',(SELECT to_jsonb(f)||jsonb_build_object('tick',f.tick::text,'clock_version',f.clock_version::text) FROM saas.admission_fence f WHERE id=1),
 'authority',(SELECT to_jsonb(a)||jsonb_build_object('tick',a.tick::text,'clock_version',a.clock_version::text) FROM saas.time_authority a WHERE id=1),
 'normalRun',(SELECT to_jsonb(r)||jsonb_build_object('version',r.version::text,'clock_version',r.clock_version::text,'clock_tick',r.clock_tick::text) FROM saas.recovery_runs r WHERE id=$2::uuid),
 'run',(SELECT to_jsonb(r)||jsonb_build_object('version',r.version::text,'clock_version',r.clock_version::text,'clock_tick',r.clock_tick::text) FROM saas.recovery_runs r WHERE id=$1::uuid),
 'tenants',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('source_epoch',t.source_epoch::text,'target_epoch',t.target_epoch::text,'closed_version',t.closed_version::text,'open_version',t.open_version::text,'abort_version',t.abort_version::text,'reader_version',t.reader_version::text,'writer_credential_version',t.writer_credential_version::text,'version',t.version::text) ORDER BY tenant_id) FROM saas.recovery_tenants t WHERE recovery_id=$1::uuid),'[]'::jsonb),
 'directories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'purpose',purpose,'status',status,'schema_version',schema_version,'data_epoch',data_epoch::text,'credential_version',credential_version::text,'writer_credential_version',writer_credential_version::text,'secret_ref',secret_ref,'writer_secret_ref',writer_secret_ref) ORDER BY id) FROM saas.tenant_directory WHERE purpose='company'),'[]'::jsonb),
 'writers',coalesce((SELECT jsonb_agg(jsonb_build_object('tenant_id',tenant_id,'generation',generation,'data_epoch',data_epoch::text,'writer_version',writer_version::text,'state',state,'reserved_bytes',reserved_bytes::text,'reserved_products',reserved_products::text) ORDER BY tenant_id) FROM saas.tenant_writer_state),'[]'::jsonb),
 'restrictions',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM saas.write_restrictions r WHERE id=ANY($3::uuid[])),'[]'::jsonb),
 'restrictionTenants',coalesce((SELECT jsonb_agg(jsonb_build_object('restriction_id',restriction_id,'tenant_id',tenant_id,'generation',generation,'data_epoch',data_epoch::text,'closed_version',closed_version::text,'stage',stage,'close_proven',close_proven) ORDER BY tenant_id) FROM saas.write_restriction_tenants WHERE restriction_id=ANY($3::uuid[])),'[]'::jsonb),
 'debt',jsonb_build_object('tickets',(SELECT count(*)::int FROM saas.tickets WHERE state IN('ACTIVE','WAITING','UNCERTAIN')),'growth',(SELECT count(*)::int FROM saas.write_growth_reservations WHERE status<>'SETTLED'),'unknown',(SELECT count(*)::int FROM saas.write_intents WHERE status IN('PENDING','EXECUTING','UNKNOWN')),'consumers',(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND usename LIKE 'saas_%'))
 ) AS context`;
const localSql=`SELECT /* cp019-target-witness-local */ jsonb_build_object(
 'facts',jsonb_build_object('role',current_user,'server_address',host(inet_server_addr()),'system_identifier',(SELECT system_identifier::text FROM pg_control_system()),'version',current_setting('server_version_num'),'encoding',current_setting('server_encoding'),'client',current_setting('client_encoding'),'tls',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'read_only',current_setting('transaction_read_only')),
 'fence',(SELECT to_jsonb(f)||jsonb_build_object('data_epoch',f.data_epoch::text,'writer_version',f.writer_version::text) FROM inventory.writer_fence f WHERE id=1),
 'guard',(SELECT to_jsonb(g)||jsonb_build_object('version',g.version::text,'source_epoch',g.source_epoch::text,'target_epoch',g.target_epoch::text,'closed_version',g.closed_version::text,'open_version',g.open_version::text,'abort_version',g.abort_version::text) FROM inventory.recovery_guard g WHERE id=1),
 'quota',(SELECT jsonb_build_object('logical_bytes',q.logical_bytes::text,'actual_bytes',inventory.logical_usage()::text) FROM inventory.quota_state q WHERE id=1)
 ) AS context`;

function allContextSql(){
 const runColumns=['version','clock_version','clock_tick','expected_clock_version','expected_clock_tick','journal_identity_version'];
 return contextSql
  .replace("'version',r.version::text,'clock_version',r.clock_version::text,'clock_tick',r.clock_tick::text",stringifyColumns('r',runColumns))
  .replace("'version',r.version::text,'clock_version',r.clock_version::text,'clock_tick',r.clock_tick::text",stringifyColumns('r',runColumns))
  .replace("'reserved_products',reserved_products::text)","'reserved_products',reserved_products::text,'used_bytes',used_bytes::text,'used_products',used_products::text,'max_products',max_products::text,'max_logical_bytes',max_logical_bytes::text,'policy_version',policy_version::text)")
  .replace("'restrictionTenants'",`'canary',(SELECT to_jsonb(i)||jsonb_build_object('security_version',i.security_version::text) FROM saas.identities i WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid),
 'roleHashes',coalesce((SELECT jsonb_object_agg(rolname,encode(sha256(convert_to(rolpassword,'UTF8')),'hex')) FROM pg_authid WHERE rolcanlogin AND(rolname LIKE 'saas_%' OR rolname='qa_bootstrap')),'{}'::jsonb),
 'windows',coalesce((SELECT jsonb_agg(jsonb_build_object('scope_key',scope_key,'tick',tick::text,'qh',qh::text,'qc',qc::text,'qt',qt::text) ORDER BY scope_key,tick) FROM saas.windows),'[]'::jsonb),
 'scopes',coalesce((SELECT jsonb_agg(jsonb_build_object('scope_key',scope_key,'last_turn',last_turn::text) ORDER BY scope_key) FROM saas.admission_scopes),'[]'::jsonb),
 'quota',(SELECT to_jsonb(q)||jsonb_build_object(${stringifyColumns('q',['used_bytes','reserved_bytes','max_bytes','barrier_max_bytes'])}) FROM saas.write_control_quota q WHERE id=1),
 'consumers',coalesce((SELECT jsonb_agg(jsonb_build_object('role',usename,'application',application_name) ORDER BY usename,application_name) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND(usename LIKE 'saas_%' OR usename='qa_bootstrap')),'[]'::jsonb),
 'newWrites',coalesce((SELECT jsonb_agg(jsonb_build_object('intent',to_jsonb(i)||jsonb_build_object('data_epoch',i.data_epoch::text,'writer_version',i.writer_version::text,'attempt_index',i.attempt_index::text),'projection',to_jsonb(p),'reservation',to_jsonb(r)||jsonb_build_object('products_reserved',r.products_reserved::text,'tenant_bytes_reserved',r.tenant_bytes_reserved::text,'control_bytes_reserved',r.control_bytes_reserved::text),'ticket',to_jsonb(t)||jsonb_build_object('reserved_qc',t.reserved_qc::text,'reserved_qt',t.reserved_qt::text),'session',jsonb_build_object('writer_session_ref',sr.writer_session_ref,'identity_id',sr.identity_id,'purpose',sr.purpose,'generation',sr.generation),'transitions',coalesce((SELECT jsonb_agg(to_jsonb(z)||jsonb_build_object('event_index',z.event_index::text) ORDER BY z.event_index) FROM saas.write_transitions z WHERE z.tenant_id=i.tenant_id AND z.operation_id=i.operation_id),'[]'::jsonb)) ORDER BY i.operation_id) FROM saas.write_intents i LEFT JOIN saas.write_projections p USING(tenant_id,operation_id) LEFT JOIN saas.write_growth_reservations r USING(tenant_id,operation_id) LEFT JOIN saas.tickets t ON t.id=i.ticket_id LEFT JOIN saas.session_registry sr ON sr.writer_session_ref=i.session_ref WHERE i.operation_id=ANY($4::uuid[])),'[]'::jsonb),
 'oldSessionsActive',(SELECT count(*)::int FROM saas.session_registry WHERE generation=$5::uuid AND status<>'revoked'),
 'invariantHash',(SELECT hash FROM (${invariantSql('mecanet_control').replace(/\$([1-5])/g,(_,n)=>({1:'$1',2:'$4',3:'$5',4:'$6',5:'$7'}[n]))}) h),
 'restrictionTenants'`);
}
function allLocalSql(){return localSql.replace("'quota',(SELECT jsonb_build_object('logical_bytes',q.logical_bytes::text,'actual_bytes',inventory.logical_usage()::text)","'invariantHash',(SELECT hash FROM ("+invariantSql('mecanet_tenant_a')+") h), 'newRows',coalesce((SELECT jsonb_agg(jsonb_build_object('operation',to_jsonb(o)||jsonb_build_object('data_epoch',o.data_epoch::text),'audit',to_jsonb(a),'result_hash',encode(sha256(convert_to(o.result::text,'UTF8')),'hex'),'product',to_jsonb(p),'balance',to_jsonb(b)||jsonb_build_object('on_hand',b.on_hand::text,'version',b.version::text),'movement',CASE WHEN m.id IS NULL THEN NULL ELSE to_jsonb(m)||jsonb_build_object('quantity',m.quantity::text,'on_hand_after',m.on_hand_after::text,'balance_version',m.balance_version::text) END) ORDER BY o.id) FROM inventory.operations o JOIN inventory.audit a ON a.operation_id=o.id LEFT JOIN catalog.products p ON p.id=a.product_id LEFT JOIN inventory.balances b ON b.product_id=p.id LEFT JOIN inventory.movements m ON m.operation_id=o.id WHERE o.id=ANY($1::uuid[])),'[]'::jsonb), 'quota',(SELECT jsonb_build_object('logical_bytes',q.logical_bytes::text,'actual_bytes',inventory.logical_usage()::text,'active_products',q.active_products::text,'max_products',q.max_products::text,'max_logical_bytes',q.max_logical_bytes::text,'policy_version',q.policy_version::text)");}

function timeline(m,b,c,restart=null,prefix=null){
 const a=b.anchors,phaseRows={},rows=[];let s={run:null,tenants:{},locals:clone(c.sourceLocalImages),rotated:[],configured:false,recorded:false,canary:false,open:false,closed:true,restartPrepared:false,restartRecorded:false};
 const baseRun={id:m.recoveryId,controller_owner:m.controllerOwner,mode:'RECOVERY',source_generation:m.source.generation,target_generation:m.target.generation,manifest_hash:a.manifestHash,custody_hash:a.custodyHash,journal_hash:b.proofBundle.journalHeadHash,source_end_proof_hash:b.proofBundle.sourceEndProofHash,source_resource_hash:a.sourceResourceHash,target_resource_hash:a.targetResourceHash,expected_tenants:[A,B],restore_restriction_ids:[m.source.operationIds.restore],seed_clock_owner:m.target.seedClockOwner,initial_worker_owner:m.target.workerClockOwner,current_clock_owner:m.target.seedClockOwner,clock_version:c.sourceClock.clockVersion,clock_tick:c.sourceClock.tick};
 const baseTenant=id=>{const q=b.manifest.scopes.find(q=>q.tenantId===id),g=c.sourceGuardSnapshots.find(g=>g.tenantId===id);return{recovery_id:m.recoveryId,tenant_id:id,source_generation:m.source.generation,target_generation:m.target.generation,source_epoch:q.sourceEpoch,target_epoch:q.targetEpoch,closed_version:q.closedVersion,open_version:q.openVersion,abort_version:q.abortVersion,eligibility:q.eligibility,closed_reason:q.closedReason,directory_status:id===A?'active':'blocked',reader_version:q.credentialVersion,writer_credential_version:q.writerCredentialVersion,reader_secret_ref:q.readerRef,writer_secret_ref:q.writerRef,restore_restriction_id:id===A?m.source.operationIds.restore:null,guard_hash:g.guardHash}};
 const baseLocal=id=>{const t=baseTenant(id);return{tenant_id:id,recovery_id:m.recoveryId,controller_owner:m.controllerOwner,mode:'RECOVERY',manifest_hash:a.manifestHash,source_generation:m.source.generation,target_generation:m.target.generation,source_epoch:t.source_epoch,target_epoch:t.target_epoch,closed_version:t.closed_version,open_version:t.open_version,abort_version:t.abort_version,eligibility:t.eligibility,closed_reason:t.closed_reason,source_resource_hash:a.sourceResourceHash,target_resource_hash:a.targetResourceHash,guard_hash:t.guard_hash}};
 const record=()=>rows.push(clone(s));record();
 const programs=[];for(const name of TARGET_PHASES){if(prefix&&name==='activation')continue;if(prefix&&name==='promotion'){programs.push(['promote-fault',{steps:b.plan.phases.promotion.steps.slice(0,prefix.faultPoint==='PROMOTION_AFTER_OPEN_A'?2:1)}]);continue}if(name==='abort-close'&&restart)programs.push(['clock-restart-plan',{steps:[restart.restart.prepare]}],['clock-restart-record',{steps:[restart.restart.record]}]);programs.push([name,prefix?.abortPhases[name]??restart?.abortPhases[name]??b.plan.phases[name]])}
 for(const[name,p]of programs){const start=rows.length-1,steps=[];
  for(const step of p.steps){const before=rows.length-1,x=step.args,id=step.tenantId,method=step.method;
   if(method==='begin')s.run={...baseRun,...x.after};
   else if(method==='enroll')s.tenants[id]={...baseTenant(id),...x.after};
   else if(method==='configureRole')s.rotated.push(step.role);
   else if(method==='replayCanary'){s.canary=true;Object.assign(s.run,{journal_event_id:x.eventId,journal_identity_id:x.identityId,journal_identity_version:x.expectedSecurityVersion,journal_event_proof_hash:x.proofHash})}
   else if(method==='configureTenant')s.locals[id]={...baseLocal(id),...x.after,proof_hash:null};
   else if(method==='recordTenantProof'){const key={CLOSED_CONFIGURED:'configured_proof_hash',VERIFIED:'verified_proof_hash',LOCAL_OPEN:'local_open_proof_hash',SEALED:'sealed_proof_hash',ABORTED_CLOSED:'abort_proof_hash'}[step.phase];Object.assign(s.tenants[id],x.after,{[key]:x.proofHash},step.phase==='ABORTED_CLOSED'?{abort_id:m.target.operationIds.abort}:{})}
   else if(['verifyTenant','openLocal','seal','abortTenant'].includes(method))Object.assign(s.locals[id],x.after,...(['verifyTenant','seal'].includes(method)?[{proof_hash:x.proofHash}]:[]),...(method==='abortTenant'?[{abort_id:m.target.operationIds.abort}]:[]));
   else{
    Object.assign(s.run,x.after);if(method==='configureControl'){s.configured=true;s.run.config_proof_hash=x.proofHash;s.run.clock_version=String(BigInt(c.sourceClock.clockVersion)+1n)}
    if(method==='prepareClock'){if(name==='clock-restart-plan')s.restartPrepared=true;const t=x.transfer;Object.assign(s.run,{transfer_id:t.transferId,previous_clock_owner:t.previousOwner,next_clock_owner:t.nextOwner,expected_clock_version:t.expectedClockVersion,expected_clock_tick:t.expectedTick,clock_transfer_hash:t.transferHash,clock_end_proof_hash:t.endProofHash})}
    if(method==='recordClock'){s.recorded=true;if(name==='clock-restart-record')s.restartRecorded=true;delete s.run.clock_version;delete s.run.clock_tick;Object.assign(s.run,{current_clock_owner:x.after.current_clock_owner??m.target.workerClockOwner,clock_proof_hash:x.proofHash})}
    if(method==='verifyControl')s.run.verified_proof_hash=x.proofHash;
    if(method==='preparePromotion')Object.assign(s.tenants[A],{stage:'PREPARED',version:'4'});
    if(method==='activate'){s.open=true;s.closed=false;s.run.activation_proof_hash=x.proofHash}
    if(method==='closeAdmission')s.closed=true;
    if(method==='abortBegin')s.run.abort_id=m.target.operationIds.abort;
    if(method==='abortComplete')Object.assign(s.run,{abort_id:m.target.operationIds.abort,abort_proof_hash:x.proofHash});
   }
   record();steps.push({step,before,after:rows.length-1});
  }phaseRows[name]={start,end:rows.length-1,steps};
 }
 return{rows,phaseRows};
}

/** Undo only the two metadata INSERT kinds and pointer change of begin/enroll
 * in a SELECT expression. Actual rows/versions are validated before this hash.
 * No normal/historical row, quota, role, grant or business field is ignored. */
function closedCentralFingerprintSql(){
 let text=sourceSnapshotSql('mecanet_control');
 for(const[table,where]of [['recovery_runs','r.id<>$1::uuid'],['recovery_tenants','r.recovery_id<>$1::uuid']]){
  const before=`SELECT 'saas.${table}' AS kind,to_jsonb(r) AS value FROM saas.${table} r`;
  refuse(text.split(before).length===2,'TARGET_WITNESS_SNAPSHOT_SOURCE');text=text.replace(before,before+' WHERE '+where);
 }
 const before="SELECT 'saas.admission_fence' AS kind,to_jsonb(r) AS value FROM saas.admission_fence r";
 refuse(text.split(before).length===2,'TARGET_WITNESS_SNAPSHOT_SOURCE');return text.replace(before,"SELECT 'saas.admission_fence' AS kind,to_jsonb(r)||jsonb_build_object('recovery_id',$2::uuid) AS value FROM saas.admission_fence r");
}

/** Every SELECT uses the supplied measured, implicit RO transaction and ends
 * before returning. No callback receives permission to create or change rows.
 * Fixed BEFORE/AFTER tuples and private readback, rather than a boolean flag,
 * bind the observation to its preselected phase. */
export function createTargetWitness({material,configBundle,configBundleHash,sourceCapture,sourceCaptureHash,phase,clockRestartContext=null,abortPrefixContext=null,variantLineage=null,observeResources,observeSourceEnd,observeTargetEnd,query,authenticateRole,loadInvariantCapture,persistInvariantCapture,now=()=>performance.now(),wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const m=freeze(clone(validateMaterial(material))),b=freeze(clone(configBundle)),c=freeze(clone(sourceCapture));
 refuse(HASH.test(configBundleHash??'')&&sha256(b)===configBundleHash&&b.schema==='target-config-bundle-v1'&&HASH.test(sourceCaptureHash??'')&&sha256(c)===sourceCaptureHash,'TARGET_WITNESS_CUSTODY');
 const lineageContext=variantLineage?freeze(clone(variantLineage)):null,lineage=lineageContext?validateTargetVariantLineage(lineageContext):null;
 if(lineage)refuse(b.variantLineageHash===lineage.additionHash&&same(m,lineage.material)&&same(c,lineageContext.sourceCapture)&&same(b.manifest.source,lineageContext.sourceResource)&&same(b.sourceEndProof,lineageContext.sourceEndProof)&&same(b.observedEnd,lineageContext.observedSourceEnd)&&sha256(lineageContext.copyIndex)===b.manifest.copyIndexHash&&same(b.sourceJournalFinalCheckpoint,lineageContext.sourceJournalFinalCheckpoint)&&b.manifest.target.dataPath===lineage.paths.data&&b.manifest.target.socketPath===lineage.paths.socket,'TARGET_WITNESS_VARIANT_BINDING');
 else refuse(!Object.hasOwn(b,'variantLineageHash'),'TARGET_WITNESS_VARIANT_BINDING');
 const sourceCustodyHash=lineage?lineage.originalSourceMaterialHash:b.anchors.custodyHash;
 const a=b.anchors,p=validateTargetPlan({plan:b.plan,planHash:b.planHash,material:m,anchors:a,proofBundle:b.proofBundle,variantLineage:lineageContext});
 const restartContext=clockRestartContext?freeze(clone(clockRestartContext)):null,restart=restartContext?validateClockRestartPlan({...restartContext,material:m,anchors:a,parentPlan:p,parentPlanHash:b.planHash}):null;
 refuse(!restartContext||!abortPrefixContext,'TARGET_WITNESS_PHASE');
 const prefixContext=abortPrefixContext?freeze(clone(abortPrefixContext)):null,prefix=prefixContext?validateAbortPrefixPlan({...prefixContext,material:m,anchors:a,proofBundle:b.proofBundle,parentPlan:p,parentPlanHash:b.planHash,sourceEndProof:b.sourceEndProof,observedSourceEnd:b.observedEnd,variantLineage:lineageContext,variantLineageHash:lineage?.additionHash??null}):null;
 refuse(TARGET_WITNESS_SUPPORTED_PHASES.includes(phase)&&(!phase.startsWith('clock-restart')||restart)&&(!restart||phase.startsWith('abort-')||phase.startsWith('clock-restart'))&&(phase!=='promote-fault'||prefix)&&(!prefix||phase.startsWith('abort-')||phase==='promote-fault'),'TARGET_WITNESS_PHASE');
 refuse(c.schema==='source-capture-v1'&&c.runId===m.source.normal.runId&&c.custodyHash===sourceCustodyHash&&c.resourceHash===a.sourceResourceHash&&c.sourceCommit===b.manifest.provenance.producerSha&&c.normalManifestHash===p.phases.configure.steps[0].args.expected.manifest_hash&&same(c.sourceGuardSnapshots,b.proofBundle.sourceGuardSnapshots)&&c.sourceFingerprints.central===b.sourceCentralFingerprint&&[A,B].every(id=>c.sourceFingerprints[id]===b.proofBundle.sourceFingerprints[id]&&HASH.test(c.sourceFingerprints[id])&&same(c.sourceLocalImages[id],p.phases.configure.steps.find(s=>s.method==='configureTenant'&&s.tenantId===id).args.expected)),'TARGET_WITNESS_CAPTURE');
 refuse(c.sourceClock?.generation===m.source.generation&&c.sourceClock.owner===m.source.workerClockOwner&&strings(c.sourceClock.clockVersion)&&strings(c.sourceClock.tick)&&same(Object.keys(c.roleVerifierHashes??{}).sort(),[...ROLES,'qa_bootstrap'].sort())&&Object.values(c.roleVerifierHashes).every(x=>HASH.test(x))&&strings(c.canarySecurityVersion),'TARGET_WITNESS_CLOCK');
 const final=validateStageRecords(b.sourceJournalRecords,b.sourceJournalFinalCheckpoint),copyPrefix=validateStageRecords(b.sourceJournalRecords.slice(0,b.sourceJournalCopyCheckpoint.sequence+1),b.sourceJournalCopyCheckpoint);
 refuse(final.pending.length===0&&copyPrefix.pending.length===0&&same(b.sourceJournalFinalCheckpoint,b.manifest.journalFinalCheckpoint)&&same(b.sourceJournalCopyCheckpoint,b.manifest.copyCheckpoint),'TARGET_WITNESS_JOURNAL');
 refuse([observeResources,observeSourceEnd,query,loadInvariantCapture,persistInvariantCapture,now,wait].every(x=>typeof x==='function')&&(!phase.startsWith('abort-')||typeof observeTargetEnd==='function'),'TARGET_WITNESS_DEPENDENCIES');
 const binding={runId:m.recoveryId,controller:m.controllerOwner,generation:m.target.generation,mode:'RECOVERY',manifestHash:a.manifestHash};
 const fixed={planHash:b.planHash,recoveryId:m.recoveryId,generation:m.target.generation,sourceSha:p.sourceSha,producerSha:p.producerSha,manifestHash:a.manifestHash,custodyHash:a.custodyHash,resourceHash:a.targetResourceHash,sourceEndProofHash:b.proofBundle.sourceEndProofHash,copyIndexHash:b.manifest.copyIndexHash,journalHeadHash:b.proofBundle.journalHeadHash,...(lineage?{variantLineageHash:lineage.additionHash}:{})};
 const extraFixed=prefix?{abortPrefixPlanHash:prefixContext.extensionHash}:restart?{clockRestartPlanHash:restartContext.extensionHash,additionHash:restartContext.additionHash}:{},phaseProgram=prefix?(prefix.abortPhases[phase]??{caseName:prefix.caseName,steps:p.phases.promotion.steps.slice(0,prefix.faultPoint==='PROMOTION_AFTER_OPEN_A'?2:1),proofHash:sha256({schema:'cp019-abort-prefix-execution-v1',abortPrefixPlanHash:prefixContext.extensionHash,faultPoint:prefix.faultPoint,stepsHash:sha256(p.phases.promotion.steps.slice(0,prefix.faultPoint==='PROMOTION_AFTER_OPEN_A'?2:1))})}):restart?(restart.abortPhases[phase]??{caseName:'target-'+phase,steps:[phase==='clock-restart-plan'?restart.restart.prepare:restart.restart.record]}):p.phases[phase],currentWorkerOwner=restart&&phase!=='clock-restart-plan'?restartContext.addition.nextOwner:m.target.workerClockOwner;
 const model=timeline(m,b,c,restart,prefix),selected=model.phaseRows[phase],warm=['post-worker-verify','promotion','activation','clock-restart-record','promote-fault'].includes(phase),aborting=phase.startsWith('abort-'),businessAllowed=phase.startsWith('abort-')||phase.startsWith('clock-restart'),ops=[m.target.operationIds.postProduct,m.target.operationIds.postReceipt];
 const runNullable=['transfer_id','previous_clock_owner','next_clock_owner','expected_clock_version','expected_clock_tick','clock_transfer_hash','clock_end_proof_hash','clock_proof_hash','config_proof_hash','verified_proof_hash','activation_proof_hash','abort_id','abort_proof_hash','journal_event_id','journal_identity_id','journal_identity_version','journal_event_proof_hash'];
 const tenantNullable=['configured_proof_hash','verified_proof_hash','local_open_proof_hash','sealed_proof_hash','abort_proof_hash','abort_id'];
 const localNullable=['proof_hash','abort_id'];let busy=false,authenticationObserved=false;
 const withNull=(x,keys)=>({...Object.fromEntries(keys.map(k=>[k,null])),...x});
 function facts(x){refuse(x&&x.role==='qa_bootstrap'&&x.server_address===b.manifest.target.networkIP&&x.system_identifier===b.manifest.target.systemIdentifier&&x.version==='180006'&&x.encoding==='UTF8'&&x.client==='UTF8'&&x.tls===true&&x.read_only==='on','TARGET_WITNESS_CLUSTER')}
 function host(resources){
  validateManifest(b.manifest,resources);refuse(resources.sourcePostgresRunning===false&&resources.targetPostgresRunning===true&&Array.isArray(resources.runtimeConsumers),'TARGET_WITNESS_HOST_CLOSED');
  const live=resources.runtimeConsumers;refuse(live.length===(warm?1:0),'TARGET_WITNESS_HOST_CLOSED');
  if(warm){const q=live[0];refuse(q.service==='worker'&&q.running===true&&q.ownerId===currentWorkerOwner&&/^[0-9a-f]{64}$/.test(q.containerId??'')&&/^sha256:[0-9a-f]{64}$/.test(q.imageDigest??''),'TARGET_WITNESS_HOST_WORKER')}
 }
 function hostIdentity(resources){return Object.fromEntries(['source','target','sourcePostgresRunning','targetPostgresRunning','runtimeConsumers'].map(key=>[key,resources[key]]))}
 function targetEndProof(value){
  const q=value?.endProof,pending=q?.schema==='worker-end-v1',services=pending?['worker']:['api1','api2','web','worker'];
  // A promotion-prefix compensation runs before any business consumer exists.
  // Its one real worker exit uses the existing worker profile; after activation
  // or a clock restart all four previously created services remain mandatory.
  refuse((pending?prefix&&!restart:q?.schema==='source-end-v1')&&Array.isArray(value.createdServices)&&same(value.createdServices,services)&&q.recoveryId===m.recoveryId&&q.sourceResourceHash===a.targetResourceHash&&q.processes?.length===services.length&&same(q.processes.map(t=>t.service).sort(),services)&&q.processes.every(t=>t.ownerId===(t.service==='worker'?currentWorkerOwner:t.service==='web'?m.target.webOwner:m.target.apiOwners[t.service]))&&q.processes.every(t=>!b.sourceEndProof.processes.some(s=>s.containerId===t.containerId)),'TARGET_WITNESS_TARGET_END');
  return verifyEndProof(q,value.observedEnd,{profile:pending?'worker':'source'});
 }
 function clock(x,s){
  const f=x.fence,t=x.authority;if(!(f&&t&&same([f.generation,f.clock_version,f.tick],[t.generation,t.clock_version,t.tick])&&strings(t.clock_version)&&strings(t.tick)&&f.barrier===s.closed&&f.recovery_id===(s.run?m.recoveryId:m.source.normal.runId)))return false;
  if(!s.configured)return matches(t,{generation:m.source.generation,owner:c.sourceClock.owner,clock_version:c.sourceClock.clockVersion,tick:c.sourceClock.tick});
  if(!s.recorded&&!warm)return matches(t,{generation:m.target.generation,owner:m.target.seedClockOwner,clock_version:String(BigInt(c.sourceClock.clockVersion)+1n),tick:c.sourceClock.tick});
  const initial=p.phases['clock-plan'].steps[0].args.transfer,tr=s.restartPrepared&&(warm||s.restartRecorded)?restart.restart.prepare.args.transfer:initial,anchor=s.restartRecorded?restart.restart.prepare.args.transfer:initial;
  if(!matches(t,{generation:m.target.generation,owner:tr.nextOwner})||BigInt(t.clock_version)<BigInt(tr.expectedClockVersion)+1n||BigInt(t.tick)<BigInt(tr.expectedTick)||BigInt(t.clock_version)-(BigInt(tr.expectedClockVersion)+1n)!==BigInt(t.tick)-BigInt(tr.expectedTick))return false;
  if(restart&&phase==='clock-restart-plan'&&(t.clock_version!==restartContext.addition.expectedClockVersion||t.tick!==restartContext.addition.expectedTick))return false;
  if(s.recorded){if(!strings(x.run.clock_version)||!strings(x.run.clock_tick)||BigInt(x.run.clock_version)<BigInt(anchor.expectedClockVersion)+1n||BigInt(x.run.clock_tick)<BigInt(anchor.expectedTick)||BigInt(x.run.clock_version)-(BigInt(anchor.expectedClockVersion)+1n)!==BigInt(x.run.clock_tick)-BigInt(anchor.expectedTick))return false;
   if(!(s.restartPrepared&&!s.restartRecorded&&warm)&&(BigInt(t.clock_version)<BigInt(x.run.clock_version)||BigInt(t.tick)<BigInt(x.run.clock_tick)||BigInt(t.clock_version)-BigInt(x.run.clock_version)!==BigInt(t.tick)-BigInt(x.run.clock_tick)))return false;
  }
  return true;
 }
 function stateMatches(x,locals,s){
  if(!clock(x,s)||!same(x.run===null,s.run===null))return false;
  if(s.run&&!matches(x.run,withNull(s.run,runNullable)))return false;
  if(!Array.isArray(x.tenants)||!same(x.tenants.map(t=>t.tenant_id),Object.keys(s.tenants).sort())||!x.tenants.every(t=>matches(t,withNull(s.tenants[t.tenant_id],tenantNullable))))return false;
  for(const[id,suffix]of [[A,'a'],[B,'b']]){
   const d=x.directories.find(d=>d.id===id),w=x.writers.find(w=>w.tenant_id===id),scope=b.manifest.scopes.find(q=>q.tenantId===id),aborted=['ABORTING','ABORTED_CLOSED'].includes(s.run?.stage),prepared=Number(s.run?.version)>=6&&s.configured;
   const v=id===A&&aborted?scope.abortVersion:id===A&&prepared?scope.openVersion:scope.closedVersion;
   const status=id===B?'blocked':!s.configured?'active':s.open&&!aborted?'active':'draining';
   if(!matches(d,{purpose:'company',status,schema_version:3,data_epoch:s.configured?scope.targetEpoch:scope.sourceEpoch,credential_version:s.configured?scope.credentialVersion:'1',writer_credential_version:s.configured?scope.writerCredentialVersion:'1',secret_ref:s.configured?scope.readerRef:'tenant-'+suffix+'-v1',writer_secret_ref:s.configured?scope.writerRef:'writer-'+suffix+'-v1'})||!matches(w,{generation:s.configured?m.target.generation:m.source.generation,data_epoch:s.configured?scope.targetEpoch:scope.sourceEpoch,writer_version:v,state:id===A&&s.open&&!aborted?'OPEN':'CLOSED',reserved_bytes:'0',reserved_products:'0'}))return false;
   if(locals[id]){const l=locals[id],g=s.locals[id],target=g.mode==='RECOVERY',localAborted=g.stage==='ABORTED_CLOSED',localOpen=id===A&&['LOCAL_OPEN','SEALED'].includes(g.stage);if(!matches(l.guard,target?withNull(g,localNullable):g)||!matches(l.fence,{tenant_id:id,generation:target?m.target.generation:m.source.generation,data_epoch:target?scope.targetEpoch:scope.sourceEpoch,writer_version:localAborted&&id===A?scope.abortVersion:localOpen?scope.openVersion:scope.closedVersion,state:localOpen?'OPEN':'CLOSED'}))return false;}
  }
  if(!same(Object.keys(x.roleHashes??{}).sort(),[...ROLES,'qa_bootstrap'].sort()))return false;
  for(const role of [...ROLES,'qa_bootstrap'])if(x.roleHashes[role]!== (s.rotated.includes(role)?sha256(m.target.roleVerifiers[role].verifier):c.roleVerifierHashes[role]))return false;
  if(!matches(x.canary,{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',status:s.canary?'revoked':'active',security_version:s.canary?String(BigInt(c.canarySecurityVersion)+1n):c.canarySecurityVersion}))return false;
  for(const[id,tenantId,reason]of [[m.source.operationIds.restore,A,'RESTORE'],[m.source.operationIds.blockB,B,'TENANT']]){const r=x.restrictions.find(r=>r.id===id),t=x.restrictionTenants.find(t=>t.restriction_id===id),g=c.sourceGuardSnapshots.find(g=>g.tenantId===tenantId);if(!matches(r,{id,tenant_id:tenantId,reason_code:reason,status:'ACKNOWLEDGED',active:id===m.source.operationIds.restore?!s.open:true,generation:m.source.generation,identity_id:null,session_ref:null,action:null})||!matches(t,{tenant_id:tenantId,generation:m.source.generation,data_epoch:'2',closed_version:g.writerVersion,stage:'ACKNOWLEDGED',close_proven:true}))return false;}
  if(s.configured&&x.oldSessionsActive!==0)return false;return true;
 }
 function central(x){
  facts(x?.facts);const header={id:m.source.normal.runId,controller_owner:m.controllerOwner,mode:'NORMAL',source_generation:m.source.generation,target_generation:m.source.generation,manifest_hash:c.normalManifestHash,custody_hash:sourceCustodyHash,source_resource_hash:a.sourceResourceHash,target_resource_hash:a.sourceResourceHash,expected_tenants:[A,B],restore_restriction_ids:[],seed_clock_owner:m.source.seedClockOwner,initial_worker_owner:m.source.workerClockOwner,current_clock_owner:m.source.workerClockOwner,stage:'COMPLETE',version:'4',global_blocked:true};
  refuse(matches(x.normalRun,header),'TARGET_WITNESS_NORMAL');
  refuse(Array.isArray(x.directories)&&same(x.directories.map(d=>d.id),[A,B])&&Array.isArray(x.writers)&&same(x.writers.map(w=>w.tenant_id),[A,B])&&Array.isArray(x.restrictions)&&x.restrictions.length===2&&Array.isArray(x.restrictionTenants)&&x.restrictionTenants.length===2,'TARGET_WITNESS_ROSTER');
  refuse(matches(x.debt,{tickets:0,growth:0,unknown:0})&&Array.isArray(x.consumers)&&x.consumers.every(q=>warm&&((q.role==='saas_clock'&&q.application==='mecanet-cp019-clock')||(q.role==='saas_writer_maintenance'&&q.application==='mecanet-cp019-maintenance')))&&x.consumers.filter(q=>q.role==='saas_clock').length<=1&&x.consumers.filter(q=>q.role==='saas_writer_maintenance').length<=1,'TARGET_WITNESS_DEBT');
  refuse(x.quota&&strings(x.quota.used_bytes)&&x.quota.reserved_bytes==='0'&&x.quota.max_bytes==='16777216'&&x.quota.barrier_max_bytes==='2097152'&&BigInt(x.quota.used_bytes)<=16777216n,'TARGET_WITNESS_QUOTA');
  refuse(Array.isArray(x.windows)&&Array.isArray(x.scopes)&&x.windows.every(w=>strings(w.tick)&&strings(w.qh)&&strings(w.qc)&&w.qt==='0')&&x.scopes.every(q=>strings(q.last_turn)),'TARGET_WITNESS_COUNTERS');
  for(const w of x.writers)refuse(['used_bytes','used_products','max_products','max_logical_bytes','policy_version'].every(k=>strings(w[k]))&&BigInt(w.used_bytes)<=BigInt(w.max_logical_bytes)&&BigInt(w.used_products)<=BigInt(w.max_products),'TARGET_WITNESS_QUOTA');
 }
 function local(x){facts(x?.facts);refuse(x.quota&&['logical_bytes','actual_bytes','active_products','max_products','max_logical_bytes','policy_version'].every(k=>strings(x.quota[k]))&&x.quota.logical_bytes===x.quota.actual_bytes&&BigInt(x.quota.logical_bytes)<=BigInt(x.quota.max_logical_bytes)&&BigInt(x.quota.active_products)<=BigInt(x.quota.max_products)&&Array.isArray(x.newRows),'TARGET_WITNESS_LOCAL')}
 function growthRows(id,x){
  const rows=x.newRows;refuse((id===A||rows.length===0)&&rows.length<=2&&new Set(rows.map(r=>r.operation?.id)).size===rows.length&&(businessAllowed||rows.length===0),'TARGET_WITNESS_BUSINESS_EFFECT');
  if(!rows.length)return 0;
  const create=rows.find(r=>r.operation.id===ops[0]),receipt=rows.find(r=>r.operation.id===ops[1]);refuse(create&&(!receipt||rows.length===2),'TARGET_WITNESS_BUSINESS_EFFECT');
  for(const r of rows){const action=r===create?'catalog.create':'inventory.receive',o=r.operation,u=r.audit;refuse(matches(o,{id:r===create?ops[0]:ops[1],idempotency_key:r===create?ops[0]:ops[1],actor_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',action,data_epoch:'3',status:'CONFIRMED'})&&o.request_hash===canonicalWrite({tenantId:A,actorId:o.actor_id,action,dataEpoch:'3',productId:r===create?null:create.audit.product_id,input:r===create?{sku:'L3-RESTORED-NEW',name:'Producto nuevo posterior a restauraci\u00f3n'}:{quantity:'7',reason:'Recepci\u00f3n nueva tras restauraci\u00f3n'}}).requestHash&&matches(u,{operation_id:o.id,actor_id:o.actor_id,action,result_hash:r.result_hash})&&HASH.test(r.result_hash??'')&&same(o.result,{operationId:o.id,state:'CONFIRMED',dataEpoch:'3',productId:u.product_id,movementId:r===create?null:u.movement_id,onHand:r===create?'0':'7',balanceVersion:r===create?'1':'2'})&&matches(r.product,{id:u.product_id,sku:'L3-RESTORED-NEW',name:'Producto nuevo posterior a restauraci\u00f3n',status:'active',created_by:o.actor_id})&&matches(r.balance,{product_id:u.product_id,on_hand:receipt?'7':'0',version:receipt?'2':'1'}),'TARGET_WITNESS_BUSINESS_EFFECT');}
  refuse(create.audit.product_id===receipt?.audit.product_id||!receipt,'TARGET_WITNESS_BUSINESS_EFFECT');
  refuse(create.movement===null&&create.audit.movement_id===null&&matches(create.operation.result,{onHand:'0',balanceVersion:'1'}),'TARGET_WITNESS_BUSINESS_EFFECT');
  if(receipt)refuse(matches(receipt.movement,{id:receipt.audit.movement_id,operation_id:ops[1],product_id:create.audit.product_id,actor_id:create.operation.actor_id,type:'RECEIPT',quantity:'7',on_hand_after:'7',balance_version:'2',reason:'Recepci\u00f3n nueva tras restauraci\u00f3n'})&&matches(receipt.operation.result,{movementId:receipt.movement.id,onHand:'7',balanceVersion:'2'}),'TARGET_WITNESS_BUSINESS_EFFECT');return 1;
 }
 function captureBinding(){return{schema:'target-invariants-v1',template:'recovery-exclusions-v1',...fixed,configBundleHash,sourceCaptureHash};}
 function verifyCapture(envelope){refuse(envelope?.value&&HASH.test(envelope.sha256??'')&&sha256(envelope.value)===envelope.sha256&&matches(envelope.value,captureBinding())&&Buffer.byteLength(canonical(envelope.value))<=262144&&same(Object.keys(envelope.value.hashes??{}).sort(),[A,B,'central'].sort())&&Object.values(envelope.value.hashes).every(h=>HASH.test(h))&&envelope.value.writers&&envelope.value.locals&&Array.isArray(envelope.value.windows)&&Array.isArray(envelope.value.scopes),'TARGET_WITNESS_INVARIANT_CAPTURE');return freeze(clone(envelope.value));}
 function checkedNewWrites(x,locals){
  refuse(Array.isArray(x.newWrites)&&x.newWrites.length<=2&&new Set(x.newWrites.map(r=>r.intent?.operation_id)).size===x.newWrites.length&&(businessAllowed||x.newWrites.length===0),'TARGET_WITNESS_NEW_GUARD');
  const scopes=['global','lane:ordinary','tenant:'+A,'tenant:'+A+':ordinary'];
  for(const row of x.newWrites){const i=row.intent,p=row.projection,r=row.reservation,t=row.ticket,create=i.operation_id===ops[0],action=create?'catalog.create':'inventory.receive';
   refuse(ops.includes(i.operation_id)&&matches(i,{tenant_id:A,idempotency_key:i.operation_id,actor_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',action,data_epoch:'3',generation:m.target.generation,writer_version:'3',status:'CONFIRMED',attempt_index:'1'})&&Object.values(m.target.apiOwners).includes(i.owner_id)&&HASH.test(i.request_hash??'')&&same(i.permission_versions,{identity:'1',membership:'1',grant:'1',session:'1',credential:'2',policy:'1'})&&matches(row.session,{writer_session_ref:i.session_ref,identity_id:i.actor_id,purpose:'company',generation:m.target.generation}),'TARGET_WITNESS_NEW_GUARD');
   refuse(matches(p,{tenant_id:A,operation_id:i.operation_id,state:'CONFIRMED',reason_code:'RESULT_CONFIRMED'})&&HASH.test(p.result_hash??'')&&matches(r,{tenant_id:A,operation_id:i.operation_id,ticket_id:i.ticket_id,status:'SETTLED',products_reserved:create?'1':'0',tenant_bytes_reserved:'32768',control_bytes_reserved:'16384',scope_keys:scopes})&&matches(t,{id:i.ticket_id,tenant_id:A,generation:m.target.generation,owner:i.owner_id,state:'FINISHED',lane:'ordinary',operation_kind:'HTTP',work_started:true,reserved_qc:'0',reserved_qt:'0',scopes}),'TARGET_WITNESS_NEW_GUARD');
   const transitions=row.transitions;refuse(Array.isArray(transitions)&&[4,5].includes(transitions.length),'TARGET_WITNESS_NEW_GUARD');const uncertain=transitions.length===5,sequence=[['NONE','PENDING','REGISTERED'],['PENDING','EXECUTING','EXECUTING'],...(uncertain?[['EXECUTING','UNKNOWN','UNCERTAIN']]:[]),[uncertain?'UNKNOWN':'EXECUTING','CONFIRMED','RESULT_CONFIRMED'],['CONFIRMED','SETTLED','SETTLED']];
   for(let n=0;n<sequence.length;n++)refuse(matches(transitions[n],{tenant_id:A,operation_id:i.operation_id,generation:m.target.generation,event_index:String(n+1),from_state:sequence[n][0],to_state:sequence[n][1],reason_code:sequence[n][2]}),'TARGET_WITNESS_NEW_GUARD');
   if(locals[A]){const local=locals[A].newRows.find(z=>z.operation.id===i.operation_id);refuse(local&&local.operation.request_hash===i.request_hash&&local.result_hash===p.result_hash,'TARGET_WITNESS_NEW_GUARD')}
  }
  if(locals[A])refuse(same(x.newWrites.map(z=>z.intent.operation_id).sort(),locals[A].newRows.map(z=>z.operation.id).sort()),'TARGET_WITNESS_NEW_GUARD');
 }
 function invariants(x,locals,capture){
  checkedNewWrites(x,locals);
  refuse(x.invariantHash===capture.hashes.central&&BigInt(x.quota.used_bytes)>=BigInt(capture.quota.used_bytes),'TARGET_WITNESS_INVARIANT');
  for(const old of capture.windows){const w=x.windows.find(w=>w.scope_key===old.scope_key&&w.tick===old.tick);refuse(w&&BigInt(w.qh)>=BigInt(old.qh)&&BigInt(w.qc)>=BigInt(old.qc)&&w.qt==='0','TARGET_WITNESS_COUNTERS')}
  for(const old of capture.scopes){const q=x.scopes.find(q=>q.scope_key===old.scope_key);refuse(q&&BigInt(q.last_turn)>=BigInt(old.last_turn),'TARGET_WITNESS_COUNTERS')}
  for(const id of [A,B]){const w=x.writers.find(w=>w.tenant_id===id),old=capture.writers[id];refuse(['policy_version','max_products','max_logical_bytes'].every(k=>w[k]===old[k])&&BigInt(w.used_bytes)>=BigInt(old.used_bytes)&&BigInt(w.used_products)>=BigInt(old.used_products),'TARGET_WITNESS_QUOTA');if(locals[id]){const l=locals[id],n=growthRows(id,l),base=capture.locals[id];refuse(l.invariantHash===capture.hashes[id]&&['policy_version','max_products','max_logical_bytes'].every(k=>l.quota[k]===base[k])&&BigInt(l.quota.active_products)===BigInt(base.active_products)+BigInt(n)&&BigInt(l.quota.logical_bytes)>=BigInt(base.logical_bytes)&&w.used_bytes===l.quota.logical_bytes&&w.used_products===l.quota.active_products,'TARGET_WITNESS_INVARIANT');}}
 }
 return async function verifyStageProof(request){
  refuse(request&&HASH.test(request.hash??'')&&request.hash===request.proofHash,'TARGET_WITNESS_REQUEST');let kind,allowed,chosenStep;
  if(request.stage==='target-driver-plan'){refuse(Object.entries({...fixed,...extraFixed}).every(([k,v])=>request[k]===v)&&request.hash===b.planHash&&(!restart||same(request.clockRestartPlan,restart))&&(!prefix||same(request.abortPrefixPlan,prefix)),'TARGET_WITNESS_REQUEST');kind='plan';allowed=Array.from({length:selected.end-selected.start+1},(_,i)=>selected.start+i)}
  else if(request.stage==='target-driver-phase'){const q=phaseProgram;refuse(!phase.startsWith('clock-restart')&&Object.entries(extraFixed).every(([k,v])=>request[k]===v)&&request.phase===phase&&request.hash===q.proofHash&&request.planHash===b.planHash&&request.recoveryId===m.recoveryId&&request.generation===m.target.generation&&request.resourceHash===a.targetResourceHash&&request.caseName===q.caseName&&request.stepsHash===sha256(q.steps),'TARGET_WITNESS_REQUEST');kind='phase';allowed=Array.from({length:selected.end-selected.start+1},(_,i)=>selected.start+i)}
  else{const steps=selected.steps.filter(({step})=>stages[step.method]===request.stage&&(step.tenantId??null)===(request.tenantId??null)&&step.args.proofHash===request.hash);refuse(steps.length===1&&same(request.binding,binding)&&(!phase.startsWith('clock-restart')||(same(request.clockAddition,restartContext.addition)&&request.additionHash===restartContext.additionHash&&same(request.workerEndProof,restartContext.workerEndProof))),'TARGET_WITNESS_REQUEST');kind='stage';chosenStep=steps[0];allowed=[chosenStep.before,chosenStep.after]}
  refuse(!busy,'TARGET_WITNESS_BUSY');busy=true;const started=now(),observed=[];let commands=0;
  const bound=()=>refuse(now()-started>=0&&now()-started<45000,'TARGET_WITNESS_DEADLINE');
  const one=async(database,text,values=[])=>{bound();refuse(commands<25,'TARGET_WITNESS_QUERY_LIMIT');commands++;const rows=(await query({database,text,values,readOnly:true,scope:'target',maxLeases:1,queryTimeoutMs:2000})).rows;bound();refuse(Array.isArray(rows)&&rows.length===1,'TARGET_WITNESS_ROWSET');observed.push({database,queryHash:sha256({text,values}),row:rows[0]});return rows[0]};
  try{
   const resources=clone(await observeResources({source:b.manifest.source,target:b.manifest.target,recoveryId:m.recoveryId,planHash:b.planHash}));bound();host(resources);
   const end=clone(await observeSourceEnd({sourceEndProof:b.sourceEndProof,sourceResource:b.manifest.source}));bound();refuse(verifyEndProof(b.sourceEndProof,end)===b.proofBundle.sourceEndProofHash,'TARGET_WITNESS_SOURCE_END');let targetEnd=null;
   if(aborting){targetEnd=clone(await observeTargetEnd({recoveryId:m.recoveryId,generation:m.target.generation,resourceHash:a.targetResourceHash}));bound();targetEndProof(targetEnd);}
   const x=(await one('mecanet_control',allContextSql(),[m.recoveryId,m.source.normal.runId,[m.source.operationIds.restore,m.source.operationIds.blockB],ops,m.source.generation,m.source.operationIds.restore,m.source.operationIds.postcopyCanary])).context;central(x);
   const locals={},ids=phase.startsWith('clock-restart')||phase==='promote-fault'?[A,B]:kind==='stage'?(chosenStep.step.tenantId?[chosenStep.step.tenantId]:[]):[A,B];
   for(const id of ids){locals[id]=(await one(id===A?'mecanet_tenant_a':'mecanet_tenant_b',allLocalSql(),[ops,m.target.operationIds.postProduct])).context;local(locals[id]);}
   const states=allowed.filter(i=>stateMatches(x,locals,model.rows[i]));refuse(states.length>0,'TARGET_WITNESS_FIXED_TUPLE');
   let envelope=await loadInvariantCapture();bound();let capture;
   if(!envelope){
    refuse(phase==='begin-enroll'&&kind==='plan'&&x.run===null&&same(ids,[A,B]),'TARGET_WITNESS_INVARIANT_CAPTURE');
    refuse((await one('mecanet_control',closedCentralFingerprintSql(),[m.recoveryId,m.source.normal.runId])).hash===c.sourceFingerprints.central,'TARGET_WITNESS_COPY_FINGERPRINT');
    for(const id of [A,B])refuse((await one(id===A?'mecanet_tenant_a':'mecanet_tenant_b',sourceSnapshotSql(id===A?'mecanet_tenant_a':'mecanet_tenant_b'))).hash===c.sourceFingerprints[id],'TARGET_WITNESS_COPY_FINGERPRINT');
    const value={...captureBinding(),hashes:{central:x.invariantHash,[A]:locals[A].invariantHash,[B]:locals[B].invariantHash},windows:x.windows,scopes:x.scopes,quota:x.quota,writers:Object.fromEntries(x.writers.map(w=>[w.tenant_id,w])),locals:Object.fromEntries([A,B].map(id=>[id,locals[id].quota]))};
    refuse(Object.values(value.hashes).every(h=>HASH.test(h)),'TARGET_WITNESS_INVARIANT_CAPTURE');envelope=await persistInvariantCapture(value,sha256(value));bound();capture=verifyCapture(envelope);refuse(same(capture,value),'TARGET_WITNESS_INVARIANT_READBACK');
   }else capture=verifyCapture(envelope);
   invariants(x,locals,capture);
   // Rotation itself has eighteen fixed ALTERs: it observes their actual
   // verifier hashes but does not spend eighteen more auth attempts in132SQL.
   // The next cold phase authenticates all chosen credentials, bootstrap last.
   if(!authenticationObserved&&['canary','configure'].includes(phase)&&kind!=='stage'){
    refuse(typeof authenticateRole==='function','TARGET_WITNESS_AUTH_REQUIRED');for(const role of [...ROLES,'qa_bootstrap']){bound();refuse(commands<25,'TARGET_WITNESS_QUERY_LIMIT');commands++;
     const db=role==='qa_bootstrap'||role==='saas_backup'?'postgres':b.runtimeFixture?.connections?.[role]?.database;refuse(typeof db==='string','TARGET_WITNESS_AUTH_REQUIRED');const r=await authenticateRole({role,database:db});bound();
     refuse(r&&r.role===role&&r.database===db&&r.authenticated===true&&r.tls===true,'TARGET_WITNESS_AUTH_RESULT');if(role==='saas_backup')refuse(r.replication===true&&r.systemIdentifier===b.manifest.target.systemIdentifier&&Number.isSafeInteger(r.timeline)&&r.timeline>0&&/^[0-9A-F]+\/[0-9A-F]+$/.test(r.xlogPosition??''),'TARGET_WITNESS_AUTH_RESULT');else refuse(r.replication===false&&r.sqlRole===role&&r.sqlDatabase===db&&r.serverAddress===b.manifest.target.networkIP&&r.readOnly===true,'TARGET_WITNESS_AUTH_RESULT');observed.push({authentication:{role,database:db,...r}});
    }authenticationObserved=true;
   }
   if(warm&&(kind!=='stage'||phase==='clock-restart-record'||phase==='promote-fault')){
    const first=x.authority;await wait(150);bound();const q=await one('mecanet_control',"SELECT /* cp019-target-witness-clock-progress */ a.generation,a.owner,a.clock_version::text,a.tick::text,f.clock_version::text AS fence_clock_version,f.tick::text AS fence_tick FROM saas.time_authority a JOIN saas.admission_fence f USING(id) WHERE a.id=1");refuse(q.generation===m.target.generation&&q.owner===currentWorkerOwner&&strings(q.clock_version)&&strings(q.tick)&&BigInt(q.clock_version)>BigInt(first.clock_version)&&BigInt(q.tick)>BigInt(first.tick)&&BigInt(q.clock_version)-BigInt(first.clock_version)===BigInt(q.tick)-BigInt(first.tick)&&q.fence_clock_version===q.clock_version&&q.fence_tick===q.tick,'TARGET_WITNESS_CLOCK_PROGRESS');
   }
   // Recheck the externally observed boundary after SQL/authentication/wait.
   // A fresh start receipt cannot authorize effects after its host lease expired.
   const finalResources=clone(await observeResources({source:b.manifest.source,target:b.manifest.target,recoveryId:m.recoveryId,planHash:b.planHash}));bound();host(finalResources);refuse(same(hostIdentity(resources),hostIdentity(finalResources)),'TARGET_WITNESS_HOST_CHANGED');
   const finalEnd=clone(await observeSourceEnd({sourceEndProof:b.sourceEndProof,sourceResource:b.manifest.source}));bound();refuse(verifyEndProof(b.sourceEndProof,finalEnd)===b.proofBundle.sourceEndProofHash&&same(end,finalEnd),'TARGET_WITNESS_SOURCE_END');let finalTargetEnd=null;
   if(aborting){finalTargetEnd=clone(await observeTargetEnd({recoveryId:m.recoveryId,generation:m.target.generation,resourceHash:a.targetResourceHash}));bound();refuse(targetEndProof(finalTargetEnd)===targetEndProof(targetEnd)&&same(targetEnd,finalTargetEnd),'TARGET_WITNESS_TARGET_END');}
   bound();const observationHash=sha256({resources,end,targetEnd,finalResources,finalEnd,finalTargetEnd,observed,invariantCaptureHash:envelope.sha256}),common={hash:request.hash,...fixed,...extraFixed,...(restart?{workerEndProofHash:restartContext.addition.endProofHash,workerContainerId:restartContext.workerEndProof.processes[0].containerId,previousOwner:restartContext.addition.previousOwner}:{}),observationHash,observedQueryCount:commands,elapsedMs:Math.ceil(now()-started),layer:'private-readonly-witness',physicalAcceptance:'NOT VERIFIED'};
   if(kind==='plan')return{schema:'target-driver-plan-witness-v1',...common};
   if(kind==='phase')return{schema:'target-driver-phase-witness-v1',...common,phase:request.phase,caseName:request.caseName,stepsHash:request.stepsHash,barrier:x.fence.barrier,globalBlocked:x.run?.global_blocked??null,runVersion:x.run?.version??null,runStage:x.run?.stage??null,abortId:x.run?.abort_id??null};
   return{schema:'target-stage-witness-v1',...common,stage:request.stage,tenantId:request.tenantId??null};
  }finally{busy=false}
 };
}
