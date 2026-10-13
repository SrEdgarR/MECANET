// Run only in the private Node helper on the exclusive QA network.
import {readFile,open,rename,mkdir} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import session from '../../../server/saas/node_modules/express-session/index.js';
import pgSession from '../../../server/saas/node_modules/connect-pg-simple/index.js';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {createAuthority} from '../../../server/saas/auth/authority.js';
import {createFixtureIssuer} from '../issuer.js';
import {fixtureDefinition} from '../schema/fixture.js';
import {createJournal,openJournal,verifyJournal,replayRestrictive,sha256,syncDirectoryStrict} from './journal.js';
import {closeBarrier,verifyClosedCluster,recordRestriction,applyRestrictiveIntent,invalidateRestoredState,createRestoredCredentialCandidate,rotateRestoredCredentials,captureCohort,captureNonrestrictiveState,compareCohort,validateRestorePlan} from './coordinator.js';

const root='/run/qa-recovery', journalPath=`${root}/journal.jsonl`, statePath=`${root}/state.json`;
const phase=process.argv[2];
if(!['prepare','snapshot','canaries','restore'].includes(phase))throw new Error('RECOVERY_PHASE_REQUIRED');
const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
const fixture=fixtureDefinition(); const tenantIds=fixture.tenants.map(t=>t.id);
async function saveJson(path,value,{exclusive=false}={}){const tmp=exclusive?path:`${path}.new`;const file=await open(tmp,'wx',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}if(!exclusive)await rename(tmp,path);await syncDirectoryStrict(path.slice(0,path.lastIndexOf('/')));}
const loadState=async()=>JSON.parse(await readFile(statePath,'utf8'));
async function sourceConfig(){return {host:'postgres',port:5432,database:'mecanet_control',user:'qa_bootstrap',password:await readFile('/run/qa-secrets/bootstrap','utf8'),ssl:{ca:await readFile('/run/qa-ca.crt','utf8'),servername:'postgres',rejectUnauthorized:true}};}
function tenantResolver(adminConfig){return async(tenantId,fn)=>{const tenant=fixture.tenants.find(t=>t.id===tenantId);if(!tenant)throw new Error('UNKNOWN_SYNTHETIC_TENANT');const db=await createPgPool({...adminConfig,database:tenant.dbName,max:1,connectionTimeoutMillis:2000,statement_timeout:2000});try{return await fn(db);}finally{await db.end();}};}
async function connected(config){return createPgPool({...config,max:1,connectionTimeoutMillis:2000,statement_timeout:2000,application_name:`mecanet-recovery-${phase}`});}
async function verifyIdentity(pool){const {rows:[row]}=await pool.query("SELECT system_identifier::text,current_setting('server_version_num')::int AS version,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls FROM pg_control_system()");if(row.system_identifier!==qa.systemIdentifier||row.version!==180006||row.tls!==true)throw new Error('WRONG_SYNTHETIC_CLUSTER');}
function assertStoppedWorkers(proof){if(proof.clockStopped!==true||proof.projectionStopped!==true||proof.apiOwnersStopped?.length!==2||new Set(proof.apiOwnersStopped).size!==2)throw new Error('SOURCE_RUNNERS_NOT_STOPPED');}
async function createSampleSessions(pool){
 const login=JSON.parse(await readFile('/run/qa-secrets/fixture-login.json','utf8'));
 const issuer=createFixtureIssuer({pool,generation:qa.generation}),authority=createAuthority(pool,qa.generation),PgStore=pgSession(session),samples=[];
 // Private preparer uses its existing own-cluster connection; this does not
 // claim that bootstrap privileges are runtime privileges (tested separately).
 for(const fixtureIdentity of fixture.identities){
  const identity=await issuer.verify({email:fixtureIdentity.email,purpose:fixtureIdentity.purpose,password:login.password});
  const sid=randomBytes(32).toString('base64url');await issuer.issue({sid,identity});
  const store=new PgStore({pool,schemaName:'session_store',tableName:`${identity.purpose}_sessions`,createTableIfMissing:false,pruneSessionInterval:false,disableTouch:true,errorLog:()=>{}});
  await new Promise((resolve,reject)=>store.set(sid,{cookie:{expires:new Date(Date.now()+1_800_000),maxAge:1_800_000},identityId:identity.id,csrfToken:randomBytes(32).toString('base64url')},error=>error?reject(error):resolve()));
  await authority.authorize({sid,purpose:identity.purpose});
  samples.push({sid,purpose:identity.purpose,identityId:identity.id,generation:qa.generation});
 }
 await saveJson('/run/qa-secrets/recovery-sessions.json',samples);return samples.length;
}

if(phase==='prepare'){
 await mkdir(root,{recursive:true,mode:0o700});
 const config=await sourceConfig(),pool=await connected(config);
 try{
  await verifyIdentity(pool);
  const {rows:[present]}=await pool.query("SELECT to_regclass('saas.recovery_checkpoints') IS NOT NULL AS present");
  if(present.present)throw new Error('RECOVERY_SCHEMA_ALREADY_EXISTS');
  await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
  const sampleSessions=await createSampleSessions(pool);
  const cohortId=randomUUID(),journal=await createJournal(journalPath,{cohortId,generation:qa.generation,systemIdentifier:qa.systemIdentifier});
  try{
   const barrier=await closeBarrier({pool,journal,cohortId,generation:qa.generation});
   await saveJson(statePath,{project:'mecanet-qa-p1l1',dataClass:'synthetic',cohortId,generation:qa.generation,systemIdentifier:qa.systemIdentifier,barrier,finalCheckpoint:journal.checkpoint(),phase:'barrier'});
   console.log(JSON.stringify({barrier:true,cohortId,sampleSessions,phase:'prepared',reopen:false}));
  }finally{await journal.close();}
 }finally{await pool.end();}
}

if(phase==='snapshot'){
 const state=await loadState(),proof=JSON.parse(await readFile(`${root}/proof.json`,'utf8'));assertStoppedWorkers(proof);
 const config=await sourceConfig(),central=await connected(config),tenantPool=tenantResolver(config);
 try{
  const closed=await verifyClosedCluster(central,state);
  const issuerPool=await connected(qa.connections.saas_issuer);
  try{
   const login=JSON.parse(await readFile('/run/qa-secrets/fixture-login.json','utf8'));
   const issuer=createFixtureIssuer({pool:issuerPool,generation:qa.generation});
   const identity=await issuer.verify({email:fixture.identities[0].email,purpose:'company',password:login.password});
   await assert.rejects(issuer.issue({sid:randomBytes(32).toString('base64url'),identity}),{code:'ADMISSION_CLOSED'});
  }finally{await issuerPool.end();}
  const verified=verifyJournal(await readFile(journalPath,'utf8'),{checkpoint:closed.checkpoint,finalCheckpoint:state.finalCheckpoint});
  if(verified.metadata.cohortId!==state.cohortId||verified.pending.length)throw new Error('BARRIER_JOURNAL_INCOMPLETE');
  state.cohort=await captureCohort({central,tenantPool,tenantIds});
  state.nonrestrictive=await captureNonrestrictiveState(central);state.backupCheckpoint=state.finalCheckpoint;state.phase='snapshot';
  await saveJson(statePath,state);
  console.log(JSON.stringify({snapshot:true,cohortId:state.cohortId,databases:4,liveTickets:closed.liveTickets,issuerBarrierDenied:true,reopen:false}));
 }finally{await central.end();}
}

if(phase==='canaries'){
 const state=await loadState();if(state.phase!=='snapshot')throw new Error('BACKUP_SNAPSHOT_REQUIRED');
 const facts=JSON.parse(await readFile(`${root}/backup-proof.json`,'utf8'));
 if(facts.pgVerifybackupExitCode!==0||facts.toolVersion!=='18.6')throw new Error('BACKUP_VERIFICATION_REQUIRED');
 const manifestBytes=await readFile('/backup/base/backup_manifest');
 const manifest=JSON.parse(manifestBytes);const wal=manifest['WAL-Ranges'];
 if(!Array.isArray(wal)||wal.length!==1)throw new Error('BACKUP_WAL_MANIFEST_REQUIRED');
 state.backupManifestHash=sha256(manifestBytes);state.startLsn=wal[0]['Start-LSN'];state.endLsn=wal[0]['End-LSN'];
 const config=await sourceConfig(),central=await connected(config),tenantPool=tenantResolver(config),journal=await openJournal(journalPath,{expectedHead:state.finalCheckpoint});
 try{
  await verifyClosedCluster(central,state);
  if((await captureNonrestrictiveState(central)).hash!==state.nonrestrictive.hash)throw new Error('SOURCE_CHANGED_AFTER_BARRIER');
  await recordRestriction({journal,central,tenantPool,action:'revoke_identity',target:{identityId:fixture.identities[1].id}});
  await recordRestriction({journal,central,tenantPool,action:'purge_product',target:{tenantId:fixture.tenants[0].id,productId:fixture.sharedProduct}});
  if((await captureNonrestrictiveState(central)).hash!==state.nonrestrictive.hash)throw new Error('SOURCE_CHANGED_AFTER_BACKUP');
  state.finalCheckpoint=journal.checkpoint();state.phase='canaries';await saveJson(statePath,state);
  console.log(JSON.stringify({postBackupCanaries:2,nonrestrictiveStateUnchanged:true,cohortId:state.cohortId,reopen:false}));
 }finally{await journal.close();await central.end();}
}

if(phase==='restore'){
 const state=await loadState();if(state.phase!=='canaries')throw new Error('POST_BACKUP_CANARIES_REQUIRED');
 const target=JSON.parse(await readFile('/run/qa-secrets/restore-bootstrap.json','utf8'));
 const proof=JSON.parse(await readFile(`${root}/proof.json`,'utf8'));
 const plan=validateRestorePlan({...state,targetGeneration:randomUUID(),source:target.source,target:target.target,proof});
 if(target.connection?.host!==plan.target.service||target.connection.host==='postgres'||target.connection.database!=='mecanet_control'||target.connection.user!=='qa_bootstrap'||target.connection.ssl?.rejectUnauthorized!==true||target.connection.ssl?.servername!==plan.target.service)throw new Error('TARGET_CONNECTION_NOT_ISOLATED');
 if(sha256(await readFile('/backup/base/backup_manifest'))!==state.backupManifestHash)throw new Error('BACKUP_MANIFEST_CHANGED');
 const central=await connected(target.connection),tenantPool=tenantResolver(target.connection);
 try{
  const closed=await verifyClosedCluster(central,state);
  const verified=verifyJournal(await readFile(journalPath,'utf8'),{checkpoint:closed.checkpoint,finalCheckpoint:state.finalCheckpoint});
  if(verified.metadata.cohortId!==state.cohortId||verified.metadata.generation!==state.generation||verified.metadata.systemIdentifier!==state.systemIdentifier)throw new Error('RECOVERY_JOURNAL_COHORT_MISMATCH');
  compareCohort(state.cohort,await captureCohort({central,tenantPool,tenantIds}));
  const samples=JSON.parse(await readFile('/run/qa-secrets/recovery-sessions.json','utf8'));
  assert.equal(samples.length,4);
  for(const sample of samples){const {rows:[row]}=await central.query('SELECT status,generation FROM saas.session_registry WHERE sid=$1',[sample.sid]);assert.equal(row?.status,'active');assert.equal(row.generation,sample.generation);}
  if((await captureNonrestrictiveState(central)).hash!==state.nonrestrictive.hash)throw new Error('BACKUP_NONRESTRICTIVE_MISMATCH');
  const replay=await replayRestrictive(verified,intent=>applyRestrictiveIntent({central,tenantPool,intent}));
  // Repeat proves operation IDs are durable and do not double-apply revocations.
  await replayRestrictive(verified,intent=>applyRestrictiveIntent({central,tenantPool,intent}));
  const {rows:[identity]}=await central.query('SELECT status,security_version FROM saas.identities WHERE id=$1',[fixture.identities[1].id]);assert.equal(identity.status,'revoked');
  await tenantPool(fixture.tenants[0].id,async db=>assert.equal((await db.query('SELECT count(*)::int AS n FROM catalog.products WHERE id=$1',[fixture.sharedProduct])).rows[0].n,0));
  await tenantPool(fixture.tenants[1].id,async db=>assert.equal((await db.query('SELECT count(*)::int AS n FROM catalog.products WHERE id=$1',[fixture.sharedProduct])).rows[0].n,1));
  const invalidation=await invalidateRestoredState(central,{oldGeneration:state.generation,newGeneration:plan.targetGeneration,cohortId:state.cohortId});
  const passwords=createRestoredCredentialCandidate();
  // Custody first: failures after ALTER ROLE, including an uncertain COMMIT, must
  // not strand the closed target with its only usable credentials in RAM.
  await saveJson('/run/qa-secrets/restore-credential-candidate.json',{version:1,cohortId:state.cohortId,generation:invalidation.generation,host:target.connection.host,passwords},{exclusive:true});
  const rotation=await rotateRestoredCredentials(central,passwords);
  await saveJson(`${root}/credential-rotation.json`,{...rotation,cohortId:state.cohortId,generation:invalidation.generation,barrier:true,candidateFile:'restore-credential-candidate.json'});
  state.phase='credentials_rotated';state.targetGeneration=invalidation.generation;state.credentialRotation=rotation;await saveJson(statePath,state);
  const restored={...qa,generation:invalidation.generation,clockOwner:invalidation.clockOwner,connections:{},entries:{},admin:{...target.connection,password:passwords.qa_bootstrap}};
  for(const [role,connection]of Object.entries(qa.connections))restored.connections[role]={...connection,host:target.connection.host,ssl:target.connection.ssl,password:passwords[role]};
  const {rows:directory}=await central.query('SELECT id,credential_version,data_epoch,status FROM saas.tenant_directory ORDER BY id');
  for(const [ref,entry]of Object.entries(qa.entries)){const current=directory.find(row=>row.id===entry.tenantId);restored.entries[ref]={...entry,credentialVersion:Number(current.credential_version),dataEpoch:Number(current.data_epoch),status:current.status,connection:restored.connections[entry.connection.user]};}
  // New role credentials work; copied credentials no longer authenticate.
  for(const role of ['saas_api','saas_tenant_a','saas_tenant_b']){
   const pool=await connected(restored.connections[role]);try{await pool.query('SELECT 1');}finally{await pool.end();}
   const old=await connected({...qa.connections[role],host:target.connection.host,ssl:target.connection.ssl});
   try{await assert.rejects(old.query('SELECT 1'),error=>error.code==='28P01');}finally{await old.end();}
  }
  const foreign=await connected({...restored.connections.saas_tenant_a,database:'mecanet_tenant_b'});try{await assert.rejects(foreign.query('SELECT 1'),error=>['28000','42501'].includes(error.code));}finally{await foreign.end();}
  const {rows:[sessions]}=await central.query("SELECT count(*)::int AS n FROM saas.session_registry WHERE status='active'");assert.equal(sessions.n,0);
  const {rows:[demo]}=await central.query("SELECT status FROM saas.identities WHERE purpose='demo'");assert.equal(demo.status,'revoked');
  const {rows:[fence]}=await central.query('SELECT barrier,generation,tick FROM saas.admission_fence WHERE id=1');assert.equal(fence.barrier,true);assert.equal(fence.generation,restored.generation);assert.equal(String(fence.tick),closed.tick);
  const api=await connected(restored.connections.saas_api);
  try{const authority=createAuthority(api,restored.generation);for(const sample of samples)await assert.rejects(authority.authorize({sid:sample.sid,purpose:sample.purpose}),{code:'SESSION_EXPIRED'});}finally{await api.end();}
  await saveJson('/run/qa-secrets/restore-connections.json',restored);
  await saveJson(`${root}/result.json`,{cohortId:state.cohortId,physicalCohortMatches:true,replay,canariesVerified:true,oldCredentialsDenied:true,crossDatabaseDenied:true,previousSessionsRevoked:true,previousSampleSessionsDenied:samples.length,demoTerminal:true,generationChanged:true,epochs:directory.map(({id,data_epoch,credential_version,status})=>({id,data_epoch,credential_version,status})),tickPreserved:true,barrier:true,applicationReopened:false});
  console.log(JSON.stringify({restoreVerified:true,postBackupCanaries:2,credentialRotation:true,barrier:true,applicationReopened:false,secretsPrinted:false}));
 }finally{await central.end();}
}
