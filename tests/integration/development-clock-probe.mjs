// One finite real SQL contention probe; no native resource or clock acquisition.
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {UUID} from '../../server/saas/admission/policy.js';
const ACK='CP023_OWN_REAL_SQL_CLOCK_CONTENTION_V1';
const UPDATE='UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 AND generation=$1::uuid AND tick=$2::bigint AND clock_version=$3::bigint RETURNING generation,tick::text,clock_version::text';
const OBSERVE='SELECT f.generation,f.tick::text,f.clock_version::text,t.owner,t.tick::text AS authority_tick,t.clock_version::text AS authority_version FROM saas.admission_fence f JOIN saas.time_authority t USING(id) WHERE f.id=1';

export function createDevelopmentClockProbe(pool,{generation,owner,contend}={}){
 assert.ok(pool?.connect&&pool?.query&&UUID.test(generation??'')&&UUID.test(owner??'')&&typeof contend==='function','CLOCK_PROBE_BINDING_REQUIRED');
 let state='IDLE',bound,attempts=0,rollbacks=0;const samples=[];
 const wrapped={query:(...args)=>pool.query(...args),async connect(){const client=await pool.connect();return{processID:client.processID,release:(...args)=>client.release(...args),async query(sql,values){
  try{const result=await client.query(sql,values);
   if(state==='ARMED'&&typeof sql==='string'&&sql.startsWith("SELECT set_config('statement_timeout'")){
    assert.ok(++attempts<=3&&Number.isSafeInteger(client.processID)&&client.processID>0,'CLOCK_PROBE_ATTEMPT_BOUND');const sample={attempt:attempts,backendPid:client.processID,contenderCommitAck:false,clockCode:null};samples.push(sample);
    // This ACK establishes the SERIALIZABLE snapshot. A separately metered
    // saas_api autocommit (legitimate admission_version privilege) changes it.
    const changed=await contend({text:UPDATE,values:[generation,bound.tick,bound.version]});assert.equal(changed?.rowCount,1,'CLOCK_PROBE_CONTENDER_CAS');assert.deepEqual(changed.rows,[{generation,tick:bound.tick,clock_version:bound.version}]);sample.contenderCommitAck=true;
   }
   if(state==='ARMED'&&sql==='ROLLBACK')rollbacks++;
   return result;
  }catch(error){if(state==='ARMED'&&typeof sql==='string'&&sql.startsWith('UPDATE saas.admission_fence SET tick=')){assert.ok(samples.length>0);samples.at(-1).clockCode=error.code==='40001'?'40001':'OTHER'}throw error}
 }}}};
 const observe=async()=>{const r=await pool.query(OBSERVE);assert.equal(r.rows.length,1);const row=r.rows[0];assert.equal(row.generation,generation);assert.equal(row.owner,owner);assert.equal(row.tick,row.authority_tick);assert.equal(row.clock_version,row.authority_version);return row};
 async function run(clock,driver,{acknowledgement}={}){
  assert.equal(acknowledgement,ACK);assert.equal(state,'IDLE','CLOCK_PROBE_ALREADY_CONSUMED');assert.equal(clock?.owner,owner);assert.equal(typeof driver?.advance,'function');bound=clock.state();assert.ok(bound.tick&&bound.version&&!bound.uncertain&&!bound.stopped);assert.equal(clock.diagnostic().acquisitionSequence,1);
  await delay(120);state='ARMED';let observedRejection=null;const originalAdvance=clock.advance;
  // Observe the SAME product rejection and rethrow it unchanged. The former
  // catch-all timer would stop here; no second implementation or fake 40001.
  clock.advance=async()=>{try{return await originalAdvance()}catch(e){observedRejection=e.code;throw e}};
  let first;try{first=await driver.advance()}finally{state='CONSUMED';clock.advance=originalAdvance}
  assert.equal(observedRejection,'ADMISSION_BUSY');assert.equal(first,false);assert.deepEqual(clock.state(),bound);assert.equal(attempts,3);assert.equal(rollbacks,3);assert.ok(samples.every(s=>s.clockCode==='40001'&&s.contenderCommitAck));
  assert.equal(driver.diagnostic().counts.knownRejected,1);const rejection=clock.diagnostic();assert.equal(rejection.transaction.reason,'CONFLICT_RETRY_EXHAUSTED');assert.equal(rejection.transaction.sqlEnd,'ROLLBACK_ACK');assert.equal(rejection.transaction.attempts,3);assert.equal(rejection.transaction.conflicts,3);assert.equal(rejection.acquisitionSequence,1);
  const unchanged=await observe();assert.equal(unchanged.tick,bound.tick);assert.equal(unchanged.clock_version,bound.version);
  await delay(120);assert.equal(await driver.advance(),true);const after=clock.state(),sqlAfter=await observe();assert.equal(after.tick,String(BigInt(bound.tick)+1n));assert.equal(after.version,String(BigInt(bound.version)+1n));assert.equal(sqlAfter.tick,after.tick);assert.equal(sqlAfter.clock_version,after.version);assert.equal(clock.diagnostic().acquisitionSequence,1);
  return Object.freeze({schema:'cp023-real-sql-clock-contention-v1',status:'PASS',environment:'caller must attest PostgreSQL18.6 Linux x64 development; not ARM64 acceptance',attempts,rollbacks,contenderQueries:attempts,samples,legacyAdapter:{status:'FAIL_EXPECTED',observedProductRejection:observedRejection,oldCatchAllWouldStop:true,separateLegacyTimerExecuted:false},driver:{first:false,next:true,sameOwner:true,acquisitionSequence:1,before:bound,after},sqlBefore:unchanged,sqlAfter,rejection});
 }
 return Object.freeze({pool:wrapped,run,acknowledgement:ACK,snapshot:()=>({schema:'cp023-real-sql-clock-contention-v1',state,attempts,rollbacks,contenderQueries:attempts,samples:samples.map(x=>({...x}))})});
}
