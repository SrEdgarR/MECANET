import {CASE_LIMITS,GLOBAL_LIMITS} from './budget-limits.mjs';
// Programmatic, own synthetic source only. Root supplies custodied connections
// and observed end proof; no environment, private-file or credential fallback.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPgPool,validateConnection} from '../../../server/saas/db/pools.js';
import {sha256,verifyEndProof} from '../../../server/saas/recovery/protocol.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash=/^[0-9a-f]{64}$/;const requireValue=ok=>{if(!ok)throw Error('CP019_SQL_PROBE_BINDING');};
const controlTables=['recovery_runs','recovery_tenants','tenant_directory','tenant_writer_state','write_control_quota','write_intents','write_growth_reservations','write_projections','write_transitions','write_restrictions','write_restriction_tenants','memberships','role_policies','action_grants','session_registry','admission_fence','time_authority','policies','admission_scopes','windows','tickets','policy_audit','schema_migrations'];
const tenantTables=['catalog.products','catalog.schema_migrations','inventory.writer_fence','inventory.quota_state','inventory.recovery_guard','inventory.balances','inventory.operations','inventory.movements','inventory.audit'];
export function validateSqlProbeBinding(b){
 requireValue(b?.project==='mecanet-qa-p1l3-r03'&&b.phase==='source-closed'&&/^[0-9a-f]{40}$/.test(b.sourceSha??'')&&/^[0-9]{10,24}$/.test(b.systemIdentifier??''));
 for(const key of ['generation','targetGeneration','runId','targetRunId','controllerOwner','restoreId','seedClockOwner','workerClockOwner'])requireValue(uuid.test(b[key]??''));
 for(const key of ['manifestHash','targetManifestHash','journalHash','custodyHash','sourceResourceHash','targetResourceHash','sourceEndProofHash','guardHash'])requireValue(hash.test(b[key]??''));
 requireValue(b.generation!==b.targetGeneration&&b.runId!==b.targetRunId&&b.sourceResourceHash!==b.targetResourceHash&&b.seedClockOwner!==b.workerClockOwner);return b;
}
const snapshotSql=database=>{
 const tables=database==='mecanet_control'?controlTables.map(t=>'saas.'+t):tenantTables;
 const parts=tables.map(t=>`SELECT '${t}' AS kind,to_jsonb(r) AS value FROM ${t} r`);
 if(database==='mecanet_control')parts.push("SELECT 'saas.identities',jsonb_build_object('id',id,'purpose',purpose,'status',status,'security_version',security_version,'verified',verified,'mfa_verified',mfa_verified) FROM saas.identities");
 parts.push("SELECT 'functions',jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),'owner',r.rolname,'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',p.proacl,'sourceHash',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname IN('saas','session_store','catalog','inventory')");
 parts.push("SELECT 'table_acl',jsonb_build_object('schema',n.nspname,'name',c.relname,'acl',c.relacl,'owner',r.rolname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname IN('saas','session_store','catalog','inventory')");
 parts.push("SELECT 'column_acl',jsonb_build_object('schema',n.nspname,'table',c.relname,'column',a.attname,'acl',a.attacl) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('saas','session_store','catalog','inventory') AND a.attnum>0 AND NOT a.attisdropped");
 parts.push("SELECT 'roles',jsonb_build_object('name',rolname,'login',rolcanlogin,'super',rolsuper,'inherit',rolinherit,'createdb',rolcreatedb,'createrole',rolcreaterole,'replication',rolreplication,'bypassrls',rolbypassrls,'limit',rolconnlimit) FROM pg_roles WHERE rolname LIKE 'saas_%' OR rolname='qa_bootstrap'");
 parts.push("SELECT 'role_membership',jsonb_build_object('role',r.rolname,'member',m.rolname,'grantor',g.rolname,'admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option) FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor WHERE r.rolname LIKE 'saas_%' OR m.rolname LIKE 'saas_%'");
 return `SELECT count(*)::text AS rows,encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('kind',kind,'value',value) ORDER BY kind,value::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM (${parts.join(' UNION ALL ')}) valueset`;
};
// Same readonly server-side fingerprint used by the root's pre-copy capture.
// No query, role, quota or mutation semantics change with this export.
export {snapshotSql as sourceSnapshotSql};
/** SQL fragment proof only, not HTTP, host-copy, COMMIT-loss or legitimate
 * empty-roster readiness. All technical mutations roll back before PASS. */
export async function runSqlProbe({adminConnection,ledger,binding,sourceEndProof,observedEnd}={}){
 const b=validateSqlProbeBinding(binding),admin=validateConnection(adminConnection);
 requireValue(admin.host==='postgres'&&admin.database==='postgres'&&admin.user==='qa_bootstrap'&&ledger?.charge&&ledger?.snapshot);
 requireValue(verifyEndProof(sourceEndProof,observedEnd)===b.sourceEndProofHash&&sourceEndProof.recoveryId===b.targetRunId&&sourceEndProof.sourceResourceHash===b.sourceResourceHash);
 const budget=await ledger.snapshot();requireValue(['cp019-budget-v1','cp024-budget-continuation-v2'].includes(budget.schema)&&budget.project===b.project&&GLOBAL_LIMITS.sql-budget.total.sql>=120&&budget.plannedScenarios?.['sql-probe']?.sql===CASE_LIMITS.sql
 &&CASE_LIMITS.sql-(budget.scenarios?.['sql-probe']?.total.sql??0)>=120);
 const started=performance.now(),cases=[],fingerprints=[],centralHash=sha256(await readFile(new URL('../../../server/saas/db/migrations/006-control-recovery.sql',import.meta.url))),tenantHash=sha256(await readFile(new URL('../../../server/saas/db/migrations/006-tenant-recovery.sql',import.meta.url)));
 let commands=0,live=0,maximumLive=0;
 const command=async(client,text,values=[],cleanup=false)=>{requireValue(commands<CASE_LIMITS.sql&&(cleanup||performance.now()-started<40000));await ledger.charge('sql');commands++;return client.query({text,values,query_timeout:Math.min(2000,Math.max(1,45000-Math.floor(performance.now()-started)))});};
 const record=(name,extra={})=>cases.push({name,status:'PASS',layer:'real-postgresql-rollback',...extra});
 async function negative(client,name,text,values,code,message){
  await command(client,'SAVEPOINT cp019_negative');let caught;
  try{await command(client,text,values)}catch(error){caught=error}
  await command(client,'ROLLBACK TO SAVEPOINT cp019_negative',[],true);await command(client,'RELEASE SAVEPOINT cp019_negative',[],true);
  assert.equal(caught?.code,code,`SQLSTATE:${name}`);if(message)assert.equal(caught.message,message,`REJECTION:${name}`);record(name,{sqlstate:code});
 }
 async function database(name,fn){
  const pool=await createPgPool({...admin,database:name,max:1,connectionTimeoutMillis:2000,statement_timeout:2000,lock_timeout:500,application_name:'mecanet-cp019-sql-probe'});
  let client,opened=false,rolledBack=false,discard=false;
  try{
   client=await pool.connect();live++;maximumLive=Math.max(maximumLive,live);assert.ok(live<=1);
   const fact=(await command(client,"SELECT system_identifier::text AS id,host(inet_server_addr()) AS server_address,current_setting('server_version_num') AS version,current_setting('server_encoding') AS encoding,current_setting('client_encoding') AS client,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls FROM pg_control_system()" )).rows[0];
   assert.deepEqual(fact,{id:b.systemIdentifier,server_address:'10.77.64.2',version:'180006',encoding:'UTF8',client:'UTF8',tls:true});
   const before=(await command(client,snapshotSql(name))).rows[0];
   await command(client,'BEGIN');opened=true;await command(client,"SET LOCAL synchronous_commit='on'");
   await fn(client);
   await command(client,'ROLLBACK',[],true);rolledBack=true;opened=false;
   const after=(await command(client,snapshotSql(name),[],true)).rows[0];assert.deepEqual(after,before,`ROLLBACK_FINGERPRINT:${name}`);fingerprints.push({database:name,before:before.hash,after:after.hash,rows:before.rows,rollbackAcknowledged:true});
  }finally{
   if(opened&&!rolledBack){try{await command(client,'ROLLBACK',[],true);rolledBack=true}catch{discard=true}}
   if(client){client.release(discard?Error('CP019_SQL_END_UNCERTAIN'):undefined);live--;}
   await pool.end();
  }
 }
 async function assertOwners(c,schema,owner){
  const fact=(await command(c,"SELECT count(*)::int AS checked,count(*) FILTER(WHERE r.rolname<>$2::text OR r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR NOT coalesce(p.proconfig @> ARRAY[$3::text],false))::int AS bad FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname=$1::text AND p.proname LIKE '%recovery%'",[schema,owner,`search_path=pg_catalog, ${schema}`])).rows[0];
  assert.ok(fact.checked>=6);assert.equal(fact.bad,0);record(`${schema}-recovery-no-login-owner-and-fixed-path`);
 }
 await database('mecanet_control',async c=>{
  const f=(await command(c,'SELECT f.*,r.mode,r.stage,r.manifest_hash,r.target_generation FROM saas.admission_fence f JOIN saas.recovery_runs r ON r.id=f.recovery_id WHERE f.id=1')).rows[0];
  assert.equal(f.generation,b.generation);assert.equal(f.target_generation,b.generation);assert.equal(f.recovery_id,b.runId);assert.equal(f.mode,'NORMAL');assert.equal(f.stage,'COMPLETE');assert.equal(f.manifest_hash,b.manifestHash);assert.equal(f.barrier,true);
  await assertOwners(c,'saas','saas_owner');
  const closed=(await command(c,"SELECT tenant_id,generation,state,reserved_bytes,reserved_products,used_products FROM saas.tenant_writer_state ORDER BY tenant_id")).rows;
  assert.deepEqual(closed.map(w=>[w.tenant_id,w.generation,w.state,w.reserved_bytes,w.reserved_products]),[A,B].map(id=>[id,b.generation,'CLOSED','0','0']));
  assert.equal(closed[0].used_products,'4');
  assert.equal((await command(c,"SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename LIKE 'saas_%'")).rows[0].n,0);
  const schema=(await command(c,"SELECT array_agg(schema_version ORDER BY id) AS schemas FROM saas.tenant_directory WHERE purpose='company'")).rows[0];assert.deepEqual(schema.schemas,[3,3]);
  assert.equal((await command(c,'SELECT source_hash FROM saas.schema_migrations WHERE version=6')).rows[0]?.source_hash,centralHash);record('central-schema3-and-source-registry');
  await command(c,'SET LOCAL ROLE saas_api');
  await negative(c,'api-cannot-activate-recovery','SELECT * FROM saas.activate_recovery($1::uuid,$2::uuid,1,$3::text)',[b.targetRunId,b.controllerOwner,b.guardHash],'42501');
  await command(c,'SET LOCAL ROLE saas_writer_maintenance');
  await negative(c,'maintenance-no-free-writer-update',"UPDATE saas.tenant_writer_state SET state='CLOSED' WHERE tenant_id=$1::uuid",[A],'42501');
  await command(c,'SET LOCAL ROLE saas_owner');
  const intent=(await command(c,'SELECT operation_id FROM saas.write_intents WHERE tenant_id=$1::uuid ORDER BY operation_id LIMIT 1',[A])).rows[0];assert.ok(intent);
  await negative(c,'immutable-historical-intent-generation','UPDATE saas.write_intents SET generation=$3::uuid WHERE tenant_id=$1::uuid AND operation_id=$2::uuid',[A,intent.operation_id,b.targetGeneration],'P0001','WRITE_GUARDS_IMMUTABLE');
  const absent=(await command(c,'SELECT saas.recovery_runtime_guard($1::uuid,$2::uuid,$3::text) AS ready',[b.generation,b.targetRunId,b.targetManifestHash])).rows[0];assert.equal(absent.ready,false);record('missing-recovery-record-fails-closed',{legitimateEmptyRosterNotTested:true});
  await command(c,'SET LOCAL ROLE saas_writer_maintenance');
  const begin=[b.targetRunId,b.controllerOwner,b.generation,b.targetGeneration,b.targetManifestHash,b.journalHash,b.custodyHash,b.sourceResourceHash,b.targetResourceHash,b.sourceEndProofHash,[A,B],[b.restoreId],b.seedClockOwner,b.workerClockOwner];
  assert.equal((await command(c,'SELECT * FROM saas.begin_recovery($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::uuid[],$12::uuid[],$13::uuid,$14::uuid)',begin)).rows.length,1);
  const d=(await command(c,'SELECT d.credential_version,d.writer_credential_version,w.data_epoch,w.writer_version FROM saas.tenant_directory d JOIN saas.tenant_writer_state w ON w.tenant_id=d.id WHERE d.id=$1::uuid',[B])).rows[0];
  await negative(c,'restore-of-A-does-not-authorize-B','SELECT * FROM saas.enroll_recovery_tenant($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::bigint,$6::bigint,$7::text,$8::text,$9::bigint,$10::bigint,$11::text,$12::text,$13::uuid,$14::text)',[b.targetRunId,b.controllerOwner,B,d.data_epoch,d.writer_version,String(BigInt(d.data_epoch)+1n),'OPEN_ELIGIBLE','active',String(BigInt(d.credential_version)+1n),String(BigInt(d.writer_credential_version)+1n),'probe-b-reader-v2','probe-b-writer-v2',b.restoreId,b.guardHash],'P0001','RECOVERY_RESTORE_SCOPE_INVALID');
 });
 for(const [databaseName,tenant,suffix]of [['mecanet_tenant_a',A,'a'],['mecanet_tenant_b',B,'b']])await database(databaseName,async c=>{
  const f=(await command(c,'SELECT * FROM inventory.writer_fence WHERE id=1')).rows[0];assert.equal(f.tenant_id,tenant);assert.equal(f.generation,b.generation);assert.equal(f.state,'CLOSED');
  assert.equal((await command(c,'SELECT source_hash FROM catalog.schema_migrations WHERE version=6')).rows[0]?.source_hash,tenantHash);
  await assertOwners(c,'inventory',`saas_owner_${suffix}`);
  const quota=(await command(c,'SELECT logical_bytes,active_products,inventory.logical_usage() AS actual,(SELECT count(*)::text FROM inventory.movements) AS movements FROM inventory.quota_state WHERE id=1')).rows[0];assert.equal(quota.logical_bytes,quota.actual);if(suffix==='a'){assert.equal(quota.active_products,'4');assert.equal(quota.movements,'2')}record(`tenant-${suffix}-4352-counter-and-registry`);
  await command(c,`SET LOCAL ROLE saas_writer_${suffix}`);
  await negative(c,`writer-${suffix}-cannot-read-recovery-metadata`,'SELECT * FROM inventory.recovery_guard',[],'42501');
  await negative(c,`writer-${suffix}-cannot-create-table`,'CREATE TABLE inventory.cp019_probe_forbidden(id integer)',[],'42501');
  await negative(c,`writer-${suffix}-cannot-open-recovery-fence`,'SELECT * FROM inventory.prepare_recovery_open($1::uuid,$2::uuid,1)',[b.targetRunId,b.controllerOwner],'42501');
  assert.equal((await command(c,"SELECT has_database_privilege(current_user,$1::text,'CONNECT') AS permitted",[suffix==='a'?'mecanet_tenant_b':'mecanet_tenant_a'])).rows[0].permitted,false);record(`writer-${suffix}-no-foreign-connect-privilege`);
  await command(c,`SET LOCAL ROLE saas_maintainer_${suffix}`);
  const configure=[b.targetRunId,b.controllerOwner,b.targetManifestHash,tenant,b.generation,b.targetGeneration,f.data_epoch,String(BigInt(f.data_epoch)+1n),f.writer_version,suffix==='a'?'OPEN_ELIGIBLE':'RESTRICTED_CLOSED',suffix==='a'?'RESTORE':'TENANT',b.sourceResourceHash,b.targetResourceHash,b.guardHash];
  const text='SELECT * FROM inventory.configure_recovery($1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::bigint,$8::bigint,$9::bigint,$10::text,$11::text,$12::text,$13::text,$14::text)';
  const maxVersion=[...configure];maxVersion[8]='9223372036854775806';await negative(c,`tenant-${suffix}-max-version-stays-closed`,text,maxVersion,'P0001','RECOVERY_INPUT_INVALID');
  const maxEpoch=[...configure];maxEpoch[6]='9223372036854775807';maxEpoch[7]='9223372036854775807';await negative(c,`tenant-${suffix}-max-epoch-stays-closed`,text,maxEpoch,'P0001','RECOVERY_INPUT_INVALID');
  if(suffix==='b'){
   const configured=(await command(c,text,configure)).rows[0];assert.equal(configured.eligibility,'RESTRICTED_CLOSED');
   const verified=(await command(c,'SELECT * FROM inventory.verify_recovery($1::uuid,$2::uuid,$3::bigint,$4::text)',[b.targetRunId,b.controllerOwner,configured.version,b.guardHash])).rows[0];
   await negative(c,'noneligible-B-cannot-open-after-real-verify','SELECT * FROM inventory.prepare_recovery_open($1::uuid,$2::uuid,$3::bigint)',[b.targetRunId,b.controllerOwner,verified.version],'P0001','RECOVERY_FENCE_CONFLICT');
  }
 });
 assert.equal(live,0);assert.ok(commands<=CASE_LIMITS.sql&&maximumLive<=1&&performance.now()-started<=45000);
 return{status:'PASS',kind:'sql-real-rollback-fragments',sourceSha:b.sourceSha,project:b.project,generation:b.generation,phase:b.phase,elapsedMs:Math.ceil(performance.now()-started),sqlCommands:commands,maxLeases:maximumLive,cases,fingerprints,httpNotTested:true,copyAndRecoveryNotTested:true};
}
