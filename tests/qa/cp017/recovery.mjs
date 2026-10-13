// Exclusive closed synthetic L2 recovery. Never imported by the application.
import assert from 'node:assert/strict';
import {readFile,open,writeFile} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash,pbkdf2Sync,createHmac} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {createAuthority} from '../../../server/saas/auth/authority.js';
import {QA_ROLES} from '../schema/fixture.js';
import {createJournal,openJournal,verifyJournal,replayRestrictive,syncDirectoryStrict} from '../recovery/journal.js';
const PROJECT='mecanet-qa-p1l2-cp017',ROOT='/run/qa-journal',A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const DB=['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'],UUID=/^[a-f0-9-]{36}$/,hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code})};
export const RECOVERY_INTEGRITY_TABLES=Object.freeze({control:Object.freeze(['schema_migrations','write_intents','write_growth_reservations','write_projections','write_transitions','write_restrictions','write_restriction_tenants','tenant_writer_state','tenant_directory','memberships','action_grants','policies','role_policies','tickets','windows','write_control_quota','admission_fence','time_authority','session_registry']),tenant:Object.freeze([Object.freeze(['catalog','schema_migrations']),Object.freeze(['catalog','products']),...['balances','movements','operations','audit','quota_state','writer_fence'].map(t=>Object.freeze(['inventory',t]))])});
export function fingerprintJsonbText(rows){if(!Array.isArray(rows)||rows.some(row=>typeof row.row!=='string'))fail('RESTORE_EXACT_JSONB_TEXT_REQUIRED');return hash(rows.map(row=>row.row))}
export function restoredDirectoryStatus(purpose,status){if(!['company','demo'].includes(purpose)||!['active','blocked','draining'].includes(status))fail('RESTORE_DIRECTORY_STATE_REQUIRED');return purpose==='demo'?'blocked':status==='active'?'draining':status}
export function credentialProbe(role,connection){
 const roles=[...Object.keys(QA_ROLES),'saas_writer_maintenance','saas_writer_a','saas_writer_b','saas_maintainer_a','saas_maintainer_b'];
 const database=role==='saas_demo'?'mecanet_demo':/(?:tenant|writer|maintainer)_a$/.test(role)?'mecanet_tenant_a':/(?:tenant|writer|maintainer)_b$/.test(role)?'mecanet_tenant_b':'mecanet_control';
 if(!roles.includes(role)||connection?.user!==role||connection.host!=='postgres'||connection.port!==5432||connection.database!==database||connection.connectionString!==undefined||connection.replication!==undefined||connection.ssl?.rejectUnauthorized!==true||connection.ssl?.servername!=='postgres')fail('RESTORE_OWN_CONNECTIONS_REQUIRED');
 const config={...connection,max:1,connectionTimeoutMillis:2000,query_timeout:2000,application_name:'mecanet-private-l2-credential-proof'};
 // Physical replication authenticates against the replication HBA entry. It
 // neither requires nor receives CONNECT on any application database.
 return role==='saas_backup'?{config:{...config,database:'replication',replication:'true'},sql:'IDENTIFY_SYSTEM',expectedField:'systemid'}:{config,sql:'SELECT 1',expectedField:null};
}
export function selectNegativeCanaries(samples,tenantId){
 const own=samples.filter(s=>s.tenant_id===tenantId),picked=[];
 for(const action of ['inventory.receive','catalog.create']){const sample=own.find(s=>s.action===action);if(sample)picked.push(sample)}
 for(const sample of own)if(picked.length<4&&!picked.some(p=>p.operation_id===sample.operation_id))picked.push(sample);
 if(!picked.length)fail('RESTORE_CONFIRMED_CANARY_REQUIRED');return picked;
}
export function assertClosedGuards({generation,admission,states,directory,tenants,closureProofs,requireBarrier=true,closureGeneration=generation,closureEpochOffset=0}){
 if(admission?.generation!==generation||(requireBarrier&&admission.barrier!==true)||!Array.isArray(states)||states.length!==2||!Array.isArray(tenants)||tenants.length!==2||!Array.isArray(directory)||!Array.isArray(closureProofs))fail('RESTORE_CLOSED_GUARDS_REQUIRED');
 for(const tenantId of [A,B]){
  const state=states.find(s=>s.tenant_id===tenantId),local=tenants.find(t=>t.fence?.tenant_id===tenantId)?.fence,entry=directory.find(d=>d.id===tenantId);
  if(!state||!local||!entry||state.state!=='CLOSED'||local.state!=='CLOSED'||state.generation!==generation||local.generation!==generation||entry.purpose!=='company'||entry.schema_version!==2||String(state.data_epoch)!==String(local.data_epoch)||String(state.data_epoch)!==String(entry.data_epoch)||String(state.writer_version)!==String(local.writer_version)||BigInt(state.data_epoch)<1n||BigInt(state.writer_version)<1n)fail('RESTORE_CLOSED_GUARDS_REQUIRED');
  if(!closureProofs.some(p=>p.tenant_id===tenantId&&p.generation===closureGeneration&&BigInt(p.data_epoch)===BigInt(state.data_epoch)-BigInt(closureEpochOffset)&&String(p.closed_version)===String(state.writer_version)&&p.close_proven===true&&['RESOLVED','REOPENING','OPEN','ACKNOWLEDGED'].includes(p.stage)))fail('RESTORE_POSITIVE_WRITER_CLOSE_REQUIRED');
 }
 return true;
}
export function assertIdentityCanary({before,identity,activeSessions,tombstone,operationId,generation}){
 if(before?.status!=='active'||identity?.id!==before.id||identity.status!=='revoked'||BigInt(identity.security_version)!==BigInt(before.security_version)+1n||activeSessions!==0||tombstone?.id!==operationId||tombstone.identity_id!==before.id||tombstone.generation!==generation||tombstone.reason_code!=='IDENTITY'||tombstone.status!=='ACKNOWLEDGED'||tombstone.active!==true)fail('RESTORE_RESTRICTIVE_CANARY_REQUIRED');
 return true;
}
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
async function closedSnapshot(config,qa,{requireSettled=true,requireBarrier=true,closureGeneration=qa.generation,closureEpochOffset=0,canaryId=null}={}){
 const central=await inDb(config,DB[0],async p=>{
  assert.equal((await p.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier,qa.systemIdentifier);
  assert.equal((await p.query("SELECT current_setting('server_encoding') AS encoding")).rows[0].encoding,'UTF8');
  const admission=(await p.query('SELECT generation,barrier,admission_version::text,clock_version::text,tick::text FROM saas.admission_fence WHERE id=1')).rows[0];
  const directory=(await p.query('SELECT id,purpose,status,schema_version,data_epoch::text,credential_version::text,writer_credential_version::text FROM saas.tenant_directory ORDER BY id')).rows;
  const states=(await p.query('SELECT * FROM saas.tenant_writer_state ORDER BY tenant_id')).rows;assert.equal(states.length,2);assert(states.every(s=>s.state==='CLOSED'&&s.generation===qa.generation));
  const closureProofs=(await p.query('SELECT tenant_id,generation,data_epoch::text,closed_version::text,stage,close_proven FROM saas.write_restriction_tenants ORDER BY restriction_id,tenant_id')).rows;
  const live=(await p.query("SELECT count(*)::int AS n FROM saas.tickets WHERE state IN('WAITING','ACTIVE','UNCERTAIN')")).rows[0].n;
  const debt=(await p.query("SELECT count(*)::int AS n FROM saas.write_growth_reservations WHERE status<>'SETTLED'")).rows[0].n;
  const account=(await p.query("SELECT q.used_bytes::text,q.reserved_bytes::text,(SELECT coalesce(sum(saas.write_operation_cost(r.tenant_id,r.operation_id)),0)::text FROM saas.write_growth_reservations r WHERE r.status='SETTLED') AS actual_used,(SELECT coalesce(sum(control_bytes_reserved),0)::text FROM saas.write_growth_reservations WHERE status<>'SETTLED') AS actual_reserved FROM saas.write_control_quota q WHERE id=1")).rows[0];assert.equal(account.used_bytes,account.actual_used);assert.equal(account.reserved_bytes,account.actual_reserved);
  assert.equal((await p.query("SELECT count(*)::int AS n FROM saas.write_intents WHERE status IN('PENDING','EXECUTING','UNKNOWN')")).rows[0].n,0);
  if(requireSettled){assert.equal(live,0);assert.equal(debt,0)}
  const hashes={};for(const table of RECOVERY_INTEGRITY_TABLES.control)hashes[table]=fingerprintJsonbText((await p.query(`SELECT to_jsonb(x)::text AS row FROM saas.${table} x ORDER BY to_jsonb(x)::text`)).rows);
  const identities=(await p.query('SELECT id,purpose,status,security_version::text,verified,mfa_verified FROM saas.identities ORDER BY id')).rows;hashes.identities=hash(identities);
  const canaryIdentity=qa.fixture.tenants[1].identityId,identityB=identities.find(i=>i.id===canaryIdentity),otherIdentitiesHash=hash(identities.filter(i=>i.id!==canaryIdentity));
  const registryCounts=(await p.query('SELECT identity_id,status,count(*)::int AS n FROM saas.session_registry GROUP BY identity_id,status ORDER BY identity_id,status')).rows;
  const registryOtherHash=fingerprintJsonbText((await p.query('SELECT to_jsonb(x)::text AS row FROM saas.session_registry x WHERE identity_id<>$1 ORDER BY to_jsonb(x)::text',[canaryIdentity])).rows);
  const registryGuardsHash=fingerprintJsonbText((await p.query("SELECT (to_jsonb(x)-'status')::text AS row FROM saas.session_registry x ORDER BY (to_jsonb(x)-'status')::text")).rows);
  const sessionCounts={};for(const table of ['company_sessions','demo_sessions','operator_sessions']){hashes[table]=fingerprintJsonbText((await p.query(`SELECT to_jsonb(x)::text AS row FROM session_store.${table} x ORDER BY to_jsonb(x)::text`)).rows);sessionCounts[table]=(await p.query(`SELECT count(*)::int AS n FROM session_store.${table}`)).rows[0].n}
  const tombstone=canaryId?(await p.query('SELECT id,identity_id,generation,reason_code,status,active FROM saas.write_restrictions WHERE id=$1',[canaryId])).rows[0]:null;
  const otherRestrictionsHash=canaryId?fingerprintJsonbText((await p.query('SELECT to_jsonb(x)::text AS row FROM saas.write_restrictions x WHERE id<>$1 ORDER BY to_jsonb(x)::text',[canaryId])).rows):hashes.write_restrictions;
  const roles=(await p.query("SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolreplication,rolcreatedb,rolcreaterole,rolbypassrls,rolconnlimit FROM pg_roles WHERE rolname LIKE 'saas_%' OR rolname='qa_bootstrap' ORDER BY rolname")).rows;
  hashes.roleMemberships=hash((await p.query("SELECT parent.rolname AS parent,child.rolname AS member,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member WHERE parent.rolname LIKE 'saas_%' OR child.rolname LIKE 'saas_%' OR parent.rolname='qa_bootstrap' OR child.rolname='qa_bootstrap' ORDER BY parent.rolname,child.rolname")).rows);
  hashes.functions=hash((await p.query("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,p.proowner,p.proacl::text,p.proconfig,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('saas','session_store') AND p.prokind='f' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)")).rows);
  hashes.acls=hash((await p.query("SELECT n.nspname,c.relname,c.relowner,c.relacl::text,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('saas','session_store') ORDER BY n.nspname,c.relname")).rows);
  assert.equal((await p.query("SELECT count(*)::int AS n FROM saas.write_intents i LEFT JOIN saas.write_projections pr ON pr.tenant_id=i.tenant_id AND pr.operation_id=i.operation_id WHERE i.status='CONFIRMED' AND (pr.state IS DISTINCT FROM 'CONFIRMED' OR pr.result_hash IS NULL)")).rows[0].n,0);
  const samples=(await p.query(`WITH ranked AS (
   SELECT i.tenant_id,i.operation_id,i.actor_id,i.action,i.data_epoch::text,i.writer_version::text,i.generation,i.request_hash,pr.result_hash,i.status,
    row_number() OVER(PARTITION BY i.tenant_id,i.action ORDER BY i.operation_id) AS n
   FROM saas.write_intents i JOIN saas.write_projections pr ON pr.tenant_id=i.tenant_id AND pr.operation_id=i.operation_id
   WHERE i.status='CONFIRMED' AND pr.state='CONFIRMED' AND i.tenant_id IN($1::uuid,$2::uuid))
   SELECT tenant_id,operation_id,actor_id,action,data_epoch,writer_version,generation,request_hash,result_hash,status
   FROM ranked WHERE n<=8 ORDER BY tenant_id,operation_id`,[A,B])).rows;
  return {hashes,admission,directory,states,closureProofs,identities,identityB,otherIdentitiesHash,registryCounts,registryOtherHash,registryGuardsHash,sessionCounts,tombstone,otherRestrictionsHash,roles,live,debt,samples};
 });
 const tenants=[];
 for(let n=1;n<DB.length;n++)tenants.push(await inDb(config,DB[n],async p=>{
  const fence=(await p.query('SELECT * FROM inventory.writer_fence WHERE id=1')).rows[0];assert.equal(fence.state,'CLOSED');assert.equal(fence.generation,qa.generation);
  const mismatch=(await p.query('SELECT count(*)::int AS n FROM inventory.balances b WHERE b.on_hand<>(SELECT coalesce(sum(m.quantity),0) FROM inventory.movements m WHERE m.product_id=b.product_id) OR b.version<>1+(SELECT count(*) FROM inventory.movements m WHERE m.product_id=b.product_id)')).rows[0].n;assert.equal(mismatch,0);
  const quota=(await p.query('SELECT q.*,inventory.logical_usage()::text AS actual FROM inventory.quota_state q WHERE id=1')).rows[0];assert.equal(quota.logical_bytes,quota.actual);
  assert.equal(quota.logical_bytes,central.states[n-1].used_bytes);assert.equal(quota.active_products,central.states[n-1].used_products);
  const hashes={};for(const [schema,table]of RECOVERY_INTEGRITY_TABLES.tenant)hashes[table]=fingerprintJsonbText((await p.query(`SELECT to_jsonb(x)::text AS row FROM ${schema}.${table} x ORDER BY to_jsonb(x)::text`)).rows);
  const functions=hash((await p.query("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,p.proowner,p.proacl::text,p.proconfig,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('catalog','inventory') ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)")).rows);
  const access=hash((await p.query("SELECT n.nspname,c.relname,c.relowner,c.relacl::text,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('catalog','inventory') ORDER BY n.nspname,c.relname")).rows);
  return {database:DB[n],fence,quota,hashes,functions,access};
 }));
 assertClosedGuards({generation:qa.generation,admission:central.admission,states:central.states,directory:central.directory,tenants,closureProofs:central.closureProofs,requireBarrier,closureGeneration,closureEpochOffset});
 return {central,tenants};
}
async function applyIdentity(p,intent,generation){
 assert.equal(intent.action,'revoke_identity');assert(UUID.test(intent.target.identityId));
 const client=await p.connect();try{
  await client.query('BEGIN');const states=(await client.query('SELECT state FROM saas.tenant_writer_state FOR UPDATE')).rows;assert.equal(states.length,2);assert(states.every(s=>s.state==='CLOSED'));
  const prior=(await client.query('SELECT identity_id,reason_code,status,generation FROM saas.write_restrictions WHERE id=$1',[intent.operationId])).rows[0];
  if(prior){assert.equal(prior.identity_id,intent.target.identityId);assert.equal(prior.reason_code,'IDENTITY');assert.equal(prior.status,'ACKNOWLEDGED');assert.equal(prior.generation,generation)}
  else{assert.equal((await client.query("UPDATE saas.identities SET status='revoked',security_version=security_version+1 WHERE id=$1 AND status='active' RETURNING id",[intent.target.identityId])).rowCount,1);await client.query("UPDATE saas.session_registry SET status='revoked' WHERE identity_id=$1",[intent.target.identityId]);await client.query("INSERT INTO saas.write_restrictions(id,identity_id,generation,reason_code,status) VALUES($1,$2,$3,'IDENTITY','ACKNOWLEDGED')",[intent.operationId,intent.target.identityId,generation]);assert.equal((await client.query('SELECT saas.write_barrier_cost()<=(SELECT barrier_max_bytes FROM saas.write_control_quota WHERE id=1) AS bounded')).rows[0].bounded,true)}
  assert.equal((await client.query('SELECT status FROM saas.identities WHERE id=$1',[intent.target.identityId])).rows[0]?.status,'revoked');assert.equal((await client.query("SELECT count(*)::int AS n FROM saas.session_registry WHERE identity_id=$1 AND status='active'",[intent.target.identityId])).rows[0].n,0);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
function assertRestrictiveDelta(before,after,{operationId,generation}){
 assertIdentityCanary({before:before.central.identityB,identity:after.central.identityB,activeSessions:after.central.registryCounts.filter(r=>r.identity_id===before.central.identityB.id&&r.status==='active').reduce((sum,r)=>sum+r.n,0),tombstone:after.central.tombstone,operationId,generation});
 assert.equal(after.central.otherIdentitiesHash,before.central.otherIdentitiesHash);assert.equal(after.central.registryOtherHash,before.central.registryOtherHash);assert.equal(after.central.registryGuardsHash,before.central.registryGuardsHash);assert.equal(after.central.otherRestrictionsHash,before.central.hashes.write_restrictions);
 for(const [table,digest]of Object.entries(before.central.hashes))if(!['identities','session_registry','write_restrictions'].includes(table))assert.equal(after.central.hashes[table],digest);
 assert.deepEqual(after.central.states,before.central.states);assert.deepEqual(after.central.roles,before.central.roles);assert.deepEqual(after.tenants,before.tenants);
}
async function consultResults(config,qa,samples,passwords=null){
 assert(samples.length>0&&samples.length<=32);let consultations=0;
 for(const tenant of qa.fixture.tenants.filter(t=>[A,B].includes(t.id))){
  const connection=qa.connections[tenant.id===A?'saas_writer_a':'saas_writer_b'],pool=await createPgPool({...connection,...(passwords?{password:passwords[connection.user]}:{}),max:1,connectionTimeoutMillis:2000,query_timeout:2000,application_name:'mecanet-private-l2-restored-result'});
  try{for(const sample of samples.filter(s=>s.tenant_id===tenant.id)){const rows=(await pool.query('SELECT * FROM inventory.operation_result($1::uuid,$2::uuid,$3::text,$4::bigint)',[sample.operation_id,sample.actor_id,sample.action,sample.data_epoch])).rows;assert.equal(rows.length,1);assert.equal(rows[0].result_hash,sample.result_hash);assert.equal(rows[0].result.operationId,sample.operation_id);assert.equal(rows[0].result.state,'CONFIRMED');assert.equal(rows[0].result.dataEpoch,sample.data_epoch);assert.equal(rows[0].replay,true);consultations++}}
  finally{await pool.end()}
 }
 assert.equal(consultations,samples.length);return consultations;
}
async function staleWriteNegatives(config,qa,samples,candidate,after){
 let rejections=0;assert(samples.some(s=>s.action==='inventory.receive'),'Restore requires an actual confirmed receipt canary');
 for(const tenant of qa.fixture.tenants.filter(t=>[A,B].includes(t.id))){
  const originals=selectNegativeCanaries(samples,tenant.id);
  const commands=await inDb(config,tenant.dbName,async p=>{const commands=[];for(const sample of originals){
   const op=(await p.query('SELECT result,request_hash FROM inventory.operations WHERE id=$1',[sample.operation_id])).rows[0];assert.equal(op?.request_hash,sample.request_hash);
   const values=sample.action==='catalog.create'?(await p.query('SELECT sku,name FROM catalog.products WHERE id=$1',[op.result.productId])).rows[0]:(await p.query('SELECT quantity::text,reason FROM inventory.movements WHERE operation_id=$1',[sample.operation_id])).rows[0];assert(values);
   const matrix=['mecanet-write-v1',tenant.id,sample.actor_id,sample.action,sample.data_epoch,sample.action==='catalog.create'?null:op.result.productId,sample.action==='catalog.create'?[values.sku,values.name]:[values.quantity,values.reason]];
   const preimage=JSON.stringify(matrix);assert.equal(createHash('sha256').update(preimage,'utf8').digest('hex'),sample.request_hash);commands.push({sample,matrix,preimage});
  }return commands});
  const connection=qa.connections[tenant.id===A?'saas_writer_a':'saas_writer_b'],pool=await createPgPool({...connection,password:candidate.passwords[connection.user],max:1,connectionTimeoutMillis:2000,query_timeout:2000,application_name:'mecanet-private-l2-stale-writer-negative'});
  const current=after.tenants.find(t=>t.fence.tenant_id===tenant.id).fence;
  try{for(const {sample,matrix,preimage}of commands){
   const newMatrix=[...matrix];newMatrix[4]=current.data_epoch;const newPreimage=JSON.stringify(newMatrix),newHash=createHash('sha256').update(newPreimage,'utf8').digest('hex');
   // Each probe is the already-known key. Every writer stays CLOSED; these
   // calls must fail before UNIQUE/quota/effects, under the minimum writer role.
   const query=`SELECT * FROM inventory.${sample.action==='catalog.create'?'create_product':'receive_stock'}($1::uuid,$2::text,$3::text,$4::uuid,$5::bigint,$6::bigint)`;
   for(const guard of [[preimage,sample.request_hash,sample.generation,sample.data_epoch,sample.writer_version],[newPreimage,newHash,sample.generation,current.data_epoch,current.writer_version],[preimage,sample.request_hash,candidate.generation,sample.data_epoch,current.writer_version],[newPreimage,newHash,candidate.generation,current.data_epoch,current.writer_version]]){
    await assert.rejects(()=>pool.query(query,[sample.operation_id,...guard]),error=>error.code==='P0001'&&error.message==='WRITER_FENCE_CLOSED');rejections++;
   }
   await assert.rejects(()=>pool.query('SELECT * FROM inventory.operation_result($1::uuid,$2::uuid,$3::text,$4::bigint)',[sample.operation_id,sample.actor_id,sample.action,current.data_epoch]),error=>error.code==='P0001'&&error.message==='OPERATION_ACCESS_DENIED');rejections++;
  }}finally{await pool.end()}
 }
 return rejections;
}
async function run(phase){
 const {qa,config}=await own(),sourceSha=process.env.QA_CODE_SHA;
 const proof=validateRecoveryProof(JSON.parse(await readFile('/run/qa-results/recovery-proof.json','utf8')),{sourceSha,generation:qa.generation,systemIdentifier:qa.systemIdentifier,target:phase==='verify-target'});
 if(phase==='close'){
  const initial=await closedSnapshot(config,qa,{requireBarrier:false}),cohortId=randomUUID();assert.equal(initial.central.identityB?.status,'active');assert(initial.central.registryCounts.some(r=>r.identity_id===initial.central.identityB.id&&r.status==='active'&&r.n>0),'Post-copy revocation requires an existing active synthetic B session');assert(initial.central.samples.some(s=>s.action==='inventory.receive'),'Writer restore requires a receipt in its source');
  const journal=await createJournal(`${ROOT}/l2-journal.jsonl`,{cohortId,generation:qa.generation,systemIdentifier:qa.systemIdentifier});
  try{const intent=await journal.intent('barrier',{generation:qa.generation});await inDb(config,DB[0],async p=>{assert.equal((await p.query('UPDATE saas.admission_fence SET barrier=true,admission_version=admission_version+1 WHERE id=1 AND generation=$1 RETURNING id',[qa.generation])).rowCount,1)});await journal.result(intent.operationId);const before=await closedSnapshot(config,qa);await durable('l2-state.json',{cohortId,generation:qa.generation,systemIdentifier:qa.systemIdentifier,sourceSha,before,backupCheckpoint:journal.checkpoint(),finalCheckpoint:journal.checkpoint(),phase:'closed-before-copy'});return {closed:true,settled:true,cohortId,businessDataPrinted:false}}
  finally{await journal.close()}
 }
 const state=JSON.parse(await readFile(`${ROOT}/l2-state.json`,'utf8'));assert.equal(state.generation,qa.generation);assert.equal(state.systemIdentifier,qa.systemIdentifier);assert.equal(state.sourceSha,sourceSha);
 if(phase==='post-copy'){
  assert.equal(proof.backupVerified,true);const journal=await openJournal(`${ROOT}/l2-journal.jsonl`,{expectedHead:state.finalCheckpoint});
  try{const intent=await journal.intent('revoke_identity',{identityId:qa.fixture.tenants[1].identityId});await inDb(config,DB[0],p=>applyIdentity(p,intent,qa.generation));await journal.result(intent.operationId);const changed=await closedSnapshot(config,qa,{canaryId:intent.operationId});assertRestrictiveDelta(state.before,changed,{operationId:intent.operationId,generation:qa.generation});state.canaryId=intent.operationId;state.finalCheckpoint=journal.checkpoint();state.phase='post-copy-canary';await durable('l2-state.json',state);return {restrictiveCanaryAfterCopy:true,externalJournalDurable:true}}
  finally{await journal.close()}
 }
 assert.equal(phase,'verify-target');assert.equal(state.phase,'post-copy-canary');
 const snapshot=await closedSnapshot(config,qa);assert.deepEqual(snapshot,state.before,'Restored L2 cohort must match the closed pre-copy snapshot exactly');
 const originalResultsConsulted=await consultResults(config,qa,snapshot.central.samples);
 // Session identifiers stay in memory only. They are never serialized into a
 // checkpoint, report, diagnostic or credential candidate.
 const candidates=await inDb(config,DB[0],async p=>(await p.query("SELECT sid,purpose,identity_id FROM saas.session_registry WHERE status='active' ORDER BY identity_id,sid LIMIT 32")).rows),priorSessions=[];
 const originalApi=await createPgPool({...qa.connections.saas_api,max:1,connectionTimeoutMillis:2000,application_name:'mecanet-private-l2-original-session-proof'});
 try{const authority=createAuthority(originalApi,qa.generation,{writersEnabled:true});for(const session of candidates){try{const ctx=await authority.authorize({sid:session.sid,purpose:session.purpose});assert.equal(ctx.user.id,session.identity_id);priorSessions.push(session)}catch(error){if(error.code!=='SESSION_EXPIRED'&&error.code!=='ACCESS_DENIED')throw error}}}finally{await originalApi.end()}
 assert(priorSessions.some(s=>s.purpose==='company'&&s.identity_id===snapshot.central.identityB.id),'Restore requires a currently authorized synthetic B principal without tenant access');
 const verified=verifyJournal(await readFile(`${ROOT}/l2-journal.jsonl`,'utf8'),{checkpoint:state.backupCheckpoint,finalCheckpoint:state.finalCheckpoint});
 assert.deepEqual(verified.metadata,{cohortId:state.cohortId,generation:qa.generation,systemIdentifier:qa.systemIdentifier});
 assert.equal(verified.intents.filter(i=>i.action==='revoke_identity').length,1);assert.equal(verified.intents.find(i=>i.action==='revoke_identity').operationId,state.canaryId);
 await inDb(config,DB[0],p=>replayRestrictive(verified,intent=>applyIdentity(p,intent,qa.generation)));
 const replayed=await closedSnapshot(config,qa,{canaryId:state.canaryId});assertRestrictiveDelta(snapshot,replayed,{operationId:state.canaryId,generation:qa.generation});
 await inDb(config,DB[0],p=>replayRestrictive(verified,intent=>applyIdentity(p,intent,qa.generation)));assert.deepEqual(await closedSnapshot(config,qa,{canaryId:state.canaryId}),replayed);
 const candidate={generation:randomUUID(),clockOwner:randomUUID(),passwords:Object.fromEntries([...Object.keys(qa.connections),'qa_bootstrap'].map(role=>[role,randomBytes(32).toString('base64url')]))};
 assert.notEqual(candidate.generation,qa.generation);await durable('l2-restored-candidate.json',candidate);
 // Change only mutable guards/configuration. Keep historical effects and their
 // immutable operation/actor/epoch/result and restrictions, including tombstones.
 for(let n=1;n<DB.length;n++)await inDb(config,DB[n],async p=>{await p.query('BEGIN');try{assert.equal((await p.query("UPDATE inventory.writer_fence SET generation=$1,data_epoch=data_epoch+1 WHERE id=1 AND state='CLOSED' RETURNING id",[candidate.generation])).rowCount,1);await p.query('COMMIT')}catch(e){await p.query('ROLLBACK').catch(()=>{});throw e}});
 await inDb(config,DB[0],async p=>{
  const client=await p.connect();try{
   await client.query('BEGIN');assert.equal((await client.query('SELECT barrier FROM saas.admission_fence WHERE id=1 FOR UPDATE')).rows[0].barrier,true);
   await client.query("UPDATE saas.session_registry SET status='revoked'");for(const t of ['company_sessions','demo_sessions','operator_sessions'])await client.query(`DELETE FROM session_store.${t}`);
   await client.query("UPDATE saas.identities SET status='revoked',security_version=security_version+1 WHERE purpose='demo' AND status='active'");
   for(const entry of replayed.central.directory)assert.equal((await client.query('UPDATE saas.tenant_directory SET data_epoch=data_epoch+1,credential_version=credential_version+1,writer_credential_version=CASE WHEN writer_credential_version IS NULL THEN NULL ELSE writer_credential_version+1 END,status=$2 WHERE id=$1 RETURNING id',[entry.id,restoredDirectoryStatus(entry.purpose,entry.status)])).rowCount,1);
   assert.equal((await client.query("UPDATE saas.tenant_writer_state SET generation=$1,data_epoch=data_epoch+1 WHERE state='CLOSED' RETURNING tenant_id",[candidate.generation])).rowCount,2);
   assert.equal((await client.query('UPDATE saas.admission_fence SET generation=$1,clock_version=clock_version+1 WHERE id=1 RETURNING id',[candidate.generation])).rowCount,1);assert.equal((await client.query('UPDATE saas.time_authority SET generation=$1,owner=$2,clock_version=clock_version+1 WHERE id=1 RETURNING id',[candidate.generation,candidate.clockOwner])).rowCount,1);
   for(const [role,password]of Object.entries(candidate.passwords)){assert(/^(?:saas_[a-z_]+|qa_bootstrap)$/.test(role));await client.query(`ALTER ROLE "${role}" PASSWORD '${scramVerifier(password)}'`)}
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
 });
 const newConfig={...config,password:candidate.passwords.qa_bootstrap},snapshotOptions={closureGeneration:qa.generation,closureEpochOffset:1,canaryId:state.canaryId},restoredQa={...qa,generation:candidate.generation},after=await closedSnapshot(newConfig,restoredQa,snapshotOptions);
 for(let n=0;n<snapshot.tenants.length;n++){for(const key of ['schema_migrations','products','balances','movements','operations','audit','quota_state'])assert.equal(after.tenants[n].hashes[key],snapshot.tenants[n].hashes[key]);assert.equal(after.tenants[n].functions,snapshot.tenants[n].functions);assert.equal(after.tenants[n].access,snapshot.tenants[n].access);assert.equal(after.tenants[n].fence.state,'CLOSED');assert.equal(BigInt(after.tenants[n].fence.data_epoch),BigInt(snapshot.tenants[n].fence.data_epoch)+1n)}
 for(const table of ['schema_migrations','write_intents','write_growth_reservations','write_projections','write_transitions','write_restriction_tenants','tickets','windows','write_control_quota','policies','role_policies','memberships','action_grants','roleMemberships','functions','acls'])assert.equal(after.central.hashes[table],snapshot.central.hashes[table]);
 assert.deepEqual(after.central.roles,snapshot.central.roles);assert.equal(after.central.hashes.write_restrictions,replayed.central.hashes.write_restrictions);assert.equal(after.central.registryGuardsHash,snapshot.central.registryGuardsHash);assert.equal(after.central.registryCounts.filter(r=>r.status==='active').reduce((sum,r)=>sum+r.n,0),0);assert(Object.values(after.central.sessionCounts).every(n=>n===0));assert(after.central.identities.filter(i=>i.purpose==='demo').every(i=>i.status==='revoked'));
 assertIdentityCanary({before:snapshot.central.identityB,identity:after.central.identityB,activeSessions:0,tombstone:after.central.tombstone,operationId:state.canaryId,generation:qa.generation});
 for(const beforeEntry of snapshot.central.directory){const entry=after.central.directory.find(d=>d.id===beforeEntry.id);assert.equal(entry.status,restoredDirectoryStatus(beforeEntry.purpose,beforeEntry.status));assert.equal(BigInt(entry.data_epoch),BigInt(beforeEntry.data_epoch)+1n);assert.equal(BigInt(entry.credential_version),BigInt(beforeEntry.credential_version)+1n);if(beforeEntry.writer_credential_version!==null)assert.equal(BigInt(entry.writer_credential_version),BigInt(beforeEntry.writer_credential_version)+1n)}
 assert.equal(after.central.admission.tick,snapshot.central.admission.tick);assert.equal(BigInt(after.central.admission.clock_version),BigInt(snapshot.central.admission.clock_version)+1n);
 let rejected=0;for(const [role,c]of Object.entries(qa.connections)){
  const probe=credentialProbe(role,c),old=await createPgPool(probe.config);try{await assert.rejects(()=>old.query(probe.sql),e=>e.code==='28P01');rejected++}finally{await old.end()}
  const replacement=await createPgPool({...probe.config,password:candidate.passwords[role]});try{const result=await replacement.query(probe.sql);if(probe.expectedField)assert.equal(result.rows[0]?.[probe.expectedField],qa.systemIdentifier)}finally{await replacement.end()}
 }
 const oldBootstrap=await createPgPool({...config,database:DB[0]});try{await assert.rejects(()=>oldBootstrap.query('SELECT 1'),e=>e.code==='28P01')}finally{await oldBootstrap.end()}
 const api=await createPgPool({...qa.connections.saas_api,password:candidate.passwords.saas_api,max:1,connectionTimeoutMillis:2000,application_name:'mecanet-private-l2-old-session-negative'});let sessionNegatives=0;
 try{for(const gen of [qa.generation,candidate.generation]){const authority=createAuthority(api,gen,{writersEnabled:true});for(const session of priorSessions){await assert.rejects(()=>authority.authorize({sid:session.sid,purpose:session.purpose}),error=>error.code==='SESSION_EXPIRED'&&error.status===401);sessionNegatives++}}}finally{await api.end()}
 const restoredResultsConsulted=await consultResults(newConfig,qa,snapshot.central.samples,candidate.passwords),staleWriterCallsRejected=await staleWriteNegatives(newConfig,qa,snapshot.central.samples,candidate,after);
 assert.deepEqual(await closedSnapshot(newConfig,restoredQa,snapshotOptions),after,'Result consultations and stale writers must not change effects, grants, fences or counters');
 state.restoredGeneration=candidate.generation;state.phase='VERIFIED_CLOSED';await durable('l2-state.json',state);
 return {closedRestoreVerified:true,backupManifestHash:proof.backupManifestHash,journalVerified:true,postCopyTombstoneReplayed:true,repeatedReplayIdempotent:true,immutableEffectsAndCountersPreserved:true,newGeneration:candidate.generation,newEpoch:true,originalResultsConsulted,restoredResultsConsulted,staleWriterCallsRejected,oldSessionCallsRejected:sessionNegatives,oldCredentialsRejected:rejected+1,newCredentialsVerified:rejected+1,backupAuthenticationProtocol:'physical replication IDENTIFY_SYSTEM',writerReopening:'NOT VERIFIED',businessDataPrinted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const phase=process.argv[2],report={sourceSha:process.env.QA_CODE_SHA,project:PROJECT,phase,startedAt:new Date().toISOString(),status:'FAIL',secretsPrinted:false};
 try{assert(['close','post-copy','verify-target'].includes(phase));report.result=await run(phase);report.status='PASS FOR CLOSED SYNTHETIC RESTORE PHASE'}catch(e){report.code=/^[A-Z0-9_]{1,70}$/.test(e.code??'')?e.code:'RESTORE_NOT_PROVEN';process.exitCode=1}
 report.finishedAt=new Date().toISOString();await writeFile(`/run/qa-results/recovery-${['close','post-copy','verify-target'].includes(phase)?phase:'invalid'}.json`,JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
}
