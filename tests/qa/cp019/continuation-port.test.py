"""HostPort composition models, not real PostgreSQL or runner execution."""
import copy,importlib.util,json,pathlib,types,unittest
P=pathlib.Path(__file__).resolve()
def load(name,file):s=importlib.util.spec_from_file_location(name,file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
a=load('cp024_port_admission',P.with_name('continuation-admission.test.py'));p=load('cp024_port',P.with_name('continuation-port.py'));c=load('cp024_port_controller',P.with_name('controller.py'))
def fixture(program='prepare'):
 environment={'schema':'cp024-environment-gate-v1','status':'PASS','project':p.ROOT.name,'sourceContainerId':a.f.f.ADMISSION['sourceContainerId']};context=a.f.context();pins={k:'a'*64 for k in ['quality','independentReview','transport','environment','publicationProjection']};pins['environment']=p.digest(environment);store=a.MemoryStore();claim=a.a.create_claim(a.f.f.m,context,store,pins,identity=lambda:{'pid':123,'procStart':'456'},clock=lambda:a.f.f.NOW);claim.effect_ready=True;state=copy.deepcopy(claim.body['initialState']);files={};calls=[]
 def charge(kind):
  nonlocal state
  state=a.f.f.m.update(state,*[context[k] for k in ['baseLedger','baseLedgerHash','admission']],'host-bootstrap',a.f.f.NOW,kind=kind)
 broker=types.SimpleNamespace(root_snapshot=lambda:copy.deepcopy(state),fail=lambda x:calls.append(('abort',x)));h=types.SimpleNamespace(ROOT=p.ROOT,TARGET=pathlib.Path(str(p.ROOT)+'-target'),CONTINUATION_EFFECT_RECEIPT=claim,CONTINUATION_BROKER=broker,ledger_charge=charge,HOST_CASE='host-bootstrap',uptime=lambda:a.f.f.NOW,prepare=lambda stage:calls.append(('existing-prepare',stage)) or {'prepared':stage})
 def write(path,raw,mode):
  if str(path) in files:raise FileExistsError('FRONTIER_EXISTS')
  files[str(path)]=raw;return p.digest(raw)
 execute=(lambda trace:(trace.preflight(),trace.prepare('foundation'))) if program=='prepare' else (lambda trace:(trace.preflight(),trace.source_pg_start()))
 if program=='empty_stop':execute=lambda trace:(trace.preflight(),trace.empty_runtime('roster-empty','create'),trace.empty_stop('roster-empty'))
 session={'host':h,'claim':claim,'broker':broker,'postgresStarted':False,'sql':0,'http':0};publication=types.SimpleNamespace(exclusive_file=write);step=lambda name,fn:calls.append(('step',name)) or fn();model=types.SimpleNamespace(HostPort=c.HostPort,execute=execute);port=p.make_port(model,session,step,lambda:None,lambda:None,environment,publication);port.action_cursor=2 if program=='empty_stop' else 1 # Component fixture only: no actual preflight/gate is asserted.
 return h,claim,port,calls,files,session,environment,publication,step
class Port(unittest.TestCase):
 def test_existing_hostport_methods_are_inherited_and_each_frontier_is_immutable(self):
  h,claim,port,calls,files,*_=fixture();result=port.prepare('foundation');self.assertEqual(result,{'prepared':'foundation'});self.assertIn(('existing-prepare','foundation'),calls);self.assertEqual(len(files),1);frontier=json.loads(next(iter(files.values())));self.assertEqual(frontier['label'],'prepare-foundation-002');self.assertEqual(frontier['ledger']['total']['artifactFiles'],643);self.assertEqual(frontier['outcome'],'PASS')
 def test_repeating_a_confirmed_root_frontier_is_not_a_new_attempt(self):
  h,claim,port,calls,files,*_=fixture();port.prepare('foundation')
  with self.assertRaisesRegex(AssertionError,'PROGRAM_ORDER'):port.prepare('foundation')
  self.assertTrue(claim.closed);self.assertEqual(len(files),1);self.assertIn(('abort','CONTINUATION_PROGRAM_UNCERTAIN'),calls);self.assertEqual(calls.count(('existing-prepare','foundation')),1)
 def test_unbound_environment_or_missing_positive_transport_refuses_execution(self):
  h,claim,port,calls,files,session,environment,publication,step=fixture();claim.effect_ready=False
  with self.assertRaisesRegex(AssertionError,'PORT_TRANSPORT'):port.prepare('foundation')
  self.assertNotIn(('existing-prepare','foundation'),calls)
  for key,value in [('status','NOT VERIFIED'),('sourceContainerId','b'*64),('project','other')]:
   with self.assertRaisesRegex(AssertionError,'PORT_ENVIRONMENT'):p.make_port(c,session,step,lambda:None,lambda:None,{**environment,key:value},publication)
 def test_old_source_identity_mismatch_never_dispatches_a_pg_restart(self):
  h,claim,port,calls,files,*_=fixture('source_pg_start');h.set_host_case=lambda name:None;h.own=lambda:None;h.preserve=lambda:{'result':'PASS'};h.inspect_container=lambda cid:{'ownerId':'other','status':'exited','running':False,'pid':0,'exitCode':0,'finishedAt':a.f.f.ADMISSION['sourceFinishedAt']};h.start_source_service=lambda *args,**kw:calls.append(('START',))
  with self.assertRaisesRegex(AssertionError,'SOURCE_CHANGED'):port.source_pg_start()
  self.assertNotIn(('START',),calls);self.assertEqual(files,{})
 def test_the_existing_empty_stop_alias_is_one_closed_action_not_a_new_program_step(self):
  h,claim,port,calls,files,*_=fixture('empty_stop');h.cold_bridge=lambda:types.SimpleNamespace(empty_runtime=lambda host,action:calls.append(('legacy-empty','roster-empty',action)) or {'stopped':True});self.assertEqual(port.empty_stop('roster-empty'),{'stopped':True});self.assertEqual(calls.count(('legacy-empty','roster-empty','stop')),1);self.assertEqual(len(files),1)
if __name__=='__main__':unittest.main()
