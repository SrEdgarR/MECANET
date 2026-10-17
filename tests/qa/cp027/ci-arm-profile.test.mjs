import test from 'node:test';
import assert from 'node:assert/strict';
import {ciProfile,validateCiHost,validateCiMode} from '../../integration/ci-postgres.mjs';
test('ARM recovery is an explicit closed CI profile, never an emulated x64 PASS',()=>{
 assert.equal(ciProfile('').architecture,'x64');assert.equal(ciProfile('arm64-recovery').architecture,'arm64');
 assert.throws(()=>ciProfile('auto'));assert.throws(()=>ciProfile('production'));
 const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'SrEdgarR/MECANET'};
 assert.equal(validateCiHost('linux','arm64',env,ciProfile('arm64-recovery')),true);
 for(const args of [['linux','x64',env],['win32','arm64',env],['linux','arm64',{...env,RUNNER_ENVIRONMENT:'self-hosted'}],['linux','arm64',{...env,GITHUB_REPOSITORY:'other/repository'}]])assert.throws(()=>validateCiHost(...args,ciProfile('arm64-recovery')));
});
test('x64 browser recovery is separate and admits only its exact CLI mode and native host',()=>{
 const p=ciProfile('x64-browser-recovery'),env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'SrEdgarR/MECANET'};
 assert.equal(p.recovery,true);assert.equal(p.architecture,'x64');assert.equal(p.dockerArchitecture,'amd64');assert.equal(p.image,ciProfile('').image);assert.equal(validateCiHost('linux','x64',env,p),true);
 assert.equal(validateCiMode('run-browser-recovery',p),true);assert.equal(validateCiMode('run-arm-recovery',ciProfile('arm64-recovery')),true);assert.equal(validateCiMode('run',ciProfile('')),true);
 for(const [mode,profile]of [['run-arm-recovery',p],['run',p],['run-browser-recovery',ciProfile('arm64-recovery')],['run-browser-recovery',ciProfile('')]])assert.throws(()=>validateCiMode(mode,profile));
 assert.throws(()=>validateCiHost('linux','arm64',env,p));assert.throws(()=>ciProfile('x64-recovery'));assert.throws(()=>ciProfile('x64-browser'));
});
