// Models only. No file publication, PostgreSQL, Docker or resource selection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseMaterial} from '../../../server/saas/recovery/custody.js';
import {sha256,canonical} from '../../../server/saas/recovery/protocol.js';
import {makeSourceNormalManifest} from './source-driver.mjs';
import {makeTargetVariantLineage,validateTargetVariantLineage,assertVariantLedgerContinuity,completeTargetVariantLineage,variantCaseName,VARIANT_CASES,VARIANT_KINDS} from './target-variant-lineage.mjs';

const original=await chooseMaterial({project:'mecanet-qa-p1l3-r03',artifactDigest:'a'.repeat(64)}),chosen=await chooseMaterial({project:'mecanet-qa-p1l3-r03',artifactDigest:original.artifactDigest});
const effective={...structuredClone(original),recoveryId:chosen.recoveryId,target:{...structuredClone(chosen.target),identityPassword:original.target.identityPassword,identityPasswordHash:original.target.identityPasswordHash},stageOperationIds:Object.fromEntries(Object.entries(original.stageOperationIds).map(([key,id])=>[key,key.startsWith('source-')?id:chosen.stageOperationIds[key]]))};
function fixture(kind='promote-prefix'){
 const sourceResource={project:original.source.project,cohortId:original.source.normal.runId,hostIdentity:'b'.repeat(64),containerId:'c'.repeat(64),containerLabels:{project:original.source.project,service:'postgres'},imageDigest:'sha256:67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129',volumeId:'own-source',dataPath:'/opt/'+original.source.project+'/data/18/docker',networkId:'own-source',networkSubnet:'10.77.64.0/24',networkIP:'10.77.64.2',socketPath:'/opt/'+original.source.project+'/ingress/http.sock',generation:original.source.generation,systemIdentifier:'1234567890123456789'};
 const sourceNormalManifest=makeSourceNormalManifest({material:original,custodyHash:sha256(original),resource:sourceResource,migrationHashes:{central:'d'.repeat(64),tenant:'e'.repeat(64)},sourceCommit:'f'.repeat(40)});
 const processes=['api1','api2','worker','web'].map((service,i)=>({service,containerId:String(i+1).repeat(64),ownerId:service==='worker'?original.source.workerClockOwner:service==='web'?original.source.webOwner:original.source.apiOwners[service],exitCode:0,finishedAt:'2026-10-14T00:00:00Z'}));
 const sourceEndProof={schema:'source-end-v1',recoveryId:original.recoveryId,sourceResourceHash:sha256(sourceResource),processes,sqlOwners:processes.filter(p=>p.service!=='web').map(p=>p.ownerId),httpOperationIds:[]},observedSourceEnd={resourceHash:sha256(sourceResource),containers:processes.map(p=>({...p,id:p.containerId,running:false})),sqlOwnersPresent:[],httpPending:[]};
 const sourceCapture={schema:'source-capture-v1',runId:original.source.normal.runId,custodyHash:sha256(original),normalManifestHash:sha256(sourceNormalManifest),resourceHash:sha256(sourceResource),sourceCommit:sourceNormalManifest.sourceCommit};
 const copyIndex={schema:'copy-index-v1',files:[{path:'PG_VERSION',bytes:3,sha256:sha256('18\n')}]},sourceJournalFinalCheckpoint={sequence:5,hash:'0'.repeat(64)};
 const ledgerAnchor={schema:'target-variant-budget-anchor-v1',project:original.source.project,path:'/opt/'+original.source.project+'/budget/ledger.json',registryHash:'1'.repeat(64),startedUptime:100,sequence:10,total:{sql:50,http:8,journal:2,artifactFiles:40}};
 return{kind,originalMaterial:structuredClone(original),effectiveMaterial:structuredClone(effective),sourceCapture,sourceNormalManifest,sourceResource,sourceEndProof,observedSourceEnd,copyIndex,sourceJournalFinalCheckpoint,ledgerAnchor};
}
function context(kind){const f=fixture(kind),addition=structuredClone(makeTargetVariantLineage(f));return{...f,addition,additionHash:sha256(addition)}}

test('five closed prospective variants preserve original source and expose lineage rather than relabeling it',()=>{
 assert.deepEqual(VARIANT_KINDS,['roster-empty','allclosed','commit-interrupted','promote-prefix','a5-restrictions']);
 for(const kind of VARIANT_KINDS){const c=context(kind),before=canonical(c),v=validateTargetVariantLineage(c);assert.equal(v.sourceOriginalRecoveryId,original.recoveryId);assert.equal(v.originalSourceMaterialHash,sha256(original));assert.equal(v.material.recoveryId,effective.recoveryId);assert.equal(v.paths.data,'/opt/'+original.target.project+'/variants/'+kind+'/data/18/docker');assert.notEqual(c.addition.originalMaterialHash,c.addition.effectiveMaterialHash);assert.equal(canonical(c),before);assert.ok(Object.isFrozen(v.material));assert.equal(c.addition.caps.sql,200000);}
});
test('a bounded private header joins large existing inputs only in memory and rejects conflicting substitutions',()=>{
 const c=context(),sourceKeys=['sourceCapture','sourceResource','sourceEndProof','observedSourceEnd','copyIndex','sourceJournalFinalCheckpoint'],source=Object.fromEntries(sourceKeys.map(k=>[k,c[k]])),small=Object.fromEntries(Object.entries(c).filter(([k])=>!sourceKeys.includes(k)));
 assert.ok(Buffer.byteLength(canonical(small))<262144);assert.equal(validateTargetVariantLineage(completeTargetVariantLineage(small,source)).additionHash,c.additionHash);
 assert.throws(()=>completeTargetVariantLineage({...small,copyIndex:{schema:'copy-index-v1',files:[]}},source),/SOURCE_CHANGED/);assert.throws(()=>completeTargetVariantLineage({...small,unapproved:true},source),/LINEAGE_BINDING/);
 const big=structuredClone(c);big.copyIndex.files=Array.from({length:2285},(_,i)=>({path:'base/'+String(i).padStart(12,'0'),bytes:1,sha256:'1'.repeat(64)}));big.addition=structuredClone(makeTargetVariantLineage(big));big.additionHash=sha256(big.addition);const header=Object.fromEntries(Object.entries(big).filter(([k])=>!sourceKeys.includes(k))),inputs=Object.fromEntries(sourceKeys.map(k=>[k,big[k]]));assert.ok(Buffer.byteLength(canonical(inputs.copyIndex))>262144);assert.ok(Buffer.byteLength(canonical(header))<262144);assert.equal(completeTargetVariantLineage(header,inputs).additionHash,big.additionHash);
});
test('semantic phase groups use seven existing cases without creating a retry budget',async()=>{
 const groups={'roster-empty':'ready-empty',allclosed:'ready-allclosed','commit-interrupted':'target-commit-fault','promote-prefix':'target-promote-fault','a5-restrictions':'variant-a5-grant'},phases=['begin-enroll','rotate','canary','configure','clock-plan','post-worker-verify','promotion','activation','abort-close','abort-local','abort-finish','promote-fault'];
 const {budgetRegistry,initialBudget}=await import('./budget-plan.mjs'),{newLedger}=await import('./ledger.mjs'),{mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir,uptime}=await import('node:os'),{join}=await import('node:path');
 const plan=budgetRegistry();assert.equal(Object.keys(plan.plannedScenarios).length,135);
 for(const[kind,group]of Object.entries(groups)){for(const phase of phases)assert.equal(variantCaseName(kind,phase),group);assert.deepEqual(VARIANT_CASES[kind],kind==='a5-restrictions'?[group,'variant-a5-membership','variant-a5-identity']:[group]);for(const name of VARIANT_CASES[kind])assert.equal(plan.plannedScopes[name],'target-window')}
 for(const args of [['arbitrary','promotion'],['promote-prefix','retry-2'],['promote-prefix','variant-prefix-promote']])assert.throws(()=>variantCaseName(...args),/VARIANT_CASE/);
 const dir=await mkdtemp(join(tmpdir(),'cp021-semantic-cases-'));try{
  const file=join(dir,'ledger.json');await writeFile(file,canonical(initialBudget(plan,uptime())));const ledger=await newLedger(file,{scenario:'target-window',sync:async()=>{}});
  for(const[kind,group]of Object.entries(groups)){let started;for(const phase of phases){await ledger.enter(variantCaseName(kind,phase));await ledger.charge('sql');const current=(await ledger.snapshot()).scenarios[group];started??=current.startedUptime;assert.equal(current.startedUptime,started)}assert.equal((await ledger.snapshot()).scenarios[group].total.sql,phases.length)}
  const current=await ledger.snapshot();assert.equal(Object.keys(current.scenarios).length,5);assert.equal(current.total.sql,5*phases.length);assert.equal(current.project,plan.project);
  const before=canonical(current);await assert.rejects(ledger.enter('variant-prefix-promote'),/CP019_BUDGET_ABORT/);assert.equal(canonical(await ledger.snapshot()),before);
  await ledger.enter(variantCaseName('promote-prefix','promotion'));const expired=await ledger.snapshot();expired.scenarios['target-promote-fault'].startedUptime=uptime()-46;await writeFile(file,canonical(expired));
  await ledger.enter(variantCaseName('promote-prefix','abort-close'));const beforeRefusal=canonical(await ledger.snapshot());let effects=0;const {measuredPool}=await import('./ledger.mjs');
  await assert.rejects(measuredPool({query:async()=>++effects},ledger).query('expired'),/CP019_BUDGET_ABORT/);assert.equal(effects,0);assert.equal(canonical(await ledger.snapshot()),beforeRefusal);assert.equal((await ledger.snapshot()).scenarios['target-promote-fault'].startedUptime,expired.scenarios['target-promote-fault'].startedUptime);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('modified source, controller, artifact or original source-stage IDs fail before a pool could be made',()=>{
 for(const alter of [x=>x.effectiveMaterial.source.generation=x.effectiveMaterial.target.generation,x=>x.effectiveMaterial.controllerOwner=chosen.controllerOwner,x=>x.effectiveMaterial.artifactDigest='2'.repeat(64),x=>x.effectiveMaterial.stageOperationIds['source-init']=chosen.stageOperationIds['source-init']]){const f=fixture();alter(f);assert.throws(()=>makeTargetVariantLineage(f));}
});
test('target material cannot reuse main generation, operation IDs, owners or role secrets',()=>{
 for(const alter of [x=>x.effectiveMaterial.recoveryId=original.recoveryId,x=>x.effectiveMaterial.target.generation=original.target.generation,x=>x.effectiveMaterial.target.apiOwners.api1=original.target.apiOwners.api1,x=>x.effectiveMaterial.target.operationIds.abort=original.target.operationIds.abort,x=>x.effectiveMaterial.target.rolePasswords=original.target.rolePasswords,x=>x.effectiveMaterial.stageOperationIds['target-begin']=original.stageOperationIds['target-begin']]){const f=fixture();alter(f);assert.throws(()=>makeTargetVariantLineage(f));}
});
test('capture/normal/end keep original custody and source identity, no hashes can adopt changed source inputs',()=>{
 for(const alter of [x=>x.sourceCapture.custodyHash=sha256(effective),x=>x.sourceNormalManifest.custodyHash=sha256(effective),x=>x.sourceEndProof.recoveryId=effective.recoveryId,x=>x.observedSourceEnd.sqlOwnersPresent=['live'],x=>x.sourceCapture.resourceHash='2'.repeat(64)]){const f=fixture();alter(f);assert.throws(()=>makeTargetVariantLineage(f));}
});
test('unknown kind, arbitrary path, changed cap, changed parent hash or addition collision is rejected',()=>{
 assert.throws(()=>makeTargetVariantLineage(fixture('free-selector')));
 for(const alter of [c=>c.addition.paths.data='/opt/nexora/data',c=>c.addition.caps.sql=200001,c=>c.addition.originalMaterialHash='2'.repeat(64),c=>c.addition.sourceEndProofHash='2'.repeat(64),c=>c.addition.ledgerAnchor.path='/opt/other/budget/ledger.json']){const c=context();alter(c);c.additionHash=sha256(c.addition);assert.throws(()=>validateTargetVariantLineage(c));}
 const c=context();c.additionHash='3'.repeat(64);assert.throws(()=>validateTargetVariantLineage(c));
});
test('copy index traversal, duplicate, excess data and symlink-shaped entries are refused in the pure contract',()=>{
 for(const index of [{schema:'copy-index-v1',files:[{path:'../PG_VERSION',bytes:3,sha256:'1'.repeat(64)}]},{schema:'copy-index-v1',files:[{path:'x',bytes:1,sha256:'1'.repeat(64)},{path:'x',bytes:1,sha256:'1'.repeat(64)}]},{schema:'copy-index-v1',files:[{path:'x',bytes:2*1024**3+1,sha256:'1'.repeat(64)}]},{schema:'copy-index-v1',files:[{path:'x',bytes:1,sha256:'1'.repeat(64),symlink:true}]}]){const f=fixture();f.copyIndex=index;assert.throws(()=>makeTargetVariantLineage(f));}
});
test('the same Root ledger and monotonic counters are mandatory; retry cannot reset clock or counters',()=>{
 const c=context(),a=c.ledgerAnchor,live={schema:'cp019-budget-v1',project:a.project,startedUptime:a.startedUptime,sequence:a.sequence+2,total:{...a.total,sql:a.total.sql+1}};
 assert.equal(assertVariantLedgerContinuity(c.addition,live,a.registryHash),true);
 for(const change of [{startedUptime:101},{sequence:9},{project:'mecanet-qa-p1l3-r01'},{project:'mecanet-qa-p1l3-r02'},{project:'mecanet-qa-p1l3-r04'},{total:{...live.total,sql:49}},{total:{...live.total,sql:200001}}])assert.throws(()=>assertVariantLedgerContinuity(c.addition,{...live,...change},a.registryHash));
 assert.throws(()=>assertVariantLedgerContinuity(c.addition,live,'0'.repeat(64)));
});
