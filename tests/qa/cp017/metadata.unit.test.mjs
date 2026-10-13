import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {METADATA_PLAN,worstCaseVectors,checkMeasuredBounds,checkConnectionSample} from './metadata-vectors.mjs';
test('preregistered worst-case uses allowed maximum text and fixed terminal/canonical forms',()=>{
 const v=worstCaseVectors();assert.equal(v.local.product.name.length,200);assert.equal(v.local.movement.reason.length,160);assert.equal(v.local.product.sku.length,64);assert.equal(v.central.intent.permission_versions.credential,'9223372036854775807');assert.equal(Object.keys(v.central.intent.permission_versions).length,6);assert.equal(v.central.reservation.scope_keys.length,4);assert.equal(v.central.transition.event_index,'12');assert.equal(METADATA_PLAN.quotaReset,false);assert.equal(METADATA_PLAN.negativeRollback,true);
});
test('five-row calculations include quota, twelve transitions and the actual row ceilings',()=>{
 const local=Object.fromEntries(['product','balance','movement','operation','audit','quota','fence'].map(k=>[k,'4352'])),central={intent:'2304',reservation:'2304',projection:'2304',transition:'768'},barrier={state:'1000',restriction:'1000',tenant:'1000',control:'1000'};
 assert.deepEqual(checkMeasuredBounds({local,central,barrier,resultBytes:512,preimageBytes:8192}),{createFiveRowsBytes:'21760',receiveFiveRowsBytes:'21760',centralThreeRowsPlusTwelveTransitionsBytes:'16128',tenantReservedBytes:'32768',centralReservedBytes:'16384',barrierNewRestrictionBytes:'2000',barrierGrowthReservedBytes:'4096'});
 assert.throws(()=>checkMeasuredBounds({local:{...local,quota:'4353'},central,barrier,resultBytes:512,preimageBytes:8192}),/METADATA_TENANT_ROW_BOUND_EXCEEDED/);
 assert.throws(()=>checkMeasuredBounds({local,central,barrier:{...barrier,tenant:'4096'},resultBytes:512,preimageBytes:8192}),/METADATA_BARRIER_RESERVATION_BOUND_EXCEEDED/);
});
test('connection observation needs two API owners and real read/write/worker samples within original limits',()=>{
 const expected={saas_api:10,saas_session:4,saas_issuer:2,saas_clock:1,saas_writer_maintenance:1,saas_writer_a:4,saas_writer_b:4,saas_tenant_a:4,saas_tenant_b:4,saas_demo:4,saas_maintainer_a:1,saas_maintainer_b:1},limits=Object.entries(expected).map(([rolname,rolconnlimit])=>({rolname,rolconnlimit}));
 const rows=[{usename:'saas_api',application_name:'mecanet-qa-api:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'},{usename:'saas_api',application_name:'mecanet-qa-api:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'},{usename:'saas_clock'},{usename:'saas_writer_maintenance'},{usename:'saas_writer_a'},{usename:'saas_tenant_a'}];
 assert.equal(checkConnectionSample({rows,limits,maxConnections:60}).apiOwners,2);
 assert.throws(()=>checkConnectionSample({rows:rows.filter(r=>r.usename!=='saas_writer_a'),limits,maxConnections:60}),/METADATA_TWO_API_WRITER_READER_WORKER_REQUIRED/);
 assert.throws(()=>checkConnectionSample({rows,limits:limits.map(r=>r.rolname==='saas_writer_a'?{...r,rolconnlimit:8}:r),maxConnections:60}),/METADATA_ROLE_CONNECTION_LIMIT_CHANGED/);
});
test('closed harness imports without a runtime action and binds stat for the trusted proof guard',async()=>{
 const module=await import('./metadata-live.mjs');assert.equal(typeof module.runMetadataAssay,'function');
 const source=await readFile(new URL('./metadata-live.mjs',import.meta.url),'utf8');assert.match(source,/import\s*\{[^}]*\bstat\b[^}]*\}\s*from 'node:fs\/promises'/);
});
test('the vector kind names match the registered real SQL logical-cost functions exactly',async()=>{
 const v=worstCaseVectors(),load=name=>readFile(new URL(`../../../server/saas/db/migrations/${name}`,import.meta.url),'utf8');
 const [local,central]=await Promise.all([load('003-tenant-writers.sql'),load('003-control-writers.sql')]);
 const localBody=/CREATE FUNCTION inventory\.logical_cost\([\s\S]*?END \$\$;/.exec(local)[0],centralBody=/CREATE FUNCTION saas\.write_logical_cost\([\s\S]*?END \$\$;/.exec(central)[0];
 const names=body=>[...body.matchAll(/WHEN '([a-z]+)' THEN/g)].map(m=>m[1]);
 assert.deepEqual(Object.keys(v.local),names(localBody));assert.deepEqual(Object.keys(v.central),names(centralBody));
});
