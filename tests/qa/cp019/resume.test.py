"""External controller models only: no Root, Docker, SSH or live state."""
import ast,importlib.util,pathlib,types,unittest
HERE=pathlib.Path(__file__).parent
s=importlib.util.spec_from_file_location('original_controller',HERE/'controller.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
def functions():
 tree=ast.parse((HERE/'resume.py').read_text());nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))];env={'controller':c,'plan':{'sourceSha':'a'*40},'extension':{'parentPlanHash':'b'*64,'preservedFiles':[1,2],'composeCreateHelp':'HELP'},'cleaning':False,'monitor':None};exec(compile(ast.Module(body=nodes,type_ignores=[]),'resume-isolated','exec'),env);return tree,env
class Resume(unittest.TestCase):
 def test_completed_steps_only_validate_and_never_rerun_original_generators(self):
  _,env=functions();calls=[]
  h=types.SimpleNamespace(**{name:lambda:(_ for _ in ()).throw(AssertionError('MUST_NOT_RUN')) for name in ['bootstrap','stage','material','configs','preflight']})
  port=env['ResumePort'](h,lambda name,fn:calls.append((name,fn())) or calls[-1][1],lambda:None,lambda:None)
  for name in ['bootstrap','stage','material','configs']:self.assertEqual(getattr(port,name)()['result'],'REUSED/VALIDATED')
  self.assertEqual([x[0] for x in calls],['reuse-bootstrap','reuse-stage','reuse-material','reuse-configs'])
 def test_resume_preflight_preserves_original_state_validation_and_stage_attestation(self):
  _,env=functions();calls=[];env['h']=object();env['resume_state']=types.SimpleNamespace(validate=lambda *a:calls.append('state') or {'result':'PASS'});env['validate_stage']=lambda *a:calls.append('stage')
  self.assertEqual(env['resume_preflight'](),{'result':'PASS'});self.assertEqual(calls,['state','stage'])
  env['resume_state'].validate=lambda *a:(_ for _ in ()).throw(AssertionError('OLD_LEDGER_EXPIRED'))
  with self.assertRaisesRegex(AssertionError,'OLD_LEDGER_EXPIRED'):env['resume_preflight']()
  self.assertEqual(calls,['state','stage'])
 def test_compatibility_is_explicit_in_external_wrapper_not_a_patch_to_old_helpers(self):
  _,env=functions();calls=[];env.update(require_control=lambda:calls.append('control'),original_run=lambda *a,**k:calls.append(a) or 'ACK',compat=types.SimpleNamespace(adapted_create=lambda args,help,cb:('SAFE',*args)),resume_state=types.SimpleNamespace(validate_prerequisites=lambda *a:True),h=object())
  self.assertEqual(env['guarded_run']('docker','compose'),'ACK');self.assertEqual(calls,['control',('SAFE','docker','compose')])
 def test_external_manifest_hash_and_parent_binding_are_required_before_loading_host(self):
  tree,_=functions();text=(HERE/'resume.py').read_text();self.assertLess(text.index("extension['parentPlanHash']"),text.index("h=load('cp021_host'"));self.assertIn("set(extension['helpers'])==EXTERNAL",text);self.assertIn("extension['helpers'][name]",text)
  self.assertIn("'controllerRevision':extension['controllerRevision']",text);self.assertIn("'runtimeSourceSha':plan['sourceSha']",text)
 def test_unexecuted_browser_path_fix_keeps_the_parent_id_and_tls_binding(self):
  tree,_=functions();fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='browser');assignment=next(n for n in fn.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='browser_options' for t in n.targets));parent={'invocationId':'existing-id','spkiSha256':'existing-spki','outputDirectory':'C:/invalid/absolute'};env={'plan':{'browser':parent}};exec(compile(ast.Module(body=[assignment],type_ignores=[]),'browser-options','exec'),env)
  self.assertEqual(env['browser_options'],{**parent,'outputDirectory':'.qa-private/cp020-browser'});self.assertEqual(parent['outputDirectory'],'C:/invalid/absolute')
if __name__=='__main__':unittest.main()
