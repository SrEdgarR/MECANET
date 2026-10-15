import test from 'node:test';import assert from 'node:assert/strict';
import {budgetRegistry,validateBudgetRegistry,initialBudget,CASE_SCOPES,HOST_STAGE_SCOPES} from './budget-plan.mjs';
import {CASE_LIMITS,GLOBAL_LIMITS,CASE_SECONDS,COHORT_SECONDS,SCENARIO_COUNT} from './budget-limits.mjs';
import {createHash} from 'node:crypto';
import {ACCEPTANCE_SCENARIOS} from './acceptance.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir,uptime} from 'node:os';import {join,resolve} from 'node:path';
import {newLedger} from './ledger.mjs';import {canonical,sha256} from '../../../server/saas/recovery/protocol.js';
import {COPY_NEGATIVE_CASES} from './copy-negatives.mjs';import {A5_NEGATIVE_CASES} from './a5-negatives.mjs';
test('the immutable registry applies SC012 SQL ceilings and preserves every other limit',()=>{
 const plan=budgetRegistry();assert.deepEqual(validateBudgetRegistry(plan),plan);
 for(const [name,scope] of Object.entries(ACCEPTANCE_SCENARIOS))assert.equal(plan.plannedScopes[name],scope);
 assert.deepEqual(initialBudget(plan,100).total,{sql:0,http:0,journal:0,artifactFiles:0});
 for(const limits of Object.values(plan.plannedScenarios))assert.deepEqual(limits,{sql:8192,http:80,journal:1000,artifactFiles:2000});
 for(const mutate of [p=>p.plannedScenarios['retry-alias']={sql:8192,http:80,journal:1000,artifactFiles:2000},p=>p.plannedScenarios['prepare-writers'].sql=8193,p=>p.activeScenarios['source-window']='new-case',p=>delete p.plannedScopes['target-activation']]){const bad=structuredClone(plan);mutate(bad);assert.throws(()=>validateBudgetRegistry(bad));}
 assert.equal(CASE_SCOPES['source-clock-ack'],'source-window');assert.equal(CASE_SCOPES['target-activation'],'target-window');assert.throws(()=>initialBudget(plan,-1));
});
test('different physical stages have distinct preregistered windows without renaming mutation or retry cases',()=>{
 const p=budgetRegistry();assert.equal(Object.keys(p.plannedScenarios).length,135);assert.equal(Object.keys(HOST_STAGE_SCOPES).length,12);
 for(const n of ['target-pg-start','target-worker-start','target-business-start','target-stop-initial','target-end-initial','target-stop-restarted','target-end-restarted','target-stop-prefix','target-end-prefix'])assert.equal(p.plannedScopes[n],'target-window');
 for(const n of ['source-shutdown-precopy','source-shutdown-postcanary','source-copy-checkpoint'])assert.equal(p.plannedScopes[n],'source-window');
 for(const n of ['target-rotate','target-promotion','target-activation','target-abort-close'])assert.deepEqual(p.plannedScenarios[n],{sql:8192,http:80,journal:1000,artifactFiles:2000});
 const state=initialBudget(p,100);assert.equal(state.startedUptime,100);assert.deepEqual(state.total,{sql:0,http:0,journal:0,artifactFiles:0});
});

test('the new helper cases enter the real ledger and match the pinned Python registry',async()=>{
 const p=budgetRegistry(),source=['source-schema-probe-pre','source-schema-probe-post'],target=['copy-negatives-env',...Object.keys(COPY_NEGATIVE_CASES).map(n=>'copy-negative-'+n),'journal-negatives-env','journal-negatives',...A5_NEGATIVE_CASES];
 assert.equal(new Set([...source,...target]).size,19);
 const root=await mkdtemp(join(tmpdir(),'mecanet-cp020-registry-'));assert(root.startsWith(resolve(tmpdir())));
 try{
  const file=join(root,'ledger.json');await writeFile(file,canonical(initialBudget(p,uptime())));
  for(const [scope,names] of [['source-window',source],['target-window',target]]){
   // Windows cannot fsync directories. Keep real ledger reads/locks/renames;
   // only Linux directory durability remains outside this local contract.
   const ledger=await newLedger(file,{scenario:scope,...(process.platform==='win32'?{sync:async()=>{}}:{})});
   for(const n of names){assert.equal(p.plannedScopes[n],scope);await ledger.enter(n);await ledger.charge('sql');const state=await ledger.snapshot();assert.equal(state.activeScenarios[scope],n);assert.equal(state.scenarios[n].total.sql,1);assert.equal(state.scenarios[n].limits.sql,8192);}
   await assert.rejects(ledger.charge('sql',8192),/CP019_BUDGET_ABORT/);
  }
  const state=JSON.parse(await readFile(file));assert.equal(state.total.sql,19);assert.equal(state.startedUptime>0,true);
  const host=await readFile(new URL('./host.py',import.meta.url),'utf8');assert.equal(host.match(/BUDGET_PLAN_SHA='([a-f0-9]{64})'/)?.[1],sha256(p));assert.match(host,/len\(plan\['plannedScenarios'\]\)==SCENARIO_COUNT/);assert.equal(SCENARIO_COUNT,Object.keys(p.plannedScenarios).length);
 }finally{await rm(root,{recursive:true,force:false})}
});

test('JS and Python share pinned exact caps without changing the135 scenario names or scopes',async()=>{
 assert.deepEqual(CASE_LIMITS,{artifactFiles:2000,http:80,journal:1000,sql:8192});assert.deepEqual(GLOBAL_LIMITS,{artifactFiles:8192,http:300,journal:1000,sql:200000});
 assert.equal(CASE_SECONDS,45);assert.equal(COHORT_SECONDS,1800);assert.equal(SCENARIO_COUNT,135);assert.ok(Object.isFrozen(CASE_LIMITS));assert.ok(Object.isFrozen(GLOBAL_LIMITS));
 const raw=await readFile(new URL('./budget-limits.json',import.meta.url)),host=await readFile(new URL('./host.py',import.meta.url),'utf8');assert.equal(host.match(/LIMITS_SHA='([a-f0-9]{64})'/)?.[1],createHash('sha256').update(raw).digest('hex'));
 const unchanged=budgetRegistry();unchanged.project='mecanet-qa-p1l3-r02';for(const limits of Object.values(unchanged.plannedScenarios))limits.sql=140;
 assert.equal(sha256(unchanged),'ba43bef8cdd8351c58c9cc3a6ccc4b109f0aaf0e59d1856fe6c67903912e182f');
});

test('SC014 changes only the fixed cohort identity and preserves the CP021 registry semantics',()=>{
 const p=budgetRegistry();assert.equal(p.project,'mecanet-qa-p1l3-r03');assert.equal(Object.keys(p.plannedScenarios).length,135);
 const previous=structuredClone(p);previous.project='mecanet-qa-p1l3-r02';assert.equal(sha256(previous),'193c5b53f0df3243fa9c3c30b6bafdfd4a4cfdc7299db46db0016b182fa75b84');
 for(const project of ['mecanet-qa-p1l3-r01','mecanet-qa-p1l3-r02','mecanet-qa-p1l3-r03-target','mecanet-qa-p1l3-r04'])assert.throws(()=>validateBudgetRegistry({...p,project}),/CP019_FIXED_BUDGET_REGISTRY_REQUIRED/);
});
