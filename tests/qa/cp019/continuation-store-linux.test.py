"""Ephemeral Linux Root fsync adapter; never executed on the shared VPS.

This fixture refuses an existing exact destination. It tests the fixed adapter
without a generic path override. CID/SQL/domain data and clock are synthetic.
The timing is runner evidence only, never capacity proof for Oracle ARM64.
"""
import copy,hashlib,importlib.util,json,os,pathlib,socket,stat,sys,time,unittest,uuid
P=pathlib.Path(__file__).resolve();s=importlib.util.spec_from_file_location('cp024_store_fixture',P.with_name('continuation-broker.test.py'));f=importlib.util.module_from_spec(s);s.loader.exec_module(f)
ROOT=pathlib.Path('/opt/mecanet-qa-p1l3-r03')
class RootStore(unittest.TestCase):
 def test_real_fsync_readback_and_exact_root_rollback_detection(self):
  self.assertEqual(os.geteuid(),0);self.assertFalse(ROOT.exists());self.assertFalse(ROOT.is_symlink());created=[];directories=[];token=str(uuid.uuid4())
  def directory(path,uid=0):path.mkdir(mode=0o700);os.chown(path,uid,uid);directories.append(path)
  def file(path,raw,mode=0o400,uid=0):
   with path.open('xb') as out:out.write(raw);out.flush();os.fchown(out.fileno(),uid,uid);os.fchmod(out.fileno(),mode);os.fsync(out.fileno())
   created.append(path)
  try:
   directory(ROOT);file(ROOT/'ci-owner.json',f.b.canonical({'owner':'isolated-ci-store-test','identity':token}));directory(ROOT/'budget');directory(ROOT/'budget/continuations');directory(ROOT/'budget/continuations/v2',999)
   path=ROOT/'budget/continuations/v2/ledger.json';file(path,f.b.canonical(f.f.fresh()),0o600,999);file(path.with_name('ledger-slot.json'),f.b.canonical(f.f.fresh()),0o600,999);store=f.b.RootFileStore(path);identity={'pid':os.getpid(),'procStart':f.b.proc_start(os.getpid())};broker=f.b.Broker(f.f.m,f.context(),store,store.read(),lambda:f.f.NOW,lambda *args:True,identity)
   initial_names={p.name for p in path.parent.iterdir()};initial_inodes={p.stat().st_ino for p in path.parent.iterdir()};artifacts_before=store.read()['total']['artifactFiles'];f.enroll(broker,'one');broker.request('one',(123,999,999),f.request('one',2,'enter',name='source-close-b'));start=time.perf_counter();durations=[]
   for sequence in range(3,259):
    before=time.perf_counter();reply=broker.request('one',(123,999,999),f.request('one',sequence,'charge',kind='sql',amount=1));durations.append(time.perf_counter()-before);self.assertEqual(reply['state'],store.read())
   elapsed=time.perf_counter()-start;self.assertEqual(store.read()['total']['sql'],256);self.assertEqual(path.stat().st_uid,999);self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600);self.assertEqual(store.read()['total']['artifactFiles'],artifacts_before);self.assertEqual({p.name for p in path.parent.iterdir()},initial_names);self.assertEqual({p.stat().st_ino for p in path.parent.iterdir()},initial_inodes)
   # A new client cannot conceal rollback above the v1 floor from live Root.
   prior=store.read();prior['sequence']-=1;prior['total']['sql']-=1;prior['scenarios']['source-close-b']['total']['sql']-=1;store.persist(prior);f.register(broker,'two')
   with self.assertRaisesRegex(AssertionError,'MEMORY_MISMATCH'):broker.request('two',(123,999,999),f.request('two',1,'enroll'))
   self.assertIsNotNone(broker.failure)
   print(json.dumps({'schema':'cp024-ci-fsync-measurement-v1','environment':'ephemeral Linux runner only; not VPS capacity','durableCharges':256,'elapsedSeconds':elapsed,'maximumChargeSeconds':max(durations),'meanChargeSeconds':sum(durations)/len(durations),'projection8192ChargesMeanOnlySeconds':8192*sum(durations)/len(durations),'includesSql':False,'arm64Acceptance':'NOT VERIFIED','capacityVerified':False}))
  finally:
   # An unexpected path or missing identity retains the fixture instead of
   # deleting an unproven resource. Every removal is exact and non-recursive.
   if (ROOT/'ci-owner.json').exists():
    self.assertEqual(json.loads((ROOT/'ci-owner.json').read_text()),{'owner':'isolated-ci-store-test','identity':token});expected={*created,*directories};actual={ROOT,*ROOT.rglob('*')};self.assertEqual(actual,expected,'UNKNOWN resources KEEP; no broad cleanup')
    for path in reversed(created):self.assertEqual(path.resolve(),path);self.assertFalse(path.is_symlink());path.unlink()
    for path in reversed(directories):self.assertEqual(path.resolve(),path);self.assertFalse(path.is_symlink());path.rmdir()
if __name__=='__main__':
 if sys.platform!='linux' or not hasattr(os,'geteuid') or os.geteuid()!=0:raise SystemExit('NOT VERIFIED: requires exclusive ephemeral Linux CI as Root; never run on VPS')
 unittest.main()
