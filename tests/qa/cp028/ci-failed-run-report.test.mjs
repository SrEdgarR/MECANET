import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,lstat,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('early denied CI run retains a FAIL report and zero counters without creating its private root',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'mecanet-cp028-denied-')),moduleUrl=new URL('../../integration/ci-postgres.mjs',import.meta.url).href;
 try{
  for(const profile of ['arm64-recovery','x64-browser-recovery']){
   const env=Object.fromEntries(['PATH','SYSTEMROOT','WINDIR'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));Object.assign(env,{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'denied/repository',MECANET_CI_PROFILE:profile});
   const child=spawnSync(process.execPath,['--input-type=module','--eval',`import {run} from ${JSON.stringify(moduleUrl)};await run();`],{cwd:directory,env,encoding:'utf8',timeout:5000,windowsHide:true});
   assert.equal(child.status,0,'DENIED_RUN_MUST_REPORT_NOT_THROW:'+child.stderr);const lines=child.stdout.trim().split('\n');assert.equal(lines.length,1);const report=JSON.parse(lines[0]);
   assert.equal(report.schema,'cp023-ci-development-v1');assert.equal(report.status,'FAIL');assert.equal(report.failure,'CI_GITHUB_STANDARD_RUNNER_REQUIRED');assert.equal(report.totalHttpCalls,0);assert.equal(report.parentSqlCommands,0);assert.equal(report.cleanup.status,'NO RESOURCE CREATED');assert.equal(report.sql.status,'NOT VERIFIED');assert.equal(report.http.status,'NOT VERIFIED');assert.equal(report.sourceSha,undefined);await assert.rejects(lstat(join(directory,'.qa-private')),{code:'ENOENT'});
  }
 }finally{await rmdir(directory);}
});
