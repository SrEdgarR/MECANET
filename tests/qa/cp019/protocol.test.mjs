import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,symlink,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as protocol from '../../../server/saas/recovery/protocol.js';
const {publishImmutable,verifyCopyIndex,validateManifest,verifyEndProof,validateStageRecords,sha256}=protocol;
const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const hash='a'.repeat(64);
const resource=n=>({project:n===1?'mecanet-qa-p1l3-r03':'mecanet-qa-p1l3-r03-target',cohortId:id(n),hostIdentity:hash,containerId:String(n).repeat(64),containerLabels:{project:n===1?'mecanet-qa-p1l3-r03':'mecanet-qa-p1l3-r03-target',service:'postgres'},imageDigest:'sha256:'+hash,volumeId:'volume-'+n,dataPath:'/opt/'+(n===1?'mecanet-qa-p1l3-r03':'mecanet-qa-p1l3-r03-target')+'/data',networkId:'network-'+n,networkSubnet:n===1?'10.77.64.0/24':'10.77.66.0/25',networkIP:n===1?'10.77.64.2':'10.77.66.2',socketPath:'/opt/'+(n===1?'mecanet-qa-p1l3-r03':'mecanet-qa-p1l3-r03-target')+'/ingress/http.sock',generation:id(n+2),systemIdentifier:'1234567890123456789'});
const manifest=()=>({schema:'recovery-manifest-v1',recoveryId:id(9),provenance:{baseSha:'86985fe7589032f202ebf0cb057a9b1384217151',producerSha:'cace66cd34dbad31d480bef8f902bd71effbc0b1',artifactDigest:hash,controllerOwner:id(8),verifierSha:'cace66cd34dbad31d480bef8f902bd71effbc0b1'},source:resource(1),target:resource(2),copyIndexHash:hash,copyCheckpoint:{sequence:0,hash},sourceClosedProofHash:hash,journalFinalCheckpoint:{sequence:2,hash},scopes:[{tenantId:id(5),database:'mecanet_tenant_a',roles:['saas_tenant_a','saas_writer_a'],eligibility:'OPEN_ELIGIBLE',closedReason:'RESTORE',sourceEpoch:'1',targetEpoch:'2',closedVersion:'2',openVersion:'3',abortVersion:'4',schemaVersion:3,readerRef:'tenant-a-v2',writerRef:'writer-a-v2',credentialVersion:'2',writerCredentialVersion:'2'}]});
test('SC014 rejects kept, mixed or foreign physical namespaces even when self-consistently observed',()=>{
 for(const side of ['source','target'])for(const project of ['mecanet-qa-p1l3-r01','mecanet-qa-p1l3-r02','mecanet-qa-p1l3-r04','nexora']){const m=manifest(),r=m[side],replacement=project+(side==='target'?'-target':'');r.project=replacement;r.containerLabels.project=replacement;r.dataPath='/opt/'+replacement+'/data';r.socketPath='/opt/'+replacement+'/ingress/http.sock';assert.throws(()=>validateManifest(m,{source:m.source,target:m.target}),/RESOURCE_IDENTITY/);}
});
test('SC014 binds each side to its exact data subnet and IP, excluding front, old and cross-side ranges',()=>{
 const badNetworks={source:[['10.77.64.0/25','10.77.64.2'],['10.77.66.0/25','10.77.64.2'],['10.77.65.0/24','10.77.65.2'],['10.77.61.0/24','10.77.61.2'],['10.77.64.0/24','10.77.66.2']],target:[['10.77.66.0/24','10.77.66.2'],['10.77.64.0/24','10.77.66.2'],['10.77.66.128/25','10.77.66.130'],['10.77.63.0/25','10.77.63.2'],['10.77.66.0/25','10.77.64.2']]};
 for(const side of ['source','target'])for(const [networkSubnet,networkIP] of badNetworks[side]){const m=manifest();Object.assign(m[side],{networkSubnet,networkIP});assert.throws(()=>validateManifest(m,{source:m.source,target:m.target}),/RESOURCE_NETWORK/);}
});
test('manifest matches externally observed distinct resource identity; names or cloned sysID alone cannot bind',()=>{
 const m=manifest();assert.equal(validateManifest(m,{source:m.source,target:m.target}).recoveryId,id(9));
 for(const mutate of [x=>x.target.containerId=x.source.containerId,x=>x.target.volumeId=x.source.volumeId,x=>x.target.dataPath=x.source.dataPath,x=>x.target.networkId=x.source.networkId,x=>x.source.generation=x.target.generation,x=>x.extra=true,x=>x.scopes.push({...x.scopes[0]}),x=>x.scopes[0].openVersion='2']){const x=structuredClone(m);mutate(x);assert.throws(()=>validateManifest(x,{source:m.source,target:m.target}));}
 const observed=structuredClone(m.target);observed.containerId='f'.repeat(64);assert.throws(()=>validateManifest(m,{source:m.source,target:observed}));
});
test('a complete observed termination proof is required; elapsed time and manual flags give no authority',()=>{
 const processes=['api1','api2','worker','web'].map((service,i)=>({service,containerId:String(i+1).repeat(64),ownerId:id(i+1),exitCode:0,finishedAt:'2026-10-14T01:00:00Z'}));
 const p={schema:'source-end-v1',recoveryId:id(9),sourceResourceHash:hash,processes,sqlOwners:processes.slice(0,3).map(x=>x.ownerId),httpOperationIds:[]};
 const o={resourceHash:hash,containers:processes.map(x=>({id:x.containerId,ownerId:x.ownerId,service:x.service,running:false,exitCode:x.exitCode,finishedAt:x.finishedAt})),sqlOwnersPresent:[],httpPending:[]};
 assert.equal(verifyEndProof(p,o),sha256(p));assert.throws(()=>verifyEndProof(p,{...o,sqlOwnersPresent:[id(7)]}));assert.throws(()=>verifyEndProof({...p,confirmed:true},o));assert.throws(()=>verifyEndProof(p,{...o,containers:[]}));
 assert.throws(()=>verifyEndProof({...p,processes:[processes[0]],sqlOwners:[processes[0].ownerId]},o));
 assert.throws(()=>verifyEndProof(p,{...o,containers:[...o.containers,{...o.containers[0],id:'f'.repeat(64),running:true}]}));
});
test('the copied readonly demo keeps schema1 and never acquires a company writer or promotion epoch',()=>{
 const m=manifest();m.scopes.push({tenantId:id(6),database:'mecanet_demo',roles:['saas_demo'],eligibility:'RESTRICTED_CLOSED',closedReason:'DEMO',sourceEpoch:null,targetEpoch:null,closedVersion:null,openVersion:null,abortVersion:null,schemaVersion:1,readerRef:'demo-reader-v2',writerRef:null,credentialVersion:'2',writerCredentialVersion:null});
 assert.equal(validateManifest(m,{source:m.source,target:m.target}).scopes.length,2);
 for(const patch of [{writerRef:'demo-writer'},{roles:['saas_writer_a']},{eligibility:'OPEN_ELIGIBLE'},{schemaVersion:3},{targetEpoch:'3'}]){const bad=structuredClone(m);Object.assign(bad.scopes[1],patch);assert.throws(()=>validateManifest(bad,{source:m.source,target:m.target}));}
});
test('an omitted still-running API cannot be certified as a terminated source',()=>{const p={schema:'source-end-v1',recoveryId:id(9),sourceResourceHash:hash,processes:[{containerId:'b'.repeat(64),ownerId:id(7),exitCode:0,finishedAt:'2026-10-14T01:00:00Z'}],sqlOwners:[id(7)],httpOperationIds:[]};const observed={resourceHash:hash,containers:[{id:'b'.repeat(64),running:false,exitCode:0,finishedAt:'2026-10-14T01:00:00Z'},{id:'c'.repeat(64),running:true}],sqlOwnersPresent:[],httpPending:[]};assert.throws(()=>verifyEndProof(p,observed));});
test('copy verifies exact paths, bytes and index; changed, extra or traversal entries are rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mecanet-cp019-copy-'));try{
 await writeFile(join(dir,'PG_VERSION'),'18\n');const index={schema:'copy-index-v1',files:[{path:'PG_VERSION',bytes:3,sha256:sha256('18\n')}]};
 assert.equal((await verifyCopyIndex(dir,index,sha256(index))).files,1);
 await writeFile(join(dir,'extra'),'x');await assert.rejects(verifyCopyIndex(dir,index,sha256(index)),/COPY_INVENTORY/);await rm(join(dir,'extra'));
 await writeFile(join(dir,'PG_VERSION'),'17\n');await assert.rejects(verifyCopyIndex(dir,index,sha256(index)),/COPY_HASH/);
 await assert.rejects(verifyCopyIndex(dir,{schema:'copy-index-v1',files:[{path:'../outside',bytes:3,sha256:hash}]},hash));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('immutable publication will never overwrite committed material; uncertain fsync keeps final for reconciliation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mecanet-cp019-publish-'));const path=join(dir,'material.json');
 try{await publishImmutable(path,{chosen:'once'},{syncDirectory:async()=>{}});await assert.rejects(publishImmutable(path,{chosen:'again'},{syncDirectory:async()=>{}}),/IMMUTABLE_EXISTS/);assert.equal(JSON.parse(await readFile(path,'utf8')).chosen,'once');
 const other=join(dir,'uncertain.json');await assert.rejects(publishImmutable(other,{chosen:'same'},{syncDirectory:async()=>{throw Error('fsync-fault')}}),/fsync-fault/);assert.equal(JSON.parse(await readFile(other,'utf8')).chosen,'same');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('copy cannot share mutable inodes with a file outside its own root',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'mecanet-cp019-hardlink-'));
 try{const {mkdir}=await import('node:fs/promises');const root=join(parent,'copy');await mkdir(root);
 await writeFile(join(parent,'source-file'),'18\n');await link(join(parent,'source-file'),join(root,'PG_VERSION'));
 const index={schema:'copy-index-v1',files:[{path:'PG_VERSION',bytes:3,sha256:sha256('18\n')}]};
 await assert.rejects(verifyCopyIndex(root,index,sha256(index)),/COPY_HARDLINK/);
 }finally{await rm(parent,{recursive:true,force:true});}
});
test('stage journal binds one intent per fixed operation and positive observed result, preserving unknown commit',()=>{
 const intent={sequence:0,kind:'intent',operationId:id(1),stage:'configure-control',recoveryId:id(9),targetHash:hash,expectedHash:hash,afterHash:hash,previousHash:'0'.repeat(64)};intent.hash=sha256(intent);
 const result={sequence:1,kind:'observed',operationId:id(1),intentHash:intent.hash,observedHash:hash,endProofHash:hash,previousHash:intent.hash};result.hash=sha256(result);
 assert.equal(validateStageRecords([intent,result],{sequence:1,hash:result.hash}).pending.length,0);
 assert.equal(validateStageRecords([intent],{sequence:0,hash:intent.hash}).pending.length,1);
 assert.throws(()=>validateStageRecords([intent,result],{sequence:0,hash:intent.hash}));
 const bad={...result,observedHash:'f'.repeat(64)};delete bad.hash;bad.hash=sha256(bad);assert.throws(()=>validateStageRecords([intent,bad],{sequence:1,hash:bad.hash}));
});
test('separate copy-index custody supports the approved four MiB bound without expanding master limits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mecanet-cp019-index-'));
 try{const index={schema:'copy-index-v1',files:Array.from({length:3000},(_,i)=>({path:'base/1/'+i,bytes:1,sha256:hash}))};
 assert.ok(Buffer.byteLength(JSON.stringify(index))>262144);
 assert.equal(typeof protocol.publishCopyIndex,'function');assert.equal(typeof protocol.readCopyIndex,'function');
 const path=join(dir,'index.json');const result=await protocol.publishCopyIndex(path,index,{syncDirectory:async()=>{}});
 assert.deepEqual(await protocol.readCopyIndex(path,result.sha256),index);
 await assert.rejects(publishImmutable(join(dir,'master.json'),index,{syncDirectory:async()=>{}}),/RECOVERY_SIZE_LIMIT/);
 await assert.rejects(protocol.publishCopyIndex(join(dir,'wrong.json'),{schema:'other',files:[]},{syncDirectory:async()=>{}}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
