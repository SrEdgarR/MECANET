// Private development driver for the SAME already-acquired production clock.
// The caller keeps its ordinary120ms cadence. No acquire, reconcile, timer,
// internal retry, new SQL, timeout change or reset belongs to this adapter.
import {AdmissionError} from '../../server/saas/admission/transaction.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const integer=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(x)&&BigInt(x)<=9223372036854775807n;
const state=clock=>{const s=clock.state();return Object.freeze({tick:s.tick,version:s.version,uncertain:s.uncertain,stopped:s.stopped})};
const healthy=s=>integer(s?.tick)&&integer(s?.version)&&s.uncertain===false&&s.stopped===false;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const safeCode=e=>['ADMISSION_BUSY','COMMIT_UNCERTAIN','ROLLBACK_UNCERTAIN','CLOCK_OWNER_CONFLICT','CLOCK_VERSION_CLOSED','40001','40P01','DEVELOPMENT_CLOCK_STATE_UNSAFE','DEVELOPMENT_CLOCK_DIAGNOSTIC_LIMIT','DEVELOPMENT_CLOCK_RESULT_REQUIRED'].includes(e?.code)?e.code:'UNKNOWN';
const fail=code=>Object.assign(Error(code),{code});
function transactionView(t){
 const pick=(value,allowed)=>allowed.includes(value)?value:null,n=x=>Number.isSafeInteger(x)&&x>=0?x:null;
 const positive=t?.lastPositiveSqlFin;return Object.freeze({schema:t?.schema==='admission-transaction-diagnostic-v1'?t.schema:null,outcome:pick(t?.outcome,['REJECTED','COMMITTED']),code:t?.code===null?null:safeCode(t),reason:pick(t?.reason,['CONFLICT_RETRY_EXHAUSTED','CONFLICT_DEADLINE','CONTROL_DEADLINE','POOL_QUEUE_LIMIT','POOL_ACQUIRE_DEADLINE','POOL_ERROR','SQL_ERROR','QUERY_DEADLINE','COMMIT_ACK','COMMIT_ACK_UNKNOWN','ROLLBACK_ACK_UNKNOWN']),attempts:n(t?.attempts),conflicts:n(t?.conflicts),backendPid:n(t?.backendPid),sqlEnd:pick(t?.sqlEnd,['NOT_DISPATCHED','UNKNOWN','COMMIT_ACK','ROLLBACK_ACK']),connection:pick(t?.connection,['NOT_ACQUIRED','ACQUIRED','RETURNED','DISCARDED']),lastPositiveSqlFin:positive&&['COMMIT_ACK','ROLLBACK_ACK'].includes(positive.kind)&&Number.isFinite(positive.atMonotonicMs)&&positive.atMonotonicMs>=0?Object.freeze({kind:positive.kind,atMonotonicMs:positive.atMonotonicMs}):null});
}

function knownRejected({error,before,after,prior,diagnostic,owner,generation,clockOwner}){
 const t=diagnostic?.transaction;
 return error instanceof AdmissionError&&error.code==='ADMISSION_BUSY'&&error.cause===undefined&&error.operationCause===undefined&&t===error.admissionDiagnostic&&
  diagnostic!==prior&&diagnostic?.schema===prior?.schema&&diagnostic.schema==='admission-clock-diagnostic-v1'&&
  diagnostic.operation==='advance'&&diagnostic.owner===prior.owner&&diagnostic.owner===clockOwner&&clockOwner===owner&&diagnostic.generation===prior.generation&&diagnostic.generation===generation&&
  Number.isSafeInteger(diagnostic.acquisitionSequence)&&diagnostic.acquisitionSequence>0&&diagnostic.acquisitionSequence===prior.acquisitionSequence&&same(diagnostic.transfer,prior.transfer)&&
  healthy(before)&&healthy(after)&&same(before,after)&&diagnostic.uncertain===false&&diagnostic.stopped===false&&same(diagnostic.lastConfirmedClock,{tick:after.tick,version:after.version})&&
  t?.schema==='admission-transaction-diagnostic-v1'&&t.outcome==='REJECTED'&&t.code==='ADMISSION_BUSY'&&t.reason==='CONFLICT_RETRY_EXHAUSTED'&&t.attempts===3&&t.conflicts===3&&['40001','40P01'].includes(t.lastConflictCode)&&
  t.sqlEnd==='ROLLBACK_ACK'&&t.connection==='RETURNED'&&Number.isSafeInteger(t.backendPid)&&t.backendPid>0&&t.lastPositiveSqlFin?.kind==='ROLLBACK_ACK'&&Number.isFinite(t.lastPositiveSqlFin.atMonotonicMs)&&t.lastPositiveSqlFin.atMonotonicMs>=0;
}
function rejectionRecord(before,after,d){
 const t=d.transaction;return Object.freeze({owner:d.owner,generation:d.generation,acquisitionSequence:d.acquisitionSequence,before,after,transaction:Object.freeze({schema:t.schema,outcome:t.outcome,code:t.code,reason:t.reason,attempts:t.attempts,conflicts:t.conflicts,lastConflictCode:t.lastConflictCode,backendPid:t.backendPid,sqlEnd:t.sqlEnd,connection:t.connection,lastPositiveSqlFin:Object.freeze({kind:t.lastPositiveSqlFin.kind,atMonotonicMs:t.lastPositiveSqlFin.atMonotonicMs})})});
}

export function createDevelopmentClockDriver({clock,owner,generation}={}){
 if(!clock||!['advance','state','diagnostic','stop'].every(k=>typeof clock[k]==='function')||!UUID.test(owner??'')||!UUID.test(generation??'')||clock.owner!==owner)throw new TypeError('Existing bound development clock required');
 const counts={dispatched:0,advanced:0,knownRejected:0};let failure=null,inFlight=false,firstRejected=null,lastRejected=null,stopAcknowledged=null,fatalEvidence=null;
 const increment=key=>{if(!Number.isSafeInteger(counts[key])||counts[key]>=Number.MAX_SAFE_INTEGER)throw fail('DEVELOPMENT_CLOCK_DIAGNOSTIC_LIMIT');counts[key]++};
 const latch=error=>{if(failure===null){failure=error;try{clock.stop();stopAcknowledged=true}catch{stopAcknowledged=false}}return failure};
 async function advance(){
  if(failure!==null)throw failure;
  if(inFlight)return false;
  inFlight=true;let before,prior;
  try{
   before=state(clock);prior=clock.diagnostic();if(!healthy(before)||clock.owner!==owner)throw fail('DEVELOPMENT_CLOCK_STATE_UNSAFE');
   increment('dispatched');const result=await clock.advance();if(typeof result!=='boolean')throw fail('DEVELOPMENT_CLOCK_RESULT_REQUIRED');if(result)increment('advanced');return result;
  }catch(error){
   let accepted=false;
   try{const after=state(clock),diagnostic=clock.diagnostic();if(knownRejected({error,before,after,prior,diagnostic,owner,generation,clockOwner:clock.owner})){increment('knownRejected');lastRejected=rejectionRecord(before,after,diagnostic);firstRejected??=lastRejected;accepted=true;}else fatalEvidence=Object.freeze({before,after,transaction:transactionView(error?.admissionDiagnostic)});}
   catch{/* Missing/malformed evidence cannot authorize another clock advance. */}
   if(accepted)return false;
   throw latch(error);
  }finally{inFlight=false;}
 }
 return Object.freeze({advance,failure:()=>failure,diagnostic:()=>Object.freeze({schema:'development-clock-driver-v1',owner,generation,counts:Object.freeze({...counts}),firstRejected,lastRejected,fatal:failure===null?null:Object.freeze({code:safeCode(failure),stopAcknowledged,evidence:fatalEvidence})})});
}
