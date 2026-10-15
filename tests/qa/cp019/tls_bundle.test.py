import importlib.util,pathlib,tempfile,unittest,ssl,os,shutil,json,hashlib
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('tls_bundle',pathlib.Path(__file__).with_name('tls_bundle.py'));tls=importlib.util.module_from_spec(spec);spec.loader.exec_module(tls)
spec2=importlib.util.spec_from_file_location('cp019host',pathlib.Path(__file__).with_name('host.py'));host=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(host)

class TLSBundle(unittest.TestCase):
 def test_missing_binary_fails_before_creation(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp)/'bundle'
   with self.assertRaisesRegex(AssertionError,'EXECUTABLE_REQUIRED'):tls.generate_bundle(root,pathlib.Path(temp)/'absent')
   self.assertFalse(root.exists())
 def test_preflight_checks_tls_before_resources_can_be_created(self):
  with patch.object(host,'tls_preflight',side_effect=AssertionError('TLS_INPUT_REQUIRED'),create=True),patch.object(host.os,'geteuid',return_value=0,create=True),patch.object(host.os,'uname',return_value=type('U',(),{'machine':'aarch64'})(),create=True),patch.object(host.pathlib.Path,'exists',return_value=False),patch.object(host.pathlib.Path,'resolve',lambda p:p),patch.object(host,'facts',return_value=[]),patch.object(host,'run',side_effect=lambda *args:'' if args[:4]==('docker','network','ls','-q') else 'arm64'),patch.object(host,'resources',return_value={}),patch.object(host.pathlib.Path,'mkdir') as mkdir:
   with self.assertRaisesRegex(AssertionError,'TLS_INPUT_REQUIRED'):host.preflight()
   mkdir.assert_not_called()
 def test_fixed_host_has_no_tls_shell_or_dependency_on_node_binary(self):
  import inspect
  source=inspect.getsource(host.configs)
  self.assertNotIn('openssl req',source)
  self.assertIn('tls_preflight(private_bytes=True)',source)

class LocalCertificates(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  binary=shutil.which('openssl') or ('C:/Program Files/Git/usr/bin/openssl.exe' if os.name=='nt' else '')
  assert binary,'LOCAL_TLS_TEST_EXECUTABLE_REQUIRED'
  cls.tmp=tempfile.TemporaryDirectory();cls.root=pathlib.Path(cls.tmp.name).resolve()/'certificates'
  cls.report=tls.generate_bundle(cls.root,binary)
 @classmethod
 def tearDownClass(cls):
  for p in cls.root.rglob('*'):
   if p.is_file():os.chmod(p,0o600)
  cls.tmp.cleanup()
 def test_four_actual_key_chain_hostname_handshakes(self):
  self.assertEqual(self.report['verifiedKeyPairs'],4);self.assertEqual(self.report['independentCAs'],2);self.assertFalse(self.report['networkUsed'])
 def test_wrong_hostname_is_rejected(self):
  b=self.root/tls.PROJECTS[0]
  with self.assertRaises(ssl.SSLCertVerificationError):tls.handshake(b/'ca.crt',b/'web/server.crt',b/'web/server.key','other.invalid')
 def test_other_environment_ca_is_rejected(self):
  b=self.root/tls.PROJECTS[0];other=self.root/tls.PROJECTS[1]
  with self.assertRaises(ssl.SSLCertVerificationError):tls.handshake(other/'ca.crt',b/'web/server.crt',b/'web/server.key','app.mecanet.test')
 def test_wrong_key_is_rejected(self):
  b=self.root/tls.PROJECTS[0]
  with self.assertRaises(ssl.SSLError):tls.handshake(b/'ca.crt',b/'web/server.crt',b/'postgres/server.key','app.mecanet.test')
 def test_modified_certificate_fails_hash_before_handshake(self):
  path=self.root/tls.PROJECTS[0]/'web/server.crt';original=path.read_bytes();os.chmod(path,0o600)
  try:
   path.write_bytes(original+b' ');os.chmod(path,0o400)
   with self.assertRaisesRegex(AssertionError,'TLS_HASH'):tls.validate_bundle(self.root)
  finally:os.chmod(path,0o600);path.write_bytes(original);os.chmod(path,0o400)
 def test_existing_material_is_never_regenerated(self):
  before=(self.root/'manifest.json').read_bytes()
  binary=shutil.which('openssl') or 'C:/Program Files/Git/usr/bin/openssl.exe'
  with self.assertRaisesRegex(AssertionError,'EXISTS_KEEP'):tls.generate_bundle(self.root,binary)
  self.assertEqual((self.root/'manifest.json').read_bytes(),before)
 def test_load_cannot_copy_bytes_changed_after_validation(self):
  path=self.root/tls.PROJECTS[0]/'web/server.crt';original=path.read_bytes();proof=tls.validate_bundle(self.root)
  try:
   os.chmod(path,0o600);path.write_bytes(original+b' ');os.chmod(path,0o400)
   with patch.object(tls,'validate_bundle',return_value=proof),self.assertRaisesRegex(AssertionError,'TLS_INPUT_CHANGED'):tls.load_bundle(self.root)
  finally:os.chmod(path,0o600);path.write_bytes(original);os.chmod(path,0o400)
 def test_private_snapshot_matches_manifest_and_hides_files_in_report(self):
  proof,files=tls.load_bundle(self.root)
  self.assertEqual(len(files),18);self.assertNotIn('files',proof);self.assertEqual(proof,self.report)

if __name__=='__main__':unittest.main()
