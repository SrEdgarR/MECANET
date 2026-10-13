import test from 'node:test';import assert from 'node:assert/strict';
import {validateBoundaryProof,localByteBoundary,globalByteBoundary,BOUNDARY_PLAN} from './quota-boundary.mjs';
const qa={project:'mecanet-qa-p1l2-cp017',generation:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',systemIdentifier:'7511111111111111111',fixture:{identities:[{email:'a@qa.invalid'}]}},sourceSha='a'.repeat(40);
const proof={...qa,sourceSha,workerStopped:true,webStopped:true,apis:[1,2].map(n=>({instance:`api${n}`,state:'exited',containerId:String(n).repeat(64),owner:`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`,httpClosed:true,sqlOwnerAbsent:true,writerApplicationName:`mecanet-writer:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`}))};
test('boundary requires positive stopped process proof, exact cohort/source and never substitutes a timeout',()=>{
 assert.equal(validateBoundaryProof({qa,proof,sourceSha}),proof);
 for(const invalid of [{...proof,workerStopped:false},{...proof,webStopped:false},{...proof,sourceSha:'b'.repeat(40)}])assert.throws(()=>validateBoundaryProof({qa,proof:invalid,sourceSha}),/BOUNDARY_HOST_END_REQUIRED|PROMOTION_HOST_END_PROOF_REQUIRED/);
});
test('one local logical byte separates the real measured SQL delta from its atomic rejection point',()=>{
 assert.deepEqual(localByteBoundary('1000','21760'),{below:'22759',exact:'22760',used:'1000',delta:'21760'});
 assert.throws(()=>localByteBoundary('1000','0'),/BOUNDARY_DELTA_INVALID/);assert.throws(()=>localByteBoundary('9223372036854775807','1'),/BOUNDARY_DELTA_INVALID/);
});
test('global 16KiB reservation crosses the 16MiB guard by exactly one byte without refunding prior debt',()=>{
 assert.deepEqual(globalByteBoundary({used:'1000',reserved:'100',max:'16777216'}),{at:'16759832',over:'16759833',oldReserved:'100',max:'16777216',reservation:'16384'});
 assert.throws(()=>globalByteBoundary({used:'16777200',reserved:'0',max:'16777216'}),/BOUNDARY_GLOBAL_HEADROOM_REQUIRED/);
 assert.throws(()=>globalByteBoundary({used:'1000',reserved:'16759833',max:'16777216'}),/BOUNDARY_GLOBAL_HEADROOM_REQUIRED/);
});
test('preregistered boundary probes stay synthetic SQL-only, rollback-only and retain all persistent guards and limits',()=>{
 assert.equal(BOUNDARY_PLAN.outerRollbackRequired,true);assert.equal(BOUNDARY_PLAN.httpAcceptance,false);assert.equal(BOUNDARY_PLAN.businessPersistentMutations,0);assert.equal(BOUNDARY_PLAN.permissionChanges,0);assert.equal(BOUNDARY_PLAN.quotaPersistentIncreases,0);assert.equal(BOUNDARY_PLAN.newRoles,0);assert.equal(BOUNDARY_PLAN.maxControlReserve,'16384');assert.equal(BOUNDARY_PLAN.maxTenantDelta,'32768');
});
