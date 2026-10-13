// Private, bounded continuity after the original owner's proven resource end.
// Never retries UNKNOWN, invents an operation UUID, or issues business SQL.
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {canonicalWrite,validateResult} from '../../../server/saas/writes/validation.js';
import {createQaClient,assertStatus} from '../cp014/http-client.mjs';
import {withQaInspection,sanitizeSqlFailure} from './sql-live.mjs';
import {validateHostEndProof} from './resource-closure.mjs';
const PROJECT='mecanet-qa-p1l2-cp017',A='11111111-1111-4111-8111-111111111111',ACTOR='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,SHA=/^[a-f0-9]{40}$/;
const INPUT=Object.freeze({quantity:'2',reason:'ACK perdido ficticio'}),EPOCH='2';
const fail=code=>{throw Object.assign(Error(code),{code})};
export const RECOVERY_CHECK_PLAN=Object.freeze({project:PROJECT,maxHttpRequests:12,maxSqlObservations:12,plannedSqlObservations:4,plannedPostgresStatements:16,maxRuntimeMs:60000,positiveBusinessSql:false,newOperationId:false,unknownRetry:false,quotaChanges:false,requiredOrder:['original lost-after-COMMIT case','exact owner HTTP/SQL stop proof','original ticket and growth settlement','verified POLICY reopen','known UUID query CONFIRMED','explicit same-key/input replay','unchanged business and data quota snapshots']});
export function recoveryPointer(integration,{generation,acceptedArtifacts}){
 const point=integration?.recovery,original=integration?.cases?.find(c=>c.id==='lost-after-tenant-commit-retains-unknown-and-durable-effect');
 if(integration?.project!==PROJECT||integration.generation!==generation||!SHA.test(integration.sourceSha??'')||!Array.isArray(acceptedArtifacts)||acceptedArtifacts.filter(a=>a.codeSha===integration.sourceSha).length!==1||original?.status!=='PASS'||original.operationId!==point?.operationId||original.centralUnknownObserved!==true||original.tenantEffectDurable!==true||original.noEffectRetry!==true||point?.tenantId!==A||point.ownerInstance!=='api1'||point.httpFinished!==true||point.requiresPositiveProcessAndSqlEnd!==true||!['operationId','productId','ticketId','restrictionId'].every(key=>UUID.test(point[key]??'')))fail('RECOVERY_CHECK_ORIGINAL_POINTER_REQUIRED');
 const canonical=canonicalWrite({tenantId:A,actorId:ACTOR,action:'inventory.receive',dataEpoch:EPOCH,productId:point.productId,input:INPUT});
 if(point.inputHash!==canonical.requestHash)fail('RECOVERY_CHECK_ORIGINAL_HASH_REQUIRED');
 return {operationId:point.operationId,tenantId:A,actorId:ACTOR,productId:point.productId,ticketId:point.ticketId,restrictionId:point.restrictionId,epoch:EPOCH,requestHash:canonical.requestHash,integrationSourceSha:integration.sourceSha};
}
export function recoverySettlement({point,proof,closure,generation,sourceSha,acceptedArtifacts}){
 validateHostEndProof(proof,{closureSourceSha:sourceSha,generation,instance:'api1',acceptedArtifacts});
 if(!proof.operations.some(op=>op.tenantId===A&&op.operationId===point.operationId&&op.ticketId===point.ticketId)||closure?.project!==PROJECT||closure.generation!==generation||closure.instance!=='api1'||closure.status!=='PASS FOR LISTED OWN RESOURCE CLOSURES ONLY'||!SHA.test(closure.closureSourceSha??'')||closure.stoppedSourceSha!==proof.sourceSha||closure.owner!==proof.owner||closure.containerId!==proof.containerId)fail('RECOVERY_CHECK_POSITIVE_ORIGINAL_END_REQUIRED');
 const matches=closure.cases?.filter(c=>c.operationId===point.operationId&&c.tenantId===A&&c.ticketId===point.ticketId);
 if(!matches||matches.length!==1||matches[0].status!=='PASS'||matches[0].resourceState!=='SETTLED'||!['FINISHED','REJECTED','EXPIRED'].includes(matches[0].ticketState)||matches[0].ownerAndVersionUnchanged!==true||matches[0].actualSqlOwnerAbsent!==true||matches[0].qhQcQtNotRefunded!==true)fail('RECOVERY_CHECK_SETTLED_ORIGINAL_REQUIRED');
 return {stoppedSourceSha:proof.sourceSha,closureSourceSha:closure.closureSourceSha,owner:proof.owner,containerId:proof.containerId};
}
export function assertReplayReady(row,{point,generation,owner}){
 if(!row||row.actor_id!==ACTOR||row.action!=='inventory.receive'||row.generation!==generation||row.data_epoch!==EPOCH||row.request_hash!==point.requestHash||row.ticket_id!==point.ticketId||row.ticket_owner!==owner||row.owner_id!==owner||row.ticket_generation!==generation||row.admission_generation!==generation||row.intent_state!=='CONFIRMED'||row.projection_state!=='CONFIRMED'||!/^[a-f0-9]{64}$/.test(row.result_hash??'')||row.growth_state!=='SETTLED'||!['FINISHED','REJECTED','EXPIRED'].includes(row.ticket_state)||row.reserved_qc!=='0'||row.reserved_qt!=='0'||row.closure_proven!==true||row.old_sql_owners!==0||row.writer_state!=='OPEN'||row.writer_generation!==generation||row.writer_epoch!==EPOCH||row.directory_epoch!==EPOCH||row.schema_version!==2||row.directory_status!=='active'||row.barrier!==false||row.ready!==true)fail('RECOVERY_CHECK_SAFE_REPLAY_NOT_PROVEN');return row;
}
const CONTROL_SQL=`SELECT i.actor_id,i.action,i.generation,i.data_epoch::text,i.request_hash,i.ticket_id,i.owner_id,i.status AS intent_state,pr.state AS projection_state,pr.result_hash,
 r.status AS growth_state,t.state AS ticket_state,t.owner AS ticket_owner,t.generation AS ticket_generation,t.reserved_qc::text,t.reserved_qt::text,w.state AS writer_state,w.generation AS writer_generation,w.data_epoch::text AS writer_epoch,d.data_epoch::text AS directory_epoch,d.schema_version,d.status AS directory_status,f.barrier,f.generation AS admission_generation,saas.writer_readiness($3::uuid) AS ready,
 EXISTS(SELECT 1 FROM saas.write_restriction_tenants g WHERE g.tenant_id=i.tenant_id AND g.generation=i.generation AND g.data_epoch=i.data_epoch AND g.open_version>=i.writer_version AND g.close_proven AND g.stage IN('RESOLVED','REOPENING','OPEN','ACKNOWLEDGED')) AS closure_proven,
 (SELECT count(*)::int FROM pg_stat_activity WHERE application_name=ANY($4::text[])) AS old_sql_owners,
 encode(sha256(convert_to(jsonb_build_object('intent',to_jsonb(i),'projection',to_jsonb(pr),'growth',to_jsonb(r))::text,'UTF8')),'hex') AS immutable_hash,
 w.used_products::text,w.used_bytes::text,w.reserved_products::text,w.reserved_bytes::text,
 (SELECT coalesce(sum(qh),0)::text FROM saas.windows WHERE scope_key='tenant:'||i.tenant_id::text) AS qh,
 (SELECT coalesce(sum(qc),0)::text FROM saas.windows WHERE scope_key='tenant:'||i.tenant_id::text) AS qc,
 (SELECT coalesce(sum(qt),0)::text FROM saas.windows WHERE scope_key='tenant:'||i.tenant_id::text) AS qt
 FROM saas.write_intents i JOIN saas.write_projections pr ON pr.tenant_id=i.tenant_id AND pr.operation_id=i.operation_id
 JOIN saas.write_growth_reservations r ON r.tenant_id=i.tenant_id AND r.operation_id=i.operation_id JOIN saas.tickets t ON t.id=i.ticket_id
 JOIN saas.tenant_writer_state w ON w.tenant_id=i.tenant_id JOIN saas.tenant_directory d ON d.id=i.tenant_id CROSS JOIN saas.admission_fence f
 WHERE i.tenant_id=$1::uuid AND i.operation_id=$2::uuid AND f.id=1`;
const exactDigest=(table,order)=>`(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) ORDER BY ${order}),'[]')::text,'UTF8')),'hex') FROM ${table} x)`;
const LOCAL_SQL=`SELECT o.actor_id,o.action,o.data_epoch::text,o.request_hash,o.status,o.result,a.result_hash,
 (SELECT count(*)::int FROM inventory.movements WHERE operation_id=o.id) AS movements,
 ${exactDigest('inventory.balances','x.product_id')} AS balances_hash,${exactDigest('inventory.movements','x.id')} AS movements_hash,
 ${exactDigest('inventory.operations','x.id')} AS operations_hash,${exactDigest('inventory.audit','x.operation_id')} AS audit_hash,
 ${exactDigest('inventory.quota_state','x.id')} AS quota_hash,
 (SELECT logical_bytes::text FROM inventory.quota_state WHERE id=1) AS logical_bytes,inventory.logical_usage()::text AS actual_logical_bytes
 FROM inventory.operations o JOIN inventory.audit a ON a.operation_id=o.id WHERE o.id=$1::uuid`;
function assertLocal(row,point,resultHash){
 if(!row||row.actor_id!==ACTOR||row.action!=='inventory.receive'||row.data_epoch!==EPOCH||row.request_hash!==point.requestHash||row.status!=='CONFIRMED'||row.result_hash!==resultHash||row.movements!==1||row.logical_bytes!==row.actual_logical_bytes)fail('RECOVERY_CHECK_ORIGINAL_EFFECT_REQUIRED');
 validateResult(row.result);if(row.result.operationId!==point.operationId||row.result.productId!==point.productId||row.result.dataEpoch!==EPOCH||row.result.state!=='CONFIRMED'||row.result.movementId===null)fail('RECOVERY_CHECK_ORIGINAL_RESULT_REQUIRED');return row;
}
async function trusted(path){const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o222)!==0)fail('RECOVERY_CHECK_TRUSTED_HOST_PROOF_REQUIRED');return JSON.parse(await readFile(path,'utf8'))}
export async function runRecoveryCheck(){
 const sourceSha=process.env.QA_CODE_SHA;if(process.env.QA_PROJECT!==PROJECT||!SHA.test(sourceSha??''))fail('RECOVERY_CHECK_EXACT_ENVIRONMENT_REQUIRED');
 const report={project:PROJECT,sourceSha,plan:RECOVERY_CHECK_PLAN,status:'PREREGISTERED / NOT VERIFIED',startedAt:new Date().toISOString(),secretsPrinted:false,businessDataPrinted:false};
 report.harnessSha256=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');await writeFile('/run/qa-results/recovery-check-plan.json',JSON.stringify(report),{mode:0o600});
 let sqlObservations=0,httpRequests=0;const start=performance.now(),bound=()=>{if(performance.now()-start>RECOVERY_CHECK_PLAN.maxRuntimeMs)fail('RECOVERY_CHECK_TIME_ENVELOPE_EXCEEDED')};
 try{
  const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));if(qa.project!==PROJECT||!UUID.test(qa.generation??'')||!qa.fixture?.identities.every(i=>i.email.endsWith('@qa.invalid')))fail('RECOVERY_CHECK_SYNTHETIC_COHORT_REQUIRED');
  const [integration,history,proof,closure]=await Promise.all([readFile('/run/qa-results/integration.json','utf8').then(JSON.parse),trusted('/run/qa-results/artifact-history.json'),trusted('/run/qa-results/host-end-proof-api1.json'),readFile('/run/qa-results/resource-closure-api1.json','utf8').then(JSON.parse)]);
  const point=recoveryPointer(integration,{generation:qa.generation,acceptedArtifacts:history.acceptedArtifacts}),end=recoverySettlement({point,proof,closure,generation:qa.generation,sourceSha,acceptedArtifacts:history.acceptedArtifacts});
  const inspect=async(database,sql,values)=>{bound();if(++sqlObservations>RECOVERY_CHECK_PLAN.maxSqlObservations)fail('RECOVERY_CHECK_SQL_ENVELOPE_EXCEEDED');return withQaInspection(qa,database,async p=>(await p.query(sql,values)).rows[0])};
  const control=()=>inspect('mecanet_control',CONTROL_SQL,[A,point.operationId,qa.generation,[`mecanet-writer:${end.owner}`,`mecanet-qa-api:${end.owner}`]]),local=()=>inspect('mecanet_tenant_a',LOCAL_SQL,[point.operationId]);
  const beforeCentral=assertReplayReady(await control(),{point,generation:qa.generation,owner:end.owner}),before=assertLocal(await local(),point,beforeCentral.result_hash);
  const ca=await readFile('/run/qa-ca.crt'),credentials=JSON.parse(await readFile('/run/qa-secrets/fixture-login.json','utf8'));
  const actor=createQaClient({instance:'api1',purpose:'company',ca,login:{email:'a@qa.invalid',password:credentials.password},budget:12}),second=createQaClient({instance:'api2',purpose:'company',ca,budget:12});
  const request=async(client,path,options)=>{bound();if(++httpRequests>RECOVERY_CHECK_PLAN.maxHttpRequests)fail('RECOVERY_CHECK_HTTP_ENVELOPE_EXCEEDED');const reply=await client.request(path,options);bound();return reply};
  bound();httpRequests+=2;await actor.login();bound();second.setCookies(actor.cookieHeader());second.csrf=actor.csrf;
  for(const client of [actor,second])assertStatus(await request(client,'/api/health/ready'),200);
  const path=`/api/tenants/${A}/operations/${point.operationId}`,known=await request(second,path);assertStatus(known,200);assert.equal(known.json.state,'CONFIRMED');assert.equal(known.json.tenantId,A);assert.equal(known.json.dataEpoch,EPOCH);assert.deepEqual(validateResult(known.json.result),before.result);
  // Exactly one explicit same-key replay, after confirmed query and original
  // owner settlement. Capacity/error responses fail this assay; never retry.
  const replay=await request(actor,`/api/tenants/${A}/products/${point.productId}/stock-receipts`,{method:'POST',body:INPUT,headers:{'Idempotency-Key':point.operationId,'X-Data-Epoch':EPOCH}});assertStatus(replay,201);assert.deepEqual(validateResult(replay.json),before.result);
  const afterQuery=await request(second,path);assertStatus(afterQuery,200);assert.equal(afterQuery.json.state,'CONFIRMED');assert.deepEqual(validateResult(afterQuery.json.result),before.result);
  const afterCentral=assertReplayReady(await control(),{point,generation:qa.generation,owner:end.owner}),after=assertLocal(await local(),point,afterCentral.result_hash);assert.deepEqual(after,before);assert.equal(afterCentral.immutable_hash,beforeCentral.immutable_hash);
  for(const key of ['used_products','used_bytes','reserved_products','reserved_bytes'])assert.equal(afterCentral[key],beforeCentral[key]);for(const key of ['qh','qc','qt'])assert(BigInt(afterCentral[key])>=BigInt(beforeCentral[key]));
  Object.assign(report,{status:'PASS FOR ORIGINAL LOST-ACK CONTINUITY ONLY',generation:qa.generation,operationId:point.operationId,ticketId:point.ticketId,originalInputHash:point.requestHash,integrationSourceSha:point.integrationSourceSha,stoppedSourceSha:end.stoppedSourceSha,closureSourceSha:end.closureSourceSha,originalOwnerContainerId:end.containerId,positiveOriginalEndVerified:true,queryBeforeReplayConfirmed:true,explicitSameKeyReplay201:true,queryAfterReplayConfirmed:true,oneMovementAndResult:true,businessAndLogicalQuotaUnchanged:true,originalGuardsAndResourceSettlementUnchanged:true,qhQcQtNotRefunded:true,newIntentOrDirectBusinessSql:false});
 }catch(error){Object.assign(report,sanitizeSqlFailure(error));if(/^RECOVERY_CHECK_[A-Z_]{1,70}$/.test(error.code??''))report.fixedFailure=error.code;report.status='FAIL';process.exitCode=1}
 finally{report.sqlObservations=sqlObservations;report.postgresStatementsIncludingReadOnlyProvenance=sqlObservations*4;report.httpRequests=httpRequests;report.finishedAt=new Date().toISOString();await writeFile('/run/qa-results/recovery-check.json',JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report))}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runRecoveryCheck();
