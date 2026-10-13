// Bounded pure-SQL logical-cost measurements and rollback-only technical probes.
// No business mutation, role/grant change, public endpoint or quota increase.
import assert from 'node:assert/strict';
import {readFile,open,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {sanitizeSqlFailure} from './sql-live.mjs';
import {validatePromotionHostProof} from './promotion.mjs';
import {METADATA_PLAN,worstCaseVectors,checkMeasuredBounds,checkConnectionSample} from './metadata-vectors.mjs';
const PROJECT=METADATA_PLAN.project,A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code})};
async function durable(path,value){const h=await open(path,'w',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync()}finally{await h.close()}}
export async function runMetadataAssay(mode){
 const sourceSha=process.env.QA_CODE_SHA;if(process.env.QA_PROJECT!==PROJECT||!['closed','pools'].includes(mode)||!/^[a-f0-9]{40}$/.test(sourceSha??''))fail('METADATA_EXACT_ENVIRONMENT_REQUIRED');
 const started=performance.now(),report={project:PROJECT,sourceSha,mode,plan:METADATA_PLAN,status:'PREREGISTERED / NOT VERIFIED',observedAt:new Date().toISOString(),cases:[],secretsPrinted:false};
 report.harnessSha256=hash(await readFile(new URL(import.meta.url)));report.vectorSourceSha256=hash(await readFile(new URL('./metadata-vectors.mjs',import.meta.url)));
 // Preregistration is durable before secrets, SQL, observations or injections.
 await durable('/run/qa-results/metadata-plan.json',report);
 const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
 if(qa.project!==PROJECT||!/^\d{10,24}$/.test(qa.systemIdentifier??'')||!qa.fixture?.identities.every(i=>i.email.endsWith('@qa.invalid')))fail('METADATA_SYNTHETIC_COHORT_REQUIRED');
 const [ca,password]=await Promise.all([readFile('/run/qa-ca.crt','utf8'),readFile('/run/qa-secrets/bootstrap','utf8')]);const pools=new Map();let queries=0;
 const bounded=()=>{if(performance.now()-started>METADATA_PLAN.maxRuntimeMs||++queries>METADATA_PLAN.maxQueries)fail('METADATA_ENVELOPE_EXCEEDED')};
 const poolFor=async database=>{
  if(!['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'].includes(database))fail('METADATA_FIXED_DATABASE_REQUIRED');
  if(!pools.has(database))pools.set(database,await createPgPool({host:'postgres',port:5432,database,user:'qa_bootstrap',password,ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:1500,statement_timeout:2000,lock_timeout:500,application_name:'mecanet-cp017-pure-metadata'}));return pools.get(database);
 };
 const read=async(database,text,values=[])=>{
  bounded();const c=await(await poolFor(database)).connect();try{await c.query('BEGIN READ ONLY');const result=(await c.query(text,values)).rows;await c.query('COMMIT');return result}catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
 };
 const central=(text,values)=>read('mecanet_control',text,values),tenant=(text,values)=>read('mecanet_tenant_a',text,values);
 const ledger=async()=>{
  const row=(await central("SELECT encode(sha256(convert_to((SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.scope_key,w.tick),'[]') FROM saas.windows w)::text,'UTF8')),'hex') AS windows_hash,encode(sha256(convert_to((SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM saas.tickets t)::text,'UTF8')),'hex') AS tickets_hash,encode(sha256(convert_to((SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.tenant_id,t.operation_id,t.event_index),'[]') FROM saas.write_transitions t)::text,'UTF8')),'hex') AS transitions_hash,encode(sha256(convert_to((SELECT to_jsonb(q) FROM saas.write_control_quota q WHERE id=1)::text,'UTF8')),'hex') AS control_hash"))[0];return row;
 };
 const expectedError=async(c,text,values,reason)=>{
  bounded();let error;try{await c.query(text,values)}catch(caught){error=caught}
  if(error?.code!=='P0001'||error.message!==reason)fail('METADATA_FIXED_NEGATIVE_NOT_PROVEN');return{sqlState:'P0001',fixedReason:reason};
 };
 try{
  const env=(await central("SELECT current_setting('server_version_num') AS version,current_setting('server_encoding') AS encoding,current_setting('max_connections')::int AS max_connections,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT system_identifier::text FROM pg_control_system()) AS system_id,(SELECT generation FROM saas.admission_fence WHERE id=1) AS generation"))[0];
  assert.equal(env.version,'180006');assert.equal(env.encoding,'UTF8');assert.equal(env.tls,true);assert.equal(env.system_id,qa.systemIdentifier);assert.equal(env.generation,qa.generation);report.environment={version:env.version,encoding:env.encoding,tls:true,maxConnections:env.max_connections,systemIdentifier:env.system_id};
  if(mode==='pools'){
   const limits=await central("SELECT rolname,rolconnlimit FROM pg_roles WHERE rolname IN('saas_api','saas_session','saas_issuer','saas_clock','saas_writer_maintenance','saas_writer_a','saas_writer_b','saas_tenant_a','saas_tenant_b','saas_demo','saas_maintainer_a','saas_maintainer_b') ORDER BY rolname"),samples=[];
   for(let i=0;i<5;i++){
    const rows=await central("SELECT usename,application_name,state FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid() ORDER BY usename,application_name,pid");samples.push(checkConnectionSample({rows,limits,maxConnections:env.max_connections}));if(i!==4)await new Promise(r=>setTimeout(r,100));
   }
   report.samples=samples;report.cases.push({id:'measured-two-api-read-write-and-worker-aggregate',status:'PASS',sampleCount:5,limitsUnchanged:true,saturation:'NOT VERIFIED'});
  }else{
   const hostPath='/run/qa-results/operational-host-proof.json',hostStat=await stat(hostPath);if(!hostStat.isFile()||(hostStat.mode&0o222)!==0)fail('METADATA_READ_ONLY_HOST_PROOF_REQUIRED');
   const proof=JSON.parse(await readFile(hostPath,'utf8'));validatePromotionHostProof({proof,qa,sourceSha});
   const closed=await central('SELECT tenant_id,generation,state,writer_version,data_epoch FROM saas.tenant_writer_state ORDER BY tenant_id');
   assert.deepEqual(closed.map(s=>s.tenant_id),[A,B]);for(const state of closed){assert.equal(state.state,'CLOSED');assert.equal(state.generation,qa.generation);const local=(await read(state.tenant_id===A?'mecanet_tenant_a':'mecanet_tenant_b','SELECT * FROM inventory.writer_fence WHERE id=1'))[0];for(const key of ['state','generation','writer_version','data_epoch'])assert.equal(local[key],state[key])}
   const active=(await central("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename IN('saas_api','saas_issuer','saas_session','saas_writer_a','saas_writer_b','saas_tenant_a','saas_tenant_b','saas_demo')"))[0];assert.equal(active.n,0);
   const pending=(await central("SELECT count(*)::int AS n FROM saas.write_intents WHERE status IN('PENDING','EXECUTING','UNKNOWN')"))[0];assert.equal(pending.n,0);
   const before=await ledger(),vectors=worstCaseVectors(),local={},control={},barrier={};
   for(const [kind,value]of Object.entries(vectors.local))local[kind]=(await tenant('SELECT inventory.logical_cost($1,$2::jsonb)::text AS n',[kind,JSON.stringify(value)]))[0].n;
   for(const [kind,value]of Object.entries(vectors.central))control[kind]=(await central('SELECT saas.write_logical_cost($1,$2::jsonb)::text AS n',[kind,JSON.stringify(value)]))[0].n;
   for(const [kind,table]of [['state','saas.tenant_writer_state'],['restriction','saas.write_restrictions'],['tenant','saas.write_restriction_tenants'],['control','saas.write_control_quota']])barrier[kind]=(await central(`SELECT (octet_length(convert_to(to_jsonb(jsonb_populate_record(NULL::${table},$1::jsonb))::text,'UTF8'))+256)::text AS n`,[JSON.stringify(vectors.barrier[kind])]))[0].n;
   const resultBytes=(await tenant("SELECT octet_length(convert_to(($1::jsonb)::text,'UTF8'))::int AS n",[JSON.stringify(vectors.confirmed)]))[0].n;
   const canonical=(await tenant("SELECT octet_length(convert_to($1,'UTF8'))::int AS n,encode(sha256(convert_to($1,'UTF8')),'hex') AS hash",[vectors.preimage]))[0];assert.equal(canonical.hash,hash(vectors.preimage));
   report.measured={local,central:control,barrier,resultBytes,canonicalUtf8Bytes:canonical.n,canonicalDigestMatches:true,...checkMeasuredBounds({local,central:control,barrier,resultBytes,preimageBytes:canonical.n})};
   report.cases.push({id:'real-postgresql-worst-case-seven-local-and-four-central-forms',status:'PASS',noRowsInserted:true,fiveRowsIncludeQuota:true,twelveTransitionAllowance:true});
   const negatives=[];
   for(const [database,text,values,reason]of [
    ['mecanet_tenant_a','SELECT inventory.logical_cost($1,$2::jsonb)',['product',JSON.stringify({...vectors.local.product,name:'\u0001'.repeat(1000)})],'LOGICAL_ROW_BOUND_EXCEEDED'],
    ['mecanet_control','SELECT saas.write_logical_cost($1,$2::jsonb)',['reservation',JSON.stringify({...vectors.central.reservation,scope_keys:['X'.repeat(3000),'global','lane:ordinary',`tenant:${A}`]})],'CONTROL_ROW_BOUND_EXCEEDED'],
   ]){
    const c=await(await poolFor(database)).connect();try{await c.query('BEGIN READ ONLY');negatives.push(await expectedError(c,text,values,reason))}finally{await c.query('ROLLBACK').catch(()=>{});c.release()}
   }
   // One rollback-only technical row proves the real finite transition guard.
   // It cannot alter any business row, intention guard or persist evidence debt.
   const operation=(await central("SELECT i.tenant_id,i.operation_id,i.generation FROM saas.write_intents i WHERE i.status IN('CONFIRMED','REJECTED') AND NOT EXISTS(SELECT 1 FROM saas.write_transitions t WHERE t.tenant_id=i.tenant_id AND t.operation_id=i.operation_id AND (t.event_index=12 OR t.reason_code IN('CLOSED','NO_EFFECT'))) ORDER BY i.operation_id LIMIT 1"))[0];
   if(!operation)fail('METADATA_EXISTING_TERMINAL_FIXTURE_REQUIRED');
   const c=await(await poolFor('mecanet_control')).connect();try{
    await c.query('BEGIN');await c.query('SET LOCAL ROLE saas_owner');
    await c.query("INSERT INTO saas.write_transitions(tenant_id,operation_id,generation,event_index,from_state,to_state,reason_code,recorded_at) VALUES($1,$2,$3,12,'CONFIRMED','SETTLED','CLOSED',clock_timestamp())",[operation.tenant_id,operation.operation_id,operation.generation]);
    negatives.push(await expectedError(c,"SELECT saas.write_transition($1,$2,$3,'CONFIRMED','REJECTED','NO_EFFECT')",[operation.tenant_id,operation.operation_id,operation.generation],'TRANSITION_BUDGET_EXHAUSTED'));
   }finally{await c.query('ROLLBACK').catch(()=>{});c.release()}
   // Overflow predicates are evaluated on one technical counter injection only.
   // CLOSED is preserved. This is explicitly NOT an exhausted-handler PASS.
   const b=await(await poolFor('mecanet_control')).connect();try{
    await b.query('BEGIN');await b.query('SET LOCAL ROLE saas_owner');
    await b.query('UPDATE saas.write_control_quota SET reserved_bytes=max_bytes-used_bytes+1 WHERE id=1 AND used_bytes<=max_bytes');
    const p=(await b.query('SELECT used_bytes+reserved_bytes>max_bytes AS exceeded,used_bytes+reserved_bytes>max_bytes-16384 AS new_intent_denied,max_bytes::text,barrier_max_bytes::text FROM saas.write_control_quota WHERE id=1')).rows[0];assert.equal(p.exceeded,true);assert.equal(p.new_intent_denied,true);assert.equal(p.max_bytes,'16777216');assert.equal(p.barrier_max_bytes,'2097152');
    report.globalOverflowPredicate={status:'PASS FOR PREDICATE ONLY',fixedLimitBytes:p.max_bytes,exhausted:true,unmodifiedWriterFences:true,actualWriterHandler:'NOT VERIFIED; CLOSED blocks it before the budget predicate'};
   }finally{await b.query('ROLLBACK').catch(()=>{});b.release()}
   assert.deepEqual(await ledger(),before);report.negatives=negatives;report.cases.push({id:'real-size-and-transition-overflow-negatives-rolled-back',status:'PASS',ledgerAndTicketsAndTransitionsAndBudgetUnchanged:true});
  }
  report.status='PASS FOR LISTED FRAGMENTS ONLY';
 }catch(error){report.status='FAIL';Object.assign(report,sanitizeSqlFailure(error));if(/^METADATA_[A-Z0-9_]{1,80}$/.test(error.message??''))report.fixedFailure=error.message;throw error}
 finally{report.queries=queries;report.durationMs=Math.round(performance.now()-started);report.fullA8Verified=false;await durable(`/run/qa-results/metadata-${mode}.json`,report);await Promise.all([...pools.values()].map(p=>p.end()));console.log(JSON.stringify({status:report.status,sourceSha,mode,cases:report.cases,report:`/run/qa-results/metadata-${mode}.json`,secretsPrinted:false}))}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await runMetadataAssay(process.argv[2])}catch(error){console.log(JSON.stringify({status:'FAIL',...sanitizeSqlFailure(error),secretsPrinted:false}));process.exitCode=1}}
