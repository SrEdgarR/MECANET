// Private QA boundary hook. It suppresses the result AFTER an actual explicit
// COMMIT resolves. This models an ACK loss; it never claims a network fault or
// a process end. The host must prove this controller's end before retrying.
import {canonical,sha256} from '../../../server/saas/recovery/protocol.js';

const HASH=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const check=(ok,code)=>{if(!ok)throw Error(code)},same=(a,b)=>canonical(a)===canonical(b),clone=x=>JSON.parse(canonical(x));
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x}
const exact=(x,keys,code)=>check(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(','),code);
const TEXT='SELECT * FROM saas.prepare_recovery_promotion($1::uuid,$2::uuid,$3::bigint)';

/** The caller already validates its full target program. This additional plan
 * fixes its first promotion statement; no selection from observed SQL occurs. */
export function makeCommitFaultPlan({material:m,parentPlan:p,parentPlanHash,variantLineageHash,invocationId,controllerContainerId}={}){
 check(p?.schema==='target-driver-plan-v1'&&HASH.test(parentPlanHash??'')&&sha256(p)===parentPlanHash&&HASH.test(variantLineageHash??'')&&UUID.test(invocationId??'')&&HASH.test(controllerContainerId??''),'COMMIT_FAULT_PLAN');
 check([m?.recoveryId,m?.controllerOwner,m?.target?.generation,m?.stageOperationIds?.['target-prepare-promote']].every(x=>UUID.test(x??''))&&p.recoveryId===m.recoveryId&&p.generation===m.target.generation&&SHA.test(p.sourceSha??'')&&HASH.test(p.resourceHash??'')&&HASH.test(p.sourceEndProofHash??''),'COMMIT_FAULT_BINDING');
 const s=p.phases?.promotion?.steps?.[0];check(s?.method==='preparePromotion'&&s.args?.operationKey==='target-prepare-promote'&&same(s.args.expected,{stage:'VERIFIED',version:'5',global_blocked:true})&&same(s.args.after,{stage:'PROMOTING',version:'6',global_blocked:true})&&HASH.test(s.args.proofHash??''),'COMMIT_FAULT_STEP');
 return freeze(clone({schema:'cp019-commit-fault-plan-v1',caseName:'target-commit-fault',phase:'promotion',invocationId,controllerContainerId,recoveryId:m.recoveryId,generation:m.target.generation,controllerOwner:m.controllerOwner,operationId:m.stageOperationIds['target-prepare-promote'],sourceSha:p.sourceSha,parentPlanHash,variantLineageHash,resourceHash:p.resourceHash,sourceEndProofHash:p.sourceEndProofHash,expectedHash:sha256(s.args.expected),afterHash:sha256(s.args.after),statement:{text:TEXT,values:[m.recoveryId,m.controllerOwner,'5']},fault:'SUPPRESS_ACK_AFTER_ACKNOWLEDGED_COMMIT'}));
}
function validatePlan(p,hash){check(p?.schema==='cp019-commit-fault-plan-v1'&&HASH.test(hash??'')&&sha256(p)===hash&&HASH.test(p.controllerContainerId??'')&&p.caseName==='target-commit-fault'&&p.phase==='promotion'&&p.statement?.text===TEXT&&same(p.statement.values,[p.recoveryId,p.controllerOwner,'5'])&&p.fault==='SUPPRESS_ACK_AFTER_ACKNOWLEDGED_COMMIT','COMMIT_FAULT_PLAN');return p}
export function validateCommitFaultReceipt({plan,planHash,receipt:r,receiptHash}={}){
 validatePlan(plan,planHash);check(r&&Object.keys(r).sort().join(',')==='backendPid,backendStartedAt,caseName,commitAcknowledged,controllerContainerId,controllerOwner,fault,generation,invocationId,operationId,planHash,recoveryId,resultHash,schema'&&HASH.test(receiptHash??'')&&sha256(r)===receiptHash,'COMMIT_FAULT_RECEIPT');
 check(r.schema==='cp019-commit-fault-occurrence-v1'&&r.planHash===planHash&&Number.isInteger(r.backendPid)&&r.backendPid>0&&typeof r.backendStartedAt==='string'&&Number.isFinite(Date.parse(r.backendStartedAt))&&r.commitAcknowledged===true&&HASH.test(r.resultHash??'')&&['caseName','controllerContainerId','controllerOwner','fault','generation','invocationId','operationId','recoveryId'].every(k=>r[k]===plan[k]),'COMMIT_FAULT_RECEIPT');return freeze(clone(r));
}

/** Root's actual CREATED and failed END are distinct from the SQL probe. All
 * three immutable reports must identify the original job/backend; no elapsed
 * time or generic source/controller END can authorize this retry. */
export function validateCommitRetryEnd({plan:p,planHash,retryEndPair:e,retryProbe:o,receipt=null,receiptHash=null}={}){
 validatePlan(p,planHash);const code='COMMIT_FAULT_RETRY_END_REQUIRED';
 exact(e,['schema','planHash','invocationId','occurrenceHash','jobCreated','jobCreatedHash','jobEnd','jobEndHash','observed','backend'],code);
 check(e.schema==='cp021-commit-retry-end-v1'&&e.planHash===planHash&&e.invocationId===p.invocationId&&HASH.test(e.occurrenceHash??'')&&e.jobCreatedHash===sha256(e.jobCreated)&&e.jobEndHash===sha256(e.jobEnd),code);
 const c=e.jobCreated,d=e.jobEnd,seen=e.observed;
 exact(c,['schema','jobId','containerId','project','service','ownerId','imageDigest','commandHash','state','createdAt'],code);
 exact(d,['schema','jobId','containerId','project','service','ownerId','createdReceiptHash','exitCode','finishedAt','startedAt','containerStopped','sqlAbsence'],code);
 exact(seen,['containerId','ownerId','running','pid','status','exitCode','finishedAt'],code);
 check(c.schema==='controller-job-created-v1'&&c.jobId===p.invocationId&&c.containerId===p.controllerContainerId&&c.project==='mecanet-qa-p1l3-r03-target'&&['probe','harness','controller-tool'].includes(c.service)&&c.ownerId===p.controllerOwner&&/^sha256:[a-f0-9]{64}$/.test(c.imageDigest??'')&&c.commandHash===sha256(['node','tests/qa/cp019/target-runtime.mjs','run','promotion'])&&c.state==='CREATED BEFORE START/SQL',code);
 check(d.schema==='controller-job-end-v1'&&['jobId','containerId','project','service','ownerId'].every(k=>d[k]===c[k])&&d.createdReceiptHash===e.jobCreatedHash&&d.exitCode===1&&d.containerStopped===true&&d.sqlAbsence==='NOT VERIFIED'&&Number.isFinite(Date.parse(c.createdAt))&&Date.parse(c.createdAt)<=Date.parse(d.startedAt)&&Date.parse(d.startedAt)<=Date.parse(d.finishedAt)&&!d.finishedAt.startsWith('0001-'),code);
 check(seen.containerId===c.containerId&&seen.ownerId===c.ownerId&&seen.running===false&&seen.pid===0&&seen.status==='exited'&&seen.exitCode===1&&seen.finishedAt===d.finishedAt,code);
 const probeCode='COMMIT_FAULT_RETRY_PROBE_REQUIRED';
 exact(e.backend,['pid','absent','resourceHash','probeHash'],probeCode);
 exact(o,['schema','invocationId','containerId','ownerId','resourceHash','backendPid','backendStartedAt','controllerExited','sqlBackendAbsent','sqlOwnerAbsent'],probeCode);
 check(o.schema==='cp019-commit-fault-end-probe-v1'&&o.invocationId===p.invocationId&&o.containerId===p.controllerContainerId&&o.ownerId===p.controllerOwner&&o.resourceHash===p.resourceHash&&o.controllerExited===true&&o.sqlBackendAbsent===true&&o.sqlOwnerAbsent===true&&Number.isInteger(o.backendPid)&&o.backendPid>0&&typeof o.backendStartedAt==='string'&&Number.isFinite(Date.parse(o.backendStartedAt))&&e.backend.pid===o.backendPid&&e.backend.absent===true&&e.backend.resourceHash===p.resourceHash&&e.backend.probeHash===sha256(o),probeCode);
 if(receipt){validateCommitFaultReceipt({plan:p,planHash,receipt,receiptHash});check(e.occurrenceHash===receiptHash&&o.backendPid===receipt.backendPid&&o.backendStartedAt===receipt.backendStartedAt,'COMMIT_FAULT_RETRY_BACKEND_BINDING')}
 return freeze(clone(e));
}

/** Injected BEGIN/pid/COMMIT are charged here. The selected business SELECT is
 * charged by the existing driver exactly once. A retry is observation-only:
 * the original journal/AFTER must reconcile without another mutator call. */
export function createCommitFaultPoolFactory({plan,planHash,mode,ledger,loadReceipt,publishReceipt,poolFactory,retryEndPair=null,retryProbe=null}={}){
 const p=freeze(clone(validatePlan(plan,planHash))),end=freeze(clone(retryEndPair)),probe=freeze(clone(retryProbe));check(['inject','reconcile'].includes(mode)&&typeof ledger?.charge==='function'&&typeof loadReceipt==='function'&&typeof publishReceipt==='function'&&typeof poolFactory==='function','COMMIT_FAULT_DEPENDENCIES');let fired=false;
 if(mode==='reconcile')validateCommitRetryEnd({plan:p,planHash,retryEndPair:end,retryProbe:probe});
 else check(end===null&&probe===null,'COMMIT_FAULT_RETRY_UNEXPECTED');
 function selected(q){const text=typeof q==='string'?q:q?.text;if(text!==TEXT)return false;check(q&&typeof q==='object'&&same(q.values,p.statement.values),'COMMIT_FAULT_STATEMENT_CHANGED');return true}
 return async config=>{
  const central=config?.database==='mecanet_control';if(central){const saved=await loadReceipt();if(mode==='inject')check(!saved,'COMMIT_FAULT_EXISTING_RECEIPT');else{check(saved,'COMMIT_FAULT_RECEIPT_REQUIRED');validateCommitRetryEnd({plan:p,planHash,retryEndPair:end,retryProbe:probe,receipt:saved.value,receiptHash:saved.sha256})}}
  const pool=await poolFactory(config);
  const wrap=client=>new Proxy(client,{get(target,key){if(key==='query')return async(q,...rest)=>{
   if(!central||!selected(q))return target.query(q,...rest);
   check(mode!=='reconcile','COMMIT_FAULT_RECONCILE_EFFECT_DENIED');check(!fired,'COMMIT_FAULT_ALREADY_FIRED');fired=true;
   const extra=async text=>{await ledger.charge('sql');return target.query(text)};
   const facts=await extra('SELECT pg_backend_pid()::integer AS pid,(SELECT backend_start::text FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS backend_started_at'),pid=facts?.rows?.[0]?.pid,backendStartedAt=facts?.rows?.[0]?.backend_started_at;check(facts.rows?.length===1&&Number.isInteger(pid)&&pid>0&&typeof backendStartedAt==='string'&&Number.isFinite(Date.parse(backendStartedAt)),'COMMIT_FAULT_BACKEND_PID');
   let began=false,committing=false;
   try{await extra('BEGIN');began=true;const result=await target.query(q,...rest);committing=true;await extra('COMMIT');
    const value={schema:'cp019-commit-fault-occurrence-v1',planHash,caseName:p.caseName,controllerContainerId:p.controllerContainerId,controllerOwner:p.controllerOwner,fault:p.fault,generation:p.generation,invocationId:p.invocationId,operationId:p.operationId,recoveryId:p.recoveryId,backendPid:pid,backendStartedAt,commitAcknowledged:true,resultHash:sha256(result.rows)};
    await ledger.charge('artifactFiles');const saved=await publishReceipt(value,sha256(value));check(saved?.sha256===sha256(value),'COMMIT_FAULT_PUBLICATION');const readback=await loadReceipt();check(readback,'COMMIT_FAULT_PUBLICATION');validateCommitFaultReceipt({plan:p,planHash,receipt:readback.value,receiptHash:readback.sha256});check(same(readback.value,value),'COMMIT_FAULT_PUBLICATION');
    const error=Error('COMMIT_FAULT_ACK_SUPPRESSED');error.code='COMMIT_UNCERTAIN';throw error;
   }catch(error){if(began&&!committing)await extra('ROLLBACK').catch(()=>{});throw error}
  };const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}});
  return new Proxy(pool,{get(target,key){if(key==='connect')return async()=>wrap(await target.connect());if(key==='query')return async(q,...rest)=>{if(!central||!selected(q))return target.query(q,...rest);const raw=typeof target.connect==='function'?await target.connect():target,c=wrap(raw);let error;try{return await c.query(q,...rest)}catch(e){error=e;throw e}finally{if(raw!==target)raw.release(error)}};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}});
 };
}
