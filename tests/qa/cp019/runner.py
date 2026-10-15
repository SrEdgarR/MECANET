import base64, datetime, hashlib, importlib.util, json, os, pathlib, re, stat, sys, threading, time

DIR=pathlib.Path(__file__).resolve().parent
sys.dont_write_bytecode=True
def canon(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
output_lock=threading.Lock();done=threading.Event();transport_failed=threading.Event();current_step='initial'
def emit(v):
 if transport_failed.is_set():return
 try:
  with output_lock:sys.stdout.write(json.dumps(v,separators=(',',':'))+'\n');sys.stdout.flush()
 except OSError:transport_failed.set() # Reporting cannot disable exact-CID cleanup.
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
HELPERS=frozenset(['host.py','tls_bundle.py','target-host.py','target-lifecycle.py','target-variant-host.py','target-readiness-host.py','browser-config.py','controller.py','resource-monitor.py','resource-sample.py','budget-limits.json','run.py'])
def private_bytes(path):
 assert path.resolve()==path and not path.is_symlink(),'HELPER_CUSTODY';before=path.lstat();keys=('st_dev','st_ino','st_uid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns')
 assert stat.S_ISREG(before.st_mode) and before.st_uid==0 and before.st_mode&0o777==0o400 and before.st_nlink==1 and 2<=before.st_size<=262144,'HELPER_CUSTODY'
 fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
 try:
  opened=os.fstat(fd);assert all(getattr(opened,k)==getattr(before,k) for k in keys),'HELPER_CHANGED';raw=b''
  while len(raw)<before.st_size+1:
   chunk=os.read(fd,before.st_size+1-len(raw))
   if not chunk:break
   raw+=chunk
  after=os.fstat(fd);named=path.lstat();assert len(raw)==before.st_size and all(getattr(opened,k)==getattr(after,k)==getattr(named,k) for k in keys),'HELPER_CHANGED';return raw
 finally:os.close(fd)
def validate_plan(value):
 assert isinstance(value,dict) and set(value)=={'schema','sourceSha','helpers','nodeExecutableHash','browser'} and value['schema']=='cp021-controller-plan-v1' and re.fullmatch('[0-9a-f]{40}',value['sourceSha']) and re.fullmatch('[0-9a-f]{64}',value['nodeExecutableHash']) and isinstance(value['helpers'],dict) and set(value['helpers'])==HELPERS and all(isinstance(x,str) and re.fullmatch('[0-9a-f]{64}',x) for x in value['helpers'].values()) and isinstance(value['browser'],dict),'CONTROLLER_PLAN';return value
def load(name,file):
 assert file in HELPERS and file.endswith('.py') and file!='run.py','HELPER_NAME';p=DIR/file;assert hashlib.sha256(private_bytes(p)).hexdigest()==plan['helpers'][file],'HELPER_HASH'
 s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m);return m

assert os.geteuid()==0 and DIR.resolve()==DIR and not DIR.is_symlink(),'CONTROLLER_ROOT'
plan_raw=private_bytes(DIR/'controller-plan.json');plan=validate_plan(json.loads(plan_raw));assert canon(plan)==plan_raw,'CONTROLLER_PLAN_CANONICAL'
for name,hash_value in plan['helpers'].items():
 p=DIR/name;assert hashlib.sha256(private_bytes(p)).hexdigest()==hash_value,'HELPER_HASH'
h=load('cp021_host','host.py');controller=load('cp021_controller','controller.py');events=[];started=now();failed=None;booted=False;monitor=None;cleaning=False
relay=controller.RelayInput(sys.stdin);relay.start()
original_run=h.run;original_bounded=h.run_bounded
def require_control():
 assert not transport_failed.is_set(),'CONTROLLER_TRANSPORT_FAILED';relay.check()
def guarded_run(*args,**kwargs):
 if not cleaning:
  require_control()
  if monitor is not None:monitor.check()
 return original_run(*args,**kwargs)
def guarded_bounded(*args,**kwargs):
 if not cleaning:
  require_control()
  if monitor is not None:monitor.check()
 return original_bounded(*args,**kwargs)
h.run=guarded_run;h.run_bounded=guarded_bounded
def validate_stage(host,expected):
 manifest,_=host.target_bridge().read_private(host.ROOT/'staging/artifact.json',0,262144,0o444)
 assert manifest.get('sourceSha')==manifest.get('codeSha')==expected['sourceSha'] and manifest.get('baseline')=='4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec','STAGED_SOURCE_MISMATCH'
 for name,sha in expected['helpers'].items():
  path='tests/qa/cp019/'+('runner.py' if name=='run.py' else name);entries=[e for e in manifest.get('entries',[]) if e.get('path')==path]
  assert len(entries)==1 and entries[0].get('sha256')==sha,'STAGED_HELPER_MISMATCH'
def heartbeat():
 while not done.wait(10):emit({'type':'cp020-heartbeat','step':current_step,'at':now(),'meaning':'progress only; no FIN/readiness proof'})
threading.Thread(target=heartbeat,daemon=True).start()
def step(name,fn):
 global current_step,booted,monitor
 if name!='cleanup':require_control()
 current_step=name
 emit({'type':'cp020-step','name':name,'state':'START','at':now()})
 if name!='cleanup':require_control()
 if name!='cleanup' and monitor is not None:monitor.check()
 t=time.monotonic();v=fn()
 if name=='stage':validate_stage(h,plan)
 if name=='bootstrap':
  booted=True;monitor=load('cp021_monitor','resource-monitor.py').ResourceMonitor(h,raw_run=original_run);monitor.start()
 if name!='cleanup':
  require_control()
  if monitor is not None:monitor.check()
 row={'name':name,'at':now(),'elapsedMs':round((time.monotonic()-t)*1000),**controller.public_result(v)};events.append(row);emit({'type':'cp020-step','name':name,'state':'PASS','at':row['at'],'elapsedMs':row['elapsedMs']});return v
def browser():
 # Construction is passive and fully bound to the original custodied reports.
 b=load('cp020_browser_config','browser-config.py');bridge=h.target_bridge();m,base,bindings=bridge.bundle_context(h)
 values={}
 for key,path,uid in [('acceptance',h.TARGET/'secrets/acceptance.json',999),('sourceHistory',h.ROOT/'secrets/source-history.json',999),('written',h.TARGET/'secrets/target-written-results.json',999)]:values[key]=bridge.read400(path,uid)[0]
 art=json.loads((getattr(h,'runtime_directory',lambda:h.ROOT/'staging')()/'artifact.json').read_bytes());source_entry=[e for e in art['entries'] if e['path']=='tests/qa/cp019/acceptance.mjs'];assert len(source_entry)==1,'ACCEPTANCE_SOURCE'
 config=b.make_config(m,base,bindings,values,plan['browser'],source_entry[0]['sha256'])
 config_hash=h.canonical_hash(config);ref={**b.make_reference(config),'schema':'cp020-browser-reference-v1'};h.set_host_case('browser-login');h.write_plain(h.TARGET/'master/browser-config-ref.json',canon(ref),0o400,0)
 ca=(h.TARGET/'config/ca.crt').read_bytes();cert=(h.TARGET/'tls/web/server.crt').read_bytes()
 emit({'type':'cp020-private-browser-input','config':config,'caBase64':base64.b64encode(ca).decode(),'certBase64':base64.b64encode(cert).decode(),'configHash':config_hash})
 deadline=time.monotonic()+360;count=0
 while time.monotonic()<deadline:
  require_control();request=relay.get(min(10,max(0,deadline-time.monotonic())))
  if request is None:continue
  if request.get('type')=='cp020-browser-gate':emit(h.browser_gate(request));count+=1;continue
  assert request.get('type')=='cp020-browser-result' and request.get('status')=='PASS' and count==7 and request['sourceSha']==plan['sourceSha'] and request.get('configHash')==config_hash and isinstance(request.get('reportHash'),str) and re.fullmatch('[0-9a-f]{64}',request['reportHash']),'BROWSER_FAILED'
  ended=request.get('processEnd');assert isinstance(ended,dict) and set(ended)=={'nodePid','nodeExitCode','nodeExecutableHash','tunnelPid','tunnelExitCode','tunnelEnded'} and type(ended['nodePid']) is int and ended['nodePid']>0 and type(ended['nodeExitCode']) is int and ended['nodeExitCode']==0 and ended['nodeExecutableHash']==plan['nodeExecutableHash'] and type(ended['tunnelPid']) is int and ended['tunnelPid']>0 and type(ended['tunnelExitCode']) is int and ended['tunnelEnded'] is True,'BROWSER_LOCAL_END_UNKNOWN'
  emit({'type':'cp020-browser-finished','status':'PASS','reportHash':request['reportHash'],'sourceSha':request['sourceSha']});return request
 raise AssertionError('BROWSER_RELAY_DEADLINE')
def post_gui():
 h.set_host_case('browser-denials');h.enter_runtime_case('target-window','browser-denials')
 output,proof=h.controller_job(h.TARGET,'probe',['node','tests/qa/cp019/acceptance.mjs','browser-postcheck'],{'QA_CODE_SHA':plan['sourceSha']},sample=False)
 v=json.loads(output);assert v['type']=='cp019-acceptance' and v['mode']=='browser-postcheck' and v['status']=='PASS','BROWSER_SQL_RESULT'
 report,sha=h.target_bridge().read400(h.TARGET/'evidence/acceptance-browser-postcheck.json');assert report['status']=='PASS','BROWSER_SQL_REPORT'
 return {'status':'PASS','reportHash':sha,'jobProof':proof,'secretsPrinted':False}
try:
 port=controller.HostPort(h,step,browser,post_gui)
 controller.execute(port)
except BaseException as e:
 failed=str(e) if isinstance(e,AssertionError) and re.fullmatch('[A-Z0-9_ /-]{1,100}',str(e)) else 'UNEXPECTED_CONTROLLER_ERROR'
 emit({'type':'cp020-failure','code':failed,'at':now()})
finally:
 cleaning=True
 outcome=controller.safe_finish(h,monitor,booted,step);cleanup=outcome['cleanup'];monitor_result=outcome['resourceMonitor'];failed=failed or outcome['failure']
 try:relay.check()
 except AssertionError as error:failed=failed or str(error)
 relay.stop()
 if cleanup and cleanup.get('result')!='PASS':emit({'type':'cp020-cleanup','result':cleanup})
 ledger=None
 budget=getattr(h,'budget_directory',lambda:h.ROOT/'budget')()
 if (budget/'ledger.json').exists():ledger=json.loads((budget/'ledger.json').read_bytes())
 report={'schema':'cp021-remote-run-v1','sourceSha':plan['sourceSha'],'startedAt':started,'completedAt':now(),'status':'FAIL' if failed else 'INTEGRAL PIPELINE PASS / SIX CRITERIA STILL TO RECONCILE','failure':failed,'events':events,'cleanup':cleanup,'ledger':ledger,'secretsPrinted':False,'sharedInfrastructureModified':False,'extraVariants':'NOT VERIFIED' if failed else 'PIPELINE COMPLETED / ACCEPTANCE RECONCILIATION REQUIRED','resourceMonitor':monitor_result,'resourceAdmission':{'lastSample':h.RESOURCE_LAST_SAMPLE,'firstFailureSample':h.RESOURCE_FIRST_REJECTED_SAMPLE}}
 if transport_failed.is_set():failed=failed or 'CONTROLLER_TRANSPORT_FAILED';report['failure']=failed;report['status']='FAIL'
 done.set();emit({'type':'cp020-final-report','report':report})
if transport_failed.is_set():failed=failed or 'CONTROLLER_TRANSPORT_FAILED'
sys.exit(1 if failed else 0)
