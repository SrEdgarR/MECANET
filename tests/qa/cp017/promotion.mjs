// Private CP017 operational promotion. No API endpoint, resource settlement,
// new role, quota reset, automatic API start or shared infrastructure change.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,stat,open,chmod} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPgPool,createSecretResolver,createTenantPoolManager,validateConnection} from '../../../server/saas/db/pools.js';
import {createRestrictiveCoordinator} from '../../../server/saas/writes/coordinator.js';
import {chooseLowerQuota,prepareClosedQuota} from './quota-live.mjs';
import {sanitizeSqlFailure} from './sql-live.mjs';
import {scramVerifier} from './recovery.mjs';
const PROJECT='mecanet-qa-p1l2-cp017',A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,SHA=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/;
const DEC=/^(0|[1-9][0-9]{0,18})$/,KINDS=['POLICY','ROTATION','EPOCH'];
const fail=code=>{throw Object.assign(Error(code),{code})};
const digest=value=>createHash('sha256').update(value).digest('hex');
const suffix=tenantId=>tenantId===A?'a':tenantId===B?'b':fail('PROMOTION_FIXED_TENANT_REQUIRED');
const counterKeys=['used_products','used_bytes','reserved_products','reserved_bytes'];
const policyKeys=['policy_version','max_products','max_logical_bytes'];
function integers(row,keys){for(const key of keys)if(typeof row[key]!=='string'||!DEC.test(row[key])||BigInt(row[key])>9223372036854775807n)fail('PROMOTION_COUNTER_INVALID')}

export function validatePromotionHostProof({proof,qa,sourceSha}){
 if(qa?.project!==PROJECT||!UUID.test(qa.generation??'')||!/^\d{10,24}$/.test(qa.systemIdentifier??'')||!SHA.test(sourceSha??'')||!Array.isArray(qa.fixture?.identities)||!qa.fixture.identities.length||qa.fixture.identities.some(i=>typeof i.email!=='string'||!i.email.endsWith('@qa.invalid'))||proof?.project!==PROJECT||proof.sourceSha!==sourceSha||proof.generation!==qa.generation||proof.systemIdentifier!==qa.systemIdentifier||!Array.isArray(proof.apis)||proof.apis.length!==2||new Set(proof.apis.map(a=>a.instance)).size!==2||new Set(proof.apis.map(a=>a.owner)).size!==2)fail('PROMOTION_HOST_END_PROOF_REQUIRED');
 for(const api of proof.apis)if(!['api1','api2'].includes(api.instance)||api.state!=='exited'||!HASH.test(api.containerId??'')||!UUID.test(api.owner??'')||api.httpClosed!==true||api.sqlOwnerAbsent!==true||api.writerApplicationName!==`mecanet-writer:${api.owner}`)fail('PROMOTION_HOST_END_PROOF_REQUIRED');
 // A timestamp/TTL never substitutes for actual stopped owners and SQL absence.
 return proof;
}
export function planClosedPromotion({kind,before,guard,generation,policyTarget=null}){
 if(!KINDS.includes(kind)||![A,B].includes(before?.tenant_id)||!UUID.test(generation??'')||before.generation!==generation||guard?.generation!==generation||guard.tenant_id!==before.tenant_id||!UUID.test(guard.restriction_id??'')||guard.close_proven!==true||guard.stage!=='ACKNOWLEDGED'||before.state!=='CLOSED'||before.schema_version!==2||before.directory_status!=='active'||before.data_epoch!==guard.data_epoch||before.directory_epoch!==before.data_epoch||before.writer_version!==guard.closed_version)fail('PROMOTION_EXACT_CLOSED_GUARDS_REQUIRED');
 integers(before,[...counterKeys,...policyKeys,'data_epoch','writer_version','writer_credential_version']);integers(guard,['open_version','closed_version','reopen_version']);
 if(BigInt(guard.closed_version)!==BigInt(guard.open_version)+1n||BigInt(guard.reopen_version)!==BigInt(guard.open_version)+2n||BigInt(before.data_epoch)<1n||BigInt(before.writer_credential_version)<1n)fail('PROMOTION_EXACT_CLOSED_GUARDS_REQUIRED');
 const target={...before,reopen_version:guard.reopen_version};
 if(kind==='ROTATION'||kind==='EPOCH'){
  if(BigInt(before.reserved_products)!==0n||BigInt(before.reserved_bytes)!==0n)fail('PROMOTION_DEBT_MUST_BE_ZERO');
  if(kind==='ROTATION'){
   target.writer_credential_version=(BigInt(before.writer_credential_version)+1n).toString();target.writer_secret_ref=`writer-${suffix(before.tenant_id)}-v${target.writer_credential_version}`;
   if(target.writer_secret_ref===before.writer_secret_ref)fail('PROMOTION_NEW_CREDENTIAL_REF_REQUIRED');
  }else target.data_epoch=(BigInt(before.data_epoch)+1n).toString();
 }else{
  if(!policyTarget)fail('PROMOTION_POLICY_TARGET_REQUIRED');
  const mapped={policy_version:policyTarget.policyVersion,max_products:policyTarget.maxProducts,max_logical_bytes:policyTarget.maxLogicalBytes};integers(mapped,policyKeys);
  if(BigInt(mapped.policy_version)!==BigInt(before.policy_version)+1n||BigInt(mapped.max_products)>BigInt(before.max_products)||BigInt(mapped.max_logical_bytes)>BigInt(before.max_logical_bytes)||BigInt(mapped.max_products)>300n||BigInt(mapped.max_logical_bytes)>536870912n)fail('PROMOTION_POLICY_INCREASE_FORBIDDEN');
  Object.assign(target,mapped);
 }
 target.directory_epoch=target.data_epoch;integers(target,['data_epoch','writer_credential_version']);return target;
}
export function assertPromotionSnapshot({candidate,actual,phase}){
 if(!candidate||!actual||!['CLOSED','OPEN'].includes(phase))fail('PROMOTION_METADATA_NOT_PROVEN');
 const target=candidate.target,version=phase==='CLOSED'?candidate.guard.closed_version:candidate.guard.reopen_version;
 for(const row of [actual.central,actual.local])if(!row||row.generation!==target.generation||row.data_epoch!==target.data_epoch||row.state!==phase||row.writer_version!==version)fail('PROMOTION_METADATA_NOT_PROVEN');
 if(actual.central.schema_version!==2||actual.central.directory_status!==candidate.before.directory_status||actual.central.directory_epoch!==target.data_epoch||actual.central.writer_secret_ref!==target.writer_secret_ref||actual.central.writer_credential_version!==target.writer_credential_version)fail('PROMOTION_METADATA_NOT_PROVEN');
 for(const key of counterKeys)if(actual.central[key]!==candidate.before[key])fail('PROMOTION_PRESERVATION_NOT_PROVEN');
 for(const key of policyKeys)if(actual.central[key]!==target[key]||actual.quota[key]!==target[key])fail('PROMOTION_PRESERVATION_NOT_PROVEN');
 for(const key of ['logical_bytes','active_products'])if(actual.quota[key]!==candidate.preserved.quota[key])fail('PROMOTION_PRESERVATION_NOT_PROVEN');
 for(const key of ['dataDigest','intentDigest','growthDigest','windowsDigest'])if(!HASH.test(actual[key]??'')||actual[key]!==candidate.preserved[key])fail('PROMOTION_PRESERVATION_NOT_PROVEN');
 return true;
}
async function atomicJson(path,value){
 const temporary=`${path}.next`,handle=await open(temporary,'w',0o600);try{await handle.writeFile(JSON.stringify(value));await handle.sync()}finally{await handle.close()}
 await rename(temporary,path);const directory=await open(path.slice(0,path.lastIndexOf('/')),'r');try{await directory.sync()}finally{await directory.close()}
}
async function privateJson(path){const info=await stat(path);if(!info.isFile()||(info.mode&0o077)!==0)fail('PROMOTION_PRIVATE_CANDIDATE_REQUIRED');return JSON.parse(await readFile(path,'utf8'))}
async function trustedJson(path){const info=await stat(path);if(!info.isFile()||(info.mode&0o222)!==0)fail('PROMOTION_READ_ONLY_HOST_PROOF_REQUIRED');return JSON.parse(await readFile(path,'utf8'))}
function publicCandidate(candidate){return Object.fromEntries(['project','kind','sourceSha','generation','systemIdentifier','restrictionId','tenantId','stage','observedAt','before','target','guard','preserved','quotaPhase','retainedOperationId','captureSourceSha'].filter(k=>candidate[k]!==undefined).map(k=>[k,candidate[k]]))}
async function persistCandidate(candidate){await atomicJson(`/run/qa-secrets/promotion-${candidate.kind.toLowerCase()}-candidate.json`,candidate);await atomicJson(`/run/qa-results/${candidate.kind.toLowerCase()}-preparer.json`,publicCandidate(candidate))}
function checkEnvironment({qa,adminConnection,hostProof,sourceSha}){
 validatePromotionHostProof({proof:hostProof,qa,sourceSha});const admin=validateConnection(adminConnection);
 if(process.env.QA_PROJECT!==PROJECT||admin.host!=='postgres'||admin.user!=='qa_bootstrap'||admin.database!=='postgres'||admin.ssl.servername!=='postgres'||admin.ssl.rejectUnauthorized!==true)fail('PROMOTION_PRIVATE_OWN_COHORT_REQUIRED');return admin;
}
async function database(admin,name,fn){
 if(!['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'].includes(name))fail('PROMOTION_FIXED_DATABASE_REQUIRED');
 const pool=await createPgPool({...admin,database:name,max:1,connectionTimeoutMillis:1500,statement_timeout:2000,lock_timeout:500,application_name:'mecanet-cp017-private-promotion'});
 try{return await fn(pool)}finally{await pool.end()}
}
async function shortRead(pool,text,values=[]){const c=await pool.connect();try{await c.query('BEGIN READ ONLY');const result=(await c.query(text,values)).rows;await c.query('COMMIT');return result}catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}}
async function verifyOwnerAbsence(admin,qa,proof){
 await database(admin,'mecanet_control',async pool=>{
  const row=(await shortRead(pool,"SELECT system_identifier::text AS system_id FROM pg_control_system()"))[0];if(row?.system_id!==qa.systemIdentifier)fail('PROMOTION_CLUSTER_MISMATCH');
  const names=proof.apis.flatMap(a=>[a.writerApplicationName,`mecanet-qa-api:${a.owner}`]);
  const live=(await shortRead(pool,"SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename IN('saas_api','saas_issuer','saas_session','saas_writer_a','saas_writer_b','saas_tenant_a','saas_tenant_b','saas_demo') OR application_name=ANY($1::text[])",[names]))[0];if(live.n!==0)fail('PROMOTION_API_OR_WRITER_STILL_ALIVE');
  const generation=(await shortRead(pool,'SELECT generation FROM saas.admission_fence WHERE id=1'))[0];if(generation?.generation!==qa.generation)fail('PROMOTION_GENERATION_MISMATCH');
 });
}
const aggregate=(table,order,where='')=>`SELECT count(*)::text AS n,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY ${order}),'[]')::text,'UTF8')),'hex') AS digest FROM ${table} t ${where}`;
async function snapshot(admin,qa,tenantId,restrictionId){
 const central=await database(admin,'mecanet_control',async p=>{
  const state=(await shortRead(p,'SELECT w.*,d.schema_version,d.data_epoch::text AS directory_epoch,d.writer_secret_ref,d.writer_credential_version::text,d.db_name,d.secret_ref,d.credential_version::text,d.status AS directory_status FROM saas.tenant_writer_state w JOIN saas.tenant_directory d ON d.id=w.tenant_id WHERE w.tenant_id=$1',[tenantId]))[0];
  const guard=(await shortRead(p,'SELECT t.*,r.reason_code,r.active,r.status AS restriction_status FROM saas.write_restriction_tenants t JOIN saas.write_restrictions r ON r.id=t.restriction_id WHERE t.restriction_id=$1 AND t.tenant_id=$2',[restrictionId,tenantId]))[0];
  const intent=(await shortRead(p,aggregate('saas.write_intents','t.operation_id','WHERE t.tenant_id=$1'),[tenantId]))[0];
  const growth=(await shortRead(p,aggregate('saas.write_growth_reservations','t.operation_id','WHERE t.tenant_id=$1'),[tenantId]))[0];
  const windows=(await shortRead(p,aggregate('saas.windows','t.scope_key,t.tick'),[]))[0];
  const debt=(await shortRead(p,"SELECT count(*) FILTER(WHERE i.status IN('PENDING','EXECUTING','UNKNOWN'))::int AS pending,count(*) FILTER(WHERE r.status<>'SETTLED')::int AS retained FROM saas.write_intents i JOIN saas.write_growth_reservations r ON r.tenant_id=i.tenant_id AND r.operation_id=i.operation_id WHERE i.tenant_id=$1",[tenantId]))[0];
  return{central:state,guard,intentDigest:intent.digest,growthDigest:growth.digest,windowsDigest:windows.digest,debt};
 });
 const local=await database(admin,`mecanet_tenant_${suffix(tenantId)}`,async p=>{
  const fence=(await shortRead(p,'SELECT * FROM inventory.writer_fence WHERE id=1'))[0],quota=(await shortRead(p,'SELECT * FROM inventory.quota_state WHERE id=1'))[0];
  const actual=(await shortRead(p,'SELECT inventory.logical_usage()::text AS n'))[0];if(actual.n!==quota.logical_bytes)fail('PROMOTION_LOGICAL_INTEGRITY_REQUIRED');
  const rows={};for(const [table,order]of [['catalog.products','t.id'],['inventory.balances','t.product_id'],['inventory.movements','t.id'],['inventory.operations','t.id'],['inventory.audit','t.operation_id']])rows[table]=(await shortRead(p,aggregate(table,order)))[0];
  if(rows['catalog.products'].n!==quota.active_products||rows['inventory.operations'].n!==rows['inventory.audit'].n)fail('PROMOTION_LOGICAL_INTEGRITY_REQUIRED');
  return{local:fence,quota,dataDigest:digest(JSON.stringify(rows))};
 });
 return{...central,...local};
}
function preserved(actual){return Object.fromEntries(['dataDigest','intentDigest','growthDigest','windowsDigest','quota'].map(key=>[key,actual[key]]))}
function capturedGuardUnchanged(candidate,actual){
 const g=actual.guard,old=candidate.guard;
 if(!g||['restriction_id','tenant_id','generation','data_epoch','open_version','closed_version','reopen_version'].some(key=>g[key]!==old[key])||g.reason_code!==candidate.kind||g.restriction_status!=='ACKNOWLEDGED'||g.close_proven!==true)fail('PROMOTION_HISTORICAL_GUARD_CHANGED');
}
function closedGuard(actual,kind,generation){
 const g=actual.guard;if(g?.reason_code!==kind||g.restriction_status!=='ACKNOWLEDGED'||g.active!==true||actual.central?.generation!==generation||actual.local?.generation!==generation||actual.central.state!=='CLOSED'||actual.local.state!=='CLOSED'||actual.central.data_epoch!==actual.local.data_epoch||actual.central.writer_version!==actual.local.writer_version||g.closed_version!==actual.local.writer_version||g.close_proven!==true||g.stage!=='ACKNOWLEDGED'||actual.debt.pending!==0)fail('PROMOTION_ACK_CLOSED_REQUIRED');
 if(kind!=='POLICY'&&actual.debt.retained!==0)fail('PROMOTION_DEBT_MUST_BE_ZERO');return g;
}
export function assertPartialClosedCandidate({candidate,actual}){
 const {before,target,guard}=candidate,g=actual.guard;
 capturedGuardUnchanged(candidate,actual);
 if(g?.restriction_id!==candidate.restrictionId||g.reason_code!==candidate.kind||g.restriction_status!=='ACKNOWLEDGED'||!g.active||!g.close_proven||g.stage!=='ACKNOWLEDGED'||g.generation!==target.generation||g.closed_version!==guard.closed_version||actual.debt.pending!==0)fail('PROMOTION_RETRY_CLOSURE_REQUIRED');
 for(const row of [actual.central,actual.local])if(row?.state!=='CLOSED'||row.generation!==target.generation||row.writer_version!==guard.closed_version||![before.data_epoch,target.data_epoch].includes(row.data_epoch))fail('PROMOTION_RETRY_METADATA_CONFLICT');
 if(actual.central.schema_version!==2||actual.central.directory_status!==before.directory_status||![before.directory_epoch,target.directory_epoch].includes(actual.central.directory_epoch))fail('PROMOTION_RETRY_METADATA_CONFLICT');
 if(![before.writer_secret_ref,target.writer_secret_ref].includes(actual.central.writer_secret_ref)||![before.writer_credential_version,target.writer_credential_version].includes(actual.central.writer_credential_version))fail('PROMOTION_RETRY_METADATA_CONFLICT');
 for(const key of counterKeys)if(actual.central[key]!==before[key])fail('PROMOTION_PRESERVATION_NOT_PROVEN');
 for(const key of policyKeys)if(![before[key],target[key]].includes(actual.central[key])||![before[key],target[key]].includes(actual.quota[key]))fail('PROMOTION_RETRY_METADATA_CONFLICT');
 for(const key of ['logical_bytes','active_products'])if(actual.quota[key]!==candidate.preserved.quota[key])fail('PROMOTION_PRESERVATION_NOT_PROVEN');
 for(const key of ['dataDigest','intentDigest','growthDigest','windowsDigest'])if(actual[key]!==candidate.preserved[key])fail('PROMOTION_PRESERVATION_NOT_PROVEN');
 if(candidate.kind!=='POLICY'&&actual.debt.retained!==0)fail('PROMOTION_DEBT_MUST_BE_ZERO');return true;
}
export function assertReopenProgress({candidate,actual}){
 capturedGuardUnchanged(candidate,actual);
 const closed=candidate.guard.closed_version,reopen=candidate.guard.reopen_version,c=actual.central,l=actual.local;
 const valid=(c?.state==='CLOSED'&&c.writer_version===closed&&l?.state==='CLOSED'&&l.writer_version===closed)
  ||(c?.state==='CLOSED'&&c.writer_version===reopen&&l?.state==='CLOSED'&&l.writer_version===closed)
  ||(c?.state==='CLOSED'&&c.writer_version===reopen&&l?.state==='OPEN'&&l.writer_version===reopen)
  ||(c?.state==='OPEN'&&c.writer_version===reopen&&l?.state==='OPEN'&&l.writer_version===reopen);
 if(!valid)fail('PROMOTION_REOPEN_PROGRESS_NOT_PROVEN');
 // Only the preregistered partial fence/version pair is normalized. Every
 // epoch, credential, policy, counter and immutable digest remains exact.
 return assertPromotionSnapshot({candidate,actual:{...actual,central:{...c,state:'CLOSED',writer_version:closed},local:{...l,state:'CLOSED',writer_version:closed}},phase:'CLOSED'});
}
async function captureMetadata(kind,qa,restrictionId,actual){
 if(kind==='POLICY')return null;
 const name=kind.toLowerCase(),pointer=JSON.parse(await readFile(`/run/qa-results/revocation-capture-${name}.json`,'utf8'));
 if(pointer.project!==PROJECT||!new RegExp(`^/run/qa-results/revocation-capture-${name}-[a-f0-9-]{36}\\.json$`).test(pointer.file??''))fail('PROMOTION_CAPTURE_REQUIRED');
 const capture=JSON.parse(await readFile(pointer.file,'utf8')),b=capture.boundary;
 if(capture.project!==PROJECT||capture.generation!==qa.generation||!SHA.test(capture.sourceSha??'')||capture.status!=='PASS FOR LISTED CASES ONLY'||b?.kind!==name||b.tenantId!==actual.central.tenant_id||b.systemIdentifier!==qa.systemIdentifier||b.guard.id!==restrictionId||b.promoted!==false||b.credentialOrEpochChanged!==false||b.before.data_epoch!==actual.central.data_epoch||b.before.writer_version!==actual.guard.open_version)fail('PROMOTION_CAPTURE_REQUIRED');
 return capture.sourceSha;
}
export async function prepareQaPromotion({qa,adminConnection,hostProof,kind,restrictionId,sourceSha,quotaPhase=null,retainedOperationId=null}){
 const admin=checkEnvironment({qa,adminConnection,hostProof,sourceSha});if(!KINDS.includes(kind)||!UUID.test(restrictionId??''))fail('PROMOTION_EXACT_KIND_REQUIRED');
 await verifyOwnerAbsence(admin,qa,hostProof);
 let candidate;const path=`/run/qa-secrets/promotion-${kind.toLowerCase()}-candidate.json`;
 try{candidate=await privateJson(path)}catch(error){if(error.code!=='ENOENT')throw error}
 if(candidate&&candidate.stage==='PROMOTED')candidate=null;
 if(candidate){
  if(candidate.project!==PROJECT||candidate.sourceSha!==sourceSha||candidate.restrictionId!==restrictionId||candidate.kind!==kind||candidate.generation!==qa.generation||candidate.systemIdentifier!==qa.systemIdentifier)fail('PROMOTION_CANDIDATE_CONFLICT');
 }else{
  const lookup=await database(admin,'mecanet_control',async p=>(await shortRead(p,'SELECT tenant_id FROM saas.write_restriction_tenants WHERE restriction_id=$1 ORDER BY tenant_id',[restrictionId])));
  if(lookup.length!==1)fail('PROMOTION_ONE_TENANT_REQUIRED');const tenantId=lookup[0].tenant_id;suffix(tenantId);
  const actual=await snapshot(admin,qa,tenantId,restrictionId),guard=closedGuard(actual,kind,qa.generation);
  const policyTarget=kind==='POLICY'?chooseLowerQuota(quotaPhase,actual.central):null;
  candidate={project:PROJECT,kind,sourceSha,generation:qa.generation,systemIdentifier:qa.systemIdentifier,restrictionId,tenantId,stage:'PREPARING_CLOSED',observedAt:new Date().toISOString(),before:actual.central,target:planClosedPromotion({kind,before:actual.central,guard,generation:qa.generation,policyTarget}),guard,preserved:preserved(actual),quotaPhase,retainedOperationId,captureSourceSha:await captureMetadata(kind,qa,restrictionId,actual)};
  if(kind==='ROTATION'){
   const old=qa.writerEntries[candidate.before.writer_secret_ref];if(!old||old.tenantId!==tenantId||old.credentialVersion!==candidate.before.writer_credential_version||old.connection.user!==`saas_writer_${suffix(tenantId)}`||old.connection.host!=='postgres'||old.connection.database!==`mecanet_tenant_${suffix(tenantId)}`)fail('PROMOTION_OLD_WRITER_CUSTODY_REQUIRED');
   candidate.oldEntry=structuredClone(old);candidate.newPassword=randomBytes(32).toString('base64url');candidate.newVerifier=scramVerifier(candidate.newPassword);
   await atomicJson('/run/qa-secrets/rotation-old-writer.json',{project:PROJECT,generation:qa.generation,tenantId,secretRef:old.secretRef,credentialVersion:old.credentialVersion,connection:old.connection});
  }
  // Durable target/password precedes ALTER ROLE and every metadata mutation.
  await persistCandidate(candidate);
 }
 const current=await snapshot(admin,qa,candidate.tenantId,restrictionId);assertPartialClosedCandidate({candidate,actual:current});
 if(kind==='POLICY')await prepareClosedQuota({qa,phase:quotaPhase??candidate.quotaPhase,tenantId:candidate.tenantId,restrictionId,sourceSha,retainedOperationId:retainedOperationId??candidate.retainedOperationId});
 else{
  await verifyOwnerAbsence(admin,qa,hostProof);
  if(kind==='ROTATION'){
   if(!/^[A-Za-z0-9_-]{43}$/.test(candidate.newPassword??''))fail('PROMOTION_PRIVATE_PASSWORD_REQUIRED');
   if(!candidate.newVerifier){candidate.newVerifier=scramVerifier(candidate.newPassword);await persistCandidate(candidate)}
   if(!/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/.test(candidate.newVerifier))fail('PROMOTION_PRIVATE_VERIFIER_REQUIRED');
   await database(admin,`mecanet_tenant_${suffix(candidate.tenantId)}`,async p=>p.query(`ALTER ROLE saas_writer_${suffix(candidate.tenantId)} PASSWORD '${candidate.newVerifier}'`));
  }
  if(kind==='EPOCH')await database(admin,`mecanet_tenant_${suffix(candidate.tenantId)}`,async p=>{
   const c=await p.connect();try{await c.query('BEGIN');const f=(await c.query('SELECT * FROM inventory.writer_fence WHERE id=1 FOR UPDATE')).rows[0];
    if(f.state!=='CLOSED'||f.generation!==qa.generation||f.writer_version!==candidate.guard.closed_version||![candidate.before.data_epoch,candidate.target.data_epoch].includes(f.data_epoch))fail('PROMOTION_LOCAL_METADATA_CONFLICT');
    await c.query('UPDATE inventory.writer_fence SET data_epoch=$1 WHERE id=1',[candidate.target.data_epoch]);await c.query('COMMIT');
   }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
  });
  await database(admin,'mecanet_control',async p=>{
   const c=await p.connect();try{await c.query('BEGIN');await c.query('UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 AND generation=$1',[qa.generation]);
    const w=(await c.query('SELECT * FROM saas.tenant_writer_state WHERE tenant_id=$1 FOR UPDATE',[candidate.tenantId])).rows[0];
    const d=(await c.query('SELECT * FROM saas.tenant_directory WHERE id=$1 FOR UPDATE',[candidate.tenantId])).rows[0];
    if(w.state!=='CLOSED'||w.generation!==qa.generation||w.writer_version!==candidate.guard.closed_version||![candidate.before.data_epoch,candidate.target.data_epoch].includes(w.data_epoch)||d.schema_version!==2||d.status!==candidate.before.directory_status||![candidate.before.directory_epoch,candidate.target.directory_epoch].includes(d.data_epoch)||![candidate.before.writer_secret_ref,candidate.target.writer_secret_ref].includes(d.writer_secret_ref)||![candidate.before.writer_credential_version,candidate.target.writer_credential_version].includes(d.writer_credential_version))fail('PROMOTION_CENTRAL_METADATA_CONFLICT');
    await c.query('UPDATE saas.tenant_writer_state SET data_epoch=$2 WHERE tenant_id=$1',[candidate.tenantId,candidate.target.data_epoch]);
    await c.query('UPDATE saas.tenant_directory SET data_epoch=$2,writer_secret_ref=$3,writer_credential_version=$4 WHERE id=$1',[candidate.tenantId,candidate.target.data_epoch,candidate.target.writer_secret_ref,candidate.target.writer_credential_version]);await c.query('COMMIT');
   }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
  });
 }
 const actual=await snapshot(admin,qa,candidate.tenantId,restrictionId);assertPromotionSnapshot({candidate,actual,phase:'CLOSED'});
 if(kind==='ROTATION'){
  const connection={...candidate.oldEntry.connection,password:candidate.newPassword};delete qa.writerEntries[candidate.before.writer_secret_ref];
  qa.writerEntries[candidate.target.writer_secret_ref]={...candidate.oldEntry,secretRef:candidate.target.writer_secret_ref,credentialVersion:candidate.target.writer_credential_version,connection};qa.connections[`saas_writer_${suffix(candidate.tenantId)}`]=connection;
 }
 for(const entries of [qa.entries,qa.writerEntries,qa.maintenanceEntries])for(const entry of Object.values(entries))if(entry.tenantId===candidate.tenantId)entry.dataEpoch=candidate.target.data_epoch;
 await atomicJson('/run/qa-secrets/connections.json',qa);candidate.stage='PREPARED_CLOSED';candidate.observedAt=new Date().toISOString();await persistCandidate(candidate);
 return{...publicCandidate(candidate),openedFences:0,newRoles:0,secretsPrinted:false};
}
export async function promoteQaCandidate({qa,adminConnection,hostProof,kind,sourceSha}){
 const admin=checkEnvironment({qa,adminConnection,hostProof,sourceSha});if(!KINDS.includes(kind))fail('PROMOTION_EXACT_KIND_REQUIRED');
 const candidate=await privateJson(`/run/qa-secrets/promotion-${kind.toLowerCase()}-candidate.json`);
 if(candidate.project!==PROJECT||candidate.kind!==kind||candidate.sourceSha!==sourceSha||candidate.generation!==qa.generation||candidate.systemIdentifier!==qa.systemIdentifier||!['PREPARED_CLOSED','PROMOTED'].includes(candidate.stage))fail('PROMOTION_PREPARED_CANDIDATE_REQUIRED');
 await verifyOwnerAbsence(admin,qa,hostProof);
 const control=await createPgPool({...qa.writerMaintenance,max:1,connectionTimeoutMillis:1500,statement_timeout:500,application_name:'mecanet-cp017-verified-promotion'});
 const maintenance=createTenantPoolManager({resolveSecret:createSecretResolver({entries:qa.maintenanceEntries,access:'maintenance'}),access:'write',allowedSchemaVersions:[2],maxPools:2,maxPerPool:1});
 const coordinator=createRestrictiveCoordinator({controlPool:control,maintenancePools:maintenance,generation:qa.generation,
  resolveDescriptor:guard=>{const entry=Object.values(qa.maintenanceEntries).find(e=>e.tenantId===guard.tenant_id);if(!entry||entry.dataEpoch!==candidate.target.data_epoch)fail('PROMOTION_MAINTENANCE_METADATA_REQUIRED');return entry},
  verifyPromotion:async({restriction,guards,generation})=>{
   if(restriction.id!==candidate.restrictionId||restriction.reason_code!==kind||generation!==candidate.generation||guards.length!==1||guards[0].tenant_id!==candidate.tenantId||!guards[0].close_proven)fail('PROMOTION_EXACT_BARRIER_REQUIRED');
   await verifyOwnerAbsence(admin,qa,hostProof);const actual=await snapshot(admin,qa,candidate.tenantId,candidate.restrictionId);
   assertReopenProgress({candidate,actual});
   if(kind!=='POLICY'&&(actual.debt.pending!==0||actual.debt.retained!==0))fail('PROMOTION_DEBT_MUST_BE_ZERO');
   const writer=qa.writerEntries[candidate.target.writer_secret_ref];if(!writer||writer.tenantId!==candidate.tenantId||writer.credentialVersion!==candidate.target.writer_credential_version||writer.dataEpoch!==candidate.target.data_epoch||writer.schemaVersion!==2)fail('PROMOTION_WRITER_METADATA_REQUIRED');
   return{verified:true,tenants:[{tenantId:candidate.tenantId,generation:candidate.generation,dataEpoch:candidate.target.data_epoch}]};
  }});
 try{
  const result=await coordinator.resumeOperationalBarrier(candidate.restrictionId);if(result.resumed!==true)fail('PROMOTION_RESUME_NOT_PROVEN');
  const actual=await snapshot(admin,qa,candidate.tenantId,candidate.restrictionId);assertPromotionSnapshot({candidate,actual,phase:'OPEN'});
  if(actual.guard.stage!=='OPEN'||actual.guard.active!==false||actual.guard.restriction_status!=='ACKNOWLEDGED')fail('PROMOTION_FINAL_BARRIER_NOT_PROVEN');
  candidate.stage='PROMOTED';candidate.observedAt=new Date().toISOString();await persistCandidate(candidate);
  const proof={project:PROJECT,kind,sourceSha,generation:qa.generation,systemIdentifier:qa.systemIdentifier,restrictionId:candidate.restrictionId,tenantId:candidate.tenantId,captureSourceSha:candidate.captureSourceSha,closedPreparerVerified:true,positiveProcessEndVerified:true,sqlOwnerAbsent:true,quotaCountersPreserved:true,immutableIntentAndBusinessDigestsPreserved:true,writerVersion:actual.central.writer_version,dataEpoch:actual.central.data_epoch,observedAt:new Date().toISOString(),hostProofContainers:hostProof.apis.map(a=>({instance:a.instance,containerId:a.containerId,owner:a.owner}))};
  const path=`/run/qa-results/${kind.toLowerCase()}-promotion-proof.json`;await atomicJson(path,proof);await chmod(path,0o400);
  return{...proof,status:'PROMOTED; LIVE CONTINUITY NOT VERIFIED',secretsPrinted:false};
 }finally{await maintenance.close();await control.end()}
}
export const PROMOTION_PREREGISTRATION=Object.freeze({project:PROJECT,kinds:KINDS,maxApiInstances:2,maxPoolPerRole:1,statementMs:2000,centralTransactionMs:500,tenantTransactionMs:2000,resourceSettlement:false,newRoles:false,automaticApiStart:false,quotaReset:false,foreignInfrastructureChanges:false,stillNotVerified:['credential/epoch continuity until verify-* real HTTP','public launch and real-data migration']});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report={status:'FAIL',sourceSha:process.env.QA_CODE_SHA,preregistration:PROMOTION_PREREGISTRATION,observedAt:new Date().toISOString(),secretsPrinted:false};
 try{
  const mode=process.argv[2],kind=process.argv[3];if(!['prepare','promote'].includes(mode)||!KINDS.includes(kind)||process.env.QA_PROJECT!==PROJECT||!SHA.test(report.sourceSha??''))fail('PROMOTION_EXACT_COMMAND_REQUIRED');
  const [qa,hostProof,ca,password]=await Promise.all([privateJson('/run/qa-secrets/connections.json'),trustedJson('/run/qa-results/operational-host-proof.json'),readFile('/run/qa-ca.crt','utf8'),readFile('/run/qa-secrets/bootstrap','utf8')]);
  const adminConnection={host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password,ssl:{ca,servername:'postgres',rejectUnauthorized:true}};
  const args={qa,adminConnection,hostProof,kind,sourceSha:report.sourceSha};
  report.result=mode==='prepare'?await prepareQaPromotion({...args,restrictionId:process.env.QA_PROMOTION_RESTRICTION,quotaPhase:process.env.QA_QUOTA_PHASE,retainedOperationId:process.env.QA_QUOTA_RETAINED_OPERATION??null}):await promoteQaCandidate(args);
  report.harnessSha256=digest(await readFile(new URL(import.meta.url)));report.status=mode==='prepare'?'PREPARED CLOSED; TEST NOT EXECUTED':'PROMOTED; LIVE CONTINUITY NOT VERIFIED';
 }catch(error){Object.assign(report,sanitizeSqlFailure(error));if(/^PROMOTION_[A-Z0-9_]{1,80}$/.test(error.message??''))report.fixedFailure=error.message;process.exitCode=1}
 await writeFile('/run/qa-results/operational-promotion.json',JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
}
