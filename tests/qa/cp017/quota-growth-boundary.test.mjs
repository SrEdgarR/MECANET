import test from 'node:test';
import assert from 'node:assert/strict';
import {GROWTH_PLAN,tenantReserveBoundary,reducedDebtPolicy,assertRetainedDebt,validateGrowthProof} from './quota-growth-boundary.mjs';
const qa={project:'mecanet-qa-p1l2-cp017',generation:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',systemIdentifier:'7511111111111111111',fixture:{identities:[{email:'a@qa.invalid'}]}},sourceSha='a'.repeat(40);
const proof={...qa,sourceSha,workerStopped:true,webStopped:true,apis:[1,2].map(n=>({instance:`api${n}`,state:'exited',containerId:String(n).repeat(64),owner:`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`,httpClosed:true,sqlOwnerAbsent:true,writerApplicationName:`mecanet-writer:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`}))};
test('one byte of tenant reservation headroom determines the 32KiB boundary without widening source limits',()=>{
 assert.deepEqual(tenantReserveBoundary({used:'1000',reserved:'200',max:'536870912'}),{below:'33967',exact:'33968',used:'1000',reserved:'200',reservation:'32768'});
 for(const bad of [{used:'1000',reserved:'200',max:'33967'},{used:'9007199254740993',reserved:'0',max:'536870912'},{used:'-1',reserved:'0',max:'536870912'},{used:'1000',reserved:200,max:'536870912'}])assert.throws(()=>tenantReserveBoundary(bad));
});
test('reduction below debt increments policy once while preserving full reserved growth',()=>{
 assert.deepEqual(reducedDebtPolicy({used:'1000',reserved:'32768',max:'536870912',policyVersion:'2'}),{maxLogicalBytes:'33767',policyVersion:'3',retainedBytes:'32768',used:'1000',originalMaximum:'536870912'});
 for(const bad of [{used:'1000',reserved:'0',max:'536870912',policyVersion:'2'},{used:'1000',reserved:'32768',max:'1000',policyVersion:'2'},{used:'1000',reserved:'32768',max:'536870912',policyVersion:'9223372036854775807'}])assert.throws(()=>reducedDebtPolicy(bad));
});
test('uncertain original guards and QH QC Qt cannot change when policy is reduced or another UUID is denied',()=>{
 const debt={guardHash:'c'.repeat(64),owner:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',status:'UNKNOWN',attempt:'1',projectionState:'UNKNOWN',projectionReason:'UNCERTAIN',resultHash:null,growthState:'RESERVED',tenantReserved:'32768',controlReserved:'16384',productsReserved:'0',usedBytes:'1000',reservedBytes:'32768',usedProducts:'2',reservedProducts:'0',resourceHash:'d'.repeat(64)};
 assert.equal(assertRetainedDebt(debt,{...debt}),true);
 for(const mutate of [s=>s.guardHash='e'.repeat(64),s=>s.owner='forged',s=>s.growthState='SETTLED',s=>s.reservedBytes='0',s=>s.resourceHash='e'.repeat(64),s=>s.attempt='2',s=>s.projectionReason='NO_EFFECT']){const changed={...debt};mutate(changed);assert.throws(()=>assertRetainedDebt(debt,changed));}
});
test('rollback assay requires positive owners ended and reports SQL fragments only',()=>{
 assert.equal(validateGrowthProof({qa,proof,sourceSha}),proof);
 for(const invalid of [{...proof,workerStopped:false},{...proof,webStopped:false},{...proof,sourceSha:'b'.repeat(40)}])assert.throws(()=>validateGrowthProof({qa,proof:invalid,sourceSha}));
 assert.equal(GROWTH_PLAN.outerRollbackRequired,true);assert.equal(GROWTH_PLAN.httpAcceptance,false);assert.equal(GROWTH_PLAN.quotaPersistentIncreases,0);assert.equal(GROWTH_PLAN.businessPersistentMutations,0);assert.equal(GROWTH_PLAN.permissionChanges,0);assert.equal(GROWTH_PLAN.noRefund,true);
});
