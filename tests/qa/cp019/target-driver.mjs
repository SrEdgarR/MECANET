import {CASE_LIMITS,GLOBAL_LIMITS} from './budget-limits.mjs';
// Private, programmatic target composition. Importing it performs no I/O.
// The composition root supplies already-custodied material and a live witness;
// this file never selects IDs, secrets, versions, processes or infrastructure.
import {canonical,sha256,validateManifest,verifyEndProof,verifyCopyIndex,validateStageRecords} from '../../../server/saas/recovery/protocol.js';
import {validateMaterial,ROLES} from '../../../server/saas/recovery/custody.js';
import {createRecoveryControl,validateControlBundle} from './control.mjs';
import {measuredPool} from './ledger.mjs';
import {validateClockRestartPlan} from './clock-restart-plan.mjs';
import {validateAbortPrefixPlan} from './abort-prefix-plan.mjs';
import {validateTargetVariantLineage,variantCaseName} from './target-variant-lineage.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const HASH=/^[0-9a-f]{64}$/,SHA=/^[0-9a-f]{40}$/,MAX=9223372036854775807n;
const refuse=(ok,label='TARGET_DRIVER_BINDING')=>{if(!ok)throw Error(label)};
const exact=(x,keys)=>refuse(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(','));
const clone=x=>JSON.parse(canonical(x));
function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x)}return x}
function integer(s){refuse(typeof s==='string'&&/^[1-9][0-9]{0,18}$/.test(s)&&BigInt(s)<=MAX,'TARGET_DRIVER_TUPLE');return BigInt(s)}
export const TARGET_PHASES=Object.freeze(['begin-enroll','rotate','canary','configure','clock-plan','post-worker-verify','promotion','activation','abort-close','abort-local','abort-finish']);
export const ABORT_PREFIX_EXECUTION_PHASE='promote-fault';
const s=(method,key,tenantId,phase)=>({method,key,...(tenantId?{tenantId}:{}),...(phase?{phase}:{})});
const fixed={
 'begin-enroll':[s('begin','target-begin'),s('enroll','target-enroll-a',A),s('enroll','target-enroll-b',B)],
 rotate:[...ROLES,'qa_bootstrap'].map(role=>({...s('configureRole','config-role-'+role),role})),
 canary:[s('replayCanary','target-canary')],
 configure:[s('configureTenant','target-config-a',A),s('recordTenantProof','target-proof-config-a',A,'CLOSED_CONFIGURED'),s('configureTenant','target-config-b',B),s('recordTenantProof','target-proof-config-b',B,'CLOSED_CONFIGURED'),s('configureControl','target-config-control')],
 'clock-plan':[s('prepareClock','target-clock-plan')],
 'post-worker-verify':[s('recordClock','target-clock-record'),s('verifyTenant','target-verify-a',A),s('recordTenantProof','target-proof-verified-a',A,'VERIFIED'),s('verifyTenant','target-verify-b',B),s('recordTenantProof','target-proof-verified-b',B,'VERIFIED'),s('verifyControl','target-verify-control')],
 promotion:[s('preparePromotion','target-prepare-promote'),s('openLocal','target-open-a',A),s('recordTenantProof','target-proof-open-a',A,'LOCAL_OPEN'),s('seal','target-seal-a',A),s('recordTenantProof','target-proof-seal-a',A,'SEALED'),s('seal','target-seal-b',B),s('recordTenantProof','target-proof-seal-b',B,'SEALED')],
 activation:[s('activate','target-activate')],
 'abort-close':[s('closeAdmission','target-close-abort'),s('abortBegin','target-begin-abort')],
 'abort-local':[s('abortTenant','target-abort-a',A),s('recordTenantProof','target-proof-abort-a',A,'ABORTED_CLOSED'),s('abortTenant','target-abort-b',B),s('recordTenantProof','target-proof-abort-b',B,'ABORTED_CLOSED')],
 'abort-finish':[s('abortComplete','target-finish-abort')]
};
const afterStage={begin:'PLANNED',enroll:'ENROLLED',configureTenant:'CLOSED_CONFIGURED',configureControl:'CONFIGURED',recordClock:'CLOCK_ACQUIRED',verifyTenant:'VERIFIED',verifyControl:'VERIFIED',preparePromotion:'PROMOTING',openLocal:'LOCAL_OPEN',seal:'SEALED',activate:'COMPLETE',abortBegin:'ABORTING',abortTenant:'ABORTED_CLOSED',abortComplete:'ABORTED_CLOSED'};
const runMethods=new Set(['begin','configureControl','prepareClock','recordClock','verifyControl','preparePromotion','activate','closeAdmission','abortBegin','abortComplete']);
function validateArgs(step,template,material,anchors){
 const x=step.args;refuse(x&&typeof x==='object'&&!Array.isArray(x)&&x.operationKey===template.key&&HASH.test(x.proofHash??''),'TARGET_DRIVER_ARGUMENTS');
 if(step.method==='configureRole'){exact(x,['operationKey','expectedVerifierHash','proofHash']);refuse(HASH.test(x.expectedVerifierHash??''));return}
 if(step.method==='replayCanary'){exact(x,['operationKey','identityId','expectedSecurityVersion','eventId','proofHash']);refuse(x.identityId==='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'&&x.eventId===material.source.operationIds.postcopyCanary);integer(x.expectedSecurityVersion);return}
 const more=step.method==='recordTenantProof'?['expectedRunVersion']:['prepareClock','recordClock'].includes(step.method)?['transfer']:[];
 exact(x,['operationKey','expected','after','proofHash',...more]);
 if(x.expected===null)refuse(['begin','enroll'].includes(step.method)&&x.after?.version==='1','TARGET_DRIVER_TUPLE');
 else{refuse(x.expected&&typeof x.expected.stage==='string');const before=integer(x.expected.version),after=integer(x.after?.version);refuse(after===(step.method==='closeAdmission'?before:before+1n)&&after<=MAX,'TARGET_DRIVER_TUPLE')}
 refuse(x.after&&typeof x.after.stage==='string'&&x.after.stage===(step.method==='recordTenantProof'?step.phase:['prepareClock','closeAdmission'].includes(step.method)?x.expected.stage:afterStage[step.method]),'TARGET_DRIVER_STAGE');
 if(runMethods.has(step.method))refuse(x.after.global_blocked===(step.method!=='activate'),'TARGET_DRIVER_BARRIER');
 if(step.method==='closeAdmission')refuse(x.expected.global_blocked===false,'TARGET_DRIVER_BARRIER');
 if(step.method==='recordTenantProof')integer(x.expectedRunVersion);
 if(['prepareClock','recordClock'].includes(step.method)){
  const t=x.transfer;exact(t,['kind','mode','generation','runId','manifestHash','previousOwner','nextOwner','transferId','transferHash','endProofHash','expectedClockVersion','expectedTick','confirmed','reference']);
  refuse(t.kind==='recovery-initial'&&t.mode==='RECOVERY'&&t.generation===material.target.generation&&t.runId===material.recoveryId&&t.manifestHash===anchors.manifestHash&&t.previousOwner===material.target.seedClockOwner&&t.nextOwner===material.target.workerClockOwner&&t.transferId===material.target.operationIds.clockTransfer&&HASH.test(t.transferHash??'')&&HASH.test(t.endProofHash??'')&&t.confirmed===true&&t.reference==='custodied-'+t.endProofHash,'TARGET_DRIVER_CLOCK');
  for(const v of [t.expectedClockVersion,t.expectedTick])refuse(typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<MAX,'TARGET_DRIVER_CLOCK');
 }
}
/** Pure validation of the exact preregistered program. No discovery, fallback
 * or adoption of current state supplies missing expected/after values. */
export function validateTargetPlan({plan,planHash,material,anchors,proofBundle,variantLineage=null}){
 validateMaterial(material);validateControlBundle({material,anchors,bundle:proofBundle});
 const lineage=variantLineage?validateTargetVariantLineage(variantLineage):null;
 if(lineage)refuse(canonical(material)===canonical(lineage.material)&&canonical(proofBundle.manifest.source)===canonical(variantLineage.sourceResource)&&proofBundle.manifest.target.dataPath===lineage.paths.data&&proofBundle.manifest.target.socketPath===lineage.paths.socket&&proofBundle.sourceEndProofHash===sha256(variantLineage.sourceEndProof),'TARGET_DRIVER_VARIANT_BINDING');
 exact(plan,['schema','recoveryId','generation','sourceSha','producerSha','custodyHash','manifestHash','resourceHash','sourceEndProofHash','copyIndexHash','journalHeadHash','phases']);
 refuse(plan.schema==='target-driver-plan-v1'&&HASH.test(planHash??'')&&sha256(plan)===planHash&&Buffer.byteLength(canonical(plan))<=262144&&SHA.test(plan.sourceSha??'')&&plan.sourceSha===proofBundle.manifest.provenance.verifierSha&&plan.producerSha===proofBundle.manifest.provenance.producerSha,'TARGET_DRIVER_PLAN');
 for(const[k,v]of Object.entries({recoveryId:material.recoveryId,generation:material.target.generation,custodyHash:anchors.custodyHash,manifestHash:anchors.manifestHash,resourceHash:anchors.targetResourceHash,sourceEndProofHash:proofBundle.sourceEndProofHash,copyIndexHash:proofBundle.manifest.copyIndexHash,journalHeadHash:proofBundle.journalHeadHash}))refuse(plan[k]===v,'TARGET_DRIVER_PLAN_ANCHOR');
 exact(plan.phases,TARGET_PHASES);
 for(const name of TARGET_PHASES){
  const p=plan.phases[name];exact(p,['caseName','proofHash','steps',...(name==='abort-close'?['closure']:[])]);
  refuse(p.caseName===(lineage?variantCaseName(lineage.kind,name):'target-'+name)&&HASH.test(p.proofHash??'')&&Array.isArray(p.steps),'TARGET_DRIVER_PHASE');
  if(name==='abort-close')refuse(['FROM_COMPLETE','ALREADY_CLOSED'].includes(p.closure),'TARGET_DRIVER_ABORT');
  const templates=name==='abort-close'&&p.closure==='ALREADY_CLOSED'?fixed[name].slice(1):fixed[name];refuse(p.steps.length===templates.length,'TARGET_DRIVER_STEP_ORDER');
  for(const[i,step]of p.steps.entries()){
   const t=templates[i];exact(step,['method','args',...(t.tenantId?['tenantId']:[]),...(t.phase?['phase']:[]),...(t.role?['role']:[])]);
   for(const k of ['method','tenantId','phase','role'])refuse(step[k]===t[k],'TARGET_DRIVER_STEP_ORDER');validateArgs(step,t,material,anchors);
  }
  if(name==='abort-close'){const expected=p.steps.at(-1).args.expected;refuse(expected.global_blocked===true,'TARGET_DRIVER_ABORT');if(p.closure==='FROM_COMPLETE')refuse(p.steps[0].args.expected.stage==='COMPLETE'&&canonical(p.steps[0].args.after)===canonical(expected),'TARGET_DRIVER_ABORT')}
 }
 const first=plan.phases['clock-plan'].steps[0].args.transfer,second=plan.phases['post-worker-verify'].steps[0].args.transfer;refuse(canonical(first)===canonical(second)&&first.endProofHash===plan.sourceEndProofHash,'TARGET_DRIVER_CLOCK');
 return freeze(clone(plan));
}
/** Actual manifest/index/end verification precedes every target SQL effect.
 * Witnesses are private observed receipts, never booleans or metadata-only ACKs.
 * Root callbacks must themselves use measured pools for their SQL inspections. */
export async function createTargetDriver({material,anchors,proofBundle,plan,planHash,observedResources,sourceEndProof,observedEnd,copyRoot,copyIndex,sourceJournalRecords,sourceJournalFinalCheckpoint,sourceJournalCopyCheckpoint,pools,ledger,journal,verifyStageProof,clockRestart=null,abortPrefix=null,variantLineage=null,variantLineageHash=null}={}){
 const lineage=variantLineage?validateTargetVariantLineage(variantLineage):null;
 if(lineage)refuse(variantLineageHash===lineage.additionHash&&canonical(material)===canonical(lineage.material)&&canonical(sourceEndProof)===canonical(variantLineage.sourceEndProof)&&canonical(observedEnd)===canonical(variantLineage.observedSourceEnd)&&canonical(copyIndex)===canonical(variantLineage.copyIndex)&&canonical(sourceJournalFinalCheckpoint)===canonical(variantLineage.sourceJournalFinalCheckpoint)&&canonical(proofBundle?.manifest?.source)===canonical(variantLineage.sourceResource)&&proofBundle.manifest.target.dataPath===lineage.paths.data&&proofBundle.manifest.target.socketPath===lineage.paths.socket,'TARGET_DRIVER_VARIANT_BINDING');
 else refuse(variantLineageHash===null,'TARGET_DRIVER_VARIANT_BINDING');
 const chosen=freeze(clone(validateMaterial(material))),a=freeze(clone(anchors)),bundle=freeze(clone(proofBundle));
 const selected=validateTargetPlan({plan,planHash,material:chosen,anchors:a,proofBundle:bundle,variantLineage});
 const restartContext=clockRestart?freeze(clone(clockRestart)):null;
 refuse(!(clockRestart&&abortPrefix),'TARGET_DRIVER_COMPENSATION_CONTEXT');
 const restart=restartContext?validateClockRestartPlan({...restartContext,material:chosen,anchors:a,parentPlan:selected,parentPlanHash:planHash}):null;
 const prefixContext=abortPrefix?freeze(clone(abortPrefix)):null;
 const prefixPlan=prefixContext?validateAbortPrefixPlan({...prefixContext,material:chosen,anchors:a,proofBundle:bundle,parentPlan:selected,parentPlanHash:planHash,sourceEndProof,observedSourceEnd:observedEnd,...(lineage?{variantLineage,variantLineageHash}:{} )}):null;
 const prefixSteps=prefixPlan?selected.phases.promotion.steps.slice(0,prefixPlan.faultPoint==='PROMOTION_AFTER_OPEN_A'?2:1):null;
 const prefixExecution=prefixPlan?{caseName:'target-promote-fault',steps:prefixSteps,proofHash:sha256({schema:'cp019-abort-prefix-execution-v1',abortPrefixPlanHash:prefixContext.extensionHash,faultPoint:prefixPlan.faultPoint,stepsHash:sha256(prefixSteps)})}:null;
 refuse(typeof copyRoot==='string'&&copyRoot&&typeof verifyStageProof==='function'&&ledger?.charge&&ledger?.enter&&ledger?.snapshot&&pools?.control?.query&&[A,B].every(id=>pools.tenants?.[id]?.query)&&journal?.before&&journal?.after,'TARGET_DRIVER_DEPENDENCIES');
 validateManifest(bundle.manifest,observedResources);refuse(verifyEndProof(sourceEndProof,observedEnd)===bundle.sourceEndProofHash&&sourceEndProof.recoveryId===(lineage?.sourceOriginalRecoveryId??chosen.recoveryId)&&sourceEndProof.sourceResourceHash===a.sourceResourceHash,'TARGET_DRIVER_SOURCE_END');
 for(const proc of sourceEndProof.processes)refuse(proc.ownerId===(proc.service==='worker'?chosen.source.workerClockOwner:proc.service==='web'?chosen.source.webOwner:chosen.source.apiOwners[proc.service]),'TARGET_DRIVER_SOURCE_OWNER');
 refuse(canonical(sourceJournalFinalCheckpoint)===canonical(bundle.manifest.journalFinalCheckpoint)&&canonical(sourceJournalCopyCheckpoint)===canonical(bundle.manifest.copyCheckpoint),'TARGET_DRIVER_SOURCE_JOURNAL_HEAD');
 const sourceRecords=freeze(clone(sourceJournalRecords)),sourceIds=new Set(Object.entries(chosen.stageOperationIds).filter(([key])=>key.startsWith('source-')).map(([,id])=>id));
 const final=validateStageRecords(sourceRecords,sourceJournalFinalCheckpoint),prefix=validateStageRecords(sourceRecords.slice(0,sourceJournalCopyCheckpoint.sequence+1),sourceJournalCopyCheckpoint);
 refuse(final.pending.length===0&&prefix.pending.length===0,'TARGET_DRIVER_SOURCE_JOURNAL_PENDING');
 for(const r of sourceRecords)refuse(sourceIds.has(r.operationId)&&(r.kind!=='intent'||r.recoveryId===chosen.source.normal.runId),'TARGET_DRIVER_SOURCE_JOURNAL_SCOPE');
 const copy=await verifyCopyIndex(copyRoot,copyIndex,bundle.manifest.copyIndexHash);
 const fixedWitness={planHash,recoveryId:selected.recoveryId,generation:selected.generation,sourceSha:selected.sourceSha,producerSha:selected.producerSha,manifestHash:selected.manifestHash,custodyHash:selected.custodyHash,resourceHash:selected.resourceHash,sourceEndProofHash:selected.sourceEndProofHash,copyIndexHash:selected.copyIndexHash,journalHeadHash:selected.journalHeadHash,...(lineage?{variantLineageHash:lineage.additionHash}:{}),...(restart?{clockRestartPlanHash:restartContext.extensionHash,additionHash:restartContext.additionHash}:{}),...(prefixPlan?{abortPrefixPlanHash:prefixContext.extensionHash}:{})};
 const witness=await verifyStageProof({stage:'target-driver-plan',proofHash:planHash,hash:planHash,...fixedWitness,plan:selected,copy,...(restart?{clockRestartPlan:restart}:{}),...(prefixPlan?{abortPrefixPlan:prefixPlan}:{})});
 refuse(witness&&witness.schema==='target-driver-plan-witness-v1'&&witness.hash===planHash&&Object.entries(fixedWitness).every(([k,v])=>witness[k]===v),'TARGET_DRIVER_PLAN_WITNESS');
 let active=null;
 const endBudget=()=>refuse(active&&performance.now()-active.started<45000,'TARGET_DRIVER_CASE_LIMIT');
 // The durable charge can itself wait for fsync. Recheck the monotonic deadline
 // after that charge, immediately before sending SQL to the actual pool/client.
 const guardedClient=client=>new Proxy(client,{get(t,k){if(k==='query')return(...args)=>{endBudget();return t.query(...args)};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}});
 const guardedPool=pool=>new Proxy(pool,{get(t,k){if(k==='connect')return async()=>{endBudget();return guardedClient(await t.connect())};if(k==='query')return(...args)=>{endBudget();return t.query(...args)};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}});
 const measured={control:measuredPool(guardedPool(pools.control),ledger),tenants:Object.fromEntries([A,B].map(id=>[id,measuredPool(guardedPool(pools.tenants[id]),ledger)]))};
 const control=createRecoveryControl({side:'target',material:chosen,anchors:a,proofBundle:bundle,pools:measured,journal,...(restart?{clockAddition:{addition:restartContext.addition,additionHash:restartContext.additionHash,workerEndProof:restartContext.workerEndProof}}:{}),verifyStageProof,onCommand:async kind=>{refuse(active&&kind==='sql'&&performance.now()-active.started<45000&&active.commands<CASE_LIMITS.sql,'TARGET_DRIVER_CASE_LIMIT');active.commands++;}});
 async function runPhase(name){
  refuse(!active&&(TARGET_PHASES.includes(name)||prefixPlan&&name===ABORT_PREFIX_EXECUTION_PHASE)&&(!(restart||prefixPlan)||name.startsWith('abort-')||prefixPlan&&name===ABORT_PREFIX_EXECUTION_PHASE),'TARGET_DRIVER_PHASE');const phase=name===ABORT_PREFIX_EXECUTION_PHASE?prefixExecution:(restart??prefixPlan)?.abortPhases[name]??selected.phases[name],started=performance.now();
  active={name,started,commands:0};
  try{
   const ledgerCase=lineage?variantCaseName(lineage.kind,name):phase.caseName,before=await ledger.snapshot(),planned=before.plannedScenarios?.[ledgerCase];
   refuse(before.schema==='cp019-budget-v1'&&before.project==='mecanet-qa-p1l3-r03'&&Number.isInteger(before.total?.sql)&&before.total.sql>=0&&before.total.sql<GLOBAL_LIMITS.sql&&before.plannedScopes?.[ledgerCase]==='target-window'&&planned?.sql===CASE_LIMITS.sql&&planned.http===80&&planned.journal===1000&&planned.artifactFiles===2000,'TARGET_DRIVER_CASE_NOT_PREREGISTERED');
   await ledger.enter(ledgerCase);
   const stepsHash=sha256(phase.steps),receipt=await verifyStageProof({stage:'target-driver-phase',proofHash:phase.proofHash,hash:phase.proofHash,...fixedWitness,phase:name,caseName:phase.caseName,stepsHash});
   refuse(receipt&&receipt.schema==='target-driver-phase-witness-v1'&&receipt.hash===phase.proofHash&&receipt.planHash===planHash&&receipt.recoveryId===selected.recoveryId&&receipt.generation===selected.generation&&receipt.resourceHash===selected.resourceHash&&receipt.phase===name&&receipt.caseName===phase.caseName&&receipt.stepsHash===stepsHash&&(!restart||receipt.clockRestartPlanHash===restartContext.extensionHash&&receipt.additionHash===restartContext.additionHash)&&(!prefixPlan||receipt.abortPrefixPlanHash===prefixContext.extensionHash),'TARGET_DRIVER_PHASE_WITNESS');
   if(name==='abort-close'&&phase.closure==='ALREADY_CLOSED'){
    const begin=phase.steps[0].args,before=receipt.runVersion===begin.expected.version&&receipt.runStage===begin.expected.stage&&receipt.abortId===null,after=receipt.runVersion===begin.after.version&&receipt.runStage===begin.after.stage&&receipt.abortId===chosen.target.operationIds.abort;
    refuse(receipt.barrier===true&&receipt.globalBlocked===true&&(before||after),'TARGET_DRIVER_ABORT_CLOSURE');
   }
   const results=[];
   for(const step of phase.steps){
    refuse(performance.now()-started<45000,'TARGET_DRIVER_CASE_LIMIT');let result;
    if(step.method==='configureRole')result=await control.configureRole(step.role,step.args);
    else if(step.method==='recordTenantProof')result=await control.recordTenantProof(step.tenantId,step.phase,step.args);
    else if(step.tenantId)result=await control[step.method](step.tenantId,step.args);
    else result=await control[step.method](step.args);
    results.push({method:step.method,...(step.tenantId?{tenantId:step.tenantId}:{}),...(step.role?{role:step.role}:{}),...(result.stage?{stage:result.stage,version:result.version}:{}),reconciled:result.reconciled===true});
   }
   const after=await ledger.snapshot(),delta=after.total.sql-before.total.sql;
   refuse(Number.isInteger(delta)&&delta>=0&&delta<=CASE_LIMITS.sql&&after.total.sql<=GLOBAL_LIMITS.sql&&active.commands<=CASE_LIMITS.sql&&performance.now()-started<=45000,'TARGET_DRIVER_CASE_LIMIT');
   return{status:'PASS',layer:'controller-boundary',phase:name,caseName:phase.caseName,sourceSha:selected.sourceSha,producerSha:selected.producerSha,planHash,...(restart?{clockRestartPlanHash:restartContext.extensionHash,additionHash:restartContext.additionHash}:{}),...(prefixPlan?{abortPrefixPlanHash:prefixContext.extensionHash}:{}),sqlCommands:delta,controlCommands:active.commands,elapsedMs:Math.ceil(performance.now()-started),results};
  }finally{active=null}
 }
 return Object.freeze({binding:Object.freeze({recoveryId:selected.recoveryId,generation:selected.generation,manifestHash:selected.manifestHash,planHash,...(restart?{clockRestartPlanHash:restartContext.extensionHash}: {}),...(prefixPlan?{abortPrefixPlanHash:prefixContext.extensionHash}:{})}),runPhase});
}
