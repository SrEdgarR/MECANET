"""Admission models; no physical Root claim or v2 effects."""
import copy,hashlib,importlib.util,pathlib,types,unittest
P=pathlib.Path(__file__).resolve()
def load(name,file):s=importlib.util.spec_from_file_location(name,file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
f=load('cp024_admission_fixture',P.with_name('continuation-broker.test.py'));a=load('cp024_admission',P.with_name('continuation-admission.py'))
class MemoryStore:
 def __init__(self):self.value=None;self.uncertain=False
 def compare_create(self,value):
  if self.value is not None:raise FileExistsError('CLAIM_EXISTS')
  self.value=copy.deepcopy(value)
  if self.uncertain:raise OSError('SYNTHETIC_FSYNC_ACK_UNKNOWN')
 def read(self):return copy.deepcopy(self.value)
def fixture():
 store=MemoryStore();life={'pid':123,'procStart':'456'};pins={k:'a'*64 for k in ['quality','independentReview','transport','environment','publicationProjection']};make=lambda:a.create_claim(f.f.m,f.context(),store,pins,identity=lambda:life.copy(),clock=lambda:f.f.NOW);return store,life,make
class Admission(unittest.TestCase):
 def test_first_claim_is_durable_and_charges_itself_without_reset(self):
  store,life,make=fixture();claim=make();self.assertTrue(claim.check_live());self.assertEqual(store.value['initialState']['total']['artifactFiles'],642);self.assertEqual(store.value['initialState']['sequence'],45);self.assertEqual(claim.body['initialState']['startedUptime'],f.f.NOW)
 def test_second_root_cannot_claim_or_adopt_existing_attempt(self):
  store,life,make=fixture();claim=make();life['pid']+=1
  with self.assertRaisesRegex(AssertionError,'ROOT_ENDED'):claim.check_live()
  with self.assertRaises(FileExistsError):make()
 def test_lost_claim_ack_keeps_consumed_attempt(self):
  store,life,make=fixture();store.uncertain=True
  with self.assertRaises(OSError):make()
  self.assertIsNotNone(store.value);store.uncertain=False
  with self.assertRaises(FileExistsError):make()
 def test_same_pid_with_reused_proc_start_is_not_a_live_root(self):
  store,life,make=fixture();claim=make();life['procStart']='457'
  with self.assertRaises(AssertionError):claim.check_live()
  life['procStart']='456'
  with self.assertRaises(AssertionError):claim.check_live()
 def test_modified_claim_seal_stops_old_root_irreversibly(self):
  store,life,make=fixture();claim=make();store.value['initialState']['total']['artifactFiles']+=1
  with self.assertRaisesRegex(AssertionError,'SEAL_CHANGED'):claim.check_live()
  store.value=copy.deepcopy(claim.body)
  with self.assertRaises(AssertionError):claim.check_live()
 def test_missing_gate_reference_cannot_create_a_claim(self):
  store,life,make=fixture()
  with self.assertRaisesRegex(AssertionError,'GATE_PINS'):a.create_claim(f.f.m,f.context(),store,{},identity=lambda:life)
  self.assertIsNone(store.value)
 def test_constructor_has_no_load_or_resume_path(self):
  with self.assertRaisesRegex(AssertionError,'NO_ADOPTION'):a.Claim(None,None,None,None,None,None)
 def test_bind_refuses_a_ledger_newer_or_older_than_exact_reserved_state(self):
  store,life,make=fixture();claim=make();ledger=f.MemoryStore();h=types.SimpleNamespace(CONTINUATION_CONTEXT=None,CONTINUATION_BROKER=None,CONTINUATION_EFFECT_RECEIPT=None)
  with self.assertRaisesRegex(AssertionError,'INITIAL_STATE_NOT_EXACT'):claim.bind_budget(h,f.b,ledger)
  ledger.value=copy.deepcopy(claim.body['initialState'])
  with self.assertRaisesRegex(AssertionError,'ROOT_ENDED'):claim.bind_budget(h,f.b,ledger)
  self.assertTrue(claim.closed)
 def test_expired_or_future_start_cannot_create_a_claim(self):
  pins={k:'a'*64 for k in ['quality','independentReview','transport','environment','publicationProjection']}
  for instant in [f.f.NOW-1,f.f.NOW+45,f.f.NOW+1800]:
   store=MemoryStore()
   with self.assertRaises(AssertionError):a.create_claim(f.f.m,f.context(),store,pins,identity=lambda:{'pid':123,'procStart':'456'},clock=lambda:instant)
   self.assertIsNone(store.value)
 def test_effects_require_positive_exact_transport_after_binding(self):
  store,life,make=fixture();claim=make();broker=types.SimpleNamespace(root_snapshot=lambda:copy.deepcopy(claim.body['initialState']),fail=lambda reason:None);h=types.SimpleNamespace(CONTINUATION_EFFECT_RECEIPT=claim,CONTINUATION_BROKER=broker);path=str(a.ROOT/'budget/continuations/v2/counter.sock');transport=types.SimpleNamespace(broker=broker,path=path,socket=types.SimpleNamespace(getsockname=lambda:path),thread=types.SimpleNamespace(is_alive=lambda:True),stop_event=types.SimpleNamespace(is_set=lambda:False));self.assertFalse(claim.effect_ready);claim.enable_effects(h,transport);self.assertTrue(claim.effect_ready)
 def test_missing_transport_is_irreversible_even_if_later_filled_in(self):
  store,life,make=fixture();claim=make();broker=types.SimpleNamespace(fail=lambda reason:None);h=types.SimpleNamespace(CONTINUATION_EFFECT_RECEIPT=claim,CONTINUATION_BROKER=broker);transport=types.SimpleNamespace(broker=broker,path='wrong')
  with self.assertRaisesRegex(AssertionError,'TRANSPORT_NOT_READY'):claim.enable_effects(h,transport)
  self.assertTrue(claim.closed);self.assertFalse(claim.effect_ready)
 def test_frontier_is_charged_before_write_and_uncertain_readback_is_irreversible(self):
  for uncertain in [False,True]:
   store,life,make=fixture();claim=make();state=copy.deepcopy(claim.body['initialState']);failures=[];writes=[]
   def charge(kind):
    nonlocal state
    state=f.f.m.update(state,*[f.context()[k] for k in ['baseLedger','baseLedgerHash','admission']],'host-bootstrap',f.f.NOW,kind=kind)
   broker=types.SimpleNamespace(root_snapshot=lambda:copy.deepcopy(state),fail=failures.append);h=types.SimpleNamespace(ledger_charge=charge,CONTINUATION_BROKER=broker,HOST_CASE='host-bootstrap',uptime=lambda:f.f.NOW)
   def write(label,raw):
    self.assertEqual(state['total']['artifactFiles'],643);writes.append(raw);return 'b'*64 if uncertain else a.sha(raw)
   if uncertain:
    with self.assertRaisesRegex(AssertionError,'FRONTIER_READBACK'):claim.boundary(h,'stage',{'verified':True},'PASS',write)
    self.assertEqual(failures,['ADMISSION_FRONTIER_UNCERTAIN']);self.assertTrue(claim.closed)
   else:
    result=claim.boundary(h,'stage',{'verified':True},'PASS',write);self.assertEqual(result['ledger'],state);self.assertEqual(claim.last_boundary,a.sha(writes[0]))
if __name__=='__main__':unittest.main()
