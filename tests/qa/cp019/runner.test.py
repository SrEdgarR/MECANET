"""AST-isolated runner/finish models; no Root, Docker, SQL, SSH or processes."""
import ast,hashlib,importlib.util,io,json,pathlib,queue,re,stat,tempfile,threading,types,unittest

HERE=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('controller_finish',HERE/'controller.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
SUMMARY={'schema':'cp021-resource-monitor-summary-v1','status':'PASS','failed':False,'error':None,'samples':1}

def runner_functions():
 tree=ast.parse((HERE/'runner.py').read_text(encoding='utf-8'));functions=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))]
 helpers=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='HELPERS' for t in n.targets));env={'json':json,'re':re,'stat':stat,'hashlib':hashlib,'threading':threading,'controller':c,'relay':types.SimpleNamespace(check=lambda:None,stop=lambda:None),'time':types.SimpleNamespace(monotonic=lambda:1),'now':lambda:'2026-10-15T00:00:00Z','current_step':'initial','booted':False,'monitor':None,'cleaning':False,'transport_failed':threading.Event(),'output_lock':threading.Lock(),'events':[],'HELPER_MODE':0o400,'continuation_session':None,'continuation_modules':None,'continuation':None};exec(compile(ast.Module(body=[helpers],type_ignores=[]),'runner-constants','exec'),env)
 exec(compile(ast.Module(body=functions,type_ignores=[]),'runner-isolated','exec'),env)
 # Pure replacements: tests never load or execute a remote helper.
 env.update(now=lambda:'2026-10-15T00:00:00Z',load=lambda *a:c,emit=lambda v:None,select=types.SimpleNamespace(select=lambda *a:([],[],[])),sys=types.SimpleNamespace(stdin=io.StringIO('')))
 return tree,env

class Finish(unittest.TestCase):
 def test_staged_manifest_must_match_the_plan_and_each_external_helper_before_material(self):
  _,env=runner_functions();names=env['HELPERS'];plan={'sourceSha':'a'*40,'helpers':{k:'b'*64 for k in names}}
  manifest={'sourceSha':plan['sourceSha'],'codeSha':plan['sourceSha'],'baseline':'4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec','entries':[{'path':'tests/qa/cp019/'+('runner.py' if n=='run.py' else n),'sha256':sha} for n,sha in plan['helpers'].items()]}
  h=types.SimpleNamespace(ROOT=pathlib.Path('/model/source'),target_bridge=lambda:types.SimpleNamespace(read_private=lambda *args:(manifest,'f'*64)))
  env['validate_stage'](h,plan)
  for mutation in ['source','code','helper','baseline']:
   import copy
   bad=copy.deepcopy(manifest)
   if mutation=='source':bad['sourceSha']='c'*40
   elif mutation=='code':bad['codeSha']='c'*40
   elif mutation=='baseline':bad['baseline']='c'*64
   else:bad['entries'][0]['sha256']='c'*64
   h.target_bridge=lambda:types.SimpleNamespace(read_private=lambda *args:(bad,'f'*64))
   with self.subTest(mutation=mutation),self.assertRaisesRegex(AssertionError,'STAGED_'):env['validate_stage'](h,plan)
 def fixture(self,stop=None,cleanup=None,booted=True):
  calls=[];h=types.SimpleNamespace(ROOT=pathlib.Path('/model/source'),cleanup=lambda:calls.append('cleanup') or (cleanup or {'result':'PASS'}));monitor=types.SimpleNamespace(stop=stop or (lambda:calls.append('monitor-stop') or dict(SUMMARY)))
  step=lambda name,fn:calls.append(name) or fn()
  return h,monitor,calls,step
 def test_monitor_stop_failure_still_stops_own_processes_first_and_cannot_pass(self):
  def stop():raise RuntimeError('private failure details')
  h,m,calls,step=self.fixture(stop=stop);out=c.safe_finish(h,m,True,step)
  self.assertEqual(calls,['cleanup','cleanup']);self.assertEqual(out['cleanup']['result'],'PASS');self.assertEqual(out['failure'],'RESOURCE_MONITOR_NOT_VERIFIED');self.assertNotIn('private failure',json.dumps(out))
 def test_failed_malformed_or_empty_monitor_summary_never_produces_run_pass(self):
  for summary in [{**SUMMARY,'status':'FAIL','failed':True,'error':'RESOURCE_LIMIT'},{**SUMMARY,'failed':True},{**SUMMARY,'samples':0},None,{},'untrusted']:
   h,m,calls,step=self.fixture(stop=lambda:summary);out=c.safe_finish(h,m,True,step);self.assertEqual(out['failure'],'RESOURCE_MONITOR_NOT_VERIFIED');self.assertEqual(calls.count('cleanup'),2)
 def test_cleanup_failure_cannot_skip_monitor_stop_and_does_not_echo_exception(self):
  h,m,calls,step=self.fixture();h.cleanup=lambda:(_ for _ in ()).throw(RuntimeError('SECRET_CLEANUP_FAILURE'));out=c.safe_finish(h,m,True,step)
  self.assertEqual(out['failure'],'CLEANUP_NOT_VERIFIED');self.assertEqual(out['resourceMonitor'],SUMMARY);self.assertEqual(calls[-1],'monitor-stop');self.assertNotIn('SECRET_',json.dumps(out))
 def test_positive_summary_and_cleanup_return_only_their_bounded_evidence(self):
  h,m,calls,step=self.fixture();out=c.safe_finish(h,m,True,step);self.assertIsNone(out['failure']);self.assertEqual(calls,['cleanup','cleanup','monitor-stop']);self.assertEqual(out['resourceMonitor'],SUMMARY)
 def test_missing_monitor_after_successful_bootstrap_still_cleans_up_and_is_unverified(self):
  h,m,calls,step=self.fixture();out=c.safe_finish(h,None,True,step);self.assertEqual(calls,['cleanup','cleanup']);self.assertEqual(out['failure'],'RESOURCE_MONITOR_NOT_VERIFIED');self.assertIsNone(out['resourceMonitor'])

class Runner(unittest.TestCase):
 def test_v2_failure_before_session_keeps_metadata_and_never_fabricates_docker_cleanup(self):
  _,env=runner_functions();calls=[];reports=[]
  with tempfile.TemporaryDirectory() as tmp:
   h=types.SimpleNamespace(ROOT=pathlib.Path(tmp),RESOURCE_LAST_SAMPLE=None,RESOURCE_FIRST_REJECTED_SAMPLE=None,cleanup=lambda:calls.append('FORBIDDEN_CLEANUP'))
   env.update(h=h,monitor=types.SimpleNamespace(stop=lambda:(_ for _ in ()).throw(RuntimeError('private'))),plan={'sourceSha':'a'*40},started='now',failed=None,done=threading.Event(),emit=reports.append,continue_v2=lambda *args:(_ for _ in ()).throw(AssertionError('PUBLICATION_UNCERTAIN')))
   self.assertEqual(env['run_program'](({},None)),1);self.assertEqual(calls,[]);final=next(v['report'] for v in reports if v['type']=='cp020-final-report');self.assertEqual(final['cleanup']['result'],'NOT VERIFIED');self.assertEqual(final['status'],'FAIL');self.assertTrue(env['done'].is_set());self.assertNotIn('private',str(final))
 def test_public_result_omits_material_passwords_cookies_and_nested_authority(self):
  value={'material':{'rolePasswords':{'qa_bootstrap':'SENTINEL_PASSWORD'},'sessionSecret':'SENTINEL_SESSION'},'arbitrary':['SENTINEL_COOKIE']};result=c.public_result(value);encoded=json.dumps(result)
  self.assertEqual(set(result),{'resultHash','resultBody','acceptance'});self.assertEqual(len(result['resultHash']),64);self.assertNotIn('SENTINEL',encoded);self.assertEqual(result['acceptance'],'NOT VERIFIED')
 def test_step_hashes_return_body_before_recording_a_public_event(self):
  tree,env=runner_functions();env['step']('model',lambda:{'material':{'password':'SENTINEL'}});self.assertEqual(len(env['events']),1);self.assertNotIn('SENTINEL',json.dumps(env['events']));self.assertNotIn('result',env['events'][0])
 def test_eof_or_abort_prevents_the_next_effect_while_cleanup_ignores_transport_and_stdin(self):
  for code in ['CONTROLLER_INPUT_EOF','LOCAL_ABORT_REQUEST']:
   tree,env=runner_functions();env['relay'].check=lambda:(_ for _ in ()).throw(AssertionError(code));calls=[]
   with self.assertRaises(AssertionError):env['step']('next',lambda:calls.append('EFFECT'))
   self.assertEqual(calls,[]);env['transport_failed'].set();env['step']('cleanup',lambda:calls.append('STOP') or {'result':'PASS'});self.assertEqual(calls,['STOP'])
 def test_broken_pipe_sets_failure_without_throwing_past_cleanup(self):
  tree,env=runner_functions()
  class Broken:
   def write(self,_):raise BrokenPipeError('closed')
  env['sys'].stdout=Broken();emit=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='emit');exec(compile(ast.Module(body=[emit],type_ignores=[]),'runner-emit','exec'),env)
  env['emit']({'type':'test'});self.assertTrue(env['transport_failed'].is_set());calls=[];env['step']('cleanup',lambda:calls.append('STOP') or {'result':'PASS'});self.assertEqual(calls,['STOP'])
 def test_cleanup_commands_bypass_failed_monitor_but_normal_commands_fail_closed(self):
  tree,env=runner_functions();calls=[];env['monitor']=types.SimpleNamespace(check=lambda:(_ for _ in ()).throw(AssertionError('RESOURCE_LIMIT')));env['original_run']=lambda *a,**k:calls.append(a);env['original_bounded']=env['original_run']
  for fn in ['guarded_run','guarded_bounded']:
   with self.assertRaisesRegex(AssertionError,'RESOURCE_LIMIT'):env[fn]('docker','start','known')
   env['cleaning']=True;env[fn]('docker','stop','known');env['cleaning']=False
  self.assertEqual(calls,[('docker','stop','known')]*2)
 def test_actual_runner_finally_calls_cleanup_even_when_monitor_stop_throws(self):
  tree,env=runner_functions();main=next(n for n in next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run_program').body if isinstance(n,ast.Try));calls=[];reports=[]
  with tempfile.TemporaryDirectory() as tmp:
   h=types.SimpleNamespace(ROOT=pathlib.Path(tmp),RESOURCE_LAST_SAMPLE={'firstViolation':'ADMISSION_CPU_LIMIT'},RESOURCE_FIRST_REJECTED_SAMPLE={'guardCode':'CP019_RESOURCE_ABORT'},cleanup=lambda:calls.append('STOP') or {'result':'PASS'});env.update(h=h,booted=True,monitor=types.SimpleNamespace(stop=lambda:(_ for _ in ()).throw(RuntimeError('STOP_FAILED'))),plan={'sourceSha':'a'*40},started='2026-10-15T00:00:00Z',failed=None,done=threading.Event(),emit=reports.append)
   port=types.SimpleNamespace(HostPort=lambda *a:None,execute=lambda _:(_ for _ in ()).throw(AssertionError('LOCAL_ABORT_REQUEST')),safe_finish=c.safe_finish,public_result=c.public_result);env['load']=lambda *a:port;env['controller']=port
   exec(compile(ast.Module(body=[main],type_ignores=[]),'runner-main','exec'),env)
   self.assertEqual(calls,['STOP']);self.assertTrue(env['cleaning']);self.assertTrue(env['done'].is_set());final=next(v for v in reports if v['type']=='cp020-final-report');self.assertEqual(final['report']['status'],'FAIL');self.assertEqual(final['report']['cleanup']['result'],'PASS');self.assertEqual(final['report']['resourceAdmission'],{'lastSample':h.RESOURCE_LAST_SAMPLE,'firstFailureSample':h.RESOURCE_FIRST_REJECTED_SAMPLE})

class Feed:
 def __init__(self):self.q=queue.Queue();self.reads=0
 def readline(self,size):self.reads+=1;return self.q.get(timeout=2)
 def send(self,value):self.q.put(value)

class InputAndCustody(unittest.TestCase):
 def test_single_reader_preserves_browser_messages_and_eof_aborts_before_next_command(self):
  stream=Feed();relay=c.RelayInput(stream);relay.start();gate={'type':'cp020-browser-gate','sequence':1};result={'type':'cp020-browser-result','status':'PASS'}
  stream.send(json.dumps(gate)+'\n');stream.send(json.dumps(result)+'\n');self.assertEqual(relay.get(1),gate);self.assertEqual(relay.get(1),result);stream.send('');self.assertTrue(relay.failed.wait(1));self.assertEqual(relay.error,'CONTROLLER_INPUT_EOF')
  _,env=runner_functions();env['relay']=relay;calls=[];env['original_run']=lambda *a,**k:calls.append(a)
  with self.assertRaisesRegex(AssertionError,'INPUT_EOF'):env['guarded_run']('docker','start','known')
  self.assertEqual(calls,[]);env['cleaning']=True;env['guarded_run']('docker','stop','known');self.assertEqual(calls,[('docker','stop','known')]);relay.stop()
 def test_explicit_abort_malformed_frame_and_queue_flood_are_irreversible_without_echoing_input(self):
  for lines,expected in [(['{"status":"FAIL","detail":"SENTINEL"}\n'],'LOCAL_ABORT_REQUEST'),(['{"status":"PASS"}\n'],'CONTROLLER_INPUT_FRAME'),(['x'*8193],'CONTROLLER_INPUT_FRAME'),(['{"type":"cp020-browser-gate"}'],'CONTROLLER_INPUT_FRAME'),(['{"type":"cp020-browser-gate"}\n']*17,'CONTROLLER_INPUT_OVERFLOW')]:
   stream=Feed();relay=c.RelayInput(stream);relay.start()
   for line in lines:stream.send(line)
   self.assertTrue(relay.failed.wait(1));self.assertEqual(relay.error,expected)
   with self.assertRaisesRegex(AssertionError,expected):relay.get(0)
   self.assertNotIn('SENTINEL',str(relay.error));relay.stop()
 def test_monitor_and_input_failure_after_an_effect_cannot_append_a_false_pass_event(self):
  _,env=runner_functions();calls=[]
  def effect():calls.append('EFFECT');env['relay'].check=lambda:(_ for _ in ()).throw(AssertionError('LOCAL_ABORT_REQUEST'));return {'result':'PASS'}
  with self.assertRaisesRegex(AssertionError,'LOCAL_ABORT_REQUEST'):env['step']('phase',effect)
  self.assertEqual(calls,['EFFECT']);self.assertEqual(env['events'],[])
 def test_controller_plan_requires_exact_closed_helper_names_and_hash_shapes(self):
  _,env=runner_functions();p={'schema':'cp021-controller-plan-v1','sourceSha':'a'*40,'helpers':{name:'b'*64 for name in env['HELPERS']},'nodeExecutableHash':'c'*64,'browser':{}}
  self.assertEqual(env['validate_plan'](p),p)
  for change in [lambda x:x['helpers'].update({'../host.py':'b'*64}),lambda x:x['helpers'].pop('run.py'),lambda x:x['helpers'].update({'host.py':'wrong'}),lambda x:x.update(nodeExecutableHash='wrong')]:
   x=json.loads(json.dumps(p));change(x)
   with self.assertRaisesRegex(AssertionError,'CONTROLLER_PLAN'):env['validate_plan'](x)
 def test_private_plan_and_helpers_are_bounded_single_link_root400_and_read_the_same_inode(self):
  for change in [None,{'st_nlink':2},{'st_uid':999},{'st_mode':0o100600},{'st_size':262145},{'fd_ino':2}]:
   _,env=runner_functions();raw=b'{}';meta=types.SimpleNamespace(st_dev=1,st_ino=1,st_uid=0,st_mode=0o100400,st_nlink=1,st_size=len(raw),st_mtime_ns=1,st_ctime_ns=1)
   if change:
    for k,v in change.items():
     if not k.startswith('fd_'):setattr(meta,k,v)
   class Path:
    def resolve(self):return self
    def is_symlink(self):return False
    def lstat(self):return meta
   path=Path();opened=[];closed=[];offset=[0]
   def read(fd,n):part=raw[offset[0]:offset[0]+n];offset[0]+=len(part);return part
   def fstat(fd):return types.SimpleNamespace(**{**vars(meta),'st_ino':change.get('fd_ino',meta.st_ino)}) if change else meta
   env['os']=types.SimpleNamespace(O_RDONLY=0,O_NOFOLLOW=1,open=lambda p,flags:opened.append(p) or 7,fstat=fstat,read=read,close=lambda fd:closed.append(fd))
   if change:
    with self.assertRaises(AssertionError):env['private_bytes'](path)
   else:self.assertEqual(env['private_bytes'](path),raw)
   self.assertEqual(len(opened),len(closed));self.assertLessEqual(offset[0],3)

if __name__=='__main__':unittest.main()
