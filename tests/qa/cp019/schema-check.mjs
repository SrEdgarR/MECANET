import {CASE_LIMITS} from './budget-limits.mjs';
// Real PostgreSQL fragment check before NORMAL bootstrap. No opening, fixture
// mutation, recovery proof, HTTP or time-authority takeover is performed here.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPgPool,validateConnection} from '../../../server/saas/db/pools.js';
import {sha256} from '../../../server/saas/recovery/protocol.js';
import {measuredPool} from './ledger.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readPrivateJson} from './prepare.mjs';
import {readSourceConfigPrivate,validateSourceArtifact} from './source-config.mjs';
import {readRuntimeOverlayAuthority} from './runtime-overlay-authority.mjs';
import {publishImmutable} from '../../../server/saas/recovery/protocol.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
export async function checkUnboundSchema({connection,binding,ledger}={}){
 const c=validateConnection(connection);
 if(c.host!=='postgres'||c.database!=='postgres'||c.user!=='qa_bootstrap'||!ledger?.charge||binding?.project!=='mecanet-qa-p1l3-r03'||!/^\d{10,24}$/.test(binding.systemIdentifier??'')||!/^[0-9a-f]{40}$/.test(binding.sourceSha??'')||!/^[0-9a-f]{64}$/.test(binding.manifestHash??''))throw Error('CP019_SCHEMA_CHECK_BINDING');
 const results=[];let queries=0;const started=performance.now();
 for(const [name,owner,tenant] of [['mecanet_control','saas_owner',null],['mecanet_tenant_a','saas_owner_a',A],['mecanet_tenant_b','saas_owner_b',B]]){
  const raw=await createPgPool({...c,database:name,max:1,connectionTimeoutMillis:2000,statement_timeout:2000,lock_timeout:500,application_name:'mecanet-cp019-unbound-schema-check'}),pool=measuredPool(raw,{charge:async kind=>{assert.ok(performance.now()-started<45000&&queries<CASE_LIMITS.sql);queries++;await ledger.charge(kind);assert.ok(performance.now()-started<45000)}});
  let client,began=false;
  try{
   client=await pool.connect();
   const facts=(await client.query("SELECT host(inet_server_addr()) AS server_address,system_identifier::text AS id,current_setting('server_version_num') AS version,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls FROM pg_control_system()" )).rows[0];assert.deepEqual(facts,{server_address:'10.77.64.2',id:binding.systemIdentifier,version:'180006',tls:true});
   const namespace=tenant?'catalog':'saas',sqlFile=tenant?'006-tenant-recovery.sql':'006-control-recovery.sql',migrationHash=sha256(await readFile(new URL('../../../server/saas/db/migrations/'+sqlFile,import.meta.url)));
   const registration=(await client.query(`SELECT source_hash,source_commit FROM ${namespace}.schema_migrations WHERE version=6`)).rows[0];assert.deepEqual(registration,{source_hash:migrationHash,source_commit:binding.sourceSha});
   const checked=(await client.query("SELECT count(*)::int AS n,count(*) FILTER (WHERE r.rolname<>$1::text OR r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR NOT coalesce(p.proconfig @> ARRAY[$2::text],false))::int AS bad FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname=$3::text AND p.proname LIKE '%recovery%'",[owner,'search_path=pg_catalog, '+(tenant?'inventory':'saas'),tenant?'inventory':'saas'])).rows[0];assert.ok(checked.n>=6);assert.equal(checked.bad,0);
   const publicFunctions=(await client.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname=$1::text AND p.proname LIKE '%recovery%' AND a.grantee=0 AND a.privilege_type='EXECUTE'",[tenant?'inventory':'saas'])).rows[0];assert.equal(publicFunctions.n,0);
   if(tenant){
    const local=(await client.query('SELECT g.tenant_id,g.mode,g.stage,g.version,q.logical_bytes,inventory.logical_usage() AS actual,pg_column_size(g)::text AS physical FROM inventory.recovery_guard g JOIN inventory.quota_state q USING(id)')).rows[0];assert.equal(local.tenant_id,tenant);assert.equal(local.mode,'UNBOUND');assert.equal(local.stage,'UNBOUND');assert.equal(local.version,'1');assert.equal(local.logical_bytes,local.actual);assert.ok(BigInt(local.logical_bytes)>=4352n);assert.ok(BigInt(local.physical)<=4096n);
   }else{
    assert.equal((await client.query('SELECT saas.recovery_runtime_guard($1::uuid,$2::uuid,$3::text) AS ready',[binding.generation,binding.runId,binding.manifestHash])).rows[0].ready,false);
   }
   await client.query('BEGIN');began=true;
   await client.query('SET LOCAL ROLE '+(tenant?'saas_writer_'+(tenant===A?'a':'b'):'saas_api'));
   await client.query('SAVEPOINT denial');let failure;
   try{await client.query(tenant?'SELECT * FROM inventory.prepare_recovery_open($1::uuid,$2::uuid,1)':'SELECT * FROM saas.activate_recovery($1::uuid,$2::uuid,1,$3::text)',tenant?[binding.runId,binding.controllerOwner]:[binding.runId,binding.controllerOwner,binding.manifestHash]);}catch(error){failure=error}
   await client.query('ROLLBACK TO SAVEPOINT denial');assert.equal(failure?.code,'42501');await client.query('ROLLBACK');began=false;
   results.push({database:name,status:'PASS',layer:'real-postgresql-unbound-fragments',registeredSourceSha:registration.source_commit,migrationHash,checkedFunctions:checked.n,publicExecute:0,deniedSqlstate:failure.code});
  }finally{if(began)await client?.query('ROLLBACK');client?.release();await pool.end();}
 }
 assert.ok(performance.now()-started<45000);
 return{status:'PASS',layer:'real-postgresql-unbound-fragments',queries,elapsedMs:Math.ceil(performance.now()-started),sourceSha:binding.sourceSha,results,recoveryTested:false,httpTested:false};
}
export async function main(){
 if(process.env.QA_PROJECT!=='mecanet-qa-p1l3-r03')throw Error('CP019_SCHEMA_CHECK_PROJECT');
 const {newLedger}=await import('./ledger.mjs');const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:'source-schema-probe'});
 const material=(await readPrivateJson('/run/qa-secrets/material.json')).value;
 const foundation=(await readPrivateJson('/run/qa-secrets/source-foundation.json')).value;
 const normal=(await readSourceConfigPrivate('/run/qa-secrets/source-normal-manifest.json')).value;
 const artifact=JSON.parse(await readFile('/workspace/artifact.json','utf8'));
 if(process.env.QA_CODE_SHA!==artifact.sourceSha||validateSourceArtifact(artifact,material,normal.migrationHashes,await readRuntimeOverlayAuthority())!==artifact.sourceSha||foundation.generation!==material.source.generation)throw Error('CP019_SCHEMA_CHECK_PROVENANCE');
 const report=await checkUnboundSchema({connection:{host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password:material.source.rolePasswords.qa_bootstrap,ssl:{ca:await readFile('/run/qa-ca.crt','utf8'),servername:'postgres',rejectUnauthorized:true}},binding:{project:material.source.project,systemIdentifier:foundation.systemIdentifier,sourceSha:artifact.sourceSha,manifestHash:sha256(normal),generation:material.source.generation,runId:normal.runId,controllerOwner:material.controllerOwner},ledger});
 await ledger.charge('artifactFiles');await publishImmutable('/run/qa-results/source-unbound-schema.json',report);
 console.log(JSON.stringify({type:'cp019-unbound-schema',status:report.status,queries:report.queries,recoveryTested:false,httpTested:false,secretsPrinted:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({type:'cp019-unbound-schema-failed',code:'CP019_SCHEMA_CHECK_FAILED',secretsPrinted:false}));process.exitCode=1});
