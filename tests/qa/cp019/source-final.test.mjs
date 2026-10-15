import test from 'node:test';import assert from 'node:assert/strict';
import {validateFinalObservation} from './source-final.mjs';
const source={workerClockOwner:'worker-owner',webOwner:'web-owner',apiOwners:{api1:'api-one',api2:'api-two'}};
const input={material:{source},resource:{containerId:'a'.repeat(64),project:'mecanet-qa-p1l3-r03'}};
const processes=['api1','api2','worker','web'].map((service,i)=>({service,containerId:String(i+1).repeat(64),running:false,ownerId:service==='worker'?source.workerClockOwner:service==='web'?source.webOwner:source.apiOwners[service]}));
test('closure rejects a live writer, a missing consumer and a foreign owner',()=>{
 const obs={resource:input.resource,runtimeConsumers:processes};assert.equal(validateFinalObservation(obs,input,'source-capture'),obs);
 assert.throws(()=>validateFinalObservation({...obs,runtimeConsumers:processes.slice(1)},input,'source-capture'),/CONSUMER_IDENTITY/);
 assert.throws(()=>validateFinalObservation({...obs,runtimeConsumers:processes.map((p,i)=>i===0?{...p,running:true}:p)},input,'source-capture'),/CONSUMERS_RUNNING/);
 assert.throws(()=>validateFinalObservation({...obs,runtimeConsumers:processes.map((p,i)=>i===0?{...p,ownerId:'foreign'}:p)},input,'source-capture'),/CONSUMER_IDENTITY/);
});
test('same labels on another PostgreSQL CID do not identify the source',()=>{
 assert.throws(()=>validateFinalObservation({resource:{...input.resource,containerId:'f'.repeat(64)},runtimeConsumers:processes},input,'source-capture'),/RESOURCE_WITNESS/);
});
test('one physical CID cannot identify four consumers and warm state is typed',()=>{
 assert.throws(()=>validateFinalObservation({resource:input.resource,runtimeConsumers:processes.map(p=>({...p,containerId:'f'.repeat(64)}))},input,'source-capture'),/CONSUMER_IDENTITY/);
 assert.throws(()=>validateFinalObservation({resource:input.resource,runtimeConsumers:processes.map((p,i)=>i===0?{...p,running:'false'}:p)},input,'source-close-admission'),/CONSUMER_IDENTITY/);
});
