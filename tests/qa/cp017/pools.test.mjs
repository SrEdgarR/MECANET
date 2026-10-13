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
