"""SC-016 v2 accounting core. Passive import; no clock, files or Docker effects.

The historical ledger is an input with an externally pinned byte hash. This
module never writes it. Host and Node adapters must authenticate the immutable
admission separately; accepting an arbitrary matching object is not authority.
"""
import copy, hashlib, json, math, re

PROJECT='mecanet-qa-p1l3-r03'
SC016='6e1fe2d6ef789eef9637fd0ec9f6c5703998899cbc9df4f8a8c35990364bfc92'
REGISTRY='1f2b34b5bb93ae21a74f7d2af8a51bd3cb16d3ea7baa3b55a54481b5875f243c'
GLOBAL={'artifactFiles':8192,'sql':200000,'http':300,'journal':1000}
CASE={'artifactFiles':2000,'sql':8192,'http':80,'journal':1000}
HASH=re.compile(r'^[0-9a-f]{64}$')
SCHEMA='cp024-budget-continuation-v2'
V1_HASH='b2ed6589a6026fca7c8268fa726a58f4d459b70e1a52f086437150650db959f6'

def check(ok,code='CONTINUATION_BUDGET_ABORT'):
 if not ok:raise AssertionError(code)
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def number(value):return type(value) in [int,float] and math.isfinite(value)
def totals(value,caps):return isinstance(value,dict) and set(value)==set(caps) and all(type(v) is int and 0<=v<=caps[k] for k,v in value.items())

def validate_base(raw,expected_hash):
 check(isinstance(raw,bytes) and 2<=len(raw)<=262144 and expected_hash==V1_HASH and sha(raw)==expected_hash,'CONTINUATION_V1_HASH')
 b=json.loads(raw);check(set(b)=={'schema','project','plannedScenarios','plannedScopes','activeScenarios','startedUptime','sequence','total','scenarios'} and b['schema']=='cp019-budget-v1' and b['project']==PROJECT,'CONTINUATION_V1_SCOPE')
 check(type(b['sequence']) is int and b['sequence']==44 and totals(b['total'],GLOBAL) and b['total']=={'artifactFiles':639,'sql':0,'http':0,'journal':0},'CONTINUATION_V1_BOUNDARY')
 check(number(b['startedUptime']) and b['startedUptime']>=0 and len(b['plannedScenarios'])==135 and set(b['plannedScopes'])==set(b['plannedScenarios']) and all(v==CASE for v in b['plannedScenarios'].values()),'CONTINUATION_V1_REGISTRY')
 plan={k:b[k] for k in ['project','plannedScenarios','plannedScopes']};plan.update(schema='cp019-budget-plan-v1',activeScenarios={'source-window':'source-runtime-start','target-window':'target-runtime-start'})
 check(sha(canonical(plan))==REGISTRY and set(b['activeScenarios'])=={'source-window','target-window'} and all(b['plannedScopes'].get(v)==k for k,v in b['activeScenarios'].items()),'CONTINUATION_V1_REGISTRY')
 check(isinstance(b['scenarios'],dict) and set(b['scenarios'])<=set(b['plannedScenarios']),'CONTINUATION_V1_CASE')
 for c in b['scenarios'].values():check(set(c)=={'startedUptime','limits','total'} and c['limits']==CASE and totals(c['total'],CASE) and number(c['startedUptime']) and c['startedUptime']>=b['startedUptime'],'CONTINUATION_V1_CASE')
 check(all(sum(c['total'][k] for c in b['scenarios'].values())==v for k,v in b['total'].items()),'CONTINUATION_V1_SUM')
 return b

def validate_admission(a,base,base_hash):
 check(isinstance(a,dict) and set(a)=={'schema','project','targetProject','attempt','approvalHash','parentLedgerHash','parentSequence','registryHash','startedUptime','sourceContainerId','sourceOwnerId','sourceSystemIdentifier','sourceFinishedAt','sealedInputsHash','controllerHash','runtimeHash','priorRunReportHash'} and a['schema']=='cp024-continuation-admission-v2','CONTINUATION_ADMISSION_REQUIRED')
 check(a['project']==PROJECT and a['targetProject']==PROJECT+'-target' and a['attempt']=='v2' and a['approvalHash']==SC016 and a['parentLedgerHash']==base_hash and a['parentSequence']==base['sequence'] and a['registryHash']==REGISTRY,'CONTINUATION_ADMISSION_SCOPE')
 check(a['sourceContainerId']=='aa35afe3ea406009410be0e1a7eef759c619c8386a290ce9cbf620fe890cc500' and a['sourceOwnerId']=='76066956-b4ae-422f-ae8d-69a0795a88dd' and a['sourceSystemIdentifier']=='7696914153807093794' and a['sourceFinishedAt']=='2026-10-15T15:18:02.598236798Z','CONTINUATION_IDENTITY')
 check(number(a['startedUptime']) and a['startedUptime']>=base['startedUptime'] and all(isinstance(a[k],str) and HASH.fullmatch(a[k]) for k in ['sealedInputsHash','controllerHash','runtimeHash','priorRunReportHash']),'CONTINUATION_ADMISSION_PIN')
 return a

def initial(raw,expected_hash,admission):
 b=validate_base(raw,expected_hash);a=validate_admission(admission,b,expected_hash)
 # Every historical charge remains in total and its original case; no v1
 # timestamp is changed. A v2 case receives its own start only upon entry.
 return {'schema':SCHEMA,'project':PROJECT,'attempt':'v2','admissionHash':sha(canonical(a)),'parentLedgerHash':expected_hash,'startedUptime':a['startedUptime'],'sequence':b['sequence'],'plannedScenarios':copy.deepcopy(b['plannedScenarios']),'plannedScopes':copy.deepcopy(b['plannedScopes']),'activeScenarios':copy.deepcopy(b['activeScenarios']),'total':copy.deepcopy(b['total']),'scenarios':{n:{'startedUptime':None,'limits':CASE.copy(),'total':c['total'].copy()} for n,c in b['scenarios'].items()},'aborted':None}

def validate(state,raw,expected_hash,admission,now):
 b=validate_base(raw,expected_hash);a=validate_admission(admission,b,expected_hash)
 check(isinstance(state,dict) and set(state)=={'schema','project','attempt','admissionHash','parentLedgerHash','startedUptime','sequence','plannedScenarios','plannedScopes','activeScenarios','total','scenarios','aborted'} and state['schema']==SCHEMA and state['project']==PROJECT and state['attempt']=='v2','CONTINUATION_STATE_SCOPE')
 check(state['admissionHash']==sha(canonical(a)) and state['parentLedgerHash']==expected_hash and state['startedUptime']==a['startedUptime'] and state['plannedScenarios']==b['plannedScenarios'] and state['plannedScopes']==b['plannedScopes'],'CONTINUATION_AUTHORITY_CHANGED')
 check(state['aborted'] is None,'CONTINUATION_TERMINAL_ABORT')
 check(number(now) and 0<=now-state['startedUptime']<1800 and type(state['sequence']) is int and state['sequence']>=b['sequence'] and totals(state['total'],GLOBAL) and all(state['total'][k]>=v for k,v in b['total'].items()),'CONTINUATION_GLOBAL_EXPIRED_OR_REGRESSED')
 check(set(state['activeScenarios'])==set(b['activeScenarios']) and all(state['plannedScopes'].get(v)==k for k,v in state['activeScenarios'].items()),'CONTINUATION_CASE_ALIAS')
 check(isinstance(state['scenarios'],dict) and set(b['scenarios'])<=set(state['scenarios'])<=set(b['plannedScenarios']),'CONTINUATION_CASE_OMITTED')
 for n,c in state['scenarios'].items():
  prior=b['scenarios'].get(n,{'total':dict.fromkeys(GLOBAL,0)})['total']
  check(isinstance(c,dict) and set(c)=={'startedUptime','limits','total'} and c['limits']==CASE and totals(c['total'],CASE) and all(c['total'][k]>=v for k,v in prior.items()),'CONTINUATION_CASE_REGRESSION')
  check((c['startedUptime'] is None and n in b['scenarios'] and c['total']==prior) or (number(c['startedUptime']) and state['startedUptime']<=c['startedUptime']<=now),'CONTINUATION_CASE_START')
 check(all(sum(c['total'][k] for c in state['scenarios'].values())==v for k,v in state['total'].items()),'CONTINUATION_TOTAL_MISMATCH')
 return b

def remaining(state,raw,expected_hash,admission,scenario,now,maximum=45):
 validate(state,raw,expected_hash,admission,now);check(scenario in state['plannedScenarios'] and number(maximum) and 0<maximum<=45,'CONTINUATION_CASE_REQUIRED')
 c=state['scenarios'].get(scenario);left=min(maximum,1800-(now-state['startedUptime']))
 if c and c['startedUptime'] is not None:left=min(left,45-(now-c['startedUptime']))
 check(left>0,'CONTINUATION_CASE_EXPIRED');return left

def update(state,raw,expected_hash,admission,scenario,now,kind=None,amount=1,scope=None):
 remaining(state,raw,expected_hash,admission,scenario,now)
 out=copy.deepcopy(state)
 if scope is not None:check(scope in out['activeScenarios'] and out['plannedScopes'][scenario]==scope,'CONTINUATION_CASE_ALIAS');out['activeScenarios'][scope]=scenario
 if scenario not in out['scenarios']:out['scenarios'][scenario]={'startedUptime':now,'limits':CASE.copy(),'total':dict.fromkeys(GLOBAL,0)}
 elif out['scenarios'][scenario]['startedUptime'] is None:out['scenarios'][scenario]['startedUptime']=now
 if kind is not None:
  check(kind in GLOBAL and type(amount) is int and amount>0,'CONTINUATION_CHARGE')
  check(out['total'][kind]+amount<=GLOBAL[kind] and out['scenarios'][scenario]['total'][kind]+amount<=CASE[kind],'CONTINUATION_OVERFLOW')
  out['total'][kind]+=amount;out['scenarios'][scenario]['total'][kind]+=amount
 out['sequence']+=1;validate(out,raw,expected_hash,admission,now);return out

def aborted(state,reason):
 check(isinstance(reason,str) and re.fullmatch('[A-Z][A-Z0-9_]{0,99}',reason),'CONTINUATION_ABORT_REASON')
 out=copy.deepcopy(state)
 if out['aborted'] is None:out['aborted']=reason;out['sequence']+=1
 return out

def validate_progress(previous,current):
 """Compare positive observations or a caller-authenticated durable Root seal."""
 check(previous and current and previous['schema']==current['schema']==SCHEMA and previous['admissionHash']==current['admissionHash'] and previous['parentLedgerHash']==current['parentLedgerHash'] and previous['startedUptime']==current['startedUptime'] and current['sequence']>=previous['sequence'],'CONTINUATION_PROGRESS_REGRESSION')
 check(all(current['total'][k]>=v for k,v in previous['total'].items()),'CONTINUATION_PROGRESS_REGRESSION')
 for n,p in previous['scenarios'].items():
  c=current['scenarios'].get(n)
  check(c and all(c['total'][k]>=v for k,v in p['total'].items()) and (p['startedUptime'] is None or c['startedUptime']==p['startedUptime']),'CONTINUATION_PROGRESS_REGRESSION')
 return current
