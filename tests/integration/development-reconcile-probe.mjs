// Private fault injection: discard exactly one real, acknowledged SELECT result.
// No SQL retry, response synthesis, owner acquisition or mutation belongs here.
import assert from 'node:assert/strict';
export function createReconciliationInterruption(pool){
 assert.ok(typeof pool?.query==='function'&&typeof pool.connect==='function','RECONCILIATION_POOL_REQUIRED');
 const counts={dispatches:0,acknowledgedResponses:0,discardedResponses:0,firstRowCount:null};
 return{pool:{connect:(...args)=>pool.connect(...args),query:async(...args)=>{
  counts.dispatches++;const result=await pool.query(...args);counts.acknowledgedResponses++;
  if(counts.discardedResponses===0){assert.ok(Array.isArray(result?.rows),'RECONCILIATION_SQL_RESPONSE_REQUIRED');counts.firstRowCount=result.rows.length;counts.discardedResponses++;throw Object.assign(Error('DEVELOPMENT_RECONCILIATION_RESPONSE_DROPPED'),{code:'ECONNRESET'})}
  return result;
 }},snapshot:()=>Object.freeze({schema:'cp027-reconcile-read-loss-v1',...counts})};
}
