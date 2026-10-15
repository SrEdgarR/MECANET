"""Local resource diagnostic contracts; no host, Docker, PostgreSQL or SSH calls."""
import importlib.util,json,pathlib,types,unittest
spec=importlib.util.spec_from_file_location('resource_sample',pathlib.Path(__file__).with_name('resource-sample.py'));s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
BASE={'observed_at':'2026-10-15T15:18:02.000000Z','monotonic_seconds':123.5,'interval_seconds':2.0,'cpu_before':[0]*8,'cpu_after':[90,0,0,10,0,0,0,0],'cpu_busy':90.0,'available_mib':8400,'disk_free_bytes':20*1024**3,'disk_total_bytes':100*1024**3}
class Samples(unittest.TestCase):
 def test_rejected_cpu_point_keeps_exact_value_threshold_time_and_counters(self):
  v=s.describe('monitor',**BASE)
  self.assertEqual(v['firstViolation'],'RESOURCE_CPU_LIMIT');self.assertEqual(v['host']['cpuBusyPercent'],90.0);self.assertEqual(v['thresholds']['cpuBusyUpperExclusive'],90);self.assertEqual(v['observedAt'],BASE['observed_at']);self.assertEqual(v['monotonicSeconds'],123.5);self.assertEqual(v['intervalSeconds'],2.0);self.assertEqual(v['host']['cpuCountersDelta'],BASE['cpu_after']);self.assertEqual(v['host']['cpuFieldNames'],['user','nice','system','idle','iowait','irq','softirq','steal'])
 def test_admission80_and_monitor90_are_distinct_and_not_relaxed(self):
  for mode,value,expected in [('admission',79.999,None),('admission',80,'ADMISSION_CPU_LIMIT'),('monitor',89.999,None),('monitor',90,'RESOURCE_CPU_LIMIT')]:
   with self.subTest(mode=mode,value=value):self.assertEqual(s.describe(mode,**{**BASE,'cpu_busy':value})['firstViolation'],expected)
 def test_memory_and_disk_preserve_original_headroom_and_margin(self):
  for mode,available,free,expected in [('admission',5119,20*1024**3,'ADMISSION_MEMORY_HEADROOM_LIMIT'),('admission',5120,20*1024**3,None),('monitor',3071,20*1024**3,'RESOURCE_MEMORY_LIMIT'),('monitor',3072,20*1024**3,None),('monitor',8400,15*1024**3,'RESOURCE_DISK_LIMIT')]:
   with self.subTest(mode=mode):self.assertEqual(s.describe(mode,**{**BASE,'available_mib':available,'disk_free_bytes':free,'cpu_busy':0})['firstViolation'],expected)
 def test_unknown_invalid_or_secret_values_never_become_observed_measurements(self):
  for key,value in [('cpu_busy',float('nan')),('cpu_busy',float('inf')),('cpu_busy',True),('available_mib','SENTINEL_SECRET'),('disk_free_bytes',-1)]:
   v=s.describe('monitor',**{**BASE,key:value});raw=json.dumps(v,allow_nan=False);self.assertNotIn('SENTINEL',raw);self.assertIsNotNone(v['firstViolation'])
 def test_none_cpu_is_warmup_not_synthetic_zero(self):
  v=s.describe('monitor',**{**BASE,'cpu_busy':None,'cpu_before':None,'interval_seconds':None});self.assertIsNone(v['host']['cpuBusyPercent']);self.assertEqual(v['host']['cpuObservation'],'NO_DELTA_WARMUP');self.assertIsNone(v['firstViolation'])
 def test_admission_missing_cpu_is_unknown_and_never_warmup_acceptance(self):
  v=s.describe('admission',**{**BASE,'cpu_busy':None});self.assertEqual(v['firstViolation'],'ADMISSION_CPU_SAMPLE_UNKNOWN');self.assertEqual(v['host']['cpuObservation'],'INVALID');self.assertIsNone(v['host']['cpuBusyPercent'])
 def test_own_metrics_are_scoped_to_controller_and_not_attributed_to_postgres(self):
  api=types.SimpleNamespace(RUSAGE_SELF=0,RUSAGE_THREAD=1,getrusage=lambda kind:types.SimpleNamespace(ru_utime=1.25,ru_stime=.5,ru_maxrss=1024))
  usage=s.process_usage(api,include_thread=True);v=s.describe('monitor',**BASE,own_usage=usage)
  self.assertEqual(v['ownUsage']['controllerProcessCpuSeconds'],1.75);self.assertEqual(v['ownUsage']['monitorThreadCpuSeconds'],1.75);self.assertEqual(v['ownUsage']['containerUsage'],'NOT MEASURED');self.assertEqual(v['ownUsage']['scope'],'Root controller process; excludes Docker containers and daemon')
 def test_missing_os_accounting_is_unavailable_and_not_a_false_zero(self):
  self.assertEqual(s.process_usage(None),{'available':False,'reason':'OS_ACCOUNTING_UNAVAILABLE','containerUsage':'NOT MEASURED','scope':'Root controller process; excludes Docker containers and daemon'})
 def test_caller_cannot_supply_paths_commands_or_unrecognized_usage_fields(self):
  v=s.describe('monitor',**BASE,own_usage={'SENTINEL_SECRET':'password','controllerProcessCpuSeconds':1,'available':True});self.assertNotIn('SENTINEL',json.dumps(v));self.assertNotIn('password',json.dumps(v))
  with self.assertRaises(AssertionError):s.describe('production',**BASE)
if __name__=='__main__':unittest.main()
