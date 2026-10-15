import test from 'node:test';import assert from 'node:assert/strict';
import {checkUnboundSchema} from './schema-check.mjs';
test('unbound physical schema checks refuse foreign projects or absent budgets before creating a pool',async()=>{
 const connection={host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password:'fixture-only-never-used',ssl:{ca:'fixture-ca',servername:'postgres',rejectUnauthorized:true}};
 await assert.rejects(checkUnboundSchema({connection,binding:{project:'mecanet-qa-p1l2-r01'},ledger:{charge:async()=>{throw Error('MUST_NOT_QUERY')}}}),/CP019_SCHEMA_CHECK_BINDING/);
 await assert.rejects(checkUnboundSchema({connection,binding:{project:'mecanet-qa-p1l3-r03'}}),/CP019_SCHEMA_CHECK_BINDING/);
});
