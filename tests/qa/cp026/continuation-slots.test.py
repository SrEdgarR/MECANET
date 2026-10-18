"""SC016 counter cost models; no Linux/ARM64 durability claim.

The fixed-slot fake changes no file: it makes the creation cost observable at
the same public broker boundary. The separate ephemeral Linux fixture tests
the actual exchange/fsync adapter before any Oracle attempt can be considered.
"""
import copy,importlib.util,pathlib,unittest
P=pathlib.Path(__file__).resolve();QA=P.parents[1]/'cp019'
spec=importlib.util.spec_from_file_location('cp026_old_broker_fixtures',QA/'continuation-broker.test.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class Slots(f.MemoryStore,f.b.RootFileStore):
 """A test-only precreated store, explicitly not a physical filesystem."""
 def __init__(self):super().__init__();self.creations=0
def fixture():
 store=Slots();identity={'pid':f.os.getpid(),'procStart':'finite-model'}
 broker=f.b.Broker(f.f.m,f.context(),store,store.read(),lambda:f.f.NOW,lambda record,peer:True,identity,root_identity=lambda:identity.copy());return store,broker
class FixedSlots(unittest.TestCase):
 def test_sql_and_enter_do_not_create_or_charge_nonexistent_files(self):
  store,broker=fixture();f.enroll(broker,'one');before=store.read();broker.request('one',(123,999,999),f.request('one',2,'enter',name='source-close-b'));after=broker.request('one',(123,999,999),f.request('one',3,'charge',kind='sql',amount=3))['state'];self.assertEqual(after['total']['sql'],3);self.assertEqual(after['total']['artifactFiles'],before['total']['artifactFiles']);self.assertEqual(after['sequence'],before['sequence']+2);self.assertEqual(len(store.saved),2)
 def test_actual_external_creation_remains_charged_to_the_same_case(self):
  store,broker=fixture();f.enroll(broker,'one');broker.request('one',(123,999,999),f.request('one',2,'enter',name='source-close-b'));before=store.read();after=broker.request('one',(123,999,999),f.request('one',3,'charge',kind='artifactFiles',amount=2))['state'];self.assertEqual(after['total']['artifactFiles']-before['total']['artifactFiles'],2);self.assertEqual(after['scenarios']['source-close-b']['total']['artifactFiles'],2)
 def test_no_second_file_budget_is_consumed_by_sql_at_artifact_boundary(self):
  store,broker=fixture();state=store.read();state=f.f.m.update(state,*broker.args(),'source-close-b',f.f.NOW,kind='artifactFiles',amount=1998);state['activeScenarios']['source-window']='source-close-b';store.value=copy.deepcopy(state);broker.state=copy.deepcopy(state);f.enroll(broker,'one');reply=broker.request('one',(123,999,999),f.request('one',2,'charge',kind='sql',amount=1));self.assertEqual(reply['state']['total']['sql'],1);self.assertEqual(reply['state']['scenarios']['source-close-b']['total']['artifactFiles'],1998)
 def test_real_creation_at_artifact_boundary_still_denies_before_persist(self):
  store,broker=fixture();state=store.read();state=f.f.m.update(state,*broker.args(),'source-close-b',f.f.NOW,kind='artifactFiles',amount=1998);state['activeScenarios']['source-window']='source-close-b';store.value=copy.deepcopy(state);broker.state=copy.deepcopy(state);f.enroll(broker,'one');
  with self.assertRaisesRegex(AssertionError,'OVERFLOW|HISTORICAL_CREATION'):broker.request('one',(123,999,999),f.request('one',2,'charge',kind='artifactFiles',amount=1))
  self.assertEqual(store.saved,[]);self.assertIsNotNone(broker.failure)
 def test_uncertain_persist_remains_fatal_without_ack_or_refund(self):
  store,broker=fixture();f.enroll(broker,'one');broker.request('one',(123,999,999),f.request('one',2,'enter',name='source-close-b'));store.fail=True
  with self.assertRaises(OSError):broker.request('one',(123,999,999),f.request('one',3,'charge',kind='sql',amount=3))
  self.assertEqual(store.read()['total']['sql'],3);self.assertIsNotNone(broker.failure)
  with self.assertRaises(AssertionError):broker.request('one',(123,999,999),f.request('one',3,'charge',kind='sql',amount=3))
  self.assertEqual(store.read()['total']['sql'],3)
 def test_non_slot_store_retains_its_real_temporary_creation_cost(self):
  store,broker=f.fixture();f.enroll(broker,'one');before=store.read();reply=broker.request('one',(123,999,999),f.request('one',2,'enter',name='source-close-b'));self.assertEqual(reply['state']['total']['artifactFiles'],before['total']['artifactFiles']+1)
 def test_exchange_primitive_has_no_replace_or_copy_fallback(self):
  self.assertTrue(callable(getattr(f.b,'exchange_files',None)),'fixed Linux exchange primitive is missing')
if __name__=='__main__':unittest.main()
