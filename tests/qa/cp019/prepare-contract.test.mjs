// Pure guards and transport doubles only; physical SQL/HTTP stays NOT VERIFIED.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateApiConfig} from './entry.mjs';
import {validateWorkerConfig} from './worker.mjs';
import {assertPrivateMetadata,validatePreparation,seedAdmissionSource} from './prepare.mjs';
import {seedAdmission} from '../admission-fixture.js';
import {validateHttpRequest,validateAcceptanceContext,ACCEPTANCE_SCENARIOS,enterAcceptanceCase} from './acceptance.mjs';
const gen='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',run='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const connection=(user,database='mecanet_control')=>({host:'postgres',port:5432,user,database,password:'synthetic-private-password',ssl:{ca:'synthetic-ca',servername:'postgres',rejectUnauthorized:true}});
const recovery={runId:run,manifestHash:'a'.repeat(64),mode:'NORMAL'};
const api=()=>({control:connection('saas_api'),sessions:connection('saas_session'),issuer:connection('saas_issuer'),entries:{},writerEntries:{},sessionSecret:'s'.repeat(64),generation:gen,ownerId:owner,recovery:{...recovery}});
const worker=()=>({connection:connection('saas_clock'),maintenanceConnection:connection('saas_writer_maintenance'),maintenanceEntries:{},generation:gen,clockOwner:owner,clockTransfer:{kind:'recovery-initial',nextOwner:owner,generation:gen,runId:run,manifestHash:recovery.manifestHash,mode:'NORMAL'},recovery:{...recovery}});
test('import is passive and API authority is closed: missing binding never means NORMAL',()=>{
 assert.equal(validateApiConfig(api(),'mecanet-qa-p1l3-r03').ownerId,owner);
 for(const mutate of [c=>c.bootstrap='private',c=>c.maintenanceEntries={},c=>delete c.ownerId,c=>delete c.recovery,c=>c.recovery.mode='unknown',c=>c.recovery.runId=gen,c=>c.control.user='qa_bootstrap',c=>c.sessions.ssl.rejectUnauthorized=false]){const c=api();mutate(c);assert.throws(()=>validateApiConfig(c,'mecanet-qa-p1l3-r03'))}
 assert.throws(()=>validateApiConfig(api(),'mecanet-qa-p1l2-cp017'));
 assert.throws(()=>validateApiConfig(api(),'mecanet-qa-p1l3-r03-target'));
});
test('worker has no login/session/master authority and needs an explicit stable clock owner',()=>{
 assert.equal(validateWorkerConfig(worker(),'mecanet-qa-p1l3-r03').clockOwner,owner);
 for(const mutate of [c=>c.sessionSecret='private',c=>c.writerEntries={},c=>delete c.clockOwner,c=>delete c.clockTransfer,c=>c.connection.user='saas_api',c=>c.recovery.mode='RECOVERY']){const c=worker();mutate(c);assert.throws(()=>validateWorkerConfig(c,'mecanet-qa-p1l3-r03'))}
});
test('schema3 company secrets bind tenant/database/purpose/run/hash without implicit cross-tenant authority',()=>{
 const c=api(),e={tenantId:'11111111-1111-4111-8111-111111111111',dbName:'mecanet_tenant_a',secretRef:'tenant-a-v1',credentialVersion:'1',dataEpoch:'2',schemaVersion:3,status:'active',purpose:'company',credentialPurpose:'read',recoveryRunId:run,recoveryManifestHash:recovery.manifestHash,connection:connection('saas_tenant_a','mecanet_tenant_a')};c.entries={'tenant-a-v1':e};validateApiConfig(c,'mecanet-qa-p1l3-r03');
 for(const patch of [{tenantId:'22222222-2222-4222-8222-222222222222'},{recoveryRunId:gen},{recoveryManifestHash:'b'.repeat(64)},{credentialPurpose:'write'},{dataEpoch:2},{schemaVersion:2},{connection:connection('saas_writer_a','mecanet_tenant_a')}]){const bad=structuredClone(c);Object.assign(bad.entries['tenant-a-v1'],patch);assert.throws(()=>validateApiConfig(bad,'mecanet-qa-p1l3-r03'))}
});
test('private JSON rejects symlinks, excessive bytes and loose Linux permissions',()=>{
 const ok={isFile:()=>true,isSymbolicLink:()=>false,size:1024,mode:0o100400};assertPrivateMetadata(ok);
 for(const patch of [{isFile:()=>false},{isSymbolicLink:()=>true},{size:262145},{mode:0o100444},{mode:0o100600}])assert.throws(()=>assertPrivateMetadata({...ok,...patch}),/QA_PRIVATE_FILE_REQUIRED/);
});
test('preparation rejects target/old QA and arbitrary stages before credentials or SQL',()=>{
 for(const value of [{project:'mecanet-qa-p1l3-r03-target',stage:'foundation'}, {project:'mecanet-qa-p1l2-cp017',stage:'foundation'}, {project:'mecanet-qa-p1l3-r03',stage:'reset'}])assert.throws(()=>validatePreparation(value),/CP019_FRESH_SOURCE_REQUIRED/);
 assert.deepEqual(validatePreparation({project:'mecanet-qa-p1l3-r03',stage:'foundation'}),{project:'mecanet-qa-p1l3-r03',stage:'foundation'});
});
test('physical transport never expands the fixed origin, paths, body ceiling or deadline',()=>{
 assert.equal(validateHttpRequest('/api/health/ready',{method:'GET'}),'/api/health/ready');
 for(const path of ['https://outside.invalid/api/auth/login','//outside.invalid','/api/../env','/api/tenants/unknown/products','/api/auth/login\r\nX:private','/admin'])assert.throws(()=>validateHttpRequest(path,{method:'GET'}));
 assert.throws(()=>validateHttpRequest('/api/auth/login',{method:'POST',body:{x:'x'.repeat(65537)}}));
 assert.throws(()=>validateHttpRequest('/api/health/ready',{method:'DELETE'}));
});
test('acceptance cannot claim a physical result from a verified flag or unrelated context',()=>{
 for(const c of [{verified:true},{project:'mecanet-qa-p1l2-cp017'}, {project:'mecanet-qa-p1l3-r03-target',generation:gen,recovery,sourceCommit:'a'.repeat(40),artifactDigest:'a'.repeat(64)}])assert.throws(()=>validateAcceptanceContext(c));
});
test('two bound seed statements preserve all sixteen policies/scopes and clock; explicit NORMAL initially closes the barrier',async()=>{
 const params={generation:gen,clockOwner:owner,tenantIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333']};
 const old=[],batched=[];await seedAdmission({query:async(sql,args)=>{old.push({sql,args})}},params);await seedAdmissionSource({query:async(sql,args)=>{batched.push({sql,args})}},params);
 assert.equal(old.length,34);assert.equal(batched.length,2);
 const expected=old.filter(x=>x.sql.startsWith('INSERT INTO saas.policies')).map(x=>({scope:x.args[0],limits:x.args[1]}));assert.deepEqual(JSON.parse(batched[0].args[0]),expected);assert.equal(expected.length,16);
 assert.deepEqual(old.filter(x=>x.sql.startsWith('INSERT INTO saas.admission_scopes')).map(x=>x.args[0]),expected.map(x=>x.scope));
 assert.deepEqual(batched[1].args,[gen,owner]);assert.deepEqual(old.at(-2).args,[gen]);assert.deepEqual(old.at(-1).args,[owner,gen]);assert.match(old.at(-2).sql,/0,0,false/);assert.match(batched[1].sql,/0,0,true/);
 await assert.rejects(seedAdmissionSource({query:async()=>{assert.fail('must fail before SQL')}},{...params,tenantIds:params.tenantIds.slice(0,2)}),/QA_SOURCE_ROSTER_REQUIRED/);
});
test('acceptance enters only fixed preplanned semantic cases and never invents retry aliases',async()=>{
 const calls=[],ledger={enter:async n=>calls.push(n)};await enterAcceptanceCase(ledger,'mecanet-qa-p1l3-r03','source-product-1');assert.deepEqual(calls,['source-product-1']);
 assert.equal(Object.keys(ACCEPTANCE_SCENARIOS).filter(n=>n.startsWith('source-product-')).length,4);assert.equal(Object.keys(ACCEPTANCE_SCENARIOS).filter(n=>n.startsWith('target-history-read-')).length,6);
 for(const[project,name]of [['mecanet-qa-p1l3-r03','source-product-5'],['mecanet-qa-p1l3-r03','source-product-1-retry'],['mecanet-qa-p1l3-r03','target-runtime-start'],['unknown','source-product-1'],['unknown','unknown']])await assert.rejects(enterAcceptanceCase(ledger,project,name),/QA_PREPLANNED_CASE_REQUIRED/);assert.equal(calls.length,1);
 await assert.rejects(enterAcceptanceCase({charge:async()=>{}},'mecanet-qa-p1l3-r03','source-product-1'),/QA_PREPLANNED_CASE_REQUIRED/);
});

test('SC014 binds preparation and consumers to r03 while older cohorts remain rejected before SQL',()=>{
 assert.equal(validatePreparation({project:'mecanet-qa-p1l3-r03',stage:'foundation'}).project,'mecanet-qa-p1l3-r03');
 assert.equal(validateApiConfig(api(),'mecanet-qa-p1l3-r03').ownerId,owner);assert.equal(validateWorkerConfig(worker(),'mecanet-qa-p1l3-r03').clockOwner,owner);
 for(const project of ['mecanet-qa-p1l3-r01','mecanet-qa-p1l3-r02','mecanet-qa-p1l3-r04']){assert.throws(()=>validatePreparation({project,stage:'foundation'}),/CP019_FRESH_SOURCE_REQUIRED/);assert.throws(()=>validateApiConfig(api(),project));assert.throws(()=>validateWorkerConfig(worker(),project));}
});
