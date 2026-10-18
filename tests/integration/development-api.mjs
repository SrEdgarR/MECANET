// Two independent Node processes for private PostgreSQL development tests.
// No .env, deployment, public listener or production configuration fallback.
import assert from 'node:assert/strict';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createServer} from 'node:https';
import {createInterface} from 'node:readline';
import {createPgPool,validateConnection,createSecretResolver,createTenantPoolManager,createPoolBudget} from '../../server/saas/db/pools.js';
import {createAuthority} from '../../server/saas/auth/authority.js';
import {createAdmission} from '../../server/saas/admission/index.js';
import {createWriteService} from '../../server/saas/writes/service.js';
import {createRecoveryRuntime} from '../../server/saas/recovery/runtime.js';
import {createFixtureIssuer} from '../qa/issuer.js';
import {createApp} from '../../server/saas/app.js';
import {loadCiUi} from './ci-browser-ui.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function ownPath(value){const p=resolve(value),r=relative(resolve('.qa-private'),p);assert.ok(r&&!r.startsWith('..')&&!isAbsolute(r),'PRIVATE_DEVELOPMENT_PATH_REQUIRED');return p}
function connection(c,role,expectedPort){assert.ok([15432,15433].includes(expectedPort),'OWN_DEVELOPMENT_PORT_REQUIRED');const v=validateConnection(c);assert.ok(v.host==='127.0.0.1'&&v.port===expectedPort&&v.user===role&&v.database==='mecanet_control'&&v.ssl.servername==='localhost','OWN_DEVELOPMENT_CONNECTION_REQUIRED');return v}
async function main(){
 assert.equal(process.argv.length,3,'EXPLICIT_PRIVATE_CONFIG_REQUIRED');const file=ownPath(process.argv[2]);assert.equal(await realpath(file),file);const st=await lstat(file);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.size<262144);
 const c=JSON.parse(await readFile(file,'utf8'));assert.equal(c.schema,'cp023-development-api-v1');assert.equal(c.acknowledgement,'CP023_OWN_LOOPBACK_CLUSTER');assert.ok(['api1','api2'].includes(c.instance));assert.equal(c.port,c.instance==='api1'?(c.frontend?18443:18441):18442);assert.ok(!c.frontend||c.instance==='api1');assert.equal(c.origin,'https://app.mecanet.test:18443');assert.ok(uuid.test(c.generation)&&uuid.test(c.ownerId)&&uuid.test(c.recovery?.runId)&&/^[a-f0-9]{64}$/.test(c.recovery.manifestHash)&&['NORMAL','RECOVERY'].includes(c.recovery.mode));
 const ownPools=[];const makePool=async(config,extra={})=>{const p=await createPgPool({...config,...extra,connectionTimeoutMillis:2000,statement_timeout:1000,lock_timeout:300,idle_in_transaction_session_timeout:3000});ownPools.push(p);return p};
 const control=await makePool(connection(c.control,'saas_api',c.expectedPort??15432),{max:5}),sessions=await makePool(connection(c.sessions,'saas_session',c.expectedPort??15432),{max:2}),issuerPool=await makePool(connection(c.issuer,'saas_issuer',c.expectedPort??15432),{max:1});
 const recovery=createRecoveryRuntime({controlPool:control,generation:c.generation,expectedRunId:c.recovery.runId,manifestHash:c.recovery.manifestHash,mode:c.recovery.mode});
 const budget=createPoolBudget({maxPools:4,maxLeases:8}),readers=createTenantPoolManager({resolveSecret:createSecretResolver({entries:c.entries}),allowedSchemaVersions:[1,2,3],budget,recovery,createPool:config=>createPgPool({...config,max:2,connectionTimeoutMillis:2000,statement_timeout:1000,lock_timeout:300})}),writers=createTenantPoolManager({resolveSecret:createSecretResolver({entries:c.writerEntries,access:'write'}),allowedSchemaVersions:[2,3],budget,recovery,access:'write',createPool:config=>createPgPool({...config,max:2,connectionTimeoutMillis:2000,statement_timeout:1000,lock_timeout:300})});
 const authority=createAuthority(control,c.generation,{writersEnabled:true,recovery}),writes=createWriteService({controlPool:control,authority,writerPools:writers,readerPools:readers,ownerId:c.ownerId,generation:c.generation,recovery});authority.setWriteService(writes);
 const admission=createAdmission({pool:control,owner:c.ownerId,generation:c.generation}),issuer=createFixtureIssuer({pool:issuerPool,generation:c.generation,writerAuthority:authority});
 const service=createApp({origin:c.origin,sessionPool:sessions,sessionSecret:c.sessionSecret,authority,admission,tenantPools:readers,writes,issuer,recovery,trustedProxy:'127.0.0.1',reportError:event=>console.error(JSON.stringify({type:'development-api-error',instance:c.instance,...event}))});
 const keyFile=ownPath(c.tls.keyFile),certFile=ownPath(c.tls.certFile);const ui=c.frontend?await loadCiUi(c.frontend,resolve(file,'..')):null;const server=createServer({key:await readFile(keyFile),cert:await readFile(certFile)},(req,res)=>ui&&!req.url.startsWith('/api/')?ui(req,res):service.app(req,res));
 server.requestTimeout=8000;server.headersTimeout=5000;server.maxHeadersCount=32;
 let stopping=false,checking=false;const timer=setInterval(async()=>{if(checking)return;checking=true;try{await admission.observeClock()}catch{}finally{checking=false}},150);timer.unref();
 async function stop(){if(stopping)return;stopping=true;const drained=await service.drain();clearInterval(timer);await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()});await Promise.all([readers.close(),writers.close()]);await Promise.all(ownPools.map(p=>p.end()));console.log(JSON.stringify({type:'development-api-stopped',instance:c.instance,pid:process.pid,drained,budget:budget.snapshot()}));process.exitCode=drained?0:1;process.stdin.destroy()}
 process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());const input=createInterface({input:process.stdin});input.on('line',line=>{if(line==='STOP')void stop()});input.on('close',()=>void stop());
 const clockDeadline=performance.now()+10000;let clockObservedReady=false,clockObservationAttempts=0;
 while(performance.now()<clockDeadline&&!stopping){clockObservationAttempts++;if(await admission.observeClock()===true){clockObservedReady=true;break}await new Promise(resolve=>setTimeout(resolve,20))}
 // The spacing schedules bounded observations; only positive SQL clock progress
 // permits startup. Elapsed time or a sleep never establishes readiness.
 assert.ok(clockObservedReady&&!stopping,'DEVELOPMENT_CLOCK_NOT_READY');
 await new Promise((yes,no)=>{server.once('error',no);server.listen(c.port,'127.0.0.1',yes)});console.log(JSON.stringify({type:'development-api-ready',instance:c.instance,pid:process.pid,port:c.port,clockObservedReady,clockObservationAttempts}));
}
main().catch(e=>{console.error(JSON.stringify({type:'development-api-failed',guard:/^[A-Z][A-Z0-9_]{2,80}$/.test(e.message??'')?e.message:'DEVELOPMENT_API_FAILED'}));process.exitCode=1});
