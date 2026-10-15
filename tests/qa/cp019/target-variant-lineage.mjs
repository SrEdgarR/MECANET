import {CASE_LIMITS,GLOBAL_LIMITS} from './budget-limits.mjs';
// Prospective, private QA lineage. Import/calls are pure: no I/O, ID choice,
// secrets, SQL, resource adoption or resetting the cohort ledger occurs here.
import {canonical,sha256,verifyEndProof} from '../../../server/saas/recovery/protocol.js';
import {validateMaterial} from '../../../server/saas/recovery/custody.js';
import {makeSourceNormalManifest} from './source-driver.mjs';

const SOURCE='mecanet-qa-p1l3-r03',TARGET=SOURCE+'-target',HASH=/^[0-9a-f]{64}$/;
const check=(ok,code)=>{if(!ok)throw Error(code)},same=(a,b)=>canonical(a)===canonical(b);
const exact=(x,keys,code)=>check(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(','),code);
const clone=x=>JSON.parse(canonical(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
export const VARIANT_KINDS=Object.freeze(['roster-empty','allclosed','commit-interrupted','promote-prefix','a5-restrictions']);
export const VARIANT_CAPS=Object.freeze({sql:GLOBAL_LIMITS.sql,http:300,journal:1000,artifactFiles:GLOBAL_LIMITS.artifactFiles,seconds:1800,caseSql:CASE_LIMITS.sql,caseHttp:80,caseSeconds:45,activePg:1,cpuMilli:1000,memoryMiB:2048,dataBytes:2*1024**3});
const variantPhases=Object.freeze(['begin-enroll','rotate','canary','configure','clock-plan','post-worker-verify','promotion','activation','abort-close','abort-local','abort-finish','promote-fault']);
// Phases retain independent SQL operation IDs and journal records. Their budget
// belongs to one existing semantic case; entering another phase cannot reset it.
const lifecycleCase=Object.freeze({'roster-empty':'ready-empty',allclosed:'ready-allclosed','commit-interrupted':'target-commit-fault','promote-prefix':'target-promote-fault','a5-restrictions':'variant-a5-grant'});
export function variantCaseName(kind,phase){
 check(Object.hasOwn(lifecycleCase,kind)&&variantPhases.includes(phase),'VARIANT_CASE');return lifecycleCase[kind];
}
export const VARIANT_CASES=freeze({
 'roster-empty':[lifecycleCase['roster-empty']],
 allclosed:[lifecycleCase.allclosed],
 'commit-interrupted':[lifecycleCase['commit-interrupted']],
 'promote-prefix':[lifecycleCase['promote-prefix']],
 'a5-restrictions':[lifecycleCase['a5-restrictions'],'variant-a5-membership','variant-a5-identity'],
});
export function variantPaths(kind){
 check(VARIANT_KINDS.includes(kind),'VARIANT_KIND');const root='/opt/'+TARGET+'/variants/'+kind;
 return freeze({root,data:root+'/data/18/docker',dataRoot:root+'/data',socket:root+'/ingress/http.sock',ingress:root+'/ingress',journal:root+'/journal',secrets:root+'/secrets',master:root+'/master',evidence:root+'/evidence'});
}
function indexShape(index){
 exact(index,['schema','files'],'VARIANT_COPY_INDEX');check(index.schema==='copy-index-v1'&&Array.isArray(index.files)&&index.files.length<=10000&&Buffer.byteLength(canonical(index))<=4*1024*1024,'VARIANT_COPY_INDEX');const seen=new Set();let bytes=0;
 for(const f of index.files){exact(f,['path','bytes','sha256'],'VARIANT_COPY_INDEX');check(typeof f.path==='string'&&f.path.length>0&&f.path.length<=512&&!f.path.startsWith('/')&&!f.path.includes('\\')&&!f.path.split('/').some(s=>!s||s==='.'||s==='..')&&!seen.has(f.path)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&HASH.test(f.sha256??''),'VARIANT_COPY_INDEX');seen.add(f.path);bytes+=f.bytes;check(bytes<=VARIANT_CAPS.dataBytes,'VARIANT_COPY_INDEX')}
}
function validateAnchor(anchor){
 exact(anchor,['schema','project','path','registryHash','startedUptime','sequence','total'],'VARIANT_LEDGER_ANCHOR');
 check(anchor.schema==='target-variant-budget-anchor-v1'&&anchor.project===SOURCE&&anchor.path==='/opt/'+SOURCE+'/budget/ledger.json'&&HASH.test(anchor.registryHash??'')&&Number.isFinite(anchor.startedUptime)&&anchor.startedUptime>=0&&Number.isSafeInteger(anchor.sequence)&&anchor.sequence>=0,'VARIANT_LEDGER_ANCHOR');
 exact(anchor.total,['sql','http','journal','artifactFiles'],'VARIANT_LEDGER_ANCHOR');for(const[k,v]of Object.entries(anchor.total))check(Number.isSafeInteger(v)&&v>=0&&v<=VARIANT_CAPS[k],'VARIANT_LEDGER_ANCHOR');return anchor;
}
function materialPair(original,effective){
 validateMaterial(original);validateMaterial(effective);
 check(original.source.project===SOURCE&&original.target.project===TARGET&&effective.target.project===TARGET&&same(original.source,effective.source)&&original.controllerOwner===effective.controllerOwner&&original.artifactDigest===effective.artifactDigest&&original.schema===effective.schema,'VARIANT_SOURCE_CHANGED');
 check(original.recoveryId!==effective.recoveryId&&original.target.generation!==effective.target.generation,'VARIANT_TARGET_REUSE');
 for(const key of ['seedClockOwner','workerClockOwner','webOwner','sessionSecret'])check(original.target[key]!==effective.target[key],'VARIANT_TARGET_REUSE');
 for(const key of ['api1','api2'])check(original.target.apiOwners[key]!==effective.target.apiOwners[key],'VARIANT_TARGET_REUSE');
 const originalTargetIds=new Set([original.recoveryId,original.target.generation,original.target.seedClockOwner,original.target.workerClockOwner,original.target.webOwner,...Object.values(original.target.apiOwners),...Object.values(original.target.operationIds).flat(),...Object.entries(original.stageOperationIds).filter(([k])=>!k.startsWith('source-')).map(([,v])=>v)]);
 for(const id of [effective.recoveryId,effective.target.generation,effective.target.seedClockOwner,effective.target.workerClockOwner,effective.target.webOwner,...Object.values(effective.target.apiOwners),...Object.values(effective.target.operationIds).flat()])check(!originalTargetIds.has(id),'VARIANT_TARGET_REUSE');
 for(const[k,id]of Object.entries(effective.stageOperationIds))check(k.startsWith('source-')?id===original.stageOperationIds[k]:!originalTargetIds.has(id),'VARIANT_STAGE_REUSE');
 for(const role of Object.keys(original.target.rolePasswords))check(original.target.rolePasswords[role]!==effective.target.rolePasswords[role],'VARIANT_TARGET_SECRET_REUSE');
 check(effective.target.identityPassword===original.target.identityPassword&&effective.target.identityPasswordHash===original.target.identityPasswordHash,'VARIANT_ACTOR_CHANGED');
}

/** Caller-selected material is validated BEFORE publication/creation. Root must
 * publish the addition once, read it back and revalidate the actual original
 * files/ledger at each effect. This pure constructor cannot claim that I/O. */
export function makeTargetVariantLineage(input){
 const {originalMaterial:o,effectiveMaterial:m,kind,sourceCapture:c,sourceNormalManifest:n,sourceResource:r,sourceEndProof:end,observedSourceEnd,copyIndex,sourceJournalFinalCheckpoint:head,ledgerAnchor}=input??{};
 check(VARIANT_KINDS.includes(kind),'VARIANT_KIND');materialPair(o,m);validateAnchor(ledgerAnchor);indexShape(copyIndex);
 check(n&&same(n,makeSourceNormalManifest({material:o,custodyHash:sha256(o),resource:r,migrationHashes:n.migrationHashes,sourceCommit:n.sourceCommit})),'VARIANT_SOURCE_MANIFEST');
 check(c?.schema==='source-capture-v1'&&c.runId===o.source.normal.runId&&c.custodyHash===sha256(o)&&c.normalManifestHash===sha256(n)&&c.resourceHash===sha256(r)&&c.sourceCommit===n.sourceCommit,'VARIANT_SOURCE_CAPTURE');
 check(end?.recoveryId===o.recoveryId&&end.sourceResourceHash===sha256(r)&&verifyEndProof(end,observedSourceEnd)===sha256(end),'VARIANT_SOURCE_END');
 for(const p of end.processes)check(p.ownerId===(p.service==='worker'?o.source.workerClockOwner:p.service==='web'?o.source.webOwner:o.source.apiOwners[p.service]),'VARIANT_SOURCE_OWNER');
 exact(head,['sequence','hash'],'VARIANT_SOURCE_HEAD');check(Number.isSafeInteger(head.sequence)&&head.sequence>=0&&head.sequence<1000&&HASH.test(head.hash??''),'VARIANT_SOURCE_HEAD');
 return freeze(clone({schema:'target-variant-lineage-v1',project:TARGET,kind,originalMaterialHash:sha256(o),effectiveMaterialHash:sha256(m),sourceOriginalRecoveryId:o.recoveryId,recoveryId:m.recoveryId,generation:m.target.generation,sourceCaptureHash:sha256(c),sourceNormalManifestHash:sha256(n),sourceResourceHash:sha256(r),sourceEndProofHash:sha256(end),copyIndexHash:sha256(copyIndex),sourceJournalFinalCheckpoint:head,ledgerAnchor,paths:variantPaths(kind),cases:VARIANT_CASES[kind],caps:VARIANT_CAPS}));
}
export function validateTargetVariantLineage(context){
 const addition=makeTargetVariantLineage(context);check(HASH.test(context?.additionHash??'')&&sha256(context.addition)===context.additionHash&&same(addition,context.addition),'VARIANT_LINEAGE_BINDING');
 return freeze(clone({material:context.effectiveMaterial,sourceMaterial:context.originalMaterial,sourceOriginalRecoveryId:context.originalMaterial.recoveryId,originalSourceMaterialHash:sha256(context.originalMaterial),additionHash:context.additionHash,kind:context.kind,paths:addition.paths}));
}
/** The private context file stays <=256KiB. Large index/capture values are
 * already authenticated by the caller's existing fixed-path readers and are
 * joined only in memory. Existing values cannot be silently replaced. */
export function completeTargetVariantLineage(context,sourceInputs){
 const required=['sourceCapture','sourceResource','sourceEndProof','observedSourceEnd','copyIndex','sourceJournalFinalCheckpoint'];
 exact(sourceInputs,required,'VARIANT_SOURCE_INPUTS');
 check(context&&typeof context==='object'&&!Array.isArray(context),'VARIANT_LINEAGE_BINDING');
 const basic=['kind','originalMaterial','effectiveMaterial','addition','additionHash','sourceNormalManifest','ledgerAnchor'];
 check(basic.every(k=>Object.hasOwn(context,k))&&Object.keys(context).every(k=>basic.includes(k)||required.includes(k)),'VARIANT_LINEAGE_BINDING');
 for(const key of required)if(Object.hasOwn(context,key))check(same(context[key],sourceInputs[key]),'VARIANT_SOURCE_CHANGED');
 const result={...clone(context),...clone(sourceInputs)};validateTargetVariantLineage(result);return freeze(result);
}
/** Values are authenticated Root reads, not a token allowing SQL. All counters
 * remain in the same global ledger; a retry cannot refresh its start time. */
export function assertVariantLedgerContinuity(addition,current,registryHash){
 const a=validateAnchor(addition?.ledgerAnchor);check(same(addition.caps,VARIANT_CAPS)&&registryHash===a.registryHash&&current?.schema==='cp019-budget-v1'&&current.project===SOURCE&&current.startedUptime===a.startedUptime&&Number.isSafeInteger(current.sequence)&&current.sequence>=a.sequence,'VARIANT_LEDGER_CHANGED');
 exact(current.total,['sql','http','journal','artifactFiles'],'VARIANT_LEDGER_CHANGED');for(const[k,n]of Object.entries(current.total))check(Number.isSafeInteger(n)&&n>=a.total[k]&&n<=VARIANT_CAPS[k],'VARIANT_LEDGER_RESET');return true;
}
