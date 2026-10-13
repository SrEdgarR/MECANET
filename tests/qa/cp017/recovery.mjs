// Exclusive closed synthetic L2 recovery. Never imported by the application.
import assert from 'node:assert/strict';
import {readFile,open,writeFile} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash,pbkdf2Sync,createHmac} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {QA_ROLES} from '../schema/fixture.js';
import {createJournal,openJournal,verifyJournal,replayRestrictive,syncDirectoryStrict} from '../recovery/journal.js';
const PROJECT='mecanet-qa-p1l2-cp017',ROOT='/run/qa-journal',A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const DB=['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'],UUID=/^[a-f0-9-]{36}$/,hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code})};
export function validateOwnConnections(connections){
 const roles=[...Object.keys(QA_ROLES),'saas_writer_maintenance','saas_writer_a','saas_writer_b','saas_maintainer_a','saas_maintainer_b'];
 if(!connections||Object.keys(connections).length!==roles.length||roles.some(role=>{const c=connections[role];return !c||c.host!=='postgres'||c.port!==5432||c.user!==role||!['mecanet_control','mecanet_tenant_a','mecanet_tenant_b','mecanet_demo'].includes(c.database)||c.connectionString!==undefined||c.ssl?.rejectUnauthorized!==true||c.ssl?.servername!=='postgres'}))fail('RESTORE_OWN_CONNECTIONS_REQUIRED');
}
async function durable(name,value){const h=await open(`${ROOT}/${name}`,'w',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync()}finally{await h.close()}await syncDirectoryStrict(ROOT)}
export function scramVerifier(password,salt=randomBytes(16)){
 if(typeof password!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(password)||!Buffer.isBuffer(salt)||salt.length!==16)fail('RESTORE_CANDIDATE_REQUIRED');
 const salted=pbkdf2Sync(password,salt,4096,32,'sha256'),client=createHmac('sha256',salted).update('Client Key').digest(),server=createHmac('sha256',salted).update('Server Key').digest();
 return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${createHash('sha256').update(client).digest('base64')}:${server.toString('base64')}`;
}
export function validateRecoveryProof(proof,{sourceSha,generation,systemIdentifier,target=false}){
 if(proof?.project!==PROJECT||proof.sourceSha!==sourceSha||proof.generation!==generation||proof.systemIdentifier!==systemIdentifier||proof.sourceRuntimeStopped!==true||proof.sqlOwnersAbsent!==true||!Array.isArray(proof.apis)||proof.apis.length!==2||new Set(proof.apis.map(p=>p.instance)).size!==2||new Set(proof.apis.map(p=>p.containerId)).size!==2||proof.apis.some(p=>!['api1','api2'].includes(p.instance)||!/^[a-f0-9]{64}$/.test(p.containerId)||p.state!=='exited'||!/^[a-f0-9]{40}$/.test(p.stoppedSourceSha??'')))fail('RESTORE_HOST_END_REQUIRED');
 if(target&&(proof.backupVerified!==true||proof.targetPrivate!==true||proof.targetEgressClosed!==true||proof.targetHost!=='postgres'||!/^[a-f0-9]{64}$/.test(proof.backupManifestHash)))fail('RESTORE_TARGET_REQUIRED');
 return proof;
}
async function own(){
 if(process.env.QA_PROJECT!==PROJECT||!/^[a-f0-9]{40}$/.test(process.env.QA_CODE_SHA??''))fail('RESTORE_EXACT_SOURCE_REQUIRED');
 const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
 if(qa.project!==PROJECT||!qa.fixture?.identities.every(i=>i.email.endsWith('@qa.invalid')))fail('RESTORE_SYNTHETIC_REQUIRED');
 validateOwnConnections(qa.connections);
 const [ca,password]=await Promise.all([readFile('/run/qa-ca.crt','utf8'),readFile('/run/qa-secrets/bootstrap','utf8')]);
 return {qa,config:{host:'postgres',port:5432,user:'qa_bootstrap',password,ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1,statement_timeout:3000,lock_timeout:500,connectionTimeoutMillis:2000,application_name:'mecanet-private-l2-recovery'}};
}
async function inDb(config,database,fn){assert(DB.includes(database));const p=await createPgPool({...config,database});try{return await fn(p)}finally{await p.end()}}
async function closedSnapshot(config,qa,{requireSettled=true}={}){
 const central=await inDb(config,DB[0],async p=>{
  assert.equal((await p.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier,qa.systemIdentifier);
  const states=(await p.query('SELECT * FROM saas.tenant_writer_state ORDER BY tenant_id')).rows;assert.equal(states.length,2);assert(states.every(s=>s.state==='CLOSED'&&s.generation===qa.generation));
  const live=(await p.query("SELECT count(*)::int AS n FROM saas.tickets WHERE state IN('WAITING','ACTIVE','UNCERTAIN')")).rows[0].n;
  const debt=(await p.query("SELECT count(*)::int AS n FROM saas.write_growth_reservations WHERE status<>'SETTLED'")).rows[0].n;
  const account=(await p.query("SELECT q.used_bytes::text,q.reserved_bytes::text,(SELECT coalesce(sum(saas.write_operation_cost(r.tenant_id,r.operation_id)),0)::text FROM saas.write_growth_reservations r WHERE r.status='SETTLED') AS actual_used,(SELECT coalesce(sum(control_bytes_reserved),0)::text FROM saas.write_growth_reservations WHERE status<>'SETTLED') AS actual_reserved FROM saas.write_control_quota q WHERE id=1")).rows[0];assert.equal(account.used_bytes,account.actual_used);assert.equal(account.reserved_bytes,account.actual_reserved);
  assert.equal((await p.query("SELECT count(*)::int AS n FROM saas.write_intents WHERE status IN('PENDING','EXECUTING','UNKNOWN')")).rows[0].n,0);
  if(requireSettled){assert.equal(live,0);assert.equal(debt,0)}
  const hashes={};for(const table of ['write_intents','write_growth_reservations','write_projections','write_transitions','write_restrictions','write_restriction_tenants','tenant_writer_state','tenant_directory','memberships','action_grants','policies','tickets','windows','write_control_quota'])hashes[table]=hash((await p.query(`SELECT to_jsonb(x) AS row FROM saas.${table} x ORDER BY to_jsonb(x)::text`)).rows);
  hashes.identities=hash((await p.query('SELECT id,purpose,status,security_version,verified,mfa_verified FROM saas.identities ORDER BY id')).rows);
  const roles=(await p.query("SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolconnlimit FROM pg_roles WHERE rolname LIKE 'saas_%' OR rolname='qa_bootstrap' ORDER BY rolname")).rows;
  hashes.functions=hash((await p.query("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,p.proowner,p.proacl::text,p.proconfig,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('saas','session_store') AND p.prokind='f' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)")).rows);
  hashes.acls=hash((await p.query("SELECT n.nspname,c.relname,c.relowner,c.relacl::text,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('saas','session_store') ORDER BY n.nspname,c.relname")).rows);
  const samples=(await p.query("SELECT tenant_id,operation_id,actor_id,action,data_epoch,status FROM saas.write_intents WHERE status='CONFIRMED' ORDER BY operation_id LIMIT 32")).rows;
  return {hashes,states,roles,live,debt,samples};
 });
 const tenants=[];
 for(let n=1;n<DB.length;n++)tenants.push(await inDb(config,DB[n],async p=>{
  const fence=(await p.query('SELECT * FROM inventory.writer_fence WHERE id=1')).rows[0];assert.equal(fence.state,'CLOSED');assert.equal(fence.generation,qa.generation);
  const mismatch=(await p.query('SELECT count(*)::int AS n FROM inventory.balances b WHERE b.on_hand<>(SELECT coalesce(sum(m.quantity),0) FROM inventory.movements m WHERE m.product_id=b.product_id)')).rows[0].n;assert.equal(mismatch,0);
  const quota=(await p.query('SELECT q.*,inventory.logical_usage()::text AS actual FROM inventory.quota_state q WHERE id=1')).rows[0];assert.equal(quota.logical_bytes,quota.actual);
  assert.equal(quota.logical_bytes,central.states[n-1].used_bytes);assert.equal(quota.active_products,central.states[n-1].used_products);
  const hashes={};for(const [schema,table]of [['catalog','products'],...['balances','movements','operations','audit','quota_state','writer_fence'].map(t=>['inventory',t])])hashes[table]=hash((await p.query(`SELECT to_jsonb(x) AS row FROM ${schema}.${table} x ORDER BY to_jsonb(x)::text`)).rows);
  const functions=hash((await p.query("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,p.proowner,p.proacl::text,p.proconfig,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('catalog','inventory') ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)")).rows);
  return {database:DB[n],fence,quota,hashes,functions};
 }));
 return {central,tenants};
}
async function applyIdentity(p,intent,generation){
 assert.equal(intent.action,'revoke_identity');assert(UUID.test(intent.target.identityId));
 const client=await p.connect();try{
  await client.query('BEGIN');const states=(await client.query('SELECT state FROM saas.tenant_writer_state FOR UPDATE')).rows;assert.equal(states.length,2);assert(states.every(s=>s.state==='CLOSED'));
  const prior=(await client.query('SELECT identity_id,reason_code,status,generation FROM saas.write_restrictions WHERE id=$1',[intent.operationId])).rows[0];
  if(prior){assert.equal(prior.identity_id,intent.target.identityId);assert.equal(prior.reason_code,'IDENTITY');assert.equal(prior.status,'ACKNOWLEDGED');assert.equal(prior.generation,generation)}
  else{await client.query("UPDATE saas.identities SET status='revoked',security_version=security_version+1 WHERE id=$1 AND status<>'revoked'",[intent.target.identityId]);await client.query("UPDATE saas.session_registry SET status='revoked' WHERE identity_id=$1",[intent.target.identityId]);await client.query("INSERT INTO saas.write_restrictions(id,identity_id,generation,reason_code,status) VALUES($1,$2,$3,'IDENTITY','ACKNOWLEDGED')",[intent.operationId,intent.target.identityId,generation]);assert.equal((await client.query('SELECT saas.write_barrier_cost()<=(SELECT barrier_max_bytes FROM saas.write_control_quota WHERE id=1) AS bounded')).rows[0].bounded,true)}
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
async function run(phase){
 const {qa,config}=await own(),sourceSha=process.env.QA_CODE_SHA;
 const proof=validateRecoveryProof(JSON.parse(await readFile('/run/qa-results/recovery-proof.json','utf8')),{sourceSha,generation:qa.generation,systemIdentifier:qa.systemIdentifier,target:phase==='verify-target'});
 if(phase==='close'){
  const before=await closedSnapshot(config,qa),cohortId=randomUUID();
  const journal=await createJournal(`${ROOT}/l2-journal.jsonl`,{cohortId,generation:qa.generation,systemIdentifier:qa.systemIdentifier});
  try{const intent=await journal.intent('barrier',{generation:qa.generation});await inDb(config,DB[0],p=>p.query('UPDATE saas.admission_fence SET barrier=true,admission_version=admission_version+1 WHERE id=1 AND generation=$1',[qa.generation]));await journal.result(intent.operationId);await durable('l2-state.json',{cohortId,generation:qa.generation,systemIdentifier:qa.systemIdentifier,sourceSha,before,backupCheckpoint:journal.checkpoint(),finalCheckpoint:journal.checkpoint(),phase:'closed-before-copy'});return {closed:true,settled:true,cohortId,businessDataPrinted:false}}
  finally{await journal.close()}
 }
 const state=JSON.parse(await readFile(`${ROOT}/l2-state.json`,'utf8'));assert.equal(state.generation,qa.generation);assert.equal(state.systemIdentifier,qa.systemIdentifier);assert.equal(state.sourceSha,sourceSha);
 if(phase==='post-copy'){
  assert.equal(proof.backupVerified,true);const journal=await openJournal(`${ROOT}/l2-journal.jsonl`,{expectedHead:state.finalCheckpoint});
  try{const intent=await journal.intent('revoke_identity',{identityId:qa.fixture.tenants[1].identityId});await inDb(config,DB[0],p=>applyIdentity(p,intent,qa.generation));await journal.result(intent.operationId);state.finalCheckpoint=journal.checkpoint();state.phase='post-copy-canary';await durable('l2-state.json',state);return {restrictiveCanaryAfterCopy:true,externalJournalDurable:true}}
  finally{await journal.close()}
 }
 assert.equal(phase,'verify-target');assert.equal(state.phase,'post-copy-canary');
 const snapshot=await closedSnapshot(config,qa);assert.deepEqual(snapshot,state.before,'Restored L2 cohort must match the closed pre-copy snapshot exactly');
 const verified=verifyJournal(await readFile(`${ROOT}/l2-journal.jsonl`,'utf8'),{checkpoint:state.backupCheckpoint,finalCheckpoint:state.finalCheckpoint});
 assert.deepEqual(verified.metadata,{cohortId:state.cohortId,generation:qa.generation,systemIdentifier:qa.systemIdentifier});
 await inDb(config,DB[0],async p=>{await replayRestrictive(verified,intent=>applyIdentity(p,intent,qa.generation));const first=await closedSnapshot(config,qa);await replayRestrictive(verified,intent=>applyIdentity(p,intent,qa.generation));assert.deepEqual(await closedSnapshot(config,qa),first)});
 const candidate={generation:randomUUID(),clockOwner:randomUUID(),passwords:Object.fromEntries([...Object.keys(qa.connections),'qa_bootstrap'].map(role=>[role,randomBytes(32).toString('base64url')]))};
 assert.notEqual(candidate.generation,qa.generation);await durable('l2-restored-candidate.json',candidate);
 // Change only mutable guards/configuration. Keep historical effects and their
 // immutable operation/actor/epoch/result and restrictions, including tombstones.
 for(let n=1;n<DB.length;n++)await inDb(config,DB[n],async p=>{await p.query('BEGIN');try{await p.query("UPDATE inventory.writer_fence SET generation=$1,data_epoch=data_epoch+1 WHERE id=1 AND state='CLOSED'",[candidate.generation]);await p.query('COMMIT')}catch(e){await p.query('ROLLBACK').catch(()=>{});throw e}});
 await inDb(config,DB[0],async p=>{
  const client=await p.connect();try{
   await client.query('BEGIN');assert.equal((await client.query('SELECT barrier FROM saas.admission_fence WHERE id=1 FOR UPDATE')).rows[0].barrier,true);
   await client.query("UPDATE saas.session_registry SET status='revoked'");for(const t of ['company_sessions','demo_sessions','operator_sessions'])await client.query(`DELETE FROM session_store.${t}`);
   await client.query("UPDATE saas.tenant_directory SET data_epoch=data_epoch+1,credential_version=credential_version+1,writer_credential_version=CASE WHEN writer_credential_version IS NULL THEN NULL ELSE writer_credential_version+1 END,status=CASE WHEN purpose='demo' THEN 'blocked' ELSE 'draining' END");
   await client.query("UPDATE saas.tenant_writer_state SET generation=$1,data_epoch=data_epoch+1 WHERE state='CLOSED'",[candidate.generation]);
   await client.query('UPDATE saas.admission_fence SET generation=$1,clock_version=clock_version+1 WHERE id=1',[candidate.generation]);await client.query('UPDATE saas.time_authority SET generation=$1,owner=$2,clock_version=clock_version+1 WHERE id=1',[candidate.generation,candidate.clockOwner]);
   for(const [role,password]of Object.entries(candidate.passwords)){assert(/^(?:saas_[a-z_]+|qa_bootstrap)$/.test(role));await client.query(`ALTER ROLE "${role}" PASSWORD '${scramVerifier(password)}'`)}
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
 });
 const newConfig={...config,password:candidate.passwords.qa_bootstrap},after=await closedSnapshot(newConfig,{...qa,generation:candidate.generation});
 for(let n=0;n<snapshot.tenants.length;n++){for(const key of ['products','balances','movements','operations','audit','quota_state'])assert.equal(after.tenants[n].hashes[key],snapshot.tenants[n].hashes[key]);assert.equal(after.tenants[n].fence.state,'CLOSED');assert.equal(BigInt(after.tenants[n].fence.data_epoch),BigInt(snapshot.tenants[n].fence.data_epoch)+1n)}
 for(const table of ['write_intents','write_growth_reservations','write_projections','write_transitions','tickets','windows','write_control_quota','policies'])assert.equal(after.central.hashes[table],snapshot.central.hashes[table]);
 let rejected=0;for(const [role,c]of Object.entries(qa.connections)){
  const old=await createPgPool({...c,max:1,connectionTimeoutMillis:2000});try{await assert.rejects(()=>old.query('SELECT 1'),e=>e.code==='28P01');rejected++}finally{await old.end()}
  const replacement=await createPgPool({...c,password:candidate.passwords[role],max:1,connectionTimeoutMillis:2000});try{await replacement.query('SELECT 1')}finally{await replacement.end()}
 }
 state.restoredGeneration=candidate.generation;state.phase='VERIFIED_CLOSED';await durable('l2-state.json',state);
 return {closedRestoreVerified:true,backupManifestHash:proof.backupManifestHash,journalVerified:true,postCopyTombstoneReplayed:true,repeatedReplayIdempotent:true,immutableEffectsAndCountersPreserved:true,newGeneration:candidate.generation,newEpoch:true,oldCredentialsRejected:rejected,newCredentialsVerified:rejected,writerReopening:'NOT VERIFIED',businessDataPrinted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const phase=process.argv[2],report={sourceSha:process.env.QA_CODE_SHA,project:PROJECT,phase,startedAt:new Date().toISOString(),status:'FAIL',secretsPrinted:false};
 try{assert(['close','post-copy','verify-target'].includes(phase));report.result=await run(phase);report.status='PASS FOR CLOSED SYNTHETIC RESTORE PHASE'}catch(e){report.code=/^[A-Z0-9_]{1,70}$/.test(e.code??'')?e.code:'RESTORE_NOT_PROVEN';process.exitCode=1}
 report.finishedAt=new Date().toISOString();await writeFile(`/run/qa-results/recovery-${['close','post-copy','verify-target'].includes(phase)?phase:'invalid'}.json`,JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
}
