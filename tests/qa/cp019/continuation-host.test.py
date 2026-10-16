"""Root adapter models. No real admission, clock reset, mounts or effects."""
import copy,hashlib,importlib.util,pathlib,unittest
from unittest.mock import patch
P=pathlib.Path(__file__).resolve()
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
f=load('cp024_fixtures',P.with_name('continuation-budget.test.py'));h=load('cp024_host',P.with_name('host.py'))
def context():return {'baseLedger':f.RAW,'baseLedgerHash':f.HASH,'admission':copy.deepcopy(f.ADMISSION),'admissionHash':hashlib.sha256(f.m.canonical(f.ADMISSION)).hexdigest()}
class Host(unittest.TestCase):
 def setUp(self):
  for attr in ['CONTINUATION_CONTEXT','CONTINUATION_HIGH_WATER','CONTINUATION_BROKER','CONTINUATION_EFFECT_RECEIPT']:
   restore=patch.object(h,attr,None);restore.start();self.addCleanup(restore.stop)
 def test_v1_is_default_and_never_chosen_by_time_or_path(self):self.assertEqual(h.budget_directory(),h.ROOT/'budget');self.assertEqual(h.budget_environment(),{})
 def test_explicit_context_selects_only_the_v2_subdirectory(self):
  h.configure_continuation(context());self.assertEqual(h.budget_directory(),h.ROOT/'budget/continuations/v2');self.assertEqual(h.budget_environment()['QA_BUDGET_ATTEMPT'],'v2')
 def test_second_configuration_cannot_replace_or_refresh(self):
  h.configure_continuation(context())
  with self.assertRaisesRegex(AssertionError,'ALREADY_CONFIGURED'):h.configure_continuation(context())
 def test_context_is_copied_not_shared_with_caller(self):
  c=context();h.configure_continuation(c);c['admission']['startedUptime']+=1;self.assertEqual(h.CONTINUATION_CONTEXT['admission']['startedUptime'],f.NOW)
 def test_modified_admission_hash_denies(self):
  c=context();c['admissionHash']='b'*64
  with self.assertRaisesRegex(AssertionError,'ADMISSION_HASH'):h.configure_continuation(c)
 def test_same_authority_and_counter_across_root_and_node_model(self):
  h.configure_continuation(context());state=f.fresh();after=h.budget_update(state,'host-pg-start','artifactFiles',1,f.NOW);self.assertEqual(after,f.change(state,kind='artifactFiles'));self.assertEqual(h.validate_budget_remaining(after,'host-pg-start',f.NOW+44),1)
 def test_root_scope_and_expiry_guards_still_deny(self):
  h.configure_continuation(context());s=h.budget_enter(f.fresh(),'source-window','source-close-b',f.NOW)
  with self.assertRaises(AssertionError):h.budget_enter(s,'source-window','target-configure',f.NOW)
  with self.assertRaisesRegex(AssertionError,'CASE_EXPIRED'):h.budget_update(s,'source-close-b','sql',1,f.NOW+45)
 def test_unrelated_pg_spec_is_unchanged(self):
  spec={'environment':{'POSTGRES_DB':'postgres'},'volumes':[str(h.ROOT/'data')+':/var/lib/postgresql:rw']};h.configure_continuation(context());self.assertEqual(h.bind_budget_service(spec),spec)
 def test_only_budget_mount_replaced_authority_ro_and_environment_closed(self):
  h.configure_continuation(context());spec={'environment':{'QA_PROJECT':h.ROOT.name},'volumes':[str(h.ROOT/'budget')+':/run/qa-budget:rw',str(h.ROOT/'staging')+':/workspace:ro']};before=copy.deepcopy(spec);bound=h.bind_budget_service(spec)
  self.assertEqual(spec,before);self.assertIn(str(h.budget_directory())+':/run/qa-budget:ro',bound['volumes']);self.assertNotIn(str(h.ROOT/'budget')+':/run/qa-budget:rw',bound['volumes']);self.assertIn(str(h.budget_authority_directory())+':/run/qa-budget-authority:ro',bound['volumes']);self.assertEqual(h.bind_budget_service(bound),bound)
 def test_duplicate_budget_or_foreign_authority_mount_denies(self):
  h.configure_continuation(context());old=str(h.ROOT/'budget')+':/run/qa-budget:rw'
  for volumes in [[old,old],[old,str(h.ROOT/'secrets')+':/run/qa-budget-authority:ro']]:
   with self.assertRaises(AssertionError):h.bind_budget_service({'volumes':volumes})
 def test_conflicting_attempt_env_denies(self):
  h.configure_continuation(context());spec={'volumes':[str(h.ROOT/'budget')+':/run/qa-budget:rw'],'environment':{'QA_BUDGET_ATTEMPT':'v3'}}
  with self.assertRaisesRegex(AssertionError,'ENV_CONFLICT'):h.bind_budget_service(spec)
 def test_original_v1_clock_is_not_reopened(self):
  with self.assertRaisesRegex(AssertionError,'CP019_BUDGET_ABORT'):h.budget_update(copy.deepcopy(f.BASE),'host-pg-start','artifactFiles',1,f.NOW)
 def test_partial_configuration_cannot_start_create_or_execute(self):
  h.configure_continuation(context())
  for args in [('docker','start','cid'),('docker','create','image'),('docker','exec','cid','psql'),('docker','compose','-f','file','up')]:
   with self.subTest(args=args),self.assertRaisesRegex(AssertionError,'CONSUMERS_NOT_ACCREDITED'):h.continuation_effect_guard(args)
 def test_partial_configuration_does_not_disable_metadata_or_cleanup(self):
  h.configure_continuation(context())
  for args in [('docker','inspect','cid'),('docker','stop','cid'),('docker','ps','-aq')]:h.continuation_effect_guard(args)
 def test_live_claim_without_positive_transport_still_denies_effects(self):
  import types
  h.configure_continuation(context());h.CONTINUATION_BROKER=types.SimpleNamespace(guard=lambda:None);h.CONTINUATION_EFFECT_RECEIPT=types.SimpleNamespace(check_live=lambda:True,effect_ready=False)
  with self.assertRaisesRegex(AssertionError,'TRANSPORT_NOT_READY'):h.continuation_effect_guard(('docker','start','cid'))
 def test_root_reader_high_water_rejects_a_known_delta_regression(self):
  h.configure_continuation(context());s=f.change(f.fresh(),'source-close-b',kind='sql',amount=3);old=copy.deepcopy(s);old['sequence']-=1;old['total']['sql']-=1;old['scenarios']['source-close-b']['total']['sql']-=1
  with patch.object(h,'uptime',return_value=f.NOW):
   h.track_continuation_progress(s)
   with self.assertRaisesRegex(AssertionError,'PROGRESS_REGRESSION'):h.track_continuation_progress(old)
 def test_root_charge_and_enter_forward_exact_case_to_single_persist(self):
  import types
  h.configure_continuation(context());seen=[];h.CONTINUATION_BROKER=types.SimpleNamespace(root_update=lambda fn,**kw:seen.append(kw['scenario']))
  h.HOST_CASE='host-bootstrap';h.ledger_charge('artifactFiles',2,scenario='host-stage');h.enter_runtime_case('source-window','source-close-b');self.assertEqual(seen,['host-stage','source-close-b'])
if __name__=='__main__':unittest.main()
