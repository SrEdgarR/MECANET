import {CASE_LIMITS} from './budget-limits.mjs';
// Own QA API. No bootstrap, clock, custody master, maintenance or historic secrets.
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPgPool,validateConnection,createTenantPoolManager,createSecretResolver,createPoolBudget} from '../../../server/saas/db/pools.js';
import {createAuthority} from '../../../server/saas/auth/authority.js';
import {createAdmission} from '../../../server/saas/admission/index.js';
import {createApp} from '../../../server/saas/app.js';
import {createWriteService} from '../../../server/saas/writes/service.js';
import {createRecoveryRuntime} from '../../../server/saas/recovery/runtime.js';
import {createFixtureIssuer} from '../issuer.js';
import {readPrivateJson} from './prepare.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const decimal=v=>typeof v==='string'&&/^[1-9]\d{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
export function validateRecoveryBinding(config,project){
 if(!['mecanet-qa-p1l3-r03','mecanet-qa-p1l3-r03-target'].includes(project))throw Error('CP019_TARGET_REQUIRED');
 const r=config?.recovery;if(!UUID.test(config?.generation??'')||!r||Object.keys(r).sort().join(',')!=='manifestHash,mode,runId'||!UUID.test(r.runId??'')||r.runId===config.generation||!/^[0-9a-f]{64}$/.test(r.manifestHash??'')||r.mode!==(project.endsWith('-target')?'RECOVERY':'NORMAL'))throw Error('QA_RECOVERY_BINDING_REQUIRED');return r;
}
export function validatePrivateConnection(connection,role,database='mecanet_control'){
 const c=validateConnection(connection);if(c.host!=='postgres'||c.database!==database||c.user!==role||c.port!==5432||c.ssl?.servername!=='postgres')throw Error('QA_ROLE_BINDING_REQUIRED');return c;
}
export function validateEntries(entries,access,recovery){
 if(!entries||Array.isArray(entries)||typeof entries!=='object')throw Error('QA_ENTRIES_REQUIRED');
 const roles=access==='read'?{mecanet_tenant_a:'saas_tenant_a',mecanet_tenant_b:'saas_tenant_b',mecanet_demo:'saas_demo'}:access==='write'?{mecanet_tenant_a:'saas_writer_a',mecanet_tenant_b:'saas_writer_b'}:{mecanet_tenant_a:'saas_maintainer_a',mecanet_tenant_b:'saas_maintainer_b'};
 const tenants={mecanet_tenant_a:'11111111-1111-4111-8111-111111111111',mecanet_tenant_b:'22222222-2222-4222-8222-222222222222',mecanet_demo:'33333333-3333-4333-8333-333333333333'};
 const seen=new Set();for(const [ref,e]of Object.entries(entries)){
  if(!e||!UUID.test(e.tenantId??'')||e.tenantId!==tenants[e.dbName]||e.secretRef!==ref||!roles[e.dbName]||seen.has(e.tenantId)||!decimal(String(e.credentialVersion))||!decimal(String(e.dataEpoch))||e.status!=='active'||!['company','demo'].includes(e.purpose)||e.credentialPurpose!==access)throw Error('QA_DESCRIPTOR_REQUIRED');seen.add(e.tenantId);
  const demo=e.dbName==='mecanet_demo';if(demo?(access!=='read'||e.purpose!=='demo'||e.schemaVersion!==1):(e.purpose!=='company'||e.schemaVersion!==3||typeof e.dataEpoch!=='string'||typeof e.credentialVersion!=='string'||e.recoveryRunId!==recovery.runId||e.recoveryManifestHash!==recovery.manifestHash))throw Error('QA_DESCRIPTOR_BINDING_REQUIRED');
  validatePrivateConnection(e.connection,roles[e.dbName],e.dbName);
 }
 return entries;
}
export function validateApiConfig(config,project){
 if(!config||Object.keys(config).sort().join(',')!=='control,entries,generation,issuer,ownerId,recovery,sessionSecret,sessions,writerEntries')throw Error('API_EXCESS_AUTHORITY');
 const recovery=validateRecoveryBinding(config,project);
 if(!UUID.test(config.ownerId??'')||[config.generation,recovery.runId].includes(config.ownerId)||!/^[A-Za-z0-9_-]{64}$/.test(config.sessionSecret??''))throw Error('QA_API_OWNER_REQUIRED');
 validatePrivateConnection(config.control,'saas_api');validatePrivateConnection(config.sessions,'saas_session');validatePrivateConnection(config.issuer,'saas_issuer');validateEntries(config.entries,'read',recovery);validateEntries(config.writerEntries,'write',recovery);return config;
}
export async function main(){
 const config=validateApiConfig((await readPrivateJson('/run/qa-secrets/api.json')).value,process.env.QA_PROJECT);
 if(!['api1','api2'].includes(process.env.QA_INSTANCE))throw Error('QA_API_INSTANCE_REQUIRED');
 if(!['source-window','target-window'].includes(process.env.QA_SCENARIO))throw Error('QA_RUNTIME_SCENARIO_REQUIRED');
 const {newLedger,measuredPool}=await import('./ledger.mjs');const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:process.env.QA_SCENARIO,limits:{sql:CASE_LIMITS.sql,http:80}});
 const makePool=async(c,limits)=>measuredPool(await createPgPool({...c,...limits,connectionTimeoutMillis:2000,statement_timeout:500,lock_timeout:300,idle_in_transaction_session_timeout:1000}),ledger);
 const owner=config.ownerId,pool=await makePool(config.control,{max:5,application_name:'mecanet-cp019-api:'+owner}),sessions=await makePool(config.sessions,{max:2,application_name:'mecanet-cp019-session'}),issuerPool=await makePool(config.issuer,{max:1,application_name:'mecanet-cp019-issuer'});
 const recovery=createRecoveryRuntime({controlPool:pool,generation:config.generation,expectedRunId:config.recovery.runId,manifestHash:config.recovery.manifestHash,mode:config.recovery.mode}),budget=createPoolBudget({maxPools:4,maxLeases:8});
 const readers=createTenantPoolManager({resolveSecret:createSecretResolver({entries:config.entries}),allowedSchemaVersions:[1,2,3],budget,recovery,createPool:c=>makePool(c,{application_name:'mecanet-cp019-reader:'+owner})});
 const writers=createTenantPoolManager({resolveSecret:createSecretResolver({entries:config.writerEntries,access:'write'}),allowedSchemaVersions:[2,3],budget,recovery,access:'write',createPool:c=>makePool(c,{application_name:'mecanet-writer:'+owner})});
 const authority=createAuthority(pool,config.generation,{writersEnabled:true,recovery}),writes=createWriteService({controlPool:pool,authority,writerPools:writers,readerPools:readers,ownerId:owner,generation:config.generation,recovery});authority.setWriteService(writes);
 const issuer=createFixtureIssuer({pool:issuerPool,generation:config.generation,writerAuthority:authority}),admission=createAdmission({pool,owner,generation:config.generation});
 const service=createApp({origin:'https://app.mecanet.test:18443',sessionPool:sessions,sessionSecret:config.sessionSecret,authority,admission,tenantPools:readers,writes,issuer,recovery,trustedProxy:process.env.QA_PROJECT.endsWith('-target')?'10.77.66.130':'10.77.65.2',reportError:event=>console.error(JSON.stringify({type:'qa-api-error',...event}))});
 try{await admission.observeClock();await ledger.charge('artifactFiles');await writeFile('/tmp/qa-owner.json',JSON.stringify({owner,generation:config.generation,runId:config.recovery.runId,instance:process.env.QA_INSTANCE,startedAt:new Date().toISOString()}),{mode:0o600,flag:'wx'})}catch(error){await Promise.all([readers.close(),writers.close(),pool.end(),sessions.end(),issuerPool.end()]);throw error}
 let checking=false;const timer=setInterval(async()=>{if(checking)return;checking=true;try{await admission.observeClock()}catch{}finally{checking=false}},150);timer.unref();
 const server=service.app.listen(3000,'0.0.0.0');server.requestTimeout=8000;server.headersTimeout=5000;server.maxHeadersCount=32;
 let stopping=false;async function stop(){if(stopping)return;stopping=true;const drained=await service.drain();clearInterval(timer);server.close();server.closeIdleConnections();await Promise.all([readers.close(),writers.close()]);await Promise.all([pool.end(),sessions.end(),issuerPool.end()]);console.log(JSON.stringify({type:'qa-api-drained',drained,aggregate:budget.snapshot()}))}
 process.on('SIGTERM',()=>stop().catch(()=>{process.exitCode=1}));process.on('SIGINT',()=>stop().catch(()=>{process.exitCode=1}));console.log('MECANET_CP019_PRIVATE_QA_STARTED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({type:'cp019-api-start-failed',code:'QA_API_START_FAILED'}));process.exitCode=1});
