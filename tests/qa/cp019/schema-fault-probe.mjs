import {CASE_LIMITS,GLOBAL_LIMITS} from './budget-limits.mjs';
// Own SOURCE only. Actual006 is interrupted inside its existing transaction;
// neither an interruption nor an uncertain END authorizes continuation/opening.
import {readFile,lstat,open,realpath} from 'node:fs/promises';import {constants} from 'node:fs';
import {uptime} from 'node:os';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {canonical,sha256} from '../../../server/saas/recovery/protocol.js';
import {validateMaterial} from '../../../server/saas/recovery/custody.js';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {applyRecoveryMigration} from './control.mjs';
import {makeSourceNormalManifest,publishSourceReadonly} from './source-driver.mjs';
import {newLedger} from './ledger.mjs';
export const SCHEMA_PROBE_BUDGET=Object.freeze({pre:75,post:9,total:84});
const ARCHIVED_L2_COMPONENT=Object.freeze({baseSha:'86985fe7589032f202ebf0cb057a9b1384217151',sourcePath:'server/saas/db/pools.js',sha256:'b8eebead8655a0b6eae42df6d923d119ca2648457175e43d80e6e28ef4fb76f3'});
const H=/^[0-9a-f]{64}$/,S=/^[0-9a-f]{40}$/,A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const check=(ok,code)=>{if(!ok)throw Error(code)},same=(a,b)=>canonical(a)===canonical(b),copy=x=>JSON.parse(canonical(x));
const faultError=point=>Object.assign(Error('SCHEMA_FAULT_INJECTED'),{point});
function snapshotSql(central){
 const namespace=central?'saas':'catalog';
 // Relation/column/function/constraint/ACL and registry images contain no
 // verifier/password. The same projection is compared before/after ROLLBACK.
 const catalog=`SELECT 'class' AS kind,to_jsonb(c) AS value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('saas','catalog','inventory')
 UNION ALL SELECT 'attribute',to_jsonb(a) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('saas','catalog','inventory')
 UNION ALL SELECT 'proc',to_jsonb(p) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('saas','catalog','inventory')
 UNION ALL SELECT 'constraint',to_jsonb(c) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN('saas','catalog','inventory')
 UNION ALL SELECT 'default_acl',to_jsonb(a) FROM pg_default_acl a
 UNION ALL SELECT 'namespace',to_jsonb(n) FROM pg_namespace n WHERE n.nspname IN('saas','catalog','inventory')
 UNION ALL SELECT 'registry',to_jsonb(m) FROM ${namespace}.schema_migrations m`;
 return`SELECT /* cp020-schema-fault-state */ current_user AS role,current_database() AS database,host(inet_server_addr()) AS server_address,(SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,current_setting('server_version_num') AS version,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,current_setting('transaction_read_only') AS read_only,
 ${central?"(SELECT generation FROM saas.admission_fence WHERE id=1)":"(SELECT generation FROM inventory.writer_fence WHERE id=1)"} AS generation,
 ${central?"(SELECT barrier FROM saas.admission_fence WHERE id=1)":"NULL::boolean"} AS barrier,
 ${central?"(SELECT owner FROM saas.time_authority WHERE id=1)":"NULL::uuid"} AS clock_owner,
 ${central?"(SELECT clock_version::text FROM saas.time_authority WHERE id=1)":"NULL::text"} AS clock_version,
 ${central?"(SELECT tick::text FROM saas.time_authority WHERE id=1)":"NULL::text"} AS tick,
 (SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND(usename LIKE 'saas_%' OR usename='qa_bootstrap')) AS consumers,
 (SELECT encode(sha256(convert_to(coalesce(string_agg(kind||value::text,'|' ORDER BY kind,value::text),''),'UTF8')),'hex') FROM(${catalog})s) AS fingerprint,
 (SELECT source_hash FROM ${namespace}.schema_migrations WHERE version=6) AS migration6,(SELECT source_commit FROM ${namespace}.schema_migrations WHERE version=6) AS registered_source,
 ${central?"(SELECT jsonb_agg(schema_version ORDER BY id) FROM saas.tenant_directory WHERE purpose='company')":"NULL::jsonb"} AS schemas,
 to_regclass('${central?'saas.recovery_runs':'inventory.recovery_guard'}') IS NOT NULL AS recovery_present,
 ${central?"EXISTS(SELECT 1 FROM saas.tenant_directory d JOIN saas.tenant_writer_state w ON w.tenant_id=d.id WHERE d.id='"+B+"'::uuid AND d.status='blocked' AND w.state='CLOSED')":"current_database()<>'mecanet_tenant_b' OR (SELECT state='CLOSED' FROM inventory.writer_fence WHERE id=1)"} AS b_closed,
 ${central?"(SELECT q.used_bytes=(SELECT coalesce(sum(saas.write_operation_cost(tenant_id,operation_id)),0) FROM saas.write_intents) FROM saas.write_control_quota q WHERE id=1)":"(SELECT logical_bytes=inventory.logical_usage() FROM inventory.quota_state WHERE id=1)"} AS logical_consistent`;
}
export async function runSchemaFaultProbe(input,{mode,ledger,poolFactory=createPgPool,observeResources,publishPlan,now=()=>performance.now(),endTimeoutMs=2000}={}){
 const x=copy(input),m=validateMaterial(x.material),r=x.resource,started=now();
 check(Object.hasOwn(SCHEMA_PROBE_BUDGET,mode)&&mode!=='total','SCHEMA_PROBE_MODE');
 check(x.custodyHash===sha256(m)&&S.test(x.sourceSha??'')&&typeof observeResources==='function'&&typeof publishPlan==='function'&&typeof ledger?.snapshot==='function'&&typeof ledger?.enter==='function'&&typeof ledger?.charge==='function'&&Number.isInteger(endTimeoutMs)&&endTimeoutMs>0&&endTimeoutMs<=2000,'SCHEMA_PROBE_BINDING');
 const bytes=Object.fromEntries(await Promise.all(['central','tenant'].map(async scope=>[scope,await readFile(new URL('../../../server/saas/db/migrations/006-'+(scope==='central'?'control':'tenant')+'-recovery.sql',import.meta.url))])));
 check(same(Object.keys(x.migrationHashes??{}).sort(),['central','tenant'])&&Object.entries(bytes).every(([k,v])=>sha256(v)===x.migrationHashes[k]),'SCHEMA_PROBE_MIGRATION_HASH');
 // Import the very bytes checked here. A newer manager with an old allowlist
 // would not establish the behavior of the archived L2 component.
 let archivedManager;if(mode==='post'){const oldBytes=await readFile(new URL('./archived-l2-pools.mjs',import.meta.url));check(sha256(oldBytes)===ARCHIVED_L2_COMPONENT.sha256,'SCHEMA_PROBE_ARCHIVED_COMPONENT_HASH');archivedManager=(await import('data:text/javascript;base64,'+oldBytes.toString('base64'))).createTenantPoolManager;}
 makeSourceNormalManifest({material:m,custodyHash:x.custodyHash,resource:r,migrationHashes:x.migrationHashes,sourceCommit:x.sourceSha});
 const c=x.adminConnection;check(c&&same(Object.keys(c).sort(),['database','host','password','port','ssl','user'])&&c.host==='postgres'&&c.port===5432&&c.database==='postgres'&&c.user==='qa_bootstrap'&&c.password===m.source.rolePasswords.qa_bootstrap&&c.ssl&&same(Object.keys(c.ssl).sort(),['ca','rejectUnauthorized','servername'])&&typeof c.ssl.ca==='string'&&c.ssl.ca.length>0&&c.ssl.servername==='postgres'&&c.ssl.rejectUnauthorized===true,'SCHEMA_PROBE_CONNECTION');
 const caseName='source-schema-probe-'+mode,cost=SCHEMA_PROBE_BUDGET[mode];let sqlCommands=0;
 const bound=()=>check(now()-started>=0&&now()-started<45000,'SCHEMA_PROBE_DEADLINE');
 async function host(){bound();const o=await observeResources();check(same(o?.resource,r)&&o.sourcePostgresRunning===true&&o.targetPostgresRunning===false&&same(o.runtimeConsumers,[]),'SCHEMA_PROBE_RESOURCES');bound()}
 await ledger.enter(caseName);const budget=await ledger.snapshot(),prior=budget.scenarios?.[caseName];check(['cp019-budget-v1','cp024-budget-continuation-v2'].includes(budget.schema)&&budget.project===m.source.project&&Number.isFinite(budget.startedUptime)&&uptime()-budget.startedUptime>=0&&uptime()-budget.startedUptime<=1800&&budget.plannedScopes?.[caseName]==='source-window'&&budget.plannedScenarios?.[caseName]?.sql===CASE_LIMITS.sql&&Number.isSafeInteger(budget.total?.sql)&&budget.total.sql+cost<=GLOBAL_LIMITS.sql&&(!prior||uptime()-prior.startedUptime>=0&&uptime()-prior.startedUptime<45&&prior.total.sql+cost<=CASE_LIMITS.sql),'SCHEMA_PROBE_BUDGET');await host();
 await publishPlan({schema:'cp020-schema-fault-plan-v1',caseName,mode,sourceSha:x.sourceSha,custodyHash:x.custodyHash,resourceHash:sha256(r),migrationHashes:x.migrationHashes,sqlMaximum:cost,databases:['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'],faultPoints:mode==='pre'?['DDL_APPLIED','REGISTRY_WRITTEN']:[],continuation:'existing custodied source migration phases only'});await host();
 const cases=[];
 for(const [scope,database]of [['central','mecanet_control'],['a','mecanet_tenant_a'],['b','mecanet_tenant_b']]){
  await host();const pool=await poolFactory({...copy(c),database,max:1,connectionTimeoutMillis:2000,statement_timeout:500,lock_timeout:300,idle_in_transaction_session_timeout:2000,application_name:'cp020-schema-fault'});let uncertain=false;
  const send=async(client,text,values=[])=>{await host();await ledger.charge('sql');await host();check(++sqlCommands<=cost,'SCHEMA_PROBE_SQL_MAXIMUM');return client.query({text,values,query_timeout:500})};
  async function snapshot(){const client=await pool.connect();const beforeCount=sqlCommands;let committed=false;try{await send(client,'BEGIN READ ONLY');const rows=(await send(client,snapshotSql(scope==='central'))).rows;await send(client,'COMMIT');committed=true;check(rows?.length===1,'SCHEMA_PROBE_ROWSET');const s=rows[0],central=scope==='central',hash=x.migrationHashes[central?'central':'tenant'];check(s.role==='qa_bootstrap'&&s.database===database&&s.server_address===r.networkIP&&s.system_identifier===r.systemIdentifier&&s.version==='180006'&&s.tls===true&&s.read_only==='on'&&s.generation===m.source.generation&&s.consumers===0&&H.test(s.fingerprint??'')&&s.b_closed===true&&s.logical_consistent===true&&(!central||s.barrier===true&&s.clock_owner===m.source.seedClockOwner&&s.clock_version==='0'&&s.tick==='0'),'SCHEMA_PROBE_SQL_IDENTITY');check(mode==='pre'?s.migration6===null&&s.registered_source===null&&s.recovery_present===false&&(!central||same(s.schemas,[2,2])):s.migration6===hash&&s.registered_source===x.sourceSha&&s.recovery_present===true&&(!central||same(s.schemas,[3,3])),'SCHEMA_PROBE_REGISTRY');return s;}finally{if(!committed&&sqlCommands>beforeCount)uncertain=true;client.release(uncertain?Error('SCHEMA_PROBE_TRANSACTION_UNCERTAIN'):undefined)}}
  try{
   let baseline=await snapshot();
   if(mode==='pre')for(const point of ['DDL_APPLIED','REGISTRY_WRITTEN']){
    await host();let injected=false,rollback=false;const ddl=bytes[scope==='central'?'central':'tenant'].toString('utf8');
    const faultPool={async connect(){const client=await pool.connect();return{async query(q){const result=await send(client,q.text,q.values);if(q.text==='ROLLBACK')rollback=true;if(point==='DDL_APPLIED'&&q.text===ddl||point==='REGISTRY_WRITTEN'&&q.text.startsWith('INSERT INTO')&&q.text.includes('schema_migrations')){injected=true;throw faultError(point)}return result},release(error){if(error)uncertain=true;client.release(error)}}}};
    let error;try{await applyRecoveryMigration({pool:faultPool,scope,sourceCommit:x.sourceSha,expectedHash:x.migrationHashes[scope==='central'?'central':'tenant'],onCommand:async()=>{}})}catch(e){error=e}
    check(error?.message==='SCHEMA_FAULT_INJECTED'&&error.point===point&&injected&&rollback&&!uncertain,'SCHEMA_PROBE_ROLLBACK_UNCERTAIN');const after=await snapshot();check(same(after,baseline),'SCHEMA_PROBE_CATALOG_CHANGED');baseline=after;cases.push({scope,point,rollback:'ACKNOWLEDGED',fingerprint:after.fingerprint});
   }
   else cases.push({scope,registeredHash:baseline.migration6,schemaVersion:3});
  }finally{let timer;try{await Promise.race([pool.end(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SCHEMA_PROBE_END_UNCERTAIN')),endTimeoutMs)})])}finally{clearTimeout(timer)}}
  bound();
 }
 let schema2Compatibility=null;if(mode==='post'){let opened=0,denied=0,secretResolutions=0;for(const access of ['read','write']){const manager=archivedManager({access,allowedSchemaVersions:access==='read'?[1,2]:[2],resolveSecret:async()=>{secretResolutions++;throw Error('SCHEMA_PROBE_SECRET_SHOULD_NOT_RESOLVE')},createPool:async()=>{opened++;throw Error('SCHEMA_PROBE_SCHEMA2_POOL_OPENED')}});try{for(const [tenantId,dbName]of [[A,'mecanet_tenant_a'],[B,'mecanet_tenant_b']]){let error;try{await manager.withTenant({tenantId,dbName,secretRef:'schema2-contract',credentialVersion:'1',dataEpoch:'2',schemaVersion:3,status:'active',purpose:'company'},async()=>{throw Error('SCHEMA_PROBE_SCHEMA2_QUERY')})}catch(e){error=e}check(error?.code==='TENANT_UNAVAILABLE','SCHEMA_PROBE_SCHEMA2_REJECTION');denied++}}finally{await manager.close()}}check(opened===0&&secretResolutions===0&&denied===4,'SCHEMA_PROBE_SCHEMA2_REJECTION');schema2Compatibility={denied,poolOpened:opened,secretResolutions,component:ARCHIVED_L2_COMPONENT,oldBinaryExecuted:false,contract:'byte-exact archived L2 pool component with read [1,2] and write [2] allowlists; no complete old HTTP binary'}}
 await host();check(sqlCommands===cost,'SCHEMA_PROBE_SQL_COUNT');return{schema:'cp020-schema-fault-report-v1',status:'PASS',mode,caseName,sourceSha:x.sourceSha,custodyHash:x.custodyHash,resourceHash:sha256(r),cases,sqlCommands,schema2Compatibility,permanentChanges:0,physicalExecution:'caller supplied pool; local model does not establish PostgreSQL execution'};
}

export const SCHEMA_HOST_MAILBOX='/run/qa-live/source-schema-host.json';
/** A sealed old descriptor can be unlinked by Root's atomic replacement. Its
 * bytes must stay stable; a name/open race permits three bounded reopenings.
 * No reader writes, sleeps or accepts cached observations here. */
export async function readSchemaHostMailbox({io={lstat,open,realpath}}={}){
 const directory=async()=>{const s=await io.lstat('/run/qa-live');check(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===999&&(s.mode&0o777)===0o700&&await io.realpath('/run/qa-live')==='/run/qa-live','SCHEMA_PROBE_MAILBOX_DIRECTORY')};
 const valid=(s,unlinked=false)=>s.isFile()&&!s.isSymbolicLink()&&s.uid===999&&(s.mode&0o777)===0o400&&(s.nlink===1||unlinked&&s.nlink===0)&&s.size>=2&&s.size<=262144;
 const sameInode=(a,b)=>a.dev===b.dev&&a.ino===b.ino,stable=(a,b)=>['dev','ino','uid','mode','size','mtimeMs'].every(k=>a[k]===b[k]);await directory();
 for(let attempt=0;attempt<3;attempt++){const before=await io.lstat(SCHEMA_HOST_MAILBOX);check(valid(before),'SCHEMA_PROBE_MAILBOX_FILE');const fd=await io.open(SCHEMA_HOST_MAILBOX,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const first=await fd.stat();check(valid(first,true),'SCHEMA_PROBE_MAILBOX_FILE');if(!sameInode(first,before)){const named=await io.lstat(SCHEMA_HOST_MAILBOX);check(valid(first)&&valid(named)&&stable(first,named)&&first.ctimeMs===named.ctimeMs,'SCHEMA_PROBE_MAILBOX_CHANGED');continue}check(stable(first,before)&&(first.nlink===0?first.ctimeMs>=before.ctimeMs:first.ctimeMs===before.ctimeMs),'SCHEMA_PROBE_MAILBOX_CHANGED');const buffer=Buffer.alloc(first.size+1);let offset=0,reads=0;while(offset<buffer.length){check(++reads<=64,'SCHEMA_PROBE_MAILBOX_CHANGED');const got=await fd.read(buffer,offset,buffer.length-offset,offset);check(Number.isInteger(got.bytesRead)&&got.bytesRead>=0&&got.bytesRead<=buffer.length-offset,'SCHEMA_PROBE_MAILBOX_CHANGED');if(!got.bytesRead)break;offset+=got.bytesRead}const bytes=buffer.subarray(0,offset),after=await fd.stat(),named=await io.lstat(SCHEMA_HOST_MAILBOX);await directory();check(bytes.length===first.size&&valid(after,true)&&valid(named)&&stable(first,after)&&(after.nlink===0?after.ctimeMs>=first.ctimeMs:after.ctimeMs===first.ctimeMs),'SCHEMA_PROBE_MAILBOX_CHANGED');if(after.nlink===0)check(!sameInode(after,named),'SCHEMA_PROBE_MAILBOX_CHANGED');else if(sameInode(after,named))check(stable(after,named)&&after.ctimeMs===named.ctimeMs,'SCHEMA_PROBE_MAILBOX_CHANGED');const packet=JSON.parse(bytes);check(canonical(packet)===bytes.toString()&&Object.keys(packet).sort().join(',')==='receipt,receiptHash','SCHEMA_PROBE_MAILBOX_PACKET');return packet}finally{await fd.close()}}
 throw Error('SCHEMA_PROBE_MAILBOX_CHANGED');
}
export function createSchemaMailboxObserver({config:c,load=readSchemaHostMailbox,now=Date.now}={}){
 check(c&&['pre','post'].includes(c.mode)&&typeof load==='function'&&typeof now==='function','SCHEMA_PROBE_HOST_BINDING');const cfg=copy(c);
 return async()=>{const packet=await load(),r=packet?.receipt;check(packet&&Object.keys(packet).sort().join(',')==='receipt,receiptHash'&&r&&Object.keys(r).sort().join(',')==='caseName,custodyHash,invocationId,mode,observedAt,observedResources,resourceHash,schema,sourceSha'&&sha256(r)===packet.receiptHash&&r.schema==='cp020-schema-probe-host-v1'&&r.mode===cfg.mode&&r.caseName==='source-schema-probe-'+cfg.mode&&r.invocationId===cfg.invocationId&&r.custodyHash===cfg.custodyHash&&r.sourceSha===cfg.sourceSha&&r.resourceHash===sha256(cfg.resource),'SCHEMA_PROBE_HOST_BINDING');const age=now()-Date.parse(r.observedAt);check(Number.isFinite(age)&&age>=0&&age<=5000,'SCHEMA_PROBE_HOST_STALE');return copy(r.observedResources)};
}
const paths=new Set(['/run/qa-secrets/schema-fault-probe.json','/run/qa-secrets/material.json','/run/qa-results/source-schema-probe-pre-plan.json','/run/qa-results/source-schema-probe-post-plan.json','/run/qa-results/source-schema-probe-pre.json','/run/qa-results/source-schema-probe-post.json']);
async function read400(path){check(paths.has(path),'SCHEMA_PROBE_FIXED_PATH');const valid=s=>s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o400&&s.size>=2&&s.size<=262144,before=await lstat(path);check(valid(before),'SCHEMA_PROBE_PRIVATE_FILE');const h=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const first=await h.stat(),bytes=await h.readFile(),last=await h.stat();check(valid(first)&&valid(last)&&bytes.length===first.size&&['ino','dev','size','mode','uid','mtimeMs','ctimeMs'].every(k=>first[k]===before[k]&&last[k]===first[k]),'SCHEMA_PROBE_FILE_CHANGED');return{value:JSON.parse(bytes),sha256:sha256(bytes)}}finally{await h.close()}}
export async function main(){
 const mode=process.argv[2];check(process.argv.length===3&&['pre','post'].includes(mode),'SCHEMA_PROBE_FIXED_MODE');const cfg=(await read400('/run/qa-secrets/schema-fault-probe.json')).value,material=await read400('/run/qa-secrets/material.json');check(cfg.schema==='cp020-schema-fault-input-v1'&&cfg.mode===mode&&cfg.project==='mecanet-qa-p1l3-r03'&&cfg.project===process.env.QA_PROJECT&&cfg.sourceSha===process.env.QA_CODE_SHA&&cfg.invocationId===process.env.QA_INVOCATION_ID&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(cfg.invocationId??'')&&cfg.custodyHash===material.sha256,'SCHEMA_PROBE_CLI_BINDING');
 check(Object.keys(cfg).sort().join(',')==='adminConnection,custodyHash,invocationId,migrationHashes,mode,project,resource,schema,sourceSha','SCHEMA_PROBE_CLI_BINDING');
 const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:'source-window'}),observeResources=createSchemaMailboxObserver({config:cfg}),publishPlan=async value=>{const path='/run/qa-results/source-schema-probe-'+mode+'-plan.json';let old;try{old=await read400(path)}catch(e){if(e.code!=='ENOENT')throw e}if(old)check(same(old.value,value),'SCHEMA_PROBE_PLAN_CHANGED');else{await ledger.charge('artifactFiles');const saved=await publishSourceReadonly(path,value),back=await read400(path);check(back.sha256===saved.sha256&&same(back.value,value),'SCHEMA_PROBE_PLAN_CHANGED')}};
 const result=await runSchemaFaultProbe({...cfg,material:material.value},{mode,ledger,observeResources,publishPlan}),path='/run/qa-results/source-schema-probe-'+mode+'.json';await ledger.charge('artifactFiles');const saved=await publishSourceReadonly(path,result),back=await read400(path);check(back.sha256===saved.sha256&&same(back.value,result),'SCHEMA_PROBE_PUBLICATION');console.log(JSON.stringify({type:'cp020-schema-fault-probe',mode,status:'PASS',reportHash:saved.sha256,secretsPrinted:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({type:'cp020-schema-fault-probe',status:'FAIL',code:'SCHEMA_PROBE_FAILED',secretsPrinted:false}));process.exitCode=1});
