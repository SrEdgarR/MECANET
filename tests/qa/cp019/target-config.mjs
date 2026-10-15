// Pure private target composition. No SQL, filesystem, random choice, startup,
// observed-proof fallback or secret selection occurs when importing/calling it.
import {canonical,sha256,validateManifest,verifyEndProof,validateStageRecords} from '../../../server/saas/recovery/protocol.js';
import {validateMaterial,deriveRuntimeConfig,ROLES} from '../../../server/saas/recovery/custody.js';
import {validateClockTransfer} from '../../../server/saas/admission/transfer.js';
import {makeSourceNormalManifest} from './source-driver.mjs';
import {validateSourceArtifact} from './source-config.mjs';
import {validateTargetPlan,TARGET_PHASES} from './target-driver.mjs';
import {validateApiConfig,validateEntries} from './entry.mjs';
import {validateWorkerConfig} from './worker.mjs';
import {validateTargetVariantLineage,variantCaseName} from './target-variant-lineage.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',D='33333333-3333-4333-8333-333333333333';
const HASH=/^[0-9a-f]{64}$/,SHA=/^[0-9a-f]{40}$/,MAX=9223372036854775807n;
const requireValue=(ok,label='TARGET_CONFIG_BINDING')=>{if(!ok)throw Error(label)};
const same=(a,b)=>canonical(a)===canonical(b),clone=x=>JSON.parse(canonical(x));
function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x)}return x}
const integer=(v,{zero=false,max=MAX}={})=>{requireValue(typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<=max&&(zero||BigInt(v)>0n),'TARGET_CONFIG_DECIMAL');return BigInt(v)};
const exact=(x,keys,label='TARGET_CONFIG_SHAPE')=>requireValue(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(','),label);

function validateIndex(index){
 exact(index,['schema','files'],'TARGET_CONFIG_INDEX');requireValue(index.schema==='copy-index-v1'&&Array.isArray(index.files)&&index.files.length<=10000&&Buffer.byteLength(canonical(index))<=4*1024*1024,'TARGET_CONFIG_INDEX');
 const paths=new Set();let bytes=0;
 for(const f of index.files){exact(f,['path','bytes','sha256'],'TARGET_CONFIG_INDEX');requireValue(typeof f.path==='string'&&f.path.length<=512&&!f.path.startsWith('/')&&!f.path.includes('\\')&&!f.path.split('/').some(p=>!p||p==='.'||p==='..')&&!paths.has(f.path)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&HASH.test(f.sha256??''),'TARGET_CONFIG_INDEX');paths.add(f.path);bytes+=f.bytes;requireValue(bytes<=2*1024**3,'TARGET_CONFIG_INDEX')}
}
function journalInput(input,m){
 const records=input.sourceJournalRecords,copy=input.sourceJournalCopyCheckpoint,final=input.sourceJournalFinalCheckpoint;
 const a=validateStageRecords(records,final),b=validateStageRecords(records.slice(0,copy.sequence+1),copy);
 requireValue(a.pending.length===0&&b.pending.length===0,'TARGET_CONFIG_JOURNAL_PENDING');
 const ids=new Set(Object.entries(m.stageOperationIds).filter(([k])=>k.startsWith('source-')).map(([,id])=>id));
 for(const r of records)requireValue(ids.has(r.operationId)&&(r.kind!=='intent'||r.recoveryId===m.source.normal.runId),'TARGET_CONFIG_JOURNAL_SCOPE');
 const id=m.stageOperationIds['source-closed-canary'],intent=records.find(r=>r.kind==='intent'&&r.operationId===id),observed=records.find(r=>r.kind==='observed'&&r.operationId===id);
 requireValue(intent&&observed&&intent.sequence>copy.sequence&&observed.sequence<=final.sequence&&intent.stage==='canary'&&observed.intentHash===intent.hash,'TARGET_CONFIG_CANARY');
 integer(input.canarySecurityVersion,{max:MAX-1n});const identityId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',eventId=m.source.operationIds.postcopyCanary,proofHash=observed.endProofHash;
 const expected={identityId,securityVersion:input.canarySecurityVersion,status:'active'},after={identityId,securityVersion:String(BigInt(input.canarySecurityVersion)+1n),status:'revoked',eventId,proofHash};
 const binding={runId:m.source.normal.runId,controller:m.controllerOwner,generation:m.source.generation,mode:'NORMAL',manifestHash:sha256(input.sourceNormalManifest)};
 requireValue(intent.expectedHash===sha256(expected)&&intent.afterHash===sha256(after)&&observed.observedHash===intent.afterHash&&intent.targetHash===sha256({binding,identityId,eventId}),'TARGET_CONFIG_CANARY');
 return{identityId,eventId,proofHash,expectedSecurityVersion:input.canarySecurityVersion};
}
function sourceEntries(input){
 const{sourceFixture:f,sourceNormalManifest:n}=input,m=input.variantLineage?.originalMaterial??input.material,recovery={mode:'NORMAL',runId:n.runId,manifestHash:sha256(n)};
 requireValue(f&&f.project===m.source.project&&f.generation===m.source.generation&&f.custodyHash===sha256(m)&&f.systemIdentifier===input.sourceResource.systemIdentifier&&same(f.recovery,recovery),'TARGET_CONFIG_SOURCE_FIXTURE');
 exact(f.connections,ROLES,'TARGET_CONFIG_SOURCE_ROLES');
 for(const[r,c]of Object.entries(f.connections)){const database=/_a$/.test(r)?'mecanet_tenant_a':/_b$/.test(r)?'mecanet_tenant_b':r==='saas_demo'?'mecanet_demo':'mecanet_control';requireValue(c.user===r&&c.password===m.source.rolePasswords[r]&&c.host==='postgres'&&c.port===5432&&c.database===database&&c.ssl?.servername==='postgres'&&c.ssl.rejectUnauthorized===true&&typeof c.ssl.ca==='string'&&c.ssl.ca.length>0,'TARGET_CONFIG_SOURCE_CREDENTIAL')}
 for(const[field,purpose]of [['entries','read'],['writerEntries','write'],['maintenanceEntries','maintenance']]){
  validateEntries(f[field],purpose,recovery);requireValue(Object.keys(f[field]).length===(field==='entries'?3:2),'TARGET_CONFIG_SOURCE_ROSTER');
  for(const e of Object.values(f[field]))requireValue(e.connection.password===m.source.rolePasswords[e.connection.user]&&e.credentialVersion==='1'&&e.dataEpoch===(e.purpose==='demo'?'1':'2'),'TARGET_CONFIG_SOURCE_ENTRY');
 }
 const demo=f.entries['demo-v1'];requireValue(demo?.tenantId===D&&demo.purpose==='demo'&&demo.schemaVersion===1&&demo.credentialVersion==='1'&&demo.dataEpoch==='1','TARGET_CONFIG_DEMO');
 return f;
}
function targetFixture(input,recovery){
 const m=input.material,source=sourceEntries(input),ca=input.targetCa;
 requireValue(typeof ca==='string'&&ca.length>0&&ca.length<=65536&&Object.values(source.connections).every(c=>c.ssl.ca!==ca),'TARGET_CONFIG_TARGET_CA');
 const connection=c=>({...clone(c),password:m.target.rolePasswords[c.user],ssl:{...clone(c.ssl),ca}});
 const bind=(field,prefix)=>Object.fromEntries(Object.values(source[field]).map(e=>{
  if(e.purpose==='demo')return[e.secretRef,{...clone(e),connection:connection(e.connection)}];
  const suffix=e.tenantId===A?'a':e.tenantId===B?'b':null;requireValue(suffix,'TARGET_CONFIG_SOURCE_ROSTER');const ref=prefix+'-'+suffix+'-v2';
  return[ref,{...clone(e),secretRef:ref,dataEpoch:m.target.epochs[suffix],credentialVersion:'2',schemaVersion:3,recoveryRunId:recovery.runId,recoveryManifestHash:recovery.manifestHash,connection:connection(e.connection)}];
 }));
 const f={...clone(source),project:m.target.project,generation:m.target.generation,systemIdentifier:input.targetResource.systemIdentifier,recovery,connections:Object.fromEntries(Object.entries(source.connections).map(([r,c])=>[r,connection(c)])),entries:bind('entries','tenant'),writerEntries:bind('writerEntries','writer'),maintenanceEntries:bind('maintenanceEntries','maintenance')};
 if(Object.hasOwn(source,'writerMaintenance')){requireValue(source.writerMaintenance?.user==='saas_writer_maintenance'&&same(source.writerMaintenance,source.connections.saas_writer_maintenance),'TARGET_CONFIG_SOURCE_CREDENTIAL');f.writerMaintenance=clone(f.connections.saas_writer_maintenance)}
 if(Object.hasOwn(source,'clockOwner')){requireValue([m.source.seedClockOwner,m.source.workerClockOwner].includes(source.clockOwner),'TARGET_CONFIG_SOURCE_CLOCK');f.clockOwner=m.target.seedClockOwner}
 validateEntries(f.entries,'read',recovery);validateEntries(f.writerEntries,'write',recovery);validateEntries(f.maintenanceEntries,'maintenance',recovery);return f;
}

/** Build one immutable candidate from externally captured inputs. These hashes
 * are plans, not observations. createTargetDriver must additionally verify the
 * actual files, host end, both source journal heads and live stage witnesses. */
export function makeTargetConfigBundle(input){
 const m=validateMaterial(input?.material),n=input.sourceNormalManifest,lineage=input.variantLineage?validateTargetVariantLineage(input.variantLineage):null,sourceMaterial=lineage?.sourceMaterial??m;
 if(lineage)requireValue(['allclosed','commit-interrupted','promote-prefix','a5-restrictions'].includes(lineage.kind),'TARGET_CONFIG_VARIANT_PURPOSE');
 if(lineage)requireValue(same(m,lineage.material)&&same(n,input.variantLineage.sourceNormalManifest)&&same(input.sourceResource,input.variantLineage.sourceResource)&&same(input.sourceEndProof,input.variantLineage.sourceEndProof)&&same(input.observedEnd,input.variantLineage.observedSourceEnd)&&same(input.copyIndex,input.variantLineage.copyIndex)&&same(input.sourceJournalFinalCheckpoint,input.variantLineage.sourceJournalFinalCheckpoint)&&input.targetResource.dataPath===lineage.paths.data&&input.targetResource.socketPath===lineage.paths.socket,'TARGET_CONFIG_VARIANT_BINDING');
 requireValue(SHA.test(input.baseSha??'')&&input.baseSha==='86985fe7589032f202ebf0cb057a9b1384217151'&&n&&same(n,makeSourceNormalManifest({material:sourceMaterial,custodyHash:sha256(sourceMaterial),resource:input.sourceResource,migrationHashes:n.migrationHashes,sourceCommit:n.sourceCommit})),'TARGET_CONFIG_NORMAL');
 const producerSha=validateSourceArtifact(input.producerArtifact,m,n.migrationHashes),verifierSha=validateSourceArtifact(input.verifierArtifact,m,n.migrationHashes);
 requireValue(producerSha===n.sourceCommit,'TARGET_CONFIG_PRODUCER');
 const sourceEndProofHash=verifyEndProof(input.sourceEndProof,input.observedEnd);
 requireValue(input.sourceEndProof.recoveryId===(lineage?.sourceOriginalRecoveryId??m.recoveryId)&&input.sourceEndProof.sourceResourceHash===sha256(input.sourceResource),'TARGET_CONFIG_SOURCE_END');
 for(const p of input.sourceEndProof.processes)requireValue(p.ownerId===(p.service==='worker'?m.source.workerClockOwner:p.service==='web'?m.source.webOwner:m.source.apiOwners[p.service]),'TARGET_CONFIG_SOURCE_OWNER');
 validateIndex(input.copyIndex);const canary=journalInput(input,m);
 requireValue(Array.isArray(input.sourceGuardSnapshots)&&input.sourceGuardSnapshots.length===2&&same(input.sourceGuardSnapshots.map(g=>g.tenantId).sort(),[A,B]),'TARGET_CONFIG_GUARDS');
 exact(input.sourceFingerprints,['central',A,B],'TARGET_CONFIG_FINGERPRINTS');for(const h of Object.values(input.sourceFingerprints))requireValue(HASH.test(h??''),'TARGET_CONFIG_FINGERPRINTS');
 exact(input.roleVerifierHashes,[...ROLES,'qa_bootstrap'],'TARGET_CONFIG_VERIFIERS');for(const h of Object.values(input.roleVerifierHashes))requireValue(HASH.test(h??''),'TARGET_CONFIG_VERIFIERS');
 const scopes=[A,B].map((tenantId,i)=>{
  const g=input.sourceGuardSnapshots.find(g=>g.tenantId===tenantId),suffix=i?'b':'a';exact(g,['tenantId','generation','dataEpoch','writerVersion','state','guardHash'],'TARGET_CONFIG_GUARDS');
  requireValue(g.generation===m.source.generation&&g.dataEpoch==='2'&&g.state==='CLOSED'&&HASH.test(g.guardHash??''),'TARGET_CONFIG_GUARDS');const c=integer(g.writerVersion,{max:MAX-2n});
  const old=input.sourceLocalImages?.[tenantId];requireValue(old&&old.tenant_id===tenantId&&old.recovery_id===n.runId&&old.controller_owner===m.controllerOwner&&old.mode==='NORMAL'&&old.source_generation===m.source.generation&&old.target_generation===m.source.generation&&old.source_epoch==='2'&&old.target_epoch==='2'&&old.manifest_hash===sha256(n)&&old.source_resource_hash===sha256(input.sourceResource)&&old.target_resource_hash===sha256(input.sourceResource)&&old.stage==='COMPLETE'&&old.version==='2','TARGET_CONFIG_LOCAL_SOURCE');
  return{tenantId,database:'mecanet_tenant_'+suffix,roles:['saas_tenant_'+suffix,'saas_writer_'+suffix],eligibility:i?'RESTRICTED_CLOSED':'OPEN_ELIGIBLE',closedReason:i?'TENANT':'RESTORE',sourceEpoch:'2',targetEpoch:m.target.epochs[suffix],closedVersion:String(c),openVersion:String(c+1n),abortVersion:String(c+2n),schemaVersion:3,readerRef:'tenant-'+suffix+'-v2',writerRef:'writer-'+suffix+'-v2',credentialVersion:'2',writerCredentialVersion:'2'};
 });
 sourceEntries(input);scopes.push({tenantId:D,database:'mecanet_demo',roles:['saas_demo'],eligibility:'RESTRICTED_CLOSED',closedReason:'DEMO',sourceEpoch:null,targetEpoch:null,closedVersion:null,openVersion:null,abortVersion:null,schemaVersion:1,readerRef:'demo-v1',writerRef:null,credentialVersion:'1',writerCredentialVersion:null});
 const manifest={schema:'recovery-manifest-v1',recoveryId:m.recoveryId,provenance:{baseSha:input.baseSha,producerSha,verifierSha,artifactDigest:m.artifactDigest,controllerOwner:m.controllerOwner},source:clone(input.sourceResource),target:clone(input.targetResource),copyIndexHash:sha256(input.copyIndex),copyCheckpoint:clone(input.sourceJournalCopyCheckpoint),sourceClosedProofHash:sourceEndProofHash,journalFinalCheckpoint:clone(input.sourceJournalFinalCheckpoint),scopes};
 validateManifest(manifest,input.observedResources);requireValue(manifest.source.generation===m.source.generation&&manifest.target.generation===m.target.generation&&manifest.source.cohortId===n.runId&&manifest.target.cohortId===m.target.generation&&manifest.source.systemIdentifier===manifest.target.systemIdentifier&&manifest.source.imageDigest===manifest.target.imageDigest,'TARGET_CONFIG_RESOURCE');
 const anchors={manifestHash:sha256(manifest),custodyHash:sha256(m),sourceResourceHash:sha256(manifest.source),targetResourceHash:sha256(manifest.target)};
 const proofBundle={manifest,manifestHash:anchors.manifestHash,custodyHash:anchors.custodyHash,sourceResourceHash:anchors.sourceResourceHash,targetResourceHash:anchors.targetResourceHash,sourceEndProofHash,journalHeadHash:manifest.journalFinalCheckpoint.hash,sourceGuardSnapshots:clone(input.sourceGuardSnapshots),sourceFingerprints:Object.fromEntries([A,B].map(id=>[id,input.sourceFingerprints[id]]))};
 exact(input.sourceClock,['generation','owner','clockVersion','tick'],'TARGET_CONFIG_CLOCK');const c=input.sourceClock;requireValue(c.generation===m.source.generation&&c.owner===m.source.workerClockOwner,'TARGET_CONFIG_CLOCK');integer(c.clockVersion,{max:MAX-2n});integer(c.tick,{zero:true,max:MAX-2n});
 const transferBody={kind:'recovery-initial',mode:'RECOVERY',generation:m.target.generation,runId:m.recoveryId,manifestHash:anchors.manifestHash,previousOwner:m.target.seedClockOwner,nextOwner:m.target.workerClockOwner,transferId:m.target.operationIds.clockTransfer,endProofHash:sourceEndProofHash,expectedClockVersion:String(BigInt(c.clockVersion)+1n),expectedTick:c.tick,confirmed:true,reference:'custodied-'+sourceEndProofHash};
 const transfer={...transferBody,transferHash:sha256(transferBody)};
 const recovery={mode:'RECOVERY',runId:m.recoveryId,manifestHash:anchors.manifestHash};
 validateClockTransfer(transfer,{generation:m.target.generation,owner:m.target.seedClockOwner,clock_version:transfer.expectedClockVersion,tick:transfer.expectedTick},m.target.generation,{...recovery,generation:m.target.generation});
 const runtimeFixture=targetFixture(input,recovery),configs=deriveRuntimeConfig(m,'target',runtimeFixture,recovery,input.targetCa,transfer);
 validateApiConfig(configs.api1,m.target.project);validateApiConfig(configs.api2,m.target.project);validateWorkerConfig(configs.worker,m.target.project);
 const ctx={schema:'target-stage-plan-v1',recoveryId:m.recoveryId,generation:m.target.generation,manifestHash:anchors.manifestHash,custodyHash:anchors.custodyHash,resourceHash:anchors.targetResourceHash,sourceEndProofHash,copyIndexHash:manifest.copyIndexHash,journalHeadHash:manifest.journalFinalCheckpoint.hash,producerSha,verifierSha};
 const run=(stage,version,global_blocked=true)=>({stage,version,global_blocked}),tenant=(stage,version)=>({stage,version});
 const arg=(key,expected,after,extra={})=>({operationKey:key,expected,after,proofHash:sha256({...ctx,operationKey:key,operationId:m.stageOperationIds[key],expected,after,...extra}),...extra});
 const step=(method,key,expected,after,tenantId=null,extra={})=>({method,...(tenantId?{tenantId}:{}),args:arg(key,expected,after,extra)});
 const proofStep=(id,phase,key,expected,after,v)=>({...step('recordTenantProof',key,expected,after,id,{expectedRunVersion:v}),phase});
 const phases={
  'begin-enroll':{steps:[step('begin','target-begin',null,run('PLANNED','1')),step('enroll','target-enroll-a',null,tenant('ENROLLED','1'),A),step('enroll','target-enroll-b',null,tenant('ENROLLED','1'),B)]},
  rotate:{steps:[...ROLES,'qa_bootstrap'].map(role=>({method:'configureRole',role,args:{operationKey:'config-role-'+role,expectedVerifierHash:input.roleVerifierHashes[role],proofHash:sha256({...ctx,role,oldVerifierHash:input.roleVerifierHashes[role],newVerifierHash:sha256(m.target.roleVerifiers[role].verifier)})}}))},
  canary:{steps:[{method:'replayCanary',args:{operationKey:'target-canary',...canary}}]},
  configure:{steps:[step('configureTenant','target-config-a',clone(input.sourceLocalImages[A]),tenant('CLOSED_CONFIGURED','3'),A),proofStep(A,'CLOSED_CONFIGURED','target-proof-config-a',tenant('ENROLLED','1'),tenant('CLOSED_CONFIGURED','2'),'1'),step('configureTenant','target-config-b',clone(input.sourceLocalImages[B]),tenant('CLOSED_CONFIGURED','3'),B),proofStep(B,'CLOSED_CONFIGURED','target-proof-config-b',tenant('ENROLLED','1'),tenant('CLOSED_CONFIGURED','2'),'1'),step('configureControl','target-config-control',run('PLANNED','1'),run('CONFIGURED','2'))]},
  'clock-plan':{steps:[step('prepareClock','target-clock-plan',run('CONFIGURED','2'),run('CONFIGURED','3'),null,{transfer})]},
  'post-worker-verify':{steps:[step('recordClock','target-clock-record',run('CONFIGURED','3'),run('CLOCK_ACQUIRED','4'),null,{transfer}),step('verifyTenant','target-verify-a',tenant('CLOSED_CONFIGURED','3'),tenant('VERIFIED','4'),A),proofStep(A,'VERIFIED','target-proof-verified-a',tenant('CLOSED_CONFIGURED','2'),tenant('VERIFIED','3'),'4'),step('verifyTenant','target-verify-b',tenant('CLOSED_CONFIGURED','3'),tenant('VERIFIED','4'),B),proofStep(B,'VERIFIED','target-proof-verified-b',tenant('CLOSED_CONFIGURED','2'),tenant('VERIFIED','3'),'4'),step('verifyControl','target-verify-control',run('CLOCK_ACQUIRED','4'),run('VERIFIED','5'))]},
  promotion:{steps:[step('preparePromotion','target-prepare-promote',run('VERIFIED','5'),run('PROMOTING','6')),step('openLocal','target-open-a',tenant('VERIFIED','4'),tenant('LOCAL_OPEN','5'),A),proofStep(A,'LOCAL_OPEN','target-proof-open-a',tenant('PREPARED','4'),tenant('LOCAL_OPEN','5'),'6'),step('seal','target-seal-a',tenant('LOCAL_OPEN','5'),tenant('SEALED','6'),A),proofStep(A,'SEALED','target-proof-seal-a',tenant('LOCAL_OPEN','5'),tenant('SEALED','6'),'6'),step('seal','target-seal-b',tenant('VERIFIED','4'),tenant('SEALED','5'),B),proofStep(B,'SEALED','target-proof-seal-b',tenant('VERIFIED','3'),tenant('SEALED','4'),'6')]},
  activation:{steps:[step('activate','target-activate',run('PROMOTING','6'),run('COMPLETE','7',false))]},
  'abort-close':{closure:'FROM_COMPLETE',steps:[step('closeAdmission','target-close-abort',run('COMPLETE','7',false),run('COMPLETE','7')),step('abortBegin','target-begin-abort',run('COMPLETE','7'),run('ABORTING','8'))]},
  'abort-local':{steps:[step('abortTenant','target-abort-a',tenant('SEALED','6'),tenant('ABORTED_CLOSED','7'),A),proofStep(A,'ABORTED_CLOSED','target-proof-abort-a',tenant('SEALED','6'),tenant('ABORTED_CLOSED','7'),'8'),step('abortTenant','target-abort-b',tenant('SEALED','5'),tenant('ABORTED_CLOSED','6'),B),proofStep(B,'ABORTED_CLOSED','target-proof-abort-b',tenant('SEALED','4'),tenant('ABORTED_CLOSED','5'),'8')]},
  'abort-finish':{steps:[step('abortComplete','target-finish-abort',run('ABORTING','8'),run('ABORTED_CLOSED','9'))]}
 };
 for(const[name,p]of Object.entries(phases)){p.caseName=lineage?variantCaseName(lineage.kind,name):'target-'+name;p.proofHash=sha256({...ctx,phase:name,caseName:p.caseName,stepsHash:sha256(p.steps)})}
 requireValue(same(Object.keys(phases),TARGET_PHASES),'TARGET_CONFIG_PHASES');
 const plan={schema:'target-driver-plan-v1',recoveryId:m.recoveryId,generation:m.target.generation,sourceSha:verifierSha,producerSha,custodyHash:anchors.custodyHash,manifestHash:anchors.manifestHash,resourceHash:anchors.targetResourceHash,sourceEndProofHash,copyIndexHash:manifest.copyIndexHash,journalHeadHash:manifest.journalFinalCheckpoint.hash,phases},planHash=sha256(plan);
 validateTargetPlan({plan,planHash,material:m,anchors,proofBundle,variantLineage:input.variantLineage??null});
 return freeze(clone({schema:'target-config-bundle-v1',manifest,anchors,proofBundle,plan,planHash,configs,runtimeFixture,sourceJournalRecords:input.sourceJournalRecords,sourceJournalFinalCheckpoint:input.sourceJournalFinalCheckpoint,sourceJournalCopyCheckpoint:input.sourceJournalCopyCheckpoint,copyIndex:input.copyIndex,sourceEndProof:input.sourceEndProof,observedEnd:input.observedEnd,sourceCentralFingerprint:input.sourceFingerprints.central,...(lineage?{variantLineageHash:lineage.additionHash}:{}),physicalRecovery:'NOT VERIFIED'}));
}
