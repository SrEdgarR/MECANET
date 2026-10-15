// Durable write-ahead controller journal. Its external immutable heads prevent
// acceptance of a truncated prefix. It is not a signature or a SQL-end proof.
import {open,readFile,readdir,lstat,unlink} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';import {constants} from 'node:fs';
import {sha256,canonical,publishImmutable,readImmutable,syncDirectory,validateStageRecords,verifyEndProof} from './protocol.js';
const ZERO='0'.repeat(64),HASH=/^[0-9a-f]{64}$/;
const refuse=(ok,label)=>{if(!ok)throw Error(label);};
export async function openStageJournal({file,heads,plans,recoveryId,controllerOwner,resourceHash,operationIds,create=false,sync=syncDirectory,charge,checkpoint=async()=>{}}){
 refuse(typeof charge==='function','JOURNAL_BUDGET_REQUIRED');file=resolve(file);heads=resolve(heads);plans=resolve(plans);const directory=dirname(file);for(const d of [heads,plans])refuse(d.startsWith(directory+'/')||d.startsWith(directory+'\\'),'JOURNAL_FOREIGN_HEADS');
 const lock=file+'.controller.lock';const owner={recoveryId,controllerOwner,resourceHash};
 await charge('artifactFiles',create?2:1);await publishImmutable(lock,owner,{syncDirectory:sync});let handle,records=[],uncertain=false,pending=false;
 try{
  handle=await open(file,(create?constants.O_CREAT|constants.O_EXCL:0)|constants.O_RDWR|constants.O_APPEND|(constants.O_NOFOLLOW??0),0o600);
  const stat=await handle.stat();refuse(stat.isFile()&&stat.size<=1024*1024,'STAGE_JOURNAL_FILE');
  const headFiles=(await readdir(heads)).sort();refuse(headFiles.every((n,i)=>n===`head-${String(i).padStart(4,'0')}.json`),'JOURNAL_HEAD_GAP');
  const text=await readFile(file,'utf8');
  if(text){refuse(text.endsWith('\n'),'JOURNAL_TRUNCATED');records=text.trimEnd().split('\n').map(line=>JSON.parse(line));refuse(headFiles.length===records.length,'JOURNAL_EXTERNAL_HEAD_REQUIRED');const headBytes=await readFile(join(heads,headFiles.at(-1)));const head=await readImmutable(join(heads,headFiles.at(-1)),sha256(headBytes));const verified=validateStageRecords(records,head);pending=verified.pending.length>0;}
  else refuse(headFiles.length===0,'JOURNAL_EMPTY_UNEXPECTED');
  if(create){await handle.sync();await sync(directory);}
  const allowed=new Set(Object.values(operationIds));
  async function append(body){
   refuse(!uncertain,'JOURNAL_UNCERTAIN');await charge('journal');await charge('artifactFiles',2);const sequence=records.length,record={sequence,...body,previousHash:records.at(-1)?.hash??ZERO};record.hash=sha256(record);const bytes=canonical(record)+'\n';refuse(sequence<1000&&(await handle.stat()).size+Buffer.byteLength(bytes)<=1024*1024,'JOURNAL_LIMIT');validateStageRecords([...records,record],{sequence,hash:record.hash});
   const plan=join(plans,`record-${String(sequence).padStart(4,'0')}.json`);
   try{
    try{await publishImmutable(plan,record,{syncDirectory:sync});}catch(e){if(e.message!=='IMMUTABLE_EXISTS')throw e;await readImmutable(plan,sha256(canonical(record)));await sync(plans);}
    await handle.writeFile(bytes);await handle.sync();await checkpoint('log-fsynced');await publishImmutable(join(heads,`head-${String(sequence).padStart(4,'0')}.json`),{sequence,hash:record.hash},{syncDirectory:sync});records.push(record);await sync(directory);return record;
   }
   catch(e){uncertain=true;throw e;}
  }
  return{
   async before({operationId,stage,expected,target,after}){
    refuse(allowed.has(operationId),'JOURNAL_OPERATION_NOT_CUSTODIED');const old=records.find(r=>r.kind==='intent'&&r.operationId===operationId);const body={kind:'intent',operationId,stage,recoveryId,targetHash:sha256(target),expectedHash:sha256(expected),afterHash:sha256(after)};
    if(old){for(const[k,v]of Object.entries(body))refuse(old[k]===v,'JOURNAL_RETRY_CHANGED');return old;}const record=await append(body);validateStageRecords(records,{sequence:record.sequence,hash:record.hash});pending=true;return record;
   },
   async after({operationId,observed,endProofHash}){
    const intent=records.find(r=>r.kind==='intent'&&r.operationId===operationId);refuse(intent&&sha256(observed)===intent.afterHash&&HASH.test(endProofHash),'JOURNAL_SQL_END_REQUIRED');const old=records.find(r=>r.kind==='observed'&&r.operationId===operationId);if(old){refuse(old.observedHash===sha256(observed)&&old.endProofHash===endProofHash,'JOURNAL_RETRY_CHANGED');return old;}
    const record=await append({kind:'observed',operationId,intentHash:intent.hash,observedHash:sha256(observed),endProofHash});pending=validateStageRecords(records,{sequence:record.sequence,hash:record.hash}).pending.length>0;return record;
   },
   records:()=>structuredClone(records),
   async close(){await handle.close();handle=null;if(!uncertain&&!pending){const bytes=await readFile(lock);const saved=await readImmutable(lock,sha256(bytes));refuse(canonical(saved)===canonical(owner),'JOURNAL_FOREIGN_LOCK');await unlink(lock);await sync(directory);}return{uncertain,pending,lockRetained:uncertain||pending};}
  };
 }catch(e){await handle?.close().catch(()=>{});throw e;}
}
/** Repair a single durable tail using its identical prepublished immutable
 * plan. This makes no SQL-state claim; an unacknowledged intent stays pending. */
export async function reconcileJournalHead({file,heads,plans,proof,observed,operationIds,sync=syncDirectory}){
 file=resolve(file);heads=resolve(heads);plans=resolve(plans);for(const d of [heads,plans])refuse(d.startsWith(dirname(file)+'/')||d.startsWith(dirname(file)+'\\'),'JOURNAL_FOREIGN_HEADS');const lock=file+'.controller.lock';const lockBytes=await readFile(lock),owner=await readImmutable(lock,sha256(lockBytes));verifyEndProof(proof,observed,{profile:'controller'});
 refuse(proof.recoveryId===owner.recoveryId&&proof.sourceResourceHash===owner.resourceHash&&proof.sqlOwners.includes(owner.controllerOwner),'JOURNAL_FOREIGN_END_PROOF');
 const text=await readFile(file,'utf8');refuse(text.endsWith('\n'),'JOURNAL_TRUNCATED');const records=text.trimEnd().split('\n').map(x=>JSON.parse(x));const last=records.at(-1);validateStageRecords(records,{sequence:records.length-1,hash:last.hash});
 const names=(await readdir(heads)).sort();refuse(names.every((n,i)=>n===`head-${String(i).padStart(4,'0')}.json`),'JOURNAL_HEAD_GAP');refuse(names.length===records.length||names.length===records.length-1,'JOURNAL_UNRECONCILABLE_TAIL');
 const allowed=new Set(Object.values(operationIds));
 for(const [i,r]of records.entries()){refuse(allowed.has(r.operationId)&&(r.kind!=='intent'||r.recoveryId===owner.recoveryId),'JOURNAL_FOREIGN_PLAN');await readImmutable(join(plans,`record-${String(i).padStart(4,'0')}.json`),sha256(canonical(r)));if(i<names.length)await readImmutable(join(heads,names[i]),sha256(canonical({sequence:i,hash:r.hash})));}
 await sync(plans);const repaired=names.length!==records.length;if(repaired)await publishImmutable(join(heads,`head-${String(records.length-1).padStart(4,'0')}.json`),{sequence:records.length-1,hash:last.hash},{syncDirectory:sync});await sync(heads);await sync(dirname(file));return{repaired,checkpoint:{sequence:records.length-1,hash:last.hash},sqlState:'NOT CLAIMED'};
}
/** No TTL takeover. A stopped controller and absence of its SQL/HTTP must be
 * observed independently; the same run/owner/resource must match the lock. */
export async function releaseTerminatedController({file,proof,observed,sync=syncDirectory}){
 const lock=resolve(file)+'.controller.lock',stat=await lstat(lock);refuse(stat.isFile()&&!stat.isSymbolicLink(),'JOURNAL_LOCK_FILE');const bytes=await readFile(lock),owner=await readImmutable(lock,sha256(bytes));verifyEndProof(proof,observed,{profile:'controller'});
 refuse(proof.recoveryId===owner.recoveryId&&proof.sourceResourceHash===owner.resourceHash&&proof.sqlOwners.includes(owner.controllerOwner),'JOURNAL_FOREIGN_END_PROOF');await unlink(lock);await sync(dirname(lock));return{released:true};
}
