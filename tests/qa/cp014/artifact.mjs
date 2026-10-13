// Build an immutable, file-addressed QA release locally; no .env or private paths.
import {readdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd();const entries=[];
const sha=value=>createHash('sha256').update(value).digest('hex');
async function visit(folder){
 for(const entry of await readdir(path.join(root,folder),{withFileTypes:true})){
  const name=`${folder}/${entry.name}`;
  if(entry.name==='__pycache__')continue;
  if(entry.isDirectory())await visit(name);
  else{
   if(entry.isSymbolicLink()||!entry.isFile()||/(^|\/)(\.env(?:\.|$)|secrets|backup|\.qa-private)(\/|$)/.test(name))throw new Error('ARTIFACT_PATH_REJECTED');
   const contents=await readFile(path.join(root,name));entries.push({path:name,bytes:contents.length,sha256:sha(contents)});
  }
 }
}
await visit('server/saas');await visit('tests/qa');await visit('client/dist-saas');
entries.sort((a,b)=>a.path.localeCompare(b.path,'en'));
const digest=sha(entries.map(e=>`${e.sha256}  ${e.path}\n`).join(''));
const codeSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const modified=execFileSync('git',['status','--porcelain','--','server/saas','tests/qa','client/src/saas'],{encoding:'utf8'}).trim();
if(modified)throw new Error('COMMIT_CODE_BEFORE_ARTIFACT');
const manifest={format:1,digest:`sha256:${digest}`,codeSha,createdAt:new Date().toISOString(),architecture:'linux/arm64',entries,
 runtime:{node:'sha256:ba6b7d0ee561d9d49deb99e2b93c98632cc287b6cca1a6b18d66127054efa4dc',postgres:'sha256:67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129',nginx:'sha256:3abad30db61dfb2a339ea21acc9f3e6bbe78e291fcff2f835f4510c8fdfcbd83'}};
await writeFile('.qa-private/cp014-artifact.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({digest:manifest.digest,codeSha,files:entries.length,bytes:entries.reduce((a,b)=>a+b.bytes,0),manifest:'.qa-private/cp014-artifact.json'}));
