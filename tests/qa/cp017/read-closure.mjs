// One historical synthetic read; never part of the application or worker.
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {createReconciler} from '../../../server/saas/admission/maintenance.js';
import {validateReadHostEndProof} from './resource-closure.mjs';
import {validatePromotionHostProof} from './promotion.mjs';
const PROJECT='mecanet-qa-p1l2-cp017';
export const READ_TICKET='b631be8a-4609-4c88-8d18-c338e61cd7f6';
export const READ_OWNER='68fa268f-f6f9-4970-a2a5-a773d18dc829';
export function validateReadTicket(row,{generation,owner=READ_OWNER}={}){
 assert.equal(row?.id,READ_TICKET);assert.equal(row.owner,owner);assert.equal(row.generation,generation);
 assert.equal(row.state,'UNCERTAIN');assert.equal(row.tenant_id,'11111111-1111-4111-8111-111111111111');
 assert.equal(row.operation_kind,'HTTP');assert.equal(row.lane,'ordinary');assert.equal(row.work_started,true);
 assert.equal(row.has_intent,false);assert.equal(row.reserved_qc,'0');assert(BigInt(row.reserved_qt)>0n);
 return row;
}
async function trusted(name){const p='/run/qa-results/'+name,s=await stat(p);assert(s.isFile()&&(s.mode&0o777)===0o400);return JSON.parse(await readFile(p,'utf8'))}
export async function closeHistoricalRead(){
 assert.equal(process.env.QA_PROJECT,PROJECT);const sourceSha=process.env.QA_CODE_SHA;assert.match(sourceSha??'',/^[a-f0-9]{40}$/);
 const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));assert.equal(qa.project,PROJECT);
 const history=await trusted('artifact-history.json'),proofs=[];
 for(const instance of ['api1','api2'])proofs.push(validateReadHostEndProof(await trusted(`host-end-proof-${instance}.json`),{closureSourceSha:sourceSha,generation:qa.generation,instance,acceptedArtifacts:history.acceptedArtifacts}));
 const original=proofs.find(p=>p.owner===READ_OWNER);assert(original);assert.equal(original.sourceSha,'299ce3c0b6c821f03d0383b7da4d394af1e36475');
 const operational=validatePromotionHostProof({proof:await trusted('operational-host-proof.json'),qa,sourceSha});assert.equal(operational.workerStopped,true);assert.equal(operational.webStopped,true);
 assert.equal(new Set(proofs.map(p=>p.containerId)).size,2);
 for(const proof of proofs){const actual=operational.apis.find(a=>a.instance===proof.instance);for(const k of ['owner','containerId','stoppedSourceSha'])assert.equal(actual[k],k==='stoppedSourceSha'?proof.sourceSha:proof[k])}
 const bootstrap=(await readFile('/run/qa-secrets/bootstrap','utf8')).trim(),ca=await readFile('/run/qa-ca.crt');
 const observer=await createPgPool({host:'postgres',port:5432,database:'mecanet_control',user:'qa_bootstrap',password:bootstrap,ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1,statement_timeout:2000,connectionTimeoutMillis:2000,application_name:'mecanet-cp017-read-end-observer'});
 const pool=await createPgPool({...qa.connections.saas_reconciler,max:1,statement_timeout:500,connectionTimeoutMillis:2000,application_name:'mecanet-cp017-read-end-reconciler'});
 const report={sourceSha,stoppedSourceSha:original.sourceSha,project:PROJECT,generation:qa.generation,ticketId:READ_TICKET,owner:READ_OWNER,containerId:original.containerId,startedAt:new Date().toISOString(),status:'FAIL',secretsPrinted:false};
 async function read(sql,args=[]){const c=await observer.connect();try{await c.query('BEGIN READ ONLY');const r=(await c.query(sql,args)).rows;await c.query('COMMIT');return r}finally{await c.query('ROLLBACK').catch(()=>{});c.release()}}
 const ticket=async()=>(await read('SELECT t.*,EXISTS(SELECT 1 FROM saas.write_intents i WHERE i.ticket_id=t.id) AS has_intent FROM saas.tickets t WHERE id=$1',[READ_TICKET]))[0];
 const windows=async()=>(await read("SELECT encode(sha256(convert_to((SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY scope_key,tick),'[]') FROM saas.windows w)::text,'UTF8')),'hex') AS digest"))[0].digest;
 const business=async()=>(await read("SELECT encode(sha256(convert_to(jsonb_build_object('intents',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tenant_id,operation_id) FROM saas.write_intents i),'growth',(SELECT jsonb_agg(to_jsonb(r) ORDER BY tenant_id,operation_id) FROM saas.write_growth_reservations r),'quota',(SELECT to_jsonb(q) FROM saas.write_control_quota q WHERE id=1))::text,'UTF8')),'hex') AS digest"))[0].digest;
 async function actualEnd(){
  validateReadTicket(await ticket(),{generation:qa.generation});
  assert.equal((await read("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename LIKE 'saas_%' AND usename<>'saas_reconciler'"))[0].n,0);
  assert.equal((await read("SELECT count(*)::int AS n FROM saas.tenant_writer_state WHERE generation=$1 AND state='CLOSED'",[qa.generation]))[0].n,2);
  assert.equal((await read('SELECT generation FROM saas.admission_fence WHERE id=1'))[0].generation,qa.generation);
  const env=(await read("SELECT current_setting('server_version_num') AS version,current_setting('server_encoding') AS encoding,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT system_identifier::text FROM pg_control_system()) AS system_id"))[0];assert.equal(env.version,'180006');assert.equal(env.encoding,'UTF8');assert.equal(env.tls,true);assert.equal(env.system_id,qa.systemIdentifier);
  const states=await read('SELECT tenant_id,generation,data_epoch,writer_version,state FROM saas.tenant_writer_state ORDER BY tenant_id');
  for(const [index,database] of ['mecanet_tenant_a','mecanet_tenant_b'].entries()){
   const local=await createPgPool({host:'postgres',port:5432,database,user:'qa_bootstrap',password:bootstrap,ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1,statement_timeout:2000,connectionTimeoutMillis:2000,application_name:'mecanet-cp017-read-local-end-observer'});
   const c=await local.connect();try{await c.query('BEGIN READ ONLY');const row=(await c.query('SELECT tenant_id,generation,data_epoch,writer_version,state FROM inventory.writer_fence WHERE id=1')).rows[0];assert.deepEqual(row,states[index]);await c.query('COMMIT')}finally{await c.query('ROLLBACK').catch(()=>{});c.release();await local.end()}
  }
  return {runnerStopped:true,sqlSettled:true,responseSettled:true,reference:`CP017:READ:${sourceSha}:${original.containerId.slice(0,12)}`};
 }
 try{
  const beforeWindows=await windows(),beforeBusiness=await business();await actualEnd();
  const denied=createReconciler({pool,generation:qa.generation,verifyRunnerStopped:async()=>({runnerStopped:false,sqlSettled:true,responseSettled:true,reference:'CP017:READ:UNPROVEN'})});
  await assert.rejects(denied.reconcile(READ_TICKET),{code:'END_NOT_PROVEN'});validateReadTicket(await ticket(),{generation:qa.generation});
  const reconciler=createReconciler({pool,generation:qa.generation,verifyRunnerStopped:actualEnd});assert.equal((await reconciler.reconcile(READ_TICKET)).state,'FINISHED');
  const after=await ticket();assert.equal(after.state,'FINISHED');assert.equal(after.owner,READ_OWNER);assert.equal(after.reserved_qc,'0');assert.equal(after.reserved_qt,'0');
  const audit=await read('SELECT owner,generation,reference FROM saas.reconciliation_audit WHERE ticket_id=$1',[READ_TICKET]);assert.equal(audit.length,1);assert.equal(audit[0].owner,READ_OWNER);assert(audit[0].reference.startsWith('CP017:READ:'));
  assert.equal(await windows(),beforeWindows);assert.equal(await business(),beforeBusiness);
  report.status='PASS';Object.assign(report,{noProofDenied:true,positiveProcessSqlHttpEnd:true,reservationClosed:true,qhQcQtNotRefunded:true,businessAndGrowthUnchanged:true,auditRows:1});
 }catch(error){report.failureCode=/^[A-Z0-9_]{1,60}$/.test(error.code??'')?error.code:'READ_CLOSURE_ASSERTION';throw error}
 finally{report.finishedAt=new Date().toISOString();await writeFile('/run/qa-results/read-closure.json',JSON.stringify(report,null,2),{mode:0o600});await Promise.all([pool.end(),observer.end()]);console.log(JSON.stringify(report))}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{await closeHistoricalRead()}catch{process.exitCode=1}
