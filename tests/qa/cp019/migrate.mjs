// Private, synthetic, exclusive QA migration runner. Never imported by app.js.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateConnection } from '../../../server/saas/db/pools.js';
import {validateRolePasswords,meteredPool} from './fixture.mjs';
const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const names = new Set(['saas_writer_maintenance','saas_writer_a','saas_writer_b','saas_maintainer_a','saas_maintainer_b','saas_owner','saas_owner_a','saas_owner_b','mecanet_control','mecanet_tenant_a','mecanet_tenant_b']);
const quote = name => { if (!names.has(name)) throw new Error('MIGRATION_IDENTIFIER_REJECTED'); return `"${name}"`; };
const roles = [
  { name:'saas_writer_maintenance',database:'mecanet_control',limit:1 },
  { name:'saas_writer_a',database:'mecanet_tenant_a',limit:4 }, { name:'saas_writer_b',database:'mecanet_tenant_b',limit:4 },
  { name:'saas_maintainer_a',database:'mecanet_tenant_a',limit:1 }, { name:'saas_maintainer_b',database:'mecanet_tenant_b',limit:1 },
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const CORRECTIVE_MIGRATIONS=Object.freeze([
 {database:'mecanet_tenant_a',owner:'saas_owner_a',scope:'tenant',version:4,file:'004-tenant-writers-fix.sql'},
 {database:'mecanet_tenant_b',owner:'saas_owner_b',scope:'tenant',version:4,file:'004-tenant-writers-fix.sql'},
 {database:'mecanet_control',owner:'saas_owner',scope:'central',version:5,file:'005-control-claim-ticket.sql'},
].map(Object.freeze));
async function connection(adminConnection,database,operation,onCommand) {
  const pool = await meteredPool({ ...adminConnection,database,max:1,connectionTimeoutMillis:2000,statement_timeout:2000,lock_timeout:500,application_name:'mecanet-cp019-private-writer-migration' },onCommand);
  try { return await operation(pool); } finally { await pool.end(); }
}
async function migrateDb(adminConnection,database,owner,scope,bytes,afterSql,sourceCommit,onCommand,version=3) {
  if(![3,4,5].includes(version))throw Error('MIGRATION_VERSION_REJECTED');
  return connection(adminConnection,database,async pool => {
    const client = await pool.connect();
    let statement='begin';
    try {
      await client.query('BEGIN');
      statement='migration-lock';
      await client.query('SELECT pg_advisory_xact_lock(56321,$1)',[version]);
      statement='owner-role';
      await client.query(`SET LOCAL ROLE ${quote(owner)}`);
      const namespace = scope==='central'?'saas':'catalog';
      statement='registry-create';
      await client.query(`CREATE TABLE IF NOT EXISTS ${namespace}.schema_migrations(version integer PRIMARY KEY,source_hash text NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'),source_commit text NOT NULL CHECK(source_commit ~ '^[0-9a-f]{40}$'),applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
      statement='registry-read';
      const existing = (await client.query(`SELECT source_hash,source_commit FROM ${namespace}.schema_migrations WHERE version=$1 FOR UPDATE`,[version])).rows[0];
      const digest = sha(bytes);
      if (existing) {
        if (existing.source_hash!==digest) throw new Error('MIGRATION_HASH_CONFLICT');
        await client.query('COMMIT'); return {database,scope,version,sourceHash:digest,registeredSourceCommit:existing.source_commit,reapplied:false};
      }
      statement='source-count-before';
      const before = (await client.query(scope==='central'
        ? 'SELECT count(*)::int AS n FROM saas.tenant_directory'
        : 'SELECT count(*)::int AS n FROM catalog.products')).rows[0].n;
      statement='source-migration';await client.query(bytes.toString('utf8'));
      // The SQL central migration RESET ROLE is deliberate; regain only the
      // named NOLOGIN owner, never a role supplied by an HTTP request.
      statement='owner-role-restore';await client.query(`SET LOCAL ROLE ${quote(owner)}`);
      let afterIndex=0;
      await afterSql({query:(...args)=>{statement=`after-sql-${++afterIndex}`;return client.query(...args)}});
      statement='source-count-after';
      const after = (await client.query(scope==='central'
        ? 'SELECT count(*)::int AS n FROM saas.tenant_directory'
        : 'SELECT count(*)::int AS n FROM catalog.products')).rows[0].n;
      if (before!==after) throw new Error('MIGRATION_SOURCE_COUNT_CHANGED');
      statement='registry-record';await client.query(`INSERT INTO ${namespace}.schema_migrations(version,source_hash,source_commit) VALUES($1,$2,$3)`,[version,digest,sourceCommit]);
      statement='commit';
      await client.query('COMMIT');return {database,scope,version,sourceHash:digest,registeredSourceCommit:sourceCommit,reapplied:true,beforeCount:before,afterCount:after};
    } catch(error) {
      const permission=/^(permission denied for|must be owner of) (table|schema|function|relation|database) ([a-z_][a-z0-9_.]*(?:\([a-z0-9_, ]*\))?)$/.exec(error.message??'');
      error.migrationDiagnostics={database,scope,statement,sourceHash:sha(bytes),
        ...(permission?{permissionFailure:`${permission[1]} ${permission[2]} ${permission[3]}`}:{})};
      if(/^\d{1,8}$/.test(error.internalPosition??''))error.migrationDiagnostics.internalPosition=error.internalPosition;
      await client.query('ROLLBACK').catch(()=>{});throw error;
    }
    finally { client.release(); }
  },onCommand);
}

/** Canonical L2 fixes are prerequisites of a new L3 source, not grandfathered
 * from CP017. Their separate stage has its own fixed budget and immutable SHA. */
export async function applyCorrectiveMigrations({adminConnection,fixture,generation,onCommand,checkpoint,sourceCommit}={}){
 const admin=validateConnection(adminConnection);
 if(admin.host!=='postgres'||admin.database!=='postgres'||admin.user!=='qa_bootstrap'||!id.test(generation??'')||!/^([0-9a-f]{40})$/.test(sourceCommit??'')||typeof onCommand!=='function'||!fixture?.tenants||fixture.tenants.filter(t=>t.purpose==='company').map(t=>t.dbName).join(',')!=='mecanet_tenant_a,mecanet_tenant_b')throw Error('CORRECTIVE_SOURCE_PREFLIGHT_REQUIRED');
 const manifest=[];
 for(const m of CORRECTIVE_MIGRATIONS){
  const bytes=await readFile(new URL('../../../server/saas/db/migrations/'+m.file,import.meta.url));
  await checkpoint?.({stage:`corrective-${m.version}-${m.database}`,sourceHash:sha(bytes)});
  manifest.push(await migrateDb(admin,m.database,m.owner,m.scope,bytes,async()=>{},sourceCommit,onCommand,m.version));
 }
 return manifest;
}

/** No URI or .env fallback. Connections/private checkpoint are never logged. */
export async function applyWriterMigration({adminConnection,fixture,generation,connections,entries,rolePasswords,onCommand,checkpoint,sourceCommit,failAfter=null}) {
  validateRolePasswords(rolePasswords);
  if(typeof onCommand!=='function')throw Error('QA_SHARED_BUDGET_REQUIRED');
  const admin=validateConnection(adminConnection);
  if(admin.user!=='qa_bootstrap'||admin.host!=='postgres'||admin.database!=='postgres'||!id.test(generation)
    ||!fixture?.tenants||!connections||!entries||!/^[0-9a-f]{40}$/.test(sourceCommit)||![null,'central','a','b'].includes(failAfter)) throw new Error('WRITER_MIGRATION_PREFLIGHT_REQUIRED');
  const tenants=fixture.tenants.filter(t=>t.purpose==='company');
  if(tenants.length!==2||tenants[0].dbName!=='mecanet_tenant_a'||tenants[1].dbName!=='mecanet_tenant_b') throw new Error('WRITER_SYNTHETIC_COHORT_REQUIRED');
  const manifest=[];
  await connection(admin,'postgres',async pool=>{
    const fact=(await pool.query("SELECT current_setting('server_version_num') AS version,current_setting('server_encoding') AS encoding,current_setting('client_encoding') AS client,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
    if(fact.version!=='180006'||fact.encoding!=='UTF8'||fact.client!=='UTF8'||fact.tls!==true)throw new Error('WRITER_CLUSTER_CONTRACT_MISMATCH');
    for(const role of roles){
      const current=(await pool.query('SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolconnlimit FROM pg_roles WHERE rolname=$1',[role.name])).rows[0];
      if(current){
        if(connections[role.name]?.password!==rolePasswords[role.name]||connections[role.name].database!==role.database||current.rolcanlogin!==true||current.rolsuper||current.rolbypassrls||current.rolcreatedb||current.rolcreaterole||current.rolinherit||current.rolreplication||current.rolconnlimit!==role.limit)throw new Error('WRITER_ROLE_PROVENANCE_MISMATCH');
      }else{
        const password=rolePasswords[role.name];
        const client=await pool.connect();
        try{
          await client.query('BEGIN');
          await client.query("SELECT set_config('qa.writer_role_password',$1,true)",[password]);
          await client.query(`DO $role$ BEGIN EXECUTE format('CREATE ROLE ${quote(role.name)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT ${role.limit} PASSWORD %L',current_setting('qa.writer_role_password')); END $role$`);
          await client.query(`GRANT CONNECT ON DATABASE ${quote(role.database)} TO ${quote(role.name)}`);
          await client.query('COMMIT');
          connections[role.name]={...admin,database:role.database,user:role.name,password};
          await checkpoint?.({connections,manifest,stage:`role:${role.name}`});
        }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
      }
    }
  },onCommand);
  const centralSql=await readFile(new URL('../../../server/saas/db/migrations/003-control-writers.sql',import.meta.url));
  const tenantSql=await readFile(new URL('../../../server/saas/db/migrations/003-tenant-writers.sql',import.meta.url));
  await checkpoint?.({connections,manifest,stage:'apply-central'});
  manifest.push(await migrateDb(admin,'mecanet_control','saas_owner','central',centralSql,async c=>{
    await c.query('GRANT USAGE ON SCHEMA saas TO saas_writer_maintenance');
    await c.query('GRANT SELECT,INSERT,UPDATE ON saas.tenant_writer_state,saas.write_control_quota,saas.write_intents,saas.write_growth_reservations,saas.write_projections,saas.write_transitions,saas.write_restrictions,saas.write_restriction_tenants TO saas_writer_maintenance');
    await c.query('GRANT SELECT ON saas.tenant_directory,saas.memberships,saas.action_grants,saas.role_policies,saas.session_registry,saas.admission_fence,saas.tickets,saas.time_authority TO saas_writer_maintenance');
    await c.query('GRANT SELECT(id,purpose,status,security_version,verified,mfa_verified) ON saas.identities TO saas_writer_maintenance');
    await c.query('GRANT UPDATE(status,security_version) ON saas.identities TO saas_writer_maintenance');
    await c.query('GRANT UPDATE(status,version) ON saas.memberships,saas.action_grants TO saas_writer_maintenance');
    await c.query('GRANT UPDATE(status) ON saas.session_registry TO saas_writer_maintenance');
    await c.query('GRANT UPDATE(status) ON saas.tenant_directory TO saas_writer_maintenance');
    await c.query('GRANT UPDATE(admission_version) ON saas.admission_fence TO saas_writer_maintenance');
    await c.query('GRANT EXECUTE ON FUNCTION saas.request_write_restriction(uuid,uuid,uuid,uuid,text,uuid,text),saas.project_write_result(uuid,uuid,uuid,text,text,bigint,bigint),saas.finish_write_resources(uuid,uuid,uuid,uuid,boolean,boolean),saas.settle_closed_write_resources(uuid,uuid,uuid),saas.write_transition(uuid,uuid,uuid,text,text,text),saas.write_operation_cost(uuid,uuid),saas.write_barrier_cost(),saas.writer_readiness(uuid),saas.revoke_session(text,uuid,uuid) TO saas_writer_maintenance');
    await c.query("INSERT INTO saas.identities(id,email,password_hash,purpose,status,security_version,verified,mfa_verified) SELECT v.id::uuid,v.email,i.password_hash,'company','active',1,true,false FROM saas.identities i CROSS JOIN (VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','member@qa.invalid'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','teammate@qa.invalid'))v(id,email) WHERE i.id=$1 ON CONFLICT(id) DO NOTHING",[tenants[0].identityId]);
    await c.query("INSERT INTO saas.memberships(identity_id,tenant_id,role,status,version) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',$1,'member','active',1),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',$1,'owner','active',1) ON CONFLICT(identity_id,tenant_id) DO NOTHING",[tenants[0].id]);
    await c.query("INSERT INTO saas.role_policies(role,action,version) VALUES('member','inventory.receive',1) ON CONFLICT(role,action) DO NOTHING");
    await c.query("INSERT INTO saas.action_grants(identity_id,tenant_id,action,status,version) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',$1,'inventory.receive','active',1) ON CONFLICT(identity_id,tenant_id,action) DO NOTHING",[tenants[0].id]);
    for(const action of ['catalog.create','inventory.read','inventory.receive','catalog.read'])await c.query("INSERT INTO saas.action_grants(identity_id,tenant_id,action,status,version) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',$1,$2,'active',1) ON CONFLICT(identity_id,tenant_id,action) DO NOTHING",[tenants[0].id,action]);
  },sourceCommit,onCommand));
  await checkpoint?.({connections,manifest,stage:'central'});
  if(failAfter==='central')throw new Error('QA_MIGRATION_FAULT_CENTRAL');
  for(let index=0;index<tenants.length;index++){
    const tenant=tenants[index],suffix=index===0?'a':'b';
    await checkpoint?.({connections,manifest,stage:`apply-${suffix}`});
    manifest.push(await migrateDb(admin,tenant.dbName,`saas_owner_${suffix}`,'tenant',tenantSql,async c=>{
      await c.query('INSERT INTO inventory.writer_fence VALUES(1,$1,$2,2,1,\'CLOSED\')',[tenant.id,generation]);
      await c.query('INSERT INTO inventory.quota_state VALUES(1,1,(SELECT count(*) FROM catalog.products WHERE status=\'active\'),0,300,536870912)');
      await c.query('UPDATE inventory.quota_state SET logical_bytes=inventory.logical_usage() WHERE id=1');
      await c.query(`GRANT USAGE ON SCHEMA inventory TO ${quote(`saas_writer_${suffix}`)},${quote(`saas_maintainer_${suffix}`)},${tenant.role}`);
      await c.query(`GRANT EXECUTE ON FUNCTION inventory.create_product(uuid,text,text,uuid,bigint,bigint),inventory.receive_stock(uuid,text,text,uuid,bigint,bigint),inventory.operation_result(uuid,uuid,text,bigint) TO ${quote(`saas_writer_${suffix}`)}`);
      await c.query(`GRANT SELECT ON inventory.writer_fence,inventory.quota_state,inventory.operations,inventory.movements,inventory.balances,inventory.audit,catalog.products TO ${quote(`saas_maintainer_${suffix}`)}`);
      await c.query(`GRANT EXECUTE ON FUNCTION inventory.close_writer_fence(uuid,bigint,bigint,bigint),inventory.observe_writer_fence(),inventory.open_writer_fence(uuid,bigint,bigint,bigint),inventory.set_writer_policy(bigint,bigint,bigint,bigint),inventory.operation_result(uuid,uuid,text,bigint),inventory.logical_usage() TO ${quote(`saas_maintainer_${suffix}`)}`);
      await c.query(`GRANT SELECT(product_id,on_hand,version) ON inventory.balances TO ${tenant.role}`);
      await c.query(`GRANT SELECT(id,product_id,operation_id,type,quantity,on_hand_after,balance_version,recorded_at) ON inventory.movements TO ${tenant.role}`);
      await c.query(`GRANT EXECUTE ON FUNCTION inventory.operation_result(uuid,uuid,text,bigint) TO ${tenant.role}`);
    },sourceCommit,onCommand));
    await checkpoint?.({connections,manifest,stage:suffix});
    if(failAfter===suffix)throw new Error(`QA_MIGRATION_FAULT_${suffix.toUpperCase()}`);
  }
  // Verify every database before publishing any writer descriptor/opening.
  const snapshots=[];
  for(const tenant of tenants) snapshots.push(await connection(admin,tenant.dbName,async pool=>{
    const state=(await pool.query('SELECT q.*,f.generation,f.data_epoch,f.writer_version,f.state,(SELECT count(*) FROM catalog.products) AS products,inventory.logical_usage() AS actual FROM inventory.quota_state q JOIN inventory.writer_fence f USING(id)')).rows[0];
    if(state.logical_bytes!==state.actual||state.active_products!==state.products||state.data_epoch!=='2'||state.generation!==generation)throw new Error('WRITER_MIGRATION_CONFORMITY_FAILED');
    const owner=(await pool.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='inventory' AND(p.prosecdef AND r.rolcanlogin OR p.prosecdef AND NOT p.proconfig @> ARRAY['search_path=pg_catalog, inventory'] AND NOT p.proconfig @> ARRAY['search_path=pg_catalog, inventory, catalog'])")).rows[0];
    if(owner.n!==0)throw new Error('WRITER_FUNCTION_OWNER_INVALID');return state;
  },onCommand));
  await connection(admin,'mecanet_control',async pool=>{
    const c=await pool.connect();
    try{
      await c.query('BEGIN');await c.query('UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1');
      for(let index=0;index<tenants.length;index++){
        const tenant=tenants[index],state=snapshots[index],suffix=index===0?'a':'b';
        await c.query("INSERT INTO saas.tenant_writer_state(tenant_id,generation,data_epoch,writer_version,state,policy_version,max_products,max_logical_bytes,used_products,used_bytes) VALUES($1,$2,2,$3,'CLOSED',1,300,536870912,$4,$5) ON CONFLICT(tenant_id) DO NOTHING",[tenant.id,generation,state.writer_version,state.active_products,state.logical_bytes]);
        await c.query('UPDATE saas.tenant_directory SET writer_secret_ref=$2,writer_credential_version=1,schema_version=2,data_epoch=2 WHERE id=$1 AND writer_secret_ref IS NULL',[tenant.id,`writer-${suffix}-v1`]);
        for(const action of ['catalog.create','inventory.receive','inventory.read']){
          await c.query('INSERT INTO saas.role_policies(role,action,version) VALUES(\'owner\',$1,1) ON CONFLICT(role,action) DO NOTHING',[action]);
          await c.query('INSERT INTO saas.action_grants(identity_id,tenant_id,action,status,version) VALUES($1,$2,$3,\'active\',1) ON CONFLICT(identity_id,tenant_id,action) DO NOTHING',[tenant.identityId,tenant.id,action]);
        }
      }
      await c.query('COMMIT');
    }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}finally{c.release();}
  },onCommand);
  // Fresh technical v1 only, before any API/worker/customer is started. The
  // controller performs B's real TENANT/coordinator closure before NORMAL/006;
  // no ACK or positive fin is manufactured by this migration.
  for(const tenant of tenants)await connection(admin,tenant.dbName,pool=>pool.query("UPDATE inventory.writer_fence SET state='OPEN' WHERE id=1 AND state='CLOSED' AND writer_version=1"),onCommand);
  await connection(admin,'mecanet_control',pool=>pool.query("UPDATE saas.tenant_writer_state SET state='OPEN' WHERE state='CLOSED' AND writer_version=1"),onCommand);
  const readerEntries={},writerEntries={},maintenanceEntries={};
  for(let index=0;index<tenants.length;index++){
    const tenant=tenants[index],suffix=index===0?'a':'b';
    const descriptor={tenantId:tenant.id,dbName:tenant.dbName,credentialVersion:'1',schemaVersion:2,dataEpoch:'2',status:'active',purpose:'company'};
    readerEntries[tenant.secretRef]={...entries[tenant.secretRef],...descriptor,credentialPurpose:'read'};
    writerEntries[`writer-${suffix}-v1`]={...descriptor,secretRef:`writer-${suffix}-v1`,credentialPurpose:'write',connection:connections[`saas_writer_${suffix}`]};
    maintenanceEntries[`maintenance-${suffix}-v1`]={...descriptor,secretRef:`maintenance-${suffix}-v1`,credentialPurpose:'maintenance',connection:connections[`saas_maintainer_${suffix}`]};
  }
  for(const [ref,entry]of Object.entries(entries))if(entry.purpose!=='company')readerEntries[ref]={...entry,credentialPurpose:'read',credentialVersion:String(entry.credentialVersion),dataEpoch:String(entry.dataEpoch)};
  for(const identity of [{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',email:'member@qa.invalid',purpose:'company'},{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',email:'teammate@qa.invalid',purpose:'company'}])if(!fixture.identities.some(item=>item.id===identity.id))fixture.identities.push(identity);
  await checkpoint?.({connections,manifest,stage:'conformity'});
  return {connections,entries:readerEntries,writerEntries,maintenanceEntries,writerMaintenance:connections.saas_writer_maintenance,manifest};
}
