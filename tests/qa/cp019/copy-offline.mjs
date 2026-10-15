// Own offline-copy executor. A trusted root supplies live Docker/control-data
// observations; metadata flags alone are not a termination witness.
import {mkdir,lstat,realpath,readdir,open,chown,chmod} from 'node:fs/promises';
import {constants} from 'node:fs';import {join,resolve,dirname} from 'node:path';import {createHash} from 'node:crypto';
import {canonical,sha256,verifyEndProof,verifyCopyIndex,publishCopyIndex,syncDirectory} from '../../../server/saas/recovery/protocol.js';
const fail=(ok,code)=>{if(!ok)throw Error(code)};
export function verifyOfflineBoundary({resource,endProof,observedEnd,postgres}){
 fail(resource?.project==='mecanet-qa-p1l3-r03'&&/^[0-9a-f]{64}$/.test(resource.containerId??''),'COPY_SOURCE_IDENTITY');
 verifyEndProof(endProof,observedEnd);
 fail(endProof.sourceResourceHash===sha256(resource),'COPY_SOURCE_BINDING');
 fail(postgres&&Object.keys(postgres).sort().join(',')==='containerId,dataPath,exitCode,finishedAt,imageDigest,project,running,state,systemIdentifier'&&postgres.containerId===resource.containerId&&postgres.project===resource.project&&postgres.imageDigest===resource.imageDigest&&postgres.dataPath===resource.dataPath&&postgres.systemIdentifier===resource.systemIdentifier&&postgres.running===false&&postgres.exitCode===0&&Number.isFinite(Date.parse(postgres.finishedAt))&&postgres.state==='shut down','COPY_PG_END_NOT_PROVEN');
 return sha256({resourceHash:sha256(resource),sourceEndProofHash:sha256(endProof),postgres});
}
/** Fresh final name only. Interrupted copies remain KEEP and cannot be treated
 * as valid or overwritten. A resumed physical variant needs its explicit plan. */
export async function copyOffline({sourceRoot,copyRoot,indexPath,resource,endProof,observeBoundary,ledger,sync=syncDirectory,checkpoint=async()=>{}}={}){
 fail(typeof observeBoundary==='function'&&ledger?.charge&&typeof sourceRoot==='string'&&typeof copyRoot==='string'&&typeof indexPath==='string','COPY_PRIVATE_DEPENDENCIES');
 sourceRoot=resolve(sourceRoot);copyRoot=resolve(copyRoot);indexPath=resolve(indexPath);
 fail(sourceRoot!==copyRoot&&await realpath(sourceRoot)===sourceRoot&&await realpath(dirname(copyRoot))===dirname(copyRoot)&&await realpath(dirname(indexPath))===dirname(indexPath)&&!(copyRoot+'/').startsWith(sourceRoot+'/'),'COPY_ROOT_IDENTITY');
 const mounts=[{hostPath:resource.dataPath,containerPath:sourceRoot,writable:false},{hostPath:'/opt/mecanet-qa-p1l3-r03/backup',containerPath:dirname(copyRoot),writable:true},{hostPath:'/opt/mecanet-qa-p1l3-r03/journal',containerPath:dirname(indexPath),writable:true}];
 fail(new Set(mounts.map(m=>m.containerPath)).size===3,'COPY_MOUNT_BINDING');
 const first=await observeBoundary();fail(canonical(first.mounts)===canonical(mounts),'COPY_MOUNT_BINDING');const boundaryHash=verifyOfflineBoundary({resource,endProof,...first});
 const started=performance.now(),entries=[];let total=0;
 const beforeEffect=()=>fail(performance.now()-started<=120000&&entries.length<=10000&&total<=2*1024**3,'COPY_BUDGET_ABORT');
 async function inventory(dir,prefix=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
   beforeEffect();const relative=prefix+entry.name,path=join(dir,entry.name),stat=await lstat(path);
   fail(!stat.isSymbolicLink()&&stat.nlink===1||stat.isDirectory()&&!stat.isSymbolicLink(),'COPY_LINK_REJECTED');
   if(stat.isDirectory())await inventory(path,relative+'/');else{fail(stat.isFile(),'COPY_REGULAR_FILE_REQUIRED');total+=stat.size;entries.push({path:relative,bytes:stat.size,sha256:null});beforeEffect();}
  }
 }
 await inventory(sourceRoot);fail(entries.length>0,'COPY_EMPTY_SOURCE');
 await mkdir(copyRoot,{mode:0o700});
 for(const entry of entries){
  beforeEffect();const source=join(sourceRoot,entry.path),target=join(copyRoot,entry.path);await mkdir(dirname(target),{recursive:true,mode:0o700});
  const stat=await lstat(source);fail(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size===entry.bytes,'COPY_SOURCE_CHANGED');
  await checkpoint('before-source-open',{path:source});
  const input=await open(source,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let handle;
  try{const opened=await input.stat();fail(opened.isFile()&&opened.nlink===1&&opened.dev===stat.dev&&opened.ino===stat.ino&&opened.size===stat.size,'COPY_SOURCE_CHANGED');
   handle=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
   const hasher=createHash('sha256');let copiedBytes=0;
   for await(const bytes of input.createReadStream({autoClose:false})){beforeEffect();hasher.update(bytes);let offset=0;while(offset<bytes.length){const result=await handle.write(bytes.subarray(offset));fail(result.bytesWritten>0,'COPY_SHORT_WRITE');offset+=result.bytesWritten;}copiedBytes+=bytes.length;}
   const copied=await handle.stat(),ended=await input.stat();fail(copied.nlink===1&&!(copied.dev===stat.dev&&copied.ino===stat.ino)&&copiedBytes===entry.bytes&&ended.size===stat.size&&ended.dev===stat.dev&&ended.ino===stat.ino,'COPY_SOURCE_CHANGED');entry.sha256=hasher.digest('hex');await handle.sync();
  }finally{await handle?.close();await input.close();}
  await chmod(target,stat.mode&0o777);if(process.platform!=='win32')await chown(target,999,999);
  await sync(dirname(target));
 }
 async function directories(dir){for(const item of await readdir(dir,{withFileTypes:true}))if(item.isDirectory())await directories(join(dir,item.name));await sync(dir);if(process.platform!=='win32')await chown(dir,999,999);}
 await directories(copyRoot);await sync(dirname(copyRoot));
 const index={schema:'copy-index-v1',files:entries.sort((a,b)=>a.path.localeCompare(b.path,'en'))};
 const verified=await verifyCopyIndex(copyRoot,index,sha256(index));
 const second=await observeBoundary();fail(verifyOfflineBoundary({resource,endProof,...second})===boundaryHash&&canonical(second.mounts)===canonical(mounts),'COPY_BOUNDARY_CHANGED');beforeEffect();
 await verifyCopyIndex(sourceRoot,index,sha256(index));beforeEffect();
 await ledger.charge('artifactFiles');beforeEffect();const published=await publishCopyIndex(indexPath,index,{syncDirectory:sync});beforeEffect();
 return{status:'PASS',layer:'offline-file-copy',boundaryHash,indexHash:published.sha256,files:verified.files,bytes:verified.bytes,elapsedMs:Math.ceil(performance.now()-started),postgresRestored:false};
}
