// SC-016 accounting core only. No effects, authority publication or clock reads.
import {createHash} from 'node:crypto';
import {canonical} from '../../../server/saas/recovery/protocol.js';
export const CONTINUATION_SCHEMA='cp024-budget-continuation-v2';
const PROJECT='mecanet-qa-p1l3-r03',SC016='6e1fe2d6ef789eef9637fd0ec9f6c5703998899cbc9df4f8a8c35990364bfc92',REGISTRY='1f2b34b5bb93ae21a74f7d2af8a51bd3cb16d3ea7baa3b55a54481b5875f243c',HASH=/^[0-9a-f]{64}$/;
export const CONTINUATION_GLOBAL=Object.freeze({artifactFiles:8192,sql:200000,http:300,journal:1000}),CONTINUATION_CASE=Object.freeze({artifactFiles:2000,sql:8192,http:80,journal:1000});
const G=CONTINUATION_GLOBAL,C=CONTINUATION_CASE,check=(ok,code='CONTINUATION_BUDGET_ABORT')=>{if(!ok)throw Error(code)},same=(a,b)=>canonical(a)===canonical(b),clone=structuredClone,keys=(x,ks)=>x&&typeof x==='object'&&!Array.isArray(x)&&same(Object.keys(x).sort(),[...ks].sort()),number=x=>typeof x==='number'&&Number.isFinite(x),integer=x=>Number.isSafeInteger(x),sha=raw=>createHash('sha256').update(raw).digest('hex'),totals=(v,caps)=>keys(v,Object.keys(caps))&&Object.entries(v).every(([k,n])=>integer(n)&&n>=0&&n<=caps[k]);
const CREATION_PARENT='b2ed6589a6026fca7c8268fa726a58f4d459b70e1a52f086437150650db959f6',HISTORICAL_CASE_UPPER=Object.freeze({'host-bootstrap':50,'host-stage':172,'host-material':16,'host-config-source':28,'host-config-target':28,'host-pg-start':6}),HISTORICAL_UNKNOWN_UPPER=2;
export function creationUpper(state){
 check(state?.parentLedgerHash===CREATION_PARENT,'HISTORICAL_CREATION_PARENT');const known=Object.values(HISTORICAL_CASE_UPPER).reduce((a,b)=>a+b,0),upper=known+HISTORICAL_UNKNOWN_UPPER;
 return {schema:'cp026-historical-creation-upper-v1',baseLedgerHash:CREATION_PARENT,knownCaseUpper:{...HISTORICAL_CASE_UPPER},knownHistoricalUpper:known,unknownHistoricalUpper:HISTORICAL_UNKNOWN_UPPER,historicalUpper:upper,recordedArtifacts:state.total.artifactFiles,physicalArtifactsUpper:state.total.artifactFiles+upper,casePhysicalUpper:Object.fromEntries(Object.entries(state.scenarios).map(([n,c])=>[n,c.total.artifactFiles+(HISTORICAL_CASE_UPPER[n]??0)+HISTORICAL_UNKNOWN_UPPER]))};
}
export function validateCreationUpper(state){const proof=creationUpper(state);check(proof.physicalArtifactsUpper<=G.artifactFiles,'HISTORICAL_CREATION_GLOBAL');check(Object.values(proof.casePhysicalUpper).every(v=>v<=C.artifactFiles),'HISTORICAL_CREATION_CASE');return proof}
export function validateBase(raw,expectedHash){
 check(Buffer.isBuffer(raw)&&raw.length>=2&&raw.length<=262144&&expectedHash==='b2ed6589a6026fca7c8268fa726a58f4d459b70e1a52f086437150650db959f6'&&sha(raw)===expectedHash,'CONTINUATION_V1_HASH');
 const b=JSON.parse(raw);check(keys(b,['schema','project','plannedScenarios','plannedScopes','activeScenarios','startedUptime','sequence','total','scenarios'])&&b.schema==='cp019-budget-v1'&&b.project===PROJECT,'CONTINUATION_V1_SCOPE');
 check(b.sequence===44&&totals(b.total,G)&&same(b.total,{artifactFiles:639,sql:0,http:0,journal:0}),'CONTINUATION_V1_BOUNDARY');
 check(number(b.startedUptime)&&b.startedUptime>=0&&keys(b.plannedScenarios,Object.keys(b.plannedScopes??{}))&&Object.keys(b.plannedScenarios).length===135&&Object.values(b.plannedScenarios).every(v=>same(v,C)),'CONTINUATION_V1_REGISTRY');
 const plan={project:b.project,plannedScenarios:b.plannedScenarios,plannedScopes:b.plannedScopes,schema:'cp019-budget-plan-v1',activeScenarios:{'source-window':'source-runtime-start','target-window':'target-runtime-start'}};
 check(sha(canonical(plan))===REGISTRY&&keys(b.activeScenarios,['source-window','target-window'])&&Object.entries(b.activeScenarios).every(([k,v])=>b.plannedScopes[v]===k),'CONTINUATION_V1_REGISTRY');
 check(b.scenarios&&typeof b.scenarios==='object'&&!Array.isArray(b.scenarios)&&Object.keys(b.scenarios).every(k=>Object.hasOwn(b.plannedScenarios,k)),'CONTINUATION_V1_CASE');
 for(const c of Object.values(b.scenarios))check(keys(c,['startedUptime','limits','total'])&&same(c.limits,C)&&totals(c.total,C)&&number(c.startedUptime)&&c.startedUptime>=b.startedUptime,'CONTINUATION_V1_CASE');
 check(Object.entries(b.total).every(([k,v])=>Object.values(b.scenarios).reduce((s,c)=>s+c.total[k],0)===v),'CONTINUATION_V1_SUM');return b;
}
export function validateAdmission(a,b,hash){
 check(keys(a,['schema','project','targetProject','attempt','approvalHash','parentLedgerHash','parentSequence','registryHash','startedUptime','sourceContainerId','sourceOwnerId','sourceSystemIdentifier','sourceFinishedAt','sealedInputsHash','controllerHash','runtimeHash','priorRunReportHash'])&&a.schema==='cp024-continuation-admission-v2','CONTINUATION_ADMISSION_REQUIRED');
 check(a.project===PROJECT&&a.targetProject===PROJECT+'-target'&&a.attempt==='v2'&&a.approvalHash===SC016&&a.parentLedgerHash===hash&&a.parentSequence===b.sequence&&a.registryHash===REGISTRY,'CONTINUATION_ADMISSION_SCOPE');
 check(a.sourceContainerId==='aa35afe3ea406009410be0e1a7eef759c619c8386a290ce9cbf620fe890cc500'&&a.sourceOwnerId==='76066956-b4ae-422f-ae8d-69a0795a88dd'&&a.sourceSystemIdentifier==='7696914153807093794'&&a.sourceFinishedAt==='2026-10-15T15:18:02.598236798Z','CONTINUATION_IDENTITY');
 check(number(a.startedUptime)&&a.startedUptime>=b.startedUptime&&['sealedInputsHash','controllerHash','runtimeHash','priorRunReportHash'].every(k=>typeof a[k]==='string'&&HASH.test(a[k])),'CONTINUATION_ADMISSION_PIN');return a;
}
export function initialContinuation(raw,hash,admission){
 const b=validateBase(raw,hash),a=validateAdmission(admission,b,hash);
 return {schema:CONTINUATION_SCHEMA,project:PROJECT,attempt:'v2',admissionHash:sha(canonical(a)),parentLedgerHash:hash,startedUptime:a.startedUptime,sequence:b.sequence,plannedScenarios:clone(b.plannedScenarios),plannedScopes:clone(b.plannedScopes),activeScenarios:clone(b.activeScenarios),total:clone(b.total),scenarios:Object.fromEntries(Object.entries(b.scenarios).map(([n,c])=>[n,{startedUptime:null,limits:{...C},total:{...c.total}}])),aborted:null};
}
export function validateContinuation(s,raw,hash,admission,now){
 const b=validateBase(raw,hash),a=validateAdmission(admission,b,hash);
 check(keys(s,['schema','project','attempt','admissionHash','parentLedgerHash','startedUptime','sequence','plannedScenarios','plannedScopes','activeScenarios','total','scenarios','aborted'])&&s.schema===CONTINUATION_SCHEMA&&s.project===PROJECT&&s.attempt==='v2','CONTINUATION_STATE_SCOPE');
 check(s.admissionHash===sha(canonical(a))&&s.parentLedgerHash===hash&&s.startedUptime===a.startedUptime&&same(s.plannedScenarios,b.plannedScenarios)&&same(s.plannedScopes,b.plannedScopes),'CONTINUATION_AUTHORITY_CHANGED');
 check(s.aborted===null,'CONTINUATION_TERMINAL_ABORT');
 check(number(now)&&now-s.startedUptime>=0&&now-s.startedUptime<1800&&integer(s.sequence)&&s.sequence>=b.sequence&&totals(s.total,G)&&Object.entries(b.total).every(([k,v])=>s.total[k]>=v),'CONTINUATION_GLOBAL_EXPIRED_OR_REGRESSED');
 check(keys(s.activeScenarios,Object.keys(b.activeScenarios))&&Object.entries(s.activeScenarios).every(([k,v])=>s.plannedScopes[v]===k),'CONTINUATION_CASE_ALIAS');
 check(s.scenarios&&typeof s.scenarios==='object'&&!Array.isArray(s.scenarios)&&Object.keys(b.scenarios).every(n=>Object.hasOwn(s.scenarios,n))&&Object.keys(s.scenarios).every(n=>Object.hasOwn(b.plannedScenarios,n)),'CONTINUATION_CASE_OMITTED');
 for(const[n,c]of Object.entries(s.scenarios)){
  const prior=b.scenarios[n]?.total??Object.fromEntries(Object.keys(G).map(k=>[k,0]));
  check(keys(c,['startedUptime','limits','total'])&&same(c.limits,C)&&totals(c.total,C)&&Object.entries(prior).every(([k,v])=>c.total[k]>=v),'CONTINUATION_CASE_REGRESSION');
  check((c.startedUptime===null&&Object.hasOwn(b.scenarios,n)&&same(c.total,prior))||(number(c.startedUptime)&&c.startedUptime>=s.startedUptime&&c.startedUptime<=now),'CONTINUATION_CASE_START');
 }
 check(Object.entries(s.total).every(([k,v])=>Object.values(s.scenarios).reduce((sum,c)=>sum+c.total[k],0)===v),'CONTINUATION_TOTAL_MISMATCH');return b;
}
export function continuationRemaining(s,raw,hash,admission,scenario,now,maximum=45){
 validateContinuation(s,raw,hash,admission,now);check(Object.hasOwn(s.plannedScenarios,scenario)&&number(maximum)&&maximum>0&&maximum<=45,'CONTINUATION_CASE_REQUIRED');
 const c=s.scenarios[scenario];let left=Math.min(maximum,1800-(now-s.startedUptime));if(c&&c.startedUptime!==null)left=Math.min(left,45-(now-c.startedUptime));check(left>0,'CONTINUATION_CASE_EXPIRED');return left;
}
export function updateContinuation(s,raw,hash,admission,scenario,now,{kind=null,amount=1,scope=null}={}){
 continuationRemaining(s,raw,hash,admission,scenario,now);const out=clone(s);
 if(scope!==null){check(Object.hasOwn(out.activeScenarios,scope)&&out.plannedScopes[scenario]===scope,'CONTINUATION_CASE_ALIAS');out.activeScenarios[scope]=scenario}
 out.scenarios[scenario]??={startedUptime:now,limits:{...C},total:Object.fromEntries(Object.keys(G).map(k=>[k,0]))};if(out.scenarios[scenario].startedUptime===null)out.scenarios[scenario].startedUptime=now;
 if(kind!==null){check(Object.hasOwn(G,kind)&&integer(amount)&&amount>0,'CONTINUATION_CHARGE');check(out.total[kind]+amount<=G[kind]&&out.scenarios[scenario].total[kind]+amount<=C[kind],'CONTINUATION_OVERFLOW');out.total[kind]+=amount;out.scenarios[scenario].total[kind]+=amount}
 out.sequence++;validateContinuation(out,raw,hash,admission,now);return out;
}
export function abortContinuation(s,reason){check(typeof reason==='string'&&/^[A-Z][A-Z0-9_]{0,99}$/.test(reason),'CONTINUATION_ABORT_REASON');const out=clone(s);if(out.aborted===null){out.aborted=reason;out.sequence++}return out}
export function validateContinuationProgress(previous,current){
 // A new process still needs the last durable Root receipt. This check protects
 // positive observations within one process and comparisons against that seal.
 check(previous&&current&&previous.schema===CONTINUATION_SCHEMA&&current.schema===CONTINUATION_SCHEMA&&previous.admissionHash===current.admissionHash&&previous.parentLedgerHash===current.parentLedgerHash&&previous.startedUptime===current.startedUptime&&current.sequence>=previous.sequence,'CONTINUATION_PROGRESS_REGRESSION');
 check(Object.keys(G).every(k=>current.total[k]>=previous.total[k])&&Object.entries(previous.scenarios).every(([name,p])=>{const c=current.scenarios[name];return c&&Object.keys(G).every(k=>c.total[k]>=p.total[k])&&(p.startedUptime===null||c.startedUptime===p.startedUptime)}),'CONTINUATION_PROGRESS_REGRESSION');return current;
}
