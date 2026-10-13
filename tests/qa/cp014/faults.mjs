// PRIVATE QA ONLY: finite filesystem controls. Never imported by the public app.
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import path from 'node:path';

const instances=new Set(['api1','api2']);
const stages=new Set(['session.after-get','session.before-set','session.after-set','issuer.before-commit','issuer.after-commit','authority.after-revoke','tenant.before-acquire','admission.started','admission.bytes','admission.transaction.fence']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roots=new Set(['/run/qa-faults']);
function location(instance,root){if(!instances.has(instance)||!roots.has(root))throw new Error('QA_FAULT_PATH_REJECTED');return path.join(root,instance)}
async function json(file){try{return JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw new Error('QA_FAULT_INVALID_CONTROL')}}
export function createQaFaults({instance,root='/run/qa-faults',owner}){
 const folder=location(instance,root),consumed=new Set();
 return async function checkpoint(stage,detail={}){
  if(!stages.has(stage))throw new Error('QA_FAULT_STAGE_REJECTED');
  const control=await json(path.join(folder,'control.json'));if(!control)return;
  if(!uuid.test(control.id)||!stages.has(control.stage)||!['pause','reject'].includes(control.action))throw new Error('QA_FAULT_INVALID_CONTROL');
  if(control.stage!==stage||consumed.has(control.id)||(control.tenantId&&control.tenantId!==detail.tenantId))return;
  consumed.add(control.id);if(consumed.size>512)throw new Error('QA_FAULT_BUDGET');
  const event={id:control.id,stage,instance,at:new Date().toISOString()};
  for(const key of ['tenantId','ticketId','owner'])if(uuid.test(String(detail[key]??(key==='owner'?owner:''))))event[key]=detail[key]??owner;
  await writeFile(path.join(folder,`${control.id}.event.json`),JSON.stringify(event),{flag:'wx',mode:0o600});
  if(control.action==='reject')throw Object.assign(new Error('QA_CONTROLLED_FAILURE'),{code:'QA_CONTROLLED_FAILURE',status:503});
  const deadline=performance.now()+12000;
  while(performance.now()<deadline){
   const release=await json(path.join(folder,`${control.id}.release.json`));
   if(release){if(release.id!==control.id)throw new Error('QA_FAULT_INVALID_RELEASE');return;}
   await sleep(25);
  }
  throw Object.assign(new Error('QA_FAULT_TIMEOUT'),{code:'QA_FAULT_TIMEOUT',status:503});
 };
}
export async function arm({instance,stage,tenantId,action='pause',root='/run/qa-faults'}){
 const folder=location(instance,root);if(!stages.has(stage)||!['pause','reject'].includes(action)||(tenantId&&!uuid.test(tenantId)))throw new Error('QA_FAULT_CONTROL_REJECTED');
 await mkdir(folder,{recursive:true});const control={id:randomUUID(),stage,action,...(tenantId?{tenantId}:{})};
 await writeFile(path.join(folder,'control.json'),JSON.stringify(control),{mode:0o600});return {instance,root,...control};
}
export async function waitEvent(gate,{timeout=7000}={}){
 const folder=location(gate.instance,gate.root);if(!uuid.test(gate.id)||timeout<1||timeout>13000)throw new Error('QA_FAULT_WAIT_REJECTED');
 const deadline=performance.now()+timeout;
 while(performance.now()<deadline){const event=await json(path.join(folder,`${gate.id}.event.json`));if(event)return event;await sleep(25)}
 throw new Error(`QA_CHECKPOINT_NOT_REACHED:${gate.stage}:${gate.instance}`);
}
export async function release(gate){
 const folder=location(gate.instance,gate.root);if(!uuid.test(gate.id))throw new Error('QA_FAULT_RELEASE_REJECTED');
 await writeFile(path.join(folder,`${gate.id}.release.json`),JSON.stringify({id:gate.id}),{mode:0o600});
 const control=await json(path.join(folder,'control.json'));if(control?.id===gate.id)await unlink(path.join(folder,'control.json'));
}

/** Wrappers exercise the real standard store/issuer. No HTTP control surface. */
export function wrapQaServices({sessionPool,issuerPool,authority,tenantPools,checkpoint,instance,root='/run/qa-faults'}){
 const folder=location(instance,root);let probes=0;const counts=Object.create(null);
 const wrappedSession={async query(text,values){const statement=typeof text==='string'?text:text.text;const set=/^INSERT INTO "session_store"\."(?:company|demo|operator)_sessions"/.test(statement);if(set)await checkpoint('session.before-set');const result=await sessionPool.query(text,values);if(set)await checkpoint('session.after-set');if(/^SELECT sess FROM/.test(statement))await checkpoint('session.after-get');return result;}};
 const wrappedIssuer={query:issuerPool.query.bind(issuerPool),async connect(){const client=await issuerPool.connect();return {async query(text,values){const commit=String(text).trim()==='COMMIT';if(commit)await checkpoint('issuer.before-commit');const result=await client.query(text,values);if(commit)await checkpoint('issuer.after-commit');return result},release:client.release.bind(client)}}};
 const wrappedAuthority={...authority,async revoke(...args){const result=await authority.revoke(...args);await checkpoint('authority.after-revoke');return result}};
 const wrappedTenants={...tenantPools,async withTenant(descriptor,fn,options){
  if(++probes>1000)throw new Error('QA_PROBE_BUDGET');counts[descriptor.tenantId]=(counts[descriptor.tenantId]??0)+1;
  await writeFile(path.join(folder,'pool-probes.json'),JSON.stringify({instance,attempts:probes,counts}),{mode:0o600});
  await checkpoint('tenant.before-acquire',{tenantId:descriptor.tenantId});return tenantPools.withTenant(descriptor,fn,options);
 }};
 return {sessionPool:wrappedSession,issuerPool:wrappedIssuer,authority:wrappedAuthority,tenantPools:wrappedTenants};
}
