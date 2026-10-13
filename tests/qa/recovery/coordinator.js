// Private synthetic recovery; every mutator retains the admission barrier.
import { randomUUID, randomBytes } from 'node:crypto';
import { sha256 } from './journal.js';
import { QA_ROLES } from '../schema/fixture.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const own = /^mecanet-qa-p1l1[_-][a-z0-9_-]+$/;
const parseLsn = (lsn) => { if(!/^[0-9A-F]+\/[0-9A-F]+$/i.test(lsn??''))throw new Error('RESTORE_PREFLIGHT_REQUIRED');const [high,low]=lsn.split('/');return (BigInt(`0x${high}`)<<32n)+BigInt(`0x${low}`); };
export function validateRestorePlan(plan) {
  if(!plan || plan.project!=='mecanet-qa-p1l1'||plan.dataClass!=='synthetic'||!UUID.test(plan.cohortId)||!UUID.test(plan.generation)||!UUID.test(plan.targetGeneration)||plan.targetGeneration===plan.generation||!/^[0-9]{10,24}$/.test(plan.systemIdentifier)||!own.test(plan.source?.volume)||!own.test(plan.target?.volume)||plan.source.volume===plan.target.volume||!plan.source.service||!plan.target.service||plan.source.service===plan.target.service||!/^([a-f0-9]{64})$/.test(plan.backupManifestHash??''))throw new Error('RESTORE_PREFLIGHT_REQUIRED');
  const required=['sourceBarrier','sourceStopped','clockStopped','projectionStopped','targetEgressClosed','targetTlsReviewed','targetHbaReviewed','targetPrivate','backupVerified'];
  if(required.some(key=>plan.proof?.[key]!==true)||plan.proof.apiOwnersStopped?.length!==2||!plan.proof.apiOwnersStopped.every(id=>UUID.test(id))||new Set(plan.proof.apiOwnersStopped).size!==2||parseLsn(plan.endLsn)<parseLsn(plan.startLsn))throw new Error('RESTORE_PREFLIGHT_REQUIRED');
  return plan;
}

export async function closeBarrier({pool,journal,cohortId,generation}) {
  if(!UUID.test(cohortId)||!UUID.test(generation))throw new Error('RECOVERY_ID_REQUIRED');
  const intent=await journal.intent('barrier',{generation});
  const client=await pool.connect(); let committed=false;
  try {
    await client.query('BEGIN');
    const {rows:[fence]}=await client.query('UPDATE saas.admission_fence SET barrier=true,admission_version=admission_version+1 WHERE id=1 AND generation=$1 RETURNING admission_version', [generation]);
    if(!fence)throw new Error('RECOVERY_GENERATION_MISMATCH');
    await client.query('INSERT INTO saas.recovery_checkpoints(cohort_id,generation,barrier_version,journal_sequence,journal_hash) VALUES($1,$2,$3,$4,$5)',[cohortId,generation,fence.admission_version,intent.sequence,intent.hash]);
    await client.query('COMMIT'); committed=true;
    await journal.result(intent.operationId);
    return {cohortId,generation,barrierVersion:String(fence.admission_version),checkpoint:journal.checkpoint()};
  } finally {if(!committed)await client.query('ROLLBACK').catch(()=>{});client.release(!committed);}
}

export async function verifyClosedCluster(pool,{systemIdentifier,generation,cohortId,requireSettled=true}) {
  const {rows:[facts]}=await pool.query("SELECT system_identifier::text,current_setting('server_version_num')::int AS version,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls FROM pg_control_system()");
  const {rows:[fence]}=await pool.query('SELECT barrier,generation,tick,clock_version FROM saas.admission_fence WHERE id=1');
  if(facts?.system_identifier!==systemIdentifier||facts.version!==180006||facts.tls!==true||fence?.barrier!==true||fence.generation!==generation)throw new Error('RECOVERY_CLUSTER_NOT_CLOSED');
  const {rows:[checkpoint]}=await pool.query('SELECT generation,journal_sequence,journal_hash FROM saas.recovery_checkpoints WHERE cohort_id=$1',[cohortId]);
  if(!checkpoint||checkpoint.generation!==generation)throw new Error('RECOVERY_CHECKPOINT_MISSING');
  const {rows:[live]}=await pool.query("SELECT count(*)::int AS count FROM saas.tickets WHERE state IN ('WAITING','ACTIVE','UNCERTAIN')");
  if(requireSettled&&live.count!==0)throw new Error('RECOVERY_UNSETTLED_TICKETS');
  return {systemIdentifier:facts.system_identifier,generation,tick:String(fence.tick),clockVersion:String(fence.clock_version),liveTickets:live.count,checkpoint:{sequence:Number(checkpoint.journal_sequence),hash:checkpoint.journal_hash}};
}

export async function applyRestrictiveIntent({central,tenantPool,intent}) {
  if(!intent||!UUID.test(intent.operationId)||!['revoke_identity','revoke_session','purge_product'].includes(intent.action))throw new Error('RESTRICTIVE_INTENT_REQUIRED');
  const targetHash=sha256(intent.target);const client=await central.connect();let committed=false;
  try {
    await client.query('BEGIN');
    const {rows:[fence]}=await client.query('SELECT barrier FROM saas.admission_fence WHERE id=1 FOR UPDATE');
    if(fence?.barrier!==true)throw new Error('RECOVERY_BARRIER_REQUIRED');
    const {rows:[prior]}=await client.query('SELECT action,target_hash,journal_hash FROM saas.recovery_applied WHERE operation_id=$1',[intent.operationId]);
    if(prior){if(prior.action!==intent.action||prior.target_hash!==targetHash||prior.journal_hash!==intent.hash)throw new Error('RECOVERY_OPERATION_CONFLICT');await client.query('COMMIT');committed=true;return {repeated:true};}
    if(intent.action==='revoke_identity')await client.query("UPDATE saas.identities SET status='revoked',security_version=security_version+1 WHERE id=$1 AND status<>'revoked'",[intent.target.identityId]);
    if(intent.action==='revoke_session')await client.query("UPDATE saas.session_registry SET status='revoked' WHERE sid=$1",[intent.target.sid]);
    if(intent.action==='purge_product'){
      if(typeof tenantPool!=='function')throw new Error('RECOVERY_TENANT_RESOLVER_REQUIRED');
      // A crash after this DELETE but before the central marker is safe: repeat is
      // another DELETE of this exact synthetic UUID, never a cross-DB transaction.
      await tenantPool(intent.target.tenantId,async db=>db.query('DELETE FROM catalog.products WHERE id=$1',[intent.target.productId]));
    }
    await client.query('INSERT INTO saas.recovery_applied(operation_id,action,target_hash,journal_hash) VALUES($1,$2,$3,$4)',[intent.operationId,intent.action,targetHash,intent.hash]);
    await client.query('COMMIT');committed=true;return {repeated:false};
  } finally {if(!committed)await client.query('ROLLBACK').catch(()=>{});client.release(!committed);}
}

export async function recordRestriction({journal,central,tenantPool,action,target}) {
  const intent=await journal.intent(action,target);
  const result=await applyRestrictiveIntent({central,tenantPool,intent});
  await journal.result(intent.operationId);return {...result,intent,checkpoint:journal.checkpoint()};
}

export async function invalidateRestoredState(pool,{oldGeneration,newGeneration,newClockOwner=randomUUID(),cohortId}) {
  if(!UUID.test(oldGeneration)||!UUID.test(newGeneration)||oldGeneration===newGeneration||!UUID.test(newClockOwner)||!UUID.test(cohortId))throw new Error('RECOVERY_NEW_GENERATION_REQUIRED');
  const client=await pool.connect();let committed=false;
  try {
    await client.query('BEGIN');
    const {rows:[fence]}=await client.query('SELECT barrier,generation FROM saas.admission_fence WHERE id=1 FOR UPDATE');
    if(fence?.barrier!==true||fence.generation!==oldGeneration)throw new Error('RECOVERY_BARRIER_REQUIRED');
    const {rows:[checkpoint]}=await client.query('SELECT cohort_id FROM saas.recovery_checkpoints WHERE cohort_id=$1 AND generation=$2',[cohortId,oldGeneration]);
    if(!checkpoint)throw new Error('RECOVERY_CHECKPOINT_MISSING');
    const {rows:[live]}=await client.query("SELECT count(*)::int AS count FROM saas.tickets WHERE state IN ('WAITING','ACTIVE','UNCERTAIN')");
    if(live.count)throw new Error('RECOVERY_UNSETTLED_TICKETS');
    await client.query("UPDATE saas.session_registry SET status='revoked' WHERE status<>'revoked'");
    for(const name of ['company_sessions','demo_sessions','operator_sessions'])await client.query(`DELETE FROM session_store.${name}`);
    await client.query("UPDATE saas.identities SET status='revoked',security_version=security_version+1 WHERE purpose='demo' AND status<>'revoked'");
    await client.query("UPDATE saas.tenant_directory SET data_epoch=data_epoch+1,credential_version=credential_version+1,status=CASE WHEN purpose='demo' THEN 'blocked' ELSE 'draining' END");
    await client.query('UPDATE saas.admission_fence SET generation=$1,clock_version=clock_version+1 WHERE id=1',[newGeneration]);
    await client.query('UPDATE saas.time_authority SET generation=$1,owner=$2,clock_version=clock_version+1,advanced_at=clock_timestamp() WHERE id=1',[newGeneration,newClockOwner]);
    await client.query('UPDATE saas.recovery_checkpoints SET restored_generation=$2 WHERE cohort_id=$1',[cohortId,newGeneration]);
    await client.query('COMMIT');committed=true;return {generation:newGeneration,clockOwner:newClockOwner,barrier:true};
  } finally {if(!committed)await client.query('ROLLBACK').catch(()=>{});client.release(!committed);}
}

const restoreLoginRoles=Object.freeze([...Object.keys(QA_ROLES),'qa_bootstrap']);
export function createRestoredCredentialCandidate() {
  return Object.freeze(Object.fromEntries(restoreLoginRoles.map(role=>[role,randomBytes(32).toString('base64url')])));
}
function validateCredentialCandidate(candidate) {
  const invalid=()=>{throw new Error('RECOVERY_CREDENTIAL_CANDIDATE_REQUIRED');};
  if(!candidate||Object.getPrototypeOf(candidate)!==Object.prototype)invalid();
  const keys=Reflect.ownKeys(candidate),descriptors=Object.getOwnPropertyDescriptors(candidate);
  if(keys.length!==restoreLoginRoles.length||keys.some(key=>typeof key!=='string'||!restoreLoginRoles.includes(key)))invalid();
  const passwords={};
  for(const role of restoreLoginRoles){
    const property=descriptors[role];
    if(!property||!Object.hasOwn(property,'value')||!property.enumerable)invalid();
    const password=property.value;
    if(typeof password!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(password)||Buffer.from(password,'base64url').length!==32||Buffer.from(password,'base64url').toString('base64url')!==password)invalid();
    passwords[role]=password;
  }
  if(new Set(Object.values(passwords)).size!==restoreLoginRoles.length)invalid();
  return Object.freeze(passwords);
}
export async function rotateRestoredCredentials(pool,candidate) {
  // The caller durably custodies this exact candidate before SQL. Never generate
  // replacement secrets here: a lost COMMIT acknowledgement must retain access.
  const passwords=validateCredentialCandidate(candidate);
  const client=await pool.connect();let committed=false;
  try {
    await client.query('BEGIN');
    const {rows:[fence]}=await client.query('SELECT barrier FROM saas.admission_fence WHERE id=1 FOR UPDATE');
    if(fence?.barrier!==true)throw new Error('RECOVERY_BARRIER_REQUIRED');
    for(const role of restoreLoginRoles){await client.query("SELECT set_config('qa.rotated_password',$1,true)",[passwords[role]]);await client.query(`DO $$ BEGIN EXECUTE format('ALTER ROLE "${role}" PASSWORD %L',current_setting('qa.rotated_password')); END $$`);}
    await client.query('COMMIT');committed=true;return {rotatedRoles:restoreLoginRoles.length,committed:true};
  } finally {if(!committed)await client.query('ROLLBACK').catch(()=>{});client.release(!committed);}
}

export async function captureNonrestrictiveState(pool) {
  const state={};
  // Exact tables/columns: restriction-only canaries may revoke identities/sessions
  // or delete a product, but cannot admit work, renew activity or change policies.
  const queries={
    fence:'SELECT * FROM saas.admission_fence ORDER BY id',
    timeAuthority:'SELECT * FROM saas.time_authority ORDER BY id',
    scopes:'SELECT * FROM saas.admission_scopes ORDER BY scope_key',
    tickets:'SELECT * FROM saas.tickets ORDER BY id',
    windows:'SELECT * FROM saas.windows ORDER BY scope_key,tick',
    policies:'SELECT * FROM saas.policies ORDER BY scope_key',
    policyAudit:'SELECT * FROM saas.policy_audit ORDER BY request_id',
    directory:'SELECT * FROM saas.tenant_directory ORDER BY id',
    grants:'SELECT * FROM saas.action_grants ORDER BY identity_id,tenant_id,action',
    registry:'SELECT sid,identity_id,purpose,generation,security_version,created_at,absolute_expires_at,last_interactive_at,reauth_at FROM saas.session_registry ORDER BY sid',
  };
  for(const [key,sql]of Object.entries(queries)){const {rows}=await pool.query(sql);state[key]=sha256(JSON.stringify(rows));}
  return {hash:sha256(state),parts:state};
}

async function databaseFingerprint(pool,schemas) {
  const {rows:objects}=await pool.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','i','S') ORDER BY n.nspname,c.relname`,[schemas]);
  const {rows:constraints}=await pool.query(`SELECT n.nspname AS schema,c.relname AS name,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[]) ORDER BY n.nspname,c.relname,k.conname`,[schemas]);
  const {rows:indexes}=await pool.query('SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=ANY($1::text[]) ORDER BY schemaname,tablename,indexname',[schemas]);
  const {rows:namespace}=await pool.query('SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl::text AS acl FROM pg_namespace WHERE nspname=ANY($1::text[]) ORDER BY nspname',[schemas]);
  const {rows:functions}=await pool.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY($1::text[]) AND p.prokind='f' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`,[schemas]);
  const {rows:database}=await pool.query('SELECT datname,pg_get_userbyid(datdba) AS owner,datacl::text AS acl,datconnlimit FROM pg_database WHERE datname=current_database()');
  return {objectsHash:sha256(objects),constraintsHash:sha256(constraints),indexesHash:sha256(indexes),schemasHash:sha256(namespace),functionsHash:sha256(functions),databaseHash:sha256(database),objects:objects.length,constraints:constraints.length};
}
export async function captureCohort({central,tenantPool,tenantIds}) {
  const {rows:roles}=await central.query("SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolbypassrls FROM pg_roles WHERE rolname LIKE 'saas_%' OR rolname='qa_bootstrap' ORDER BY rolname");
  const {rows:memberships}=await central.query("SELECT parent.rolname AS parent,child.rolname AS member,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member WHERE parent.rolname LIKE 'saas_%' OR child.rolname LIKE 'saas_%' OR parent.rolname='qa_bootstrap' OR child.rolname='qa_bootstrap' ORDER BY parent.rolname,child.rolname");
  const centralFingerprint=await databaseFingerprint(central,['saas','session_store']);
  const {rows:[counts]}=await central.query('SELECT (SELECT count(*)::int FROM saas.identities) AS identities,(SELECT count(*)::int FROM saas.tenant_directory) AS tenants,(SELECT count(*)::int FROM saas.memberships) AS memberships,(SELECT count(*)::int FROM saas.session_registry) AS sessions');
  if(counts.identities!==4||counts.tenants!==3)throw new Error('RECOVERY_SYNTHETIC_SCOPE_MISMATCH');
  const tenants={};
  for(const tenantId of tenantIds)await tenantPool(tenantId,async db=>{const {rows}=await db.query('SELECT id,sku,name FROM catalog.products ORDER BY id');if(rows.length>100)throw new Error('RECOVERY_DATA_LIMIT');tenants[tenantId]={...await databaseFingerprint(db,['catalog']),count:rows.length,contentHash:sha256(rows)};});
  return {rolesHash:sha256(roles),roleMembershipsHash:sha256(memberships),central:centralFingerprint,counts,tenants};
}
export function compareCohort(expected,actual) {
  if(sha256(expected)!==sha256(actual))throw new Error('RECOVERY_COHORT_MISMATCH');
  return true;
}
