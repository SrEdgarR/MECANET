"""Local boundary models only; no Docker, SSH or PostgreSQL is executed."""
import importlib.util, pathlib, types, unittest, json, copy
from unittest.mock import patch
path=pathlib.Path(__file__).with_name('target-lifecycle.py')
spec=importlib.util.spec_from_file_location('target_lifecycle_test_subject',path)
l=importlib.util.module_from_spec(spec);spec.loader.exec_module(l)
H='a'*64;S='b'*40;GEN='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';RUN='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'

class LifecycleTests(unittest.TestCase):
 def restart_fixture(self):
  h,objects,effects,read,facts=self.fixture(l.SERVICES);m,base,bindings=h.target_bridge().bundle_context(h);new_owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';new_cid='f'*64
  for c in facts:c.update(running=False,status='exited',pid=0,finishedAt='2026-10-14T02:00:00Z')
  proof={'schema':'source-end-v1','recoveryId':RUN,'sourceResourceHash':H,'processes':[{k:c[k] for k in ['service','ownerId','exitCode','finishedAt']}|{'containerId':c['id']} for c in facts],'sqlOwners':[OWNER]*3,'httpOperationIds':[]};observed={'resourceHash':H,'containers':[{k:c[k] for k in ['id','service','ownerId','running','exitCode','finishedAt']} for c in facts],'sqlOwnersPresent':[],'httpPending':[]};pair={'endProof':proof,'observedEnd':observed,'createdServices':list(l.SERVICES)};objects[h.TARGET/'secrets/target-live-end.json']=(pair,l.digest(pair));base['manifest']={'source':{'containerId':'a'*64},'target':{'generation':GEN}};base['planHash']=H
  records=[{'sequence':0,'kind':'observed','hash':H}];checkpoint={'sequence':0,'hash':H};original_input={'schema':'cp020-clock-restart-input-v1','project':h.TARGET.name,'invocationId':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',**bindings,'targetEndPairHash':l.digest(pair),'journalRawHash':H,'journalRecordsHash':l.digest(records),'journalCheckpoint':checkpoint,'hostReceipt':{'observedAt':'2026-10-14T02:00:00Z','observedResources':{'source':base['manifest']['source'],'target':base['manifest']['target'],'sourcePostgresRunning':False,'targetPostgresRunning':True,'runtimeConsumers':[]},'observedEnd':observed}}
  original_input['hostReceiptHash']=l.digest(original_input['hostReceipt']);objects[h.TARGET/'master/clock-restart-input.json']=(original_input,l.digest(original_input));old_worker=next(c for c in facts if c['service']=='worker');worker_proof={**proof,'schema':'worker-end-v1','processes':[proof['processes'][-1]],'sqlOwners':[OWNER]};worker_observed={**observed,'containers':[observed['containers'][-1]]};worker_pair={'endProof':worker_proof,'observedEnd':worker_observed};addition={'previousOwner':OWNER,'nextOwner':new_owner,'generation':GEN,'runId':RUN,'endProofHash':l.digest(worker_proof)};clock={'addition':addition,'additionHash':l.digest(addition),'extension':{'schema':'recovery-clock-restart-plan-v1'},'extensionHash':l.digest({'schema':'recovery-clock-restart-plan-v1'}),'workerEndProof':worker_proof,'observedWorkerEnd':worker_observed};ctx={'schema':'target-clock-restart-context-v1','configBundleHash':H,'clockRestart':clock};worker_cfg={'clockOwner':new_owner,'generation':GEN}
  bridge=h.target_bridge();bridge.target_resource=lambda _:base['manifest']['target'];bridge.stable_result=lambda r:r
  def owners():return {h.TARGET.name:{s:(new_owner if s=='worker' and h.TARGET/'master/current-worker.json' in objects else OWNER) for s in l.SERVICES}}
  h.expected_owners=owners;h.PROFILES={'worker':(100000000,192*1024**2,'node@sha256:'+H)};h.guard_resources=lambda *_:None;h.guard_effect=lambda root,services:effects.append(('preflight',root.name,tuple(services)))
  def node(root,profile,command,env,mounts=(),sample=True):
   self.assertIn(('preflight',h.TARGET.name,('harness',)),effects);effects.append(('chooser-job',));self.assertEqual(command,['node','tests/qa/cp019/target-restart.mjs']);self.assertEqual(mounts[0][1],'/run/qa-secrets/target-restart-input.json')
   for name,value in [('target-clock-restart-context.json',ctx),('target-clock-addition.json',addition),('worker-restart.json',worker_cfg),('target-old-worker-end.json',worker_pair)]:objects[h.TARGET/'secrets'/name]=(value,l.digest(value))
   return json.dumps({'type':'cp020-clock-restart-custodied','status':'PASS','contextHash':l.digest(ctx),'additionHash':l.digest(addition),'workerConfigHash':l.digest(worker_cfg),'workerEndPairHash':l.digest(worker_pair),'secretOutput':False,'physicalRestart':'NOT VERIFIED'}),{'model':'NO SQL'}
  h.controller_job=node
  def phase(_,name,action='run'):
   effects.append(('phase',name));v='8' if name=='clock-restart-plan' else '9';result={'status':'PASS','stage':'COMPLETE','version':v};r={'schema':'target-runtime-receipt-v1','phase':name,'planHash':H,'configBundleHash':H,'custodyHash':bindings['custodyHash'],'sourceSha':S,'generation':GEN,'recoveryId':RUN,'clockRestartPlanHash':clock['extensionHash'],'additionHash':clock['additionHash'],'result':result,'resultHash':l.digest(result)};objects[h.TARGET/'evidence'/('target-'+name+'.json')]=(r,l.digest(r));return {'result':'PASS'}
  bridge.phase=phase;bridge.expected_target_worker_owner=lambda _,mat:owners()[h.TARGET.name]['worker']
  def publish_inventory(_,body):
   objects[h.TARGET/'master/runtime-created.json']=(body,l.digest(body));objects[h.TARGET/'master'/('runtime-created-'+l.digest(body)+'.json')]=(body,l.digest(body))
  bridge.publish_inventory=publish_inventory
  def start(_,body,created,own):
   self.assertIn(h.TARGET/'master/current-worker.json',objects);self.assertIn(h.TARGET/'master/runtime'/('worker-'+new_cid+'-created.json'),objects);self.assertEqual(objects[h.TARGET/'master/runtime-created.json'][0],body);effects.append(('start',new_cid));facts[-1].update(running=True,status='running',pid=13)
  bridge.start_recorded_containers=start
  def run(*args,**kw):
   effects.append(args)
   if args[:2]==('docker','rm'):
    self.assertEqual(args[2:],(old_worker['id'],));facts.remove(old_worker);return old_worker['id']
   if args[:2]==('docker','create'):
    self.assertIn(h.TARGET/'master/current-worker.json',objects);self.assertNotIn(old_worker,facts);self.assertIn(h.TARGET/'evidence/target-clock-restart-plan.json',objects);facts.append({'id':new_cid,'project':h.TARGET.name,'service':'worker','ownerId':new_owner,'imageRef':'node@sha256:'+H,'nanoCpus':100000000,'memory':192*1024**2,'running':False,'status':'created','pid':0,'exitCode':0,'finishedAt':'0001-01-01T00:00:00Z'});return new_cid+'\n'
   raise AssertionError('UNEXPECTED EFFECT')
  h.run=run;h.run_bounded=run
  return h,objects,effects,read,facts
 def test_restart_orders_real_full_fin_delete_prepare_marker_created_start_record(self):
  h,objects,effects,read,facts=self.restart_fixture();original=l.read400;l.read400=read
  try:
   result=l.worker_restart(h);self.assertEqual(result['physicalRestart'],'NOT VERIFIED');self.assertEqual([e for e in effects if e[0]=='phase'],[('phase','clock-restart-plan'),('phase','clock-restart-record')]);self.assertEqual(sum(e[:2]==('docker','rm') for e in effects),1);self.assertEqual(sum(e[:2]==('docker','create') for e in effects),1);self.assertTrue(facts[-1]['running']);self.assertTrue(all(not c['running'] for c in facts[:-1]))
   l.worker_restart(h);self.assertEqual(sum(e[0]=='chooser-job' for e in effects),1);self.assertEqual(sum(e[:2]==('docker','create') for e in effects),1);self.assertEqual(len([e for e in effects if e[0]=='phase']),2)
  finally:l.read400=original
 def test_restart_unproven_full_fin_refuses_before_chooser_delete_or_create(self):
  h,objects,effects,read,facts=self.restart_fixture();pair=objects[h.TARGET/'secrets/target-live-end.json'][0];pair['observedEnd']['sqlOwnersPresent']=[OWNER];objects[h.TARGET/'secrets/target-live-end.json']=(pair,l.digest(pair));original=l.read400;l.read400=read
  try:
   with self.assertRaises(AssertionError):l.worker_restart(h)
   self.assertFalse(any(e[0] in ['chooser-job','docker'] for e in effects))
  finally:l.read400=original
 def test_restart_wrong_prepare_version_cannot_publish_owner_or_create(self):
  h,objects,effects,read,facts=self.restart_fixture();bridge=h.target_bridge();phase=bridge.phase
  def bad(*args,**kw):
   value=phase(*args,**kw);p=h.TARGET/'evidence/target-clock-restart-plan.json';r=objects[p][0];r['result']['version']='7';r['resultHash']=l.digest(r['result']);objects[p]=(r,l.digest(r));return value
  bridge.phase=bad;original=l.read400;l.read400=read
  try:
   with self.assertRaises(AssertionError):l.worker_restart(h)
   self.assertNotIn(h.TARGET/'master/current-worker.json',objects);self.assertFalse(any(e[:2]==('docker','create') for e in effects))
  finally:l.read400=original
 def test_restart_resumes_durable_marker_before_create_without_choosing_again(self):
  h,objects,effects,read,facts=self.restart_fixture();run=h.run
  def interrupted(*args,**kw):
   if args[:2]==('docker','create'):raise AssertionError('INTERRUPTED BEFORE CREATE')
   return run(*args,**kw)
  h.run=interrupted;original=l.read400;l.read400=read
  try:
   with self.assertRaises(AssertionError):l.worker_restart(h)
   self.assertIn(h.TARGET/'master/current-worker.json',objects);h.run=run;l.worker_restart(h);self.assertEqual(sum(e[0]=='chooser-job' for e in effects),1);self.assertEqual(sum(e[:2]==('docker','rm') for e in effects),1);self.assertEqual(sum(e[:2]==('docker','create') for e in effects),1)
  finally:l.read400=original
 def test_end_cases_bind_original_or_restarted_inventory_and_not_context_existence(self):
  h,objects,effects,read,facts=self.restart_fixture();m,_,bindings=h.target_bridge().bundle_context(h);body=objects[h.TARGET/'master/runtime-created.json'][0];original=l.read400;l.read400=read
  try:
   self.assertEqual(l.end_scope(h,m,body,'stop'),'target-stop-initial');self.assertEqual(l.end_scope(h,m,body,'end'),'target-end-initial');l.worker_restart(h);body=objects[h.TARGET/'master/runtime-created.json'][0];self.assertEqual(l.end_scope(h,m,body,'stop'),'target-stop-restarted');self.assertEqual(l.end_scope(h,m,body,'end'),'target-end-restarted')
  finally:l.read400=original
 def fixture(self,services=('worker',)):
  root=pathlib.Path('/opt/mecanet-qa-p1l3-r03');target=pathlib.Path(str(root)+'-target');m={'recoveryId':RUN,'controllerOwner':OWNER,'artifactDigest':H,'source':{'project':root.name},'target':{'project':target.name,'generation':GEN,'workerClockOwner':OWNER,'webOwner':OWNER,'apiOwners':{'api1':OWNER,'api2':OWNER},'operationIds':{'postProduct':'aaaaaaaa-aaaa-4aaa-8aaa-000000000077'}}};objects={};effects=[]
  bindings={'sourceSha':S,'custodyHash':l.digest(m),'configBundleHash':H,'configBundleHeaderHash':H,'sourceCaptureHash':H};base={'anchors':{'targetResourceHash':H},'manifest':{'target':{'generation':GEN}}}
  rows={};facts=[]
  for i,service in enumerate(services):
   cid=str(i+4)*64;created={'schema':'target-service-created-v1','project':target.name,'service':service,'containerId':cid,'ownerId':OWNER,'imageDigest':'sha256:'+H,'generation':GEN,'runId':RUN,'configBundleHash':H,'configHash':H,'createdAt':'2026-10-14T01:00:00Z'};rows[service]={'containerId':cid,'ownerId':OWNER,'imageDigest':'sha256:'+H,'createdReceiptHash':l.digest(created)};objects[target/'master/runtime'/(service+'-'+cid+'-created.json')]=(created,l.digest(created));facts.append({'id':cid,'project':target.name,'service':service,'ownerId':OWNER,'imageRef':'node@sha256:'+H,'running':True,'status':'running','pid':12,'exitCode':0,'finishedAt':'0001-01-01T00:00:00Z'})
  inventory={'schema':'target-runtime-created-v1','project':target.name,'generation':GEN,'runId':RUN,'custodyHash':l.digest(m),'configBundleHash':H,'services':rows};objects[target/'master/runtime-created.json']=(inventory,l.digest(inventory));objects[target/'master'/('runtime-created-'+l.digest(inventory)+'.json')]=(inventory,l.digest(inventory))
  def read400(p,uid=999,limit=262144):
   if p not in objects:raise FileNotFoundError(str(p))
   return objects[p]
  def inspect(cid):return next(dict(c) for c in facts if c['id']==cid)
  def run(*args,**kwargs):
   effects.append(args)
   for cid in args[4:]:
    c=next(c for c in facts if c['id']==cid);c.update(running=False,status='exited',pid=0,finishedAt='2026-10-14T02:00:00Z')
   return ''
  def publish(p,raw,mode=0o600,uid=None):
   value=json.loads(raw) if isinstance(raw,(bytes,str)) else raw
   if p in objects:raise AssertionError('IMMUTABLE_EXISTS')
   objects[p]=(value,l.digest(value))
  h=types.SimpleNamespace(ROOT=root,TARGET=target,own=lambda *_:None,preserve=lambda:{'result':'PASS'},material_owned=lambda:m,facts=lambda:[dict(c) for c in facts],expected_owners=lambda:{target.name:{s:OWNER for s in services}},owned_identity=lambda c,o:c['ownerId']==o.get(c['project'],{}).get(c['service']),set_host_case=lambda n:effects.append(('case',n)),enter_runtime_case=lambda scope,name:effects.append(('enter',scope,name)),guard_effect=lambda *_:None,run_bounded=run,write_plain=publish,run=run,inspect_container=inspect)
  bridge=types.SimpleNamespace(bundle_context=lambda _: (m,base,bindings));h.target_bridge=lambda:bridge
  return h,objects,effects,read400,facts
 def variant_fixture(self,kind='allclosed'):
  services=l.SERVICES
  h,objects,effects,read,facts=self.fixture(services);m,base,bindings=h.target_bridge().bundle_context(h);h.MAIN_TARGET=h.TARGET;h.TARGET=h.MAIN_TARGET/'variants'/kind;h.kind=kind;h.HOST_CASE='variant-a5-identity' if kind=='a5-restrictions' else 'ready-allclosed' if kind=='allclosed' else 'target-promote-fault' if kind=='promote-prefix' else 'target-commit-fault';h.target_project=lambda:h.MAIN_TARGET.name
  old=dict(objects);objects.clear();objects.update({h.TARGET/p.relative_to(h.MAIN_TARGET):v for p,v in old.items()});h.variant_frame=lambda:m
  addition={'kind':kind,'originalMaterialHash':H,'effectiveMaterialHash':l.digest(m),'cases':['variant-a5-grant','variant-a5-membership','variant-a5-identity'] if kind=='a5-restrictions' else [h.HOST_CASE]};context={'kind':kind,'effectiveMaterial':m,'addition':addition,'additionHash':l.digest(addition)};h.variant_lineage=lambda:(context,l.digest(context));h.variant_case_name=lambda *_:h.HOST_CASE
  objects[h.TARGET/'secrets/target-variant-lineage.json']=(context,l.digest(context));modes=['readiness-ready'] if kind=='allclosed' else ['promotion-barrier'] if kind=='promote-prefix' else ['a5-grant','a5-membership','a5-identity'] if kind=='a5-restrictions' else []
  command=lambda mode:['node','tests/qa/cp019/promotion-barrier.mjs'] if mode=='promotion-barrier' else ['node','tests/qa/cp019/readiness-variant.mjs','probe-'+mode[10:]] if mode.startswith('readiness-') else ['node','tests/qa/cp019/a5-negatives.mjs',mode[3:]]
  plan={'schema':'cp021-variant-http-plan-v1','kind':kind,'project':h.MAIN_TARGET.name,'sourceSha':S,'artifactDigest':H,'recoveryId':RUN,'generation':GEN,'variantLineageHash':context['additionHash'],'custodyHash':bindings['custodyHash'],'configBundleHash':H,'createdServices':list(services),'createdAt':'2026-10-14T01:00:00Z','jobs':[{'mode':mode,'command':command(mode),'planHash':H} for mode in modes]};objects[h.TARGET/'master/variant-http-plan.json']=(plan,l.digest(plan));rows=[]
  for i,mode in enumerate(modes):
   jid='aaaaaaaa-aaaa-4aaa-8aaa-'+str(50+i).zfill(12);cid='bcd'[i]*64;phase=mode[10:] if mode.startswith('readiness-') else mode[3:]
   report={'schema':'cp019-readiness-http-v1','kind':kind,'phase':phase,'caseName':h.HOST_CASE,'planHash':H,'variantLineageHash':context['additionHash'],'generation':GEN,'recoveryId':RUN,'sourceSha':S,'expectedReadyStatus':200 if phase=='ready' else 503,'instances':[{'instance':api,'live':200,'ready':200 if phase=='ready' else 503,'probes':2} for api in ['api1','api2']],'tenantAuthorization':False,'pendingHttp':0} if mode.startswith('readiness-') else {'schema':'cp020-a5-negatives-v1','mode':phase,'status':'PASS','generation':GEN,'runId':RUN,'sourceSha':S,'custodyHash':bindings['custodyHash'],'configBundleHash':H,'restrictionPlanHash':H,'acknowledged':True,'effectUnchanged':True,'guardsUnchanged':True,'restoredAuthority':False}
   if mode=='promotion-barrier':report={'schema':'cp021-promotion-barrier-v1','status':'PASS','kind':kind,'project':h.MAIN_TARGET.name,'sourceSha':S,'generation':GEN,'recoveryId':RUN,'variantLineageHash':context['additionHash'],'custodyHash':bindings['custodyHash'],'configBundleHash':H,'planHash':H,'expectedReadyStatus':503,'pendingHttp':0,'globalBlocked':True,'localOpen':True,'effectUnchanged':True,'beforeHash':H,'afterHash':H,'instances':[{'instance':api,'live':200,'ready':503} for api in ['api1','api2']],'post':{'instance':'api2','status':503,'error':'SERVICE_UNAVAILABLE'},'operationId':m['target']['operationIds']['postProduct'],'authenticatedRequest':False}
   rp=h.TARGET/('evidence/promotion-barrier.json' if mode=='promotion-barrier' else 'secrets/readiness-http-'+phase+'.json' if mode.startswith('readiness-') else 'evidence/a5-'+phase+'.json');objects[rp]=(report,l.digest(report));created={'schema':'controller-job-created-v1','jobId':jid,'containerId':cid,'project':h.MAIN_TARGET.name,'service':'probe','ownerId':OWNER,'imageDigest':'sha256:ba6b7d0ee561d9d49deb99e2b93c98632cc287b6cca1a6b18d66127054efa4dc','commandHash':l.digest(command(mode)),'state':'CREATED BEFORE START/SQL','createdAt':'2026-10-14T01:01:00Z'};ended={'schema':'controller-job-end-v1','jobId':jid,'containerId':cid,'project':h.MAIN_TARGET.name,'service':'probe','ownerId':OWNER,'createdReceiptHash':l.digest(created),'exitCode':0,'startedAt':'2026-10-14T01:01:01Z','finishedAt':'2026-10-14T01:02:00Z','containerStopped':True,'sqlAbsence':'NOT VERIFIED'};objects[h.TARGET/'evidence/jobs'/(jid+'-created.json')]=(created,l.digest(created));objects[h.TARGET/'evidence/jobs'/(jid+'-end.json')]=(ended,l.digest(ended));rows.append({'mode':mode,'jobId':jid,'containerId':cid,'commandHash':created['commandHash'],'reportHash':l.digest(report),'jobCreatedHash':l.digest(created),'jobEndHash':l.digest(ended),'pendingHttp':0})
  inventory={'schema':'cp021-variant-http-inventory-v1','kind':kind,'project':h.MAIN_TARGET.name,'recoveryId':RUN,'generation':GEN,'variantLineageHash':context['additionHash'],'planHash':l.digest(plan),'jobs':rows};objects[h.TARGET/'master/variant-http-inventory.json']=(inventory,l.digest(inventory));return h,objects,effects,read,facts
 def test_variant_final_scope_preserves_identity_and_main_scope_without_aliases(self):
  for kind,expected in [('allclosed','ready-allclosed'),('commit-interrupted','target-commit-fault'),('promote-prefix','target-promote-fault'),('a5-restrictions','variant-a5-identity')]:
   h,objects,effects,read,facts=self.variant_fixture(kind);m,_,bindings=h.target_bridge().bundle_context(h);body=objects[h.TARGET/'master/runtime-created.json'][0]
   with patch.object(l,'read400',side_effect=read):self.assertEqual(l.end_scope(h,m,body,'end'),expected)
   if kind=='a5-restrictions':
    h.HOST_CASE='variant-a5-grant'
    with patch.object(l,'read400',side_effect=read),self.assertRaisesRegex(AssertionError,'CASE'):l.end_scope(h,m,body,'end')
 def test_variant_http_inventory_requires_own_closed_plan_actual_jobs_and_rejects_hidden_producers(self):
  for variant in ['valid','pending','missing','main','foreign','extra']:
   h,objects,effects,read,facts=self.variant_fixture();m,_,bindings=h.target_bridge().bundle_context(h);inv=objects[h.TARGET/'master/variant-http-inventory.json'][0]
   if variant=='pending':inv['jobs'][0]['pendingHttp']=1
   if variant=='missing':inv['jobs'].pop()
   if variant=='main':objects[h.TARGET/'secrets/readiness-http-ready.json'][0]['schema']='cp019-acceptance-v1'
   if variant=='foreign':objects[h.TARGET/'secrets/readiness-http-ready.json'][0]['generation']='ffffffff-ffff-4fff-8fff-ffffffffffff'
   if variant=='extra':
    original=next(v[0] for p,v in objects.items() if p.name.endswith('-created.json') and p.parent.name=='jobs');created={**original,'jobId':'aaaaaaaa-aaaa-4aaa-8aaa-000000000090','containerId':'f'*64,'commandHash':l.digest(['node','tests/qa/cp019/acceptance.mjs','target-history'])};objects[h.TARGET/'evidence/jobs'/(created['jobId']+'-created.json')]=(created,l.digest(created))
   paths=lambda p:[path for path in objects if path.parent==p]
   with patch.object(l,'read400',side_effect=read),patch.object(pathlib.Path,'resolve',lambda p:p),patch.object(pathlib.Path,'iterdir',paths):
    if variant=='valid':self.assertEqual([r['mode'] for r in l.http_receipts(h,m,bindings,list(l.SERVICES))],['readiness-ready'])
    else:
     with self.assertRaises(AssertionError):l.http_receipts(h,m,bindings,list(l.SERVICES))
 def test_variant_node_end_receives_own_plan_inventory_lineage_and_existing_identity_case(self):
  for variant in ['allclosed','promote-prefix','a5-restrictions']:
   h,objects,effects,read,facts=self.variant_fixture(variant);expected='ready-allclosed' if variant=='allclosed' else 'target-promote-fault' if variant=='promote-prefix' else 'variant-a5-identity';paths=lambda p:[path for path in objects if path.parent==p]
   def node(root,profile,command,env,mounts=(),sample=True):
    cfg=objects[mounts[0][0]][0];self.assertEqual(cfg['caseName'],expected);self.assertEqual(cfg['profile'],'source');self.assertEqual(cfg['createdServices'],list(l.SERVICES));self.assertEqual(cfg['variantLineageContextHash'],h.variant_lineage()[1]);self.assertIn(h.TARGET/'secrets/target-variant-http-plan.json',objects);self.assertIn(h.TARGET/'secrets/target-variant-http-inventory.json',objects);self.assertEqual([r['mode'] for r in cfg['httpReceipts']],['readiness-ready'] if variant=='allclosed' else ['promotion-barrier'] if variant=='promote-prefix' else ['a5-grant','a5-membership','a5-identity'])
    proof={'schema':'source-end-v1','recoveryId':RUN,'sourceResourceHash':H,'processes':[]};pair={'endProof':proof,'observedEnd':{'httpPending':[],'sqlOwnersPresent':[]},'createdServices':list(l.SERVICES)};objects[h.TARGET/'secrets/target-live-end.json']=(pair,l.digest(pair));return json.dumps({'type':'cp019-target-end','status':'PASS','sourceSha':S,'recoveryId':RUN,'generation':GEN,'secretOutput':False,'pairHash':l.digest(pair),'endProofHash':l.digest(proof),**{k:cfg[k] for k in ['caseName','variantLineageHash','variantHttpPlanHash','variantHttpInventoryHash']}}),{'model':'NODE BOUNDARY DOUBLE ONLY'}
   h.controller_job=node
   with patch.object(l,'read400',side_effect=read),patch.object(pathlib.Path,'resolve',lambda p:p),patch.object(pathlib.Path,'iterdir',paths),patch.object(l,'publish_current_stop',side_effect=lambda h,v,p:objects.update({h.TARGET/'master/runtime-stop.json':(v,l.digest(v))})):
    l.stop_runtime(h);result=l.target_end(h);self.assertEqual(result['profile'],'source');self.assertNotIn(('enter','target-window','target-end-initial'),effects);self.assertIn(('enter','target-window',expected),effects)
 def test_prefix_http_report_requires_own_barrier_plan_post_operation_and_unchanged_effects(self):
  for edit in [lambda r:r.update(localOpen=False),lambda r:r.update(globalBlocked=False),lambda r:r.update(afterHash='f'*64),lambda r:r.update(pendingHttp=1),lambda r:r.update(generation='ffffffff-ffff-4fff-8fff-ffffffffffff'),lambda r:r.update(operationId=RUN),lambda r:r.update(authenticatedRequest=True),lambda r:r['post'].update(status=200),lambda r:r['post'].update(instance='api1'),lambda r:r['instances'][0].update(ready=200)]:
   h,objects,effects,read,facts=self.variant_fixture('promote-prefix');m,_,bindings=h.target_bridge().bundle_context(h);report=objects[h.TARGET/'evidence/promotion-barrier.json'][0];edit(report);objects[h.TARGET/'evidence/promotion-barrier.json']=(report,l.digest(report));inv=objects[h.TARGET/'master/variant-http-inventory.json'][0];inv['jobs'][0]['reportHash']=l.digest(report);objects[h.TARGET/'master/variant-http-inventory.json']=(inv,l.digest(inv));paths=lambda p:[path for path in objects if path.parent==p]
   with patch.object(l,'read400',side_effect=read),patch.object(pathlib.Path,'resolve',lambda p:p),patch.object(pathlib.Path,'iterdir',paths),self.assertRaisesRegex(AssertionError,'HTTP_REPORT'):l.http_receipts(h,m,bindings,list(l.SERVICES))
 def test_prefix_cannot_close_as_worker_only_or_omit_its_actual_http_producer(self):
  h,objects,effects,read,facts=self.variant_fixture('promote-prefix');m,_,bindings=h.target_bridge().bundle_context(h);body=objects[h.TARGET/'master/runtime-created.json'][0];worker={**body,'services':{'worker':body['services']['worker']}}
  with patch.object(l,'read400',side_effect=read),self.assertRaisesRegex(AssertionError,'VARIANT_INVENTORY'):l.end_scope(h,m,worker,'end')
  inv=objects[h.TARGET/'master/variant-http-inventory.json'][0];inv['jobs']=[];objects[h.TARGET/'master/variant-http-inventory.json']=(inv,l.digest(inv))
  with patch.object(l,'read400',side_effect=read),self.assertRaisesRegex(AssertionError,'HTTP_INVENTORY'):l.http_receipts(h,m,bindings,list(l.SERVICES))
 def test_allclosed_unplanned_unready_job_is_not_hidden_by_the_single_ready_inventory(self):
  h,objects,effects,read,facts=self.variant_fixture('allclosed');m,_,bindings=h.target_bridge().bundle_context(h);created=next(v[0] for p,v in objects.items() if p.parent.name=='jobs' and p.name.endswith('-created.json'));extra={**created,'jobId':'aaaaaaaa-aaaa-4aaa-8aaa-000000000091','containerId':'f'*64,'commandHash':l.digest(['node','tests/qa/cp019/readiness-variant.mjs','probe-unready'])};objects[h.TARGET/'evidence/jobs'/(extra['jobId']+'-created.json')]=(extra,l.digest(extra));paths=lambda p:[path for path in objects if path.parent==p]
  with patch.object(l,'read400',side_effect=read),patch.object(pathlib.Path,'resolve',lambda p:p),patch.object(pathlib.Path,'iterdir',paths),self.assertRaisesRegex(AssertionError,'UNPLANNED'):l.http_receipts(h,m,bindings,list(l.SERVICES))
 def test_stop_uses_only_persisted_actual_worker_and_never_invents_business_slots(self):
  h,objects,effects,read,facts=self.fixture();original=l.read400;l.read400=read;pointer=l.publish_current_stop;l.publish_current_stop=lambda h,v,p:objects.update({h.TARGET/'master/runtime-stop.json':(v,l.digest(v))})
  try:
   result=l.stop_runtime(h);self.assertEqual(result['createdServices'],['worker']);self.assertEqual(len(result['hostStop']['containers']),1);self.assertFalse(facts[0]['running']);self.assertIn(h.TARGET/'master/runtime-stop.json',objects)
  finally:l.read400=original;l.publish_current_stop=pointer
 def test_omitted_changed_or_foreign_cid_refuses_before_stop(self):
  for change in [lambda rows:rows.append({**rows[0],'id':'f'*64,'service':'api1'}),lambda rows:rows[0].update(ownerId='foreign'),lambda rows:rows[0].update(id='f'*64)]:
   h,objects,effects,read,facts=self.fixture();change(facts);original=l.read400;l.read400=read
   try:
    with self.assertRaises(AssertionError):l.stop_runtime(h)
    self.assertFalse(any(e and e[0]=='docker' for e in effects))
   finally:l.read400=original
 def test_missing_created_receipt_cannot_be_replaced_by_docker_labels(self):
  h,objects,effects,read,facts=self.fixture();objects.pop(next(p for p in objects if p.parent.name=='runtime'));original=l.read400;l.read400=read
  try:
   with self.assertRaises(FileNotFoundError):l.stop_runtime(h)
   self.assertFalse(any(e and e[0]=='docker' for e in effects))
  finally:l.read400=original
 def test_positive_exit_requires_pid_zero_and_real_finish(self):
  h,objects,effects,read,facts=self.fixture();h.run_bounded=lambda *a,**kw:None;original=l.read400;l.read400=read
  try:
   with self.assertRaises(AssertionError):l.stop_runtime(h)
   self.assertNotIn(h.TARGET/'master/runtime-stop.json',objects)
  finally:l.read400=original
 def test_node_end_receives_original_stop_and_only_fixed_input_alias(self):
  h,objects,effects,read,facts=self.fixture();original=l.read400;l.read400=read;pointer=l.publish_current_stop;l.publish_current_stop=lambda h,v,p:objects.update({h.TARGET/'master/runtime-stop.json':(v,l.digest(v))})
  try:
   l.stop_runtime(h)
   def node(root,profile,command,env,mounts=(),sample=True):
    self.assertEqual((root,profile,command,sample),(h.TARGET,'harness',['node','tests/qa/cp019/target-end.mjs'],False));self.assertEqual(mounts[0][1],'/run/qa-secrets/target-end-input.json');cfg=objects[mounts[0][0]][0];self.assertEqual(cfg['httpReceipts'],[]);self.assertEqual(cfg['createdServices'],['worker']);self.assertEqual(env['QA_INVOCATION_ID'],cfg['invocationId']);gate=cfg['hostStop'];proof={'schema':'worker-end-v1','recoveryId':RUN,'sourceResourceHash':H,'processes':[{'service':'worker','containerId':facts[0]['id'],'ownerId':OWNER,'exitCode':0,'finishedAt':facts[0]['finishedAt']}],'sqlOwners':[OWNER],'httpOperationIds':[]};pair={'endProof':proof,'observedEnd':{'resourceHash':H,'containers':gate['containers'],'sqlOwnersPresent':[],'httpPending':[]},'createdServices':['worker']};objects[h.TARGET/'secrets/target-live-end.json']=(pair,l.digest(pair));return json.dumps({'type':'cp019-target-end','status':'PASS','sourceSha':S,'recoveryId':RUN,'generation':GEN,'secretOutput':False,'pairHash':l.digest(pair),'endProofHash':l.digest(proof)}),{'model':'NODE BOUNDARY DOUBLE ONLY'}
   h.controller_job=node;result=l.target_end(h);self.assertEqual(result['profile'],'worker');self.assertEqual(result['physicalCohortAcceptance'],'NOT VERIFIED')
  finally:l.read400=original;l.publish_current_stop=pointer
 def test_full_inventory_snapshot_cannot_be_omitted_or_swapped(self):
  h,objects,effects,read,facts=self.fixture();objects.pop(next(p for p in objects if p.name.startswith('runtime-created-')));original=l.read400;l.read400=read
  try:
   with self.assertRaises(FileNotFoundError):l.stop_runtime(h)
   self.assertFalse(any(e and e[0]=='docker' for e in effects))
  finally:l.read400=original
 def test_expensive_sample_cannot_prevent_exact_owned_emergency_stop(self):
  h,objects,effects,read,facts=self.fixture();h.guard_effect=lambda *_:(_ for _ in ()).throw(AssertionError('RESOURCE_LIMIT'));original=l.read400;l.read400=read;pointer=l.publish_current_stop;l.publish_current_stop=lambda h,v,p:objects.update({h.TARGET/'master/runtime-stop.json':(v,l.digest(v))})
  try:
   l.stop_runtime(h);self.assertFalse(facts[0]['running']);self.assertIn(('enter','target-window','target-stop-prefix'),effects)
  finally:l.read400=original;l.publish_current_stop=pointer

if __name__=='__main__':unittest.main()
