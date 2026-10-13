// Private, bounded, synthetic HTTP -> two API -> PostgreSQL integration.
// Bootstrap is an own-QA observer here; it never issues an inventory effect,
// changes a quota, or grants authority. The only mutation is the fixed private
// restriction enqueuer; the deployed maintenance worker performs its closure.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {arch} from 'node:os';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {canonicalWrite} from '../../../server/saas/writes/validation.js';
import {createQaClient,assertStatus} from '../cp014/http-client.mjs';
import {arm,waitEvent,release} from './faults.mjs';
import {runMetadataAssay} from './metadata-live.mjs';
import {observeUncertainRetention} from './uncertain-retention.mjs';

const PROJECT='mecanet-qa-p1l2-cp017';
const TENANT_A='11111111-1111-4111-8111-111111111111',TENANT_B='22222222-2222-4222-8222-222222222222';
const OWNER_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',MEMBER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',TEAMMATE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6';
if(process.env.QA_PROJECT!==PROJECT||!/^([a-f0-9]{40})$/.test(process.env.QA_CODE_SHA??''))throw Error('EXACT_OWN_QA_SOURCE_REQUIRED');
const sourceSha=process.env.QA_CODE_SHA,reportFile='/run/qa-results/integration.json';
const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
if(qa.project!==PROJECT||!qa.fixture?.identities.every(i=>i.email.endsWith('@qa.invalid'))||!qa.generation)throw Error('SYNTHETIC_COHORT_REQUIRED');
const login=JSON.parse(await readFile('/run/qa-secrets/fixture-login.json','utf8')),ca=await readFile('/run/qa-ca.crt');
const bootstrap=(await readFile('/run/qa-secrets/bootstrap','utf8')).trim();
const pools=new Map(),clients=[];
const report={sourceSha,harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),project:PROJECT,generation:qa.generation,startedAt:new Date().toISOString(),architecture:arch(),environment:'own synthetic PostgreSQL18.6/ARM64/TLS/two API',cases:[],notVerified:['simultaneous SQL writers beyond enforced ordinary capacity','last product and last logical byte','control/barrier worst-case metadata boundary','process-dead resource reconciliation','restart and rotation','closed restore and rollback','browser reload/accessibility'],resourcesModified:'only own synthetic fixed restriction requests',secretsPrinted:false};
let nextHttp=0;const passedCases=new Set();
async function persist(){await mkdir('/run/qa-results',{recursive:true});await writeFile(reportFile,JSON.stringify(report,null,2),{mode:0o600})}
async function caseOf(id,criteria,fn,{dependsOn=[]}={}){
 const startedAt=new Date().toISOString();
 try{
  const missing=dependsOn.filter(dependency=>!passedCases.has(dependency));
  if(missing.length)throw Object.assign(Error('DEPENDENCY_NOT_VERIFIED'),{code:'DEPENDENCY_NOT_VERIFIED',missing});
  const facts=await fn();report.cases.push({id,criteria,status:'PASS',startedAt,finishedAt:new Date().toISOString(),...facts});passedCases.add(id);
 }catch(error){
  const mismatch=typeof error.message==='string'?/^Expected HTTP (\d{3}), received (\d{3})\/([A-Z_]{1,60})(?:\r?\n|$)/.exec(error.message):null;
  const statusNumber=value=>Number.isInteger(value)&&value>=100&&value<=599;
  const expected=mismatch?Number(mismatch[1]):statusNumber(error.expected)?error.expected:null,actual=mismatch?Number(mismatch[2]):statusNumber(error.actual)?error.actual:null;
  report.cases.push({id,criteria,status:error.code==='DEPENDENCY_NOT_VERIFIED'?'NOT VERIFIED':'FAIL',startedAt,finishedAt:new Date().toISOString(),errorType:error instanceof assert.AssertionError?'ASSERTION':error instanceof Error?'EXECUTION':'UNKNOWN',code:typeof error.code==='string'&&/^[A-Z0-9_]{1,60}$/.test(error.code)?error.code:'INTEGRATION_ASSERTION',...(mismatch||expected!==null&&actual!==null?{statusMismatch:{expected,actual,...(mismatch?{publicCode:mismatch[3]}:{})}}:{}),...(error.code==='DEPENDENCY_NOT_VERIFIED'?{missingPrerequisites:error.missing}: {})});
 }
 await persist();
}
async function observer(database='mecanet_control'){
 if(!['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'].includes(database))throw Error('FIXED_QA_DATABASE_REQUIRED');
 if(!pools.has(database))pools.set(database,await createPgPool({host:'postgres',port:5432,database,user:'qa_bootstrap',password:bootstrap,ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:2000,statement_timeout:2000,lock_timeout:500,application_name:'mecanet-cp017-private-observer'}));
 return pools.get(database);
}
async function inspect(database,sql,values=[]){
 const pool=await observer(database),client=await pool.connect();
 try{await client.query('BEGIN READ ONLY');const rows=(await client.query(sql,values)).rows;await client.query('COMMIT');return rows}
 catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
}
async function central(sql,values=[]){return inspect('mecanet_control',sql,values)}
async function tenant(sql,values=[],id=TENANT_A){return inspect(id===TENANT_A?'mecanet_tenant_a':'mecanet_tenant_b',sql,values)}
async function newClient(email,instance='api1',purpose='company'){
 const client=createQaClient({instance,purpose,ca,login:{email,password:login.password},budget:160});
 clients.push({label:email.split('@')[0]+':'+instance,client});await pace();await client.login();return client;
}
async function pace(){const delay=nextHttp-performance.now();nextHttp=Math.max(nextHttp,performance.now())+150;if(delay>0)await sleep(delay)}
async function send(client,path,options={}){await pace();return client.request(path,options)}
async function write(client,operationId,input,{tenantId=TENANT_A,productId=null,epoch='2'}={}){
 const path=productId?`/api/tenants/${tenantId}/products/${productId}/stock-receipts`:`/api/tenants/${tenantId}/products`;
 return send(client,path,{method:'POST',body:input,headers:{'Idempotency-Key':operationId,'X-Data-Epoch':epoch}});
}
async function counters(tenantId=TENANT_A){
 const rows=await central("SELECT coalesce(sum(qh),0)::text AS qh,coalesce(sum(qc),0)::text AS qc,coalesce(sum(qt),0)::text AS qt FROM saas.windows WHERE scope_key=$1",[`tenant:${tenantId}`]);return rows[0];
}
async function operationRows(operationId,tenantId=TENANT_A){
 const local=(await tenant('SELECT id,actor_id,action,data_epoch,request_hash,status,result FROM inventory.operations WHERE id=$1',[operationId],tenantId))[0]??null;
 const intent=(await central('SELECT i.operation_id,i.actor_id,i.action,i.status,i.request_hash,i.writer_version,i.owner_id,t.owner AS ticket_owner,i.ticket_id,r.status AS reservation_status,r.tenant_bytes_reserved,r.products_reserved,r.control_bytes_reserved,t.state AS ticket_state FROM saas.write_intents i JOIN saas.write_growth_reservations r USING(tenant_id,operation_id) JOIN saas.tickets t ON t.id=i.ticket_id WHERE i.tenant_id=$1 AND i.operation_id=$2',[tenantId,operationId]))[0]??null;
 return {local,intent};
}
async function waitFor(fn,predicate,timeout=6500){const until=performance.now()+timeout;while(performance.now()<until){const value=await fn();if(predicate(value))return value;await sleep(50)}throw Error('QA_CONDITION_NOT_PROVEN')}
async function requestRestriction({identityId,action,tenantId=TENANT_A}){
 const id=randomUUID(),pool=await observer(),client=await pool.connect();
 try{await client.query('BEGIN');const rows=(await client.query('SELECT * FROM saas.request_write_restriction($1,$2,NULL,$3,$4,$5,\'GRANT\')',[id,identityId,tenantId,action,qa.generation])).rows;await client.query('COMMIT');assert.equal(rows[0]?.id,id);return id}
 catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
}
async function restrictionAck(id){return waitFor(()=>central('SELECT r.status,t.generation,t.data_epoch,t.open_version,t.closed_version,t.reopen_version,t.close_proven,t.stage FROM saas.write_restrictions r JOIN saas.write_restriction_tenants t ON t.restriction_id=r.id WHERE r.id=$1',[id]),rows=>rows.length===1&&rows[0].status==='ACKNOWLEDGED')}

let a,a2,b,member,teammate,demo,operator,product,otherProduct,lost;
try{
 await caseOf('environment',['L2-A2','L2-A3'],async()=>{
  const facts=(await central("SELECT current_setting('server_version_num') AS version,current_setting('server_encoding') AS encoding,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT generation FROM saas.admission_fence WHERE id=1) AS generation,(SELECT system_identifier::text FROM pg_control_system()) AS system_id"))[0];
  assert.equal(facts.version,'180006');assert.equal(facts.encoding,'UTF8');assert.equal(facts.tls,true);assert.equal(facts.generation,qa.generation);assert.equal(facts.system_id,qa.systemIdentifier);assert.equal(arch(),'arm64');return {version:facts.version,tls:true,utf8:true,exactCohort:true};
 });
 if(report.cases[0].status!=='PASS')throw Error('OWN_ENVIRONMENT_NOT_PROVEN');
 a=await newClient('a@qa.invalid');a2=createQaClient({instance:'api2',purpose:'company',ca,budget:160});a2.setCookies(a.cookieHeader());a2.csrf=a.csrf;clients.push({label:'a-shared:api2',client:a2});
 b=await newClient('b@qa.invalid','api2');member=await newClient('member@qa.invalid');teammate=await newClient('teammate@qa.invalid','api2');
 demo=await newClient('demo@qa.invalid','api1','demo');operator=await newClient('operator@qa.invalid','api2','operator');
 await caseOf('purpose-exact-action-and-tenant-negative',['L2-A4'],async()=>{
  const beforeA=await counters(),beforeB=await counters(TENANT_B);
  for(const client of [demo,operator,member])assertStatus(await write(client,randomUUID(),{sku:'DENIED',name:'Denied synthetic'}),403);
  assertStatus(await send(member,`/api/tenants/${TENANT_A}/inventory?limit=2`),403);
  for(const path of ['inventory','operations',`operations/${randomUUID()}`])assertStatus(await send(a,`/api/tenants/${TENANT_B}/${path}`),403);
  assertStatus(await write(a,randomUUID(),{sku:'FOREIGN',name:'foreign'},{tenantId:TENANT_B}),403);
  assert.deepEqual(await counters(),beforeA);assert.deepEqual(await counters(TENANT_B),beforeB);return {zeroTenantAdmissionBeforeAuthority:true,purposeAndExactGrant:true};
 });
 await caseOf('invalid-body-and-guards-before-intent',['L2-A4','L2-A6','L2-A7'],async()=>{
  const before=await counters(),ids=[];
  for(const input of [{sku:'BAD',name:'\u0000'},{sku:'BAD',name:'\ud800'},{sku:'BAD',name:'forged',tenantId:TENANT_B}]){const id=randomUUID();ids.push(id);assertStatus(await write(a,id,input),400)}
  const epochId=randomUUID();ids.push(epochId);assertStatus(await write(a,epochId,{sku:'BAD-EPOCH',name:'epoch'},{epoch:'1'}),409);
  assertStatus(await write(a,'bad-key',{sku:'BAD-KEY',name:'key'}),400);
  assert.equal((await central('SELECT count(*)::int AS n FROM saas.write_intents WHERE operation_id=ANY($1::uuid[])',[ids]))[0].n,0);assert.deepEqual(await counters(),before);return {zeroIntentAndTenantAdmission:true,nulAndLoneSurrogateRejected:true};
 });
 await caseOf('normalized-canonical-two-api-and-uc',['L2-A6','L2-A8'],async()=>{
  const id=randomUUID(),sku=`NORM-${id.slice(0,8)}`,name='Ficticio 😀 e\u0301 \u0001',before=await counters();
  const first=await write(a,id,{sku:`  ${sku.toLowerCase()} `,name});assertStatus(first,201);product=first.json.productId;
  const after=await counters();assert.equal(BigInt(after.qh)-BigInt(before.qh),1n);assert.equal(BigInt(after.qc)-BigInt(before.qc),3n);
  const replay=await write(a2,id.toUpperCase(),{name,sku});assertStatus(replay,201);assert.deepEqual(replay.json,first.json);
  const replayAfter=await counters();assert.equal(BigInt(replayAfter.qh)-BigInt(after.qh),1n);assert.equal(BigInt(replayAfter.qc)-BigInt(after.qc),1n);
  const expected=canonicalWrite({tenantId:TENANT_A,actorId:OWNER_A,action:'catalog.create',dataEpoch:'2',input:{sku,name}}),rows=await operationRows(id);
  assert.equal(rows.local.request_hash,expected.requestHash);assert.equal(rows.intent.request_hash,expected.requestHash);assert.equal(rows.intent.status,'CONFIRMED');
  assert.equal((await tenant('SELECT count(*)::int AS n FROM inventory.audit WHERE operation_id=$1',[id]))[0].n,1);
  return {operationId:id,requestHash:expected.requestHash,canonicalUtf8Bytes:Buffer.byteLength(expected.preimage),ucNew:3,ucReplay:1,resultUnique:true};
 });
 await caseOf('same-create-key-two-api-concurrent',['L2-A6'],async()=>{
  const id=randomUUID(),input={sku:`DUP-${id.slice(0,8)}`,name:'Concurrent synthetic'},before=(await tenant('SELECT count(*)::int AS n FROM catalog.products'))[0].n;
  report.races??={};report.races.sameKey={operationId:id,stage:'concurrent-post'};
  const replies=await Promise.all([write(a,id,input),write(a2,id,{name:input.name,sku:input.sku})]);
  const publicCode=reply=>typeof reply.json?.error==='string'&&/^[A-Z_]{1,60}$/.test(reply.json.error)?reply.json.error:null;
  const initialReplies=replies.map(reply=>({status:reply.status,publicCode:publicCode(reply)}));
  report.races.sameKey.initialReplies=initialReplies;report.races.sameKey.stage='consult';
  for(const reply of replies)assert(reply.status===201||reply.status===409&&publicCode(reply)==='OPERATION_PENDING'||reply.status===503,'CONCURRENT_RESPONSE_OUTSIDE_APPROVED_CONTRACT');
  // A collision may return a bounded uncertain/dependency response before the
  // other executor projects. The UUID/canonical input are never replaced. Query
  // its known result first, then explicitly replay only that original intention.
  let consulted=null;
  for(let attempt=0;attempt<6&&!consulted;attempt++){
   const reply=await send(a2,`/api/tenants/${TENANT_A}/operations/${id}`);
   if(reply.status===200&&reply.json.state==='CONFIRMED'){assertStatus(reply,200);consulted=reply.json.result;break}
   assert([200,404,409,429,503].includes(reply.status),'QUERY_RESPONSE_OUTSIDE_APPROVED_CONTRACT');await sleep(150);
  }
  assert(consulted,'CONCURRENT_RESULT_NOT_VERIFIED');report.races.sameKey.stage='explicit-replay';
  for(let index=0;index<replies.length;index++){
   if(replies[index].status===201){assert.deepEqual(replies[index].json,consulted);continue}
   for(let attempt=0;attempt<4;attempt++){
    const replay=await write(index===0?a:a2,id,input);replies[index]=replay;
    if(replay.status===201)break;
    assert(replay.status===409&&publicCode(replay)==='OPERATION_PENDING'||[429,503].includes(replay.status),'REPLAY_RESPONSE_OUTSIDE_APPROVED_CONTRACT');await sleep(150);
   }
  }
  replies.forEach(r=>assertStatus(r,201));assert.deepEqual(replies[0].json,replies[1].json);assert.deepEqual(replies[0].json,consulted);otherProduct=replies[0].json.productId;
  const rows=(await tenant('SELECT (SELECT count(*) FROM catalog.products)::int AS products,(SELECT count(*) FROM inventory.operations WHERE id=$1)::int AS operations,(SELECT count(*) FROM inventory.audit WHERE operation_id=$1)::int AS audits',[id]))[0];
  assert.deepEqual(rows,{products:before+1,operations:1,audits:1});report.races.sameKey.stage='original-growth-settlement';report.races.sameKey.beforeSettlement=(await operationRows(id)).intent;const settled=await waitFor(()=>operationRows(id),value=>value.intent?.reservation_status==='SETTLED');assert.equal(settled.intent.status,'CONFIRMED');
  return {operationId:id,initialReplies,twoApiHttpConcurrency:true,singleProduct:true,singleAudit:true,knownIdQueryBeforeExplicitSameKeyReplay:true,originalGrowthSettled:true};
 },{dependsOn:['normalized-canonical-two-api-and-uc']});
 await caseOf('competing-sku-distinct-keys-two-api',['L2-A6','L2-A8'],async()=>{
  const ids=[randomUUID(),randomUUID()],sku=`RACE-${ids[0].slice(0,8)}`,inputs=[{sku,name:'SKU race A ficticio'},{sku,name:'SKU race B ficticio'}];
  report.races??={};report.races.sku={operationIds:ids,stage:'concurrent-post'};
  const replies=await Promise.all(ids.map((id,index)=>write(index===0?a:a2,id,inputs[index])));
  const initialReplies=replies.map(r=>({status:r.status,publicCode:r.json?.error??null}));
  for(let index=0;index<2;index++)for(let attempt=0;[429,503].includes(replies[index].status)&&attempt<4;attempt++){
   const observed=await operationRows(ids[index]);assert.notEqual(observed.intent?.status,'UNKNOWN','UNCERTAIN_SKU_REQUIRES_RECONCILIATION');
   await sleep(200);replies[index]=await write(index===0?a:a2,ids[index],inputs[index]);
  }
  report.races.sku.finalReplies=replies.map(r=>({status:r.status,publicCode:r.json?.error??null,resultState:r.json?.state??null,resultCode:r.json?.code??null}));report.races.sku.stage='verify-terminal-results';
  assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);
  const rejected=replies.find(r=>r.status===409);assert.equal(rejected.json.state,'REJECTED');assert.equal(rejected.json.code,'SKU_CONFLICT');
  const rows=(await tenant('SELECT (SELECT count(*) FROM catalog.products WHERE sku=$1)::int AS products,(SELECT count(*) FROM inventory.operations WHERE id=ANY($2::uuid[]))::int AS operations,(SELECT count(*) FROM inventory.audit WHERE operation_id=ANY($2::uuid[]))::int AS audits',[sku,ids]))[0];
  assert.deepEqual(rows,{products:1,operations:2,audits:2});
  for(const id of ids){const settled=await waitFor(()=>operationRows(id),v=>v.intent?.reservation_status==='SETTLED');assert(['CONFIRMED','REJECTED'].includes(settled.intent.status));}
  return {operationIds:ids,initialReplies,twoApiHttpConcurrency:true,oneSkuRow:true,twoTerminalAuditedResults:true,originalReservationsSettled:true};
 });
 await caseOf('two-receipts-sum-and-same-key-replay',['L2-A7'],async()=>{
  assert(product);const ids=[randomUUID(),randomUUID()],inputs=[{quantity:'7',reason:'Ficticio 1'},{quantity:'11',reason:'Ficticio 2'}];
  const replies=await Promise.all([write(a,ids[0],inputs[0],{productId:product}),write(a2,ids[1],inputs[1],{productId:product})]);
  const initialReplies=replies.map(r=>({status:r.status,publicCode:r.json?.error??null}));
  // Ordinary capacity may admit only one of two different intentions at once.
  // Preserve both original keys and inputs, observe their durable state, and
  // explicitly retry the same intention after the first HTTP resource ends.
  // UNKNOWN is never treated as absence and no counters/quotas are reset.
  for(let index=0;index<replies.length;index++)for(let attempt=0;replies[index].status!==201&&attempt<4;attempt++){
   assert([429,503].includes(replies[index].status),'RECEIPT_RESPONSE_OUTSIDE_APPROVED_CONTRACT');
   const observed=await operationRows(ids[index]);assert.notEqual(observed.intent?.status,'UNKNOWN','UNCERTAIN_RECEIPT_REQUIRES_RECONCILIATION');
   await sleep(200);replies[index]=await write(index===0?a:a2,ids[index],inputs[index],{productId:product});
  }
  replies.forEach(r=>assertStatus(r,201));
  assertStatus(await write(a2,ids[0],inputs[0],{productId:product}),201);
  const balance=(await tenant('SELECT on_hand::text AS quantity,version::text,(SELECT count(*) FROM inventory.movements WHERE product_id=$1)::int AS movements FROM inventory.balances WHERE product_id=$1',[product]))[0];assert.deepEqual(balance,{quantity:'18',version:'3',movements:2});
  const ledger=(await tenant('SELECT logical_bytes::text AS counted,inventory.logical_usage()::text AS actual FROM inventory.quota_state WHERE id=1'))[0];assert.equal(ledger.counted,ledger.actual);
  return {operationIds:ids,initialReplies,twoApiHttpConcurrency:true,sameOriginalKeysOnCapacityRetry:true,quantity:'18',movements:2,logicalCounterExact:true};
 },{dependsOn:['normalized-canonical-two-api-and-uc']});
 await caseOf('incompatible-key-and-own-result-privacy',['L2-A4','L2-A6','L2-A7'],async()=>{
  const id=randomUUID(),input={quantity:'3',reason:'Original ficticio'};assertStatus(await write(a,id,input,{productId:product}),201);
  const before=(await tenant('SELECT on_hand::text AS quantity,(SELECT count(*) FROM inventory.movements WHERE product_id=$1)::int AS movements FROM inventory.balances WHERE product_id=$1',[product]))[0];
  for(const [body,options] of [[{quantity:'4',reason:input.reason},{productId:product}],[{quantity:'3',reason:'Alterado ficticio'},{productId:product}],[input,{productId:otherProduct}]])assertStatus(await write(a2,id,body,options),409);
  const foreign=await send(teammate,`/api/tenants/${TENANT_A}/operations/${id}`);assertStatus(foreign,403);assert.deepEqual(foreign.json,{error:'ACCESS_DENIED'});
  assert.deepEqual((await tenant('SELECT on_hand::text AS quantity,(SELECT count(*) FROM inventory.movements WHERE product_id=$1)::int AS movements FROM inventory.balances WHERE product_id=$1',[product]))[0],before);
  return {operationId:id,productAndPayloadBound:true,otherActorHasNoResult:true,noAdditionalEffect:true};
 },{dependsOn:['normalized-canonical-two-api-and-uc','same-create-key-two-api-concurrent','two-receipts-sum-and-same-key-replay']});
 await caseOf('a-b-independent-data',['L2-A4'],async()=>{
  const id=randomUUID();assertStatus(await write(b,id,{sku:`ONLY-B-${id.slice(0,8)}`,name:'Empresa B ficticia'},{tenantId:TENANT_B}),201);
  assert.equal((await tenant('SELECT count(*)::int AS n FROM inventory.operations WHERE id=$1',[id],TENANT_A))[0].n,0);
  return {companyBOperationId:id,companyAHasNoForeignEffect:true};
 });
 await caseOf('owned-bounded-redacted-reads',['L2-A4','L2-A7'],async()=>{
  const read=await send(a,`/api/tenants/${TENANT_A}/inventory?limit=2`);assertStatus(read,200);assert.equal(read.json.tenantId,TENANT_A);assert(read.json.items.length<=2);assert(Buffer.byteLength(read.text)<=65536);
  const moves=await send(a2,`/api/tenants/${TENANT_A}/products/${product}/stock-movements?limit=2`);assertStatus(moves,200);assert(moves.json.items.length<=2);
  for(const row of moves.json.items)for(const field of ['actorId','email','reason','requestHash'])assert.equal(Object.hasOwn(row,field),false);
  return {boundedRead:true,movementDtoRedacted:true};
 },{dependsOn:['normalized-canonical-two-api-and-uc','two-receipts-sum-and-same-key-replay']});
 await caseOf('measured-aggregate-live-pools',['L2-A3'],async()=>{
  assertStatus(await send(a,`/api/tenants/${TENANT_A}/inventory?limit=2`),200);
  assertStatus(await send(a2,`/api/tenants/${TENANT_A}/inventory?limit=2`),200);
  const measured=await runMetadataAssay('pools');assert.equal(measured.status,'PASS FOR LISTED FRAGMENTS ONLY');
  return {sampleCount:measured.samples.length,samples:measured.samples,saturation:'NOT VERIFIED; bounded current workload only',fixedApiPools:4,fixedApiLeases:8};
 },{dependsOn:['owned-bounded-redacted-reads','two-receipts-sum-and-same-key-replay']});
 await caseOf('delayed-original-writer-revocation-close-v-plus-two',['L2-A5','L2-A8'],async()=>{
  assert(product);const id=randomUUID(),gate=await arm({instance:'api1',stage:'write.beforeTenant',tenantId:TENANT_A});let pending;
  const before=(await tenant('SELECT on_hand::text AS quantity FROM inventory.balances WHERE product_id=$1',[product]))[0].quantity;
  try{
   pending=write(member,id,{quantity:'5',reason:'Revocación ficticia'},{productId:product});const event=await waitEvent(gate);assert.equal(event.operationId,id);
   const old=await operationRows(id);assert.equal(old.intent.status,'EXECUTING');const restrictionId=await requestRestriction({identityId:MEMBER,action:'inventory.receive'});
   const acknowledged=(await restrictionAck(restrictionId))[0];assert.equal(acknowledged.close_proven,true);assert.equal(BigInt(acknowledged.closed_version),BigInt(acknowledged.open_version)+1n);assert.equal(BigInt(acknowledged.reopen_version),BigInt(acknowledged.open_version)+2n);
   const closed=await operationRows(id);assert.equal(closed.local,null);assert.equal(closed.intent.status,'REJECTED');assert.equal(closed.intent.writer_version,old.intent.writer_version);assert.equal(closed.intent.tenant_bytes_reserved,'32768');assert.equal(closed.intent.reservation_status,'PROJECTED');assert(['ACTIVE','UNCERTAIN'].includes(closed.intent.ticket_state));
   await release(gate);const reply=await pending;assertStatus(reply,403);
   const fence=(await tenant('SELECT state,writer_version FROM inventory.writer_fence WHERE id=1'))[0];assert.equal(fence.state,'OPEN');assert.equal(fence.writer_version,acknowledged.reopen_version);
   const usageBefore=await counters();assertStatus(await write(member,randomUUID(),{quantity:'1',reason:'Revocado'},{productId:product}),403);assert.deepEqual(await counters(),usageBefore);
   assert.equal((await tenant('SELECT on_hand::text AS quantity FROM inventory.balances WHERE product_id=$1',[product]))[0].quantity,before);
   const freshId=randomUUID();assertStatus(await write(a2,freshId,{quantity:'1',reason:'Miembro vigente'},{productId:product}),201);
   return {operationId:id,restrictionId,oldWriterVersion:old.intent.writer_version,closedWriterVersion:acknowledged.closed_version,reopenedWriterVersion:acknowledged.reopen_version,noEffectAfterAck:true,oldVersionPreserved:true,resourcesRetainedUntilResponse:true,currentMemberNewIntent:true};
  }finally{await release(gate).catch(()=>{});if(pending)await pending.catch(()=>{})}
 },{dependsOn:['normalized-canonical-two-api-and-uc','incompatible-key-and-own-result-privacy']});
 await caseOf('lost-after-tenant-commit-retains-unknown-and-durable-effect',['L2-A5','L2-A7','L2-A8'],async()=>{
  assert(product);const id=randomUUID(),gate=await arm({instance:'api1',stage:'write.afterTenantCommit',tenantId:TENANT_A,action:'reject'}),input={quantity:'2',reason:'ACK perdido ficticio'};
  try{
   const reply=await write(a,id,input,{productId:product});assertStatus(reply,503);assert.deepEqual(reply.json,{error:'WRITE_UNCERTAIN'});const event=await waitEvent(gate);
   const rows=await operationRows(id);assert.equal(rows.local.status,'CONFIRMED');assert.equal(rows.local.result.operationId,id);assert.equal(rows.intent.status,'UNKNOWN');assert.equal(rows.intent.tenant_bytes_reserved,'32768');assert.equal(rows.intent.reservation_status,'RESERVED');assert.equal(rows.intent.ticket_state,'UNCERTAIN');
   assert.equal((await tenant('SELECT count(*)::int AS n FROM inventory.movements WHERE operation_id=$1',[id]))[0].n,1);
   const restrictionId=await requestRestriction({identityId:TEAMMATE,action:'catalog.create'});await restrictionAck(restrictionId);
   const projected=await operationRows(id);assert.equal(projected.intent.status,'CONFIRMED');assert.equal(projected.intent.reservation_status,'PROJECTED');assert.equal(projected.intent.tenant_bytes_reserved,'32768');assert.equal(projected.intent.ticket_state,'UNCERTAIN');
   const retention=await observeUncertainRetention({qa,sourceSha,operationId:id,event,readCentral:central,apiClients:{api1:a,api2:a2}});
   lost={operationId:id,tenantId:TENANT_A,productId:product,input,ticketId:rows.intent.ticket_id,restrictionId};
   report.recovery={operationId:id,tenantId:TENANT_A,productId:product,ticketId:rows.intent.ticket_id,restrictionId,ownerInstance:'api1',httpFinished:true,requiresPositiveProcessAndSqlEnd:true,httpQueryAndReplay:'NOT VERIFIED until own ticket and resource reconciliation',inputHash:rows.local.request_hash};
   return {operationId:id,restrictionId,uuidKnownBeforeSend:true,tenantEffectDurable:true,centralUnknownObserved:true,projectedOnlyAfterProvenFence:true,noEffectRetry:true,uncertainTicketAndFullGrowthRetained:true,retention};
  }finally{await release(gate).catch(()=>{})}
 },{dependsOn:['delayed-original-writer-revocation-close-v-plus-two']});
}catch(error){report.runnerFailure={code:typeof error.code==='string'&&/^[A-Z0-9_]{1,60}$/.test(error.code)?error.code:'RUNNER_BLOCKED',completedCases:report.cases.length}}
finally{
 report.finishedAt=new Date().toISOString();report.requests=clients.map(({label,client})=>({label,count:client.requests,max:160}));report.status=report.runnerFailure||report.cases.some(c=>c.status==='FAIL')?'FAIL':'PASS FOR LISTED CASES ONLY';
 report.functionalLotClosed=false;report.recoveryDetailsPrivate=Boolean(lost);await persist();await Promise.all([...pools.values()].map(p=>p.end()));
 console.log(JSON.stringify({status:report.status,sourceSha,cases:report.cases.map(({id,status})=>({id,status})),report:reportFile,secretsPrinted:false}));
 if(report.status==='FAIL')process.exitCode=1;
}
