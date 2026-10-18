"""Passive outer-entry composition; doubles never claim SQL, Docker or ARM64."""
import ast,copy,hashlib,importlib.util,pathlib,sys,types,unittest
from unittest.mock import patch
P=pathlib.Path(__file__).resolve()
def load(name,file):
 s=importlib.util.spec_from_file_location(name,P.with_name(file));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
f=load('cp024_outer_fixtures','continuation-budget.test.py')
def module():return load('cp024_outer_entry','continuation-runner.py')
def gates(m):
 bodies={}
 for name,checks in m.GATES.items():
  bodies[name]={'schema':'cp024-environment-gate-v1' if name=='environment' else 'cp024-execution-gate-v1','name':name,'status':'PASS','project':f.BASE['project'],'sourceSha':'a'*40,'runtimeHash':'b'*64,'requiredOpen':[],'unknowns':[],'evidence':[{'sha256':'c'*64,'scope':'SYNTHETIC MODEL ONLY','environment':'unit double; no physical acceptance'}],'checks':[{'id':k,'status':'PASS','evidenceHash':'c'*64} for k in sorted(checks)]}
 p=bodies['publicationProjection'];p.update(cases={k:{'additional':dict.fromkeys(['artifactFiles','sql','http','journal'],0),'secondsUpperBound':0,'evidenceHash':'c'*64} for k in f.BASE['plannedScenarios']},additionalTotals=dict.fromkeys(['artifactFiles','sql','http','journal'],0),globalSecondsUpperBound=0,resourceEnvelope={'dockerNanoCpus':1000000000,'dockerMemoryBytes':2147483648,'postgresCount':1,'postgresConnections':60,'scopeBytes':2147483648,'admissionCpuExclusive':80,'monitorCpuExclusive':90})
 return bodies,{k:m.digest(v) for k,v in bodies.items()}

def entry(m):
 bodies,pins=gates(m);context={'baseLedger':f.RAW,'baseLedgerHash':f.HASH,'admission':copy.deepcopy(f.ADMISSION),'admissionHash':'a'*64};context['admission']['runtimeHash']='b'*64
 out={'context':context,'gates':bodies,'gatePins':pins,'publication':{'plan':{}},'model':f.m,'plan':{'sourceSha':'a'*40},'token':m._PREPARED,'begun':False};out['seal']=m.preparation_seal(out);return out

class Outer(unittest.TestCase):
 def test_missing_gate_bodies_deny_before_claim(self):
  m=module()
  with self.assertRaisesRegex(AssertionError,'GATE_BODIES'):m.validate_gates({}, {}, 'a'*40,'b'*64,f.BASE)
 def test_gate_hashes_alone_are_not_body_validation(self):
  m=module();pins={k:'a'*64 for k in m.GATES}
  with self.assertRaisesRegex(AssertionError,'GATE_BODY'):m.validate_gates({k:{'status':'PASS'} for k in m.GATES},pins,'a'*40,'b'*64,f.BASE)
 def test_existing_runner_is_the_only_step_browser_relay_and_finish_implementation(self):
  tree=ast.parse(P.with_name('runner.py').read_text(encoding='utf-8'));names={n.name for n in tree.body if isinstance(n,ast.FunctionDef)}
  self.assertIn('continue_v2',names)
  fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='continue_v2');text=ast.unparse(fn)
  for name in ['step','browser','post_gui','require_control','monitor']:self.assertIn(name,text)
  self.assertNotIn('exec(',text);self.assertNotIn('subprocess',text)
 def test_first_effect_cannot_precede_started_monitor_and_control(self):
  m=module();events=[];claim=types.SimpleNamespace(fail=lambda code:events.append('claim-fail'))
  modules=types.SimpleNamespace(admission=types.SimpleNamespace(create_claim=lambda *a,**k:events.append('CLAIM') or claim),publication=types.SimpleNamespace(publish=lambda *a,**k:events.append('PUBLISH')))
  with self.assertRaisesRegex(AssertionError,'MONITOR_REQUIRED'):m.begin({},modules,None,lambda:events.append('control'),lambda _:None)
  self.assertEqual(events,[])
 def test_failed_publication_is_irreversible_without_adoption_or_second_start(self):
  m=module();events=[];claim=types.SimpleNamespace(fail=lambda code:events.append(code));prepared=entry(m)
  adm=types.SimpleNamespace(create_claim=lambda *a,**k:events.append('CLAIM') or claim,RootClaimStore=lambda:None)
  pub=types.SimpleNamespace(validate_prepared=lambda _:True,publish=lambda *a,**k:(_ for _ in ()).throw(AssertionError('PUBLICATION_UNCERTAIN')))
  mon=types.SimpleNamespace(check=lambda:events.append('monitor'),_started=True,first_sample=lambda:events.append('first-positive-sample'))
  with self.assertRaisesRegex(AssertionError,'PUBLICATION_UNCERTAIN'):m.begin(prepared,types.SimpleNamespace(admission=adm,publication=pub,broker=None),mon,lambda:events.append('control'),lambda _:None)
  self.assertIn('OUTER_ENTRY_UNCERTAIN',events);self.assertEqual(events.count('CLAIM'),1)
  with self.assertRaisesRegex(AssertionError,'PREPARATION_REQUIRED'):m.begin(prepared,types.SimpleNamespace(),mon,lambda:None,lambda _:None)
 def test_partial_projection_unknowns_overflow_and_changed_80_90_deny(self):
  m=module()
  changes=[lambda b:b['quality']['unknowns'].append('pending'),lambda b:b['publicationProjection']['cases'].pop(next(iter(f.BASE['plannedScenarios']))),lambda b:b['publicationProjection']['resourceEnvelope'].update(admissionCpuExclusive=90),lambda b:b['publicationProjection']['resourceEnvelope'].update(monitorCpuExclusive=95),lambda b:b['publicationProjection'].update(globalSecondsUpperBound=1800),lambda b:next(iter(b['publicationProjection']['cases'].values())).update(secondsUpperBound=45)]
  for change in changes:
   b,p=gates(m);change(b);p={k:m.digest(v) for k,v in b.items()}
   with self.subTest(change=change),self.assertRaisesRegex(AssertionError,'OUTER_'):m.validate_gates(b,p,'a'*40,'b'*64,f.BASE)
 def test_complete_synthetic_body_is_only_a_contract_model(self):
  m=module();b,p=gates(m);self.assertTrue(m.validate_gates(b,p,'a'*40,'b'*64,f.BASE))
  b['quality']['checks'][0]['status']='NOT VERIFIED';p['quality']=m.digest(b['quality'])
  with self.assertRaisesRegex(AssertionError,'CHECKS'):m.validate_gates(b,p,'a'*40,'b'*64,f.BASE)
 def test_monitor_failure_before_claim_prevents_the_first_effect(self):
  m=module();calls=[];mon=types.SimpleNamespace(_started=True,check=lambda:(_ for _ in ()).throw(AssertionError('RESOURCE_CPU_LIMIT')));prepared=entry(m);mods=types.SimpleNamespace(publication=types.SimpleNamespace(validate_prepared=lambda _:True),admission=types.SimpleNamespace(RootClaimStore=lambda:calls.append('CLAIM')))
  with self.assertRaisesRegex(AssertionError,'RESOURCE_CPU_LIMIT'):m.begin(prepared,mods,mon,lambda:None,lambda _:None)
  self.assertEqual(calls,[])
 def test_transport_timeout_never_becomes_fin_and_consumes_live_root(self):
  m=module();calls=[];claim=types.SimpleNamespace(closed=False,effect_ready=True,fail=lambda c:calls.append(c));broker=types.SimpleNamespace(fail=lambda c:calls.append(c),stop=lambda:calls.append('stop'));transport=types.SimpleNamespace(clients_finished=lambda _:False,stop=lambda:{'serverThreadEnded':True,'clientFIN':'NOT VERIFIED'})
  out=m.finish_transport({'claim':claim,'broker':broker,'transport':transport},None);self.assertEqual(out['failure'],'OUTER_TRANSPORT_NOT_VERIFIED');self.assertTrue(claim.closed);self.assertFalse(claim.effect_ready)
 def test_real_capsule_imports_without_publishing_files_or_running_any_process(self):
  m=module();pub=load('cp024_outer_publication','continuation-publication.py');names=['resource-sample.py','budget-limits.json','host.py','resource-monitor.py','continuation-budget.py','continuation-admission.py','continuation-broker.py','continuation-port.py','controller.py','runner.py'];files={'tests/qa/cp019/'+n:P.with_name(n).read_bytes() for n in names};prepared={'files':files,'effective':{'entries':[{'path':k,'sha256':m.digest(v)} for k,v in files.items()]}}
  before=set(sys.modules)
  try:
   with patch.object(pub,'validate_prepared',return_value=True),patch('subprocess.check_output',side_effect=AssertionError('PROCESS_FORBIDDEN')),patch.object(pathlib.Path,'mkdir',side_effect=AssertionError('WRITE_FORBIDDEN')),patch('os.open',side_effect=AssertionError('FILE_OPEN_FORBIDDEN')):
    modules=m.capsule_modules(pub,prepared)
   self.assertIsNone(modules.host.CONTINUATION_CONTEXT);self.assertEqual(modules.host.CEILINGS,{'artifactFiles':8192,'sql':200000,'http':300,'journal':1000});self.assertEqual(modules.host.CASE_LIMITS['sql'],8192);self.assertFalse(hasattr(modules.runner,'relay'));self.assertEqual(modules.host.__file__,str(pub.RUNTIME/'tests/qa/cp019/host.py'))
  finally:
   for name in set(sys.modules)-before:
    if name.startswith('cp024_root_capsule_'):sys.modules.pop(name)
 def test_capsule_source_hash_mismatch_denies_before_compilation_or_effects(self):
  m=module();pub=load('cp024_outer_publication_negative','continuation-publication.py');prepared={'files':{'tests/qa/cp019/resource-sample.py':b'raise RuntimeError("EXECUTED")'},'effective':{'entries':[{'path':'tests/qa/cp019/resource-sample.py','sha256':'a'*64}]}}
  with patch.object(pub,'validate_prepared',return_value=True),self.assertRaisesRegex(AssertionError,'CAPSULE_SOURCE'):m.capsule_modules(pub,prepared)
 def test_changed_prepared_plan_denies_before_claim(self):
  m=module();prepared=entry(m);prepared['plan']['sourceSha']='d'*40;calls=[]
  with self.assertRaisesRegex(AssertionError,'PREPARATION_REQUIRED'):m.begin(prepared,types.SimpleNamespace(),types.SimpleNamespace(_started=True),lambda:calls.append('EFFECT'),lambda _:None)
  self.assertEqual(calls,[])
 def test_endpoint_or_fin_preflight_failure_denies_claim_and_stops_only_own_relay(self):
  m=module();b,p=gates(m);calls=[];runner=types.SimpleNamespace(initialize=lambda *a:calls.append('initialize'),monitor=None,relay=types.SimpleNamespace(stop=lambda:calls.append('relay-stop')));mods=types.SimpleNamespace(host=None,controller=None,runner=runner);pub=types.SimpleNamespace(validate_prepared=lambda _:True);prepared={'plan':{'runtimeHash':'b'*64}}
  with patch.object(m,'capsule_modules',return_value=mods),patch.object(m,'physical_entry',side_effect=AssertionError('OUTER_SOURCE_OOM')),self.assertRaisesRegex(AssertionError,'SOURCE_OOM'):m.launch(f.m,pub,prepared,f.RAW,f.HASH,{},b,p,{'sourceSha':'a'*40})
  self.assertEqual(calls,['initialize','relay-stop'])
 def test_changed_actual_v1_ledger_denies_before_claim_and_other_preflight(self):
  m=module();root=pathlib.Path('/opt/mecanet-qa-p1l3-r03');target=pathlib.Path(str(root)+'-target');h=types.SimpleNamespace(ROOT=root,TARGET=target);pub=types.SimpleNamespace(ROOT=root,TARGET=target,private_raw=lambda *a:b'changed')
  with self.assertRaisesRegex(AssertionError,'V1_CHANGED'):m.physical_entry(h,pub,{}, {},{'parentLedgerHash':f.HASH})
 def test_missing_helper_and_null_hash_cannot_match_each_other_before_claim(self):
  m=module();b,p=gates(m);b['environment'].update(sealedInputs=[],sourceContainerId=f.ADMISSION['sourceContainerId']);p['environment']=m.digest(b['environment']);plan={'schema':'cp021-controller-plan-v1','sourceSha':'a'*40,'helpers':dict.fromkeys(m.HELPERS,None),'nodeExecutableHash':'d'*64,'browser':{}};context=copy.deepcopy(entry(m)['context']);a=context['admission'];a.update(controllerHash=m.digest(plan),sealedInputsHash=m.digest([]),priorRunReportHash=m.PRIOR_REPORT);context['admissionHash']=m.digest(a);prepared={'plan':{'runtimeHash':'b'*64,'costs':{}},'effective':{'sourceSha':'a'*40,'codeSha':'a'*40,'entries':[]}}
  with self.assertRaisesRegex(AssertionError,'SOURCE_PLAN'):m.prepare(f.m,types.SimpleNamespace(validate_prepared=lambda _:True),prepared,context,b,p,plan)

if __name__=='__main__':unittest.main()
