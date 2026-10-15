// Private controller only. The caller publishes the chosen object durably BEFORE SQL.
import {randomBytes,randomUUID,pbkdf2Sync,createHmac,createHash} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {canonical,sha256,verifyEndProof} from './protocol.js';

export const ROLES=Object.freeze(['saas_api','saas_session','saas_issuer','saas_revoker','saas_policy','saas_clock','saas_measure','saas_reconciler','saas_backup','saas_tenant_a','saas_tenant_b','saas_demo','saas_writer_maintenance','saas_writer_a','saas_writer_b','saas_maintainer_a','saas_maintainer_b']);
const ALL=[...ROLES,'qa_bootstrap'];const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const STAGE_OPERATIONS=Object.freeze(['source-init','source-close-admission','source-local-a','source-local-b','source-clock-plan','source-clock-record','source-normal-ack','source-close-restore','source-close-b','source-closed-canary','target-begin','target-enroll-a','target-enroll-b','target-config-a','target-config-b','target-config-control','target-canary','target-clock-plan','target-clock-record','target-proof-config-a','target-proof-config-b','target-proof-verified-a','target-proof-verified-b','target-proof-open-a','target-proof-seal-a','target-proof-seal-b','target-verify-a','target-verify-b','target-verify-control','target-prepare-promote','target-open-a','target-seal-a','target-seal-b','target-activate','target-close-abort','target-begin-abort','target-abort-a','target-abort-b','target-proof-abort-a','target-proof-abort-b','target-finish-abort',...ALL.map(r=>'config-role-'+r)]);
const secret=()=>randomBytes(32).toString('base64url');
function scram(password,salt){const salted=pbkdf2Sync(password,Buffer.from(salt,'base64'),4096,32,'sha256');const client=createHmac('sha256',salted).update('Client Key').digest();const stored=createHash('sha256').update(client).digest('base64');const server=createHmac('sha256',salted).update('Server Key').digest('base64');return `SCRAM-SHA-256$4096:${salt}$${stored}:${server}`;}
const requireValue=(ok,label)=>{if(!ok)throw Error(label);};
export async function chooseMaterial(binding){
 requireValue(binding?.project==='mecanet-qa-p1l3-r03'&&/^[0-9a-f]{64}$/.test(binding.artifactDigest),'CUSTODY_BINDING');
 const login=secret(),passwordHash=await bcrypt.hash(login,12),controllerOwner=randomUUID(),recoveryId=randomUUID();
 function cohort(project){const rolePasswords=Object.fromEntries(ALL.map(r=>[r,secret()]));return{project,generation:randomUUID(),seedClockOwner:randomUUID(),workerClockOwner:randomUUID(),apiOwners:{api1:randomUUID(),api2:randomUUID()},webOwner:randomUUID(),rolePasswords,sessionSecret:randomBytes(48).toString('base64url'),identityPassword:login,identityPasswordHash:passwordHash,operationIds:{products:Array.from({length:4},()=>randomUUID()),receipts:Array.from({length:2},()=>randomUUID()),postProduct:randomUUID(),postReceipt:randomUUID(),restore:randomUUID(),blockB:randomUUID(),postcopyCanary:randomUUID(),abort:randomUUID(),clockTransfer:randomUUID()}};}
 const source=cohort(binding.project);source.normal={runId:randomUUID(),controllerOwner};
 const target=cohort(binding.project+'-target');target.roleVerifiers=Object.fromEntries(ALL.map(r=>{const salt=randomBytes(16).toString('base64');return[r,{salt,verifier:scram(target.rolePasswords[r],salt)}];}));
 target.referenceVersions={reader:'2',writer:'2',schema:3};target.epochs={a:'3',b:'3'};
 const stageOperationIds=Object.fromEntries(STAGE_OPERATIONS.map(s=>[s,randomUUID()]));
 const material={schema:'recovery-custody-v1',recoveryId,controllerOwner,artifactDigest:binding.artifactDigest,stageOperationIds,source,target};return validateMaterial(material);
}
export function validateMaterial(m){
 requireValue(m&&Object.keys(m).sort().join(',')==='artifactDigest,controllerOwner,recoveryId,schema,source,stageOperationIds,target'&&m.schema==='recovery-custody-v1'&&UUID.test(m.recoveryId)&&UUID.test(m.controllerOwner)&&/^[0-9a-f]{64}$/.test(m.artifactDigest),'CUSTODY_SHAPE');
 const used=new Set([m.recoveryId,m.controllerOwner]);
 for(const [side,c] of [['source',m.source],['target',m.target]]){
  const keys=['project','generation','seedClockOwner','workerClockOwner','apiOwners','webOwner','rolePasswords','sessionSecret','identityPassword','identityPasswordHash','operationIds',...(side==='source'?['normal']:['roleVerifiers','referenceVersions','epochs'])].sort();requireValue(c&&Object.keys(c).sort().join(',')===keys.join(',')&&c.project==='mecanet-qa-p1l3-r03'+(side==='target'?'-target':''),'CUSTODY_COHORT');
  for(const id of [c.generation,c.seedClockOwner,c.workerClockOwner,c.webOwner,...Object.values(c.apiOwners),...Object.values(c.operationIds).flat()]){requireValue(UUID.test(id)&&!used.has(id),'CUSTODY_IDENTITY');used.add(id);}
  requireValue(Object.keys(c.apiOwners).sort().join(',')==='api1,api2'&&Object.keys(c.rolePasswords).sort().join(',')===[...ALL].sort().join(',')&&Object.values(c.rolePasswords).every(p=>/^[A-Za-z0-9_-]{43}$/.test(p))&&new Set(Object.values(c.rolePasswords)).size===ALL.length,'CUSTODY_ROLES');
  requireValue(/^[A-Za-z0-9_-]{64}$/.test(c.sessionSecret)&&/^[A-Za-z0-9_-]{43}$/.test(c.identityPassword)&&/^\$2[aby]\$12\$/.test(c.identityPasswordHash),'CUSTODY_SECRET_FORMAT');
  requireValue(Object.keys(c.operationIds).sort().join(',')==='abort,blockB,clockTransfer,postProduct,postReceipt,postcopyCanary,products,receipts,restore'&&Array.isArray(c.operationIds.products)&&c.operationIds.products.length===4&&Array.isArray(c.operationIds.receipts)&&c.operationIds.receipts.length===2,'CUSTODY_OPERATION_IDS');
  if(side==='source'){requireValue(c.normal&&Object.keys(c.normal).sort().join(',')==='controllerOwner,runId'&&UUID.test(c.normal.runId)&&c.normal.controllerOwner===m.controllerOwner&&!used.has(c.normal.runId),'CUSTODY_NORMAL');used.add(c.normal.runId);}
  else{requireValue(Object.keys(c.roleVerifiers).sort().join(',')===[...ALL].sort().join(',')&&canonical(c.referenceVersions)===canonical({reader:'2',writer:'2',schema:3})&&canonical(c.epochs)===canonical({a:'3',b:'3'}),'CUSTODY_TARGET');for(const r of ALL){const v=c.roleVerifiers[r];requireValue(v&&Object.keys(v).sort().join(',')==='salt,verifier'&&Buffer.from(v.salt,'base64').length===16&&v.verifier===scram(c.rolePasswords[r],v.salt),'CUSTODY_VERIFIER');}}
 }
 requireValue(m.stageOperationIds&&Object.keys(m.stageOperationIds).sort().join(',')===[...STAGE_OPERATIONS].sort().join(','),'CUSTODY_STAGE_OPERATIONS');for(const id of Object.values(m.stageOperationIds)){requireValue(UUID.test(id)&&!used.has(id),'CUSTODY_STAGE_IDENTITY');used.add(id);}
 requireValue(m.source.identityPassword===m.target.identityPassword&&m.source.identityPasswordHash===m.target.identityPasswordHash,'CUSTODY_IDENTITY_CONTINUITY');
 for(const r of ALL)requireValue(m.source.rolePasswords[r]!==m.target.rolePasswords[r],'CUSTODY_CREDENTIAL_REUSE');requireValue(m.source.sessionSecret!==m.target.sessionSecret,'CUSTODY_SESSION_REUSE');requireValue(Buffer.byteLength(canonical(m))<=262144,'CUSTODY_SIZE');return m;
}
/** Derivation has no randomness, I/O or privilege fallbacks. Master is never mounted in APIs. */
export function deriveRuntimeConfig(material,side,fixture,recovery,ca,clockTransfer){
 validateMaterial(material);requireValue(['source','target'].includes(side),'CONFIG_SIDE');const c=material[side];
 requireValue(fixture?.generation===c.generation&&recovery&&Object.keys(recovery).sort().join(',')==='manifestHash,mode,runId'&&UUID.test(recovery.runId)&&/^[0-9a-f]{64}$/.test(recovery.manifestHash)&&recovery.mode===(side==='source'?'NORMAL':'RECOVERY')&&recovery.runId===(side==='source'?c.normal.runId:material.recoveryId)&&typeof ca==='string'&&ca.length>0,'CONFIG_BINDING');
 for(const r of ROLES){requireValue(fixture.connections?.[r]?.user===r&&fixture.connections[r].password===c.rolePasswords[r],'CONFIG_ROLE_BINDING');}
 const api={control:fixture.connections.saas_api,sessions:fixture.connections.saas_session,issuer:fixture.connections.saas_issuer,sessionSecret:c.sessionSecret,generation:c.generation,entries:fixture.entries,writerEntries:fixture.writerEntries,recovery};
 requireValue(clockTransfer&&clockTransfer.kind==='recovery-initial'&&clockTransfer.mode===recovery.mode&&clockTransfer.generation===c.generation&&clockTransfer.runId===recovery.runId&&clockTransfer.manifestHash===recovery.manifestHash&&clockTransfer.previousOwner===c.seedClockOwner&&clockTransfer.nextOwner===c.workerClockOwner&&clockTransfer.transferId===c.operationIds.clockTransfer&&/^[0-9a-f]{64}$/.test(clockTransfer.transferHash)&&/^[0-9a-f]{64}$/.test(clockTransfer.endProofHash)&&/^(0|[1-9][0-9]{0,18})$/.test(clockTransfer.expectedClockVersion)&&/^(0|[1-9][0-9]{0,18})$/.test(clockTransfer.expectedTick),'CONFIG_CLOCK_PROOF_REQUIRED');
 const worker={connection:fixture.connections.saas_clock,maintenanceConnection:fixture.connections.saas_writer_maintenance,maintenanceEntries:fixture.maintenanceEntries,generation:c.generation,clockOwner:c.workerClockOwner,recovery,clockTransfer};
 return{api1:{...api,ownerId:c.apiOwners.api1},api2:{...api,ownerId:c.apiOwners.api2},worker};
}
/** A stopped worker permits selecting one NEW transfer. The caller durably
 * publishes this addition; retries load it, never call this chooser again. */
export function chooseClockAddition({material,side,binding,before,endProof,observedEnd}){
 validateMaterial(material);requireValue(['source','target'].includes(side),'CLOCK_ADDITION_SIDE');const c=material[side],runId=side==='source'?c.normal.runId:material.recoveryId;
 verifyEndProof(endProof,observedEnd,{profile:'worker'});
 requireValue(binding?.runId===runId&&/^[0-9a-f]{64}$/.test(binding.manifestHash)&&binding.resourceHash===endProof.sourceResourceHash&&endProof.recoveryId===material.recoveryId&&before?.generation===c.generation&&before.owner===endProof.processes[0].ownerId&&UUID.test(before.owner),'CLOCK_ADDITION_END_BINDING');
 for(const v of [before.clockVersion,before.tick])requireValue(typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<9223372036854775807n,'CLOCK_ADDITION_VERSION');
 const custodyHash=sha256(material),body={schema:'recovery-clock-addition-v1',side,runId,generation:c.generation,manifestHash:binding.manifestHash,custodyHash,resourceHash:binding.resourceHash,materialHash:custodyHash,previousOwner:before.owner,nextOwner:randomUUID(),transferId:randomUUID(),endProofHash:sha256(endProof),expectedClockVersion:before.clockVersion,expectedTick:before.tick,operationIds:{prepare:randomUUID(),record:randomUUID()}};
 return{...body,transferHash:sha256(body)};
}
/** Pure segmentation from the already-published addition. No secret, epoch or
 * initial owner is regenerated, and only clock configuration changes. */
export function deriveWorkerRestartConfig({previousConfig,addition,material,endProof,observedEnd}){
 validateMaterial(material);verifyEndProof(endProof,observedEnd,{profile:'worker'});const a=addition,{transferHash,...body}=a;
 requireValue(a&&Object.keys(a).sort().join(',')==='custodyHash,endProofHash,expectedClockVersion,expectedTick,generation,manifestHash,materialHash,nextOwner,operationIds,previousOwner,resourceHash,runId,schema,side,transferHash,transferId'&&a.schema==='recovery-clock-addition-v1'&&['source','target'].includes(a.side)&&sha256(body)===transferHash&&a.materialHash===sha256(material)&&a.custodyHash===a.materialHash,'CLOCK_ADDITION_BINDING');
 const c=material[a.side];requireValue(a.generation===c.generation&&a.runId===(a.side==='source'?c.normal.runId:material.recoveryId)&&a.endProofHash===sha256(endProof)&&a.resourceHash===endProof.sourceResourceHash&&endProof.recoveryId===material.recoveryId&&endProof.processes[0].ownerId===a.previousOwner&&UUID.test(a.nextOwner)&&a.nextOwner!==a.previousOwner&&a.nextOwner!==c.seedClockOwner&&UUID.test(a.transferId)&&a.operationIds&&Object.keys(a.operationIds).sort().join(',')==='prepare,record'&&Object.values(a.operationIds).every(v=>UUID.test(v))&&new Set([a.nextOwner,a.transferId,...Object.values(a.operationIds)]).size===4,'CLOCK_ADDITION_IDENTITY');
 for(const v of [a.expectedClockVersion,a.expectedTick])requireValue(typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<9223372036854775807n,'CLOCK_ADDITION_VERSION');
 const previousIds=new Set();const visit=x=>{if(typeof x==='string'&&UUID.test(x))previousIds.add(x);else if(x&&typeof x==='object')for(const value of Object.values(x))visit(value)};visit(material);
 requireValue([a.nextOwner,a.transferId,...Object.values(a.operationIds)].every(x=>!previousIds.has(x)),'CLOCK_ADDITION_IDENTITY');
 requireValue(previousConfig?.generation===a.generation&&previousConfig.clockOwner===a.previousOwner&&previousConfig.recovery?.runId===a.runId&&previousConfig.recovery.manifestHash===a.manifestHash,'CLOCK_ADDITION_CONFIG');
 const clockTransfer={kind:'stopped-process',mode:previousConfig.recovery.mode,generation:a.generation,runId:a.runId,manifestHash:a.manifestHash,previousOwner:a.previousOwner,nextOwner:a.nextOwner,transferId:a.transferId,transferHash:a.transferHash,endProofHash:a.endProofHash,expectedClockVersion:a.expectedClockVersion,expectedTick:a.expectedTick,confirmed:true,reference:'custodied-'+sha256(a),containerId:endProof.processes[0].containerId,observedState:'exited',stoppedAt:endProof.processes[0].finishedAt,sqlOwnerAbsent:true};
 return{...previousConfig,clockOwner:a.nextOwner,clockTransfer};
}
