"""Local boundary tests only; no Docker, PostgreSQL, SSH or credentials."""
import copy, importlib.util, json, pathlib, subprocess, types, unittest
from unittest.mock import patch
HERE=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('target_http_host',HERE/'target-http-host.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
REPO=HERE.parents[2]
class Pure(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  node="import{chooseMaterial}from'./server/saas/recovery/custody.js';process.stdout.write(JSON.stringify(await chooseMaterial({project:'mecanet-qa-p1l3-r03',artifactDigest:'a'.repeat(64)})))"
  p=subprocess.run(['node','--input-type=module','-e',node],cwd=REPO,text=True,capture_output=True,timeout=20);assert p.returncode==0,'Synthetic material construction failed';cls.material=json.loads(p.stdout)
 def test_restriction_plan_matches_real_javascript_canonical_hash(self):
  ids=['f0000000-0000-4000-8000-00000000000'+str(i) for i in [1,2,3]];x={'material':self.material,'custodyHash':r.digest(self.material),'configBundleHash':'b'*64,'lineageHash':'c'*64,'ids':ids};p=r.make_restriction_plan(**x)
  code="import{makeA5RestrictionPlan}from'./tests/qa/cp019/a5-negatives.mjs';import{sha256}from'./server/saas/recovery/protocol.js';let s='';for await(const x of process.stdin)s+=x;process.stdout.write(sha256(makeA5RestrictionPlan(JSON.parse(s))))"
  n=subprocess.run(['node','--input-type=module','-e',code],cwd=REPO,input=r.canonical(x).decode(),text=True,capture_output=True,timeout=20);self.assertEqual(n.returncode,0,'Real Node constructor rejected fixture');self.assertEqual(n.stdout,r.digest(p));self.assertEqual([s['beforeVersion'] for s in p['steps']],['3','5','7']);self.assertEqual([s['afterVersion'] for s in p['steps']],['5','7','9'])
 def test_ids_are_distinct_prospective_and_custody_cannot_drift(self):
  x={'material':self.material,'custodyHash':r.digest(self.material),'configBundleHash':'b'*64,'lineageHash':'c'*64,'ids':['f0000000-0000-4000-8000-00000000000'+str(i) for i in [1,2,3]]}
  for delta in [{'ids':[x['ids'][0]]*3},{'ids':[self.material['recoveryId'],*x['ids'][1:]]},{'custodyHash':'f'*64},{'lineageHash':'bad'}]:
   with self.assertRaises(AssertionError):r.make_restriction_plan(**{**x,**delta})
 def test_http_plan_uses_fixed_kind_modes_services_and_binds_own_lineage(self):
  for kind,modes in [('allclosed',['readiness-ready']),('a5-restrictions',['a5-grant','a5-membership','a5-identity']),('commit-interrupted',[]),('promote-prefix',['promotion-barrier'])]:
   context={'kind':kind,'effectiveMaterial':self.material,'addition':{'effectiveMaterialHash':r.digest(self.material),'kind':kind}};context['additionHash']=r.digest(context['addition']);p=r.make_http_plan(context,'b'*64,'d'*40,'2026-10-15T00:00:00.000Z','c'*64)
   self.assertEqual([j['mode'] for j in p['jobs']],modes);self.assertEqual(p['createdServices'],['api1','api2','web','worker']);self.assertEqual(p['generation'],self.material['target']['generation']);self.assertEqual(p['variantLineageHash'],context['additionHash'])
  with self.assertRaises(AssertionError):r.make_http_plan({**context,'kind':'roster-empty'},'b'*64,'d'*40,'2026-10-15T00:00:00.000Z','c'*64)
 def test_dispatch_rejects_unknown_inputs_without_inspecting_any_host(self):
  for action,args in [('bad',[]),('http-a5',['main','grant']),('http-a5',['allclosed','mismatches']),('http-plan',['roster-empty']),('http-select-a5',['a5-restrictions']),('http-promotion',['allclosed'])]:
   with self.assertRaises(AssertionError):r.dispatch(object(),action,args)
 def test_import_is_passive(self):
  with patch('subprocess.run',side_effect=AssertionError('process')),patch('pathlib.Path.read_bytes',side_effect=AssertionError('read')):
   s=importlib.util.spec_from_file_location('http_passive',HERE/'target-http-host.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
  self.assertTrue(callable(m.run_a5))
 def test_acceptance_reconstruction_matches_real_runtime_producer_without_a_configs_acceptance_shortcut(self):
  code=r"""
import{readFile}from'node:fs/promises';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
const url=pathToFileURL(resolve('tests/qa/cp019/target-config.test.mjs'));let fixture=(await readFile(url,'utf8')).split('\ntest(')[0];fixture=fixture.replace(/(from\s*['"])([^'"]+)(['"])/g,(all,before,spec,after)=>before+(spec.startsWith('.')?new URL(spec,url).href:spec)+after);
fixture+=`\nimport{makeTargetAcceptanceContext}from'${new URL('./target-runtime.mjs',url).href}';const f=fixture(),b=makeTargetConfigBundle(f),m=f.material;const history={sourceEpoch:'2',sourceGeneration:m.source.generation,oldSessionCookie:'__Host-mecanet-session=SYNTHETIC',historicalResults:[...m.source.operationIds.products,...m.source.operationIds.receipts].map((operationId,i)=>({operationId,state:'CONFIRMED',productId:m.source.operationIds.products[i%4],movementId:null,onHand:'0',balanceVersion:'1',dataEpoch:'2'}))};const input={material:m,custodyHash:sha256(m),configBundle:b,configBundleHash:sha256(b),sourceCapture:{},sourceCaptureHash:sha256({}),phase:'clock-plan',bootstrapCredential:'target',copyRoot:'/run/qa-copy',sourceSha:b.plan.sourceSha};const acceptance=makeTargetAcceptanceContext({input,sourceHistory:history,sourceHistoryHash:sha256(history)});export const result={m,b,history,acceptance,bindings:{sourceSha:input.sourceSha,configBundleHash:sha256(b)}};`;
const mod=await import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'));process.stdout.write(JSON.stringify(mod.result));
"""
  p=subprocess.run(['node','--input-type=module','-e',code],cwd=REPO,text=True,capture_output=True,timeout=20);self.assertEqual(p.returncode,0,'Real runtime acceptance fixture rejected');x=json.loads(p.stdout);h=types.SimpleNamespace(ROOT=pathlib.Path('/opt')/r.SOURCE);view=types.SimpleNamespace(TARGET=pathlib.Path('/opt')/r.PROJECT);objects={'acceptance.json':x['acceptance'],'source-history.json':x['history'],'target-clock-plan-config.json':{'sourceHistoryHash':r.digest(x['history']),'configBundleHash':x['bindings']['configBundleHash']}}
  with patch.object(r,'read',side_effect=lambda host,path,*_:(objects[path.name],r.digest(objects[path.name]))):self.assertEqual(r.load_acceptance(h,view,x['m'],x['b'],x['bindings'])[0],x['acceptance'])
  objects['acceptance.json']={**x['acceptance'],'generation':x['m']['source']['generation']}
  with patch.object(r,'read',side_effect=lambda host,path,*_:(objects[path.name],r.digest(objects[path.name]))):
   with self.assertRaisesRegex(AssertionError,'ACCEPTANCE_BINDING'):r.load_acceptance(h,view,x['m'],x['b'],x['bindings'])

class Inventory(unittest.TestCase):
 def fixture(self,kind='allclosed'):
  s=importlib.util.spec_from_file_location('existing_lifecycle_tests',HERE/'target-lifecycle.test.py');module=importlib.util.module_from_spec(s);s.loader.exec_module(module);h,objects,effects,reader,facts=module.LifecycleTests().variant_fixture(kind);life=module.l;h.target_bridge().lifecycle=lambda _:life;m,b,bindings=h.target_bridge().bundle_context(h);context,ch=h.variant_lineage();plan=objects[h.TARGET/'master/variant-http-plan.json'][0]
  def read(host,path,uid=0,*_):return reader(path,uid)
  def publish(host,path,value,uid=0):objects[path]=(value,r.digest(value));effects.append(('publish',path.name));return r.digest(value)
  return h,m,b,bindings,context,plan,objects,effects,read,publish,life
 def test_inventory_scans_actual_created_end_reports_and_reuses_real_lifecycle_validator(self):
  h,m,b,bindings,c,plan,objects,effects,read,publish,life=self.fixture();jobs=[p for p in objects if p.parent==h.TARGET/'evidence/jobs']
  with patch.object(r,'frame',return_value=(h,m,b,bindings,c)),patch.object(r,'read',side_effect=read),patch.object(r,'publish',side_effect=publish),patch.object(r,'parent_plan_hash',return_value='a'*64),patch.object(life,'read400',side_effect=lambda p,*_:objects[p]),patch('pathlib.Path.resolve',lambda p:p),patch('pathlib.Path.is_symlink',return_value=False),patch('pathlib.Path.iterdir',return_value=iter(jobs)):
   # Each scan needs a fresh iterator, just as a real directory enumeration.
   with patch('pathlib.Path.iterdir',side_effect=lambda p=0:iter(jobs)):
    inventory=r.publish_http_inventory(h,'allclosed')
  self.assertEqual([j['mode'] for j in inventory['jobs']],['readiness-ready']);self.assertTrue(all(j['pendingHttp']==0 for j in inventory['jobs']));self.assertIn(('publish','variant-http-inventory.json'),effects)
 def test_missing_positive_end_wrong_generation_pending_http_and_extra_job_fail_before_publication(self):
  for mutation in ['end','generation','pending','extra']:
   h,m,b,bindings,c,plan,objects,effects,read,publish,life=self.fixture();rp=h.TARGET/'secrets/readiness-http-ready.json'
   if mutation=='end':
    path=next(p for p in objects if p.name.endswith('-end.json'));objects[path][0]['exitCode']=1;objects[path]=(objects[path][0],r.digest(objects[path][0]))
   elif mutation=='generation':objects[rp][0]['generation']='foreign';objects[rp]=(objects[rp][0],r.digest(objects[rp][0]))
   elif mutation=='pending':objects[rp][0]['pendingHttp']=1;objects[rp]=(objects[rp][0],r.digest(objects[rp][0]))
   else:
    created=copy.deepcopy(next(v[0] for p,v in objects.items() if p.name.endswith('-created.json') and p.parent==h.TARGET/'evidence/jobs'));created['jobId']='f0000000-0000-4000-8000-000000000001';created['containerId']='f'*64;objects[h.TARGET/'evidence/jobs'/(created['jobId']+'-created.json')]=(created,r.digest(created))
   jobs=[p for p in objects if p.parent==h.TARGET/'evidence/jobs']
   with patch.object(r,'read',side_effect=read),patch.object(r,'parent_plan_hash',return_value='a'*64),patch('pathlib.Path.resolve',lambda p:p),patch('pathlib.Path.is_symlink',return_value=False),patch('pathlib.Path.iterdir',side_effect=lambda p=0:iter(jobs)):
    with self.assertRaises(AssertionError):r.scan_http_inventory(h,h,m,bindings,c,plan)
   self.assertFalse(any(e[0]=='publish' for e in effects))
 def test_promotion_inventory_reuses_real_lifecycle_and_never_accepts_open_global_or_changed_effects(self):
  for mutation in [None,{'globalBlocked':False},{'localOpen':False},{'afterHash':'f'*64},{'authenticatedRequest':True},{'post':{'instance':'api2','status':201,'error':None}},{'pendingHttp':True}]:
   h,m,b,bindings,c,plan,objects,effects,read,publish,life=self.fixture('promote-prefix');rp=h.TARGET/'evidence/promotion-barrier.json'
   if mutation:objects[rp][0].update(mutation);objects[rp]=(objects[rp][0],r.digest(objects[rp][0]))
   jobs=[p for p in objects if p.parent==h.TARGET/'evidence/jobs']
   with patch.object(r,'frame',return_value=(h,m,b,bindings,c)),patch.object(r,'read',side_effect=read),patch.object(r,'publish',side_effect=publish),patch.object(r,'parent_plan_hash',return_value='a'*64),patch.object(life,'read400',side_effect=lambda p,*_:objects[p]),patch('pathlib.Path.resolve',lambda p:p),patch('pathlib.Path.is_symlink',return_value=False),patch('pathlib.Path.iterdir',side_effect=lambda p=0:iter(jobs)):
    if mutation:
     with self.assertRaisesRegex(AssertionError,'PROMOTION_REPORT'):r.publish_http_inventory(h,'promote-prefix')
    else:self.assertEqual(r.publish_http_inventory(h,'promote-prefix')['jobs'][0]['mode'],'promotion-barrier')

class Selection(unittest.TestCase):
 def test_ids_cannot_be_chosen_after_a_pg_reference_and_retry_never_rechooses(self):
  context={'kind':'a5-restrictions','effectiveMaterial':{'recoveryId':'a0000000-0000-4000-8000-000000000001','target':{'generation':'b0000000-0000-4000-8000-000000000001'}},'additionHash':'c'*64};view=types.SimpleNamespace(TARGET=pathlib.Path('/opt')/r.PROJECT/'variants/a5-restrictions',own=lambda *_:None,preserve=lambda:None,references=lambda:[{'service':'postgres'}]);v=types.SimpleNamespace(VariantHost=lambda *_:view,load_context=lambda *_:(context,r.digest(context)))
  with patch.object(r,'variant_bridge',return_value=v),patch('pathlib.Path.exists',return_value=False),patch('pathlib.Path.is_symlink',return_value=False),patch.object(r.uuid,'uuid4',side_effect=AssertionError('chooser')):
   with self.assertRaisesRegex(AssertionError,'PRECEDE_SQL'):r.select_a5_ids(object())
  ids=['f0000000-0000-4000-8000-00000000000'+str(i) for i in [1,2,3]];saved={'schema':'cp021-a5-restriction-choice-v1','kind':'a5-restrictions','generation':context['effectiveMaterial']['target']['generation'],'recoveryId':context['effectiveMaterial']['recoveryId'],'lineageHash':context['additionHash'],'ids':ids}
  with patch.object(r,'variant_bridge',return_value=v),patch('pathlib.Path.exists',return_value=True),patch.object(r,'read',return_value=(saved,r.digest(saved))),patch.object(r.uuid,'uuid4',side_effect=AssertionError('must retain choice')):self.assertEqual(r.select_a5_ids(object()),saved)

class Runner(unittest.TestCase):
 def test_promotion_seals_its_exact_config_and_refreshes_actual_host_mailbox_before_start_and_through_end(self):
  h,m,b,bindings,c,http,objects,effects,read,publish,life=Inventory().fixture('promote-prefix');bindings['configBundleHeaderHash']='e'*64;events=[];current={};bridge=h.target_bridge();prefix={'schema':'cp019-abort-prefix-context-v1','configBundleHash':bindings['configBundleHash'],'abortPrefix':{'extensionHash':'a'*64}};objects[h.TARGET/'secrets/target-abort-prefix-context.json']=(prefix,r.digest(prefix));original_read=read
  def read(host,path,*args):return (b'SYNTHETIC CA',r.digest(b'SYNTHETIC CA')) if path.name=='ca.crt' else original_read(host,path,*args)
  def publish(host,path,value,uid=0):objects[path]=(value,r.digest(value));events.append('cfg' if path.name.startswith('promotion-barrier-config-') else 'ref' if path.name.startswith('promotion-barrier-job-') else 'alias');return r.digest(value)
  def create(root,profile,cmd,env,**kw):
   self.assertIn('cfg',events);self.assertIn('alias',events);self.assertEqual(profile,'probe');self.assertEqual(cmd,['node','tests/qa/cp019/promotion-barrier.mjs']);self.assertIn((h.TARGET/'live','/run/qa-live','ro'),kw['mounts']);job={'jobId':env['QA_INVOCATION_ID'],'cid':'f'*64};current.update(job=job,created={'commandHash':r.digest(cmd)});events.append('created');return job
  h.create_job=create;h.read_created_job=lambda _:current['created'];h.start_job=lambda _:events.append('start');bridge.observation=lambda view,phase,cfg,base:events.append('observe') or {'receipt':{}};bridge.atomic_mailbox=lambda *_:events.append('mailbox')
  def watch(view,job,update):
   update();events.append('end');report=objects[h.TARGET/'evidence/promotion-barrier.json'][0];return json.dumps({'type':'cp021-promotion-barrier','status':'PASS','reportHash':r.digest(report),'sourceSha':bindings['sourceSha'],'secretsPrinted':False}),{'model':'no physical SQL'}
  bridge.watch_job=watch;bridge.job_provenance=lambda *_:events.append('proof')
  with patch.object(r,'frame',return_value=(h,m,b,bindings,c)),patch.object(r,'running_business',return_value={}),patch.object(r,'parent_plan_hash',return_value='a'*64),patch.object(r,'created_http_jobs',return_value=[]),patch.object(r,'read',side_effect=read),patch.object(r,'publish',side_effect=publish),patch('pathlib.Path.exists',return_value=False),patch('pathlib.Path.is_symlink',return_value=False):result=r.run_promotion(h)
  self.assertLess(events.index('ref'),events.index('mailbox'));self.assertLess(events.index('mailbox'),events.index('start'));self.assertEqual(events.count('mailbox'),2);self.assertEqual(events[-1],'proof');self.assertEqual(result['physicalAcceptance'],'NOT VERIFIED');cfg=next(v[0] for p,v in objects.items() if p.name.startswith('promotion-barrier-config-'));self.assertEqual(set(cfg),{'schema','project','sourceSha','invocationId','custodyHash','configBundleHash','configBundleHeaderHash','sourceCaptureHash','variantLineageContextHash','variantLineageHash','abortPrefixContextHash','httpCa'})
 def test_a5_run_seals_the_exact_cli_config_and_root_created_reference_before_start(self):
  h,m,b,bindings,c,old,objects,effects,read,publish,life=Inventory().fixture('a5-restrictions');bindings['configBundleHeaderHash']='e'*64;ids=['f0000000-0000-4000-8000-00000000000'+str(i) for i in [1,2,3]];plan=r.make_restriction_plan(m,bindings['custodyHash'],bindings['configBundleHash'],c['additionHash'],ids);http=r.make_http_plan(c,bindings['configBundleHash'],bindings['sourceSha'],'2026-10-14T01:00:00Z',r.digest(plan));objects[h.TARGET/'master/variant-http-plan.json']=(http,r.digest(http));events=[];bridge=h.target_bridge();bridge.runtime_inventory=lambda *_:{'services':{f['service']:{'containerId':f['id'],'ownerId':f['ownerId']} for f in h.facts()}};h.guard_resources=lambda *_:None;h.owned_identity=lambda *_:True;current={}
  def publish(host,path,value,uid=0):objects[path]=(value,r.digest(value));events.append('cfg' if path.name.startswith('a5-config-') else 'ref' if path.name.startswith('a5-job-') else 'alias');return r.digest(value)
  def create(root,profile,cmd,env,**kw):
   self.assertIn('cfg',events);self.assertIn('alias',events);self.assertEqual(profile,'probe');self.assertEqual(cmd,['node','tests/qa/cp019/a5-negatives.mjs','grant']);job={'jobId':env['QA_INVOCATION_ID'],'cid':'f'*64};current.update(job=job,created={'commandHash':r.digest(cmd)});events.append('created');return job
  h.create_job=create;h.read_created_job=lambda _:current['created'];h.start_job=lambda _:events.append('start')
  def watch(view,job,update):
   self.assertLess(events.index('created'),events.index('ref'));self.assertLess(events.index('ref'),events.index('start'));events.append('end');step=plan['steps'][0];report={'schema':'cp020-a5-negatives-v1','mode':'grant','status':'PASS','sourceSha':bindings['sourceSha'],'runId':m['recoveryId'],'generation':m['target']['generation'],'custodyHash':bindings['custodyHash'],'configBundleHash':bindings['configBundleHash'],'restrictionPlanHash':r.digest(plan),'acknowledged':True,'effectUnchanged':True,'guardsUnchanged':True,'restoredAuthority':False,'restrictionId':step['id'],**{k:step[k] for k in ['reason','beforeVersion','closedVersion','afterVersion']}};objects[h.TARGET/'evidence/a5-grant.json']=(report,r.digest(report));return json.dumps({'type':'cp020-a5-negatives','mode':'grant','status':'PASS','sourceSha':bindings['sourceSha'],'reportHash':r.digest(report),'secretsPrinted':False}),{'model':'no physical SQL'}
  bridge.watch_job=watch;bridge.job_provenance=lambda *_:events.append('proof')
  with patch.object(r,'frame',return_value=(h,m,b,bindings,c)),patch.object(r,'load_acceptance',return_value=({},'d'*64)),patch.object(r,'load_restriction_plan',return_value=(plan,r.digest(plan))),patch.object(r,'created_http_jobs',return_value=[]),patch.object(r,'read',side_effect=read),patch.object(r,'publish',side_effect=publish),patch('pathlib.Path.exists',return_value=False),patch('pathlib.Path.is_symlink',return_value=False):result=r.run_a5(h,'a5-restrictions','grant')
  self.assertEqual(result['physicalAcceptance'],'NOT VERIFIED');self.assertEqual(events[-1],'proof');cfg=next(v[0] for p,v in objects.items() if p.name.startswith('a5-config-'));self.assertEqual(set(cfg),{'schema','mode','project','sourceSha','invocationId','custodyHash','acceptanceHash','configBundleHash','configBundleHeaderHash','variantLineageContextHash','sourceCaptureHash','restrictionPlan','restrictionPlanHash'});self.assertEqual(cfg['restrictionPlan'],plan)

if __name__=='__main__':unittest.main()
