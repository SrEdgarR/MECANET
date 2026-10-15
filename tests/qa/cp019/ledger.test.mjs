import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,writeFile,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir,uptime}from'node:os';
import{newLedger,measuredPool}from'./ledger.mjs';
test('budgets are durable and cumulative across processes; refused effects do not execute',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mecanet-cp019-ledger-'));try{const file=join(dir,'ledger.json');await writeFile(file,JSON.stringify({schema:'cp019-budget-v1',project:'mecanet-qa-p1l3-r03',startedUptime:uptime(),sequence:0,total:{sql:0,http:0,journal:0,artifactFiles:0},plannedScenarios:{'sql-case':{sql:2,http:80,journal:1000,artifactFiles:2000}},scenarios:{}}));
 const a=await newLedger(file,{scenario:'sql-case',limits:{sql:2},sync:async()=>{}}),b=await newLedger(file,{scenario:'sql-case',limits:{sql:2},sync:async()=>{}});let effects=0;const connection={query:async()=>++effects};const p=measuredPool({query:async()=>++effects,connect:async()=>connection},a);
 await p.query('one');await(await p.connect()).query('two');await assert.rejects(b.charge('sql'));await assert.rejects(p.query('three'));assert.equal(effects,2);assert.equal((await b.snapshot()).total.sql,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a caller cannot increase a scenario limit or invent a new case to bypass the approved plan',async()=>{const dir=await mkdtemp(join(tmpdir(),'mecanet-cp019-ledger-'));try{const file=join(dir,'ledger.json');await writeFile(file,JSON.stringify({schema:'cp019-budget-v1',project:'mecanet-qa-p1l3-r03',startedUptime:uptime(),sequence:0,total:{sql:0,http:0,journal:0,artifactFiles:0},plannedScenarios:{'sql-case':{sql:2,http:80,journal:1000,artifactFiles:2000}},scenarios:{}}));await assert.rejects(newLedger(file,{scenario:'sql-case',limits:{sql:8193},sync:async()=>{}}));const l=await newLedger(file,{scenario:'sql-case',limits:{sql:3},sync:async()=>{}});await assert.rejects(l.charge('sql'));const missing=await newLedger(file,{scenario:'new-alias',sync:async()=>{}});await assert.rejects(missing.charge('sql'));}finally{await rm(dir,{recursive:true,force:true});}});
test('a stale or foreign ledger cannot silently reset the cohort budget',async()=>{const dir=await mkdtemp(join(tmpdir(),'mecanet-cp019-ledger-'));try{const file=join(dir,'ledger.json');await writeFile(file,JSON.stringify({schema:'cp019-budget-v1',project:'wrong',startedUptime:uptime(),sequence:0,total:{sql:0,http:0,journal:0,artifactFiles:0},scenarios:{}}));const l=await newLedger(file,{scenario:'test',sync:async()=>{}});await assert.rejects(l.charge('sql'));}finally{await rm(dir,{recursive:true,force:true});}});


test('approved SQL case ceiling is exact and reopening a case cannot refresh it or execute a refused query',async()=>{
 const {budgetRegistry,initialBudget}=await import('./budget-plan.mjs');
 const dir=await mkdtemp(join(tmpdir(),'mecanet-cp021-boundary-'));try{
  const file=join(dir,'ledger.json');await writeFile(file,JSON.stringify(initialBudget(budgetRegistry(),uptime())));
  const first=await newLedger(file,{scenario:'source-window',sync:async()=>{}}),second=await newLedger(file,{scenario:'source-window',sync:async()=>{}});
  await first.enter('source-clock-ack');await first.charge('sql',8191);let effects=0;const pool=measuredPool({query:async()=>++effects},second);
  await pool.query('boundary');const exhausted=await first.snapshot(),started=exhausted.scenarios['source-clock-ack'].startedUptime;
  assert.equal(exhausted.total.sql,8192);assert.equal(effects,1);await second.enter('source-close-admission');await second.enter('source-clock-ack');
  await assert.rejects(pool.query('refused'),/CP019_BUDGET_ABORT/);const after=await first.snapshot();
  assert.equal(effects,1);assert.equal(after.total.sql,8192);assert.equal(after.startedUptime,exhausted.startedUptime);assert.equal(after.scenarios['source-clock-ack'].startedUptime,started);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('approved global SQL ceiling stays cumulative across registered scenarios and survives a new ledger instance',async()=>{
 const {budgetRegistry,initialBudget}=await import('./budget-plan.mjs');const plan=budgetRegistry();
 const dir=await mkdtemp(join(tmpdir(),'mecanet-cp021-global-'));try{
  const file=join(dir,'ledger.json');await writeFile(file,JSON.stringify(initialBudget(plan,uptime())));
  const ledger=await newLedger(file,{scenario:'source-window',sync:async()=>{}}),names=Object.keys(plan.plannedScopes).filter(n=>plan.plannedScopes[n]==='source-window');assert.ok(names.length>=25);
  for(const name of names.slice(0,24)){await ledger.enter(name);await ledger.charge('sql',8192)}
  await ledger.enter(names[24]);await ledger.charge('sql',3392);const before=await ledger.snapshot();assert.equal(before.total.sql,200000);assert.equal(before.scenarios[names[24]].total.sql,3392);
  const reopened=await newLedger(file,{scenario:'source-window',sync:async()=>{}});await assert.rejects(reopened.charge('sql'),/CP019_BUDGET_ABORT/);
  const after=await reopened.snapshot();assert.deepEqual(after,before);
 }finally{await rm(dir,{recursive:true,force:true})}
});


test('SC013 raises only cumulative artifacts; the original per-case cap and retry totals still abort before effects',async()=>{
 const {budgetRegistry,initialBudget}=await import('./budget-plan.mjs'),plan=budgetRegistry(),dir=await mkdtemp(join(tmpdir(),'mecanet-cp021-artifacts-'));try{
  const file=join(dir,'ledger.json');await writeFile(file,JSON.stringify(initialBudget(plan,uptime())));
  const l=await newLedger(file,{scenario:'source-window',sync:async()=>{}}),names=Object.keys(plan.plannedScopes).filter(n=>plan.plannedScopes[n]==='source-window');
  await l.enter(names[0]);await l.charge('artifactFiles',2000);const first=await l.snapshot();await assert.rejects(l.charge('artifactFiles'),/CP019_BUDGET_ABORT/);assert.deepEqual(await l.snapshot(),first);
  for(const name of names.slice(1,4)){await l.enter(name);await l.charge('artifactFiles',2000)}
  await l.enter(names[4]);await l.charge('artifactFiles',192);const before=await l.snapshot();assert.equal(before.total.artifactFiles,8192);assert.equal(before.scenarios[names[4]].total.artifactFiles,192);
  const reopened=await newLedger(file,{scenario:'source-window',sync:async()=>{}});await assert.rejects(reopened.charge('artifactFiles'),/CP019_BUDGET_ABORT/);assert.deepEqual(await reopened.snapshot(),before);
 }finally{await rm(dir,{recursive:true,force:false})}
});
