// LOCAL abstract design model. No product imports, network, database or secret I/O.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const started=performance.now();
const clone=x=>structuredClone(x);
const maximum=9223372036854775807n;
const unsafeClosure=process.argv.includes('--unsafe-closure'); // deliberate model-only mutation
const unsafeRoster=process.argv.includes('--unsafe-roster'); // deliberate model-only mutation
const successor=x=>{const n=BigInt(x);if(n<1n||n>=maximum)throw Error('VERSION_CLOSED');return String(n+1n)};
const initial=()=>({expectedTenants:['A','B'],expectedAnchor:'A|B',loadedTenants:['A','B'],loadComplete:true,originEnded:true,manifest:true,journal:true,material:'material-1',owner:'owner-1',clock:true,unknown:false,complete:false,process:true,
 A:{central:'CLOSED',local:'CLOSED',cv:'5',lv:'5',stage:0,acked:false,restricted:false,classification:'ELIGIBLE'},
 B:{central:'CLOSED',local:'CLOSED',cv:'5',lv:'5',stage:0,acked:true,restricted:true,classification:'LEGITIMATE_CLOSED'}});
const roster=s=>s.loadComplete&&Array.isArray(s.expectedTenants)&&Array.isArray(s.loadedTenants)&&
 s.expectedTenants.join('|')===s.expectedAnchor&&new Set(s.expectedTenants).size===s.expectedTenants.length&&
 new Set(s.loadedTenants).size===s.loadedTenants.length&&s.loadedTenants.slice().sort().join('|')===s.expectedAnchor&&
 ['A','B'].filter(k=>s[k]).join('|')===s.expectedAnchor;
const ready=s=>s.process&&s.originEnded&&s.manifest&&s.journal&&Boolean(s.material)&&s.clock&&!s.unknown&&s.complete&&(unsafeRoster||roster(s))&&
 ['A','B'].every(k=>!s[k]||(s[k].acked&&s[k].cv===s[k].lv&&s[k].central===s[k].local&&
 (unsafeClosure||(s[k].classification==='ELIGIBLE'?s[k].central==='OPEN':s[k].classification==='LEGITIMATE_CLOSED'&&s[k].central==='CLOSED'))));
const admit=(s,actor={fresh:true,company:true,permission:true,epoch:'3',generation:'new',version:'6'},tenant='A')=>
 ready(s)&&Boolean(s[tenant])&&!s[tenant].restricted&&s[tenant].central==='OPEN'&&s[tenant].local==='OPEN'&&
 actor.fresh&&actor.company&&actor.permission&&actor.epoch==='3'&&actor.generation==='new'&&actor.version===s[tenant].cv;

function move(before,event){
 const s=clone(before);const a=s.A;
 if(event==='repeatMaterial'){assert.equal(s.material,'material-1');assert.equal(s.owner,'owner-1');return s}
 if(event==='crash'){s.process=false;return s}
 if(event==='restart'){s.process=true;return s}
 if(event==='restrict'){
  if(a.restricted)return s;
  s.complete=false;a.restricted=true;a.classification='LEGITIMATE_CLOSED';a.cv=successor(a.cv);a.lv=a.cv;a.central=a.local='CLOSED';a.stage=4;a.acked=true;s.unknown=false;return s;
 }
 if(event==='observe'){
  if(!s.unknown)return s;
  // Observation checks the exact prepared version and identity, never adopts a newer one.
  assert.equal(s.material,'material-1');assert.equal(s.owner,'owner-1');
  if(a.restricted){assert.equal(a.central,'CLOSED');assert.equal(a.local,'CLOSED')}
  else if(a.stage===1){assert.equal(a.cv,'6');assert.equal(a.lv,'5');assert.equal(a.central,'CLOSED')}
  else if(a.stage===2){assert.equal(a.cv,'6');assert.equal(a.lv,'6');assert.equal(a.central,'CLOSED');assert.equal(a.local,'OPEN')}
  else if(a.stage===3){assert.equal(a.cv,'6');assert.equal(a.lv,'6');assert.equal(a.central,s.complete?'OPEN':'CLOSED');assert.equal(a.local,'OPEN')}
  else assert.equal(a.stage,0);
  s.unknown=false;return s;
 }
 if(!s.process||s.unknown||!s.originEnded||!s.manifest||!s.journal||!s.material||!s.clock)return null;
 if(event==='ack'&&a.stage===3&&!a.restricted){a.acked=true;return s}
 if(['complete','complete:lostApplied','complete:lostNotApplied'].includes(event)&&a.acked&&s.B.acked&&a.cv===a.lv&&[3,4].includes(a.stage)){
  if(event==='complete:lostNotApplied'){s.unknown=true;return s}
  if(!a.restricted)a.central='OPEN';s.complete=true;if(event==='complete:lostApplied')s.unknown=true;return s;
 }
 if(a.restricted||s.complete)return null;
 const attempt=/^(prepare|local|central):(ack|lostApplied|lostNotApplied)$/.exec(event);
 if(!attempt)return null;
 const [,step,outcome]=attempt;
 const stages={prepare:0,local:1,central:2};if(a.stage!==stages[step])return null;
 if(outcome==='lostNotApplied'){s.unknown=true;return s}
 if(step==='prepare'){assert.equal(a.cv,'5');a.cv='6';a.stage=1}
 if(step==='local'){assert.equal(a.cv,'6');assert.equal(a.lv,'5');a.lv='6';a.local='OPEN';a.stage=2}
 if(step==='central'){assert.equal(a.cv,'6');assert.equal(a.lv,'6');assert.equal(a.central,'CLOSED');a.stage=3}
 if(outcome==='lostApplied')s.unknown=true;
 return s;
}

const cases=[];
function check(id,fn){fn();cases.push({id,status:'PASS'})}
const promoted=()=>{let s=initial();for(const e of ['prepare:ack','local:ack','central:ack','ack','complete'])s=move(s,e);assert.equal(ready(s),true);return s};
check('readiness-zero-companies',()=>{const s=initial();s.expectedTenants=[];s.expectedAnchor='';s.loadedTenants=[];delete s.A;delete s.B;s.complete=true;assert.equal(ready(s),true)});
check('readiness-all-legitimately-closed',()=>{const s=initial();s.A.acked=true;s.A.restricted=true;s.A.classification='LEGITIMATE_CLOSED';s.complete=true;assert.equal(ready(s),true);assert.equal(admit(s),false)});
check('readiness-open-plus-blocked',()=>{let s=initial();for(const e of ['prepare:ack','local:ack','central:ack','ack','complete'])s=move(s,e);assert.equal(ready(s),true);assert.equal(admit(s),true);assert.equal(admit(s,undefined,'B'),false)});
check('uncertainty-process-dependency-negatives',()=>{for(const key of ['originEnded','manifest','journal','clock','process']){const s=promoted();s[key]=false;assert.equal(ready(s),false)}const s=promoted();s.unknown=true;assert.equal(ready(s),false)});
check('versions-never-wrap',()=>{assert.equal(successor('5'),'6');assert.throws(()=>successor(String(maximum)),/VERSION_CLOSED/);assert.throws(()=>successor('0'),/VERSION_CLOSED/)});
check('old-session-context-permission-denied',()=>{let s=initial();for(const e of ['prepare:ack','local:ack','central:ack','ack','complete'])s=move(s,e);for(const patch of [{fresh:false},{company:false},{permission:false},{epoch:'2'},{generation:'old'},{version:'4'}])assert.equal(admit(s,{fresh:true,company:true,permission:true,epoch:'3',generation:'new',version:'6',...patch}),false)});
check('central-local-mismatch-never-admits',()=>{let s=initial();s=move(s,'prepare:ack');s=move(s,'local:lostApplied');assert.equal(admit(s),false);s=move(s,'observe');assert.equal(admit(s),false)});
check('retry-does-not-regenerate-material',()=>{let s=initial();s=move(s,'prepare:lostApplied');for(let i=0;i<5;i++)s=move(s,'repeatMaterial');assert.equal(s.material,'material-1');assert.equal(s.owner,'owner-1');s=move(s,'observe');assert.equal(s.A.cv,'6');assert.equal(move(s,'prepare:ack'),null)});
check('lost-not-applied-only-exact-step-retries',()=>{let s=move(initial(),'prepare:lostNotApplied');assert.equal(s.A.cv,'5');assert.equal(move(s,'local:ack'),null);s=move(s,'observe');s=move(s,'prepare:ack');assert.equal(s.A.cv,'6')});
check('new-restriction-is-not-an-adoptable-retry',()=>{let s=move(initial(),'prepare:lostApplied');s=move(s,'restrict');assert.equal(s.A.cv,'7');assert.equal(s.A.central,'CLOSED');assert.equal(move(s,'local:ack'),null);assert.equal(admit(s),false)});
check('eligible-unpromoted-is-not-a-legitimate-closure',()=>{const s=initial();s.A.acked=true;s.complete=true;assert.equal(ready(s),false)});
check('roster-omitted-duplicate-load-error-and-extra-denied',()=>{
 const omitted=promoted();delete omitted.A;omitted.loadedTenants=['B'];assert.equal(ready(omitted),false);
 const duplicate=promoted();duplicate.loadedTenants=['A','A','B'];assert.equal(ready(duplicate),false);
 const failed=promoted();failed.loadComplete=false;assert.equal(ready(failed),false);
 const extra=promoted();extra.loadedTenants=['A','B','C'];assert.equal(ready(extra),false);
 const emptyError=promoted();emptyError.loadedTenants=[];assert.equal(ready(emptyError),false);
});
check('activation-ack-unknown-observes-exact-before-or-after',()=>{
 let prepared=initial();for(const e of ['prepare:ack','local:ack','central:ack','ack'])prepared=move(prepared,e);
 for(const event of ['complete:lostApplied','complete:lostNotApplied']){
  let s=move(prepared,event);assert.equal(ready(s),false);assert.equal(s.A.local,'OPEN');
  assert.equal(s.A.central,event==='complete:lostApplied'?'OPEN':'CLOSED');
  s=move(s,'observe');if(!s.complete)s=move(s,'complete');assert.equal(admit(s),true);
  const stable=JSON.stringify(s);s=move(s,'complete');assert.equal(JSON.stringify(s),stable);
 }
});

const events=['prepare:ack','prepare:lostApplied','prepare:lostNotApplied','local:ack','local:lostApplied','local:lostNotApplied','central:ack','central:lostApplied','central:lostNotApplied','observe','ack','complete','crash','restart','repeatMaterial','restrict'];
events.push('complete:lostApplied','complete:lostNotApplied');
const key=s=>JSON.stringify(s);
const queue=[initial()];const seen=new Set([key(queue[0])]);let edges=0;
for(let i=0;i<queue.length;i++){
 const s=queue[i];
 // Independent property oracle, written from the safety requirement rather than calling ready().
 if(admit(s)){
  assert.equal(s.originEnded,true);assert.equal(s.unknown,false);assert.equal(s.complete,true);assert.equal(s.process,true);
  assert.equal(s.A.restricted,false);assert.equal(s.A.acked,true);assert.equal(s.A.cv,'6');assert.equal(s.A.lv,'6');assert.equal(s.A.central,'OPEN');assert.equal(s.A.local,'OPEN');
 }
 assert.equal(admit(s,undefined,'B'),false);
 for(const event of events){
  const next=move(s,event);if(!next)continue;edges++;
  assert.equal(next.material,s.material);assert.equal(next.owner,s.owner);assert.equal(next.B.restricted,true);
  assert(BigInt(next.A.cv)>=BigInt(s.A.cv));assert(BigInt(next.A.lv)>=BigInt(s.A.lv));
  assert.equal(admit(next,{fresh:false,company:true,permission:true,epoch:'3',generation:'new',version:'6'}),false);
  const k=key(next);if(!seen.has(k)){seen.add(k);queue.push(next)}
  assert(seen.size<=20000&&edges<=100000&&performance.now()-started<30000,'MODEL_BOUND_EXCEEDED');
 }
}
cases.push({id:'bounded-crash-ack-restriction-state-exploration',status:'PASS',states:seen.size,edges});

// Deliberately unsafe alternatives must have actual counterexamples. None changes the product.
const mutations=[];
const empty=initial();empty.expectedTenants=[];empty.expectedAnchor='';empty.loadedTenants=[];delete empty.A;delete empty.B;empty.complete=true;
const openRequired=s=>ready(s)&&['A','B'].some(k=>s[k]?.central==='OPEN');
assert.notEqual(openRequired(empty),true);mutations.push({id:'require-one-open',detected:true,counterexample:'zero-company healthy service incorrectly unavailable'});
const missing=promoted();delete missing.A;missing.loadedTenants=['B'];const ignoresRoster=s=>s.process&&s.complete&&['A','B'].every(k=>!s[k]||s[k].acked);assert.equal(ignoresRoster(missing),true);assert.equal(ready(missing),false);mutations.push({id:'ignore-expected-roster',detected:true,counterexample:'missing eligible A incorrectly read as legitimate absence'});
let interval=move(move(initial(),'prepare:ack'),'local:lostApplied');
const barrierIgnored=s=>s.A.local==='OPEN';assert.equal(barrierIgnored(interval),true);assert.equal(admit(interval),false);mutations.push({id:'ignore-barrier-pair',detected:true,counterexample:'local OPEN before central confirmation'});
const changed=move(move(initial(),'prepare:lostApplied'),'restrict');
const adoptsCurrent=s=>{const unsafe=clone(s);unsafe.A.restricted=false;unsafe.A.classification='ELIGIBLE';unsafe.A.central=unsafe.A.local='OPEN';unsafe.A.lv=unsafe.A.cv;unsafe.A.acked=true;unsafe.complete=true;return unsafe};
const adopted=adoptsCurrent(changed);assert.equal(admit(adopted,{fresh:true,company:true,permission:true,epoch:'3',generation:'new',version:'7'}),true);assert.equal(admit(changed),false);mutations.push({id:'adopt-current-version',detected:true,counterexample:'restriction version7 incorrectly opened instead of conflicting with prepared version6'});
let final=initial();for(const e of ['prepare:ack','local:ack','central:ack','ack','complete'])final=move(final,e);
const oldActor={fresh:false,company:true,permission:true,epoch:'3',generation:'new',version:'6'};
const ignoresSession=(s,a)=>admit(s,{...a,fresh:true});assert.equal(ignoresSession(final,oldActor),true);assert.equal(admit(final,oldActor),false);mutations.push({id:'revive-old-session',detected:true,counterexample:'old session incorrectly valid after OPEN'});
const sourcePath=fileURLToPath(import.meta.url);
const report={checkpoint:'CP-018',status:'PASS LOCAL ABSTRACT MODEL ONLY',classification:'DETECTED',provenance:'LOCAL',observedAt:new Date().toISOString(),baseSha:'86985fe7589032f202ebf0cb057a9b1384217151',node:process.version,platform:process.platform,architecture:process.arch,modelSha256:createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),cases,mutations,counts:{tests:cases.length,states:seen.size,edges,mutationsDetected:mutations.length},durationMs:Math.round(performance.now()-started),limitations:['No PostgreSQL/HTTP/browser/physical restore executed','Abstract prerequisites and lock exclusion are assumptions to exercise in QA after A/B','Not product implementation, CI integration or approval']};
writeFileSync(new URL('./results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,counts:report.counts,durationMs:report.durationMs}));
