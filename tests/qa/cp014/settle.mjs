// Private synthetic cohort only. No lease/TTL release: positive runner/SQL/response proof.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createPgPool} from '/workspace/server/saas/db/pools.js';
import {createReconciler} from '/workspace/server/saas/admission/maintenance.js';
assert.equal(process.env.QA_PROJECT,'mecanet-qa-p1l1-cp014');
const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
const proof=JSON.parse(await readFile('/run/qa-results/admission-runner-proof.json','utf8'));
assert.equal(proof.project,process.env.QA_PROJECT);assert.equal(proof.generation,qa.generation);
assert.equal(proof.tenantBackendCount,0);assert.equal(proof.runners.length,2);
for(const r of proof.runners){assert.equal(r.observedState,'exited');assert.equal(r.running,false);assert.equal(r.apiBackendCount,0);assert.equal(r.responseEndpointsStopped,true);assert(r.finishedAt&&/^[a-f0-9]{64}$/.test(r.containerId));}
const reader=await createPgPool({...qa.connections.saas_api,max:1});
const pool=await createPgPool({...qa.connections.saas_reconciler,max:1});
const verify=async({owner})=>{const r=proof.runners.find(r=>r.owner===owner);assert(r,'The exact old owner must have actual end proof');return {runnerStopped:true,sqlSettled:true,responseSettled:true,reference:`cp014:docker-exited:${r.containerId}`}};
const good=createReconciler({pool,generation:qa.generation,verifyRunnerStopped:verify});
const bad=createReconciler({pool,generation:qa.generation,verifyRunnerStopped:async()=>({runnerStopped:false,sqlSettled:true,responseSettled:true,reference:'cp014:not-proven'})});
try{
 const owners=proof.runners.map(r=>r.owner);
 const totals=async()=>(await reader.query('SELECT scope_key,sum(qh)::text qh,sum(qc)::text qc,sum(qt)::text qt FROM saas.windows GROUP BY scope_key ORDER BY scope_key')).rows;
 const before=await totals();
 for(let n=0;n<17;n++){
  await good.detectAbandoned();await good.expireWaiting();
  const active=(await reader.query("SELECT count(*)::int n FROM saas.tickets WHERE owner=ANY($1::uuid[]) AND state='ACTIVE'",[owners])).rows[0].n;
  if(!active)break;assert(n<16,'Abandoned detection deadline');await delay(1000);
 }
 const debts=(await reader.query("SELECT id,owner,reserved_qc,reserved_qt FROM saas.tickets WHERE owner=ANY($1::uuid[]) AND state='UNCERTAIN' ORDER BY id",[owners])).rows;
 assert(debts.length<=20,'Finite synthetic cleanup envelope');
 for(const debt of debts){
  await assert.rejects(bad.reconcile(debt.id),{code:'END_NOT_PROVEN'});
  assert.equal((await reader.query('SELECT state FROM saas.tickets WHERE id=$1',[debt.id])).rows[0].state,'UNCERTAIN');
  assert.equal((await good.reconcile(debt.id)).state,'FINISHED');
 }
 assert.deepEqual(await totals(),before,'Never refund consumed QH/QC/Qt');
 const remaining=(await reader.query("SELECT count(*)::int n FROM saas.tickets WHERE owner=ANY($1::uuid[]) AND state IN ('ACTIVE','WAITING','UNCERTAIN')",[owners])).rows[0].n;assert.equal(remaining,0);
 const result={result:'PASS',at:new Date().toISOString(),reconciled:debts.length,unprovenEndDenied:debts.length,consumptionPreserved:true,oldRunnersEnded:2,tenantBackends:0};
 await writeFile('/run/qa-results/settlement-'+Date.now()+'.json',JSON.stringify(result),{mode:0o600});console.log(JSON.stringify(result));
}finally{await Promise.allSettled([reader.end(),pool.end()]);}
