// Private verified correction promotion; it never changes a plan or grants.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPgPool,createTenantPoolManager,createSecretResolver} from '../../../server/saas/db/pools.js';
import {createRestrictiveCoordinator} from '../../../server/saas/writes/coordinator.js';
const project='mecanet-qa-p1l2-cp017';
const ownedTenants=new Set(['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const positiveDecimal=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
export function validatePolicyTargets(rows,generation){
 const fail=()=>{const error=Error('PROMOTION_EXACT_POLICY_TARGETS_REQUIRED');error.code=error.message;throw error};
 if(!uuid.test(generation??'')||!Array.isArray(rows)||rows.length<1||rows.length>2)fail();
 const restrictionIds=new Set(),tenantIds=new Set();
 for(const row of rows){
  if(!row||!uuid.test(row.id??'')||restrictionIds.has(row.id)||!ownedTenants.has(row.tenant_id)||tenantIds.has(row.tenant_id)||
   row.identity_id!==null||row.session_ref!==null||row.action!==null||row.reason_code!=='POLICY'||row.status!=='ACKNOWLEDGED'||row.active!==true||
   row.generation!==generation||row.guard_tenant_id!==row.tenant_id||row.guard_generation!==generation||row.central_generation!==generation||
   row.central_state!=='CLOSED'||row.stage!=='ACKNOWLEDGED'||row.close_proven!==true||
   ![row.guard_epoch,row.central_epoch,row.central_version,row.open_version,row.closed_version,row.reopen_version].every(positiveDecimal)||
   row.guard_epoch!==row.central_epoch||row.central_version!==row.closed_version||BigInt(row.closed_version)!==BigInt(row.open_version)+1n||BigInt(row.reopen_version)!==BigInt(row.closed_version)+1n||
   row.pending_intents!==0||row.retained_growth!==0||row.reserved_products!=='0'||row.reserved_bytes!=='0')fail();
  restrictionIds.add(row.id);tenantIds.add(row.tenant_id);
 }
 return rows;
}
async function main(){
const sourceSha=process.env.QA_CODE_SHA;
assert.equal(process.env.QA_PROJECT,project);assert.match(sourceSha??'',/^[a-f0-9]{40}$/);
const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
assert.equal(qa.project,project);
const proof=JSON.parse(await readFile('/run/qa-results/corrective-proof.json','utf8'));
assert.equal(proof.sourceSha,sourceSha);assert.equal(proof.generation,qa.generation);assert.equal(proof.systemIdentifier,qa.systemIdentifier);
assert.equal(proof.apis.length,2);assert(proof.apis.every(a=>a.state==='exited'));
const fixedHash=createHash('sha256').update(await readFile('server/saas/db/migrations/004-tenant-writers-fix.sql')).digest('hex');
async function inspectTenant(tenantId,fn){
 const suffix=tenantId==='11111111-1111-4111-8111-111111111111'?'a':tenantId==='22222222-2222-4222-8222-222222222222'?'b':null;assert(suffix);
 const [ca,password]=await Promise.all([readFile('/run/qa-ca.crt','utf8'),readFile('/run/qa-secrets/bootstrap','utf8')]);
 const observer=await createPgPool({host:'postgres',port:5432,database:`mecanet_tenant_${suffix}`,user:'qa_bootstrap',password,ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:2000,statement_timeout:2000,application_name:'mecanet-private-readonly-promotion'});
 let client;try{client=await observer.connect();await client.query('BEGIN READ ONLY');assert.equal((await client.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier,qa.systemIdentifier);await fn(client);await client.query('COMMIT')}
 catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});throw error}
 finally{client?.release();await observer.end()}
}
const pool=await createPgPool({...qa.writerMaintenance,max:1,statement_timeout:500,connectionTimeoutMillis:2000});
const maintenancePools=createTenantPoolManager({resolveSecret:createSecretResolver({entries:qa.maintenanceEntries,access:'maintenance'}),access:'write',allowedSchemaVersions:[2],maxPools:2,maxPerPool:1});
const descriptor=guard=>{const entry=Object.values(qa.maintenanceEntries).find(e=>e.tenantId===guard.tenant_id);assert(entry);return entry};
const report={sourceSha,project,startedAt:new Date().toISOString(),barriers:[],secretsPrinted:false};
let selectedTargets=[];
const coordinator=createRestrictiveCoordinator({controlPool:pool,maintenancePools,generation:qa.generation,resolveDescriptor:descriptor,
 verifyPromotion:async({restriction,guards,generation})=>{
  assert.equal(restriction.reason_code,'POLICY');assert.equal(generation,qa.generation);
  const selected=selectedTargets.find(target=>target.id===restriction.id);assert(selected);
  assert.equal(restriction.tenant_id,selected.tenant_id);assert.equal(restriction.generation,generation);assert.equal(restriction.active,true);
  assert.equal(restriction.identity_id,null);assert.equal(restriction.session_ref,null);assert.equal(restriction.action,null);
  assert.equal(guards.length,1);assert.equal(guards[0].tenant_id,selected.tenant_id);assert.equal(guards[0].generation,generation);
  assert.equal(guards[0].data_epoch,selected.guard_epoch);assert.equal(guards[0].closed_version,selected.closed_version);
  for(const guard of guards){
   assert.equal(guard.close_proven,true);assert.equal(guard.stage,'ACKNOWLEDGED');
   const central=(await pool.query('SELECT w.*,d.writer_secret_ref,d.writer_credential_version,d.schema_version,d.data_epoch AS directory_epoch FROM saas.tenant_writer_state w JOIN saas.tenant_directory d ON d.id=w.tenant_id WHERE w.tenant_id=$1',[guard.tenant_id])).rows[0];
   assert.equal(central.state,'CLOSED');assert.equal(central.generation,generation);assert.equal(central.data_epoch,String(descriptor(guard).dataEpoch));assert.equal(central.directory_epoch,central.data_epoch);assert.equal(central.schema_version,2);
   assert.equal(central.writer_version,guard.closed_version);assert.equal(central.reserved_products,'0');assert.equal(central.reserved_bytes,'0');
   const writer=qa.writerEntries[central.writer_secret_ref];assert(writer);assert.equal(writer.credentialVersion,String(central.writer_credential_version));assert.equal(writer.dataEpoch,central.data_epoch);
   const debt=(await pool.query("SELECT (SELECT count(*)::int FROM saas.write_growth_reservations WHERE tenant_id=$1 AND status<>'SETTLED') AS n,(SELECT count(*)::int FROM saas.write_intents WHERE tenant_id=$1 AND status IN('PENDING','EXECUTING','UNKNOWN')) AS pending",[guard.tenant_id])).rows[0];assert.equal(debt.n,0);assert.equal(debt.pending,0);
   await inspectTenant(guard.tenant_id,async client=>{
    const rows=(await client.query('SELECT source_hash FROM catalog.schema_migrations WHERE version=4')).rows;assert.equal(rows[0]?.source_hash,fixedHash);
    const local=(await client.query('SELECT f.*,q.logical_bytes,inventory.logical_usage() AS actual FROM inventory.writer_fence f JOIN inventory.quota_state q USING(id)')).rows[0];
    assert.equal(local.generation,generation);assert.equal(local.data_epoch,central.data_epoch);assert.equal(local.state,'CLOSED');assert.equal(local.writer_version,guard.closed_version);assert.equal(local.logical_bytes,local.actual);
   });
  }
  return {verified:true,tenants:guards.map(g=>({tenantId:g.tenant_id,generation,dataEpoch:g.data_epoch}))};
 }
});
try{
 const rows=(await pool.query(`SELECT r.*,g.tenant_id AS guard_tenant_id,g.generation AS guard_generation,g.data_epoch AS guard_epoch,
  g.open_version,g.closed_version,g.reopen_version,g.stage,g.close_proven,
  w.generation AS central_generation,w.data_epoch AS central_epoch,w.writer_version AS central_version,w.state AS central_state,w.reserved_products,w.reserved_bytes,
  (SELECT count(*)::int FROM saas.write_intents i WHERE i.tenant_id=r.tenant_id AND i.status IN('PENDING','EXECUTING','UNKNOWN')) AS pending_intents,
  (SELECT count(*)::int FROM saas.write_growth_reservations q WHERE q.tenant_id=r.tenant_id AND q.status<>'SETTLED') AS retained_growth
  FROM saas.write_restrictions r LEFT JOIN saas.write_restriction_tenants g ON g.restriction_id=r.id
  LEFT JOIN saas.tenant_writer_state w ON w.tenant_id=r.tenant_id
  WHERE r.reason_code='POLICY' AND r.status='ACKNOWLEDGED' AND r.active AND r.generation=$1 ORDER BY r.id,g.tenant_id`,[qa.generation])).rows;
 selectedTargets=validatePolicyTargets(rows,qa.generation);
 for(const {id}of rows){const result=await coordinator.resumeOperationalBarrier(id);assert.equal(result.resumed,true);report.barriers.push({id,status:'PASS'})}
 assert.equal((await pool.query('SELECT saas.writer_readiness($1) AS ready',[qa.generation])).rows[0].ready,true);report.status='PASS';
}catch(error){report.status='FAIL';report.errorCode=/^[A-Z0-9_]{1,60}$/.test(error.code??'')?error.code:'PROMOTION_NOT_PROVEN';process.exitCode=1}
finally{await maintenancePools.close();await pool.end();await writeFile('/run/qa-results/promotion.json',JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report))}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
