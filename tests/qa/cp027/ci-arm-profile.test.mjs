import test from 'node:test';
import assert from 'node:assert/strict';
import {ciProfile,validateCiHost} from '../../integration/ci-postgres.mjs';
test('ARM recovery is an explicit closed CI profile, never an emulated x64 PASS',()=>{
 assert.equal(ciProfile('').architecture,'x64');assert.equal(ciProfile('arm64-recovery').architecture,'arm64');
 assert.throws(()=>ciProfile('auto'));assert.throws(()=>ciProfile('production'));
 const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'SrEdgarR/MECANET'};
 assert.equal(validateCiHost('linux','arm64',env,ciProfile('arm64-recovery')),true);
 for(const args of [['linux','x64',env],['win32','arm64',env],['linux','arm64',{...env,RUNNER_ENVIRONMENT:'self-hosted'}],['linux','arm64',{...env,GITHUB_REPOSITORY:'other/repository'}]])assert.throws(()=>validateCiHost(...args,ciProfile('arm64-recovery')));
});
