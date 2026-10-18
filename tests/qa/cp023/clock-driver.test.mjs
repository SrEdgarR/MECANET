import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AdmissionError} from '../../../server/saas/admission/transaction.js';
import {createClock} from '../../../server/saas/admission/clock.js';
import {createDevelopmentClockDriver} from '../../integration/development-clock-driver.mjs';

const owner='cccccccc-cccc-4ccc-8ccc-cccccccccccc',generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture({mutate=()=>{},errorCode='ADMISSION_BUSY',untyped=false}={}){
 let state={tick:'7',version:'8',uncertain:false,stopped:false},calls=0,stops=0,error,report;
 const tx=()=>Object.freeze({schema:'admission-transaction-diagnostic-v1',outcome:'REJECTED',code:errorCode,reason:'CONFLICT_RETRY_EXHAUSTED',attempts:3,conflicts:3,lastConflictCode:'40001',backendPid:27182,sqlEnd:'ROLLBACK_ACK',lastPositiveSqlFin:Object.freeze({kind:'ROLLBACK_ACK',atMonotonicMs:123}),connection:'RETURNED'});
 let diagnostic={schema:'admission-clock-diagnostic-v1',owner,generation,operation:'acquire',acquisitionSequence:1,transfer:{state:'NONE',transferId:null,previousOwner:null,nextOwner:owner},lastConfirmedClock:{tick:'7',version:'8'},uncertain:false,stopped:false,transaction:{schema:'admission-transaction-diagnostic-v1',outcome:'COMMITTED'}};
 const clock={owner,state:()=>({...state}),diagnostic:()=>diagnostic,acquire(){assert.fail('driver must never acquire')},reconcile(){assert.fail('driver must never reconcile')},stop(){stops++;state.stopped=true},async advance(){calls++;if(calls===1){const transaction={...tx()};report={...diagnostic,operation:'advance',transaction};error=untyped?Object.assign(Error('PRIVATE_PAYLOAD'),{code:errorCode}):new AdmissionError(errorCode);Object.defineProperty(error,'admissionDiagnostic',{value:transaction});mutate({state,clock,report,transaction,error});diagnostic=report;throw error;}state.tick=String(BigInt(state.tick)+1n);state.version=String(BigInt(state.version)+1n);return true}};
 return {clock,driver:()=>createDevelopmentClockDriver({clock,owner,generation}),get calls(){return calls},get stops(){return stops},get error(){return error},get state(){return state}};
}

test('known three-conflict ROLLBACK returns false and the next ordinary cadence advances the SAME clock',async()=>{
 const f=fixture(),driver=f.driver(),before=f.clock.state();assert.equal(await driver.advance(),false);assert.equal(f.calls,1);assert.equal(f.stops,0);assert.deepEqual(f.clock.state(),before);assert.equal(await driver.advance(),true);assert.equal(f.calls,2);assert.equal(f.state.tick,'8');assert.equal(f.state.version,'9');const d=driver.diagnostic();assert.equal(d.counts.knownRejected,1);assert.equal(d.counts.advanced,1);assert.equal(d.firstRejected.transaction.backendPid,27182);assert.equal(d.firstRejected.transaction.lastPositiveSqlFin.kind,'ROLLBACK_ACK');assert.equal(d.fatal,null);
});
test('unproven SQL FIN, unreturned connection or incomplete conflict trace is fatal with the original typed error',async()=>{
 for(const mutate of [x=>x.error.cause={code:'COMMIT_UNCERTAIN'},x=>x.error.operationCause={code:'ROLLBACK_UNCERTAIN'},x=>x.transaction.reason='CONFLICT_DEADLINE',x=>x.transaction.outcome='COMMITTED',x=>x.transaction.attempts=2,x=>x.transaction.conflicts=2,x=>x.transaction.lastConflictCode='57014',x=>x.transaction.sqlEnd='UNKNOWN',x=>x.transaction.connection='DISCARDED',x=>x.transaction.backendPid=0,x=>x.transaction.lastPositiveSqlFin=null,x=>x.transaction.lastPositiveSqlFin={kind:'COMMIT_ACK',atMonotonicMs:123},x=>x.transaction.lastPositiveSqlFin={kind:'ROLLBACK_ACK',atMonotonicMs:NaN}]){
  const f=fixture({mutate}),driver=f.driver();await assert.rejects(driver.advance(),e=>e===f.error);assert.equal(f.stops,1);await assert.rejects(driver.advance(),e=>e===f.error);assert.equal(f.calls,1);
 }
});
test('changed state, identity, acquisition or a stale/unlinked diagnostic never qualifies',async()=>{
 for(const mutate of [x=>x.state.tick='8',x=>x.state.version='9',x=>x.state.uncertain=true,x=>x.state.stopped=true,x=>x.clock.owner=generation,x=>x.report.owner=generation,x=>x.report.generation=owner,x=>x.report.acquisitionSequence=2,x=>x.report.lastConfirmedClock={tick:'8',version:'9'},x=>x.report.operation='acquire',x=>x.report.transaction={...x.transaction},x=>x.report.transfer={...x.report.transfer,transferId:owner}]){
  const f=fixture({mutate}),driver=f.driver();await assert.rejects(driver.advance(),e=>e===f.error);assert.equal(f.stops,1);assert.equal(f.calls,1);
 }
});
test('unknown, uncertain COMMIT/ROLLBACK, owner conflict and untyped busy are never retried or replaced',async()=>{
 for(const errorCode of ['COMMIT_UNCERTAIN','ROLLBACK_UNCERTAIN','CLOCK_OWNER_CONFLICT','UNKNOWN','40001','40P01']){const f=fixture({errorCode}),driver=f.driver();await assert.rejects(driver.advance(),e=>e===f.error);await assert.rejects(driver.advance(),e=>e===f.error);assert.equal(f.calls,1);assert.equal(f.stops,1)}
 const f=fixture({untyped:true}),driver=f.driver();await assert.rejects(driver.advance(),e=>e===f.error);assert.equal(f.stops,1);
});
test('diagnostics remain bounded and carry positive FIN without arbitrary error payloads',async()=>{
 const f=fixture(),driver=f.driver();await driver.advance();const d=driver.diagnostic();assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.counts)&&Object.isFrozen(d.firstRejected));assert.ok(JSON.stringify(d).length<6000);assert.equal(JSON.stringify(d).includes('PRIVATE_PAYLOAD'),false);assert.equal(d.firstRejected.owner,owner);assert.equal(d.firstRejected.generation,generation);assert.equal(d.firstRejected.before.tick,d.firstRejected.after.tick);assert.equal(d.firstRejected.before.version,d.firstRejected.after.version);assert.equal(d.counts.dispatched,1);
});
test('fatal UNKNOWN SQL preserves its FIN boundary and typed rejection without claiming stop is SQL FIN',async()=>{
 const f=fixture({mutate:x=>{x.transaction.sqlEnd='UNKNOWN';x.transaction.connection='DISCARDED'}}),driver=f.driver();await assert.rejects(driver.advance(),e=>e===f.error);const d=driver.diagnostic();assert.equal(d.fatal.stopAcknowledged,true);assert.equal(d.fatal.evidence.transaction.sqlEnd,'UNKNOWN');assert.equal(d.fatal.evidence.transaction.connection,'DISCARDED');assert.equal(driver.failure(),f.error);assert.equal(d.fatal.evidence.after.stopped,false);
});
test('the actual production clock resumes after three known rollbacks without another acquisition',async()=>{
 let clockNow=0,remainingConflicts=0;const previousOwner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',row={generation,tick:'0',clock_version:'0',owner:previousOwner};
 const query=async(sql,args=[])=>{if(remainingConflicts&&sql.startsWith('UPDATE saas.admission_fence SET tick')){remainingConflicts--;throw Object.assign(Error('PRIVATE'),{code:'40001'})}if(sql.startsWith('SELECT generation')||sql.startsWith('SELECT owner'))return{rows:[{...row}]};if(sql.startsWith('UPDATE saas.admission_fence SET clock_version'))row.clock_version=args[0];if(sql.startsWith('UPDATE saas.time_authority SET owner')){row.owner=args[0];row.clock_version=args[1]}if(sql.startsWith('UPDATE saas.time_authority SET tick')){row.tick=args[0];row.clock_version=args[1]}return{rows:[],rowCount:1}};
 const clock=createClock({pool:{query,async connect(){return{query,processID:27182,release(){}}}},generation,owner,now:()=>clockNow});await clock.acquire(previousOwner);const driver=createDevelopmentClockDriver({clock,generation,owner});remainingConflicts=3;clockNow=120;assert.equal(await driver.advance(),false);assert.deepEqual(clock.state(),{tick:'0',version:'1',uncertain:false,stopped:false});clockNow=240;assert.equal(await driver.advance(),true);assert.deepEqual(clock.state(),{tick:'1',version:'2',uncertain:false,stopped:false});assert.equal(clock.diagnostic().acquisitionSequence,1);assert.equal(driver.diagnostic().counts.knownRejected,1);
});
test('an already uncertain or stopped clock cannot be driven or reset',async()=>{
 for(const key of ['uncertain','stopped']){const f=fixture();f.state[key]=true;const driver=f.driver();await assert.rejects(driver.advance(),{code:'DEVELOPMENT_CLOCK_STATE_UNSAFE'});assert.equal(f.calls,0);assert.equal(f.stops,1)}
});
test('the generic development SQL adapter uses the shared driver at the ordinary120ms interval',async()=>{
 for(const name of ['p1-l3-postgres.mjs']){const s=await readFile(new URL('../../integration/'+name,import.meta.url),'utf8');assert.match(s,/import \{createDevelopmentClockDriver\} from '\.\/development-clock-driver\.mjs'/);assert.match(s,/await clockDriver\.advance\(\)/);assert.match(s,/finally\{advancing=false\}\},120\)/)}
});
