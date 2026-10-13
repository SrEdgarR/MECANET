// Preregistered bounded CP017 probes. Policy changes are performed separately
// by the private closed coordinator. This harness never increases a limit,
// writes business rows directly, opens a fence or releases a resource debt.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {canonicalWrite} from '../../../server/saas/writes/validation.js';
import {createQaClient,assertStatus} from '../cp014/http-client.mjs';
import {withQaInspection,sanitizeSqlFailure} from './sql-live.mjs';
const PROJECT='mecanet-qa-p1l2-cp017',A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const PHASES=['privileges','unicode','last-product','last-byte','debt'];
const decimal=/^(0|[1-9][0-9]{0,18})$/;
const labels=new Set(['DML_BALANCE','DELETE_MOVEMENT','FENCE_UPDATE','DDL','ROLE_ELEVATION','EXTENSION','FOREIGN_B','FOREIGN_CONTROL','FOREIGN_ADMIN','READER_WRITER_FUNCTION','SQL_INPUT','FORGED_TENANT']);
export async function assertSqlDenied(operation,expected,label){
 if(!labels.has(label)||!Array.isArray(expected)||expected.some(code=>!/^[A-Z0-9]{5}$/.test(code)))throw new Error('QA_DENIAL_LABEL_INVALID');
 let caught;try{await operation()}catch(error){caught=error}
 if(!caught)throw Object.assign(new Error(`SQL_DENIAL_MISSING_${label}`),{code:'ERR_ASSERTION'});
 if(!expected.includes(caught.code))throw Object.assign(new Error(`SQL_DENIAL_UNEXPECTED_${label}`),{code:/^[A-Z0-9]{5}$/.test(caught.code??'')?caught.code:'QA_DENIAL_FAILED'});
 return{label,sqlState:caught.code,denied:true};
}
export function checkBoundary({phase,state,quota,proof}){
 if(!['last-product','last-byte','debt'].includes(phase)||![A,B].includes(state?.tenant_id))throw new Error('QA_QUOTA_BOUNDARY_REQUIRED');
 for(const value of [state.used_products,state.reserved_products,state.used_bytes,state.reserved_bytes,state.max_products,state.max_logical_bytes,quota.active_products,quota.logical_bytes,quota.max_products,quota.max_logical_bytes])if(!decimal.test(value??''))throw new Error('QA_QUOTA_COUNTER_INVALID');
 assert.equal(state.state,'OPEN');assert.equal(state.policy_version,quota.policy_version);assert.equal(state.max_products,quota.max_products);assert.equal(state.max_logical_bytes,quota.max_logical_bytes);
 if(BigInt(state.max_products)>300n||BigInt(state.max_logical_bytes)>536870912n)throw new Error('QA_QUOTA_BASELINE_EXCEEDED');
 if(proof?.phase!==phase||proof.tenantId!==state.tenant_id||proof.policyVersion!==state.policy_version||proof.maxProducts!==state.max_products||proof.maxLogicalBytes!==state.max_logical_bytes||proof.limitRaised!==false)throw new Error('QA_QUOTA_POLICY_PROOF_REQUIRED');
 const productDebt=BigInt(state.used_products)+BigInt(state.reserved_products),byteDebt=BigInt(state.used_bytes)+BigInt(state.reserved_bytes);
 if(phase==='last-product'&&(BigInt(state.reserved_products)!==0n||BigInt(state.max_products)!==productDebt+1n))throw new Error('QA_QUOTA_LAST_PRODUCT_REQUIRED');
 if(phase==='last-byte'&&(BigInt(state.reserved_bytes)!==0n||BigInt(state.max_logical_bytes)!==byteDebt+32767n))throw new Error('QA_QUOTA_LAST_BYTE_REQUIRED');
 if(phase==='debt'&&BigInt(state.max_products)>=productDebt&&BigInt(state.max_logical_bytes)>=byteDebt)throw new Error('QA_QUOTA_REDUCTION_UNDER_DEBT_REQUIRED');
 return{productDebt:productDebt.toString(),byteDebt:byteDebt.toString(),phase};
}
async function role(qa,name,fn,extra={}){
 const config=qa.connections[name];if(!config||config.host!=='postgres'||!config.ssl?.rejectUnauthorized)throw new Error('QA_QUOTA_ROLE_REQUIRED');
 const pool=await createPgPool({...config,...extra,max:1,connectionTimeoutMillis:2000,statement_timeout:2000,application_name:'mecanet-cp017-negative-role'});
 try{return await fn(pool)}finally{await pool.end()}
}
async function snapshot(qa,tenantId){
 const database=tenantId===A?'mecanet_tenant_a':'mecanet_tenant_b';
 const central=await withQaInspection(qa,'mecanet_control',async p=>({
  state:(await p.query('SELECT * FROM saas.tenant_writer_state WHERE tenant_id=$1',[tenantId])).rows[0],
  growth:(await p.query("SELECT status,count(*)::text AS n,coalesce(sum(tenant_bytes_reserved),0)::text AS bytes FROM saas.write_growth_reservations WHERE tenant_id=$1 GROUP BY status ORDER BY status",[tenantId])).rows,
  ledger:(await p.query("SELECT coalesce(sum(qh),0)::text AS qh,coalesce(sum(qc),0)::text AS qc,coalesce(sum(qt),0)::text AS qt FROM saas.windows WHERE scope_key=$1",[`tenant:${tenantId}`])).rows[0],
 }));
 const local=await withQaInspection(qa,database,async p=>({
  quota:(await p.query('SELECT * FROM inventory.quota_state WHERE id=1')).rows[0],
  fence:(await p.query('SELECT * FROM inventory.writer_fence WHERE id=1')).rows[0],
  sums:(await p.query('SELECT inventory.logical_usage()::text AS actual,(SELECT count(*) FROM catalog.products)::text AS products,(SELECT count(*) FROM inventory.operations)::text AS operations,(SELECT count(*) FROM inventory.movements)::text AS movements,(SELECT count(*) FROM inventory.audit)::text AS audits')).rows[0],
 }));
 assert.equal(local.quota.logical_bytes,local.sums.actual);assert.equal(local.quota.active_products,local.sums.products);assert.equal(local.sums.operations,local.sums.audits);
 for(const key of ['generation','data_epoch','writer_version','state'])assert.equal(central.state[key],local.fence[key]);
 return{...central,...local};
}
async function clients(tenantId){
 const [login,ca]=await Promise.all([readFile('/run/qa-secrets/fixture-login.json','utf8').then(JSON.parse),readFile('/run/qa-ca.crt')]);
 const first=createQaClient({instance:'api1',purpose:'company',ca,login:{email:tenantId===A?'teammate@qa.invalid':'b@qa.invalid',password:login.password},budget:24});await first.login();
 const second=createQaClient({instance:'api2',purpose:'company',ca,budget:24});second.setCookies(first.cookieHeader());second.csrf=first.csrf;return[first,second];
}
const post=(client,tenantId,epoch,id,input,productId=null)=>client.request(productId?`/api/tenants/${tenantId}/products/${productId}/stock-receipts`:`/api/tenants/${tenantId}/products`,{method:'POST',body:input,headers:{'Idempotency-Key':id,'X-Data-Epoch':epoch}});
async function waitSettled(qa,tenantId){const end=performance.now()+6500;while(performance.now()<end){const value=await snapshot(qa,tenantId);if(value.state.reserved_bytes==='0')return value;await new Promise(resolve=>setTimeout(resolve,40))}throw new Error('QA_QUOTA_RESOURCES_NOT_SETTLED')}
async function privileges(qa){
 const facts=[];
 for(const [label,sql]of [['DML_BALANCE','UPDATE inventory.balances SET on_hand=0'],['DELETE_MOVEMENT','DELETE FROM inventory.movements'],['FENCE_UPDATE',"UPDATE inventory.writer_fence SET state='OPEN'"],['DDL','CREATE TABLE catalog.forged(id int)'],['ROLE_ELEVATION','SET ROLE saas_owner_a'],['EXTENSION','CREATE EXTENSION dblink']])facts.push(await role(qa,'saas_writer_a',p=>assertSqlDenied(()=>p.query(sql),['42501'],label)));
 for(const [label,database]of [['FOREIGN_B','mecanet_tenant_b'],['FOREIGN_CONTROL','mecanet_control'],['FOREIGN_ADMIN','postgres']])facts.push(await assertSqlDenied(()=>role(qa,'saas_writer_a',p=>p.query('SELECT 1'),{database}),['42501','28000'],label));
 facts.push(await role(qa,'saas_tenant_a',p=>assertSqlDenied(()=>p.query('SELECT * FROM inventory.create_product($1,$2,$3,$4,2,1)',[randomUUID(),'[]','0'.repeat(64),qa.generation]),['42501'],'READER_WRITER_FUNCTION')));
 const fence=(await snapshot(qa,A)).fence;
 for(const [label,text]of [['SQL_INPUT','SELECT pg_sleep(1)'],['FORGED_TENANT',JSON.stringify(['mecanet-write-v1',B,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','catalog.create',fence.data_epoch,null,['FORGED','forged']])]])facts.push(await role(qa,'saas_writer_a',p=>assertSqlDenied(()=>p.query('SELECT * FROM inventory.create_product($1,$2,$3,$4,$5,$6)',[randomUUID(),text,createHash('sha256').update(text).digest('hex'),fence.generation,fence.data_epoch,fence.writer_version]),['P0001'],label)));
 return{facts,successfulDirectBusinessWrites:0};
}
async function boundaryProof(qa,phase,before){
 const proof=JSON.parse(await readFile('/run/qa-results/quota-proof.json','utf8'));
 if(proof.project!==PROJECT||proof.sourceSha!==process.env.QA_CODE_SHA||proof.generation!==qa.generation)throw new Error('QA_QUOTA_POLICY_PROOF_REQUIRED');
 checkBoundary({phase,state:before.state,quota:before.quota,proof});
 const rows=await withQaInspection(qa,'mecanet_control',async p=>(await p.query("SELECT r.reason_code,r.status,r.active,t.close_proven,t.stage,t.reopen_version FROM saas.write_restrictions r JOIN saas.write_restriction_tenants t ON t.restriction_id=r.id WHERE r.id=$1 AND t.tenant_id=$2",[proof.restrictionId,before.state.tenant_id])).rows);
 const row=rows[0];if(!row||row.reason_code!=='POLICY'||row.status!=='ACKNOWLEDGED'||row.active||!row.close_proven||row.stage!=='OPEN'||row.reopen_version!==before.fence.writer_version)throw new Error('QA_QUOTA_SYNCHRONIZED_POLICY_REQUIRED');
 return proof;
}
async function quotaCase(qa,phase,tenantId){
 const before=await snapshot(qa,tenantId),[first,second]=await clients(tenantId),epoch=before.fence.data_epoch;
 if(phase!=='unicode')await boundaryProof(qa,phase,before);
 if(phase==='unicode'){
  if(before.state.reserved_bytes!=='0')throw new Error('QA_QUOTA_QUIESCENT_REQUIRED');
  const id=randomUUID(),input={sku:`U${'A'.repeat(55)}${id.slice(0,8)}`,name:'\u0001'.repeat(200)};
  const response=await post(first,tenantId,epoch,id,input);assertStatus(response,201);const product=response.json.productId;
  const receipt=randomUUID(),reason='\u0001'.repeat(160);assertStatus(await post(second,tenantId,epoch,receipt,{quantity:'1000000',reason},product),201);
  const after=await waitSettled(qa,tenantId),actor=tenantId===A?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const canonical=canonicalWrite({tenantId,actorId:actor,action:'catalog.create',dataEpoch:epoch,input});
  const measured=await withQaInspection(qa,tenantId===A?'mecanet_tenant_a':'mecanet_tenant_b',async p=>{
   const productRow=(await p.query("SELECT name,char_length(name)::int AS length,inventory.logical_cost('product',to_jsonb(p))::text AS cost FROM catalog.products p WHERE id=$1",[product])).rows[0];assert.equal(productRow.name,input.name);assert.equal(productRow.length,200);
   const movement=(await p.query("SELECT reason,char_length(reason)::int AS length,inventory.logical_cost('movement',to_jsonb(m))::text AS cost FROM inventory.movements m WHERE operation_id=$1",[receipt])).rows[0];assert.equal(movement.reason,reason);assert.equal(movement.length,160);
   const operation=(await p.query('SELECT request_hash FROM inventory.operations WHERE id=$1',[id])).rows[0];assert.equal(operation.request_hash,canonical.requestHash);
   assert(BigInt(productRow.cost)<=4352n&&BigInt(movement.cost)<=4352n);
   return{productCost:productRow.cost,movementCost:movement.cost,namePoints:productRow.length,reasonPoints:movement.length,storedTextExact:true,sqlDigestMatchesCanonical:true};
  });
  assert(BigInt(after.quota.logical_bytes)>BigInt(before.quota.logical_bytes));assert.equal(BigInt(after.sums.movements)-BigInt(before.sums.movements),1n);
  return{before,after,measured,tenantDelta:(BigInt(after.quota.logical_bytes)-BigInt(before.quota.logical_bytes)).toString(),successfulDirectBusinessWrites:0,metadataWorstCase:'NOT VERIFIED; this phase measures real operation metadata, not the global journal boundary'};
 }
 if(phase==='last-product'){
  const ids=[randomUUID(),randomUUID()];const results=await Promise.all(ids.map((id,index)=>post(index===0?first:second,tenantId,epoch,id,{sku:`LAST-${id.slice(0,8)}`,name:'last product fixture'})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,429]);const after=await waitSettled(qa,tenantId);assert.equal(BigInt(after.sums.products)-BigInt(before.sums.products),1n);assert.equal(after.state.used_products,after.state.max_products);
  return{before,after,accepted:1,denied:1,distinctApi:true,oneLastProduct:true};
 }
 const product=qa.fixture.tenants.find(t=>t.id===tenantId)?.products[0]?.id;if(!product)throw new Error('QA_QUOTA_SOURCE_PRODUCT_REQUIRED');
 const id=randomUUID(),response=await post(first,tenantId,epoch,id,{quantity:'1',reason:'quota boundary fixture'},product);assertStatus(response,429);
 const after=await snapshot(qa,tenantId);assert.deepEqual(after.quota,before.quota);assert.deepEqual(after.sums,before.sums);assert.deepEqual(after.growth,before.growth);
 for(const key of ['used_products','used_bytes','reserved_products','reserved_bytes'])assert.equal(after.state[key],before.state[key]);
 for(const key of ['qh','qc','qt'])assert(BigInt(after.ledger[key])>=BigInt(before.ledger[key]));
 return{before,after,noBusinessEffect:true,noIntentGrowth:true,noDebtReset:true,reservationBytesRequired:'32768',lastReservableByte:phase==='last-byte',physicalBytesCapacity:'NOT VERIFIED'};
}
export const QUOTA_PREREGISTRATION=Object.freeze({project:PROJECT,phases:PHASES,httpLimitPerClient:24,sqlRoleMax:1,statementMs:2000,tenantByteReservation:'32768',maximumProducts:'300',maximumLogicalBytes:'536870912',policyChanges:'external closed private coordinator; only lower limits',cleanup:'leave lowered limit; no automatic restore/reset',positives:'HTTP only',stillNotVerified:['credential rotation and aggregated pool ceiling','global metadata/journal boundary','exact local byte rejection inside a valid admitted operation']});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report={status:'FAIL',preregistration:QUOTA_PREREGISTRATION,sourceSha:process.env.QA_CODE_SHA,phase:process.env.QA_QUOTA_PHASE,observedAt:new Date().toISOString(),secretsPrinted:false};
 try{
  if(process.env.QA_PROJECT!==PROJECT||!PHASES.includes(report.phase)||!/^[0-9a-f]{40}$/.test(report.sourceSha??''))throw new Error('QA_QUOTA_EXACT_ENVIRONMENT_REQUIRED');
  const tenantId=process.env.QA_QUOTA_TENANT??A;if(![A,B].includes(tenantId))throw new Error('QA_QUOTA_TENANT_REQUIRED');
  const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
  report.harnessSha256=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
  report.result=report.phase==='privileges'?await privileges(qa):await quotaCase(qa,report.phase,tenantId);report.status='PASS';
 }catch(error){Object.assign(report,sanitizeSqlFailure(error));if(/^(QA_QUOTA_|SQL_DENIAL_)[A-Z0-9_]{1,80}$/.test(error.message??''))report.fixedFailure=error.message;process.exitCode=1}
 await writeFile(`/run/qa-results/quota-${PHASES.includes(report.phase)?report.phase:'invalid'}.json`,JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
}
