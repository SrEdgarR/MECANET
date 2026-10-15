"""Pure CP019 host guards: no Docker, SSH, credentials or resources are accessed."""
import importlib.util, pathlib, subprocess, unittest, copy, json, tempfile, types, io, shutil, sys
from unittest.mock import patch, Mock
from contextlib import ExitStack

spec=importlib.util.spec_from_file_location('cp019_host',pathlib.Path(__file__).with_name('host.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
OWNERS={h.ROOT.name:{s:'owner-'+s for s in ['postgres','api1','api2','worker','web','harness','probe','controller-tool']},h.TARGET.name:{s:'target-'+s for s in ['postgres','api1','api2','worker','web','harness','probe','controller-tool']}}
def row(name,root=None,**changes):
 root=root or h.ROOT
 cpu,mem,image=h.PROFILES[name]
 return {'startedAt':'0001-01-01T00:00:00Z','id':name+root.name,'project':root.name,'running':True,'service':name,'ownerId':OWNERS[root.name][name],'nanoCpus':cpu,'memory':mem,'imageRef':image,**changes}

class MainTargetCustody(unittest.TestCase):
 def test_no_target_consumer_does_not_read_material(self):
  with patch.object(h,'material_owned',side_effect=AssertionError('SECRET_READ')):self.assertTrue(h.verify_main_target_references([row('postgres')]))
 def test_unregistered_target_pid_is_denied_even_without_variants(self):
  target=row('postgres',h.TARGET,id='a'*64)
  bridge=Mock();bridge.read400.side_effect=AssertionError('MISSING_ROOT_CREATED')
  with patch.object(h,'target_bridge',return_value=bridge),patch.object(h,'material_owned',return_value={'target':{'generation':'g'},'recoveryId':'r'}),self.assertRaisesRegex(AssertionError,'MISSING_ROOT_CREATED'):h.verify_main_target_references([target])
 def test_label_match_does_not_substitute_for_the_created_cid(self):
  target=row('postgres',h.TARGET,id='a'*64);ref={'schema':'target-postgres-created-v1','generation':'g','recoveryId':'r','dataPath':str(h.TARGET/'data'),'state':'CREATED BEFORE START/SQL','containerId':'b'*64,'project':h.TARGET.name,'service':'postgres','ownerId':target['ownerId'],'imageRef':target['imageRef'],'nanoCpus':target['nanoCpus'],'memory':target['memory']};bridge=Mock();bridge.read400.return_value=(ref,'c'*64)
  with patch.object(h,'target_bridge',return_value=bridge),patch.object(h,'material_owned',return_value={'target':{'generation':'g'},'recoveryId':'r'}),self.assertRaisesRegex(AssertionError,'MAIN_TARGET_REFERENCE_CHANGED'):h.verify_main_target_references([target])

class HostGuards(unittest.TestCase):
 def test_copy_and_journal_cli_dispatch_only_exact_actions_without_resource_access(self):
  for action,method in [('copy-negatives','copy_negatives'),('journal-negatives','journal_negatives')]:
   with self.subTest(action=action),patch.object(h,method,return_value={'result':'model'}) as run:
    self.assertEqual(h.host_dispatch(action,[]),{'result':'model'});run.assert_called_once_with()
   for invalid in [action+'-retry',action+'-other']:
    with patch.object(h,method) as run,self.assertRaises(AssertionError):h.host_dispatch(invalid,[])
    run.assert_not_called()
   with patch.object(h,method) as run,self.assertRaises(AssertionError):h.host_dispatch(action,['extra'])
   run.assert_not_called()
 def test_browser_budget_gate_has_fixed_bindings_order_and_caps(self):
  ref={'project':h.TARGET.name,'sourceSha':'a'*40,'artifactDigest':'b'*64,'configHash':'c'*64,'invocationId':'44444444-4444-4444-8444-444444444444'}
  req={'type':'cp020-browser-gate','schema':'cp020-browser-gate-v1','sequence':1,'caseName':'browser-login',**ref,'reserveHttp':24,'reserveArtifacts':1}
  self.assertEqual(h.validate_browser_request(req,ref,1),req)
  for changed in [{**req,'sequence':2},{**req,'caseName':'browser-product'},{**req,'reserveHttp':25},{**req,'reserveArtifacts':0},{**req,'project':h.ROOT.name},{**req,'configHash':'f'*64},{**req,'url':'https://nexora.mecanet.site'}]:
   with self.subTest(value=changed),self.assertRaises(AssertionError):h.validate_browser_request(changed,ref,1)
 def test_browser_gate_never_decodes_unbounded_or_shell_arguments(self):
  for raw in [';', 'x'*4097, 'bad.$input','']:
   with patch.object(h,'target_bridge') as bridge,self.assertRaises(AssertionError):h.browser_gate_encoded(raw)
   bridge.assert_not_called()
 def test_copy_checkpoint_requires_complete_exact_external_tail(self):
  records=[{'sequence':0,'kind':'intent','hash':'a'*64},{'sequence':1,'kind':'observed','hash':'b'*64}]
  heads=['head-0000.json','head-0001.json'];head={'sequence':1,'hash':'b'*64}
  self.assertEqual(h.copy_checkpoint_value(records,heads,head),head)
  for changed in [records[:1],[],[{**records[0],'sequence':1},records[1]]]:
   with self.subTest(records=changed),self.assertRaises(AssertionError):h.copy_checkpoint_value(changed,heads,head)
  for changed in [heads[:1],heads+['head-0002.json']]:
   with self.assertRaises(AssertionError):h.copy_checkpoint_value(records,changed,head)
  with self.assertRaises(AssertionError):h.copy_checkpoint_value(records,heads,{**head,'hash':'c'*64})
 def test_source_pg_stop_is_exact_and_positive_exit(self):
  c=row('postgres',id='a'*64,pid=12,status='running');ended={**c,'running':False,'pid':0,'status':'exited','exitCode':0,'finishedAt':'2026-10-14T00:00:00Z'}
  with patch.object(h,'own'),patch.object(h,'preserve'),patch.object(h,'set_host_case'),patch.object(h,'facts',return_value=[c]),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'inspect_container',side_effect=[c,ended]),patch.object(h,'run_bounded') as stop,patch.object(h,'offline_pg',return_value={'result':'PASS','clusterState':'shut down'}) as offline:
   result=h.source_pg_off();self.assertEqual(result['containerId'],c['id']);stop.assert_called_once_with('docker','stop','--time','5',c['id'],timeout=15);offline.assert_called_once()
 def test_source_pg_stop_unknown_process_never_counts_as_fin(self):
  c=row('postgres',id='a'*64,pid=12,status='running');ended={**c,'running':False,'pid':7,'status':'exited','exitCode':0,'finishedAt':'2026-10-14T00:00:00Z'}
  with patch.object(h,'own'),patch.object(h,'preserve'),patch.object(h,'set_host_case'),patch.object(h,'facts',return_value=[c]),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'inspect_container',side_effect=[c,ended]),patch.object(h,'run_bounded'),patch.object(h,'offline_pg') as offline,self.assertRaisesRegex(AssertionError,'SOURCE_PG_END_NOT_PROVEN'):
   h.source_pg_off()
  offline.assert_not_called()
 def test_copy_executor_has_exact_uid999_profile_and_no_master_or_network(self):
  command=['node','tests/qa/cp019/target-prepare.mjs','copy-before-target']
  with patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h.pathlib.Path,'resolve',lambda p:p):
   args,_,_=h.job_command(h.TARGET,'controller-tool',command)
   self.assertEqual(args[args.index('--user')+1],'999:999')
   self.assertEqual(args[args.index('--network')+1],'none')
   for network,mounts in [(h.TARGET.name+'-data',()),('none',[(h.ROOT/'master','/run/master','ro')])]:
    with self.subTest(network=network,mounts=mounts),self.assertRaisesRegex(AssertionError,'COPY_JOB_BOUNDARY'):h.job_command(h.TARGET,'controller-tool',command,network=network,mounts=mounts)
 def test_copy_negative_executor_is_uid999_offline_and_rejects_master_and_network(self):
  command=['node','tests/qa/cp019/copy-negatives.mjs']
  with patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h.pathlib.Path,'resolve',lambda p:p):
   args,_,_=h.job_command(h.TARGET,'controller-tool',command);self.assertEqual(args[args.index('--user')+1],'999:999');self.assertEqual(args[args.index('--network')+1],'none')
   for root,network,mounts in [(h.ROOT,'none',()),(h.TARGET,h.TARGET.name+'-data',()),(h.TARGET,'none',[(h.TARGET/'master','/run/master','ro')])]:
    with self.subTest(root=root,network=network),self.assertRaisesRegex(AssertionError,'COPY_JOB_BOUNDARY'):h.job_command(root,'controller-tool',command,network=network,mounts=mounts)
 def final_fixture(self):
  current=[row(s,id=str(i+1)*64,running=False,status='exited',pid=0,exitCode=0,finishedAt='2026-10-14T00:00:00Z') for i,s in enumerate(sorted(h.BUSINESS))]
  ended=[{k:p[k] for k in ['service','id','ownerId','running','exitCode','finishedAt']} for p in current]
  return current,ended
 def test_final_observation_keeps_original_four_positive_exits(self):
  current,ended=self.final_fixture()
  with patch.object(h,'expected_owners',return_value=OWNERS):result=h.final_source_observation({'systemIdentifier':'123'},ended,current,{})
  self.assertEqual(len(result['runtimeConsumers']),4);self.assertTrue(all(p['running'] is False for p in result['runtimeConsumers']));self.assertNotIn('sqlOwnersPresent',result)
 def test_final_observation_rejects_replaced_alive_or_wrong_exit(self):
  current,ended=self.final_fixture()
  for change in [{'id':'f'*64},{'running':True},{'exitCode':137},{'ownerId':'alien'},{'pid':1}]:
   changed=copy.deepcopy(current);changed[0].update(change)
   with self.subTest(change=change),patch.object(h,'expected_owners',return_value=OWNERS),self.assertRaises(AssertionError):h.final_source_observation({},ended,changed,{})
 def test_final_observation_rejects_duplicate_or_missing_originals(self):
  current,ended=self.final_fixture()
  for invalid in [ended[:3],[ended[0]]*4]:
   with patch.object(h,'expected_owners',return_value=OWNERS),self.assertRaises(AssertionError):h.final_source_observation({},invalid,current,{})
 def test_final_phase_closed_before_resource_access(self):
  with patch.object(h,'own') as own,self.assertRaisesRegex(AssertionError,'SOURCE_FINAL_PHASE'):h.source_final('invented-case')
  own.assert_not_called()
 def test_probe_fits_full_runtime_exactly(self):
  got=h.guard_resources([row(s) for s in ['postgres','api1','api2','worker','web']],[(h.ROOT,'probe')],OWNERS)
  self.assertEqual(got['nanoCpus'],1_000_000_000);self.assertEqual(got['memoryMiB'],1696)
 def test_harness_cannot_run_with_runtime(self):
  with self.assertRaisesRegex(AssertionError,'BUSINESS_ACTIVE'):h.guard_resources([row(s) for s in ['postgres','api1']],[(h.ROOT,'harness')],OWNERS)
 def test_pg_only_harness_within_budget(self):
  got=h.guard_resources([row('postgres')],[(h.ROOT,'harness')],OWNERS)
  self.assertEqual(got['nanoCpus'],600_000_000);self.assertEqual(got['memoryMiB'],768)
 def test_source_and_target_pg_are_forbidden(self):
  with self.assertRaisesRegex(AssertionError,'MULTIPLE_PG'):h.guard_resources([row('postgres')],[(h.TARGET,'postgres')],OWNERS)
 def test_running_actual_unbounded_or_excess_is_rejected(self):
  for changes in [{'nanoCpus':0},{'memory':0},{'nanoCpus':400_000_000},{'memory':700*1024**2}]:
   with self.subTest(changes=changes),self.assertRaisesRegex(AssertionError,'PROFILE_MISMATCH'):h.guard_resources([row('postgres',**changes)],[],OWNERS)
 def test_owner_image_unknown_and_duplicate_cannot_be_adopted(self):
  for rows in [[row('postgres',ownerId='alien')],[row('postgres',imageRef='postgres:latest')],[row('postgres',service='unknown')],[row('postgres'),row('postgres',id='second')]]:
   with self.subTest(rows=rows),self.assertRaises(AssertionError):h.guard_resources(rows,[],OWNERS)
 def test_other_projects_ignored_and_unmodified(self):
  other={'id':'other','project':'nexora','running':True,'nanoCpus':0,'memory':0}
  got=h.guard_resources([other],[(h.ROOT,'postgres'),(h.ROOT,'probe')],OWNERS)
  self.assertEqual(got['nanoCpus'],400_000_000);self.assertEqual(other['project'],'nexora')
 def test_existing_service_projection_is_not_double_counted(self):
  got=h.guard_resources([row('postgres')],[(h.ROOT,'postgres')],OWNERS);self.assertEqual(got['nanoCpus'],350_000_000)
 def test_other_cohort_business_forbidden(self):
  with self.assertRaisesRegex(AssertionError,'COHORT_CONFLICT'):h.guard_resources([row('api1')],[(h.TARGET,'probe')],OWNERS)
 def test_nginx_has_three_pinned_unix_endpoints(self):
  config=h.nginx_config(pathlib.Path(__file__).parents[1].joinpath('infra/nginx.conf').read_text())
  for s in ['web','api1','api2']:self.assertEqual(config.count('listen unix:/run/qa-ingress/'+s+'.sock ssl;'),1)
  self.assertNotIn('listen 80',config);self.assertNotIn('listen 443',config)
  self.assertIn('proxy_pass http://api1_only;',config);self.assertIn('proxy_pass http://api2_only;',config)
 def test_pg_probe_waits_for_positive_before_control_data(self):
  calls=[]
  def command(*args,**kw):
   calls.append(args)
   if 'pg_isready' in str(args) and len(calls)==1:raise subprocess.CalledProcessError(1,args)
   return ''
  with patch.object(h,'run_bounded',side_effect=command),patch.object(h.time,'sleep'):
   self.assertTrue(h.wait_pg_ready('a'*64,timeout=1))
  self.assertEqual(len(calls),2);self.assertTrue(all('pg_controldata' not in c for c in calls))
 def test_pg_probe_timeout_is_not_success(self):
  with patch.object(h,'run_bounded',side_effect=subprocess.CalledProcessError(1,['fake'])),patch.object(h.time,'monotonic',side_effect=[0,0,0,1]),patch.object(h.time,'sleep'):
   with self.assertRaisesRegex(AssertionError,'PG_START_NOT_PROVEN'):h.wait_pg_ready('a'*64,timeout=0.5)
 def test_prepare_stage_and_artifact_sha_are_closed(self):
  for stage,sha in [('unknown','a'*40),('foundation','not-sha')]:
   with self.assertRaises(AssertionError):h.prepare_args(stage,sha)
  got=h.prepare_args('foundation','a'*40)
  self.assertIn('--no-deps',got);self.assertNotIn('--rm',got);self.assertIn('QA_STAGE=foundation',got);self.assertIn('QA_CODE_SHA='+'a'*40,got)
 def test_safe_inspect_does_not_request_env(self):
  with patch.object(h,'run',side_effect=['x','{}']) as cmd:h.facts()
  fmt=cmd.call_args.args[3];self.assertNotIn('.Config.Env',fmt);self.assertIn('.HostConfig.NanoCpus',fmt);self.assertIn('.HostConfig.Memory',fmt)
 def test_harness_and_probe_require_owned_pg(self):
  for service in ['harness','probe']:
   with self.subTest(service=service),self.assertRaisesRegex(AssertionError,'PG_REQUIRED'):h.guard_resources([],[(h.ROOT,service)],OWNERS)
 def test_pre_material_controller_cannot_run_with_existing_pg(self):
  owners=copy.deepcopy(OWNERS);owners[h.ROOT.name]['controller-tool']='pre-material'
  with self.assertRaisesRegex(AssertionError,'PRE_MATERIAL_RUNNING'):h.guard_resources([row('postgres')],[(h.ROOT,'controller-tool')],owners)
 def test_stopped_foreign_owner_cannot_be_restarted(self):
  with self.assertRaisesRegex(AssertionError,'OWN_OWNER_MISMATCH'):h.guard_resources([row('postgres',running=False,ownerId='alien')],[(h.ROOT,'postgres')],OWNERS)
 def test_prepare_output_is_closed_and_never_accepts_raw_extra(self):
  safe={'type':'cp019-source-prepared','stage':'foundation','project':h.ROOT.name,'generation':'11111111-1111-4111-8111-111111111111','secretOutput':False}
  self.assertEqual(h.prepare_result(json.dumps(safe),'foundation'),safe)
  for change in [{'secretOutput':True},{'project':h.TARGET.name},{'stage':'writers'},{'password':'must-not-be-returned'}]:
   with self.subTest(change=change),self.assertRaises(AssertionError):h.prepare_result(json.dumps({**safe,**change}),'foundation')
 def test_owner_labels_come_from_custody_not_random(self):
  def c(prefix):return {'apiOwners':{'api1':prefix+'api1','api2':prefix+'api2'},'workerClockOwner':prefix+'worker','webOwner':prefix+'web'}
  m={'controllerOwner':'controller','source':c('source-'),'target':c('target-')}
  bridge=Mock();bridge.expected_target_worker_owner.return_value=m['target']['workerClockOwner']
  with patch.object(pathlib.Path,'exists',return_value=True),patch.object(h,'material_owned',return_value=m),patch.object(h,'target_bridge',return_value=bridge):got=h.expected_owners()
  self.assertEqual(got[h.ROOT.name]['web'],'source-web');self.assertEqual(got[h.TARGET.name]['api2'],'target-api2');self.assertEqual(got[h.ROOT.name]['probe'],'controller')
  bridge.expected_target_worker_owner.assert_called_once()
 def test_target_dispatch_rejects_unknown_arguments_before_import_or_resources(self):
  for action,args in [('target-evil',[]),('target-resource',['extra']),('target-runtime-start',['all']),('target-phase',['rotate','configs']),('target-acceptance',['source-fixture'])]:
   with self.subTest(action=action,args=args),patch.object(h,'target_bridge') as bridge,self.assertRaises(AssertionError):h.target_dispatch(action,args)
   bridge.assert_not_called()
 def test_target_dispatch_forwards_only_closed_selected_operation(self):
  bridge=Mock();bridge.phase.return_value={'result':'test'}
  with patch.object(h,'target_bridge',return_value=bridge):self.assertEqual(h.target_dispatch('target-phase',['rotate','run']),{'result':'test'})
  self.assertEqual(bridge.phase.call_args.args[1:],('rotate','run'));bridge.target_pg_start.assert_not_called()
 def test_source_canary_refuses_missing_copy_before_any_start(self):
  bridge=Mock();bridge.verify_copy_completed.side_effect=AssertionError('COPY_INCOMPLETE')
  with patch.object(h,'own'),patch.object(h,'preserve'),patch.object(h,'set_host_case'),patch.object(h,'facts',return_value=[]),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'target_bridge',return_value=bridge),patch.object(h,'compose') as start,self.assertRaisesRegex(AssertionError,'COPY_INCOMPLETE'):h.source_pg_canary_start()
  start.assert_not_called();bridge.verify_copy_completed.assert_called_once()
 def state(self):return {'schema':'cp019-budget-v1','project':h.ROOT.name,'startedUptime':10,'sequence':0,'total':dict.fromkeys(h.CEILINGS,0),'scenarios':{},'plannedScenarios':{'host-stage':h.CASE_LIMITS}}
 def runtime_state(self):
  s=self.state();s['plannedScenarios']={'target-runtime-start':h.CASE_LIMITS,'target-activation':h.CASE_LIMITS};s['plannedScopes']={'target-runtime-start':'target-window','target-activation':'target-window'};s['activeScenarios']={'target-window':'target-runtime-start','source-window':'source-runtime-start'};return s
 def test_runtime_case_switch_keeps_all_accumulated_usage_and_clocks(self):
  s=self.runtime_state();h.budget_update(s,'target-runtime-start','sql',12,11);before=copy.deepcopy(s['scenarios']);out=h.budget_enter(s,'target-window','target-activation',12)
  self.assertEqual(out['activeScenarios']['target-window'],'target-activation');self.assertEqual(out['total']['sql'],12);self.assertEqual(out['scenarios'],before);self.assertEqual(out['startedUptime'],10)
  h.budget_update(s,'target-activation','sql',7,13);first=s['scenarios']['target-runtime-start']['startedUptime'];h.budget_enter(s,'target-window','target-runtime-start',14);self.assertEqual(s['scenarios']['target-runtime-start']['startedUptime'],first);self.assertEqual(s['total']['sql'],19)
 def test_runtime_case_switch_rejects_unknown_wrong_scope_or_expiry_without_reset(self):
  for scope,name,now in [('source-window','target-activation',12),('target-window','invented',12),('target-window','target-activation',1811)]:
   s=self.runtime_state();before=copy.deepcopy(s)
   with self.assertRaises(AssertionError):h.budget_enter(s,scope,name,now)
   self.assertEqual(s,before)
  s=self.runtime_state();h.budget_update(s,'target-runtime-start','sql',12,11);before=copy.deepcopy(s)
  with self.assertRaises(AssertionError):h.budget_enter(s,'target-window','target-runtime-start',57)
  self.assertEqual(s,before)
 def test_budget_accumulates_before_effect_and_cannot_reset_retry(self):
  s=self.state();h.budget_update(s,'host-stage','artifactFiles',1500,11);h.budget_update(s,'host-stage','artifactFiles',500,12)
  self.assertEqual(s['total']['artifactFiles'],2000);self.assertEqual(s['sequence'],2)
  with self.assertRaisesRegex(AssertionError,'BUDGET_ABORT'):h.budget_update(s,'host-stage','artifactFiles',1,13)
  self.assertEqual(s['total']['artifactFiles'],2000)
 def test_approved_artifact_global_limit_does_not_increase_each_case(self):
  s=self.state();names=['host-stage','host-configs','host-material','source-resource','copy-verify'];s['plannedScenarios']={n:h.CASE_LIMITS for n in names}
  for name in names[:4]:h.budget_update(s,name,'artifactFiles',2000,11)
  h.budget_update(s,names[4],'artifactFiles',192,12);before=copy.deepcopy(s)
  with self.assertRaisesRegex(AssertionError,'CP019_BUDGET_ABORT'):h.budget_update(s,names[4],'artifactFiles',1,13)
  self.assertEqual(s,before);self.assertEqual(s['total']['artifactFiles'],8192);self.assertEqual(s['scenarios'][names[4]]['total']['artifactFiles'],192)
 def test_approved_sql_limits_are_exact_and_reentry_cannot_reset_case_or_global(self):
  self.assertEqual(h.CASE_LIMITS,{'sql':8192,'http':80,'journal':1000,'artifactFiles':2000});self.assertEqual(h.CEILINGS,{'sql':200000,'http':300,'journal':1000,'artifactFiles':8192});self.assertEqual(h.SCENARIO_COUNT,135)
  s=self.runtime_state();h.budget_update(s,'target-runtime-start','sql',8192,11);started=s['scenarios']['target-runtime-start']['startedUptime']
  h.budget_enter(s,'target-window','target-activation',12);h.budget_enter(s,'target-window','target-runtime-start',13);before=copy.deepcopy(s)
  with self.assertRaisesRegex(AssertionError,'CP019_BUDGET_ABORT'):h.budget_update(s,'target-runtime-start','sql',1,14)
  self.assertEqual(s,before);self.assertEqual(s['scenarios']['target-runtime-start']['startedUptime'],started)
  s=self.state();s['total']['sql']=200000-8192;h.budget_update(s,'host-stage','sql',8192,11);before=copy.deepcopy(s)
  with self.assertRaisesRegex(AssertionError,'CP019_BUDGET_ABORT'):h.budget_update(s,'host-stage','sql',1,12)
  self.assertEqual(s,before);self.assertEqual(s['total']['sql'],200000)
 def test_budget_stale_global_case_unknown_and_overquota_abort(self):
  for now,scenario,kind,amount in [(1811,'host-stage','sql',1),(11,'retry-alias','sql',1),(11,'host-stage','sql',8193),(11,'host-stage','sql',True)]:
   with self.subTest(now=now,scenario=scenario,amount=amount),self.assertRaisesRegex(AssertionError,'BUDGET_ABORT'):h.budget_update(self.state(),scenario,kind,amount,now)
  s=self.state();h.budget_update(s,'host-stage','sql',1,11)
  with self.assertRaisesRegex(AssertionError,'BUDGET_ABORT'):h.budget_update(s,'host-stage','sql',1,57)
 def test_pg_start_never_reads_control_data_before_ready(self):
  events=[]
  def compose(root,*args):events.append(args[0]);return 'a'*64 if args[0]=='ps' else ''
  def run(*args):
   events.append('control' if 'pg_controldata' in args else 'inspect')
   return 'Database system identifier: 1234567890123456789' if 'pg_controldata' in args else '{"own":{}}'
  created=row('postgres',id='a'*64,running=False,pid=0,status='created')
  with patch.object(h,'own'),patch.object(h,'facts',return_value=[]),patch.object(h,'preserve',return_value={}),patch.object(h,'resources'),patch.object(h,'prepare_source_services',return_value=([created],OWNERS)),patch.object(h,'start_source_service',side_effect=lambda *_:events.append('ROOT_REF_THEN_START')),patch.object(h,'wait_pg_ready',side_effect=lambda _:events.append('ready')),patch.object(h,'run',side_effect=run),patch.object(h,'write_plain'):
   got=h.pg_start()
  self.assertLess(events.index('ready'),events.index('control'));self.assertEqual(got['systemIdentifier'],'1234567890123456789')
 def test_pg_start_fail_closed_does_not_publish_identity(self):
  created=row('postgres',id='a'*64,running=False,pid=0,status='created')
  with patch.object(h,'own'),patch.object(h,'facts',return_value=[]),patch.object(h,'preserve',return_value={}),patch.object(h,'resources'),patch.object(h,'prepare_source_services',return_value=([created],OWNERS)),patch.object(h,'start_source_service'),patch.object(h,'wait_pg_ready',side_effect=AssertionError('PG_START_NOT_PROVEN')),patch.object(h,'run') as runner,patch.object(h,'write_plain') as publish:
   with self.assertRaisesRegex(AssertionError,'PG_START_NOT_PROVEN'):h.pg_start()
  runner.assert_not_called();publish.assert_not_called()
 def test_resource_guard_rejects_before_docker_compose_effect(self):
  with patch.object(h,'own'),patch.object(h,'guard_effect',side_effect=AssertionError('BUDGET')),patch.object(h,'run') as runner:
   with self.assertRaisesRegex(AssertionError,'BUDGET'):h.compose(h.ROOT,'run','--no-deps','--rm','harness')
  runner.assert_not_called()
 def test_registry_requires_full_fixed_case_limits(self):
  names=['host-stage','source-runtime-start','target-runtime-start']+['fixture-case-'+str(i) for i in range(132)]
  p={'schema':'cp019-budget-plan-v1','project':h.ROOT.name,'plannedScenarios':{n:dict(h.CASE_LIMITS) for n in names},'plannedScopes':{n:'target-window' if n=='target-runtime-start' else 'source-window' for n in names},'activeScenarios':{'source-window':'source-runtime-start','target-window':'target-runtime-start'}}
  self.assertEqual(h.validate_registry(p),p)
  p['plannedScenarios']['host-stage']['sql']=8193
  with self.assertRaisesRegex(AssertionError,'BUDGET_REGISTRY'):h.validate_registry(p)
 def test_prepare_failed_exit_never_chmods_or_reports_pass(self):
  def text(p):return json.dumps({'sourceSha':'a'*40}) if p.name=='artifact.json' else '1234567890123456789'
  def compose(root,*args):
   if args[0]=='ps':return 'a'*64
   raise subprocess.CalledProcessError(1,['own-harness'])
  with patch.object(h,'own'),patch.object(pathlib.Path,'read_text',text),patch.object(pathlib.Path,'exists',return_value=False),patch.object(pathlib.Path,'is_symlink',return_value=False),patch.object(h,'compose',side_effect=compose),patch.object(h,'controller_job',side_effect=subprocess.CalledProcessError(1,['own-harness'])),patch.object(h,'wait_pg_ready'),patch.object(h.os,'chmod') as chmod,patch.object(h.os,'chown',create=True) as chown:
   with self.assertRaises(subprocess.CalledProcessError):h.prepare('foundation')
  chmod.assert_not_called();chown.assert_not_called()
 def cleanup_run(self,before,after,inspect=None):
  commands=[]
  # Existing cleanup models supply positive Root custody explicitly; dedicated
  # SourceCleanupCustody tests below exercise the actual reference verifier.
  with patch.object(h,'own'),patch.object(h,'verify_source_references',return_value=True,create=True),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'facts',side_effect=[before,after]),patch.object(h,'preserve',return_value={'result':'PASS'}),patch.object(h,'inspect_container',side_effect=inspect or (lambda cid:next(x for x in before if x['id']==cid))),patch.object(h,'run',side_effect=lambda *a:commands.append(a) or ''):
   result=h.cleanup()
  return result,commands
 def test_cleanup_collision_keeps_unknown_and_stops_valid_id_only(self):
  good=row('api1',id='a'*64);alien=row('api2',id='b'*64,ownerId='alien')
  result,calls=self.cleanup_run([good,alien],[{**good,'running':False},alien])
  self.assertEqual(result['result'],'FAIL');self.assertEqual(calls,[('docker','stop','--time','30','a'*64)]);self.assertEqual(result['unknownContainers'],['b'*64])
 def test_cleanup_stops_valid_even_when_aggregate_exceeds_budget(self):
  rows=[row('postgres',id='a'*64),row('postgres',h.TARGET,id='b'*64)]
  with patch.object(h,'verify_main_target_references',return_value=True):result,calls=self.cleanup_run(rows,[{**r,'running':False} for r in rows])
  self.assertEqual(result['result'],'PASS');self.assertEqual(calls,[('docker','stop','--time','30','a'*64,'b'*64)])
 def test_cleanup_stops_exact_variant_cid_without_budget_or_label_takeover(self):
  main=row('postgres',h.TARGET,id='a'*64);variant=row('postgres',h.TARGET,id='b'*64,ownerId='variant-owner');ref={'containerId':variant['id'],'ownerId':variant['ownerId']};provider=Mock();provider.variant_references.side_effect=AssertionError("COHORT_EXPIRED");provider.emergency_variant_references.return_value=[ref];provider.matches.side_effect=lambda c,r,profiles:c['id']==r['containerId'] and c['ownerId']==r['ownerId']
  with patch.object(h.pathlib.Path,'exists',return_value=True),patch.object(h,'variant_bridge',return_value=provider),patch.object(h,'verify_main_target_references',return_value=True),patch.object(h,'guard_resources',side_effect=AssertionError('PRESSURE')) as guard:
   result,calls=self.cleanup_run([main,variant],[{**main,'running':False},{**variant,'running':False}])
  self.assertEqual(result['result'],'PASS');self.assertEqual(calls,[('docker','stop','--time','30',main['id'],variant['id'])]);guard.assert_not_called()
 def test_cleanup_unregistered_target_with_matching_labels_is_retained(self):
  target=row('postgres',h.TARGET,id='a'*64)
  with patch.object(h,'verify_main_target_references',side_effect=AssertionError('NO_ROOT_CID')):result,calls=self.cleanup_run([target],[target])
  self.assertEqual(result['result'],'FAIL');self.assertEqual(calls,[]);self.assertEqual(result['unknownContainers'],[target['id']])
 def test_cleanup_revalidation_owner_change_never_stops_collision(self):
  good=row('api1',id='a'*64);changed={**good,'ownerId':'alien'}
  result,calls=self.cleanup_run([good],[changed],inspect=lambda _:changed)
  self.assertEqual(result['result'],'FAIL');self.assertEqual(calls,[])
 def test_cleanup_checks_stopped_identity_and_preserves_foreign(self):
  good=row('api1',id='a'*64,running=False);alien=row('api2',id='b'*64,running=False,ownerId='alien');foreign={'id':'c'*64,'project':'nexora','running':True}
  result,calls=self.cleanup_run([good,alien,foreign],[good,alien,foreign])
  self.assertEqual(result['result'],'FAIL');self.assertEqual(calls,[]);self.assertEqual(result['otherConsumersPreserved'],2)
 def test_cleanup_duplicate_service_collision_never_adopted(self):
  rows=[row('api1',id='a'*64),row('api1',id='b'*64),row('worker',id='c'*64)]
  result,calls=self.cleanup_run(rows,[rows[0],rows[1],{**rows[2],'running':False}])
  self.assertEqual(result['result'],'FAIL');self.assertEqual(result['unknownContainers'],['a'*64,'b'*64]);self.assertEqual(calls,[('docker','stop','--time','30','c'*64)])
 def test_cleanup_unknown_limits_even_if_stopped_rejected(self):
  good=row('worker',id='a'*64);bad=row('api1',id='b'*64,running=False,nanoCpus=0)
  result,calls=self.cleanup_run([good,bad],[{**good,'running':False},bad])
  self.assertEqual(result['result'],'FAIL');self.assertEqual(calls,[('docker','stop','--time','30','a'*64)])
 def test_journal_private_publication_folders_owned_by_controller_uid(self):
  self.assertTrue({'backup','journal','journal/heads','journal/plans'}<=set(h.UID999_FOLDERS));self.assertNotIn('master',h.UID999_FOLDERS)
 def test_source_step_closed_command_and_single_config_file(self):
  cfg,profile,args=h.source_step_args('source-close-b','select','a'*40)
  self.assertEqual(profile,'harness');self.assertEqual(cfg,h.ROOT/'secrets/source-close-b-select-config.json')
  self.assertIn('--no-deps',args);self.assertNotIn('--rm',args);self.assertIn(str(cfg)+':/run/qa-secrets/source-driver.json:ro',args);self.assertEqual(args[-2:],['node','tests/qa/cp019/source-driver.mjs'])
  for phase,action in [('target-promote','run'),('source-close-b','unknown'),('../source-close-b','select')]:
   with self.subTest(phase=phase),self.assertRaises(AssertionError):h.source_step_args(phase,action,'a'*40)
 def test_source_clock_ack_uses_probe_with_only_pg_worker(self):
  _,profile,_=h.source_step_args('source-clock-ack','run','a'*40)
  self.assertEqual(profile,'probe');got=h.guard_resources([row('postgres'),row('worker')],[(h.ROOT,profile)],OWNERS)
  self.assertEqual(got['nanoCpus'],500_000_000);self.assertEqual(got['memoryMiB'],960)
  with self.assertRaisesRegex(AssertionError,'BUSINESS_ACTIVE'):h.guard_resources([row('postgres'),row('worker')],[(h.ROOT,'harness')],OWNERS)
 def receipt_fixture(self):
  m={'controllerOwner':'11111111-1111-4111-8111-111111111111','source':{'generation':'22222222-2222-4222-8222-222222222222','normal':{'runId':'33333333-3333-4333-8333-333333333333'}}}
  resource={'project':h.ROOT.name};normal={'custodyHash':h.canonical_hash(m),'generation':m['source']['generation'],'runId':m['source']['normal']['runId'],'resource':resource}
  body={'resource':resource,'normalManifest':normal,'normalManifestHash':h.canonical_hash(normal)};observation={'resource':resource,'runtimeConsumers':[]}
  return m,body,observation
 def test_host_receipt_is_actual_observation_and_invocation_bound(self):
  m,body,observation=self.receipt_fixture();uid='44444444-4444-4444-8444-444444444444'
  r=h.source_host_receipt(body,'source-close-b','a'*40,m,observation,uid,'2026-10-14T00:00:00.000Z')
  self.assertEqual(r['invocationId'],uid);self.assertEqual(r['producerSha'],'a'*40);self.assertEqual(r['resourceHash'],h.canonical_hash(body['resource']));self.assertEqual(r['observedResources'],observation)
  for replacement in [{'resource':{'project':h.TARGET.name}},{'normalManifestHash':'f'*64}]:
   with self.subTest(replacement=replacement),self.assertRaises(AssertionError):h.source_host_receipt({**body,**replacement},'source-close-b','a'*40,m,observation,uid,'2026-10-14T00:00:00.000Z')
 def test_fresh_observation_cannot_use_stale_resource_or_extra_worker(self):
  resource={'project':h.ROOT.name}
  with patch.object(h,'source_resource',return_value={'resource':resource}),patch.object(h,'facts',return_value=[row('postgres'),row('worker'),row('api1')]),patch.object(h,'expected_owners',return_value=OWNERS):
   with self.assertRaisesRegex(AssertionError,'SOURCE_ACK_WORKER_ONLY'):h.fresh_source_observation('source-clock-ack',resource)
  with patch.object(h,'source_resource',return_value={'resource':{'project':h.TARGET.name}}):
   with self.assertRaisesRegex(AssertionError,'SOURCE_RESOURCE_CHANGED'):h.fresh_source_observation('source-close-b',resource)
 def test_fresh_worker_observation_preserves_exact_actor_identity(self):
  resource={'project':h.ROOT.name};worker=row('worker',id='a'*64)
  with patch.object(h,'source_resource',return_value={'resource':resource}),patch.object(h,'facts',return_value=[row('postgres'),worker]),patch.object(h,'expected_owners',return_value=OWNERS):got=h.fresh_source_observation('source-clock-ack',resource)
  self.assertEqual(got['runtimeConsumers'],[{'service':'worker','containerId':'a'*64,'running':True,'ownerId':worker['ownerId'],'imageDigest':'sha256:'+h.PINS['node']}])
 def test_receipt_future_or_stale_time_never_allows_dispatch(self):
  for age in [-.01,5.001]:
   with self.subTest(age=age),self.assertRaisesRegex(AssertionError,'SOURCE_RECEIPT_STALE'):h.receipt_age_guard(age)
  self.assertEqual(h.receipt_age_guard(0),0);self.assertEqual(h.receipt_age_guard(5),5)
 def test_offline_pg_profile_requires_every_pg_and_business_off(self):
  owners=copy.deepcopy(OWNERS)
  for p in owners:owners[p]['offline-pg']='offline-owner'
  got=h.guard_resources([],[(h.ROOT,'offline-pg')],owners)
  self.assertEqual(got['nanoCpus'],250_000_000);self.assertEqual(got['memoryMiB'],128)
  with self.assertRaisesRegex(AssertionError,'OFFLINE_PG_ACTIVE'):h.guard_resources([row('postgres')],[(h.ROOT,'offline-pg')],owners)
 def test_shutdown_control_data_requires_positive_state_and_sid(self):
  text='Database system identifier: 1234567890123456789\nDatabase cluster state: shut down\n'
  self.assertEqual(h.parse_shutdown(text,'1234567890123456789')['clusterState'],'shut down')
  for bad in [text.replace('shut down','in production'),text.replace('1234567890123456789','9234567890123456789')]:
   with self.assertRaisesRegex(AssertionError,'PG_SHUTDOWN_NOT_PROVEN'):h.parse_shutdown(bad,'1234567890123456789')
 def test_controller_job_orders_durable_creation_before_start_sql(self):
  events=[];job={'cid':'a'*64}
  with patch.object(h,'create_job',side_effect=lambda *a:events.append('CID_FSYNC') or job),patch.object(h,'start_job',side_effect=lambda j:events.append('START')),patch.object(h,'finish_job',side_effect=lambda j:events.append('END_FSYNC') or ('safe',{})):
   h.controller_job(h.ROOT,'harness',['node','own.mjs'],before_start=lambda j:events.append('CONFIG'),after_start=lambda j:events.append('AFTER_START'))
  self.assertEqual(events,['CID_FSYNC','CONFIG','START','AFTER_START','END_FSYNC'])
 def test_failed_cid_publication_never_starts_or_removes_job(self):
  events=[];cid='a'*64;job_id='44444444-4444-4444-8444-444444444444';created=row('harness',id=cid,running=False,status='created',jobId=job_id)
  with patch.object(h,'guard_effect'),patch.object(h,'facts',return_value=[]),patch.object(h,'job_command',return_value=(['docker','create'],job_id,created['ownerId'])),patch.object(h,'run',side_effect=lambda *a:events.append(a) or cid),patch.object(h,'inspect_container',return_value=created),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'immutable',side_effect=OSError('FSYNC_FAILED')):
   with self.assertRaisesRegex(OSError,'FSYNC_FAILED'):h.controller_job(h.ROOT,'harness',['node','own.mjs'])
  self.assertEqual(events,[('docker','create')])
 def test_job_start_requires_exact_created_identity_before_effect(self):
  job={'cid':'a'*64,'jobId':'j','ownerId':'owner','root':h.ROOT,'profile':'harness'}
  with patch.object(h,'inspect_container',return_value=row('harness',id='a'*64,running=False,status='created',jobId='other')),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'run') as run:
   with self.assertRaisesRegex(AssertionError,'JOB_START_IDENTITY'):h.start_job(job)
  run.assert_not_called()
 def test_job_creation_does_not_adopt_existing_stopped_profile(self):
  with patch.object(h,'guard_effect'),patch.object(h,'facts',return_value=[row('harness',running=False)]),patch.object(h,'run') as run:
   with self.assertRaisesRegex(AssertionError,'PREVIOUS_JOB_REQUIRES_RECONCILIATION'):h.create_job(h.ROOT,'harness',['node','own.mjs'])
  run.assert_not_called()
 def test_atomic_source_stdout_is_closed_and_matches_real_bridge_contract(self):
  for phase,kind in [('source-close-b','cp019-source-phase'),('source-clock-ack','cp019-source-ack')]:
   result={'type':kind,'phase':phase,'planHash':'a'*64,'receiptHash':'b'*64,'secretOutput':False,'physicalCohortAcceptance':'NOT VERIFIED'}
   self.assertEqual(h.source_atomic_result(json.dumps(result),phase),result)
   for change in [{'type':'cp019-source-atomic'},{'password':'never-publish'},{'physicalCohortAcceptance':'PASS'}]:
    with self.subTest(phase=phase,change=change),self.assertRaisesRegex(AssertionError,'SOURCE_ATOMIC_RESULT'):h.source_atomic_result(json.dumps({**result,**change}),phase)
 def live_fixture(self):
  m,body,_=self.receipt_fixture();m['source'].update({'apiOwners':{'api1':'owner-api1','api2':'owner-api2'},'workerClockOwner':'owner-worker','webOwner':'owner-web'})
  body['normalManifest']['custodyHash']=h.canonical_hash(m);body['normalManifestHash']=h.canonical_hash(body['normalManifest'])
  rows=[row('postgres',id='0'*64),row('probe',id='5'*64)]+[row(s,id=str(i)*64) for i,s in enumerate(['api1','api2','worker','web'],1)]
  return m,body,rows
 def test_business_gate_requires_four_actual_exact_consumers_and_no_target(self):
  m,body,rows=self.live_fixture();uid='44444444-4444-4444-8444-444444444444'
  with patch.object(h,'expected_owners',return_value=OWNERS):gate=h.source_business_gate(body,m,'a'*40,uid,'b'*64,body['resource'],rows,'2026-10-14T00:00:00.000Z')
  self.assertEqual({r['service'] for r in gate['runtimeConsumers']},h.BUSINESS);self.assertEqual(gate['ackReceiptHash'],'b'*64);self.assertNotIn('sqlOwnersPresent',gate)
  for changed in [rows[:-1],rows+[{**row('api1',h.TARGET),'id':'6'*64}],rows[:-1]+[{**rows[-1],'ownerId':'alien'}]]:
   with patch.object(h,'expected_owners',return_value=OWNERS),self.assertRaises(AssertionError):h.source_business_gate(body,m,'a'*40,uid,'b'*64,body['resource'],changed,'2026-10-14T00:00:00.000Z')
 def test_source_stop_revalidates_and_stops_exact_four_without_pg_or_probe(self):
  m,body,rows=self.live_fixture();business=rows[2:];after=[{**r,'running':False,'status':'exited','pid':0,'exitCode':0,'finishedAt':'2026-10-14T00:00:01.000Z'} for r in business];calls=[]
  snapshots={r['id']:r for r in business};phase={'stopped':False}
  def run(*args,**kw):calls.append(args);phase['stopped']=True;return ''
  def inspect(cid):return next(r for r in after if r['id']==cid) if phase['stopped'] else snapshots[cid]
  with patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'inspect_container',side_effect=inspect),patch.object(h,'run_bounded',side_effect=run):result=h.stop_source_business(business)
  self.assertEqual(calls,[('docker','stop','--time','5',*(r['id'] for r in business))]);self.assertEqual(len(result),4);self.assertTrue(all(r['running'] is False for r in result));self.assertNotIn('sqlOwnersPresent',result[0])
 def test_source_stop_owner_change_prevents_adopting_or_stopping_unknown(self):
  _,_,rows=self.live_fixture();business=rows[2:]
  with patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'inspect_container',return_value={**business[0],'ownerId':'alien'}),patch.object(h,'run_bounded') as run:
   with self.assertRaisesRegex(AssertionError,'SOURCE_STOP_IDENTITY'):h.stop_source_business(business)
  run.assert_not_called()
 def test_source_live_stdout_rejects_extra_secrets_and_inflated_scope(self):
  result={'type':'cp019-source-live','phase':'source-fixture','status':'PASS','ackReceiptHash':'a'*64,'resultHash':'b'*64,'secretOutput':False,'sourceEndProofHash':'c'*64}
  self.assertEqual(h.source_live_result(json.dumps(result)),result)
  for change in [{'secretOutput':True},{'password':'no'},{'type':'cp019-source-ack'},{'resultHash':'invalid'},{'status':'FAIL'}]:
   with self.subTest(change=change),self.assertRaisesRegex(AssertionError,'SOURCE_LIVE_RESULT'):h.source_live_result(json.dumps({**result,**change}))
 def test_source_live_one_job_orders_ack_runtime_fixture_and_exact_stop(self):
  m,body,rows=self.live_fixture();m['artifactDigest']='f'*64;body['normalManifest']['custodyHash']=h.canonical_hash(m);body['normalManifestHash']=h.canonical_hash(body['normalManifest']);body.update({'phase':'source-clock-ack','action':'select','sourceCommit':'a'*40});uid='44444444-4444-4444-8444-444444444444';events=[]
  ack={'phase':'source-clock-ack','stage':'COMPLETE','sourceCommit':'a'*40,'custodyHash':h.canonical_hash(m),'normalManifestHash':body['normalManifestHash'],'generation':m['source']['generation'],'runId':m['source']['normal']['runId']};ack_hash=h.canonical_hash(ack);fixture={'status':'PASS','synthetic':True};fixture_hash=h.canonical_hash(fixture)
  ended=[{'service':r['service'],'id':r['id'],'ownerId':r['ownerId'],'running':False,'exitCode':0,'finishedAt':'2026-10-14T00:00:01.000Z'} for r in rows[2:]];end_proof={'schema':'synthetic-unit-only'};end_hash=h.canonical_hash(end_proof)
  report={'sourceCommit':'a'*40,'artifactDigest':m['artifactDigest'],'generation':m['source']['generation'],'runId':m['source']['normal']['runId'],'invocationId':uid,'ackReceiptHash':ack_hash,'result':fixture,'sourceEndProofHash':end_hash};end={'hash':end_hash,'endProof':end_proof,'observedEnd':{'containers':ended,'sqlOwnersPresent':[],'httpPending':[]}}
  def private(path):
   data=body if path.name.endswith('select-config.json') else ack if path.name=='source-clock-ack.json' else report if path.name=='source-live.json' else end
   return data,h.canonical_hash(data)
  def signal(path,*args,**kw):
   events.append('ACK_READY' if path.name.endswith('ack-ready.json') else 'FIXTURE_DONE');return {'ackReceiptHash':ack_hash,'resultHash':fixture_hash},'1'*64
  def job(root,profile,command,env,after_start):
   self.assertEqual(profile,'probe');self.assertEqual(command[-1],'source-live');self.assertIn('QA_BUSINESS_GATE',env);self.assertIn('QA_FIXTURE_DONE',env);self.assertIn('QA_SOURCE_STOP_GATE',env);events.append('ONE_JOB');after_start({'cid':'5'*64,'jobId':uid});events.append('JOB_END');return json.dumps({'type':'cp019-source-live','phase':'source-fixture','status':'PASS','ackReceiptHash':ack_hash,'resultHash':h.canonical_hash(report),'secretOutput':False,'sourceEndProofHash':end_hash}),{}
  def start(side,mode,sample):self.assertFalse(sample);events.append('START_'+mode);return {'runtimeConsumers':[r for r in rows[2:] if mode=='business' or r['service']=='worker']}
  with ExitStack() as patches:
   patches.enter_context(patch.object(h,'own'))
   patches.enter_context(patch.object(h,'set_host_case'))
   patches.enter_context(patch.object(h,'enter_runtime_case',side_effect=lambda scope,name:events.append('CASE_'+name)))
   patches.enter_context(patch.object(h,'read_host_private',side_effect=private))
   patches.enter_context(patch.object(h,'material_owned',return_value=m))
   patches.enter_context(patch.object(pathlib.Path,'read_text',return_value=json.dumps({'sourceSha':'a'*40})))
   patches.enter_context(patch.object(pathlib.Path,'is_file',return_value=True))
   patches.enter_context(patch.object(pathlib.Path,'exists',return_value=False))
   patches.enter_context(patch.object(h,'facts',side_effect=[rows[:2],rows]))
   patches.enter_context(patch.object(h.uuid,'uuid4',return_value=uid))
   patches.enter_context(patch.object(h,'controller_job',side_effect=job))
   patches.enter_context(patch.object(h,'wait_source_ready',side_effect=lambda *a:events.append('READY')))
   patches.enter_context(patch.object(h,'guard_effect',side_effect=lambda *a:events.append('COLD_SAMPLE')))
   patches.enter_context(patch.object(h,'runtime_start',side_effect=start))
   patches.enter_context(patch.object(h,'fresh_source_observation',return_value={'resource':body['resource'],'runtimeConsumers':[]}))
   patches.enter_context(patch.object(h,'source_resource',return_value={'resource':body['resource']}))
   patches.enter_context(patch.object(h,'wait_source_signal',side_effect=signal))
   patches.enter_context(patch.object(h,'write_plain',side_effect=lambda p,*a:events.append('PUBLISH_'+('ACK' if 'clock-ack-run' in p.name else 'BUSINESS' if 'business' in p.name else 'STOP'))))
   patches.enter_context(patch.object(h,'stop_source_business',side_effect=lambda *a:events.append('STOP_EXACT4') or ended))
   patches.enter_context(patch.object(h,'expected_owners',return_value=OWNERS))
   patches.enter_context(patch.object(h,'preserve',return_value={}))
   result=h.source_live()
  self.assertEqual(events,['ONE_JOB','READY','COLD_SAMPLE','START_worker','PUBLISH_ACK','ACK_READY','CASE_source-runtime-start','START_business','PUBLISH_BUSINESS','FIXTURE_DONE','CASE_source-close-admission','STOP_EXACT4','PUBLISH_STOP','JOB_END']);self.assertEqual(result['allL3Acceptance'],'NOT VERIFIED')
 def test_source_stop_missing_positive_exit_is_not_fin(self):
  _,_,rows=self.live_fixture();business=rows[2:];after=[{**r,'running':False,'status':'exited','pid':0,'exitCode':0,'finishedAt':'0001-01-01T00:00:00Z'} for r in business]
  with patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'inspect_container',side_effect=business+after),patch.object(h,'run_bounded'):
   with self.assertRaisesRegex(AssertionError,'SOURCE_STOP_NOT_PROVEN'):h.stop_source_business(business)
 def test_source_emergency_preserves_unknown_and_stops_only_known_exact_runtime(self):
  _,_,rows=self.live_fixture();good=rows[2];bad=rows[3];ended={**good,'running':False,'status':'exited','pid':0,'exitCode':0,'finishedAt':'2026-10-14T00:00:01Z'}
  with patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'inspect_container',side_effect=[good,{**bad,'ownerId':'alien'},ended]),patch.object(h,'run_bounded') as run:result=h.stop_known_source_runtime([good,bad])
  run.assert_called_once_with('docker','stop','--time','5',good['id'],timeout=15);self.assertEqual(result['unknownContainers'],[bad['id']]);self.assertEqual(result['sqlFIN'],'NOT VERIFIED');self.assertEqual(result['status'],'FAIL / ABORTED')
 def test_source_emergency_stopped_boolean_without_positive_exit_is_unknown(self):
  _,_,rows=self.live_fixture();known=rows[2]
  with patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'inspect_container',return_value={**known,'running':False,'status':'created','pid':0,'exitCode':0,'finishedAt':'0001-01-01T00:00:00Z'}),patch.object(h,'run_bounded') as run:result=h.stop_known_source_runtime([known])
  run.assert_not_called();self.assertEqual(result['positivelyStoppedContainers'],[]);self.assertEqual(result['unknownContainers'],[known['id']])
 def test_master_publication_cannot_change_the_created_controller_job_identity(self):
  uid='44444444-4444-4444-8444-444444444444';cid='a'*64;job={'cid':cid,'jobId':uid,'root':h.ROOT,'profile':'controller-tool','ownerId':'pre-material','receiptHash':'b'*64}
  receipt={'schema':'controller-job-created-v1','jobId':uid,'containerId':cid,'project':h.ROOT.name,'service':'controller-tool','ownerId':'pre-material','imageDigest':'sha256:'+h.PINS['node'],'commandHash':'c'*64,'state':'CREATED BEFORE START/SQL','createdAt':'2026-10-14T00:00:00.000Z'}
  actual=row('controller-tool',id=cid,ownerId='pre-material',jobId=uid,running=False,status='exited',pid=0,exitCode=0,finishedAt='2026-10-14T00:00:01.000Z',startedAt='2026-10-14T00:00:00.000Z')
  # A real master/ref publication changes dynamic expected owners. END must
  # instead use the immutable creation reference, never a mutable owner lookup.
  with patch.object(h,'inspect_container',return_value=actual),patch.object(h,'run_bounded',return_value='0'),patch.object(h.subprocess,'check_output',return_value='safe-metadata'),patch.object(h,'write_plain'),patch.object(h,'immutable',return_value='d'*64),patch.object(h,'run') as run,patch.object(h,'expected_owners',return_value={h.ROOT.name:{'controller-tool':'new-controller-owner'}}) as dynamic,patch.object(h,'read_created_job',return_value=receipt,create=True):output,proof=h.finish_job(job)
  self.assertEqual(output,'safe-metadata');self.assertEqual(proof['sqlFIN'],'NOT VERIFIED');run.assert_called_once_with('docker','rm',cid)
  dynamic.assert_not_called()
  for changed in [{'ownerId':'new-controller-owner'},{'imageRef':'node:latest'},{'memory':0},{'id':'f'*64}]:
   self.assertFalse(h.created_job_identity({**actual,**changed},job,receipt))
  self.assertFalse(h.created_job_identity(actual,job,{**receipt,'containerId':'f'*64}))
  # The missing-ref transition is already guarded in expected_owners itself;
  # protect this factual behavior rather than inventing a failure it lacks.
  def exists(path):return path.name=='material.json'
  with patch.object(pathlib.Path,'exists',exists),patch.object(h,'material_owned') as read:
   self.assertEqual(h.expected_owners()[h.ROOT.name]['controller-tool'],'pre-material')
  read.assert_not_called()

class RemainingBudget(unittest.TestCase):
 def test_real_node_registry_hash_and_remaining_agree_without_tmp_plan(self):
  node='C:/Users/thede/Desktop/Proyectos de programacion/MECANET-develop/.qa-private/runtime/node.exe' if sys.platform=='win32' else shutil.which('node')
  self.assertTrue(node and pathlib.Path(node).is_file(),'APPROVED_NODE_RUNTIME_REQUIRED')
  self.assertEqual(subprocess.check_output([node,'--version'],text=True,timeout=10).strip(),'v24.21.0')
  script="import {budgetRegistry,initialBudget} from './tests/qa/cp019/budget-plan.mjs'; console.log(JSON.stringify(initialBudget(budgetRegistry(),100)));"
  state=json.loads(subprocess.check_output([node,'--input-type=module','-e',script],cwd=pathlib.Path(__file__).parents[3],text=True,timeout=10))
  self.assertEqual(h.validate_budget_remaining(state,'ready-empty',144),45)
  state['scenarios']['ready-empty']={'startedUptime':100,'limits':dict(h.CASE_LIMITS),'total':dict.fromkeys(h.CEILINGS,0)}
  self.assertEqual(h.validate_budget_remaining(state,'ready-empty',144),1)
 def model(self):
  names=['source-runtime-start','target-runtime-start']+['model-'+str(i) for i in range(133)]
  plan={'schema':'cp019-budget-plan-v1','project':h.ROOT.name,'plannedScenarios':{n:dict(h.CASE_LIMITS) for n in names},'plannedScopes':{n:'target-window' if n.startswith('target-') else 'source-window' for n in names},'activeScenarios':{'source-window':'source-runtime-start','target-window':'target-runtime-start'}}
  state={**copy.deepcopy(plan),'schema':'cp019-budget-v1','startedUptime':100,'sequence':1,'total':dict.fromkeys(h.CEILINGS,0),'scenarios':{'source-runtime-start':{'startedUptime':100,'limits':dict(h.CASE_LIMITS),'total':dict.fromkeys(h.CEILINGS,0)}}}
  return state,h.canonical_hash(plan)
 def test_original_case_deadline_and_global_remaining_are_read_only(self):
  state,sha=self.model();before=copy.deepcopy(state)
  with patch.object(h,'BUDGET_PLAN_SHA',sha):
   self.assertEqual(h.validate_budget_remaining(state,'source-runtime-start',144),1)
   with self.assertRaisesRegex(AssertionError,'BUDGET_ABORT'):h.validate_budget_remaining(state,'source-runtime-start',146)
   self.assertEqual(h.validate_budget_remaining(state,'target-runtime-start',1899),1)
   self.assertEqual(h.validate_budget_remaining(state,'target-runtime-start',110,7),7)
  self.assertEqual(state,before)
 def test_closed_registry_caps_types_and_clocks_never_pass(self):
  original,sha=self.model()
  mutations=[lambda s:s['plannedScopes'].__setitem__('source-runtime-start','target-window'),lambda s:s['total'].__setitem__('sql',200001),lambda s:s['scenarios']['source-runtime-start']['total'].__setitem__('artifactFiles',2001),lambda s:s.__setitem__('startedUptime',True),lambda s:s.__setitem__('sequence',True),lambda s:s['scenarios']['source-runtime-start'].__setitem__('startedUptime',147),lambda s:s['scenarios']['source-runtime-start']['limits'].__setitem__('sql',8193)]
  with patch.object(h,'BUDGET_PLAN_SHA',sha):
   for mutate in mutations:
    state=copy.deepcopy(original);mutate(state)
    with self.subTest(mutation=mutations.index(mutate)),self.assertRaises(AssertionError):h.validate_budget_remaining(state,'source-runtime-start',144)
   for name,now,maximum in [('invented',144,45),('source-runtime-start',1901,45),('source-runtime-start',99,45),('source-runtime-start',144,46),('source-runtime-start',144,True)]:
    with self.subTest(name=name,now=now,maximum=maximum),self.assertRaises(AssertionError):h.validate_budget_remaining(original,name,now,maximum)
 def test_start_job_checks_after_slow_profile_guard_before_docker(self):
  state,sha=self.model();clock=[144];job={'cid':'a'*64,'jobId':'j','ownerId':'owner','root':h.ROOT,'profile':'harness'};created={'jobId':'j','ownerId':'owner','running':False,'status':'created'}
  with patch.object(h,'BUDGET_PLAN_SHA',sha),patch.object(h,'HOST_CASE','source-runtime-start'),patch.object(h,'read_budget_snapshot',return_value=state,create=True),patch.object(h,'uptime',side_effect=lambda:clock[0]),patch.object(h,'inspect_container',return_value=created),patch.object(h,'created_job_identity',return_value=True),patch.object(h,'read_created_job',return_value={}),patch.object(h,'facts',return_value=[]),patch.object(h,'expected_owners',return_value={}),patch.object(h,'guard_resources',side_effect=lambda *_:clock.__setitem__(0,146)),patch.object(h,'run') as run:
   with self.assertRaisesRegex(AssertionError,'BUDGET_ABORT'):h.start_job(job)
  run.assert_not_called()

class ResourceAdmissionDiagnostics(unittest.TestCase):
 def setUp(self):h.RESOURCE_LAST_SAMPLE=None;h.RESOURCE_FIRST_REJECTED_SAMPLE=None
 def test_sync_rejection_records_exact_point_before_original_assertion(self):
  memory='MemAvailable:       8388608 kB\n';counter=iter(['cpu 0 0 0 0 0 0 0 0\n','cpu 81 0 0 19 0 0 0 0\n'])
  def read(p):return memory if p.as_posix()=='/proc/meminfo' else next(counter)
  disk=types.SimpleNamespace(f_bavail=20*1024**3,f_frsize=1,f_blocks=100*1024**3)
  with patch.object(h.pathlib.Path,'read_text',read),patch.object(h.os,'statvfs',return_value=disk,create=True),patch.object(h.time,'sleep'),patch.object(h.time,'monotonic',side_effect=[10,12]),self.assertRaisesRegex(AssertionError,'CP019_RESOURCE_ABORT'):h.resources()
  point=h.RESOURCE_LAST_SAMPLE;self.assertEqual(point['firstViolation'],'ADMISSION_CPU_LIMIT');self.assertEqual(point['host']['cpuBusyPercent'],81);self.assertEqual(point['thresholds']['cpuBusyUpperExclusive'],80);self.assertEqual(point['intervalSeconds'],2);self.assertEqual(point['host']['cpuCountersDelta'],[81,0,0,19,0,0,0,0]);self.assertEqual(h.RESOURCE_FIRST_REJECTED_SAMPLE['guardCode'],'CP019_RESOURCE_ABORT')
 def test_counter_reset_captures_unknown_and_cannot_be_reported_as_low_load(self):
  values=iter(['cpu 100 100 100 100 100 100 100 100\n','cpu 0 0 0 0 0 0 0 0\n'])
  def read(p):return 'MemAvailable: 8388608 kB\n' if p.as_posix()=='/proc/meminfo' else next(values)
  disk=types.SimpleNamespace(f_bavail=20*1024**3,f_frsize=1,f_blocks=100*1024**3)
  with patch.object(h.pathlib.Path,'read_text',read),patch.object(h.os,'statvfs',return_value=disk,create=True),patch.object(h.time,'sleep'),patch.object(h.time,'monotonic',side_effect=[10,12]):
   with self.assertRaisesRegex(AssertionError,'CP019_RESOURCE_SAMPLE_UNKNOWN'):h.resources()
  self.assertIsNone(h.RESOURCE_LAST_SAMPLE['host']['cpuBusyPercent']);self.assertEqual(h.RESOURCE_FIRST_REJECTED_SAMPLE['specificReason'],'ADMISSION_CPU_SAMPLE_UNKNOWN')
 def test_sync_success_preserves_original_admission_boundaries(self):
  for busy,available,expected in [(79,5120,True),(80,5120,False),(79,5119,False)]:
   values=iter(['cpu 0 0 0 0 0 0 0 0\n','cpu '+str(busy)+' 0 0 '+str(100-busy)+' 0 0 0 0\n'])
   def read(p):return 'MemAvailable: '+str(available*1024)+' kB\n' if p.as_posix()=='/proc/meminfo' else next(values)
   disk=types.SimpleNamespace(f_bavail=20*1024**3,f_frsize=1,f_blocks=100*1024**3)
   with self.subTest(busy=busy,available=available),patch.object(h.pathlib.Path,'read_text',read),patch.object(h.os,'statvfs',return_value=disk,create=True),patch.object(h.time,'sleep'),patch.object(h.time,'monotonic',side_effect=[10,12]):
    if expected:self.assertEqual(h.resources()['cpuBusyPercent'],busy)
    else:
     with self.assertRaisesRegex(AssertionError,'CP019_RESOURCE_ABORT'):h.resources()

class R03NetworkPreflight(unittest.TestCase):
 def test_new_ranges_reject_overlap_while_old_keep_network_is_preserved(self):
  for subnet,expected in [('10.77.61.0/24','PASS'),('10.77.62.0/24','PASS'),('10.77.63.0/24','PASS'),('10.77.64.0/24','FAIL'),('10.77.65.128/25','FAIL'),('10.77.66.0/25','FAIL'),('10.77.66.128/25','FAIL')]:
   nets=[{'Name':'mecanet-qa-p1l3-r02-data','IPAM':{'Config':[{'Subnet':subnet}]}}];calls=[]
   def run(*args):
    calls.append(args)
    if args[:3]==('docker','network','ls'):return 'old-network'
    if args[:3]==('docker','network','inspect'):return json.dumps(nets)
    if args[:3]==('docker','image','inspect'):return 'arm64'
    raise AssertionError('UNEXPECTED_EFFECT')
   with self.subTest(subnet=subnet),patch.object(h.os,'geteuid',return_value=0,create=True),patch.object(h.os,'uname',return_value=types.SimpleNamespace(machine='aarch64'),create=True),patch.object(pathlib.Path,'resolve',lambda p:p),patch.object(pathlib.Path,'exists',return_value=False),patch.object(h,'tls_preflight',return_value={}),patch.object(h,'facts',return_value=[]),patch.object(h,'resources',return_value={}),patch.object(h,'run',side_effect=run):
    if expected=='PASS':self.assertEqual(h.preflight()['result'],'PASS')
    else:
     with self.assertRaisesRegex(AssertionError,'NETWORK_CONFLICT'):h.preflight()
   self.assertFalse(any('create' in args or 'start' in args or 'stop' in args for args in calls))

class SourceCreatedCustody(unittest.TestCase):
 def test_reference_exact_cid_owner_pin_and_state_are_required(self):
  c=row('postgres',id='a'*64,running=False,status='created',pid=0);ref=h.source_service_reference(c);self.assertEqual(ref['state'],'BEFORE_START');bridge=Mock()
  for change in [{},{'containerId':'b'*64},{'ownerId':'alien'},{'imageRef':'postgres:latest'},{'state':'RUNNING'},{'extra':True}]:
   bridge.read400.return_value=({**ref,**change},'c'*64)
   with self.subTest(change=change),patch.object(h,'target_bridge',return_value=bridge):
    if not change:self.assertEqual(h.read_source_service_reference(c),ref)
    else:
     with self.assertRaisesRegex(AssertionError,'SOURCE_CREATED_REFERENCE_CHANGED'):h.read_source_service_reference(c)
 def test_pg_canary_requires_original_reference_then_restarts_exact_cid(self):
  c=row('postgres',id='a'*64,running=False,status='exited',pid=0,exitCode=0,finishedAt='2026-10-15T00:00:00Z');bridge=Mock();events=[]
  with patch.object(h,'own'),patch.object(h,'preserve'),patch.object(h,'set_host_case'),patch.object(h,'facts',return_value=[c]),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'target_bridge',return_value=bridge),patch.object(h,'read_host_private',return_value=({'resource':{'same':True}},'x')),patch.object(h,'start_source_service',side_effect=lambda *args,**kw:events.append((args,kw))),patch.object(h,'wait_pg_ready'),patch.object(h,'source_resource',return_value={'resource':{'same':True}}):
   self.assertEqual(h.source_pg_canary_start()['containerId'],c['id'])
  self.assertEqual(events,[((c,OWNERS),{'restart':True})]);bridge.verify_copy_completed.assert_called_once()
 def test_all_selected_cids_are_custodied_before_first_start(self):
  names=['api1','api2','web'];rows=[row(n,id=str(i+1)*64,running=False,status='created',pid=0) for i,n in enumerate(names)];events=[];spec={'services':{n:{} for n in names}}
  def compose(root,*args):
   events.append(('COMPOSE',args));return next(c['id'] for c in rows if c['service']==args[-1]) if args[0]=='ps' else ''
  with patch.object(h,'source_compose_spec',return_value=spec),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'facts',return_value=[]),patch.object(h,'compose',side_effect=compose),patch.object(h,'inspect_container',side_effect=lambda cid:next(c for c in rows if c['id']==cid)),patch.object(h,'validate_source_service_boundary',return_value=True),patch.object(h,'publish_source_service_reference',side_effect=lambda c:events.append(('ROOT_REF_FSYNC',c['id']))),patch.object(h,'run',side_effect=AssertionError('PREMATURE_START')):
   created,owners=h.prepare_source_services(names)
  self.assertEqual(created,rows);self.assertEqual(owners,OWNERS);self.assertEqual([c for c in events if c[0]=='ROOT_REF_FSYNC'],[('ROOT_REF_FSYNC',c['id']) for c in rows]);self.assertEqual(events[0][1],('create','--no-build','--pull','never','--no-recreate',*names));self.assertFalse(any('up' in c[1] or 'start' in c[1] for c in events))
 def test_mount_rejection_preserves_created_cid_reference_without_start(self):
  c=row('postgres',id='a'*64,running=False,status='created',pid=0,startedAt='0001-01-01T00:00:00Z');events=[]
  def compose(root,*args):return c['id'] if args[0]=='ps' else ''
  with patch.object(h,'source_compose_spec',return_value={'services':{'postgres':{}}}),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'facts',return_value=[]),patch.object(h,'compose',side_effect=compose),patch.object(h,'inspect_container',return_value=c),patch.object(h,'publish_source_service_reference',side_effect=lambda _:events.append('ROOT_REF_FSYNC')),patch.object(h,'validate_source_service_boundary',side_effect=lambda *_:events.append('MOUNTS_FAIL') or (_ for _ in ()).throw(AssertionError('SOURCE_CREATED_MOUNT'))),patch.object(h,'run') as run:
   with self.assertRaisesRegex(AssertionError,'SOURCE_CREATED_MOUNT'):h.prepare_source_services(['postgres'])
  self.assertEqual(events,['ROOT_REF_FSYNC','MOUNTS_FAIL']);run.assert_not_called()
 def test_source_create_rejects_previous_start_before_custody_or_start(self):
  c=row('postgres',id='a'*64,running=False,status='created',pid=0,startedAt='2026-10-15T00:00:00Z')
  with patch.object(h,'source_compose_spec',return_value={'services':{'postgres':{}}}),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'facts',return_value=[]),patch.object(h,'compose',side_effect=lambda root,*args:c['id'] if args[0]=='ps' else ''),patch.object(h,'inspect_container',return_value=c),patch.object(h,'publish_source_service_reference') as receipt,patch.object(h,'validate_source_service_boundary') as boundary,patch.object(h,'run') as run:
   with self.assertRaisesRegex(AssertionError,'SOURCE_CREATED_IDENTITY'):h.prepare_source_services(['postgres'])
  receipt.assert_not_called();boundary.assert_not_called();run.assert_not_called()
 def test_worker_reuse_needs_original_root_reference_and_never_restarts(self):
  worker=row('worker',id='a'*64,running=True,status='running',pid=23)
  with patch.object(h,'source_compose_spec',return_value={'services':{'worker':{}}}),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'facts',return_value=[worker]),patch.object(h,'read_source_service_reference',return_value={}) as read,patch.object(h,'validate_source_service_boundary',return_value=True),patch.object(h,'compose') as compose:
   self.assertEqual(h.prepare_source_services(['worker']),([],OWNERS));read.assert_called_once_with(worker);compose.assert_not_called()
  with patch.object(h,'source_compose_spec',return_value={'services':{'worker':{}}}),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'facts',return_value=[worker]),patch.object(h,'read_source_service_reference',side_effect=AssertionError('ROOT_MISSING')),patch.object(h,'compose') as compose,self.assertRaisesRegex(AssertionError,'ROOT_MISSING'):h.prepare_source_services(['worker'])
  compose.assert_not_called()
 def test_mount_network_or_public_port_mismatch_rejects_before_start(self):
  spec={'volumes':[(h.ROOT/'data').as_posix()+':/var/lib/postgresql:rw'],'networks':{'data':{'ipv4_address':'10.77.64.2'}}};actual={'mounts':[{'Type':'bind','Source':(h.ROOT/'data').as_posix(),'Destination':'/var/lib/postgresql','RW':True}],'networks':{h.ROOT.name+'-data':{'IPAddress':'','IPAMConfig':{'IPv4Address':'10.77.64.2'}}},'ports':{},'tmpfs':{}}
  net={'name':h.ROOT.name+'-data','internal':True,'ipam':[{'Subnet':'10.77.64.0/24'}]}
  for change in ['none','source','rw','network','ip','public','subnet','tmpfs']:
   current=copy.deepcopy(actual);definition=copy.deepcopy(net)
   if change=='source':current['mounts'][0]['Source']=str(h.TARGET/'data')
   if change=='rw':current['mounts'][0]['RW']=False
   if change=='network':current['networks']['coolify']={}
   if change=='ip':current['networks'][h.ROOT.name+'-data']['IPAMConfig']['IPv4Address']='10.77.66.2'
   if change=='public':current['ports']={'5432/tcp':[{'HostPort':'5432'}]}
   if change=='subnet':definition['ipam'][0]['Subnet']='10.77.66.0/25'
   if change=='tmpfs':current['mounts'].append({'Type':'tmpfs','Destination':'/run/qa-secrets'})
   with self.subTest(change=change),patch.object(pathlib.Path,'resolve',lambda p:p),patch.object(h,'run',side_effect=[json.dumps(current),json.dumps(definition)]) as run:
    if change=='none':self.assertTrue(h.validate_source_service_boundary('a'*64,spec))
    else:
     with self.assertRaises(AssertionError):h.validate_source_service_boundary('a'*64,spec)
    self.assertFalse(any('start' in c.args for c in run.call_args_list))
 def test_created_reference_and_budget_precede_exact_start_and_no_label_adoption(self):
  c=row('postgres',id='a'*64,running=False,pid=0,status='created');events=[]
  with patch.object(h,'read_source_service_reference',side_effect=lambda *_:events.append('ROOT_REF') or {},create=True),patch.object(h,'validate_source_service_boundary',side_effect=lambda *_:events.append('MOUNTS') or True,create=True),patch.object(h,'source_compose_spec',return_value={'services':{'postgres':{}}},create=True),patch.object(h,'guard_effect',side_effect=lambda *_:events.append('GUARD')),patch.object(h,'inspect_container',return_value=dict(c)),patch.object(h,'assert_case_budget',side_effect=lambda:events.append('BUDGET')),patch.object(h,'run',side_effect=lambda *args:events.append(args)):
   h.start_source_service(c,OWNERS)
  self.assertEqual(events,['ROOT_REF','MOUNTS','GUARD','BUDGET',('docker','start','a'*64)])
  with patch.object(h,'read_source_service_reference',side_effect=AssertionError('ROOT_REF_MISSING'),create=True),patch.object(h,'run') as run,self.assertRaisesRegex(AssertionError,'ROOT_REF_MISSING'):h.start_source_service(c,OWNERS)
  run.assert_not_called()
 def test_replaced_cid_or_expired_case_never_starts(self):
  c=row('worker',id='a'*64,running=False,pid=0,status='created')
  for changed,budget in [({**c,'id':'b'*64},None),(dict(c),AssertionError('CP019_BUDGET_ABORT'))]:
   with patch.object(h,'read_source_service_reference',return_value={},create=True),patch.object(h,'source_compose_spec',return_value={'services':{'worker':{}}},create=True),patch.object(h,'validate_source_service_boundary',return_value=True,create=True),patch.object(h,'guard_effect'),patch.object(h,'inspect_container',return_value=changed),patch.object(h,'assert_case_budget',side_effect=budget),patch.object(h,'run') as run,self.assertRaises(AssertionError):h.start_source_service(c,OWNERS)
   run.assert_not_called()
 def test_compose_rechecks_case_after_slow_resource_guard(self):
  state,sha=RemainingBudget.model(self);clock=[144]
  with patch.object(h,'BUDGET_PLAN_SHA',sha),patch.object(h,'HOST_CASE','source-runtime-start'),patch.object(h,'read_budget_snapshot',return_value=state,create=True),patch.object(h,'uptime',side_effect=lambda:clock[0]),patch.object(h,'own'),patch.object(h,'guard_effect',side_effect=lambda *_:clock.__setitem__(0,146)),patch.object(h,'run') as run:
   with self.assertRaisesRegex(AssertionError,'BUDGET_ABORT'):h.compose(h.ROOT,'up','--no-deps','worker')
  run.assert_not_called()

class CreatedTmpfsRegression(unittest.TestCase):
 def test_source_create_is_limited_to_original_three_service_selections(self):
  for names in [['postgres'],['worker'],['api1','api2','web'],['api1'],['web','api2','api1'],['api1','api2','worker','web']]:
   rows=[row(n,id=str(i+1)*64,running=False,status='created',pid=0) for i,n in enumerate(names)];calls=[]
   def compose(root,*args):calls.append(args);return next(c['id'] for c in rows if c['service']==args[-1]) if args[0]=='ps' else ''
   with self.subTest(names=names),patch.object(h,'source_compose_spec',return_value={'services':{n:{} for n in names}}),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'facts',return_value=[]),patch.object(h,'compose',side_effect=compose),patch.object(h,'inspect_container',side_effect=lambda cid:next(c for c in rows if c['id']==cid)),patch.object(h,'validate_source_service_boundary',return_value=True),patch.object(h,'publish_source_service_reference'):
    if names in [['postgres'],['worker'],['api1','api2','web']]:
     self.assertEqual(h.prepare_source_services(names)[0],rows);self.assertEqual(calls[0],('create','--no-build','--pull','never','--no-recreate',*names))
    else:
     with self.assertRaisesRegex(AssertionError,'SOURCE_CREATE_SELECTION'):h.prepare_source_services(names)
     self.assertEqual(calls,[])
 def sample(self):
  # Copy of historical r02 CREATED shape translated to the r03 model only.
  # No r03 physical observation; the network definition below is a pure
  # model of the separate inspect, not a new physical network observation.
  raw=(pathlib.Path(__file__).parents[3]/'docs/evidence/cp021/mount-readonly.json').read_text();evidence=json.loads(raw.replace('mecanet-qa-p1l3-r02','mecanet-qa-p1l3-r03').replace('10.77.61.','10.77.64.'));actual={k:copy.deepcopy(evidence['actual'][k]) for k in ['mounts','tmpfs','ports','networks']};definition={'name':h.ROOT.name+'-data','internal':True,'ipam':[{'Subnet':'10.77.64.0/24'}]}
  return copy.deepcopy(evidence['expected']),actual,definition
 def validate(self,spec,actual,definition):
  with patch.object(pathlib.Path,'resolve',lambda p:p),patch.object(h,'run',side_effect=[json.dumps(actual),json.dumps(definition)]) as run:
   result=h.validate_source_service_boundary('a'*64,spec)
   self.assertIn('.HostConfig.Tmpfs',run.call_args_list[0].args[3]);self.assertFalse(any('start' in c.args for c in run.call_args_list));return result
 def test_actual_created_readout_uses_hostconfig_without_runtime_tmpfs_mounts(self):
  spec,actual,definition=self.sample();self.assertFalse(any(x['Type']=='tmpfs' for x in actual['mounts']));self.assertTrue(self.validate(spec,actual,definition))
 def test_extra_missing_or_changed_tmpfs_destinations_and_options_are_rejected(self):
  for change in ['extra','missing','missing-key','wrong-size','wrong-mode','wrong-uid','wrong-gid','root','anonymous','extra-bind','bad-bind-root','bad-bind-traversal','ports']:
   spec,actual,definition=self.sample()
   if change=='extra':actual['tmpfs']['/run/qa-secrets']='size=16m'
   if change=='missing':actual['tmpfs'].pop('/tmp')
   if change=='missing-key':actual.pop('tmpfs')
   if change=='wrong-size':actual['tmpfs']['/tmp']='size=64m'
   if change=='wrong-mode':actual['tmpfs']['/var/run/postgresql']='size=8m,mode=0777,uid=999,gid=999'
   if change=='wrong-uid':actual['tmpfs']['/var/run/postgresql']='size=8m,mode=0770,uid=0,gid=999'
   if change=='wrong-gid':actual['tmpfs']['/var/run/postgresql']='size=8m,mode=0770,uid=999,gid=0'
   if change=='root':actual['tmpfs']['/']='size=16m'
   if change=='anonymous':actual['mounts'].append({'Type':'volume','Destination':'/var/lib/hidden','Source':'anonymous','RW':True})
   if change=='extra-bind':actual['mounts'].append({'Type':'bind','Destination':'/root','Source':'/root','RW':True})
   if change=='bad-bind-root':spec['volumes'][0]='/opt/foreign/data:/var/lib/postgresql:rw'
   if change=='bad-bind-traversal':spec['volumes'][0]='/opt/mecanet-qa-p1l3-r03/../foreign/data:/var/lib/postgresql:rw'
   if change=='ports':actual['ports']={'5432/tcp':[{'HostPort':'5432'}]}
   with self.subTest(change=change),self.assertRaises(AssertionError):self.validate(spec,actual,definition)
 def test_spec_tmpfs_duplicates_malformed_paths_and_root_targets_are_rejected(self):
  for tmpfs in [['/tmp:size=16m','/tmp:size=16m'],['/tmp'],['/:size=16m'],['/tmp/../root:size=16m'],['tmp:size=16m'],['/run/qa-secrets:size=16m'],['/tmp:'],['/tmp:size=16m\x00']]:
   spec,actual,definition=self.sample();spec['tmpfs']=tmpfs
   # A matching bad hostconfig map cannot authorize an unsafe fixture plan.
   actual['tmpfs']={value.partition(':')[0]:value.partition(':')[2] for value in tmpfs}
   with self.subTest(tmpfs=tmpfs),self.assertRaises(AssertionError):self.validate(spec,actual,definition)
 def test_planned_runtime_tmpfs_mount_rows_are_optional_but_extra_rows_are_denied(self):
  spec,actual,definition=self.sample();actual['mounts'].append({'Type':'tmpfs','Destination':'/tmp','RW':True});self.assertTrue(self.validate(spec,actual,definition))
  actual['mounts'].append({'Type':'tmpfs','Destination':'/run/qa-secrets','RW':True})
  with self.assertRaises(AssertionError):self.validate(spec,actual,definition)
 def test_optional_tmpfs_mount_rows_require_literal_rw_true_and_unique_destinations(self):
  for change in [False,1,0,'true',None,'duplicate']:
   spec,actual,definition=self.sample();actual['mounts'].append({'Type':'tmpfs','Destination':'/tmp','RW':True if change=='duplicate' else change})
   if change=='duplicate':actual['mounts'].append({'Type':'tmpfs','Destination':'/tmp','RW':True})
   with self.subTest(change=change),self.assertRaises(AssertionError):self.validate(spec,actual,definition)

class SourceCleanupCustody(unittest.TestCase):
 def cleanup_model(self,c,reference_effect):
  calls=[]
  with patch.object(h,'own'),patch.object(h,'expected_owners',return_value=OWNERS),patch.object(h,'facts',side_effect=[[c],[{**c,'running':False}]]),patch.object(h,'preserve',return_value={'result':'PASS'}),patch.object(h,'inspect_container',return_value=dict(c)),patch.object(h,'read_source_service_reference',side_effect=reference_effect) as refs,patch.object(h,'run',side_effect=lambda *args:calls.append(args)),patch.object(h,'assert_case_budget',side_effect=AssertionError('EXPIRED')) as clock,patch.object(h,'ledger_charge',side_effect=AssertionError('QUOTA')) as quota:
   result=h.cleanup()
  clock.assert_not_called();quota.assert_not_called();return result,calls,refs.call_count
 def test_matching_labels_without_root_cid_reference_are_retained(self):
  c=row('postgres',id='a'*64);result,calls,count=self.cleanup_model(c,AssertionError('SOURCE_ROOT_REF_MISSING'))
  self.assertEqual(calls,[]);self.assertEqual(result['result'],'FAIL');self.assertEqual(result['unknownContainers'],[c['id']]);self.assertEqual(count,1)
 def test_exact_source_cid_requires_root_reference_again_before_stop_without_budget(self):
  c=row('api1',id='a'*64);result,calls,count=self.cleanup_model(c,[{},{}]);self.assertEqual(result['result'],'PASS');self.assertEqual(calls,[('docker','stop','--time','30',c['id'])]);self.assertEqual(count,2)
 def test_reference_removed_after_classification_cannot_authorize_stop(self):
  c=row('worker',id='a'*64);result,calls,count=self.cleanup_model(c,[{},AssertionError('SOURCE_ROOT_REF_REMOVED')]);self.assertEqual(calls,[]);self.assertEqual(result['result'],'FAIL');self.assertEqual(count,2)
 def test_source_job_requires_exact_root_created_uuid_owner_pin_and_command_hash(self):
  job_id='44444444-4444-4444-8444-444444444444';c=row('harness',id='a'*64,jobId=job_id);receipt={'schema':'controller-job-created-v1','jobId':job_id,'containerId':c['id'],'project':h.ROOT.name,'service':'harness','ownerId':c['ownerId'],'imageDigest':c['imageRef'].split('@',1)[1],'commandHash':'b'*64,'state':'CREATED BEFORE START/SQL','createdAt':'2026-10-15T00:00:00Z'};bridge=Mock()
  for change in [{},{'containerId':'c'*64},{'ownerId':'alien'},{'imageDigest':'sha256:'+'f'*64},{'commandHash':'not-hash'},{'state':'RUNNING'},{'extra':True}]:
   bridge.read400.return_value=({**receipt,**change},'d'*64)
   with self.subTest(change=change),patch.object(h,'target_bridge',return_value=bridge):
    if not change:self.assertTrue(h.verify_source_references([c]))
    else:
     with self.assertRaises(AssertionError):h.verify_source_references([c])
  self.assertEqual(bridge.read400.call_args.args,(h.ROOT/'evidence/jobs'/(job_id+'-created.json'),0))

class AtomicBudgetReader(unittest.TestCase):
 def meta(self,inode=1,**changes):return types.SimpleNamespace(st_dev=1,st_ino=inode,st_mode=0o100600,st_uid=999,st_nlink=1,st_size=14,st_mtime_ns=1,st_ctime_ns=1,**changes)
 def read_model(self,named,opened,raws):
  from contextlib import ExitStack
  with tempfile.TemporaryDirectory() as tmp,ExitStack() as stack:
   root=pathlib.Path(tmp).resolve();(root/'budget').mkdir();p=root/'budget/ledger.json';p.write_bytes(b'{"sequence":1}')
   original=pathlib.Path.lstat;names=iter(named);streams=iter(raws)
   stack.enter_context(patch.object(h,'ROOT',root));stack.enter_context(patch.object(pathlib.Path,'lstat',lambda path,*a,**kw:next(names) if path==p else original(path,*a,**kw)));stack.enter_context(patch.object(h.os,'fstat',side_effect=opened));stack.enter_context(patch.object(h.os,'fdopen',side_effect=lambda *a,**kw:io.BytesIO(next(streams))));stack.enter_context(patch.object(h.os,'close'))
   opened_mock=stack.enter_context(patch.object(h.os,'open',return_value=123));return h.read_budget_snapshot(),opened_mock.call_count
 def test_replace_retries_the_whole_file_and_never_accepts_unlinked_fd(self):
  a=self.meta();b=self.meta(2);unlinked=self.meta();unlinked.st_nlink=0
  state,count=self.read_model([a,b,b,b],[a,unlinked,b,b],[b'{"sequence":1}',b'{"sequence":2}']);self.assertEqual(state,{'sequence':2});self.assertEqual(count,2)
 def test_wrong_uid_mode_link_and_same_inode_drift_are_denied(self):
  for field,value in [('st_uid',0),('st_mode',0o100644),('st_nlink',2)]:
   bad=self.meta();setattr(bad,field,value)
   with self.subTest(field=field),self.assertRaisesRegex(AssertionError,'BUDGET_LEDGER_PRIVATE'):self.read_model([bad],[],[])
  a=self.meta();changed=self.meta();changed.st_ctime_ns=2
  with self.assertRaisesRegex(AssertionError,'BUDGET_LEDGER_CHANGED'):self.read_model([a,a],[a,changed],[b'{"sequence":1}'])
 def test_replace_contention_is_bounded_without_lock_or_reset(self):
  named=[];opened=[]
  for i in range(3):named.extend([self.meta(i+1),self.meta(i+2)]);opened.extend([self.meta(i+1),self.meta(i+1)])
  with self.assertRaisesRegex(AssertionError,'BUDGET_LEDGER_REPLACE_BUSY'):self.read_model(named,opened,[b'{"sequence":1}']*3)

if __name__=='__main__':unittest.main()
