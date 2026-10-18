// Portable production-validator group on the already-stopped CI copy.
// No Oracle-shaped resource identities are fabricated; no PostgreSQL starts here.
import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256,canonical,publishImmutable,readImmutable,publishCopyIndex,readCopyIndex,verifyCopyIndex,syncDirectory} from '../../server/saas/recovery/protocol.js';
import {openStageJournal} from '../../server/saas/recovery/stage-journal.js';
import {assertSourceFin,validateCopyLocations} from './ci-cold-copy.mjs';
export function copyIndexFromRows(rows){
 assert.ok(Array.isArray(rows)&&rows.length>0&&rows.length<=5000,'CI_INTEGRITY_INDEX_REQUIRED');const paths=new Set();let bytes=0;
 for(const r of rows){assert.ok(typeof r.path==='string'&&!r.path.includes('\\')&&!r.path.split('/').some(p=>!p||p==='.'||p==='..')&&!r.path.startsWith('/')&&!paths.has(r.path)&&Number.isSafeInteger(r.bytes)&&r.bytes>=0&&/^[a-f0-9]{64}$/.test(r.sha256),'CI_INTEGRITY_INDEX_REQUIRED');paths.add(r.path);bytes+=r.bytes;assert.ok(bytes<=1024**3,'CI_INTEGRITY_INDEX_BUDGET')}
 return{schema:'copy-index-v1',files:rows.map(({path,bytes,sha256})=>({path,bytes,sha256}))};
}
export function assertIntegrityGroup(r){
 assert.ok(r?.status==='PASS'&&r.targetStarted===false&&r.copy?.status==='PASS'&&r.journal?.status==='PASS'&&r.journal.pending===0&&r.custody?.status==='PASS'&&Array.isArray(r.negatives)&&r.negatives.length===13&&new Set(r.negatives.map(x=>x.name)).size===13&&r.negatives.every(x=>x.status==='PASS'&&typeof x.rejection==='string'),'CI_INTEGRITY_GROUP_INCOMPLETE');return true;
}
export async function exerciseCiIntegrity({root,target,sourceFin,index,sourceSha,deadline}){
 assert.equal(process.platform,'linux','CI_INTEGRITY_LINUX_REQUIRED');assertSourceFin(sourceFin);assert.equal(root,resolve('.qa-private/cp023-ci'));assert.equal(target,resolve(root,'target/data'));assert.equal(typeof deadline,'function');
 const directory=resolve(root,'integrity');deadline();await mkdir(directory,{mode:0o700});
 const report={schema:'cp028-ci-integrity-v1',status:'FAIL',scope:'production validators on real private filesystem',targetStarted:false,negatives:[],oracleManifest:'NOT VERIFIED: production resource validator binds Oracle r03 identities, not this CI host'};
 const rejected=async(name,work,allowed)=>{deadline();let error;try{await work()}catch(e){error=e}assert.ok(error&&allowed.includes(String(error.message).split('\n')[0]),'CI_INTEGRITY_EXPECTED_REJECTION:'+name);report.negatives.push({name,status:'PASS',rejection:String(error.message).split('\n')[0]});deadline()};
 const hash=sha256(index),stored=await publishCopyIndex(resolve(directory,'copy-index.json'),index);assert.equal(stored.sha256,hash);assert.deepEqual(await readCopyIndex(resolve(directory,'copy-index.json'),hash),index);
 const reference={schema:'cp028-ci-reference-envelope-v1',sourceSha,sourceFinHash:sha256(sourceFin),copyIndexHash:hash,sourceData:resolve(root,'data'),targetData:target};
 const referenceFile=resolve(directory,'reference-manifest.json'),referenceReceipt=await publishImmutable(referenceFile,reference);assert.deepEqual(await readImmutable(referenceFile,referenceReceipt.sha256),reference);
 await rejected('immutable-manifest-altered',async()=>{const file=resolve(directory,'altered-manifest.json');await publishImmutable(file,{...reference,copyIndexHash:'0'.repeat(64)});await readImmutable(file,referenceReceipt.sha256)},['CUSTODY_HASH_MISMATCH']);
 await rejected('immutable-manifest-incomplete',async()=>{const {targetData,...incomplete}=reference,file=resolve(directory,'incomplete-manifest.json');await publishImmutable(file,incomplete);await readImmutable(file,referenceReceipt.sha256)},['CUSTODY_HASH_MISMATCH']);
 await rejected('source-target-reference-incompatible',()=>validateCopyLocations(root,resolve(root,'data'),resolve(root,'data')),['CI_COPY_DISTINCT_TARGET_REQUIRED']);
 await rejected('positive-SQL-pool-end-missing',()=>assertSourceFin({...sourceFin,poolsEnded:false}),['CI_COPY_POSITIVE_SOURCE_FIN_REQUIRED']);
 await rejected('copy-index-untrusted-hash',()=>verifyCopyIndex(target,index,'0'.repeat(64)),['COPY_INDEX_HASH']);
 const incomplete={...index,files:index.files.slice(0,-1)};await rejected('copy-index-incomplete',()=>verifyCopyIndex(target,incomplete,sha256(incomplete)),['COPY_INVENTORY']);
 const altered=structuredClone(index);altered.files[0].sha256=altered.files[0].sha256==='f'.repeat(64)?'e'.repeat(64):'f'.repeat(64);await rejected('copy-index-content-incoherent',()=>verifyCopyIndex(target,altered,sha256(altered)),['COPY_HASH']);
 const traversal=structuredClone(index);traversal.files[0].path='../foreign';await rejected('copy-index-path-escape',()=>verifyCopyIndex(target,traversal,sha256(traversal)),['COPY_PATH']);
 report.custody={status:'PASS',referenceHash:referenceReceipt.sha256,indexHash:stored.sha256,scope:'immutable reference-envelope custody; not full Oracle recovery manifest'};
 const journalDir=resolve(directory,'journal'),heads=resolve(journalDir,'heads'),plans=resolve(journalDir,'plans');for(const p of [journalDir,heads,plans])await mkdir(p,{mode:0o700});
 const operationIds={copy:randomUUID(),custody:randomUUID()},recoveryId=randomUUID(),controllerOwner=randomUUID(),resourceHash=sha256(reference);await publishImmutable(resolve(directory,'journal-plan.json'),{operationIds,recoveryId,controllerOwner,resourceHash});
 const file=resolve(journalDir,'stage.jsonl');let journal,charges={journal:0,artifactFiles:0};
 const {validateSourceJournalSnapshot}=await import('../qa/cp019/target-prepare.mjs');
 const snapshot=async()=>{const raw=await readFile(file,'utf8'),records=journal.records(),last=records.at(-1),checkpoint={sequence:last.sequence,hash:last.hash};return{raw,rawHash:sha256(raw),recordsHash:sha256(records),copyCheckpoint:checkpoint,finalCheckpoint:checkpoint,headNames:await readdir(heads),readHead:async n=>{const p=resolve(heads,n);return readImmutable(p,sha256(await readFile(p)))},readPlan:async n=>{const p=resolve(plans,n);return readImmutable(p,sha256(await readFile(p)))}}};
 try{
  journal=await openStageJournal({file,heads,plans,recoveryId,controllerOwner,resourceHash,operationIds,create:true,charge:async(type,n=1)=>{deadline();assert.ok(Object.hasOwn(charges,type));charges[type]+=n;assert.ok(charges.journal<=4&&charges.artifactFiles<=10,'CI_INTEGRITY_JOURNAL_BUDGET')}});
  const expected={indexHash:hash},after={indexHash:hash,files:index.files.length,bytes:index.files.reduce((sum,f)=>sum+f.bytes,0)};
  await journal.before({operationId:operationIds.copy,stage:'journal-replay',expected,target:{dataDirectory:target},after});
  await rejected('journal-pending-unknown',async()=>validateSourceJournalSnapshot(await snapshot()),['TARGET_PREPARE_JOURNAL']);
  await rejected('journal-observation-without-positive-end',()=>journal.after({operationId:operationIds.copy,observed:after,endProofHash:null}),['JOURNAL_SQL_END_REQUIRED']);
  deadline();const verified=await verifyCopyIndex(target,index,hash);deadline();assert.deepEqual({indexHash:verified.sha256,files:verified.files,bytes:verified.bytes},after);report.copy={status:'PASS',...verified,originalTargetUntouched:true};await journal.after({operationId:operationIds.copy,observed:after,endProofHash:sha256(sourceFin)});
  const custodyAfter={manifestHash:referenceReceipt.sha256};await journal.before({operationId:operationIds.custody,stage:'canary',expected:{custody:'UNVERIFIED'},target:{referenceHash:referenceReceipt.sha256},after:custodyAfter});assert.deepEqual(await readImmutable(referenceFile,referenceReceipt.sha256),reference);await journal.after({operationId:operationIds.custody,observed:custodyAfter,endProofHash:sha256(sourceFin)});
  const input=await snapshot();assert.equal((await validateSourceJournalSnapshot(input)).length,4);
  await rejected('journal-head-inconsistent',()=>validateSourceJournalSnapshot({...input,readHead:async n=>({...await input.readHead(n),hash:'0'.repeat(64)})}),['TARGET_PREPARE_JOURNAL_EXTERNAL']);
  await rejected('journal-plan-inconsistent',()=>validateSourceJournalSnapshot({...input,readPlan:async n=>({...await input.readPlan(n),hash:'0'.repeat(64)})}),['TARGET_PREPARE_JOURNAL_EXTERNAL']);
  const truncated=resolve(directory,'truncated-journal.jsonl'),handle=await open(truncated,'wx',0o600);try{await handle.writeFile(input.raw.slice(0,-1));await handle.sync()}finally{await handle.close()}await syncDirectory(directory);const raw=await readFile(truncated,'utf8');await rejected('journal-file-truncated',()=>validateSourceJournalSnapshot({...input,raw,rawHash:sha256(raw)}),['TARGET_PREPARE_JOURNAL']);
  assert.equal((await validateSourceJournalSnapshot(await snapshot())).length,4);const ended=await journal.close();journal=null;assert.deepEqual(ended,{uncertain:false,pending:false,lockRetained:false});report.journal={status:'PASS',pending:0,records:4,fileFsync:true,directoryFsync:true,charges,scope:'write-ahead of private copy verification/custody probes; not complete source-to-target SQL journal'};
  report.status='PASS';assertIntegrityGroup(report);return report;
 }finally{if(journal)await journal.close()}
}
