"""Controller ordering/failure models. No Docker, SSH, HTTP or PostgreSQL."""
import importlib.util,pathlib,types,unittest
spec=importlib.util.spec_from_file_location('controller',pathlib.Path(__file__).with_name('controller.py'))
c=importlib.util.module_from_spec(spec)
if spec.loader:spec.loader.exec_module(c)

class Model:
 def __init__(self,fail=None):self.events=[];self.fail=fail
 def call(self,name,*args):
  event=(name,*args);self.events.append(event)
  if event==self.fail:raise AssertionError('INJECTED_FAILURE')
  return {'result':'PASS'}
 def __getattr__(self,name):return lambda *args:self.call(name,*args)

class Ordering(unittest.TestCase):
 def test_events_never_include_arbitrary_helper_result_or_credentials(self):
  import json
  value={'status':'PASS','rolePasswords':{'qa_bootstrap':'DO_NOT_PRINT_SYNTHETIC_SECRET'},'effectiveMaterial':{'sessionSecret':'NEVER_PUBLIC'}}
  result=c.public_result(value);self.assertEqual(result['resultBody'],'PRIVATE / OMITTED');self.assertEqual(result['acceptance'],'NOT VERIFIED')
  self.assertNotIn('SECRET',json.dumps(result));self.assertNotIn('NEVER_PUBLIC',json.dumps(result));self.assertEqual(len(result['resultHash']),64)
 def run_model(self,fail=None):
  m=Model(fail);c.execute(m);return m.events
 def test_schema_observation_brackets_006_and_credential_probe_precedes_canary(self):
  e=self.run_model();at=lambda *x:e.index(x)
  self.assertLess(at('schema','pre'),at('source_phase','source-migrate-a'))
  self.assertLess(at('source_phase','source-initialize-control'),at('schema','post'))
  self.assertLess(at('schema','post'),at('source_phase','source-clock-plan'))
  self.assertLess(at('phase','main','rotate'),at('credentials'))
  self.assertLess(at('credentials'),at('phase','main','canary'))
 def test_offline_custody_follows_final_source_journal_and_precedes_every_target_pg(self):
  e=self.run_model();first=e.index(('source_pg_off','postcanary'));main=e.index(('pg_start','main'))
  for kind in c.KINDS:
   for action in ['prepare_variant','copy_variant']:
    self.assertGreater(e.index((action,kind)),first);self.assertLess(e.index((action,kind)),main)
   self.assertLess(e.index(('main_pg_off',)),e.index(('pg_start',kind)))
  self.assertLess(e.index(('source_pg_off','postcanary')),e.index(('pg_start','main')))
 def test_no_two_postgres_or_runtime_cohorts_overlap(self):
  e=self.run_model();pg=None;business=set()
  for event in e:
   action,*args=event
   if action=='pg_start':self.assertIsNone(pg);pg=args[0]
   if action in ['runtime','empty_runtime'] and args[-1] in ['business','business-prefix','start-business','start-worker','worker']:business.add(args[0]);self.assertEqual(business,{pg})
   if action in ['stop','empty_stop']:business.discard(args[0])
   if action=='main_pg_off':self.assertEqual(pg,'main');self.assertFalse(business);pg=None
   if action=='pg_stop':self.assertEqual(pg,args[0]);self.assertFalse(business);pg=None
   if action in ['journal_negatives','copy_negatives']:self.assertIsNone(pg);self.assertFalse(business)
  self.assertIsNone(pg)
 def test_empty_unready_is_before_clock_and_ready_is_after_complete(self):
  e=self.run_model();k='roster-empty';at=lambda *x:e.index(x)
  self.assertLess(at('empty_runtime',k,'start-business'),at('readiness',k,'probe-unready'))
  self.assertLess(at('readiness',k,'probe-unready'),at('empty_runtime',k,'start-worker'))
  self.assertLess(at('readiness',k,'complete-empty'),at('readiness',k,'probe-ready'))
  self.assertLess(at('empty_stop',k),at('readiness',k,'end-empty'))
 def test_prefix_fault_and_proof_before_business_and_http_plan_before_any_http(self):
  e=self.run_model();k='promote-prefix';at=lambda *x:e.index(x)
  self.assertLess(at('prefix_prepare',),at('phase',k,'promote-fault'))
  self.assertLess(at('phase',k,'promote-fault'),at('runtime',k,'business-prefix'))
  self.assertLess(at('http_plan',k),at('promotion_http',))
  self.assertLess(at('promotion_http',),at('http_inventory',k))
  self.assertLess(at('end',k),at('phase',k,'abort-close'))
 def test_a5_three_restrictions_immutable_order_and_final_close_before_stop(self):
  e=self.run_model();k='a5-restrictions';at=lambda *x:e.index(x)
  self.assertLess(at('http_plan',k),at('a5',k,'grant'))
  self.assertLess(at('a5',k,'grant'),at('a5',k,'membership'))
  self.assertLess(at('a5',k,'membership'),at('a5',k,'identity'))
  self.assertLess(at('a5',k,'identity'),at('readiness',k,'final-close'))
  self.assertLess(at('readiness',k,'final-close'),at('stop',k))
  self.assertFalse(any(x[0]=='phase' and x[1]==k and x[-1].startswith('abort') for x in e))
 def test_negative_copies_last_so_invalid_fixture_links_never_reenter_provider(self):
  e=self.run_model();self.assertEqual(e[-2:],[('journal_negatives',),('copy_negatives',)])
 def test_every_failure_stops_execution_at_that_boundary_without_retry_or_next_cohort(self):
  trace=self.run_model()
  for n,event in enumerate(trace):
   m=Model(event)
   with self.subTest(event=event),self.assertRaisesRegex(AssertionError,'INJECTED_FAILURE'):c.execute(m)
   # Some non-mutating phases legitimately share a name; injection hits the first.
   self.assertEqual(m.events,trace[:trace.index(event)+1])
 def test_case_keys_are_fixed_no_new_scenarios_or_budget_reset_api(self):
  self.assertEqual(c.KINDS,('roster-empty','allclosed','commit-interrupted','promote-prefix','a5-restrictions'))
  self.assertFalse(any('reset' in x[0] or 'quota' in x[0] for x in self.run_model()))

if __name__=='__main__':unittest.main()
