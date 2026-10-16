import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { serializable } from '../../../server/saas/admission/transaction.js';
import { createClock } from '../../../server/saas/admission/clock.js';

const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const previousOwner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const owner='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('expired in-flight SQL without a ROLLBACK ACK remains uncertain, never known busy',async()=>{
 let releaseError,sqlCount=0;
 const pool={async connect(){return{query(){sqlCount++;return new Promise(()=>{})},release(error){releaseError=error}}}};
 await assert.rejects(serializable(pool,()=>1,{deadline:performance.now()+30}),error=>{
  assert.equal(error.code,'ROLLBACK_UNCERTAIN');assert.equal(error.operationCause?.code,'ADMISSION_BUSY');
  assert.equal(error.admissionDiagnostic.sqlEnd,'UNKNOWN');assert.equal(error.admissionDiagnostic.triggerReason,'QUERY_DEADLINE');
  assert.equal(error.admissionDiagnostic.failureStatement,'BEGIN');assert.equal(error.admissionDiagnostic.lastPositiveSqlFin,null);return true;
 });
 assert.equal(sqlCount,1);assert.ok(releaseError);
});

test('clock retains uncertainty after an advance SQL deadline until positive reconciliation',async()=>{
 let clockNow=0,stalled=false,sqlCount=0,releaseError;
 const row={generation,tick:'0',clock_version:'0',owner:previousOwner};
 const query=async(sql,args=[])=>{
  sqlCount++;
  if(stalled&&sql.startsWith('UPDATE saas.admission_fence SET tick'))return new Promise(()=>{});
  if(sql.startsWith('SELECT generation')||sql.startsWith('SELECT owner'))return{rows:[{...row}]};
  if(sql.startsWith('UPDATE saas.admission_fence SET clock_version'))row.clock_version=args[0];
  if(sql.startsWith('UPDATE saas.time_authority SET owner')){row.owner=args[0];row.clock_version=args[1]}
  return{rows:[],rowCount:1};
 };
 const pool={query,async connect(){return{query,release(error){releaseError=error}}}};
 const clock=createClock({pool,generation,owner,now:()=>clockNow});
 await clock.acquire(previousOwner);clockNow=100;stalled=true;
 await assert.rejects(clock.advance(),{code:'ROLLBACK_UNCERTAIN'});
 assert.equal(clock.state().uncertain,true);assert.ok(releaseError);
 const afterFailure=sqlCount;clockNow=10000;assert.equal(await clock.advance(),false);assert.equal(sqlCount,afterFailure);
});

test('three acknowledged conflict rollbacks produce one typed bounded diagnostic',async()=>{
 const events=[];let attempts=0;
 const pool={async connect(){return{async query(){return{rows:[]}},release(){}}}};
 await assert.rejects(serializable(pool,()=>{attempts++;throw Object.assign(Error('private query and password'),{code:'40001',detail:'private-value'})},{onDiagnostic:event=>events.push(event)}),error=>{
  assert.equal(error.code,'ADMISSION_BUSY');assert.equal(error.admissionDiagnostic?.reason,'CONFLICT_RETRY_EXHAUSTED');return true;
 });
 assert.equal(attempts,3);assert.equal(events.length,1);
 const report=events[0];assert.equal(report.schema,'admission-transaction-diagnostic-v1');
 assert.equal(report.attempts,3);assert.equal(report.conflicts,3);assert.equal(report.lastConflictCode,'40001');
 assert.equal(report.sqlEnd,'ROLLBACK_ACK');assert.equal(report.lastPositiveSqlFin.kind,'ROLLBACK_ACK');
 assert.equal(report.phase,'work');assert.equal(report.outcome,'REJECTED');
 assert.ok(Object.isFrozen(report)&&Object.isFrozen(report.lastPositiveSqlFin));
 assert.equal(JSON.stringify(report).includes('private'),false);
});

test('clock diagnostic binds its owner, transfer and acquisition without adopting error payloads',async()=>{
 let clockNow=0,fail=false;const events=[];
 const row={generation,tick:'0',clock_version:'0',owner:previousOwner};
 const query=async(sql,args=[])=>{
  if(fail&&sql.startsWith('UPDATE saas.admission_fence SET tick'))throw Object.assign(Error('secret credentials'),{code:'40001',owner:'private'});
  if(sql.startsWith('SELECT generation')||sql.startsWith('SELECT owner'))return{rows:[{...row}]};
  if(sql.startsWith('UPDATE saas.admission_fence SET clock_version'))row.clock_version=args[0];
  if(sql.startsWith('UPDATE saas.time_authority SET owner')){row.owner=args[0];row.clock_version=args[1]}
  return{rows:[],rowCount:1};
 };
 const clock=createClock({pool:{query,async connect(){return{query,processID:27182,release(){}}}},generation,owner,now:()=>clockNow,onDiagnostic:event=>events.push(event)});
 await clock.acquire(previousOwner);fail=true;clockNow=100;
 await assert.rejects(clock.advance(),{code:'ADMISSION_BUSY'});
 const report=clock.diagnostic();assert.equal(report.schema,'admission-clock-diagnostic-v1');
 assert.equal(report.owner,owner);assert.equal(report.generation,generation);assert.equal(report.operation,'advance');
 assert.deepEqual(report.transfer,{state:'NONE',transferId:null,previousOwner:null,nextOwner:owner});
 assert.equal(report.acquisitionSequence,1);assert.equal(report.transaction.reason,'CONFLICT_RETRY_EXHAUSTED');
 assert.equal(report.transaction.backendPid,27182);assert.equal(report.transaction.failureStatement,'CLOCK_FENCE_CAS');
 assert.equal(report.transaction.lastPositiveSqlFin.kind,'ROLLBACK_ACK');assert.equal(report.lastConfirmedClock.tick,'0');
 assert.equal(report.lastConfirmedClock.version,'1');assert.equal(report.uncertain,false);
 assert.equal(report.ticketSnapshot,'NOT_OBSERVED');assert.equal(events.length,2);
 assert.equal(JSON.stringify(report).includes('secret'),false);assert.ok(Object.isFrozen(report));
});

test('diagnostic sink failure cannot alter a confirmed control transaction',async()=>{
 const pool={async connect(){return{async query(){return{rows:[]}},release(){}}}};
 assert.equal(await serializable(pool,()=>42,{onDiagnostic(){throw Error('private sink unavailable')}}),42);
 assert.equal(await serializable(pool,()=>43,{async onDiagnostic(){throw Error('private asynchronous sink unavailable')}}),43);
 await new Promise(setImmediate);
});

test('malformed transfer slots cannot enlarge or inject a private clock diagnostic',async()=>{
 const runId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const row={generation,tick:'0',clock_version:'0',owner:previousOwner,recovery_id:runId};
 const query=async sql=>({rows:sql.startsWith('SELECT generation')||sql.startsWith('SELECT owner')?[row]:[]});
 const clock=createClock({pool:{async connect(){return{query,release(){}}}},generation,owner,recoveryTransfer:{generation,nextOwner:owner,previousOwner,runId,manifestHash:'a'.repeat(64),expectedClockVersion:'0',expectedTick:'0',transferId:'PRIVATE-UNBOUNDED-'.repeat(20000)}});
 await assert.rejects(clock.acquire(previousOwner),{code:'CLOCK_OWNER_CONFLICT'});
 assert.equal(clock.diagnostic().transfer.transferId,null);assert.equal(clock.diagnostic().transfer.previousOwner,previousOwner);
 assert.ok(JSON.stringify(clock.diagnostic()).length<4096);assert.equal(JSON.stringify(clock.diagnostic()).includes('PRIVATE'),false);
});
