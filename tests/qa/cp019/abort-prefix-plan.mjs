// Prospective immutable compensation. No I/O, SQL, ID selection or observed-
// version adoption occurs on import or while constructing this extension.
import {canonical,sha256,validateManifest,verifyEndProof,validateStageRecords} from '../../../server/saas/recovery/protocol.js';
import {validateMaterial} from '../../../server/saas/recovery/custody.js';
import {validateTargetPlan} from './target-driver.mjs';
import {validateTargetVariantLineage,variantCaseName} from './target-variant-lineage.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',HASH=/^[0-9a-f]{64}$/;
const KEYS=['target-close-abort','target-begin-abort','target-abort-a','target-proof-abort-a','target-abort-b','target-proof-abort-b','target-finish-abort'];
export const ABORT_PREFIX_POINTS=Object.freeze(['PROMOTION_BEFORE_OPEN_A','PROMOTION_AFTER_OPEN_A']);
const refuse=(ok,label='ABORT_PREFIX_BINDING')=>{if(!ok)throw Error(label)},same=(a,b)=>canonical(a)===canonical(b),clone=x=>JSON.parse(canonical(x));
function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x)}return x}
const run=(stage,version,global_blocked=true)=>({stage,version,global_blocked}),tenant=(stage,version)=>({stage,version});
function fixedParent(p){
 const verify=p.phases['post-worker-verify'].steps,promote=p.phases.promotion.steps,abort=p.phases['abort-close'];
 const wanted=[['verifyTenant',A,tenant('CLOSED_CONFIGURED','3'),tenant('VERIFIED','4')],['recordTenantProof',A,tenant('CLOSED_CONFIGURED','2'),tenant('VERIFIED','3')],['verifyTenant',B,tenant('CLOSED_CONFIGURED','3'),tenant('VERIFIED','4')],['recordTenantProof',B,tenant('CLOSED_CONFIGURED','2'),tenant('VERIFIED','3')],['verifyControl',undefined,run('CLOCK_ACQUIRED','4'),run('VERIFIED','5')]];
 refuse(verify.length===6&&wanted.every(([method,id,before,after],i)=>{const s=verify[i+1];return s.method===method&&s.tenantId===id&&same(s.args.expected,before)&&same(s.args.after,after)&&(method!=='recordTenantProof'||s.phase==='VERIFIED'&&s.args.expectedRunVersion==='4')}),'ABORT_PREFIX_PARENT_STAGE');
 refuse(same(promote[0].args.expected,run('VERIFIED','5'))&&same(promote[0].args.after,run('PROMOTING','6'))&&same(promote[1].args.expected,tenant('VERIFIED','4'))&&same(promote[1].args.after,tenant('LOCAL_OPEN','5'))&&same(promote[2].args.expected,tenant('PREPARED','4'))&&same(promote[2].args.after,tenant('LOCAL_OPEN','5'))&&promote[2].args.expectedRunVersion==='6','ABORT_PREFIX_PARENT_STAGE');
 refuse(abort.closure==='FROM_COMPLETE'&&same(abort.steps[0].args.expected,run('COMPLETE','7',false))&&same(abort.steps[0].args.after,run('COMPLETE','7'))&&same(abort.steps[1].args.expected,run('COMPLETE','7'))&&same(abort.steps[1].args.after,run('ABORTING','8')),'ABORT_PREFIX_PARENT_ABORT');
 const locals=p.phases['abort-local'].steps;refuse(same(locals.map(s=>[s.args.expected,s.args.after]),[[tenant('SEALED','6'),tenant('ABORTED_CLOSED','7')],[tenant('SEALED','6'),tenant('ABORTED_CLOSED','7')],[tenant('SEALED','5'),tenant('ABORTED_CLOSED','6')],[tenant('SEALED','4'),tenant('ABORTED_CLOSED','5')]])&&locals[1].args.expectedRunVersion==='8'&&locals[3].args.expectedRunVersion==='8','ABORT_PREFIX_PARENT_ABORT');
 const finish=p.phases['abort-finish'].steps[0];refuse(same(finish.args.expected,run('ABORTING','8'))&&same(finish.args.after,run('ABORTED_CLOSED','9')),'ABORT_PREFIX_PARENT_ABORT');
}
function bases(m,a,bundle){
 const runBase={id:m.recoveryId,controller_owner:m.controllerOwner,mode:'RECOVERY',source_generation:m.source.generation,target_generation:m.target.generation,manifest_hash:a.manifestHash,custody_hash:a.custodyHash,journal_hash:bundle.journalHeadHash,source_end_proof_hash:bundle.sourceEndProofHash,source_resource_hash:a.sourceResourceHash,target_resource_hash:a.targetResourceHash,expected_tenants:[A,B],restore_restriction_ids:[m.source.operationIds.restore],seed_clock_owner:m.target.seedClockOwner,initial_worker_owner:m.target.workerClockOwner};
 return(kind,id)=>{if(kind==='run')return runBase;const s=bundle.manifest.scopes.find(x=>x.tenantId===id),g=bundle.sourceGuardSnapshots.find(x=>x.tenantId===id),shared={recovery_id:m.recoveryId,tenant_id:id,source_generation:m.source.generation,target_generation:m.target.generation,source_epoch:'2',target_epoch:'3',eligibility:s.eligibility,closed_reason:s.closedReason,closed_version:s.closedVersion,open_version:s.openVersion,abort_version:s.abortVersion,guard_hash:g.guardHash};
  if(kind==='local')return{...shared,controller_owner:m.controllerOwner,mode:'RECOVERY',manifest_hash:a.manifestHash,source_resource_hash:a.sourceResourceHash,target_resource_hash:a.targetResourceHash};
  return{...shared,directory_status:id===A?'active':'blocked',reader_version:s.credentialVersion,writer_credential_version:s.writerCredentialVersion,reader_secret_ref:s.readerRef,writer_secret_ref:s.writerRef,restore_restriction_id:id===A?m.source.operationIds.restore:null};
 };
}
/** A headed caller array is insufficient: all five VERIFIED images and SQL
 * targets must equal the original control program. Physical custody of that
 * checkpoint and fresh end/fence witnesses still belong to the root. */
function proveVerifiedJournal(m,a,bundle,p,records,checkpoint){
 const checked=validateStageRecords(records,checkpoint),futureKeys=[...p.phases.promotion.steps,...p.phases.activation.steps,...Object.entries(p.phases).filter(([name])=>name.startsWith('abort-')).flatMap(([,phase])=>phase.steps)].map(s=>s.args.operationKey),unused=new Set([...futureKeys,...KEYS].map(k=>m.stageOperationIds[k]));unused.add(m.target.operationIds.abort);
 refuse(records.every(r=>!unused.has(r.operationId)),'ABORT_PREFIX_IDS_ALREADY_USED');refuse(checked.pending.length===0,'ABORT_PREFIX_JOURNAL_NOT_PROVEN');
 const allowed=new Set(Object.entries(m.stageOperationIds).filter(([key])=>key.startsWith('target-')||key.startsWith('config-role-')).map(([,id])=>id));refuse(records.every(r=>allowed.has(r.operationId)&&(r.kind!=='intent'||r.recoveryId===m.recoveryId)),'ABORT_PREFIX_JOURNAL_SCOPE');
 const base=bases(m,a,bundle),binding={runId:m.recoveryId,controller:m.controllerOwner,generation:m.target.generation,mode:'RECOVERY',manifestHash:a.manifestHash};let previous=-1;
 for(const step of p.phases['post-worker-verify'].steps.slice(1)){
  const args=step.args,id=step.tenantId??null,kind=step.method==='verifyTenant'?'local':step.method==='recordTenantProof'?'tenant':'run',operationId=m.stageOperationIds[args.operationKey],intent=records.find(r=>r.kind==='intent'&&r.operationId===operationId),observed=records.find(r=>r.kind==='observed'&&r.operationId===operationId);
  const stage=kind==='local'?'verify-tenant':kind==='tenant'?'proof-tenant':'proof-central',functionName=kind==='local'?'inventory.verify_recovery':kind==='tenant'?'saas.record_recovery_tenant_proof':'saas.verify_recovery_control';
  const values=kind==='local'?[m.recoveryId,m.controllerOwner,args.expected.version,args.proofHash]:kind==='tenant'?[m.recoveryId,m.controllerOwner,id,'VERIFIED',args.expectedRunVersion,args.expected.version,args.proofHash]:[m.recoveryId,m.controllerOwner,args.expected.version,args.proofHash];
  const expected={...base(kind,id),...args.expected},after={...base(kind,id),...args.after,[kind==='local'?'proof_hash':'verified_proof_hash']:args.proofHash},target={binding,kind,tenantId:id,functionName,valuesHash:sha256(values)};
  refuse(intent&&observed&&intent.stage===stage&&intent.recoveryId===m.recoveryId&&intent.expectedHash===sha256(expected)&&intent.afterHash===sha256(after)&&intent.targetHash===sha256(target)&&observed.endProofHash===args.proofHash&&observed.sequence===intent.sequence+1&&intent.sequence>previous,'ABORT_PREFIX_JOURNAL_NOT_PROVEN');previous=observed.sequence;
 }
 refuse(previous===checkpoint.sequence,'ABORT_PREFIX_JOURNAL_NOT_PROVEN');
}
/** Select BEFORE/AFTER only before promotion/fault. An uncertain commit cannot
 * select another variant later by inspecting SQL; it remains KEEP/UNKNOWN. */
export function makeAbortPrefixPlan({material,anchors,proofBundle,parentPlan,parentPlanHash,sourceEndProof,observedSourceEnd,targetJournalRecords,targetJournalCheckpoint,faultPoint,variantLineage=null,variantLineageHash=null}={}){
 const m=validateMaterial(material),a=clone(anchors),bundle=clone(proofBundle);refuse(ABORT_PREFIX_POINTS.includes(faultPoint),'ABORT_PREFIX_UNKNOWN_POINT');
 const lineage=variantLineage?validateTargetVariantLineage(variantLineage):null;
 if(lineage)refuse(lineage.kind==='promote-prefix'&&lineage.additionHash===variantLineageHash&&same(m,lineage.material)&&same(sourceEndProof,variantLineage.sourceEndProof)&&same(observedSourceEnd,variantLineage.observedSourceEnd)&&same(bundle.manifest.source,variantLineage.sourceResource)&&bundle.manifest.copyIndexHash===sha256(variantLineage.copyIndex)&&same(bundle.manifest.journalFinalCheckpoint,variantLineage.sourceJournalFinalCheckpoint)&&bundle.manifest.target.dataPath===lineage.paths.data&&bundle.manifest.target.socketPath===lineage.paths.socket,'ABORT_PREFIX_VARIANT_BINDING');
 else refuse(variantLineageHash===null,'ABORT_PREFIX_VARIANT_BINDING');
 const p=validateTargetPlan({plan:parentPlan,planHash:parentPlanHash,material:m,anchors:a,proofBundle:bundle,variantLineage});fixedParent(p);validateManifest(bundle.manifest,{source:bundle.manifest.source,target:bundle.manifest.target});
 refuse(verifyEndProof(sourceEndProof,observedSourceEnd)===bundle.sourceEndProofHash&&sourceEndProof.recoveryId===(lineage?.sourceOriginalRecoveryId??m.recoveryId)&&sourceEndProof.sourceResourceHash===a.sourceResourceHash&&parentPlan.sourceEndProofHash===bundle.sourceEndProofHash,'ABORT_PREFIX_SOURCE_END');
 for(const proc of sourceEndProof.processes)refuse(proc.ownerId===(proc.service==='worker'?m.source.workerClockOwner:proc.service==='web'?m.source.webOwner:m.source.apiOwners[proc.service]),'ABORT_PREFIX_SOURCE_OWNER');
 const records=clone(targetJournalRecords),head=clone(targetJournalCheckpoint);proveVerifiedJournal(m,a,bundle,p,records,head);
 const afterOpen=faultPoint==='PROMOTION_AFTER_OPEN_A',scope=id=>bundle.manifest.scopes.find(s=>s.tenantId===id),fence=(id,state,writerVersion)=>({generation:m.target.generation,dataEpoch:scope(id).targetEpoch,state,writerVersion});
 const expectedPrefix={run:run('PROMOTING','6'),admissionFence:{generation:m.target.generation,barrier:true},centralTenants:{[A]:tenant('PREPARED','4'),[B]:tenant('VERIFIED','3')},localGuards:{[A]:tenant(afterOpen?'LOCAL_OPEN':'VERIFIED',afterOpen?'5':'4'),[B]:tenant('VERIFIED','4')},centralFences:{[A]:fence(A,'CLOSED',scope(A).openVersion),[B]:fence(B,'CLOSED',scope(B).closedVersion)},localFences:{[A]:fence(A,afterOpen?'OPEN':'CLOSED',afterOpen?scope(A).openVersion:scope(A).closedVersion),[B]:fence(B,'CLOSED',scope(B).closedVersion)},restrictions:{restoreId:m.source.operationIds.restore,restoreActive:true,tenantBId:m.source.operationIds.blockB,tenantBActive:true}};
 const terminal={run:run('ABORTED_CLOSED','8'),admissionFence:{generation:m.target.generation,barrier:true},centralTenants:{[A]:tenant('ABORTED_CLOSED','5'),[B]:tenant('ABORTED_CLOSED','4')},localGuards:{[A]:tenant('ABORTED_CLOSED',afterOpen?'6':'5'),[B]:tenant('ABORTED_CLOSED','5')},centralFences:{[A]:fence(A,'CLOSED',scope(A).abortVersion),[B]:fence(B,'CLOSED',scope(B).closedVersion)},localFences:{[A]:fence(A,'CLOSED',scope(A).abortVersion),[B]:fence(B,'CLOSED',scope(B).closedVersion)}};
 const binding={parentPlanHash,recoveryId:m.recoveryId,generation:m.target.generation,sourceSha:p.sourceSha,producerSha:p.producerSha,custodyHash:a.custodyHash,manifestHash:a.manifestHash,resourceHash:a.targetResourceHash,sourceResourceHash:a.sourceResourceHash,sourceEndProofHash:bundle.sourceEndProofHash,copyIndexHash:p.copyIndexHash,sourceJournalHeadHash:p.journalHeadHash,...(lineage?{variantLineageHash:lineage.additionHash}:{}),faultPoint,targetJournalCheckpoint:head,targetJournalRecordsHash:sha256(records),prefixHash:sha256(expectedPrefix),terminalHash:sha256(terminal),abortId:m.target.operationIds.abort};
 const step=(method,key,expected,after,id,extra={})=>({method,...(id?{tenantId:id}:{}),args:{operationKey:key,expected,after,proofHash:sha256({schema:'cp019-abort-prefix-step-v1',...binding,operationId:m.stageOperationIds[key],method,tenantId:id??null,expected,after,...extra}),...extra}});
 const proof=(id,key,expected,after)=>({...step('recordTenantProof',key,expected,after,id,{expectedRunVersion:'7'}),phase:'ABORTED_CLOSED'});
 const abortPhases={
  'abort-close':{caseName:'target-abort-close',closure:'ALREADY_CLOSED',steps:[step('abortBegin','target-begin-abort',run('PROMOTING','6'),run('ABORTING','7'))]},
  'abort-local':{caseName:'target-abort-local',steps:[step('abortTenant','target-abort-a',expectedPrefix.localGuards[A],terminal.localGuards[A],A),proof(A,'target-proof-abort-a',expectedPrefix.centralTenants[A],terminal.centralTenants[A]),step('abortTenant','target-abort-b',expectedPrefix.localGuards[B],terminal.localGuards[B],B),proof(B,'target-proof-abort-b',expectedPrefix.centralTenants[B],terminal.centralTenants[B])]},
  'abort-finish':{caseName:'target-abort-finish',steps:[step('abortComplete','target-finish-abort',run('ABORTING','7'),run('ABORTED_CLOSED','8'))]}
 };
 for(const[name,phase]of Object.entries(abortPhases)){if(lineage)phase.caseName=variantCaseName(lineage.kind,name);phase.proofHash=sha256({schema:'cp019-abort-prefix-phase-v1',...binding,phase:name,caseName:phase.caseName,stepsHash:sha256(phase.steps)})}
 const extension={schema:'recovery-abort-prefix-plan-v1',caseName:'target-promote-fault',...binding,operationIds:Object.fromEntries(KEYS.map(key=>[key,m.stageOperationIds[key]])),expectedPrefix,terminal,abortPhases,physicalAbort:'NOT VERIFIED'};refuse(Buffer.byteLength(canonical(extension))<=262144,'ABORT_PREFIX_SIZE');return freeze(clone(extension));
}
export function validateAbortPrefixPlan({extension,extensionHash,...input}={}){
 refuse(HASH.test(extensionHash??'')&&sha256(extension)===extensionHash,'ABORT_PREFIX_CUSTODY');const expected=makeAbortPrefixPlan(input);refuse(same(extension,expected),'ABORT_PREFIX_TUPLE');return expected;
}
/** Root holds the private controller lock throughout and reads its current real
 * journal/head in observeJournalHead, never the caller's historic array. A
 * changed head leaves immutable partial material KEEP, without a custody PASS.
 * No metadata return substitutes for the later fresh SQL/end witnesses. */
export async function custodyAbortPrefixPlan({extension,extensionHash,publish,readback,observeJournalHead,...input}={}){
 const selected=validateAbortPrefixPlan({extension,extensionHash,...input});refuse(typeof publish==='function'&&typeof readback==='function','ABORT_PREFIX_CUSTODY');refuse(typeof observeJournalHead==='function','ABORT_PREFIX_LIVE_JOURNAL_HEAD');
 async function currentHead(){const h=await observeJournalHead();refuse(h&&Object.keys(h).sort().join(',')==='checkpoint,recordsHash'&&same(h.checkpoint,selected.targetJournalCheckpoint)&&h.recordsHash===selected.targetJournalRecordsHash,'ABORT_PREFIX_LIVE_JOURNAL_HEAD')}
 await currentHead();const written=await publish(selected,extensionHash);refuse(written?.sha256===extensionHash,'ABORT_PREFIX_NOT_DURABLE');const saved=await readback(extensionHash);refuse(saved?.sha256===extensionHash&&same(saved.value,selected),'ABORT_PREFIX_NOT_DURABLE');await currentHead();return saved;
}
