import test from 'node:test';
import assert from 'node:assert/strict';
import {createClock} from '../../../server/saas/admission/clock.js';
import {createDevelopmentClockDriver} from '../../integration/development-clock-driver.mjs';
import {measureRecoveryPool,createClockAcquisitionAckLoss} from '../../integration/development-recovery.mjs';
import {captureCiTargetClockDiagnostic} from '../../integration/ci-cold-copy.mjs';

const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner='cccccccc-cccc-4ccc-8ccc-cccccccccccc',previousOwner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('both target pool wrappers preserve the actual backend identity and SQL budget dispatches',async()=>{
 let charged=0;const releases=[],calls=[],rawClient={processID:27182,async query(...args){calls.push(args);return{rows:[]}},release(...args){releases.push(args)}},raw={async query(...args){calls.push(args);return{rows:[]}},async connect(){return rawClient}};
 const measured=measureRecoveryPool(raw,()=>charged++),clockPool=createClockAcquisitionAckLoss(measured),client=await clockPool.connect();assert.equal(client.processID,27182);
 const config={text:'SELECT $1::text',values:['synthetic']};await client.query(config);assert.equal(calls[0][0],config);assert.equal(charged,1);
 await assert.rejects(client.query('COMMIT'),{code:'ECONNRESET'});assert.equal(charged,2);await client.query('COMMIT');assert.equal(charged,3);
 const discard=Object.assign(Error('PRIVATE'),{code:'ECONNRESET'});client.release(discard);assert.equal(releases[0][0],discard);
 const second=await clockPool.connect();assert.equal(second.processID,27182);await second.query('COMMIT');assert.equal(charged,4);second.release();
});
test('a fatal target clock report preserves the typed SQL boundary without private payloads',async()=>{
 let now=0,fail=false;const row={generation,tick:'0',clock_version:'0',owner:previousOwner};
 const query=async(sql,args=[])=>{if(fail&&sql.startsWith('UPDATE saas.admission_fence SET tick'))throw Object.assign(Error('PRIVATE_PASSWORD_COOKIE_SQL'),{code:'40001'});if(sql.startsWith('SELECT generation')||sql.startsWith('SELECT owner'))return{rows:[{...row}]};if(sql.startsWith('UPDATE saas.admission_fence SET clock_version'))row.clock_version=args[0];if(sql.startsWith('UPDATE saas.time_authority SET owner')){row.owner=args[0];row.clock_version=args[1]}return{rows:[],rowCount:1}};
 // A deliberately missing backend identity remains fatal; the fix cannot manufacture one.
 const clock=createClock({pool:measureRecoveryPool({query,async connect(){return{query,release(){}}}},()=>{}),generation,owner,now:()=>now});await clock.acquire(previousOwner);
 const driver=createDevelopmentClockDriver({clock,generation,owner});fail=true;now=120;await assert.rejects(driver.advance(),{code:'ADMISSION_BUSY'});
 const captured=captureCiTargetClockDiagnostic({clockDriver:driver,clockFailure:()=>({sqlState:null,guard:'ADMISSION_BUSY',private:'PRIVATE_PASSWORD_COOKIE_SQL'})});
 assert.equal(captured.failure.guard,'ADMISSION_BUSY');assert.equal(captured.driver.fatal.evidence.transaction.backendPid,null);assert.equal(captured.driver.fatal.evidence.transaction.sqlEnd,'ROLLBACK_ACK');assert.equal(captured.driver.fatal.evidence.transaction.reason,'CONFLICT_RETRY_EXHAUSTED');assert.equal(captured.driver.fatal.stopAcknowledged,true);assert.equal(captured.driver.counts.dispatched,1);assert.equal(JSON.stringify(captured).includes('PRIVATE_PASSWORD_COOKIE_SQL'),false);assert.ok(JSON.stringify(captured).length<6000);await assert.rejects(driver.advance(),{code:'ADMISSION_BUSY'});assert.equal(driver.diagnostic().counts.dispatched,1);
});
test('the production clock accepts only proved three-conflict rollback after both target wrappers',async()=>{
 let now=0,remainingConflicts=0,charged=0;const row={generation,tick:'0',clock_version:'0',owner:previousOwner};
 const query=async(sql,args=[])=>{
  if(remainingConflicts&&sql.startsWith('UPDATE saas.admission_fence SET tick')){remainingConflicts--;throw Object.assign(Error('PRIVATE_PAYLOAD'),{code:'40001'})}
  if(sql.startsWith('SELECT f.generation'))return{rows:[{...row,authority_tick:row.tick,authority_version:row.clock_version,authority_generation:generation}]};
  if(sql.startsWith('SELECT generation')||sql.startsWith('SELECT owner'))return{rows:[{...row}]};
  if(sql.startsWith('UPDATE saas.admission_fence SET clock_version'))row.clock_version=args[0];
  if(sql.startsWith('UPDATE saas.time_authority SET owner')){row.owner=args[0];row.clock_version=args[1]}
  if(sql.startsWith('UPDATE saas.time_authority SET tick')){row.tick=args[0];row.clock_version=args[1]}
  return{rows:[],rowCount:1};
 };
 const raw={query,async connect(){return{query,processID:27182,release(){}}}},wrapped=createClockAcquisitionAckLoss(measureRecoveryPool(raw,()=>charged++));
 const clock=createClock({pool:wrapped,generation,owner,now:()=>now});await assert.rejects(clock.acquire(previousOwner),{code:'COMMIT_UNCERTAIN'});assert.equal(clock.state().uncertain,true);await clock.reconcile();assert.equal(clock.state().uncertain,false);
 const driver=createDevelopmentClockDriver({clock,generation,owner});remainingConflicts=3;now=120;assert.equal(await driver.advance(),false);assert.equal(driver.failure(),null);assert.equal(driver.diagnostic().firstRejected.transaction.backendPid,27182);assert.equal(driver.diagnostic().firstRejected.transaction.sqlEnd,'ROLLBACK_ACK');
 now=240;assert.equal(await driver.advance(),true);assert.deepEqual(clock.state(),{tick:'1',version:'2',uncertain:false,stopped:false});assert.equal(clock.diagnostic().acquisitionSequence,1);assert.ok(charged>0);assert.equal(JSON.stringify(driver.diagnostic()).includes('PRIVATE_PAYLOAD'),false);clock.stop();
});
