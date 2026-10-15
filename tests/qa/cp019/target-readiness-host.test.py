"""Local pure/boundary models only. No Docker, SSH or PostgreSQL PASS."""
import copy, importlib.util, json, pathlib, subprocess, types, unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('readiness_host',pathlib.Path(__file__).with_name('target-readiness-host.py'));r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
REPO=pathlib.Path(__file__).resolve().parents[3]
NODE=r"""
import{chooseMaterial}from'./server/saas/recovery/custody.js';
import{sha256}from'./server/saas/recovery/protocol.js';
import{makeSourceNormalManifest}from'./tests/qa/cp019/source-driver.mjs';
import{makeTargetVariantLineage}from'./tests/qa/cp019/target-variant-lineage.mjs';
const o=await chooseMaterial({project:'mecanet-qa-p1l3-r03',artifactDigest:'a'.repeat(64)}),n=await chooseMaterial({project:o.source.project,artifactDigest:o.artifactDigest}),m={...structuredClone(o),recoveryId:n.recoveryId,target:{...n.target,identityPassword:o.target.identityPassword,identityPasswordHash:o.target.identityPasswordHash},stageOperationIds:Object.fromEntries(Object.entries(o.stageOperationIds).map(([k,v])=>[k,k.startsWith('source-')?v:n.stageOperationIds[k]]))},h='a'.repeat(64);
const resource={project:o.source.project,cohortId:o.source.normal.runId,hostIdentity:h,containerId:'1'.repeat(64),containerLabels:{project:o.source.project,service:'postgres'},imageDigest:'sha256:67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129',volumeId:'own-source',dataPath:'/opt/'+o.source.project+'/data/18/docker',networkId:'source',networkSubnet:'10.77.64.0/24',networkIP:'10.77.64.2',socketPath:'/opt/'+o.source.project+'/ingress/http.sock',generation:o.source.generation,systemIdentifier:'1234567890123456789'};
const normal=makeSourceNormalManifest({material:o,custodyHash:sha256(o),resource,migrationHashes:{central:h,tenant:h},sourceCommit:'b'.repeat(40)}),processes=['api1','api2','worker','web'].map((service,i)=>({service,containerId:String(i+3).repeat(64),ownerId:service==='worker'?o.source.workerClockOwner:service==='web'?o.source.webOwner:o.source.apiOwners[service],exitCode:0,finishedAt:'2026-10-15T00:00:00Z'})),end={schema:'source-end-v1',recoveryId:o.recoveryId,sourceResourceHash:sha256(resource),processes,sqlOwners:processes.slice(0,3).map(p=>p.ownerId),httpOperationIds:[]},observed={resourceHash:sha256(resource),containers:processes.map(p=>({...p,id:p.containerId,running:false})),sqlOwnersPresent:[],httpPending:[]},capture={schema:'source-capture-v1',runId:o.source.normal.runId,custodyHash:sha256(o),normalManifestHash:sha256(normal),resourceHash:sha256(resource),sourceCommit:normal.sourceCommit,sourceFingerprints:{central:h,'11111111-1111-4111-8111-111111111111':h,'22222222-2222-4222-8222-222222222222':h}};
const result={};for(const kind of ['roster-empty','allclosed','a5-restrictions']){const c={kind,originalMaterial:o,effectiveMaterial:m,sourceCapture:capture,sourceNormalManifest:normal,sourceResource:resource,sourceEndProof:end,observedSourceEnd:observed,copyIndex:{schema:'copy-index-v1',files:[{path:'PG_VERSION',bytes:3,sha256:sha256('18\n')}]},sourceJournalFinalCheckpoint:{sequence:5,hash:h},ledgerAnchor:{schema:'target-variant-budget-anchor-v1',project:o.source.project,path:'/opt/'+o.source.project+'/budget/ledger.json',registryHash:h,startedUptime:100,sequence:1,total:{sql:1,http:0,journal:0,artifactFiles:1}}};c.addition=makeTargetVariantLineage(c);c.additionHash=sha256(c.addition);result[kind]={lineage:c,targetResource:{...resource,project:m.target.project,cohortId:m.recoveryId,generation:m.target.generation,containerId:'9'.repeat(64),containerLabels:{project:m.target.project,service:'postgres'},dataPath:c.addition.paths.data,socketPath:c.addition.paths.socket,volumeId:'own-target',networkId:'target',networkSubnet:'10.77.66.0/25',networkIP:'10.77.66.2'},targetCa:'SYNTHETIC CA',sourceSha:'b'.repeat(40)}}
process.stdout.write(JSON.stringify(result));
"""

class Plans(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  p=subprocess.run(['node','--input-type=module','-e',NODE],cwd=REPO,text=True,capture_output=True,timeout=20);assert p.returncode==0,'Synthetic Node fixture construction failed';cls.fixtures=json.loads(p.stdout)
 def test_python_plans_equal_the_real_node_pure_constructor_byte_for_byte(self):
  for kind in r.KINDS:
   x=copy.deepcopy(self.fixtures[kind]);restriction='f0000000-0000-4000-8000-000000000001'
   expected=r.make_empty_plan(x) if kind=='roster-empty' else r.make_final_close_plan(x,'a'*64,'b'*64,restriction)
   script="import{makeEmptyReadinessPlan,makeFinalClosePlan}from'./tests/qa/cp019/readiness-variant.mjs';import{sha256}from'./server/saas/recovery/protocol.js';let s='';for await(const c of process.stdin)s+=c;const x=JSON.parse(s),p=x.lineage.kind==='roster-empty'?makeEmptyReadinessPlan(x):makeFinalClosePlan({...x,manifestHash:'a'.repeat(64),parentPlanHash:'b'.repeat(64),restrictionId:'f0000000-0000-4000-8000-000000000001',expectedWriterVersion:x.lineage.kind==='allclosed'?'3':'9'});process.stdout.write(sha256(p));"
   p=subprocess.run(['node','--input-type=module','-e',script],cwd=REPO,input=r.canonical(x).decode(),text=True,capture_output=True,timeout=20)
   self.assertEqual(p.returncode,0,'Node rejected synthetic prospective input');self.assertEqual(p.stdout,r.digest(expected),'Python/Node plan canonical hash differs')
 def test_empty_creates_only_a_new_literal_central_and_preserves_the_copied_inventory(self):
  x=copy.deepcopy(self.fixtures['roster-empty']);before=r.digest(x);p=r.make_empty_plan(x)
  self.assertEqual(p['database'],'mecanet_control_empty');self.assertEqual(p['manifest']['expectedTenants'],[]);self.assertEqual(len(p['preserveDatabases']),4);self.assertEqual(r.digest(x),before);self.assertNotEqual(p['manifest']['runId'],x['lineage']['sourceNormalManifest']['runId']);self.assertEqual(p['sourceSystemIdentifier'],x['targetResource']['systemIdentifier'])
 def test_versions_and_cases_are_prospective_and_never_read_from_sql(self):
  for kind,version,case in [('allclosed','3','ready-allclosed'),('a5-restrictions','9','variant-a5-identity')]:
   x=copy.deepcopy(self.fixtures[kind]);p=r.make_final_close_plan(x,'a'*64,'b'*64,'f0000000-0000-4000-8000-000000000001');self.assertEqual(p['expectedA']['writerVersion'],version);self.assertEqual(p['afterA']['writerVersion'],str(int(version)+1));self.assertEqual(p['caseName'],case);self.assertEqual(p['globalBarrier'],kind=='a5-restrictions')
   with self.assertRaises(AssertionError):r.make_final_close_plan(x,'a'*64,'b'*64,x['lineage']['effectiveMaterial']['source']['operationIds']['restore'])
 def test_changed_sid_namespace_lineage_and_main_paths_are_rejected(self):
  for mutate in [lambda x:x['targetResource'].update(systemIdentifier='9876543210987654321'),lambda x:x['targetResource'].update(dataPath='/opt/'+r.PROJECT+'/data/18/docker'),lambda x:x['targetResource'].update(project='nexora'),lambda x:x['lineage'].update(additionHash='f'*64)]:
   x=copy.deepcopy(self.fixtures['roster-empty']);mutate(x)
   with self.assertRaises(AssertionError):r.make_empty_plan(x)
 def test_unknown_commands_and_variants_fail_before_any_host_operation(self):
  for action,args in [('bad',['roster-empty']),('readiness-run',['nexora','final-close']),('readiness-run',['roster-empty','final-close']),('readiness-run',['allclosed','prepare-empty']),('readiness-run',['a5-restrictions','probe-ready'])]:
   with self.assertRaises(AssertionError):r.dispatch(object(),action,args)
 def test_close_id_is_selected_once_offline_and_a_pg_reference_blocks_the_chooser(self):
  c=self.fixtures['allclosed']['lineage'];view=types.SimpleNamespace(TARGET=pathlib.Path('/opt')/r.PROJECT/'variants/allclosed',own=lambda *_:None,preserve=lambda:None,references=lambda:[{'service':'postgres'}]);v=types.SimpleNamespace(VariantHost=lambda *_:view,load_context=lambda *_:(c,r.digest(c)))
  with patch.object(r,'bridge',return_value=v),patch('pathlib.Path.exists',return_value=False),patch('pathlib.Path.is_symlink',return_value=False),patch.object(r.uuid,'uuid4',side_effect=AssertionError('chooser must not run')):
   with self.assertRaisesRegex(AssertionError,'MUST_PRECEDE_SQL'):r.select_close_id(object(),'allclosed')
  view.references=lambda:[];saved=[]
  with patch.object(r,'bridge',return_value=v),patch('pathlib.Path.exists',return_value=False),patch('pathlib.Path.is_symlink',return_value=False),patch.object(r.uuid,'uuid4',return_value='f0000000-0000-4000-8000-000000000001'),patch.object(r,'publish',side_effect=lambda h,p,value:saved.append(value)):
   selected=r.select_close_id(object(),'allclosed')
  self.assertEqual(len(saved),1)
  with patch.object(r,'bridge',return_value=v),patch('pathlib.Path.exists',return_value=True),patch.object(r,'read',return_value=(selected,r.digest(selected))),patch.object(r.uuid,'uuid4',side_effect=AssertionError('must retain original choice')):
   self.assertEqual(r.digest(r.select_close_id(object(),'allclosed')),r.digest(selected))
 def test_actual_node_reports_must_bind_kind_generation_run_lineage_and_the_exact_probe_mode(self):
  x=self.fixtures['allclosed'];m=x['lineage']['effectiveMaterial'];a={'planHash':'a'*64};receipt={'schema':'cp019-readiness-http-v1','kind':'allclosed','phase':'ready','caseName':'ready-allclosed','planHash':a['planHash'],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'sourceSha':x['sourceSha'],'variantLineageHash':x['lineage']['additionHash'],'expectedReadyStatus':200,'instances':[{'instance':s,'live':200,'ready':200,'probes':2} for s in ['api1','api2']],'tenantAuthorization':False,'pendingHttp':0}
  self.assertEqual(r.validate_node_receipt(receipt,x,a,'probe-ready')['pendingHttp'],0)
  for delta in [{'kind':'roster-empty'},{'generation':m['source']['generation']},{'recoveryId':m['source']['normal']['runId']},{'phase':'unready'},{'pendingHttp':1},{'variantLineageHash':'f'*64}]:
   with self.assertRaises(AssertionError):r.validate_node_receipt({**receipt,**delta},x,a,'probe-ready')
 def test_host_publishes_custodied_cfg_and_created_reference_before_start_then_requires_the_original_job_end(self):
  x=self.fixtures['roster-empty'];m=x['lineage']['effectiveMaterial'];a={'schema':'cp021-readiness-authority-v1','kind':'roster-empty','caseName':'ready-empty','planHash':'a'*64,'sourceSha':x['sourceSha']};events=[];storage={};current={}
  receipt={'schema':'cp019-empty-prepared-v1','kind':'roster-empty','caseName':'ready-empty','planHash':a['planHash'],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'sourceSha':x['sourceSha'],'variantLineageHash':x['lineage']['additionHash'],'database':'mecanet_control_empty','originalDataPreserved':True,'health':'NOT VERIFIED'}
  def create_job(root,profile,command,env,**kw):
   events.append('created');job={'jobId':env['QA_INVOCATION_ID'],'cid':'e'*64,'root':root,'profile':profile,'receiptHash':'f'*64};current['job']=job;current['created']={'commandHash':r.digest(command)};return job
  view=types.SimpleNamespace(TARGET=pathlib.Path('/opt')/r.PROJECT/'variants/roster-empty',scope_facts=lambda:[],create_job=create_job,read_created_job=lambda job:current['created'],start_job=lambda job:events.append('start'))
  def watch(view,job,update):
   update();events.append('end');end={'createdReceiptHash':r.digest(current['created']),'exitCode':0,'containerStopped':True};current['end']=end;proof={'jobCreatedHash':r.digest(current['created']),'jobEndHash':r.digest(end)};return json.dumps({'type':'cp019-readiness-job','action':'prepare-empty','kind':'roster-empty','planHash':a['planHash'],'receiptHash':r.digest(receipt),'secretOutput':False}),proof
  h=types.SimpleNamespace(set_host_case=lambda *_:None,enter_runtime_case=lambda *_:None,target_bridge=lambda:types.SimpleNamespace(watch_job=watch));v=types.SimpleNamespace(BUSINESS={'worker','api1','api2','web'})
  def publish(host,path,value,*_):storage[path.name]=value;events.append('reference' if path.name.startswith('readiness-job-') else 'published');return r.digest(value)
  def read(host,path,*_):value=current['end'] if path.name.endswith('-end.json') else receipt;return value,r.digest(value)
  with patch.object(r,'load_authority',return_value=(view,x,a)),patch.object(r,'bridge',return_value=v),patch.object(r,'publish',side_effect=publish),patch.object(r,'read',side_effect=read),patch.object(r,'observation',return_value={}),patch.object(r,'mailbox',side_effect=lambda *_:events.append('mailbox')):
   result=r.run(h,'roster-empty','prepare-empty')
  self.assertLess(events.index('created'),events.index('reference'));self.assertLess(events.index('reference'),events.index('start'));self.assertLess(events.index('start'),events.index('end'));self.assertEqual(result['physicalAcceptance'],'NOT VERIFIED');self.assertTrue(any(name.startswith('readiness-result-') for name in storage))

class Publication(unittest.TestCase):
 def test_existing_custody_is_read_back_without_a_new_write_and_collisions_fail(self):
  path=types.SimpleNamespace(exists=lambda:True,is_symlink=lambda:False);h=types.SimpleNamespace(write_plain=lambda *_:self.fail('must not rewrite'));value={'schema':'synthetic','value':1}
  with patch.object(r,'read',return_value=(value,r.digest(value))):self.assertEqual(r.publish(h,path,value),r.digest(value))
  with patch.object(r,'read',return_value=({'schema':'changed'},'0'*64)):
   with self.assertRaisesRegex(AssertionError,'IMMUTABLE'):r.publish(h,path,value)
 def test_large_index_bound_is_explicit_and_normal_configs_keep_the_small_bound(self):
  path=types.SimpleNamespace(exists=lambda:False,is_symlink=lambda:False);h=types.SimpleNamespace(write_plain=lambda *_:self.fail('must not write oversized cfg'))
  with self.assertRaisesRegex(AssertionError,'BOUND'):r.publish(h,path,{'data':'x'*262144})
 def test_an_import_does_not_inspect_the_host_or_execute_commands(self):
  with patch('subprocess.run',side_effect=AssertionError('unexpected process')),patch('pathlib.Path.read_bytes',side_effect=AssertionError('unexpected read')):
   spec=importlib.util.spec_from_file_location('readiness_import_again',pathlib.Path(__file__).with_name('target-readiness-host.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  self.assertTrue(callable(module.dispatch))

if __name__=='__main__':unittest.main()
