// Root publishes these exact inputs once. Their mount must be separately RO;
// the mutable budget directory cannot supply or replace its own authority.
import {constants} from 'node:fs';import {open,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {canonical} from '../../../server/saas/recovery/protocol.js';
const ROOT='/run/qa-budget-authority',HASH=/^[0-9a-f]{64}$/;
const check=(ok,label)=>{if(!ok)throw Error(label)};
async function privateRead(path){
 const before=await lstat(path);check(await realpath(path)===path&&before.isFile()&&!before.isSymbolicLink()&&before.uid===0&&(before.mode&0o777)===0o444&&before.nlink===1&&before.size>=2&&before.size<=262144,'CONTINUATION_AUTHORITY_CUSTODY');
 const identity=s=>[s.dev,s.ino,s.mode,s.uid,s.nlink,s.size,s.mtimeMs,s.ctimeMs].join(','),fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{check(identity(await fd.stat())===identity(before),'CONTINUATION_AUTHORITY_CHANGED');const raw=await fd.readFile();check(raw.length===before.size&&identity(await fd.stat())===identity(before)&&identity(await lstat(path))===identity(before),'CONTINUATION_AUTHORITY_CHANGED');return raw}finally{await fd.close()}
}
export async function readContinuationAuthority(env=process.env){
 check(env.QA_BUDGET_ATTEMPT==='v2'&&HASH.test(env.QA_BUDGET_ADMISSION_HASH??''),'CONTINUATION_ENV_REQUIRED');
 const directory=await lstat(ROOT);check(await realpath(ROOT)===ROOT&&directory.isDirectory()&&!directory.isSymbolicLink()&&directory.uid===0&&(directory.mode&0o777)===0o555,'CONTINUATION_AUTHORITY_DIRECTORY');
 const raw=await privateRead(ROOT+'/admission.json'),admission=JSON.parse(raw),baseLedger=await privateRead(ROOT+'/v1-ledger.json');
 check(createHash('sha256').update(raw).digest('hex')===env.QA_BUDGET_ADMISSION_HASH&&raw.equals(Buffer.from(canonical(admission))),'CONTINUATION_ADMISSION_HASH');
 return {baseLedger,baseLedgerHash:admission.parentLedgerHash,admission,admissionHash:env.QA_BUDGET_ADMISSION_HASH};
}
export async function readContinuationArtifactFile(name){
 check(['runtime-overlay.json','original-artifact.json'].includes(name),'CONTINUATION_ARTIFACT_SCOPE');return privateRead(ROOT+'/'+name);
}
export async function readContinuationEffectiveArtifact(){return privateRead('/workspace/artifact.json')}
