"""Pure publication planning negatives; no physical Root path or v2 effects."""
import copy,importlib.util,io,json,pathlib,tarfile,unittest
from unittest.mock import patch
P=pathlib.Path(__file__).resolve()
def load(name,path):s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
o=load('cp024_publication_overlay_fixtures',P.with_name('runtime-overlay.test.py'));p=load('cp024_publication',P.with_name('continuation-publication.py'));a=load('cp024_publication_admission',P.with_name('continuation-admission.test.py'))
def fixture():
 old,new,material,overlay=o.fixture();raw=o.m.canonical(old);files={r['path']:b'x' for r in new['entries']};files['artifact.json']=o.m.canonical(new);source={'name':p.ROOT.name,'services':{n:{} for n in ['postgres','api1','api2','worker','web','harness','probe']},'networks':{'data':{},'front':{}}};target={**source,'name':p.TARGET.name};return raw,files,o.m.canonical(overlay),o.m.canonical(source),o.m.canonical(target),material
def archive(files,kind=None):
 buffer=io.BytesIO()
 with tarfile.open(fileobj=buffer,mode='w') as tar:
  for name,raw in files.items():
   row=tarfile.TarInfo(name);row.size=len(raw)
   if kind and name!='artifact.json':row.type=tarfile.SYMTYPE;row.linkname='/etc/passwd';row.size=0;tar.addfile(row)
   else:tar.addfile(row,io.BytesIO(raw))
 return buffer.getvalue()
class Publication(unittest.TestCase):
 def prepare(self,mutate=None,kind=None):
  original,files,overlay,source,target,material=fixture()
  if mutate:mutate(files)
  with patch.object(p,'ORIGINAL',p.sha(original)),patch.object(p,'MATERIAL',material):return p.prepare(archive(files,kind),overlay,original,source,target,o.m)
 def test_tar_hash_closure_and_all_files_directories_are_reserved_before_publication(self):
  prepared=self.prepare();plan=prepared['plan'];self.assertEqual(plan['costs']['host-bootstrap'],15);self.assertEqual(plan['costs']['host-stage'],len(plan['runtimeDirectories'])+len(plan['runtimeFiles']));self.assertEqual(plan['costs']['host-config-source'],1);self.assertTrue(all(v.startswith('master/continuations/v2/runtime') for v in plan['runtimeDirectories']));self.assertNotIn('master/material.json',str(plan))
 def test_extra_missing_changed_link_and_traversal_input_denies_before_any_io(self):
  mutations=[lambda f:f.update({'extra':b'x'}),lambda f:f.pop('package.json'),lambda f:f.update({'package.json':b'wrong'}),lambda f:f.update({'../outside':b'x'})]
  for mutation in mutations:
   with self.subTest(mutation=mutation),self.assertRaises(AssertionError):self.prepare(mutation)
  with self.assertRaisesRegex(AssertionError,'TAR_SCOPE'):self.prepare(kind='link')
 def test_prepared_bytes_costs_and_paths_cannot_change_after_claim_binding(self):
  for change in ['bytes','costs','paths']:
   prepared=self.prepare();original,files,overlay,source,target,material=fixture()
   if change=='bytes':prepared['files']['package.json']=b'changed'
   if change=='costs':prepared['plan']['costs']['host-stage']-=1
   if change=='paths':prepared['plan']['runtimeDirectories'].append('../other')
   with patch.object(p,'ORIGINAL',p.sha(original)),patch.object(p,'MATERIAL',material),self.assertRaises(AssertionError):p.validate_prepared(prepared)
 def test_publication_reservation_is_accumulated_with_old_counters(self):
  prepared=self.prepare();store=a.MemoryStore();context=a.f.context();pins={k:'a'*64 for k in ['quality','independentReview','transport','environment','publicationProjection']};claim=a.a.create_claim(a.f.f.m,context,store,pins,identity=lambda:{'pid':123,'procStart':'456'},clock=lambda:a.f.f.NOW,publication=prepared['plan']);self.assertEqual(claim.body['publicationPlanHash'],p.sha(p.canonical(prepared['plan'])));self.assertEqual(claim.body['initialState']['total']['artifactFiles'],639+sum(prepared['plan']['costs'].values()));self.assertEqual(claim.body['initialState']['scenarios']['host-stage']['total']['artifactFiles'],a.f.f.BASE['scenarios']['host-stage']['total']['artifactFiles']+prepared['plan']['costs']['host-stage'])
 def test_publication_cannot_bypass_old_case_ceiling_or_unknown_case(self):
  for costs in [{'host-bootstrap':14,'host-stage':2000},{'host-bootstrap':14,'new-attempt':1},{'host-bootstrap':14,'host-stage':True}]:
   store=a.MemoryStore();context=a.f.context();pins={k:'a'*64 for k in ['quality','independentReview','transport','environment','publicationProjection']}
   with self.assertRaises(AssertionError):a.a.create_claim(a.f.f.m,context,store,pins,identity=lambda:{'pid':123,'procStart':'456'},clock=lambda:a.f.f.NOW,publication={'costs':costs})
   self.assertIsNone(store.value)
if __name__=='__main__':unittest.main()
