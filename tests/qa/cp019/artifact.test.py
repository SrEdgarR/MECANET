"""Provenance negative guards only: no archive, secrets, Docker or Git."""
import unittest,importlib.util,pathlib,json,copy,tempfile
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('artifact',pathlib.Path(__file__).with_name('artifact.py'));a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
root=pathlib.Path(__file__).resolve().parents[3]
class BuildOracle(unittest.TestCase):
 def test_runtime_selector_keeps_executable_sources_locks_helpers_and_license(self):
  for p in ['server/saas/db/migrations/006-control-recovery.sql','server/saas/package-lock.json','tests/qa/cp019/target-runtime.mjs','tests/qa/cp019/target-host.py','tests/qa/cp019/resource-sample.py','tests/qa/infra/nginx.conf']:
   self.assertTrue(a.runtime_tracked_file(p),p)
  for p in ['package.json','tests/qa/issuer.js']:
   self.assertTrue(a.runtime_tracked_file(p),p)
  for p in ['tests/qa/cp019/browser.test.mjs','tests/qa/cp019/host.test.py','tests/qa/cp014/entry.mjs','tests/qa/cp019/.env','tests/qa/cp019/notes.md']:
   self.assertFalse(a.runtime_tracked_file(p),p)
  for p in ['pg/lib/index.js','pg/package.json','pg/LICENSE','helmet/index.cjs','bcryptjs/dist/bcrypt.js','pg/lib/example.sql']:
   self.assertTrue(a.runtime_dependency_file(p),p)
  for p in ['pg/README.md','helmet/index.d.ts','helmet/index.d.cts','pg/.eslintrc','pg/debug.js.map','.bin/mime.cmd','bcryptjs/dist/bcrypt.min.js.gz']:
   self.assertFalse(a.runtime_dependency_file(p),p)
 def test_runtime_r03_excludes_historical_r02_resume_and_compatibility_controllers(self):
  for name in ['resume.py','resume-state.py','compose-compat.py']:
   with self.subTest(name=name):self.assertFalse(a.runtime_tracked_file('tests/qa/cp019/'+name))
 def runtime(self):
  return {'package.json':b'{"type":"module","main":"server.js"}',
   'server/saas/package.json':b'{"type":"module","dependencies":{"dep":"1.0.0"}}',
   'tests/qa/cp019/entry.mjs':b"import {issue} from '../issuer.js';export {issue} from '../issuer.js';await import('../../../server/saas/app.js');",
   'tests/qa/issuer.js':b"import {randomUUID} from 'node:crypto';export const issue=randomUUID;",
   'server/saas/app.js':b"import dep from 'dep';export default dep;",
   'server/saas/node_modules/dep/package.json':b'{"main":"index","exports":{"types":"./index.d.ts","import":"./index.mjs","require":"./index.js"}}',
   'server/saas/node_modules/dep/index.js':b'module.exports=1;',
   'server/saas/node_modules/dep/index.mjs':b'export default 1;'}
 def test_runtime_closure_accepts_package_scopes_literals_and_runtime_entries(self):
  a.validate_runtime_closure(self.runtime())
 def test_runtime_closure_rejects_missing_issuer_before_archive(self):
  entries=self.runtime();del entries['tests/qa/issuer.js']
  with self.assertRaisesRegex(AssertionError,'RUNTIME_IMPORT_REQUIRED'):a.validate_runtime_closure(entries)
 def test_runtime_closure_requires_root_esm_scope_without_legacy_entry(self):
  for value in [None,b'{"main":"server.js"}',b'{"type":"commonjs"}']:
   entries=self.runtime()
   if value is None:del entries['package.json']
   else:entries['package.json']=value
   with self.assertRaisesRegex(AssertionError,'ROOT_ESM_PACKAGE_REQUIRED'):a.validate_runtime_closure(entries)
 def test_runtime_closure_rejects_missing_static_reexport_and_dynamic_literal(self):
  for source in [b"import './absent.js';",b"export {x} from './absent.js';",b"await import('./absent.js');"]:
   entries=self.runtime();entries['server/saas/app.js']=source
   with self.assertRaisesRegex(AssertionError,'RUNTIME_IMPORT_REQUIRED'):a.validate_runtime_closure(entries)
 def test_runtime_closure_rejects_missing_or_undeclared_package(self):
  for mutate in [lambda e:e.pop('server/saas/node_modules/dep/package.json'),lambda e:e.update({'server/saas/app.js':b"import x from 'foreign';"})]:
   entries=self.runtime();mutate(entries)
   with self.assertRaisesRegex(AssertionError,'RUNTIME_PACKAGE_REQUIRED'):a.validate_runtime_closure(entries)
 def test_runtime_closure_requires_main_and_each_runtime_export(self):
  for name in ['server/saas/node_modules/dep/index.js','server/saas/node_modules/dep/index.mjs']:
   entries=self.runtime();del entries[name]
   with self.assertRaisesRegex(AssertionError,'RUNTIME_PACKAGE_ENTRY_REQUIRED'):a.validate_runtime_closure(entries)
 def test_runtime_closure_rejects_package_entry_escaping_package(self):
  entries=self.runtime();entries['server/saas/node_modules/dep/package.json']=b'{"main":"../../app.js"}'
  with self.assertRaisesRegex(AssertionError,'RUNTIME_PACKAGE_ENTRY_REQUIRED'):a.validate_runtime_closure(entries)
 def test_runtime_closure_never_guesses_extension_for_esm_import_or_export(self):
  entries=self.runtime();entries['tests/qa/cp019/entry.mjs']=b"import '../issuer';"
  with self.assertRaisesRegex(AssertionError,'RUNTIME_IMPORT_REQUIRED'):a.validate_runtime_closure(entries)
  entries=self.runtime();entries['server/saas/node_modules/dep/package.json']=b'{"main":"index","exports":"./index"}'
  with self.assertRaisesRegex(AssertionError,'RUNTIME_PACKAGE_ENTRY_REQUIRED'):a.validate_runtime_closure(entries)
 def test_runtime_closure_does_not_treat_computed_import_prefix_as_package(self):
  entries=self.runtime();entries['server/saas/app.js']=b"await import('data:text/javascript;base64,'+bytes);"
  a.validate_runtime_closure(entries)
 def test_incomplete_git_blob_runtime_cannot_open_archive_or_write_manifest(self):
  blobs={name:value for name,value in self.runtime().items() if '/node_modules/' not in name and name!='tests/qa/issuer.js'}
  # The fixture has no installed dependency; retain only a missing relative import.
  blobs['server/saas/package.json']=b'{"type":"module"}'
  blobs['server/saas/app.js']=b'export default 1;'
  def blob(*args):
   if args[0]=='rev-parse':return b'a'*40
   if args[0]=='status':return b''
   if args[0]=='ls-tree':
    self.assertIn('package.json',args);return '\n'.join(blobs).encode()
   name=args[1].split(':',1)[1]
   return b'{}' if name=='docs/evidence/cp019/ui-canonical-assets.json' else blobs[name]
  with tempfile.TemporaryDirectory() as temp:
   own=pathlib.Path(temp).resolve();(own/'.qa-private').mkdir()
   with patch.object(a.pathlib.Path,'cwd',return_value=own),patch.object(a,'git',side_effect=blob) as git,patch.object(a,'validate_build_oracle',return_value=[]),patch.object(a.tarfile,'open') as archive:
    with self.assertRaisesRegex(AssertionError,'RUNTIME_IMPORT_REQUIRED'):a.main()
    archive.assert_not_called();git.assert_any_call('show','a'*40+':package.json')
   self.assertEqual(list((own/'.qa-private').iterdir()),[])
 def test_previous_archive_or_manifest_is_preserved_before_git_or_archive(self):
  for existing in ['cp022-artifact.tar','cp022-artifact.json']:
   with tempfile.TemporaryDirectory() as temp:
    own=pathlib.Path(temp).resolve();private=own/'.qa-private';private.mkdir();retained=private/existing;retained.write_bytes(b'retained-evidence')
    with patch.object(a.pathlib.Path,'cwd',return_value=own),patch.object(a,'git',side_effect=AssertionError('GIT_MUST_NOT_RUN')) as git,patch.object(a.tarfile,'open') as archive:
     with self.assertRaisesRegex(AssertionError,'ARTIFACT_EXISTS_KEEP'):a.main()
     git.assert_not_called();archive.assert_not_called()
    self.assertEqual(retained.read_bytes(),b'retained-evidence')
 def oracle(self):return json.loads((root/'docs/evidence/cp019/ui-canonical-assets.json').read_text())
 def blob(self,*args):return (root/args[1].split(':',1)[1]).read_bytes()
 def test_complete_source_and_three_distinct_assets(self):self.assertEqual(len(a.validate_build_oracle(self.oracle(),'a'*40,self.blob)),3)
 def test_missing_empty_duplicate_foreign_inputs_rejected(self):
  for mutate in [lambda d:d.update(inputs=[]),lambda d:d['inputs'].pop(),lambda d:d['inputs'].__setitem__(1,copy.deepcopy(d['inputs'][0])),lambda d:d['inputs'][0].update(source='../.env')]:
   d=self.oracle();mutate(d)
   with self.assertRaises(AssertionError):a.validate_build_oracle(d,'a'*40,self.blob)
 def test_stale_hash_wrong_size_or_stage_target_rejected(self):
  for field,value in [('sha256','0'*64),('bytes',1),('target','client/package.json')]:
   d=self.oracle();d['inputs'][0][field]=value
   with self.assertRaises(AssertionError):a.validate_build_oracle(d,'a'*40,self.blob)
 def test_duplicate_missing_wrong_extension_extra_assets_rejected(self):
  for mutate in [lambda d:d['assets'].__setitem__(1,copy.deepcopy(d['assets'][0])),lambda d:d['assets'][0].update(path='client/dist-saas/assets/saas-other.js'),lambda d:d['assets'].append(copy.deepcopy(d['assets'][0])),lambda d:d['assets'][1].update(path='client/dist-saas/assets/saas-X.txt')]:
   d=self.oracle();mutate(d)
   with self.assertRaises(AssertionError):a.validate_build_oracle(d,'a'*40,self.blob)
class BudgetRuntimeFile(unittest.TestCase):
 def test_only_exact_public_budget_json_is_staged_for_runtime(self):
  self.assertTrue(a.runtime_tracked_file('tests/qa/cp019/budget-limits.json'))
  for name in ['tests/qa/cp019/credentials.json','tests/qa/cp019/material.json','tests/qa/cp019/.env']:self.assertFalse(a.runtime_tracked_file(name))

if __name__=='__main__':unittest.main()
