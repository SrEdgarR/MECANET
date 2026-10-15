// Explicit opt-in adapter. The caller authenticates Root admission/RO bindings.
// Merely encountering a v2 file never refreshes clocks or adopts its identity.
import {open,readFile,rename,unlink,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {uptime} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {canonical} from '../../../server/saas/recovery/protocol.js';
import {CONTINUATION_CASE,validateContinuation,updateContinuation,validateContinuationProgress} from './continuation-budget.mjs';
const check=(ok,label='CONTINUATION_LEDGER_REQUIRED')=>{if(!ok)throw Error(label)},same=(a,b)=>canonical(a)===canonical(b);
export async function newContinuationLedger(file,{scenario,limits={},sync,continuation,clock=uptime}={}){
 check(continuation&&Object.keys(continuation).sort().join(',')==='admission,admissionHash,baseLedger,baseLedgerHash','CONTINUATION_AUTHORITY_REQUIRED');
 const raw=Buffer.from(continuation.baseLedger),baseHash=continuation.baseLedgerHash,admission=structuredClone(continuation.admission);
 check(createHash('sha256').update(canonical(admission)).digest('hex')===continuation.admissionHash,'CONTINUATION_ADMISSION_HASH');
 check(typeof scenario==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(scenario)&&same({...CONTINUATION_CASE,...limits},CONTINUATION_CASE),'CONTINUATION_LIMITS_CHANGED');
 file=resolve(file);check(await realpath(dirname(file))===dirname(file));const first=await lstat(file);check(first.isFile()&&!first.isSymbolicLink());
 check(typeof clock==='function','CONTINUATION_CLOCK_REQUIRED');
 let highWater=null;
 async function read(){const state=JSON.parse(await readFile(file,'utf8'));validateContinuation(state,raw,baseHash,admission,clock());if(highWater)validateContinuationProgress(highWater,state);highWater=structuredClone(state);return state}
 await read(); // Never perform effects on an unauthenticated or expired state.
 async function update(mutator){
  let lock,temporary;for(let n=0;n<40;n++){try{lock=await open(file+'.lock','wx',0o600);break}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(setImmediate)}}check(lock,'CONTINUATION_LOCK_BUSY');
  try{const state=await read(),after=mutator(state);check(after.sequence===state.sequence+1,'CONTINUATION_SEQUENCE');validateContinuationProgress(state,after);temporary=file+'.'+randomUUID()+'.tmp';const h=await open(temporary,'wx',0o600);try{await h.writeFile(JSON.stringify(after));await h.sync()}finally{await h.close()}await rename(temporary,file);temporary=null;await sync(dirname(file));highWater=structuredClone(after);return after}
  finally{if(temporary)await unlink(temporary).catch(()=>{});await lock.close();await unlink(file+'.lock')}
 }
 return {snapshot:read,async charge(kind,amount=1){return update(state=>{const name=['source-window','target-window'].includes(scenario)?state.activeScenarios[scenario]:scenario;return updateContinuation(state,raw,baseHash,admission,name,clock(),{kind,amount})})},async enter(name){check(['source-window','target-window'].includes(scenario),'CONTINUATION_CASE_SCOPE');return update(state=>updateContinuation(state,raw,baseHash,admission,name,clock(),{scope:scenario}))}};
}
