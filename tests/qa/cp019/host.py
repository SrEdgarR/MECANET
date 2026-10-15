"""Exclusive CP019 controller. No Docker socket is mounted in any app or worker.
Fresh preflight, immutable staged bytes and own resources only; no build/pull.
"""
import hashlib, ipaddress, json, os, pathlib, subprocess, sys, tarfile, time, secrets, re, uuid, datetime, importlib.util, types, base64, stat, math
try:import resource as _resource_api
except ImportError:_resource_api=None
_resource_source=pathlib.Path(__file__).with_name('resource-sample.py')
assert _resource_source.is_file() and _resource_source.resolve()==_resource_source and not _resource_source.is_symlink(),'RESOURCE_DIAGNOSTIC_HELPER_REQUIRED'
_resource_spec=importlib.util.spec_from_file_location('cp023_host_resource_sample',_resource_source);resource_diagnostics=importlib.util.module_from_spec(_resource_spec);_resource_spec.loader.exec_module(resource_diagnostics)
RESOURCE_LAST_SAMPLE=None
RESOURCE_FIRST_REJECTED_SAMPLE=None
ROOT=pathlib.Path('/opt/mecanet-qa-p1l3-r03')
TARGET=pathlib.Path('/opt/mecanet-qa-p1l3-r03-target')
BASE='86985fe7589032f202ebf0cb057a9b1384217151'
APPROVAL='4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec'
PINS={'node':'ba6b7d0ee561d9d49deb99e2b93c98632cc287b6cca1a6b18d66127054efa4dc','postgres':'67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129','nginx':'3abad30db61dfb2a339ea21acc9f3e6bbe78e291fcff2f835f4510c8fdfcbd83'}
PROFILES={s:(int(cpu*1_000_000_000),mem*1024**2,image+'@sha256:'+PINS[image]) for s,cpu,mem,image in [('postgres',.35,640,'postgres'),('api1',.20,320,'node'),('api2',.20,320,'node'),('worker',.10,192,'node'),('web',.10,96,'nginx'),('harness',.25,128,'node'),('probe',.05,128,'node'),('controller-tool',.25,128,'node'),('offline-pg',.25,128,'postgres')]}
BUSINESS={'api1','api2','worker','web'}
SOURCE_PHASES={'source-close-b','source-migrate-a','source-migrate-b','source-migrate-central','source-initialize-a','source-initialize-b','source-initialize-control','source-clock-plan','source-clock-ack'}
SOURCE_FINAL_PHASES={'source-close-admission','source-close-restore','source-capture','source-closed-canary'}
UID999_FOLDERS=['data','secrets','evidence','faults','budget','backup','journal','journal/heads','journal/plans','journal/target-heads','journal/target-plans','live']
FACTS_FORMAT='{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"status":{{json .State.Status}},"startedAt":{{json .State.StartedAt}},"pid":{{json .State.Pid}},"image":{{json .Image}},"imageRef":{{json .Config.Image}},"nanoCpus":{{json .HostConfig.NanoCpus}},"memory":{{json .HostConfig.Memory}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "mecanet.qa.service")}},"ownerId":{{json (index .Config.Labels "mecanet.qa.owner-id")}},"jobId":{{json (index .Config.Labels "mecanet.qa.job-id")}},"exitCode":{{json .State.ExitCode}},"finishedAt":{{json .State.FinishedAt}}}'
BUDGET_PLAN_SHA='1f2b34b5bb93ae21a74f7d2af8a51bd3cb16d3ea7baa3b55a54481b5875f243c'
HOST_CASE=None
CONTINUATION_CONTEXT=None
CONTINUATION_HIGH_WATER=None
CONTINUATION_BROKER=None
CONTINUATION_EFFECT_RECEIPT=None
def continuation_model():
 source=pathlib.Path(__file__).with_name('continuation-budget.py');assert source.is_file() and source.resolve()==source and not source.is_symlink(),'CONTINUATION_HELPER_REQUIRED'
 spec=importlib.util.spec_from_file_location('cp024_continuation_budget',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
def configure_continuation(context):
 """Caller first authenticates Root admission and RO base; no publication here."""
 global CONTINUATION_CONTEXT
 assert CONTINUATION_CONTEXT is None and isinstance(context,dict) and set(context)=={'baseLedger','baseLedgerHash','admission','admissionHash'},'CONTINUATION_ALREADY_CONFIGURED_OR_INVALID'
 model=continuation_model();base=model.validate_base(context['baseLedger'],context['baseLedgerHash']);model.validate_admission(context['admission'],base,context['baseLedgerHash'])
 assert model.sha(model.canonical(context['admission']))==context['admissionHash'],'CONTINUATION_ADMISSION_HASH'
 import copy
 CONTINUATION_CONTEXT=copy.deepcopy(context)
def budget_directory():return ROOT/'budget/continuations/v2' if CONTINUATION_CONTEXT is not None else ROOT/'budget'
def runtime_directory():return ROOT/'master/continuations/v2/runtime' if CONTINUATION_CONTEXT is not None else ROOT/'staging'
def compose_path(root):
 if CONTINUATION_CONTEXT is None or root not in [ROOT,TARGET]:return root/'compose.json'
 return ROOT/'master/continuations/v2'/('source-compose.json' if root==ROOT else 'target-compose.json')
def is_continuation_readonly_input(path,destination,access):
 if CONTINUATION_CONTEXT is None:return False
 return access=='ro' and ((path==budget_authority_directory() and destination=='/run/qa-budget-authority') or (path==budget_directory() and destination=='/run/qa-budget') or (path==runtime_directory() and destination in ['/workspace','/run/qa-source-artifact']) or (path.is_relative_to(runtime_directory()) and destination=='/app'))
def runtime_overlay_context():
 assert CONTINUATION_CONTEXT is not None,'CONTINUATION_AUTHORITY_REQUIRED'
 bridge=target_bridge();overlay,oh=bridge.read_private(budget_authority_directory()/'runtime-overlay.json',0,262144,0o444);original,sh=bridge.read_private(budget_authority_directory()/'original-artifact.json',0,262144,0o444)
 assert oh==CONTINUATION_CONTEXT['admission']['runtimeHash'] and sh=='1e0027ea22dd103eb51d5e0e484a831a8369c3e44eaa46cc9717468159cfb622','CONTINUATION_RUNTIME_ANCHOR'
 return original,overlay,sh,oh
def validate_runtime_artifact(artifact,material):
 if CONTINUATION_CONTEXT is None:
  assert artifact['digest']=='sha256:'+material['artifactDigest'] and canonical_hash(artifact['entries'])==material['artifactDigest'],'RUNTIME_ARTIFACT_BINDING';return artifact
 original,overlay,sh,oh=runtime_overlay_context();source=pathlib.Path(__file__).with_name('runtime-overlay.py');spec=importlib.util.spec_from_file_location('cp024_root_overlay',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 assert material['artifactDigest']==overlay['originalArtifactDigest'],'CONTINUATION_ORIGINAL_ARTIFACT_CHANGED'
 module.validate_overlay(original,artifact,'5590432f06cc93eb7a0c8490ff2afb614eb7557bc688097c13cea9db96f885c6',overlay,sh,oh);return artifact
def derive_continuation_compose(spec):
 import copy
 out=copy.deepcopy(spec)
 if CONTINUATION_CONTEXT is None:return out
 assert spec.get('name') in [ROOT.name,TARGET.name],'CONTINUATION_COMPOSE_SCOPE'
 old=str(ROOT/'staging');new=str(runtime_directory())
 for name,service in out['services'].items():
  service['volumes']=[new+v[len(old):] if v.startswith(old+'/') or v.startswith(old+':') else v for v in service.get('volumes',[])]
  out['services'][name]=bind_budget_service(service)
 return out
def budget_authority_directory():
 assert CONTINUATION_CONTEXT is not None,'CONTINUATION_AUTHORITY_REQUIRED'
 return ROOT/'master/continuations/v2/runtime-authority'
def budget_environment():
 return {} if CONTINUATION_CONTEXT is None else {'QA_BUDGET_ATTEMPT':'v2','QA_BUDGET_ADMISSION_HASH':CONTINUATION_CONTEXT['admissionHash'],'QA_BUDGET_SOCKET':'/run/qa-budget/counter.sock','QA_BUDGET_ROOT_PID':str(os.getpid())}
def bind_budget_service(spec):
 """Pure spec derivation; never edits or re-publishes a sealed compose file."""
 import copy
 out=copy.deepcopy(spec)
 if CONTINUATION_CONTEXT is None:return out
 volumes=out.get('volumes',[]);old=str(ROOT/'budget')+':/run/qa-budget:rw';new=str(budget_directory())+':/run/qa-budget:ro';unbound=str(budget_directory())+':/run/qa-budget:rw'
 if old not in volumes and new not in volumes and unbound not in volumes:return out
 assert sum(x in [old,new,unbound] for x in volumes)==1,'CONTINUATION_BUDGET_MOUNT'
 out['volumes']=[new if v in [old,unbound] else v for v in volumes]
 authority=str(budget_authority_directory())+':/run/qa-budget-authority:ro'
 existing=[v for v in out['volumes'] if v.rsplit(':',2)[1]=='/run/qa-budget-authority'];assert not existing or existing==[authority],'CONTINUATION_AUTHORITY_DUPLICATE'
 if not existing:out['volumes'].append(authority)
 env=out.get('environment',{});assert isinstance(env,dict) and all(k not in env or env[k]==v for k,v in budget_environment().items()),'CONTINUATION_ENV_CONFLICT'
 out['environment']={**env,**budget_environment()}
 owner=out.get('labels',{}).get('mecanet.qa.owner-id')
 if owner:out['environment'].setdefault('QA_BUDGET_CLIENT',owner)
 return out
def continuation_args():
 assert CONTINUATION_CONTEXT is not None,'CONTINUATION_AUTHORITY_REQUIRED'
 c=CONTINUATION_CONTEXT;return c['baseLedger'],c['baseLedgerHash'],c['admission']
def track_continuation_progress(state):
 global CONTINUATION_HIGH_WATER
 if CONTINUATION_CONTEXT is None:return state
 model=continuation_model();model.validate(state,*continuation_args(),uptime())
 if CONTINUATION_HIGH_WATER is not None:model.validate_progress(CONTINUATION_HIGH_WATER,state)
 import copy
 CONTINUATION_HIGH_WATER=copy.deepcopy(state);return state
LIMITS_SHA='65cb46844d2b8a78250839ed14b25fca91561cfcdd7d46557ff5b98829f334c2'
_limits_path=pathlib.Path(__file__).with_name('budget-limits.json')
assert _limits_path.is_file() and not _limits_path.is_symlink() and _limits_path.stat().st_size<=1024,'BUDGET_LIMITS_FILE'
_limits_raw=_limits_path.read_bytes();assert hashlib.sha256(_limits_raw).hexdigest()==LIMITS_SHA,'BUDGET_LIMITS_HASH'
_limits=json.loads(_limits_raw)
CEILINGS=_limits['global']
CASE_LIMITS=_limits['case']
SCENARIO_COUNT=_limits['scenarioCount']
def continuation_effect_guard(args):
 # Local counter adaptation is not a consumer/Environment Gate. Until the
 # controller/overlay and all mounts are accredited, fail before new effects.
 # STOP/KEEP and passive Docker metadata remain available to positive cleanup.
 if CONTINUATION_CONTEXT is not None and args and args[0]=='docker':
  effect=len(args)>1 and (args[1] in ['create','start','exec'] or args[1]=='compose' and any(x in args[2:] for x in ['up','create','run','start','restart','exec']))
  if effect:
   assert CONTINUATION_EFFECT_RECEIPT is not None and CONTINUATION_BROKER is not None,'CONTINUATION_CONSUMERS_NOT_ACCREDITED'
   assert callable(getattr(CONTINUATION_EFFECT_RECEIPT,'check_live',None)) and CONTINUATION_EFFECT_RECEIPT.check_live() is True,'CONTINUATION_ROOT_CLAIM_REQUIRED'
   assert getattr(CONTINUATION_EFFECT_RECEIPT,'effect_ready',False) is True,'CONTINUATION_TRANSPORT_NOT_READY'
   CONTINUATION_BROKER.guard()
def register_continuation_start(args):
 if CONTINUATION_CONTEXT is None or len(args)!=3 or args[:2]!=('docker','start'):return
 actual=inspect_container(args[2]);service=actual.get('service')
 if service not in ['api1','api2','worker','harness','probe','controller-tool']:return
 assert actual['running'] is False and actual['pid']==0 and actual['status']=='created','BROKER_CREATED_CLIENT_REQUIRED'
 case=HOST_CASE;state=CONTINUATION_BROKER.current();scope=state['plannedScopes'].get(case);assert scope in ['source-window','target-window'],'BROKER_CLIENT_CASE_REQUIRED'
 uid=run('docker','inspect','--format','{{.Config.User}}',actual['id']).strip();assert uid in ['0:0','999:999'],'BROKER_CLIENT_UID'
 client=actual.get('jobId') or actual['ownerId'];allowed=[case]
 cmd=json.loads(run('docker','inspect','--format','{{json .Config.Cmd}}',actual['id']))
 if isinstance(cmd,list) and 'tests/qa/cp019/runtime-driver.mjs' in cmd and 'source-live' in cmd:allowed+=['source-close-admission']
 CONTINUATION_BROKER.register(client,{'containerId':actual['id'],'project':actual['project'],'service':service,'ownerId':actual['ownerId'],'uid':int(uid.split(':')[0]),'scope':scope,'case':case,'allowedEnterCases':allowed})
def run(*args):
 continuation_effect_guard(args);register_continuation_start(args);return subprocess.check_output(args,text=True,timeout=40)
def run_bounded(*args,timeout):
 continuation_effect_guard(args);return subprocess.check_output(args,text=True,timeout=timeout,stderr=subprocess.DEVNULL)
def material_owned():
 own();p=ROOT/'master/material.json';ref=json.loads((ROOT/'master/material-ref.json').read_text())
 assert p.resolve()==p and not p.is_symlink() and p.stat().st_size<=262144,'MATERIAL_PATH'
 b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==ref['materialHash'],'MATERIAL_HASH'
 m=json.loads(b);assert m['source']['project']==ROOT.name and m['target']['project']==TARGET.name,'MATERIAL_PROJECT'
 return m
def expected_owners():
 if not ((ROOT/'master/material.json').exists() and (ROOT/'master/material-ref.json').exists()):return {r.name:{'controller-tool':'pre-material'} for r in [ROOT,TARGET]}
 m=material_owned();out={}
 for side,r in [('source',ROOT),('target',TARGET)]:
  c=m[side];out[r.name]={'postgres':m['controllerOwner'],'api1':c['apiOwners']['api1'],'api2':c['apiOwners']['api2'],'worker':c['workerClockOwner'],'web':c['webOwner'],'harness':m['controllerOwner'],'probe':m['controllerOwner'],'controller-tool':m['controllerOwner'],'offline-pg':m['controllerOwner']}
 out[TARGET.name]['worker']=target_bridge().expected_target_worker_owner(sys.modules.get(__name__) or types.SimpleNamespace(**globals()),m)
 return out
def target_bridge():
 source=pathlib.Path(__file__).with_name('target-host.py');assert source.is_file() and source.resolve()==source and not source.is_symlink(),'TARGET_BRIDGE_REQUIRED'
 if (runtime_directory()/'artifact.json').exists():
  manifest=json.loads((runtime_directory()/'artifact.json').read_bytes());entries=[x for x in manifest['entries'] if x['path']=='tests/qa/cp019/target-host.py']
  assert len(entries)==1 and hashlib.sha256(source.read_bytes()).hexdigest()==entries[0]['sha256'],'TARGET_BRIDGE_PROVENANCE'
 spec=importlib.util.spec_from_file_location('cp020_target_host',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
def target_dispatch(action,args):
 fixed={'target-pg-start':'target_pg_start','target-resource':'target_resource','target-copy':'target_copy','target-prepare':'target_prepare','target-stop':'stop_runtime','target-end':'target_end','target-worker-restart':'worker_restart'}
 assert action in set(fixed)|{'target-phase','target-runtime-start','target-acceptance'},'TARGET_ACTION'
 if action=='target-phase':assert len(args)==2 and args[0] in ['begin-enroll','rotate','canary','configure','clock-plan','post-worker-verify','promotion','activation','abort-close','abort-local','abort-finish','clock-restart-plan','clock-restart-record','promote-fault'] and args[1] in ['run','configs'] and (args[1]!='configs' or args[0]=='clock-plan'),'TARGET_ACTION_ARGS'
 elif action=='target-runtime-start':assert len(args)==1 and args[0] in ['worker','business'],'TARGET_ACTION_ARGS'
 elif action=='target-acceptance':assert len(args)==1 and args[0] in ['target-history','target-write','target-negatives'],'TARGET_ACTION_ARGS'
 else:assert not args,'TARGET_ACTION_ARGS'
 bridge=target_bridge();host=sys.modules.get(__name__) or types.SimpleNamespace(**globals());method=fixed.get(action,{'target-phase':'phase','target-runtime-start':'runtime_start','target-acceptance':'acceptance'}.get(action));return getattr(bridge,method)(host,*args)
def guard_main_resources(current,future,owners):
 """Validate actual OWN Docker limits and project identities before projecting effects."""
 projects={ROOT.name,TARGET.name};running={};seen=set()
 for c in current:
  if c.get('project') not in projects:continue
  p,s=c['project'],c.get('service');key=(p,s)
  assert s in PROFILES and key not in seen,'OWN_SERVICE_OR_DUPLICATE';seen.add(key)
  assert c.get('ownerId')==owners.get(p,{}).get(s) and c.get('ownerId') is not None,'OWN_OWNER_MISMATCH'
  assert (c.get('nanoCpus'),c.get('memory'),c.get('imageRef'))==PROFILES[s],'OWN_PROFILE_MISMATCH'
  if c['running']:running[key]=(c['nanoCpus'],c['memory'])
 added=set()
 for root,s in future:
  assert root in [ROOT,TARGET] and s in PROFILES and (root.name,s) not in added,'FUTURE_PROFILE'
  assert s in owners.get(root.name,{}),'OWN_OWNER_REQUIRED';added.add((root.name,s))
  running.setdefault((root.name,s),PROFILES[s][:2])
 assert sum(s=='postgres' for _,s in running)<=1,'MULTIPLE_PG'
 assert len({p for p,s in running if s in BUSINESS|{'postgres','harness','probe'}})<=1,'COHORT_CONFLICT'
 if any(s in {'harness','probe'} for _,s in running):assert sum(s=='postgres' for _,s in running)==1,'PG_REQUIRED'
 if any(s in {'harness','controller-tool'} for _,s in running):assert not any(s in BUSINESS for _,s in running),'BUSINESS_ACTIVE'
 if any(s=='offline-pg' for _,s in running):assert not any(s in BUSINESS|{'postgres'} for _,s in running),'OFFLINE_PG_ACTIVE'
 if any(owners[p].get(s)=='pre-material' for p,s in running):assert not any(c.get('running') and c.get('project') in projects for c in current),'PRE_MATERIAL_RUNNING'
 cpu=sum(x[0] for x in running.values());mem=sum(x[1] for x in running.values())
 assert cpu<=1_000_000_000 and mem<=2048*1024**2,'CP019_AGGREGATE_LIMIT'
 return {'nanoCpus':cpu,'memoryMiB':mem//1024**2,'postgresCount':sum(s=='postgres' for _,s in running),'physicalCapacityVerified':False}
def auxiliary_bridge(name):
 assert name in ['target-http-host.py','target-probes-host.py','target-commit-host.py','target-cold-host.py'],'AUX_BRIDGE_NAME'
 source=runtime_directory()/'tests/qa/cp019'/name;assert source.is_file() and source.resolve()==source and not source.is_symlink(),'AUX_BRIDGE_REQUIRED'
 artifact=json.loads((runtime_directory()/'artifact.json').read_bytes());entries=[e for e in artifact['entries'] if e['path']=='tests/qa/cp019/'+name];assert len(entries)==1 and source.stat().st_size==entries[0]['bytes'] and hashlib.sha256(source.read_bytes()).hexdigest()==entries[0]['sha256'],'AUX_BRIDGE_PROVENANCE'
 sys.dont_write_bytecode=True;spec=importlib.util.spec_from_file_location('cp021_'+name.replace('-','_').replace('.py',''),source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def http_bridge():return auxiliary_bridge('target-http-host.py')
def probes_bridge():return auxiliary_bridge('target-probes-host.py')
def commit_bridge():return auxiliary_bridge('target-commit-host.py')
def cold_bridge():return auxiliary_bridge('target-cold-host.py')

def variant_bridge():
 source=pathlib.Path(__file__).with_name('target-variant-host.py');assert source.is_file() and source.resolve()==source and not source.is_symlink(),'VARIANT_BRIDGE_REQUIRED'
 if (runtime_directory()/'artifact.json').exists():
  artifact=json.loads((runtime_directory()/'artifact.json').read_bytes());entries=[e for e in artifact['entries'] if e['path']=='tests/qa/cp019/target-variant-host.py'];assert len(entries)==1 and hashlib.sha256(source.read_bytes()).hexdigest()==entries[0]['sha256'],'VARIANT_BRIDGE_PROVENANCE'
 spec=importlib.util.spec_from_file_location('cp021_variant_host',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def readiness_bridge():
 source=pathlib.Path(__file__).with_name('target-readiness-host.py');assert source.is_file() and source.resolve()==source and not source.is_symlink(),'READINESS_BRIDGE_REQUIRED'
 if (runtime_directory()/'artifact.json').exists():
  artifact=json.loads((runtime_directory()/'artifact.json').read_bytes());entries=[e for e in artifact['entries'] if e['path']=='tests/qa/cp019/target-readiness-host.py'];assert len(entries)==1 and hashlib.sha256(source.read_bytes()).hexdigest()==entries[0]['sha256'],'READINESS_BRIDGE_PROVENANCE'
 spec=importlib.util.spec_from_file_location('cp021_readiness_host',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def verify_main_target_references(current):
 targets=[c for c in current if c.get('project')==TARGET.name]
 if not targets:return True
 bridge=target_bridge();m=material_owned();jobs=None
 for c in targets:
  if c.get('project')!=TARGET.name:continue
  service=c.get('service');cid=c.get('id');assert re.fullmatch('[0-9a-f]{64}',cid or ''),'MAIN_TARGET_CID'
  if service=='postgres':
   ref,_=bridge.read400(TARGET/'master/postgres-created.json',0);assert ref.get('schema')=='target-postgres-created-v1' and ref.get('generation')==m['target']['generation'] and ref.get('recoveryId')==m['recoveryId'] and ref.get('dataPath')==str(TARGET/'data') and ref.get('state')=='CREATED BEFORE START/SQL','MAIN_TARGET_PG_REFERENCE'
   pairs={'id':'containerId','project':'project','service':'service','ownerId':'ownerId','imageRef':'imageRef','nanoCpus':'nanoCpus','memory':'memory'}
  elif service in BUSINESS:
   inv,_=bridge.read400(TARGET/'master/runtime-created.json',0);row=inv.get('services',{}).get(service);assert row and row['containerId']==cid,'MAIN_TARGET_RUNTIME_REFERENCE';ref,rh=bridge.read400(TARGET/'master/runtime'/(service+'-'+cid+'-created.json'),0);assert rh==row['createdReceiptHash'] and ref.get('generation')==m['target']['generation'] and ref.get('runId')==m['recoveryId'],'MAIN_TARGET_RUNTIME_REFERENCE';pairs={'id':'containerId','project':'project','service':'service','ownerId':'ownerId'}
  else:
   if jobs is None:
    jobs=[]
    for path in (TARGET/'evidence/jobs').glob('*-created.json'):
     body,bh=bridge.read400(path,0)
     if body.get('schema')=='controller-job-created-v1':jobs.append(body)
   refs=[r for r in jobs if r.get('containerId')==cid];assert len(refs)==1,'MAIN_TARGET_JOB_REFERENCE';ref=refs[0];pairs={'id':'containerId','project':'project','service':'service','ownerId':'ownerId','jobId':'jobId'}
  assert all(c.get(k)==ref.get(v) for k,v in pairs.items()),'MAIN_TARGET_REFERENCE_CHANGED'
 return True

def guard_resources(current,future,owners):
 if (TARGET/'variants').exists():
  def main_checked(rows,planned,expected):
   verify_main_target_references(rows);return guard_main_resources(rows,planned,expected)
  return variant_bridge().guard_all(sys.modules.get(__name__) or types.SimpleNamespace(**globals()),current,future,owners,main_checked)
 result=guard_main_resources(current,future,owners);verify_main_target_references(current);return result

def guard_effect(root,services):
 own(root);preserve();resources();return guard_resources(facts(),[(root,s) for s in services],expected_owners())
def syncdir(d):
 fd=os.open(d,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def uptime():return float(pathlib.Path('/proc/uptime').read_text().split()[0])
def validate_registry(plan):
 assert set(plan)=={'schema','project','plannedScenarios','plannedScopes','activeScenarios'} and plan['schema']=='cp019-budget-plan-v1' and plan['project']==ROOT.name,'BUDGET_PLAN'
 assert len(plan['plannedScenarios'])==SCENARIO_COUNT and set(plan['plannedScopes'])==set(plan['plannedScenarios']) and all(v==CASE_LIMITS for v in plan['plannedScenarios'].values()),'BUDGET_REGISTRY'
 assert set(plan['activeScenarios'])=={'source-window','target-window'} and all(plan['plannedScopes'].get(v)==k for k,v in plan['activeScenarios'].items()),'BUDGET_ACTIVE'
 return plan
def read_budget_plan():
 p=pathlib.Path('/tmp/mecanet-cp022-budget-plan.json');assert p.is_file() and p.resolve()==p and not p.is_symlink() and p.stat().st_size<=262144,'BUDGET_PLAN_PATH'
 raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==BUDGET_PLAN_SHA,'BUDGET_PLAN_HASH';plan=validate_registry(json.loads(raw))
 return plan
def initialize_budget(plan):
 validate_registry(plan)
 ledger=ROOT/'budget/ledger.json';assert not ledger.exists() and not ledger.is_symlink(),'BUDGET_EXISTS'
 state={**plan,'schema':'cp019-budget-v1','startedUptime':uptime(),'sequence':0,'total':dict.fromkeys(CEILINGS,0),'scenarios':{}}
 fd=os.open(ledger,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(json.dumps(state,separators=(',',':')).encode());os.fchown(f.fileno(),999,999);os.fsync(f.fileno())
 syncdir(ledger.parent)
def budget_update(state,scenario,kind,amount,now):
 if CONTINUATION_CONTEXT is not None:return continuation_model().update(state,*continuation_args(),scenario,now,kind=kind,amount=amount)
 assert scenario in state.get('plannedScenarios',{}) and kind in CEILINGS and isinstance(amount,int) and not isinstance(amount,bool) and amount>0,'CP019_BUDGET_ABORT'
 assert state.get('schema')=='cp019-budget-v1' and state.get('project')==ROOT.name and 0<=now-state['startedUptime']<=1800,'CP019_BUDGET_ABORT'
 assert set(state['total'])==set(CEILINGS) and all(isinstance(v,int) and not isinstance(v,bool) and v>=0 for v in state['total'].values()),'CP019_BUDGET_ABORT'
 planned=state['plannedScenarios'][scenario];assert planned==CASE_LIMITS,'CP019_BUDGET_ABORT'
 case=state['scenarios'].setdefault(scenario,{'startedUptime':now,'limits':planned,'total':dict.fromkeys(CEILINGS,0)})
 assert case['limits']==planned and 0<=now-case['startedUptime']<=45,'CP019_BUDGET_ABORT'
 assert set(case['total'])==set(CEILINGS) and all(isinstance(v,int) and not isinstance(v,bool) and v>=0 for v in case['total'].values()),'CP019_BUDGET_ABORT'
 assert state['total'][kind]+amount<=CEILINGS[kind] and case['total'][kind]+amount<=planned[kind],'CP019_BUDGET_ABORT'
 state['total'][kind]+=amount;case['total'][kind]+=amount;state['sequence']+=1
 return state
def ledger_charge(kind,amount=1,scenario=None):
 scenario=scenario or HOST_CASE;assert scenario,'HOST_CASE_REQUIRED'
 return ledger_mutate(lambda state:budget_update(state,scenario,kind,amount,uptime()))
def budget_enter(state,scope,name,now):
 if CONTINUATION_CONTEXT is not None:return continuation_model().update(state,*continuation_args(),name,now,scope=scope)
 assert state.get('schema')=='cp019-budget-v1' and state.get('project')==ROOT.name and 0<=now-state['startedUptime']<=1800,'CP019_BUDGET_ABORT'
 assert scope in ['source-window','target-window'] and scope in state.get('activeScenarios',{}) and state.get('plannedScopes',{}).get(name)==scope and state.get('plannedScenarios',{}).get(name)==CASE_LIMITS,'BUDGET_RUNTIME_SCOPE'
 assert set(state['total'])==set(CEILINGS) and all(type(v) is int and 0<=v<=CEILINGS[k] for k,v in state['total'].items()),'CP019_BUDGET_ABORT'
 case=state['scenarios'].get(name)
 if case is not None:assert case['limits']==CASE_LIMITS and 0<=now-case['startedUptime']<=45 and set(case['total'])==set(CEILINGS) and all(type(v) is int and 0<=v<=CASE_LIMITS[k] for k,v in case['total'].items()),'CP019_BUDGET_ABORT'
 state['activeScenarios'][scope]=name;state['sequence']+=1;return state
def enter_runtime_case(scope,name):
 return ledger_mutate(lambda state:budget_enter(state,scope,name,uptime()))
def ledger_mutate(mutator):
 if CONTINUATION_CONTEXT is not None and CONTINUATION_BROKER is not None:return CONTINUATION_BROKER.root_update(mutator)
 p=budget_directory()/'ledger.json';assert p.is_file() and p.resolve()==p and not p.is_symlink(),'BUDGET_LEDGER_REQUIRED'
 lock=pathlib.Path(str(p)+'.lock');fd=None;temporary=None
 for _ in range(40):
  try:fd=os.open(lock,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);break
  except FileExistsError:time.sleep(.005)
 assert fd is not None,'BUDGET_LOCK_BUSY' # Never remove another actor's lock by age.
 try:
  assert p.stat().st_size<=262144,'BUDGET_LEDGER_SIZE'
  state=mutator(track_continuation_progress(json.loads(p.read_bytes())))
  temporary=p.parent/('.ledger.'+secrets.token_hex(16)+'.tmp');out=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(out,'wb') as f:f.write(json.dumps(state,separators=(',',':')).encode());os.fchown(f.fileno(),999,999);os.fsync(f.fileno())
  os.replace(temporary,p);temporary=None;syncdir(p.parent);return track_continuation_progress(state)
 finally:
  if temporary is not None:temporary.unlink()
  os.close(fd);lock.unlink()
def set_host_case(name):
 global HOST_CASE
 HOST_CASE=name
def read_budget_snapshot():
 """Read one complete UID999 ledger across bounded atomic-replace races."""
 if CONTINUATION_CONTEXT is not None and CONTINUATION_BROKER is not None:return track_continuation_progress(CONTINUATION_BROKER.root_snapshot())
 p=budget_directory()/'ledger.json';assert p.resolve()==p and p.parent.resolve()==p.parent,'BUDGET_LEDGER_REQUIRED'
 def identity(s):return s.st_dev,s.st_ino
 def metadata(s):return identity(s)+(s.st_mode,s.st_uid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
 def private(s):return stat.S_ISREG(s.st_mode) and s.st_uid==999 and s.st_mode&0o777==0o600 and s.st_nlink==1 and 2<=s.st_size<=262144
 for _ in range(3):
  before=p.lstat();assert private(before),'BUDGET_LEDGER_PRIVATE'
  fd=os.open(p,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
  try:
   first=os.fstat(fd)
   if identity(first)!=identity(before):continue
   with os.fdopen(fd,'rb',closefd=False) as stream:raw=stream.read(262145)
   after=os.fstat(fd);named=p.lstat()
   if identity(named)!=identity(first):continue
   assert private(first) and private(after) and private(named) and metadata(before)==metadata(first)==metadata(after)==metadata(named) and len(raw)==after.st_size,'BUDGET_LEDGER_CHANGED'
   return track_continuation_progress(json.loads(raw))
  finally:os.close(fd)
 raise AssertionError('BUDGET_LEDGER_REPLACE_BUSY')
def validate_budget_remaining(state,scenario,now,maximum=45):
 """Validate existing authority and clocks without opening or charging a case."""
 if CONTINUATION_CONTEXT is not None:return continuation_model().remaining(state,*continuation_args(),scenario,now,maximum)
 assert type(maximum) in [int,float] and math.isfinite(maximum) and 0<maximum<=_limits['caseSeconds'],'CP019_BUDGET_ABORT'
 assert isinstance(state,dict) and set(state)=={'schema','project','plannedScenarios','plannedScopes','activeScenarios','startedUptime','sequence','total','scenarios'} and state['schema']=='cp019-budget-v1' and state['project']==ROOT.name,'CP019_BUDGET_ABORT'
 plan={k:state[k] for k in ['project','plannedScenarios','plannedScopes']};plan.update(schema='cp019-budget-plan-v1',activeScenarios={'source-window':'source-runtime-start','target-window':'target-runtime-start'})
 validate_registry(plan);assert canonical_hash(plan)==BUDGET_PLAN_SHA,'BUDGET_PLAN_HASH'
 assert scenario in state['plannedScenarios'] and state['plannedScopes'][scenario] in ['source-window','target-window'] and set(state['activeScenarios'])=={'source-window','target-window'} and all(state['plannedScopes'].get(v)==k for k,v in state['activeScenarios'].items()),'BUDGET_RUNTIME_SCOPE'
 numeric=lambda value:type(value) in [int,float] and math.isfinite(value)
 assert numeric(now) and numeric(state['startedUptime']) and state['startedUptime']>=0 and 0<=now-state['startedUptime']<_limits['cohortSeconds'] and type(state['sequence']) is int and state['sequence']>=0,'CP019_BUDGET_ABORT'
 def totals(values,caps):return isinstance(values,dict) and set(values)==set(caps) and all(type(v) is int and 0<=v<=caps[k] for k,v in values.items())
 assert totals(state['total'],CEILINGS) and isinstance(state['scenarios'],dict) and set(state['scenarios'])<=set(state['plannedScenarios']),'CP019_BUDGET_ABORT'
 for case in state['scenarios'].values():
  assert isinstance(case,dict) and set(case)=={'startedUptime','limits','total'} and case['limits']==CASE_LIMITS and totals(case['total'],CASE_LIMITS) and numeric(case['startedUptime']) and state['startedUptime']<=case['startedUptime']<=now,'CP019_BUDGET_ABORT'
 assert all(sum(c['total'][k] for c in state['scenarios'].values())==v for k,v in state['total'].items()),'CP019_BUDGET_ABORT'
 remaining=min(maximum,_limits['cohortSeconds']-(now-state['startedUptime']));case=state['scenarios'].get(scenario)
 if case is not None:remaining=min(remaining,_limits['caseSeconds']-(now-case['startedUptime']))
 assert remaining>0,'CP019_BUDGET_ABORT';return remaining
def remaining_case_seconds(maximum=45):return validate_budget_remaining(read_budget_snapshot(),HOST_CASE,uptime(),maximum)
def assert_case_budget():return remaining_case_seconds()
BROWSER_CAPS={'browser-login':(24,1),'browser-history':(24,0),'browser-product':(6,0),'browser-receipt':(8,0),'browser-reload':(24,0),'browser-replay':(4,5),'browser-denials':(4,0)}
def validate_browser_request(req,reference,expected_sequence):
 keys={'type','schema','sequence','caseName','project','sourceSha','artifactDigest','configHash','invocationId','reserveHttp','reserveArtifacts'}
 assert isinstance(req,dict) and set(req)==keys and req['type']=='cp020-browser-gate' and req['schema']=='cp020-browser-gate-v1','BROWSER_GATE_REQUEST'
 assert type(req['sequence']) is int and req['sequence']==expected_sequence and 1<=expected_sequence<=len(BROWSER_CAPS) and req['caseName']==list(BROWSER_CAPS)[expected_sequence-1],'BROWSER_GATE_ORDER'
 assert req['project']==TARGET.name and all(req[k]==reference[k] for k in ['project','sourceSha','artifactDigest','configHash','invocationId']),'BROWSER_GATE_BINDING'
 assert type(req['reserveHttp']) is int and type(req['reserveArtifacts']) is int and (req['reserveHttp'],req['reserveArtifacts'])==BROWSER_CAPS[req['caseName']],'BROWSER_GATE_CAPS'
 return req
def browser_gate_encoded(raw):
 assert isinstance(raw,str) and re.fullmatch('[A-Za-z0-9_-]{1,4096}={0,2}',raw),'BROWSER_GATE_ENCODING'
 request=json.loads(base64.urlsafe_b64decode(raw).decode('utf-8'));return browser_gate(request)
def browser_gate(request):
 bridge=target_bridge();host=sys.modules.get(__name__) or types.SimpleNamespace(**globals());m,base,bindings=bridge.bundle_context(host)
 reference,_=bridge.read400(TARGET/'master/browser-config-ref.json',0)
 assert reference.get('schema')=='cp020-browser-reference-v1' and reference['custodyHash']==canonical_hash(m) and reference['configBundleHash']==bindings['configBundleHash'] and reference['sourceSha']==bindings['sourceSha'] and reference['artifactDigest']==m['artifactDigest'] and reference['generation']==m['target']['generation'] and reference['runId']==m['recoveryId'],'BROWSER_REFERENCE'
 directory=TARGET/'evidence/browser-gates';names=sorted(p.name for p in directory.iterdir()) if directory.exists() else []
 assert names==['gate-'+str(i).zfill(2)+'.json' for i in range(1,len(names)+1)],'BROWSER_GATE_HISTORY'
 validate_browser_request(request,reference,len(names)+1);set_host_case(request['caseName']);enter_runtime_case('target-window',request['caseName'])
 bridge.own_current(host);inventory=bridge.runtime_inventory(host,m,base,bindings);assert set(inventory['services'])==BUSINESS,'BROWSER_RUNTIME_REQUIRED'
 current=facts();guard_resources(current,[],expected_owners())
 for name,row in inventory['services'].items():
  actual=inspect_container(row['containerId']);assert actual['service']==name and owned_identity(actual,expected_owners()) and actual['running'] and actual['ownerId']==row['ownerId'],'BROWSER_RUNTIME_CHANGED'
 activation,_=bridge.read400(TARGET/'evidence/target-activation.json');bridge.validate_runtime_receipt(activation,m,base,bindings,'activation')
 ledger_charge('http',request['reserveHttp'])
 if request['reserveArtifacts']:ledger_charge('artifactFiles',request['reserveArtifacts'])
 if not directory.exists():directory.mkdir(mode=0o700);syncdir(directory.parent)
 assert directory.resolve()==directory and not directory.is_symlink() and directory.stat().st_uid==0 and directory.stat().st_mode&0o777==0o700,'BROWSER_GATE_DIRECTORY'
 immutable(directory/('gate-'+str(request['sequence']).zfill(2)+'.json'),{'schema':'cp020-browser-gate-record-v1','request':request,'referenceHash':canonical_hash(reference)},0o400)
 p=budget_directory()/'ledger.json';assert p.resolve()==p and not p.is_symlink() and p.stat().st_size<=262144,'BROWSER_LEDGER';raw=p.read_bytes();state=json.loads(raw);case=state['scenarios'][request['caseName']];remaining=int(1000*min(45-(uptime()-case['startedUptime']),1800-(uptime()-state['startedUptime'])))
 assert state['activeScenarios']['target-window']==request['caseName'] and 0<remaining<=45000,'BROWSER_GATE_DEADLINE'
 return {**request,'type':'cp020-browser-gate-ack','schema':'cp020-browser-gate-ack-v1','scope':'target-window','activeCase':request['caseName'],'chargedHttp':request['reserveHttp'],'chargedArtifacts':request['reserveArtifacts'],'ledgerSequence':state['sequence'],'ledgerHash':hashlib.sha256(raw).hexdigest(),'remainingMs':remaining}
def immutable(path,value,mode=0o600):
 assert (path.is_relative_to(ROOT) or path.is_relative_to(TARGET)) and path.parent.resolve()==path.parent and not path.is_symlink(),'OWN_IMMUTABLE_PATH'
 b=json.dumps(value,separators=(',',':'),sort_keys=True).encode() if not isinstance(value,bytes) else value
 assert len(b)<=262144
 assert not path.exists() and not path.is_symlink(),'IMMUTABLE_EXISTS'
 ledger_charge('artifactFiles')
 temp=path.parent/('.'+path.name+'.'+secrets.token_hex(16)+'.tmp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as h:h.write(b);h.flush();os.fchmod(h.fileno(),mode);os.fsync(h.fileno())
 os.link(temp,path);syncdir(path.parent);temp.unlink();syncdir(path.parent)
 return hashlib.sha256(b).hexdigest()
def facts():
 ids=run('docker','ps','-aq').split()
 return [json.loads(s) for s in run('docker','inspect','--format',FACTS_FORMAT,*ids).splitlines()] if ids else []
def inspect_container(cid):
 assert re.fullmatch('[0-9a-f]{64}',cid),'OWN_CID_REQUIRED'
 c=json.loads(run('docker','inspect','--format',FACTS_FORMAT,cid));assert c['id']==cid,'OWN_CID_MISMATCH';return c
def owned_identity(c,owners):
 p,s=c.get('project'),c.get('service')
 return p in [ROOT.name,TARGET.name] and isinstance(s,str) and s in PROFILES and isinstance(c.get('id'),str) and re.fullmatch('[0-9a-f]{64}',c['id']) is not None and type(c.get('running')) is bool and type(c.get('nanoCpus')) is int and type(c.get('memory')) is int and c.get('ownerId') is not None and c.get('ownerId')==owners.get(p,{}).get(s) and (c.get('nanoCpus'),c.get('memory'),c.get('imageRef'))==PROFILES[s]
def resources():
 global RESOURCE_LAST_SAMPLE,RESOURCE_FIRST_REJECTED_SAMPLE
 mem=int(next(x for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')).split()[1])//1024
 disk=os.statvfs('/');free=disk.f_bavail*disk.f_frsize
 cpu=lambda:list(map(int,pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
 started=time.monotonic();a=cpu();time.sleep(2);b=cpu();ended=time.monotonic();d=[y-x for x,y in zip(a,b)]
 valid=len(a)==len(b)==8 and all(v>=0 for v in a+b+d) and sum(d)>0
 busy=100*(1-(d[3]+d[4])/sum(d)) if valid else None
 RESOURCE_LAST_SAMPLE=resource_diagnostics.describe('admission',observed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='microseconds').replace('+00:00','Z'),monotonic_seconds=ended,interval_seconds=ended-started,cpu_busy=busy,cpu_before=a,cpu_after=b,available_mib=mem,disk_free_bytes=free,disk_total_bytes=disk.f_blocks*disk.f_frsize,own_usage=resource_diagnostics.process_usage(_resource_api))
 if RESOURCE_LAST_SAMPLE['firstViolation'] and RESOURCE_FIRST_REJECTED_SAMPLE is None:
  code='CP019_RESOURCE_SAMPLE_UNKNOWN' if busy is None else 'CP019_DISK_FOOTPRINT_ABORT' if RESOURCE_LAST_SAMPLE['violations']==['ADMISSION_DISK_FOOTPRINT_LIMIT'] else 'CP019_RESOURCE_ABORT'
  RESOURCE_FIRST_REJECTED_SAMPLE={'guardCode':code,'specificReason':RESOURCE_LAST_SAMPLE['firstViolation'],'sample':json.loads(json.dumps(RESOURCE_LAST_SAMPLE,allow_nan=False))}
 assert busy is not None,'CP019_RESOURCE_SAMPLE_UNKNOWN'
 assert mem-2048>=3072 and busy<80 and free>max(15*1024**3,disk.f_blocks*disk.f_frsize*.1),'CP019_RESOURCE_ABORT'
 # Reserve the maximum source, backup, target, WAL/logs plus margin before creation.
 assert free>3*2*1024**3+2*512*1024**2+160*1024**2+2*1024**3,'CP019_DISK_FOOTPRINT_ABORT'
 return {'availableMiB':mem,'diskFreeBytes':free,'cpuBusyPercent':round(busy,2),'sampleSeconds':2,'generalCapacityVerified':False}
def tls_preflight(private_bytes=False):
 # Validate independent credentials and TLS capability before own roots or keys.
 # Certificates are generated outside the VPS; pinned Node need not contain a CLI.
 source=pathlib.Path(__file__).with_name('tls_bundle.py')
 assert source.is_file() and not source.is_symlink() and source.resolve()==source,'TLS_VERIFIER_REQUIRED'
 spec=importlib.util.spec_from_file_location('cp019_tls_bundle',source)
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 root=pathlib.Path('/tmp/mecanet-cp022-tls')
 if private_bytes:return module.load_bundle(root,(ROOT.name,TARGET.name),expected_uid=0)
 return module.validate_bundle(root,(ROOT.name,TARGET.name),expected_uid=0)
def preflight():
 assert os.geteuid()==0 and os.uname().machine=='aarch64'
 assert ROOT.resolve()==ROOT and TARGET.resolve()==TARGET and not ROOT.exists() and not TARGET.exists(),'CP019_TARGET_EXISTS'
 tls=tls_preflight()
 before=facts();assert all(not c['running'] for c in before if (c.get('project') or '').startswith('mecanet-qa')),'PRIOR_QA_ACTIVE'
 ids=run('docker','network','ls','-q').split();nets=json.loads(run('docker','network','inspect',*ids)) if ids else []
 proposed=[ipaddress.ip_network('10.77.'+n+'.0/24') for n in ['64','65','66']]
 for net in nets:
  assert net['Name'] not in [ROOT.name+'-data',ROOT.name+'-front',TARGET.name+'-data',TARGET.name+'-front'],'OWN_NETWORK_EXISTS'
  for c in net.get('IPAM',{}).get('Config') or []:
   if c.get('Subnet'):
    actual=ipaddress.ip_network(c['Subnet']);assert not any(actual.version==p.version and actual.overlaps(p) for p in proposed),'NETWORK_CONFLICT'
 for image,digest in PINS.items():assert run('docker','image','inspect','--format','{{.Architecture}}',image+'@sha256:'+digest).strip()=='arm64','PIN_ARCH_MISMATCH'
 return {'result':'PASS','time':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'base':BASE,'approval':APPROVAL,'architecture':'aarch64','resources':resources(),'consumers':before,'tlsInputs':tls,'publicTcpCreated':False,'productionData':False}
def own(root=ROOT):
 assert root in [ROOT,TARGET] and root.resolve()==root and not root.is_symlink() and os.geteuid()==0
 o=json.loads((root/'owner.json').read_text());assert o['project']==root.name and o['owner']=='SrEdgarR/MECANET' and o['approval']==APPROVAL and o['base']==BASE
 return o
def preserve():
 own();before=json.loads((ROOT/'evidence/preflight.json').read_text())['consumers'];now=facts()
 assert all(c in now for c in before),'OTHER_CONSUMER_CHANGED'
 return {'result':'PASS','preservedOtherConsumers':len(before)}
def compose(root,*args):
 own(root)
 if args and args[0] in ['up','start','restart','run']:
  selected=[s for s in args[1:] if s in PROFILES];assert selected,'EXPLICIT_SERVICES_REQUIRED'
  guard_effect(root,selected)
  assert_case_budget()
 return run('docker','compose','-f',str(compose_path(root)),*args)
def write_plain(path,b,mode=0o600,uid=None):
 immutable(path,b if isinstance(b,bytes) else b.encode(),mode)
 if uid is not None:
  os.chown(path,uid,uid)
  with path.open('rb') as f:os.fsync(f.fileno())
  syncdir(path.parent)
def job_command(root,profile,command,environment=None,mounts=(),network=None):
 assert root in [ROOT,TARGET] and profile in ['harness','probe','controller-tool','offline-pg'] and isinstance(command,list) and command,'JOB_SCOPE'
 env=dict(environment or {});assert set(env)<={'QA_PROJECT','QA_STAGE','QA_CODE_SHA','QA_INVOCATION_ID','QA_HOST_GATE','QA_READY_FILE','QA_BUSINESS_GATE','QA_FIXTURE_DONE','QA_SOURCE_STOP_GATE'},'JOB_ENV_SCOPE'
 assert env.get('QA_PROJECT',root.name)==root.name,'JOB_PROJECT';env['QA_PROJECT']=root.name
 volumes=[];user='0:0' if profile=='controller-tool' else '999:999'
 if profile in ['harness','probe']:
  config=json.loads(compose_path(root).read_text());service=config['services'][profile];volumes=service['volumes'];assert service['user']=='999:999' and not service.get('ports'),'JOB_SERVICE_BOUNDARY';network=root.name+'-data'
 elif profile=='controller-tool':volumes=[str(runtime_directory())+':/workspace:ro'];network=network or 'none'
 else:assert not mounts,'OFFLINE_MOUNTS_FIXED';volumes=[str(root/'data')+':/data:ro'];network='none'
 if command in [['node','tests/qa/cp019/target-prepare.mjs',a] for a in ['copy-before-target','assemble']]+[['node','tests/qa/cp019/'+n+'.mjs'] for n in ['copy-negatives','journal-negatives']]:
  assert root==TARGET and profile=='controller-tool' and network=='none' and all((not pathlib.Path(src).is_relative_to(ROOT/'master') and not pathlib.Path(src).is_relative_to(TARGET/'master')) or is_continuation_readonly_input(pathlib.Path(src),dst,access) for src,dst,access in mounts),'COPY_JOB_BOUNDARY'
  user='999:999'
 assert network in ['none',root.name+'-data'],'JOB_NETWORK'
 for src,dst,mode in mounts:
  src=pathlib.Path(src);assert src.resolve()==src and (src.is_relative_to(ROOT) or src.is_relative_to(TARGET)) and mode in ['ro','rw'] and dst.startswith('/run/'),'JOB_MOUNT';volumes+=[str(src)+':'+dst+':'+mode]
 if CONTINUATION_CONTEXT is not None and any(v.rsplit(':',2)[1]=='/run/qa-budget' for v in volumes):
  bound=bind_budget_service({'volumes':volumes,'environment':env});volumes=bound['volumes'];env=bound['environment']
 for volume in volumes:
  src,dst,mode=volume.rsplit(':',2);p=pathlib.Path(src);assert p.resolve()==p and (p.is_relative_to(ROOT) or p.is_relative_to(TARGET)) and mode in ['ro','rw'] and dst.startswith('/'),'JOB_VOLUME_SCOPE'
 cpu,mem,image=PROFILES[profile];owner=expected_owners()[root.name][profile];job_id=env.get('QA_INVOCATION_ID') or str(uuid.uuid4());assert str(uuid.UUID(job_id))==job_id,'JOB_INVOCATION'
 if CONTINUATION_CONTEXT is not None and 'QA_BUDGET_ATTEMPT' in env:env['QA_BUDGET_CLIENT']=job_id
 args=['docker','create','--name',root.name+'-job-'+job_id,'--label','com.docker.compose.project='+root.name,'--label','mecanet.qa.service='+profile,'--label','mecanet.qa.owner-id='+owner,'--label','mecanet.qa.job-id='+job_id,'--platform','linux/arm64','--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--cpus',str(cpu/1_000_000_000),'--memory',str(mem),'--pids-limit','64','--tmpfs','/tmp:size=16m,uid=999,gid=999','--user',user]
 if profile!='offline-pg':args+=['-w','/workspace']
 if profile=='probe':args+=['--group-add',str(os.stat('/home/ubuntu').st_gid)]
 for key,value in env.items():assert isinstance(value,str) and '\0' not in value;args+=['-e',key+'='+value]
 for volume in volumes:args+=['-v',volume]
 args+=['--entrypoint',command[0],image,*command[1:]]
 return args,job_id,owner
def create_job(root,profile,command,environment=None,mounts=(),network=None,sample=True):
 if sample:guard_effect(root,[profile])
 else:own(root);preserve();guard_resources(facts(),[(root,profile)],expected_owners())
 assert not any(c.get('project') in [ROOT.name,TARGET.name] and c.get('service')==profile for c in facts()),'PREVIOUS_JOB_REQUIRES_RECONCILIATION'
 args,job_id,owner=job_command(root,profile,command,environment,mounts,network);cid=run(*args).strip();assert re.fullmatch('[0-9a-f]{64}',cid),'JOB_CID'
 actual=inspect_container(cid);assert owned_identity(actual,expected_owners()) and actual.get('jobId')==job_id and actual['running'] is False and actual.get('status')=='created','JOB_CREATED_IDENTITY'
 receipt={'schema':'controller-job-created-v1','jobId':job_id,'containerId':cid,'project':root.name,'service':profile,'ownerId':owner,'imageDigest':PROFILES[profile][2].split('@',1)[1],'commandHash':canonical_hash(command),'state':'CREATED BEFORE START/SQL','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')}
 receipt_hash=immutable(root/'evidence/jobs'/(job_id+'-created.json'),receipt,0o400)
 return {'cid':cid,'jobId':job_id,'root':root,'profile':profile,'ownerId':owner,'receiptHash':receipt_hash}
def read_created_job(job):
 assert job['root'] in [ROOT,TARGET] and job['profile'] in ['harness','probe','controller-tool','offline-pg'] and str(uuid.UUID(job['jobId']))==job['jobId'] and re.fullmatch('[0-9a-f]{64}',job['cid']) and re.fullmatch('[0-9a-f]{64}',job['receiptHash']),'JOB_REFERENCE_SCOPE'
 path=job['root']/'evidence/jobs'/(job['jobId']+'-created.json')
 assert path.is_file() and path.resolve()==path and not path.is_symlink(),'JOB_REFERENCE_PATH'
 before=path.stat();assert before.st_uid==0 and (before.st_mode&0o777)==0o400 and 2<=before.st_size<=262144,'JOB_REFERENCE_PRIVATE'
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  stat=os.fstat(fd);assert (stat.st_dev,stat.st_ino,stat.st_size)==(before.st_dev,before.st_ino,before.st_size),'JOB_REFERENCE_CHANGED'
  with os.fdopen(fd,'rb',closefd=False) as file:raw=file.read(262145)
  assert len(raw)==before.st_size and hashlib.sha256(raw).hexdigest()==job['receiptHash'],'JOB_REFERENCE_HASH';created=json.loads(raw)
 finally:os.close(fd)
 assert set(created)=={'schema','jobId','containerId','project','service','ownerId','imageDigest','commandHash','state','createdAt'} and created['schema']=='controller-job-created-v1' and created['state']=='CREATED BEFORE START/SQL' and re.fullmatch('[0-9a-f]{64}',created['commandHash']),'JOB_REFERENCE_SHAPE'
 return created

def created_job_identity(c,job,created):
 # A publishing job can change the master during execution. Its identity is
 # fixed by the fsynced creation reference, never by rereading that master.
 return all(created.get(k)==v for k,v in {'jobId':job['jobId'],'containerId':job['cid'],'project':job['root'].name,'service':job['profile'],'ownerId':job['ownerId'],'imageDigest':PROFILES[job['profile']][2].split('@',1)[1]}.items()) and all(c.get(k)==v for k,v in {'id':job['cid'],'jobId':job['jobId'],'project':job['root'].name,'service':job['profile'],'ownerId':job['ownerId'],'nanoCpus':PROFILES[job['profile']][0],'memory':PROFILES[job['profile']][1],'imageRef':PROFILES[job['profile']][2]}.items())

def start_job(job):
 c=inspect_container(job['cid']);assert c.get('jobId')==job['jobId'] and c['ownerId']==job['ownerId'] and c['running'] is False and c.get('status')=='created','JOB_START_IDENTITY'
 assert created_job_identity(c,job,read_created_job(job)),'JOB_START_IDENTITY'
 guard_resources(facts(),[(job['root'],job['profile'])],expected_owners());assert_case_budget();run('docker','start',job['cid'])
def finish_job(job):
 created=read_created_job(job)
 exit_code=run_bounded('docker','wait',job['cid'],timeout=45).strip();assert re.fullmatch('[0-9]+',exit_code),'JOB_WAIT_STATUS'
 c=inspect_container(job['cid']);assert created_job_identity(c,job,created) and c['running'] is False and c.get('status')=='exited' and c.get('pid')==0 and c['exitCode']==int(exit_code) and not c['finishedAt'].startswith('0001-'),'JOB_END_NOT_PROVEN'
 result=subprocess.check_output(['docker','logs',job['cid']],text=True,timeout=5,stderr=subprocess.STDOUT)
 write_plain(job['root']/'evidence/jobs'/(job['jobId']+'-output.log'),result,0o400,999)
 proof={'schema':'controller-job-end-v1','jobId':job['jobId'],'containerId':job['cid'],'project':job['root'].name,'service':job['profile'],'ownerId':job['ownerId'],'createdReceiptHash':job['receiptHash'],'exitCode':c['exitCode'],'finishedAt':c['finishedAt'],'startedAt':c['startedAt'],'containerStopped':True,'sqlAbsence':'NOT VERIFIED'}
 end_hash=immutable(job['root']/'evidence/jobs'/(job['jobId']+'-end.json'),proof,0o400)
 if int(exit_code)!=0:raise AssertionError('JOB_FAILED_RETAINED_FOR_RECONCILIATION')
 # Exact immutable CID, removed only after both durable identity and END proofs.
 c=inspect_container(job['cid']);assert created_job_identity(c,job,created) and c['running'] is False,'JOB_REMOVE_IDENTITY';run('docker','rm',job['cid'])
 return result,{'containerId':job['cid'],'jobCreatedHash':job['receiptHash'],'jobEndHash':end_hash,'containerFIN':'PASS','sqlFIN':'NOT VERIFIED'}
def controller_job(root,profile,command,environment=None,mounts=(),network=None,before_start=None,after_start=None,sample=True):
 job=create_job(root,profile,command,environment,mounts,network,sample)
 if before_start:before_start(job)
 start_job(job)
 if after_start:after_start(job)
 return finish_job(job)
def bootstrap():
 proof=preflight();plan=read_budget_plan() # Validate authority and limits before creating own roots.
 for root in [ROOT,TARGET]:
  root.mkdir(mode=0o711)
  for folder in ['master','config','secrets','data','staging','evidence','evidence/jobs','ingress','faults','budget','backup','journal','journal/heads','journal/plans','journal/target-heads','journal/target-plans','tls','tls/postgres','tls/web','live']:
   (root/folder).mkdir(mode=0o700)
  for folder in UID999_FOLDERS:os.chown(root/folder,999,999)
  os.chown(root/'ingress',101,os.stat('/home/ubuntu').st_gid);os.chmod(root/'ingress',0o770)
 initialize_budget(plan);set_host_case('host-bootstrap');ledger_charge('artifactFiles') # The durable ledger itself.
 for root in [ROOT,TARGET]:immutable(root/'owner.json',{'project':root.name,'owner':'SrEdgarR/MECANET','base':BASE,'approval':APPROVAL,'state':'TEMPORARY/KEEP'})
 immutable(ROOT/'evidence/preflight.json',proof)
 return {'result':'PASS','createdPrivateRoots':2,'containersCreated':0,'secretsPrinted':False}
def stage(archive):
 own();set_host_case('host-stage');archive=pathlib.Path(archive);assert archive.parent==pathlib.Path('/tmp') and archive.name=='mecanet-cp022-artifact.tar'
 with tarfile.open(archive) as tar:
  members=tar.getmembers();assert len(members)<=2000 and all(m.isfile() and not m.issym() and not m.islnk() and not pathlib.PurePosixPath(m.name).is_absolute() and '..' not in pathlib.PurePosixPath(m.name).parts for m in members)
  assert not any('.env' in m.name.split('/') or m.name.startswith(('.qa-private/','secrets/','master/')) for m in members)
  assert sum(m.size for m in members)<32*1024**2
  assert not any((runtime_directory()/m.name).exists() for m in members),'ARTIFACT_ALREADY_STAGED'
  ledger_charge('artifactFiles',len(members))
  tar.extractall(runtime_directory(),filter='data')
 manifest=json.loads((runtime_directory()/'artifact.json').read_text());entries=manifest['entries']
 for x in entries:
  p=runtime_directory()/x['path'];assert p.resolve().is_relative_to(runtime_directory()) and not p.is_symlink() and p.is_file();assert p.stat().st_size==x['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==x['sha256']
 exact={str(p.relative_to(runtime_directory())) for p in (runtime_directory()).rglob('*') if p.is_file()};assert exact=={'artifact.json',*(x['path'] for x in entries)}
 digest=hashlib.sha256(json.dumps(entries,separators=(',',':'),sort_keys=True).encode()).hexdigest();assert manifest['digest']=='sha256:'+digest
 for p in (runtime_directory()).rglob('*'):os.chmod(p,0o755 if p.is_dir() else 0o444)
 os.chmod(runtime_directory(),0o755)
 return {'result':'PASS','artifact':manifest['digest'],'files':len(entries),'noHostBuild':True}
def tool(command,root=ROOT,network='none',memory='128m',cpu='0.25',mounts=()):
 assert memory=='128m' and cpu=='0.25','TOOL_PROFILE_FIXED'
 return controller_job(root,'controller-tool',command,mounts=mounts,network=network)[0]
def verify_retained_backup(host,bridge):
 """The immutable backup remains original; a legitimately used target does not."""
 m,current,owners=bridge.own_current(host)
 assert not any(c.get('running') and c.get('project') in [ROOT.name,TARGET.name] for c in current),'COPY_NEGATIVE_OFF_REQUIRED'
 result,rh=bridge.read400(TARGET/'evidence/target-copy.json',0);cfg,cfg_hash=bridge.read400(TARGET/'secrets/target-copy-config.json');end,eh=bridge.read400(ROOT/'secrets/source-live-end.json')
 assert result.get('schema')=='target-copy-host-result-v1' and result['inputConfigHash']==cfg_hash and result['sourceEndProofHash']==cfg['sourceEndProofHash']==end['hash'] and cfg['sourceEndProof']==end['endProof'] and cfg['custodyHash']==canonical_hash(m),'COPY_BACKUP_BINDING'
 bridge.validate_copy_result(result['nodeResult']);bridge.job_provenance(host,result['jobId'],result['jobProof'],['node','tests/qa/cp019/target-prepare.mjs','copy-before-target'])
 index,ih=bridge.read_private(ROOT/'journal/copy-index.json',999,4*1024**2,0o600)
 assert ih==result['indexHash']==result['nodeResult']['indexHash']==canonical_hash(index),'COPY_BACKUP_INDEX'
 files,size=bridge.inventory_copy(ROOT/'backup/source-copy',index,time.monotonic()+45)
 assert len(files)==result['nodeResult']['files'] and size==result['nodeResult']['bytes'],'COPY_BACKUP_INCOMPLETE'
 return {'indexHash':ih,'files':len(files),'bytes':size,'receiptHash':rh}

def retained_copy_footprint(host,bridge,cfg):
 """Root-only readonly measurement after positive process stop, no links followed."""
 current=facts();guard_resources(current,[],expected_owners())
 assert not any(c.get('project') in [ROOT.name,TARGET.name] and c.get('running') for c in current),'COPY_FOOTPRINT_ALL_OFF_REQUIRED'
 excluded=[TARGET/'data',TARGET/'backup'];total=0;seen=set()
 for directory,dirs,files in os.walk(TARGET,followlinks=False):
  parent=pathlib.Path(directory)
  for name in list(dirs):
   path=parent/name;assert not path.is_symlink(),'COPY_FOOTPRINT_LINK'
   if path in excluded:dirs.remove(name)
  for name in files:
   path=parent/name;info=path.lstat();assert path.resolve()==path and not path.is_symlink() and path.is_file() and info.st_nlink==1 and (info.st_dev,info.st_ino) not in seen,'COPY_FOOTPRINT_FILE';seen.add((info.st_dev,info.st_ino));total+=info.st_size
   assert total+4194304<=2*1024**3,'COPY_FOOTPRINT_LIMIT'
 return {'schema':'cp021-copy-retained-footprint-v1',**{k:cfg[k] for k in ['project','sourceSha','artifactDigest','custodyHash','recoveryId','indexHash','copyReceiptHash','sourceEndProofHash']},'otherFootprintBytes':total,'metadataReserveBytes':4194304,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),'allConsumersStopped':True,'excludedPaths':[str(x) for x in excluded]}

def copy_negatives():
 bridge=target_bridge();host=sys.modules.get(__name__) or types.SimpleNamespace(**globals());verified=verify_retained_backup(host,bridge)
 set_host_case('copy-negatives-env');enter_runtime_case('target-window','copy-negatives-env');m=material_owned();art=json.loads((runtime_directory()/'artifact.json').read_bytes());copy_receipt,receipt_hash=bridge.read400(TARGET/'evidence/target-copy.json',0)
 cfg={'schema':'cp020-copy-negatives-v1','project':TARGET.name,'sourceSha':art['sourceSha'],'artifactDigest':m['artifactDigest'],'custodyHash':canonical_hash(m),'recoveryId':m['recoveryId'],'copyReceiptHash':receipt_hash,'indexHash':verified['indexHash'],'sourceEndProofHash':copy_receipt['sourceEndProofHash'],'sourcePgOff':True,'targetPgOff':True};footprint=retained_copy_footprint(host,bridge,cfg);cfg.update(retainedFootprint=footprint,retainedFootprintHash=canonical_hash(footprint));bridge.frozen_input(host,TARGET/'master/copy-retained-footprint.json',footprint,0);path=TARGET/'secrets/copy-negative-config.json';write_plain(path,json.dumps(cfg,separators=(',',':'),sort_keys=True),0o400,999)
 mounts=[(ROOT/'backup/source-copy','/run/qa-copy','ro'),(ROOT/'journal/copy-index.json','/run/qa-copy-index.json','ro'),(TARGET/'data','/run/qa-target-data','ro'),(TARGET/'backup','/run/qa-negative','rw'),(TARGET/'evidence','/run/qa-results','rw'),(budget_directory(),'/run/qa-budget','rw'),(path,'/run/qa-secrets/copy-negative-config.json','ro')]
 job=create_job(TARGET,'controller-tool',['node','tests/qa/cp019/copy-negatives.mjs'],{'QA_CODE_SHA':art['sourceSha']},mounts=mounts,network='none');start_job(job);output,proof=bridge.watch_job(host,job,lambda:None);result=json.loads(output)
 assert set(result)=={'type','status','reportHash','sourceSha','secretOutput','postgresExecuted'} and result['type']=='cp020-copy-negatives' and result['status']=='PASS' and result['sourceSha']==art['sourceSha'] and result['secretOutput'] is False and result['postgresExecuted'] is False,'COPY_NEGATIVE_OUTPUT'
 report,report_hash=bridge.read400(TARGET/'evidence/copy-negatives.json');assert report_hash==result['reportHash'] and report['copyReceiptHash']==receipt_hash and report['custodyHash']==canonical_hash(m) and report['result']['status']=='PASS','COPY_NEGATIVE_REPORT'
 verify_retained_backup(host,bridge)
 return {'result':'PASS','scope':'Linux filesystem; no PostgreSQL corruption/restart claimed','reportHash':report_hash,'negativeCases':5,'jobProof':proof,'secretsPrinted':False}
def journal_negatives():
 bridge=target_bridge();host=sys.modules.get(__name__) or types.SimpleNamespace(**globals());m,current,owners=bridge.own_current(host);assert not any(c.get('running') and c.get('project') in [ROOT.name,TARGET.name] for c in current),'JOURNAL_NEGATIVE_OFF_REQUIRED'
 set_host_case('journal-negatives-env');enter_runtime_case('target-window','journal-negatives-env');raw,raw_hash=bridge.read_private(ROOT/'journal/source.jsonl',999,1024**2,0o600,False);assert raw.endswith(b'\n') and not (ROOT/'journal/source.jsonl.controller.lock').exists(),'JOURNAL_NEGATIVE_SOURCE';records=[json.loads(s) for s in raw.splitlines()]
 checkpoint,_=bridge.read400(ROOT/'secrets/source-copy-checkpoint.json');end,_=bridge.read400(ROOT/'secrets/source-live-end.json');art=json.loads((runtime_directory()/'artifact.json').read_bytes());cfg={'schema':'cp020-journal-negatives-v1','project':TARGET.name,'sourceSha':art['sourceSha'],'custodyHash':canonical_hash(m),'sourceEndProofHash':end['hash'],'rawHash':raw_hash,'recordsHash':canonical_hash(records),'copyCheckpoint':checkpoint,'finalCheckpoint':{'sequence':records[-1]['sequence'],'hash':records[-1]['hash']}};path=TARGET/'secrets/journal-negative-config.json';write_plain(path,json.dumps(cfg,separators=(',',':'),sort_keys=True),0o400,999)
 mounts=[(ROOT/'journal','/run/qa-source-journal','ro'),(TARGET/'evidence','/run/qa-results','rw'),(budget_directory(),'/run/qa-budget','rw'),(path,'/run/qa-secrets/journal-negative-config.json','ro')];job=create_job(TARGET,'controller-tool',['node','tests/qa/cp019/journal-negatives.mjs'],{'QA_CODE_SHA':art['sourceSha']},mounts=mounts,network='none');start_job(job);output,proof=bridge.watch_job(host,job,lambda:None);result=json.loads(output)
 assert set(result)=={'type','status','reportHash','sourceSha','secretOutput','postgresExecuted'} and result['type']=='cp020-journal-negatives' and result['status']=='PASS' and result['sourceSha']==art['sourceSha'] and result['secretOutput'] is False and result['postgresExecuted'] is False,'JOURNAL_NEGATIVE_OUTPUT'
 report,report_hash=bridge.read400(TARGET/'evidence/journal-negatives.json');assert report_hash==result['reportHash'] and report['custodyHash']==canonical_hash(m) and report['sourceEndProofHash']==end['hash'] and report['result']['status']=='PASS','JOURNAL_NEGATIVE_REPORT';after,after_hash=bridge.read_private(ROOT/'journal/source.jsonl',999,1024**2,0o600,False);assert after==raw and after_hash==raw_hash,'JOURNAL_NEGATIVE_CHANGED'
 return {'result':'PASS','scope':'Runtime validator / real readonly SOURCE journal; no SQL writes','reportHash':report_hash,'negativeCases':6,'jobProof':proof,'secretsPrinted':False}
def material():
 own();set_host_case('host-material');assert not (ROOT/'master/material.json').exists();manifest=json.loads((runtime_directory()/'artifact.json').read_text())
 js="import{chooseMaterial}from'./server/saas/recovery/custody.js';import{publishImmutable}from'./server/saas/recovery/protocol.js';const m=await chooseMaterial({project:'mecanet-qa-p1l3-r03',artifactDigest:'"+manifest['digest'][7:]+"'});const p=await publishImmutable('/run/master/material.json',m);console.log(JSON.stringify({materialHash:p.sha256,recoveryId:m.recoveryId,secretsPrinted:false}));"
 ledger_charge('artifactFiles') # Node's immutable master publication, before spawning it.
 result=json.loads(tool(['node','--input-type=module','-e',js],mounts=[(ROOT/'master','/run/master','rw')]))
 immutable(ROOT/'master/material-ref.json',result)
 m=json.loads((ROOT/'master/material.json').read_text())
 for side,root in [('source',ROOT),('target',TARGET)]:write_plain(root/'secrets/bootstrap',m[side]['rolePasswords']['qa_bootstrap'],0o400,999)
 write_plain(ROOT/'secrets/material.json',(ROOT/'master/material.json').read_bytes(),0o400,999)
 return {'result':'PASS',**result}
def nginx_config(template):
 assert template.count(' server {')==1 and template.count('listen unix:/run/qa-ingress/web.sock ssl;')==1,'NGINX_TEMPLATE'
 start=template.index(' server {');server=template[start:template.rfind('\n}')]
 server=server.replace('/catalogo$', '/(?:catalogo|inventario)$')
 extra=''
 for name in ['api1','api2']:extra+=server.replace('/web.sock','/'+name+'.sock').replace('proxy_pass http://api;','proxy_pass http://'+name+'_only;')
 return template[:start]+' upstream api1_only { server api1:3000; }\n upstream api2_only { server api2:3000; }\n'+server+extra+'\n}\n'
def configs():
 own();assert (ROOT/'master/material-ref.json').exists()
 tls,tls_files=tls_preflight(private_bytes=True)
 before=json.loads((ROOT/'evidence/preflight.json').read_text())
 assert before.get('tlsInputs')==tls,'TLS_PREFLIGHT_BINDING'
 source=runtime_directory()/'tests/qa/infra'
 for root,subnet,front,web in [(ROOT,'10.77.64.0/24','10.77.65.0/24','10.77.65.2'),(TARGET,'10.77.66.0/25','10.77.66.128/25','10.77.66.130')]:
  set_host_case('host-config-target' if root==TARGET else 'host-config-source')
  write_plain(root/'config/postgresql.conf',(source/'postgresql.conf').read_bytes(),0o444)
  hba=(source/'pg_hba.conf').read_text().replace('10.77.31.0/24',subnet).replace('saas_reconciler ','saas_reconciler,saas_writer_maintenance ')
  hba=hba.replace('host all all 0.0.0.0/0 reject',f'hostssl mecanet_tenant_a saas_writer_a,saas_maintainer_a {subnet} scram-sha-256\nhostssl mecanet_tenant_b saas_writer_b,saas_maintainer_b {subnet} scram-sha-256\nhost all all 0.0.0.0/0 reject')
  write_plain(root/'config/pg_hba.conf',hba,0o444);write_plain(root/'config/nginx.conf',nginx_config((source/'nginx.conf').read_text()),0o444)
  names=('ca.crt','ca.key','ca.srl','postgres/server.crt','postgres/server.csr','postgres/server.key','web/server.crt','web/server.csr','web/server.key')
  # Immutable copying is charged before each file, never overwrites partial TLS.
  for name in names:
   write_plain(root/'tls'/name,tls_files[root.name+'/'+name],0o400)
  for svc,uid in [('postgres',999),('web',101)]:
   os.chmod(root/'tls'/svc,0o755);os.chown(root/'tls'/svc/'server.key',uid,uid);os.chmod(root/'tls'/svc/'server.key',0o400);os.chmod(root/'tls'/svc/'server.crt',0o444)
  write_plain(root/'config/ca.crt',(root/'tls/ca.crt').read_bytes(),0o444)
  base={'image':'node@sha256:'+PINS['node'],'platform':'linux/arm64','user':'999:999','read_only':True,'cap_drop':['ALL'],'security_opt':['no-new-privileges:true'],'pids_limit':64,'working_dir':'/workspace','tmpfs':['/tmp:size=16m'],'restart':'no','logging':{'driver':'json-file','options':{'max-size':'8m','max-file':'2'}}}
  v=lambda p,d,mode='ro':str(root/p)+':'+d+':'+mode
  artifact=str(runtime_directory())+':/workspace:ro'
  data_ip=subnet.split('/')[0].rsplit('.',1)[0]+'.2'
  services={'postgres':{**base,'image':'postgres@sha256:'+PINS['postgres'],'cpus':0.35,'mem_limit':'640m','pids_limit':128,'environment':{'POSTGRES_USER':'qa_bootstrap','POSTGRES_DB':'postgres','POSTGRES_PASSWORD_FILE':'/run/secrets/bootstrap','POSTGRES_INITDB_ARGS':'--auth-host=scram-sha-256 --auth-local=scram-sha-256','PGDATA':'/var/lib/postgresql/18/docker'},'command':['postgres','-c','config_file=/etc/postgresql/postgresql.conf'],'volumes':[v('data','/var/lib/postgresql','rw'),v('config/postgresql.conf','/etc/postgresql/postgresql.conf'),v('config/pg_hba.conf','/etc/postgresql/pg_hba.conf'),v('tls/postgres','/run/tls'),v('secrets/bootstrap','/run/secrets/bootstrap')],'networks':{'data':{'ipv4_address':data_ip}},'tmpfs':['/tmp:size=16m','/var/run/postgresql:size=8m,mode=0770,uid=999,gid=999']}}
  for n in ['api1','api2']:
   services[n]={**base,'cpus':0.20,'mem_limit':'320m','command':['node','tests/qa/cp019/entry.mjs'],'environment':{'QA_PROJECT':root.name,'QA_INSTANCE':n,'QA_SCENARIO':'target-window' if root==TARGET else 'source-window'},'stop_grace_period':'30s','volumes':[artifact,v('secrets/'+n+'.json','/run/qa-secrets/api.json'),v('faults','/run/qa-faults','rw'),str(budget_directory())+':/run/qa-budget:rw'],'networks':['data','front']}
  services['worker']={**base,'cpus':0.10,'mem_limit':'192m','command':['node','tests/qa/cp019/worker.mjs'],'environment':{'QA_PROJECT':root.name,'QA_SCENARIO':'target-window' if root==TARGET else 'source-window'},'volumes':[artifact,v('secrets/worker.json','/run/qa-secrets/worker.json'),v('faults','/run/qa-faults','rw'),str(budget_directory())+':/run/qa-budget:rw'],'networks':['data']}
  services['web']={**base,'image':'nginx@sha256:'+PINS['nginx'],'user':'101:101','cpus':0.10,'mem_limit':'96m','entrypoint':['nginx','-g','daemon off;','-c','/etc/nginx/nginx.conf'],'volumes':[str(runtime_directory()/'client/dist-saas')+':/app:ro',v('config/nginx.conf','/etc/nginx/nginx.conf'),v('tls/web','/run/tls'),v('ingress','/run/qa-ingress','rw')],'networks':{'front':{'ipv4_address':web}},'tmpfs':['/tmp:size=16m,uid=101,gid=101']}
  services['harness']={**base,'profiles':['tools'],'cpus':0.25,'mem_limit':'128m','command':['node','tests/qa/cp019/prepare.mjs'],'environment':{'QA_PROJECT':root.name},'volumes':[artifact,v('secrets','/run/qa-secrets','rw'),v('config/ca.crt','/run/qa-ca.crt'),v('evidence','/run/qa-results','rw'),v('evidence/system-id','/run/qa-system-id'),v('faults','/run/qa-faults','rw'),v('journal','/run/qa-journal','rw'),str(budget_directory())+':/run/qa-budget:rw'],'networks':['data']}
  services['probe']={**base,'profiles':['tools'],'cpus':0.05,'mem_limit':'128m','group_add':[str(os.stat('/home/ubuntu').st_gid)],'command':['node','tests/qa/cp019/acceptance.mjs'],'environment':{'QA_PROJECT':root.name},'volumes':[artifact,v('secrets','/run/qa-secrets','rw'),v('config/ca.crt','/run/qa-ca.crt'),v('evidence','/run/qa-results','rw'),v('faults','/run/qa-faults','rw'),v('journal','/run/qa-journal','rw'),v('ingress','/run/qa-ingress'),str(budget_directory())+':/run/qa-budget:rw'],'networks':['data']}
  owners=expected_owners()[root.name]
  for name,service in services.items():service['labels']={'mecanet.qa.service':name,'mecanet.qa.owner-id':owners[name]}
  nets={k:{'name':root.name+'-'+k,'internal':True,'enable_ipv6':False,'driver_opts':{'com.docker.network.bridge.gateway_mode_ipv4':'isolated'},'ipam':{'config':[{'subnet':s}]}} for k,s in [('data',subnet),('front',front)]}
  immutable(root/'compose.json',{'name':root.name,'services':services,'networks':nets})
 return {'result':'PASS','ownCompose':True,'ports':[],'sharedNetworks':False,'hostBuild':False}
def wait_pg_ready(cid,timeout=20):
 assert re.fullmatch('[0-9a-f]{64}',cid),'PG_CID_REQUIRED'
 deadline=time.monotonic()+timeout
 # PID1 must be the final server, not the entrypoint's transient initdb server.
 command=['docker','exec',cid,'sh','-c','test "$(cat /proc/1/comm)" = postgres && pg_isready -q -t 1 -h /var/run/postgresql -p 5432']
 while time.monotonic()<deadline:
  try:run_bounded(*command,timeout=min(2,max(.1,deadline-time.monotonic())));return True
  except (subprocess.CalledProcessError,subprocess.TimeoutExpired):time.sleep(.2)
 raise AssertionError('PG_START_NOT_PROVEN')
def source_compose_spec():
 spec,_=target_bridge().read_private(compose_path(ROOT),0,262144,0o600)
 assert spec.get('name')==ROOT.name and isinstance(spec.get('services'),dict) and set(spec.get('networks',{}))=={'data','front'},'SOURCE_COMPOSE_SPEC'
 return spec
def validate_source_service_boundary(cid,spec):
 actual=json.loads(run('docker','inspect','--format','{"mounts":{{json .Mounts}},"tmpfs":{{json .HostConfig.Tmpfs}},"networks":{{json .NetworkSettings.Networks}},"ports":{{json .HostConfig.PortBindings}}}',cid));expected=[];expected_tmpfs={}
 for volume in spec['volumes']:
  src,dst,access=volume.rsplit(':',2);p=pathlib.Path(src);assert pathlib.PurePosixPath(src).is_absolute() and '..' not in p.parts and p.resolve()==p and p.is_relative_to(ROOT) and access in ['ro','rw'],'SOURCE_COMPOSE_MOUNT';expected.append((src,dst,access=='rw'))
 for value in spec.get('tmpfs',[]):
  assert isinstance(value,str),'SOURCE_COMPOSE_TMPFS';destination,separator,options=value.partition(':')
  assert separator and destination in ['/tmp','/var/run/postgresql'] and destination not in expected_tmpfs and options and all(32<ord(c)<127 for c in options),'SOURCE_COMPOSE_TMPFS';expected_tmpfs[destination]=options
 binds=[(x.get('Source'),x.get('Destination'),x.get('RW')) for x in actual.get('mounts',[]) if x.get('Type')=='bind']
 # Docker may omit tmpfs from .Mounts while CREATED. HostConfig is the planned
 # mount authority before START; any already-present tmpfs row must be planned.
 configured_tmpfs=actual.get('tmpfs');assert 'tmpfs' in actual and (configured_tmpfs is None or isinstance(configured_tmpfs,dict)) and (configured_tmpfs or {})==expected_tmpfs,'SOURCE_CREATED_TMPFS'
 tmpfs_mounts=[x for x in actual.get('mounts',[]) if x.get('Type')=='tmpfs'];assert all(x.get('RW') is True for x in tmpfs_mounts) and len(tmpfs_mounts)==len({x.get('Destination') for x in tmpfs_mounts}),'SOURCE_CREATED_TMPFS'
 assert sorted(binds)==sorted(expected) and all(x.get('Type') in ['bind','tmpfs'] for x in actual.get('mounts',[])) and {x.get('Destination') for x in actual.get('mounts',[]) if x.get('Type')=='tmpfs'}<=set(expected_tmpfs) and not actual.get('ports'),'SOURCE_CREATED_MOUNT'
 networks=actual.get('networks',{});assert spec['networks'] and set(spec['networks'])<=set(['data','front']) and set(networks)=={ROOT.name+'-'+name for name in spec['networks']},'SOURCE_CREATED_NETWORK'
 for name in spec['networks']:
  net=networks[ROOT.name+'-'+name];chosen=spec['networks'][name].get('ipv4_address') if isinstance(spec['networks'],dict) else None
  if chosen:assert net.get('IPAMConfig',{}).get('IPv4Address')==chosen and net.get('IPAddress') in ['',chosen],'SOURCE_CREATED_NETWORK'
  definition=json.loads(run('docker','network','inspect','--format','{"name":{{json .Name}},"internal":{{json .Internal}},"ipam":{{json .IPAM.Config}}}',ROOT.name+'-'+name))
  assert definition.get('name')==ROOT.name+'-'+name and definition.get('internal') is True and [x.get('Subnet') for x in definition.get('ipam',[])]==[{'data':'10.77.64.0/24','front':'10.77.65.0/24'}[name]],'SOURCE_CREATED_NETWORK'
 return True
def source_service_reference(c):
 assert c.get('project')==ROOT.name and c.get('service') in BUSINESS|{'postgres'} and re.fullmatch('[0-9a-f]{64}',c.get('id','')),'SOURCE_SERVICE_SCOPE'
 return {'schema':'source-service-created-v1','project':ROOT.name,'service':c['service'],'containerId':c['id'],'ownerId':c['ownerId'],'imageRef':c['imageRef'],'nanoCpus':c['nanoCpus'],'memory':c['memory'],'state':'BEFORE_START'}
def read_source_service_reference(c):
 reference,_=target_bridge().read400(ROOT/'master/source-services'/(c['service']+'-'+c['id']+'.json'),0)
 assert reference==source_service_reference(c),'SOURCE_CREATED_REFERENCE_CHANGED';return reference
def publish_source_service_reference(c):
 directory=ROOT/'master/source-services'
 if not directory.exists():ledger_charge('artifactFiles');directory.mkdir(mode=0o700);syncdir(directory.parent)
 meta=directory.lstat();assert directory.resolve()==directory and stat.S_ISDIR(meta.st_mode) and meta.st_uid==0 and meta.st_mode&0o777==0o700,'SOURCE_CREATED_DIRECTORY'
 path=directory/(c['service']+'-'+c['id']+'.json');assert not path.exists() and not path.is_symlink(),'SOURCE_CREATED_COLLISION'
 immutable(path,source_service_reference(c),0o400);read_source_service_reference(c)
def prepare_source_services(names):
 assert names and len(names)==len(set(names)) and set(names)<=BUSINESS|{'postgres'},'SOURCE_SERVICE_SCOPE'
 spec=source_compose_spec();owners=expected_owners();current=facts();created=[];needed=[]
 for name in names:
  rows=[c for c in current if c.get('project')==ROOT.name and c.get('service')==name]
  if rows:
   assert name=='worker' and len(rows)==1 and owned_identity(rows[0],owners) and rows[0]['running'] is True and rows[0].get('status')=='running' and type(rows[0].get('pid')) is int and rows[0]['pid']>0,'SOURCE_PREVIOUS_SERVICE_KEEP'
   read_source_service_reference(rows[0]);validate_source_service_boundary(rows[0]['id'],spec['services'][name])
  else:needed.append(name)
 if needed:
  assert tuple(needed) in [('postgres',),('worker',),('api1','api2','web')],'SOURCE_CREATE_SELECTION'
  compose(ROOT,'create','--no-build','--pull','never','--no-recreate',*needed)
 for name in needed:
  cid=compose(ROOT,'ps','-a','-q',name).strip();assert re.fullmatch('[0-9a-f]{64}',cid),'SOURCE_CREATED_CID';c=inspect_container(cid)
  assert owned_identity(c,owners) and c['project']==ROOT.name and c['service']==name and c['running'] is False and c.get('status')=='created' and c.get('pid')==0 and isinstance(c.get('startedAt'),str) and c['startedAt']=='0001-01-01T00:00:00Z','SOURCE_CREATED_IDENTITY'
  publish_source_service_reference(c) # Custody proves identity/creation, never a mount validation or START permit.
  created.append(c)
 for c in created:validate_source_service_boundary(c['id'],spec['services'][c['service']])
 return created,owners
def start_source_service(original,owners,restart=False,sample=True):
 assert owned_identity(original,owners) and original['project']==ROOT.name and original['service'] in BUSINESS|{'postgres'} and original['running'] is False and original.get('pid')==0,'SOURCE_START_IDENTITY'
 if restart:assert original['service']=='postgres' and original.get('status')=='exited' and original.get('exitCode')==0 and not original.get('finishedAt','0001-').startswith('0001-'),'SOURCE_START_IDENTITY'
 else:assert original.get('status')=='created','SOURCE_START_IDENTITY'
 read_source_service_reference(original);validate_source_service_boundary(original['id'],source_compose_spec()['services'][original['service']])
 if sample:guard_effect(ROOT,[original['service']])
 else:own();preserve();guard_resources(facts(),[(ROOT,original['service'])],expected_owners())
 actual=inspect_container(original['id']);assert actual==original and owned_identity(actual,owners),'SOURCE_START_CHANGED'
 assert_case_budget();run('docker','start',original['id'])
def pg_start():
 set_host_case('host-pg-start')
 own();assert not any(c['running'] and c.get('project')==TARGET.name for c in facts()),'TARGET_ACTIVE'
 preserve();resources();created,owners=prepare_source_services(['postgres']);assert len(created)==1,'SOURCE_CREATED_PG';cid=created[0]['id'];start_source_service(created[0],owners)
 wait_pg_ready(cid)
 # Positive facts, never dump docker's Env/config secrets.
 info=json.loads(run('docker','inspect','--format','{{json .NetworkSettings.Networks}}',cid));assert len(info)==1
 system=run('docker','exec',cid,'pg_controldata','/var/lib/postgresql/18/docker')
 sid=next(s.split(':',1)[1].strip() for s in system.splitlines() if s.startswith('Database system identifier:'));assert sid.isdigit()
 write_plain(ROOT/'evidence/system-id',sid,0o444)
 return {'result':'PASS','postgresContainer':cid,'systemIdentifier':sid,**preserve()}
def prepare_args(stage,source_sha):
 assert stage in ['foundation','writers','correctives'] and re.fullmatch('[0-9a-f]{40}',source_sha),'PREPARE_PHASE_OR_SOURCE'
 return ['run','--no-deps','-e','QA_STAGE='+stage,'-e','QA_CODE_SHA='+source_sha,'harness']
def prepare_result(result,stage):
 safe=json.loads(result);assert set(safe)=={'type','stage','project','generation','secretOutput'} and safe['type']=='cp019-source-prepared' and safe['stage']==stage and safe['project']==ROOT.name and safe['secretOutput'] is False,'PREPARE_RESULT_INVALID'
 assert re.fullmatch('[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}',safe['generation']),'PREPARE_GENERATION'
 return safe
def prepare(stage):
 own();assert stage in ['foundation','writers','correctives'],'PREPARE_PHASE'
 manifest=json.loads((runtime_directory()/'artifact.json').read_text());args=prepare_args(stage,manifest['sourceSha'])
 cid=compose(ROOT,'ps','-q','postgres').strip();wait_pg_ready(cid)
 sid=(ROOT/'evidence/system-id').read_text().strip();assert re.fullmatch('[0-9]{10,24}',sid),'SYSTEM_IDENTIFIER_REQUIRED'
 output=ROOT/'secrets'/('source-'+stage+'.json');assert not output.exists() and not output.is_symlink(),'PREPARE_OUTPUT_EXISTS'
 set_host_case('prepare-'+stage)
 result,job_proof=controller_job(ROOT,'harness',['node','tests/qa/cp019/prepare.mjs'],{'QA_STAGE':stage,'QA_CODE_SHA':manifest['sourceSha']})
 safe=prepare_result(result,stage);assert safe['generation']==material_owned()['source']['generation'],'PREPARE_GENERATION_MISMATCH'
 assert output.is_file() and output.resolve()==output and output.stat().st_size<=262144,'PREPARE_OUTPUT_REQUIRED'
 os.chown(output,999,999);os.chmod(output,0o400)
 with output.open('rb') as f:os.fsync(f.fileno())
 syncdir(output.parent)
 return {'result':'PASS','stage':stage,'sourceSha':manifest['sourceSha'],'outputMode':'0400','secretsPrinted':False,'jobProof':job_proof,**preserve()}
def parse_shutdown(output,expected_sid):
 fields={line.split(':',1)[0].strip():line.split(':',1)[1].strip() for line in output.splitlines() if ':' in line}
 assert fields.get('Database cluster state')=='shut down' and fields.get('Database system identifier')==expected_sid and re.fullmatch('[0-9]{10,24}',expected_sid),'PG_SHUTDOWN_NOT_PROVEN'
 return {'clusterState':'shut down','systemIdentifier':expected_sid}
def offline_pg(case_name='copy-verify'):
 assert case_name in ['copy-verify','source-shutdown-precopy','source-shutdown-postcanary'],'OFFLINE_PG_CASE';own();set_host_case(case_name);guard_effect(ROOT,['offline-pg'])
 pgs=[c for c in facts() if c.get('project')==ROOT.name and c.get('service')=='postgres'];assert len(pgs)==1 and owned_identity(pgs[0],expected_owners()) and pgs[0]['running'] is False,'PG_STOP_NOT_PROVEN'
 sid=(ROOT/'evidence/system-id').read_text().strip();output,job_proof=controller_job(ROOT,'offline-pg',['pg_controldata','/data/18/docker'],sample=False)
 return {'result':'PASS','side':'source',**parse_shutdown(output,sid),'jobProof':job_proof,'sqlFIN':'NOT VERIFIED','secretsPrinted':False,**preserve()}
def source_pg_off(step='precopy'):
 assert step in ['precopy','postcanary'],'SOURCE_PG_STOP_STEP';own();preserve();case_name='source-shutdown-'+step;set_host_case(case_name);current=facts();owners=expected_owners()
 assert not any(c['running'] and c.get('project') in [ROOT.name,TARGET.name] and c.get('service')!='postgres' for c in current),'SOURCE_PG_STOP_CONSUMERS'
 pgs=[c for c in current if c.get('project')==ROOT.name and c.get('service')=='postgres']
 assert len(pgs)==1 and owned_identity(pgs[0],owners),'SOURCE_PG_STOP_IDENTITY';original=pgs[0];cid=original['id'];actual=inspect_container(cid)
 assert actual==original,'SOURCE_PG_STOP_CHANGED'
 if actual['running']:run_bounded('docker','stop','--time','5',cid,timeout=15)
 ended=inspect_container(cid)
 assert owned_identity(ended,owners) and all(ended[k]==original[k] for k in ['id','project','service','ownerId','imageRef','nanoCpus','memory']) and ended['running'] is False and ended.get('pid')==0 and ended.get('status')=='exited' and ended.get('exitCode')==0 and not ended.get('finishedAt','0001-').startswith('0001-'),'SOURCE_PG_END_NOT_PROVEN'
 shutdown=offline_pg(case_name);assert shutdown['result']=='PASS' and shutdown['clusterState']=='shut down','SOURCE_PG_NOT_SHUT_DOWN'
 return {'result':'PASS','containerId':cid,'processEnded':True,'clusterShutdown':shutdown,'secretsPrinted':False}
def source_pg_canary_start():
 own();preserve();set_host_case('source-closed-canary');current=facts();owners=expected_owners()
 assert not any(c['running'] and c.get('project') in [ROOT.name,TARGET.name] for c in current),'SOURCE_CANARY_MUST_BE_COLD'
 target_bridge().verify_copy_completed(sys.modules.get(__name__) or types.SimpleNamespace(**globals()))
 read_host_private(ROOT/'secrets/source-copy-checkpoint.json');pgs=[c for c in current if c.get('project')==ROOT.name and c.get('service')=='postgres'];assert len(pgs)==1 and owned_identity(pgs[0],owners) and pgs[0]['status']=='exited' and pgs[0]['pid']==0,'SOURCE_CANARY_PG_IDENTITY'
 cid=pgs[0]['id'];start_source_service(pgs[0],owners,restart=True);wait_pg_ready(cid);resource=source_resource()['resource'];normal,_=read_host_private(ROOT/'secrets/source-normal-manifest.json');assert resource==normal['resource'],'SOURCE_CANARY_RESOURCE_CHANGED'
 assert not any(c['running'] and c.get('project') in [ROOT.name,TARGET.name] and c.get('service') in BUSINESS for c in facts()),'SOURCE_CANARY_BUSINESS_ACTIVE'
 return {'result':'PASS','containerId':cid,'purpose':'POSTCOPY RESTRICTION ONLY','secretsPrinted':False}
def copy_checkpoint_value(records,heads,head):
 # Sealing a pre-copy reference does not replace the complete Node validation.
 assert isinstance(records,list) and 0<len(records)<=1000 and all(r.get('sequence')==i for i,r in enumerate(records)) and records[-1].get('kind')=='observed','COPY_CHECKPOINT_INCOMPLETE'
 assert sorted(heads)==['head-'+str(i).zfill(4)+'.json' for i in range(len(records))],'COPY_CHECKPOINT_HEADS'
 assert head=={'sequence':len(records)-1,'hash':records[-1]['hash']} and re.fullmatch('[0-9a-f]{64}',head['hash']),'COPY_CHECKPOINT_TAIL'
 return dict(head)
def source_copy_checkpoint():
 own();set_host_case('source-copy-checkpoint');guard_effect(ROOT,[])
 assert not any(c['running'] and c.get('project') in [ROOT.name,TARGET.name] for c in facts()),'COPY_CHECKPOINT_REQUIRES_OFF'
 read_host_private(ROOT/'secrets/source-capture-result.json');read_host_private(ROOT/'evidence/source-close-restore-result.json')
 p=ROOT/'journal/source.jsonl';assert p.resolve()==p and not p.is_symlink() and p.stat().st_uid==999 and p.stat().st_mode&0o777==0o600 and p.stat().st_size<=1024**2,'COPY_CHECKPOINT_LOG'
 assert not (ROOT/'journal/source.jsonl.controller.lock').exists(),'COPY_CHECKPOINT_CONTROLLER_ACTIVE'
 raw=p.read_bytes();assert raw.endswith(b'\n'),'COPY_CHECKPOINT_TRUNCATED';records=[json.loads(r) for r in raw.decode().splitlines()]
 heads=sorted(x.name for x in (ROOT/'journal/heads').iterdir());tail=ROOT/'journal/heads'/('head-'+str(len(records)-1).zfill(4)+'.json')
 assert tail.resolve()==tail and not tail.is_symlink() and tail.stat().st_uid==999 and tail.stat().st_mode&0o777==0o600,'COPY_CHECKPOINT_HEAD_PRIVATE'
 head=copy_checkpoint_value(records,heads,json.loads(tail.read_bytes()));path=ROOT/'secrets/source-copy-checkpoint.json'
 if path.exists():assert read_host_private(path)[0]==head,'COPY_CHECKPOINT_IMMUTABLE_CONFLICT'
 else:write_plain(path,json.dumps(head,separators=(',',':'),sort_keys=True),0o400,999)
 return {'result':'PASS','checkpointHash':canonical_hash(head),'journalValidation':'DEFERRED TO BOUND TARGET ASSEMBLER','secretsPrinted':False}
def runtime_start(side,mode,sample=True):
 assert side=='source' and mode in ['worker','business'],'RUNTIME_START_SCOPE';own();set_host_case('source-runtime-start')
 m=material_owned();normal=ROOT/'secrets/source-normal-manifest.json';assert normal.is_file() and normal.resolve()==normal and normal.stat().st_uid==999 and (normal.stat().st_mode&0o777)==0o400,'RUNTIME_NORMAL_REQUIRED'
 normal_hash=hashlib.sha256(normal.read_bytes()).hexdigest();names=['worker'] if mode=='worker' else ['api1','api2','worker','web']
 for name in names:
  if name=='web':continue
  p=ROOT/'secrets'/(name+'.json');assert p.is_file() and p.resolve()==p and not p.is_symlink() and p.stat().st_uid==999 and (p.stat().st_mode&0o777)==0o400 and p.stat().st_size<=262144,'RUNTIME_CONFIG_REQUIRED'
  cfg=json.loads(p.read_bytes());recovery=cfg.get('recovery');assert cfg['generation']==m['source']['generation'] and recovery=={'mode':'NORMAL','runId':m['source']['normal']['runId'],'manifestHash':normal_hash},'RUNTIME_BINDING'
  assert cfg.get('clockOwner' if name=='worker' else 'ownerId')==expected_owners()[ROOT.name][name],'RUNTIME_OWNER'
 if mode=='business':
  receipt=json.loads((ROOT/'evidence/source-clock-ack.json').read_bytes());assert receipt['phase']=='source-clock-ack' and receipt['stage']=='COMPLETE' and receipt['generation']==m['source']['generation'] and receipt['runId']==m['source']['normal']['runId'] and receipt['normalManifestHash']==normal_hash,'RUNTIME_ACK_REQUIRED'
 created,owners=prepare_source_services(names)
 # All selected CIDs have a durable Root reference before the first START.
 for i,c in enumerate(created):start_source_service(c,owners,sample=sample and i==0)
 current=facts();guard_resources(current,[],expected_owners())
 assert all(sum(c.get('project')==ROOT.name and c.get('service')==name and c['running'] for c in current)==1 for name in names),'RUNTIME_START_NOT_PROVEN'
 consumers=[{k:c[k] for k in ['id','project','service','ownerId','imageRef','nanoCpus','memory','running']} for c in current if c.get('project')==ROOT.name and c.get('service') in names and c['running']]
 return {'result':'PASS','side':side,'mode':mode,'services':names,'runtimeConsumers':consumers,'readyHTTP':'NOT VERIFIED','privatePortsOnly':True,'secretsPrinted':False,**preserve()}
def source_resource():
 own();preserve();m=material_owned();cid=compose(ROOT,'ps','-q','postgres').strip();wait_pg_ready(cid)
 current=facts();guard_resources(current,[],expected_owners())
 c=next((x for x in current if x['id']==cid),None);assert c and c['running'] and c['project']==ROOT.name and c['service']=='postgres','SOURCE_PG_NOT_OWNED'
 mounts=json.loads(run('docker','inspect','--format','{{json .Mounts}}',cid));bind=[x for x in mounts if x['Destination']=='/var/lib/postgresql'];assert len(bind)==1 and bind[0]['Type']=='bind' and bind[0]['Source']==str(ROOT/'data') and bind[0]['RW'] is True,'SOURCE_VOLUME_BIND'
 net=json.loads(run('docker','inspect','--format','{{json .NetworkSettings.Networks}}',cid));name=ROOT.name+'-data';assert list(net)==[name] and net[name]['IPAddress']=='10.77.64.2','SOURCE_NETWORK'
 network=json.loads(run('docker','network','inspect','--format','{"id":{{json .Id}},"name":{{json .Name}},"internal":{{json .Internal}},"ipam":{{json .IPAM.Config}}}',name));assert network['name']==name and network['internal'] is True and [x.get('Subnet') for x in network['ipam']]==['10.77.64.0/24'],'SOURCE_NETWORK'
 data=ROOT/'data/18/docker';assert data.is_dir() and data.resolve()==data and not data.is_symlink(),'SOURCE_DATA_PATH'
 st=data.stat();volume='cp019-'+hashlib.sha256((str(data)+':'+str(st.st_dev)+':'+str(st.st_ino)).encode()).hexdigest()
 controldata=run('docker','exec',cid,'pg_controldata','/var/lib/postgresql/18/docker');sid=next(x.split(':',1)[1].strip() for x in controldata.splitlines() if x.startswith('Database system identifier:'))
 assert sid==(ROOT/'evidence/system-id').read_text().strip() and re.fullmatch('[0-9]{10,24}',sid),'SOURCE_SYSTEM_ID'
 machine=pathlib.Path('/etc/machine-id').read_bytes().strip();assert machine,'HOST_ID_REQUIRED'
 resource={'project':ROOT.name,'cohortId':m['source']['normal']['runId'],'hostIdentity':hashlib.sha256(machine).hexdigest(),'containerId':cid,'containerLabels':{'project':c['project'],'service':c['service']},'imageDigest':'sha256:'+PINS['postgres'],'volumeId':volume,'dataPath':str(data),'networkId':network['id'],'networkSubnet':'10.77.64.0/24','networkIP':net[name]['IPAddress'],'socketPath':str(ROOT/'ingress/web.sock'),'generation':m['source']['generation'],'systemIdentifier':sid}
 return {'result':'PASS','side':'source','resource':resource,'targetObserved':False,'listenerClaimedActive':False,'secretsPrinted':False}
def source_step_args(phase,action,source_sha):
 assert phase in SOURCE_PHASES and action in ['select','run'] and re.fullmatch('[0-9a-f]{40}',source_sha),'SOURCE_STEP_ARGUMENT'
 profile='probe' if phase=='source-clock-ack' else 'harness';cfg=ROOT/'secrets'/(phase+'-'+action+'-config.json')
 return cfg,profile,['run','--no-deps','-e','QA_CODE_SHA='+source_sha,'-v',str(cfg)+':/run/qa-secrets/source-driver.json:ro',profile,'node','tests/qa/cp019/source-driver.mjs']
def canonical_hash(value):return hashlib.sha256(json.dumps(value,separators=(',',':'),sort_keys=True,ensure_ascii=False,allow_nan=False).encode()).hexdigest()
def receipt_age_guard(age):
 assert 0<=age<=5,'SOURCE_RECEIPT_STALE'
 return age
def source_host_receipt(body,phase,source_sha,material,observation,invocation_id,observed_at):
 assert phase in SOURCE_PHASES and re.fullmatch('[0-9a-f]{40}',source_sha) and str(uuid.UUID(invocation_id))==invocation_id,'SOURCE_RECEIPT_INPUT'
 assert observation['resource']==body['resource'] and body['normalManifestHash']==canonical_hash(body['normalManifest']) and body['normalManifest']['resource']==body['resource'],'SOURCE_RECEIPT_RESOURCE'
 assert body['normalManifest']['custodyHash']==canonical_hash(material) and body['normalManifest']['generation']==material['source']['generation'] and body['normalManifest']['runId']==material['source']['normal']['runId'],'SOURCE_RECEIPT_CUSTODY'
 return {'schema':'source-host-receipt-v1','invocationId':invocation_id,'phase':phase,'controllerOwner':material['controllerOwner'],'custodyHash':canonical_hash(material),'normalManifestHash':body['normalManifestHash'],'resourceHash':canonical_hash(body['resource']),'producerSha':source_sha,'observedAt':observed_at,'observedResources':observation}
def fresh_source_observation(phase,resource):
 assert source_resource()['resource']==resource,'SOURCE_RESOURCE_CHANGED'
 current=facts();owners=expected_owners();guard_resources(current,[],owners)
 active=[c for c in current if c['running'] and c.get('project') in [ROOT.name,TARGET.name] and c.get('service') in BUSINESS]
 if phase=='source-clock-ack':assert len(active)==1 and active[0]['project']==ROOT.name and active[0]['service']=='worker','SOURCE_ACK_WORKER_ONLY'
 else:assert not active,'BUSINESS_ACTIVE'
 runtime=[{'service':c['service'],'containerId':c['id'],'running':c['running'],'ownerId':c['ownerId'],'imageDigest':'sha256:'+PINS['node' if c['service']!='web' else 'nginx']} for c in active]
 return {'resource':resource,'runtimeConsumers':runtime}
def source_step(phase,action):
 own();manifest=json.loads((runtime_directory()/'artifact.json').read_text());cfg,profile,args=source_step_args(phase,action,manifest['sourceSha'])
 assert cfg.is_file() and cfg.resolve()==cfg and not cfg.is_symlink() and cfg.stat().st_size<=262144 and cfg.stat().st_uid==999 and (cfg.stat().st_mode&0o777)==0o400,'SOURCE_STEP_PRIVATE_CONFIG'
 body=json.loads(cfg.read_bytes());assert body['phase']==phase and body['action']==action and body['sourceCommit']==manifest['sourceSha'],'SOURCE_STEP_CONFIG_BINDING'
 output=ROOT/('secrets' if action=='select' else 'evidence')/(phase+'.json');assert not output.exists() and not output.is_symlink(),'SOURCE_STEP_OUTPUT_EXISTS'
 expected_output='/run/qa-'+('secrets' if action=='select' else 'results')+'/'+phase+'.json';assert body['output']==expected_output,'SOURCE_STEP_OUTPUT_SCOPE'
 # Perform the costly resource checks before creating a <=5s attestation. The
 # invocation UUID identifies a measurement, never a writer/clock owner or retry key.
 guard_effect(ROOT,[profile]);set_host_case(phase);material=material_owned();observation=fresh_source_observation(phase,body['resource'])
 invocation_id=str(uuid.uuid4());observed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
 receipt=source_host_receipt(body,phase,manifest['sourceSha'],material,observation,invocation_id,observed_at)
 fresh_body={**body,'invocationId':invocation_id,'hostReceipt':receipt,'hostReceiptHash':canonical_hash(receipt)}
 fresh_cfg=ROOT/'secrets'/(phase+'-'+action+'-'+invocation_id+'-config.json');immutable(fresh_cfg,fresh_body,0o400);os.chown(fresh_cfg,999,999)
 args=[x.replace(str(cfg)+':/run/qa-secrets/source-driver.json:ro',str(fresh_cfg)+':/run/qa-secrets/source-driver.json:ro') for x in args]
 args[args.index('-v'):args.index('-v')]=['-e','QA_INVOCATION_ID='+invocation_id]
 # Revalidate identity/caps without a second 2s CPU sample after timestamping.
 guard_resources(facts(),[(ROOT,profile)],expected_owners());receipt_age_guard(time.time()-datetime.datetime.fromisoformat(observed_at.replace('Z','+00:00')).timestamp())
 result_text,job_proof=controller_job(ROOT,profile,['node','tests/qa/cp019/source-driver.mjs'],{'QA_CODE_SHA':manifest['sourceSha'],'QA_INVOCATION_ID':invocation_id},mounts=[(fresh_cfg,'/run/qa-secrets/source-driver.json','ro')],sample=False)
 result=json.loads(result_text);hash_name='planHash' if action=='select' else 'receiptHash';kind='cp019-source-plan' if action=='select' else 'cp019-source-phase'
 assert set(result)=={'type','phase',hash_name,'secretOutput'} and result['type']==kind and result['phase']==phase and result['secretOutput'] is False and re.fullmatch('[0-9a-f]{64}',result[hash_name]),'SOURCE_STEP_RESULT'
 assert output.is_file() and output.resolve()==output and not output.is_symlink() and output.stat().st_uid==999 and (output.stat().st_mode&0o777)==0o400 and hashlib.sha256(output.read_bytes()).hexdigest()==result[hash_name],'SOURCE_STEP_OUTPUT_BINDING'
 return {'result':'PASS','phase':phase,'action':action,'profile':profile,hash_name:result[hash_name],'sourceSha':manifest['sourceSha'],'hostReceiptHash':canonical_hash(receipt),'invocationId':invocation_id,'jobProof':job_proof,'physicalCohortAcceptance':'NOT VERIFIED','secretsPrinted':False,**preserve()}
def source_config(phase,action):
 own();assert phase in SOURCE_PHASES and action in ['select','run'],'SOURCE_CONFIG_SCOPE';set_host_case(phase)
 resource=source_resource()['resource'];path=ROOT/'secrets/source-resource.json'
 if path.exists():assert path.resolve()==path and not path.is_symlink() and path.stat().st_uid==999 and (path.stat().st_mode&0o777)==0o400 and json.loads(path.read_bytes())==resource,'SOURCE_RESOURCE_IMMUTABLE_CONFLICT'
 else:write_plain(path,json.dumps(resource,separators=(',',':'),sort_keys=True),0o400,999)
 result,job_proof=controller_job(ROOT,'harness',['node','tests/qa/cp019/source-config.mjs',phase,action])
 body=json.loads(result);assert set(body)=={'type','phase','action','configHash','normalManifestHash','secretOutput','physicalCohortAcceptance'} and body['type']=='cp019-source-config' and body['phase']==phase and body['action']==action and body['secretOutput'] is False and body['physicalCohortAcceptance']=='NOT VERIFIED','SOURCE_CONFIG_RESULT'
 return {**body,'result':'PASS','jobProof':job_proof,**preserve()}
def source_phase(phase):
 assert phase in SOURCE_PHASES and phase!='source-clock-ack','SOURCE_COLD_PHASE'
 entry=runtime_directory()/'tests/qa/cp019/runtime-driver.mjs';assert entry.is_file() and entry.resolve()==entry,'SOURCE_ATOMIC_BRIDGE_NOT_STAGED'
 own();set_host_case(phase);manifest=json.loads((runtime_directory()/'artifact.json').read_text());cfg=ROOT/'secrets'/(phase+'-select-config.json')
 assert cfg.is_file() and cfg.resolve()==cfg and cfg.stat().st_uid==999 and (cfg.stat().st_mode&0o777)==0o400,'SOURCE_PHASE_TEMPLATE'
 body=json.loads(cfg.read_bytes());assert body['phase']==phase and body['action']=='select' and body['sourceCommit']==manifest['sourceSha'],'SOURCE_PHASE_BINDING'
 guard_effect(ROOT,['harness']);observation=fresh_source_observation(phase,body['resource']);m=material_owned();invocation_id=str(uuid.uuid4());at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
 receipt=source_host_receipt(body,phase,manifest['sourceSha'],m,observation,invocation_id,at);fresh=ROOT/'secrets'/(phase+'-atomic-'+invocation_id+'-config.json')
 write_plain(fresh,json.dumps({**body,'invocationId':invocation_id,'hostReceipt':receipt,'hostReceiptHash':canonical_hash(receipt)},separators=(',',':'),sort_keys=True),0o400,999)
 output,proof=controller_job(ROOT,'harness',['node','tests/qa/cp019/runtime-driver.mjs','source-phase',phase],{'QA_CODE_SHA':manifest['sourceSha'],'QA_INVOCATION_ID':invocation_id},mounts=[(fresh,'/run/qa-secrets/source-driver.json','ro')],sample=False)
 result=source_atomic_result(output,phase)
 return {**result,'result':'PASS','jobProof':proof,'physicalCohortAcceptance':'NOT VERIFIED',**preserve()}
def source_atomic_result(output,phase):
 result=json.loads(output);kind='cp019-source-ack' if phase=='source-clock-ack' else 'cp019-source-phase'
 assert set(result)=={'type','phase','planHash','receiptHash','secretOutput','physicalCohortAcceptance'} and result['type']==kind and result['phase']==phase and result['secretOutput'] is False and result['physicalCohortAcceptance']=='NOT VERIFIED' and all(re.fullmatch('[0-9a-f]{64}',result[k]) for k in ['planHash','receiptHash']),'SOURCE_ATOMIC_RESULT'
 return result
def wait_source_ready(invocation_id,source_sha,timeout=10):
 path=ROOT/'faults'/(invocation_id+'-ready.json');end=time.monotonic()+timeout
 while time.monotonic()<end:
  if path.exists():
   assert path.is_file() and path.resolve()==path and not path.is_symlink() and path.stat().st_uid==999 and (path.stat().st_mode&0o777)==0o400 and path.stat().st_size<=262144,'SOURCE_READY_PRIVATE'
   body=json.loads(path.read_bytes());assert body=={'schema':'source-job-ready-v1','invocationId':invocation_id,'phase':'source-clock-ack','producerSha':source_sha},'SOURCE_READY_BINDING';return True
  time.sleep(.02)
 raise AssertionError('SOURCE_JOB_NOT_READY')
def source_ack():
 own();set_host_case('source-clock-ack');base=ROOT/'secrets/source-clock-ack-select-config.json';assert base.is_file() and base.resolve()==base and base.stat().st_uid==999 and (base.stat().st_mode&0o777)==0o400,'SOURCE_ACK_TEMPLATE'
 body=json.loads(base.read_bytes());assert body['phase']=='source-clock-ack' and body['action']=='select','SOURCE_ACK_TEMPLATE'
 manifest=json.loads((runtime_directory()/'artifact.json').read_text());assert body['sourceCommit']==manifest['sourceSha'],'SOURCE_ACK_SOURCE'
 assert not any(c['running'] and c.get('project') in [ROOT.name,TARGET.name] and c.get('service') in BUSINESS for c in facts()),'SOURCE_ACK_MUST_START_COLD'
 assert not (ROOT/'evidence/source-clock-ack.json').exists() and not (ROOT/'secrets/source-clock-ack.json').exists(),'SOURCE_ACK_OUTPUT_EXISTS'
 invocation_id=str(uuid.uuid4());gate=ROOT/'secrets'/('source-clock-ack-run-'+invocation_id+'-config.json');ready=ROOT/'faults'/(invocation_id+'-ready.json');assert not gate.exists() and not ready.exists(),'SOURCE_ACK_INVOCATION_EXISTS'
 env={'QA_CODE_SHA':manifest['sourceSha'],'QA_INVOCATION_ID':invocation_id,'QA_READY_FILE':'/run/qa-faults/'+ready.name,'QA_HOST_GATE':'/run/qa-secrets/'+gate.name}
 def warm(job):
  wait_source_ready(invocation_id,manifest['sourceSha'])
  # A fresh cold sample may be taken while worker/API/web remain OFF. Once the
  # worker starts, only actual cap/identity checks are repeated, no 2s sample.
  guard_effect(ROOT,['worker']);cold_at=time.monotonic();runtime_start('source','worker',sample=False)
  assert time.monotonic()-cold_at<=6,'SOURCE_WARM_PREFLIGHT_STALE'
  observation=fresh_source_observation('source-clock-ack',body['resource']);material=material_owned();at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
  receipt=source_host_receipt(body,'source-clock-ack',manifest['sourceSha'],material,observation,invocation_id,at)
  fresh={**body,'invocationId':invocation_id,'hostReceipt':receipt,'hostReceiptHash':canonical_hash(receipt)}
  write_plain(gate,json.dumps(fresh,separators=(',',':'),sort_keys=True),0o400,999)
  assert time.monotonic()-cold_at<=6,'SOURCE_WARM_PREFLIGHT_STALE'
 output,proof=controller_job(ROOT,'probe',['node','tests/qa/cp019/runtime-driver.mjs','source-ack'],env,after_start=warm)
 result=source_atomic_result(output,'source-clock-ack')
 return {**result,'result':'PASS','jobProof':proof,'physicalCohortAcceptance':'NOT VERIFIED',**preserve()}

def read_host_private(path):
 assert path.is_file() and path.resolve()==path and not path.is_symlink(),'SOURCE_PRIVATE_PATH'
 before=path.stat();assert before.st_uid==999 and (before.st_mode&0o777)==0o400 and 2<=before.st_size<=262144,'SOURCE_PRIVATE_FILE'
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  after=os.fstat(fd);assert (after.st_dev,after.st_ino,after.st_size)==(before.st_dev,before.st_ino,before.st_size),'SOURCE_PRIVATE_CHANGED'
  with os.fdopen(fd,'rb',closefd=False) as file:raw=file.read(262145)
  assert len(raw)==before.st_size,'SOURCE_PRIVATE_CHANGED';return json.loads(raw),hashlib.sha256(raw).hexdigest()
 finally:os.close(fd)

def wait_source_signal(path,expected,extra,timeout=20):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  if path.exists():
   body,digest=read_host_private(path)
   assert set(body)==set(expected)|set(extra) and all(body[k]==v for k,v in expected.items()) and all(re.fullmatch('[0-9a-f]{64}',body[k]) for k in extra),'SOURCE_SIGNAL_BINDING'
   return body,digest
  time.sleep(.01)
 raise AssertionError('SOURCE_SIGNAL_NOT_PROVEN')

def source_business_gate(body,material,source_sha,invocation_id,ack_hash,resource,current,observed_at):
 assert resource==body['resource'] and body['normalManifestHash']==canonical_hash(body['normalManifest']) and body['normalManifest']['custodyHash']==canonical_hash(material),'SOURCE_BUSINESS_RESOURCE'
 assert re.fullmatch('[0-9a-f]{40}',source_sha) and re.fullmatch('[0-9a-f]{64}',ack_hash) and str(uuid.UUID(invocation_id))==invocation_id,'SOURCE_BUSINESS_INPUT'
 guard_resources(current,[],expected_owners())
 active=[c for c in current if c.get('project') in [ROOT.name,TARGET.name] and c.get('service') in BUSINESS and c['running']]
 assert len(active)==4 and {c['service'] for c in active}==BUSINESS and all(c['project']==ROOT.name and re.fullmatch('[0-9a-f]{64}',c['id']) for c in active),'SOURCE_BUSINESS_NOT_PROVEN'
 runtime=[{'service':c['service'],'containerId':c['id'],'ownerId':c['ownerId'],'running':True,'imageDigest':PROFILES[c['service']][2].split('@',1)[1]} for c in sorted(active,key=lambda c:c['service'])]
 return {'schema':'source-business-gate-v1','invocationId':invocation_id,'producerSha':source_sha,'generation':material['source']['generation'],'runId':material['source']['normal']['runId'],'normalManifestHash':body['normalManifestHash'],'custodyHash':canonical_hash(material),'resourceHash':canonical_hash(resource),'ackReceiptHash':ack_hash,'observedAt':observed_at,'runtimeConsumers':runtime}

def stop_source_business(expected):
 assert len(expected)==4 and {c['service'] for c in expected}==BUSINESS and len({c['id'] for c in expected})==4,'SOURCE_STOP_INVENTORY'
 owners=expected_owners();stop=[]
 for c in expected:
  actual=inspect_container(c['id'])
  assert c['project']==ROOT.name and owned_identity(actual,owners) and all(actual[k]==c[k] for k in ['id','project','service','ownerId','imageRef','nanoCpus','memory']),'SOURCE_STOP_IDENTITY'
  if actual['running']:stop.append(c['id'])
 if stop:run_bounded('docker','stop','--time','5',*stop,timeout=15)
 ended=[]
 for c in expected:
  actual=inspect_container(c['id'])
  assert owned_identity(actual,owners) and all(actual[k]==c[k] for k in ['id','project','service','ownerId','imageRef','nanoCpus','memory']) and actual['running'] is False and actual.get('status')=='exited' and actual.get('pid')==0 and type(actual.get('exitCode')) is int and not actual.get('finishedAt','0001-').startswith('0001-'),'SOURCE_STOP_NOT_PROVEN'
  ended.append({k:actual[k] for k in ['service','id','ownerId','running','exitCode','finishedAt']})
 return ended

def source_live_result(output):
 result=json.loads(output)
 assert set(result)=={'type','phase','status','ackReceiptHash','resultHash','secretOutput','sourceEndProofHash'} and result['type']=='cp019-source-live' and result['phase']=='source-fixture' and result['status']=='PASS' and result['secretOutput'] is False and all(re.fullmatch('[0-9a-f]{64}',result[k]) for k in ['ackReceiptHash','resultHash','sourceEndProofHash']),'SOURCE_LIVE_RESULT'
 return result

def stop_known_source_runtime(known):
 # Emergency stop is limited to the exact references returned by our own start.
 # It intentionally does not depend on aggregate headroom or infer a SQL fence.
 owners=expected_owners();valid=[];unknown=[];ended=[]
 assert len(known)<=4 and len({c['id'] for c in known})==len(known) and len({c['service'] for c in known})==len(known),'SOURCE_EMERGENCY_INVENTORY'
 for c in known:
  try:
   assert c['project']==ROOT.name and c['service'] in BUSINESS and re.fullmatch('[0-9a-f]{64}',c['id']),'SOURCE_EMERGENCY_SCOPE'
   actual=inspect_container(c['id'])
   assert owned_identity(actual,owners) and all(actual[k]==c[k] for k in ['id','project','service','ownerId','imageRef','nanoCpus','memory']),'SOURCE_EMERGENCY_IDENTITY'
   if actual['running']:valid.append(c['id'])
   else:
    assert actual.get('status')=='exited' and actual.get('pid')==0 and type(actual.get('exitCode')) is int and not actual.get('finishedAt','0001-').startswith('0001-'),'SOURCE_EMERGENCY_END'
    ended.append(c['id'])
  except (AssertionError,subprocess.SubprocessError,KeyError,TypeError):unknown.append(c['id'])
 failed=False
 if valid:
  try:run_bounded('docker','stop','--time','5',*valid,timeout=15)
  except subprocess.SubprocessError:failed=True
 for cid in valid:
  try:
   c=next(c for c in known if c['id']==cid);actual=inspect_container(cid)
   assert owned_identity(actual,owners) and all(actual[k]==c[k] for k in ['id','project','service','ownerId','imageRef','nanoCpus','memory']) and actual['running'] is False and actual.get('status')=='exited' and actual.get('pid')==0 and type(actual.get('exitCode')) is int and not actual.get('finishedAt','0001-').startswith('0001-'),'SOURCE_EMERGENCY_END'
   ended.append(cid)
  except (AssertionError,subprocess.SubprocessError,KeyError,TypeError):unknown.append(cid)
 return {'status':'FAIL / ABORTED','knownRuntimeContainers':len(known),'positivelyStoppedContainers':sorted(ended),'unknownContainers':sorted(set(unknown)),'stopFailed':failed,'sqlFIN':'NOT VERIFIED','fenceClosure':'NOT VERIFIED','PGAndProbeKept':True,'secretsPrinted':False}

def source_live():
 # One probe is imported while cold. It ACKs, enters the next registered case,
 # runs the SOURCE fixture, then measures SQL absence after the exact four exit.
 own();set_host_case('source-clock-ack');base=ROOT/'secrets/source-clock-ack-select-config.json';body,_=read_host_private(base)
 manifest=json.loads((runtime_directory()/'artifact.json').read_text());source_sha=manifest['sourceSha'];material=material_owned()
 assert body['phase']=='source-clock-ack' and body['action']=='select' and body['sourceCommit']==source_sha,'SOURCE_LIVE_TEMPLATE'
 assert re.fullmatch('[0-9a-f]{40}',source_sha) and body['normalManifestHash']==canonical_hash(body['normalManifest']) and body['normalManifest']['custodyHash']==canonical_hash(material) and body['normalManifest']['resource']==body['resource'] and body['normalManifest']['generation']==material['source']['generation'] and body['normalManifest']['runId']==material['source']['normal']['runId'],'SOURCE_LIVE_COLD_BINDING'
 assert (runtime_directory()/'tests/qa/cp019/runtime-driver.mjs').is_file(),'SOURCE_ATOMIC_BRIDGE_NOT_STAGED'
 assert not any(c['running'] and c.get('project') in [ROOT.name,TARGET.name] and c.get('service') in BUSINESS for c in facts()),'SOURCE_LIVE_MUST_START_COLD'
 assert not any((ROOT/p).exists() for p in ['evidence/source-clock-ack.json','secrets/source-clock-ack.json','evidence/source-live.json','secrets/source-live-end.json']),'SOURCE_LIVE_OUTPUT_EXISTS'
 invocation_id=str(uuid.uuid4());ack_gate=ROOT/'secrets'/('source-clock-ack-run-'+invocation_id+'-config.json');business_gate=ROOT/'secrets'/('source-business-'+invocation_id+'-gate.json');stop_gate=ROOT/'secrets'/('source-stop-'+invocation_id+'-gate.json');done=ROOT/'faults'/(invocation_id+'-fixture-done.json');ack_ready=ROOT/'faults'/(invocation_id+'-ack-ready.json');observed={};known={}
 env={'QA_CODE_SHA':source_sha,'QA_INVOCATION_ID':invocation_id,'QA_READY_FILE':'/run/qa-faults/'+invocation_id+'-ready.json','QA_HOST_GATE':'/run/qa-secrets/'+ack_gate.name,'QA_BUSINESS_GATE':'/run/qa-secrets/'+business_gate.name,'QA_FIXTURE_DONE':'/run/qa-faults/'+done.name,'QA_SOURCE_STOP_GATE':'/run/qa-secrets/'+stop_gate.name}
 def live(job):
  observed['jobId']=job['jobId']
  wait_source_ready(invocation_id,source_sha)
  # Sample and project the whole future runtime while only PG/probe are active.
  guard_effect(ROOT,sorted(BUSINESS));cold_at=time.monotonic();started=runtime_start('source','worker',sample=False);known.update({c['service']:c for c in started['runtimeConsumers']})
  observation=fresh_source_observation('source-clock-ack',body['resource']);assert time.monotonic()-cold_at<=6,'SOURCE_WARM_PREFLIGHT_STALE'
  at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z');receipt=source_host_receipt(body,'source-clock-ack',source_sha,material,observation,invocation_id,at)
  write_plain(ack_gate,json.dumps({**body,'invocationId':invocation_id,'hostReceipt':receipt,'hostReceiptHash':canonical_hash(receipt)},separators=(',',':'),sort_keys=True),0o400,999)
  signal,_=wait_source_signal(ack_ready,{'schema':'source-ack-ready-v1','invocationId':invocation_id,'phase':'source-runtime-start','producerSha':source_sha},['ackReceiptHash'])
  ack,ack_hash=read_host_private(ROOT/'evidence/source-clock-ack.json');assert ack_hash==signal['ackReceiptHash'] and ack['phase']=='source-clock-ack' and ack['stage']=='COMPLETE' and ack['sourceCommit']==source_sha and ack['custodyHash']==canonical_hash(material) and ack['normalManifestHash']==body['normalManifestHash'] and ack['generation']==material['source']['generation'] and ack['runId']==material['source']['normal']['runId'],'SOURCE_LIVE_ACK_BINDING'
  set_host_case('source-runtime-start');enter_runtime_case('source-window','source-runtime-start');started=runtime_start('source','business',sample=False);known.update({c['service']:c for c in started['runtimeConsumers']})
  current=facts();actual_resource=source_resource()['resource'];at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
  gate=source_business_gate(body,material,source_sha,invocation_id,ack_hash,actual_resource,current,at);write_plain(business_gate,json.dumps(gate,separators=(',',':'),sort_keys=True),0o400,999)
  finished,_=wait_source_signal(done,{'schema':'source-fixture-done-v1','invocationId':invocation_id,'producerSha':source_sha,'ackReceiptHash':ack_hash},['resultHash'],timeout=40)
  set_host_case('source-close-admission');enter_runtime_case('source-window','source-close-admission');expected=[c for c in current if c['project']==ROOT.name and c['service'] in BUSINESS and c['running']];ended=stop_source_business(expected)
  # No SQL absence is invented here. DONE is after awaited transport completion;
  # all four exact CIDs are now EXITED. The probe measures the SQL layer itself.
  stop={'schema':'source-stop-gate-v1','invocationId':invocation_id,'producerSha':source_sha,'generation':material['source']['generation'],'runId':material['source']['normal']['runId'],'resourceHash':canonical_hash(body['resource']),'ackReceiptHash':ack_hash,'containers':ended,'httpPending':[]}
  write_plain(stop_gate,json.dumps(stop,separators=(',',':'),sort_keys=True),0o400,999);observed.update({'ackHash':ack_hash,'fixtureHash':finished['resultHash'],'containers':ended})
 try:output,proof=controller_job(ROOT,'probe',['node','tests/qa/cp019/runtime-driver.mjs','source-live'],env,after_start=live)
 except Exception as original:
  emergency=stop_known_source_runtime(list(known.values()));set_host_case('source-close-admission')
  if observed.get('jobId'):
   try:immutable(ROOT/'evidence/jobs'/(observed['jobId']+'-emergency.json'),emergency,0o400)
   except Exception:emergency['durableEmergencyProof']='NOT VERIFIED'
  error=AssertionError('SOURCE_LIVE_ABORTED / SQL_FIN_NOT_VERIFIED');error.emergency=emergency;raise error from None
 result=source_live_result(output);report,report_hash=read_host_private(ROOT/'evidence/source-live.json');end,end_hash=read_host_private(ROOT/'secrets/source-live-end.json')
 assert report_hash==result['resultHash'] and result['ackReceiptHash']==observed['ackHash'] and report['sourceCommit']==source_sha and report['artifactDigest']==material['artifactDigest'] and report['generation']==material['source']['generation'] and report['runId']==material['source']['normal']['runId'] and report['invocationId']==invocation_id and report['ackReceiptHash']==observed['ackHash'] and canonical_hash(report['result'])==observed['fixtureHash'] and report['sourceEndProofHash']==result['sourceEndProofHash']==end['hash']==canonical_hash(end['endProof']),'SOURCE_LIVE_FINAL_BINDING'
 assert end['observedEnd']['containers']==observed['containers'] and end['observedEnd']['sqlOwnersPresent']==[] and end['observedEnd']['httpPending']==[],'SOURCE_LIVE_END_BINDING'
 return {**result,'result':'PASS FOR SOURCE FIXTURE ONLY','sourceSha':source_sha,'invocationId':invocation_id,'jobProof':proof,'allL3Acceptance':'NOT VERIFIED','secretsPrinted':False,**preserve()}
def final_source_observation(resource,ended,current,material):
 # Original four CIDs come from the durable, SQL-measured live end receipt.
 # This host verifies process identity; the final driver measures SQL again.
 assert len(ended)==4 and {p['service'] for p in ended}==BUSINESS and len({p['id'] for p in ended})==4,'SOURCE_FINAL_ORIGINAL_INVENTORY'
 owners=expected_owners();by_id={c['id']:c for c in current};runtime=[]
 expected_ids={p['id'] for p in ended}
 ours=[c for c in current if c.get('project')==ROOT.name and c.get('service') in BUSINESS]
 assert len(ours)==4 and {c['id'] for c in ours}==expected_ids,'SOURCE_FINAL_CONSUMER_CHANGED'
 for p in ended:
  actual=by_id.get(p['id'])
  assert actual and actual['project']==ROOT.name and owned_identity(actual,owners) and actual['service']==p['service'] and actual['ownerId']==p['ownerId'] and actual['running'] is False and actual.get('status')=='exited' and actual.get('pid')==0 and actual['exitCode']==p['exitCode'] and actual['finishedAt']==p['finishedAt'] and not actual['finishedAt'].startswith('0001-'),'SOURCE_FINAL_PROCESS_NOT_ENDED'
  runtime.append({'service':p['service'],'containerId':p['id'],'ownerId':p['ownerId'],'running':False})
 return {'resource':resource,'runtimeConsumers':runtime}
def source_final(phase):
 assert phase in SOURCE_FINAL_PHASES,'SOURCE_FINAL_PHASE'
 own();set_host_case(phase);guard_effect(ROOT,['harness'])
 material=material_owned();staged=json.loads((runtime_directory()/'artifact.json').read_text());source_sha=staged['sourceSha']
 normal,normal_hash=read_host_private(ROOT/'secrets/source-normal-manifest.json')
 end,_=read_host_private(ROOT/'secrets/source-live-end.json')
 resource=source_resource()['resource']
 assert end['hash']==canonical_hash(end['endProof']) and end['endProof']['recoveryId']==material['recoveryId'] and end['endProof']['sourceResourceHash']==canonical_hash(resource) and end['observedEnd']['resourceHash']==canonical_hash(resource),'SOURCE_FINAL_END_BINDING'
 assert end['observedEnd']['sqlOwnersPresent']==[] and end['observedEnd']['httpPending']==[],'SOURCE_FINAL_PREVIOUS_END_REQUIRED'
 assert normal_hash==canonical_hash(normal) and normal['resource']==resource and normal['custodyHash']==canonical_hash(material) and normal['runId']==material['source']['normal']['runId'],'SOURCE_FINAL_NORMAL_BINDING'
 observation=final_source_observation(resource,end['observedEnd']['containers'],facts(),material)
 invocation=str(uuid.uuid4());at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
 receipt={'schema':'source-final-host-v1','invocationId':invocation,'controllerOwner':material['controllerOwner'],'phase':phase,'custodyHash':canonical_hash(material),'normalManifestHash':normal_hash,'producerSha':source_sha,'resourceHash':canonical_hash(resource),'observedAt':at,'observedResources':observation}
 cfg={'phase':phase,'action':'capture' if phase=='source-capture' else 'atomic','invocationId':invocation,'resource':resource,'hostReceipt':receipt,'hostReceiptHash':canonical_hash(receipt)}
 path=ROOT/'secrets'/('source-final-'+phase+'-'+invocation+'-config.json');write_plain(path,json.dumps(cfg,separators=(',',':'),sort_keys=True),0o400,999)
 output,job=controller_job(ROOT,'harness',['node','tests/qa/cp019/source-final.mjs'],{'QA_CODE_SHA':source_sha,'QA_INVOCATION_ID':invocation},mounts=[(path,'/run/qa-secrets/source-final.json','ro')],sample=False)
 result=json.loads(output)
 assert set(result)=={'type','phase','status','resultHash','secretsPrinted','physicalRecovery'} and result['type']=='cp019-source-final' and result['phase']==phase and result['status']=='PASS' and result['secretsPrinted'] is False and result['physicalRecovery']=='NOT VERIFIED' and re.fullmatch('[0-9a-f]{64}',result['resultHash']),'SOURCE_FINAL_OUTPUT'
 result_path=ROOT/('secrets' if phase=='source-capture' else 'evidence')/(phase+'-result.json');_,result_hash=read_host_private(result_path)
 assert result_hash==result['resultHash'],'SOURCE_FINAL_RESULT_BINDING'
 return {**result,'sourceSha':source_sha,'jobProof':job,'allL3Acceptance':'NOT VERIFIED',**preserve()}
def verify_source_references(current):
 """Emergency custody only: no clocks, quotas, pressure or label adoption."""
 for c in current:
  if c.get('project')!=ROOT.name:continue
  if c.get('service') in BUSINESS|{'postgres'}:read_source_service_reference(c);continue
  service=c.get('service');job_id=c.get('jobId');assert service in ['harness','probe','controller-tool','offline-pg'] and isinstance(job_id,str) and re.fullmatch('[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}',job_id),'SOURCE_JOB_REFERENCE'
  created,ch=target_bridge().read400(ROOT/'evidence/jobs'/(job_id+'-created.json'),0)
  assert set(created)=={'schema','jobId','containerId','project','service','ownerId','imageDigest','commandHash','state','createdAt'} and created['schema']=='controller-job-created-v1' and created['state']=='CREATED BEFORE START/SQL' and isinstance(created['commandHash'],str) and re.fullmatch('[0-9a-f]{64}',created['commandHash']) and isinstance(created['createdAt'],str) and bool(created['createdAt']),'SOURCE_JOB_REFERENCE'
  job={'root':ROOT,'profile':service,'cid':c['id'],'jobId':job_id,'ownerId':c['ownerId']};assert created_job_identity(c,job,created),'SOURCE_JOB_REFERENCE_CHANGED'
 return True
def cleanup():
 own();before=facts();owners=expected_owners();ours=[c for c in before if c.get('project') in [ROOT.name,TARGET.name]]
 valid=[];unknown=[];variant_refs={}
 if (TARGET/'variants').exists():
  try:variant_refs={r['containerId']:r for r in variant_bridge().emergency_variant_references(sys.modules.get(__name__) or types.SimpleNamespace(**globals()))}
  except (AssertionError,OSError,KeyError,TypeError,json.JSONDecodeError):pass # Unknown identities are retained, never stopped by labels.
 main=[c for c in ours if c['id'] not in variant_refs];keys=[(c.get('project'),c.get('service')) for c in main]
 for c in ours:
  reference=variant_refs.get(c['id'])
  if reference:
   if variant_bridge().matches(c,reference,PROFILES):valid.append(c)
   else:unknown.append(c['id'])
  elif owned_identity(c,owners) and keys.count((c['project'],c['service']))==1:
   try:verify_main_target_references([c]);verify_source_references([c]);valid.append(c)
   except (AssertionError,OSError,KeyError,TypeError,json.JSONDecodeError):unknown.append(c['id'])
  else:unknown.append(c['id'])
 # Reinspect exact immutable CIDs, never a project-wide stop. Aggregate excess
 # does not disable emergency stopping of positively identified own processes.
 stop=[];revalidated=[]
 for c in valid:
  try:
   actual=inspect_container(c['id'])
   reference=variant_refs.get(c['id']);assert (variant_bridge().matches(actual,reference,PROFILES) if reference else owned_identity(actual,owners)) and all(actual[k]==c[k] for k in ['id','project','service','ownerId','imageRef','nanoCpus','memory']),'CLEANUP_IDENTITY_CHANGED'
   if reference is None:verify_source_references([actual]);verify_main_target_references([actual])
   revalidated.append(c['id'])
   if actual['running']:stop.append(c['id'])
  except (AssertionError,OSError,subprocess.CalledProcessError,subprocess.TimeoutExpired,json.JSONDecodeError,KeyError,TypeError):unknown.append(c['id'])
 stop_failed=False
 if stop:
  try:run('docker','stop','--time','30',*stop)
  except (subprocess.CalledProcessError,subprocess.TimeoutExpired):stop_failed=True
 after=facts();after_ids={c['id']:c for c in after};valid_ids=set(revalidated)
 remaining=[cid for cid in valid_ids if cid not in after_ids or after_ids[cid]['running']]
 foreign=[c for c in before if c['id'] not in valid_ids];preserved=all(c in after for c in foreign)
 for c in after:
  if c.get('project') in [ROOT.name,TARGET.name] and c['id'] not in valid_ids:unknown.append(c['id'])
 try:preflight_preserved=preserve()['result']=='PASS'
 except (AssertionError,subprocess.CalledProcessError):preflight_preserved=False
 ok=not unknown and not remaining and not stop_failed and preserved and preflight_preserved
 return {'result':'PASS' if ok else 'FAIL','ownStopped':sum(cid in after_ids and not after_ids[cid]['running'] for cid in valid_ids),'unknownContainers':sorted(set(unknown)),'remainingOwnContainers':sorted(remaining),'stopFailed':stop_failed,'otherConsumersPreserved':len(foreign) if preserved else 0,'preflightConsumersPreserved':preflight_preserved,'dataCopiesJournalMaterial':'KEEP PRIVATE','publicPortsCreated':False}
def host_dispatch(action,args):
 allowed={'preflight':preflight,'bootstrap':bootstrap,'material':material,'configs':configs,'pg-start':pg_start,'source-resource':source_resource,'source-ack':source_ack,'source-live':source_live,'offline-pg':offline_pg,'source-pg-off':source_pg_off,'source-copy-checkpoint':source_copy_checkpoint,'source-pg-canary-start':source_pg_canary_start,'copy-negatives':copy_negatives,'journal-negatives':journal_negatives,'preserve':preserve,'cleanup':cleanup}
 if action in ['stage','prepare','source-phase','source-final']:
  assert len(args)==1;return stage(args[0]) if action=='stage' else prepare(args[0]) if action=='prepare' else source_phase(args[0]) if action=='source-phase' else source_final(args[0])
 if action=='source-step':assert len(args)==2;return source_step(*args)
 if action=='source-config':assert len(args)==2;return source_config(*args)
 if action=='runtime-start':assert len(args)==2;return runtime_start(*args)
 if action=='source-pg-off':assert len(args)==1;return source_pg_off(args[0])
 if action=='browser-gate':assert len(args)==1;return browser_gate_encoded(args[0])
 if action.startswith('http-'):return http_bridge().dispatch(sys.modules.get(__name__) or types.SimpleNamespace(**globals()),action,args)
 if action in ['schema-probe','credential-probe','prefix-prepare']:return probes_bridge().dispatch(sys.modules.get(__name__) or types.SimpleNamespace(**globals()),action,args)
 if action.startswith('readiness-'):return readiness_bridge().dispatch(sys.modules.get(__name__) or types.SimpleNamespace(**globals()),action,args)
 if action.startswith('variant-'):return variant_bridge().dispatch(sys.modules.get(__name__) or types.SimpleNamespace(**globals()),action,args)
 if action.startswith('target-'):return target_dispatch(action,args)
 assert action in allowed and not args,'HOST_ACTION_ARGS';return allowed[action]()
if __name__=='__main__':
 assert len(sys.argv)>=2,'HOST_ACTION_REQUIRED';print(json.dumps(host_dispatch(sys.argv[1],sys.argv[2:])))
