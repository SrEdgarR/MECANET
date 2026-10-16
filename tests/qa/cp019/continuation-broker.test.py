"""Broker models and real local AF_UNIX transport; not Linux fsync/peer proof."""
import copy,hashlib,importlib.util,json,os,pathlib,socket,subprocess,sys,tempfile,threading,time,unittest
P=pathlib.Path(__file__).resolve()
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
f=load('cp024_broker_fixtures',P.with_name('continuation-budget.test.py'));b=load('cp024_broker',P.with_name('continuation-broker.py'))
def context():return {'baseLedger':f.RAW,'baseLedgerHash':f.HASH,'admission':copy.deepcopy(f.ADMISSION),'admissionHash':hashlib.sha256(f.m.canonical(f.ADMISSION)).hexdigest()}
class MemoryStore:
 def __init__(self):self.value=f.fresh();self.saved=[];self.fail=False
 def read(self):return copy.deepcopy(self.value)
 def persist(self,state):
  self.value=copy.deepcopy(state);self.saved.append(copy.deepcopy(state))
  if self.fail:raise OSError('SYNTHETIC_FSYNC_ACK_LOST')
def fixture():
 store=MemoryStore();identity={'pid':os.getpid(),'procStart':'fixture-only'};broker=b.Broker(f.m,context(),store,store.read(),lambda:f.NOW,lambda record,peer:peer[1:]==(999,999),identity,root_identity=lambda:identity.copy());return store,broker
def register(broker,name):broker.register(name,{'containerId':'1'*64,'project':f.m.PROJECT,'service':'harness','ownerId':'fixture','uid':999,'scope':'source-window','case':'source-close-b','allowedEnterCases':['source-close-b']})
def request(client_id,n,method,**options):return {'schema':'cp024-budget-rpc-v1','clientId':client_id,'admissionHash':context()['admissionHash'],'sequence':n,'method':method,'scenario':'source-window','name':None,'kind':None,'amount':None,**options}
def enroll(broker,name):register(broker,name);return broker.request(name,(123,999,999),request(name,1,'enroll'))
class Broker(unittest.TestCase):
 def test_persist_temp_is_charged_in_same_sql_or_enter_transition(self):
  store,broker=fixture();enroll(broker,'one');before=store.read();entered=broker.request('one',(123,999,999),request('one',2,'enter',name='source-close-b'))['state'];after=broker.request('one',(123,999,999),request('one',3,'charge',kind='sql',amount=3))['state']
  self.assertEqual(entered['total']['artifactFiles'],before['total']['artifactFiles']+1);self.assertEqual(after['total']['artifactFiles'],before['total']['artifactFiles']+2);self.assertEqual(after['scenarios']['source-close-b']['total']['artifactFiles'],2);self.assertEqual(after['total']['sql'],3);self.assertEqual(after['sequence'],before['sequence']+2);self.assertEqual(len(store.saved),2)
 def test_artifact_charge_counts_its_internal_temp_without_recursion(self):
  store,broker=fixture();enroll(broker,'one');broker.request('one',(123,999,999),request('one',2,'enter',name='source-close-b'));before=store.read();after=broker.request('one',(123,999,999),request('one',3,'charge',kind='artifactFiles',amount=2))['state'];self.assertEqual(after['total']['artifactFiles'],before['total']['artifactFiles']+3);self.assertEqual(after['sequence'],before['sequence']+1);self.assertEqual(len(store.saved),2)
 def test_root_update_requires_exact_case_and_charges_temp_before_ack(self):
  store,broker=fixture();before=store.read();after=broker.root_update(lambda s:f.m.update(s,*broker.args(),'host-pg-start',f.NOW,kind='sql',amount=2),scenario='host-pg-start');self.assertEqual(after['total']['artifactFiles'],before['total']['artifactFiles']+1);self.assertEqual(after['scenarios']['host-pg-start']['total']['artifactFiles'],before['scenarios']['host-pg-start']['total']['artifactFiles']+1);self.assertEqual(after['sequence'],before['sequence']+1);self.assertEqual(after['total']['sql'],2)
 def test_temp_overflow_denies_before_persistence_and_latches(self):
  for global_limit in [False,True]:
   store,broker=fixture();state=store.read()
   for case,amount in ([('source-close-b',1998)] if not global_limit else [('source-close-b',1998),('source-migrate-a',1998),('source-migrate-b',1998),('source-migrate-central',1257)]):state=f.m.update(state,*broker.args(),case,f.NOW,kind='artifactFiles',amount=amount)
   state['activeScenarios']['source-window']='source-close-b';store.value=copy.deepcopy(state);broker.state=copy.deepcopy(state);enroll(broker,'one');before=store.read()
   with self.subTest(global_limit=global_limit),self.assertRaisesRegex(AssertionError,'OVERFLOW|HISTORICAL_CREATION'):broker.request('one',(123,999,999),request('one',2,'charge',kind='sql',amount=1))
   self.assertEqual(store.saved,[]);self.assertEqual(store.read(),before);self.assertIsNotNone(broker.failure)
 def test_enroll_and_snapshot_create_no_temp_and_add_no_charge(self):
  store,broker=fixture();before=store.read();enroll(broker,'one');broker.request('one',(123,999,999),request('one',2,'snapshot'));self.assertEqual(store.read(),before);self.assertEqual(store.saved,[])
 def test_root_wrong_case_cannot_move_internal_cost_to_another_case(self):
  store,broker=fixture()
  with self.assertRaisesRegex(AssertionError,'CASE_REQUIRED|CASE_MISMATCH'):broker.root_update(lambda s:f.m.update(s,*broker.args(),'source-close-b',f.NOW,kind='sql'),scenario='host-pg-start')
  self.assertEqual(store.saved,[]);self.assertIsNotNone(broker.failure)
 def test_ack_only_after_persistence_and_readback(self):
  store,broker=fixture();enroll(broker,'one');broker.request('one',(123,999,999),request('one',2,'enter',name='source-close-b'));reply=broker.request('one',(123,999,999),request('one',3,'charge',kind='sql',amount=3));self.assertEqual(reply['state'],store.saved[-1]);self.assertEqual(reply['state']['total']['sql'],3)
 def test_new_client_uses_live_root_highwater_not_a_stale_file_floor(self):
  store,broker=fixture();enroll(broker,'one');broker.request('one',(123,999,999),request('one',2,'enter',name='source-close-b'));broker.request('one',(123,999,999),request('one',3,'charge',kind='sql',amount=3));reply=enroll(broker,'two');self.assertEqual(reply['state']['total']['sql'],3)
  stale=store.read();stale['total']['sql']-=1;stale['scenarios']['source-close-b']['total']['sql']-=1;stale['sequence']-=1;store.value=stale;register(broker,'three')
  with self.assertRaisesRegex(AssertionError,'MEMORY_MISMATCH'):broker.request('three',(123,999,999),request('three',1,'enroll'))
  self.assertIsNotNone(broker.failure)
 def test_different_root_lifetime_cannot_adopt_even_an_initial_exact_ledger(self):
  store=MemoryStore()
  with self.assertRaisesRegex(AssertionError,'LIFETIME_MISMATCH'):b.Broker(f.m,context(),store,store.read(),lambda:f.NOW,lambda *args:True,{'pid':os.getpid(),'procStart':'old'},root_identity=lambda:{'pid':os.getpid(),'procStart':'new'})
 def test_root_stopped_is_irreversible_for_existing_and_new_clients(self):
  store,broker=fixture();enroll(broker,'one');broker.stop()
  with self.assertRaisesRegex(AssertionError,'LIFETIME_ENDED'):broker.request('one',(123,999,999),request('one',2,'snapshot'))
  with self.assertRaises(AssertionError):register(broker,'two')
 def test_lost_persist_ack_never_returns_success_or_refunds(self):
  store,broker=fixture();enroll(broker,'one');broker.request('one',(123,999,999),request('one',2,'enter',name='source-close-b'));store.fail=True
  with self.assertRaises(OSError):broker.request('one',(123,999,999),request('one',3,'charge',kind='sql',amount=3))
  self.assertEqual(store.read()['total']['sql'],3)
  with self.assertRaises(AssertionError):broker.request('one',(123,999,999),request('one',3,'charge',kind='sql',amount=3))
  self.assertEqual(store.read()['total']['sql'],3)
 def test_wrong_uid_alias_replayed_sequence_or_closed_client_denies(self):
  for change in ['uid','case','sequence','ended']:
   store,broker=fixture();enroll(broker,'one');peer=(123,0,0) if change=='uid' else (123,999,999);req=request('one',2,'enter',name='target-configure' if change=='case' else 'source-close-b')
   if change=='sequence':req['sequence']=1
   if change=='ended':broker.ended('one',(123,999,999))
   with self.subTest(change=change),self.assertRaises(AssertionError):broker.request('one',peer,req)
 def test_two_threads_never_lose_or_duplicate_charges(self):
  store,broker=fixture();enroll(broker,'one');enroll(broker,'two');broker.request('one',(123,999,999),request('one',2,'enter',name='source-close-b'));errors=[]
  def work(name,start):
   try:
    for n in range(start,start+30):broker.request(name,(123,999,999),request(name,n,'charge',kind='sql',amount=1))
   except BaseException as e:errors.append(str(e))
  threads=[threading.Thread(target=work,args=('one',3)),threading.Thread(target=work,args=('two',2))]
  for t in threads:t.start()
  for t in threads:t.join()
  self.assertEqual(errors,[]);self.assertEqual(store.read()['total']['sql'],60);self.assertEqual(len(store.saved),61)
 def test_stopping_with_a_live_client_never_claims_fin(self):
  store,broker=fixture();server=b.UnixServer(broker,'/fixture-not-bound');server.connections.add(type('Connection',(),{'shutdown':lambda *args:None})());result=server.stop();self.assertEqual(result['clientFIN'],'NOT VERIFIED');self.assertEqual(result['failure'],'BROKER_STOP_WITH_LIVE_CLIENTS')
if __name__=='__main__':unittest.main()
