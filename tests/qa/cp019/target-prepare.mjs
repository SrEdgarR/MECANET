import {GLOBAL_LIMITS} from './budget-limits.mjs';
// Cold, fixed-path preparation of the approved r03 target. Imports create no
// connections, choose no secret, inspect no environment and perform no I/O.
import {open,lstat,realpath,readdir,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {uptime} from 'node:os';
import {canonical,sha256,verifyCopyIndex,validateStageRecords,syncDirectory} from '../../../server/saas/recovery/protocol.js';
import {validateMaterial} from '../../../server/saas/recovery/custody.js';
import {makeSourceRuntimeFixture,publishSourceReadonly} from './source-driver.mjs';
import {makeTargetConfigBundle} from './target-config.mjs';
import {serializeTargetBundle,publishTargetConfigBundle} from './target-bundle-io.mjs';
import {copyOffline,verifyOfflineBoundary} from './copy-offline.mjs';
import {newLedger} from './ledger.mjs';
import {readTargetCopyHostMailbox} from './target-runtime.mjs';
import {validateTargetVariantLineage,completeTargetVariantLineage,VARIANT_CASES} from './target-variant-lineage.mjs';

const HASH=/^[0-9a-f]{64}$/,SHA=/^[0-9a-f]{40}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,SMALL=262144,INDEX=4*1024*1024,JOURNAL=1024*1024;
const SOURCE='mecanet-qa-p1l3-r03',TARGET=SOURCE+'-target';
const refuse=(ok,code)=>{if(!ok)throw Error(code)},same=(a,b)=>canonical(a??null)===canonical(b??null),clone=x=>JSON.parse(canonical(x));
const exact=(x,keys,code)=>refuse(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(','),code);
const INPUT_KEYS=['material','foundation','writers','correctives','sourceNormalManifest','sourceCapture','sourceLiveEnd','copyIndex','sourceJournalRecords','producerArtifact','verifierArtifact','targetCa'];
const ASSEMBLE_KEYS=['schema','project','sourceSha','producerSha','inputHashes','sourceJournalRawHash','targetResource','observedResources','sourceEndProof','observedSourceEnd','sourceEndProofHash','sourceJournalCopyCheckpoint','sourceJournalFinalCheckpoint'];

export const TARGET_PREPARE_PATHS=Object.freeze({config:'/run/qa-secrets/target-prepare.json',sourceSecrets:'/run/qa-source-secrets',sourceJournal:'/run/qa-source-journal',sourceArtifact:'/run/qa-source-artifact/artifact.json',targetCa:'/run/qa-target-ca.crt',verifierArtifact:'/workspace/artifact.json',copyLive:'/run/qa-live/target-copy-host.json',copyIndex:'/run/qa-journal/copy-index.json',sourceData:'/run/qa-source',backup:'/run/qa-backup/source-copy',targetData:'/run/qa-target'});

/** A complete source capture is consumed byte-for-byte. It is never extended
 * from current target SQL, flags, placeholders or newly chosen credentials. */
export function assembleTarget(input){
 const {config:c,...v}=input??{};exact(c,ASSEMBLE_KEYS,'TARGET_PREPARE_CONFIG');const inputKeys=[...INPUT_KEYS,...(Object.hasOwn(v,'variantLineage')?['variantLineage']:[])];exact(v,inputKeys,'TARGET_PREPARE_INPUTS');exact(c.inputHashes,inputKeys,'TARGET_PREPARE_HASHES');
 refuse(c.schema==='cp019-target-prepare-v1'&&c.project===TARGET&&SHA.test(c.sourceSha??'')&&SHA.test(c.producerSha??'')&&HASH.test(c.sourceJournalRawHash??''),'TARGET_PREPARE_BINDING');
 for(const k of inputKeys)refuse(HASH.test(c.inputHashes[k]??'')&&sha256(v[k])===c.inputHashes[k],'TARGET_PREPARE_INPUT_HASH');
 const original=validateMaterial(v.material),n=v.sourceNormalManifest,s=v.sourceCapture,resource=n?.resource,context=Object.hasOwn(v,'variantLineage')?completeTargetVariantLineage(v.variantLineage,{sourceCapture:s,sourceResource:resource,sourceEndProof:c.sourceEndProof,observedSourceEnd:c.observedSourceEnd,copyIndex:v.copyIndex,sourceJournalFinalCheckpoint:c.sourceJournalFinalCheckpoint}):null,lineage=context?validateTargetVariantLineage(context):null,m=lineage?.material??original,custodyHash=sha256(m);
 if(lineage)refuse(same(original,lineage.sourceMaterial)&&same(n,context.sourceNormalManifest),'TARGET_PREPARE_VARIANT_BINDING');
 refuse(m.source.project===SOURCE&&m.target.project===TARGET&&n.sourceCommit===c.producerSha&&v.producerArtifact.sourceSha===c.producerSha&&v.verifierArtifact.sourceSha===c.sourceSha,'TARGET_PREPARE_PROVENANCE');
 refuse(s?.schema==='source-capture-v1'&&s.runId===original.source.normal.runId&&s.custodyHash===c.inputHashes.material&&s.normalManifestHash===c.inputHashes.sourceNormalManifest&&s.resourceHash===sha256(resource)&&s.sourceCommit===c.producerSha,'TARGET_PREPARE_CAPTURE');
 exact(v.sourceLiveEnd,['endProof','observedEnd','hash'],'TARGET_PREPARE_SOURCE_END');
 refuse(c.sourceEndProofHash===sha256(c.sourceEndProof)&&c.sourceEndProof.sourceResourceHash===sha256(resource)&&v.sourceLiveEnd.hash===c.sourceEndProofHash&&same(v.sourceLiveEnd.endProof,c.sourceEndProof)&&same(v.sourceLiveEnd.observedEnd,c.observedSourceEnd),'TARGET_PREPARE_SOURCE_END');
 const sourceFixture=makeSourceRuntimeFixture({material:original,custodyHash:c.inputHashes.material,foundation:v.foundation,writers:v.writers,correctives:v.correctives,sourceCommit:c.producerSha,normalManifest:n,normalManifestHash:c.inputHashes.sourceNormalManifest,resource});
 const bundle=makeTargetConfigBundle({material:m,baseSha:'86985fe7589032f202ebf0cb057a9b1384217151',producerArtifact:v.producerArtifact,verifierArtifact:v.verifierArtifact,sourceNormalManifest:n,sourceResource:resource,targetResource:c.targetResource,observedResources:c.observedResources,sourceEndProof:c.sourceEndProof,observedEnd:c.observedSourceEnd,copyIndex:v.copyIndex,sourceJournalRecords:v.sourceJournalRecords,sourceJournalCopyCheckpoint:c.sourceJournalCopyCheckpoint,sourceJournalFinalCheckpoint:c.sourceJournalFinalCheckpoint,sourceGuardSnapshots:s.sourceGuardSnapshots,sourceFingerprints:s.sourceFingerprints,sourceLocalImages:s.sourceLocalImages,sourceClock:s.sourceClock,roleVerifierHashes:s.roleVerifierHashes,canarySecurityVersion:s.canarySecurityVersion,sourceFixture,targetCa:v.targetCa,...(lineage?{variantLineage:context}:{})});
 const configBundleHash=sha256(bundle),split=serializeTargetBundle(bundle,configBundleHash);
 return{bundle,configBundleHash,configBundleHeaderHash:split.headerSha256,sourceCaptureHash:c.inputHashes.sourceCapture,custodyHash,manifestHash:bundle.anchors.manifestHash,planHash:bundle.planHash,budgetCase:lineage?VARIANT_CASES[lineage.kind][0]:'manifest-final',...(lineage?{variantLineageHash:lineage.additionHash}:{})};
}

/** Validate the real source log and every durable original external plan/head.
 * No reconstruction from an in-memory selected or current SQL state occurs. */
export async function validateSourceJournalSnapshot({raw,rawHash,recordsHash,copyCheckpoint,finalCheckpoint,headNames,readHead,readPlan}){
 refuse(typeof raw==='string'&&Buffer.byteLength(raw)<=JOURNAL&&raw.endsWith('\n')&&HASH.test(rawHash??'')&&sha256(raw)===rawHash&&HASH.test(recordsHash??'')&&typeof readHead==='function'&&typeof readPlan==='function','TARGET_PREPARE_JOURNAL');
 const records=raw.slice(0,-1).split('\n').map(line=>JSON.parse(line));refuse(records.length>0&&records.length<=1000&&sha256(records)===recordsHash,'TARGET_PREPARE_JOURNAL');
 const full=validateStageRecords(records,finalCheckpoint),prefix=validateStageRecords(records.slice(0,copyCheckpoint.sequence+1),copyCheckpoint);refuse(full.pending.length===0&&prefix.pending.length===0,'TARGET_PREPARE_JOURNAL');
 const names=records.map((_,i)=>'head-'+String(i).padStart(4,'0')+'.json');refuse(same([...headNames].sort(),names),'TARGET_PREPARE_JOURNAL_HEADS');
 for(const r of records){const number=String(r.sequence).padStart(4,'0');refuse(same(await readHead('head-'+number+'.json'),{sequence:r.sequence,hash:r.hash})&&same(await readPlan('record-'+number+'.json'),r),'TARGET_PREPARE_JOURNAL_EXTERNAL');}
 return records;
}

export function assertPrepareMetadata(s,limit,{platform=process.platform,uid=999,mode=0o400}={}){
 refuse(s?.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&Number.isSafeInteger(s.size)&&s.size>0&&s.size<=limit&&(s.mode&0o777)===mode&&(platform==='win32'||s.uid===uid),'TARGET_PREPARE_PRIVATE_FILE');
}
const unchanged=(a,b)=>refuse(['dev','ino','size','mode','uid','nlink','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]),'TARGET_PREPARE_FILE_CHANGED');
const fixedFiles=new Set([TARGET_PREPARE_PATHS.config,TARGET_PREPARE_PATHS.copyLive,TARGET_PREPARE_PATHS.copyIndex,TARGET_PREPARE_PATHS.targetCa,TARGET_PREPARE_PATHS.sourceArtifact,TARGET_PREPARE_PATHS.verifierArtifact,...['material','source-foundation','source-writers','source-correctives','source-normal-manifest','source-capture-result','source-live-end'].map(n=>TARGET_PREPARE_PATHS.sourceSecrets+'/'+n+'.json'),TARGET_PREPARE_PATHS.sourceJournal+'/source.jsonl',TARGET_PREPARE_PATHS.sourceJournal+'/copy-index.json','/run/qa-secrets/material.json','/run/qa-secrets/source-capture.json','/run/qa-secrets/target-variant-lineage.json']);
function pathGuard(path){refuse(fixedFiles.has(path)||/^\/run\/qa-source-journal\/(?:heads\/head|plans\/record)-[0-9]{4}\.json$/.test(path),'TARGET_PREPARE_PATH');}
async function strictRead(path,{limit=SMALL,uid=999,mode=0o400,expectedHash,json=true}={}){
 pathGuard(path);const parent=dirname(path),p=await lstat(parent);refuse(await realpath(parent)===parent&&p.isDirectory()&&!p.isSymbolicLink(),'TARGET_PREPARE_DIRECTORY');
 if(uid===999&&mode!==0o444)refuse(process.platform==='win32'||p.uid===999&&(p.mode&0o777)===0o700,'TARGET_PREPARE_DIRECTORY');
 const before=await lstat(path);assertPrepareMetadata(before,limit,{uid,mode});const h=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const opened=await h.stat();assertPrepareMetadata(opened,limit,{uid,mode});unchanged(before,opened);const buffer=Buffer.alloc(limit+1);let offset=0;
  while(offset<buffer.length){const r=await h.read(buffer,offset,buffer.length-offset,null);if(!r.bytesRead)break;offset+=r.bytesRead}refuse(offset===before.size&&offset<=limit,'TARGET_PREPARE_FILE_CHANGED');unchanged(opened,await h.stat());unchanged(opened,await lstat(path));
  const bytes=buffer.subarray(0,offset),hash=sha256(bytes);if(expectedHash!==undefined)refuse(HASH.test(expectedHash)&&hash===expectedHash,'TARGET_PREPARE_INPUT_HASH');
  const value=json?JSON.parse(bytes.toString('utf8')):bytes.toString('utf8');if(json)refuse(sha256(value)===hash,'TARGET_PREPARE_CANONICAL');return{value,sha256:hash,bytes:offset};
 }finally{await h.close()}
}

/** Independent destination; partial data remains KEEP and cannot be adopted or
 * overwritten. Existing cluster directories, links and changed boundaries fail. */
export async function restoreOfflineCopy({copyRoot,targetRoot,index,indexHash,observeBoundary,checkBudget,sync=syncDirectory}={}){
 refuse(typeof observeBoundary==='function'&&typeof checkBudget==='function'&&typeof sync==='function','TARGET_PREPARE_COPY_DEPENDENCIES');copyRoot=resolve(copyRoot);targetRoot=resolve(targetRoot);
 refuse(copyRoot!==targetRoot&&await realpath(copyRoot)===copyRoot&&await realpath(targetRoot)===targetRoot&&!(targetRoot+'/').startsWith(copyRoot+'/')&&!(copyRoot+'/').startsWith(targetRoot+'/'),'TARGET_PREPARE_COPY_ROOTS');
 for(const root of [copyRoot,targetRoot]){const s=await lstat(root);refuse(s.isDirectory()&&!s.isSymbolicLink()&&(process.platform==='win32'||s.uid===999&&(s.mode&0o777)===0o700),'TARGET_PREPARE_COPY_ROOTS');}
 const started=performance.now(),bound=()=>refuse(performance.now()-started<=120000,'TARGET_PREPARE_COPY_DEADLINE');
 const boundary=async()=>{bound();const value=await observeBoundary();refuse(value?.sourcePostgresRunning===false&&value.targetPostgresRunning===false,'TARGET_PREPARE_COPY_LIVE');return value;};
 const first=clone(await boundary());await verifyCopyIndex(copyRoot,index,indexHash);refuse((await readdir(targetRoot)).length===0,'TARGET_PREPARE_TARGET_EXISTS');await checkBudget();bound();
 const cluster=join(targetRoot,'18','docker');await mkdir(cluster,{recursive:true,mode:0o700});let total=0;
 for(const entry of index.files){bound();total+=entry.bytes;refuse(total<=2*1024**3,'TARGET_PREPARE_COPY_SIZE');const source=join(copyRoot,entry.path),dest=join(cluster,entry.path),s=await lstat(source);refuse(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size===entry.bytes,'TARGET_PREPARE_COPY_LINK');
  await checkBudget();bound();await mkdir(dirname(dest),{recursive:true,mode:0o700});const input=await open(source,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let output;
  try{const opened=await input.stat();unchanged(s,opened);output=await open(dest,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),s.mode&0o777);const hash=createHash('sha256');let bytes=0;
   for await(const chunk of input.createReadStream({autoClose:false})){bound();hash.update(chunk);bytes+=chunk.length;let offset=0;while(offset<chunk.length){const wrote=await output.write(chunk.subarray(offset));refuse(wrote.bytesWritten>0,'TARGET_PREPARE_COPY_SHORT');offset+=wrote.bytesWritten}}
   const out=await output.stat();unchanged(opened,await input.stat());refuse(bytes===entry.bytes&&hash.digest('hex')===entry.sha256&&out.nlink===1&&!(out.dev===s.dev&&out.ino===s.ino),'TARGET_PREPARE_COPY_CHANGED');await output.sync();await output.chmod(s.mode&0o777);
  }finally{await output?.close();await input.close()}await sync(dirname(dest));
 }
 async function dirs(dir){for(const e of await readdir(dir,{withFileTypes:true}))if(e.isDirectory())await dirs(join(dir,e.name));await sync(dir)}await dirs(targetRoot);
 await verifyCopyIndex(copyRoot,index,indexHash);await verifyCopyIndex(cluster,index,indexHash);refuse(same(first,await boundary()),'TARGET_PREPARE_COPY_BOUNDARY');await checkBudget();bound();return{status:'PASS',layer:'independent-offline-target-copy',indexHash,files:index.files.length,bytes:total,elapsedMs:Math.ceil(performance.now()-started),postgresRestored:false};
}

async function publishOrMatch(path,value,ledger){
 try{const old=await strictRead(path);refuse(old.sha256===sha256(value)&&same(old.value,value),'TARGET_PREPARE_IMMUTABLE_CONFLICT');return old.sha256}catch(error){if(error.code!=='ENOENT')throw error}
 await ledger.charge('artifactFiles');const out=await publishSourceReadonly(path,value);refuse((await strictRead(path,{expectedHash:out.sha256})).sha256===out.sha256,'TARGET_PREPARE_PUBLICATION');return out.sha256;
}
function validateCopyConfig(c){exact(c,['schema','project','invocationId','custodyHash','sourceResource','sourceEndProof','sourceEndProofHash'],'TARGET_PREPARE_COPY_CONFIG');refuse(c.schema==='cp019-target-copy-v1'&&c.project===TARGET&&UUID.test(c.invocationId??'')&&HASH.test(c.custodyHash??'')&&c.sourceResource?.project===SOURCE&&c.sourceEndProofHash===sha256(c.sourceEndProof),'TARGET_PREPARE_COPY_CONFIG');return c;}
async function liveCopy(c){
 const v=await readTargetCopyHostMailbox();exact(v,['receipt','receiptHash'],'TARGET_PREPARE_COPY_MAILBOX');const r=v.receipt;exact(r,['schema','invocationId','custodyHash','sourceEndProofHash','observedAt','boundary','sourcePostgresRunning','targetPostgresRunning'],'TARGET_PREPARE_COPY_RECEIPT');
 const age=Date.now()-Date.parse(r.observedAt);refuse(sha256(r)===v.receiptHash&&r.schema==='cp019-offline-host-v1'&&r.invocationId===c.invocationId&&r.custodyHash===c.custodyHash&&r.sourceEndProofHash===c.sourceEndProofHash&&Number.isFinite(age)&&age>=0&&age<=5000&&r.sourcePostgresRunning===false&&r.targetPostgresRunning===false,'TARGET_PREPARE_COPY_RECEIPT');
 const hash=verifyOfflineBoundary({resource:c.sourceResource,endProof:c.sourceEndProof,...r.boundary});return{boundary:r.boundary,summary:{sourcePostgresRunning:false,targetPostgresRunning:false,binding:hash}};
}
async function copyBeforeTarget(c){
 validateCopyConfig(c);refuse(c.invocationId===process.env.QA_INVOCATION_ID,'TARGET_PREPARE_COPY_INVOCATION');const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:'copy-offline'});
 const started=performance.now(),checkBudget=async()=>{const s=await ledger.snapshot(),elapsed=uptime()-s.startedUptime;refuse(s.schema==='cp019-budget-v1'&&s.project===SOURCE&&elapsed>=0&&elapsed<=1800&&performance.now()-started<=120000&&Object.entries({sql:GLOBAL_LIMITS.sql,http:300,journal:1000,artifactFiles:GLOBAL_LIMITS.artifactFiles}).every(([k,max])=>Number.isSafeInteger(s.total?.[k])&&s.total[k]>=0&&s.total[k]<=max),'TARGET_PREPARE_COPY_BUDGET');};await checkBudget();
 // PGDATA is measured by its separate 10000-file/2GiB bounds. The existing
 // artifact ledger charges the immutable index and metadata publications.
 const result=await copyOffline({sourceRoot:TARGET_PREPARE_PATHS.sourceData,copyRoot:TARGET_PREPARE_PATHS.backup,indexPath:TARGET_PREPARE_PATHS.copyIndex,resource:c.sourceResource,endProof:c.sourceEndProof,observeBoundary:async()=>{await checkBudget();return(await liveCopy(c)).boundary},ledger,checkpoint:checkBudget});
 const index=(await strictRead(TARGET_PREPARE_PATHS.copyIndex,{limit:INDEX,mode:0o600,expectedHash:result.indexHash})).value;
 const restored=await restoreOfflineCopy({copyRoot:TARGET_PREPARE_PATHS.backup,targetRoot:TARGET_PREPARE_PATHS.targetData,index,indexHash:result.indexHash,observeBoundary:async()=>(await liveCopy(c)).summary,checkBudget});
 return{type:'cp019-target-copy-prepared',status:'PASS',indexHash:result.indexHash,boundaryHash:result.boundaryHash,files:result.files,bytes:result.bytes,targetFiles:restored.files,secretOutput:false,physicalRecovery:'NOT VERIFIED'};
}
async function assembleFromFiles(c){
 exact(c,ASSEMBLE_KEYS,'TARGET_PREPARE_CONFIG');const variant=Object.hasOwn(c.inputHashes??{},'variantLineage');exact(c.inputHashes,[...INPUT_KEYS,...(variant?['variantLineage']:[])],'TARGET_PREPARE_HASHES');const paths=TARGET_PREPARE_PATHS,v={};
 if(variant)v.variantLineage=(await strictRead('/run/qa-secrets/target-variant-lineage.json',{expectedHash:c.inputHashes.variantLineage})).value;
 for(const[k,n]of [['material','material'],['foundation','source-foundation'],['writers','source-writers'],['correctives','source-correctives'],['sourceNormalManifest','source-normal-manifest'],['sourceCapture','source-capture-result'],['sourceLiveEnd','source-live-end']])v[k]=(await strictRead(paths.sourceSecrets+'/'+n+'.json',{expectedHash:c.inputHashes[k]})).value;
 v.targetCa=(await strictRead(paths.targetCa,{uid:0,mode:0o444,json:false,expectedHash:c.inputHashes.targetCa})).value;
 for(const[k,p]of [['producerArtifact',paths.sourceArtifact],['verifierArtifact',paths.verifierArtifact]])v[k]=(await strictRead(p,{uid:0,mode:0o444,expectedHash:c.inputHashes[k]})).value;
 v.copyIndex=(await strictRead(paths.sourceJournal+'/copy-index.json',{limit:INDEX,mode:0o600,expectedHash:c.inputHashes.copyIndex})).value;
 const log=(await strictRead(paths.sourceJournal+'/source.jsonl',{limit:JOURNAL,mode:0o600,json:false,expectedHash:c.sourceJournalRawHash})).value;
 v.sourceJournalRecords=await validateSourceJournalSnapshot({raw:log,rawHash:c.sourceJournalRawHash,recordsHash:c.inputHashes.sourceJournalRecords,copyCheckpoint:c.sourceJournalCopyCheckpoint,finalCheckpoint:c.sourceJournalFinalCheckpoint,headNames:await readdir(paths.sourceJournal+'/heads'),readHead:async n=>(await strictRead(paths.sourceJournal+'/heads/'+n,{mode:0o600})).value,readPlan:async n=>(await strictRead(paths.sourceJournal+'/plans/'+n,{mode:0o600})).value});
 const built=assembleTarget({config:c,...v}),scenario=built.budgetCase;refuse(scenario,'TARGET_PREPARE_VARIANT_KIND');const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario});
 await publishOrMatch('/run/qa-secrets/material.json',v.variantLineage?.effectiveMaterial??v.material,ledger);await publishOrMatch('/run/qa-secrets/source-capture.json',v.sourceCapture,ledger);
 const published=await publishTargetConfigBundle({bundle:built.bundle,expectedFullHash:built.configBundleHash,ledger});refuse(published.headerSha256===built.configBundleHeaderHash,'TARGET_PREPARE_PUBLICATION');
 return{type:'cp019-target-prepared',status:'PASS',configBundleHash:built.configBundleHash,configBundleHeaderHash:built.configBundleHeaderHash,sourceCaptureHash:built.sourceCaptureHash,custodyHash:built.custodyHash,manifestHash:built.manifestHash,planHash:built.planHash,budgetCase:built.budgetCase,...(variant?{variantLineageHash:built.variantLineageHash}:{}),filesPublished:published.filesPublished,filesReused:published.filesReused,secretOutput:false,physicalRecovery:'NOT VERIFIED'};
}
export async function main(){
 const[action]=process.argv.slice(2);refuse(process.argv.length===3&&['copy-before-target','assemble'].includes(action)&&process.env.QA_PROJECT===TARGET&&process.platform==='linux'&&process.getuid()===999,'TARGET_PREPARE_CLI');const c=(await strictRead(TARGET_PREPARE_PATHS.config)).value;
 console.log(JSON.stringify(action==='copy-before-target'?await copyBeforeTarget(c):await assembleFromFiles(c)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({type:'cp019-target-prepare-failed',code:'TARGET_PREPARE_FAILED',...(typeof error?.message==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(error.message)?{guard:error.message}:{}),secretOutput:false}));process.exitCode=1});
