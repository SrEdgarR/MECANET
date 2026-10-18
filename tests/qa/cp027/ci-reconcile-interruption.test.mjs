import test from 'node:test';
import assert from 'node:assert/strict';
import {createReconciliationInterruption} from '../../integration/development-reconcile-probe.mjs';
test('one reconciliation response is discarded only after SQL returned; the next query uses the same pool',async()=>{
 let queries=0;const response={rows:[{synthetic:true}]},connection={};const pool={query:async()=>{queries++;return response},connect:async()=>connection};const probe=createReconciliationInterruption(pool);
 await assert.rejects(probe.pool.query('SYNTHETIC RECONCILE'),e=>e.code==='ECONNRESET');
 assert.equal(queries,1);assert.deepEqual(probe.snapshot(),{schema:'cp027-reconcile-read-loss-v1',dispatches:1,acknowledgedResponses:1,discardedResponses:1,firstRowCount:1});
 assert.equal(await probe.pool.query('SYNTHETIC RECONCILE'),response);assert.equal(queries,2);assert.equal(await probe.pool.connect(),connection);assert.equal(probe.snapshot().discardedResponses,1);
});
test('a SQL failure is never converted into an acknowledged response or a new retry',async()=>{
 const error=Object.assign(Error('SYNTHETIC_UNKNOWN'),{code:'08006'});let queries=0;const probe=createReconciliationInterruption({query:async()=>{queries++;throw error},connect:async()=>{throw Error('UNUSED')}});
 await assert.rejects(probe.pool.query('SYNTHETIC'),e=>e===error);assert.equal(queries,1);assert.deepEqual(probe.snapshot(),{schema:'cp027-reconcile-read-loss-v1',dispatches:1,acknowledgedResponses:0,discardedResponses:0,firstRowCount:null});
});
