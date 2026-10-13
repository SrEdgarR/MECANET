import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createTenantPoolManager} from '../../../server/saas/db/pools.js';
import {readCatalog} from '../../../server/saas/repositories/catalog.js';
const descriptor={tenantId:'11111111-1111-4111-8111-111111111111',dbName:'mecanet_tenant_a',secretRef:'tenant-a-v1',credentialVersion:1,dataEpoch:1,schemaVersion:1,status:'active',purpose:'company'};
const connection={host:'postgres',port:5432,database:descriptor.dbName,user:'saas_tenant_a',password:'synthetic-only',ssl:{ca:'fixture-CA',rejectUnauthorized:true}};
test('expired pool wait retains a pending lease until the late real client is discarded',async()=>{
 let resolveConnect,discarded=false,called=false;
 const pools=createTenantPoolManager({resolveSecret:async()=>connection,createPool:async()=>({connect:()=>new Promise(resolve=>resolveConnect=resolve),end:async()=>{}})});
 const request=pools.withTenant(descriptor,()=>{called=true},{deadline:performance.now()+25});
 await assert.rejects(request,{code:'DB_DEADLINE'});
 assert.equal(pools.snapshot().leased,1);assert.equal(called,false);
 resolveConnect({release(value){discarded=value}});await delay(10);
 assert.equal(discarded,true);assert.equal(pools.snapshot().leased,0);await pools.close();
});
test('an expired query retains its lease until SQL returns and discards the client',async()=>{
 let releaseWork,discarded=false;
 const pools=createTenantPoolManager({resolveSecret:async()=>connection,createPool:async()=>({connect:async()=>({release(value){discarded=value}}),end:async()=>{}})});
 const request=pools.withTenant(descriptor,()=>new Promise(resolve=>releaseWork=resolve),{deadline:performance.now()+25});
 await assert.rejects(request,{code:'DB_DEADLINE'});assert.equal(pools.snapshot().leased,1);
 releaseWork([]);await delay(10);assert.equal(discarded,true);assert.equal(pools.snapshot().leased,0);await pools.close();
});
test('read-only SQL and all three server timeouts shrink to the actual remaining budget',async()=>{
 let time=100;const seen=[];
 const client={async query(input){seen.push(input);time+=10;return {rows:input.text.startsWith('SELECT id')?[{id:descriptor.tenantId,sku:'A',name:'fixture'}]:[]}}};
 const rows=await readCatalog(client,{cursor:null,limit:20},{deadline:180,now:()=>time});
 assert.equal(rows.length,1);assert.equal(seen[0].text,'BEGIN READ ONLY');
 assert.deepEqual(seen[1].values,['70ms','70ms']);assert.equal(seen[2].query_timeout,60);assert.equal(seen[3].text,'COMMIT');
 assert.deepEqual(seen[2].values,[null,20]);assert(seen.every(q=>q.query_timeout<=80));
});
test('exhausted read budget sends no SQL',async()=>{
 let called=false;await assert.rejects(readCatalog({query(){called=true}},{cursor:null,limit:20},{deadline:100,now:()=>100}),{code:'DB_DEADLINE'});assert.equal(called,false);
});
test('a late COMMIT cannot return a catalog after the read deadline even before timers run',async()=>{
 let time=0;
 const client={async query(input){if(input.text==='COMMIT')time=2000;return {rows:[{id:descriptor.tenantId}]}}};
 await assert.rejects(readCatalog(client,{cursor:null,limit:20},{deadline:8000,now:()=>time}),{code:'DB_DEADLINE'});
});
for(const phase of ['acquire','connect','operation'])for(const elapsed of [2000,2001])test(`${phase} cannot settle at or after its two-second limit before its overdue timer runs (${elapsed}ms)`,async()=>{
 let time=0,connected=false,called=false,discarded;
 const pools=createTenantPoolManager({
  monotonicNow:()=>time,
  resolveSecret:async()=>{if(phase==='acquire')time=elapsed;return connection},
  createPool:async()=>({connect:async()=>{connected=true;if(phase==='connect')time=elapsed;return {release(value){discarded=value}}},end:async()=>{}}),
 });
 try{
  await assert.rejects(pools.withTenant(descriptor,async()=>{called=true;if(phase==='operation')time=elapsed;return []},{deadline:8000}),{code:'DB_DEADLINE'});
  assert.equal(called,phase==='operation');assert.equal(connected,phase!=='acquire');
  assert.equal(discarded,phase==='acquire'?undefined:true);assert.equal(pools.snapshot().leased,0);
 }finally{await pools.close()}
});
test('pool acquisition and operation receive separate two-second windows inside the global deadline',async()=>{
 let time=0,discarded;
 const pools=createTenantPoolManager({monotonicNow:()=>time,resolveSecret:async()=>connection,createPool:async()=>({connect:async()=>{time=1800;return {release(value){discarded=value}}},end:async()=>{}})});
 try{assert.deepEqual(await pools.withTenant(descriptor,async()=>{time=3799;return ['bounded']},{deadline:8000}),['bounded']);assert.equal(discarded,false);assert.equal(pools.snapshot().leased,0)}finally{await pools.close()}
});
test('the global deadline truncates the operation window even if its phase timer has not run',async()=>{
 let time=0,discarded;
 const pools=createTenantPoolManager({monotonicNow:()=>time,resolveSecret:async()=>connection,createPool:async()=>({connect:async()=>{time=1000;return {release(value){discarded=value}}},end:async()=>{}})});
 try{await assert.rejects(pools.withTenant(descriptor,async()=>{time=2500;return []},{deadline:2500}),{code:'DB_DEADLINE'});assert.equal(discarded,true);assert.equal(pools.snapshot().leased,0)}finally{await pools.close()}
});
test('the default infinite deadline retains the existing pool-manager behavior',async()=>{
 let time=0,discarded;
 const pools=createTenantPoolManager({monotonicNow:()=>time,resolveSecret:async()=>{time=10000;return connection},createPool:async()=>({connect:async()=>{time=20000;return {release(value){discarded=value}}},end:async()=>{}})});
 try{assert.deepEqual(await pools.withTenant(descriptor,async()=>{time=30000;return ['compatible']}),['compatible']);assert.equal(discarded,false);assert.equal(pools.snapshot().leased,0)}finally{await pools.close()}
});
