import test from 'node:test';
import assert from 'node:assert/strict';
import {copyIndexFromRows,assertIntegrityGroup} from '../../integration/ci-integrity.mjs';
test('portable integrity index preserves exact physical inventory without accepting aliases or duplicate paths',()=>{
 const rows=[{path:'PG_VERSION',bytes:3,sha256:'a'.repeat(64)}];assert.deepEqual(copyIndexFromRows(rows),{schema:'copy-index-v1',files:rows});
 for(const bad of [[...rows,...rows],[{...rows[0],path:'../foreign'}],[{...rows[0],bytes:-1}],[{...rows[0],sha256:'unproved'}]])assert.throws(()=>copyIndexFromRows(bad));
});
test('an incomplete negative group never grants target-start readiness',()=>{
 const r={status:'PASS',scope:'production validators on real private filesystem',targetStarted:false,copy:{status:'PASS'},journal:{status:'PASS',pending:0},custody:{status:'PASS'},negatives:Array.from({length:13},(_,i)=>({name:'synthetic-'+i,status:'PASS',rejection:'EXPECTED'}))};
 assert.equal(assertIntegrityGroup(r),true);
 for(const patch of [{status:'PARTIAL'},{targetStarted:true},{journal:{status:'PASS',pending:1}},{negatives:[{status:'NOT VERIFIED'}]}])assert.throws(()=>assertIntegrityGroup({...r,...patch}));
});
