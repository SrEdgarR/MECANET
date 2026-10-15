import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Static migration/security contract; these tests do not execute PostgreSQL.
const base=new URL('../../../',import.meta.url);
async function sources(){return Promise.all(['006-control-recovery.sql','006-tenant-recovery.sql'].map(name=>readFile(new URL(`server/saas/db/migrations/${name}`,base),'utf8')));}
const functions=sql=>[...sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION\s+([\w.]+)\([^]*?\bAS \$\$([^]*?)\$\$;/g)].map(m=>({name:m[1],text:m[0],body:m[2]}));
const body=(sql,name)=>{const row=functions(sql).find(f=>f.name===name);assert.ok(row,`missing ${name}`);return row.body;};

test('006 provides explicit NORMAL and recovery binding, never absence-as-normal',async()=>{
 const [control,tenant]=await sources();
 for(const name of ['saas.initialize_recovery_normal','saas.acknowledge_recovery_normal','saas.begin_recovery','saas.recovery_runtime_guard','saas.recovery_service_state'])body(control,name);
 assert.match(control,/ADD COLUMN recovery_id uuid/);assert.match(control,/mode IN\('NORMAL','RECOVERY'\)/);
 assert.match(body(control,'saas.recovery_runtime_guard'),/stage='COMPLETE'/);
 assert.match(tenant,/CREATE TABLE inventory.recovery_guard/);
});
test('private recovery functions have fixed search paths and no public EXECUTE or API DML',async()=>{
 const sourcesSql=await sources();
 for(const sql of sourcesSql){
  for(const fn of functions(sql))assert.match(fn.text,/SET search_path=pg_catalog(?:,saas|,inventory(?:,catalog)?)?\s+AS/);
  assert.doesNotMatch(sql,/GRANT[^;]*(?:INSERT|UPDATE|DELETE|ALL)[^;]*TO\s+saas_(?:api|writer_[ab])/i);
  assert.match(sql,/ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
  assert.doesNotMatch(sql,/GRANT[^;]*TO PUBLIC/i);
 }
 const control=sourcesSql[0];assert.match(control,/REVOKE INSERT,UPDATE,DELETE ON/);
 assert.match(control,/GRANT EXECUTE ON FUNCTION saas.recovery_runtime_guard\(uuid,uuid,text\),saas.recovery_service_state\(uuid,uuid,text\) TO saas_api,saas_writer_maintenance/);
});
test('historical business rows and operation guards remain immutable',async()=>{
 for(const sql of await sources()){
  assert.doesNotMatch(sql,/(?:UPDATE|DELETE FROM|TRUNCATE(?: TABLE)?)\s+(?:catalog\.products|inventory\.(?:operations|movements|balances|audit))\b/i);
  for(const update of sql.matchAll(/UPDATE saas\.write_intents SET ([^;]+)/g))assert.match(update[1],/^status='REJECTED',updated_at=clock_timestamp\(\) WHERE tenant_id=p_tenant AND operation_id=p_operation$/);
 }
 const [control]=await sources();assert.match(control,/CREATE TRIGGER immutable_recovery_binding/);
 assert.doesNotMatch(body(control,'saas.activate_recovery'),/UPDATE saas\.write_restriction_tenants/);
});
test('activation alone consumes only its mapped ACK individual RESTORE and opens central atomically',async()=>{
 const [control]=await sources();const activate=body(control,'saas.activate_recovery');
 assert.match(activate,/reason_code='RESTORE'/);assert.match(activate,/status='ACKNOWLEDGED'/);
 assert.match(activate,/restore_restriction_id/);assert.match(activate,/active=false/);
 assert.match(activate,/SET state='OPEN'/);assert.match(activate,/stage='COMPLETE',global_blocked=false/);assert.match(activate,/barrier=false/);
 assert.doesNotMatch(body(control,'saas.prepare_recovery_promotion'),/SET state='OPEN'/);
});
test('local protocols lock the writer fence before the singleton and preallocate overflow-safe abort',async()=>{
 const [,tenant]=await sources();
 for(const name of ['inventory.configure_recovery','inventory.verify_recovery','inventory.prepare_recovery_open','inventory.seal_recovery','inventory.abort_recovery']){
  const b=body(tenant,name);assert.ok(b.indexOf('inventory.writer_fence')<b.indexOf('inventory.recovery_guard'),name);
 }
 assert.match(tenant,/9223372036854775805/);assert.match(tenant,/abort_version[^;]*p_closed\+2/);
});
test('fixed quota reservation is charged once and growth guards retain terminal margin',async()=>{
 const [control,tenant]=await sources();assert.match(tenant,/logical_bytes=logical_bytes\+4352/);
 assert.match(body(tenant,'inventory.logical_usage'),/4352/);assert.match(control,/barrier_max_bytes-4096/);
 assert.doesNotMatch(control,/SET (?:used_bytes|reserved_bytes|reserved_products|used_products)=0/);
});
test('clock transfer and ordinary restriction operations are private and bounded',async()=>{
 const [control]=await sources();const clock=body(control,'saas.recovery_clock_guard');
 assert.match(clock,/transfer_id=p_transfer/);assert.match(clock,/clock_version=p_expected_version/);
 assert.match(body(control,'saas.restriction_step'),/reason_code NOT IN\('LOGOUT','IDENTITY','MEMBERSHIP','GRANT'\)/);
 assert.match(control,/GRANT EXECUTE ON FUNCTION saas.recovery_clock_guard\(uuid,uuid,text,uuid,uuid,uuid,text,bigint,bigint\) TO saas_clock/);
});
test('SQL probe import is passive and rejects foreign or unbound physical destinations',async()=>{
 const {validateSqlProbeBinding}=await import('./sql-probe.mjs');
 assert.throws(()=>validateSqlProbeBinding({project:'production'}),/CP019_SQL_PROBE_BINDING/);
 const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
 const binding={project:'mecanet-qa-p1l3-r03',phase:'source-closed',sourceSha:'a'.repeat(40),systemIdentifier:'1234567890123456789',generation:id(1),targetGeneration:id(2),runId:id(3),targetRunId:id(4),controllerOwner:id(5),restoreId:id(6),seedClockOwner:id(7),workerClockOwner:id(8),manifestHash:'a'.repeat(64),targetManifestHash:'b'.repeat(64),journalHash:'c'.repeat(64),custodyHash:'d'.repeat(64),sourceResourceHash:'e'.repeat(64),targetResourceHash:'f'.repeat(64),sourceEndProofHash:'1'.repeat(64),guardHash:'2'.repeat(64)};
 assert.equal(validateSqlProbeBinding(binding),binding);
 for(const mutate of [x=>x.phase='production',x=>x.project+='-target',x=>x.targetGeneration=x.generation,x=>x.targetResourceHash=x.sourceResourceHash,x=>x.targetRunId=x.runId,x=>x.sourceSha='not-sha',x=>x.sourceEndProofHash='']){
  const bad=structuredClone(binding);mutate(bad);assert.throws(()=>validateSqlProbeBinding(bad));
 }
});
