// Private source template builder. Import is passive; there are no PostgreSQL,
// Docker, SSH, random identifiers or environment-secret fallbacks here.
import {lstat,open,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha256,canonical} from '../../../server/saas/recovery/protocol.js';
import {SOURCE_PHASES,makeSourceNormalManifest,validateSourceInputs,createSourceDriver,publishSourceReadonly} from './source-driver.mjs';
import {readPrivateJson} from './prepare.mjs';
import {newLedger} from './ledger.mjs';

const PREFIX='/run/qa-secrets/',NORMAL=PREFIX+'source-normal-manifest.json',RESOURCE=PREFIX+'source-resource.json';
const refuse=(ok,label)=>{if(!ok)throw Error(label)},same=(a,b)=>canonical(a)===canonical(b);
const SOURCE_PROJECT='mecanet-qa-p1l3-r03';
const phasePath=phase=>PREFIX+phase+'.json';
const allowedPaths=new Set([NORMAL,RESOURCE,...SOURCE_PHASES.map(phasePath),...SOURCE_PHASES.flatMap(p=>['select','run'].map(a=>PREFIX+p+'-'+a+'-config.json'))]);
/** Read only an exact private path. No symlink, mode, owner, inode or size fallback. */
export async function readSourceConfigPrivate(path){
 refuse(allowedPaths.has(path),'SOURCE_BUILDER_PATH');const before=await lstat(path);
 refuse(before.isFile()&&!before.isSymbolicLink()&&(before.mode&0o777)===0o400&&before.size>=2&&before.size<=262144&&(process.platform==='win32'||before.uid===process.getuid()),'SOURCE_BUILDER_PRIVATE_FILE');
 const h=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const s=await h.stat();refuse(s.ino===before.ino&&s.dev===before.dev&&s.size===before.size,'SOURCE_BUILDER_FILE_CHANGED');const bytes=await h.readFile();refuse(bytes.length===s.size,'SOURCE_BUILDER_FILE_CHANGED');return{value:JSON.parse(bytes),sha256:sha256(bytes)}}finally{await h.close()}
}
export function validateSourceArtifact(artifact,material,migrationHashes){
 refuse(artifact&&/^[0-9a-f]{40}$/.test(artifact.sourceSha??'')&&artifact.digest==='sha256:'+material.artifactDigest&&Array.isArray(artifact.entries)&&sha256(artifact.entries)===material.artifactDigest,'SOURCE_BUILDER_ARTIFACT');
 for(const [scope,file]of [['central','006-control-recovery.sql'],['tenant','006-tenant-recovery.sql']]){const matches=artifact.entries.filter(e=>e.path==='server/saas/db/migrations/'+file);refuse(matches.length===1&&matches[0].sha256===migrationHashes[scope],'SOURCE_BUILDER_SQL_HASH');}return artifact.sourceSha;
}
/** Exact template only. Root adds a fresh host receipt to a NEW invocation file;
 * this template neither observes processes nor authorizes an ACK by itself. */
export function makeSourceConfig({phase,action,input,plan,planHash,clockPlan}){
 refuse(SOURCE_PHASES.includes(phase)&&['select','run'].includes(action),'SOURCE_BUILDER_PHASE');validateSourceInputs(input);
 const {material,custodyHash,normalManifest,normalManifestHash,resource,sourceCommit}=input;
 const config={phase,action,sourceCommit,normalManifest,normalManifestHash,resource,journal:{file:'/run/qa-journal/source.jsonl',heads:'/run/qa-journal/heads',plans:'/run/qa-journal/plans',create:phase==='source-close-b'&&action==='select'},output:'/run/qa-'+(action==='select'?'secrets':'results')+'/'+phase+'.json'};
 if(action==='run'){
  const deny=()=>{throw Error('SOURCE_BUILDER_NO_SQL')};const driver=createSourceDriver({...input,ledger:{charge:deny},journal:{before:deny,after:deny},observeResources:deny,poolFactory:deny});
  driver.validatePlan(plan,planHash);refuse(plan.phase===phase,'SOURCE_BUILDER_PLAN_PHASE');config.plan=plan;config.planHash=planHash;
  if(phase==='source-clock-ack'){refuse(clockPlan?.phase==='source-clock-plan'&&clockPlan.custodyHash===custodyHash&&clockPlan.normalManifestHash===normalManifestHash&&clockPlan.runId===material.source.normal.runId,'SOURCE_BUILDER_CLOCK_PLAN');driver.validatePlan(clockPlan,sha256(clockPlan));config.clockPlan=clockPlan;}
 }
 return JSON.parse(canonical(config));
}
async function publishOrMatch(path,value,ledger){
 try{const existing=await readSourceConfigPrivate(path);refuse(same(existing.value,value),'SOURCE_BUILDER_IMMUTABLE_CONFLICT');return existing.sha256;}catch(error){if(error.code!=='ENOENT')throw error;}
 await ledger.charge('artifactFiles');return(await publishSourceReadonly(path,value)).sha256;
}
export async function main(){
 const [phase,action]=process.argv.slice(2);refuse(process.argv.length===4&&process.env.QA_PROJECT===SOURCE_PROJECT&&SOURCE_PHASES.includes(phase)&&['select','run'].includes(action),'SOURCE_BUILDER_CLI');
 const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:'source-window'});await ledger.enter(phase);
 const {value:material,sha256:custodyHash}=await readPrivateJson(PREFIX+'material.json');
 const foundation=(await readPrivateJson(PREFIX+'source-foundation.json')).value,writers=(await readPrivateJson(PREFIX+'source-writers.json')).value,correctives=(await readPrivateJson(PREFIX+'source-correctives.json')).value;
 const resource=(await readSourceConfigPrivate(RESOURCE)).value;
 const [central,tenant]=await Promise.all([readFile(new URL('../../../server/saas/db/migrations/006-control-recovery.sql',import.meta.url)),readFile(new URL('../../../server/saas/db/migrations/006-tenant-recovery.sql',import.meta.url))]);
 const migrationHashes={central:sha256(central),tenant:sha256(tenant)},artifact=JSON.parse(await readFile('/workspace/artifact.json','utf8')),sourceCommit=validateSourceArtifact(artifact,material,migrationHashes);
 const normalManifest=makeSourceNormalManifest({material,custodyHash,resource,migrationHashes,sourceCommit}),normalManifestHash=sha256(normalManifest);
 // The first publication is fixed before SQL. Later phases load/match it; no
 // replacement, recaptured version or additional choice is permitted on retry.
 if(phase==='source-close-b'&&action==='select')await publishOrMatch(NORMAL,normalManifest,ledger);
 else refuse(same((await readSourceConfigPrivate(NORMAL)).value,normalManifest),'SOURCE_BUILDER_NORMAL_CONFLICT');
 const input={material,custodyHash,foundation,writers,correctives,sourceCommit,normalManifest,normalManifestHash,resource};let plan,planHash,clockPlan;
 if(action==='run'){const saved=await readSourceConfigPrivate(phasePath(phase));plan=saved.value;planHash=saved.sha256;if(phase==='source-clock-ack')clockPlan=(await readSourceConfigPrivate(phasePath('source-clock-plan'))).value;}
 const config=makeSourceConfig({phase,action,input,plan,planHash,clockPlan}),configHash=await publishOrMatch(PREFIX+phase+'-'+action+'-config.json',config,ledger);
 console.log(JSON.stringify({type:'cp019-source-config',phase,action,configHash,normalManifestHash,secretOutput:false,physicalCohortAcceptance:'NOT VERIFIED'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({type:'cp019-source-config-failed',code:'SOURCE_CONFIG_FAILED',secretOutput:false}));process.exitCode=1});
