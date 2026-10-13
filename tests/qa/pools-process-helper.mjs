// Private child-process harness. No HTTP entry point and no secret on IPC/stdout.
import {readFile} from 'node:fs/promises';
import {createPgPool,createSecretResolver,createTenantPoolManager} from '../../server/saas/db/pools.js';

const path=process.env.MECANET_QA_CONNECTIONS;
if(path!=='/run/qa-secrets/connections.json'||!process.send)throw new Error('PRIVATE_POOL_PROCESS_REQUIRED');
const qa=JSON.parse(await readFile(path,'utf8'));
const companies=Object.values(qa.entries).filter(entry=>entry.purpose==='company').sort((a,b)=>a.tenantId.localeCompare(b.tenantId));
if(companies.length!==2||companies[0].tenantId!=='11111111-1111-4111-8111-111111111111'||companies[1].tenantId!=='22222222-2222-4222-8222-222222222222')throw new Error('SYNTHETIC_COMPANIES_REQUIRED');
const [originalA,originalB]=companies;
for(const [entry,role,database]of [[originalA,'saas_tenant_a','mecanet_tenant_a'],[originalB,'saas_tenant_b','mecanet_tenant_b']])if(entry.connection.host!=='postgres'||entry.connection.user!==role||entry.dbName!==database||entry.connection.database!==database)throw new Error('SYNTHETIC_CONNECTION_REQUIRED');
const allowErrors=new Set(['POOL_BUSY','POOL_CAPACITY','POOL_DRAINING','POOL_CLOSED','SECRET_UNAVAILABLE','SECRET_MISMATCH','TENANT_UNAVAILABLE']);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
let manager,resolver,currentA,configuration,applicationName,sequence=0;const holds=new Map(),created=[];
const sanitize=error=>allowErrors.has(error.code)?error.code:'PRIVATE_POOL_TEST_FAILED';
const descriptor=selector=>{
 const {connection,...a}=currentA??originalA;
 const {connection:other,...b}=originalB;
 switch(selector){
  case'A':return a;case'B':return b;
  case'unknown':return{...a,secretRef:'missing-synthetic-reference'};
  case'wrongEpoch':return{...a,dataEpoch:a.dataEpoch+99};
  case'forgedDatabase':return{...a,dbName:b.dbName};
  case'blocked':return{...a,status:'blocked'};
  case'demo':return{...a,purpose:'demo'};
  default:throw new Error('SELECTOR_REQUIRED');
 }
};
function rebuildResolver(){resolver=createSecretResolver({entries:{[currentA.secretRef]:currentA,[originalB.secretRef]:originalB}})}
const stats=()=>({processId:process.pid,snapshot:manager.snapshot(),configuration,created:created.map(row=>({...row}))});
async function configure({mode,name}){
 if(holds.size)throw new Error('HELD_LEASES_EXIST');
 if(manager)await manager.close();
 if(!['canonical','small'].includes(mode)||!/^mecanet-pools-qa:[a-f0-9-]{36}:[12]$/.test(name))throw new Error('PRIVATE_CONFIGURATION_REQUIRED');
 applicationName=name;currentA={...originalA};rebuildResolver();created.length=0;
 configuration=mode==='canonical'?{mode,maxPools:4,maxPerPool:2}:{mode,maxPools:1,maxPerPool:1};
 const options=mode==='canonical'?{}:{maxPools:1,maxPerPool:1};
 manager=createTenantPoolManager({resolveSecret:d=>resolver(d),...options,createPool:async config=>{
  const row={id:++sequence,database:config.database,max:config.max,min:config.min,idleTimeoutMillis:config.idleTimeoutMillis,connectionTimeoutMillis:config.connectionTimeoutMillis,options:config.options,ended:false};created.push(row);
  const pool=await createPgPool({...config,application_name:applicationName});const end=pool.end.bind(pool);
  pool.end=async()=>{await end();row.ended=true};return pool;
 }});
 return stats();
}
async function hold({slot,selector='A'}){
 if(typeof slot!=='string'||slot.length>40||holds.has(slot))throw new Error('INVALID_TEST_SLOT');
 const ready=deferred(),gate=deferred();
 const task=manager.withTenant(descriptor(selector),async client=>{
  const row=(await client.query("SELECT pg_backend_pid() AS pid,current_database() AS database,current_user AS role,current_setting('application_name') AS application_name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
  ready.resolve(row);await gate.promise;return row;
 });
 // Consume failure immediately, including failures before the callback starts.
 task.catch(error=>ready.reject(error));
 holds.set(slot,{task,gate});
 try{return{connection:await ready.promise,...stats()}}
 catch(error){holds.delete(slot);throw error}
}
async function release({slot}){
 const entry=holds.get(slot);if(!entry)throw new Error('UNKNOWN_TEST_SLOT');
 entry.gate.resolve();try{await entry.task}finally{holds.delete(slot)}return stats();
}
async function close(){
 for(const entry of holds.values())entry.gate.resolve();
 await Promise.allSettled([...holds.values()].map(entry=>entry.task));holds.clear();
 if(manager)await manager.close();
}
async function handle(command,args){
 if(command==='configure')return configure(args);
 if(!manager)throw new Error('CONFIGURE_FIRST');
 if(command==='hold')return hold(args);
 if(command==='release')return release(args);
 if(command==='stats')return stats();
 if(command==='rotateDescriptor'){
  // Deliberately keep the same DB credential. This tests pool key/epoch drain,
  // not PostgreSQL password rotation or the central directory update path.
  currentA={...originalA,secretRef:'qa-rotated-descriptor-a',credentialVersion:originalA.credentialVersion+1,dataEpoch:originalA.dataEpoch+1};rebuildResolver();return{credentialChanged:false,dataEpoch:currentA.dataEpoch,credentialVersion:currentA.credentialVersion};
 }
 if(command==='close'){await close();return stats()}
 if(command==='shutdown'){await close();return{closed:true}}
 throw new Error('UNKNOWN_PRIVATE_COMMAND');
}
let watchdog;
function armWatchdog(){clearTimeout(watchdog);watchdog=setTimeout(()=>{close().finally(()=>process.exit(2))},60_000);watchdog.unref()}
process.on('message',async message=>{
 if(!message||typeof message.id!=='string')return;
 armWatchdog();
 try{const value=await handle(message.command,message.args??{});process.send({id:message.id,ok:true,value},()=>{if(message.command==='shutdown'){clearTimeout(watchdog);process.disconnect()}})}
 catch(error){process.send({id:message.id,ok:false,code:sanitize(error)})}
});
process.on('disconnect',()=>{clearTimeout(watchdog);close().finally(()=>process.exit(0))});
process.on('SIGTERM',()=>{close().finally(()=>process.exit(2))});
armWatchdog();process.send({ready:true,processId:process.pid,node:process.versions.node});
