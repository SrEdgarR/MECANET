// Private recovery controller primitives. No HTTP caller, process takeover or secret fallback.
import {createHash,randomUUID} from 'node:crypto';
import {open,link,unlink,lstat,realpath,readdir,readFile} from 'node:fs/promises';
import {resolve,dirname,basename,join,isAbsolute} from 'node:path';
import {constants} from 'node:fs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;const SHA=/^[0-9a-f]{40}$/;
const MAX=9223372036854775807n;const LIMIT=262144;
const plain=x=>x!==null&&typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype;
export const canonical=x=>JSON.stringify(normalize(x));
function normalize(x){if(Array.isArray(x))return x.map(normalize);if(plain(x))return Object.fromEntries(Object.keys(x).sort().map(k=>[k,normalize(x[k])]));if(x===undefined||typeof x==='function'||typeof x==='bigint'||typeof x==='number'&&!Number.isFinite(x))throw Error('INVALID_CANONICAL_VALUE');return x;}
export const sha256=x=>createHash('sha256').update(Buffer.isBuffer(x)||typeof x==='string'?x:canonical(x)).digest('hex');
function exact(x,keys,label){if(!plain(x)||Object.keys(x).sort().join(',')!==[...keys].sort().join(','))throw Error(label+'_SHAPE');}
function requireValue(ok,label){if(!ok)throw Error(label);}
function sized(x,limit=LIMIT){const b=Buffer.from(canonical(x));requireValue(b.length<=limit,'RECOVERY_SIZE_LIMIT');return b;}
function integer(s){requireValue(typeof s==='string'&&/^[1-9][0-9]{0,18}$/.test(s)&&BigInt(s)<=MAX,'RECOVERY_VERSION');return BigInt(s);}
function checkpoint(x){exact(x,['sequence','hash'],'CHECKPOINT');requireValue(Number.isSafeInteger(x.sequence)&&x.sequence>=0&&x.sequence<1000&&HASH.test(x.hash),'CHECKPOINT_INVALID');}
function resource(x){
 exact(x,['project','cohortId','hostIdentity','containerId','containerLabels','imageDigest','volumeId','dataPath','networkId','networkSubnet','networkIP','socketPath','generation','systemIdentifier'],'RESOURCE');
 requireValue(/^mecanet-qa-p1l3-r03(?:-target)?$/.test(x.project)&&UUID.test(x.cohortId)&&HASH.test(x.hostIdentity)&&HASH.test(x.containerId)&&/^sha256:[0-9a-f]{64}$/.test(x.imageDigest)&&UUID.test(x.generation)&&/^[0-9]{10,24}$/.test(x.systemIdentifier),'RESOURCE_IDENTITY');
 for(const k of ['volumeId','networkId'])requireValue(typeof x[k]==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(x[k]),'RESOURCE_NAME');
 for(const k of ['dataPath','socketPath'])requireValue(typeof x[k]==='string'&&x[k].startsWith('/opt/'+x.project+'/')&&!x[k].includes('..')&&!x[k].includes('\\')&&!x[k].includes('//'),'RESOURCE_PATH');
 exact(x.containerLabels,['project','service'],'RESOURCE_LABELS');requireValue(x.containerLabels.project===x.project&&x.containerLabels.service==='postgres','RESOURCE_LABELS');
 const target=x.project.endsWith('-target');requireValue(x.networkSubnet===(target?'10.77.66.0/25':'10.77.64.0/24')&&x.networkIP===(target?'10.77.66.2':'10.77.64.2'),'RESOURCE_NETWORK');
}
export function validateManifest(m,observed){
 sized(m);exact(m,['schema','recoveryId','provenance','source','target','copyIndexHash','copyCheckpoint','sourceClosedProofHash','journalFinalCheckpoint','scopes'],'MANIFEST');
 requireValue(m.schema==='recovery-manifest-v1'&&UUID.test(m.recoveryId),'MANIFEST_VERSION');
 exact(m.provenance,['baseSha','producerSha','artifactDigest','controllerOwner','verifierSha'],'PROVENANCE');
 requireValue(SHA.test(m.provenance.baseSha)&&SHA.test(m.provenance.producerSha)&&SHA.test(m.provenance.verifierSha)&&HASH.test(m.provenance.artifactDigest)&&UUID.test(m.provenance.controllerOwner),'MANIFEST_PROVENANCE');
 resource(m.source);resource(m.target);requireValue(m.source.project==='mecanet-qa-p1l3-r03'&&m.target.project==='mecanet-qa-p1l3-r03-target','MANIFEST_PROJECT');
 for(const k of ['cohortId','containerId','volumeId','dataPath','networkId','networkSubnet','socketPath','generation'])requireValue(m.source[k]!==m.target[k],'SOURCE_TARGET_NOT_DISTINCT');
 requireValue(observed&&canonical(observed.source)===canonical(m.source)&&canonical(observed.target)===canonical(m.target),'OBSERVED_RESOURCE_MISMATCH');
 requireValue(HASH.test(m.copyIndexHash)&&HASH.test(m.sourceClosedProofHash),'MANIFEST_HASH');checkpoint(m.copyCheckpoint);checkpoint(m.journalFinalCheckpoint);requireValue(m.journalFinalCheckpoint.sequence>=m.copyCheckpoint.sequence,'JOURNAL_BEFORE_COPY');
 requireValue(Array.isArray(m.scopes)&&m.scopes.length<=3,'MANIFEST_SCOPES');const tenants=new Set(),dbs=new Set();
 for(const s of m.scopes){
  exact(s,['tenantId','database','roles','eligibility','closedReason','sourceEpoch','targetEpoch','closedVersion','openVersion','abortVersion','schemaVersion','readerRef','writerRef','credentialVersion','writerCredentialVersion'],'SCOPE');
  requireValue(UUID.test(s.tenantId)&&!tenants.has(s.tenantId)&&/^mecanet_(tenant_[ab]|demo)$/.test(s.database)&&!dbs.has(s.database),'SCOPE_DUPLICATE');tenants.add(s.tenantId);dbs.add(s.database);
  requireValue(Array.isArray(s.roles)&&s.roles.length>=1&&s.roles.length<=2&&new Set(s.roles).size===s.roles.length&&s.roles.every(r=>/^saas_(tenant_[ab]|writer_[ab]|demo)$/.test(r)),'SCOPE_ROLES');
  if(s.database==='mecanet_demo'){
   requireValue(canonical(s.roles)===canonical(['saas_demo'])&&s.eligibility==='RESTRICTED_CLOSED'&&s.closedReason==='DEMO'&&s.schemaVersion===1&&['sourceEpoch','targetEpoch','closedVersion','openVersion','abortVersion','writerRef','writerCredentialVersion'].every(k=>s[k]===null),'DEMO_SCOPE_POLICY');
   integer(s.credentialVersion);requireValue(typeof s.readerRef==='string'&&/^[a-z0-9-]{1,96}$/.test(s.readerRef),'SCOPE_REFERENCE');continue;
  }
  const suffix=s.database.endsWith('_a')?'a':'b';requireValue(s.roles.every(r=>r==='saas_tenant_'+suffix||r==='saas_writer_'+suffix),'SCOPE_ROLES');
  requireValue(['OPEN_ELIGIBLE','RESTRICTED_CLOSED'].includes(s.eligibility)&&['RESTORE','TENANT','IDENTITY','MEMBERSHIP','GRANT','DEMO'].includes(s.closedReason)&&s.schemaVersion===3,'SCOPE_POLICY');
  const c=integer(s.closedVersion);requireValue(c<=MAX-2n&&integer(s.openVersion)===c+1n&&integer(s.abortVersion)===c+2n&&integer(s.targetEpoch)===integer(s.sourceEpoch)+1n,'SCOPE_CAS');
  integer(s.credentialVersion);integer(s.writerCredentialVersion);for(const k of ['readerRef','writerRef'])requireValue(typeof s[k]==='string'&&/^[a-z0-9-]{1,96}$/.test(s[k]),'SCOPE_REFERENCE');
 }
 return m;
}
export function verifyEndProof(p,observed,{profile='source'}={}){
 sized(p);exact(p,['schema','recoveryId','sourceResourceHash','processes','sqlOwners','httpOperationIds'],'END_PROOF');
 requireValue(['source','controller','worker'].includes(profile)&&p.schema===profile+'-end-v1'&&UUID.test(p.recoveryId)&&HASH.test(p.sourceResourceHash)&&p.sourceResourceHash===observed?.resourceHash,'END_RESOURCE');
 requireValue(Array.isArray(p.processes)&&p.processes.length===(profile==='source'?4:1)&&Array.isArray(p.sqlOwners)&&Array.isArray(p.httpOperationIds),'END_INVENTORY');
 const owners=new Set(),containers=new Set(),services=new Set();
 requireValue(Array.isArray(observed.containers)&&observed.containers.length===p.processes.length,'END_PROCESS_INVENTORY');
 for(const proc of p.processes){
  exact(proc,['service','containerId','ownerId','exitCode','finishedAt'],'END_PROCESS');
  requireValue((profile==='source'?['api1','api2','worker','web']:[profile]).includes(proc.service)&&!services.has(proc.service)&&HASH.test(proc.containerId)&&UUID.test(proc.ownerId)&&Number.isInteger(proc.exitCode)&&typeof proc.finishedAt==='string'&&Number.isFinite(Date.parse(proc.finishedAt))&&!owners.has(proc.ownerId)&&!containers.has(proc.containerId),'END_PROCESS_INVALID');
  services.add(proc.service);owners.add(proc.ownerId);containers.add(proc.containerId);
  const actual=observed.containers.find(c=>c.id===proc.containerId);requireValue(actual&&actual.service===proc.service&&actual.ownerId===proc.ownerId&&actual.running===false&&actual.exitCode===proc.exitCode&&actual.finishedAt===proc.finishedAt,'END_PROCESS_UNPROVED');
 }
 const sqlOwners=p.processes.filter(proc=>proc.service!=='web').map(proc=>proc.ownerId);
 requireValue(p.sqlOwners.length===sqlOwners.length&&p.sqlOwners.every(x=>sqlOwners.includes(x))&&new Set(p.sqlOwners).size===p.sqlOwners.length,'END_SQL_INVENTORY');
 requireValue(Array.isArray(observed.sqlOwnersPresent)&&observed.sqlOwnersPresent.length===0&&Array.isArray(observed.httpPending)&&observed.httpPending.length===0&&p.httpOperationIds.every(x=>UUID.test(x)),'END_RESOURCES_UNPROVED');
 return sha256(p);
}
async function assertPath(dir){const p=resolve(dir);requireValue(await realpath(p)===p,'RECOVERY_SYMLINK');const s=await lstat(p);requireValue(s.isDirectory()&&!s.isSymbolicLink(),'RECOVERY_DIRECTORY');if(process.platform!=='win32')requireValue((s.mode&0o077)===0&&s.uid===process.getuid(),'RECOVERY_DIRECTORY_ACCESS');return p;}
export async function syncDirectory(dir){const h=await open(dir,constants.O_RDONLY| (constants.O_DIRECTORY??0)|(constants.O_NOFOLLOW??0));try{await h.sync();}finally{await h.close();}}
/** A final name can never be replaced. A failed final fsync leaves material intact and uncertain. */
export async function publishImmutable(path,value,options={}){return publishSized(path,value,LIMIT,options);}
export async function publishCopyIndex(path,value,options={}){validateIndexShape(value);return publishSized(path,value,4*1024*1024,options);}
function validateIndexShape(value){exact(value,['schema','files'],'COPY_INDEX');requireValue(value.schema==='copy-index-v1'&&Array.isArray(value.files)&&value.files.length<=10000,'COPY_INDEX_HASH');sized(value,4*1024*1024);}
async function publishSized(path,value,limit,{syncDirectory:sync=syncDirectory}={}){
 path=resolve(path);const dir=await assertPath(dirname(path));requireValue(basename(path)!=='.'&&basename(path)!=='..','RECOVERY_FILENAME');
 const bytes=sized(value,limit),tmp=join(dir,'.'+basename(path)+'.'+randomUUID()+'.tmp');let h,published=false;
 try{h=await open(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);await h.writeFile(bytes);await h.sync();await h.close();h=null;try{await link(tmp,path);published=true;}catch(e){if(e.code==='EEXIST')throw Error('IMMUTABLE_EXISTS');throw e;}await sync(dir);await readSized(path,sha256(bytes),limit);return{sha256:sha256(bytes),bytes:bytes.length};}
 finally{await h?.close().catch(()=>{});if(published)await unlink(tmp);else if(await lstat(tmp).then(()=>true,()=>false))await unlink(tmp);}
}
export async function readImmutable(path,expectedHash){return readSized(path,expectedHash,LIMIT);}
export async function readCopyIndex(path,expectedHash){const value=await readSized(path,expectedHash,4*1024*1024);validateIndexShape(value);return value;}
async function readSized(path,expectedHash,limit){
 path=resolve(path);await assertPath(dirname(path));requireValue(HASH.test(expectedHash),'EXPECTED_CUSTODY_HASH_REQUIRED');const s=await lstat(path);requireValue(s.isFile()&&!s.isSymbolicLink()&&s.size<=limit,'CUSTODY_FILE');if(process.platform!=='win32')requireValue(s.uid===process.getuid()&&(s.mode&0o077)===0,'CUSTODY_ACCESS');
 const h=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const b=await h.readFile();requireValue(sha256(b)===expectedHash,'CUSTODY_HASH_MISMATCH');const value=JSON.parse(b);sized(value,limit);return value;}finally{await h.close();}
}
/** Verify exact regular-file inventory. No symlink, foreign path, missing or extra file is accepted. */
export async function verifyCopyIndex(root,index,expectedHash){
 root=resolve(root);requireValue(await realpath(root)===root,'COPY_ROOT_SYMLINK');sized(index,4*1024*1024);exact(index,['schema','files'],'COPY_INDEX');requireValue(index.schema==='copy-index-v1'&&Array.isArray(index.files)&&index.files.length<=10000&&sha256(index)===expectedHash,'COPY_INDEX_HASH');
 const wanted=new Map();let total=0;
 for(const f of index.files){exact(f,['path','bytes','sha256'],'COPY_ENTRY');requireValue(typeof f.path==='string'&&f.path.length<=512&&!isAbsolute(f.path)&&!f.path.includes('\\')&&!f.path.split('/').some(p=>!p||p==='.'||p==='..')&&!wanted.has(f.path)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&HASH.test(f.sha256),'COPY_PATH');wanted.set(f.path,f);total+=f.bytes;requireValue(total<=2*1024**3,'COPY_SIZE_LIMIT');}
 const seen=new Set();
 async function visit(dir,prefix=''){for(const item of await readdir(dir,{withFileTypes:true})){const rel=prefix+item.name,p=join(dir,item.name);requireValue(!item.isSymbolicLink(),'COPY_SYMLINK');if(item.isDirectory())await visit(p,rel+'/');else{requireValue(item.isFile()&&wanted.has(rel),'COPY_INVENTORY');seen.add(rel);const info=await lstat(p),f=wanted.get(rel);requireValue(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1,'COPY_HARDLINK');requireValue(info.size===f.bytes,'COPY_SIZE');const h=await open(p,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const hasher=createHash('sha256');try{const opened=await h.stat();requireValue(opened.isFile()&&opened.nlink===1&&opened.dev===info.dev&&opened.ino===info.ino&&opened.size===info.size,'COPY_HARDLINK');for await(const b of h.createReadStream({autoClose:false}))hasher.update(b);}finally{await h.close();}requireValue(hasher.digest('hex')===f.sha256,'COPY_HASH');}requireValue(seen.size<=10000,'COPY_FILES_LIMIT');}}
 await visit(root);requireValue(seen.size===wanted.size,'COPY_INVENTORY');return{files:seen.size,bytes:total,sha256:expectedHash};
}
const STAGES=new Set(['source-init','target-begin','enroll','canary','clock-record','proof-central','proof-tenant','close-admission','configure-role','configure-tenant','configure-control','acquire-clock','transfer-clock','verify-tenant','prepare-promotion','open-local','seal-tenant','activate','abort-central','abort-local','abort-complete','journal-replay']);
export function validateStageRecords(records,finalCheckpoint){
 requireValue(Array.isArray(records)&&records.length<=1000&&Buffer.byteLength(canonical(records))<=1024*1024,'STAGE_LIMIT');checkpoint(finalCheckpoint);requireValue(records.length===finalCheckpoint.sequence+1,'STAGE_HEAD_REQUIRED');const intents=new Map(),observed=new Set();let previous='0'.repeat(64);
 for(const [i,r] of records.entries()){
  const keys=r.kind==='intent'?['sequence','kind','operationId','stage','recoveryId','targetHash','expectedHash','afterHash','previousHash','hash']:['sequence','kind','operationId','intentHash','observedHash','endProofHash','previousHash','hash'];exact(r,keys,'STAGE_RECORD');
  const{hash,...body}=r;requireValue(r.sequence===i&&r.previousHash===previous&&HASH.test(hash)&&sha256(body)===hash&&UUID.test(r.operationId),'STAGE_CHAIN');
  if(r.kind==='intent'){requireValue(STAGES.has(r.stage)&&UUID.test(r.recoveryId)&&[r.targetHash,r.expectedHash,r.afterHash].every(x=>HASH.test(x))&&!intents.has(r.operationId),'STAGE_INTENT');intents.set(r.operationId,r);}else{const intent=intents.get(r.operationId);requireValue(r.kind==='observed'&&intent&&r.intentHash===intent.hash&&r.observedHash===intent.afterHash&&HASH.test(r.endProofHash)&&!observed.has(r.operationId),'STAGE_OBSERVATION');observed.add(r.operationId);}previous=hash;
 }
 requireValue(previous===finalCheckpoint.hash,'STAGE_HEAD_REQUIRED');return{pending:[...intents.values()].filter(i=>!observed.has(i.operationId)),intents:[...intents.values()],checkpoint:finalCheckpoint};
}
