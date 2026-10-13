// Corrective v5 for the approved original-ticket invariant. Own CLOSED QA only.
// No APIs, promotion, secret rotation, new roles, quota reset or business DML.
import assert from 'node:assert/strict';
import {readFile,open,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {validateCorrectiveProof} from './corrective.mjs';
import {validatePromotionHostProof} from './promotion.mjs';
import {sanitizeSqlFailure} from './sql-live.mjs';
const PROJECT='mecanet-qa-p1l2-cp017',A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const DATABASES=['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'];
const hash=value=>createHash('sha256').update(value).digest('hex'),fail=code=>{throw Object.assign(Error(code),{code})};
const source=name=>new URL(`../../../server/saas/db/migrations/${name}`,import.meta.url);
export const CLAIM_CORRECTIVE_PLAN=Object.freeze({project:PROJECT,version:5,phases:['fault-before-registry','apply','rerun'],scope:'CREATE OR REPLACE claim_write_intent same five-argument signature only',allWritersClosed:true,zeroSaasClients:true,businessMutations:0,permissionChanges:0,newRoles:0,opensResources:0,maxRuntimeMs:45000,maxQueries:450,maxTablesPerDatabase:64,poolPerDatabase:1,maxDatabases:3,statementMs:2000,lockMs:500,fault:'after DDL before registry INSERT; require acknowledged ROLLBACK plus exact pre/post snapshots',data:'server-side JSONB text hashes central/session_store/A/B, counters and old registry; no row contents returned',preservation:'roles, memberships, schemas, DB/table/column/default ACLs, every function except intended body; claim owner/ACL/config/SECDEF/return contract unchanged',HTTP:false});
export function claimSourceBodyHash(sql){
 const match=String(sql).match(/(?:CREATE(?: OR REPLACE)? FUNCTION) saas\.claim_write_intent\([^]*? AS \$\$([^]*?)\$\$;/);
 if(!match)fail('CLAIM_CORRECTIVE_SOURCE_FUNCTION_REQUIRED');return hash(match[1]);
}
export function validateClaimCorrectiveProof({adminConnection,qa,proof,operational,sourceCommit,now}){
 const admin=validateCorrectiveProof({adminConnection,qa,proof,sourceCommit,...(now===undefined?{}:{now})});
 validatePromotionHostProof({proof:operational,qa,sourceSha:sourceCommit});
 if(operational.workerStopped!==true||operational.webStopped!==true||new Set(operational.apis.map(p=>p.containerId)).size!==2)fail('CLAIM_CORRECTIVE_OPERATIONAL_END_REQUIRED');
 for(const p of proof.apis){const end=operational.apis.find(a=>a.instance===p.instance);if(!end||end.containerId!==p.containerId||end.stoppedSourceSha!==p.stoppedSourceSha)fail('CLAIM_CORRECTIVE_PROCESS_PROOF_MISMATCH')}
 return admin;
}
export function assertClaimCorrectionPreserved(before,after,{changed=false,targetBodyHash}={}){
 for(const db of DATABASES){assert.deepEqual(after[db].data,before[db].data);assert.deepEqual(after[db].security,before[db].security);assert.deepEqual(after[db].otherFunctions,before[db].otherFunctions);assert.deepEqual(after[db].fence,before[db].fence);assert.deepEqual(after[db].quota,before[db].quota);assert.deepEqual(after[db].oldRegistry,before[db].oldRegistry)}
 assert.deepEqual(after.mecanet_control.claim.metadata,before.mecanet_control.claim.metadata);
 assert.equal(after.mecanet_control.claim.bodyHash,changed?targetBodyHash:before.mecanet_control.claim.bodyHash);
 return true;
}
async function durable(path,value){const h=await open(path,'w',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync()}finally{await h.close()}}
async function trusted(path){const info=await stat(path);if(!info.isFile()||(info.mode&0o777)!==0o400)fail('CLAIM_CORRECTIVE_READ_ONLY_PROOF_REQUIRED');return JSON.parse(await readFile(path,'utf8'))}
const sqlDigest=expression=>`encode(sha256(convert_to((${expression})::text,'UTF8')),'hex')`;
export async function runClaimCorrective(){
 const sourceCommit=process.env.QA_CODE_SHA;if(process.env.QA_PROJECT!==PROJECT||!/^[a-f0-9]{40}$/.test(sourceCommit??''))fail('CLAIM_CORRECTIVE_EXACT_SOURCE_REQUIRED');
 const started=performance.now(),report={project:PROJECT,sourceCommit,observedAt:new Date().toISOString(),status:'PREREGISTERED / NOT VERIFIED',plan:CLAIM_CORRECTIVE_PLAN,harnessHash:hash(await readFile(new URL(import.meta.url))),phases:[],secretsPrinted:false};
 await durable('/run/qa-results/claim-corrective-plan.json',report);
 const [qa,proof,operational,ca,password]=await Promise.all([readFile('/run/qa-secrets/connections.json','utf8').then(JSON.parse),trusted('/run/qa-results/corrective-proof.json'),trusted('/run/qa-results/operational-host-proof.json'),readFile('/run/qa-ca.crt','utf8'),readFile('/run/qa-secrets/bootstrap','utf8')]);
 const admin=validateClaimCorrectiveProof({adminConnection:{host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password,ssl:{ca,servername:'postgres',rejectUnauthorized:true}},qa,proof,operational,sourceCommit});
 const files=['003-control-writers.sql','003-tenant-writers.sql','004-tenant-writers-fix.sql','005-control-claim-ticket.sql'],bytes=await Promise.all(files.map(f=>readFile(source(f)))),hashes=Object.fromEntries(files.map((f,n)=>[f,hash(bytes[n])])),oldBody=claimSourceBodyHash(bytes[0]),newBody=claimSourceBodyHash(bytes[3]);
 report.sourceHashes=hashes;
 const pools=new Map();let queries=0;
 const bounded=()=>{if(++queries>CLAIM_CORRECTIVE_PLAN.maxQueries||performance.now()-started>CLAIM_CORRECTIVE_PLAN.maxRuntimeMs)fail('CLAIM_CORRECTIVE_ENVELOPE_EXCEEDED')};
 const poolFor=async database=>{if(!DATABASES.includes(database))fail('CLAIM_CORRECTIVE_FIXED_DATABASE_REQUIRED');if(!pools.has(database))pools.set(database,await createPgPool({...admin,database,max:1,connectionTimeoutMillis:1500,statement_timeout:2000,lock_timeout:500,idle_in_transaction_session_timeout:2000,application_name:'mecanet-private-claim-corrective-v5'}));return pools.get(database)};
 const command=async(c,text,values=[])=>{bounded();return c.query({text,values,query_timeout:2000})};
 const read=async(database,fn)=>{const c=await(await poolFor(database)).connect();let ended=false;try{await command(c,'BEGIN READ ONLY');const result=await fn(c);await command(c,'COMMIT');ended=true;return result}finally{if(!ended)ended=await c.query('ROLLBACK').then(()=>true,()=>false);c.release(!ended)}};
 const observe=async(database,text,values=[])=>read(database,async c=>(await command(c,text,values)).rows);
 async function closed(){
  const env=(await observe('mecanet_control',"SELECT current_setting('server_version_num') AS version,current_setting('server_encoding') AS encoding,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT system_identifier::text FROM pg_control_system()) AS system_id,(SELECT generation FROM saas.admission_fence WHERE id=1) AS generation,(SELECT count(*)::int FROM pg_stat_activity WHERE usename LIKE 'saas_%') AS saas_clients"))[0];
  assert.equal(env.version,'180006');assert.equal(env.encoding,'UTF8');assert.equal(env.tls,true);assert.equal(env.system_id,qa.systemIdentifier);assert.equal(env.generation,qa.generation);assert.equal(env.saas_clients,0);
  const states=await observe('mecanet_control','SELECT * FROM saas.tenant_writer_state ORDER BY tenant_id');assert.deepEqual(states.map(s=>s.tenant_id),[A,B]);
  for(const [n,s]of states.entries()){assert.equal(s.state,'CLOSED');assert.equal(s.generation,qa.generation);const local=(await observe(DATABASES[n+1],'SELECT * FROM inventory.writer_fence WHERE id=1'))[0];assert.equal(local.tenant_id,s.tenant_id);for(const k of ['generation','data_epoch','writer_version','state'])assert.equal(local[k],s[k])}
 }
 async function snapshot(database){return read(database,async c=>{
  const control=database==='mecanet_control',schemas=control?['saas','session_store']:['catalog','inventory'];
  const tables=(await command(c,"SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1::text[]) AND tablename<>'schema_migrations' ORDER BY schemaname,tablename",[schemas])).rows;
  if(!tables.length||tables.length>CLAIM_CORRECTIVE_PLAN.maxTablesPerDatabase||tables.some(t=>!schemas.includes(t.schemaname)||!/^[a-z][a-z0-9_]{0,62}$/.test(t.tablename)))fail('CLAIM_CORRECTIVE_TABLE_SCOPE_REQUIRED');
  const rows=tables.map(t=>`SELECT '${t.schemaname}.${t.tablename}' AS name,jsonb_build_object('n',count(*)::text,'hash',${sqlDigest("coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]')")}) AS value FROM ${t.schemaname}.${t.tablename} r`);
  const data=(await command(c,`SELECT jsonb_object_agg(name,value ORDER BY name) AS value FROM (${rows.join(' UNION ALL ')}) tables`)).rows[0].value;
  const security=(await command(c,`SELECT ${sqlDigest("jsonb_build_object('roles',(SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'super',r.rolsuper,'inherit',r.rolinherit,'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'replication',r.rolreplication,'bypass',r.rolbypassrls,'connections',r.rolconnlimit,'validUntil',r.rolvaliduntil) ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname LIKE 'saas_%' OR r.rolname='qa_bootstrap'),'membership',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor) FROM pg_auth_members m),'databases',(SELECT jsonb_agg(jsonb_build_object('name',d.datname,'owner',d.datdba::text,'acl',d.datacl::text) ORDER BY d.datname) FROM pg_database d WHERE d.datname IN('mecanet_control','mecanet_tenant_a','mecanet_tenant_b')),'schemas',(SELECT jsonb_agg(jsonb_build_object('name',n.nspname,'owner',n.nspowner::text,'acl',n.nspacl::text) ORDER BY n.nspname) FROM pg_namespace n WHERE n.nspname=ANY($1::text[])),'tables',(SELECT jsonb_agg(jsonb_build_object('name',n.nspname||'.'||r.relname,'owner',r.relowner::text,'acl',r.relacl::text) ORDER BY n.nspname,r.relname) FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname=ANY($1::text[])),'columns',(SELECT jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||r.relname,'column',a.attname,'acl',a.attacl::text) ORDER BY n.nspname,r.relname,a.attnum) FROM pg_attribute a JOIN pg_class r ON r.oid=a.attrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped),'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d))")} AS value`,[schemas])).rows[0].value;
  const otherFunctions=(await command(c,`SELECT ${sqlDigest("coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'owner',p.proowner::text,'acl',p.proacl::text,'config',p.proconfig,'definition',pg_get_functiondef(p.oid)) ORDER BY p.oid),'[]')")} AS value FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY($1::text[]) AND NOT(p.proname='claim_write_intent' AND n.nspname='saas')`,[schemas])).rows[0].value;
  const oldRegistry=(await command(c,`SELECT version,source_hash,source_commit,applied_at::text FROM ${control?'saas':'catalog'}.schema_migrations WHERE version<>5 ORDER BY version`)).rows;
  const result={data,security,otherFunctions,oldRegistry};
  if(control){
   result.fence=(await command(c,'SELECT * FROM saas.tenant_writer_state ORDER BY tenant_id')).rows;result.quota=(await command(c,'SELECT * FROM saas.write_control_quota WHERE id=1')).rows;
   const functionRow=(await command(c,"SELECT p.proowner::text,p.proacl::text,p.proconfig,p.prosecdef,p.proretset,p.prorettype::text,r.rolcanlogin,r.rolsuper,r.rolbypassrls,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS body_hash FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='saas.claim_write_intent(uuid,uuid,text,uuid,uuid)'::regprocedure")).rows[0];
   if(!functionRow||functionRow.rolcanlogin||functionRow.rolsuper||functionRow.rolbypassrls||!functionRow.prosecdef||!functionRow.proretset||!functionRow.proconfig?.includes('search_path=pg_catalog, saas'))fail('CLAIM_CORRECTIVE_FUNCTION_OWNER_REQUIRED');
   const {body_hash,...metadata}=functionRow;result.claim={metadata,bodyHash:body_hash};
  }else{result.fence=(await command(c,'SELECT * FROM inventory.writer_fence WHERE id=1')).rows;result.quota=(await command(c,'SELECT q.*,inventory.logical_usage()::text AS actual FROM inventory.quota_state q WHERE id=1')).rows;assert.equal(result.quota[0].logical_bytes,result.quota[0].actual)}
  return result;
 })}
 const wholeSnapshot=async()=>{const value={};for(const database of DATABASES)value[database]=await snapshot(database);return value};
 async function registry(){
  for(const [n,database]of DATABASES.entries()){
   const schema=n===0?'saas':'catalog',rows=await observe(database,`SELECT version,source_hash FROM ${schema}.schema_migrations WHERE version IN(3,4,5) ORDER BY version`);
   if(rows.find(r=>r.version===3)?.source_hash!==hashes[n===0?files[0]:files[1]]||(n>0&&rows.find(r=>r.version===4)?.source_hash!==hashes[files[2]]))fail('CLAIM_CORRECTIVE_PRIOR_HASH_MISMATCH');
   const v5=rows.find(r=>r.version===5);if(v5&&(n>0||v5.source_hash!==hashes[files[3]]))fail('CLAIM_CORRECTIVE_HASH_CONFLICT');
  }
 }
 try{
  await closed();await registry();const initial=await wholeSnapshot();
  report.preservedFingerprints=Object.fromEntries(DATABASES.map(db=>[db,{data:hash(JSON.stringify(initial[db].data)),security:initial[db].security,otherFunctions:initial[db].otherFunctions,fenceAndQuota:hash(JSON.stringify({fence:initial[db].fence,quota:initial[db].quota})),oldRegistry:hash(JSON.stringify(initial[db].oldRegistry))}]));
  report.claimBefore={bodyHash:initial.mecanet_control.claim.bodyHash,metadataHash:hash(JSON.stringify(initial.mecanet_control.claim.metadata))};report.expectedNewBodyHash=newBody;
  const existing=(await observe('mecanet_control','SELECT source_hash FROM saas.schema_migrations WHERE version=5'))[0];if(initial.mecanet_control.claim.bodyHash!==(existing?newBody:oldBody))fail('CLAIM_CORRECTIVE_BODY_PROVENANCE_MISMATCH');
  async function apply({fault=false}={}){
   await closed();const before=await wholeSnapshot(),beforeRegistry=await observe('mecanet_control','SELECT * FROM saas.schema_migrations WHERE version=5'),client=await(await poolFor('mecanet_control')).connect();let ended=false,injected=false,applied=false;
   try{
    await command(client,'BEGIN');await command(client,'SELECT pg_advisory_xact_lock(56321,5)');await command(client,'SET LOCAL ROLE saas_owner');
    const states=(await command(client,"SELECT tenant_id,state FROM saas.tenant_writer_state ORDER BY tenant_id FOR UPDATE")).rows;assert.deepEqual(states,[{tenant_id:A,state:'CLOSED'},{tenant_id:B,state:'CLOSED'}]);
    const row=(await command(client,'SELECT source_hash FROM saas.schema_migrations WHERE version=5 FOR UPDATE')).rows[0];if(row&&row.source_hash!==hashes[files[3]])fail('CLAIM_CORRECTIVE_HASH_CONFLICT');
    if(!row||fault)await command(client,bytes[3].toString('utf8'));
    if(fault)fail('CLAIM_CORRECTIVE_FAULT_AFTER_DDL');
    if(!row){await command(client,'SET LOCAL ROLE saas_owner');await command(client,'INSERT INTO saas.schema_migrations(version,source_hash,source_commit) VALUES(5,$1,$2)',[hashes[files[3]],sourceCommit])}
    await command(client,'COMMIT');ended=true;applied=!row;
   }catch(error){if(fault&&error.code==='CLAIM_CORRECTIVE_FAULT_AFTER_DDL')injected=true;else throw error}
   finally{try{if(!ended){await command(client,'ROLLBACK');ended=true}}finally{client.release(!ended)}}
   // Return the original connection before taking independent read snapshots;
   // each fixed DB has one pool slot, so no inspection may hold that slot.
   if(fault){assert.equal(injected,true);assert.equal(ended,true);const after=await wholeSnapshot();assertClaimCorrectionPreserved(before,after,{changed:false});assert.deepEqual(await observe('mecanet_control','SELECT * FROM saas.schema_migrations WHERE version=5'),beforeRegistry);return{phase:'fault-before-registry',status:'PASS EXPECTED FAULT / ACKNOWLEDGED ROLLBACK',noDataOrBodyChange:true,registryUnchanged:true}}
   const after=await wholeSnapshot();assertClaimCorrectionPreserved(before,after,{changed:true,targetBodyHash:newBody});const version=(await observe('mecanet_control','SELECT source_hash,source_commit FROM saas.schema_migrations WHERE version=5'))[0];assert.equal(version.source_hash,hashes[files[3]]);if(beforeRegistry.length)assert.deepEqual(await observe('mecanet_control','SELECT * FROM saas.schema_migrations WHERE version=5'),beforeRegistry);return{phase:applied?'apply':'rerun',status:'PASS',applied,sourceHash:version.source_hash,registrySourceCommit:version.source_commit,ownerAclSearchPathAndAllDataUnchanged:true};
  }
  report.phases.push(await apply({fault:true}));report.phases.push(await apply());report.phases.push(await apply());await closed();await registry();assertClaimCorrectionPreserved(initial,await wholeSnapshot(),{changed:true,targetBodyHash:newBody});
  report.status='PASS CORRECTIVE CLOSED QA ONLY';report.allWritersRemainClosed=true;report.resourcesOpened=0;report.HTTPVerified=false;report.preservedFingerprintsVerifiedAfterAllPhases=true;
 }catch(error){report.status='FAIL';Object.assign(report,sanitizeSqlFailure(error));if(/^CLAIM_CORRECTIVE_[A-Z0-9_]{1,80}$/.test(error.message??''))report.fixedFailure=error.message;throw error}
 finally{report.durationMs=Math.round(performance.now()-started);report.queries=queries;await durable('/run/qa-results/claim-corrective.json',report);await Promise.all([...pools.values()].map(p=>p.end()));console.log(JSON.stringify(report))}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{await runClaimCorrective()}catch(error){console.log(JSON.stringify({status:'FAIL',...sanitizeSqlFailure(error),secretsPrinted:false}));process.exitCode=1}
