"""Root boundary models only. No Docker, PostgreSQL, SSH or Linux custody claim."""
import copy,importlib.util,json,pathlib,types,unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('cold_host',pathlib.Path(__file__).with_name('target-cold-host.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
H='a'*64;S='b'*40;ID=lambda n:'00000000-0000-4000-8000-'+str(n).zfill(12)
SOURCE=pathlib.Path('/opt/mecanet-qa-p1l3-r03');TARGET=pathlib.Path(str(SOURCE)+'-target')
PROFILES={s:(100000000,128*1024**2,s+'@sha256:'+str(i+1)*64) for i,s in enumerate(['postgres','api1','api2','web','worker','harness','probe','controller-tool','offline-pg'])}
def material():return {'recoveryId':ID(1),'controllerOwner':ID(2),'source':{'project':SOURCE.name},'target':{'project':TARGET.name,'generation':ID(3),'apiOwners':{'api1':ID(4),'api2':ID(5)},'workerClockOwner':ID(6),'webOwner':ID(7)}}
def owner(m,s):return m['target']['apiOwners'][s] if s in ['api1','api2'] else m['target']['workerClockOwner'] if s=='worker' else m['target']['webOwner'] if s=='web' else m['controllerOwner']

class Files:
 def __init__(self):self.values={};self.effects=[]
 def add(self,path,value):self.values[path]=copy.deepcopy(value);return c.digest(value)
 def read(self,path,uid=0,limit=262144,mode=0o400,json_value=True):
  if path not in self.values:raise FileNotFoundError(str(path))
  value=self.values[path];raw=c.canonical(value) if not isinstance(value,bytes) else value
  return (copy.deepcopy(value) if json_value else raw),c.digest(raw)
 def write(self,path,raw,mode,uid):
  self.effects.append(('publish',path.name));assert path not in self.values,'REWRITE';self.values[path]=json.loads(raw)
 def exists(self,path):return path in self.values
 def glob(self,path,pattern):return [p for p in self.values if p.parent==path and p.match(pattern)]

class MainModel:
 def __init__(self):
  self.fs=Files();self.ROOT=SOURCE;self.TARGET=TARGET;self.PROFILES=PROFILES;self.m=material();self.calls=[];cpu,mem,image=PROFILES['postgres'];self.cid='c'*64
  self.ref={'schema':'target-postgres-created-v1','project':TARGET.name,'containerId':self.cid,'ownerId':ID(2),'service':'postgres','imageRef':image,'nanoCpus':cpu,'memory':mem,'generation':ID(3),'recoveryId':ID(1),'dataPath':str(TARGET/'data'),'composeHash':H,'state':'CREATED BEFORE START/SQL'};self.fs.add(TARGET/'master/postgres-created.json',self.ref)
  self.pg={'id':self.cid,'project':TARGET.name,'service':'postgres','ownerId':ID(2),'imageRef':image,'nanoCpus':cpu,'memory':mem,'running':True,'pid':12,'status':'running','exitCode':0,'finishedAt':'0001-01-01T00:00:00Z'};self.current=[self.pg]
  self.bridge=types.SimpleNamespace(read_private=self.fs.read,validate_created_postgres=lambda h,cid:self.calls.append(('mount',cid)))
 def target_bridge(self):return self.bridge
 def material_owned(self):return self.m
 def own(self,path):assert path in [SOURCE,TARGET]
 def preserve(self):self.calls.append(('preserve',))
 def facts(self):return copy.deepcopy(self.current)
 def inspect_container(self,cid):return copy.deepcopy(next(x for x in self.current if x['id']==cid))
 def expected_owners(self):return {TARGET.name:{s:owner(self.m,s) for s in PROFILES},SOURCE.name:{s:owner(self.m,s) for s in PROFILES}}
 def owned_identity(self,a,o):return a['ownerId']==o[a['project']][a['service']] and (a['nanoCpus'],a['memory'],a['imageRef'])==PROFILES[a['service']]
 def verify_main_target_references(self,rows):self.calls.append(('references',))
 def write_plain(self,*a):return self.fs.write(*a)
 def run_bounded(self,*args,**kw):
  self.calls.append(args);assert args[:4]==('docker','stop','--time','30');assert args[4:]==(self.cid,);self.pg.update(running=False,pid=0,status='exited',exitCode=0,finishedAt='2026-10-15T00:00:01Z')
 def guard_effect(self,*a):raise AssertionError('NO_HEADROOM')
 def ledger_charge(self,*a):raise AssertionError('NO_BUDGET_BEFORE_STOP')
 def set_host_case(self,*a):raise AssertionError('NO_CASE_BEFORE_STOP')
 def enter_runtime_case(self,*a):raise AssertionError('NO_REENTER_BEFORE_STOP')

class EmptyModel(MainModel):
 def __init__(self):
  super().__init__();self.root=TARGET/'variants/roster-empty';self.rows={};self.services={};self.creates=[];self.starts=[];self.admission_closed=False;self.create_cut=None;self.start_cut=None;self.cuts=set();self.mount_bad=False
  self.em=copy.deepcopy(self.m);self.em['recoveryId']=ID(31);self.em['target']['generation']=ID(33);self.em['target']['apiOwners']={'api1':ID(34),'api2':ID(35)};self.em['target'].update(workerClockOwner=ID(36),webOwner=ID(37))
  addition={'kind':'roster-empty','effectiveMaterialHash':c.digest(self.em)};self.context={'kind':'roster-empty','effectiveMaterial':self.em,'addition':addition,'additionHash':c.digest(addition)};self.fs.add(TARGET/'master/variant-roster-empty-context.json',self.context);self.fs.add(self.root/'master/context.json',{'schema':'target-variant-root-v1','kind':'roster-empty','project':TARGET.name,'contextHash':c.digest(self.context),'additionHash':self.context['additionHash']})
  resource={'containerId':'f'*64};plan={'schema':'cp019-empty-readiness-plan-v1','database':'mecanet_control_empty','kind':'roster-empty','variantLineageHash':self.context['additionHash'],'custodyHash':c.digest(self.em),'sourceSha':S,'targetResource':resource,'manifest':{'runId':ID(31),'generation':ID(33),'expectedTenants':[]}}
  ph=self.fs.add(self.root/'master/readiness-plan.json',plan);self.fs.add(self.root/'secrets/readiness-plan.json',plan);self.authority={'schema':'cp021-readiness-authority-v1','kind':'roster-empty','caseName':'ready-empty','sourceSha':S,'planHash':ph,'targetResource':resource,'contextHash':H};self.fs.add(self.root/'master/readiness-authority.json',self.authority)
  configs={}
  for s in ['api1','api2','clock']:configs[s]=self.fs.add(self.root/'secrets'/('readiness-'+s+'.json'),{'planHash':ph,'variantLineageHash':self.context['additionHash'],'generation':ID(33),'recovery':{'mode':'NORMAL','runId':ID(31)}})
  self.prepared={'schema':'cp019-empty-prepared-v1','database':'mecanet_control_empty','kind':'roster-empty','caseName':'ready-empty','planHash':ph,'generation':ID(33),'recoveryId':ID(31),'sourceSha':S,'variantLineageHash':self.context['additionHash'],'originalDataPreserved':True,'health':'NOT VERIFIED','configs':configs};self.job('prepare-empty',self.prepared,40)
  self.view=types.SimpleNamespace(TARGET=self.root,own=self.admit,references=lambda:self.admit() or list(self.rows.values()))
  self.provider=types.SimpleNamespace(VariantHost=lambda h,k:self.view,load_context=lambda h,k:self.admit() or (self.context,c.digest(self.context)),create_service=self.create,start_service=self.start,matches=lambda actual,ref,profiles:c.profile_match(self,actual,ref),verify_mounts=self.mounts,owners=lambda m:{s:owner(m,s) for s in PROFILES})
 def variant_bridge(self):return self.provider
 def admit(self,*args):
  if self.admission_closed:raise AssertionError('ADMISSION_CLOSED')
 def set_host_case(self,name):assert name=='ready-empty';self.calls.append(('case',name))
 def enter_runtime_case(self,scope,name):assert (scope,name)==('target-window','ready-empty');self.calls.append(('enter',scope,name))
 def job(self,action,receipt,n):
  inv=ID(n);rh=self.fs.add(self.root/'secrets'/('readiness-prepared.json' if action=='prepare-empty' else 'readiness-http-unready.json'),receipt);cfg={'action':action,'invocationId':inv,'planHash':self.authority['planHash'],'contextHash':H};cfgh=self.fs.add(self.root/'master'/('readiness-config-'+inv+'.json'),cfg);service='harness' if action=='prepare-empty' else 'probe';created={'schema':'controller-job-created-v1','state':'CREATED BEFORE START/SQL','commandHash':c.digest(['node','tests/qa/cp019/readiness-variant.mjs',action]),'project':TARGET.name,'jobId':inv,'containerId':str(n)[0]*64,'ownerId':ID(2),'service':service,'imageDigest':PROFILES[service][2].split('@',1)[1]};ch=self.fs.add(self.root/'evidence/jobs'/(inv+'-created.json'),created);end={'schema':'controller-job-end-v1',**{k:created[k] for k in ['jobId','containerId','project','service','ownerId']},'createdReceiptHash':ch,'exitCode':0,'containerStopped':True,'sqlAbsence':'NOT VERIFIED','finishedAt':'2026-10-15T00:00:01Z'};eh=self.fs.add(self.root/'evidence/jobs'/(inv+'-end.json'),end)
  self.fs.add(self.root/'master'/('readiness-job-'+inv+'.json'),{'schema':'cp021-readiness-job-reference-v1','jobId':inv,'containerId':created['containerId'],'createdHash':ch,'cfgHash':cfgh});self.fs.add(self.root/'master'/('readiness-result-'+inv+'.json'),{'schema':'cp021-readiness-host-result-v1','action':action,'kind':'roster-empty','jobId':inv,'receiptHash':rh,'createdHash':ch,'endHash':eh,'planHash':self.authority['planHash'],'lineageHash':self.context['additionHash'],'generation':ID(33),'recoveryId':ID(31)});self.fs.add(self.root/'evidence/jobs'/(inv+'-output.log'),c.canonical({'type':'cp019-readiness-job','action':action,'kind':'roster-empty','receiptHash':rh,'planHash':self.authority['planHash'],'secretOutput':False,'physicalAcceptance':'NOT VERIFIED'}))
 def unready(self):
  r={k:v for k,v in self.prepared.items() if k in ['kind','caseName','planHash','generation','recoveryId','sourceSha','variantLineageHash']};r.update(schema='cp019-readiness-http-v1',phase='unready',expectedReadyStatus=503,pendingHttp=0,tenantAuthorization=False,instances=[{'instance':s,'live':200,'ready':503,'probes':2} for s in ['api1','api2']]);self.job('probe-unready',r,41)
 def create(self,h,kind,service):
  self.admit();assert kind=='roster-empty';assert service not in self.rows,'SECOND_CREATE';cpu,mem,image=PROFILES[service];cid=str(len(self.rows)+1)*64;r={'schema':'target-variant-service-created-v1','project':TARGET.name,'kind':kind,'service':service,'containerId':cid,'ownerId':owner(self.em,service),'imageRef':image,'nanoCpus':cpu,'memory':mem,'generation':ID(33),'recoveryId':ID(31),'lineageHash':self.context['additionHash'],'state':'CREATED BEFORE START/SQL'};self.rows[service]=r;self.fs.add(self.root/'master/services'/(service+'-'+cid+'.json'),r);self.services[cid]={'id':cid,**{k:r[k] for k in ['project','service','ownerId','imageRef','nanoCpus','memory']},'running':False,'pid':0,'status':'created','exitCode':0,'finishedAt':'0001-01-01T00:00:00Z'};self.creates.append(service)
  if self.create_cut==service and service not in self.cuts:self.cuts.add(service);raise RuntimeError('CUT_CREATED')
  return r
 def start(self,h,kind,service,cid):
  self.admit();assert len(self.rows)==4;assert self.root/'master/empty-runtime-created.json' in self.fs.values;assert service not in self.starts,'SECOND_START';actual=self.services[cid];assert actual['status']=='created' and actual['pid']==0;self.starts.append(service);actual.update(running=True,pid=10,status='running',startedAt='2026-10-15T00:00:00Z')
  if self.start_cut==service and service not in self.cuts:self.cuts.add(service);raise RuntimeError('CUT_STARTED')
 def inspect_container(self,cid):return copy.deepcopy(self.services[cid]) if cid in self.services else super().inspect_container(cid)
 def mounts(self,*args):
  if self.mount_bad:raise AssertionError('BAD_MOUNT')
 def run_bounded(self,*args,**kw):
  assert args[:4]==('docker','stop','--time','30');self.calls.append(args)
  for cid in args[4:]:self.services[cid].update(running=False,pid=0,status='exited',exitCode=0,finishedAt='2026-10-15T00:00:01Z')

class Boundaries(unittest.TestCase):
 def patches(self,fs):
  return patch.multiple(pathlib.Path,exists=lambda p:fs.exists(p),is_symlink=lambda p:False,glob=lambda p,pattern:fs.glob(p,pattern))
 def test_main_pg_stop_uses_exact_root_reference_and_persists_positive_end_after_stop(self):
  h=MainModel()
  with self.patches(h.fs):
   result=c.stop_main_pg(h);self.assertEqual(result['containerId'],h.cid);self.assertFalse(h.pg['running']);self.assertIn(TARGET/'master/postgres-end.json',h.fs.values);self.assertEqual(sum(x[:2]==('docker','stop') for x in h.calls),1)
   self.assertEqual(c.stop_main_pg(h),result);self.assertEqual(sum(x[:2]==('docker','stop') for x in h.calls),1)
 def test_running_business_or_unknown_sql_controller_blocks_main_pg_stop(self):
  for service in ['api1','harness']:
   h=MainModel();cpu,mem,image=PROFILES[service];h.current.append({'id':'d'*64,'project':TARGET.name,'service':service,'ownerId':owner(h.m,service),'imageRef':image,'nanoCpus':cpu,'memory':mem,'running':True,'pid':1,'status':'running'})
   with self.patches(h.fs),self.assertRaises(AssertionError):c.stop_main_pg(h)
   self.assertFalse(any(x[:2]==('docker','stop') for x in h.calls));self.assertTrue(h.pg['running'])
 def test_replaced_pg_or_wrong_bind_never_stops_a_container(self):
  for edit in [lambda h:h.pg.update(ownerId=ID(99)),lambda h:h.pg.update(id='f'*64),lambda h:setattr(h.bridge,'validate_created_postgres',lambda *_:(_ for _ in ()).throw(AssertionError('BAD_BIND')))]:
   h=MainModel();edit(h)
   with self.patches(h.fs),self.assertRaises((AssertionError,StopIteration)):c.stop_main_pg(h)
   self.assertFalse(any(x[:2]==('docker','stop') for x in h.calls))
 def test_receipt_budget_denial_cannot_prevent_emergency_pg_stop_or_claim_a_confirmed_end(self):
  h=MainModel();h.write_plain=lambda *a:(_ for _ in ()).throw(AssertionError('ARTIFACT_CAP'))
  with self.patches(h.fs),self.assertRaisesRegex(AssertionError,'ARTIFACT_CAP'):c.stop_main_pg(h)
  self.assertFalse(h.pg['running']);self.assertNotIn(TARGET/'master/postgres-end.json',h.fs.values)
 def test_empty_all_four_root_references_precede_first_start_and_worker_waits_for_real_unready_job(self):
  h=EmptyModel()
  with self.patches(h.fs):
   c.empty_runtime(h,'create');self.assertEqual(h.creates,list(c.BUSINESS));self.assertEqual(h.starts,[]);c.empty_runtime(h,'start-business');self.assertEqual(h.starts,['api1','api2','web']);self.assertEqual(h.services[h.rows['worker']['containerId']]['status'],'created')
   with self.assertRaises(FileNotFoundError):c.empty_runtime(h,'start-worker')
   self.assertEqual(h.starts,['api1','api2','web']);h.unready();c.empty_runtime(h,'start-worker');self.assertEqual(h.starts,['api1','api2','web','worker']);c.empty_runtime(h,'start-worker');self.assertEqual(h.starts,['api1','api2','web','worker'])
 def test_empty_partial_create_and_lost_start_ack_resume_original_cids_without_new_ids_or_restarts(self):
  h=EmptyModel();h.create_cut='api2'
  with self.patches(h.fs):
   with self.assertRaisesRegex(RuntimeError,'CUT_CREATED'):c.empty_runtime(h,'create')
   original=copy.deepcopy(h.rows);self.assertEqual(h.starts,[]);c.empty_runtime(h,'create');self.assertTrue(all(h.rows[k]==v for k,v in original.items()));h.start_cut='api1'
   with self.assertRaisesRegex(RuntimeError,'CUT_STARTED'):c.empty_runtime(h,'start-business')
   c.empty_runtime(h,'start-business');self.assertEqual(h.starts,['api1','api2','web']);self.assertEqual(len(h.creates),4)
 def test_empty_prepared_config_or_missing_root_job_end_blocks_any_create(self):
  for edit in [lambda h:h.fs.values[h.root/'secrets/readiness-api1.json'].update(generation=ID(99)),lambda h:h.fs.values.pop(h.root/'evidence/jobs'/(ID(40)+'-end.json'))]:
   h=EmptyModel();edit(h)
   with self.patches(h.fs),self.assertRaises((AssertionError,FileNotFoundError)):c.empty_runtime(h,'create')
   self.assertEqual(h.creates,[]);self.assertEqual(h.starts,[])
 def test_empty_terminated_service_is_never_restarted_and_foreign_mount_cannot_start(self):
  for kind in ['terminated','mount']:
   h=EmptyModel()
   with self.patches(h.fs):
    c.empty_runtime(h,'create')
    if kind=='terminated':h.services[h.rows['api1']['containerId']].update(status='exited',pid=0,running=False,exitCode=0,finishedAt='2026-10-15T00:00:01Z')
    else:h.mount_bad=True
    with self.assertRaises(AssertionError):c.empty_runtime(h,'start-business')
   self.assertEqual(h.starts,[])
 def test_empty_stop_ignores_admission_budget_and_never_stops_other_consumers(self):
  h=EmptyModel()
  with self.patches(h.fs):
   c.empty_runtime(h,'create');c.empty_runtime(h,'start-business');h.unready();c.empty_runtime(h,'start-worker');h.admission_closed=True;before=copy.deepcopy(h.pg);h.set_host_case=lambda *a:self.fail('must not set case before stop');h.enter_runtime_case=lambda *a:self.fail('must not enter before stop')
   result=c.empty_runtime(h,'stop');self.assertEqual(result['containerFIN'],'PASS');self.assertEqual(result['sqlFIN'],'NOT VERIFIED');self.assertEqual(len(result['containers']),4);self.assertEqual(h.pg,before);self.assertEqual(c.empty_runtime(h,'stop'),result);self.assertEqual(sum(x[:2]==('docker','stop') for x in h.calls),1)
 def test_empty_stop_rejects_replaced_cid_and_never_claims_fin_for_created_or_uncertain_exit(self):
  h=EmptyModel()
  with self.patches(h.fs):
   c.empty_runtime(h,'create');c.empty_runtime(h,'start-business')
   # Worker has never STARTed. Running business consumers are still stopped,
   # while no fabricated fourth exit or Node END authority can be published.
   with self.assertRaisesRegex(AssertionError,'END_UNKNOWN'):c.empty_runtime(h,'stop')
   self.assertTrue(all(not a['running'] for a in h.services.values()));self.assertNotIn(h.root/'master/empty-runtime-stop.json',h.fs.values)
  bad=EmptyModel()
  with self.patches(bad.fs):
   c.empty_runtime(bad,'create');bad.services[bad.rows['api1']['containerId']]['ownerId']=ID(99)
   with self.assertRaisesRegex(AssertionError,'PROCESS_CHANGED'):c.empty_runtime(bad,'stop')
   self.assertFalse(any(x[:2]==('docker','stop') for x in bad.calls))
 def test_empty_unready_wrong_generation_or_pending_http_cannot_start_worker(self):
  for change in [{'generation':ID(99)},{'pendingHttp':1}]:
   h=EmptyModel();h.unready();receipt=h.fs.values[h.root/'secrets/readiness-http-unready.json'];receipt.update(change);h.job('probe-unready',receipt,41)
   with self.patches(h.fs):
    c.empty_runtime(h,'create');c.empty_runtime(h,'start-business')
    with self.assertRaises(AssertionError):c.empty_runtime(h,'start-worker')
   self.assertNotIn('worker',h.starts)
 def test_empty_stop_publication_failure_occurs_after_all_four_exits_without_fabricating_sql_fin(self):
  h=EmptyModel()
  with self.patches(h.fs):
   c.empty_runtime(h,'create');c.empty_runtime(h,'start-business');h.unready();c.empty_runtime(h,'start-worker');h.admission_closed=True;h.write_plain=lambda *a:(_ for _ in ()).throw(AssertionError('ARTIFACT_CAP'))
   with self.assertRaisesRegex(AssertionError,'ARTIFACT_CAP'):c.empty_runtime(h,'stop')
   self.assertTrue(all(not a['running'] and a['pid']==0 for a in h.services.values()));self.assertNotIn(h.root/'master/empty-runtime-stop.json',h.fs.values)
 def test_import_and_unknown_action_do_not_touch_resources_or_choose_ids(self):
  with patch.object(pathlib.Path,'open',side_effect=AssertionError('IMPORT_IO')):
   other=importlib.util.module_from_spec(spec);spec.loader.exec_module(other)
  with self.assertRaisesRegex(AssertionError,'ACTION'):c.empty_runtime(types.SimpleNamespace(),'restart')

if __name__=='__main__':unittest.main()
