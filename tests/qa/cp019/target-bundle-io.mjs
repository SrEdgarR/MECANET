// Private transport only. It does not choose material, access SQL or claim recovery.
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {canonical,sha256,publishImmutable,publishCopyIndex,readCopyIndex,syncDirectory,validateStageRecords} from '../../../server/saas/recovery/protocol.js';

const SMALL=262144,INDEX=4*1024*1024,JOURNAL=1024*1024,HASH=/^[0-9a-f]{64}$/;
const ROOT='/run/qa-secrets';
export const TARGET_BUNDLE_PATHS=Object.freeze({header:ROOT+'/target-config-bundle.json',copyIndex:ROOT+'/target-copy-index.json',journal:Object.freeze(Array.from({length:5},(_,i)=>ROOT+'/target-source-journal-'+String(i+1).padStart(2,'0')+'.json'))});
const FIXED=new Set([TARGET_BUNDLE_PATHS.header,TARGET_BUNDLE_PATHS.copyIndex,...TARGET_BUNDLE_PATHS.journal]);
const KEYS=['schema','manifest','anchors','proofBundle','plan','planHash','configs','runtimeFixture','sourceJournalRecords','sourceJournalFinalCheckpoint','sourceJournalCopyCheckpoint','copyIndex','sourceEndProof','observedEnd','sourceCentralFingerprint','physicalRecovery'];
const BASE_KEYS=KEYS.filter(k=>!['copyIndex','sourceJournalRecords'].includes(k));
const check=(ok,label)=>{if(!ok)throw Error(label)};
const same=(a,b)=>canonical(a)===canonical(b);
const plain=x=>x!==null&&typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>check(plain(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(','),'TARGET_BUNDLE_SHAPE');
const size=x=>Buffer.byteLength(canonical(x));
function freeze(x){if(x&&typeof x==='object'){for(const y of Object.values(x))freeze(y);Object.freeze(x)}return x}
function requiredHash(h){check(typeof h==='string'&&HASH.test(h),'TARGET_BUNDLE_EXPECTED_HASH')}
function fixedPath(p){check(FIXED.has(p),'TARGET_BUNDLE_PATH')}
function bundleShape(value,keys){
 const variant=Object.hasOwn(value??{},'variantLineageHash');exact(value,[...keys,...(variant?['variantLineageHash']:[])]);
 if(variant)requiredHash(value.variantLineageHash);
}
function checkpoint(p){exact(p,['sequence','hash']);check(Number.isSafeInteger(p.sequence)&&p.sequence>=0&&p.sequence<1000&&HASH.test(p.hash),'TARGET_BUNDLE_CHECKPOINT')}
function validateIndex(index){
 exact(index,['schema','files']);check(index.schema==='copy-index-v1'&&Array.isArray(index.files)&&index.files.length<=10000&&size(index)<=INDEX,'TARGET_BUNDLE_INDEX_LIMIT');
 const paths=new Set();let bytes=0;
 for(const f of index.files){exact(f,['path','bytes','sha256']);check(typeof f.path==='string'&&f.path.length<=512&&!f.path.startsWith('/')&&!f.path.includes('\\')&&!f.path.split('/').some(p=>!p||p==='.'||p==='..')&&!paths.has(f.path)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&HASH.test(f.sha256),'TARGET_BUNDLE_INDEX_ENTRY');paths.add(f.path);bytes+=f.bytes;check(bytes<=2*1024**3,'TARGET_BUNDLE_INDEX_DATA_LIMIT')}
}
function validateBase(base,indexHash){
 bundleShape(base,BASE_KEYS);check(base.schema==='target-config-bundle-v1'&&base.physicalRecovery==='NOT VERIFIED','TARGET_BUNDLE_VERSION');
 checkpoint(base.sourceJournalCopyCheckpoint);checkpoint(base.sourceJournalFinalCheckpoint);
 check(base.manifest?.copyIndexHash===indexHash&&same(base.manifest.copyCheckpoint,base.sourceJournalCopyCheckpoint)&&same(base.manifest.journalFinalCheckpoint,base.sourceJournalFinalCheckpoint)&&same(base.proofBundle?.manifest,base.manifest),'TARGET_BUNDLE_MANIFEST_BINDING');
}
function validateJournal(records,base){
 check(Array.isArray(records)&&records.length<=1000&&size(records)<=JOURNAL,'TARGET_BUNDLE_JOURNAL_LIMIT');
 const full=validateStageRecords(records,base.sourceJournalFinalCheckpoint),prefix=validateStageRecords(records.slice(0,base.sourceJournalCopyCheckpoint.sequence+1),base.sourceJournalCopyCheckpoint);
 check(full.pending.length===0&&prefix.pending.length===0,'TARGET_BUNDLE_JOURNAL_PENDING');
}
/** Pure deterministic split; original full canonical SHA remains the custody binding. */
export function serializeTargetBundle(bundle,expectedFullHash){
 requiredHash(expectedFullHash);bundleShape(bundle,KEYS);check(sha256(bundle)===expectedFullHash,'TARGET_BUNDLE_FULL_HASH');
 const {copyIndex,sourceJournalRecords,...base}=JSON.parse(canonical(bundle));validateIndex(copyIndex);const indexHash=sha256(copyIndex);validateBase(base,indexHash);validateJournal(sourceJournalRecords,base);
 const count=Math.ceil(sourceJournalRecords.length/200),chunks=[];check(count>=1&&count<=5,'TARGET_BUNDLE_CHUNK_COUNT');
 const pieces=[{kind:'index',path:TARGET_BUNDLE_PATHS.copyIndex,value:copyIndex,sha256:indexHash,bytes:size(copyIndex)}];
 for(let i=0;i<count;i++){
  const records=sourceJournalRecords.slice(i*200,(i+1)*200),value={schema:'cp019-target-journal-chunk-v1',parentFullBundleHash:expectedFullHash,chunkIndex:i,chunkCount:count,records},bytes=size(value);check(bytes<=SMALL,'TARGET_BUNDLE_CHUNK_LIMIT');
  const part={path:TARGET_BUNDLE_PATHS.journal[i],sha256:sha256(value),bytes,startSequence:i*200,recordCount:records.length};chunks.push(part);pieces.push({kind:'journal',path:part.path,value,sha256:part.sha256,bytes});
 }
 const header={schema:'cp019-target-bundle-header-v1',parentFullBundleHash:expectedFullHash,bundle:base,copyIndex:{path:TARGET_BUNDLE_PATHS.copyIndex,sha256:indexHash,bytes:size(copyIndex)},sourceJournal:{sha256:sha256(sourceJournalRecords),bytes:size(sourceJournalRecords),recordCount:sourceJournalRecords.length,chunks}};
 check(size(header)<=SMALL,'TARGET_BUNDLE_HEADER_LIMIT');
 const headerSha256=sha256(header);pieces.unshift({kind:'header',path:TARGET_BUNDLE_PATHS.header,value:header,sha256:headerSha256,bytes:size(header)});
 return freeze({header,headerSha256,sha256:expectedFullHash,pieces});
}

/** Metadata is checked again against the opened descriptor; Windows model tests do not prove Linux custody. */
export function assertTargetBundleMetadata(stat,limit,{platform=process.platform,uid=process.getuid?.()}={}){
 check(stat?.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&Number.isSafeInteger(stat.size)&&stat.size>=0&&stat.size<=limit&&(stat.mode&0o777)===0o400&&(platform==='win32'||Number.isInteger(uid)&&stat.uid===uid),'TARGET_BUNDLE_PRIVATE_FILE');
}
function boundStat(a,b){check(['dev','ino','size','mode','uid','nlink','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]),'TARGET_BUNDLE_FILE_CHANGED')}
async function boundedBytes(fd,limit){const bytes=Buffer.alloc(limit+1);let offset=0;while(offset<bytes.length){const got=await fd.read(bytes,offset,bytes.length-offset,null);if(!got.bytesRead)break;offset+=got.bytesRead}check(offset<=limit,'TARGET_BUNDLE_FILE_CHANGED');return bytes.subarray(0,offset)}
async function parentGuard(){const p=resolve(ROOT),s=await lstat(p);check(await realpath(p)===p&&s.isDirectory()&&!s.isSymbolicLink()&&(process.platform==='win32'||(s.mode&0o777)===0o700&&s.uid===process.getuid()),'TARGET_BUNDLE_PRIVATE_DIRECTORY')}
async function strictRead(path,expectedHash,limit){
 fixedPath(path);requiredHash(expectedHash);await parentGuard();const before=await lstat(path);assertTargetBundleMetadata(before,limit);const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const opened=await fd.stat();assertTargetBundleMetadata(opened,limit);boundStat(before,opened);const data=await boundedBytes(fd,limit);
  const after=await fd.stat();assertTargetBundleMetadata(after,limit);boundStat(opened,after);const named=await lstat(path);assertTargetBundleMetadata(named,limit);boundStat(after,named);check(data.length===before.size,'TARGET_BUNDLE_FILE_CHANGED');check(sha256(data)===expectedHash,'TARGET_BUNDLE_HASH');const value=JSON.parse(data);check(size(value)===data.length&&sha256(value)===expectedHash,'TARGET_BUNDLE_CANONICAL');return{value,sha256:expectedHash,bytes:data.length,stat:after};
 }finally{await fd.close()}
}
async function readonlyPublish(path,value,{index=false}={}){
 fixedPath(path);check(index===(path===TARGET_BUNDLE_PATHS.copyIndex),'TARGET_BUNDLE_PATH');await parentGuard();const published=await(index?publishCopyIndex:publishImmutable)(path,value);const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const s=await fd.stat();check(s.isFile()&&s.nlink===1&&s.size===published.bytes&&s.size<=(index?INDEX:SMALL)&&(process.platform==='win32'||s.uid===process.getuid()),'TARGET_BUNDLE_PRIVATE_FILE');const bytes=await boundedBytes(fd,index?INDEX:SMALL);boundStat(s,await fd.stat());check(sha256(bytes)===published.sha256,'TARGET_BUNDLE_HASH');await fd.chmod(0o400);await fd.sync()}finally{await fd.close()}
 await syncDirectory(dirname(path));await strictRead(path,published.sha256,index?INDEX:SMALL);return published;
}
const DEFAULT_IO=Object.freeze({
 readJson:strictRead,
 readIndex:async(path,hash)=>{check(path===TARGET_BUNDLE_PATHS.copyIndex,'TARGET_BUNDLE_PATH');const strict=await strictRead(path,hash,INDEX),value=await readCopyIndex(path,hash),after=await lstat(path);assertTargetBundleMetadata(after,INDEX);boundStat(strict.stat,after);check(same(value,strict.value),'TARGET_BUNDLE_FILE_CHANGED');return strict},
 publishJson:(path,value)=>readonlyPublish(path,value),
 publishIndex:(path,value)=>readonlyPublish(path,value,{index:true})
});
function ioContract(io){check(io&&['readJson','readIndex','publishJson','publishIndex'].every(k=>typeof io[k]==='function'),'TARGET_BUNDLE_IO_CONTRACT');return io}
async function readPart(io,path,hash,bytes,{index=false}={}){
 fixedPath(path);requiredHash(hash);const limit=index?INDEX:SMALL,result=await(index?io.readIndex:io.readJson)(path,hash,limit);
 check(result&&sha256(result.value)===hash&&result.sha256===hash&&size(result.value)===result.bytes&&result.bytes<=limit&&(bytes===undefined||result.bytes===bytes),'TARGET_BUNDLE_HASH');return result;
}
function validateHeader(header,expectedFullHash){
 exact(header,['schema','parentFullBundleHash','bundle','copyIndex','sourceJournal']);check(header.schema==='cp019-target-bundle-header-v1'&&header.parentFullBundleHash===expectedFullHash&&size(header)<=SMALL,'TARGET_BUNDLE_FULL_HASH');
 exact(header.copyIndex,['path','sha256','bytes']);check(header.copyIndex.path===TARGET_BUNDLE_PATHS.copyIndex&&HASH.test(header.copyIndex.sha256)&&Number.isSafeInteger(header.copyIndex.bytes)&&header.copyIndex.bytes>0&&header.copyIndex.bytes<=INDEX,'TARGET_BUNDLE_INDEX_REFERENCE');validateBase(header.bundle,header.copyIndex.sha256);
 const j=header.sourceJournal;exact(j,['sha256','bytes','recordCount','chunks']);check(HASH.test(j.sha256)&&Number.isSafeInteger(j.bytes)&&j.bytes>0&&j.bytes<=JOURNAL&&Number.isSafeInteger(j.recordCount)&&j.recordCount>=1&&j.recordCount<=1000&&Array.isArray(j.chunks)&&j.chunks.length===Math.ceil(j.recordCount/200)&&j.chunks.length<=5,'TARGET_BUNDLE_JOURNAL_REFERENCE');
 for(const [i,c]of j.chunks.entries()){exact(c,['path','sha256','bytes','startSequence','recordCount']);check(c.path===TARGET_BUNDLE_PATHS.journal[i]&&HASH.test(c.sha256)&&Number.isSafeInteger(c.bytes)&&c.bytes>0&&c.bytes<=SMALL&&c.startSequence===i*200&&c.recordCount===Math.min(200,j.recordCount-i*200),'TARGET_BUNDLE_CHUNK_REFERENCE')}
}
/** Missing pieces are KEEP, never a completed bundle or a newly selected retry. */
export async function loadTargetConfigBundle({expectedFullHash,expectedHeaderHash,io=DEFAULT_IO}={}){
 requiredHash(expectedFullHash);requiredHash(expectedHeaderHash);ioContract(io);const {value:header}=await readPart(io,TARGET_BUNDLE_PATHS.header,expectedHeaderHash);validateHeader(header,expectedFullHash);
 const {value:copyIndex}=await readPart(io,header.copyIndex.path,header.copyIndex.sha256,header.copyIndex.bytes,{index:true});validateIndex(copyIndex);const records=[];
 for(const [i,c]of header.sourceJournal.chunks.entries()){
  const {value:v}=await readPart(io,c.path,c.sha256,c.bytes);exact(v,['schema','parentFullBundleHash','chunkIndex','chunkCount','records']);check(v.schema==='cp019-target-journal-chunk-v1'&&v.parentFullBundleHash===expectedFullHash&&v.chunkIndex===i&&v.chunkCount===header.sourceJournal.chunks.length&&Array.isArray(v.records)&&v.records.length===c.recordCount&&v.records.every((r,n)=>r.sequence===c.startSequence+n),'TARGET_BUNDLE_CHUNK_BINDING');records.push(...v.records);
 }
 check(records.length===header.sourceJournal.recordCount&&size(records)===header.sourceJournal.bytes&&sha256(records)===header.sourceJournal.sha256,'TARGET_BUNDLE_JOURNAL_HASH');validateJournal(records,header.bundle);
 const value={...header.bundle,copyIndex,sourceJournalRecords:records};check(sha256(value)===expectedFullHash,'TARGET_BUNDLE_FULL_HASH');return{value:freeze(value),sha256:expectedFullHash,headerSha256:expectedHeaderHash};
}
/** Publish immutable intent first so an index-only partial cannot be adopted by a different bundle. */
export async function publishTargetConfigBundle({bundle,expectedFullHash,ledger,io=DEFAULT_IO}={}){
 const split=serializeTargetBundle(bundle,expectedFullHash);ioContract(io);check(typeof ledger?.charge==='function','TARGET_BUNDLE_LEDGER_REQUIRED');let filesPublished=0,filesReused=0;
 for(const p of split.pieces){
  let found=false;try{await readPart(io,p.path,p.sha256,p.bytes,{index:p.kind==='index'});found=true}catch(e){if(e.code!=='ENOENT')throw e}
  if(found){filesReused++;continue}await ledger.charge('artifactFiles');
  try{const result=await(p.kind==='index'?io.publishIndex:io.publishJson)(p.path,p.value);check(result?.sha256===p.sha256&&result.bytes===p.bytes,'TARGET_BUNDLE_PUBLICATION_HASH');filesPublished++}
  catch(e){if(e.message!=='IMMUTABLE_EXISTS'&&e.code!=='EEXIST')throw e;filesReused++}
  await readPart(io,p.path,p.sha256,p.bytes,{index:p.kind==='index'});
 }
 await loadTargetConfigBundle({expectedFullHash,expectedHeaderHash:split.headerSha256,io});return{sha256:expectedFullHash,headerSha256:split.headerSha256,filesPublished,filesReused};
}
