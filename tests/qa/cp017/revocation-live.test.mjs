import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,readdir,unlink,rmdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {assertShareWait,assertPromotedMetadata,scenarioPlan,validateDrainStartedProof,validatePromotionProvenance,publishDrainRequest,selectCurrentDrainStartedProof,waitForCurrentDrainStartedProof} from './revocation-live.mjs';
const tenantId='11111111-1111-4111-8111-111111111111',generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const guard={generation,data_epoch:'2',open_version:'5',closed_version:'6',reopen_version:'7',close_proven:false,status:'CLOSING'};
const central={generation,data_epoch:'2',writer_version:'6',state:'CLOSED'};
const local={generation,data_epoch:'2',writer_version:'5',state:'OPEN'};
const blocked=[{pid:51,application_name:'mecanet-tenant-write',wait_event_type:'Lock',blocking_pids:[41]},{pid:41,application_name:`mecanet-writer:${owner}`,wait_event_type:'Client',blocking_pids:[]}];
test('a real SHARE wait needs a matching old local fence, closed central version and exact writer blocker',()=>{
 assert.equal(assertShareWait({tenantId,generation,owner,guard,central,local,activities:blocked}).writerPid,41);
 for(const patch of [{guard:{...guard,close_proven:true}},{guard:{...guard,status:'ACKNOWLEDGED'}},{local:{...local,writer_version:'7'}},{central:{...central,state:'OPEN'}},{activities:[]},{activities:[blocked[0],{...blocked[1],application_name:'other-project'}]},{activities:[{...blocked[0],blocking_pids:[99]},blocked[1]]}])assert.throws(()=>assertShareWait({tenantId,generation,owner,guard,central,local,activities:blocked,...patch}),e=>e.code==='SHARE_WAIT_NOT_PROVEN');
});
const before={generation,data_epoch:'2',writer_version:'5',writer_credential_version:'1',writer_secret_ref:'writer-a-v1',schema_version:2,state:'OPEN'};
const after={...before,writer_version:'7',writer_credential_version:'2',writer_secret_ref:'writer-a-v2'};
test('rotation and epoch are distinct promotions; no version adoption, reset or implicit credential approval',()=>{
 assert.equal(assertPromotedMetadata({phase:'rotation',before,after,guard:{...guard,close_proven:true,status:'ACKNOWLEDGED'},generation}).writerVersion,'7');
 assert.equal(assertPromotedMetadata({phase:'epoch',before,after:{...before,data_epoch:'3',writer_version:'7'},guard:{...guard,close_proven:true,status:'ACKNOWLEDGED'},generation}).dataEpoch,'3');
 for(const patch of [{after:{...after,writer_version:'5'}},{after:{...after,state:'CLOSED'}},{after:{...after,generation:owner}},{after:{...after,data_epoch:'3'}},{after:{...after,writer_secret_ref:'writer-a-v1'}},{after:{...after,writer_credential_version:'1'}},{guard:{...guard,close_proven:false}}])assert.throws(()=>assertPromotedMetadata({phase:'rotation',before,after,guard:{...guard,close_proven:true,status:'ACKNOWLEDGED'},generation,...patch}),e=>e.code==='PROMOTION_NOT_PROVEN');
});
test('the preregistered scenarios have fixed bounded scope and never claim that preparation verified a real gate',()=>{
 for(const phase of ['share-logout','membership','identity','capture-rotation','capture-epoch','verify-rotation','verify-epoch','block-tenant-b','drain']){
  const plan=scenarioPlan(phase);assert.equal(plan.maxHttpPerClient,160);assert.equal(plan.maxObserverQueries,240);assert.equal(plan.maxRuntimeMs,45000);assert.equal(plan.status,'PREREGISTERED / NOT VERIFIED');assert.equal(plan.quotaChanges,false);assert.equal(plan.newActors,false);
 }
 assert.throws(()=>scenarioPlan('production'),e=>e.code==='FIXED_QA_SCENARIO_REQUIRED');
});
test('a drain start marker cannot substitute a different owner, cohort, source, container or signal',()=>{
 const context={project:'mecanet-qa-p1l2-cp017',sourceSha:'a'.repeat(40),generation,instance:'api1',owner,operationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',ticketId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'};
 const proof={...context,containerId:'e'.repeat(64),artifactDigest:'f'.repeat(64),signal:'SIGTERM',drainStartedAt:new Date().toISOString()};
 assert.equal(validateDrainStartedProof(proof,context),proof);
 for(const patch of [{project:'other-project'},{sourceSha:'b'.repeat(40)},{owner:generation},{generation:owner},{instance:'api2'},{operationId:context.ticketId},{ticketId:context.operationId},{containerId:'short'},{artifactDigest:'short'},{signal:'SIGKILL'},{drainStartedAt:new Date(Date.now()+60000).toISOString()}])assert.throws(()=>validateDrainStartedProof({...proof,...patch},context),e=>e.code==='DRAIN_START_NOT_PROVEN');
});
const producerSha='1'.repeat(40),verifierSha='2'.repeat(40),producerDigest='sha256:'+'3'.repeat(64),verifierDigest='sha256:'+'4'.repeat(64);
const provenance=()=>({phase:'rotation',generation,systemIdentifier:'7511111111111111111',verifierSourceSha:verifierSha,
 captured:{project:'mecanet-qa-p1l2-cp017',sourceSha:producerSha,generation,status:'PASS FOR LISTED CASES ONLY',boundary:{kind:'rotation',tenantId,systemIdentifier:'7511111111111111111',promoted:false,credentialOrEpochChanged:false,guard:{id:owner}}},
 proof:{project:'mecanet-qa-p1l2-cp017',kind:'ROTATION',sourceSha:producerSha,captureSourceSha:producerSha,generation,systemIdentifier:'7511111111111111111',restrictionId:owner,tenantId,closedPreparerVerified:true,positiveProcessEndVerified:true,sqlOwnerAbsent:true,quotaCountersPreserved:true,immutableIntentAndBusinessDigestsPreserved:true},
 history:{acceptedArtifacts:[{codeSha:producerSha,digest:producerDigest},{codeSha:verifierSha,digest:verifierDigest}]}});
const rejectProvenance=input=>assert.throws(()=>validatePromotionProvenance(input),error=>error.code==='PROMOTION_PROVENANCE_NOT_PROVEN');

test('historical promotion and capture keep their accepted producer distinct from a newer verifier',()=>{
 const input=provenance(),actual=validatePromotionProvenance(input);
 assert.deepEqual(actual,{captureSourceSha:producerSha,promotionSourceSha:producerSha,verifierSourceSha:verifierSha,promotionArtifactDigest:producerDigest,verifierArtifactDigest:verifierDigest});
 assert.equal(input.proof.sourceSha,producerSha);
});
test('same-source verification remains valid for exact accepted capture and promotion',()=>{
 const input=provenance();input.verifierSourceSha=producerSha;input.history.acceptedArtifacts.pop();
 const actual=validatePromotionProvenance(input);assert.equal(actual.verifierArtifactDigest,producerDigest);
});
test('an unrelated producer or changed capture cannot replace the historical promotion',()=>{
 for(const mutate of [input=>input.proof.sourceSha='5'.repeat(40),input=>input.captured.sourceSha='5'.repeat(40),input=>input.proof.captureSourceSha=verifierSha,input=>input.proof.sourceSha='invalid']){const input=provenance();mutate(input);rejectProvenance(input)}
});
test('empty, malformed, duplicate or unaccepted history rejects promotion provenance',()=>{
 for(const mutate of [input=>input.history.acceptedArtifacts=[],input=>input.history.acceptedArtifacts=undefined,input=>input.history.acceptedArtifacts.shift(),input=>input.history.acceptedArtifacts.pop(),input=>input.history.acceptedArtifacts[0].digest='invalid',input=>input.history.acceptedArtifacts.push({...input.history.acceptedArtifacts[0]}),input=>input.history.acceptedArtifacts.push({...input.history.acceptedArtifacts[1]})]){const input=provenance();mutate(input);rejectProvenance(input)}
});
test('cross-cohort, cross-kind, different guard or missing positive preservation proof stays rejected',()=>{
 for(const patch of [{project:'other'},{generation:owner},{systemIdentifier:'1'},{restrictionId:tenantId},{tenantId:'22222222-2222-4222-8222-222222222222'},{kind:'EPOCH'},{closedPreparerVerified:false},{positiveProcessEndVerified:false},{sqlOwnerAbsent:false},{quotaCountersPreserved:false},{immutableIntentAndBusinessDigestsPreserved:false}]){const input=provenance();Object.assign(input.proof,patch);rejectProvenance(input)}
 const input=provenance();input.captured.boundary.promoted=true;rejectProvenance(input);
});
const drainRequest=()=>({project:'mecanet-qa-p1l2-cp017',sourceSha:producerSha,generation,instance:'api1',owner,operationId:randomUUID(),ticketId:randomUUID(),requestedAt:new Date().toISOString(),releaseDeadlineMs:2500,signal:'SIGTERM'});
async function drainFixture(fn){
 const directory=await mkdtemp(join(tmpdir(),'mecanet-cp017-drain-'));
 try{await fn({directory,file:join(directory,'drain-request.json')})}
 finally{for(const name of await readdir(directory)){assert(name==='drain-request.json'||/^\.drain-request\.[a-f0-9-]{36}\.tmp$/.test(name));await unlink(join(directory,name))}await rmdir(directory)}
}
// Windows may temporarily reject replacement of a file held by a reader.
// This fixture retries the SAME rename only; runtime Linux uses strict rename
// and strict directory fsync defaults. It never unlinks/truncates the target.
async function fixtureReplaceFile(from,to){
 for(let attempt=0;attempt<20;attempt++)try{return await rename(from,to)}catch(error){if(process.platform!=='win32'||!['EPERM','EACCES'].includes(error.code)||attempt===19)throw error;await delay(2)}
}
test('repeated concurrent drain readers observe complete original or published requests, never truncation',async()=>{
 await drainFixture(async({file})=>{
  const first=drainRequest(),allowed=new Map([[first.operationId,JSON.stringify(first)]]);await writeFile(file,JSON.stringify(first));let publishing=true,reads=0,prepublishReads=0,directorySyncs=0;
  const observe=async()=>{const text=await readFile(file,'utf8');assert(text.length>0);const value=JSON.parse(text);assert.equal(text,allowed.get(value.operationId));reads++};
  const reader=(async()=>{while(publishing){await observe();await delay(0)}})();reader.catch(()=>{});
  try{for(let index=0;index<24;index++){const value=drainRequest();allowed.set(value.operationId,JSON.stringify(value));await publishDrainRequest(file,value,{replaceFile:fixtureReplaceFile,syncDirectory:async()=>{directorySyncs++},checkpoint:async stage=>{if(stage==='temporaryOpened'){await observe();prepublishReads++;await delay(1)}}});await observe()}}
  finally{publishing=false;await reader}
  assert.equal(prepublishReads,24);assert.equal(directorySyncs,24);assert(reads>=48);await observe();
 });
});
test('failed pre-publication leaves the complete previous drain request and no temporary orphan',async()=>{
 await drainFixture(async({directory,file})=>{const previous=JSON.stringify(drainRequest());await writeFile(file,previous);
  await assert.rejects(publishDrainRequest(file,drainRequest(),{syncDirectory:async()=>{},checkpoint:async stage=>{if(stage==='temporaryOpened')throw Error('PRIVATE_TEST_FAULT')}}),/PRIVATE_TEST_FAULT/);
  assert.equal(await readFile(file,'utf8'),previous);assert.deepEqual(await readdir(directory),['drain-request.json']);
 });
});
test('drain publication rejects secret-bearing or unrelated requests before any file mutation',async()=>{
 await drainFixture(async({directory,file})=>{const previous=JSON.stringify(drainRequest());await writeFile(file,previous);
  for(const patch of [{cookie:'PRIVATE_FAKE_COOKIE'},{project:'other'},{instance:'api2'},{signal:'SIGKILL'},{owner:'unknown'},{releaseDeadlineMs:0}])await assert.rejects(publishDrainRequest(file,{...drainRequest(),...patch},{syncDirectory:async()=>{}}),error=>error.code==='DRAIN_REQUEST_EXACT_SHAPE_REQUIRED');
  assert.equal(await readFile(file,'utf8'),previous);assert.deepEqual(await readdir(directory),['drain-request.json']);
 });
});
function drainStartedFixture(){const context=drainRequest();delete context.requestedAt;delete context.releaseDeadlineMs;delete context.signal;return{context,proof:{...context,containerId:'e'.repeat(64),artifactDigest:'sha256:'+'f'.repeat(64),signal:'SIGTERM',drainStartedAt:new Date().toISOString()}}}
test('stale or partial started proofs are ignored until the complete current context appears',async()=>{
 const {context,proof}=drainStartedFixture(),sequence=[JSON.stringify({...proof,operationId:randomUUID()}),'',JSON.stringify(proof).slice(0,80),JSON.stringify(proof)];let reads=0;
 const actual=await waitForCurrentDrainStartedProof(async()=>sequence[reads++],context,{timeoutMs:100,pollMs:1});assert.deepEqual(actual,proof);assert.equal(reads,4);
});
test('no invalid source, owner, operation, ticket, CID or digest can satisfy the started proof wait',()=>{
 const {context,proof}=drainStartedFixture();
 for(const patch of [{sourceSha:verifierSha},{generation:owner},{owner:generation},{operationId:randomUUID()},{ticketId:randomUUID()},{containerId:'short'},{artifactDigest:'invalid'}])assert.equal(selectCurrentDrainStartedProof(JSON.stringify({...proof,...patch}),context),null);
 assert.equal(selectCurrentDrainStartedProof('null',context),null);
});
test('partial and historical started proof timeout never returns or declares a drain PASS',async()=>{
 const {context,proof}=drainStartedFixture();let reads=0;
 await assert.rejects(waitForCurrentDrainStartedProof(async()=>{reads++;return reads%2?'':JSON.stringify({...proof,owner:generation})},context,{timeoutMs:20,pollMs:1}),error=>error.code==='DRAIN_START_NOT_PROVEN');assert(reads>=2);
});
