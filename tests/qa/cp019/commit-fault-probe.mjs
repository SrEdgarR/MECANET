// QA only: positive absence of the original failed controller's SQL backend.
// The Docker END is supplied independently by Root; elapsed time proves nothing.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {canonical,sha256} from '../../../server/saas/recovery/protocol.js';
import {newLedger} from './ledger.mjs';
import {publishSourceReadonly} from './source-driver.mjs';
import {validateCommitFaultReceipt} from './commit-fault-hook.mjs';
const check=(ok,code)=>{if(!ok)throw Error(code)};
const HASH=/^[a-f0-9]{64}$/;
const exact=(x,keys,code)=>check(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(','),code);
const CONFIG_PATH='/run/qa-secrets/commit-end-probe-config.json';
/** This one fixed alias is not a general runtime config or path selector. */
export async function readCommitProbeConfig(path=CONFIG_PATH){
 check(path===CONFIG_PATH&&resolve(path)===path,'COMMIT_END_CONFIG_PATH');
 const before=await lstat(path);check(before.isFile()&&!before.isSymbolicLink()&&before.uid===999&&before.nlink===1&&(before.mode&0o777)===0o400&&before.size>=2&&before.size<=262144&&await realpath(path)===path,'COMMIT_END_CONFIG_PRIVATE');
 const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const opened=await fd.stat();check(['dev','ino','size','mode','uid','nlink','mtimeMs','ctimeMs'].every(k=>opened[k]===before[k]),'COMMIT_END_CONFIG_CHANGED');const buffer=Buffer.alloc(before.size+1);let length=0;while(length<buffer.length){const {bytesRead}=await fd.read(buffer,length,buffer.length-length,length);if(!bytesRead)break;length+=bytesRead}const bytes=buffer.subarray(0,length),after=await fd.stat(),named=await lstat(path);check(bytes.length===before.size&&['dev','ino','size','mode','uid','nlink','mtimeMs','ctimeMs'].every(k=>after[k]===opened[k]&&named[k]===after[k])&&!named.isSymbolicLink(),'COMMIT_END_CONFIG_CHANGED');const value=JSON.parse(bytes);check(bytes.toString()===canonical(value),'COMMIT_END_CONFIG_CANONICAL');return value}finally{await fd.close()}
}
function validateRootEnd(c){
 const code='COMMIT_END_ROOT_RECEIPTS',p=c.plan,x=c.observed,a=c.jobCreated,e=c.jobEnd;
 exact(a,['schema','jobId','containerId','project','service','ownerId','imageDigest','commandHash','state','createdAt'],code);
 exact(e,['schema','jobId','containerId','project','service','ownerId','createdReceiptHash','exitCode','finishedAt','startedAt','containerStopped','sqlAbsence'],code);
 check(c.jobCreatedHash===sha256(a)&&c.jobEndHash===sha256(e)&&a.schema==='controller-job-created-v1'&&a.jobId===p.invocationId&&a.containerId===p.controllerContainerId&&a.project===c.project&&['probe','harness','controller-tool'].includes(a.service)&&a.ownerId===p.controllerOwner&&/^sha256:[a-f0-9]{64}$/.test(a.imageDigest??'')&&a.commandHash===sha256(['node','tests/qa/cp019/target-runtime.mjs','run','promotion'])&&a.state==='CREATED BEFORE START/SQL','COMMIT_END_ROOT_RECEIPTS');
 check(e.schema==='controller-job-end-v1'&&['jobId','containerId','project','service','ownerId'].every(k=>e[k]===a[k])&&e.createdReceiptHash===c.jobCreatedHash&&e.exitCode===1&&e.containerStopped===true&&e.sqlAbsence==='NOT VERIFIED'&&Number.isFinite(Date.parse(a.createdAt))&&Date.parse(a.createdAt)<=Date.parse(e.startedAt)&&Date.parse(e.startedAt)<=Date.parse(e.finishedAt)&&!e.finishedAt.startsWith('0001-')&&e.finishedAt===x.finishedAt,code);
}
export async function probeCommitEnd({config:c,ledger,poolFactory=createPgPool}={}){
 exact(c,['schema','project','caseName','custodyHash','sourceSha','systemIdentifier','plan','planHash','occurrence','occurrenceHash','observed','connection','jobCreated','jobCreatedHash','jobEnd','jobEndHash'],'COMMIT_END_ROOT_RECEIPTS');
 check(c?.schema==='cp021-commit-end-config-v1'&&c.project==='mecanet-qa-p1l3-r03-target'&&c.caseName==='target-commit-fault'&&HASH.test(c.custodyHash??'')&&/^[a-f0-9]{40}$/.test(c.sourceSha??'')&&typeof c.systemIdentifier==='string'&&/^[0-9]{10,24}$/.test(c.systemIdentifier),'COMMIT_END_CONFIG');
 validateCommitFaultReceipt({plan:c.plan,planHash:c.planHash,receipt:c.occurrence,receiptHash:c.occurrenceHash});
 const x=c.observed,r=c.occurrence;
 check(x?.containerId===c.plan.controllerContainerId&&x.ownerId===c.plan.controllerOwner&&x.running===false&&x.pid===0&&x.status==='exited'&&x.exitCode===1&&Number.isFinite(Date.parse(x.finishedAt)),'COMMIT_END_CONTAINER');
 exact(x,['containerId','ownerId','running','pid','status','exitCode','finishedAt'],'COMMIT_END_CONTAINER');validateRootEnd(c);
 const conn=c.connection;
 exact(conn,['host','port','database','user','password','ssl','max','connectionTimeoutMillis','statement_timeout','lock_timeout'],'COMMIT_END_CONNECTION');exact(conn.ssl,['ca','servername','rejectUnauthorized'],'COMMIT_END_CONNECTION');
 check(conn.host==='postgres'&&conn.port===5432&&conn.database==='mecanet_control'&&conn.user==='qa_bootstrap'&&typeof conn.password==='string'&&conn.password.length>=32&&conn.password.length<=4096&&conn.ssl.rejectUnauthorized===true&&conn.ssl.servername==='postgres'&&typeof conn.ssl.ca==='string'&&conn.ssl.ca.length>0&&conn.ssl.ca.length<=65536&&conn.max===1&&conn.connectionTimeoutMillis===2000&&conn.statement_timeout===2000&&conn.lock_timeout===300,'COMMIT_END_CONNECTION');
 check(typeof ledger?.charge==='function','COMMIT_END_LEDGER');
 const pool=await poolFactory({...conn,application_name:'cp021-commit-end-probe:'+c.plan.invocationId});
 try{
  await ledger.charge('sql');
  const result=await pool.query({text:"SELECT system_identifier::text AS system_id,host(inet_server_addr()) AS address,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1::integer AND backend_start=$2::timestamptz) AS backend_absent,NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$3::text) AS owner_absent FROM pg_control_system()",values:[r.backendPid,r.backendStartedAt,'cp019-controller:'+c.plan.controllerOwner],query_timeout:2000});
  check(result.rows?.length===1,'COMMIT_END_ROWSET');const row=result.rows[0];
  check(row.system_id===c.systemIdentifier&&row.address==='10.77.66.2'&&row.tls===true&&row.backend_absent===true&&row.owner_absent===true,'COMMIT_END_SQL_NOT_PROVEN');
  return {schema:'cp019-commit-fault-end-probe-v1',invocationId:c.plan.invocationId,containerId:c.plan.controllerContainerId,ownerId:c.plan.controllerOwner,resourceHash:c.plan.resourceHash,backendPid:r.backendPid,backendStartedAt:r.backendStartedAt,controllerExited:true,sqlBackendAbsent:true,sqlOwnerAbsent:true};
 }finally{await pool.end()}
}
async function main(){
 const c=await readCommitProbeConfig();
 check(c.sourceSha===process.env.QA_CODE_SHA&&c.project===process.env.QA_PROJECT,'COMMIT_END_ENV');
 const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:'target-window'});
 await ledger.enter(c.caseName);
 const report=await probeCommitEnd({config:c,ledger});await ledger.charge('artifactFiles');
 const saved=await publishSourceReadonly('/run/qa-results/commit-end-probe.json',report);
 check(saved.sha256===sha256(report),'COMMIT_END_PUBLICATION');
 console.log(JSON.stringify({type:'cp021-commit-end-probe',status:'PASS',reportHash:saved.sha256,secretsPrinted:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('COMMIT_END_FAILED');process.exitCode=1});
