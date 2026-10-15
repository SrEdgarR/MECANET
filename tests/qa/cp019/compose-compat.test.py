"""Pure compatibility boundary models; no Docker, SSH, files or QA effects."""
import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('compose_compat',pathlib.Path(__file__).with_name('compose-compat.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
SOURCE='mecanet-qa-p1l3-r02';TARGET=SOURCE+'-target'
HELP='Usage: docker compose create [OPTIONS] [SERVICE...]\nOptions:\n      --no-build       Do not build an image\n      --no-recreate    Do not recreate containers that already exist\n      --pull string    Pull image before running (always|missing|never)\n'
def frame(project=SOURCE,services=('postgres',)):return ('docker','compose','-f','/opt/'+project+'/compose.json','create','--no-build','--pull','never','--no-deps',*services)
class Compatibility(unittest.TestCase):
 def test_only_closed_frames_change_one_flag_after_positive_callback(self):
  for project in [SOURCE,TARGET]:
   for services in [('postgres',),('worker',),('api1','api2','web')]:
    calls=[];args=frame(project,services);out=c.adapted_create(args,create_help=HELP,validatePrerequisites=lambda p,s:calls.append((p,s)) or True)
    self.assertEqual(calls,[(project,services)]);self.assertEqual(out,args[:8]+('--no-recreate',)+args[9:]);self.assertEqual(args[8],'--no-deps');self.assertIsInstance(out,tuple)
 def test_positional_abi_preserves_caller_arguments(self):
  args=list(frame());before=list(args);out=c.adapted_create(args,HELP,lambda *_:True);self.assertEqual(args,before);self.assertEqual(out[8],'--no-recreate')
 def test_callback_false_missing_nonbool_or_exception_never_transform(self):
  for callback in [None,lambda *_:None,lambda *_:False,lambda *_:1,lambda *_:'PASS',lambda *_:{'status':'PASS'}]:
   with self.assertRaisesRegex(AssertionError,'COMPOSE_PREREQUISITES'):c.adapted_create(frame(),create_help=HELP,validatePrerequisites=callback)
  def raising(*_):raise RuntimeError('PRIVATE_SENTINEL')
  with self.assertRaisesRegex(AssertionError,'^COMPOSE_PREREQUISITES_UNVERIFIED$'):c.adapted_create(frame(),create_help=HELP,validatePrerequisites=raising)
 def test_help_must_advertise_actual_primary_option_and_not_support_no_deps(self):
  for help_text in [None,'','description mentions --no-recreate only','  --no-recreate-bad x',HELP+'      --no-deps   Skip dependencies\n',b'--no-recreate',HELP+'\x00']:
   calls=[]
   with self.assertRaisesRegex(AssertionError,'COMPOSE_CREATE_CAPABILITY'):c.adapted_create(frame(),create_help=help_text,validatePrerequisites=lambda *_:calls.append(1) or True)
   self.assertEqual(calls,[])
 def test_unknown_paths_traversals_prod_networks_contexts_and_flags_are_rejected(self):
  original=list(frame());cases=[]
  for path in ['/opt/production/compose.json','/opt/'+SOURCE+'/../'+TARGET+'/compose.json','/opt/'+SOURCE+'/variants/x/compose.json','/opt/'+SOURCE+'/compose.yaml','/opt/'+SOURCE+'/compose.json/','relative/compose.json','/opt/'+SOURCE+'/networks/data']:
   v=list(original);v[3]=path;cases.append(v)
  cases += [original[:4]+['--profile','tools']+original[4:],['docker','--context','production',*original[1:]],['docker','compose','-p','prod',*original[2:]],original[:5]+['--force-recreate',*original[5:]],original[:8]+['--no-recreate',*original[9:]],original+['--network','host'],original+['postgres'],original[:9],original[:9]+['api1'],original[:9]+['worker','postgres'],original[:9]+['web','api2','api1'],original[:9]+['harness']]
  for args in cases:
   calls=[]
   with self.subTest(args=args),self.assertRaises(AssertionError):c.adapted_create(args,create_help=HELP,validatePrerequisites=lambda *_:calls.append(1) or True)
   self.assertEqual(calls,[])
 def test_non_create_commands_pass_through_without_help_or_callback(self):
  for args in [('docker','ps','-a'),('docker','inspect','--format','SAFE','a'*64),('docker','compose','-f','/opt/'+SOURCE+'/compose.json','ps','-a','-q','postgres'),('docker','compose','-f','/opt/'+TARGET+'/compose.json','start','postgres'),('node','create')]:
   out=c.adapted_create(args);self.assertEqual(out,args)
 def test_compose_create_cannot_hide_behind_global_flags_or_alternate_executables(self):
  for args in [('/usr/bin/docker',*frame()[1:]),('docker-compose',*frame()[2:]),('docker','--context','prod',*frame()[1:]),('docker','compose','--project-directory','/opt/prod',*frame()[2:]),('docker','compose','-f','/opt/prod/compose.json','create','postgres')]:
   with self.assertRaises(AssertionError):c.adapted_create(args,create_help=HELP,validatePrerequisites=lambda *_:True)
 def test_input_types_and_embedded_shell_or_env_are_not_interpreted(self):
  for args in ['docker compose create',None,('docker','compose',None,'create'),('docker','compose','-f','/opt/'+SOURCE+'/compose.json','create','--no-build','--pull','never','--no-deps','postgres;id'),('docker','compose','-f','/opt/'+SOURCE+'/compose.json','create','--no-build','--pull','never','--no-deps','$(id)')]:
   with self.assertRaises(AssertionError):c.adapted_create(args,create_help=HELP,validatePrerequisites=lambda *_:True)
 def test_import_and_transform_do_not_read_environment_spawn_or_write(self):
  # This module has no host/Docker/filesystem dependency: the only authority
  # it may invoke is the caller's explicit Root prerequisite validator.
  import ast
  tree=ast.parse(pathlib.Path(c.__file__).read_text());imports=[n for n in ast.walk(tree) if isinstance(n,(ast.Import,ast.ImportFrom))]
  self.assertEqual(len(imports),1);self.assertIsInstance(imports[0],ast.Import);self.assertEqual([n.name for n in imports[0].names],['re'])

if __name__=='__main__':unittest.main()
