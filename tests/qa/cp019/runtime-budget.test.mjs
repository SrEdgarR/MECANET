// Counts the real runtime SQL call graph with synthetic rows. No PG or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdmission} from '../../../server/saas/admission/index.js';
import {createClock} from '../../../server/saas/admission/clock.js';
import {createRestrictiveCoordinator} from '../../../server/saas/writes/coordinator.js';
import {createRecoveryRuntime} from '../../../server/saas/recovery/runtime.js';
const generation='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',tenantId='33333333-3333-4333-8333-333333333333';
const limits=Object.fromEntries(['active','waiting','qh60','qh1','qc60','qc1','qt60','qt1'].map(k=>[k,100000000]));

test('a successful real tenant admission lifecycle needs97 SQL calls before auth, session, business or background work',async()=>{
 let calls=[],tick=1,ticket;
 async function query(sql,values){const text=typeof sql==='string'?sql:sql.text;calls.push(text);const row={generation,tick:String(tick),clock_version:String(tick),admission_version:'1',barrier:false};
  if(text.startsWith('BEGIN')||text==='COMMIT'||text.startsWith('SELECT set_config'))return{rows:[]};
  if(text.startsWith('SELECT generation, tick')||text.startsWith('UPDATE saas.admission_fence')||text.startsWith('SELECT generation,tick'))return{rows:[row]};
  if(text.startsWith('SELECT p.scope_key'))return{rows:[{scope_key:values[0],version:'1',limits,override_expires_at:null,checked_at:new Date()}]};
  if(text.startsWith('SELECT tick,qh'))return{rows:[]};
  if(text.startsWith('SELECT count(*) FILTER'))return{rows:[{active:0,waiting:0,reserved_qc:'0',reserved_qt:'0'}]};
  if(text.startsWith('INSERT INTO saas.windows'))return{rows:[]};
  if(text.startsWith('INSERT INTO saas.tickets')){ticket={id:values[0],tenant_id:values[1],lane:values[2],owner,generation,state:'WAITING',scopes:values[6],queue_expires_at:new Date(Date.now()+10000),reserved_qc:values[10],reserved_qt:values[9],work_started:false};return{rows:[]}};
  if(text.startsWith('SELECT scopes FROM'))return{rows:[{scopes:ticket.scopes}]};
  if(text.startsWith('SELECT * FROM saas.tickets'))return{rows:[ticket]};
  if(text.startsWith('SELECT clock_timestamp()>'))return{rows:[{expired:false}]};
  if(text.startsWith('SELECT DISTINCT ON'))return{rows:[{id:ticket.id,tenant_id:tenantId,scopes:ticket.scopes,last_turn:'0',created_at:new Date()}]};
  if(text.startsWith('SELECT limits,override_expires_at'))return{rows:[{limits,override_expires_at:null}]};
  if(text.startsWith('UPDATE saas.admission_scopes'))return{rows:[]};
  if(text.includes("SET state='ACTIVE'")){ticket.state='ACTIVE';return{rows:[]}};
  if(text.includes('SET work_started=true')){ticket.work_started=true;return{rows:[]}};
  if(text.includes('SET reserved_qt='))return{rows:[]};
  if(text.includes('SET state=$2')){ticket.state='FINISHED';return{rows:[]}};
  throw Error('UNEXPECTED_SQL:'+text);
 }
 const a=createAdmission({pool:{query,connect:async()=>({query,release(){}})},owner,generation});
 await a.observeClock();tick=2;await a.observeClock(); // Initial readiness is an additional two SQL.
 const counts={};let ticketId;
 async function measure(name,fn){calls=[];await fn();counts[name]=calls.length}
 await measure('observeStart',()=>a.observeClock());
 await measure('admit',async()=>{ticketId=(await a.admit({tenantId,lane:'ordinary',kind:'HTTP',reserveBytes:65536,workUnits:3})).id});
 await measure('observeWait',()=>a.observeClock());
 await measure('claim',()=>a.claim(ticketId,{revalidate:async()=>{}}));
 await measure('start',()=>a.startWork(ticketId));
 await measure('consume',()=>a.consumeBytes(ticketId,100));
 await measure('finish',()=>a.finish(ticketId,{sqlSettled:true,responseSettled:true}));
 assert.deepEqual(counts,{observeStart:1,admit:22,observeWait:1,claim:29,start:16,consume:16,finish:12});
 assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),97);
});

test('a committed clock advance counts five actual SQL commands and the100ms minimum is preserved',async()=>{
 let time=0,calls=[];
 const query=async text=>{calls.push(text);return{rowCount:1,rows:[{generation,owner,tick:'0',clock_version:'0'}]}};
 const c=createClock({pool:{connect:async()=>({query,release(){}})},generation,owner,now:()=>time});
 await c.acquire(owner);calls=[];time=99;assert.equal(await c.advance(),false);assert.equal(calls.length,0);
 time=100;assert.equal(await c.advance(),true);assert.equal(calls.length,5);assert.equal(calls[0],'BEGIN ISOLATION LEVEL SERIALIZABLE');assert.match(calls[1],/set_config/);assert.equal(calls[4],'COMMIT');
});

test('the actual recovery coordinator consumes five SQL on an idle COMPLETE pass and one on pending',async()=>{
 let calls=[],stage='COMPLETE';
 const query=async sql=>{const text=typeof sql==='string'?sql:sql.text;calls.push(text);return{rows:text.includes('recovery_service_state')?[{clock_owner:owner,clock_version:'1',generation,mode:'RECOVERY',ready:true,stage,tick:'1'}]:[]}};
 const controlPool={query,connect:async()=>({query,release(){}})},recovery=createRecoveryRuntime({controlPool,generation,expectedRunId:tenantId,manifestHash:'a'.repeat(64),mode:'RECOVERY'});
 const c=createRestrictiveCoordinator({controlPool,maintenancePools:{},resolveDescriptor:async()=>null,generation,recovery});
 assert.deepEqual(await c.runOnce(),{processed:0,pending:false});assert.equal(calls.length,5);
 stage='CONFIGURED';calls=[];assert.deepEqual(await c.runOnce(),{processed:0,pending:true});assert.equal(calls.length,1);
});
