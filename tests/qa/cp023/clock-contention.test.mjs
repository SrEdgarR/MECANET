import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCiRef,requireClockContention} from '../../integration/ci-postgres.mjs';
import {createDevelopmentClockProbe} from '../../integration/development-clock-probe.mjs';
import {createClock} from '../../../server/saas/admission/clock.js';
import {createDevelopmentClockDriver} from '../../integration/development-clock-driver.mjs';

test('only the two explicit verification push refs are admitted',()=>{for(const ref of ['refs/heads/codex/verify-p1-l3-development','refs/heads/codex/verify-p1-l3-continuation'])assert.equal(validateCiRef(ref),ref);for(const ref of ['refs/heads/develop','refs/heads/main','refs/pull/6/merge','refs/heads/codex/other'])assert.throws(()=>validateCiRef(ref))});
test('new complete CI PASS requires actual same-clock contention result',()=>{const probe={schema:'cp023-real-sql-clock-contention-v1',status:'PASS',attempts:3,rollbacks:3,contenderQueries:3,legacyAdapter:{observedProductRejection:'ADMISSION_BUSY',oldCatchAllWouldStop:true,separateLegacyTimerExecuted:false},samples:[1,2,3].map(attempt=>({attempt,backendPid:42,contenderCommitAck:true,clockCode:'40001'})),driver:{first:false,next:true,sameOwner:true,acquisitionSequence:1,before:{tick:'3',version:'4'},after:{tick:'4',version:'5'}},sqlAfter:{tick:'4',clock_version:'5',authority_tick:'4',authority_version:'5'}};assert.equal(requireClockContention({clockContention:probe}),true);for(const changed of [undefined,{...probe,status:'NOT VERIFIED'},{...probe,rollbacks:2},{...probe,driver:{...probe.driver,next:false}},{...probe,samples:[...probe.samples.slice(0,2),{...probe.samples[2],clockCode:'40P01'}]}])assert.throws(()=>requireClockContention({clockContention:changed}))});
test('clock probe is passive and rejects forged binding without connecting',()=>{let calls=0;const pool={query(){calls++},connect(){calls++}};assert.throws(()=>createDevelopmentClockProbe(pool,{generation:'invalid',owner:'invalid',contend(){calls++}}));assert.equal(calls,0)});
test('probe orchestration preserves one clock and consumes its single arm (SQL boundary double only)',async()=>{
 const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner='cccccccc-cccc-4ccc-8ccc-cccccccccccc',previous='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';let commands=0,admissionVersion=0;
 const fence={generation,tick:'0',clock_version:'0'},authority={...fence,owner:previous};
 const pool={async query(){commands++;return{rows:[{...fence,owner:authority.owner,authority_tick:authority.tick,authority_version:authority.clock_version}]}},async connect(){let snapshot;return{processID:27182,release(){},async query(sql,args=[]){commands++;
  if(sql.startsWith('SELECT set_config'))snapshot=admissionVersion;
  if(sql.startsWith('SELECT generation'))return{rows:[{...fence}]};if(sql.startsWith('SELECT owner'))return{rows:[{...authority}]};
  if(sql.startsWith('UPDATE saas.admission_fence SET clock_version'))fence.clock_version=args[0];
  if(sql.startsWith('UPDATE saas.time_authority SET owner')){authority.owner=args[0];authority.clock_version=args[1]}
  if(sql.startsWith('UPDATE saas.admission_fence SET tick')){if(snapshot!==admissionVersion)throw Object.assign(Error('synthetic boundary conflict'),{code:'40001'});fence.tick=args[0];fence.clock_version=args[1]}
  if(sql.startsWith('UPDATE saas.time_authority SET tick')){authority.tick=args[0];authority.clock_version=args[1]}
  return{rowCount:1,rows:[]};
 }}}};
 const probe=createDevelopmentClockProbe(pool,{generation,owner,contend:async({values})=>{commands++;admissionVersion++;return{rowCount:1,rows:[{generation,tick:values[1],clock_version:values[2]}]}}}),clock=createClock({pool:probe.pool,generation,owner});await clock.acquire(previous);const driver=createDevelopmentClockDriver({clock,generation,owner});
 const report=await probe.run(clock,driver,{acknowledgement:probe.acknowledgement});assert.equal(requireClockContention({clockContention:report}),true);assert.equal(driver.diagnostic().counts.knownRejected,1);assert.equal(clock.diagnostic().acquisitionSequence,1);const spent=commands;await assert.rejects(probe.run(clock,driver,{acknowledgement:probe.acknowledgement}),/CLOCK_PROBE_ALREADY_CONSUMED/);assert.equal(commands,spent);
});
