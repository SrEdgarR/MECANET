"""Exact Linux two-slot fault tests, exclusive ephemeral CI only; never VPS.

These tests refuse an existing /opt/r03 root, pin their own identity and remove
only positively enumerated files. They neither START a container nor use SQL.
"""
import copy,importlib.util,json,os,pathlib,sys,unittest,uuid
from unittest.mock import patch
P=pathlib.Path(__file__).resolve();s=importlib.util.spec_from_file_location('cp026_slot_linux_fixtures',P.parents[1]/'cp019/continuation-broker.test.py');f=importlib.util.module_from_spec(s);s.loader.exec_module(f)
ROOT=pathlib.Path('/opt/mecanet-qa-p1l3-r03')
class SlotsLinux(unittest.TestCase):
 def setUp(self):
  self.assertEqual(os.geteuid(),0);self.assertFalse(ROOT.exists());self.assertFalse(ROOT.is_symlink());self.files=[];self.dirs=[];self.owner=str(uuid.uuid4())
  for p,uid in [(ROOT,0),(ROOT/'budget',0),(ROOT/'budget/continuations',0),(ROOT/'budget/continuations/v2',999)]:p.mkdir(mode=0o700);os.chown(p,uid,uid);self.dirs.append(p)
  self.put(ROOT/'ci-owner.json',{'owner':self.owner},0,0o400);self.path=ROOT/'budget/continuations/v2/ledger.json';self.put(self.path,f.f.fresh());self.put(self.path.with_name('ledger-slot.json'),f.f.fresh())
 def put(self,p,value,uid=999,mode=0o600):
  with p.open('xb') as out:out.write(f.b.canonical(value));out.flush();os.fchown(out.fileno(),uid,uid);os.fchmod(out.fileno(),mode);os.fsync(out.fileno())
  self.files.append(p)
 def tearDown(self):
  self.assertEqual(json.loads((ROOT/'ci-owner.json').read_text()),{'owner':self.owner});self.assertEqual({ROOT,*ROOT.rglob('*')},{*self.files,*self.dirs},'UNKNOWN resource KEEP')
  for p in reversed(self.files):self.assertEqual(p.resolve(),p);self.assertFalse(p.is_symlink());p.unlink()
  for p in reversed(self.dirs):self.assertEqual(p.resolve(),p);self.assertFalse(p.is_symlink());p.rmdir()
 def ready(self):
  store=f.b.RootFileStore(self.path);identity={'pid':os.getpid(),'procStart':f.b.proc_start(os.getpid())};broker=f.b.Broker(f.f.m,f.context(),store,store.read(),lambda:f.f.NOW,lambda *a:True,identity);f.enroll(broker,'one');return store,broker
 def call(self,broker):return broker.request('one',(123,999,999),f.request('one',2,'enter',name='source-close-b'))
 def test_kernel_filesystem_support_is_probed_before_a_broker_can_enable_effects(self):
  before=self.path.read_bytes()
  with patch.object(f.b,'exchange_files',side_effect=OSError('SYNTHETIC_UNSUPPORTED_FS')),self.assertRaises(OSError):f.b.RootFileStore(self.path)
  self.assertEqual(self.path.read_bytes(),before)
 def test_exchange_denied_keeps_old_published_ledger_and_permanently_rejects(self):
  store,broker=self.ready();before=store.read()
  with patch.object(f.b,'exchange_files',side_effect=OSError('SYNTHETIC_EXCHANGE_UNSUPPORTED')),self.assertRaises(OSError):self.call(broker)
  self.assertEqual(store.read(),before);self.assertIsNotNone(store.failure);self.assertIsNotNone(broker.failure)
  with self.assertRaises(AssertionError):self.call(broker)
  with self.assertRaisesRegex(AssertionError,'PREVIOUS_FAILURE'):store.persist(before)
 def test_zero_short_write_keeps_old_published_ledger_and_is_fatal(self):
  store,broker=self.ready();before=store.read()
  with patch.object(f.b.os,'write',return_value=0),self.assertRaisesRegex(AssertionError,'SHORT_WRITE'):self.call(broker)
  self.assertEqual(store.read(),before);self.assertIsNotNone(broker.failure)
 def test_file_fsync_failure_never_exchanges_or_acks(self):
  store,broker=self.ready();before=store.read()
  with patch.object(f.b.os,'fsync',side_effect=OSError('SYNTHETIC_FILE_FSYNC')),patch.object(f.b,'exchange_files') as exchange,self.assertRaises(OSError):self.call(broker)
  exchange.assert_not_called();self.assertEqual(store.read(),before);self.assertIsNotNone(broker.failure)
 def test_directory_fsync_failure_after_exchange_has_no_ack_or_retry(self):
  store,broker=self.ready();before=store.read()
  with patch.object(f.b,'syncdir',side_effect=OSError('SYNTHETIC_DIR_FSYNC')),self.assertRaises(OSError):self.call(broker)
  self.assertEqual(store.read()['sequence'],before['sequence']+1);self.assertEqual(store.read()['total'],before['total']);self.assertIsNotNone(broker.failure)
  with self.assertRaises(AssertionError):self.call(broker)
 def test_missing_precreated_slot_cannot_initialize_or_create_one(self):
  shadow=self.path.with_name('ledger-slot.json');shadow.unlink();self.files.remove(shadow)
  with self.assertRaises(FileNotFoundError):f.b.RootFileStore(self.path)
  self.assertFalse(shadow.exists())
 def test_changed_shadow_contents_or_custody_deny_before_exchange(self):
  store,broker=self.ready();shadow=self.path.with_name('ledger-slot.json');before=store.read();changed=copy.deepcopy(before);changed['sequence']+=1
  shadow.write_bytes(f.b.canonical(changed))
  with patch.object(f.b,'exchange_files') as exchange,self.assertRaisesRegex(AssertionError,'SLOT_IDENTITY_CHANGED'):self.call(broker)
  exchange.assert_not_called();self.assertEqual(store.read(),before);self.assertIsNotNone(broker.failure)
 def test_slot_hardlink_or_identical_inode_cannot_initialize(self):
  shadow=self.path.with_name('ledger-slot.json');shadow.unlink();os.link(self.path,shadow)
  with self.assertRaisesRegex(AssertionError,'CUSTODY'):f.b.RootFileStore(self.path)
if __name__=='__main__':
 if sys.platform!='linux' or not hasattr(os,'geteuid') or os.geteuid()!=0:raise SystemExit('NOT VERIFIED: exclusive ephemeral Linux Root CI required; never VPS')
 unittest.main()
