"""Host boundary models only; no SSH, Docker, PostgreSQL or Linux custody claim."""
import importlib.util,pathlib,tempfile,types,unittest,uuid
from contextlib import contextmanager
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('target_host',pathlib.Path(__file__).with_name('target-host.py'));t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)

class Fake:
 def __init__(self,parent):
  self.ROOT=parent/'mecanet-qa-p1l3-r03';self.TARGET=parent/'mecanet-qa-p1l3-r03-target';self.calls=[];self.current=[];self.material={'target':{'workerClockOwner':str(uuid.uuid4())}}
 def own(self,r):self.calls.append(('own',r.name))
 def material_owned(self):return self.material
 def preserve(self):self.calls.append(('preserve',))
 def facts(self):return self.current
 def expected_owners(self):return{}
 def guard_resources(self,*args):self.calls.append(('guard',))
 def set_host_case(self,n):self.calls.append(('case',n))
 def remaining_case_seconds(self,maximum=45):return min(maximum,45)
 def assert_case_budget(self):self.calls.append(('BUDGET',));return self.remaining_case_seconds()
 def compose(self,*args):self.calls.append(('EFFECT',args));raise AssertionError('UNEXPECTED_EFFECT')

class Boundaries(unittest.TestCase):
 def test_source_running_blocks_target_before_any_effect(self):
  h=Fake(pathlib.Path('/own'));h.current=[{'project':h.ROOT.name,'running':True}]
  with self.assertRaisesRegex(AssertionError,'SOURCE_MUST_BE_OFF'):t.target_pg_start(h)
  self.assertFalse(any(x[0]=='EFFECT' for x in h.calls))
 def test_another_namespace_cannot_own_target(self):
  h=Fake(pathlib.Path('/own'));h.TARGET=pathlib.Path('/own/nexora')
  with self.assertRaisesRegex(AssertionError,'TARGET_NAMESPACE'):t.frame(h)
  self.assertEqual(h.calls,[])
 def test_target_without_positive_copy_cannot_start_pg(self):
  with tempfile.TemporaryDirectory() as tmp:
   h=Fake(pathlib.Path(tmp))
   with self.assertRaisesRegex(AssertionError,'TARGET_COPY_REQUIRED'):t.target_pg_start(h)
   self.assertFalse(any(x[0]=='EFFECT' for x in h.calls))
 def test_own_target_already_hot_cannot_start_second_pg(self):
  h=Fake(pathlib.Path('/own'));h.current=[{'project':h.TARGET.name,'running':True}]
  with self.assertRaisesRegex(AssertionError,'TARGET_MUST_BE_COLD'):t.target_pg_start(h)
  self.assertFalse(any(x[0]=='EFFECT' for x in h.calls))
 def test_marker_absence_keeps_custodied_original_owner(self):
  h=Fake(pathlib.Path('/own'));self.assertEqual(t.expected_target_worker_owner(h,h.material),h.material['target']['workerClockOwner'])
  self.assertEqual(h.calls,[])
 def test_closed_phase_arguments_never_allow_selectors_paths_or_free_configs(self):
  h=Fake(pathlib.Path('/own'));inv=str(uuid.uuid4());cmd,env=t.phase_arguments(h,'clock-plan','configs','a'*40,inv)
  self.assertEqual(cmd,['node','tests/qa/cp019/target-runtime.mjs','configs','clock-plan']);self.assertEqual(set(env),{'QA_PROJECT','QA_CODE_SHA','QA_INVOCATION_ID'})
  for phase,action,source,ident in [('nexora','run','a'*40,inv),('rotation','run','a'*40,inv),('configure','configs','a'*40,inv),('clock-plan','run','a'*39,inv),('clock-plan','restart','a'*40,inv)]:
   with self.assertRaises(AssertionError):t.phase_arguments(h,phase,action,source,ident)
 def test_mailbox_path_selector_rejected_before_any_fs_or_budget(self):
  h=Fake(pathlib.Path('/own'))
  with self.assertRaisesRegex(AssertionError,'TARGET_MAILBOX_NAME'):t.atomic_mailbox(h,'../secret',{})
  self.assertEqual(h.calls,[])
 def test_mailbox_budget_denial_precedes_temporary_or_replace(self):
  with tempfile.TemporaryDirectory() as tmp:
   h=Fake(pathlib.Path(tmp));directory=h.TARGET/'live';directory.mkdir(parents=True);h.ledger_charge=lambda *_:(_ for _ in ()).throw(AssertionError('BUDGET_CLOSED'))
   with patch.object(t.pathlib.Path,'stat',return_value=types.SimpleNamespace(st_uid=999,st_mode=0o40700)),patch.object(t.os,'open',side_effect=AssertionError('NO_EFFECT')) as opened:
    body={'schema':'target-host-receipt-v1'}
    with self.assertRaisesRegex(AssertionError,'BUDGET_CLOSED'):t.atomic_mailbox(h,'target-host.json',{'receipt':body,'receiptHash':t.digest(body)})
    opened.assert_not_called()
   self.assertEqual(list(directory.iterdir()),[])
 def test_mailbox_hash_mismatch_is_denied_before_budget(self):
  h=Fake(pathlib.Path('/own'))
  with self.assertRaisesRegex(AssertionError,'TARGET_MAILBOX_ENVELOPE'):t.atomic_mailbox(h,'target-host.json',{'receipt':{'schema':'target-host-receipt-v1'},'receiptHash':'a'*64})
  self.assertEqual(h.calls,[])
 def test_job_slow_inspection_is_not_fin_after_deadline(self):
  h=Fake(pathlib.Path('/own'));h.inspect_container=lambda _: {'running':False,'pid':0,'status':'exited'};h.created_job_identity=lambda *_:True;h.read_created_job=lambda _:{};h.finish_job=lambda _:(_ for _ in ()).throw(AssertionError('FALSE_FIN'))
  with patch.object(t.time,'monotonic',side_effect=[0,0,46]):
   with self.assertRaisesRegex(AssertionError,'TARGET_JOB_TIMEOUT_KEEP'):t.watch_job(h,{'cid':'a'*64},lambda:None)
 def test_watcher_uses_only_original_remaining_second(self):
  h=Fake(pathlib.Path('/own'));h.remaining_case_seconds=lambda maximum=45:min(maximum,1);h.inspect_container=lambda _: {'running':False,'pid':0,'status':'exited'};h.created_job_identity=lambda *_:True;h.read_created_job=lambda _:{};h.finish_job=lambda _:(_ for _ in ()).throw(AssertionError('FALSE_FIN'))
  with patch.object(t.time,'monotonic',side_effect=[0,0,2]),self.assertRaisesRegex(AssertionError,'TARGET_JOB_TIMEOUT_KEEP'):t.watch_job(h,{'cid':'a'*64},lambda:None)
 def test_recorded_start_cannot_cross_original_case_deadline(self):
  h=Fake(pathlib.Path('/own'));clock=[44];row={'containerId':'a'*64,'ownerId':str(uuid.uuid4()),'imageDigest':'sha256:'+'b'*64,'createdReceiptHash':'c'*64};inventory={'services':{'worker':row}};c={'id':row['containerId'],'service':'worker','ownerId':row['ownerId'],'running':False,'status':'created','pid':0,'startedAt':'0001-01-01T00:00:00Z'};ref={'schema':'target-service-created-v1','project':h.TARGET.name,'service':'worker',**{k:row[k] for k in ['containerId','ownerId','imageDigest']}}
  h.inspect_container=lambda _:dict(c);h.owned_identity=lambda *_:True;h.run=lambda *args:h.calls.append(('START',args));h.guard_resources=lambda *_:clock.__setitem__(0,46)
  def budget():
   if clock[0]>45:raise AssertionError('CP019_BUDGET_ABORT')
  h.assert_case_budget=budget
  with patch.object(t,'read400',side_effect=lambda path,uid=999:(ref,'c'*64) if path.parent.name=='runtime' else (inventory,'d'*64)),self.assertRaisesRegex(AssertionError,'BUDGET_ABORT'):t.start_recorded_containers(h,inventory,[c],{})
  self.assertFalse(any(x[0]=='START' for x in h.calls))
 def test_postgres_last_guard_cannot_cross_original_case_deadline(self):
  with tempfile.TemporaryDirectory() as tmp:
   h=Fake(pathlib.Path(tmp));(h.TARGET/'data/18/docker').mkdir(parents=True);(h.TARGET/'data/18/docker/PG_VERSION').write_text('18');clock=[44];cid='a'*64;c={'id':cid,'project':h.TARGET.name,'service':'postgres','running':False,'status':'created','pid':0,'startedAt':'0001-01-01T00:00:00Z'};owners={h.TARGET.name:{'postgres':'owner'}}
   h.PROFILES={'postgres':(350000000,640*1024**2,'postgres@sha256:'+'b'*64)};h.material={'target':{'generation':str(uuid.uuid4())},'recoveryId':str(uuid.uuid4())};h.enter_runtime_case=lambda *_:None;h.verify_copy_completed=lambda:None;h.guard_effect=lambda *_:None;h.compose=lambda root,*args:cid if args[0]=='ps' else '';h.inspect_container=lambda _:dict(c);h.owned_identity=lambda *_:True;h.guard_resources=lambda *_:clock.__setitem__(0,46);h.run=lambda *args:h.calls.append(('START',args));h.wait_pg_ready=lambda _:(_ for _ in ()).throw(AssertionError('PG_ALREADY_STARTED'))
   def budget():
    if clock[0]>45:raise AssertionError('CP019_BUDGET_ABORT')
   h.assert_case_budget=budget
   with patch.object(t,'own_current',return_value=(h.material,[],owners)),patch.object(t,'validate_created_postgres',return_value=True),patch.object(t,'read_private',return_value=({},'c'*64)),patch.object(t,'frozen_input',return_value='d'*64),self.assertRaisesRegex(AssertionError,'BUDGET_ABORT'):t.target_pg_start(h)
   self.assertFalse(any(x[0]=='START' for x in h.calls))
 def test_target_pg_mount_failure_keeps_identity_receipt_before_any_start(self):
  with tempfile.TemporaryDirectory() as tmp:
   h=Fake(pathlib.Path(tmp));(h.TARGET/'data/18/docker').mkdir(parents=True);(h.TARGET/'data/18/docker/PG_VERSION').write_text('18');cid='a'*64;c={'id':cid,'project':h.TARGET.name,'service':'postgres','running':False,'status':'created','pid':0,'startedAt':'0001-01-01T00:00:00Z'};owners={h.TARGET.name:{'postgres':'owner'}};events=[]
   h.PROFILES={'postgres':(350000000,640*1024**2,'postgres@sha256:'+'b'*64)};h.material={'target':{'generation':str(uuid.uuid4())},'recoveryId':str(uuid.uuid4())};h.enter_runtime_case=lambda *_:None;h.verify_copy_completed=lambda:None;h.guard_effect=lambda *_:None;h.compose=lambda root,*args:cid if args[0]=='ps' else '';h.inspect_container=lambda _:dict(c);h.owned_identity=lambda *_:True;h.run=lambda *args:events.append(('START',args))
   with patch.object(t,'own_current',return_value=(h.material,[],owners)),patch.object(t,'validate_created_postgres',side_effect=lambda *_:events.append('MOUNTS_FAIL') or (_ for _ in ()).throw(AssertionError('MOUNTS_FAIL'))),patch.object(t,'read_private',return_value=({},'c'*64)),patch.object(t,'frozen_input',side_effect=lambda *_:events.append('ROOT_REF_FSYNC')):
    with self.assertRaisesRegex(AssertionError,'MOUNTS_FAIL'):t.target_pg_start(h)
   self.assertEqual(events,['ROOT_REF_FSYNC','MOUNTS_FAIL'])
 def test_copy_result_rejects_unknown_or_partial_output(self):
  good={'type':'cp019-target-copy-prepared','status':'PASS','indexHash':'a'*64,'boundaryHash':'b'*64,'files':2,'bytes':13,'targetFiles':2,'secretOutput':False,'physicalRecovery':'NOT VERIFIED'}
  self.assertEqual(t.validate_copy_result(good),good)
  for patch_value in [{'targetFiles':1},{'files':10001},{'bytes':2*1024**3+1},{'secretOutput':True},{'unknown':True},{'files':True},{'physicalRecovery':'PASS'}]:
   with self.assertRaisesRegex(AssertionError,'TARGET_COPY_RESULT'):t.validate_copy_result({**good,**patch_value})
 def test_runtime_closed_modes_reject_before_any_observation(self):
  h=Fake(pathlib.Path('/own'))
  for mode in ['nexora','all','api1','restart','']:
   with self.assertRaisesRegex(AssertionError,'TARGET_RUNTIME_MODE'):t.runtime_start(h,mode)
  self.assertEqual(h.calls,[])
 def test_runtime_gate_requires_exact_phase_and_actual_last_sql_result(self):
  base={'planHash':'a'*64,'anchors':{'manifestHash':'b'*64},'plan':{'phases':{'activation':{'steps':[{'method':'activate','args':{'after':{'stage':'COMPLETE','version':'7'}}}]}}}}
  bindings={'configBundleHash':'c'*64,'custodyHash':'d'*64,'sourceSha':'e'*40};m={'recoveryId':str(uuid.uuid4()),'target':{'generation':str(uuid.uuid4())}}
  result={'status':'PASS','phase':'activation','results':[{'method':'activate','stage':'COMPLETE','version':'7'}]};r={'schema':'target-runtime-receipt-v1','phase':'activation','planHash':base['planHash'],**bindings,'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'result':result,'resultHash':t.digest(result)}
  self.assertEqual(t.validate_runtime_receipt(r,m,base,bindings,'activation'),r)
  for changed in [{**r,'phase':'promotion'},{**r,'result':{**result,'results':[]}},{**r,'result':{**result,'status':'FAIL'}},{**r,'resultHash':'f'*64},{**r,'generation':str(uuid.uuid4())}]:
   with self.assertRaisesRegex(AssertionError,'TARGET_RUNTIME_GATE'):t.validate_runtime_receipt(changed,m,base,bindings,'activation')
 def test_acceptance_rejects_another_product_or_unplanned_mode_before_observation(self):
  h=Fake(pathlib.Path('/own'))
  for mode in ['source-fixture','target-admin','nexora','target-history/../../','']:
   with self.assertRaisesRegex(AssertionError,'TARGET_ACCEPTANCE_MODE'):t.acceptance(h,mode)
  self.assertEqual(h.calls,[])
 def test_inventory_copy_streams_exact_regular_files_and_rejects_extra(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp).resolve();(root/'base').mkdir();(root/'PG_VERSION').write_bytes(b'18\n');(root/'base/1').write_bytes(b'abc')
   index={'schema':'copy-index-v1','files':[{'path':'PG_VERSION','bytes':3,'sha256':t.digest(b'18\n')},{'path':'base/1','bytes':3,'sha256':t.digest(b'abc')}]};seen,size=t.inventory_copy(root,index,t.time.monotonic()+45);self.assertEqual(set(seen),{'PG_VERSION','base/1'});self.assertEqual(size,6)
   (root/'extra').write_bytes(b'x')
   with self.assertRaisesRegex(AssertionError,'TARGET_COPY_EXTRA_OR_LINK'):t.inventory_copy(root,index,t.time.monotonic()+45)
 def test_inventory_copy_rejects_changed_hash_and_hardlink(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp).resolve();(root/'a').write_bytes(b'abc');index={'schema':'copy-index-v1','files':[{'path':'a','bytes':3,'sha256':t.digest(b'abd')}]}
   with self.assertRaisesRegex(AssertionError,'TARGET_COPY_HASH'):t.inventory_copy(root,index,t.time.monotonic()+45)
   t.os.link(root/'a',root/'b');index['files'][0]['sha256']=t.digest(b'abc')
   with self.assertRaisesRegex(AssertionError,'TARGET_COPY_FILE'):t.inventory_copy(root,index,t.time.monotonic()+45)
 def test_inventory_copy_rejects_traversal_duplicate_and_elapsed_before_reads(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp).resolve();entry={'path':'a','bytes':0,'sha256':t.digest(b'')}
   for files in [[{**entry,'path':'../a'}],[entry,entry],[{**entry,'path':'/a'}],[{**entry,'path':'a\\b'}]]:
    with self.assertRaisesRegex(AssertionError,'TARGET_COPY_INDEX'):t.inventory_copy(root,{'schema':'copy-index-v1','files':files},t.time.monotonic()+45)
   with self.assertRaisesRegex(AssertionError,'TARGET_COPY_VERIFY_DEADLINE'):t.inventory_copy(root,{'schema':'copy-index-v1','files':[entry]},0)
 def test_runtime_creation_reference_must_exist_before_exact_cid_start(self):
  h=Fake(pathlib.Path('/own'));row={'containerId':'a'*64,'ownerId':str(uuid.uuid4()),'imageDigest':'sha256:'+'b'*64,'createdReceiptHash':'c'*64};known={'services':{'worker':row}};created=[{'id':row['containerId'],'service':'worker','ownerId':row['ownerId'],'running':False,'status':'created','pid':0,'startedAt':'0001-01-01T00:00:00Z'}]
  h.inspect_container=lambda _:created[0];h.owned_identity=lambda *_:True;h.run=lambda *args:h.calls.append(('START',args));h.guard_resources=lambda *_:None
  with patch.object(t,'read400',side_effect=FileNotFoundError('MISSING_CREATED')):
   with self.assertRaises(FileNotFoundError):t.start_recorded_containers(h,known,created,{})
  self.assertFalse(any(c[0]=='START' for c in h.calls))
 def test_recorded_start_revalidates_pointer_receipt_and_exact_identity(self):
  h=Fake(pathlib.Path('/own'));row={'containerId':'a'*64,'ownerId':str(uuid.uuid4()),'imageDigest':'sha256:'+'b'*64,'createdReceiptHash':'c'*64};inventory={'services':{'worker':row}};c={'id':row['containerId'],'service':'worker','ownerId':row['ownerId'],'running':False,'status':'created','pid':0,'startedAt':'0001-01-01T00:00:00Z'};ref={'schema':'target-service-created-v1','project':h.TARGET.name,'service':'worker',**{k:row[k] for k in ['containerId','ownerId','imageDigest']}}
  h.inspect_container=lambda _:dict(c);h.owned_identity=lambda *_:True;h.run=lambda *args:h.calls.append(('START',args));h.guard_resources=lambda *_:h.calls.append(('PROFILE_GUARD',))
  def load(path,uid=999):
   h.calls.append(('READ',path.name));return (ref,'c'*64) if path.parent.name=='runtime' else (inventory,'d'*64)
  with patch.object(t,'read400',side_effect=load):t.start_recorded_containers(h,inventory,[c],{})
  self.assertEqual([x for x in h.calls if x[0]=='START'],[('START',('docker','start','a'*64))]);self.assertLess(next(i for i,x in enumerate(h.calls) if x[0]=='READ' and x[1].startswith('worker-')),next(i for i,x in enumerate(h.calls) if x[0]=='START'))
  h.calls=[];h.inspect_container=lambda _: {**c,'ownerId':str(uuid.uuid4())}
  with patch.object(t,'read400',side_effect=load):
   with self.assertRaisesRegex(AssertionError,'TARGET_RUNTIME_START_CHANGED'):t.start_recorded_containers(h,inventory,[c],{})
  self.assertFalse(any(x[0]=='START' for x in h.calls))
 def test_acceptance_report_seal_has_closed_mode_before_any_path_or_chmod(self):
  h=Fake(pathlib.Path('/own'))
  with patch.object(t.os,'open',side_effect=AssertionError('NO_OPEN')) as opened:
   for mode in ['source-fixture','target-report','../target-history','']:
    with self.assertRaisesRegex(AssertionError,'TARGET_ACCEPTANCE_MODE'):t.seal_acceptance_report(h,mode,{},{} )
   opened.assert_not_called()
 def test_restart_fin_uses_only_its_fixed_new_path_without_old_proof_fallback(self):
  h=Fake(pathlib.Path('/own'));self.assertEqual(t.target_end_pair_path(h,{}),h.TARGET/'secrets/target-live-end.json');self.assertEqual(t.target_end_pair_path(h,{'clockRestartContextHash':'a'*64}),h.TARGET/'secrets/target-live-end-after-restart.json')
  for value in [True,'','../target-live-end.json','b'*63]:
   with self.assertRaisesRegex(AssertionError,'TARGET_RESTART_CONTEXT'):t.target_end_pair_path(h,{'clockRestartContextHash':value})
  self.assertEqual(h.calls,[])
 def test_start_phases_have_distinct_fixed_semantic_cases_not_retry_aliases(self):
  self.assertEqual(t.runtime_case_name('worker'),'target-worker-start');self.assertEqual(t.runtime_case_name('business'),'target-business-start')
  for mode in ['worker-retry','pg','target-runtime-start','business-2']:
   with self.assertRaisesRegex(AssertionError,'TARGET_RUNTIME_MODE'):t.runtime_case_name(mode)
 def test_worker_restart_delegates_only_to_provenance_checked_passive_module(self):
  h=Fake(pathlib.Path('/own'));calls=[];module=types.SimpleNamespace(worker_restart=lambda host:calls.append(host) or {'result':'MODEL'})
  with patch.object(t,'lifecycle',return_value=module) as load:self.assertEqual(t.worker_restart(h),{'result':'MODEL'});load.assert_called_once_with(h)
  self.assertEqual(calls,[h])
 @contextmanager
 def acceptance_report_fixture(self):
  with tempfile.TemporaryDirectory() as tmp:
   h=Fake(pathlib.Path(tmp).resolve());directory=h.TARGET/'evidence';directory.mkdir(parents=True);h.syncdir=lambda _:None;mode='target-history';m={'target':{'generation':str(uuid.uuid4())},'recoveryId':str(uuid.uuid4())};bindings={'sourceSha':'e'*40};report={'schema':'cp019-acceptance-v1','mode':mode,'project':h.TARGET.name,'sourceCommit':bindings['sourceSha'],'generation':m['target']['generation'],'runId':m['recoveryId'],'status':'PASS','result':{'status':'PASS'}};path=directory/('acceptance-'+mode+'.json');raw=t.canonical(report);path.write_bytes(raw);state={'mode':0o600,'fin':False,'sealed':0,'ctime_ns':1700000000000000000,'fd_ctime_delta':0};real_lstat=t.pathlib.Path.lstat;real_fstat=t.os.fstat
   def meta(s,fd=False):
    # This fixture models Linux UID/mode/ctime. Windows may return birthtime
    # through lstat and refreshed change time through fstat for the same file.
    # Keep actual inode/link/size/mtime observations; control only model ctime.
    fields={k:getattr(s,k) for k in ['st_dev','st_ino','st_size','st_nlink','st_mtime_ns']};return types.SimpleNamespace(**fields,st_ctime_ns=state['ctime_ns']+(state['fd_ctime_delta'] if fd else 0),st_mode=0o100000|state['mode'],st_uid=999)
   def named(p,*args,**kwargs):return meta(real_lstat(p,*args,**kwargs)) if p==path else real_lstat(p,*args,**kwargs)
   def chmod(fd,new_mode):
    self.assertTrue(state['fin']);self.assertEqual(new_mode,0o400);state['mode']=new_mode;state['sealed']+=1;state['ctime_ns']+=1
   def finish(*_):state['fin']=True
   with patch.object(t.pathlib.Path,'lstat',named),patch.object(t.os,'fstat',lambda fd:meta(real_fstat(fd),fd=True)),patch.object(t.os,'fchmod',side_effect=chmod,create=True) as sealed,patch.object(t.os,'fsync'),patch.object(t,'job_provenance',side_effect=finish):
    yield h,mode,m,bindings,report,path,raw,state,sealed
 def test_valid_original_600_report_is_sealed_only_after_job_fin_and_not_rewritten(self):
  with self.acceptance_report_fixture() as (h,mode,m,bindings,report,path,raw,state,_):
   with self.assertRaisesRegex(AssertionError,'TARGET_PRIVATE_FILE'):t.read400(path)
   saved,sha=t.seal_acceptance_report(h,mode,m,bindings,str(uuid.uuid4()),{})
   self.assertEqual(saved,report);self.assertEqual(sha,t.digest(raw));self.assertEqual(state['sealed'],1)
   t.seal_acceptance_report(h,mode,m,bindings,str(uuid.uuid4()),{});self.assertEqual(state['sealed'],1)
   self.assertEqual(path.read_bytes(),raw)
 def test_report_ctime_drift_before_sealing_rejects_without_chmod_or_rewrite(self):
  with self.acceptance_report_fixture() as (h,mode,m,bindings,_,path,raw,state,sealed):
   state['fd_ctime_delta']=1
   with self.assertRaisesRegex(AssertionError,'TARGET_ACCEPTANCE_REPORT_CHANGED'):t.seal_acceptance_report(h,mode,m,bindings,str(uuid.uuid4()),{})
   sealed.assert_not_called();self.assertEqual(state['sealed'],0);self.assertEqual(state['mode'],0o600);self.assertTrue(state['fin']);self.assertEqual(path.read_bytes(),raw)

class VariantNamespace(unittest.TestCase):
 def view(self):
  h=Fake(pathlib.Path('/opt'));h.TARGET=h.TARGET/'variants'/'promote-prefix';h.target_project=lambda:'mecanet-qa-p1l3-r03-target';h.variant_frame=lambda:h.material;return h
 def test_variant_frame_keeps_real_path_and_canonical_project(self):
  h=self.view();before=h.TARGET;self.assertEqual(t.frame(h),h.material);self.assertEqual(h.TARGET,before);self.assertEqual(t.phase_arguments(h,'begin-enroll','run','a'*40,str(uuid.uuid4()))[1]['QA_PROJECT'],'mecanet-qa-p1l3-r03-target')
 def test_foreign_variant_path_is_rejected_before_trusted_frame(self):
  h=self.view();h.TARGET=pathlib.Path('/opt/nexora/variants/promote-prefix');h.variant_frame=lambda:(_ for _ in ()).throw(AssertionError('FRAME_CALLED'))
  with self.assertRaisesRegex(AssertionError,'TARGET_NAMESPACE'):t.frame(h)
 def test_target_project_cannot_turn_an_arbitrary_path_into_a_variant(self):
  h=self.view();h.target_project=lambda:'mecanet-qa-p1l3-r02-target'
  with self.assertRaisesRegex(AssertionError,'TARGET_NAMESPACE'):t.phase_arguments(h,'begin-enroll','run','a'*40,str(uuid.uuid4()))

class PromotionIntegration(unittest.TestCase):
 def test_commit_injection_receives_unpublished_cfg_and_no_duplicate_alias(self):
  from unittest.mock import Mock
  h=Fake(pathlib.Path('/opt'));h.kind='commit-interrupted';h.variant_case_name=lambda phase:'target-commit-fault';h.enter_runtime_case=lambda *args:None;helper=Mock();helper.run.return_value={'result':'EXPECTED_ONLY'};h.commit_bridge=lambda:helper;cfg={'sourceSha':'a'*40,'invocationId':str(uuid.uuid4())}
  with patch.object(t,'own_current',return_value=({},[],{})),patch.object(t,'phase_config',return_value=(cfg,{})),patch.object(t,'frozen_input',side_effect=AssertionError('PREMATURE_PUBLICATION')) as write:
   self.assertEqual(t.phase(h,'promotion','run'),{'result':'EXPECTED_ONLY'})
  write.assert_not_called();args=helper.run.call_args.args;self.assertEqual(args[5],['node','tests/qa/cp019/target-runtime.mjs','run','promotion']);self.assertEqual(args[6]['QA_INVOCATION_ID'],args[2]['invocationId']);self.assertFalse(any(x[1] in ['/run/qa-secrets/target-promotion-config.json','/run/qa-secrets/target-commit-fault-context.json'] for x in args[7]))
 def test_prefix_business_cannot_be_selected_for_main_or_other_variant(self):
  for kind in [None,'allclosed','commit-interrupted','roster-empty','a5-restrictions']:
   h=Fake(pathlib.Path('/opt'));h.kind=kind
   with self.subTest(kind=kind),self.assertRaisesRegex(AssertionError,'TARGET_PREFIX_BUSINESS_SCOPE'):t.runtime_start(h,'business-prefix')
   self.assertEqual(h.calls,[])
 def test_prefix_mutator_needs_completed_root_publisher_not_only_alias(self):
  from unittest.mock import Mock
  h=Fake(pathlib.Path('/opt'));h.kind='promote-prefix';base={'planHash':'a'*64,'variantLineageHash':'b'*64};extension={'parentPlanHash':'a'*64,'variantLineageHash':'b'*64,'faultPoint':'PROMOTION_AFTER_OPEN_A'};context={'abortPrefix':{'extension':extension,'extensionHash':t.digest(extension),'faultPoint':'PROMOTION_AFTER_OPEN_A'}};proof={'schema':'cp021-prefix-host-result-v1','caseName':'target-promote-fault','contextHash':t.digest(context),'extensionHash':t.digest(extension)};helper=Mock();helper.verify_prefix_custody.return_value=(context,t.digest(context));h.probes_bridge=lambda:helper
  with patch.object(t,'read400',side_effect=[(context,t.digest(context)),(proof,t.digest(proof))]):self.assertEqual(t.require_prefix_custody(h,base),(context,proof))
  helper.verify_prefix_custody.assert_called_once_with(h)
  for change in [{'contextHash':'f'*64},{'extensionHash':'f'*64},{'schema':'partial-build'}]:
   bad={**proof,**change}
   with self.subTest(change=change),patch.object(t,'read400',side_effect=[(context,t.digest(context)),(bad,t.digest(bad))]),self.assertRaisesRegex(AssertionError,'TARGET_PREFIX_CUSTODY_REQUIRED'):t.require_prefix_custody(h,base)
  helper.verify_prefix_custody.side_effect=AssertionError('BUILDER_END_MISSING')
  with patch.object(t,'read400',side_effect=[(context,t.digest(context)),(proof,t.digest(proof))]),self.assertRaisesRegex(AssertionError,'BUILDER_END_MISSING'):t.require_prefix_custody(h,base)

class CreatedRuntime(unittest.TestCase):
 def test_actual_runtime_mounts_and_network_are_bound_before_start(self):
  import json
  h=Fake(pathlib.Path('/opt'));spec={'volumes':[str(h.TARGET/'secrets/api1.json')+':/run/qa-secrets/runtime.json:ro'],'networks':{'data':{},'front':{}}};actual={'mounts':[{'Type':'bind','Source':str(h.TARGET/'secrets/api1.json'),'Destination':'/run/qa-secrets/runtime.json','RW':False}],'networks':{h.TARGET.name+'-data':{},h.TARGET.name+'-front':{}},'ports':{}}
  h.run=lambda *args:json.dumps(actual);self.assertTrue(t.validate_created_service(h,'a'*64,spec))
  for field,value in [('ports',{'3000/tcp':[{'HostPort':'3000'}]}),('networks',{'coolify':{}}),('mounts',[{'Type':'bind','Source':str(h.ROOT/'master'),'Destination':'/run/qa-secrets/runtime.json','RW':False}])]:
   changed={**actual,field:value};h.run=lambda *args:json.dumps(changed)
   with self.subTest(field=field),self.assertRaises(AssertionError):t.validate_created_service(h,'a'*64,spec)

class CreatedPostgres(unittest.TestCase):
 def setup_model(self):
  import copy,json
  host=Fake(pathlib.Path('/opt'));physical=json.loads((pathlib.Path(__file__).resolve().parents[3]/'docs/evidence/cp021/mount-readonly.json').read_text());actual=copy.deepcopy(physical['actual']);spec=copy.deepcopy(physical['expected'])
  # Historical CREATED r02 SOURCE shape projected to r03 TARGET; no physical claim.
  source='/opt/mecanet-qa-p1l3-r02';target=str(host.TARGET)
  for mount in actual['mounts']:mount['Source']=str(pathlib.Path(mount['Source'].replace(source,target)))
  spec['volumes']=[str(pathlib.Path(v.rsplit(':',2)[0].replace(source,target)))+':'+':'.join(v.rsplit(':',2)[1:]) for v in spec['volumes']];spec['networks']['data']['ipv4_address']='10.77.66.2';net=actual['networks'].pop('mecanet-qa-p1l3-r02-data');net['IPAMConfig']['IPv4Address']='10.77.66.2';net['IPAddress']='';actual['networks']={host.TARGET.name+'-data':net};definition={'name':host.TARGET.name+'-data','internal':True,'ipam':[{'Subnet':'10.77.66.0/25'}]};return host,spec,[actual,definition]
 def invoke(self,h,spec,values):
  import json
  h.run=lambda *args:json.dumps(values.pop(0))
  with patch.object(t,'read_private',return_value=({'name':h.TARGET.name,'services':{'postgres':spec}},'c'*64)):return t.validate_created_postgres(h,'a'*64)
 def test_created_pg_uses_real_hostconfig_tmpfs_without_mounts_tmpfs(self):
  h,spec,values=self.setup_model();self.assertFalse(any(m['Type']=='tmpfs' for m in values[0]['mounts']));self.assertTrue(self.invoke(h,spec,values));self.assertEqual(values,[])
 def test_source_bind_readonly_extra_mount_tmpfs_ports_or_network_reject(self):
  import copy
  for change in ['source','readonly','volume','extra-bind','missing-bind','extra-network','public-network','wrong-ip','wrong-subnet','extra-tmpfs','missing-tmpfs','changed-option','ports','mounts-only-tmpfs']:
   with self.subTest(change=change):
    h,spec,values=self.setup_model();actual=values[0];data=next(m for m in actual['mounts'] if m['Destination']=='/var/lib/postgresql')
    if change=='source':data['Source']=str(h.ROOT/'data')
    if change=='readonly':data['RW']=False
    if change=='volume':data['Type']='volume'
    if change=='extra-bind':actual['mounts'].append({'Type':'bind','Source':str(h.TARGET/'secrets'),'Destination':'/extra','RW':False})
    if change=='missing-bind':actual['mounts'].pop()
    if change=='extra-network':actual['networks']['coolify']={}
    if change=='public-network':values[1]['internal']=False
    if change=='wrong-ip':actual['networks'][h.TARGET.name+'-data']['IPAMConfig']['IPv4Address']='10.77.64.2'
    if change=='wrong-subnet':values[1]['ipam'][0]['Subnet']='172.18.0.0/16'
    if change=='extra-tmpfs':actual['tmpfs']['/run/secrets']='size=1m'
    if change=='missing-tmpfs':actual['tmpfs'].pop('/tmp')
    if change=='changed-option':actual['tmpfs']['/tmp']='size=32m'
    if change=='ports':actual['ports']={'5432/tcp':[{'HostPort':'5432'}]}
    if change=='mounts-only-tmpfs':actual['tmpfs']=None;actual['mounts'] += [{'Type':'tmpfs','Destination':d,'RW':True} for d in ['/tmp','/var/run/postgresql']]
    with self.assertRaises(AssertionError):self.invoke(h,spec,values)
 def test_optional_reported_tmpfs_mounts_match_declared_hostconfig(self):
  h,spec,values=self.setup_model();values[0]['mounts'] += [{'Type':'tmpfs','Destination':d,'RW':True} for d in values[0]['tmpfs']];self.assertTrue(self.invoke(h,spec,values))

class TmpfsCreatedBoundary(unittest.TestCase):
 def test_main_runtime_requires_exact_hostconfig_tmpfs_options(self):
  import json
  h=Fake(pathlib.Path('/opt'));spec={'volumes':[],'tmpfs':['/tmp:size=16m,uid=999,gid=999'],'networks':['data']};actual={'mounts':[],'tmpfs':{'/tmp':'size=16m,uid=999,gid=999'},'ports':{},'networks':{h.TARGET.name+'-data':{}}};h.run=lambda *args:json.dumps(actual);self.assertTrue(t.validate_created_service(h,'a'*64,spec))
  for changed in [None,{}, {'/tmp':'size=32m,uid=999,gid=999'},{'/tmp':'size=16m,uid=999,gid=999','/extra':'size=1m'}]:
   h.run=lambda *args:json.dumps({**actual,'tmpfs':changed})
   with self.subTest(changed=changed),self.assertRaises(AssertionError):t.validate_created_service(h,'a'*64,spec)
 def test_tmpfs_specs_reject_duplicate_destinations_unknown_destinations_and_controls(self):
  for rows in [['/tmp:size=16m','/tmp:size=16m'],['/run/secrets:size=16m'],['/tmp:'],['/tmp:size=16m,,uid=999'],['/tmp:size=16m\nuid=999']]:
   with self.subTest(rows=rows),self.assertRaises(AssertionError):t.created_tmpfs({'tmpfs':rows})
 def test_main_closed_create_calls_use_supported_no_recreate(self):
  import ast
  tree=ast.parse(pathlib.Path(t.__file__).read_text());calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='compose' and any(isinstance(a,ast.Constant) and a.value=='create' for a in n.args)]
  self.assertEqual(len(calls),2)
  for call in calls:
   flags=[a.value for a in call.args if isinstance(a,ast.Constant)];self.assertIn('--no-recreate',flags);self.assertNotIn('--no-deps',flags)

if __name__=='__main__':unittest.main()
