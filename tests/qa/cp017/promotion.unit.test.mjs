import test from 'node:test';
import assert from 'node:assert/strict';
import {planClosedPromotion,validatePromotionHostProof,assertPromotionSnapshot,assertPartialClosedCandidate,assertReopenProgress} from './promotion.mjs';
const generation='dddddddd-dddd-4ddd-8ddd-dddddddddddd',tenantId='11111111-1111-4111-8111-111111111111',sourceSha='a'.repeat(40);
const before={tenant_id:tenantId,generation,data_epoch:'2',writer_version:'7',state:'CLOSED',schema_version:2,directory_epoch:'2',directory_status:'active',writer_secret_ref:'writer-a-v1',writer_credential_version:'1',policy_version:'1',max_products:'300',max_logical_bytes:'536870912',used_products:'4',reserved_products:'0',used_bytes:'5000',reserved_bytes:'0'};
const guard={restriction_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',tenant_id:tenantId,generation,data_epoch:'2',open_version:'6',closed_version:'7',reopen_version:'8',close_proven:true,stage:'ACKNOWLEDGED'};
const qa={project:'mecanet-qa-p1l2-cp017',generation,systemIdentifier:'7511111111111111111',fixture:{identities:[{email:'a@qa.invalid'}]}};
const proof={...qa,sourceSha,apis:[1,2].map(n=>({instance:`api${n}`,state:'exited',containerId:String(n).repeat(64),owner:`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`,httpClosed:true,sqlOwnerAbsent:true,writerApplicationName:`mecanet-writer:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`}))};
test('rotation changes only writer credential metadata with exact v+1 then v+2',()=>{
 const target=planClosedPromotion({kind:'ROTATION',before,guard,generation});
 assert.equal(target.data_epoch,'2');assert.equal(target.writer_secret_ref,'writer-a-v2');assert.equal(target.writer_credential_version,'2');assert.equal(target.writer_version,'7');assert.equal(target.reopen_version,'8');assert.equal(target.policy_version,'1');
});
test('epoch advances once and leaves the credential/policy and counters intact',()=>{
 const target=planClosedPromotion({kind:'EPOCH',before,guard,generation});
 assert.equal(target.data_epoch,'3');assert.equal(target.writer_secret_ref,'writer-a-v1');assert.equal(target.writer_credential_version,'1');assert.equal(target.reserved_bytes,'0');
});
test('rotation/epoch cannot proceed under resource debt or a different target generation',()=>{
 for(const kind of ['ROTATION','EPOCH'])assert.throws(()=>planClosedPromotion({kind,before:{...before,reserved_bytes:'32768'},guard,generation}),/PROMOTION_DEBT_MUST_BE_ZERO/);
 assert.throws(()=>planClosedPromotion({kind:'EPOCH',before,guard,generation:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}),/PROMOTION_EXACT_CLOSED_GUARDS_REQUIRED/);
});
test('policy may reduce below retained debt without releasing it or increasing a limit',()=>{
 const debt={...before,reserved_bytes:'32768'};
 const target=planClosedPromotion({kind:'POLICY',before:debt,guard,generation,policyTarget:{policyVersion:'2',maxProducts:'300',maxLogicalBytes:'37767'}});
 assert.equal(target.reserved_bytes,'32768');assert.equal(target.max_logical_bytes,'37767');assert.equal(target.data_epoch,'2');
 assert.throws(()=>planClosedPromotion({kind:'POLICY',before,guard,generation,policyTarget:{policyVersion:'2',maxProducts:'301',maxLogicalBytes:'536870912'}}),/PROMOTION_POLICY_INCREASE_FORBIDDEN/);
});
test('closure requires acknowledged exclusive proof and exact monotonic captured versions',()=>{
 for(const invalid of [{...guard,close_proven:false},{...guard,reopen_version:'9'},{...guard,stage:'PENDING'},{...guard,generation:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}])assert.throws(()=>planClosedPromotion({kind:'ROTATION',before,guard:invalid,generation}),/PROMOTION_EXACT_CLOSED_GUARDS_REQUIRED/);
});
test('host proof requires both stopped HTTP owners and cannot use a timeout as end proof',()=>{
 assert.equal(validatePromotionHostProof({proof,qa,sourceSha}),proof);
 for(const invalid of [{...proof,apis:proof.apis.slice(0,1)},{...proof,apis:[{...proof.apis[0],httpClosed:false},proof.apis[1]]},{...proof,apis:[{...proof.apis[0],state:'running'},proof.apis[1]]},{...proof,generation:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},{...proof,sourceSha:'b'.repeat(40)}])assert.throws(()=>validatePromotionHostProof({proof:invalid,qa,sourceSha}),/PROMOTION_HOST_END_PROOF_REQUIRED/);
});
test('metadata verification never adopts changed contents, reservations or quota counters',()=>{
 const target=planClosedPromotion({kind:'EPOCH',before,guard,generation});
 const preserved={dataDigest:'1'.repeat(64),intentDigest:'2'.repeat(64),growthDigest:'3'.repeat(64),windowsDigest:'4'.repeat(64),quota:{logical_bytes:'5000',active_products:'4',policy_version:'1',max_products:'300',max_logical_bytes:'536870912'}};
 const candidate={kind:'EPOCH',before,target,guard,preserved};
 const actual={central:{...target,directory_epoch:'3'},local:{generation,data_epoch:'3',writer_version:'7',state:'CLOSED'},...preserved};
 assert.equal(assertPromotionSnapshot({candidate,actual,phase:'CLOSED'}),true);
 for(const invalid of [{...actual,intentDigest:'5'.repeat(64)},{...actual,central:{...actual.central,reserved_bytes:'0',used_bytes:'0'}},{...actual,quota:{...actual.quota,logical_bytes:'0'}}])assert.throws(()=>assertPromotionSnapshot({candidate,actual:invalid,phase:'CLOSED'}),/PROMOTION_PRESERVATION_NOT_PROVEN/);
 const open={...actual,central:{...actual.central,state:'OPEN',writer_version:'8'},local:{...actual.local,state:'OPEN',writer_version:'8'}};
 assert.equal(assertPromotionSnapshot({candidate,actual:open,phase:'OPEN'}),true);
 assert.throws(()=>assertPromotionSnapshot({candidate,actual:{...open,local:{...open.local,writer_version:'9'}},phase:'OPEN'}),/PROMOTION_METADATA_NOT_PROVEN/);
});
test('closed retry accepts only the preregistered partial epoch pair and unchanged data',()=>{
 const target=planClosedPromotion({kind:'EPOCH',before,guard,generation}),preserved={dataDigest:'1'.repeat(64),intentDigest:'2'.repeat(64),growthDigest:'3'.repeat(64),windowsDigest:'4'.repeat(64),quota:{logical_bytes:'5000',active_products:'4',policy_version:'1',max_products:'300',max_logical_bytes:'536870912'}};
 const candidate={kind:'EPOCH',restrictionId:guard.restriction_id,before,target,guard,preserved};
 const actual={central:before,local:{generation,data_epoch:'3',writer_version:'7',state:'CLOSED'},guard:{...guard,reason_code:'EPOCH',restriction_status:'ACKNOWLEDGED',active:true},debt:{pending:0,retained:0},...preserved};
 assert.equal(assertPartialClosedCandidate({candidate,actual}),true);
 assert.throws(()=>assertPartialClosedCandidate({candidate,actual:{...actual,local:{...actual.local,data_epoch:'4'}}}),/PROMOTION_RETRY_METADATA_CONFLICT/);
 assert.throws(()=>assertPartialClosedCandidate({candidate,actual:{...actual,intentDigest:'6'.repeat(64)}}),/PROMOTION_PRESERVATION_NOT_PROVEN/);
 for(const central of [{...actual.central,directory_epoch:'4'},{...actual.central,schema_version:3},{...actual.central,directory_status:'blocked'}])assert.throws(()=>assertPartialClosedCandidate({candidate,actual:{...actual,central}}),/PROMOTION_RETRY_METADATA_CONFLICT/);
});
test('resume accepts only the captured CLOSED→v+2 fence ordering after a partial CAS',()=>{
 const target=planClosedPromotion({kind:'EPOCH',before,guard,generation}),preserved={dataDigest:'1'.repeat(64),intentDigest:'2'.repeat(64),growthDigest:'3'.repeat(64),windowsDigest:'4'.repeat(64),quota:{logical_bytes:'5000',active_products:'4',policy_version:'1',max_products:'300',max_logical_bytes:'536870912'}};
 const candidate={kind:'EPOCH',before,target,guard,preserved},actual={central:target,local:{generation,data_epoch:'3',writer_version:'7',state:'CLOSED'},guard:{...guard,reason_code:'EPOCH',restriction_status:'ACKNOWLEDGED',active:true},...preserved};
 assert.equal(assertReopenProgress({candidate,actual:{...actual,central:{...target,writer_version:'8'}}}),true);
 assert.equal(assertReopenProgress({candidate,actual:{...actual,central:{...target,writer_version:'8'},local:{...actual.local,state:'OPEN',writer_version:'8'}}}),true);
 assert.throws(()=>assertReopenProgress({candidate,actual:{...actual,central:{...target,state:'OPEN',writer_version:'8'}}}),/PROMOTION_REOPEN_PROGRESS_NOT_PROVEN/);
 assert.throws(()=>assertReopenProgress({candidate,actual:{...actual,local:{...actual.local,writer_version:'9'}}}),/PROMOTION_REOPEN_PROGRESS_NOT_PROVEN/);
 assert.throws(()=>assertReopenProgress({candidate,actual:{...actual,guard:{...actual.guard,data_epoch:'3'}}}),/PROMOTION_HISTORICAL_GUARD_CHANGED/);
});
