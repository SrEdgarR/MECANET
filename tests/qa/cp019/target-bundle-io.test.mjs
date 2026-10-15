import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,sha256} from '../../../server/saas/recovery/protocol.js';
import {TARGET_BUNDLE_PATHS,serializeTargetBundle,publishTargetConfigBundle,loadTargetConfigBundle,assertTargetBundleMetadata} from './target-bundle-io.mjs';

const H='a'.repeat(64),R='11111111-1111-4111-8111-111111111111';
const clone=x=>JSON.parse(canonical(x));
function model({files=2285,pairs=2}={}){
 const copyIndex={schema:'copy-index-v1',files:Array.from({length:files},(_,i)=>({path:'base/16384/'+String(i).padStart(12,'0'),bytes:64,sha256:H}))};
 const records=[];let previous='0'.repeat(64);
 for(let i=0;i<pairs;i++){
  const operationId='aaaaaaaa-aaaa-4aaa-8aaa-'+String(i+1).padStart(12,'0');
  const intent={sequence:records.length,kind:'intent',operationId,stage:i===0?'close-admission':'canary',recoveryId:R,targetHash:H,expectedHash:H,afterHash:H,previousHash:previous};intent.hash=sha256(intent);records.push(intent);previous=intent.hash;
  const observed={sequence:records.length,kind:'observed',operationId,intentHash:intent.hash,observedHash:H,endProofHash:H,previousHash:previous};observed.hash=sha256(observed);records.push(observed);previous=observed.hash;
 }
 const copy={sequence:1,hash:records[1].hash},final={sequence:records.length-1,hash:previous};
 const manifest={copyIndexHash:sha256(copyIndex),copyCheckpoint:copy,journalFinalCheckpoint:final};
 return {schema:'target-config-bundle-v1',manifest,anchors:{},proofBundle:{manifest},plan:{},planHash:H,configs:{synthetic:true},runtimeFixture:{},sourceJournalRecords:records,sourceJournalFinalCheckpoint:final,sourceJournalCopyCheckpoint:copy,copyIndex,sourceEndProof:{},observedEnd:{},sourceCentralFingerprint:H,physicalRecovery:'NOT VERIFIED'};
}
function memoryIO(){
 const files=new Map(),events=[];let failPath;
 const read=async(path,expected)=>{events.push(['read',path]);if(!files.has(path)){const e=Error('ABSENT');e.code='ENOENT';throw e}const bytes=files.get(path);if(sha256(bytes)!==expected)throw Error('TARGET_BUNDLE_HASH');return{value:JSON.parse(bytes),sha256:expected,bytes:bytes.length}};
 const publish=async(path,value)=>{events.push(['publish',path]);if(path===failPath)throw Error('INJECTED_KEEP');if(files.has(path))throw Error('IMMUTABLE_EXISTS');const bytes=Buffer.from(canonical(value));files.set(path,bytes);return{sha256:sha256(bytes),bytes:bytes.length}};
 return {files,events,io:{readJson:read,readIndex:read,publishJson:publish,publishIndex:publish},ledger:{charge:async(type)=>{assert.equal(type,'artifactFiles');events.push(['charge',type])}},setFail:p=>{failPath=p}};
}
test('2285-file model exceeds generic cap, uses fixed pieces and reconstructs original full hash',async()=>{
 const bundle=model(),full=sha256(bundle),serialized=serializeTargetBundle(bundle,full),m=memoryIO();
 assert.ok(Buffer.byteLength(canonical(bundle.copyIndex))>262144);assert.ok(Buffer.byteLength(canonical(serialized.header))<262144);
 const published=await publishTargetConfigBundle({bundle,expectedFullHash:full,ledger:m.ledger,io:m.io});
 assert.equal(published.sha256,full);assert.equal(published.filesPublished,3);
 assert.deepEqual([...m.files.keys()],[TARGET_BUNDLE_PATHS.header,TARGET_BUNDLE_PATHS.copyIndex,TARGET_BUNDLE_PATHS.journal[0]]);
 const loaded=await loadTargetConfigBundle({expectedFullHash:full,expectedHeaderHash:published.headerSha256,io:m.io});
 assert.deepEqual(loaded.value,bundle);assert.equal(loaded.sha256,full);
 const again=await publishTargetConfigBundle({bundle,expectedFullHash:full,ledger:m.ledger,io:m.io});assert.equal(again.filesPublished,0);assert.equal(again.filesReused,3);
 for(let i=0;i<m.events.length;i++)if(m.events[i][0]==='publish')assert.equal(m.events[i-1][0],'charge');
});
test('1000 chained records use exactly five contiguous 200-record chunks',()=>{
 const b=model({files:1,pairs:500}),s=serializeTargetBundle(b,sha256(b));
 assert.equal(s.header.sourceJournal.chunks.length,5);assert.deepEqual(s.header.sourceJournal.chunks.map(x=>x.recordCount),[200,200,200,200,200]);
 for(const p of s.pieces.filter(x=>x.kind==='journal'))assert.ok(p.bytes<=262144);
});

test('variant transport admits only its optional bound hash while preserving exact full canonical custody',async()=>{
 const b={...model({files:1}),variantLineageHash:H},m=memoryIO(),full=sha256(b),p=await publishTargetConfigBundle({bundle:b,expectedFullHash:full,ledger:m.ledger,io:m.io});
 const got=await loadTargetConfigBundle({expectedFullHash:full,expectedHeaderHash:p.headerSha256,io:m.io});assert.equal(got.value.variantLineageHash,H);assert.equal(got.sha256,full);
 for(const delta of [{variantLineageHash:null},{variantLineageHash:'bad'},{variantLineageHash:H,arbitraryExtension:true}]){const changed={...b,...delta};assert.throws(()=>serializeTargetBundle(changed,sha256(changed)));}
});
test('reject invalid hashes, excessive index/journal/header and unsafe/duplicate index entries before IO',()=>{
 const bad=[b=>b.copyIndex.files.push({...b.copyIndex.files[0]}),b=>b.copyIndex.files[0].path='../secret',b=>b.configs={large:'x'.repeat(262144)},b=>b.copyIndex.files=Array.from({length:10001},(_,i)=>({path:String(i),bytes:1,sha256:H})),b=>b.copyIndex.files=Array.from({length:10000},(_,i)=>({path:String(i).padStart(500,'x'),bytes:1,sha256:H})),b=>b.sourceJournalRecords[0].hash=H];
 for(const edit of bad){const b=model({files:1});edit(b);assert.throws(()=>serializeTargetBundle(b,sha256(b)));}
 const b=model({files:1});assert.throws(()=>serializeTargetBundle(b,H),/FULL_HASH/);
 const tooMany=model({files:1,pairs:501});assert.throws(()=>serializeTargetBundle(tooMany,sha256(tooMany)),/TARGET_BUNDLE_CHECKPOINT/);
});
test('header intent binds partial KEEP, resumes exact original and rejects a changed full bundle',async()=>{
 const b=model(),hash=sha256(b),m=memoryIO();m.setFail(TARGET_BUNDLE_PATHS.journal[0]);
 await assert.rejects(publishTargetConfigBundle({bundle:b,expectedFullHash:hash,ledger:m.ledger,io:m.io}),/INJECTED_KEEP/);
 assert.ok(m.files.has(TARGET_BUNDLE_PATHS.header));assert.ok(m.files.has(TARGET_BUNDLE_PATHS.copyIndex));
 const h=sha256(m.files.get(TARGET_BUNDLE_PATHS.header));await assert.rejects(loadTargetConfigBundle({expectedFullHash:hash,expectedHeaderHash:h,io:m.io}));
 const other=clone(b);other.configs.synthetic='different';const before=m.events.filter(x=>x[0]==='publish').length;
 await assert.rejects(publishTargetConfigBundle({bundle:other,expectedFullHash:sha256(other),ledger:m.ledger,io:m.io}),/HASH/);assert.equal(m.events.filter(x=>x[0]==='publish').length,before);
 m.setFail(undefined);const out=await publishTargetConfigBundle({bundle:b,expectedFullHash:hash,ledger:m.ledger,io:m.io});assert.equal(out.filesPublished,1);assert.equal(out.filesReused,2);
});
test('missing/duplicate/wrong-path journal reference fails before an arbitrary-path read',async()=>{
 for(const mutate of [h=>h.sourceJournal.chunks[0].path='/tmp/unapproved.json',h=>h.sourceJournal.chunks.push({...h.sourceJournal.chunks[0]}),h=>h.sourceJournal.chunks[0].startSequence=200,h=>h.sourceJournal.chunks=[]]){
  const b=model({files:1}),m=memoryIO(),s=serializeTargetBundle(b,sha256(b));await publishTargetConfigBundle({bundle:b,expectedFullHash:sha256(b),ledger:m.ledger,io:m.io});
  const h=clone(s.header);mutate(h);m.files.set(TARGET_BUNDLE_PATHS.header,Buffer.from(canonical(h)));m.events.length=0;
  await assert.rejects(loadTargetConfigBundle({expectedFullHash:sha256(b),expectedHeaderHash:sha256(h),io:m.io}));assert.deepEqual(m.events,[['read',TARGET_BUNDLE_PATHS.header]]);
 }
});
test('loader requires both external hashes and rejects piece/parent/full-hash tampering',async()=>{
 const b=model({files:1}),m=memoryIO(),full=sha256(b),p=await publishTargetConfigBundle({bundle:b,expectedFullHash:full,ledger:m.ledger,io:m.io});
 await assert.rejects(loadTargetConfigBundle({expectedFullHash:full,io:m.io}),/EXPECTED_HASH/);await assert.rejects(loadTargetConfigBundle({expectedFullHash:H,expectedHeaderHash:p.headerSha256,io:m.io}),/FULL_HASH/);
 m.files.set(TARGET_BUNDLE_PATHS.journal[0],Buffer.from('{}'));await assert.rejects(loadTargetConfigBundle({expectedFullHash:full,expectedHeaderHash:p.headerSha256,io:m.io}),/HASH/);
});
test('private metadata rejects symlink, hardlink, foreign uid, wrong mode and oversized files',()=>{
 const stat={isFile:()=>true,isSymbolicLink:()=>false,nlink:1,uid:999,mode:0o100400,size:100};
 assertTargetBundleMetadata(stat,262144,{platform:'linux',uid:999});
 for(const edit of [{isSymbolicLink:()=>true},{isFile:()=>false},{nlink:2},{uid:0},{mode:0o100600},{size:262145}])assert.throws(()=>assertTargetBundleMetadata({...stat,...edit},262144,{platform:'linux',uid:999}),/PRIVATE_FILE/);
});
test('durable budget rejection occurs before any publication',async()=>{
 const b=model({files:1}),m=memoryIO();
 await assert.rejects(publishTargetConfigBundle({bundle:b,expectedFullHash:sha256(b),ledger:{charge:async()=>{throw Error('BUDGET_CLOSED')}},io:m.io}),/BUDGET_CLOSED/);
 assert.equal(m.files.size,0);assert.equal(m.events.filter(x=>x[0]==='publish').length,0);
});
test('immutable collision only reuses positively matching original bytes',async()=>{
 for(const foreign of [false,true]){
  const b=model({files:1}),m=memoryIO(),publish=m.io.publishJson;
  m.io.publishJson=async(path,value)=>{if(path===TARGET_BUNDLE_PATHS.header){m.files.set(path,Buffer.from(canonical(foreign?{foreign:true}:value)));throw Error('IMMUTABLE_EXISTS')}return publish(path,value)};
  if(foreign){await assert.rejects(publishTargetConfigBundle({bundle:b,expectedFullHash:sha256(b),ledger:m.ledger,io:m.io}),/HASH/);assert.equal(m.files.size,1)}
  else{const out=await publishTargetConfigBundle({bundle:b,expectedFullHash:sha256(b),ledger:m.ledger,io:m.io});assert.equal(out.filesReused,1);assert.equal(out.filesPublished,2)}
 }
});
test('externally pinned full hash rejects altered reconstructed rest and rehashed foreign-parent chunk',async()=>{
 for(const which of ['rest','chunk-parent']){
  const b=model({files:1}),m=memoryIO(),s=serializeTargetBundle(b,sha256(b));await publishTargetConfigBundle({bundle:b,expectedFullHash:sha256(b),ledger:m.ledger,io:m.io});const h=clone(s.header);
  if(which==='rest')h.bundle.configs={changed:true};
  else{const c=JSON.parse(m.files.get(TARGET_BUNDLE_PATHS.journal[0]));c.parentFullBundleHash=H;const bytes=Buffer.from(canonical(c));m.files.set(TARGET_BUNDLE_PATHS.journal[0],bytes);h.sourceJournal.chunks[0].sha256=sha256(bytes);h.sourceJournal.chunks[0].bytes=bytes.length}
  m.files.set(TARGET_BUNDLE_PATHS.header,Buffer.from(canonical(h)));
  await assert.rejects(loadTargetConfigBundle({expectedFullHash:sha256(b),expectedHeaderHash:sha256(h),io:m.io}),which==='rest'?/FULL_HASH/:/CHUNK_BINDING/);
 }
});
test('a false reader hash or byte count cannot validate a piece',async()=>{
 const b=model({files:1}),m=memoryIO(),p=await publishTargetConfigBundle({bundle:b,expectedFullHash:sha256(b),ledger:m.ledger,io:m.io});
 const read=m.io.readIndex;m.io.readIndex=async(...args)=>({...await read(...args),bytes:1});
 await assert.rejects(loadTargetConfigBundle({expectedFullHash:sha256(b),expectedHeaderHash:p.headerSha256,io:m.io}),/HASH/);
});
