"""Read-only continuation models; no Docker, SSH, secrets or live QA state."""
import copy, hashlib, importlib.util, json, pathlib, stat, subprocess, types, unittest, shutil, sys
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('resume_state',pathlib.Path(__file__).with_name('resume-state.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
SOURCE=pathlib.Path('/opt/mecanet-qa-p1l3-r02');TARGET=pathlib.Path(str(SOURCE)+'-target')
SHA='ca15ed980de8167cc6144285a43b85cfbf71a7d3';HASH='a'*64
LIMITS={'artifactFiles':8192,'sql':200000,'http':300,'journal':1000}
CASE={'artifactFiles':2000,'sql':8192,'http':80,'journal':1000}

def canon(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def digest(x):return hashlib.sha256(x if isinstance(x,bytes) else canon(x)).hexdigest()

class Model:
 def __init__(self):
  self.ROOT=SOURCE;self.TARGET=TARGET;self.CEILINGS=LIMITS;self.CASE_LIMITS=CASE;self.SCENARIO_COUNT=135;self.BUDGET_PLAN_SHA=HASH;self.calls=[];self.now=1250
  self.PROFILES={s:(100000000,128*1024**2,s+'@sha256:'+str(i+1)*64) for i,s in enumerate(['postgres','worker','api1','api2','web','controller-tool','harness','probe','offline-pg'])}
  self.owners={p.name:{s:p.name+'-'+s for s in self.PROFILES} for p in [SOURCE,TARGET]};self.current=[]
  self.plan={'schema':'cp021-controller-plan-v1','sourceSha':SHA,'helpers':{n:HASH for n in r.HELPERS},'nodeExecutableHash':HASH,'browser':{}}
  self.ledger={'schema':'cp019-budget-v1','project':SOURCE.name,'startedUptime':1000,'sequence':636,'total':{'artifactFiles':636,'sql':0,'http':0,'journal':0},'plannedScenarios':{('host-pg-start' if i==0 else 'case-'+str(i)):CASE.copy() for i in range(135)},'scenarios':{'host-stage':{'startedUptime':1001,'limits':CASE.copy(),'total':{'artifactFiles':636,'sql':0,'http':0,'journal':0}}}}
  entries=[{'path':'tests/qa/cp019/'+('runner.py' if n=='run.py' else n),'sha256':HASH,'bytes':1} for n in sorted(r.HELPERS)];artifact_hash=digest(entries)
  self.values={};self.material={'artifactDigest':artifact_hash,'controllerOwner':'controller','source':{'project':SOURCE.name},'target':{'project':TARGET.name}}
  self.artifact={'sourceSha':SHA,'codeSha':SHA,'digest':'sha256:'+artifact_hash,'entries':entries}
  self.material_hash=self.add(SOURCE/'master/material.json',self.material)
  self.add(SOURCE/'master/material-ref.json',{'materialHash':self.material_hash})
  self.add(SOURCE/'staging/artifact.json',self.artifact)
  for root in [SOURCE,TARGET]:
   self.add(root/'owner.json',{'project':root.name})
   subnets=['10.77.61.0/24','10.77.62.0/24'] if root==SOURCE else ['10.77.63.0/25','10.77.63.128/25']
   networks={k:{'name':root.name+'-'+k,'internal':True,'enable_ipv6':False,'driver_opts':{'com.docker.network.bridge.gateway_mode_ipv4':'isolated'},'ipam':{'config':[{'subnet':subnet}]}} for k,subnet in zip(['data','front'],subnets)}
   self.add(root/'compose.json',{'name':root.name,'services':{s:{'networks':['data'] if s not in ['api1','api2','web'] else ['data','front']} for s in self.PROFILES},'networks':networks})
   self.add(root/'config/ca.crt',b'CERTIFICATE')
   self.add(root/'tls/web/server.crt',b'TLS')
   self.add(root/'secrets/bootstrap',b'private-model-sentinel')
  self.add(SOURCE/'evidence/preflight.json',{'consumers':[{'id':str(i).zfill(64),'project':'foreign','running':False} for i in range(27)]})
  self.current=copy.deepcopy(self.values[SOURCE/'evidence/preflight.json'][0]['consumers'])
  self.extension={'schema':'cp021-controller-extension-v1','runtimeSourceSha':SHA,'parentPlanHash':digest(self.plan),'artifactDigest':'sha256:'+artifact_hash,'originalLedgerAnchor':{'startedUptime':1000,'sequence':636,'registryHash':HASH,'total':copy.deepcopy(self.ledger['total'])},'preservedFiles':[]}
  self.pinned=set(self.values)-{SOURCE/'evidence/preflight.json'};self.repin();self.networks=[]
 def add(self,path,value,uid=0,mode=0o600):
  raw=value if isinstance(value,bytes) else canon(value);self.values[path]=(copy.deepcopy(value),raw,uid,mode);return digest(raw)
 def repin(self):self.extension['preservedFiles']=[{'path':str(p).replace('\\','/'),'uid':self.values[p][2],'mode':self.values[p][3],'sha256':digest(self.values[p][1])} for p in sorted(self.pinned)]
 def read(self,path,uid,mode,limit=1024**2):
  value,raw,actual_uid,actual_mode=self.values[path];assert (uid,mode)==(actual_uid,actual_mode),'MODEL_CUSTODY';assert len(raw)<=limit;return raw
 def own(self,path):self.calls.append(('own',str(path)));assert path in [SOURCE,TARGET];return {'project':path.name}
 def uptime(self):return self.now
 def read_budget_snapshot(self):return copy.deepcopy(self.ledger)
 def validate_budget_remaining(self,state,name,now):self.calls.append(('budget',name));assert state['startedUptime']<=now<state['startedUptime']+1800;return 45
 def facts(self):self.calls.append(('facts',));return copy.deepcopy(self.current)
 def resources(self):self.calls.append(('resources',));return {'availableMiB':6000}
 def preserve(self):self.calls.append(('preserve',));return {'result':'PASS','preservedOtherConsumers':27}
 def expected_owners(self):return self.owners
 def owned_identity(self,c,owners):return c['ownerId']==owners[c['project']][c['service']] and (c['nanoCpus'],c['memory'],c['imageRef'])==self.PROFILES[c['service']]
 def inspect_container(self,cid):return copy.deepcopy(next(c for c in self.current if c.get('id')==cid))
 def guard_resources(self,rows,future,owners):self.calls.append(('guard',tuple(s for _,s in future)))
 def read_source_service_reference(self,c):self.calls.append(('source-ref',c['id']));assert c.get('referenced',True),'MISSING_SOURCE_REF';return {'containerId':c['id']}
 def source_compose_spec(self):return {'services':{s:{} for s in self.PROFILES}}
 def validate_source_service_boundary(self,cid,spec):self.calls.append(('source-mount',cid))
 def verify_main_target_references(self,rows):self.calls.append(('target-ref',));assert all(c.get('referenced',True) for c in rows),'MISSING_TARGET_REF';return True
 def target_bridge(self):return types.SimpleNamespace(validate_created_postgres=lambda h,cid:self.calls.append(('target-mount',cid)))
 def run(self,*args):
  self.calls.append(args)
  if args==('docker','network','ls','-q'):return '\n'.join(str(i+1).zfill(64) for i in range(len(self.networks)))
  assert args[:4]==('docker','network','inspect','--format'),'NO_DOCKER_MUTATION';return '\n'.join(json.dumps(row) for row in self.networks)
 def row(self,service,root=SOURCE,**changes):
  cpu,mem,image=self.PROFILES[service];return {'id':str(len(self.current)+1).zfill(64),'project':root.name,'service':service,'ownerId':self.owners[root.name][service],'nanoCpus':cpu,'memory':mem,'imageRef':image,'running':True,'pid':13,'status':'running',**changes}

class Continuation(unittest.TestCase):
 def context(self,h):return patch.multiple(r,read_private_bytes=h.read,scope_inventory=lambda host:set(h.pinned),validate_roots=lambda host:None)
 def test_original_state_validates_without_writes_or_charges_and_returns_hashes_only(self):
  h=Model();before=copy.deepcopy(h.ledger)
  with self.context(h):v=r.validate(h,h.extension,h.plan)
  self.assertEqual(v['status'],'PASS');self.assertEqual(h.ledger,before);self.assertIn(('resources',),h.calls)
  raw=canon(v);self.assertNotIn(b'private-model-sentinel',raw);self.assertNotIn(b'controller',raw);self.assertEqual(v['preservedFiles'],len(h.pinned))
 def test_parent_source_material_artifact_and_immutable_pins_are_bound(self):
  for field in ['schema','runtimeSourceSha','parentPlanHash','artifactDigest']:
   h=Model();h.extension[field]='wrong'
   with self.context(h),self.subTest(field=field),self.assertRaises(AssertionError):r.validate(h,h.extension,h.plan)
  for path,key in [(SOURCE/'master/material-ref.json','materialHash'),(SOURCE/'master/material.json','artifactDigest'),(SOURCE/'staging/artifact.json','sourceSha')]:
   h=Model();v=copy.deepcopy(h.values[path][0]);v[key]='f'*64;h.add(path,v);h.repin()
   with self.context(h),self.subTest(path=path),self.assertRaises(AssertionError):r.validate(h,h.extension,h.plan)
 def test_original_ledger_clock_counts_registry_and_zero_work_cannot_be_rebased(self):
  mutations=[lambda h:h.ledger.update(startedUptime=1001),lambda h:h.ledger.update(sequence=635),lambda h:h.ledger['total'].update(artifactFiles=635),lambda h:h.extension['originalLedgerAnchor']['total'].update(sql=1),lambda h:h.ledger['total'].update(http=1),lambda h:h.ledger['plannedScenarios'].pop('host-pg-start'),lambda h:h.ledger['scenarios'].update({'host-pg-start':{'startedUptime':h.now,'limits':CASE,'total':dict.fromkeys(CASE,0)}}),lambda h:setattr(h,'now',2800),lambda h:setattr(h,'now',999),lambda h:h.extension['originalLedgerAnchor'].update(registryHash='f'*64)]
  for mutate in mutations:
   h=Model();mutate(h)
   with self.context(h),self.subTest(mutate=mutate),self.assertRaises(AssertionError):r.validate(h,h.extension,h.plan)
 def test_higher_legitimate_artifact_charge_preserves_original_clock(self):
  h=Model();h.ledger['sequence']+=1;h.ledger['total']['artifactFiles']+=1;h.ledger['scenarios']['host-stage']['total']['artifactFiles']+=1
  with self.context(h):self.assertEqual(r.validate(h,h.extension,h.plan)['status'],'PASS')
 def test_omitted_duplicate_foreign_and_traversal_pins_are_rejected(self):
  for mutate in [lambda h:h.extension['preservedFiles'].pop(),lambda h:h.extension['preservedFiles'].append(h.extension['preservedFiles'][0]),lambda h:h.extension['preservedFiles'][0].update(path='/etc/passwd'),lambda h:h.extension['preservedFiles'][0].update(path=str(SOURCE/'data/secret')),lambda h:h.extension['preservedFiles'][0].update(path=str(SOURCE)+'/secrets/../data/key')]:
   h=Model();mutate(h)
   with self.context(h),self.assertRaises(AssertionError):r.validate(h,h.extension,h.plan)
 def test_changed_pin_or_preserved_consumer_fails_without_leaking_raw_data(self):
  for mutate in [lambda h:h.extension['preservedFiles'][0].update(sha256='f'*64),lambda h:h.current.pop(),lambda h:h.current.append(h.row('postgres'))]:
   h=Model();mutate(h)
   with self.context(h),self.assertRaises(AssertionError) as err:r.validate(h,h.extension,h.plan)
   self.assertNotIn('private-model-sentinel',str(err.exception))
 def test_original_node_registry_and_host_validator_are_used_without_reset(self):
  original_spec=importlib.util.spec_from_file_location('resume_original_host',pathlib.Path(__file__).with_name('host.py'));original=importlib.util.module_from_spec(original_spec);original_spec.loader.exec_module(original)
  node='C:/Users/thede/Desktop/Proyectos de programacion/MECANET-develop/.qa-private/runtime/node.exe' if sys.platform=='win32' else shutil.which('node')
  self.assertTrue(node and pathlib.Path(node).is_file(),'APPROVED_NODE_RUNTIME_REQUIRED')
  self.assertEqual(subprocess.check_output([node,'--version'],text=True,timeout=10).strip(),'v24.21.0')
  code="import {budgetRegistry,initialBudget} from './tests/qa/cp019/budget-plan.mjs';console.log(JSON.stringify(initialBudget(budgetRegistry(),1000)));"
  state=json.loads(subprocess.check_output([node,'--input-type=module','-e',code],cwd=pathlib.Path(__file__).parents[3],text=True,timeout=10))
  h=Model();h.BUDGET_PLAN_SHA=original.BUDGET_PLAN_SHA;state['sequence']=636;state['total']['artifactFiles']=636;state['scenarios']['host-stage']={'startedUptime':1001,'limits':CASE.copy(),'total':{'artifactFiles':636,'sql':0,'http':0,'journal':0}};h.ledger=state;h.extension['originalLedgerAnchor']['registryHash']=h.BUDGET_PLAN_SHA;h.validate_budget_remaining=original.validate_budget_remaining
  before=copy.deepcopy(state)
  with self.context(h):self.assertEqual(r.validate(h,h.extension,h.plan)['status'],'PASS')
  self.assertEqual(h.ledger,before)
  h.ledger['plannedScopes']['host-pg-start']='target-window'
  with self.context(h),self.assertRaises(AssertionError):r.validate(h,h.extension,h.plan)
 def test_only_already_ended_root_job_can_remain_and_all_receipts_are_bound(self):
  h=Model();job='00000000-0000-4000-8000-000000000001';row=h.row('controller-tool',running=False,pid=0,status='exited',exitCode=0,startedAt='2026-10-15T13:54:00Z',finishedAt='2026-10-15T13:54:01Z',jobId=job);h.current.append(row)
  created={'schema':'controller-job-created-v1','jobId':job,'containerId':row['id'],'project':SOURCE.name,'service':'controller-tool','ownerId':row['ownerId'],'imageDigest':h.PROFILES['controller-tool'][2].split('@',1)[1],'commandHash':HASH,'state':'CREATED BEFORE START/SQL','createdAt':'2026-10-15T13:53:59Z'}
  ch=h.add(SOURCE/'evidence/jobs'/(job+'-created.json'),created,0,0o400)
  end={'schema':'controller-job-end-v1',**{k:created[k] for k in ['jobId','containerId','project','service','ownerId']},'createdReceiptHash':ch,'exitCode':0,'startedAt':row['startedAt'],'finishedAt':row['finishedAt'],'containerStopped':True,'sqlAbsence':'NOT VERIFIED'};path=SOURCE/'evidence/jobs'/(job+'-end.json');h.add(path,end,0,0o400)
  with self.context(h):self.assertEqual(r.validate(h,h.extension,h.plan)['status'],'PASS')
  for key,value in [('createdReceiptHash','f'*64),('containerId','f'*64),('exitCode',1),('finishedAt','other'),('containerStopped',False)]:
   bad={**end,key:value};h.add(path,bad,0,0o400)
   with self.context(h),self.subTest(key=key),self.assertRaises(AssertionError):r.validate(h,h.extension,h.plan)

class Dependencies(unittest.TestCase):
 def setUp(self):self.network=patch.object(r,'validate_networks',return_value=None);self.network.start();self.addCleanup(self.network.stop)
 def test_source_initial_postgres_requires_cold_missing_selected_service(self):
  h=Model();self.assertTrue(r.validate_prerequisites(h,SOURCE.name,['postgres']))
  for row in [h.row('postgres',running=False,pid=0,status='created'),h.row('worker'),h.row('postgres',TARGET)]:
   h=Model();h.current.append(row)
   with self.assertRaises(AssertionError):r.validate_prerequisites(h,SOURCE.name,['postgres'])
 def test_worker_requires_one_same_project_running_pinned_referenced_postgres(self):
  for root in [SOURCE,TARGET]:
   h=Model();pg=h.row('postgres',root);h.current.append(pg);self.assertTrue(r.validate_prerequisites(h,root.name,['worker']))
   self.assertIn(('source-ref',pg['id']) if root==SOURCE else ('target-ref',),h.calls)
  for change in [{'running':False,'pid':0,'status':'exited'},{'referenced':False},{'imageRef':'wrong'},{'ownerId':'wrong'}]:
   h=Model();h.current.append(h.row('postgres',**change))
   with self.subTest(change=change),self.assertRaises(AssertionError):r.validate_prerequisites(h,SOURCE.name,['worker'])
  h=Model();h.current.append(h.row('postgres',TARGET))
  with self.assertRaises(AssertionError):r.validate_prerequisites(h,SOURCE.name,['worker'])
 def test_business_requires_original_worker_and_never_adopts_selected_exited_cid(self):
  for root in [SOURCE,TARGET]:
   h=Model();h.current.extend([h.row('postgres',root),h.row('worker',root)]);h.current[-1]['id']='b'*64
   self.assertTrue(r.validate_prerequisites(h,root.name,['api1','api2','web']))
   h.current[-1]['referenced']=False
   with self.assertRaises(AssertionError):r.validate_prerequisites(h,root.name,['api1','api2','web'])
  h=Model();h.current.append(h.row('postgres'))
  with self.assertRaises(AssertionError):r.validate_prerequisites(h,SOURCE.name,['api1','api2','web'])
  h.current.append(h.row('worker'));h.current[-1]['id']='b'*64;h.current.append(h.row('api1',running=False,pid=0,status='exited'))
  with self.assertRaises(AssertionError):r.validate_prerequisites(h,SOURCE.name,['api1','api2','web'])
 def test_unknown_projects_or_service_tuples_and_duplicate_pg_fail(self):
  h=Model()
  for project,services in [('foreign',['postgres']),(SOURCE.name,['api1']),(SOURCE.name,['worker','worker']),(SOURCE.name,['postgres','worker'])]:
   with self.subTest(services=services),self.assertRaises(AssertionError):r.validate_prerequisites(h,project,services)
  h.current.extend([h.row('postgres'),h.row('postgres')]);h.current[-1]['id']='b'*64
  with self.assertRaises(AssertionError):r.validate_prerequisites(h,SOURCE.name,['worker'])

class Networks(unittest.TestCase):
 def run_gate(self,h,services=('postgres',)):
  with patch.object(r,'read_private_bytes',side_effect=h.read):return r.validate_networks(h,SOURCE.name,services)
 def test_planned_own_networks_may_be_absent_and_do_not_get_precreated(self):
  h=Model();self.assertIsNone(self.run_gate(h));self.assertEqual(h.calls,[('docker','network','ls','-q')])
 def test_existing_exact_internal_networks_are_read_only_reused(self):
  h=Model();h.networks=[{'name':SOURCE.name+'-data','internal':True,'driver':'bridge','ipv6':False,'options':{'com.docker.network.bridge.gateway_mode_ipv4':'isolated'},'ipam':[{'Subnet':'10.77.61.0/24','Gateway':'10.77.61.1'}]}]
  self.assertIsNone(self.run_gate(h));self.assertTrue(all(call[:3] in [('docker','network','ls'),('docker','network','inspect')] for call in h.calls))
 def test_foreign_overlap_extra_own_network_and_changed_own_network_are_rejected(self):
  cases=[{'name':'foreign','ipam':[{'Subnet':'10.77.61.0/25'}]},{'name':SOURCE.name+'-extra','ipam':[]},{'name':SOURCE.name+'-data','internal':False,'driver':'bridge','ipv6':False,'options':{},'ipam':[{'Subnet':'10.77.61.0/24'}]}]
  for row in cases:
   h=Model();h.networks=[row]
   with self.subTest(row=row),self.assertRaises(AssertionError):self.run_gate(h)
 def test_unrelated_foreign_network_survives_and_no_compose_dependencies_are_added(self):
  h=Model();h.networks=[{'name':'foreign','ipam':[{'Subnet':'172.17.0.0/16'}]}];self.run_gate(h)
  spec=copy.deepcopy(h.values[SOURCE/'compose.json'][0]);spec['services']['postgres']['depends_on']=['foreign'];h.add(SOURCE/'compose.json',spec)
  with self.assertRaisesRegex(AssertionError,'RESUME_UNPLANNED_DEPENDENCY'):self.run_gate(h)
 def test_planned_compose_network_must_remain_internal_and_exact_subnet(self):
  for field,value in [('internal',False),('ipam',{'config':[{'subnet':'10.0.0.0/8'}]}),('name','shared')]:
   h=Model();spec=copy.deepcopy(h.values[SOURCE/'compose.json'][0]);spec['networks']['data'][field]=value;h.add(SOURCE/'compose.json',spec)
   with self.subTest(field=field),self.assertRaises(AssertionError):self.run_gate(h)

class PrivateReader(unittest.TestCase):
 def test_reader_uses_same_descriptor_metadata_and_rejects_replacement_or_hardlinks(self):
  p=SOURCE/'secrets/bootstrap';raw=b'private-model'
  def metadata(**changes):return types.SimpleNamespace(st_dev=1,st_ino=2,st_mode=stat.S_IFREG|0o400,st_uid=999,st_nlink=1,st_size=len(raw),st_mtime_ns=3,st_ctime_ns=4,**changes)
  good=metadata()
  for bad in [None,types.SimpleNamespace(**{**vars(good),'st_ino':7}),types.SimpleNamespace(**{**vars(good),'st_nlink':2}),types.SimpleNamespace(**{**vars(good),'st_ctime_ns':9})]:
   named=[good,good if bad is None else bad];reads=[raw,b'']
   with patch.object(pathlib.Path,'resolve',lambda p:p),patch.object(pathlib.Path,'is_symlink',lambda p:False),patch.object(pathlib.Path,'lstat',side_effect=named),patch.object(r.os,'open',return_value=33),patch.object(r.os,'fstat',return_value=good),patch.object(r.os,'read',side_effect=reads),patch.object(r.os,'close') as close:
    if bad is None:self.assertEqual(r.read_private_bytes(p,999,0o400),raw)
    else:
     with self.assertRaises(AssertionError):r.read_private_bytes(p,999,0o400)
    close.assert_called_once_with(33)

if __name__=='__main__':unittest.main()
