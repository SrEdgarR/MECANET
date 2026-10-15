import test from 'node:test';import assert from 'node:assert/strict';
import {chooseMaterial,validateMaterial,deriveRuntimeConfig,chooseClockAddition,deriveWorkerRestartConfig,ROLES} from '../../../server/saas/recovery/custody.js';
import {sha256} from '../../../server/saas/recovery/protocol.js';
const binding={project:'mecanet-qa-p1l3-r03',artifactDigest:'a'.repeat(64)};
test('SC014 allows exactly r03; kept r01/r02 and any further or foreign cohort are refused',async()=>{
 for(const project of ['mecanet-qa-p1l3-r01','mecanet-qa-p1l3-r02','mecanet-qa-p1l3-r04','mecanet-qa-p1l3-r03-target','nexora'])await assert.rejects(chooseMaterial({...binding,project}),/CUSTODY_BINDING/);
 const m=await chooseMaterial(binding);for(const side of ['source','target'])for(const project of ['mecanet-qa-p1l3-r01','mecanet-qa-p1l3-r02','mecanet-qa-p1l3-r04','nexora']){const changed=structuredClone(m);changed[side].project=project+(side==='target'?'-target':'');assert.throws(()=>validateMaterial(changed),/CUSTODY_COHORT/);}
 for(const side of ['source','target']){const changed=structuredClone(m);changed[side].project=m[side==='source'?'target':'source'].project;assert.throws(()=>validateMaterial(changed),/CUSTODY_COHORT/);}
});
test('all identities, role material and fixed operation IDs are selected once; a separate recovery has distinct material',async()=>{
 const a=await chooseMaterial(binding),b=await chooseMaterial(binding);assert.equal(validateMaterial(a).schema,'recovery-custody-v1');assert.notEqual(a.recoveryId,b.recoveryId);
 assert.notEqual(a.source.generation,a.target.generation);assert.notEqual(a.target.seedClockOwner,a.target.workerClockOwner);assert.equal(Object.keys(a.source.rolePasswords).length,18);
 for(const role of [...ROLES,'qa_bootstrap']){assert.notEqual(a.source.rolePasswords[role],a.target.rolePasswords[role]);assert.match(a.target.roleVerifiers[role].verifier,/^SCRAM-SHA-256\$4096:/);}
 assert.equal(a.source.operationIds.products.length,4);assert.equal(a.source.operationIds.receipts.length,2);assert.equal(a.source.identityPasswordHash,a.target.identityPasswordHash);
 assert.deepEqual(a.target.epochs,{a:'3',b:'3'});
 assert.deepEqual(validateMaterial(structuredClone(a)),a);const broken=structuredClone(a);broken.target.workerClockOwner=broken.target.seedClockOwner;assert.throws(()=>validateMaterial(broken));
});
test('a real clock restart requires positive old-worker end and a distinct durable addition; master stays unchanged',async()=>{
 const m=await chooseMaterial(binding),c=m.target,h='a'.repeat(64);const before={owner:c.workerClockOwner,generation:c.generation,clockVersion:'5',tick:'3'};
 const proof={schema:'worker-end-v1',recoveryId:m.recoveryId,sourceResourceHash:h,processes:[{service:'worker',containerId:'b'.repeat(64),ownerId:before.owner,exitCode:0,finishedAt:'2026-10-14T01:00:00Z'}],sqlOwners:[before.owner],httpOperationIds:[]};
 const observed={resourceHash:h,containers:[{service:'worker',id:'b'.repeat(64),ownerId:before.owner,running:false,exitCode:0,finishedAt:proof.processes[0].finishedAt}],sqlOwnersPresent:[],httpPending:[]};
 const input={material:m,side:'target',binding:{runId:m.recoveryId,manifestHash:h,resourceHash:h},before,endProof:proof,observedEnd:observed};
 const original=JSON.stringify(m);const addition=chooseClockAddition(input);assert.notEqual(addition.nextOwner,before.owner);assert.equal(JSON.stringify(m),original);assert.throws(()=>chooseClockAddition({...input,observedEnd:{...observed,sqlOwnersPresent:[before.owner]}}));
 const old={generation:c.generation,clockOwner:before.owner,recovery:{runId:m.recoveryId,manifestHash:h,mode:'RECOVERY'},maintenanceEntries:{}};
 const next=deriveWorkerRestartConfig({previousConfig:old,addition,material:m,endProof:proof,observedEnd:observed});assert.equal(next.clockOwner,addition.nextOwner);assert.equal(next.clockTransfer.kind,'stopped-process');assert.equal(next.clockTransfer.expectedClockVersion,'5');assert.deepEqual(deriveWorkerRestartConfig({previousConfig:old,addition,material:m,endProof:proof,observedEnd:observed}),next);
 for(const patch of [{expectedClockVersion:'9223372036854775807'},{expectedTick:'-1'},{transferId:c.operationIds.clockTransfer},{nextOwner:m.source.workerClockOwner}]){const bad={...addition,...patch};delete bad.transferHash;bad.transferHash=sha256(bad);assert.throws(()=>deriveWorkerRestartConfig({previousConfig:old,addition:bad,material:m,endProof:proof,observedEnd:observed}));}
});
test('runtime config is segmented and pure; repeated derivation preserves owners, credentials and versions',async()=>{
 const a=await chooseMaterial(binding);const conn=Object.fromEntries(ROLES.map(role=>[role,{host:'postgres',user:role,database:role==='saas_writer_a'?'mecanet_tenant_a':'mecanet_control',password:a.source.rolePasswords[role],ssl:{ca:'private-test-ca',servername:'postgres',rejectUnauthorized:true}}]));
 const shape={generation:a.source.generation,connections:conn,entries:[],writerEntries:[],maintenanceEntries:[],writerMaintenance:conn.saas_writer_maintenance};
 const recovery={runId:a.source.normal.runId,manifestHash:'a'.repeat(64),mode:'NORMAL'};
 const transfer={kind:'recovery-initial',...recovery,generation:a.source.generation,previousOwner:a.source.seedClockOwner,nextOwner:a.source.workerClockOwner,transferId:a.source.operationIds.clockTransfer,transferHash:'b'.repeat(64),endProofHash:'c'.repeat(64),expectedClockVersion:'0',expectedTick:'0',confirmed:true,reference:'custodied-test'};
 const x=deriveRuntimeConfig(a,'source',shape,recovery,'private-test-ca',transfer);assert.deepEqual(x,deriveRuntimeConfig(a,'source',shape,recovery,'private-test-ca',transfer));assert.throws(()=>deriveRuntimeConfig(a,'source',shape,recovery,'private-test-ca'));
 for(const api of [x.api1,x.api2]){assert.equal(api.recovery.mode,'NORMAL');assert.equal(api.sessionSecret,a.source.sessionSecret);for(const k of ['rolePasswords','bootstrap','connections','maintenanceEntries','adminConnection','identityPassword'])assert.equal(k in api,false);}
 assert.notEqual(x.api1.ownerId,x.api2.ownerId);assert.equal(x.worker.clockOwner,a.source.workerClockOwner);assert.equal('sessionSecret' in x.worker,false);assert.throws(()=>deriveRuntimeConfig(a,'source',shape,{runId:a.recoveryId,manifestHash:'a'.repeat(64),mode:'NORMAL'},'private-test-ca'));
});
