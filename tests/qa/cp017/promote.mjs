// Private verified correction promotion; it never changes a plan or grants.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPgPool,createTenantPoolManager,createSecretResolver} from '../../../server/saas/db/pools.js';
import {createRestrictiveCoordinator} from '../../../server/saas/writes/coordinator.js';
const project='mecanet-qa-p1l2-cp017',sourceSha=process.env.QA_CODE_SHA;
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
const coordinator=createRestrictiveCoordinator({controlPool:pool,maintenancePools,generation:qa.generation,resolveDescriptor:descriptor,
 verifyPromotion:async({restriction,guards,generation})=>{
  assert.equal(restriction.reason_code,'POLICY');assert.equal(generation,qa.generation);
  for(const guard of guards){
   assert.equal(guard.close_proven,true);assert.equal(guard.stage,'ACKNOWLEDGED');
   const central=(await pool.query('SELECT w.*,d.writer_secret_ref,d.writer_credential_version,d.schema_version,d.data_epoch AS directory_epoch FROM saas.tenant_writer_state w JOIN saas.tenant_directory d ON d.id=w.tenant_id WHERE w.tenant_id=$1',[guard.tenant_id])).rows[0];
   assert.equal(central.state,'CLOSED');assert.equal(central.generation,generation);assert.equal(central.data_epoch,String(descriptor(guard).dataEpoch));assert.equal(central.directory_epoch,central.data_epoch);assert.equal(central.schema_version,2);
   const writer=qa.writerEntries[central.writer_secret_ref];assert(writer);assert.equal(writer.credentialVersion,String(central.writer_credential_version));assert.equal(writer.dataEpoch,central.data_epoch);
   const debt=(await pool.query("SELECT count(*)::int AS n FROM saas.write_growth_reservations WHERE tenant_id=$1 AND status<>'SETTLED'",[guard.tenant_id])).rows[0];assert.equal(debt.n,0);
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
 const rows=(await pool.query("SELECT id FROM saas.write_restrictions WHERE reason_code='POLICY' AND status='ACKNOWLEDGED' AND active AND generation=$1 ORDER BY id",[qa.generation])).rows;assert.equal(rows.length,2);
 for(const {id}of rows){const result=await coordinator.resumeOperationalBarrier(id);assert.equal(result.resumed,true);report.barriers.push({id,status:'PASS'})}
 assert.equal((await pool.query('SELECT saas.writer_readiness($1) AS ready',[qa.generation])).rows[0].ready,true);report.status='PASS';
}catch(error){report.status='FAIL';report.errorCode=/^[A-Z0-9_]{1,60}$/.test(error.code??'')?error.code:'PROMOTION_NOT_PROVEN';process.exitCode=1}
finally{await maintenancePools.close();await pool.end();await writeFile('/run/qa-results/promotion.json',JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report))}
