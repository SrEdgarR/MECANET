"""SC016 real CP022 ledger fixture; pure development, no admission or VPS."""
import copy,hashlib,importlib.util,json,pathlib,unittest
P=pathlib.Path(__file__).resolve();ROOT=P.parents[3]
spec=importlib.util.spec_from_file_location('continuation_budget',P.with_name('continuation-budget.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
BASE=json.loads((ROOT/'docs/evidence/cp022/remote-run.json').read_text())['ledger'];RAW=json.dumps(BASE,separators=(',',':')).encode();HASH=hashlib.sha256(RAW).hexdigest();NOW=BASE['startedUptime']+20000
ADMISSION={'schema':'cp024-continuation-admission-v2','project':m.PROJECT,'targetProject':m.PROJECT+'-target','attempt':'v2','approvalHash':m.SC016,'parentLedgerHash':HASH,'parentSequence':44,'registryHash':m.REGISTRY,'startedUptime':NOW,'sourceContainerId':'aa35afe3ea406009410be0e1a7eef759c619c8386a290ce9cbf620fe890cc500','sourceOwnerId':'76066956-b4ae-422f-ae8d-69a0795a88dd','sourceSystemIdentifier':'7696914153807093794','sourceFinishedAt':'2026-10-15T15:18:02.598236798Z',**dict.fromkeys(['sealedInputsHash','controllerHash','runtimeHash','priorRunReportHash'],'a'*64)}
def fresh():return m.initial(RAW,HASH,copy.deepcopy(ADMISSION))
def change(s,case='host-pg-start',t=NOW,**opts):return m.update(s,RAW,HASH,ADMISSION,case,t,**opts)
class Continuation(unittest.TestCase):
 def test_exact_real_v1_fixture(self):self.assertEqual(HASH,'b2ed6589a6026fca7c8268fa726a58f4d459b70e1a52f086437150650db959f6');self.assertEqual(m.validate_base(RAW,HASH),BASE)
 def test_initial_keeps_original_bytes_counts_and_starts(self):
  before=RAW[:];s=fresh();self.assertEqual(s['total'],BASE['total']);self.assertEqual(s['sequence'],44);self.assertIsNone(s['scenarios']['host-pg-start']['startedUptime']);self.assertEqual(RAW,before);self.assertEqual(BASE['startedUptime'],1470388.38)
 def test_v2_case_fresh_once_counts_old_and_new(self):
  s=change(fresh(),kind='artifactFiles',amount=1);self.assertEqual(s['total']['artifactFiles'],640);self.assertEqual(s['scenarios']['host-pg-start']['total']['artifactFiles'],BASE['scenarios']['host-pg-start']['total']['artifactFiles']+1);s=change(s,t=NOW+44);self.assertEqual(s['scenarios']['host-pg-start']['startedUptime'],NOW)
 def test_source_and_target_scope_no_case_alias(self):
  s=change(fresh(),'source-close-b',scope='source-window');self.assertEqual(s['activeScenarios']['source-window'],'source-close-b')
  with self.assertRaisesRegex(AssertionError,'CASE_ALIAS'):change(s,'target-configure',scope='source-window')
 def test_case45_exact_denies_no_start_refresh(self):
  s=change(fresh());before=copy.deepcopy(s)
  with self.assertRaisesRegex(AssertionError,'CASE_EXPIRED'):change(s,t=NOW+45,kind='sql')
  self.assertEqual(s,before)
 def test_global1800_exact_denies(self):
  with self.assertRaisesRegex(AssertionError,'GLOBAL_EXPIRED'):change(fresh(),t=NOW+1800)
 def test_backwards_clock_denies(self):
  with self.assertRaises(AssertionError):change(fresh(),t=NOW-.001)
 def test_v1_mutation_and_truncation_deny(self):
  for raw in [RAW[:-1],RAW+b' ',RAW.replace(b'639',b'638')]:
   with self.subTest(raw=len(raw)),self.assertRaisesRegex(AssertionError,'V1_HASH'):m.initial(raw,HASH,ADMISSION)
 def test_v3_foreign_cid_owner_finished_system_or_approval_deny(self):
  for k,v in [('attempt','v3'),('project','mecanet-qa-p1l3-r02'),('sourceContainerId','b'*64),('sourceOwnerId','other'),('sourceSystemIdentifier','42'),('sourceFinishedAt','unknown'),('approvalHash','b'*64)]:
   a={**ADMISSION,k:v}
   with self.subTest(k=k),self.assertRaises(AssertionError):m.initial(RAW,HASH,a)
 def test_admission_changed_does_not_move_existing_start(self):
  s=fresh();a={**ADMISSION,'startedUptime':NOW+1}
  with self.assertRaisesRegex(AssertionError,'AUTHORITY_CHANGED'):m.validate(s,RAW,HASH,a,NOW+1)
 def test_regression_in_sequence_counts_case_omission_sum(self):
  variants=[];s=fresh();s['sequence']=43;variants.append(s);s=fresh();s['total']['artifactFiles']=638;variants.append(s);s=fresh();del s['scenarios']['host-stage'];variants.append(s);s=fresh();s['scenarios']['host-stage']['total']['artifactFiles']-=1;variants.append(s)
  for s in variants:
   with self.assertRaises(AssertionError):m.validate(s,RAW,HASH,ADMISSION,NOW)
 def test_case_artifacts_old_charge_cannot_be_erased(self):
  old=BASE['scenarios']['host-stage']['total']['artifactFiles'];s=change(fresh(),'host-stage',kind='artifactFiles',amount=2000-old)
  with self.assertRaisesRegex(AssertionError,'OVERFLOW'):change(s,'host-stage',kind='artifactFiles')
 def test_accumulated_global_artifacts_8192(self):
  s=fresh();remaining=8192-639
  for name in ['source-close-b','source-migrate-a','source-migrate-b','source-migrate-central']:
   charge=min(remaining,2000);s=change(s,name,kind='artifactFiles',amount=charge);remaining-=charge
  self.assertEqual(s['total']['artifactFiles'],8192)
  with self.assertRaisesRegex(AssertionError,'OVERFLOW'):change(s,'source-initialize-a',kind='artifactFiles')
 def test_sql_exact8192_and_global200000(self):
  s=fresh();cases=[n for n in BASE['plannedScenarios'] if n.startswith('source-')];self.assertGreaterEqual(len(cases),25)
  for n in cases[:24]:s=change(s,n,kind='sql',amount=8192)
  with self.assertRaisesRegex(AssertionError,'OVERFLOW'):change(s,cases[0],kind='sql')
  s=change(s,cases[24],kind='sql',amount=3392);self.assertEqual(s['total']['sql'],200000)
  with self.assertRaisesRegex(AssertionError,'OVERFLOW'):change(s,cases[24],kind='sql')
 def test_negative_bool_nan_unknown_charges_deny(self):
  for kind,amount in [('sql',True),('sql',-1),('sql',0),('sql',float('nan')),('else',1)]:
   with self.subTest(kind=kind,amount=amount),self.assertRaises(AssertionError):change(fresh(),kind=kind,amount=amount)
 def test_original_registry_scope_cannot_change(self):
  s=fresh();s['plannedScopes']['source-close-b']='target-window'
  with self.assertRaises(AssertionError):m.validate(s,RAW,HASH,ADMISSION,NOW)
 def test_latch_abort_irreversible_and_first_reason_retained(self):
  s=m.aborted(fresh(),'RESOURCE_CPU_LIMIT');again=m.aborted(s,'OTHER');self.assertEqual(s,again)
  with self.assertRaisesRegex(AssertionError,'TERMINAL_ABORT'):change(again,kind='sql')
 def test_no_new_case_is_created_on_failed_update(self):
  s=fresh();before=copy.deepcopy(s)
  with self.assertRaisesRegex(AssertionError,'CHARGE'):change(s,'source-close-b',kind='sql',amount=0)
  self.assertEqual(s,before)
 def test_known_delta_cannot_regress_above_historical_floor(self):
  previous=change(fresh(),'source-close-b',kind='sql',amount=3);current=copy.deepcopy(previous);current['total']['sql']-=1;current['scenarios']['source-close-b']['total']['sql']-=1;current['sequence']-=1
  # The shape and v1 floor alone are insufficient; compare positive high water.
  m.validate(current,RAW,HASH,ADMISSION,NOW)
  with self.assertRaisesRegex(AssertionError,'PROGRESS_REGRESSION'):m.validate_progress(previous,current)
if __name__=='__main__':unittest.main()
