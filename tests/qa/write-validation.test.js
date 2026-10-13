import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalWrite,parseInventoryQuery,fitPage,validateResult} from '../../server/saas/writes/validation.js';

const base={tenantId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actorId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',action:'catalog.create',dataEpoch:'1',productId:null,input:{sku:' abc-1 ',name:'Café'}};
test('canonical UTF8 has the approved independent digest and normalizes only SKU and UUID',()=>{
 const a=canonicalWrite(base);assert.equal(a.preimage,'["mecanet-write-v1","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","catalog.create","1",null,["ABC-1","Café"]]');
 assert.equal(Buffer.byteLength(a.preimage),142);assert.equal(a.requestHash,'d2e92c64f9ba7e2f55b29389879e86e99caeb2d62ac5afebeb0269b93c3f4b5b');
 assert.equal(canonicalWrite({...base,tenantId:base.tenantId.toUpperCase(),input:{name:'Café',sku:'ABC-1'}}).requestHash,a.requestHash);
 assert.notEqual(canonicalWrite({...base,input:{sku:'ABC-1',name:'Cafe\u0301'}}).requestHash,a.requestHash);
});
test('receipt hash binds route product, actor, action, epoch and complete normalized values',()=>{
 const a={...base,action:'inventory.receive',productId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',input:{quantity:'3',reason:'Ingreso 😀\n'}};
 const hash=canonicalWrite(a).requestHash;
 for(const change of [{productId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},{actorId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},{dataEpoch:'2'},{input:{quantity:'4',reason:a.input.reason}},{input:{quantity:'3',reason:'Otro'}}]) assert.notEqual(canonicalWrite({...a,...change}).requestHash,hash);
});
test('invalid text, unknown fields, ambiguous quantities and epochs fail before admission/intent',()=>{
 for(const input of [{sku:'A',name:'x\u0000'},{sku:'A',name:'\ud800'},{sku:'A',name:'\udfff'},{sku:'A',name:'x',tenantId:base.tenantId},{sku:'é',name:'x'},{sku:'A',name:'😀'.repeat(201)}])assert.throws(()=>canonicalWrite({...base,input}),e=>e.code==='INVALID_WRITE'&&e.status===400);
 for(const quantity of ['0','01','1.0','1e2','1000001',1])assert.throws(()=>canonicalWrite({...base,action:'inventory.receive',productId:base.actorId,input:{quantity,reason:'ok'}}));
 for(const epoch of ['0','01','9223372036854775808',1,undefined])assert.throws(()=>canonicalWrite({...base,dataEpoch:epoch}));
 assert.doesNotThrow(()=>canonicalWrite({...base,input:{sku:'a',name:'😀'.repeat(200)}}));
});
test('inventory pagination rejects extra parameters and keeps a complete bounded prefix',()=>{
 assert.deepEqual(parseInventoryQuery({limit:'2',cursor:base.actorId.toUpperCase()}),{limit:2,cursor:base.actorId});
 for(const query of [{limit:'0'},{limit:'101'},{limit:'01'},{cursor:'x'},{limit:['2']},{tenantId:'x'},{state:'all'}])assert.throws(()=>parseInventoryQuery(query));
 const rows=Array.from({length:100},(_,i)=>({id:`${String(i).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,name:'\u0001'.repeat(200)}));
 const result=fitPage(rows,{tenantId:base.tenantId,dataEpoch:'1'},'items');
 assert.ok(Buffer.byteLength(JSON.stringify(result))<=65536);assert.ok(result.items.length>0&&result.items.length<100);assert.deepEqual(result.items,rows.slice(0,result.items.length));assert.equal(result.nextCursor,result.items.at(-1).id);
});
test('terminal result rejects business metadata, unsafe counters and oversized objects',()=>{
 const confirmed={operationId:base.tenantId,state:'CONFIRMED',productId:base.actorId,movementId:null,onHand:'0',balanceVersion:'1',dataEpoch:'1'};
 assert.deepEqual(validateResult(confirmed),confirmed);
 for(const change of [{actorId:base.actorId},{onHand:'01'},{balanceVersion:'0'},{onHand:'9223372036854775808'},{state:'PENDING'},{dataEpoch:1}])assert.throws(()=>validateResult({...confirmed,...change}));
 assert.deepEqual(validateResult({operationId:base.tenantId,state:'REJECTED',code:'SKU_CONFLICT',dataEpoch:'1'}),{operationId:base.tenantId,state:'REJECTED',code:'SKU_CONFLICT',dataEpoch:'1'});
});
