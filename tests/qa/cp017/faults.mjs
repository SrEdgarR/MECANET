// Private filesystem controls only; no HTTP control endpoint or request bodies.
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
const uuid=/^[0-9a-f-]{36}$/;
const instances=new Set(['api1','api2','worker']);
const stages=new Set(['write.intentDurable','write.beforeTenant','write.beforeFunction','write.afterFunction','write.afterTenantCommit','write.projected','restriction.centralClosed','restriction.localClosed','restriction.intentResolved','restriction.effectsClosed','restriction.beforeReopen','restriction.localOpened','restriction.localReopened','restriction.resourcesSettled','restriction.operationalResumed','restriction.acknowledged','admission.started','admission.bytes']);
const folder=instance=>{if(!instances.has(instance))throw Error('QA_FAULT_TARGET_REJECTED');return '/run/qa-faults/'+instance};
async function json(file){try{return JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw Error('QA_FAULT_CONTROL_INVALID')}}
export function createQaFaults({instance,owner}){
 const base=folder(instance),consumed=new Set();
 return async function checkpoint(stage,detail={}){
  if(!stages.has(stage))throw Error('QA_FAULT_STAGE_REJECTED');
  const control=await json(base+'/control.json');if(!control||control.stage!==stage||consumed.has(control.id)||control.tenantId&&control.tenantId!==detail.tenantId)return;
  if(!uuid.test(control.id)||!['pause','reject'].includes(control.action))throw Error('QA_FAULT_CONTROL_INVALID');
  consumed.add(control.id);if(consumed.size>512)throw Error('QA_FAULT_ENVELOPE_EXCEEDED');
  const event={id:control.id,stage,instance,at:new Date().toISOString()};
  for(const key of ['tenantId','operationId','ticketId','owner'])if(uuid.test(String(detail[key]??(key==='owner'?owner:''))))event[key]=detail[key]??owner;
  await writeFile(base+'/'+control.id+'.event.json',JSON.stringify(event),{flag:'wx',mode:0o600});
  if(control.action==='reject')throw Object.assign(Error('QA_CONTROLLED_FAILURE'),{code:'QA_CONTROLLED_FAILURE',status:503});
  const until=performance.now()+12000;while(performance.now()<until){const value=await json(base+'/'+control.id+'.release.json');if(value){if(value.id!==control.id)throw Error('QA_FAULT_RELEASE_INVALID');return}await sleep(25)}
  throw Object.assign(Error('QA_CONTROLLED_TIMEOUT'),{code:'QA_CONTROLLED_TIMEOUT',status:503});
 };
}
export async function arm({instance,stage,tenantId,action='pause'}){
 const base=folder(instance);if(!stages.has(stage)||!['pause','reject'].includes(action)||tenantId&&!uuid.test(tenantId))throw Error('QA_FAULT_CONTROL_INVALID');
 await mkdir(base,{recursive:true});const gate={instance,stage,action,id:randomUUID(),...(tenantId?{tenantId}:{})};
 await writeFile(base+'/control.json',JSON.stringify(gate),{mode:0o600});return gate;
}
export async function waitEvent(gate,{timeout=6500}={}){const base=folder(gate.instance);if(timeout<1||timeout>13000)throw Error('QA_FAULT_WAIT_INVALID');const until=performance.now()+timeout;while(performance.now()<until){const value=await json(base+'/'+gate.id+'.event.json');if(value)return value;await sleep(25)}throw Error('QA_CHECKPOINT_NOT_REACHED:'+gate.stage)}
export async function release(gate){const base=folder(gate.instance);await writeFile(base+'/'+gate.id+'.release.json',JSON.stringify({id:gate.id}),{mode:0o600});const value=await json(base+'/control.json');if(value?.id===gate.id)await unlink(base+'/control.json')}
