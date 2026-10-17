import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReadinessRollbackCase} from '../../integration/ci-readiness-negatives.mjs';
test('technical readiness never substitutes authority or a positive rollback of both databases',()=>{
 const r={technicalSqlReady:true,authorityDenied:true,localRollback:true,centralRollback:true,controlBefore:'a'.repeat(64),controlAfter:'a'.repeat(64),tenantBefore:'b'.repeat(64),tenantAfter:'b'.repeat(64)};
 assert.equal(assertReadinessRollbackCase(r),true);
 for(const patch of [{technicalSqlReady:false},{authorityDenied:false},{localRollback:false},{centralRollback:false},{controlAfter:'c'.repeat(64)},{tenantAfter:'c'.repeat(64)}])assert.throws(()=>assertReadinessRollbackCase({...r,...patch}));
});
