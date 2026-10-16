"""Pure Root overlay and bounded local tar tests; no actual cohort publication."""
import copy,hashlib,importlib.util,io,json,pathlib,tarfile,tempfile,unittest
from unittest.mock import patch
P=pathlib.Path(__file__).resolve()
def load(name,file):
 s=importlib.util.spec_from_file_location(name,file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('cp024_overlay',P.with_name('runtime-overlay.py'));b=load('cp024_overlay_builder',P.with_name('continuation-artifact.py'))
def row(path,raw=b'x'):return {'path':path,'bytes':len(raw),'sha256':m.digest(raw)}
def artifact(rows,sha):
 rows=copy.deepcopy(sorted(rows,key=lambda e:e['path']));return {'schema':'cp019-artifact-v1','baseline':m.BASE,'sourceSha':sha,'codeSha':sha,'digest':'sha256:'+m.digest(rows),'entries':rows}
def fixture():
 old=artifact([row('package.json'),row('tests/qa/cp019/ledger.mjs')],m.OLD);new=artifact(old['entries']+[row('tests/qa/cp019/continuation-budget.py')],'b'*40);material='c'*64;overlay=m.make_overlay(old,new,material);return old,new,material,overlay
class Overlay(unittest.TestCase):
 def test_explicit_overlay_keeps_original_binding_and_sources(self):
  old,new,material,overlay=fixture();before=copy.deepcopy(old);self.assertEqual(m.validate_overlay(old,new,material,overlay,m.digest(old),m.digest(overlay)),overlay);self.assertEqual(old,before);self.assertEqual(overlay['originalArtifactDigest'],old['digest'][7:]);self.assertEqual(overlay['effectiveArtifactDigest'],new['digest'][7:])
 def test_change_to_product_deps_ui_or_budgets_denies(self):
  old,new,material,overlay=fixture()
  for path in ['server/saas/app.js','server/saas/node_modules/pg/index.js','client/dist-saas/x.js','tests/qa/cp019/budget-limits.json','tests/qa/cp019/x.test.py']:
   with self.subTest(path=path),self.assertRaises(AssertionError):m.make_overlay(old,artifact(new['entries']+[row(path)],'b'*40),material)
 def test_wrong_sql_fix_denies(self):
  old,new,material,overlay=fixture();old=artifact(old['entries']+[row('server/saas/db/migrations/006-control-recovery.sql')],m.OLD);new=artifact(old['entries']+[row('tests/qa/cp019/new.py')],'b'*40);new['entries'][1]['sha256']='f'*64;new['digest']='sha256:'+m.digest(new['entries'])
  with self.assertRaisesRegex(AssertionError,'OVERLAY_SQL_FIX'):m.make_overlay(old,new,material)
 def test_removal_duplicate_path_and_material_change_deny(self):
  old,new,material,overlay=fixture()
  with self.assertRaisesRegex(AssertionError,'REMOVAL'):m.make_overlay(old,artifact(new['entries'][1:],'b'*40),material)
  with self.assertRaisesRegex(AssertionError,'ENTRY'):m.make_overlay(old,artifact(new['entries']+[new['entries'][0]],'b'*40),material)
  with self.assertRaisesRegex(AssertionError,'CONTENT'):m.validate_overlay(old,new,'f'*64,overlay,m.digest(old),m.digest(overlay))
 def test_wrong_external_overlay_anchor_denies(self):
  old,new,material,overlay=fixture()
  with self.assertRaisesRegex(AssertionError,'ANCHOR'):m.validate_overlay(old,new,material,overlay,m.digest(old),'f'*64)
 def test_dirty_or_different_git_head_denies_before_archive_access(self):
  root=P.parents[3]
  with patch.object(b,'git',side_effect=[b'b'*40+b'\n',b' M host.py']),self.assertRaisesRegex(AssertionError,'COMMIT_SOURCE_FIRST'):b.build(root,'b'*40)
  with patch.object(b,'git',return_value=b'c'*40+b'\n'),self.assertRaisesRegex(AssertionError,'COMMITTED_HEAD'):b.build(root,'b'*40)
 def tar(self,root,*,link=False,duplicate=False,path='package.json',wrong_hash=False):
  manifest=artifact([row('package.json')],m.OLD);raw=m.canonical(manifest);target=root/'input.tar'
  with tarfile.open(target,'x') as tar:
   for name,data in [('artifact.json',raw),(path,b'x')]+([(path,b'x')] if duplicate else []):
    entry=tarfile.TarInfo(name);entry.size=len(data)
    if link and name==path:entry.type=tarfile.SYMTYPE;entry.linkname='/etc/passwd';entry.size=0;tar.addfile(entry)
    else:tar.addfile(entry,io.BytesIO(data))
  if wrong_hash:manifest['entries'][0]['sha256']='e'*64
  return target,manifest,m.digest(raw)
 def test_only_exact_regular_original_tar_is_accepted(self):
  with tempfile.TemporaryDirectory() as d:
   tar,manifest,digest=self.tar(pathlib.Path(d))
   with patch.object(b,'ORIGINAL_MANIFEST',digest):self.assertEqual(b.original_entries(tar,manifest),{'package.json':b'x'})
 def test_link_traversal_duplicate_and_hash_substitution_deny(self):
  for options in [{'link':True},{'path':'../package.json'},{'duplicate':True},{'wrong_hash':True}]:
   with self.subTest(options=options),tempfile.TemporaryDirectory() as d:
    tar,manifest,digest=self.tar(pathlib.Path(d),**options)
    with patch.object(b,'ORIGINAL_MANIFEST',digest),self.assertRaises(AssertionError):b.original_entries(tar,manifest)
if __name__=='__main__':unittest.main()
