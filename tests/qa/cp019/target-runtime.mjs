import {CASE_LIMITS,GLOBAL_LIMITS} from './budget-limits.mjs';
// Private target composition. Importing this module performs no I/O. Docker,
// copies and process-end observations belong to the trusted host controller.
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {uptime} from 'node:os';
import {canonical,sha256,validateManifest,verifyEndProof} from '../../../server/saas/recovery/protocol.js';
import {validateMaterial,deriveRuntimeConfig,ROLES} from '../../../server/saas/recovery/custody.js';
import {openStageJournal} from '../../../server/saas/recovery/stage-journal.js';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {createTargetDriver,validateTargetPlan,TARGET_PHASES,ABORT_PREFIX_EXECUTION_PHASE} from './target-driver.mjs';
import {createTargetWitness} from './target-witness.mjs';
import {newLedger} from './ledger.mjs';
import {publishSourceReadonly} from './source-driver.mjs';
import {validateApiConfig} from './entry.mjs';
import {validateWorkerConfig} from './worker.mjs';
import {loadTargetConfigBundle} from './target-bundle-io.mjs';
import {validateClockRestartPlan,createClockRestartController,CLOCK_RESTART_PHASES} from './clock-restart-plan.mjs';
import {validateAbortPrefixPlan} from './abort-prefix-plan.mjs';
import {validateAcceptanceContext} from './acceptance.mjs';
import {validateTargetVariantLineage,completeTargetVariantLineage,variantCaseName} from './target-variant-lineage.mjs';
import {makeCommitFaultPlan,createCommitFaultPoolFactory,validateCommitRetryEnd} from './commit-fault-hook.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const HASH=/^[0-9a-f]{64}$/,SHA=/^[0-9a-f]{40}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DBS=new Set(['mecanet_control','mecanet_tenant_a','mecanet_tenant_b']);
const RUNTIME_PHASES=Object.freeze([...TARGET_PHASES,...CLOCK_RESTART_PHASES,ABORT_PREFIX_EXECUTION_PHASE]);
const HOST_PREPARED=Symbol('private immutable host binding');
const refuse=(ok,label)=>{if(!ok)throw Error(label)},clone=x=>JSON.parse(canonical(x)),same=(a,b)=>canonical(a)===canonical(b);
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x)}return x};
export function validateTargetCredentialPhase(phase,credential){
 refuse(RUNTIME_PHASES.includes(phase)&&['source','target'].includes(credential),'TARGET_RUNTIME_CREDENTIAL_PHASE');
 refuse(phase==='rotate'||credential===(phase==='begin-enroll'?'source':'target'),'TARGET_RUNTIME_CREDENTIAL_PHASE');return credential;
}

/** Bootstrap has CONNECTION LIMIT1. Inspectors and mutators share this broker,
 * but never share a transaction or simultaneously retain two physical pools.
 * Driver facades are RAW: createTargetDriver performs their sole SQL charge.
 * Witness SELECTs run in the server's implicit, acknowledged RO transaction;
 * default_transaction_read_only is also checked by the witness SQL itself. */
export function createTargetSqlBroker({material,targetCa,targetResource,bootstrapCredential,phase,ledger,poolFactory=createPgPool,now=()=>performance.now(),roleConnections={},endTimeoutMs=2000}={}){
 const m=freeze(clone(validateMaterial(material))),started=now();
 refuse(['source','target'].includes(bootstrapCredential)&&typeof targetCa==='string'&&targetCa.length>0&&targetCa.length<=65536&&typeof ledger?.charge==='function'&&typeof poolFactory==='function'&&Number.isInteger(endTimeoutMs)&&endTimeoutMs>0&&endTimeoutMs<=2000,'TARGET_RUNTIME_BROKER_BINDING');
 let current=null,leased=false,uncertain=false,closed=false,bootstrapSide=bootstrapCredential;
 const bound=()=>refuse(now()-started>=0&&now()-started<45000,'TARGET_RUNTIME_DEADLINE');
 async function endPool(pool){let timer;try{await Promise.race([pool.end(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TARGET_RUNTIME_POOL_END_UNCERTAIN')),endTimeoutMs)})])}catch(error){uncertain=true;throw error}finally{clearTimeout(timer)}}
 function config(database,mode,role='qa_bootstrap',replication=false){
  refuse(DBS.has(database)||(['saas_backup','qa_bootstrap'].includes(role)&&database==='postgres'),'TARGET_RUNTIME_DATABASE');
  refuse(['ro','rw'].includes(mode)&&([...ROLES,'qa_bootstrap'].includes(role)),'TARGET_RUNTIME_ROLE');
  const password=m[role==='qa_bootstrap'?bootstrapSide:'target'].rolePasswords[role];
  return{host:'postgres',port:5432,database,user:role,password,ssl:{ca:targetCa,servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:2000,statement_timeout:mode==='ro'?2000:500,lock_timeout:300,application_name:'cp019-controller:'+m.controllerOwner,options:'-c default_transaction_read_only='+(mode==='ro'?'on':'off')+' -c client_encoding=UTF8',...(replication?{replication:true}:{} )};
 }
 async function acquire(database,mode,role='qa_bootstrap',replication=false){
  refuse(!closed&&!uncertain,'TARGET_RUNTIME_BROKER_UNCERTAIN');refuse(!leased,'TARGET_RUNTIME_BROKER_BUSY');bound();leased=true;
  try{
   const keyFor=()=>[database,mode,role,replication,role==='qa_bootstrap'?bootstrapSide:'target'].join(':'),key=keyFor();
   if(current&&current.key!==key){const old=current;current=null;await endPool(old.pool);bound()}
   if(!current){const pool=await poolFactory(config(database,mode,role,replication));current={key,pool};bound()}
   let client;
   try{client=await current.pool.connect()}catch(error){
    // An uncertain bootstrap ALTER can commit its already-chosen target
    // password. Only authentication denial (not SQL/transport/TLS failure) in
    // this fixed rotation phase permits that second custodied credential.
    // The previous pool must positively end before another pool is created.
    if(!(phase==='rotate'&&role==='qa_bootstrap'&&bootstrapSide==='source'&&error.code==='28P01'))throw error;
    const old=current;current=null;await endPool(old.pool);bound();bootstrapSide='target';
    const pool=await poolFactory(config(database,mode,role,replication));current={key:keyFor(),pool};bound();client=await pool.connect();
   }
   try{bound()}catch(error){try{client.release(error)}catch{uncertain=true}throw error}let released=false;
   return{tls:client.connection?.stream?.encrypted===true,async query(...args){refuse(!released&&!uncertain,'TARGET_RUNTIME_LEASE_ENDED');bound();return client.query(...args)},release(error){refuse(!released,'TARGET_RUNTIME_LEASE_ENDED');released=true;try{client.release(error)}catch(cause){uncertain=true;throw cause}finally{leased=false}}};
  }catch(error){leased=false;throw error}
 }
 async function rawQuery(database,request){const client=await acquire(database,'rw');let failure;try{return await client.query(request)}catch(error){failure=error;throw error}finally{client.release(failure)}}
 const facade=database=>Object.freeze({query:request=>rawQuery(database,request),connect:()=>acquire(database,'rw')});
 async function inspect(request){
  refuse(request&&DBS.has(request.database)&&typeof request.text==='string'&&/^SELECT\s/i.test(request.text)&&Array.isArray(request.values)&&request.readOnly===true&&request.scope==='target'&&request.maxLeases===1&&Number.isInteger(request.queryTimeoutMs)&&request.queryTimeoutMs>0&&request.queryTimeoutMs<=2000,'TARGET_RUNTIME_INSPECTION_CONTRACT');
  refuse(!leased,'TARGET_RUNTIME_BROKER_BUSY');bound();await ledger.charge('sql');bound();
  const client=await acquire(request.database,'ro');let failure;
  try{const result=await client.query({text:request.text,values:request.values,query_timeout:request.queryTimeoutMs});bound();return result}catch(error){failure=error;throw error}finally{client.release(failure)}
 }
 async function authenticateRole({role,database,connection}={}){
  const chosen=role==='qa_bootstrap'&&roleConnections.saas_api?{...clone(roleConnections.saas_api),user:'qa_bootstrap',password:m.target.rolePasswords.qa_bootstrap,database:'postgres'}:roleConnections[role];
  refuse([...ROLES,'qa_bootstrap'].includes(role)&&chosen&&chosen.user===role&&chosen.database===database&&chosen.password===m.target.rolePasswords[role]&&chosen.ssl?.ca===targetCa&&chosen.ssl.rejectUnauthorized===true&&(!connection||same(connection,chosen))&&targetResource?.networkIP&&targetResource?.systemIdentifier&&bootstrapCredential==='target','TARGET_RUNTIME_AUTH_ROLE');
  refuse(!leased,'TARGET_RUNTIME_BROKER_BUSY');bound();await ledger.charge('sql');bound();
  const backup=role==='saas_backup',client=await acquire(backup?'postgres':database,'ro',role,backup);let failure;
  try{
   const text=backup?'IDENTIFY_SYSTEM':"SELECT current_user AS role,current_database() AS database,host(inet_server_addr()) AS server_address,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,current_setting('transaction_read_only') AS read_only";
   const result=await client.query({text,values:[],query_timeout:2000});bound();refuse(Array.isArray(result.rows)&&result.rows.length===1,'TARGET_RUNTIME_AUTH_ROWSET');
   const r=result.rows[0];if(backup){refuse(r.systemid===targetResource.systemIdentifier&&Number.isSafeInteger(Number(r.timeline))&&Number(r.timeline)>0&&typeof r.xlogpos==='string'&&/^[0-9A-F]+\/[0-9A-F]+$/.test(r.xlogpos)&&client.tls===true,'TARGET_RUNTIME_AUTH_REPLICATION');return{role,database,authenticated:true,replication:true,systemIdentifier:r.systemid,timeline:Number(r.timeline),xlogPosition:r.xlogpos,tls:true};}
   refuse(r.role===role&&r.database===database&&r.server_address===targetResource.networkIP&&r.tls===true&&r.read_only==='on','TARGET_RUNTIME_AUTH_ROLE');return{role,database,authenticated:true,replication:false,sqlRole:r.role,sqlDatabase:r.database,serverAddress:r.server_address,tls:r.tls,readOnly:r.read_only==='on'};
  }catch(error){failure=error;throw error}finally{client.release(failure)}
 }
 async function close(){refuse(!leased,'TARGET_RUNTIME_BROKER_BUSY');closed=true;if(current){const old=current;current=null;await endPool(old.pool)}}
 return Object.freeze({pools:{control:facade('mecanet_control'),tenants:{[A]:facade('mecanet_tenant_a'),[B]:facade('mecanet_tenant_b')}},inspect,authenticateRole,close});
}

/** A fresh host receipt binds this invocation to exact resources and source
 * process exits. SQL absence is deliberately absent from the host contract:
 * every witness must query it using the broker. It is never a verified flag. */
export function validateTargetRuntimeLineage(input){
 const b=input.configBundle;if(!input.variantLineage){refuse(b.variantLineageHash===undefined,'TARGET_RUNTIME_VARIANT_BINDING');return null}
 const v=validateTargetVariantLineage(input.variantLineage),c=input.variantLineage;refuse(same(input.material,v.material)&&b.variantLineageHash===v.additionHash&&same(input.sourceCapture,c.sourceCapture)&&same(b.manifest.source,c.sourceResource)&&same(b.sourceEndProof,c.sourceEndProof)&&same(b.observedEnd,c.observedSourceEnd)&&same(b.copyIndex,c.copyIndex)&&same(b.sourceJournalFinalCheckpoint,c.sourceJournalFinalCheckpoint)&&b.sourceEndProof.recoveryId===v.sourceOriginalRecoveryId&&b.manifest.target.dataPath===v.paths.data&&b.manifest.target.socketPath===v.paths.socket,'TARGET_RUNTIME_VARIANT_BINDING');return v;
}
export function targetRuntimeCase(input){const v=validateTargetRuntimeLineage(input);return v?variantCaseName(v.kind,input.phase):'target-'+input.phase;}
/** Full target-plan validation occurs in validateInput. The additional private
 * context fixes this fault before SQL and retains its original job on retry. */
export function validateTargetCommitFaultContext(input){
 const b=input.configBundle,lineage=validateTargetRuntimeLineage(input),eligible=lineage?.kind==='commit-interrupted'&&input.phase==='promotion',c=input.commitFault??null;
 refuse(eligible===!!c,'TARGET_RUNTIME_COMMIT_CONTEXT_REQUIRED');if(!c){refuse(input.commitFaultContextHash===undefined,'TARGET_RUNTIME_COMMIT_CONTEXT_UNEXPECTED');return null}
 refuse(HASH.test(input.commitFaultContextHash??'')&&sha256(c)===input.commitFaultContextHash&&Object.keys(c).sort().join(',')==='configBundleHash,mode,plan,planHash,retryEndPair,retryProbe,schema,sourceCaptureHash,variantLineageHash','TARGET_RUNTIME_COMMIT_CONTEXT_HASH');
 refuse(c.schema==='target-commit-fault-context-v1'&&c.configBundleHash===input.configBundleHash&&c.sourceCaptureHash===input.sourceCaptureHash&&c.variantLineageHash===b.variantLineageHash&&['inject','reconcile'].includes(c.mode)&&HASH.test(c.planHash??'')&&sha256(c.plan)===c.planHash&&UUID.test(input.invocationId??''),'TARGET_RUNTIME_COMMIT_CONTEXT_BINDING');
 const expected=makeCommitFaultPlan({material:input.material,parentPlan:b.plan,parentPlanHash:b.planHash,variantLineageHash:b.variantLineageHash,invocationId:c.plan.invocationId,controllerContainerId:c.plan.controllerContainerId});
 refuse(same(c.plan,expected),'TARGET_RUNTIME_COMMIT_PLAN_BINDING');
 if(c.mode==='inject')refuse(c.plan.invocationId===input.invocationId&&c.retryEndPair===null&&c.retryProbe===null,'TARGET_RUNTIME_COMMIT_INJECT_BINDING');
 else{refuse(c.plan.invocationId!==input.invocationId,'TARGET_RUNTIME_COMMIT_RETRY_INVOCATION');validateCommitRetryEnd({plan:c.plan,planHash:c.planHash,retryEndPair:c.retryEndPair,retryProbe:c.retryProbe})}
 return freeze(clone(c));
}
export function createTargetRuntimePoolFactory({input,ledger,loadCommitFaultReceipt,publishCommitFaultReceipt,poolFactory=createPgPool}={}){
 const c=validateTargetCommitFaultContext(input);if(!c)return poolFactory;
 return createCommitFaultPoolFactory({plan:c.plan,planHash:c.planHash,mode:c.mode,ledger,loadReceipt:loadCommitFaultReceipt,publishReceipt:publishCommitFaultReceipt,poolFactory,retryEndPair:c.retryEndPair,retryProbe:c.retryProbe});
}
function hostBindingHash({phase,material,configBundle,configBundleHash,sourceCaptureHash,sourceSha,clockRestart,abortPrefix,variantLineage,commitFaultContextHash}){return sha256({phase,material,configBundle,configBundleHash,sourceCaptureHash,sourceSha,clockRestart:clockRestart??null,abortPrefix:abortPrefix??null,variantLineage:variantLineage??null,commitFaultContextHash:commitFaultContextHash??null})}
function prepareHostBinding(input){
 const b=input.configBundle,lineage=validateTargetRuntimeLineage(input);refuse(!(input.clockRestart&&input.abortPrefix),'TARGET_RUNTIME_COMPENSATION_CONTEXT');
 if(input.clockRestart)validateClockRestartPlan({...input.clockRestart,material:input.material,anchors:b.anchors,parentPlan:b.plan,parentPlanHash:b.planHash});
 const prefixPlan=input.abortPrefix?validateAbortPrefixPlan({...input.abortPrefix,material:input.material,anchors:b.anchors,proofBundle:b.proofBundle,parentPlan:b.plan,parentPlanHash:b.planHash,sourceEndProof:b.sourceEndProof,observedSourceEnd:input.abortPrefix.observedSourceEnd??b.observedEnd,...(input.variantLineage?{variantLineage:input.variantLineage,variantLineageHash:b.variantLineageHash}:{})}):null;
 return Object.freeze({[HOST_PREPARED]:true,bindingHash:hostBindingHash(input),prefixPlan,lineage,caseName:lineage?variantCaseName(lineage.kind,input.phase):'target-'+input.phase});
}
export function validateTargetHostReceipt({receipt,receiptHash,invocationId,phase,material,configBundle,configBundleHash,sourceCapture,sourceCaptureHash,sourceSha,clockRestart,abortPrefix,variantLineage,preparedBinding,now=Date.now()}={}){
 const b=configBundle;refuse(b?.anchors?.manifestHash===sha256(b.manifest)&&b.anchors.targetResourceHash===sha256(b.manifest.target)&&b.proofBundle?.sourceEndProofHash===sha256(b.sourceEndProof),'TARGET_RUNTIME_HOST_MANIFEST');
 refuse(receipt?.schema==='target-host-receipt-v1'&&HASH.test(receiptHash??'')&&sha256(receipt)===receiptHash&&UUID.test(invocationId??'')&&receipt.invocationId===invocationId&&RUNTIME_PHASES.includes(phase)&&receipt.phase===phase&&SHA.test(sourceSha??'')&&receipt.sourceSha===sourceSha,'TARGET_RUNTIME_HOST_RECEIPT');
 for(const[k,v]of Object.entries({recoveryId:material.recoveryId,generation:material.target.generation,custodyHash:sha256(material),configBundleHash,sourceCaptureHash,manifestHash:b.anchors.manifestHash,targetResourceHash:b.anchors.targetResourceHash,sourceEndProofHash:b.proofBundle.sourceEndProofHash}))refuse(receipt[k]===v,'TARGET_RUNTIME_HOST_BINDING');
 const age=now-Date.parse(receipt.observedAt);refuse(Number.isFinite(age)&&age>=0&&age<=5000,'TARGET_RUNTIME_HOST_FRESHNESS');
 validateManifest(b.manifest,receipt.observedResources);refuse(receipt.observedResources.sourcePostgresRunning===false&&receipt.observedResources.targetPostgresRunning===true&&Array.isArray(receipt.observedResources.runtimeConsumers),'TARGET_RUNTIME_HOST_RESOURCE');
 refuse(verifyEndProof(b.sourceEndProof,receipt.observedSourceEnd)===b.proofBundle.sourceEndProofHash,'TARGET_RUNTIME_HOST_SOURCE_END');
 refuse(!(clockRestart&&abortPrefix),'TARGET_RUNTIME_COMPENSATION_CONTEXT');
 const bindingInput={phase,material,configBundle,configBundleHash,sourceCaptureHash,sourceSha,clockRestart,abortPrefix,variantLineage},prepared=preparedBinding?.[HOST_PREPARED]===true&&preparedBinding.bindingHash===hostBindingHash(bindingInput)?preparedBinding:null,lineage=prepared?.lineage??validateTargetRuntimeLineage({...bindingInput,sourceCapture});
 if(lineage)refuse(receipt.variantLineageHash===lineage.additionHash&&receipt.caseName===variantCaseName(lineage.kind,phase),'TARGET_RUNTIME_VARIANT_HOST_BINDING');else refuse(receipt.variantLineageHash===undefined,'TARGET_RUNTIME_VARIANT_HOST_BINDING');
 if(clockRestart){if(!prepared)validateClockRestartPlan({...clockRestart,material,anchors:b.anchors,parentPlan:b.plan,parentPlanHash:b.planHash});refuse(receipt.clockRestartPlanHash===clockRestart.extensionHash&&receipt.additionHash===clockRestart.additionHash,'TARGET_RUNTIME_RESTART_HOST_BINDING');}
 if(abortPrefix){if(!prepared)validateAbortPrefixPlan({...abortPrefix,material,anchors:b.anchors,proofBundle:b.proofBundle,parentPlan:b.plan,parentPlanHash:b.planHash,sourceEndProof:b.sourceEndProof,observedSourceEnd:receipt.observedSourceEnd,...(variantLineage?{variantLineage,variantLineageHash:b.variantLineageHash}:{})});refuse((phase.startsWith('abort-')||phase===ABORT_PREFIX_EXECUTION_PHASE)&&receipt.abortPrefixPlanHash===abortPrefix.extensionHash,'TARGET_RUNTIME_ABORT_PREFIX_HOST_BINDING');}refuse(phase!==ABORT_PREFIX_EXECUTION_PHASE||abortPrefix,'TARGET_RUNTIME_ABORT_PREFIX_CONTEXT');
 if(phase.startsWith('abort-'))refuse(validateTargetEndPair({pair:receipt.targetEnd,material,targetResource:b.manifest.target,sourceEndProof:b.sourceEndProof,clockRestart,abortPrefix,variantLineage,configBundle:b,...(prepared?{preparedBinding:prepared,bindingInput}:{})})===receipt.targetEndProofHash,'TARGET_RUNTIME_TARGET_END_HASH');return freeze(clone(receipt));
}
export function validateTargetEndPair({pair,material,targetResource,sourceEndProof,clockRestart,abortPrefix,variantLineage,configBundle,preparedBinding,bindingInput}={}){
 const p=pair?.endProof,o=pair?.observedEnd,pending=p?.schema==='worker-end-v1';
 if(pending){
  refuse(abortPrefix&&!clockRestart&&canonical(pair.createdServices)===canonical(['worker']),'TARGET_RUNTIME_PENDING_END');
  const prepared=preparedBinding?.[HOST_PREPARED]===true&&preparedBinding.bindingHash===hostBindingHash(bindingInput)?preparedBinding:null;
  const selected=prepared?.prefixPlan??validateAbortPrefixPlan({...abortPrefix,material,anchors:configBundle?.anchors,proofBundle:configBundle?.proofBundle,parentPlan:configBundle?.plan,parentPlanHash:configBundle?.planHash,sourceEndProof,observedSourceEnd:abortPrefix.observedSourceEnd??configBundle?.observedEnd,...(variantLineage?{variantLineage,variantLineageHash:configBundle?.variantLineageHash}:{})});
  refuse(selected.schema==='recovery-abort-prefix-plan-v1'&&selected.recoveryId===material.recoveryId&&selected.generation===material.target.generation,'TARGET_RUNTIME_PENDING_END');
 }
 refuse(p?.schema===(pending?'worker-end-v1':'source-end-v1')&&p.recoveryId===material.recoveryId&&p.sourceResourceHash===sha256(targetResource),'TARGET_RUNTIME_TARGET_END');
 if(!pending)refuse(Array.isArray(pair.createdServices)&&canonical(pair.createdServices)===canonical(['api1','api2','web','worker']),'TARGET_RUNTIME_TARGET_END_INVENTORY');
 const hash=verifyEndProof(p,o,{profile:pending?'worker':'source'}),sourceIds=new Set(sourceEndProof.processes.map(p=>p.containerId));
 for(const row of p.processes){const owner=row.service==='worker'?(clockRestart?.addition.nextOwner??material.target.workerClockOwner):row.service==='web'?material.target.webOwner:material.target.apiOwners[row.service];refuse(row.ownerId===owner&&!sourceIds.has(row.containerId)&&(!clockRestart||row.service!=='worker'||row.containerId!==clockRestart.workerEndProof.processes[0].containerId),'TARGET_RUNTIME_TARGET_END_OWNER');}return hash;
}
/** The receipt is immutable, but its freshness is not cached. A controller that
 * cannot obtain another live host observation must stop when this one expires. */
export function createTargetHostObservers({input,receipt,receiptHash,now=Date.now}={}){
 const chosen=freeze(clone(input)),saved=freeze(clone(receipt));
 const current=()=>validateTargetHostReceipt({...chosen,receipt:saved,receiptHash,now:now()});current();
 return Object.freeze({observeResources:async()=>current().observedResources,observeSourceEnd:async()=>current().observedSourceEnd,...(chosen.phase.startsWith('abort-')?{observeTargetEnd:async()=>current().targetEnd}:{})});
}
export const TARGET_HOST_MAILBOX='/run/qa-live/target-host.json';
/** Specialized readers for the two host-owned atomic mailboxes. A complete
 * old FD may be unlinked by os.replace while read: that changes nlink/ctime,
 * never its sealed bytes. A name/open race permits at most three openings,
 * only when a different sealed current inode proves publication. No SQL,
 * writes, sleeps or cached observation occur here. Generic400 readers stay
 * strict. Each consumer still validates hash, bindings and <=5s freshness. */
async function readAtomicHostMailbox(file,io){
 const directory=async()=>{const d=await io.lstat('/run/qa-live');refuse(d.isDirectory()&&!d.isSymbolicLink()&&d.uid===999&&(d.mode&0o777)===0o700&&await io.realpath('/run/qa-live')==='/run/qa-live','TARGET_RUNTIME_MAILBOX_DIRECTORY')};
 const valid=(s,unlinked=false)=>s.isFile()&&!s.isSymbolicLink()&&s.uid===999&&(s.mode&0o777)===0o400&&(s.nlink===1||(unlinked&&s.nlink===0))&&s.size>=2&&s.size<=262144;
 const identity=(a,b)=>a.ino===b.ino&&a.dev===b.dev,unchanged=(a,b)=>['ino','dev','uid','mode','size','mtimeMs'].every(k=>a[k]===b[k]);
 await directory();
 for(let attempt=0;attempt<3;attempt++){
  const before=await io.lstat(file);refuse(valid(before),'TARGET_RUNTIME_MAILBOX_FILE');const h=await io.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
   const first=await h.stat();refuse(valid(first,true),'TARGET_RUNTIME_MAILBOX_FILE');
   if(!identity(first,before)){
    const named=await io.lstat(file);refuse(valid(named)&&valid(first)&&identity(first,named)&&unchanged(first,named)&&first.ctimeMs===named.ctimeMs,'TARGET_RUNTIME_MAILBOX_CHANGED');continue;
   }
   refuse(unchanged(first,before)&&(first.nlink===0?first.ctimeMs>=before.ctimeMs:first.ctimeMs===before.ctimeMs),'TARGET_RUNTIME_MAILBOX_CHANGED');
   const bytes=Buffer.alloc(first.size+1);let offset=0,reads=0;
   while(offset<bytes.length){refuse(++reads<=64,'TARGET_RUNTIME_MAILBOX_CHANGED');const r=await h.read(bytes,offset,bytes.length-offset,offset);refuse(Number.isInteger(r.bytesRead)&&r.bytesRead>=0&&r.bytesRead<=bytes.length-offset,'TARGET_RUNTIME_MAILBOX_CHANGED');if(r.bytesRead===0)break;offset+=r.bytesRead}
   refuse(offset===first.size,'TARGET_RUNTIME_MAILBOX_CHANGED');
   const final=await h.stat(),named=await io.lstat(file);await directory();
   refuse(valid(final,true)&&valid(named)&&unchanged(final,first)&&(final.nlink===0?final.ctimeMs>=first.ctimeMs:final.ctimeMs===first.ctimeMs),'TARGET_RUNTIME_MAILBOX_CHANGED');
   if(final.nlink===0)refuse(!identity(named,final),'TARGET_RUNTIME_MAILBOX_CHANGED');
   else if(identity(named,final))refuse(unchanged(named,final)&&named.ctimeMs===final.ctimeMs,'TARGET_RUNTIME_MAILBOX_CHANGED');
   const packet=JSON.parse(bytes.subarray(0,first.size).toString('utf8'));refuse(packet&&Object.keys(packet).sort().join(',')==='receipt,receiptHash','TARGET_RUNTIME_MAILBOX_PACKET');return freeze(clone(packet));
  }finally{await h.close()}
 }
 throw Error('TARGET_RUNTIME_MAILBOX_CHANGED');
}
export const readTargetHostMailbox=({io={lstat,open,realpath}}={})=>readAtomicHostMailbox(TARGET_HOST_MAILBOX,io);
export const readTargetCopyHostMailbox=({io={lstat,open,realpath}}={})=>readAtomicHostMailbox('/run/qa-live/target-copy-host.json',io);
/** No successful observation is cached. Each callback loads the host's latest
 * complete packet and validates its original invocation/case/binding anew.
 * Expiration or I/O error never falls back to an earlier successful sample. */
export function createTargetMailboxObservers({input,load=readTargetHostMailbox,now=Date.now}={}){
 const chosen=freeze(clone(input));refuse(typeof load==='function'&&typeof now==='function','TARGET_RUNTIME_MAILBOX_PROVIDER');
 // The full immutable compensation is validated once in this closure before
 // hot reads. A private, unexported symbol binds it to exact copied inputs;
 // there is no mutable-object cache or caller-provided "verified" flag.
 const preparedBinding=prepareHostBinding(chosen);
 async function current(){
  const packet=freeze(clone(await load()));refuse(packet&&Object.keys(packet).sort().join(',')==='receipt,receiptHash','TARGET_RUNTIME_MAILBOX_PACKET');
  refuse(packet.receipt?.caseName===preparedBinding.caseName,'TARGET_RUNTIME_MAILBOX_CASE');
  const receipt=validateTargetHostReceipt({...chosen,preparedBinding,receipt:packet.receipt,receiptHash:packet.receiptHash,now:now()}),age=now()-Date.parse(receipt.observedAt);
  refuse(Number.isFinite(age)&&age>=0&&age<=5000,'TARGET_RUNTIME_HOST_FRESHNESS');return receipt;
 }
 return Object.freeze({observeResources:async()=>current().then(r=>r.observedResources),observeSourceEnd:async()=>current().then(r=>r.observedSourceEnd),...(chosen.phase.startsWith('abort-')?{observeTargetEnd:async()=>current().then(r=>r.targetEnd)}:{})});
}
function validateInput(input){
 const x=freeze(clone(input)),m=validateMaterial(x.material),b=x.configBundle;
 refuse(HASH.test(x.custodyHash??'')&&sha256(m)===x.custodyHash&&b?.schema==='target-config-bundle-v1'&&HASH.test(x.configBundleHash??'')&&sha256(b)===x.configBundleHash&&HASH.test(x.sourceCaptureHash??'')&&sha256(x.sourceCapture)===x.sourceCaptureHash,'TARGET_RUNTIME_CUSTODY');
 validateTargetRuntimeLineage(x);
 validateTargetCredentialPhase(x.phase,x.bootstrapCredential);validateTargetPlan({plan:b.plan,planHash:b.planHash,material:m,anchors:b.anchors,proofBundle:b.proofBundle,variantLineage:x.variantLineage??null});
 validateTargetCommitFaultContext(x);
 refuse(x.copyRoot==='/run/qa-copy'&&SHA.test(x.sourceSha??'')&&x.sourceSha===b.plan.sourceSha&&b.anchors.custodyHash===x.custodyHash&&b.runtimeFixture?.generation===m.target.generation,'TARGET_RUNTIME_INPUT');
 const ca=b.runtimeFixture.connections?.saas_api?.ssl?.ca;refuse(typeof ca==='string'&&ca.length>0&&ca.length<=65536&&Object.values(b.runtimeFixture.connections).every(c=>c.ssl?.ca===ca&&c.ssl.rejectUnauthorized===true),'TARGET_RUNTIME_CA');
 refuse(!(x.clockRestart&&x.abortPrefix),'TARGET_RUNTIME_COMPENSATION_CONTEXT');
 if(x.clockRestart)validateClockRestartPlan({...x.clockRestart,material:m,anchors:b.anchors,parentPlan:b.plan,parentPlanHash:b.planHash});refuse(!CLOCK_RESTART_PHASES.includes(x.phase)||x.clockRestart,'TARGET_RUNTIME_RESTART_CONTEXT');
 if(x.abortPrefix){refuse(x.phase.startsWith('abort-')||x.phase===ABORT_PREFIX_EXECUTION_PHASE,'TARGET_RUNTIME_ABORT_PREFIX_CONTEXT');validateAbortPrefixPlan({...x.abortPrefix,material:m,anchors:b.anchors,proofBundle:b.proofBundle,parentPlan:b.plan,parentPlanHash:b.planHash,sourceEndProof:b.sourceEndProof,observedSourceEnd:x.abortPrefix.observedSourceEnd,...(x.variantLineage?{variantLineage:x.variantLineage,variantLineageHash:b.variantLineageHash}:{})});}refuse(x.phase!==ABORT_PREFIX_EXECUTION_PHASE||x.abortPrefix,'TARGET_RUNTIME_ABORT_PREFIX_CONTEXT');return x;
}

/** Config publication is a cold custody operation, not permission to start a
 * worker or reopen a tenant. The complete fixed plan is validated beforehand.
 * Exact retries read the original400 config; any collision fails closed. */
export async function publishTargetRuntimeConfigs({input,ledger,load=readTargetPrivate400,publish=publishSourceReadonly}={}){
 const x=validateInput(input),m=x.material,b=x.configBundle;refuse(x.phase==='clock-plan'&&typeof ledger?.charge==='function','TARGET_RUNTIME_CONFIG_PHASE');
 const recovery={mode:'RECOVERY',runId:m.recoveryId,manifestHash:b.anchors.manifestHash};
 const expected=deriveRuntimeConfig(m,'target',b.runtimeFixture,recovery,b.runtimeFixture.connections.saas_api.ssl.ca,b.plan.phases['clock-plan'].steps[0].args.transfer);
 refuse(same(expected,b.configs),'TARGET_RUNTIME_CONFIG_BINDING');validateApiConfig(b.configs.api1,m.target.project);validateApiConfig(b.configs.api2,m.target.project);validateWorkerConfig(b.configs.worker,m.target.project);
 for(const role of ROLES){const c=b.runtimeFixture.connections[role];refuse(c?.user===role&&c.password===m.target.rolePasswords[role]&&c.ssl?.ca===b.runtimeFixture.connections.saas_api.ssl.ca&&c.ssl.rejectUnauthorized===true,'TARGET_RUNTIME_CONFIG_CREDENTIAL');}
 for(const entries of [b.configs.api1.entries,b.configs.api1.writerEntries,b.configs.worker.maintenanceEntries])for(const e of Object.values(entries)){const c=e.connection;refuse(same(c,b.runtimeFixture.connections[c.user]),'TARGET_RUNTIME_CONFIG_CREDENTIAL');}
 const hashes=await publishTargetConfigFiles({configs:b.configs,project:m.target.project,ledger,load,publish});
 return{type:'cp019-target-configs',generation:m.target.generation,recoveryId:m.recoveryId,planHash:b.planHash,hashes,secretOutput:false,physicalStartup:'NOT VERIFIED'};
}
/** Pure producer of the existing acceptance ABI. Source history is a pinned
 * private result from the real source fixture, never reconstructed from SQL or
 * supplied as "verified" metadata. This does not authorize an HTTP run. */
export function makeTargetAcceptanceContext({input,sourceHistory,sourceHistoryHash}={}){
 const x=validateInput(input),m=x.material,b=x.configBundle,h=freeze(clone(sourceHistory));
 refuse(HASH.test(sourceHistoryHash??'')&&sha256(h)===sourceHistoryHash&&Object.keys(h).sort().join(',')==='historicalResults,oldSessionCookie,sourceEpoch,sourceGeneration'&&h.sourceEpoch==='2'&&h.sourceGeneration===m.source.generation&&typeof h.oldSessionCookie==='string'&&h.oldSessionCookie.startsWith('__Host-mecanet-session=')&&!/[\r\n]/.test(h.oldSessionCookie),'TARGET_RUNTIME_HISTORY_BINDING');
 const c=b.runtimeFixture.connections.saas_api,operationIds={products:clone(m.source.operationIds.products),receipts:clone(m.source.operationIds.receipts),postProduct:m.target.operationIds.postProduct,postReceipt:m.target.operationIds.postReceipt};
 const context={project:m.target.project,sourceCommit:x.sourceSha,artifactDigest:m.artifactDigest,systemIdentifier:b.manifest.target.systemIdentifier,identityPassword:m.target.identityPassword,observer:{...clone(c),database:'postgres',user:'qa_bootstrap',password:m.target.rolePasswords.qa_bootstrap},generation:m.target.generation,recovery:{mode:'RECOVERY',runId:m.recoveryId,manifestHash:b.anchors.manifestHash},operationIds,sourceEpoch:'2',targetEpoch:'3',historicalResults:clone(h.historicalResults),oldSessionCookie:h.oldSessionCookie,sourceEndProofHash:b.proofBundle.sourceEndProofHash};
 return freeze(clone(validateAcceptanceContext(context)));
}
export async function publishTargetAcceptanceContext({input,sourceHistory,sourceHistoryHash,ledger,load=readTargetPrivate400,publish=publishSourceReadonly}={}){
 const context=makeTargetAcceptanceContext({input,sourceHistory,sourceHistoryHash}),file='/run/qa-secrets/acceptance.json',hash=sha256(context);let old;
 try{old=await load(file)}catch(error){if(error.code!=='ENOENT')throw error}
 if(old){refuse(old.sha256===hash&&same(old.value,context),'TARGET_RUNTIME_ACCEPTANCE_COLLISION');return{sha256:hash}}
 await ledger.charge('artifactFiles');const saved=await publish(file,context),readback=await load(file);refuse(saved.sha256===hash&&readback.sha256===hash&&same(readback.value,context),'TARGET_RUNTIME_ACCEPTANCE_PUBLICATION');return{sha256:hash};
}
export async function publishTargetConfigFiles({configs,project,ledger,load=readTargetPrivate400,publish=publishSourceReadonly}={}){
 refuse(project==='mecanet-qa-p1l3-r03-target'&&typeof ledger?.charge==='function'&&typeof load==='function'&&typeof publish==='function','TARGET_RUNTIME_CONFIG_PUBLICATION');
 validateApiConfig(configs?.api1,project);validateApiConfig(configs?.api2,project);validateWorkerConfig(configs?.worker,project);const hashes={};
 for(const name of ['worker','api1','api2']){
  const file='/run/qa-secrets/'+name+'.json',value=configs[name],hash=sha256(value);let old;try{old=await load(file)}catch(error){if(error.code!=='ENOENT')throw error}
  if(old){refuse(old.sha256===hash&&same(old.value,value),'TARGET_RUNTIME_CONFIG_COLLISION');hashes[name]=old.sha256;continue}
  await ledger.charge('artifactFiles');const written=await publish(file,value);refuse(written.sha256===hash,'TARGET_RUNTIME_CONFIG_PUBLICATION');const readback=await load(file);refuse(readback.sha256===hash&&same(readback.value,value),'TARGET_RUNTIME_CONFIG_PUBLICATION');hashes[name]=hash;
 }
 return hashes;
}

/** The approved fixed plan is reused, never selected from current SQL state.
 * Witness and control use one broker; witness is charged here, control in its
 * existing driver. Missing live providers or durable sidecar adapters fail. */
export async function createTargetRuntime({input,ledger,journal,observeResources,observeSourceEnd,observeTargetEnd,loadInvariantCapture,persistInvariantCapture,loadCommitFaultReceipt,publishCommitFaultReceipt,driverFactory=createTargetDriver,witnessFactory=createTargetWitness,poolFactory=createPgPool,now=()=>performance.now()}={}){
 const x=validateInput(input),b=x.configBundle;
 refuse(ledger?.enter&&ledger?.charge&&ledger?.snapshot&&journal?.before&&journal?.after&&typeof observeResources==='function'&&typeof observeSourceEnd==='function'&&(!x.phase.startsWith('abort-')||typeof observeTargetEnd==='function')&&typeof loadInvariantCapture==='function'&&typeof persistInvariantCapture==='function','TARGET_RUNTIME_DEPENDENCIES');
 await ledger.enter(targetRuntimeCase(x));
 const selectedPoolFactory=createTargetRuntimePoolFactory({input:x,ledger,loadCommitFaultReceipt,publishCommitFaultReceipt,poolFactory});
 const broker=createTargetSqlBroker({material:x.material,targetCa:b.runtimeFixture.connections.saas_api.ssl.ca,targetResource:b.manifest.target,bootstrapCredential:x.bootstrapCredential,phase:x.phase,roleConnections:b.runtimeFixture.connections,ledger,poolFactory:selectedPoolFactory,now});
 try{
  const verifyStageProof=witnessFactory({material:x.material,phase:x.phase,configBundle:b,configBundleHash:x.configBundleHash,sourceCapture:x.sourceCapture,sourceCaptureHash:x.sourceCaptureHash,observeResources,observeSourceEnd,observeTargetEnd,query:broker.inspect,authenticateRole:broker.authenticateRole,loadInvariantCapture,persistInvariantCapture,...(x.variantLineage?{variantLineage:x.variantLineage}:{}),...(x.clockRestart?{clockRestartContext:x.clockRestart}:{}),...(x.abortPrefix?{abortPrefixContext:x.abortPrefix}:{}),now});
  refuse(typeof verifyStageProof==='function','TARGET_RUNTIME_WITNESS_REQUIRED');
  const observedResources=await observeResources(),observedEnd=await observeSourceEnd();
  const driver=CLOCK_RESTART_PHASES.includes(x.phase)?null:await driverFactory({material:x.material,anchors:b.anchors,proofBundle:b.proofBundle,plan:b.plan,planHash:b.planHash,observedResources,sourceEndProof:b.sourceEndProof,observedEnd,copyRoot:x.copyRoot,copyIndex:b.copyIndex,sourceJournalRecords:b.sourceJournalRecords,sourceJournalFinalCheckpoint:b.sourceJournalFinalCheckpoint,sourceJournalCopyCheckpoint:b.sourceJournalCopyCheckpoint,pools:broker.pools,ledger,journal,verifyStageProof,...(x.variantLineage?{variantLineage:x.variantLineage,variantLineageHash:b.variantLineageHash}:{}),...(x.clockRestart?{clockRestart:x.clockRestart}:{}),...(x.abortPrefix?{abortPrefix:x.abortPrefix}:{})});
  const clock=driver?null:createClockRestartController({input:{...x.clockRestart,material:x.material,anchors:b.anchors,parentPlan:b.plan,parentPlanHash:b.planHash},proofBundle:b.proofBundle,pools:broker.pools,ledger,journal,verifyStageProof,now});
  let running=false;
  return Object.freeze({binding:driver?.binding??Object.freeze({recoveryId:x.material.recoveryId,generation:x.material.target.generation,manifestHash:b.anchors.manifestHash,planHash:b.planHash,clockRestartPlanHash:x.clockRestart.extensionHash}),async run(){refuse(!running,'TARGET_RUNTIME_BUSY');running=true;try{const result=driver?await driver.runPhase(x.phase):await clock[x.phase==='clock-restart-plan'?'prepare':'record']();if(x.commitFault){refuse(x.commitFault.mode==='reconcile','TARGET_RUNTIME_COMMIT_FAULT_NOT_OBSERVED');refuse(result.results?.[0]?.method==='preparePromotion'&&result.results[0].reconciled===true,'TARGET_RUNTIME_COMMIT_RECONCILE_REQUIRED')}return result}finally{running=false}},close:()=>broker.close()});
 }catch(error){await broker.close();throw error}
}

const privatePaths=new Set(['/run/qa-secrets/material.json','/run/qa-secrets/source-capture.json','/run/qa-secrets/target-variant-lineage.json','/run/qa-secrets/target-invariants.json','/run/qa-secrets/target-clock-restart-context.json','/run/qa-secrets/target-abort-prefix-context.json','/run/qa-secrets/target-commit-fault-context.json','/run/qa-results/target-commit-fault-occurrence.json','/run/qa-secrets/acceptance.json','/run/qa-source-secrets/source-history.json','/run/qa-secrets/worker.json','/run/qa-secrets/api1.json','/run/qa-secrets/api2.json',...RUNTIME_PHASES.map(p=>'/run/qa-secrets/target-'+p+'-config.json'),...RUNTIME_PHASES.map(p=>'/run/qa-results/target-'+p+'.json')]);
export async function readTargetPrivate400(file){
 refuse(privatePaths.has(file),'TARGET_RUNTIME_PRIVATE_PATH');const before=await lstat(file);refuse(before.isFile()&&!before.isSymbolicLink()&&(before.mode&0o777)===0o400&&before.size>=2&&before.size<=262144&&(process.platform==='win32'||before.uid===process.getuid()),'TARGET_RUNTIME_PRIVATE_FILE');
 const h=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const s=await h.stat();refuse(s.ino===before.ino&&s.dev===before.dev&&s.size===before.size,'TARGET_RUNTIME_FILE_CHANGED');const bytes=await h.readFile();refuse(bytes.length===s.size,'TARGET_RUNTIME_FILE_CHANGED');return{value:JSON.parse(bytes),sha256:sha256(bytes)}}finally{await h.close()}
}
export function stableTargetResult(value){const result=clone(value);delete result.elapsedMs;delete result.sqlCommands;delete result.controlCommands;delete result.reconciled;for(const row of result.results??[])delete row.reconciled;return result;}
export async function main(){
 const [action,phase,...rest]=process.argv.slice(2);refuse(['run','configs'].includes(action)&&RUNTIME_PHASES.includes(phase)&&(action!=='configs'||phase==='clock-plan')&&rest.length===0,'TARGET_RUNTIME_CLI');
 const cfg=(await readTargetPrivate400('/run/qa-secrets/target-'+phase+'-config.json')).value,{value:material,sha256:custodyHash}=await readTargetPrivate400('/run/qa-secrets/material.json'),bundle=await loadTargetConfigBundle({expectedFullHash:cfg.configBundleHash,expectedHeaderHash:cfg.configBundleHeaderHash}),capture=await readTargetPrivate400('/run/qa-secrets/source-capture.json');
 refuse(cfg.schema==='target-runtime-config-v1'&&cfg.phase===phase&&cfg.invocationId===process.env.QA_INVOCATION_ID&&cfg.sourceSha===process.env.QA_CODE_SHA&&process.env.QA_PROJECT===material.target.project&&cfg.custodyHash===custodyHash&&cfg.configBundleHash===bundle.sha256&&cfg.sourceCaptureHash===capture.sha256&&typeof cfg.journalCreate==='boolean','TARGET_RUNTIME_CLI_BINDING');
 let clockRestart;if(cfg.clockRestartContextHash){const c=await readTargetPrivate400('/run/qa-secrets/target-clock-restart-context.json');refuse(c.sha256===cfg.clockRestartContextHash&&c.value.schema==='target-clock-restart-context-v1'&&c.value.configBundleHash===bundle.sha256,'TARGET_RUNTIME_RESTART_CONTEXT');clockRestart=c.value.clockRestart;}
 let abortPrefix;if(cfg.abortPrefixContextHash){const c=await readTargetPrivate400('/run/qa-secrets/target-abort-prefix-context.json');refuse(c.sha256===cfg.abortPrefixContextHash&&c.value.schema==='target-abort-prefix-context-v1'&&c.value.configBundleHash===bundle.sha256,'TARGET_RUNTIME_ABORT_PREFIX_CONTEXT');abortPrefix=c.value.abortPrefix;}
 let commitFault;if(cfg.commitFaultContextHash){const c=await readTargetPrivate400('/run/qa-secrets/target-commit-fault-context.json');refuse(c.sha256===cfg.commitFaultContextHash,'TARGET_RUNTIME_COMMIT_CONTEXT_HASH');commitFault=c.value;}
 let variantLineage;if(cfg.variantLineageContextHash){const v=await readTargetPrivate400('/run/qa-secrets/target-variant-lineage.json');refuse(v.sha256===cfg.variantLineageContextHash&&cfg.variantLineageHash===bundle.value.variantLineageHash,'TARGET_RUNTIME_VARIANT_BINDING');variantLineage=completeTargetVariantLineage(v.value,{sourceCapture:capture.value,sourceResource:bundle.value.manifest.source,sourceEndProof:bundle.value.sourceEndProof,observedSourceEnd:bundle.value.observedEnd,copyIndex:bundle.value.copyIndex,sourceJournalFinalCheckpoint:bundle.value.sourceJournalFinalCheckpoint});}
 const input={...cfg,material,custodyHash,configBundle:bundle.value,configBundleHash:bundle.sha256,sourceCapture:capture.value,sourceCaptureHash:capture.sha256,copyRoot:'/run/qa-copy',...(variantLineage?{variantLineage}:{}),...(clockRestart?{clockRestart}:{}),...(abortPrefix?{abortPrefix}:{}),...(commitFault?{commitFault}:{})};validateInput(input);
 const caseName=targetRuntimeCase(input),ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:'target-window'});await ledger.enter(caseName);
 const assertCase=async()=>{const s=await ledger.snapshot(),c=s.scenarios?.[caseName];refuse(s.activeScenarios?.['target-window']===caseName&&s.total.sql<=GLOBAL_LIMITS.sql&&(!c||c.total.sql<=CASE_LIMITS.sql&&uptime()-c.startedUptime>=0&&uptime()-c.startedUptime<45),'TARGET_RUNTIME_DEADLINE')};
 const charge=async(...args)=>{await ledger.charge(...args);await assertCase()};
 const budget={enter:ledger.enter,snapshot:ledger.snapshot,charge};
 if(action==='configs'){const h=await readTargetPrivate400('/run/qa-source-secrets/source-history.json');refuse(h.sha256===cfg.sourceHistoryHash,'TARGET_RUNTIME_HISTORY_BINDING');const result=await publishTargetRuntimeConfigs({input,ledger:budget}),acceptance=await publishTargetAcceptanceContext({input,sourceHistory:h.value,sourceHistoryHash:h.sha256,ledger:budget});await assertCase();console.log(JSON.stringify({...result,acceptanceHash:acceptance.sha256}));return}
 const hostObservers=createTargetMailboxObservers({input});
 const journal=await openStageJournal({file:'/run/qa-journal/target.jsonl',heads:'/run/qa-journal/target-heads',plans:'/run/qa-journal/target-plans',recoveryId:material.recoveryId,controllerOwner:material.controllerOwner,resourceHash:bundle.value.anchors.targetResourceHash,operationIds:{...material.stageOperationIds,...(clockRestart?clockRestart.addition.operationIds:{})},create:cfg.journalCreate,charge});
 const invariantPath='/run/qa-secrets/target-invariants.json';
 const loadInvariantCapture=async()=>{try{return await readTargetPrivate400(invariantPath)}catch(error){if(error.code==='ENOENT')return null;throw error}};
 const persistInvariantCapture=async(value,hash)=>{refuse(HASH.test(hash??'')&&sha256(value)===hash,'TARGET_RUNTIME_INVARIANT_HASH');const old=await loadInvariantCapture();if(old){refuse(old.sha256===hash&&same(old.value,value),'TARGET_RUNTIME_INVARIANT_CONFLICT');return old}await charge('artifactFiles');const saved=await publishSourceReadonly(invariantPath,value);refuse(saved.sha256===hash,'TARGET_RUNTIME_INVARIANT_HASH');return await readTargetPrivate400(invariantPath)};
 const occurrencePath='/run/qa-results/target-commit-fault-occurrence.json';
 const loadCommitFaultReceipt=async()=>{try{return await readTargetPrivate400(occurrencePath)}catch(error){if(error.code==='ENOENT')return null;throw error}};
 const publishCommitFaultReceipt=async(value,hash)=>{refuse(sha256(value)===hash,'TARGET_RUNTIME_COMMIT_RECEIPT_HASH');const saved=await publishSourceReadonly(occurrencePath,value);refuse(saved.sha256===hash,'TARGET_RUNTIME_COMMIT_RECEIPT_HASH');return saved};
 let runtime,journalClosed=false,operationError;
 try{
  runtime=await createTargetRuntime({input,ledger:budget,journal,...hostObservers,loadInvariantCapture,persistInvariantCapture,loadCommitFaultReceipt,publishCommitFaultReceipt});
  const file='/run/qa-results/target-'+phase+'.json';let old;try{old=await readTargetPrivate400(file)}catch(error){if(error.code!=='ENOENT')throw error}
  const compensationBinding={...(variantLineage?{variantLineageHash:bundle.value.variantLineageHash}:{}),...(clockRestart?{clockRestartPlanHash:clockRestart.extensionHash,additionHash:clockRestart.additionHash}:{}),...(abortPrefix?{abortPrefixPlanHash:abortPrefix.extensionHash}:{}),...(commitFault?{commitFaultPlanHash:commitFault.planHash,commitFaultOccurrenceHash:commitFault.retryEndPair?.occurrenceHash??null}:{})};
  if(old)refuse(old.value.schema==='target-runtime-receipt-v1'&&old.value.phase===phase&&old.value.planHash===bundle.value.planHash&&old.value.configBundleHash===bundle.sha256&&old.value.custodyHash===custodyHash&&old.value.sourceSha===cfg.sourceSha&&old.value.generation===material.target.generation&&old.value.recoveryId===material.recoveryId&&Object.entries(compensationBinding).every(([k,v])=>old.value[k]===v),'TARGET_RUNTIME_RECEIPT_CONFLICT');
  // Existing control reconciles its exact AFTER without issuing a new effect.
  // A retry returns the original receipt, not newly varying timing/statistics.
  const result=await runtime.run(),stable=stableTargetResult(result),resultHash=sha256(stable);
  if(old)refuse(old.value.resultHash===resultHash,'TARGET_RUNTIME_RECEIPT_CONFLICT');
  const saved=old??await(async()=>{await charge('artifactFiles');return publishSourceReadonly(file,{schema:'target-runtime-receipt-v1',phase,planHash:bundle.value.planHash,configBundleHash:bundle.sha256,custodyHash,sourceSha:cfg.sourceSha,generation:material.target.generation,recoveryId:material.recoveryId,...compensationBinding,resultHash,result,physicalCohortAcceptance:'NOT VERIFIED'})})();
  await runtime.close();runtime=null;await journal.close();journalClosed=true;await assertCase();console.log(JSON.stringify({type:'cp019-target-phase',phase,planHash:bundle.value.planHash,receiptHash:saved.sha256,secretOutput:false,physicalCohortAcceptance:'NOT VERIFIED'}));
 }catch(error){operationError=error;throw error}
 finally{let endError;if(runtime)try{await runtime.close()}catch(error){endError=error}if(!journalClosed)try{await journal.close()}catch(error){endError??=error}if(endError&&!operationError)throw endError;}
}
export function targetFailureSummary(error){const out={code:'TARGET_PHASE_FAILED'};if(/^(?:[A-Z0-9]{5}|[A-Z][A-Z0-9_]{1,70})$/.test(error?.code??''))out.causeCode=error.code;if(/^[A-Z][A-Z0-9_]{1,70}$/.test(error?.message??''))out.guard=error.message;if(typeof error?.position==='string'&&/^[1-9][0-9]{0,8}$/.test(error.position))out.queryPosition=Number(error.position);const frames=[...(error?.stack??'').matchAll(/tests[\/\\]qa[\/\\]cp019[\/\\]([a-z-]+\.mjs):([1-9][0-9]{0,5}):([1-9][0-9]{0,5})/g)].slice(0,3).map(m=>m[1]+':'+m[2]+':'+m[3]);if(frames.length)out.frames=frames;return out;}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({type:'cp019-target-runtime-failed',...targetFailureSummary(error),secretOutput:false}));process.exitCode=1});
