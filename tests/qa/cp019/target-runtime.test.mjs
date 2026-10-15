// Boundary tests only. No PostgreSQL, restored HTTP or process-end claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseMaterial} from '../../../server/saas/recovery/custody.js';
import {sha256} from '../../../server/saas/recovery/protocol.js';
import {createTargetSqlBroker,validateTargetCredentialPhase,validateTargetHostReceipt,createTargetHostObservers,validateTargetEndPair,publishTargetConfigFiles,stableTargetResult,targetFailureSummary} from './target-runtime.mjs';
import * as targetRuntime from './target-runtime.mjs';
import {makeSourceNormalManifest} from './source-driver.mjs';import {makeTargetVariantLineage,completeTargetVariantLineage,variantCaseName} from './target-variant-lineage.mjs';

const material=await chooseMaterial({project:'mecanet-qa-p1l3-r03',artifactDigest:'a'.repeat(64)});
const alternateMaterial=await chooseMaterial({project:material.source.project,artifactDigest:material.artifactDigest});
function setup({endFailure=false,chargeDelay=false}={}){
 let time=0,charges=0,opened=0,live=0,peak=0;const configs=[],events=[];
 const ledger={async charge(kind){assert.equal(kind,'sql');charges++;if(chargeDelay)time=45001;}};
 const poolFactory=async config=>{configs.push(config);opened++;live++;peak=Math.max(peak,live);events.push('open:'+config.database+':'+config.options);return{async connect(){return{async query(q){events.push('query:'+q.text);return{rows:[{ok:true}]}},release(e){events.push(e?'discard':'release')}}},async end(){events.push('end');if(endFailure)throw Error('END_UNCERTAIN');live--;}}};
 const broker=createTargetSqlBroker({material,targetCa:'TARGET-CA',bootstrapCredential:'source',ledger,poolFactory,now:()=>time});
 return{broker,configs,events,get charges(){return charges},get opened(){return opened},get peak(){return peak},advance(n){time=n}};
}
test('RO inspections and RW control alternate only after ending the previous sole bootstrap pool',async()=>{
 const f=setup();await f.broker.inspect({database:'mecanet_control',text:'SELECT true',values:[],readOnly:true,scope:'target',maxLeases:1,queryTimeoutMs:2000});
 const client=await f.broker.pools.control.connect();await client.query({text:'BEGIN',values:[]});client.release();
 await f.broker.pools.tenants['11111111-1111-4111-8111-111111111111'].query({text:'SELECT fixed_mutator()',values:[]});await f.broker.close();
 assert.equal(f.peak,1);assert.equal(f.opened,3);assert.equal(f.charges,1);assert.equal(f.configs[0].options,'-c default_transaction_read_only=on -c client_encoding=UTF8');assert.equal(f.configs[1].options,'-c default_transaction_read_only=off -c client_encoding=UTF8');
 assert.equal(f.configs[0].password,material.source.rolePasswords.qa_bootstrap);assert.ok(f.configs.every(c=>c.max===1&&c.ssl.ca==='TARGET-CA'&&c.ssl.rejectUnauthorized===true));
});
test('pool end uncertainty prevents a replacement connection and is retained across calls',async()=>{
 const f=setup({endFailure:true});await f.broker.inspect({database:'mecanet_control',text:'SELECT true',values:[],readOnly:true,scope:'target',maxLeases:1,queryTimeoutMs:2000});
 await assert.rejects(f.broker.pools.tenants['22222222-2222-4222-8222-222222222222'].query({text:'SELECT fixed_mutator()',values:[]}),/END_UNCERTAIN/);assert.equal(f.opened,1);
 await assert.rejects(f.broker.pools.control.query({text:'SELECT fixed_mutator()',values:[]}),/BROKER_UNCERTAIN/);assert.equal(f.opened,1);
});
test('a leased transaction cannot lend its connection to an inspector or another tenant',async()=>{
 const f=setup(),client=await f.broker.pools.control.connect();await assert.rejects(f.broker.inspect({database:'mecanet_control',text:'SELECT true',values:[],readOnly:true,scope:'target',maxLeases:1,queryTimeoutMs:2000}),/BROKER_BUSY/);
 client.release();await f.broker.close();assert.equal(f.opened,1);
});
test('the deadline is checked after durable ledger charge and before dispatch',async()=>{
 const f=setup({chargeDelay:true});await assert.rejects(f.broker.inspect({database:'mecanet_control',text:'SELECT true',values:[],readOnly:true,scope:'target',maxLeases:1,queryTimeoutMs:2000}),/DEADLINE/);assert.equal(f.charges,1);assert.equal(f.events.filter(e=>e.startsWith('query:')).length,0);await f.broker.close();
});
test('driver control queries are not charged twice by the raw broker',async()=>{
 const f=setup();await f.broker.pools.control.query({text:'SELECT fixed_mutator()',values:[]});assert.equal(f.charges,0);await f.broker.close();
});
test('inspection rejects a writer body, foreign database or unbounded callback contract before opening',async()=>{
 for(const change of [x=>x.text='UPDATE saas.identities SET status=1',x=>x.database='postgres',x=>x.readOnly=false,x=>x.queryTimeoutMs=2001,x=>x.maxLeases=2]){
  const f=setup(),q={database:'mecanet_control',text:'SELECT true',values:[],readOnly:true,scope:'target',maxLeases:1,queryTimeoutMs:2000};change(q);await assert.rejects(f.broker.inspect(q));assert.equal(f.opened,0);
 }
});
test('credentials are explicit for the phase, with no discovery or old-password fallback',()=>{
 assert.equal(validateTargetCredentialPhase('begin-enroll','source'),'source');assert.equal(validateTargetCredentialPhase('rotate','target'),'target');assert.equal(validateTargetCredentialPhase('configure','target'),'target');
 for(const [p,c]of [['begin-enroll','target'],['configure','source'],['canary','auto'],['target-rotate','source']])assert.throws(()=>validateTargetCredentialPhase(p,c));
});
test('release uncertainty poisons the broker instead of claiming a positive SQL end',async()=>{
 let calls=0;const f=setup();const broker=createTargetSqlBroker({material,targetCa:'TARGET-CA',bootstrapCredential:'target',ledger:{async charge(){}},poolFactory:async()=>({async connect(){return{async query(){calls++;return{rows:[]}},release(){throw Error('RELEASE_UNCERTAIN')}}},async end(){}})});
 await assert.rejects(broker.inspect({database:'mecanet_control',text:'SELECT true',values:[],readOnly:true,scope:'target',maxLeases:1,queryTimeoutMs:2000}),/RELEASE_UNCERTAIN/);await assert.rejects(broker.pools.control.query({text:'SELECT another()',values:[]}),/BROKER_UNCERTAIN/);assert.equal(calls,1);await broker.close();
});
test('private failure summaries do not carry SQL, values, detailed messages or absolute paths',()=>{
 const e=Object.assign(Error('password=DO_NOT_PRINT secret SQL SELECT'),{code:'42501',position:'123',detail:'DO_NOT_PRINT',stack:'Error\n at C:/secret/tests/qa/cp019/target-runtime.mjs:12:3'});
 const out=targetFailureSummary(e);assert.equal(out.causeCode,'42501');assert.equal(out.queryPosition,123);assert.equal(JSON.stringify(out).includes('DO_NOT_PRINT'),false);assert.deepEqual(out.frames,['target-runtime.mjs:12:3']);
});
test('deadline reached while connecting discards that lease and never dispatches SQL',async()=>{
 let time=0,discards=0,queries=0,ended=0;const broker=createTargetSqlBroker({material,targetCa:'TARGET-CA',bootstrapCredential:'target',ledger:{async charge(){}},now:()=>time,poolFactory:async()=>({async connect(){time=45001;return{async query(){queries++},release(error){if(error)discards++}}},async end(){ended++}})});
 await assert.rejects(broker.pools.control.query({text:'SELECT fixed_mutator()',values:[]}),/DEADLINE/);await broker.close();assert.equal(discards,1);assert.equal(queries,0);assert.equal(ended,1);
});
test('role authentication uses actual server fields and TLS replication for backup without enterprise CONNECT',async()=>{
 const connections=Object.fromEntries(['saas_api','saas_backup'].map(role=>[role,{host:'postgres',port:5432,database:role==='saas_backup'?'postgres':'mecanet_control',user:role,password:material.target.rolePasswords[role],ssl:{ca:'TARGET-CA',servername:'postgres',rejectUnauthorized:true}}]));
 let charged=0,live=0,peak=0;const configs=[],resource={networkIP:'10.77.66.2',systemIdentifier:'1234567890123456789'};
 const broker=createTargetSqlBroker({material,targetCa:'TARGET-CA',targetResource:resource,bootstrapCredential:'target',roleConnections:connections,ledger:{async charge(){charged++}},poolFactory:async c=>{configs.push(c);live++;peak=Math.max(peak,live);return{async connect(){return{connection:{stream:{encrypted:true}},async query(q){return{rows:[q.text==='IDENTIFY_SYSTEM'?{systemid:resource.systemIdentifier,timeline:'1',xlogpos:'0/ABC'}:{role:c.user,database:c.database,server_address:resource.networkIP,tls:true,read_only:'on'}]}},release(){}}},async end(){live--}}}});
 const a=await broker.authenticateRole({role:'saas_api',database:'mecanet_control',connection:connections.saas_api});assert.equal(a.sqlRole,'saas_api');assert.equal(a.sqlDatabase,'mecanet_control');assert.equal(a.readOnly,true);
 const backup=await broker.authenticateRole({role:'saas_backup',database:'postgres',connection:connections.saas_backup});assert.equal(backup.systemIdentifier,resource.systemIdentifier);assert.equal(backup.replication,true);assert.equal(backup.tls,true);assert.equal(configs.at(-1).replication,true);assert.equal(configs.at(-1).database,'postgres');
 const bootstrap=await broker.authenticateRole({role:'qa_bootstrap',database:'postgres',connection:{...connections.saas_api,user:'qa_bootstrap',database:'postgres',password:material.target.rolePasswords.qa_bootstrap}});assert.equal(bootstrap.sqlRole,'qa_bootstrap');await broker.close();assert.equal(charged,3);assert.equal(peak,1);
});
test('an authenticated-looking role cannot pass a foreign SQL address, writable transaction or unencrypted backup socket',async()=>{
 for(const variant of ['ip','rw','backup-tls']){
  const role=variant==='backup-tls'?'saas_backup':'saas_api',db=role==='saas_backup'?'postgres':'mecanet_control',c={host:'postgres',port:5432,database:db,user:role,password:material.target.rolePasswords[role],ssl:{ca:'TARGET-CA',servername:'postgres',rejectUnauthorized:true}};
  const resource={networkIP:'10.77.66.2',systemIdentifier:'1234567890123456789'};
  const broker=createTargetSqlBroker({material,targetCa:'TARGET-CA',targetResource:resource,bootstrapCredential:'target',roleConnections:{[role]:c},ledger:{async charge(){}},poolFactory:async()=>({async connect(){return{connection:{stream:{encrypted:variant!=='backup-tls'}},async query(){return{rows:[role==='saas_backup'?{systemid:resource.systemIdentifier,timeline:'1',xlogpos:'0/ABC'}:{role,database:db,server_address:variant==='ip'?'10.77.64.2':resource.networkIP,tls:true,read_only:variant==='rw'?'off':'on'}]}},release(){}}},async end(){}})});
  await assert.rejects(broker.authenticateRole({role,database:db,connection:c}));await broker.close();
 }
});
function hostFixture(){
 const H='a'.repeat(64),S='b'.repeat(40),resource=(side,n)=>({project:material[side].project,cohortId:side==='source'?material.source.normal.runId:material.target.generation,hostIdentity:H,containerId:String(n).repeat(64),containerLabels:{project:material[side].project,service:'postgres'},imageDigest:'sha256:'+H,volumeId:'own-volume-'+n,dataPath:'/opt/'+material[side].project+'/data',networkId:'own-network-'+n,networkSubnet:n===1?'10.77.64.0/24':'10.77.66.0/25',networkIP:n===1?'10.77.64.2':'10.77.66.2',socketPath:'/opt/'+material[side].project+'/ingress/http.sock',generation:material[side].generation,systemIdentifier:'1234567890123456789'});
 const source=resource('source',1),target=resource('target',2),processes=['api1','api2','worker','web'].map((service,i)=>({service,containerId:String(i+3).repeat(64),ownerId:service==='worker'?material.source.workerClockOwner:service==='web'?material.source.webOwner:material.source.apiOwners[service],exitCode:0,finishedAt:'2026-10-14T02:00:00Z'}));
 const sourceEndProof={schema:'source-end-v1',recoveryId:material.recoveryId,sourceResourceHash:sha256(source),processes,sqlOwners:processes.slice(0,3).map(p=>p.ownerId),httpOperationIds:[]};
 const observedSourceEnd={resourceHash:sha256(source),containers:processes.map(p=>({id:p.containerId,service:p.service,ownerId:p.ownerId,running:false,exitCode:0,finishedAt:p.finishedAt})),sqlOwnersPresent:[],httpPending:[]};
 const scopes=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'].map((tenantId,i)=>({tenantId,database:'mecanet_tenant_'+(i?'b':'a'),roles:['saas_tenant_'+(i?'b':'a'),'saas_writer_'+(i?'b':'a')],eligibility:i?'RESTRICTED_CLOSED':'OPEN_ELIGIBLE',closedReason:i?'TENANT':'RESTORE',sourceEpoch:'2',targetEpoch:'3',closedVersion:'2',openVersion:'3',abortVersion:'4',schemaVersion:3,readerRef:'tenant-'+(i?'b':'a')+'-v2',writerRef:'writer-'+(i?'b':'a')+'-v2',credentialVersion:'2',writerCredentialVersion:'2'}));
 const manifest={schema:'recovery-manifest-v1',recoveryId:material.recoveryId,provenance:{baseSha:'86985fe7589032f202ebf0cb057a9b1384217151',producerSha:S,verifierSha:S,artifactDigest:H,controllerOwner:material.controllerOwner},source,target,copyIndexHash:H,copyCheckpoint:{sequence:1,hash:H},sourceClosedProofHash:sha256(sourceEndProof),journalFinalCheckpoint:{sequence:1,hash:H},scopes};
 const configBundle={manifest,sourceEndProof,anchors:{manifestHash:sha256(manifest),targetResourceHash:sha256(target)},proofBundle:{sourceEndProofHash:sha256(sourceEndProof)}};
 const receipt={schema:'target-host-receipt-v1',phase:'begin-enroll',invocationId:material.stageOperationIds['target-begin'],sourceSha:S,recoveryId:material.recoveryId,generation:material.target.generation,custodyHash:sha256(material),configBundleHash:H,sourceCaptureHash:H,manifestHash:sha256(manifest),targetResourceHash:sha256(target),sourceEndProofHash:sha256(sourceEndProof),observedAt:'2026-10-14T02:01:00Z',observedResources:{source,target,sourcePostgresRunning:false,targetPostgresRunning:true,runtimeConsumers:[]},observedSourceEnd};
 return{receipt,receiptHash:sha256(receipt),invocationId:receipt.invocationId,phase:receipt.phase,material,configBundle,configBundleHash:H,sourceCaptureHash:H,sourceSha:S,now:Date.parse(receipt.observedAt)+1};
}
test('a target host receipt is bound to source end, target resource, immutable files and invocation',()=>{
 const f=hostFixture();assert.equal(validateTargetHostReceipt(f).schema,'target-host-receipt-v1');
 for(const change of [x=>x.receipt.invocationId=material.stageOperationIds['target-enroll-a'],x=>x.receipt.observedResources.target.containerId='f'.repeat(64),x=>x.receipt.observedSourceEnd.sqlOwnersPresent=[material.source.workerClockOwner],x=>x.receipt.configBundleHash='f'.repeat(64),x=>x.now=Date.parse(x.receipt.observedAt)+5001,x=>x.now=Date.parse(x.receipt.observedAt)-1]){
  const x=hostFixture();change(x);x.receiptHash=sha256(x.receipt);assert.throws(()=>validateTargetHostReceipt(x));
 }
});
test('confirmed receipt identity excludes variable retry statistics but retains semantic stages and plan provenance',()=>{
 const r={status:'PASS',phase:'configure',planHash:'a'.repeat(64),sqlCommands:100,controlCommands:99,elapsedMs:1,results:[{method:'configureControl',stage:'CONFIGURED',version:'2',reconciled:false}]};
 const retry={...r,elapsedMs:20,sqlCommands:5,controlCommands:4,results:[{...r.results[0],reconciled:true}]};assert.deepEqual(stableTargetResult(r),stableTargetResult(retry));assert.notEqual(sha256(stableTargetResult(r)),sha256(stableTargetResult({...r,results:[{...r.results[0],version:'3'}]})));
});
function runtimeConfigs(){
 const c=material.target,H='a'.repeat(64),recovery={mode:'RECOVERY',runId:material.recoveryId,manifestHash:H},connection=(role,database='mecanet_control')=>({host:'postgres',port:5432,database,user:role,password:c.rolePasswords[role],ssl:{ca:'TARGET-CA',servername:'postgres',rejectUnauthorized:true}}),entries={},writerEntries={},maintenanceEntries={};
 for(const[tenantId,suffix]of [['11111111-1111-4111-8111-111111111111','a'],['22222222-2222-4222-8222-222222222222','b']]){
  for(const[table,ref,access,role]of [[entries,'tenant-'+suffix+'-v2','read','saas_tenant_'+suffix],[writerEntries,'writer-'+suffix+'-v2','write','saas_writer_'+suffix],[maintenanceEntries,'maintenance-'+suffix+'-v2','maintenance','saas_maintainer_'+suffix]])table[ref]={tenantId,dbName:'mecanet_tenant_'+suffix,secretRef:ref,credentialVersion:'2',dataEpoch:'3',schemaVersion:3,status:'active',purpose:'company',credentialPurpose:access,recoveryRunId:recovery.runId,recoveryManifestHash:H,connection:connection(role,'mecanet_tenant_'+suffix)};
 }
 entries['demo-v1']={tenantId:'33333333-3333-4333-8333-333333333333',dbName:'mecanet_demo',secretRef:'demo-v1',credentialVersion:'1',dataEpoch:'1',schemaVersion:1,status:'active',purpose:'demo',credentialPurpose:'read',connection:connection('saas_demo','mecanet_demo')};
 const api={control:connection('saas_api'),sessions:connection('saas_session'),issuer:connection('saas_issuer'),sessionSecret:c.sessionSecret,generation:c.generation,entries,writerEntries,recovery};
 return{api1:{...api,ownerId:c.apiOwners.api1},api2:{...api,ownerId:c.apiOwners.api2},worker:{connection:connection('saas_clock'),maintenanceConnection:connection('saas_writer_maintenance'),maintenanceEntries,generation:c.generation,clockOwner:c.workerClockOwner,recovery,clockTransfer:{kind:'recovery-initial',mode:'RECOVERY',generation:c.generation,runId:material.recoveryId,manifestHash:H,previousOwner:c.seedClockOwner,nextOwner:c.workerClockOwner,transferId:c.operationIds.clockTransfer,transferHash:H,endProofHash:H,expectedClockVersion:'101',expectedTick:'99',confirmed:true,reference:'custodied-'+H}}};
}
test('cold configuration publication is immutable, read back and charged once per actual new file',async()=>{
 const configs=runtimeConfigs(),files=new Map();let charges=0,writes=0;
 const load=async file=>{if(!files.has(file))throw Object.assign(Error('absent'),{code:'ENOENT'});return files.get(file)};
 const publish=async(file,value)=>{assert.ok(['/run/qa-secrets/worker.json','/run/qa-secrets/api1.json','/run/qa-secrets/api2.json'].includes(file));assert.equal(files.has(file),false);writes++;const entry={value:structuredClone(value),sha256:sha256(value)};files.set(file,entry);return{sha256:entry.sha256}};
 const options={configs,project:material.target.project,ledger:{async charge(kind){assert.equal(kind,'artifactFiles');charges++}},load,publish};
 const first=await publishTargetConfigFiles(options),retry=await publishTargetConfigFiles(options);assert.deepEqual(first,retry);assert.equal(writes,3);assert.equal(charges,3);
 const bad=structuredClone(configs);bad.worker.clockTransfer.transferHash='b'.repeat(64);await assert.rejects(publishTargetConfigFiles({...options,configs:bad}),/COLLISION/);assert.equal(writes,3);
});
test('missing readback or excessive API authority cannot be published as a confirmed config',async()=>{
 const configs=runtimeConfigs();let writes=0;const opts={configs,project:material.target.project,ledger:{async charge(){}},load:async()=>{throw Object.assign(Error('absent'),{code:'ENOENT'})},publish:async(_file,value)=>{writes++;return{sha256:sha256(value)}}};
 await assert.rejects(publishTargetConfigFiles(opts),/absent/);assert.equal(writes,1);
 const bad=structuredClone(configs);bad.api1.material=material;await assert.rejects(publishTargetConfigFiles({...opts,configs:bad}),/EXCESS_AUTHORITY/);assert.equal(writes,1);
});
test('an end timeout never proves closure or permits a replacement physical connection',async()=>{
 let opened=0;const broker=createTargetSqlBroker({material,targetCa:'TARGET-CA',bootstrapCredential:'source',endTimeoutMs:10,ledger:{async charge(){}},poolFactory:async()=>{opened++;return{async connect(){return{async query(){return{rows:[]}},release(){}}},async end(){return new Promise(()=>{})}}}});
 await broker.pools.control.query({text:'SELECT fixed_mutator()',values:[]});await assert.rejects(broker.pools.tenants['11111111-1111-4111-8111-111111111111'].query({text:'SELECT fixed_mutator()',values:[]}),/POOL_END_UNCERTAIN/);assert.equal(opened,1);await assert.rejects(broker.pools.control.query({text:'SELECT fixed_mutator()',values:[]}),/BROKER_UNCERTAIN/);assert.equal(opened,1);
});
test('target abort requires positive end of its own four processes; source end cannot be reused',()=>{
 const f=hostFixture(),source=f.configBundle.sourceEndProof,processes=source.processes.map((p,i)=>({...p,containerId:String(i+7).repeat(64),ownerId:p.service==='worker'?material.target.workerClockOwner:p.service==='web'?material.target.webOwner:material.target.apiOwners[p.service]}));
 // Hexadecimal64 IDs rather than decimal two-character repetitions.
 processes[3].containerId='a'.repeat(64);
 const endProof={...source,sourceResourceHash:sha256(f.configBundle.manifest.target),processes,sqlOwners:processes.slice(0,3).map(p=>p.ownerId)};
 const observedEnd={resourceHash:endProof.sourceResourceHash,containers:processes.map(p=>({id:p.containerId,service:p.service,ownerId:p.ownerId,running:false,exitCode:0,finishedAt:p.finishedAt})),sqlOwnersPresent:[],httpPending:[]},pair={endProof,observedEnd,createdServices:['api1','api2','web','worker']};
 assert.equal(validateTargetEndPair({pair,material,targetResource:f.configBundle.manifest.target,sourceEndProof:source}),sha256(endProof));
 for(const change of [x=>x.endProof.processes[0].ownerId=material.source.apiOwners.api1,x=>x.observedEnd.sqlOwnersPresent=[material.target.workerClockOwner],x=>x.observedEnd.httpPending=['old-request'],x=>{x.endProof.processes[0].containerId=source.processes[0].containerId;x.observedEnd.containers[0].id=source.processes[0].containerId}]){const x=structuredClone(pair);change(x);assert.throws(()=>validateTargetEndPair({pair:x,material,targetResource:f.configBundle.manifest.target,sourceEndProof:source}));}
 const receipt={...f.receipt,phase:'abort-close',targetEnd:pair,targetEndProofHash:sha256(endProof)};assert.equal(validateTargetHostReceipt({...f,phase:'abort-close',receipt,receiptHash:sha256(receipt)}).phase,'abort-close');
 const missing={...receipt};delete missing.targetEnd;assert.throws(()=>validateTargetHostReceipt({...f,phase:'abort-close',receipt:missing,receiptHash:sha256(missing)}));
 const falseInventory=structuredClone(pair);falseInventory.createdServices=['worker'];assert.throws(()=>validateTargetEndPair({pair:falseInventory,material,targetResource:f.configBundle.manifest.target,sourceEndProof:source}),/TARGET_END_INVENTORY/);
});
test('every host callback revalidates freshness instead of retaining a once-valid snapshot',async()=>{
 const f=hostFixture();let time=f.now;const observer=createTargetHostObservers({input:f,receipt:f.receipt,receiptHash:f.receiptHash,now:()=>time});
 assert.equal((await observer.observeResources()).targetPostgresRunning,true);assert.deepEqual(await observer.observeSourceEnd(),f.receipt.observedSourceEnd);time=Date.parse(f.receipt.observedAt)+5001;
 await assert.rejects(observer.observeResources(),/HOST_FRESHNESS/);await assert.rejects(observer.observeSourceEnd(),/HOST_FRESHNESS/);
});

test('compensation contexts cannot mix, and promote-fault requires its custodied prefix before any host callback',()=>{
 const f=hostFixture();assert.throws(()=>validateTargetHostReceipt({...f,clockRestart:{},abortPrefix:{}}),/TARGET_RUNTIME_COMPENSATION_CONTEXT/);
 const receipt={...f.receipt,phase:'promote-fault'};assert.throws(()=>validateTargetHostReceipt({...f,phase:'promote-fault',receipt,receiptHash:sha256(receipt)}),/TARGET_RUNTIME_ABORT_PREFIX_CONTEXT/);
 assert.equal(validateTargetCredentialPhase('promote-fault','target'),'target');assert.throws(()=>validateTargetCredentialPhase('promote-fault','source'),/TARGET_RUNTIME_CREDENTIAL_PHASE/);
});

test('hot observers load a new bound mailbox on every callback, including a sample after the old one expired',async()=>{
 const f=hostFixture();f.receipt.caseName='target-'+f.phase;let time=f.now,loads=0,current={receipt:f.receipt,receiptHash:sha256(f.receipt)};
 const observer=targetRuntime.createTargetMailboxObservers({input:f,now:()=>time,load:async()=>{loads++;return structuredClone(current)}});
 assert.equal((await observer.observeResources()).targetPostgresRunning,true);time+=6000;
 const fresh={...f.receipt,observedAt:new Date(time).toISOString()};current={receipt:fresh,receiptHash:sha256(fresh)};
 assert.deepEqual(await observer.observeSourceEnd(),fresh.observedSourceEnd);assert.equal(loads,2);
 current.receipt.caseName='target-activation';current.receiptHash=sha256(current.receipt);await assert.rejects(observer.observeResources(),/MAILBOX_CASE/);assert.equal(loads,3);
});

test('hot observers deny stale, swapped, false-hash or malformed publications without keeping an old successful sample',async()=>{
 for(const change of [x=>x.receipt.observedAt='2026-10-14T01:00:00Z',x=>x.receipt.invocationId=material.stageOperationIds['target-enroll-a'],x=>x.receipt.sourceSha='f'.repeat(40),x=>x.receipt.targetResourceHash='f'.repeat(64),x=>x.extra=true]){
  const f=hostFixture();f.receipt.caseName='target-'+f.phase;let packet={receipt:structuredClone(f.receipt),receiptHash:sha256(f.receipt)};const observer=targetRuntime.createTargetMailboxObservers({input:f,now:()=>f.now,load:async()=>packet});await observer.observeResources();change(packet);packet.receiptHash=sha256(packet.receipt);await assert.rejects(observer.observeResources());
 }
 const f=hostFixture();f.receipt.caseName='target-'+f.phase;await assert.rejects(targetRuntime.createTargetMailboxObservers({input:f,now:()=>f.now,load:async()=>({receipt:f.receipt,receiptHash:'f'.repeat(64)})}).observeResources(),/HOST_RECEIPT/);
 let reads=0;const o=targetRuntime.createTargetMailboxObservers({input:f,now:()=>++reads===1?f.now:f.now+5001,load:async()=>({receipt:f.receipt,receiptHash:sha256(f.receipt)})});await assert.rejects(o.observeResources(),/HOST_FRESHNESS/);
});

function mailboxIO(packet,alter={}){
 const bytes=Buffer.from(JSON.stringify(packet)),file={mode:0o100400,uid:999,nlink:1,ino:7,dev:1,size:bytes.length,mtimeMs:1,ctimeMs:1,isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false},dir={mode:0o40700,uid:999,isDirectory:()=>true,isSymbolicLink:()=>false};let ended=0;
 Object.assign(file,alter.file??{});return{io:{async lstat(path){assert.ok(['/run/qa-live','/run/qa-live/target-host.json'].includes(path));return path.endsWith('.json')?file:{...dir,...alter.dir}},async realpath(){return'/run/qa-live'},async open(path,flags){assert.equal(path,'/run/qa-live/target-host.json');assert.equal(typeof flags,'number');return{async stat(){return{...file,...alter.opened}},async read(buffer,offset,length,position){const n=Math.max(0,Math.min(length,bytes.length-position));bytes.copy(buffer,offset,position,position+n);return{bytesRead:n}},async close(){ended++}}}},get ended(){return ended}};
}
test('mailbox reads only the fixed complete400UID999 file and closes it; metadata and atomic-race substitutions fail closed',async()=>{
 const f=hostFixture(),packet={receipt:f.receipt,receiptHash:sha256(f.receipt)},clean=mailboxIO(packet);assert.deepEqual(await targetRuntime.readTargetHostMailbox({io:clean.io}),packet);assert.equal(clean.ended,1);
 for(const alter of [{file:{uid:0}},{file:{mode:0o100600}},{file:{nlink:2}},{file:{isSymbolicLink:()=>true}},{dir:{mode:0o40777}},{dir:{uid:0}},{dir:{isSymbolicLink:()=>true}},{opened:{ino:9}},{opened:{size:1}},{file:{size:262145}}]){const x=mailboxIO(packet,alter);await assert.rejects(targetRuntime.readTargetHostMailbox({io:x.io}));}
});

function replacingMailbox(packet,{beforeOpen=false,foreign=false,tamper=false,repeat=false}={}){
 const bytes=Buffer.from(JSON.stringify(packet)),stat=ino=>({mode:0o100400,uid:999,nlink:1,ino,dev:1,size:bytes.length,mtimeMs:1,ctimeMs:1,isFile:()=>true,isSymbolicLink:()=>false}),dir={mode:0o40700,uid:999,isDirectory:()=>true,isSymbolicLink:()=>false};let named=stat(7),opened=0,ended=0;
 const io={async lstat(path){return path==='/run/qa-live'?dir:{...named}},async realpath(){return'/run/qa-live'},async open(path){assert.ok(['/run/qa-live/target-host.json','/run/qa-live/target-copy-host.json'].includes(path));opened++;if(beforeOpen&&(opened===1||repeat))named=stat(named.ino+1);const held={...named};let reads=0;return{async stat(){return{...held}},async read(buffer,offset,length,position){if(++reads===1&&!beforeOpen){named={...stat(held.ino+1),...(foreign?{uid:0}:{})};held.nlink=0;held.ctimeMs=2;if(tamper)held.mtimeMs=2}const n=Math.max(0,Math.min(length,bytes.length-position));bytes.copy(buffer,offset,position,position+n);return{bytesRead:n}},async close(){ended++}}}};
 return{io,get opened(){return opened},get ended(){return ended}};
}
test('an atomically replaced complete mailbox FD remains valid, while replacement before open is retried at most three times',async()=>{
 const f=hostFixture(),packet={receipt:f.receipt,receiptHash:sha256(f.receipt)};
 for(const beforeOpen of [false,true]){const x=replacingMailbox(packet,{beforeOpen});assert.deepEqual(await targetRuntime.readTargetHostMailbox({io:x.io}),packet);assert.equal(x.opened,beforeOpen?2:1);assert.equal(x.ended,x.opened)}
 const repeated=replacingMailbox(packet,{beforeOpen:true,repeat:true});await assert.rejects(targetRuntime.readTargetHostMailbox({io:repeated.io}),/MAILBOX_CHANGED/);assert.equal(repeated.opened,3);assert.equal(repeated.ended,3);
 for(const options of [{foreign:true},{tamper:true}]){const x=replacingMailbox(packet,options);await assert.rejects(targetRuntime.readTargetHostMailbox({io:x.io}));assert.equal(x.ended,1)}
 const copy=replacingMailbox(packet);assert.deepEqual(await targetRuntime.readTargetCopyHostMailbox({io:copy.io}),packet);assert.equal(copy.ended,1);
});

function rotationConnection({phase='rotate',code='28P01',endFails=false}={}){
 const events=[];let live=0,peak=0;
 const broker=createTargetSqlBroker({material,phase,targetCa:'TARGET-CA',bootstrapCredential:'source',ledger:{async charge(){}},poolFactory:async c=>{const old=c.password===material.source.rolePasswords.qa_bootstrap;assert.ok(old||c.password===material.target.rolePasswords.qa_bootstrap,'UNCHOSEN_CREDENTIAL');events.push(old?'open-source':'open-target');live++;peak=Math.max(peak,live);return{async connect(){events.push(old?'auth-source':'auth-target');if(old)throw Object.assign(Error('AUTH_FAILED'),{code});return{async query(){return{rows:[{ok:true}]}},release(){}}},async end(){events.push('end');if(endFails)throw Error('END_FAILED');live--}}}});
 return{broker,events,get peak(){return peak}};
}
test('rotate reconnects after committed bootstrap password change using only the custodied target credential and positive prior pool end',async()=>{
 const f=rotationConnection();await f.broker.pools.control.query({text:'SELECT fixed_reconcile',values:[]});await f.broker.close();assert.deepEqual(f.events,['open-source','auth-source','end','open-target','auth-target','end']);assert.equal(f.peak,1);
});
test('connection reset, TLS failure, another phase or uncertain pool end never trigger password fallback or SQL retry',async()=>{
 for(const options of [{code:'ECONNRESET'},{code:'CERT_HAS_EXPIRED'},{phase:'activation'},{endFails:true}]){
  const f=rotationConnection(options);await assert.rejects(f.broker.pools.control.query({text:'SELECT fixed_reconcile',values:[]}));assert.equal(f.events.includes('auth-target'),false);try{await f.broker.close()}catch{}
 }
});

function variantRuntimeFixture(kind='promote-prefix'){
 const f=hostFixture(),H='a'.repeat(64),effective={...structuredClone(material),recoveryId:alternateMaterial.recoveryId,target:{...structuredClone(alternateMaterial.target),identityPassword:material.target.identityPassword,identityPasswordHash:material.target.identityPasswordHash},stageOperationIds:Object.fromEntries(Object.entries(material.stageOperationIds).map(([k,v])=>[k,k.startsWith('source-')?v:alternateMaterial.stageOperationIds[k]]))};
 const b=f.configBundle,resource=b.manifest.source;resource.dataPath='/opt/'+material.source.project+'/data/18/docker';resource.imageDigest='sha256:67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129';b.sourceEndProof.sourceResourceHash=sha256(resource);f.receipt.observedSourceEnd.resourceHash=sha256(resource);
 const normal=makeSourceNormalManifest({material,custodyHash:sha256(material),resource,migrationHashes:{central:H,tenant:H},sourceCommit:f.sourceSha}),capture={schema:'source-capture-v1',runId:material.source.normal.runId,custodyHash:sha256(material),normalManifestHash:sha256(normal),resourceHash:sha256(resource),sourceCommit:f.sourceSha};
 const context={kind,originalMaterial:material,effectiveMaterial:effective,sourceCapture:capture,sourceNormalManifest:normal,sourceResource:resource,sourceEndProof:b.sourceEndProof,observedSourceEnd:f.receipt.observedSourceEnd,copyIndex:{schema:'copy-index-v1',files:[]},sourceJournalFinalCheckpoint:{sequence:1,hash:H},ledgerAnchor:{schema:'target-variant-budget-anchor-v1',project:material.source.project,path:'/opt/'+material.source.project+'/budget/ledger.json',registryHash:H,startedUptime:100,sequence:10,total:{sql:1,http:1,journal:1,artifactFiles:1}}};
 context.addition=makeTargetVariantLineage(context);context.additionHash=sha256(context.addition);const paths=context.addition.paths;b.manifest.recoveryId=effective.recoveryId;Object.assign(b.manifest.target,{generation:effective.target.generation,cohortId:effective.target.generation,dataPath:paths.data,socketPath:paths.socket});b.manifest.sourceClosedProofHash=sha256(b.sourceEndProof);b.proofBundle.sourceEndProofHash=sha256(b.sourceEndProof);Object.assign(b.anchors,{manifestHash:sha256(b.manifest),targetResourceHash:sha256(b.manifest.target),custodyHash:sha256(effective)});Object.assign(b,{variantLineageHash:context.additionHash,copyIndex:context.copyIndex,observedEnd:context.observedSourceEnd,sourceJournalFinalCheckpoint:context.sourceJournalFinalCheckpoint});Object.assign(f,{material:effective,sourceCapture:capture,sourceCaptureHash:sha256(capture),variantLineage:context,configBundleHash:sha256(b)});
 Object.assign(f.receipt,{recoveryId:effective.recoveryId,generation:effective.target.generation,custodyHash:sha256(effective),manifestHash:b.anchors.manifestHash,targetResourceHash:b.anchors.targetResourceHash,sourceCaptureHash:f.sourceCaptureHash,sourceEndProofHash:b.proofBundle.sourceEndProofHash,configBundleHash:f.configBundleHash,variantLineageHash:context.additionHash,caseName:variantCaseName(kind,'begin-enroll')});f.receiptHash=sha256(f.receipt);return f;
}
test('variant runtime binds effective target to original source without relabelling capture/END, and uses only its semantic ledger case',()=>{const f=variantRuntimeFixture(),v=targetRuntime.validateTargetRuntimeLineage(f);assert.equal(v.sourceOriginalRecoveryId,material.recoveryId);assert.notEqual(v.sourceOriginalRecoveryId,f.material.recoveryId);assert.equal(f.sourceCapture.custodyHash,sha256(material));assert.equal(targetRuntime.targetRuntimeCase(f),'target-promote-fault');assert.equal(validateTargetHostReceipt(f).variantLineageHash,f.variantLineage.additionHash);const lean=Object.fromEntries(['kind','originalMaterial','effectiveMaterial','addition','additionHash','sourceNormalManifest','ledgerAnchor'].map(k=>[k,f.variantLineage[k]])),inputs=Object.fromEntries(['sourceCapture','sourceResource','sourceEndProof','observedSourceEnd','copyIndex','sourceJournalFinalCheckpoint'].map(k=>[k,f.variantLineage[k]]));assert.deepEqual(completeTargetVariantLineage(lean,inputs),f.variantLineage);});
test('missing lineage, rewritten source capture/END or a different target cannot adopt variant identity',()=>{for(const change of [f=>delete f.variantLineage,f=>f.sourceCapture.custodyHash=sha256(f.material),f=>f.configBundle.sourceEndProof.recoveryId=f.material.recoveryId,f=>f.configBundle.manifest.target.dataPath='/opt/other/data',f=>f.variantLineage.additionHash='f'.repeat(64)]){const f=variantRuntimeFixture();change(f);assert.throws(()=>targetRuntime.validateTargetRuntimeLineage(f));}const normal=hostFixture();assert.equal(targetRuntime.validateTargetRuntimeLineage(normal),null);assert.equal(targetRuntime.targetRuntimeCase(normal),'target-begin-enroll');});
test('variant hot mailbox preserves lineage/case/hash on every fresh read and refuses main-case or foreign-lineage publications',async()=>{const f=variantRuntimeFixture();let packet={receipt:f.receipt,receiptHash:f.receiptHash};const o=targetRuntime.createTargetMailboxObservers({input:f,now:()=>f.now,load:async()=>packet});assert.equal((await o.observeResources()).targetPostgresRunning,true);for(const change of [r=>r.caseName='target-begin-enroll',r=>r.variantLineageHash='f'.repeat(64)]){const r=structuredClone(f.receipt);change(r);packet={receipt:r,receiptHash:sha256(r)};await assert.rejects(o.observeResources());}});


async function commitRuntimeFixture(){
 const input=variantRuntimeFixture('commit-interrupted'),m=input.material,b=input.configBundle,H='a'.repeat(64);input.phase='promotion';input.invocationId=m.stageOperationIds['target-prepare-promote'];
 b.plan={schema:'target-driver-plan-v1',recoveryId:m.recoveryId,generation:m.target.generation,sourceSha:input.sourceSha,resourceHash:b.anchors.targetResourceHash,sourceEndProofHash:b.proofBundle.sourceEndProofHash,phases:{promotion:{steps:[{method:'preparePromotion',args:{operationKey:'target-prepare-promote',expected:{stage:'VERIFIED',version:'5',global_blocked:true},after:{stage:'PROMOTING',version:'6',global_blocked:true},proofHash:H}}]}}};b.planHash=sha256(b.plan);input.configBundleHash=sha256(b);
 const {makeCommitFaultPlan}=await import('./commit-fault-hook.mjs'),plan=makeCommitFaultPlan({material:m,parentPlan:b.plan,parentPlanHash:b.planHash,variantLineageHash:b.variantLineageHash,invocationId:input.invocationId,controllerContainerId:'c'.repeat(64)});
 input.commitFault={schema:'target-commit-fault-context-v1',configBundleHash:input.configBundleHash,sourceCaptureHash:input.sourceCaptureHash,variantLineageHash:b.variantLineageHash,mode:'inject',plan,planHash:sha256(plan),retryEndPair:null,retryProbe:null};input.commitFaultContextHash=sha256(input.commitFault);return input;
}

test('commit pool composition requires the pinned prospective context and suppresses ACK through the actual broker boundary',async()=>{
 const input=await commitRuntimeFixture(),queries=[],store=new Map();let sql=0,files=0,mutators=0,ends=0;
 const ledger={async charge(kind){if(kind==='sql')sql++;else if(kind==='artifactFiles')files++;else assert.fail(kind)}};
 const options={input,ledger,loadCommitFaultReceipt:async()=>store.get('receipt')??null,publishCommitFaultReceipt:async(value,hash)=>{store.set('receipt',{value,sha256:sha256(value)});assert.equal(hash,sha256(value));return{sha256:hash}},poolFactory:async()=>({async connect(){return{async query(q){const text=typeof q==='string'?q:q.text;queries.push(text);if(text.startsWith('SELECT pg_backend_pid()'))return{rows:[{pid:13,backend_started_at:'2026-10-15T00:00:00Z'}]};if(text===input.commitFault.plan.statement.text){mutators++;return{rows:[{stage:'PROMOTING',version:'6',global_blocked:true}]}}return{rows:[]}},release(){}}},async end(){ends++}})};
 const poolFactory=targetRuntime.createTargetRuntimePoolFactory(options),broker=createTargetSqlBroker({material:input.material,targetCa:'TARGET-CA',bootstrapCredential:'target',phase:'promotion',ledger,poolFactory});
 await ledger.charge('sql');await assert.rejects(broker.pools.control.query(input.commitFault.plan.statement),e=>e.code==='COMMIT_UNCERTAIN');await broker.close();assert.equal(mutators,1);assert.equal(sql,4);assert.equal(files,1);assert.equal(ends,1);assert.deepEqual(queries.map(q=>q==='COMMIT'?'COMMIT':q.startsWith('SELECT pg_backend_pid()')?'PID':q===input.commitFault.plan.statement.text?'SELECT':q),['PID','BEGIN','SELECT','COMMIT']);assert.equal(store.get('receipt').value.controllerContainerId,input.commitFault.plan.controllerContainerId);
 for(const change of [x=>x.commitFault.mode='retry-any',x=>x.commitFault.plan.operationId=x.material.stageOperationIds['target-activate'],x=>x.commitFault.planHash='f'.repeat(64),x=>x.commitFault.variantLineageHash='f'.repeat(64),x=>x.commitFault.configBundleHash='f'.repeat(64),x=>x.invocationId=x.material.stageOperationIds['target-activate'],x=>delete x.commitFault,x=>x.phase='activation']){const bad=structuredClone(input);change(bad);if(bad.commitFault)bad.commitFaultContextHash=sha256(bad.commitFault);assert.throws(()=>targetRuntime.createTargetRuntimePoolFactory({...options,input:bad}),/TARGET_RUNTIME_COMMIT/)}
 const unpinned=structuredClone(input);unpinned.commitFaultContextHash='f'.repeat(64);assert.throws(()=>targetRuntime.createTargetRuntimePoolFactory({...options,input:unpinned}),/TARGET_RUNTIME_COMMIT/);
});
