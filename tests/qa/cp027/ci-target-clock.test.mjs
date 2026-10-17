import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRecoveredClock} from '../../integration/ci-cold-copy.mjs';
test('a clock fault observed during target drain prevents a portable PASS',()=>{
 assert.equal(assertRecoveredClock({clockFailure:()=>null}),true);
 assert.throws(()=>assertRecoveredClock({clockFailure:()=>({guard:'ADMISSION_BUSY'})}),/CI_TARGET_CLOCK_FAILED/);
 assert.throws(()=>assertRecoveredClock({}),/CI_TARGET_CLOCK_FAILED/);
});

