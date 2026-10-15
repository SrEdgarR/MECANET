// Private QA only: an actually OPEN local fence cannot bypass global recovery.
// HTTP is deliberately unauthenticated: the recovery guard precedes auth. This
// does not claim to prove company permissions or a successful business request.
import {open,lstat} from 'node:fs/promises';import {constants} from 'node:fs';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {uptime} from 'node:os';import {isIP} from 'node:net';
import {canonical,sha256} from '../../../server/saas/recovery/protocol.js';
import {validateMaterial} from '../../../server/saas/recovery/custody.js';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {publishSourceReadonly} from './source-driver.mjs';import {newLedger} from './ledger.mjs';
import {CASE_LIMITS,GLOBAL_LIMITS} from './budget-limits.mjs';
import {completeTargetVariantLineage,validateTargetVariantLineage,assertVariantLedgerContinuity} from './target-variant-lineage.mjs';
import {validateAbortPrefixPlan} from './abort-prefix-plan.mjs';
import {readTargetPrivate400,createTargetMailboxObservers} from './target-runtime.mjs';
import {loadTargetConfigBundle} from './target-bundle-io.mjs';import {createPrivateClient} from './acceptance.mjs';
const H=/^[a-f0-9]{64}$/,U=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const A='11111111-1111-4111-8111-111111111111',TARGET='mecanet-qa-p1l3-r03-target';
const check=(ok,code)=>{if(!ok)throw Error(code)},same=(a,b)=>canonical(a)===canonical(b);
function binding(x){check(x?.schema==='cp021-promotion-barrier-input-v1'&&x.kind==='promote-prefix'&&x.project===TARGET&&/^[a-f0-9]{40}$/.test(x.sourceSha??'')&&['generation','recoveryId','operationId'].every(k=>U.test(x[k]??''))&&['variantLineageHash','custodyHash','configBundleHash','planHash'].every(k=>H.test(x[k]??'')),'PROMOTION_BARRIER_BINDING');return x}
function response(r,status,body){check(r?.status===status&&same(r.json,body)&&r.headers?.cacheControl==='no-store'&&r.headers?.contentType?.startsWith('application/json'),'PROMOTION_BARRIER_HTTP')}
export function validatePromotionBarrierConfig(cfg,env){
 const keys=['schema','project','sourceSha','invocationId','custodyHash','configBundleHash','configBundleHeaderHash','sourceCaptureHash','variantLineageContextHash','variantLineageHash','abortPrefixContextHash','httpCa'];
 check(cfg&&typeof cfg==='object'&&!Array.isArray(cfg)&&Object.keys(cfg).sort().join(',')===keys.sort().join(',')&&cfg.schema==='cp021-promotion-barrier-input-v1'&&cfg.project===TARGET&&cfg.project===env?.QA_PROJECT&&/^[a-f0-9]{40}$/.test(cfg.sourceSha??'')&&cfg.sourceSha===env.QA_CODE_SHA&&U.test(cfg.invocationId??'')&&cfg.invocationId===env.QA_INVOCATION_ID&&keys.filter(k=>k.endsWith('Hash')).every(k=>H.test(cfg[k]??''))&&typeof cfg.httpCa==='string'&&cfg.httpCa.length>0&&cfg.httpCa.length<=65536,'PROMOTION_BARRIER_CONFIG');return cfg;
}
/** Models can supply SQL and transport doubles. The caller's main additionally
 * verifies the complete lineage, fixed compensation and live Root receipts. */
export async function probePromotionBarrier({input,snapshot,observeBoundary,ledger,ca,clientFactory=createPrivateClient}={}){
 const b=Object.freeze(JSON.parse(canonical(binding(input))));check(typeof snapshot==='function'&&typeof observeBoundary==='function'&&typeof ledger?.charge==='function'&&typeof ca==='string'&&ca.length>0&&ca.length<=65536,'PROMOTION_BARRIER_DEPENDENCIES');
 await observeBoundary();const before=await snapshot();check(before?.globalBlocked===true&&before.localOpen===true&&H.test(before.hash??''),'PROMOTION_BARRIER_SQL_STATE');
 const transportLedger={async charge(...args){await observeBoundary();await ledger.charge(...args);await observeBoundary()}},clients=Object.fromEntries(['api1','api2'].map(instance=>[instance,clientFactory({instance,ca,ledger:transportLedger})])),instances=[];let pending=0;
 async function request(instance,path,options){await observeBoundary();pending++;try{const r=await clients[instance].request(path,options);await observeBoundary();return r}finally{pending--}}
 for(const instance of ['api1','api2']){response(await request(instance,'/api/health/live'),200,{status:'live'});response(await request(instance,'/api/health/ready'),503,{status:'unavailable'});instances.push({instance,live:200,ready:503})}
 const denied=await request('api2',`/api/tenants/${A}/products`,{method:'POST',body:{sku:'QA-PREFIX-BLOCKED',name:'Synthetic recovery barrier'},headers:{'Idempotency-Key':b.operationId,'X-Data-Epoch':'3'}});response(denied,503,{error:'SERVICE_UNAVAILABLE'});
 await observeBoundary();const after=await snapshot();await observeBoundary();check(after?.globalBlocked===true&&after.localOpen===true&&before.hash===after.hash&&pending===0,'PROMOTION_BARRIER_EFFECT_CHANGED');
 return {schema:'cp021-promotion-barrier-v1',status:'PASS',kind:b.kind,project:b.project,sourceSha:b.sourceSha,generation:b.generation,recoveryId:b.recoveryId,variantLineageHash:b.variantLineageHash,custodyHash:b.custodyHash,configBundleHash:b.configBundleHash,planHash:b.planHash,expectedReadyStatus:503,pendingHttp:pending,globalBlocked:true,localOpen:true,effectUnchanged:true,beforeHash:before.hash,afterHash:after.hash,instances,post:{instance:'api2',status:503,error:'SERVICE_UNAVAILABLE'},operationId:b.operationId,authenticatedRequest:false};
}
async function config400(){
 const path='/run/qa-secrets/promotion-barrier-config.json',before=await lstat(path);check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o777)===0o400&&before.uid===process.getuid()&&before.size>=2&&before.size<=262144,'PROMOTION_BARRIER_CONFIG_FILE');const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await fd.stat(),raw=await fd.readFile(),after=await fd.stat(),named=await lstat(path);check(['dev','ino','size','mode','uid','nlink','mtimeMs','ctimeMs'].every(k=>before[k]===s[k]&&s[k]===after[k]&&after[k]===named[k])&&raw.length===s.size,'PROMOTION_BARRIER_CONFIG_CHANGED');const value=JSON.parse(raw);check(canonical(value)===raw.toString('utf8'),'PROMOTION_BARRIER_CONFIG_CANONICAL');return value}finally{await fd.close()}
}
const centralSql=`SELECT host(inet_server_addr()) AS server_address,current_database() AS database,current_user AS role,current_setting('transaction_read_only') AS read_only,(SELECT system_identifier::text FROM pg_control_system()) AS system_id,
 r.id AS recovery_id,r.mode,r.target_generation,r.manifest_hash,r.controller_owner,r.stage,r.version::text,r.global_blocked,f.barrier,w.state,w.generation,w.data_epoch::text,w.writer_version::text,
 (SELECT encode(sha256(convert_to(coalesce(string_agg(kind||value::text,'|' ORDER BY kind,value::text),''),'UTF8')),'hex') FROM (
 SELECT 'intent' AS kind,to_jsonb(t) AS value FROM saas.write_intents t UNION ALL SELECT 'growth',to_jsonb(t) FROM saas.write_growth_reservations t UNION ALL SELECT 'projection',to_jsonb(t) FROM saas.write_projections t UNION ALL SELECT 'transition',to_jsonb(t) FROM saas.write_transitions t UNION ALL SELECT 'restriction',to_jsonb(t) FROM saas.write_restrictions t UNION ALL SELECT 'restriction_tenant',to_jsonb(t) FROM saas.write_restriction_tenants t UNION ALL SELECT 'tenant',to_jsonb(t) FROM saas.recovery_tenants t UNION ALL SELECT 'writer',to_jsonb(t) FROM saas.tenant_writer_state t UNION ALL SELECT 'directory',to_jsonb(t) FROM saas.tenant_directory t)z) AS effect_hash
 FROM saas.recovery_runs r JOIN saas.admission_fence f ON f.recovery_id=r.id JOIN saas.tenant_writer_state w ON w.tenant_id=$2::uuid WHERE r.id=$1::uuid`;
const localSql=`SELECT host(inet_server_addr()) AS server_address,current_database() AS database,current_user AS role,current_setting('transaction_read_only') AS read_only,(SELECT system_identifier::text FROM pg_control_system()) AS system_id,
 g.recovery_id,g.mode,g.target_generation,g.target_epoch::text AS guard_epoch,g.manifest_hash,g.controller_owner,g.tenant_id,g.stage,g.version::text,f.state,f.generation,f.data_epoch::text,f.writer_version::text,
 (SELECT encode(sha256(convert_to(coalesce(string_agg(kind||value::text,'|' ORDER BY kind,value::text),''),'UTF8')),'hex') FROM (
 SELECT 'product' AS kind,to_jsonb(t) AS value FROM catalog.products t UNION ALL SELECT 'balance',to_jsonb(t) FROM inventory.balances t UNION ALL SELECT 'operation',to_jsonb(t) FROM inventory.operations t UNION ALL SELECT 'movement',to_jsonb(t) FROM inventory.movements t UNION ALL SELECT 'audit',to_jsonb(t) FROM inventory.audit t UNION ALL SELECT 'quota',to_jsonb(t) FROM inventory.quota_state t UNION ALL SELECT 'guard',to_jsonb(t) FROM inventory.recovery_guard t UNION ALL SELECT 'fence',to_jsonb(t) FROM inventory.writer_fence t)z) AS effect_hash
 FROM inventory.recovery_guard g CROSS JOIN inventory.writer_fence f WHERE g.recovery_id=$1::uuid AND f.id=1`;
/** Fixed SELECTs only. Local PostgreSQL receives exactly one bind value. */
export function makePromotionSnapshotRequests(input){
 check(input&&Object.keys(input).join(',')==='recoveryId'&&U.test(input.recoveryId??''),'PROMOTION_BARRIER_QUERY_BINDING');const id=input.recoveryId;
 return Object.freeze([{database:'mecanet_control',text:centralSql,values:Object.freeze([id,A]),query_timeout:2000},{database:'mecanet_tenant_a',text:localSql,values:Object.freeze([id]),query_timeout:2000}].map(Object.freeze));
}
/** One positively ended RO pool before another database can be opened. A failed
 * or timed-out observation poisons this observer; it cannot retry a new pool. */
export function createPromotionSnapshot({material,configBundle,invocationId,ledger,observeBoundary,poolFactory=createPgPool,now=()=>performance.now(),endTimeoutMs=2000}={}){
 const m=JSON.parse(canonical(validateMaterial(material))),resource=JSON.parse(canonical(configBundle?.manifest?.target??null)),manifestHash=configBundle?.anchors?.manifestHash,ssl=JSON.parse(canonical(configBundle?.configs?.api1?.control?.ssl??null));
 check(m.target.project===TARGET&&U.test(invocationId??'')&&typeof ledger?.charge==='function'&&typeof observeBoundary==='function'&&typeof poolFactory==='function'&&typeof now==='function'&&Number.isInteger(endTimeoutMs)&&endTimeoutMs>0&&endTimeoutMs<=2000&&resource?.project===TARGET&&resource.generation===m.target.generation&&isIP(resource.networkIP)===4&&/^[0-9]{10,24}$/.test(resource.systemIdentifier??'')&&H.test(manifestHash??'')&&typeof ssl?.ca==='string'&&ssl.ca.length>0&&ssl.ca.length<=65536&&ssl.servername==='postgres'&&ssl.rejectUnauthorized===true,'PROMOTION_BARRIER_SNAPSHOT_BINDING');
 const requests=makePromotionSnapshotRequests({recoveryId:m.recoveryId}),started=now();let busy=false,uncertain=false;
 const deadline=()=>{const current=now();check(Number.isFinite(current)&&current-started>=0&&current-started<45000,'PROMOTION_BARRIER_DEADLINE')};
 const observe=async()=>{deadline();await observeBoundary();deadline()};
 async function end(pool){let timer;try{await Promise.race([Promise.resolve().then(()=>pool.end()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PROMOTION_BARRIER_END_UNCERTAIN')),endTimeoutMs)})])}finally{clearTimeout(timer)}}
 async function query(request){
  let pool,client,failure;
  try{
   await observe();pool=await poolFactory({host:'postgres',port:5432,database:request.database,user:'qa_bootstrap',password:m.target.rolePasswords.qa_bootstrap,ssl:{...ssl},max:1,connectionTimeoutMillis:2000,statement_timeout:2000,lock_timeout:300,application_name:'cp021-promotion-barrier:'+invocationId,options:'-c default_transaction_read_only=on -c client_encoding=UTF8'});deadline();client=await pool.connect();await observe();check(client.connection?.stream?.encrypted===true,'PROMOTION_BARRIER_TLS');
   await ledger.charge('sql');await observe();const result=await client.query({text:request.text,values:[...request.values],query_timeout:request.query_timeout});await observe();check(Array.isArray(result.rows)&&result.rows.length===1,'PROMOTION_BARRIER_ROWSET');return result.rows[0];
  }catch(error){failure=error;throw error}finally{
   let releaseError;try{client?.release(failure)}catch(error){releaseError=error}
   if(pool)await end(pool);if(releaseError)throw releaseError;
  }
 }
 return async()=>{
  check(!busy&&!uncertain,'PROMOTION_BARRIER_OBSERVER_UNCERTAIN');busy=true;
  try{
   const rows=[];for(const request of requests)rows.push(await query(request));
   for(const[i,row]of rows.entries())check(row.server_address===resource.networkIP&&row.database===requests[i].database&&row.role==='qa_bootstrap'&&row.read_only==='on'&&row.system_id===resource.systemIdentifier&&row.recovery_id===m.recoveryId&&row.mode==='RECOVERY'&&row.target_generation===m.target.generation&&row.manifest_hash===manifestHash&&row.controller_owner===m.controllerOwner&&row.generation===m.target.generation&&row.data_epoch==='3'&&row.writer_version==='3'&&H.test(row.effect_hash??''),'PROMOTION_BARRIER_SQL_STATE');
   const[c,l]=rows;check(c.stage==='PROMOTING'&&c.version==='6'&&c.global_blocked===true&&c.barrier===true&&c.state==='CLOSED'&&l.stage==='LOCAL_OPEN'&&l.version==='5'&&l.state==='OPEN'&&l.tenant_id===A&&l.guard_epoch==='3','PROMOTION_BARRIER_SQL_STATE');await observe();return{globalBlocked:true,localOpen:true,hash:sha256(rows)};
  }catch(error){uncertain=true;throw error}finally{busy=false}
 };
}
export async function main(){
 check(process.argv.length===2,'PROMOTION_BARRIER_CLI');const cfg=validatePromotionBarrierConfig(await config400(),process.env);
 const material=await readTargetPrivate400('/run/qa-secrets/material.json'),capture=await readTargetPrivate400('/run/qa-secrets/source-capture.json'),rawContext=await readTargetPrivate400('/run/qa-secrets/target-variant-lineage.json'),prefix=await readTargetPrivate400('/run/qa-secrets/target-abort-prefix-context.json'),bundle=await loadTargetConfigBundle({expectedFullHash:cfg.configBundleHash,expectedHeaderHash:cfg.configBundleHeaderHash});
 check(cfg.custodyHash===material.sha256&&cfg.sourceCaptureHash===capture.sha256&&cfg.variantLineageContextHash===rawContext.sha256&&cfg.abortPrefixContextHash===prefix.sha256,'PROMOTION_BARRIER_CUSTODY');
 const b=bundle.value,m=material.value,lineage=completeTargetVariantLineage(rawContext.value,{sourceCapture:capture.value,sourceResource:b.manifest.source,sourceEndProof:b.sourceEndProof,observedSourceEnd:b.observedEnd,copyIndex:b.copyIndex,sourceJournalFinalCheckpoint:b.sourceJournalFinalCheckpoint}),v=validateTargetVariantLineage(lineage),p=prefix.value.abortPrefix;
 check(v.kind==='promote-prefix'&&cfg.variantLineageHash===v.additionHash&&same(m,v.material)&&prefix.value.configBundleHash===bundle.sha256&&b.variantLineageHash===v.additionHash&&cfg.httpCa===b.configs.api1.control.ssl.ca,'PROMOTION_BARRIER_LINEAGE');
 const extension=validateAbortPrefixPlan({...p,material:m,anchors:b.anchors,proofBundle:b.proofBundle,parentPlan:b.plan,parentPlanHash:b.planHash,sourceEndProof:b.sourceEndProof,observedSourceEnd:p.observedSourceEnd??b.observedEnd,variantLineage:lineage,variantLineageHash:v.additionHash});check(extension.faultPoint==='PROMOTION_AFTER_OPEN_A','PROMOTION_BARRIER_FAULT_POINT');
 const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:'target-window'});await ledger.enter('target-promote-fault');
 const budget=async()=>{const s=await ledger.snapshot(),r=s.scenarios?.['target-promote-fault'];assertVariantLedgerContinuity(lineage,s);check(s.activeScenarios?.['target-window']==='target-promote-fault'&&r&&uptime()-r.startedUptime>=0&&uptime()-r.startedUptime<45&&r.total.sql<=CASE_LIMITS.sql&&Object.entries(GLOBAL_LIMITS).every(([k,n])=>s.total[k]<=n),'PROMOTION_BARRIER_BUDGET')};
 const observers=createTargetMailboxObservers({input:{invocationId:cfg.invocationId,phase:'promote-fault',material:m,configBundle:b,configBundleHash:bundle.sha256,sourceCapture:capture.value,sourceCaptureHash:capture.sha256,sourceSha:cfg.sourceSha,abortPrefix:p,variantLineage:lineage}});
 const observeBoundary=async()=>{await budget();await observers.observeResources();await budget()};
 const snapshot=createPromotionSnapshot({material:m,configBundle:b,invocationId:cfg.invocationId,ledger,observeBoundary});
 const input={schema:cfg.schema,kind:'promote-prefix',project:TARGET,sourceSha:cfg.sourceSha,generation:m.target.generation,recoveryId:m.recoveryId,operationId:m.target.operationIds.postProduct,variantLineageHash:v.additionHash,custodyHash:material.sha256,configBundleHash:bundle.sha256,planHash:p.extensionHash};
 const report=await probePromotionBarrier({input,snapshot,observeBoundary,ledger,ca:cfg.httpCa}),file='/run/qa-results/promotion-barrier.json';await budget();await ledger.charge('artifactFiles');const saved=await publishSourceReadonly(file,report);check(saved.sha256===sha256(report),'PROMOTION_BARRIER_PUBLICATION');await budget();console.log(JSON.stringify({type:'cp021-promotion-barrier',status:'PASS',reportHash:saved.sha256,sourceSha:cfg.sourceSha,secretsPrinted:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('PROMOTION_BARRIER_FAILED');process.exitCode=1});
