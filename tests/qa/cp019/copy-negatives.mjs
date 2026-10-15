import {GLOBAL_LIMITS} from './budget-limits.mjs';
// Linux filesystem negatives on fresh, disposable TARGET copies. Import is passive.
import {cp,lstat,open,readFile,readdir,realpath,statfs,symlink,link,unlink,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {uptime} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha256,verifyCopyIndex} from '../../../server/saas/recovery/protocol.js';
import {newLedger} from './ledger.mjs';
import {publishSourceReadonly} from './source-driver.mjs';
const HASH=/^[0-9a-f]{64}$/,SHA=/^[0-9a-f]{40}$/;
const check=(ok,code)=>{if(!ok)throw Error(code)};
export const COPY_NEGATIVE_CASES=Object.freeze({missing:'COPY_INVENTORY',extra:'COPY_INVENTORY',hash:'COPY_HASH',symlink:'COPY_SYMLINK',hardlink:'COPY_HARDLINK'});
const TARGET='mecanet-qa-p1l3-r03-target',METADATA_RESERVE=4*1024**2;
export function verifyRetainedFootprint(config,now=Date.now()){
 const f=config?.retainedFootprint,bindings=['project','sourceSha','artifactDigest','custodyHash','recoveryId','indexHash','copyReceiptHash','sourceEndProofHash'];
 check(f&&Object.keys(f).sort().join(',')===[...bindings,'schema','otherFootprintBytes','metadataReserveBytes','observedAt','allConsumersStopped','excludedPaths'].sort().join(',')&&f.schema==='cp021-copy-retained-footprint-v1'&&HASH.test(config.retainedFootprintHash??'')&&sha256(f)===config.retainedFootprintHash,'COPY_NEGATIVE_FOOTPRINT');
 check(bindings.every(k=>f[k]===config[k])&&f.project===TARGET&&Number.isSafeInteger(f.otherFootprintBytes)&&f.otherFootprintBytes>=0&&f.otherFootprintBytes<=2*1024**3&&f.metadataReserveBytes===METADATA_RESERVE&&f.allConsumersStopped===true&&Number.isFinite(Date.parse(f.observedAt))&&Number.isFinite(now)&&Date.parse(f.observedAt)<=now&&JSON.stringify(f.excludedPaths)===JSON.stringify(['/opt/'+TARGET+'/data','/opt/'+TARGET+'/backup']),'COPY_NEGATIVE_FOOTPRINT');
 // Root measured every other byte with all consumers stopped. Only the main
 // data and the negative-copy subtree are observed dynamically below. The
 // existing 2GiB ceiling reserves up to 16 further bounded metadata files.
 return Object.freeze({otherFootprintBytes:f.otherFootprintBytes,metadataReserveBytes:f.metadataReserveBytes,retainedFootprintHash:config.retainedFootprintHash});
}
export function verifyNegativeCopyCapacity({sourceBytes,targetDatasetBytes,otherFootprintBytes,metadataReserveBytes,freeDiskBytes,diskTotalBytes,remainingCopies}){
 check([sourceBytes,targetDatasetBytes,otherFootprintBytes,metadataReserveBytes,freeDiskBytes,diskTotalBytes,remainingCopies].every(v=>Number.isSafeInteger(v)&&v>=0)&&metadataReserveBytes===METADATA_RESERVE&&remainingCopies<=5&&diskTotalBytes>0,'COPY_NEGATIVE_CAPACITY_SHAPE');
 const growth=remainingCopies*sourceBytes+65536,projected=otherFootprintBytes+targetDatasetBytes+growth+metadataReserveBytes;
 check(Number.isSafeInteger(projected)&&projected<=2*1024**3&&freeDiskBytes>Math.max(15*1024**3,Math.ceil(diskTotalBytes/10),growth+metadataReserveBytes+2*1024**3),'COPY_NEGATIVE_CAPACITY');return{projectedTargetDatasetBytes:projected,remainingGrowthBytes:growth,otherFootprintBytes,metadataReserveBytes,freeDiskBytes};
}
export async function exerciseCopyNegatives({sourceRoot,destinationRoot,index,indexHash,ledger,beforeEffect,publishPlan,observeCapacity}){
 check(ledger?.enter&&ledger?.charge&&typeof beforeEffect==='function'&&typeof publishPlan==='function'&&typeof observeCapacity==='function','COPY_NEGATIVE_DEPENDENCIES');
 sourceRoot=resolve(sourceRoot);destinationRoot=resolve(destinationRoot);check(await realpath(sourceRoot)===sourceRoot&&await realpath(destinationRoot)===destinationRoot&&sourceRoot!==destinationRoot&&!destinationRoot.startsWith(sourceRoot+'/'),'COPY_NEGATIVE_ROOTS');
 const source=await verifyCopyIndex(sourceRoot,index,indexHash);check(source.files>0&&source.bytes<=2*1024**3,'COPY_NEGATIVE_SOURCE');
 const victim=index.files.find(e=>e.bytes>0);check(victim,'COPY_NEGATIVE_NONEMPTY_FILE');const results=[];
 let remainingCopies=5;
 for(const[kind,code]of Object.entries(COPY_NEGATIVE_CASES)){
  const capacity=verifyNegativeCopyCapacity({sourceBytes:source.bytes,...await observeCapacity(),remainingCopies});
  await ledger.enter('copy-negative-'+kind);await ledger.charge('artifactFiles');await beforeEffect();const root=join(destinationRoot,kind);let missing=false;try{await lstat(root)}catch(e){if(e.code==='ENOENT')missing=true;else throw e}check(missing,'COPY_NEGATIVE_ALREADY_EXISTS_KEEP');
  await publishPlan({schema:'cp020-copy-negative-plan-v1',kind,indexHash,files:source.files,bytes:source.bytes,sourceRoot,destinationRoot:root,capacity});
  // These regular PGDATA copies have the approved, separately bounded file/byte
  // inventory. Only their diagnostic metadata is an artifactFiles publication.
  let copiedFiles=0,copiedBytes=0;await cp(sourceRoot,root,{recursive:true,dereference:false,errorOnExist:true,force:false,mode:constants.COPYFILE_EXCL,filter:async path=>{await beforeEffect();const s=await lstat(path);check(!s.isSymbolicLink()&&(s.isDirectory()||s.isFile()&&s.nlink===1),'COPY_NEGATIVE_SOURCE_CHANGED');if(s.isFile()){copiedFiles++;copiedBytes+=s.size;check(copiedFiles<=source.files&&copiedBytes<=source.bytes,'COPY_NEGATIVE_COPY_BUDGET')}return true}});check(copiedFiles===source.files&&copiedBytes===source.bytes,'COPY_NEGATIVE_COPY_INCOMPLETE');
  await beforeEffect();await verifyCopyIndex(root,index,indexHash);const file=join(root,victim.path);
  if(kind==='missing')await unlink(file);
  if(kind==='extra')await writeFile(join(root,'cp020-extra-file'),Buffer.from('extra'),{flag:'wx',mode:0o600});
  if(kind==='hash'){const h=await open(file,constants.O_RDWR|constants.O_NOFOLLOW);try{const b=Buffer.alloc(1);check((await h.read(b,0,1,0)).bytesRead===1,'COPY_NEGATIVE_READ');b[0]^=1;await h.write(b,0,1,0);await h.sync()}finally{await h.close()}}
  if(kind==='symlink')await symlink(sourceRoot,join(root,'cp020-directory-symlink'),process.platform==='win32'?'junction':'dir');
  if(kind==='hardlink')await link(file,join(destinationRoot,'hardlink-alias'));
  let observed=null;try{await verifyCopyIndex(root,index,indexHash)}catch(e){observed=e.message}
  check(observed===code,'COPY_NEGATIVE_EXPECTED_REJECTION');await beforeEffect();
  // Verify the original readonly backup after every negative. No cleanup or
  // restoration is attempted over source, backup or the main TARGET data.
  await verifyCopyIndex(sourceRoot,index,indexHash);remainingCopies--;verifyNegativeCopyCapacity({sourceBytes:source.bytes,...await observeCapacity(),remainingCopies});results.push({kind,expected:code,observed,status:'PASS'});
 }
 return{status:'PASS',layer:'real filesystem only; PostgreSQL not started',sourceIndexHash:indexHash,sourceFiles:source.files,sourceBytes:source.bytes,cases:results,canonicalBackupUnchanged:true,negativeCopies:'KEEP PRIVATE'};
}
async function input400(file){const s=await lstat(file);check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o400&&s.size<=262144,'COPY_NEGATIVE_PRIVATE');const h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const t=await h.stat();check(t.ino===s.ino&&t.dev===s.dev&&t.size===s.size,'COPY_NEGATIVE_CHANGED');return JSON.parse(await h.readFile())}finally{await h.close()}}
export async function main(){
 check(process.argv.length===2&&process.env.QA_PROJECT==='mecanet-qa-p1l3-r03-target','COPY_NEGATIVE_CLI');const c=await input400('/run/qa-secrets/copy-negative-config.json');
 check(Object.keys(c).sort().join(',')==='artifactDigest,copyReceiptHash,custodyHash,indexHash,project,recoveryId,retainedFootprint,retainedFootprintHash,schema,sourceEndProofHash,sourcePgOff,sourceSha,targetPgOff'&&c.schema==='cp020-copy-negatives-v1'&&c.project===process.env.QA_PROJECT&&c.sourceSha===process.env.QA_CODE_SHA&&SHA.test(c.sourceSha)&&['artifactDigest','copyReceiptHash','custodyHash','indexHash','sourceEndProofHash'].every(k=>HASH.test(c[k]))&&c.sourcePgOff===true&&c.targetPgOff===true&&/^[0-9a-f-]{36}$/.test(c.recoveryId),'COPY_NEGATIVE_BINDING');const retained=verifyRetainedFootprint(c);
 const index=JSON.parse(await readFile('/run/qa-copy-index.json'));check(sha256(index)===c.indexHash,'COPY_NEGATIVE_INDEX');const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:'target-window'});
 const checkTime=async()=>{const s=await ledger.snapshot(),row=s.scenarios[s.activeScenarios['target-window']];check(s.total.sql<=GLOBAL_LIMITS.sql&&s.total.http<=300&&uptime()-s.startedUptime>=0&&uptime()-s.startedUptime<=1800&&row&&uptime()-row.startedUptime>=0&&uptime()-row.startedUptime<=45,'COPY_NEGATIVE_BUDGET')};
 async function datasetBytes(dir){let bytes=0;for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name),s=await lstat(p);if(s.isDirectory()&&!s.isSymbolicLink())bytes+=await datasetBytes(p);else{check(s.isFile()||s.isSymbolicLink(),'COPY_NEGATIVE_STORAGE_ENTRY');bytes+=s.size}check(bytes<=2*1024**3,'COPY_NEGATIVE_CAPACITY')}return bytes}
 const observeCapacity=async()=>{const disk=await statfs('/run/qa-negative');return{...retained,targetDatasetBytes:await datasetBytes('/run/qa-target-data')+await datasetBytes('/run/qa-negative'),freeDiskBytes:disk.bavail*disk.bsize,diskTotalBytes:disk.blocks*disk.bsize}};
 const result=await exerciseCopyNegatives({sourceRoot:'/run/qa-copy',destinationRoot:'/run/qa-negative',index,indexHash:c.indexHash,ledger,beforeEffect:checkTime,observeCapacity,publishPlan:v=>publishSourceReadonly('/run/qa-results/copy-negative-'+v.kind+'-plan.json',{...v,custodyHash:c.custodyHash,copyReceiptHash:c.copyReceiptHash,sourceEndProofHash:c.sourceEndProofHash})});
 const report={schema:'cp020-copy-negatives-report-v1',sourceSha:c.sourceSha,project:c.project,custodyHash:c.custodyHash,copyReceiptHash:c.copyReceiptHash,sourceEndProofHash:c.sourceEndProofHash,recoveryId:c.recoveryId,retainedFootprintHash:retained.retainedFootprintHash,result,ledger:await ledger.snapshot(),secretOutput:false};await ledger.charge('artifactFiles');const saved=await publishSourceReadonly('/run/qa-results/copy-negatives.json',report);
 console.log(JSON.stringify({type:'cp020-copy-negatives',status:'PASS',reportHash:saved.sha256,sourceSha:c.sourceSha,secretOutput:false,postgresExecuted:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({type:'cp020-copy-negatives-failed',code:'COPY_NEGATIVE_FAILED',secretOutput:false}));process.exitCode=1});
