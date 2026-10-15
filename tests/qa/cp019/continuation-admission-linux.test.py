"""Ephemeral Linux Root claim filesystem and a real second Root process.

No PostgreSQL, HTTP, production or VPS. The fixed r03-named directory is a
synthetic adapter fixture on a disposable CI runner; it must not exist before
this test. Gate references, domain material and times are explicitly models.
"""
import copy,importlib.util,json,os,pathlib,subprocess,sys,unittest,uuid
P=pathlib.Path(__file__).resolve()
def load(name,file):s=importlib.util.spec_from_file_location(name,file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
f=load('cp024_linux_admission_fixtures',P.with_name('continuation-admission.test.py'));a=f.a;ROOT=a.ROOT
class RootClaim(unittest.TestCase):
 def test_exclusive_claim_is_durable_and_second_process_cannot_adopt(self):
  self.assertEqual(os.geteuid(),0);self.assertFalse(ROOT.exists());self.assertFalse(ROOT.is_symlink());token=str(uuid.uuid4());dirs=[];files=[]
  def directory(path):path.mkdir(mode=0o700);dirs.append(path)
  def file(path,raw):
   with path.open('xb') as out:out.write(raw);out.flush();os.fchmod(out.fileno(),0o400);os.fsync(out.fileno())
   files.append(path)
  try:
   directory(ROOT);directory(ROOT/'master');file(ROOT/'ci-owner.json',a.canonical({'owner':'isolated-ci-claim-test','identity':token}));pins={k:'a'*64 for k in ['quality','independentReview','transport','environment','publicationProjection']};store=a.RootClaimStore();claim=a.create_claim(f.f.f.m,f.f.context(),store,pins,clock=lambda:f.f.f.NOW);dirs.extend([ROOT/'master/continuations',ROOT/'master/continuations/v2']);files.append(store.path)
   self.assertEqual(store.read(),claim.body);self.assertEqual(claim.body['rootLifetime'],a.root_identity());self.assertTrue(claim.check_live());self.assertEqual(store.path.stat().st_uid,0);self.assertEqual(store.path.stat().st_mode&0o777,0o400)
   code="import importlib.util,pathlib,sys;s=importlib.util.spec_from_file_location('fixture',sys.argv[1]);f=importlib.util.module_from_spec(s);s.loader.exec_module(f);a=f.a;pins={k:'a'*64 for k in ['quality','independentReview','transport','environment','publicationProjection']}\ntry:a.create_claim(f.f.f.m,f.f.context(),a.RootClaimStore(),pins,clock=lambda:f.f.f.NOW)\nexcept AssertionError as e:assert str(e)=='ADMISSION_PRIOR_PARTIAL_ATTEMPT';print('SECOND_ROOT_DENIED');sys.exit(0)\nraise SystemExit('UNSAFE_ADOPTION')"
   env={k:v for k,v in os.environ.items() if k in ['PATH','LANG','LC_ALL','HOME','TMPDIR']};child=subprocess.run([sys.executable,'-B','-c',code,str(P.with_name('continuation-admission.test.py'))],capture_output=True,text=True,timeout=10,env=env);self.assertEqual(child.returncode,0,child.stderr);self.assertEqual(child.stdout.strip(),'SECOND_ROOT_DENIED');self.assertEqual(store.read(),claim.body);print(json.dumps({'schema':'cp024-ci-exclusive-claim-v1','physical':'Linux Root filesystem and two OS processes','result':'PASS','vps':'NOT USED','arm64Recovery':'NOT VERIFIED','domainGateReferences':'synthetic; not an Environment Gate','sharedResourcesModified':False}))
  finally:
   if (ROOT/'ci-owner.json').exists():
    self.assertEqual(json.loads((ROOT/'ci-owner.json').read_text()),{'owner':'isolated-ci-claim-test','identity':token});actual={ROOT,*ROOT.rglob('*')};expected={*dirs,*files};self.assertEqual(actual,expected,'UNKNOWN resources KEEP; no broad cleanup')
    for path in reversed(files):self.assertEqual(path.resolve(),path);self.assertFalse(path.is_symlink());path.unlink()
    for path in reversed(dirs):self.assertEqual(path.resolve(),path);self.assertFalse(path.is_symlink());path.rmdir()
if __name__=='__main__':
 if sys.platform!='linux' or not hasattr(os,'geteuid') or os.geteuid()!=0:raise SystemExit('NOT VERIFIED: exclusive ephemeral Linux CI as Root only; never run on VPS')
 unittest.main()
