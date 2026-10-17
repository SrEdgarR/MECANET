// One disposable CI cold copy. No process adoption, retry, restore policy or VPS access.
import assert from 'node:assert/strict';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {lstat,realpath,readdir,readFile,mkdir,copyFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const HASH=/^[a-f0-9]{64}$/;
export function validateCopyLocations(root,source,target){
 root=resolve(root);source=resolve(source);target=resolve(target);
 assert.equal(root,resolve('.qa-private/cp023-ci'),'CI_COPY_EXCLUSIVE_ROOT');
 assert.equal(source,resolve(root,'data'),'CI_COPY_SOURCE_REQUIRED');
 assert.equal(target,resolve(root,'target/data'),'CI_COPY_DISTINCT_TARGET_REQUIRED');
 return{root,source,target};
}
export function assertSourceFin(p){
 assert.ok(p?.schema==='cp027-ci-source-fin-v1'&&HASH.test(p.cid??'')&&/^[a-f0-9]{40}$/.test(p.sourceSha??'')&&/^[0-9a-f-]{36}$/.test(p.owner??'')&&p.exited===true&&p.exitCode===0&&p.pid===0&&p.poolsEnded===true,'CI_COPY_POSITIVE_SOURCE_FIN_REQUIRED');
 assert.deepEqual(p.api?.map(x=>x.instance).sort(),['api1','api2'],'CI_COPY_TWO_API_FIN_REQUIRED');
 assert.ok(p.api.every(x=>x.exitCode===0&&x.drained===true),'CI_COPY_TWO_API_FIN_REQUIRED');return p;
}
export function assertPortableRecovery(r){
 for(const key of ['sourceClosure','sourceFin','copy','recovery','targetHttp','continuation'])assert.equal(r?.[key]?.status,'PASS','CI_PORTABLE_RECOVERY_'+key.toUpperCase());
 assert.ok(r.copy.verifiedFiles>0&&HASH.test(r.copy.sourceAfterHash??'')&&r.copy.sourceAfterHash===r.copy.targetHash,'CI_COPY_HASH_REQUIRED');
 for(const key of ['historical','oldSessionInvalid','oldEpochRejected','companyBBlocked'])assert.equal(r.continuation[key],true,'CI_CONTINUITY_'+key.toUpperCase());return true;
}
export function assertRecoveredClock(context){assert.ok(typeof context?.clockFailure==='function'&&context.clockFailure()===null,'CI_TARGET_CLOCK_FAILED');return true}
export function assertApiRestart(fin,previous,next){
 const identities=rows=>{assert.deepEqual(rows?.map(x=>x.instance).sort(),['api1','api2'],'CI_API_RESTART_IDENTITIES');assert.ok(rows.every(x=>Number.isSafeInteger(x.pid)&&x.pid>0)&&new Set(rows.map(x=>x.pid)).size===2,'CI_API_RESTART_IDENTITIES')};identities(previous);identities(next);
 assert.deepEqual(fin?.map(x=>x.instance).sort(),['api1','api2'],'CI_API_RESTART_POSITIVE_FIN');
 assert.ok(fin.every(x=>x.exitCode===0&&x.events?.some(e=>e.type==='development-api-stopped'&&e.pid===previous.find(old=>old.instance===x.instance)?.pid&&e.drained===true&&e.budget?.pools===0&&e.budget?.leased===0)),'CI_API_RESTART_POSITIVE_FIN');
 assert.ok(next.every(x=>!previous.some(old=>old.pid===x.pid)),'CI_API_RESTART_FRESH_PROCESSES');return true;
}
async function syncDirectory(path){const h=await open(path,'r');try{await h.sync()}finally{await h.close()}}
async function indexTree(root,beforeFile){
 const rows=[],dirs=[];let bytes=0;
 async function walk(path){
  const s=await lstat(path);assert.ok(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&await realpath(path)===path,'CI_COPY_DIRECTORY_ALIAS');dirs.push(path);
  for(const name of (await readdir(path)).sort()){
   const file=resolve(path,name),within=relative(root,file);assert.ok(within&&!within.startsWith('..')&&!isAbsolute(within),'CI_COPY_PATH_REQUIRED');
   const st=await lstat(file);assert.ok(!st.isSymbolicLink(),'CI_COPY_ALIAS_FORBIDDEN');
   if(st.isDirectory()){await walk(file);continue}
   assert.ok(st.isFile()&&st.uid===process.getuid()&&st.nlink===1&&st.size<=64*1024**2,'CI_COPY_FILE_REQUIRED');
   assert.ok(rows.length<5000&&bytes+st.size<=1024**3,'CI_COPY_BUDGET');beforeFile();
   const content=await readFile(file);assert.equal(content.length,st.size,'CI_COPY_SOURCE_CHANGED');bytes+=content.length;
   rows.push({path:within.split('\\').join('/'),bytes:content.length,sha256:sha256(content)});
  }
 }
 await walk(root);return{rows,dirs,bytes,hash:sha256(JSON.stringify(rows))};
}
export async function copyClosedCiCluster({root,source,target,sourceFin,beforeFile=()=>{}}){
 assert.equal(process.platform,'linux','CI_COPY_LINUX_FSYNC_REQUIRED');assertSourceFin(sourceFin);({root,source,target}=validateCopyLocations(root,source,target));
 assert.equal(await realpath(root),root,'CI_COPY_ROOT_ALIAS');
 const parent=dirname(target);try{await lstat(parent);assert.fail('CI_COPY_TARGET_ALREADY_EXISTS')}catch(e){if(e.code!=='ENOENT')throw e}
 const before=await indexTree(source,beforeFile);assert.ok(before.rows.length>0,'CI_COPY_EMPTY');
 await mkdir(parent,{mode:0o700});await mkdir(target,{mode:0o700});
 for(const directory of before.dirs.slice(1))await mkdir(resolve(target,relative(source,directory)),{mode:0o700});
 for(const row of before.rows){beforeFile();const file=resolve(target,row.path);await copyFile(resolve(source,row.path),file,1);const h=await open(file,'r+');try{await h.sync()}finally{await h.close()}}
 for(const directory of before.dirs.slice().reverse())await syncDirectory(resolve(target,relative(source,directory)));await syncDirectory(parent);await syncDirectory(root);
 const after=await indexTree(source,beforeFile),copied=await indexTree(target,beforeFile);assert.deepEqual(after.rows,before.rows,'CI_COPY_SOURCE_CHANGED');assert.deepEqual(copied.rows,before.rows,'CI_COPY_VERIFICATION_FAILED');
 return{schema:'cp027-ci-cold-copy-v1',status:'PASS',sourceBeforeHash:before.hash,sourceAfterHash:after.hash,targetHash:copied.hash,verifiedFiles:before.rows.length,verifiedBytes:before.bytes,fileFsync:true,directoryFsync:true,sourceFinHash:sha256(JSON.stringify(sourceFin))};
}
