"""Passive assembly of the existing runner, not an additional QA program.

No CLI, staging, process or effect on import. The owning Root validates all
input bodies before begin; only runner.py supplies its real relay/monitor/step
and browser implementations. A transported hash alone is never a Gate PASS.
"""
import copy,hashlib,json,math,pathlib,re,stat,sys,types
_PREPARED=object()
HELPERS=frozenset(['host.py','tls_bundle.py','target-host.py','target-lifecycle.py','target-variant-host.py','target-readiness-host.py','browser-config.py','controller.py','resource-monitor.py','resource-sample.py','budget-limits.json','run.py'])
PRIOR_REPORT='9bd6b77c0f3de7de60c9e9790146989672067478126102fc18bc976819754453'
GATES={
 'quality':{'source-tests','static-checks','dependency-audit'},
 'independentReview':{'consumer-binding','root-single-writer','first-effect-accounting','emergency-cleanup','no-shared-effects'},
 'transport':{'linux-unix-peers','durable-acks','exclusive-root'},
 'environment':{'positive-original-fin','pins-and-ownership','networks-and-ports','storage-and-keep','resources','foreign-preservation'},
 'publicationProjection':{'complete135','sql-rpc','http-journal-artifacts','time','root-and-docker-resources','storage'}}
HASH=re.compile('[0-9a-f]{64}')
def check(ok,label):
 if not ok:raise AssertionError(label)
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else canonical(v)).hexdigest()
def number(v):return type(v) in [int,float] and math.isfinite(v)
def preparation_seal(entry):
 context=entry['context'];return digest({'baseLedgerBytes':digest(context['baseLedger']),'baseLedgerHash':context['baseLedgerHash'],'admission':context['admission'],'admissionHash':context['admissionHash'],'gates':entry['gates'],'gatePins':entry['gatePins'],'plan':entry['plan'],'publicationPlan':entry['publication']['plan']})

def validate_gates(bodies,pins,source_sha,runtime_hash,base):
 """Validate the exact Root-reviewed bodies, including their unresolved items.

 Evidence hashes refer to the reviewed provenance inventory; this validator
 does not turn the referenced tests into Oracle acceptance or infer capacity.
 """
 check(isinstance(bodies,dict) and isinstance(pins,dict) and set(bodies)==set(pins)==set(GATES),'OUTER_GATE_BODIES')
 for name,required in GATES.items():
  body=bodies[name];check(isinstance(body,dict) and body.get('schema')==('cp024-environment-gate-v1' if name=='environment' else 'cp024-execution-gate-v1') and body.get('name')==name and body.get('status')=='PASS' and body.get('project')==base['project'] and body.get('sourceSha')==source_sha and body.get('runtimeHash')==runtime_hash and body.get('requiredOpen')==[] and body.get('unknowns')==[],'OUTER_GATE_BODY')
  check(isinstance(pins[name],str) and HASH.fullmatch(pins[name]) and digest(body)==pins[name],'OUTER_GATE_HASH')
  evidence=body.get('evidence');rows=body.get('checks');check(isinstance(evidence,list) and 0<len(evidence)<=256 and all(isinstance(e,dict) and set(e)=={'sha256','scope','environment'} and isinstance(e['sha256'],str) and HASH.fullmatch(e['sha256']) and isinstance(e['scope'],str) and 1<=len(e['scope'])<=256 and isinstance(e['environment'],str) and 1<=len(e['environment'])<=128 for e in evidence),'OUTER_GATE_PROVENANCE')
  hashes={e['sha256'] for e in evidence};check(isinstance(rows,list) and len(rows)==len(required) and {r.get('id') for r in rows if isinstance(r,dict)}==required and all(set(r)=={'id','status','evidenceHash'} and r['status']=='PASS' and r['evidenceHash'] in hashes for r in rows),'OUTER_GATE_CHECKS')
 projection=bodies['publicationProjection'];cases=projection.get('cases');check(isinstance(cases,dict) and set(cases)==set(base['plannedScenarios']),'OUTER_PROJECTION_COVERAGE')
 totals=dict.fromkeys(['artifactFiles','sql','http','journal'],0);seconds=0
 for name,row in cases.items():
  check(isinstance(row,dict) and set(row)=={'additional','secondsUpperBound','evidenceHash'} and isinstance(row['additional'],dict) and set(row['additional'])==set(totals) and number(row['secondsUpperBound']) and 0<=row['secondsUpperBound']<45 and row['evidenceHash'] in {e['sha256'] for e in projection['evidence']},'OUTER_PROJECTION_CASE')
  prior=base['scenarios'].get(name,{'total':dict.fromkeys(totals,0)})['total']
  for kind,amount in row['additional'].items():check(type(amount) is int and amount>=0 and prior[kind]+amount<=base['plannedScenarios'][name][kind],'OUTER_PROJECTION_CASE_OVERFLOW');totals[kind]+=amount
  seconds+=row['secondsUpperBound']
 check(projection.get('additionalTotals')==totals and all(base['total'][k]+totals[k]<=v for k,v in {'artifactFiles':8192,'sql':200000,'http':300,'journal':1000}.items()) and number(projection.get('globalSecondsUpperBound')) and seconds<=projection['globalSecondsUpperBound']<1800,'OUTER_PROJECTION_GLOBAL')
 check(projection.get('resourceEnvelope')=={'dockerNanoCpus':1000000000,'dockerMemoryBytes':2147483648,'postgresCount':1,'postgresConnections':60,'scopeBytes':2147483648,'admissionCpuExclusive':80,'monitorCpuExclusive':90},'OUTER_PROJECTION_RESOURCES')
 return True

def prepare(model,publication,prepared,context,bodies,pins,plan):
 """Memory-only preparation, before any claim or new remote staging."""
 publication.validate_prepared(prepared);check(isinstance(plan,dict) and set(plan)=={'schema','sourceSha','helpers','nodeExecutableHash','browser'} and plan['schema']=='cp021-controller-plan-v1' and re.fullmatch('[0-9a-f]{40}',plan.get('sourceSha','')) and isinstance(plan.get('helpers'),dict) and set(plan['helpers'])==HELPERS and all(isinstance(value,str) and HASH.fullmatch(value) for value in plan['helpers'].values()) and re.fullmatch('[0-9a-f]{64}',plan['nodeExecutableHash']) and isinstance(plan['browser'],dict),'OUTER_SOURCE_PLAN')
 base=model.validate_base(context['baseLedger'],context['baseLedgerHash']);a=context['admission'];model.validate_admission(a,base,context['baseLedgerHash']);check(context['admissionHash']==digest(a) and a['controllerHash']==digest(plan) and a['runtimeHash']==prepared['plan']['runtimeHash'] and prepared['effective']['sourceSha']==prepared['effective']['codeSha']==plan['sourceSha'],'OUTER_CONTEXT_BINDING')
 entries={e['path']:e for e in prepared['effective']['entries']}
 for name,sha in plan['helpers'].items():check(entries.get('tests/qa/cp019/'+('runner.py' if name=='run.py' else name),{}).get('sha256')==sha,'OUTER_HELPER_BINDING')
 validate_gates(bodies,pins,plan['sourceSha'],a['runtimeHash'],base)
 check(bodies['environment'].get('sourceContainerId')==a['sourceContainerId'] and a['sealedInputsHash']==digest(bodies['environment'].get('sealedInputs')) and a['priorRunReportHash']==PRIOR_REPORT,'OUTER_ENVIRONMENT_IDENTITY')
 for name,amount in prepared['plan']['costs'].items():check(bodies['publicationProjection']['cases'][name]['additional']['artifactFiles']>=amount,'OUTER_STARTUP_UNPROJECTED')
 entry={'model':model,'publication':prepared,'context':copy.deepcopy(context),'gates':copy.deepcopy(bodies),'gatePins':copy.deepcopy(pins),'plan':copy.deepcopy(plan),'token':_PREPARED,'begun':False};entry['seal']=preparation_seal(entry);return entry

def begin(prepared,modules,monitor,control,host_factory):
 """The same Root starts its monitor, claim, publication and existing program.

 Publication guards every file/directory effect. No retry/adopt/fallback exists;
 the real runner's finally remains responsible for exact-identity STOP/KEEP.
 """
 check(monitor is not None and monitor._started is True,'OUTER_MONITOR_REQUIRED');check(prepared.get('token') is _PREPARED and prepared.get('begun') is False and prepared.get('seal')==preparation_seal(prepared),'OUTER_PREPARATION_REQUIRED');claim=None;session=None
 def guard():control();monitor.check()
 try:
  modules.publication.validate_prepared(prepared['publication']);base=prepared['model'].validate_base(prepared['context']['baseLedger'],prepared['context']['baseLedgerHash']);validate_gates(prepared['gates'],prepared['gatePins'],prepared['plan']['sourceSha'],prepared['context']['admission']['runtimeHash'],base);prepared['begun']=True
  guard();monitor.first_sample();guard();claim=modules.admission.create_claim(prepared['model'],prepared['context'],modules.admission.RootClaimStore(),prepared['gatePins'],publication=prepared['publication']['plan'])
  guard();session=modules.publication.publish(prepared['publication'],claim,host_factory,modules.broker,start_transport=True,before_effect=guard);guard();return session
 except BaseException:
  if claim is not None:claim.fail('OUTER_ENTRY_UNCERTAIN')
  if session is not None:
   session['broker'].fail('OUTER_ENTRY_UNCERTAIN');session['transport'].stop()
  raise

def capsule_modules(publication,prepared):
 """Compile the closed byte-verified capsule without writing a helper to disk.

 This is an explicit trusted Root entry, not an environment variable fallback.
 Ordinary imports still use their existing files. The same bytes are published
 later under the charged immutable runtime; no pre-claim staging is exempted.
 """
 publication.validate_prepared(prepared);sys.dont_write_bytecode=True;files=prepared['files'];entries={e['path']:e for e in prepared['effective']['entries']};loaded={}
 def load(file,extra=None):
  path='tests/qa/cp019/'+file;raw=files.get(path);check(isinstance(raw,bytes) and 2<=len(raw)<=262144 and entries.get(path,{}).get('sha256')==digest(raw),'OUTER_CAPSULE_SOURCE');name='cp024_root_capsule_'+file.replace('-','_').replace('.','_');check(name not in sys.modules,'OUTER_CAPSULE_ALREADY_LOADED');m=types.ModuleType(name);m.__file__=str(publication.RUNTIME/path);m.__dict__.update(extra or {});sys.modules[name]=m
  try:exec(compile(raw,m.__file__,'exec'),m.__dict__)
  except BaseException:raise # Retain the failed module; never reload/adopt a partial capsule.
  m.__cp024_source_hash=digest(raw);loaded[file]=m;return m
 diagnostics=load('resource-sample.py');limits=files.get('tests/qa/cp019/budget-limits.json');host=load('host.py',{'_CP024_MEMORY_INPUTS':{'diagnostics':diagnostics,'limitsRaw':limits}});monitor=load('resource-monitor.py',{'_CP024_MEMORY_DIAGNOSTICS':diagnostics})
 modules=types.SimpleNamespace(host=host,monitor=monitor,model=load('continuation-budget.py'),admission=load('continuation-admission.py'),broker=load('continuation-broker.py'),publication=publication,port=load('continuation-port.py'),controller=load('controller.py'),runner=load('runner.py'))
 for file in ['continuation-admission.py','continuation-budget.py','continuation-broker.py','continuation-port.py','host.py','resource-monitor.py','resource-sample.py','controller.py','runner.py']:check(loaded[file].__cp024_source_hash==entries['tests/qa/cp019/'+file]['sha256'],'OUTER_CAPSULE_BINDING')
 modules.outer=types.SimpleNamespace(begin=begin,finish_transport=finish_transport);return modules

def physical_entry(host,publication,prepared,environment,admission_template):
 """Current read-only conjunction immediately before selecting the v2 start.

 Detailed pins/network/storage/writer proofs remain the separately reviewed
 Environment body. A current numeric resource sample is not capacity evidence.
 """
 check(host.ROOT==publication.ROOT and host.TARGET==publication.TARGET,'OUTER_PHYSICAL_SCOPE');check(digest(publication.private_raw(host.ROOT/'budget/ledger.json',0o600,999))==admission_template['parentLedgerHash'],'OUTER_V1_CHANGED');sealed_inputs(host,publication,environment.get('sealedInputs'));check(digest(environment['sealedInputs'])==admission_template['sealedInputsHash'],'OUTER_SEALED_INVENTORY');host.own();host.own(host.TARGET);host.preserve();current=host.facts();own=[r for r in current if r.get('project') in [host.ROOT.name,host.TARGET.name]];check(len(own)==1,'OUTER_OLD_WRITERS');row=own[0]
 expected={'id':admission_template['sourceContainerId'],'ownerId':admission_template['sourceOwnerId'],'running':False,'pid':0,'status':'exited','exitCode':0,'finishedAt':admission_template['sourceFinishedAt']}
 check(all(row.get(k)==v for k,v in expected.items()) and environment.get('sourceContainerId')==row['id'],'OUTER_SOURCE_FIN');check(json.loads(host.run('docker','inspect','--format','{{json .State.OOMKilled}}',row['id'])) is False,'OUTER_SOURCE_OOM')
 reference=json.loads(publication.private_raw(host.ROOT/'master/source-services'/('postgres-'+row['id']+'.json'),0o400));check(reference==host.source_service_reference(row),'OUTER_SOURCE_REFERENCE');host.validate_source_service_boundary(row['id'],json.loads(prepared['sourceRaw'])['services']['postgres'])
 check((host.ROOT/'evidence/system-id').read_text().strip()==admission_template['sourceSystemIdentifier'],'OUTER_SOURCE_SYSTEM_ID');check(publication.private_raw(host.ROOT/'staging/artifact.json',0o444)==prepared['originalRaw'] and publication.private_raw(host.ROOT/'compose.json')==prepared['sourceRaw'] and publication.private_raw(host.TARGET/'compose.json')==prepared['targetRaw'] and digest(publication.private_raw(host.ROOT/'master/material.json'))==publication.MATERIAL,'OUTER_SEALED_INPUT_CHANGED')
 check(not any(p.exists() or p.is_symlink() for p in [host.ROOT/'master/continuations',host.ROOT/'budget/continuations']),'OUTER_PRIOR_ATTEMPT');return host.resources()

def sealed_inputs(host,publication,rows):
 """Complete existing metadata/config/TLS scope, hashes only; never data scans."""
 check(isinstance(rows,list) and 7<=len(rows)<=512,'OUTER_SEALED_INVENTORY');expected=set();actual=set()
 for root in [host.ROOT,host.TARGET]:
  expected.update(root/name for name in ['owner.json','compose.json'])
  if root==host.ROOT:expected.update(root/name for name in ['master/material.json','master/material-ref.json','staging/artifact.json'])
  pending=[root/name for name in ['config','tls','secrets']]
  while pending:
   directory=pending.pop();s=directory.lstat();check(directory.resolve()==directory and stat.S_ISDIR(s.st_mode) and not stat.S_IMODE(s.st_mode)&0o022,'OUTER_SEALED_DIRECTORY')
   for p in directory.iterdir():
    s=p.lstat();check(p.resolve()==p and not p.is_symlink(),'OUTER_SEALED_LINK')
    if stat.S_ISDIR(s.st_mode):pending.append(p)
    else:check(stat.S_ISREG(s.st_mode),'OUTER_SEALED_TYPE');expected.add(p)
    check(len(expected)+len(pending)<=512,'OUTER_SEALED_INVENTORY')
 for row in rows:
  check(isinstance(row,dict) and set(row)=={'path','uid','mode','sha256'} and isinstance(row['path'],str) and '\\' not in row['path'] and '..' not in pathlib.PurePosixPath(row['path']).parts and row['uid'] in [0,101,999] and row['mode'] in [0o400,0o444,0o600] and isinstance(row['sha256'],str) and HASH.fullmatch(row['sha256']),'OUTER_SEALED_ROW');p=pathlib.Path(row['path']);check(p in expected and p not in actual,'OUTER_SEALED_SCOPE');check(digest(publication.private_raw(p,row['mode'],row['uid']))==row['sha256'],'OUTER_SEALED_CHANGED');actual.add(p)
 check(actual==expected,'OUTER_SEALED_OMITTED');return True

def launch(model,publication,prepared,base_raw,base_hash,admission_template,bodies,pins,plan):
 """Explicit in-memory entry; there is intentionally no auto-starting CLI.

 Only the already-authorized exact release and complete reviewed gates can
 reach claim creation. Caller transports the capsule in memory and retains
 stdin for the unchanged browser relay. Nothing here contacts the VPS itself.
 """
 publication.validate_prepared(prepared);base=model.validate_base(base_raw,base_hash);validate_gates(bodies,pins,plan['sourceSha'],prepared['plan']['runtimeHash'],base);check('startedUptime' not in admission_template,'OUTER_START_ALREADY_SELECTED');modules=capsule_modules(publication,prepared);runner=modules.runner
 runner.initialize(modules.host,modules.controller,plan)
 try:
  physical_entry(modules.host,publication,prepared,bodies['environment'],admission_template);runner.require_control();runner.monitor=modules.monitor.ResourceMonitor(modules.host,raw_run=runner.original_run);runner.monitor.start();runner.monitor.first_sample();runner.monitor.check()
  admission={**copy.deepcopy(admission_template),'startedUptime':modules.admission.uptime()};context={'baseLedger':base_raw,'baseLedgerHash':base_hash,'admission':admission,'admissionHash':digest(admission)};entry=prepare(model,publication,prepared,context,bodies,pins,plan)
 except BaseException:
  if runner.monitor is not None:runner.monitor.stop()
  runner.relay.stop();raise
 return runner.run_program((entry,modules))

def finish_transport(session,failed):
 """After exact-CID cleanup: positive socket EOF, then bounded server shutdown.

 A wait can only produce NOT VERIFIED. No timeout becomes client or SQL FIN.
 Root lifetime is consumed even after a successful completion.
 """
 if session is None:return {'failure':None,'transport':None}
 claim=session['claim'];broker=session['broker'];transport=session['transport'];failure=None;result=None
 try:
  if failed:claim.fail('OUTER_EXECUTION_FAILED');broker.fail('OUTER_EXECUTION_FAILED')
  check(transport is not None and transport.clients_finished(2) is True,'OUTER_CLIENT_FIN_UNKNOWN');result=transport.stop();check(result.get('serverThreadEnded') is True and result.get('clientFIN')=='PASS' and (failed or result.get('failure') is None),'OUTER_TRANSPORT_STOP_UNKNOWN')
 except BaseException:
  failure='OUTER_TRANSPORT_NOT_VERIFIED';claim.fail(failure);broker.fail(failure)
  if transport is not None:
   try:result=transport.stop()
   except BaseException:result={'clientFIN':'NOT VERIFIED','serverThreadEnded':False}
 finally:claim.closed=True;claim.effect_ready=False;broker.stop()
 return {'failure':failure,'transport':result}
