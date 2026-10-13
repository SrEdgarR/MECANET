import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSqlDenied,checkBoundary,chooseLowerQuota} from './quota-live.mjs';
const state={tenant_id:'11111111-1111-4111-8111-111111111111',state:'OPEN',policy_version:'2',used_products:'2',reserved_products:'0',used_bytes:'1000',reserved_bytes:'0',max_products:'3',max_logical_bytes:'536870912'};
const quota={policy_version:'2',active_products:'2',logical_bytes:'1000',max_products:'3',max_logical_bytes:'536870912'};
const proof={phase:'last-product',tenantId:state.tenant_id,policyVersion:'2',maxProducts:'3',maxLogicalBytes:'536870912',limitRaised:false,beforeMaxProducts:'300',beforeMaxLogicalBytes:'536870912',beforePolicyVersion:'1'};
test('boundary accepts exactly one last product and rejects a false boundary',()=>{
 assert.deepEqual(checkBoundary({phase:'last-product',state,quota,proof}),{productDebt:'2',byteDebt:'1000',phase:'last-product'});
 assert.throws(()=>checkBoundary({phase:'last-product',state:{...state,max_products:'4'},quota:{...quota,max_products:'4'},proof:{...proof,maxProducts:'4'}}),/QA_QUOTA_LAST_PRODUCT_REQUIRED/);
});
test('a proof boolean cannot override an actual policy increase or broken version',()=>{
 assert.throws(()=>checkBoundary({phase:'last-product',state,quota,proof:{...proof,beforeMaxProducts:'2'}}),/QA_QUOTA_POLICY_INCREASE_OR_VERSION_INVALID/);
 assert.throws(()=>checkBoundary({phase:'last-product',state,quota,proof:{...proof,beforePolicyVersion:'2'}}),/QA_QUOTA_POLICY_INCREASE_OR_VERSION_INVALID/);
});
test('last byte is precisely the byte below the conservative 32768 reservation',()=>{
 const s={...state,max_logical_bytes:'33767'},q={...quota,max_logical_bytes:'33767'},p={...proof,phase:'last-byte',maxLogicalBytes:'33767'};
 assert.equal(checkBoundary({phase:'last-byte',state:s,quota:q,proof:p}).byteDebt,'1000');
 assert.throws(()=>checkBoundary({phase:'last-byte',state:{...s,max_logical_bytes:'33768'},quota:{...q,max_logical_bytes:'33768'},proof:{...p,maxLogicalBytes:'33768'}}),/QA_QUOTA_LAST_BYTE_REQUIRED/);
});
test('debt requires retained growth, not just accumulated used data',()=>{
 const p={...proof,phase:'debt',maxLogicalBytes:'999'},s={...state,max_logical_bytes:'999'},q={...quota,max_logical_bytes:'999'};
 assert.throws(()=>checkBoundary({phase:'debt',state:s,quota:q,proof:p}),/QA_QUOTA_REDUCTION_UNDER_DEBT_REQUIRED/);
 assert.equal(checkBoundary({phase:'debt',state:{...s,reserved_bytes:'32768'},quota:q,proof:p}).byteDebt,'33768');
});
test('closed fixture calculation lowers only a limit and increments policy once',()=>{
 const closed={...state,state:'CLOSED',policy_version:'1',max_products:'300'};
 assert.deepEqual(chooseLowerQuota('last-product',closed),{maxProducts:'3',maxLogicalBytes:'536870912',policyVersion:'2'});
 assert.deepEqual(chooseLowerQuota('last-byte',closed),{maxProducts:'300',maxLogicalBytes:'33767',policyVersion:'2'});
 assert.throws(()=>chooseLowerQuota('last-product',{...closed,max_products:'2'}),/QA_QUOTA_POLICY_INCREASE_FORBIDDEN/);
 assert.throws(()=>chooseLowerQuota('debt',closed),/QA_QUOTA_RETAINED_DEBT_REQUIRED/);
});
test('SQL denial preserves exact expected SQLSTATE and reports only fixed unexpected labels',async()=>{
 const rejected=code=>async()=>{throw{code,message:'fictional private SQL text',detail:'fictional password'}};
 assert.deepEqual(await assertSqlDenied(rejected('42501'),['42501'],'EXTENSION'),{label:'EXTENSION',sqlState:'42501',denied:true});
 await assert.rejects(assertSqlDenied(rejected('0A000'),['42501'],'EXTENSION'),error=>error.code==='0A000'&&error.message==='SQL_DENIAL_UNEXPECTED_EXTENSION'&&!Object.hasOwn(error,'detail'));
 await assert.rejects(assertSqlDenied(async()=>{},['42501'],'DDL'),/SQL_DENIAL_MISSING_DDL/);
});
