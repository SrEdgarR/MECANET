"""Local boundary models; no Docker, SSH, PostgreSQL or physical custody claim."""
import copy, importlib.util, pathlib, subprocess, tempfile, types, unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('variant_host',pathlib.Path(__file__).with_name('target-variant-host.py'))
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)

def material():
 def side(project):
  return {'project':project,'generation':v.uid(),'seedClockOwner':v.uid(),'workerClockOwner':v.uid(),'webOwner':v.uid(),'apiOwners':{s:v.uid() for s in ['api1','api2']},'rolePasswords':{s:v.secret(32) for s in ['qa_bootstrap','saas_clock','saas_api','saas_session','saas_issuer']},'sessionSecret':v.secret(48),'identityPassword':'actor','identityPasswordHash':'actor-hash','operationIds':{'products':[v.uid()],'restore':v.uid()}}
 m={'schema':'recovery-custody-v1','recoveryId':v.uid(),'controllerOwner':v.uid(),'artifactDigest':'a'*64,'stageOperationIds':{'source-init':v.uid(),'target-begin':v.uid(),'config-role-qa_bootstrap':v.uid()},'source':side(v.SOURCE),'target':side(v.PROJECT)}
 m['target'].update(roleVerifiers={},referenceVersions={'schema':3},epochs={'a':'3','b':'3'});return m

PROFILES={'postgres':(350000000,640*1024**2,'postgres@sha256:'+'a'*64),'worker':(100000000,192*1024**2,'node@sha256:'+'b'*64),'api1':(200000000,320*1024**2,'node@sha256:'+'b'*64),'api2':(200000000,320*1024**2,'node@sha256:'+'b'*64),'web':(100000000,96*1024**2,'nginx@sha256:'+'c'*64),'harness':(250000000,128*1024**2,'node@sha256:'+'b'*64),'probe':(50000000,128*1024**2,'node@sha256:'+'b'*64),'controller-tool':(250000000,128*1024**2,'node@sha256:'+'b'*64)}
def reference(kind,service='postgres',cid='d'*64):
 cpu,mem,image=PROFILES[service]
 return {'schema':'target-variant-service-created-v1','project':v.PROJECT,'kind':kind,'service':service,'containerId':cid,'ownerId':v.uid(),'imageRef':image,'nanoCpus':cpu,'memory':mem,'generation':v.uid(),'recoveryId':v.uid(),'lineageHash':'e'*64,'dataPath':str(v.paths(kind)['data']),'configHash':'f'*64,'commandHash':'a'*64,'createdAt':'2026-10-15T00:00:00.000Z','state':'CREATED BEFORE START/SQL'}
def fact(ref,**changes):
 return {'id':ref['containerId'],'project':ref['project'],'service':ref['service'],'ownerId':ref['ownerId'],'imageRef':ref['imageRef'],'nanoCpus':ref['nanoCpus'],'memory':ref['memory'],'running':False,'status':'created','pid':0,**changes}

class PureBoundaries(unittest.TestCase):
 def test_commit_host_plan_matches_the_real_node_hook(self):
  cs=importlib.util.spec_from_file_location('commit_host_peer',pathlib.Path(__file__).with_name('target-commit-host.py'));commit=importlib.util.module_from_spec(cs);cs.loader.exec_module(commit)
  m=material();m['stageOperationIds']['target-prepare-promote']=v.uid();step={'method':'preparePromotion','args':{'operationKey':'target-prepare-promote','expected':{'stage':'VERIFIED','version':'5','global_blocked':True},'after':{'stage':'PROMOTING','version':'6','global_blocked':True},'proofHash':'a'*64}}
  plan={'schema':'target-driver-plan-v1','generation':m['target']['generation'],'recoveryId':m['recoveryId'],'sourceSha':'a'*40,'resourceHash':'b'*64,'sourceEndProofHash':'c'*64,'phases':{'promotion':{'steps':[step]}}};base={'plan':plan,'planHash':v.digest(plan),'variantLineageHash':'e'*64};invocation=v.uid();cid='d'*64;chosen=commit.make_plan(m,base,invocation,cid)
  script="import{makeCommitFaultPlan}from'./tests/qa/cp019/commit-fault-hook.mjs';import{canonical}from'./server/saas/recovery/protocol.js';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(canonical(makeCommitFaultPlan(JSON.parse(s))));"
  payload={'material':m,'parentPlan':plan,'parentPlanHash':base['planHash'],'variantLineageHash':base['variantLineageHash'],'invocationId':invocation,'controllerContainerId':cid};r=subprocess.run(['node','--input-type=module','-e',script],cwd=pathlib.Path(__file__).resolve().parents[3],input=v.canonical(payload).decode(),text=True,capture_output=True,timeout=15)
  self.assertEqual(r.returncode,0);self.assertEqual(r.stdout,v.canonical(chosen).decode())
  changed=copy.deepcopy(base);changed['plan']['phases']['promotion']['steps'][0]['args']['after']['global_blocked']=False;changed['planHash']=v.digest(changed['plan'])
  with self.assertRaisesRegex(AssertionError,'PROMOTION'):commit.make_plan(m,changed,invocation,cid)
 def test_integral_uptime_anchor_has_the_same_canonical_hash_in_node(self):
  original=material();effective=v.choose_effective(original);limits={'sql':8192,'http':80,'journal':1000,'artifactFiles':2000};host=types.SimpleNamespace(ROOT=pathlib.Path('/opt')/v.SOURCE,BUDGET_PLAN_SHA='a'*64,CASE_LIMITS=limits,CEILINGS={**limits,'sql':200000,'http':300,'artifactFiles':8192})
  inputs={'original':original,'capture':{},'normal':{'resource':{}},'end':{'endProof':{}},'index':{},'head':{'sequence':0,'hash':'b'*64}}
  ledger={'startedUptime':100.0,'sequence':1,'total':dict.fromkeys(limits,0)};context=v.make_context(host,'commit-interrupted',inputs,ledger,effective)
  script="import{sha256}from'./server/saas/recovery/protocol.js';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(sha256(JSON.parse(s)));"
  result=subprocess.run(['node','--input-type=module','-e',script],cwd=pathlib.Path(__file__).resolve().parents[3],input=v.canonical(context['addition']).decode(),text=True,capture_output=True,timeout=15)
  self.assertEqual(result.returncode,0);self.assertEqual(result.stdout,context['additionHash']);self.assertEqual(ledger['startedUptime'],100.0);self.assertIs(type(context['ledgerAnchor']['startedUptime']),int)
 def test_bridge_variant_receipt_exposes_the_same_sealed_lineage_hash(self):
  ts=importlib.util.spec_from_file_location('variant_receipt_bridge',pathlib.Path(__file__).with_name('target-host.py'));bridge=importlib.util.module_from_spec(ts);ts.loader.exec_module(bridge)
  target={'containerId':'d'*64};source={'containerId':'c'*64};m={'target':{'generation':v.uid()},'recoveryId':v.uid()};base={'manifest':{'source':source,'target':target},'anchors':{'manifestHash':'a'*64,'targetResourceHash':'b'*64},'proofBundle':{'sourceEndProofHash':'c'*64},'variantLineageHash':'e'*64};cfg={'invocationId':v.uid(),'sourceSha':'a'*40,'custodyHash':'d'*64,'configBundleHash':'f'*64,'sourceCaptureHash':'a'*64,'variantLineageHash':'e'*64,'variantLineageContextHash':'9'*64}
  host=types.SimpleNamespace(ROOT=pathlib.Path('/opt')/v.SOURCE,TARGET=v.paths('commit-interrupted')['root'],target_project=lambda:v.PROJECT,variant_case_name=lambda phase:'target-commit-fault',variant_lineage=lambda:({'additionHash':'e'*64},'9'*64),inspect_container=lambda cid:{'running':False,'pid':0,'status':'exited'},owned_identity=lambda *_:True)
  with patch.object(bridge,'own_current',return_value=(m,[],{})),patch.object(bridge,'target_resource',return_value=target),patch.object(bridge,'source_end_observation',return_value={}):packet=bridge.observation(host,'configure',cfg,base)
  self.assertEqual(packet['receipt'].get('variantLineageHash'),'e'*64);self.assertEqual(packet['receipt']['caseName'],'target-commit-fault')
  host.variant_lineage=lambda:({'additionHash':'8'*64},'9'*64)
  with patch.object(bridge,'own_current',return_value=(m,[],{})),patch.object(bridge,'target_resource',return_value=target),patch.object(bridge,'source_end_observation',return_value={}):
   with self.assertRaisesRegex(AssertionError,'VARIANT'):bridge.observation(host,'configure',cfg,base)
 def test_chosen_material_matches_the_real_node_validator_and_scram(self):
  repo=pathlib.Path(__file__).resolve().parents[3]
  script="import{chooseMaterial}from'./server/saas/recovery/custody.js';process.stdout.write(JSON.stringify(await chooseMaterial({project:'mecanet-qa-p1l3-r03',artifactDigest:'a'.repeat(64)})));"
  original=v.json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=repo,text=True,timeout=15));effective=v.choose_effective(original)
  validate="import{validateMaterial}from'./server/saas/recovery/custody.js';let s='';for await(const c of process.stdin)s+=c;validateMaterial(JSON.parse(s));process.stdout.write('PASS');"
  checked=subprocess.run(['node','--input-type=module','-e',validate],cwd=repo,input=v.canonical(effective).decode(),text=True,capture_output=True,timeout=15)
  self.assertEqual(checked.returncode,0,'Node material validation rejected synthetic Python choice');self.assertEqual(checked.stdout,'PASS')
 def test_paths_are_inside_the_only_approved_target(self):
  for kind in v.KINDS:
   p=v.paths(kind);self.assertEqual(p['root'].as_posix(),'/opt/'+v.PROJECT+'/variants/'+kind);self.assertEqual(p['socket'],p['root']/'ingress/http.sock')
  for bad in ['../x','nexora','roster-empty/retry','mecanet-qa-p1l3-r03']:
   with self.assertRaises(AssertionError):v.paths(bad)
 def test_choice_changes_only_target_material_and_never_reuses_ids_or_secrets(self):
  original=material();before=copy.deepcopy(original);effective=v.choose_effective(original)
  self.assertEqual(original,before);self.assertEqual(effective['source'],original['source']);self.assertEqual(effective['controllerOwner'],original['controllerOwner'])
  self.assertEqual(effective['stageOperationIds']['source-init'],original['stageOperationIds']['source-init']);self.assertNotEqual(effective['recoveryId'],original['recoveryId'])
  self.assertTrue(v.validate_pair(original,effective));self.assertEqual(effective['target']['identityPassword'],original['target']['identityPassword'])
  self.assertNotEqual(effective['target']['sessionSecret'],original['target']['sessionSecret']);self.assertNotEqual(effective['target']['rolePasswords'],original['target']['rolePasswords'])
 def test_source_mutation_or_reused_target_id_is_rejected(self):
  original=material();effective=v.choose_effective(original)
  for mutate in [lambda m:m['source'].update(generation=v.uid()),lambda m:m['target'].update(workerClockOwner=original['target']['workerClockOwner']),lambda m:m['stageOperationIds'].update({'source-init':v.uid()}),lambda m:m['target']['rolePasswords'].update(qa_bootstrap=original['target']['rolePasswords']['qa_bootstrap'])]:
   changed=copy.deepcopy(effective);mutate(changed)
   with self.assertRaises(AssertionError):v.validate_pair(original,changed)
 def test_duplicate_new_operation_id_is_rejected_even_when_not_original(self):
  original=material();effective=v.choose_effective(original);effective['target']['operationIds']['restore']=effective['target']['operationIds']['products'][0]
  with self.assertRaisesRegex(AssertionError,'TARGET_REUSE'):v.validate_pair(original,effective)
 def test_a_sibling_variant_cannot_reuse_an_already_sealed_target_owner(self):
  original=material();first=v.choose_effective(original);second=v.choose_effective(original);self.assertTrue(v.distinct_target(original,second,first));second['target']['workerClockOwner']=first['target']['workerClockOwner']
  self.assertTrue(v.validate_pair(original,second))
  with self.assertRaisesRegex(AssertionError,'SIBLING_REUSE'):v.distinct_target(original,second,first)
 def test_case_mapping_is_closed_and_never_adds_retry_names(self):
  self.assertEqual([v.case_name(k) for k in v.KINDS],['ready-empty','ready-allclosed','target-commit-fault','target-promote-fault','variant-a5-grant'])
  with self.assertRaises(AssertionError):v.case_name('commit-interrupted-retry')
 def test_a5_close_and_fin_keep_the_last_actual_restriction_case(self):
  base=types.SimpleNamespace(ROOT=pathlib.Path('/opt')/v.SOURCE,TARGET=pathlib.Path('/opt')/v.PROJECT,PROFILES=PROFILES,PINS={},HOST_CASE='variant-a5-grant');view=v.VariantHost(base,'a5-restrictions')
  self.assertEqual(view.variant_case_name('promotion'),'variant-a5-grant')
  for name in ['variant-a5-membership','variant-a5-identity']:
   base.HOST_CASE=name;self.assertEqual(view.variant_case_name('stop'),name);self.assertEqual(view.variant_case_name('end'),name)
 def test_reference_identity_does_not_accept_labels_alone(self):
  r=reference('commit-interrupted');self.assertTrue(v.matches(fact(r),r,PROFILES))
  for key,value in [('id','9'*64),('ownerId',v.uid()),('imageRef','postgres:latest'),('nanoCpus',1),('memory',1),('project',v.SOURCE)]:
   self.assertFalse(v.matches(fact(r,**{key:value}),r,PROFILES))
 def test_multiple_stopped_pg_references_are_allowed_but_two_active_are_not(self):
  a=reference('commit-interrupted');b=reference('promote-prefix',cid='9'*64)
  out=v.guard_references([fact(a),fact(b)],[a,b],[],PROFILES);self.assertEqual(out['postgresCount'],0)
  with self.assertRaisesRegex(AssertionError,'MULTIPLE_PG'):v.guard_references([fact(a,running=True),fact(b,running=True)],[a,b],[],PROFILES)
 def test_same_project_running_in_different_variant_roots_is_rejected(self):
  a=reference('commit-interrupted');b=reference('promote-prefix','worker','9'*64)
  with self.assertRaisesRegex(AssertionError,'COHORT_CONFLICT'):v.guard_references([fact(a,running=True),fact(b,running=True)],[a,b],[],PROFILES)
 def test_unknown_or_duplicate_cid_is_not_adopted(self):
  a=reference('commit-interrupted')
  with self.assertRaisesRegex(AssertionError,'UNKNOWN'):v.guard_references([fact(a,id='9'*64)],[a],[],PROFILES)
  with self.assertRaisesRegex(AssertionError,'DUPLICATE'):v.guard_references([fact(a),fact(a)],[a],[],PROFILES)
 def test_future_projection_preserves_global_cpu_memory_and_pg_caps(self):
  a=reference('commit-interrupted');future=[('commit-interrupted',s) for s in ['api1','api2','worker','web','harness']]
  with self.assertRaisesRegex(AssertionError,'BUSINESS_ACTIVE|AGGREGATE'):v.guard_references([fact(a,running=True)],[a],future,PROFILES)
 def test_expired_or_reset_ledger_cannot_continue_a_variant(self):
  anchor={'registryHash':'a'*64,'startedUptime':5,'sequence':3,'total':{'sql':7,'http':2,'journal':1,'artifactFiles':4}}
  state={'schema':'cp019-budget-v1','project':v.SOURCE,'startedUptime':5,'sequence':3,'total':dict(anchor['total'])}
  ceilings={'sql':200000,'http':300,'journal':1000,'artifactFiles':8192}
  self.assertTrue(v.ledger_continuity(anchor,state,'a'*64,ceilings,6))
  for change in [{'startedUptime':6},{'sequence':2},{'total':{**state['total'],'sql':6}}]:
   with self.assertRaises(AssertionError):v.ledger_continuity(anchor,{**state,**change},'a'*64,ceilings,7)
  with self.assertRaises(AssertionError):v.ledger_continuity(anchor,state,'a'*64,ceilings,1806)
 def test_case_deadline_is_checked_without_refreshing_start_or_spending_new_files(self):
  limits={'sql':8192,'http':80,'journal':1000,'artifactFiles':2000};state={'schema':'cp019-budget-v1','project':v.SOURCE,'startedUptime':1,'total':dict.fromkeys(limits,0),'plannedScenarios':{'target-commit-fault':limits},'scenarios':{'target-commit-fault':{'startedUptime':10,'limits':limits,'total':dict.fromkeys(limits,0)}}};h=types.SimpleNamespace(ROOT=pathlib.Path('/opt')/v.SOURCE,HOST_CASE='target-commit-fault',CASE_LIMITS=limits,CEILINGS={**limits,'sql':200000,'http':300,'artifactFiles':8192},uptime=lambda:55)
  before=copy.deepcopy(state)
  with patch.object(v,'read',return_value=(state,'a'*64)):
   self.assertEqual(v.case_budget(h,'commit-interrupted'),'target-commit-fault');h.uptime=lambda:55.001
   with self.assertRaisesRegex(AssertionError,'EXPIRED'):v.case_budget(h,'commit-interrupted')
  self.assertEqual(state,before)
 def test_compose_derivation_rewrites_only_variant_writable_paths(self):
  m=v.choose_effective(material());root=v.paths('commit-interrupted')['root'];s={'name':v.PROJECT,'services':{'postgres':{'image':PROFILES['postgres'][2],'labels':{'mecanet.qa.service':'postgres','mecanet.qa.owner-id':'old'},'volumes':['/opt/'+v.PROJECT+'/data:/var/lib/postgresql:rw','/opt/'+v.PROJECT+'/config/ca.crt:/ca:ro','/opt/'+v.SOURCE+'/staging:/workspace:ro']}}}
  result=v.derive_compose(s,m,'commit-interrupted');self.assertEqual(s['services']['postgres']['labels']['mecanet.qa.owner-id'],'old')
  self.assertEqual(result['services']['postgres']['volumes'][0],str(root/'data')+':/var/lib/postgresql:rw');self.assertIn(str(root/'config/ca.crt')+':/ca:ro',result['services']['postgres']['volumes'])
  self.assertEqual(result['services']['postgres']['labels']['mecanet.qa.owner-id'],m['controllerOwner'])
 def test_compose_cannot_mount_the_root_master_or_main_target_data(self):
  m=v.choose_effective(material())
  for path in ['/opt/'+v.SOURCE+'/master/material.json','/opt/'+v.PROJECT+'/master/context.json']:
   with self.assertRaisesRegex(AssertionError,'MASTER'):v.derive_compose({'name':v.PROJECT,'services':{'postgres':{'labels':{},'volumes':[path+':/secret:ro']}}},m,'commit-interrupted')
 def test_empty_api_spec_mounts_only_segmented_config_and_binds_fresh_owner(self):
  m=v.choose_effective(material());root=v.paths('roster-empty')['root'];context={'additionHash':'e'*64};spec={'command':['old'],'environment':{},'volumes':[str(root/'secrets/api1.json')+':/run/qa-secrets/api.json:ro','/artifact:/workspace:ro']}
  cfg={'schema':'cp019-empty-runtime-v1','project':v.PROJECT,'kind':'roster-empty','service':'api1','ownerId':m['target']['apiOwners']['api1'],'generation':m['target']['generation'],'variantLineageHash':'e'*64,'sourceSha':'f'*40,'recovery':{'mode':'NORMAL','runId':m['recoveryId']},**{key:{'database':'mecanet_control_empty','user':role,'password':m['target']['rolePasswords'][role],'host':'postgres','ssl':{'rejectUnauthorized':True}} for key,role in [('control','saas_api'),('sessions','saas_session'),('issuer','saas_issuer')]}}
  out=v.readiness_spec(spec,m,context,cfg,'api1',root);self.assertEqual(out['command'][-1],'api1');self.assertEqual(out['environment']['QA_OWNER_ID'],m['target']['apiOwners']['api1']);self.assertEqual(out['volumes'][0],str(root/'secrets/readiness-api1.json')+':/run/qa-secrets/readiness-api1.json:ro')
  bad=copy.deepcopy(cfg);bad['control']['user']='qa_bootstrap'
  with self.assertRaisesRegex(AssertionError,'AUTHORITY'):v.readiness_spec(spec,m,context,bad,'api1',root)
  with self.assertRaisesRegex(AssertionError,'SECRET_FOLDER'):v.readiness_spec({**spec,'volumes':['/secret:/run/qa-secrets:ro']},m,context,cfg,'api1',root)
 def test_provider_import_is_passive(self):
  with patch.object(v.os,'open',side_effect=AssertionError('IMPORT_IO')),patch.object(v.subprocess,'check_output',side_effect=AssertionError('IMPORT_PROCESS')),patch.object(v.secrets,'token_bytes',side_effect=AssertionError('IMPORT_CHOICE')):
   passive=importlib.util.module_from_spec(spec);spec.loader.exec_module(passive)

class EmergencyReferences(unittest.TestCase):
 def fixture(self):
  original=material();original['source']['normal']={'runId':v.uid()};effective=v.choose_effective(original);limits={'sql':8192,'http':80,'journal':1000,'artifactFiles':2000};ceilings={**limits,'sql':200000,'http':300,'artifactFiles':8192};kind='commit-interrupted';root=v.paths(kind)['root'];calls=[]
  h=types.SimpleNamespace(ROOT=pathlib.Path('/opt')/v.SOURCE,TARGET=pathlib.Path('/opt')/v.PROJECT,PROFILES=PROFILES,PINS={},BUDGET_PLAN_SHA='a'*64,CASE_LIMITS=limits,CEILINGS=ceilings,uptime=lambda:1802,material_owned=lambda:original,own=lambda p:calls.append(('own',p)),resources=lambda:self.fail('Emergency reading must not sample pressure'),facts=lambda:self.fail('Labels cannot enroll emergency identities'))
  normal={'resource':{'systemIdentifier':'1234567890123456789'}};proof={'recoveryId':original['recoveryId'],'sourceResourceHash':v.digest(normal['resource'])};end={'endProof':proof,'hash':v.digest(proof),'observedEnd':{'sqlOwnersPresent':[],'httpPending':[]}};capture={'custodyHash':v.digest(original),'normalManifestHash':v.digest(normal),'resourceHash':v.digest(normal['resource']),'runId':original['source']['normal']['runId']};raw=v.canonical({'sequence':0,'kind':'observed','hash':'b'*64})+b'\n';inputs={'original':original,'normal':normal,'capture':capture,'end':end,'index':{},'head':{'sequence':0,'hash':'b'*64},'rawHash':v.digest(raw)};anchor={'startedUptime':1,'sequence':1,'total':dict.fromkeys(limits,0)};context=v.make_context(h,kind,inputs,anchor,effective)
  service=reference(kind);service.update(ownerId=effective['controllerOwner'],generation=effective['target']['generation'],recoveryId=effective['recoveryId'],lineageHash=context['additionHash']);job_id=v.uid();job={'schema':'controller-job-created-v1','project':v.PROJECT,'jobId':job_id,'containerId':'9'*64,'service':'probe','ownerId':effective['controllerOwner'],'imageDigest':PROFILES['probe'][2].split('@',1)[1],'commandHash':'a'*64,'state':'CREATED BEFORE START/SQL','createdAt':'2026-10-15T00:00:00Z'}
  objects={h.ROOT/'master/material.json':original,h.ROOT/'secrets/source-normal-manifest.json':normal,h.ROOT/'secrets/source-capture-result.json':capture,h.ROOT/'secrets/source-live-end.json':end,h.ROOT/'journal/copy-index.json':{},h.ROOT/'journal/source.jsonl':raw,h.ROOT/'budget/ledger.json':{'schema':'cp019-budget-v1','project':v.SOURCE,'startedUptime':1,'sequence':1,'total':dict(anchor['total'])},v.context_path(h,kind):context,root/'master/context.json':{'schema':'target-variant-root-v1','kind':kind,'project':v.PROJECT,'contextHash':v.digest(context),'additionHash':context['additionHash']},root/'master/services'/('postgres-'+service['containerId']+'.json'):service,root/'evidence/jobs'/(job_id+'-created.json'):job}
  def read(host,path,*args,**kwargs):calls.append(('read',path));value=objects[path];return value,v.digest(value)
  def listing(path):return iter(p for p in objects if p.parent==path)
  return h,root,objects,calls,read,listing,service,job
 def test_expired_cohort_blocks_normal_reader_but_emergency_retains_only_custodied_cids_without_clock_or_pressure(self):
  h,root,objects,calls,read,listing,service,job=self.fixture()
  with patch.object(v,'read',side_effect=read),patch.object(v,'directory'),patch('pathlib.Path.exists',side_effect=lambda p=0:False):
   with self.assertRaisesRegex(AssertionError,'LEDGER_CHANGED'):v.load_context(h,'commit-interrupted')
  calls.clear();h.uptime=lambda:self.fail('Emergency reading must not depend on the elapsed clock')
  with patch.object(v,'read',side_effect=read),patch.object(v,'directory'),patch('pathlib.Path.exists',lambda p:p==root),patch('pathlib.Path.is_symlink',return_value=False),patch('pathlib.Path.iterdir',listing):refs=v.emergency_variant_references(h)
  self.assertEqual({r['containerId'] for r in refs},{service['containerId'],job['containerId']});self.assertTrue(all(v.matches(fact(r),r,PROFILES) for r in refs));self.assertFalse(any(kind=='read' and path==h.ROOT/'budget/ledger.json' for kind,path in calls));self.assertIn(('own',h.ROOT),calls);self.assertIn(('own',h.TARGET),calls)
 def test_emergency_still_rejects_changed_root_lineage_owner_pin_config_and_cid(self):
  for mutation in ['marker','lineage','owner','pin','config','cid','job-owner']:
   h,root,objects,calls,read,listing,service,job=self.fixture()
   if mutation=='marker':objects[root/'master/context.json']['contextHash']='f'*64
   elif mutation=='lineage':objects[v.context_path(h,'commit-interrupted')]['addition']['recoveryId']=v.uid()
   elif mutation=='job-owner':job['ownerId']=v.uid()
   else:service[{'owner':'ownerId','pin':'imageRef','config':'configHash','cid':'containerId'}[mutation]]={'owner':v.uid(),'pin':'postgres:latest','config':'invalid','cid':'8'*64}[mutation]
   with patch.object(v,'read',side_effect=read),patch.object(v,'directory'),patch('pathlib.Path.exists',lambda p:p==root),patch('pathlib.Path.is_symlink',return_value=False),patch('pathlib.Path.iterdir',listing):
    with self.assertRaises(AssertionError):v.emergency_variant_references(h)
 def test_emergency_does_not_adopt_a_label_only_container_or_suppress_root_directory_failure(self):
  h,root,objects,calls,read,listing,service,job=self.fixture();objects={p:x for p,x in objects.items() if p.parent not in [root/'master/services',root/'evidence/jobs']}
  def empty_read(host,path,*args,**kwargs):value=objects[path];return value,v.digest(value)
  with patch.object(v,'read',side_effect=empty_read),patch.object(v,'directory'),patch('pathlib.Path.exists',lambda p:p==root),patch('pathlib.Path.is_symlink',return_value=False),patch('pathlib.Path.iterdir',lambda p:iter([])):self.assertEqual(v.emergency_variant_references(h),[])
  with patch.object(v,'read',side_effect=read),patch.object(v,'directory',side_effect=AssertionError('ROOT_DIRECTORY_CHANGED')),patch('pathlib.Path.exists',lambda p:p==root),patch('pathlib.Path.is_symlink',return_value=False):
   with self.assertRaisesRegex(AssertionError,'DIRECTORY_CHANGED'):v.emergency_variant_references(h)

class FilesystemBoundaries(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.parent=pathlib.Path(self.tmp.name).resolve();self.kind='commit-interrupted';self.root=self.parent/'target/variants'/self.kind;self.root.mkdir(parents=True)
  for name in ['master/services','evidence/jobs']:(self.root/name).mkdir(parents=True)
  self.m=v.choose_effective(material());self.context={'effectiveMaterial':self.m,'additionHash':'e'*64};self.calls=[];self.current=None
  def read_private(path,uid,limit,mode,json_value):
   raw=path.read_bytes();self.assertLessEqual(len(raw),limit);return (v.json.loads(raw) if json_value else raw),v.digest(raw)
  def write_plain(path,raw,mode,uid):
   self.calls.append(('sealed',path));self.assertFalse(path.exists());path.write_bytes(raw if isinstance(raw,bytes) else raw.encode())
  self.h=types.SimpleNamespace(ROOT=self.parent/'source',TARGET=self.parent/'target',PROFILES=PROFILES,PINS={},target_bridge=lambda:types.SimpleNamespace(read_private=read_private),write_plain=write_plain,inspect_container=lambda _:self.current,run=self.fake_run,created_job_identity=lambda c,j,r:all(c.get(k)==r.get(key) for k,key in [('id','containerId'),('project','project'),('service','service'),('ownerId','ownerId'),('jobId','jobId')]))
  self.original_paths=v.paths
  def local_paths(kind):
   p=self.original_paths(kind);r=self.parent/'target/variants'/kind;return {key:r/value.relative_to(p['root']) for key,value in p.items()}
  self.patches=[patch.object(v,'paths',side_effect=local_paths),patch.object(v,'load_context',return_value=(self.context,'c'*64)),patch.object(v,'directory'),patch.object(v.VariantHost,'own',return_value={}),patch.object(v.VariantHost,'guard_effect',side_effect=lambda *args:self.calls.append(('guard',args))),patch.object(v,'verify_mounts',side_effect=lambda *args:self.calls.append(('mounts',args))),patch.object(v,'case_budget',side_effect=lambda *args:self.calls.append(('deadline',args)))]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.tmp.cleanup()
 def fake_run(self,*args):
  self.calls.append(('docker',args))
  if args[:2]==('docker','start'):
   refs=list((self.root/'master/services').iterdir());self.assertEqual(len(refs),1);self.assertEqual(v.json.loads(refs[0].read_bytes())['containerId'],args[2])
  return ''
 def row(self,service='postgres',cid='d'*64):
  cpu,mem,image=PROFILES[service];return {'id':cid,'project':v.PROJECT,'service':service,'ownerId':v.owners(self.m)[service],'nanoCpus':cpu,'memory':mem,'imageRef':image,'running':False,'status':'created','pid':0,'startedAt':'0001-01-01T00:00:00Z'}
 def test_durable_reference_exists_before_any_start_and_is_read_back(self):
  self.current=self.row();reference=v.register_service(self.h,self.kind,'postgres','d'*64,'f'*64)
  self.assertFalse(any(x[0]=='docker' for x in self.calls));v.start_service(self.h,self.kind,'postgres','d'*64)
  sealed=next(i for i,x in enumerate(self.calls) if x[0]=='sealed');started=next(i for i,x in enumerate(self.calls) if x[0]=='docker');self.assertLess(sealed,started)
  self.assertEqual(reference['containerId'],'d'*64)
 def test_foreign_or_already_running_container_is_never_enrolled(self):
  for changes in [{'ownerId':v.uid()},{'running':True,'status':'running','pid':1},{'status':'exited'}]:
   self.current={**self.row(),**changes}
   with self.assertRaisesRegex(AssertionError,'CREATED_REQUIRED'):v.register_service(self.h,self.kind,'postgres','d'*64,'f'*64)
   self.assertEqual(list((self.root/'master/services').iterdir()),[])
 def test_reference_tampering_or_cid_replacement_blocks_start(self):
  self.current=self.row();v.register_service(self.h,self.kind,'postgres','d'*64,'f'*64);self.current={**self.current,'id':'9'*64}
  with self.assertRaisesRegex(AssertionError,'START_CHANGED'):v.start_service(self.h,self.kind,'postgres','d'*64)
  self.assertFalse(any(x[0]=='docker' for x in self.calls))
 def test_publication_budget_failure_leaves_container_cold(self):
  self.current=self.row()
  with patch.object(v,'publish',side_effect=AssertionError('BUDGET_CLOSED')):
   with self.assertRaisesRegex(AssertionError,'BUDGET_CLOSED'):v.register_service(self.h,self.kind,'postgres','d'*64,'f'*64)
  self.assertEqual(list((self.root/'master/services').iterdir()),[]);self.assertFalse(any(x[0]=='docker' for x in self.calls))
 def test_job_start_requires_the_original_sealed_reference(self):
  job={'root':self.root,'profile':'harness','cid':'d'*64,'jobId':v.uid(),'ownerId':self.m['controllerOwner'],'receiptHash':'f'*64}
  with self.assertRaises(FileNotFoundError):v.start_job(self.h,self.kind,job)
  self.assertFalse(any(x[0]=='docker' for x in self.calls))
 def test_copy_keeps_backup_bytes_and_produces_independent_inodes(self):
  backup=self.h.ROOT/'backup/source-copy';backup.mkdir(parents=True);(backup/'base').mkdir();(backup/'PG_VERSION').write_bytes(b'18\n');(backup/'base/one').write_bytes(b'fixture-row')
  index={'schema':'copy-index-v1','files':[{'path':p.relative_to(backup).as_posix(),'bytes':p.stat().st_size,'sha256':v.digest(p.read_bytes())} for p in [backup/'PG_VERSION',backup/'base/one']]};before={f['path']:(backup/f['path']).read_bytes() for f in index['files']};self.context['addition']={'copyIndexHash':v.digest(index)}
  ts=importlib.util.spec_from_file_location('copy_inventory',pathlib.Path(__file__).with_name('target-host.py'));bridge=importlib.util.module_from_spec(ts);ts.loader.exec_module(bridge);old=self.h.target_bridge();self.h.target_bridge=lambda:types.SimpleNamespace(read_private=old.read_private,inventory_copy=bridge.inventory_copy)
  (self.root/'data').mkdir();self.h.set_host_case=lambda name:self.calls.append(('case',name));self.h.facts=lambda:[];self.h.ledger_charge=lambda kind:self.calls.append(('charge',kind));self.h.syncdir=lambda path:None
  real_fstat=v.os.fstat;ctimes={p.stat().st_ino:p.stat().st_ctime_ns for p in [backup/'PG_VERSION',backup/'base/one']}
  def linux_fstat(fd):
   # Windows lstat may expose birthtime while fstat exposes change time. Model
   # Linux ctime only; keep actual bytes, inode, links, mode, size and mtime.
   s=real_fstat(fd);fields={key:getattr(s,key) for key in dir(s) if key.startswith('st_')};fields['st_ctime_ns']=ctimes.get(s.st_ino,s.st_ctime_ns);return types.SimpleNamespace(**fields)
  with patch.object(v,'source_inputs',return_value={'index':index}),patch.object(v.os,'chown',create=True),patch.object(v.os,'fchown',create=True),patch.object(v.os,'fstat',side_effect=linux_fstat):result=v.copy_variant(self.h,self.kind)
  self.assertEqual(result['files'],2);self.assertEqual(result['bytes'],14);self.assertEqual(result['physicalRecovery'],'NOT VERIFIED');destination=self.root/'data/18/docker'
  for entry in index['files']:
   self.assertEqual((backup/entry['path']).read_bytes(),before[entry['path']]);self.assertEqual((destination/entry['path']).read_bytes(),before[entry['path']]);self.assertNotEqual((backup/entry['path']).stat().st_ino,(destination/entry['path']).stat().st_ino)
  (destination/'base/one').write_bytes(b'wrong-bytes')
  with patch.object(v,'source_inputs',return_value={'index':index}),self.assertRaisesRegex(AssertionError,'HASH|FILE'):v.verify_copy(self.h,self.kind)

class PreStartCustody(unittest.TestCase):
 def test_variant_mount_failure_keeps_identity_receipt_before_start(self):
  context={'effectiveMaterial':material(),'additionHash':'a'*64};owner=v.owners(context['effectiveMaterial'])['postgres'];cpu,mem,image=PROFILES['postgres'];actual={'id':'d'*64,'project':v.PROJECT,'service':'postgres','ownerId':owner,'imageRef':image,'nanoCpus':cpu,'memory':mem,'running':False,'status':'created','pid':0,'startedAt':'0001-01-01T00:00:00Z'};events=[]
  h=types.SimpleNamespace(ROOT=pathlib.Path('/opt')/v.SOURCE,TARGET=pathlib.Path('/opt')/v.PROJECT,PROFILES=PROFILES,PINS={},inspect_container=lambda _:dict(actual),own=lambda *_:None)
  with patch.object(v.VariantHost,'own'),patch.object(v,'load_context',return_value=(context,'b'*64)),patch.object(v.VariantHost,'references',return_value=[]),patch.object(v,'publish',side_effect=lambda *_:events.append('ROOT_REF_FSYNC')),patch.object(v,'verify_mounts',side_effect=lambda *_:events.append('MOUNTS_FAIL') or (_ for _ in ()).throw(AssertionError('MOUNTS_FAIL'))):
   with self.assertRaisesRegex(AssertionError,'MOUNTS_FAIL'):v.register_service(h,'commit-interrupted','postgres',actual['id'],'c'*64)
  self.assertEqual(events,['ROOT_REF_FSYNC','MOUNTS_FAIL'])

class CreatedMountReadout(unittest.TestCase):
 def fixture(self,service='postgres',kind='commit-interrupted'):
  import json
  ts=importlib.util.spec_from_file_location('mount_target_peer',pathlib.Path(__file__).with_name('target-host.py'));bridge=importlib.util.module_from_spec(ts);ts.loader.exec_module(bridge)
  root=v.paths(kind)['root'];source=pathlib.Path('/opt')/v.SOURCE;main=pathlib.Path('/opt')/v.PROJECT
  raw=json.loads((pathlib.Path(__file__).resolve().parents[3]/'docs/evidence/cp021/mount-readonly.json').read_text());spec=copy.deepcopy(raw['expected']);actual=copy.deepcopy(raw['actual'])
  def destination(src):
   path=pathlib.Path(src)
   # Evidence uses Linux separators even on the Windows pure-model host.
   relative=pathlib.PurePosixPath(src).relative_to('/opt/mecanet-qa-p1l3-r02')
   return str((main if relative.parts[0]=='tls' else root)/pathlib.Path(*relative.parts))
  for mount in actual['mounts']:mount['Source']=destination(mount['Source'])
  spec['volumes']=[destination(row.rsplit(':',2)[0])+':'+':'.join(row.rsplit(':',2)[1:]) for row in spec['volumes']]
  if service!='postgres':spec={'volumes':[str(root/'secrets/api1.json')+':/run/qa-secrets/api.json:ro'],'tmpfs':['/tmp:size=16m,uid=999,gid=999']};actual={'mounts':[{'Type':'bind','Source':str(root/'secrets/api1.json'),'Destination':'/run/qa-secrets/api.json','RW':False}],'tmpfs':{'/tmp':'size=16m,uid=999,gid=999'},'ports':{}}
  h=types.SimpleNamespace(ROOT=source,TARGET=main,PROFILES=PROFILES,PINS={},inspect_container=lambda _: {'service':service},target_bridge=lambda:bridge,run=lambda *args:json.dumps(actual));return h,kind,spec,actual
 def invoke(self,h,kind,spec,actual):
  with patch.object(v,'read',return_value=({'services':{h.inspect_container('')['service']:spec}},'c'*64)),patch.object(v.pathlib.Path,'resolve',lambda p:p),patch.object(v.pathlib.Path,'is_symlink',return_value=False):return v.verify_mounts(h,kind,'a'*64)
 def test_real_created_pg_readout_without_mounted_tmpfs_is_accepted(self):
  h,kind,spec,actual=self.fixture();self.assertFalse(any(m['Type']=='tmpfs' for m in actual['mounts']));self.assertEqual(self.invoke(h,kind,spec,actual),actual['mounts'])
 def test_missing_extra_or_changed_hostconfig_tmpfs_is_rejected(self):
  for change in ['missing','extra','options','volume','extra-bind','readonly-data','ports']:
   h,kind,spec,actual=self.fixture()
   if change=='missing':actual['tmpfs'].pop('/var/run/postgresql')
   if change=='extra':actual['tmpfs']['/run/secrets']='size=1m'
   if change=='options':actual['tmpfs']['/tmp']='size=32m'
   if change=='volume':actual['mounts'][0]['Type']='volume'
   if change=='extra-bind':actual['mounts'].append({'Type':'bind','Source':str(v.paths(kind)['root']/'data'),'Destination':'/extra','RW':True})
   if change=='readonly-data':next(m for m in actual['mounts'] if m['Destination']=='/var/lib/postgresql')['RW']=False
   if change=='ports':actual['ports']={'5432/tcp':[{'HostPort':'5432'}]}
   with self.subTest(change=change),self.assertRaises(AssertionError):self.invoke(h,kind,spec,actual)
 def test_empty_runtime_bind_is_segmented_but_tmpfs_keeps_exact_options(self):
  h,kind,spec,actual=self.fixture('api1','roster-empty');root=v.paths(kind)['root'];actual['mounts'][0].update(Source=str(root/'secrets/readiness-api1.json'),Destination='/run/qa-secrets/readiness-api1.json');self.assertEqual(self.invoke(h,kind,spec,actual),actual['mounts'])
  actual['tmpfs']['/tmp']='size=16m';
  with self.assertRaises(AssertionError):self.invoke(h,kind,spec,actual)
 def test_job_tmpfs_is_fixed_and_not_an_arbitrary_runtime_spec(self):
  h,kind,spec,actual=self.fixture('probe');actual['mounts']=[];self.assertEqual(self.invoke(h,kind,spec,actual),[])
  actual['tmpfs']['/tmp']='size=16m,uid=0,gid=0'
  with self.assertRaises(AssertionError):self.invoke(h,kind,spec,actual)
 def test_variant_closed_create_accepts_supported_flag_only(self):
  h=types.SimpleNamespace(ROOT=pathlib.Path('/opt')/v.SOURCE,TARGET=pathlib.Path('/opt')/v.PROJECT,PROFILES=PROFILES,PINS={});view=v.VariantHost(h,'commit-interrupted');calls=[]
  with patch.object(v,'create_service',side_effect=lambda _,kind,service:calls.append(service) or {'containerId':'a'*64}):
   for selected in [('postgres',),('worker',),('api1','api2','web')]:view.compose(view.TARGET,'create','--no-build','--pull','never','--no-recreate',*selected)
   for args in [('create','--no-build','--pull','never','--no-deps','postgres'),('create','--no-build','--pull','never','--no-recreate','api1'),('create','--no-build','--pull','never','--no-recreate','worker','postgres')]:
    before=list(calls)
    with self.assertRaises(AssertionError):view.compose(view.TARGET,*args)
    self.assertEqual(calls,before)

if __name__=='__main__':unittest.main()
