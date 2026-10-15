"""Passive resource guard models. No Docker, PostgreSQL, SSH or physical PASS."""
import copy, importlib.util, json, pathlib, tempfile, threading, time, types, unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('resource_monitor',pathlib.Path(__file__).with_name('resource-monitor.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
HEADER='sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode'
CID='a'*64;OTHER='b'*64;OWNER='00000000-0000-4000-8000-000000000001'
PROFILES={'postgres':(350000000,640*1024**2,'postgres@sha256:'+'c'*64),'probe':(50000000,128*1024**2,'node@sha256:'+'d'*64),'api1':(200000000,320*1024**2,'node@sha256:'+'d'*64)}
def fact(service='postgres',**changes):
 cpu,mem,image=PROFILES[service]
 return dict(id=CID,project='source',service=service,ownerId=OWNER,imageRef=image,nanoCpus=cpu,memory=mem,running=True,status='running',pid=123,oomKilled=False,jobId=None,**changes)
def ref(f):return {**{k:f[k] for k in ['project','service','ownerId','imageRef','nanoCpus','memory']},'containerId':f['id']}
def monitor():
 h=types.SimpleNamespace(ROOT=pathlib.Path('/model/source'),TARGET=pathlib.Path('/model/target'),PROFILES=PROFILES,FACTS_FORMAT='{}')
 with patch.object(m,'read_root_json',return_value={'consumers':[]}):v=m.ResourceMonitor(h,raw_run=lambda *args:'')
 return v
class PassiveModels(unittest.TestCase):
 def test_import_and_constructor_never_launch_processes(self):
  with patch.object(m.subprocess,'check_output',side_effect=AssertionError('PROCESS_FORBIDDEN')):
   v=monitor();self.assertFalse(v.abortFlag.is_set());self.assertEqual(v.summary()['samples'],0)
 def test_positive_observation_uses_exact_cid_reference_and_profiles(self):
  v=monitor();f=fact()
  with patch.object(v,'reference_for',return_value=ref(f)),patch.object(v,'pg_tcp_count',return_value=60):v.observe([f],3072,16*1024**3,100*1024**3,89.99)
  self.assertFalse(v.abortFlag.is_set());self.assertEqual(v.summary()['maxPostgresTcpConnections'],60)
 def test_cpu_memory_and_disk_boundaries_abort_without_cleanup(self):
  for values,code in [((3072,16*1024**3,100*1024**3,90),'RESOURCE_CPU_LIMIT'),((3071,16*1024**3,100*1024**3,0),'RESOURCE_MEMORY_LIMIT'),((3072,15*1024**3,100*1024**3,0),'RESOURCE_DISK_LIMIT'),((3072,19*1024**3,200*1024**3,0),'RESOURCE_DISK_LIMIT')]:
   v=monitor();v.observe([], *values);self.assertEqual(v.summary()['error'],code);self.assertTrue(v.abortFlag.is_set())
 def test_summary_preserves_numeric_observation_that_trips_resource_limit(self):
  for available,free,busy,code in [(4096,16*1024**3,94.5,'RESOURCE_CPU_LIMIT'),(3071,16*1024**3,22,'RESOURCE_MEMORY_LIMIT'),(4096,15*1024**3,22,'RESOURCE_DISK_LIMIT')]:
   v=monitor();v.observe([],5000,20*1024**3,100*1024**3,62.626)
   v.observe([],available,free,100*1024**3,busy);out=v.summary()
   with self.subTest(code=code):
    self.assertEqual(out['error'],code);self.assertTrue(out['failed']);self.assertEqual(out['maxHostCpuBusyPercent'],round(max(62.626,busy),3));self.assertEqual(out['minimumAvailableMiB'],min(5000,available));self.assertEqual(out['minimumDiskFreeBytes'],min(20*1024**3,free));self.assertEqual(out['cpuSamples'],2)
    with self.assertRaisesRegex(AssertionError,code):v.check()
    v.observe([],6000,30*1024**3,100*1024**3,1)
    self.assertEqual(v.summary()['error'],code);self.assertTrue(v.summary()['failed']);self.assertEqual(v.summary()['maxHostCpuBusyPercent'],out['maxHostCpuBusyPercent']);self.assertEqual(v.summary()['minimumAvailableMiB'],out['minimumAvailableMiB']);self.assertEqual(v.summary()['minimumDiskFreeBytes'],out['minimumDiskFreeBytes'])
 def test_invalid_resource_values_are_not_reported_as_numeric_measurements(self):
  for available,free,busy in [('SENTINEL',16*1024**3,1),(4000,'SENTINEL',1),(4000,16*1024**3,float('nan')),(4000,16*1024**3,float('inf'))]:
   v=monitor();v.observe([],available,free,100*1024**3,busy);out=v.summary()
   self.assertTrue(out['failed']);self.assertNotIn('SENTINEL',json.dumps(out));self.assertNotIn('NaN',json.dumps(out));self.assertNotIn('Infinity',json.dumps(out))
 def test_first_rejected_sample_preserves_exact_context_and_is_not_replaced(self):
  v=monitor();context={'observed_at':'2026-10-15T15:18:02.000000Z','monotonic_seconds':12,'interval_seconds':2,'cpu_before':[0]*8,'cpu_after':[94,0,0,6,0,0,0,0],'own_usage':{'available':True,'controllerProcessCpuSeconds':.25}}
  v.observe([],8400,20*1024**3,100*1024**3,94,context=context);summary=v.summary();rejected=summary['firstFailureSample']
  self.assertEqual(rejected['reason'],'RESOURCE_CPU_LIMIT');self.assertEqual(rejected['sample']['host']['cpuBusyPercent'],94);self.assertEqual(rejected['sample']['thresholds']['cpuBusyUpperExclusive'],90);self.assertEqual(rejected['sample']['intervalSeconds'],2);self.assertEqual(rejected['sample']['observedAt'],context['observed_at']);self.assertEqual(rejected['sample']['ownUsage']['controllerProcessCpuSeconds'],.25)
  v.observe([],8400,20*1024**3,100*1024**3,1);self.assertEqual(v.summary()['firstFailureSample'],rejected);self.assertEqual(v.summary()['lastSample']['host']['cpuBusyPercent'],1)
  summary['firstFailureSample']['reason']='MUTATED';self.assertEqual(v.summary()['firstFailureSample']['reason'],'RESOURCE_CPU_LIMIT')
 def test_failure_without_numeric_sample_explicitly_preserves_unknown(self):
  v=monitor();v.fail('RESOURCE_SAMPLE_UNVERIFIED');out=v.summary()['firstFailureSample'];self.assertEqual(out['reason'],'RESOURCE_SAMPLE_UNVERIFIED');self.assertIsNone(out['sample']);self.assertEqual(out['sampleStatus'],'UNAVAILABLE')
 def test_running_unknown_cannot_be_adopted_by_labels(self):
  v=monitor()
  with patch.object(v,'reference_for',return_value=None):v.observe([fact()],4000,16*1024**3,100*1024**3,0)
  self.assertEqual(v.summary()['error'],'RESOURCE_OWN_REFERENCE_REQUIRED')
 def test_unknown_created_stopped_is_not_enrolled_or_used_as_fin(self):
  v=monitor();f=fact();f.update(running=False,status='created',pid=0)
  with patch.object(v,'reference_for',side_effect=AssertionError('NO_COLD_REF_READ')):v.observe([f],4000,16*1024**3,100*1024**3,0)
  self.assertFalse(v.abortFlag.is_set());self.assertEqual(v.summary()['observedOwnCids'],0)
 def test_reference_owner_pin_profile_or_cid_mutation_aborts(self):
  for key,value in [('ownerId','other'),('imageRef','postgres:latest'),('nanoCpus',1),('memory',1),('containerId',OTHER)]:
   v=monitor();f=fact();r=ref(f);r[key]=value
   with patch.object(v,'reference_for',return_value=r):v.observe([f],4000,16*1024**3,100*1024**3,0)
   self.assertEqual(v.summary()['error'],'RESOURCE_OWN_REFERENCE_CHANGED')
 def test_foreign_preflight_records_are_compared_without_oom_projection(self):
  v=monitor();foreign={'id':OTHER,'project':'foreign','running':True,'pid':44};v.foreign=[foreign]
  v.observe([{**foreign,'oomKilled':False}],4000,16*1024**3,100*1024**3,0);self.assertFalse(v.abortFlag.is_set())
  v.observe([{**foreign,'pid':45,'oomKilled':False}],4000,16*1024**3,100*1024**3,0);self.assertEqual(v.summary()['error'],'RESOURCE_FOREIGN_CHANGED')
 def test_multiple_postgres_and_tcp_overflow_fail_closed(self):
  for fs,tcp,code in [([fact(),dict(fact(),id=OTHER,project='target')],0,'RESOURCE_MULTIPLE_POSTGRES'),([fact()],61,'RESOURCE_POSTGRES_TCP_LIMIT')]:
   v=monitor()
   with patch.object(v,'reference_for',side_effect=lambda f:ref(f)),patch.object(v,'pg_tcp_count',return_value=tcp):v.observe(fs,4000,16*1024**3,100*1024**3,0)
   self.assertEqual(v.summary()['error'],code);point=v.summary()['firstFailureSample']['sample']
   if code=='RESOURCE_MULTIPLE_POSTGRES':self.assertEqual(point['ownConfigured']['postgresCount'],2);self.assertEqual(point['thresholds']['postgresUpperInclusive'],1)
   else:self.assertEqual(point['ownMeasured']['postgresTcpEstablished'],61);self.assertEqual(point['thresholds']['postgresTcpUpperInclusive'],60)
 def test_stopped_oom_is_detected_only_after_exact_reference_verification(self):
  v=monitor();f=fact();f.update(running=False,status='exited',pid=0,oomKilled=True)
  with patch.object(v,'reference_for',return_value=ref(f)):v.observe([f],4000,16*1024**3,100*1024**3,0)
  self.assertEqual(v.summary()['error'],'RESOURCE_OWN_OOM_KILLED')
 def test_unknown_reader_error_does_not_echo_exception(self):
  v=monitor()
  with patch.object(m,'usage_seconds',return_value=0),patch.object(v,'sample',side_effect=RuntimeError('SENTINEL_SECRET')):v._sample_once()
  s=v.stop();self.assertEqual(s['status'],'FAIL');self.assertNotIn('SENTINEL',json.dumps(s));self.assertEqual(s['error'],'RESOURCE_SAMPLE_UNVERIFIED')
 def test_failure_is_irreversible_and_check_blocks_next_effect(self):
  v=monitor();v.fail('RESOURCE_CPU_LIMIT');v.observe([],4000,16*1024**3,100*1024**3,0)
  with self.assertRaisesRegex(AssertionError,'RESOURCE_CPU_LIMIT'):v.check()
  self.assertEqual(v.stop()['status'],'FAIL')
 def test_start_stop_is_passive_daemon_and_no_poll_artifacts_or_sql(self):
  v=monitor()
  with patch.object(v,'sample',return_value={'cpu':0}),patch.object(v,'_sample_once',side_effect=lambda:v._record_sample(.001,.0002)):
   v._cpu_samples=1;v.start();self.assertTrue(v._thread.daemon);time.sleep(.02);s=v.stop()
  self.assertEqual(s['status'],'PASS');self.assertGreaterEqual(s['samples'],1);self.assertEqual(s['artifactsPerPoll'],0);self.assertEqual(s['sqlPerPoll'],0)
 def test_stop_join_timeout_and_empty_monitor_cannot_pass(self):
  v=monitor();self.assertEqual(v.stop()['status'],'FAIL')
  v=monitor();v._thread=types.SimpleNamespace(join=lambda timeout:None,is_alive=lambda:True);self.assertEqual(v.stop()['error'],'RESOURCE_MONITOR_STOP_UNVERIFIED')
 def test_stat_parser_and_tcp_count_ignore_client_sockets_and_non_established(self):
  line=' 0: 0200007F:1538 0300007F:A123 01 0:0 0:0 0 999 0 11 1'
  client=' 1: 0200007F:A123 0300007F:1538 01 0:0 0:0 0 999 0 12 1'
  listen=line.replace(' 01 ',' 0A ')
  self.assertEqual(m.parse_tcp(HEADER+'\n'+line+'\n'+client+'\n'+listen),{11})
  self.assertEqual(m.parse_tcp(HEADER+'\n'+line+'\n'+line),{11})
  with self.assertRaises(AssertionError):m.parse_tcp('header\nnot a socket')
 def test_tcp_pid_reuse_or_missing_proc_fails_closed(self):
  v=monitor()
  with patch.object(m,'read_proc_start',side_effect=['1','2']),patch.object(pathlib.Path,'read_text',return_value=HEADER+'\n'):
   with self.assertRaisesRegex(AssertionError,'RESOURCE_POSTGRES_PID_CHANGED'):v.pg_tcp_count(fact())
 def test_cpu_counter_reset_and_unknown_input_are_not_zero_load(self):
  with self.assertRaises(AssertionError):m.cpu_busy([1]*8,[0]*8)
  with self.assertRaises(AssertionError):m.cpu_busy([1]*8,[1]*8)
  self.assertEqual(m.cpu_busy([0]*8,[0,0,0,90,10,0,0,0]),0)
 def test_exact_source_and_main_reference_paths_never_load_material(self):
  v=monitor();f=fact();r={**ref(f),'schema':'source-service-created-v1','state':'BEFORE_START'};paths=[]
  def exists(p):return p.name=='postgres-'+CID+'.json'
  def read(p):paths.append(p.as_posix());return r
  with patch.object(pathlib.Path,'exists',exists),patch.object(m,'read_root_json',side_effect=read):out=v.reference_for(f)
  self.assertEqual(out['containerId'],CID);self.assertEqual(paths,['/model/source/master/source-services/postgres-'+CID+'.json'])
 def test_duplicate_reference_or_bad_source_state_fails(self):
  v=monitor();f=fact();r={**ref(f),'schema':'source-service-created-v1','state':'AFTER_START'}
  with patch.object(pathlib.Path,'exists',return_value=True),patch.object(m,'read_root_json',return_value=r):
   with self.assertRaises(AssertionError):v.reference_for(f)
 def test_evidence_uid999_parent_is_allowed_only_at_exact_closed_paths(self):
  d=types.SimpleNamespace(st_mode=m.stat.S_IFDIR|0o700,st_uid=999)
  for path in m.EVIDENCE_PARENTS:self.assertTrue(m.directory_allowed(path,d))
  for path in [m.SOURCE/'master',m.SOURCE/'evidence/jobs',m.TARGET/'variants/other/evidence',pathlib.Path('/tmp/evidence')]:self.assertFalse(m.directory_allowed(path,d))
  self.assertFalse(m.directory_allowed(m.SOURCE/'evidence',types.SimpleNamespace(st_mode=m.stat.S_IFDIR|0o770,st_uid=999)))
 def test_pre_material_authority_is_only_root_controller_job_receipt(self):
  v=monitor();r={**ref(fact('probe')),'schema':'controller-job-created-v1','jobId':OWNER,'commandHash':'e'*64,'state':'CREATED BEFORE START/SQL','ownerId':'pre-material'}
  with self.assertRaises(AssertionError):v.normalize(r,'job')
  r['service']='controller-tool';v.h.PROFILES={**PROFILES,'controller-tool':PROFILES['probe']};r.pop('imageRef');r.pop('nanoCpus');r.pop('memory');r['imageDigest']='sha256:'+'d'*64;self.assertEqual(v.normalize(r,'job')['ownerId'],'pre-material')
  with self.assertRaises(AssertionError):v.normalize({**r,'ownerId':'unapproved-label'},'job')
 def test_stop_requires_a_real_cpu_delta_and_check_has_no_io(self):
  v=monitor();v._samples=1;self.assertEqual(v.stop()['error'],'RESOURCE_MONITOR_CPU_UNVERIFIED')
  v=monitor()
  with patch.object(v,'raw_run',side_effect=AssertionError('NO_IO')):v.check()
 def test_removed_job_race_requires_exact_root_end_and_created_hash(self):
  v=monitor();c={**ref(fact('probe')),'schema':'controller-job-created-v1','jobId':OWNER,'commandHash':'e'*64,'state':'CREATED BEFORE START/SQL'};raw=json.dumps(c).encode();e={'schema':'controller-job-end-v1','jobId':OWNER,'containerId':CID,'project':'source','service':'probe','ownerId':OWNER,'containerStopped':True,'exitCode':137,'sqlAbsence':'NOT VERIFIED','finishedAt':'2026-10-15T00:00:00Z','createdReceiptHash':m.hashlib.sha256(raw).hexdigest()}
  selector={'project':'source','jobId':OWNER}
  with patch.object(pathlib.Path,'exists',return_value=True),patch.object(m,'read_root_json',return_value=e),patch.object(m,'read_root_bytes',return_value=raw):
   self.assertTrue(v.removed_job_proven(CID,selector))
   with self.assertRaises(AssertionError):v.removed_job_proven(OTHER,selector)
   with patch.object(m,'read_root_json',return_value={**e,'createdReceiptHash':'f'*64}):
    with self.assertRaises(AssertionError):v.removed_job_proven(CID,selector)
  self.assertFalse(v.removed_job_proven(CID,{'project':'foreign','jobId':OWNER}))
 def test_inspect_failure_without_missing_ids_is_not_treated_as_success(self):
  v=monitor();listing=json.dumps({'id':CID,'project':'source','jobId':OWNER})
  v.raw_run=lambda *a:listing if 'ps' in a else (_ for _ in ()).throw(m.subprocess.CalledProcessError(1,a,output=json.dumps(fact())))
  with self.assertRaisesRegex(AssertionError,'RESOURCE_DOCKER_INSPECT_UNKNOWN'):v.read_facts()
 def test_root_reader_rejects_hardlinks_modes_and_changes_without_following(self):
  for changes in [{'st_nlink':2},{'st_uid':999},{'st_mode':m.stat.S_IFREG|0o600},{'st_mode':m.stat.S_IFLNK|0o400}]:
   st=types.SimpleNamespace(st_mode=m.stat.S_IFREG|0o400,st_uid=0,st_nlink=1,st_size=2);st.__dict__.update(changes);p=types.SimpleNamespace(lstat=lambda:st,is_absolute=lambda:True);p.resolve=lambda:p
   with patch.object(m.pathlib,'Path',return_value=p),patch.object(m.os,'open',side_effect=AssertionError('MUST_NOT_OPEN')):
    with self.assertRaisesRegex(AssertionError,'RESOURCE_REFERENCE_CUSTODY'):m.read_root_bytes('/model/private.json')
 def test_sample_deadline_and_stale_daemon_abort_the_next_effect(self):
  for sampling,last,code in [(1,None,'RESOURCE_SAMPLE_DEADLINE'),(None,1,'RESOURCE_MONITOR_STALE')]:
   v=monitor();v._started=True;v._sampling_at=sampling;v._last_complete=last;v._thread=types.SimpleNamespace(is_alive=lambda:True)
   with patch.object(m.time,'monotonic',return_value=4):
    with self.assertRaisesRegex(AssertionError,code):v.check()
 def test_pg_disappearance_is_na_only_after_positive_same_cid_stop(self):
  v=monitor();f=fact();f['startedAt']='2026-10-15T00:00:00Z';ended={**f,'running':False,'status':'exited','pid':0,'exitCode':0,'finishedAt':'2026-10-15T00:00:01Z'}
  v.raw_run=lambda *a:json.dumps(ended)
  with patch.object(v,'pg_tcp_count',side_effect=FileNotFoundError()),patch.object(v,'reference_for',return_value=ref(f)):
   self.assertEqual(v.tcp_or_positive_stop(f),None);self.assertEqual(v.summary()['positivePostgresStopTransitions'],1)
 def test_pg_pid_swap_bad_stop_and_changed_root_reference_fail_closed(self):
  v=monitor();f=fact();f['startedAt']='2026-10-15T00:00:00Z';base={**f,'running':False,'status':'exited','pid':0,'exitCode':0,'finishedAt':'2026-10-15T00:00:01Z'}
  for change in [{'id':OTHER},{'pid':999},{'running':True,'status':'running','pid':456},{'exitCode':1},{'oomKilled':True},{'finishedAt':'0001-01-01T00:00:00Z'},{'startedAt':'2026-10-15T00:00:02Z'}]:
   v.raw_run=lambda *a:json.dumps({**base,**change})
   with patch.object(v,'pg_tcp_count',side_effect=AssertionError('RESOURCE_POSTGRES_PID_CHANGED')),patch.object(v,'reference_for',return_value=ref(f)):
    with self.assertRaises(AssertionError):v.tcp_or_positive_stop(f)
  v.raw_run=lambda *a:json.dumps(base)
  with patch.object(v,'pg_tcp_count',side_effect=FileNotFoundError()),patch.object(v,'reference_for',side_effect=[ref(f),{**ref(f),'ownerId':'changed'}]):
   with self.assertRaises(AssertionError):v.tcp_or_positive_stop(f)
 def test_pg_transition_inspect_uses_remaining_two_second_sample_budget(self):
  v=monitor();v._sampling_at=1;f=fact()
  with patch.object(v,'pg_tcp_count',side_effect=FileNotFoundError()),patch.object(m.time,'monotonic',return_value=3.01),patch.object(v,'raw_run',side_effect=AssertionError('MUST_NOT_INSPECT')):
   with self.assertRaisesRegex(AssertionError,'RESOURCE_SAMPLE_DEADLINE'):v.tcp_or_positive_stop(f)
 def test_raw_commands_are_read_only_and_bounded_with_no_env_or_config(self):
  v=monitor();calls=[]
  def run(*args):calls.append(args);return json.dumps({'id':CID,'project':'source','jobId':None})+'\n' if 'ps' in args else json.dumps(fact())+'\n'
  v.raw_run=run;out=v.read_facts();self.assertEqual(out[0]['id'],CID)
  self.assertTrue(all(a[0]=='timeout' and 'docker' in a and not any(x in a for x in ['exec','start','stop','rm','Env','Config']) for a in calls));self.assertLessEqual(sum(float(a[2]) for a in calls),1.8)

if __name__=='__main__':unittest.main()
