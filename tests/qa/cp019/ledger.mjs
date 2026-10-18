import {CASE_LIMITS,GLOBAL_LIMITS} from './budget-limits.mjs';
// Shared accounting for the exclusive CP019 cohort. Limit checks precede effects.
import {open,readFile,rename,unlink,lstat,realpath} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';import {uptime} from 'node:os';import {randomUUID} from 'node:crypto';
import {syncDirectory} from '../../../server/saas/recovery/protocol.js';
import {newContinuationLedger} from './continuation-ledger.mjs';
import {readContinuationAuthority} from './continuation-authority.mjs';
import {readRuntimeOverlayAuthority} from './runtime-overlay-authority.mjs';
import {newBrokerLedger} from './continuation-broker.mjs';
const ceilings=GLOBAL_LIMITS;
const refuse=(ok)=>{if(!ok)throw Error('CP019_BUDGET_ABORT');};
export async function newLedger(file,{scenario,limits={},sync=syncDirectory,continuation=null}={}){
 if(continuation===null&&process.env.QA_BUDGET_ATTEMPT!==undefined){
  refuse(process.env.QA_BUDGET_ATTEMPT==='v2'&&resolve(file)==='/run/qa-budget/ledger.json');continuation=await readContinuationAuthority();await readRuntimeOverlayAuthority();return newBrokerLedger({scenario,limits,continuation});
 }
 if(continuation!==null)return newContinuationLedger(file,{scenario,limits,sync,continuation});
 file=resolve(file);refuse(typeof scenario==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(scenario));refuse(await realpath(dirname(file))===dirname(file));const s=await lstat(file);refuse(s.isFile()&&!s.isSymbolicLink());
 const perCase=CASE_LIMITS;const maximum={...perCase,...limits};for(const[k,v]of Object.entries(maximum))refuse(Object.hasOwn(perCase,k)&&Number.isInteger(v)&&v>=0&&v<=perCase[k]);
 async function update(mutator){
  let lock;
  for(let attempt=0;attempt<40;attempt++){try{lock=await open(file+'.lock','wx',0o600);break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(setImmediate);}}
  refuse(lock);let temporary;
  try{
   const state=JSON.parse(await readFile(file,'utf8'));refuse(state.schema==='cp019-budget-v1'&&state.project==='mecanet-qa-p1l3-r03'&&Number.isFinite(state.startedUptime)&&uptime()-state.startedUptime>=0&&uptime()-state.startedUptime<=1800);
   refuse(Object.keys(state.total).sort().join(',')===Object.keys(ceilings).sort().join(',')&&Object.values(state.total).every(v=>Number.isInteger(v)&&v>=0));
   await mutator(state);
   temporary=file+'.'+randomUUID()+'.tmp';const h=await open(temporary,'wx',0o600);try{await h.writeFile(JSON.stringify(state));await h.sync();}finally{await h.close();}await rename(temporary,file);temporary=null;await sync(dirname(file));return state;
  }finally{if(temporary)await unlink(temporary).catch(()=>{});await lock.close();await unlink(file+'.lock');}
 }
 async function charge(kind,amount=1){
  refuse(Object.hasOwn(ceilings,kind)&&Number.isInteger(amount)&&amount>0);
  return update(state=>{
   const name=['source-window','target-window'].includes(scenario)?state.activeScenarios?.[scenario]:scenario;
   const planned=state.plannedScenarios?.[name];refuse(planned&&JSON.stringify(Object.fromEntries(Object.entries(planned).sort()))===JSON.stringify(Object.fromEntries(Object.entries(maximum).sort())));
   state.scenarios[name]??={startedUptime:uptime(),limits:planned,total:{sql:0,http:0,journal:0,artifactFiles:0}};const current=state.scenarios[name];refuse(JSON.stringify(current.limits)===JSON.stringify(planned)&&uptime()-current.startedUptime<=45);
   refuse(state.total[kind]+amount<=ceilings[kind]&&current.total[kind]+amount<=(maximum[kind]??ceilings[kind]));state.total[kind]+=amount;current.total[kind]+=amount;state.sequence++;
  });
 }
 async function enter(name){refuse(['source-window','target-window'].includes(scenario));return update(state=>{refuse(state.plannedScopes?.[name]===scenario&&state.plannedScenarios?.[name]&&Object.hasOwn(state.activeScenarios??{},scenario));state.activeScenarios[scenario]=name;state.sequence++;});}
 return{charge,enter,async snapshot(){return JSON.parse(await readFile(file,'utf8'));}};
}
export function measuredPool(pool,ledger){
 const view=target=>new Proxy(target,{get(t,k){if(k==='query')return async(...args)=>{await ledger.charge('sql');return t.query(...args);};const value=Reflect.get(t,k,t);return typeof value==='function'?value.bind(t):value;}});
 // Never monkeypatch pg's internal callback-based connect or a pooled client.
 // Otherwise pool.query would charge twice or reuse a wrapped released client.
 return new Proxy(pool,{get(t,k){if(k==='connect')return async()=>view(await t.connect());if(k==='query')return async(...args)=>{await ledger.charge('sql');return t.query(...args);};const value=Reflect.get(t,k,t);return typeof value==='function'?value.bind(t):value;}});
}
