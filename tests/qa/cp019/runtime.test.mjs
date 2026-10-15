// Synthetic boundary doubles/loopback only. No PostgreSQL or physical recovery claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createRecoveryRuntime} from '../../../server/saas/recovery/runtime.js';
import {createApp} from '../../../server/saas/app.js';
import {createAuthority} from '../../../server/saas/auth/authority.js';
import {createPoolBudget,createSecretResolver,createTenantPoolManager} from '../../../server/saas/db/pools.js';
import {createRestrictiveCoordinator} from '../../../server/saas/writes/coordinator.js';
import {createWriteService} from '../../../server/saas/writes/service.js';
import {validateClockTransfer} from '../../../server/saas/admission/transfer.js';
import {createClock} from '../../../server/saas/admission/clock.js';
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',runId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner='cccccccc-cccc-4ccc-8ccc-cccccccccccc',previousOwner='dddddddd-dddd-4ddd-8ddd-dddddddddddd',tenantId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',transferId='ffffffff-ffff-4fff-8fff-ffffffffffff',manifestHash='1'.repeat(64);
const binding={generation,runId,manifestHash,mode:'RECOVERY'};
const state=patch=>({mode:'RECOVERY',stage:'COMPLETE',generation,clock_owner:owner,clock_version:'3',tick:'1',ready:true,...patch});
function runtime({row=state(),guard=true,query}={}){return createRecoveryRuntime({controlPool:{query:query??(async q=>({rows:[q.text.includes('service_state')?row:{ready:guard}]}))},generation,expectedRunId:runId,manifestHash,mode:row?.mode??'RECOVERY'})}
test('explicit runtime binding is required; missing records cannot imply NORMAL',async()=>{
 for(const patch of [{expectedRunId:null},{manifestHash:'bad'},{mode:'unknown'},{generation:'bad'}])assert.throws(()=>createRecoveryRuntime({controlPool:{query:async()=>({rows:[]})},generation,expectedRunId:runId,manifestHash,mode:'NORMAL',...patch}));
 const missing=runtime({query:async()=>({rows:[]})});assert.equal(await missing.guard(),false);assert.equal(await missing.ready({clockReady:async()=>true}),false);
});
test('normal zero/allclosed and recovered complete accept only the central authoritative classifier',async()=>{
 for(const mode of ['NORMAL','RECOVERY']){const r=runtime({row:state({mode})});assert.equal(await r.guard(),true);assert.equal(await r.ready({clockReady:async()=>true}),true)}
 for(const row of [state({stage:'PROMOTING'}),state({ready:false}),state({generation:runId}),state({clock_version:'9223372036854775808'}),state({clock_version:3}),state({tenantIds:[tenantId]})])assert.equal(await runtime({row}).ready({clockReady:async()=>true}),false);
});
test('pending recovery blocks business while maintenance cannot confuse ready with COMPLETE',async()=>{
 const pending=runtime({row:state({stage:'CONFIGURED',ready:false}),guard:false});assert.equal(await pending.guard(),false);assert.equal(await pending.maintenanceGuard(),false);
 const ordinary=runtime({row:state({ready:false}),guard:false});assert.equal(await ordinary.maintenanceGuard(),true);assert.equal(await ordinary.guard(),false);
});
test('one health evaluation remains occupied until the real query ends after a timeout',async()=>{
 let calls=0,release;const r=runtime({query:async()=>{calls++;return await new Promise(resolve=>{release=()=>resolve({rows:[state()]})})}});
 assert.equal(await r.ready({clockReady:async()=>true,deadline:performance.now()+12}),false);await delay(20);assert.equal(await r.ready({clockReady:async()=>true}),false);assert.equal(calls,1);release();await delay(0);
});
async function healthApp({recovery=runtime(),observe=async()=>{},callback}={}){
 const sessionSecret=randomBytes(48).toString('hex'),sid=randomBytes(32).toString('base64url'),signed=`s:${sid}.${createHmac('sha256',sessionSecret).update(sid).digest('base64').replace(/=+$/,'')}`;
 let sessions=0,admissions=0;const service=createApp({origin:'https://qa.invalid',trustedProxy:'127.0.0.1',sessionSecret,sessionPool:{query:async()=>{sessions++;return{rows:[]}}},authority:{},tenantPools:{},recovery,admission:{observeClock:observe,ready:()=>true,admit:async()=>{admissions++;throw Error('NOT_EXPECTED')}}});
 const server=await new Promise(resolve=>{const s=service.app.listen(0,'127.0.0.1',()=>resolve(s))});
 const request=path=>new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port:server.address().port,path,headers:{Host:'qa.invalid',Cookie:`__Host-mecanet-session=${encodeURIComponent(signed)}`}},res=>{let body='';res.on('data',part=>body+=part);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body),headers:res.headers}))});req.on('error',reject)});
 try{await callback({request,stats:()=>({sessions,admissions})})}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
test('readiness is central-only before sessions, and observer errors return exactly safe 503',async()=>{
 await healthApp({observe:async()=>{throw Error('PRIVATE CONNECTION AND TENANT')},callback:async({request,stats})=>{assert.deepEqual((await request('/api/health/ready')).body,{status:'unavailable'});assert.equal((await request('/api/health/ready')).status,503);assert.deepEqual(stats(),{sessions:0,admissions:0})}});
 await healthApp({callback:async({request,stats})=>{const result=await request('/api/health/ready');assert.equal(result.status,200);assert.deepEqual(result.body,{status:'ready'});assert.equal(result.headers['cache-control'],'no-store');assert.deepEqual(stats(),{sessions:0,admissions:0})}});
});
test('pending recovery rejects auth and all API work before sessions/admission while live remains live',async()=>healthApp({recovery:runtime({guard:false,row:state({stage:'PROMOTING',ready:false})}),callback:async({request,stats})=>{
 assert.equal((await request('/api/health/live')).status,200);assert.equal((await request('/api/auth/session')).status,503);assert.deepEqual(stats(),{sessions:0,admissions:0});
}}));
test('schema3 authority preserves decimal bigint descriptors and cross-generation active restrictions',async()=>{
 let sql;const auth=createAuthority({query:async q=>{sql=q.text;return{rows:[{id:owner,email:'synthetic@qa.invalid',generation,security_version:'1',tenant_id:tenantId,db_name:'mecanet_tenant_a',secret_ref:'reader-a-v2',credential_version:'9007199254740993',schema_version:3,data_epoch:'9007199254740993',tenant_status:'active',tenant_purpose:'company',membership_status:'active',grant_status:'active',role_action:'catalog.create',writer_restricted:false,writer_session_ref:transferId,writer_secret_ref:'writer-a-v2',writer_credential_version:'9007199254740993'}]}}},generation,{writersEnabled:true,recovery:runtime()});
 const a=await auth.authorize({sid:'synthetic',purpose:'company',tenantId,action:'catalog.create'});assert.equal(a.descriptor.dataEpoch,'9007199254740993');assert.equal(a.writerDescriptor.credentialVersion,'9007199254740993');assert.equal(a.descriptor.recoveryRunId,runId);assert.equal(a.descriptor.recoveryManifestHash,manifestHash);assert.doesNotMatch(sql,/x\.generation\s*=\s*r\.generation/);
});
test('authority cannot bypass pending runtime or accept schema3 without binding',async()=>{
 let queried=0;const auth=createAuthority({query:async()=>{queried++;return{rows:[]}}},generation,{writersEnabled:true,recovery:runtime({guard:false})});await assert.rejects(auth.authorize({sid:'x',purpose:'company'}),{status:503});assert.equal(queried,0);
});
test('schema3 without runtime binding and rounded numeric epochs never yield descriptors',async()=>{
 const row={id:owner,generation,security_version:'1',tenant_id:tenantId,tenant_status:'active',tenant_purpose:'company',membership_status:'active',grant_status:'active',role_action:'catalog.read',schema_version:3,data_epoch:9007199254740992,credential_version:'2'};
 for(const recovery of [null,runtime()]){const auth=createAuthority({query:async()=>({rows:[row]})},generation,{writersEnabled:true,recovery});await assert.rejects(auth.authorize({sid:'x',purpose:'company',tenantId}),{code:'TENANT_UNAVAILABLE'})}
});
test('pending recovery denies session mutation and writer service independently of HTTP composition',async()=>{
 let sql=0,effects=0;const recovery=runtime({guard:false}),auth=createAuthority({query:async()=>{sql++;return{rows:[]}}},generation,{writersEnabled:true,recovery});
 const ctx={user:{id:owner},purpose:'company',generation};for(const fn of [()=>auth.activity('x',ctx),()=>auth.revoke('x',ctx)])await assert.rejects(fn(),{status:503});
 const writes=createWriteService({controlPool:{connect:async()=>{sql++;throw Error('NOT_EXPECTED')}},authority:{},writerPools:{withTenant:async()=>{effects++}},readerPools:{},ownerId:owner,generation,recovery});
 await assert.rejects(writes.write({authorityContext:ctx,deadline:performance.now()+500}),{status:503});assert.equal(sql,0);assert.equal(effects,0);
});
const connection={host:'postgres',port:5432,database:'mecanet_tenant_a',user:'saas_writer_a',password:'SYNTHETIC_BOUNDARY_ONLY',ssl:{ca:'SYNTHETIC_CA',rejectUnauthorized:true}};
const descriptor=()=>({tenantId,dbName:connection.database,secretRef:'writer-a-v2',credentialVersion:'2',dataEpoch:'3',schemaVersion:3,status:'active',purpose:'company',recoveryRunId:runId,recoveryManifestHash:manifestHash});
test('schema3 pool and resolver require exact recovery refs and preserve aggregate limits',async()=>{
 const d=descriptor(),entry={...d,credentialPurpose:'write',connection};const resolver=createSecretResolver({entries:{[d.secretRef]:entry},access:'write'});
 await assert.rejects(resolver({...d,recoveryRunId:owner}),{code:'SECRET_MISMATCH'});
 let opened=0;const manager=createTenantPoolManager({resolveSecret:resolver,access:'write',allowedSchemaVersions:[3],recovery:runtime(),budget:createPoolBudget(),createPool:async()=>{opened++;return{connect:async()=>({release(){}}),end:async()=>{}}}});
 try{await assert.rejects(manager.withTenant({...d,recoveryManifestHash:'2'.repeat(64)},async()=>{}));assert.equal(opened,0);await manager.withTenant(d,async()=>{});assert.equal(opened,1);assert.equal(manager.snapshot().leased,0)}finally{await manager.close()}
});
test('generic coordinator cannot reopen TENANT or RESTORE even with a positive promotion callback',async()=>{
 for(const reason of ['TENANT','RESTORE']){let invoked=0;const query=async text=>({rows:text.startsWith('SELECT * FROM saas.write_restrictions')?[{id:transferId,reason_code:reason,status:'ACKNOWLEDGED',generation}]:text.startsWith('SELECT * FROM saas.write_restriction_tenants')?[{tenant_id:tenantId,generation,close_proven:true,data_epoch:'3',closed_version:'6',reopen_version:'7'}]:[]});const coordinator=createRestrictiveCoordinator({controlPool:{connect:async()=>({query,release(){}})},maintenancePools:{},resolveDescriptor:async()=>{},generation,verifyPromotion:async()=>{invoked++;return{verified:true,tenants:[{tenantId,generation,dataEpoch:'3'}]}}});await assert.rejects(coordinator.resumeOperationalBarrier(transferId),{code:'PROMOTION_NOT_PROVEN'});assert.equal(invoked,0)}
});
test('normal coordinator waits for COMPLETE even with pending clock acquisition',async()=>{
 let central=0;const coordinator=createRestrictiveCoordinator({controlPool:{connect:async()=>{central++;throw Error('NOT_EXPECTED')}},maintenancePools:{},resolveDescriptor:async()=>{},generation,recovery:runtime({row:state({stage:'CONFIGURED',ready:false}),guard:false})});assert.deepEqual(await coordinator.runOnce(),{processed:0,pending:true});assert.equal(central,0);
});
test('recovery coordinator closes an ordinary restriction through fixed steps without free maintenance DML',async()=>{
 const phases=[],guard={restriction_id:transferId,tenant_id:tenantId,generation,data_epoch:'3',open_version:'1',closed_version:'2',reopen_version:'3',stage:'PENDING',close_proven:false};let status='PENDING';
 const query=async(text,values)=>{
  assert.doesNotMatch(text,/^(?:UPDATE|INSERT|DELETE) /);
  if(text.includes('saas.restriction_step')){const phase=values[3];phases.push(phase);if(phase==='BEGIN')status='CLOSING';if(phase==='CLOSED'){guard.stage='CLOSED';guard.close_proven=true}if(phase==='RESOLVED')guard.stage='RESOLVED';if(phase==='APPLY')status='CLOSED';if(phase==='PREPARE_OPEN')guard.stage='REOPENING';if(phase==='OPEN')guard.stage='OPEN';if(phase==='ACK'){status='ACKNOWLEDGED';guard.stage='ACKNOWLEDGED'}return{rows:[{changed:true}]}}
  if(text.startsWith('SELECT * FROM saas.write_restrictions'))return{rows:[{id:transferId,generation,status,reason_code:'LOGOUT'}]};
  if(text.startsWith('SELECT * FROM saas.write_restriction_tenants'))return{rows:[{...guard}]};
  if(text.includes('SELECT EXISTS(SELECT 1 FROM saas.write_intents'))return{rows:[{pending:false}]};
  return{rows:[]};
 };
 const maintenancePools={withTenant:async(_descriptor,fn)=>fn({query:async q=>{const text=typeof q==='string'?q:q.text;return{rows:text.includes('inventory.close_writer_fence')?[{generation,data_epoch:'3',writer_version:'2',state:'CLOSED'}]:text.includes('inventory.open_writer_fence')?[{generation,data_epoch:'3',writer_version:'3',state:'OPEN'}]:[]}}})};
 const coordinator=createRestrictiveCoordinator({controlPool:{connect:async()=>({query,release(){}})},maintenancePools,resolveDescriptor:async()=>({tenantId}),generation,recovery:runtime({row:state({ready:false})})});
 assert.deepEqual(await coordinator.processRestriction(transferId),{acknowledged:true,id:transferId});assert.deepEqual(phases,['BEGIN','CLOSED','RESOLVED','APPLY','PREPARE_OPEN','OPEN','ACK']);
});
const transfer=()=>({kind:'recovery-initial',generation,runId,manifestHash,mode:'RECOVERY',previousOwner,nextOwner:owner,transferId,transferHash:'2'.repeat(64),endProofHash:'3'.repeat(64),expectedClockVersion:'3',expectedTick:'7',confirmed:true,reference:'cp019-custodied-clock'});
test('clock transfer is custodied, bound to configuration and cannot change next owner/version by retry',()=>{
 const prior={owner:previousOwner,generation,tick:'7',clock_version:'3'};const valid=validateClockTransfer(transfer(),prior,generation,binding);assert.equal(valid.nextOwner,owner);assert.equal(valid.expectedClockVersion,'3');
 for(const patch of [{nextOwner:previousOwner},{runId:owner},{manifestHash:'bad'},{expectedTick:'8'},{expectedClockVersion:'4'},{transferHash:'bad'},{endProofHash:'bad'}])assert.throws(()=>validateClockTransfer({...transfer(),...patch},prior,generation,binding),/CLOCK_TRANSFER_PROOF_REQUIRED/);
});
test('lost clock acquire ACK reconciles its exact tuple without acquiring or adopting another version',async()=>{
 const values={generation,recovery_id:runId,owner:previousOwner,tick:'7',clock_version:'3'};let updates=0,lost=true;
 const query=async(sql,args)=>{if(sql==='COMMIT'&&lost){lost=false;throw Error('lost ACK')}if(sql.startsWith('SELECT f.generation'))return{rows:[{...values,authority_tick:values.tick,authority_version:values.clock_version}]};if(sql.startsWith('SELECT generation')||sql.startsWith('SELECT owner'))return{rows:[{...values}]};if(sql.includes('recovery_clock_guard'))return{rows:[{allowed:true}]};if(sql.startsWith('UPDATE saas.admission_fence SET clock_version')){values.clock_version=args[0];updates++}if(sql.startsWith('UPDATE saas.time_authority SET owner')){values.owner=args[0];values.clock_version=args[1]}return{rows:[],rowCount:1}};
 const validated=validateClockTransfer(transfer(),{owner:previousOwner,generation,tick:'7',clock_version:'3'},generation,binding);const clock=createClock({pool:{query,connect:async()=>({query,release(){}})},generation,owner,recoveryTransfer:validated});
 await assert.rejects(clock.acquire(previousOwner),{code:'COMMIT_UNCERTAIN'});await clock.reconcile();assert.equal(updates,1);assert.equal(clock.state().version,'4');values.clock_version='5';await assert.rejects(clock.reconcile(),{code:'CLOCK_OWNER_CONFLICT'});assert.equal(updates,1);
});
