// Extends the existing exclusive CI harness; no VPS cohort, ledger or POS schema.
import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256} from '../../server/saas/recovery/protocol.js';
import {createPgPool} from '../../server/saas/db/pools.js';
import {publishDevelopmentMaterial} from './p1-l3-postgres.mjs';
import {closeDevelopmentSource,runRecoverySql} from './development-recovery.mjs';
import {startDevelopmentApis,exerciseDevelopmentHttp} from './development-http.mjs';
import {runDevelopmentRollbackProbes} from './development-faults.mjs';
import {copyClosedCiCluster,assertSourceFin,assertRecoveredClock,assertApiRestart} from './ci-cold-copy.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
export async function runCiRecovery(o){
 const {root,marker:m,integration,apis,beforeQuery,deadline}=o;
 const report={schema:'cp027-ci-portable-recovery-v1',status:'FAIL',environment:process.platform+' '+process.arch,oracleAcceptance:'NOT VERIFIED',outerProtocol:'NOT VERIFIED; SQL fixture proof anchors, not outer L3 journal/manifest'};
 try{
 async function custody(name,value){deadline();const receipt=await publishDevelopmentMaterial(resolve(root,name),value);const h=await open(root,'r');try{await h.sync()}finally{await h.close()}return{...receipt,directoryDurability:'LINUX_DIRECTORY_FSYNC_ACK'}}
 const sourceApiFin=await apis.stop();assert.ok(sourceApiFin?.length===2,'CI_SOURCE_API_FIN_REQUIRED');
 const sourceClosure=await closeDevelopmentSource({context:integration.context,sourceSha:m.sourceSha,onMaterial:value=>custody('closure-material.json',value)});report.sourceClosure=sourceClosure.report;
 assert.equal(integration.context.clockFailure(),null,'CI_SOURCE_CLOCK_FAILED');await integration.close();
 assert.equal(await o.stopSource(),'PASS','CI_SOURCE_POSTGRES_FIN_REQUIRED');
 const fin=await o.sourceFin();assert.equal(fin.owner,m.owner,'CI_SOURCE_FIN_OWNER');
 const sourceFin=assertSourceFin({schema:'cp027-ci-source-fin-v1',cid:fin.cid,owner:m.owner,sourceSha:m.sourceSha,exited:true,exitCode:fin.exitCode,pid:0,poolsEnded:true,api:sourceApiFin.map(x=>({instance:x.instance,exitCode:x.exitCode,drained:x.events.some(e=>e.type==='development-api-stopped'&&e.drained===true&&e.budget?.pools===0&&e.budget?.leased===0)}))});
 await o.publish('source-positive-fin.json',sourceFin);report.sourceFin={status:'PASS',sha256:sha256(sourceFin),apiProcesses:2,postgresExitCode:0};
 const targetData=resolve(root,'target/data');report.copy=await copyClosedCiCluster({root,source:m.data,target:targetData,sourceFin,beforeFile:deadline});
 await o.publish('cold-copy.json',report.copy);const sourceSnapshot={...sourceClosure.snapshot,sourceStopped:sourceFin,copyIndexHash:sha256(report.copy)};
 await o.publish('source-snapshot.json',sourceSnapshot);deadline();await o.createTarget();
 const connection={...o.connection,port:15433};let ready=false,attempts=0;const until=performance.now()+45000;
 while(performance.now()<until){deadline();const pool=await createPgPool({...connection,max:1,connectionTimeoutMillis:1000,statement_timeout:1000});try{beforeQuery();attempts++;const r=await pool.query("SELECT (SELECT system_identifier::text FROM pg_control_system()) AS id,current_setting('data_directory') AS directory,inet_server_port() AS port");assert.deepEqual(r.rows[0],{id:o.systemIdentifier,directory:targetData,port:15433});ready=true;break}catch(error){if(!['ECONNREFUSED','57P03','57P01','08006'].includes(error.code))throw error}finally{await pool.end()}await new Promise(resolve=>setTimeout(resolve,200))}
 assert.equal(ready,true,'CI_TARGET_READY_NOT_PROVEN');report.targetStartup={status:'PASS',attempts,sameSystemIdentifier:true,distinctDataDirectory:true};
 const sourcePrivateMaterial=JSON.parse(await readFile(resolve(root,'material.json'),'utf8'));
 const target=await runRecoverySql({targetConnection:connection,expectedDataDirectory:targetData,expectedSystemIdentifier:o.systemIdentifier,sourceSnapshot,sourcePrivateMaterial,sourceSha:m.sourceSha,keepRuntime:true,beforeQuery,interruptReconciliation:true,onMaterial:value=>custody('target-material.json',value)});
 o.onTargetRuntime(target);report.recovery=target.report;
 let targetApis=await startDevelopmentApis(target.context,{privateRoot:root,prefix:'restored'});o.onTargetApis(targetApis);
 const measured={...targetApis,http(...args){deadline();o.httpBudget();return targetApis.http(...args)}};
 const targetHttp=await exerciseDevelopmentHttp(target.context,measured);report.targetHttp=targetHttp.report;
 const old=await measured.http(2,'GET','/api/auth/session',{cookie:o.sourceHttp.privateState.cookie});assert.ok(old.status===200&&old.body.authenticated===false,'CI_OLD_SESSION_REVALIDATED');
 const state=targetHttp.privateState,historical=await measured.http(2,'GET',`/api/tenants/${A}/operations/${o.sourceHttp.privateState.receiptKey}`,{cookie:state.cookie});assert.equal(historical.status,200,'CI_RESTORED_HISTORY_DENIED');assert.deepEqual(historical.body.result,o.sourceHttp.privateState.receiptResult,'CI_RESTORED_HISTORY_CHANGED');
 const stale=await measured.http(1,'POST',`/api/tenants/${A}/products`,{cookie:state.cookie,csrf:state.csrf,headers:{'X-Data-Epoch':sourceSnapshot.tenants[0].dataEpoch,'Idempotency-Key':randomUUID()},body:{sku:'CP027-STALE',name:'No debe crearse'}});assert.equal(stale.status,409,'CI_OLD_EPOCH_NOT_DENIED');
 const pre=await measured.http(1,'GET','/api/auth/session');let cookie=pre.cookies.map(c=>c.split(';')[0]).join('; ');const login=await measured.http(1,'POST','/api/auth/login',{cookie,csrf:pre.body.csrfToken,body:{email:'b@qa.invalid',password:target.context.identityPassword,purpose:'company'}});assert.equal(login.status,200,'CI_B_LOGIN_FAILED');cookie=login.cookies.map(c=>c.split(';')[0]).join('; ');const blocked=await measured.http(2,'GET',`/api/tenants/${B}/inventory`,{cookie});assert.equal(blocked.status,403,'CI_B_RESTRICTION_REMOVED');
 assertRecoveredClock(target.context);report.continuation={status:'PASS',historical:true,oldSessionInvalid:true,oldEpochRejected:true,companyBBlocked:true,additionalHttpCalls:6,twoApiProcesses:true,productAndReceiptReplay:true};
 const previousProcesses=targetApis.summary().processes;report.targetApiFin=await targetApis.stop();assertRecoveredClock(target.context);deadline();
 targetApis=await startDevelopmentApis(target.context,{privateRoot:root,prefix:'restarted'});o.onTargetApis(targetApis);assertApiRestart(report.targetApiFin,previousProcesses,targetApis.summary().processes);
 for(const api of [1,2]){const ready=await measured.http(api,'GET','/api/health/ready');assert.equal(ready.status,200,'CI_RESTART_READINESS_FAILED')}
 const session=await measured.http(2,'GET','/api/auth/session',{cookie:state.cookie});assert.ok(session.status===200&&session.body.authenticated===true,'CI_RESTART_SESSION_LOST');
 const restoredHistory=await measured.http(1,'GET',`/api/tenants/${A}/operations/${o.sourceHttp.privateState.receiptKey}`,{cookie:state.cookie});assert.equal(restoredHistory.status,200,'CI_RESTART_HISTORY_DENIED');assert.deepEqual(restoredHistory.body.result,o.sourceHttp.privateState.receiptResult,'CI_RESTART_HISTORY_CHANGED');
 report.apiRestart={status:'PASS',previousProcesses,processes:targetApis.summary().processes,previousPositiveFin:true,newNodeProcesses:2,sameDatabase:true,sameClockOwner:true,sameSession:true,historicalResultPreserved:true,additionalHttpCalls:4,scope:'two API restarted, not clock/controller/PostgreSQL restart'};
 report.restartedApiFin=await targetApis.stop();await target.close();assertRecoveredClock(target.context);
 report.rollback=await runDevelopmentRollbackProbes({targetConnection:{...connection,password:target.targetPrivateMaterial.rolePasswords.qa_bootstrap},expectedDataDirectory:targetData,expectedSystemIdentifier:o.systemIdentifier,targetPrivateMaterial:target.targetPrivateMaterial,beforeQuery,onMaterial:value=>custody('rollback-material.json',value)});
 report.unexecutedFaults=['clock/controller/PostgreSQL restart during reconciliation','unknown write debt across physical copy','full outer durable journal','135-scenario sequence','Oracle shared host/resource coexistence'];report.status='PASS';return report;
 }catch(error){if(error.developmentApiStartupCleanup)report.apiRestartStartupCleanup=error.developmentApiStartupCleanup;error.portableRecoveryReport=report;throw error}
}
