import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenantPoolManager,createPoolBudget,createSecretResolver} from '../../../server/saas/db/pools.js';
const d={tenantId:'11111111-1111-4111-8111-111111111111',dbName:'mecanet_tenant_a',secretRef:'reader-a',credentialVersion:1,dataEpoch:2,schemaVersion:2,purpose:'company',status:'active'};
const config={host:'postgres',port:5432,database:d.dbName,user:'saas_reader_a',password:'synthetic',ssl:{ca:'synthetic',rejectUnauthorized:true}};
test('L2 read and write pools share the aggregate ceiling and keep distinct read-only credentials',async()=>{
 const created=[];const budget=createPoolBudget({maxPools:1,maxLeases:2});
 const factory=async c=>{created.push(c);return {end:async()=>{},connect:async()=>({release(){}})}};
 const reader=createTenantPoolManager({resolveSecret:async()=>config,createPool:factory,budget,allowedSchemaVersions:[1,2]});
 const writer=createTenantPoolManager({resolveSecret:async()=>({...config,user:'saas_writer_a'}),createPool:factory,budget,allowedSchemaVersions:[2],access:'write'});
 let release;const gate=new Promise(r=>{release=r});
 const pending=reader.withTenant(d,()=>gate);await new Promise(setImmediate);
 await assert.rejects(writer.withTenant({...d,secretRef:'writer-a'},async()=>{}),{code:'POOL_CAPACITY'});
 assert.equal(budget.snapshot().pools,1);assert.match(created[0].options,/default_transaction_read_only=on/);
 release();await pending;await reader.close();
 await writer.withTenant({...d,secretRef:'writer-a'},async()=>{});
 assert.match(created[1].options,/default_transaction_read_only=off/);
 await writer.close();assert.deepEqual(budget.snapshot(),{pools:0,leased:0,maxPools:1,maxLeases:2});
});
test('writer requires explicit schema2 and resolver purpose guard, never fallback to reader',async()=>{
 const resolver=createSecretResolver({entries:{'reader-a':{...d,credentialPurpose:'read',connection:config}},access:'write'});
 await assert.rejects(resolver(d),{code:'SECRET_MISMATCH'});
 const writer=createTenantPoolManager({access:'write',allowedSchemaVersions:[2],resolveSecret:async()=>config,createPool:async()=>{throw Error('MUST_NOT_OPEN')}});
 await assert.rejects(writer.withTenant({...d,schemaVersion:1},async()=>{}),{code:'TENANT_UNAVAILABLE'});
 await writer.close();
});
test('an idle reader cache at the aggregate ceiling yields its oldest slot to a writer and back',async()=>{
 const budget=createPoolBudget({maxPools:4,maxLeases:8}),ended=[];let tick=0;
 const factory=async c=>({end:async()=>ended.push([c.database,c.options.includes('read_only=off')?'write':'read']),connect:async()=>({release(){}})});
 const resolveSecret=async x=>({...config,database:x.dbName});
 const reader=createTenantPoolManager({resolveSecret,createPool:factory,budget,allowedSchemaVersions:[2],now:()=>++tick});
 const writer=createTenantPoolManager({resolveSecret,createPool:factory,budget,access:'write',allowedSchemaVersions:[2],now:()=>++tick});
 const descriptors=Array.from({length:4},(_,n)=>({...d,tenantId:`11111111-1111-4111-8111-11111111111${n}`,dbName:`mecanet_review_${n}`,schemaVersion:2}));
 try{
  for(const entry of descriptors)await reader.withTenant(entry,async()=>{});
  assert.deepEqual(budget.snapshot(),{pools:4,leased:0,maxPools:4,maxLeases:8});
  await writer.withTenant({...descriptors[0],secretRef:'writer-0'},async()=>{});
  assert.deepEqual(ended,[['mecanet_review_0','read']]);assert.equal(budget.snapshot().pools,4);assert.equal(reader.snapshot().pools,3);assert.equal(writer.snapshot().pools,1);
  await reader.withTenant(descriptors[0],async()=>{});assert.deepEqual(ended[1],['mecanet_review_1','read']);assert.equal(budget.snapshot().pools,4);
 }finally{await reader.close();await writer.close()}
 assert.equal(budget.snapshot().pools,0);
});
test('cross-manager idle eviction cannot end a lease whose timed-out SQL is still running',async()=>{
 const budget=createPoolBudget({maxPools:1,maxLeases:2});let settleSql,ended=0;
 const sql=new Promise(resolve=>{settleSql=resolve}),factory=async()=>({end:async()=>{ended++},connect:async()=>({release(){}})});
 const reader=createTenantPoolManager({resolveSecret:async()=>config,createPool:factory,budget,allowedSchemaVersions:[2]});
 const writer=createTenantPoolManager({resolveSecret:async()=>config,createPool:factory,budget,access:'write',allowedSchemaVersions:[2]});
 try{
  const pending=reader.withTenant({...d,schemaVersion:2},()=>sql,{deadline:performance.now()+30});
  await assert.rejects(pending,{code:'DB_DEADLINE'});assert.equal(budget.snapshot().leased,1);
  await assert.rejects(writer.withTenant({...d,schemaVersion:2,secretRef:'writer-0'},async()=>{}),{code:'POOL_CAPACITY'});assert.equal(ended,0);
  settleSql();await new Promise(setImmediate);assert.equal(budget.snapshot().leased,0);
  await writer.withTenant({...d,schemaVersion:2,secretRef:'writer-0'},async()=>{});assert.equal(ended,1);assert.equal(budget.snapshot().pools,1);
 }finally{settleSql();await reader.close();await writer.close()}
});
test('a completed writer cache also yields its slot to a reader without increasing the ceiling',async()=>{
 const budget=createPoolBudget({maxPools:1,maxLeases:2});let ends=0;
 const factory=async()=>({end:async()=>{ends++},connect:async()=>({release(){}})}),resolveSecret=async()=>config;
 const reader=createTenantPoolManager({resolveSecret,createPool:factory,budget,allowedSchemaVersions:[2]}),writer=createTenantPoolManager({resolveSecret,createPool:factory,budget,access:'write',allowedSchemaVersions:[2]});
 try{await writer.withTenant({...d,schemaVersion:2,secretRef:'writer-0'},async()=>{});await reader.withTenant({...d,schemaVersion:2},async()=>{});assert.equal(ends,1);assert.deepEqual(budget.snapshot(),{pools:1,leased:0,maxPools:1,maxLeases:2})}finally{await reader.close();await writer.close()}
});
test('a simultaneous owner close and cross-manager eviction retire an idle token only once',async()=>{
 const budget=createPoolBudget({maxPools:1,maxLeases:2});let ends=0;
 const factory=async()=>({end:async()=>{ends++;await new Promise(setImmediate)},connect:async()=>({release(){}})}),resolveSecret=async()=>config;
 const reader=createTenantPoolManager({resolveSecret,createPool:factory,budget,allowedSchemaVersions:[2]}),writer=createTenantPoolManager({resolveSecret,createPool:factory,budget,access:'write',allowedSchemaVersions:[2]});
 try{
  await reader.withTenant({...d,schemaVersion:2},async()=>{});
  await Promise.all([writer.withTenant({...d,schemaVersion:2,secretRef:'writer-0'},async()=>{}),reader.close()]);
  assert.equal(ends,1);assert.deepEqual(budget.snapshot(),{pools:1,leased:0,maxPools:1,maxLeases:2});
 }finally{await reader.close();await writer.close()}
 assert.equal(ends,2);assert.equal(budget.snapshot().pools,0);
});
