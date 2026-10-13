import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePolicyTargets,promotionMode,validateBlockedTenantB,promotionResult} from './promote.mjs';
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
const blocked=()=>({rows:[{...row(B),reason_code:'TENANT',directory_status:'blocked',directory_purpose:'company',schema_version:2,directory_epoch:'2',central_exact:'{"tenant_id":"'+B+'","state":"CLOSED"}',directory_exact:'{"status":"blocked"}',restriction_exact:'{"reason_code":"TENANT"}',guard_exact:'{"stage":"ACKNOWLEDGED"}'}],local:{tenant_id:B,generation,data_epoch:'2',writer_version:'7',state:'CLOSED',fence_exact:'{"state":"CLOSED","version":7}'}});
test('blocked-B mode is explicit and unknown or repeated flags fail before configuration access',()=>{
 assert.equal(promotionMode([]),'default');assert.equal(promotionMode(['--blocked-b']),'blocked-b');
 for(const args of [['blocked-b'],['--other'],['--blocked-b','--blocked-b'],['--blocked-b','extra'],null])assert.throws(()=>promotionMode(args),error=>error.code==='PROMOTION_EXACT_MODE_REQUIRED');
});
test('blocked-B mode permits only one exact own POLICY A, never B, two tenants or duplicates',()=>{
 const rows=[row(A)];assert.equal(validatePolicyTargets(rows,generation,{mode:'blocked-b'}),rows);
 for(const targets of [[row(B)],[row(A),row(B)],[row(A),row(A)]])assert.throws(()=>validatePolicyTargets(targets,generation,{mode:'blocked-b'}));
 assert.throws(()=>validatePolicyTargets(rows,generation,{mode:'invented'}));
});
test('blocked B must have exact ACK TENANT closure with matching local guards and no debt',()=>{
 const value=blocked(),fingerprint=validateBlockedTenantB({...value,generation});assert.match(fingerprint,/^[a-f0-9]{64}$/);
 assert.equal(validateBlockedTenantB({...blocked(),generation}),fingerprint);
});
test('B directory, TENANT subject, closed guard, generation and debt failures are rejected',()=>{
 for(const patch of [{directory_status:'active'},{reason_code:'POLICY'},{active:false},{stage:'CLOSED'},{close_proven:false},{tenant_id:A},{identity_id:row(A).id},{central_state:'OPEN'},{reserved_bytes:'1'},{pending_intents:1},{retained_growth:1},{directory_epoch:'3'},{schema_version:1},{generation:row(A).id},{guard_generation:row(A).id},{closed_version:'8'},{central_exact:null}]){const value=blocked();Object.assign(value.rows[0],patch);assert.throws(()=>validateBlockedTenantB({...value,generation}))}
 for(const patch of [{tenant_id:A},{state:'OPEN'},{generation:row(A).id},{data_epoch:'3'},{writer_version:'8'},{fence_exact:null}]){const value=blocked();Object.assign(value.local,patch);assert.throws(()=>validateBlockedTenantB({...value,generation}))}
 for(const rows of [[],[...blocked().rows,...blocked().rows]])assert.throws(()=>validateBlockedTenantB({rows,local:blocked().local,generation}));
});
test('blocked-B promotion reports global false and requires unchanged exact B fingerprint',()=>{
 const digest=validateBlockedTenantB({...blocked(),generation}),result=promotionResult({mode:'blocked-b',ready:false,beforeB:digest,afterB:digest});
 assert.equal(result.status,'PASS FOR OWN A POLICY ONLY / GLOBAL READY FALSE');assert.equal(result.globalReady,false);assert.equal(result.blockedBPreserved,true);
 for(const patch of [{ready:true},{ready:null},{afterB:'f'.repeat(64)},{beforeB:undefined},{mode:'invented'}])assert.throws(()=>promotionResult({mode:'blocked-b',ready:false,beforeB:digest,afterB:digest,...patch}));
});
test('default promotion still requires global writer readiness true and never accepts blocked mode implicitly',()=>{
 assert.deepEqual(promotionResult({mode:'default',ready:true}),{status:'PASS',globalReady:true});
 assert.throws(()=>promotionResult({mode:'default',ready:false}));assert.throws(()=>promotionResult({ready:false}));
});
