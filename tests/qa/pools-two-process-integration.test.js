// Real, private PostgreSQL test. Two actual Node processes; at most four tenant
// connections plus one bootstrap observer. No changes to roles, data or secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createPgPool} from '../../server/saas/db/pools.js';

const PRIVATE='/run/qa-secrets/connections.json';
if(process.env.MECANET_QA_CONNECTIONS&&process.env.MECANET_QA_CONNECTIONS!==PRIVATE)throw new Error('PRIVATE_POOL_TEST_REQUIRED');
const qa=JSON.parse(await readFile(PRIVATE,'utf8'));
function worker(){
 const child=fork(new URL('./pools-process-helper.mjs',import.meta.url),[],{execPath:process.execPath,env:{PATH:process.env.PATH,NODE_ENV:'test',MECANET_QA_CONNECTIONS:PRIVATE,DATABASE_URL:'intentionally-invalid-fallback-marker'},stdio:['ignore','ignore','ignore','ipc']});
 const pending=new Map();let resolveReady,rejectReady,resolveExit;
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});
 const exited=new Promise(resolve=>{resolveExit=resolve});
 child.on('message',message=>{
  if(message.ready)return resolveReady(message);
  const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);
  if(message.ok)request.resolve(message.value);else request.reject(Object.assign(new Error(message.code),{code:message.code}));
 });
 child.on('error',()=>rejectReady(new Error('PRIVATE_CHILD_START_FAILED')));
 child.on('exit',(code,signal)=>{resolveExit({code,signal});rejectReady(new Error('PRIVATE_CHILD_EXITED'));for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('PRIVATE_CHILD_EXITED'))}pending.clear()});
 function call(command,args={}){
  return new Promise((resolve,reject)=>{
   const id=randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(new Error('PRIVATE_CHILD_DEADLINE'))},10_000);
   pending.set(id,{resolve,reject,timer});child.send({id,command,args},error=>{if(error){clearTimeout(timer);pending.delete(id);reject(new Error('PRIVATE_CHILD_CHANNEL_CLOSED'))}});
  });
 }
 return{child,ready:Promise.race([ready,delay(10_000).then(()=>{throw new Error('PRIVATE_CHILD_START_DEADLINE')})]),call,async stop(){
  if(child.exitCode!==null||child.signalCode!==null)return exited;
  try{await call('shutdown')}catch{child.kill('SIGTERM')}
  const timeout=delay(2000).then(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')});
  const result=await exited;await timeout;return result;
 }};
}

test('two Node processes enforce real PostgreSQL pool quotas, rotation and idle-only eviction without fallback',{timeout:90_000},async t=>{
 assert.equal(process.versions.node,'24.21.0');
 const admin=await createPgPool({host:'postgres',port:5432,database:'mecanet_control',user:'qa_bootstrap',password:await readFile('/run/qa-secrets/bootstrap','utf8'),ssl:{ca:await readFile('/run/qa-ca.crt','utf8'),servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:2000,statement_timeout:2000,application_name:'mecanet-pools-qa-observer'});
 const runId=randomUUID(),prefix=`mecanet-pools-qa:${runId}:`;const children=[];let highWater=0;const evidence=[];
 async function observed(label,expected){
  const {rows}=await admin.query("SELECT a.pid,a.application_name,a.datname,a.usename,s.ssl FROM pg_stat_activity a JOIN pg_stat_ssl s USING(pid) WHERE a.usename IN ('saas_tenant_a','saas_tenant_b','saas_demo') ORDER BY a.pid");
  assert.ok(rows.every(row=>row.application_name.startsWith(prefix)),`${label}: another tenant consumer is active; stop it before this bounded test`);
  assert.ok(rows.length<=4,`${label}: four tenant connections maximum`);highWater=Math.max(highWater,rows.length);
  assert.ok(rows.every(row=>row.ssl===true));
  if(expected!==undefined)assert.equal(rows.length,expected,label);
  evidence.push({label,connections:rows.length,pids:rows.map(row=>row.pid),databases:[...new Set(rows.map(row=>row.datname))]});return rows;
 }
 async function gone(label){for(let n=0;n<40;n++){const rows=await observed(label);if(!rows.length)return;await delay(25)}assert.fail('tenant backends did not close')}
 async function configure(mode){await Promise.all(children.map((child,index)=>child.call('configure',{mode,name:prefix+(index+1)})))}
 try{
  const {rows:[facts]}=await admin.query("SELECT system_identifier::text,current_setting('server_version_num')::int AS version,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT barrier FROM saas.admission_fence WHERE id=1) AS barrier FROM pg_control_system()");
  assert.equal(facts.system_identifier,qa.systemIdentifier);assert.equal(facts.version,180006);assert.equal(facts.tls,true);assert.equal(facts.barrier,false,'run before the recovery barrier');
  await observed('preflight: no other tenant consumers',0);
  children.push(worker(),worker());const processes=await Promise.all(children.map(child=>child.ready));
  assert.notEqual(processes[0].processId,processes[1].processId);assert.ok(processes.every(row=>row.node==='24.21.0'));

  await t.test('default maxPerPool=2 is enforced in each real process and four total TLS backends are visible',async()=>{
   await configure('canonical');
   const held=await Promise.all(children.flatMap(child=>['one','two'].map(slot=>child.call('hold',{slot,selector:'A'}))));
   assert.equal(new Set(held.map(row=>row.connection.pid)).size,4);
   await observed('canonical: two concurrent leases per process',4);
   await Promise.all(children.map(child=>assert.rejects(child.call('hold',{slot:'overflow',selector:'A'}),{code:'POOL_BUSY'})));
   for(const child of children){const state=await child.call('stats');assert.equal(state.snapshot.pools,1);assert.equal(state.snapshot.leased,2);assert.equal(state.created.length,1);assert.equal(state.created[0].max,2);assert.equal(state.created[0].min,0);assert.equal(state.created[0].connectionTimeoutMillis,2000);assert.equal(state.created[0].idleTimeoutMillis,60000);assert.match(state.created[0].options,/default_transaction_read_only=on/)}
   await observed('canonical: overflow did not open another connection',4);
   await Promise.all(children.flatMap(child=>['one','two'].map(slot=>child.call('release',{slot}))));
   await Promise.all(children.map(child=>child.call('close')));await gone('canonical pools closed');
  });

  await t.test('small cache refuses to evict an active tenant, then replaces only an idle pool',async()=>{
   await configure('small');
   const held=await Promise.all(children.map(child=>child.call('hold',{slot:'active-a',selector:'A'})));
   await observed('eviction: A active in two processes',2);
   await Promise.all(children.map(child=>assert.rejects(child.call('hold',{slot:'blocked-b',selector:'B'}),{code:'POOL_CAPACITY'})));
   await Promise.all(children.map(child=>assert.rejects(child.call('hold',{slot:'blocked-a',selector:'A'}),{code:'POOL_BUSY'})));
   const still=await observed('eviction: active backends retained',2);assert.deepEqual(new Set(still.map(row=>row.pid)),new Set(held.map(row=>row.connection.pid)));
   await Promise.all(children.map(child=>child.call('release',{slot:'active-a'})));
   const replacement=await Promise.all(children.map(child=>child.call('hold',{slot:'active-b',selector:'B'})));
   const rows=await observed('eviction: idle A replaced by B',2);assert.ok(rows.every(row=>row.datname==='mecanet_tenant_b'&&row.usename==='saas_tenant_b'));
   assert.ok(replacement.every(row=>!held.some(old=>old.connection.pid===row.connection.pid)));
   for(const child of children){const state=await child.call('stats');assert.equal(state.snapshot.pools,1);assert.equal(state.created.length,2);assert.equal(state.created[0].ended,true);assert.equal(state.created[1].ended,false)}
   await Promise.all(children.map(child=>child.call('release',{slot:'active-b'})));await Promise.all(children.map(child=>child.call('close')));await gone('eviction pools closed');
  });

  await t.test('descriptor rotation drains current leases before replacement without doubling connections',async()=>{
   await configure('small');const old=await Promise.all(children.map(child=>child.call('hold',{slot:'old-a',selector:'A'})));
   await Promise.all(children.map(child=>child.call('rotateDescriptor')));
   await Promise.all(children.map(child=>assert.rejects(child.call('hold',{slot:'too-soon',selector:'A'}),{code:'POOL_DRAINING'})));
   const retained=await observed('rotation: only old active backends',2);assert.deepEqual(new Set(retained.map(row=>row.pid)),new Set(old.map(row=>row.connection.pid)));
   for(const child of children)assert.equal((await child.call('stats')).created.length,1);
   await Promise.all(children.map(child=>child.call('release',{slot:'old-a'})));await gone('rotation: old backends fully drained');
   const next=await Promise.all(children.map(child=>child.call('hold',{slot:'new-a',selector:'A'})));
   await observed('rotation: replacement backends only',2);assert.ok(next.every(row=>!old.some(prior=>prior.connection.pid===row.connection.pid)));
   for(const child of children){const state=await child.call('stats');assert.equal(state.created.length,2);assert.equal(state.created[0].ended,true);assert.equal(state.created[1].ended,false)}
   await Promise.all(children.map(child=>child.call('release',{slot:'new-a'})));await Promise.all(children.map(child=>child.call('close')));await gone('rotation pools closed');
  });

  await t.test('unknown secret, forged database, wrong epoch and invalid purpose open no pool or fallback',async()=>{
   for(const [selector,code]of [['unknown','SECRET_UNAVAILABLE'],['forgedDatabase','SECRET_MISMATCH'],['wrongEpoch','SECRET_MISMATCH'],['blocked','TENANT_UNAVAILABLE'],['demo','TENANT_UNAVAILABLE']]){
    await configure('small');await Promise.all(children.map(child=>assert.rejects(child.call('hold',{slot:'denied',selector}),{code})));
    for(const child of children){const state=await child.call('stats');assert.equal(state.created.length,0);assert.equal(state.snapshot.pools,0);assert.equal(state.snapshot.leased,0)}
    await observed(`fallback rejected: ${selector}`,0);
   }
  });
  t.diagnostic(JSON.stringify({kind:'two-real-process-pool-evidence',node:process.versions.node,processes:processes.map(row=>row.processId),highWaterTenantConnections:highWater,bootstrapObservers:1,configuration:{canonicalPerPool:2,reducedEvictionTestMaxPools:1,reducedEvictionTestMaxPerPool:1},canonicalFourPoolLogicEvidence:'tests/qa/db-pools.test.js: full cache refuses a fifth borrowed tenant and evicts only idle pools',rotationScope:'synthetic descriptor/version/epoch and actual pool replacement; same SQL password, no central directory mutation',measurements:evidence}));
 }finally{
  try{await Promise.all(children.map(child=>child.stop()));await gone('cleanup: every child tenant backend closed')}
  finally{await admin.end()}
 }
});
