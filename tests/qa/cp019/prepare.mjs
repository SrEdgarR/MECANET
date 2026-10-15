// New, exclusive source only. Imports are passive; no .env, random material or reset.
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {validateMaterial} from '../../../server/saas/recovery/custody.js';
import {sha256,publishImmutable} from '../../../server/saas/recovery/protocol.js';
import {prepareQaCluster,validateRolePasswords} from './fixture.mjs';
import {applyWriterMigration,applyCorrectiveMigrations} from './migrate.mjs';
import {profile} from '../../../server/saas/admission/policy.js';

const sourceProject='mecanet-qa-p1l3-r03';
const privatePaths=new Set(['/run/qa-secrets/api.json','/run/qa-secrets/worker.json','/run/qa-secrets/material.json','/run/qa-secrets/source-foundation.json','/run/qa-secrets/source-writers.json','/run/qa-secrets/source-correctives.json','/run/qa-secrets/acceptance.json']);
export function assertPrivateMetadata(stat){
 if(!stat?.isFile()||stat.isSymbolicLink?.()||stat.size<2||stat.size>262144||(stat.mode&0o777)!==0o400)throw Error('QA_PRIVATE_FILE_REQUIRED');
}
export async function readPrivateJson(path){
 if(!privatePaths.has(path))throw Error('QA_PRIVATE_PATH_REQUIRED');
 const before=await lstat(path);assertPrivateMetadata(before);
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const stat=await handle.stat();assertPrivateMetadata(stat);if(stat.ino!==before.ino||stat.dev!==before.dev)throw Error('QA_PRIVATE_FILE_CHANGED');const bytes=await handle.readFile();if(bytes.length!==stat.size)throw Error('QA_PRIVATE_FILE_CHANGED');return {value:JSON.parse(bytes.toString('utf8')),bytes,sha256:sha256(bytes)}}finally{await handle.close()}
}
export function validatePreparation(value){
 if(!value||value.project!==sourceProject||!['foundation','writers','correctives'].includes(value.stage))throw Error('CP019_FRESH_SOURCE_REQUIRED');return value;
}
export async function seedAdmissionSource(client,{generation,clockOwner,tenantIds}){
 const exact=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
 if(JSON.stringify(tenantIds)!==JSON.stringify(exact))throw Error('QA_SOURCE_ROSTER_REQUIRED');
 const common={qt60:60*1024*1024,qt1:12*1024*1024,logicalBytes:0};
 const rows=[['global',{...common,active:8,waiting:48,qh60:600,qh1:100,qc60:1200,qc1:200}],['lane:ordinary',{...common,active:6,waiting:40,qh60:480,qh1:80,qc60:1080,qc1:160}],['lane:essential',{...common,active:1,waiting:4,qh60:60,qh1:10,qc60:60,qc1:20}],['lane:demo',{...common,active:1,waiting:4,qh60:60,qh1:10,qc60:60,qc1:20}],['entry:auth',{...common,active:2,waiting:16,qh60:120,qh1:20,qc60:120,qc1:120,qt60:120*65536,qt1:120*65536}],['entry:operator',{...common,active:2,waiting:8,qh60:60,qh1:10,qc60:60,qc1:60,qt60:60*65536,qt1:60*65536}]];
 for(const id of exact)rows.push([`tenant:${id}`,profile('essential')],[`tenant:${id}:ordinary`,profile('essential','ordinary')],[`tenant:${id}:essential`,profile('essential','essential')]);rows.push([`tenant:${exact[2]}:demo`,profile('essential')]);
 // Same synthetic limits as the original fixture, two bound atomic statements.
 // No reduced freshness/quota, change of roles or hidden additional driver call.
 await client.query("WITH seeded AS (INSERT INTO saas.policies(scope_key,version,limits,base_limits) SELECT scope,1,limits,limits FROM jsonb_to_recordset($1::jsonb) AS x(scope text,limits jsonb) RETURNING scope_key) INSERT INTO saas.admission_scopes(scope_key) SELECT scope_key FROM seeded",[JSON.stringify(rows.map(([scope,limits])=>({scope,limits})))]);
 await client.query('WITH fence AS (INSERT INTO saas.admission_fence(id,generation,tick,clock_version,barrier) VALUES(1,$1,0,0,true) RETURNING generation,tick,clock_version) INSERT INTO saas.time_authority(id,owner,generation,tick,clock_version) SELECT 1,$2,generation,tick,clock_version FROM fence',[generation,clockOwner]);
}
/** The controller must publish the material before calling this, and pass its
 * immutable SHA as the external anchor. Missing budgets fail before any SQL. */
export async function prepareSource({materialBytes,custodyHash,ca,expectedSystemIdentifier,sourceCommit,stage,onCommand,foundation,checkpoint}={}){
 const material=validateMaterial(JSON.parse(Buffer.from(materialBytes??[]).toString('utf8'))),source=material.source;
 validatePreparation({project:source.project,stage});validateRolePasswords(source.rolePasswords);
 if(!/^[0-9a-f]{64}$/.test(custodyHash??'')||sha256(materialBytes)!==custodyHash||!/^[0-9a-f]{40}$/.test(sourceCommit??'')||typeof ca!=='string'||!ca||!/^\d{10,24}$/.test(expectedSystemIdentifier??'')||typeof onCommand!=='function')throw Error('QA_PREPARATION_BINDING_REQUIRED');
 const adminConnection={host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password:source.rolePasswords.qa_bootstrap,ssl:{ca,servername:'postgres',rejectUnauthorized:true}};
 if(stage==='foundation'){
  const result=await prepareQaCluster({preflight:{project:sourceProject,dataClass:'synthetic',allowBootstrap:true,expectedHost:'postgres',expectedSystemIdentifier},adminConnection,passwordHash:source.identityPasswordHash,rolePasswords:source.rolePasswords,onCommand,
   admissionSql:(await readFile(new URL('../../../server/saas/admission/schema.sql',import.meta.url),'utf8'))+'\n'+await readFile(new URL('../../../server/saas/admission/maintenance.sql',import.meta.url),'utf8'),observationSql:await readFile(new URL('../../../server/saas/observability/schema.sql',import.meta.url),'utf8'),
   admissionSeed:(client,args)=>seedAdmissionSource(client,{...args,generation:source.generation,clockOwner:source.seedClockOwner})});
  return {...result,generation:source.generation,clockOwner:source.seedClockOwner,project:source.project,custodyHash};
 }
 if(!foundation||foundation.project!==sourceProject||foundation.generation!==source.generation||foundation.custodyHash!==custodyHash||foundation.systemIdentifier!==expectedSystemIdentifier||!foundation.fixture||!foundation.entries)throw Error('QA_FOUNDATION_PROVENANCE_REQUIRED');
 for(const [role,c]of Object.entries(foundation.connections??{}))if(c.user!==role||c.password!==source.rolePasswords[role]||c.host!=='postgres'||c.ssl?.ca!==ca||c.ssl?.rejectUnauthorized!==true)throw Error('QA_FOUNDATION_CREDENTIAL_MISMATCH');
 if(stage==='correctives'){
  if(!foundation.writerEntries||!foundation.maintenanceEntries||!Array.isArray(foundation.manifest)||foundation.manifest.length!==3)throw Error('QA_WRITERS_PROVENANCE_REQUIRED');
  const correctives=await applyCorrectiveMigrations({adminConnection,fixture:foundation.fixture,generation:source.generation,onCommand,checkpoint,sourceCommit});return {...foundation,correctiveManifest:correctives};
 }
 const migrated=await applyWriterMigration({adminConnection,fixture:foundation.fixture,generation:source.generation,connections:foundation.connections,entries:foundation.entries,rolePasswords:source.rolePasswords,onCommand,checkpoint,sourceCommit});
 return {...foundation,...migrated};
}
export async function main(){
 const {project,stage}={project:process.env.QA_PROJECT,stage:process.env.QA_STAGE};validatePreparation({project,stage});
 const {bytes,sha256:custodyHash}=await readPrivateJson('/run/qa-secrets/material.json');
 const {newLedger}=await import('./ledger.mjs');const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:'prepare-'+stage});
 const foundation=stage==='writers'?(await readPrivateJson('/run/qa-secrets/source-foundation.json')).value:stage==='correctives'?(await readPrivateJson('/run/qa-secrets/source-writers.json')).value:undefined;
 const result=await prepareSource({materialBytes:bytes,custodyHash,ca:await readFile('/run/qa-ca.crt','utf8'),expectedSystemIdentifier:(await readFile('/run/qa-system-id','utf8')).trim(),sourceCommit:process.env.QA_CODE_SHA,stage,onCommand:()=>ledger.charge('sql'),foundation});
 await ledger.charge('artifactFiles');await publishImmutable('/run/qa-secrets/source-'+stage+'.json',result);
 console.log(JSON.stringify({type:'cp019-source-prepared',stage,project,generation:result.generation,secretOutput:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({type:'cp019-prepare-failed',code:'QA_PREPARATION_FAILED',secretOutput:false}));process.exitCode=1});
