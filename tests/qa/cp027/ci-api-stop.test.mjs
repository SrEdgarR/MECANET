import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createDevelopmentApiStop} from '../../integration/development-http.mjs';
const row=(instance,exitCode)=>{const child=new EventEmitter();child.pid=instance==='api1'?101:102;child.exitCode=null;let stops=0;child.stdin={end(){stops++;queueMicrotask(()=>{child.exitCode=exitCode;child.emit('exit',exitCode)})}};return{child,instance,events:[{type:'development-api-stopped',drained:exitCode===0}],stops:()=>stops}};
test('one STOP per API and a failed FIN remains the same rejected promise',async()=>{
 const a=row('api1',1),b=row('api2',0),stop=createDevelopmentApiStop([a,b]);const first=stop(),second=stop();assert.equal(second,first);await assert.rejects(first,/API_END_UNCERTAIN/);await assert.rejects(stop(),/API_END_UNCERTAIN/);assert.equal(a.stops(),1);assert.equal(b.stops(),1);assert.equal(b.child.exitCode,0);
});
test('positive FIN requires both separate APIs to drain and exit zero',async()=>{
 const a=row('api1',0),b=row('api2',0),stop=createDevelopmentApiStop([a,b]),result=await stop();assert.equal(result.length,2);assert.equal(await stop(),result);
});
