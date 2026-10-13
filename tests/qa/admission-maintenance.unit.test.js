import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEndEvidence } from '../../server/saas/admission/maintenance.js';
test('a timeout, missing runner or incomplete SQL end never releases an uncertain reservation',()=>{
  for(const evidence of [null,{}, {runnerStopped:true}, {runnerStopped:true,sqlSettled:true}, {runnerStopped:true,sqlSettled:true,responseSettled:true}, {runnerStopped:false,sqlSettled:true,responseSettled:true,reference:'qa-proof'}])assert.throws(()=>validateEndEvidence(evidence));
  assert.deepEqual(validateEndEvidence({runnerStopped:true,sqlSettled:true,responseSettled:true,reference:'qa-proof'}),{reference:'qa-proof'});
});
