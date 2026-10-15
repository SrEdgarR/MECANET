import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceObserver,localSnapshot} from './acceptance.mjs';

test('observer closes the previous database pool before opening another with the same role',async()=>{
 let alive=0,peak=0;const events=[],charges=[];
 const observer=await createAcceptanceObserver({observer:{}},{charge:async kind=>charges.push(kind)},{poolFactory:async cfg=>{
  events.push('open:'+cfg.database);assert.equal(alive,0,'qa_bootstrap has one shared role connection limit');alive++;peak=Math.max(peak,alive);
  return {connect:async()=>({query:async sql=>{events.push(sql);return {rows:[{database:cfg.database}]}},release:()=>events.push('release:'+cfg.database)}),end:async()=>{events.push('end:'+cfg.database);alive--;}};
 }});
 const [a,b]=await Promise.all([observer.query('mecanet_control','SELECT 1'),observer.query('mecanet_tenant_a','SELECT 2')]);
 assert.equal(a[0].database,'mecanet_control');assert.equal(b[0].database,'mecanet_tenant_a');
 assert.ok(events.indexOf('end:mecanet_control')<events.indexOf('open:mecanet_tenant_a'));assert.equal(peak,1);assert.equal(charges.length,6);
 await observer.close();assert.equal(alive,0);await assert.rejects(observer.query('mecanet_control','SELECT 1'),/QA_OBSERVER_CLOSED/);
});

test('a failed pool shutdown never opens a second role connection',async()=>{
 let opens=0;
 const o=await createAcceptanceObserver({observer:{}},{charge:async()=>{}},{poolFactory:async()=>{opens++;return {connect:async()=>({query:async()=>({rows:[]}),release(){}}),end:async()=>{throw Error('OWN_POOL_CLOSE_FAILED')}}}});
 await o.query('mecanet_control','SELECT 1');await assert.rejects(o.query('mecanet_tenant_a','SELECT 2'),/OWN_POOL_CLOSE_FAILED/);assert.equal(opens,1);await assert.rejects(o.close(),/OWN_POOL_CLOSE_FAILED/);
});

test('snapshot projects stock and balance version as lossless decimal strings in PostgreSQL JSON',async()=>{
 let text='';const value='9007199254740993';
 const result=await localSnapshot({query:async(db,sql)=>{text=sql;assert.equal(db,'mecanet_tenant_a');return [{logical_bytes:'1',actual_bytes:'1',balances:[{product_id:'synthetic-id',on_hand:value,version:value}]}]}},[]);
 assert.match(text,/SELECT product_id,on_hand::text,version::text FROM inventory\.balances/);assert.equal(result.balances[0].on_hand,value);assert.equal(result.balances[0].version,value);
});
