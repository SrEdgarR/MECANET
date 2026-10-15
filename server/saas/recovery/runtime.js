import {failure,uuid} from '../auth/validation.js';

const HASH=/^[a-f0-9]{64}$/;
const decimal=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n;
const stages=new Set(['PLANNED','CONFIGURED','CLOCK_ACQUIRED','VERIFIED','PROMOTING','COMPLETE','ABORTING','ABORTED_CLOSED']);
const fields=['clock_owner','clock_version','generation','mode','ready','stage','tick'];

/** Trusted segmented config only. No environment, private credential or tenant I/O. */
export function createRecoveryRuntime({controlPool,generation,expectedRunId,manifestHash,mode,now=()=>performance.now()}={}){
 if(!controlPool?.query||!uuid.test(generation)||!uuid.test(expectedRunId)||!HASH.test(manifestHash??'')||!['NORMAL','RECOVERY'].includes(mode)||typeof now!=='function')throw new Error('RECOVERY_BINDING_REQUIRED');
 const binding=Object.freeze({generation:generation.toLowerCase(),runId:expectedRunId.toLowerCase(),manifestHash,mode});
 const args=[binding.generation,binding.runId,binding.manifestHash];let evaluating=false;
 async function query(text,deadline=now()+500,onWork=null){
  const ms=Math.floor(Math.min(500,deadline-now()));if(ms<=0)throw failure('SERVICE_UNAVAILABLE');
  let timer;const work=Promise.resolve().then(()=>controlPool.query({text,values:args,query_timeout:ms}));onWork?.(work);
  try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('SERVICE_UNAVAILABLE')),ms)})])}
  finally{clearTimeout(timer)}
 }
 async function guard({deadline=now()+500}={}){
  try{const {rows}=await query('SELECT saas.recovery_runtime_guard($1::uuid,$2::uuid,$3::text) AS ready',deadline);return rows.length===1&&Object.keys(rows[0]).length===1&&rows[0].ready===true}catch{return false}
 }
 async function serviceState({deadline=now()+500,onWork=null}={}){
  try{
   const {rows}=await query('SELECT * FROM saas.recovery_service_state($1::uuid,$2::uuid,$3::text)',deadline,onWork);const row=rows[0];
   if(rows.length!==1||!row||Object.keys(row).sort().join(',')!==fields.join(',')||row.mode!==mode||!stages.has(row.stage)||row.generation!==binding.generation||!uuid.test(row.clock_owner)||!decimal(row.clock_version)||!decimal(row.tick)||typeof row.ready!=='boolean')throw failure('SERVICE_UNAVAILABLE');
   return Object.freeze({...row});
  }catch{throw failure('SERVICE_UNAVAILABLE')}
 }
 async function maintenanceGuard(){try{return (await serviceState()).stage==='COMPLETE'}catch{return false}}
 async function ready({clockReady,draining=false,deadline=now()+1000}={}){
  if(draining||evaluating||typeof clockReady!=='function'||deadline<=now())return false;
  evaluating=true;let timer,actualRead;
  // A timed-out probe retains its evaluation slot until the actual work ends.
  // Health never ends a business lease or regenerates configuration.
  const work=(async()=>{if(await clockReady()!==true)return false;const row=await serviceState({deadline:Math.min(deadline,now()+500),onWork:work=>{actualRead=work}});return row.stage==='COMPLETE'&&row.ready===true})().catch(()=>false).finally(async()=>{await actualRead?.catch(()=>{});evaluating=false});
  try{return await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),Math.max(1,Math.min(1000,deadline-now())))})])}
  finally{clearTimeout(timer)}
 }
 return Object.freeze({binding,guard,serviceState,maintenanceGuard,ready});
}
