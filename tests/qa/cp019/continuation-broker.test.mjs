// Client protocol negatives; synthetic duplex, no AF_UNIX/SQL/HTTP assertion.
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {newBrokerLedger} from './continuation-broker.mjs';import {initialContinuation,updateContinuation} from './continuation-budget.mjs';import {canonical} from '../../../server/saas/recovery/protocol.js';
const base=JSON.parse(await readFile(new URL('../../../docs/evidence/cp022/remote-run.json',import.meta.url),'utf8')).ledger,raw=Buffer.from(JSON.stringify(base)),hash=createHash('sha256').update(raw).digest('hex'),now=base.startedUptime+20000;
const admission={schema:'cp024-continuation-admission-v2',project:'mecanet-qa-p1l3-r03',targetProject:'mecanet-qa-p1l3-r03-target',attempt:'v2',approvalHash:'6e1fe2d6ef789eef9637fd0ec9f6c5703998899cbc9df4f8a8c35990364bfc92',parentLedgerHash:hash,parentSequence:44,registryHash:'1f2b34b5bb93ae21a74f7d2af8a51bd3cb16d3ea7baa3b55a54481b5875f243c',startedUptime:now,sourceContainerId:'aa35afe3ea406009410be0e1a7eef759c619c8386a290ce9cbf620fe890cc500',sourceOwnerId:'76066956-b4ae-422f-ae8d-69a0795a88dd',sourceSystemIdentifier:'7696914153807093794',sourceFinishedAt:'2026-10-15T15:18:02.598236798Z',...Object.fromEntries(['sealedInputsHash','controllerHash','runtimeHash','priorRunReportHash'].map(k=>[k,'a'.repeat(64)]))};
const context={baseLedger:raw,baseLedgerHash:hash,admission,admissionHash:createHash('sha256').update(canonical(admission)).digest('hex')};
const env={QA_BUDGET_ATTEMPT:'v2',QA_BUDGET_SOCKET:'/run/qa-budget/counter.sock',QA_BUDGET_CLIENT:'fixture',QA_BUDGET_ROOT_PID:'123'};
class Duplex extends EventEmitter{
 constructor(respond){super();this.respond=respond;this.requests=[];this.destroyed=false}
 ref(){}unref(){}setEncoding(){}destroy(){this.destroyed=true}
 write(raw){const req=JSON.parse(raw);this.requests.push(req);queueMicrotask(()=>this.respond(req,this))}
}
function setup({mutate=reply=>reply,event=null}={}){
 let state=initialContinuation(raw,hash,admission);const socket=new Duplex((req,s)=>{
  if(event){s.emit(event);return}
  if(req.method==='enter')state=updateContinuation(state,raw,hash,admission,req.name,now,{scope:'source-window'});
  if(req.method==='charge')state=updateContinuation(state,raw,hash,admission,state.activeScenarios['source-window'],now,{kind:req.kind,amount:req.amount});
  s.emit('data',canonical(mutate({schema:'cp024-budget-ack-v1',admissionHash:context.admissionHash,clientId:'fixture',sequence:req.sequence,rootPid:123,state:structuredClone(state)},req))+'\n');
 });
 const create=()=>newBrokerLedger({scenario:'source-window',continuation:context,env,connect:options=>{assert.deepEqual(options,{path:'/run/qa-budget/counter.sock'});return socket},clock:()=>now});return {socket,create};
}
test('single persistent connection serializes charges and checks every ACK',async()=>{const f=setup(),ledger=await f.create();await ledger.enter('source-close-b');await Promise.all([ledger.charge('sql'),ledger.charge('sql')]);assert.equal((await ledger.snapshot()).total.sql,2);assert.deepEqual(f.socket.requests.map(r=>r.sequence),[1,2,3,4,5]);assert.equal(f.socket.requests.filter(r=>r.method==='enroll').length,1)});
test('wrong Root, admission, client or sequence is rejected before effects',async()=>{for(const [key,value]of [['rootPid',124],['admissionHash','b'.repeat(64)],['clientId','other'],['sequence',5]]){const f=setup({mutate:r=>({...r,[key]:value})});await assert.rejects(f.create(),/ACK_IDENTITY/);assert.equal(f.socket.requests.length,1);assert.equal(f.socket.destroyed,true)}});
test('Root end and close are irreversible with no reconnect or retransmit',async()=>{for(const event of ['end','close']){const f=setup({event});await assert.rejects(f.create(),/ROOT_ENDED/);assert.equal(f.socket.requests.length,1)}});
test('a previously ACKed delta cannot disappear in a later ACK',async()=>{let stale;const f=setup({mutate:(r,q)=>{if(q.method==='enter')stale=structuredClone(r.state);if(q.method==='snapshot')r.state=stale;return r}}),ledger=await f.create();await ledger.enter('source-close-b');await ledger.charge('sql');await assert.rejects(ledger.snapshot(),/PROGRESS_REGRESSION/);await assert.rejects(ledger.charge('sql'),/PROGRESS_REGRESSION/);assert.equal(f.socket.requests.length,4)});
test('attempt, socket and client binding cannot use alternate endpoints',async()=>{for(const change of [{QA_BUDGET_ATTEMPT:'v3'},{QA_BUDGET_SOCKET:'/tmp/alternate.sock'},{QA_BUDGET_CLIENT:'../foreign'},{QA_BUDGET_ROOT_PID:'0'}])await assert.rejects(newBrokerLedger({scenario:'source-window',continuation:context,env:{...env,...change},connect:()=>assert.fail('must reject before connection')}),/CLIENT_CONFIG/)});
