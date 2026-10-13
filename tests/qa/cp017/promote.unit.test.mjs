import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePolicyTargets} from './promote.mjs';
const generation='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const row=tenant=>({id:tenant===A?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',tenant_id:tenant,
 identity_id:null,session_ref:null,action:null,reason_code:'POLICY',status:'ACKNOWLEDGED',active:true,generation,
 guard_tenant_id:tenant,guard_generation:generation,guard_epoch:'2',open_version:'6',closed_version:'7',reopen_version:'8',stage:'ACKNOWLEDGED',close_proven:true,
 central_generation:generation,central_epoch:'2',central_version:'7',central_state:'CLOSED',reserved_products:'0',reserved_bytes:'0',pending_intents:0,retained_growth:0});
const validate=rows=>validatePolicyTargets(rows,generation);
const reject=rows=>assert.throws(()=>validate(rows),/PROMOTION_EXACT_POLICY_TARGETS_REQUIRED/);

test('one pending POLICY B is sufficient after A was independently promoted by ROTATION',()=>{
 const rows=[row(B)];assert.equal(validate(rows),rows);
});
test('two exact owned CLOSED POLICY targets retain the original allowed preparation',()=>{
 const rows=[row(A),row(B)];assert.equal(validate(rows),rows);
});
test('zero, more than two and unstructured targets are never accepted',()=>{
 for(const rows of [[],[row(A),row(B),row(A)],null,{},[null]])reject(rows);
});
test('different tenants and duplicate restrictions or tenants fail closed',()=>{
 reject([{...row(A),tenant_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}]);
 reject([row(A),{...row(B),id:row(A).id}]);reject([row(A),{...row(A),id:row(B).id}]);
 reject([{...row(A),id:'not-a-restriction-id'}]);
});
test('only tenant-scoped active ACK POLICY restrictions can be prepared',()=>{
 for(const patch of [{reason_code:'GRANT'},{status:'PENDING'},{active:false},{identity_id:row(A).id},{session_ref:row(A).id},{action:'inventory.receive'}])reject([{...row(A),...patch}]);
});
test('central and guard require exactly the owned generation, CLOSED and ACK proof',()=>{
 for(const patch of [{generation:row(A).id},{guard_generation:row(A).id},{central_generation:row(A).id},{guard_tenant_id:B},{central_state:'OPEN'},{stage:'CLOSED'},{close_proven:false}])reject([{...row(A),...patch}]);
});
test('epoch and monotonic fence versions must match without adopting a newer guard',()=>{
 for(const patch of [{guard_epoch:'3'},{central_epoch:'0'},{central_version:'8'},{closed_version:'8'},{reopen_version:'9'},{open_version:'06'},{open_version:'9223372036854775808'}])reject([{...row(A),...patch}]);
});
test('pending operations, unsettled growth or any reserved capacity forbid this corrective adapter',()=>{
 for(const patch of [{pending_intents:1},{retained_growth:1},{reserved_products:'1'},{reserved_bytes:'32768'},{pending_intents:null},{retained_growth:'0'},{reserved_bytes:null}])reject([{...row(A),...patch}]);
});
