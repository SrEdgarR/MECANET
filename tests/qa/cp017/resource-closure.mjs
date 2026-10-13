// Private own-cohort resource reconciliation. Never imported by an API.
// The host controller stops the exact API and private worker first, then writes
// a read-only proof. Time, an expired lease, a fence and absent heartbeat cannot
// replace this proof; every settlement rechecks actual PostgreSQL activity.
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createPgPool,createSecretResolver,createTenantPoolManager} from '../../../server/saas/db/pools.js';
import {createReconciler} from '../../../server/saas/admission/maintenance.js';
import {createRestrictiveCoordinator} from '../../../server/saas/writes/coordinator.js';

const PROJECT='mecanet-qa-p1l2-cp017',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const TENANTS=new Set(['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']);
const fail=code=>Object.assign(Error(code),{code});
// The ticket also has tenant_id. A USING join after i JOIN t leaves two
// identically named columns on the left, so bind the reservation to i explicitly.
export const OWN_RESOURCE_ROW_SQL="SELECT i.tenant_id,i.operation_id,i.owner_id,i.generation,i.data_epoch,i.writer_version,i.status,i.ticket_id,t.owner AS ticket_owner,t.generation AS ticket_generation,t.state AS ticket_state,t.reserved_qc,t.reserved_qt,r.status AS reservation_status,EXISTS(SELECT 1 FROM saas.write_restriction_tenants g WHERE g.tenant_id=i.tenant_id AND g.generation=i.generation AND g.data_epoch=i.data_epoch AND g.open_version>=i.writer_version AND g.close_proven AND g.stage IN('RESOLVED','REOPENING','OPEN','ACKNOWLEDGED')) AS closure_proven FROM saas.write_intents i JOIN saas.tickets t ON t.id=i.ticket_id JOIN saas.write_growth_reservations r ON r.tenant_id=i.tenant_id AND r.operation_id=i.operation_id WHERE i.tenant_id=$1 AND i.operation_id=$2 AND i.ticket_id=$3";
function validateEndProof(proof,{closureSourceSha,generation,instance,acceptedArtifacts,now=Date.now()}={},minimumOperations=1){
 if(!proof||proof.project!==PROJECT||!/^([a-f0-9]{40})$/.test(closureSourceSha??'')||!/^([a-f0-9]{40})$/.test(proof.sourceSha??'')||!UUID.test(generation??'')||proof.generation!==generation||!['api1','api2'].includes(proof.instance)||(instance&&proof.instance!==instance)||!UUID.test(proof.owner??'')||!/^[a-f0-9]{64}$/.test(proof.containerId??'')||proof.running!==false||!Number.isInteger(proof.exitCode)||proof.exitCode<0||proof.exitCode>255||proof.httpClosed!==true||proof.sqlOwnerAbsent!==true||proof.writerApplicationName!==`mecanet-writer:${proof.owner}`||typeof proof.containerStoppedAt!=='string'||!Number.isFinite(Date.parse(proof.containerStoppedAt))||Date.parse(proof.containerStoppedAt)>now+5000||!Array.isArray(proof.operations)||proof.operations.length<minimumOperations||proof.operations.length>64)throw fail('END_NOT_PROVEN');
 if(!Array.isArray(acceptedArtifacts)||acceptedArtifacts.length<1||acceptedArtifacts.length>128||acceptedArtifacts.some(a=>!/^([a-f0-9]{40})$/.test(a?.codeSha??'')||! /^(?:sha256:)?[a-f0-9]{64}$/.test(a?.digest??''))||acceptedArtifacts.filter(a=>a.codeSha===proof.sourceSha).length!==1)throw fail('STOPPED_ARTIFACT_NOT_PROVEN');
 const keys=new Set();for(const operation of proof.operations){if(!TENANTS.has(operation.tenantId)||!UUID.test(operation.operationId??'')||!UUID.test(operation.ticketId??''))throw fail('END_NOT_PROVEN');const key=`${operation.tenantId}:${operation.operationId}:${operation.ticketId}`;if(keys.has(key))throw fail('END_NOT_PROVEN');keys.add(key)}
 return proof;
}

export const validateHostEndProof=(proof,context)=>validateEndProof(proof,context,1);
export const validateReadHostEndProof=(proof,context)=>validateEndProof(proof,context,0);

export async function closeOwnWriterResources({proofName='host-end-proof-api1.json'}={}){
 if(process.env.QA_PROJECT!==PROJECT||!/^([a-f0-9]{40})$/.test(process.env.QA_CODE_SHA??''))throw fail('EXACT_OWN_QA_SOURCE_REQUIRED');
 if(!['host-end-proof-api1.json','host-end-proof-api2.json'].includes(proofName))throw fail('FIXED_OWN_HOST_PROOF_REQUIRED');
 const instance=proofName==='host-end-proof-api1.json'?'api1':'api2';
 const closureSourceSha=process.env.QA_CODE_SHA,proofFile=`/run/qa-results/${proofName}`,proofStat=await stat(proofFile);
 if(!proofStat.isFile()||(proofStat.mode&0o222)!==0)throw fail('TRUSTED_READ_ONLY_HOST_PROOF_REQUIRED');
 const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
 if(qa.project!==PROJECT||!qa.fixture?.identities.every(i=>i.email.endsWith('@qa.invalid'))||!qa.connections.saas_reconciler||!qa.maintenanceEntries)throw fail('SYNTHETIC_COHORT_REQUIRED');
 const historyFile='/run/qa-results/artifact-history.json',historyStat=await stat(historyFile);
 if(!historyStat.isFile()||(historyStat.mode&0o222)!==0)throw fail('TRUSTED_READ_ONLY_ARTIFACT_HISTORY_REQUIRED');
 const history=JSON.parse(await readFile(historyFile,'utf8'));
 const proof=validateHostEndProof(JSON.parse(await readFile(proofFile,'utf8')),{closureSourceSha,generation:qa.generation,instance,acceptedArtifacts:history.acceptedArtifacts});
 const stoppedArtifact=history.acceptedArtifacts.find(a=>a.codeSha===proof.sourceSha);
 const bootstrap=(await readFile('/run/qa-secrets/bootstrap','utf8')).trim(),ca=await readFile('/run/qa-ca.crt');
 const observer=await createPgPool({host:'postgres',port:5432,database:'mecanet_control',user:'qa_bootstrap',password:bootstrap,ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:2000,statement_timeout:2000,application_name:'mecanet-cp017-end-proof-observer'});
 const reconcilerPool=await createPgPool({...qa.connections.saas_reconciler,max:1,connectionTimeoutMillis:2000,statement_timeout:500,application_name:'mecanet-cp017-resource-reconciler'});
 const controlPool=await createPgPool({...qa.connections.saas_writer_maintenance,max:1,connectionTimeoutMillis:2000,statement_timeout:500,application_name:'mecanet-cp017-resource-maintenance'});
 const maintenancePools=createTenantPoolManager({resolveSecret:createSecretResolver({entries:qa.maintenanceEntries,access:'maintenance'}),access:'write',allowedSchemaVersions:[2],maxPools:2,maxPerPool:1});
 const reportFile=`/run/qa-results/resource-closure-${instance}.json`;
 const report={closureSourceSha,stoppedSourceSha:proof.sourceSha,stoppedArtifactDigest:stoppedArtifact.digest,project:PROJECT,generation:qa.generation,instance,owner:proof.owner,containerId:proof.containerId,containerStoppedAt:proof.containerStoppedAt,startedAt:new Date().toISOString(),cases:[],infrastructureModified:false,secretsPrinted:false};
 const inspect=async(text,values=[])=>{
  const client=await observer.connect();try{await client.query('BEGIN READ ONLY');const rows=(await client.query(text,values)).rows;await client.query('COMMIT');return rows}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
 };
 const rowsFor=async(operation)=>(await inspect(OWN_RESOURCE_ROW_SQL,[operation.tenantId,operation.operationId,operation.ticketId]))[0];
 const validateActualEnd=async(operation)=>{
  if(!proof.operations.some(op=>op.tenantId===operation.tenantId&&op.operationId===operation.operationId&&op.ticketId===operation.ticketId))throw fail('END_NOT_PROVEN');
  const row=await rowsFor(operation);
  if(!row||row.generation!==qa.generation||row.ticket_generation!==qa.generation||row.ticket_owner!==proof.owner||(row.owner_id!==null&&row.owner_id!==proof.owner)||!['CONFIRMED','REJECTED'].includes(row.status)||row.closure_proven!==true)throw fail('END_NOT_PROVEN');
  const live=(await inspect('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=ANY($1::text[])',[[proof.writerApplicationName,`mecanet-qa-api:${proof.owner}`]]))[0];
  if(live.n!==0)throw fail('SQL_OWNER_STILL_ALIVE');
  const actualGeneration=(await inspect('SELECT generation FROM saas.admission_fence WHERE id=1'))[0];if(actualGeneration?.generation!==qa.generation)throw fail('END_NOT_PROVEN');
  return row;
 };
 const windows=async()=>(await inspect('SELECT coalesce(sum(qh),0)::text AS qh,coalesce(sum(qc),0)::text AS qc,coalesce(sum(qt),0)::text AS qt FROM saas.windows'))[0];
 const reconciler=createReconciler({pool:reconcilerPool,generation:qa.generation,verifyRunnerStopped:async({ticketId,owner,generation})=>{
  const operation=proof.operations.find(op=>op.ticketId===ticketId);if(!operation||owner!==proof.owner||generation!==qa.generation)throw fail('END_NOT_PROVEN');await validateActualEnd(operation);
  return {runnerStopped:true,sqlSettled:true,responseSettled:true,reference:`CP017:${closureSourceSha}:${proof.sourceSha}:${proof.containerId.slice(0,12)}`};
 }});
 const coordinator=createRestrictiveCoordinator({controlPool,maintenancePools,generation:qa.generation,resolveDescriptor:async guard=>{
  const entry=Object.values(qa.maintenanceEntries).find(e=>e.tenantId===guard.tenant_id);if(!entry)throw fail('END_NOT_PROVEN');return entry;
 },verifyEndProof:async operation=>{
  const row=await validateActualEnd(operation);return ['FINISHED','REJECTED','EXPIRED'].includes(row.ticket_state)&&row.reserved_qc==='0'&&row.reserved_qt==='0';
 }});
 try{
  const beforeWindows=await windows();
  for(const operation of proof.operations){
   let row=await validateActualEnd(operation);const previousTicket=row.ticket_state,previousGrowth=row.reservation_status;
   if(row.ticket_state==='UNCERTAIN')await reconciler.reconcile(operation.ticketId);
   else if(!['FINISHED','REJECTED','EXPIRED'].includes(row.ticket_state))throw fail('TICKET_END_NOT_PROVEN');
   row=await rowsFor(operation);assert.equal(row.reserved_qc,'0');assert.equal(row.reserved_qt,'0');assert(['FINISHED','REJECTED','EXPIRED'].includes(row.ticket_state));
   const settled=await coordinator.settleResources({...operation,proof});assert.equal(settled.settled,true);
   const final=await rowsFor(operation);assert.equal(final.reservation_status,'SETTLED');assert.equal(final.owner_id,row.owner_id);assert.equal(final.writer_version,row.writer_version);
   const repeat=await coordinator.settleResources({...operation,proof});assert.equal(repeat.settled,true);assert.deepEqual(await windows(),beforeWindows);
   report.cases.push({operationId:operation.operationId,tenantId:operation.tenantId,ticketId:operation.ticketId,status:'PASS',previousTicket,previousGrowth,ticketState:final.ticket_state,resourceState:final.reservation_status,ownerAndVersionUnchanged:true,actualSqlOwnerAbsent:true,qhQcQtNotRefunded:true,idempotentSettlement:true});
  }
  const bounds=(await inspect("SELECT q.used_bytes::text,q.reserved_bytes::text,(SELECT coalesce(sum(control_bytes_reserved),0)::text FROM saas.write_growth_reservations WHERE status<>'SETTLED') AS actual_reserved FROM saas.write_control_quota q WHERE id=1"))[0];assert.equal(bounds.reserved_bytes,bounds.actual_reserved);report.centralAccounting= bounds;
  report.status='PASS FOR LISTED OWN RESOURCE CLOSURES ONLY';
 }catch(error){report.status='FAIL';report.failureCode=typeof error.code==='string'&&/^[A-Z0-9_]{1,60}$/.test(error.code)?error.code:'RECONCILIATION_ASSERTION';if(typeof error.position==='string'&&/^[1-9][0-9]{0,6}$/.test(error.position))report.sqlErrorPosition=Number(error.position);throw error}
 finally{report.finishedAt=new Date().toISOString();await writeFile(reportFile,JSON.stringify(report,null,2),{mode:0o600});await maintenancePools.close();await Promise.all([observer,reconcilerPool,controlPool].map(p=>p.end()));console.log(JSON.stringify({closureSourceSha,stoppedSourceSha:proof.sourceSha,status:report.status,cases:report.cases.length,report:reportFile,secretsPrinted:false}))}
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await closeOwnWriterResources({proofName:process.argv[2]??'host-end-proof-api1.json'})}catch(error){console.log(JSON.stringify({status:'FAIL',code:typeof error.code==='string'&&/^[A-Z0-9_]{1,60}$/.test(error.code)?error.code:'RESOURCE_CLOSURE_FAILED',secretsPrinted:false}));process.exitCode=1}
}
