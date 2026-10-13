import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHostEndProof} from './resource-closure.mjs';
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sourceSha='a'.repeat(40),owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const context={closureSourceSha:sourceSha,generation,instance:'api1',acceptedArtifacts:[{codeSha:sourceSha,digest:'a'.repeat(64)}]};
const proof={project:'mecanet-qa-p1l2-cp017',sourceSha,generation,instance:'api1',owner,containerId:'c'.repeat(64),running:false,exitCode:0,containerStoppedAt:new Date().toISOString(),httpClosed:true,writerApplicationName:`mecanet-writer:${owner}`,sqlOwnerAbsent:true,operations:[{tenantId:'11111111-1111-4111-8111-111111111111',operationId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',ticketId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}]};
test('host proof preserves exact own cohort, process, generation, source and operation/ticket association',()=>{
 assert.equal(validateHostEndProof(proof,context),proof);
 assert.equal(validateHostEndProof({...proof,instance:'api2'},{...context,instance:'api2'}).instance,'api2');
});

test('a newer closure harness validates the original stopped API against its accepted artifact history without relabelling it',()=>{
 const closureSourceSha='f'.repeat(40),acceptedArtifacts=[{codeSha:proof.sourceSha,digest:'a'.repeat(64)}];
 const result=validateHostEndProof(proof,{...context,closureSourceSha,acceptedArtifacts});
 assert.equal(result.sourceSha,proof.sourceSha);assert.notEqual(result.sourceSha,closureSourceSha);
});
test('absence, stale owner identity, arbitrary flags, live runner and malformed resource references never prove end',()=>{
 for(const patch of [{project:'another-project'},{generation:owner},{instance:'api2'},{running:true},{exitCode:'0'},{httpClosed:1},{sqlOwnerAbsent:'true'},{writerApplicationName:'mecanet-writer'},{containerId:'short'},{containerStoppedAt:new Date(Date.now()+60000).toISOString()},{operations:[]},{operations:[{...proof.operations[0],tenantId:generation}]},{operations:[proof.operations[0],proof.operations[0]]}])assert.throws(()=>validateHostEndProof({...proof,...patch},context),error=>error.code==='END_NOT_PROVEN');
 assert.throws(()=>validateHostEndProof(null,context),error=>error.code==='END_NOT_PROVEN');
});

test('unknown or ambiguous stopped source, missing history and malformed artifact digests cannot prove provenance',()=>{
 assert.throws(()=>validateHostEndProof({...proof,sourceSha:'b'.repeat(40)},context),error=>error.code==='STOPPED_ARTIFACT_NOT_PROVEN');
 for(const acceptedArtifacts of [undefined,[],[{codeSha:sourceSha,digest:'short'}],[context.acceptedArtifacts[0],context.acceptedArtifacts[0]]])assert.throws(()=>validateHostEndProof(proof,{...context,acceptedArtifacts}),error=>error.code==='STOPPED_ARTIFACT_NOT_PROVEN');
 assert.throws(()=>validateHostEndProof({...proof,sourceSha:'invalid'},context),error=>error.code==='END_NOT_PROVEN');
});
