// SC016 Node reader. Root is the single writer; no reconnect or ACK retry.
import {createConnection} from 'node:net';import {uptime} from 'node:os';
import {canonical} from '../../../server/saas/recovery/protocol.js';
import {validateContinuation,validateContinuationProgress,CONTINUATION_CASE} from './continuation-budget.mjs';
const check=(ok,label)=>{if(!ok)throw Error(label)};
export async function newBrokerLedger({scenario,limits={},continuation,env=process.env,connect=createConnection,clock=uptime}={}){
 check(env.QA_BUDGET_ATTEMPT==='v2'&&env.QA_BUDGET_SOCKET==='/run/qa-budget/counter.sock'&&/^[a-zA-Z0-9-]{1,64}$/.test(env.QA_BUDGET_CLIENT??'')&&/^[1-9][0-9]{0,9}$/.test(env.QA_BUDGET_ROOT_PID??'')&&canonical({...CONTINUATION_CASE,...limits})===canonical(CONTINUATION_CASE),'BROKER_CLIENT_CONFIG');
 const raw=Buffer.from(continuation.baseLedger),hash=continuation.baseLedgerHash,admission=structuredClone(continuation.admission);let highWater=null,sequence=0,failed=null,pending=null,buffer='',serial=Promise.resolve();
 const socket=connect({path:env.QA_BUDGET_SOCKET});socket.unref();socket.setEncoding('utf8');
 function failure(error){failed??=error;pending?.reject(failed);pending=null;socket.destroy()}
 socket.on('error',()=>failure(Error('BROKER_CLIENT_TRANSPORT_UNCERTAIN')));socket.on('end',()=>failure(Error('BROKER_ROOT_ENDED')));socket.on('close',()=>failure(Error('BROKER_ROOT_ENDED')));
 socket.on('data',chunk=>{buffer+=chunk;if(Buffer.byteLength(buffer)>262145)return failure(Error('BROKER_ACK_SIZE'));while(buffer.includes('\n')){const i=buffer.indexOf('\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!pending)return failure(Error('BROKER_UNEXPECTED_ACK'));let reply;try{reply=JSON.parse(line);check(reply.schema==='cp024-budget-ack-v1'&&reply.admissionHash===continuation.admissionHash&&reply.clientId===env.QA_BUDGET_CLIENT&&reply.sequence===pending.sequence&&reply.rootPid===Number(env.QA_BUDGET_ROOT_PID),'BROKER_ACK_IDENTITY');validateContinuation(reply.state,raw,hash,admission,clock());if(highWater)validateContinuationProgress(highWater,reply.state);highWater=structuredClone(reply.state);const p=pending;pending=null;p.resolve(structuredClone(highWater));socket.unref()}catch(error){failure(error)}}});
 const rpc=(method,{name=null,kind=null,amount=null}={})=>{
  const operation=serial.then(()=>new Promise((resolve,reject)=>{if(failed)return reject(failed);const seq=++sequence,timer=setTimeout(()=>failure(Error('BROKER_ACK_UNCERTAIN')),2000);timer.unref();pending={sequence:seq,resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}};socket.ref();socket.write(canonical({schema:'cp024-budget-rpc-v1',clientId:env.QA_BUDGET_CLIENT,admissionHash:continuation.admissionHash,sequence:seq,method,scenario,name,kind,amount})+'\n')}));serial=operation.catch(()=>{});return operation;
 };
 await rpc('enroll');return {snapshot:()=>rpc('snapshot'),charge:(kind,amount=1)=>rpc('charge',{kind,amount}),enter:name=>rpc('enter',{name})};
}
