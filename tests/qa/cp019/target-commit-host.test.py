"""Local boundary models only: no Docker, PostgreSQL, SSH or Linux custody claim."""
import importlib.util,json,pathlib,subprocess,tempfile,types,unittest,uuid,shutil,sys
from unittest.mock import patch

HERE=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('commit_host',HERE/'target-commit-host.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
_node='C:/Users/thede/Desktop/Proyectos de programacion/MECANET-develop/.qa-private/runtime/node.exe' if sys.platform=='win32' else shutil.which('node')
if _node is None:raise RuntimeError('APPROVED_NODE_RUNTIME_REQUIRED')
NODE=pathlib.Path(_node)
ident=lambda n:'00000000-0000-4000-8000-'+str(n).zfill(12)
H='a'*64

def fixture():
 m={'recoveryId':ident(1),'controllerOwner':ident(2),'target':{'generation':ident(3)},'stageOperationIds':{'target-prepare-promote':ident(4)}}
 p={'schema':'target-driver-plan-v1','recoveryId':m['recoveryId'],'generation':m['target']['generation'],'sourceSha':'b'*40,'resourceHash':H,'sourceEndProofHash':H,'phases':{'promotion':{'steps':[{'method':'preparePromotion','args':{'operationKey':'target-prepare-promote','expected':{'stage':'VERIFIED','version':'5','global_blocked':True},'after':{'stage':'PROMOTING','version':'6','global_blocked':True},'proofHash':H}}]}}}
 return m,{'plan':p,'planHash':c.digest(p),'variantLineageHash':H}

class MemoryBridge:
 def read400(self,path,uid=999):
  raw=path.read_bytes();return json.loads(raw),c.digest(raw)
 def frozen_input(self,h,path,value,uid=999):
  if path.exists():assert json.loads(path.read_bytes())==value,'COLLISION'
  else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(c.canonical(value))
  return c.digest(value)

def release_fixture(root):
 b=MemoryBridge();b.read_private=lambda p,*a:(json.loads(p.read_bytes()),c.digest(p.read_bytes()))
 h=types.SimpleNamespace(TARGET=root,facts=lambda:[],syncdir=lambda _:None)
 m,base=fixture();plan=c.make_plan(m,base,ident(5),'c'*64)
 created={'schema':'controller-job-created-v1','jobId':ident(5),'containerId':'c'*64,'project':'mecanet-qa-p1l3-r03-target','service':'harness','ownerId':ident(2),'imageDigest':'sha256:'+H,'commandHash':c.digest(c.COMMAND),'state':'CREATED BEFORE START/SQL','createdAt':'2026-10-15T00:00:00Z'}
 ch=b.frozen_input(h,root/'evidence/jobs'/(ident(5)+'-created.json'),created,0)
 end={'schema':'controller-job-end-v1',**{k:created[k] for k in ['jobId','containerId','project','service','ownerId']},'createdReceiptHash':ch,'exitCode':1,'finishedAt':'2026-10-15T00:00:01Z','startedAt':'2026-10-15T00:00:00Z','containerStopped':True,'sqlAbsence':'NOT VERIFIED'};eh=b.frozen_input(h,root/'evidence/jobs'/(ident(5)+'-end.json'),end,0)
 occurrence={'planHash':c.digest(plan),'controllerContainerId':'c'*64,'invocationId':ident(5),'commitAcknowledged':True,'backendPid':13,'backendStartedAt':'2026-10-15T00:00:00Z'};oh=b.frozen_input(h,root/'evidence/target-commit-fault-occurrence.json',occurrence)
 observed={'containerId':'c'*64,'ownerId':ident(2),'running':False,'pid':0,'status':'exited','exitCode':1,'finishedAt':end['finishedAt']};failed={'created':created,'createdHash':ch,'ended':end,'endedHash':eh,'observed':observed,'occurrenceHash':oh}
 probe={'schema':'cp019-commit-fault-end-probe-v1','invocationId':ident(5),'containerId':'c'*64,'ownerId':ident(2),'resourceHash':H,'backendPid':13,'backendStartedAt':occurrence['backendStartedAt'],'controllerExited':True,'sqlBackendAbsent':True,'sqlOwnerAbsent':True};ph=b.frozen_input(h,root/'evidence/commit-end-probe.json',probe)
 pc={**created,'jobId':ident(6),'containerId':'d'*64,'service':'probe','commandHash':c.digest(c.PROBE_COMMAND)};pch=b.frozen_input(h,root/'evidence/jobs'/(ident(6)+'-created.json'),pc,0)
 pe={**end,'jobId':ident(6),'containerId':'d'*64,'service':'probe','createdReceiptHash':pch,'exitCode':0};peh=b.frozen_input(h,root/'evidence/jobs'/(ident(6)+'-end.json'),pe,0)
 pj={'root':root,'jobId':ident(6),'cid':'d'*64,'profile':'probe','ownerId':ident(2),'receiptHash':pch};pp={'containerId':'d'*64,'jobCreatedHash':pch,'jobEndHash':peh,'containerFIN':'PASS','sqlFIN':'NOT VERIFIED'}
 lock=root/'journal/target.jsonl.controller.lock';lock.parent.mkdir();lock.write_bytes(c.canonical({'recoveryId':plan['recoveryId'],'controllerOwner':plan['controllerOwner'],'resourceHash':plan['resourceHash']}));(lock.parent/'target.jsonl').write_bytes(b'original pending intent\n')
 return h,b,plan,failed,probe,ph,pj,pp,lock

def model_release(h,*args):
 # Windows fstat reports a different ctime meaning from lstat. This model
 # normalizes that platform difference; production keeps every Linux check.
 original=c.os.fstat;lock=h.TARGET/'journal/target.jsonl.controller.lock';unlink=c.os.unlink;close=c.os.close;open_file=c.os.open;pending=[];opened=set()
 def metadata(fd):
  s=original(fd)
  if c.os.name!='nt':return s
  return types.SimpleNamespace(**{k:getattr(s,k) for k in ['st_dev','st_ino','st_size','st_mtime_ns','st_mode','st_uid','st_nlink']},st_ctime_ns=lock.lstat().st_ctime_ns)
 def remove(path):
  if c.os.name=='nt' and pathlib.Path(path)==lock and opened:pending.append(path)
  else:unlink(path)
 def open_handle(path,*args):
  fd=open_file(path,*args)
  if pathlib.Path(path)==lock:opened.add(fd)
  return fd
 def close_file(fd):
  close(fd);opened.discard(fd)
  for path in pending:unlink(path)
  pending.clear()
 with patch.object(c.os,'fstat',metadata),patch.object(c.os,'unlink',remove),patch.object(c.os,'open',open_handle),patch.object(c.os,'close',close_file):return c.release_original_lock(h,*args)

class RunModel:
 """Models host receipts and crash checkpoints; never emulates a SQL PASS."""
 def __init__(self,root,cut=None):
  self.TARGET=root;self.kind='commit-interrupted';self.b=MemoryBridge();self.cut=cut;self.cut_seen=False;self.containers={};self.jobs={};self.started=[];self.sealed={};self.selected_effects=0;self.probe_runs=0;self.retry_runs=0;self.releases=0
  self.material,self.base=fixture();self.material['target']['rolePasswords']={'qa_bootstrap':'x'*32};self.base['manifest']={'target':{'systemIdentifier':'1234567890123456789'}}
  self.cfg={'phase':'promotion','invocationId':ident(5),'configBundleHash':H,'sourceCaptureHash':H,'custodyHash':H,'sourceSha':'b'*40};self.env={'QA_PROJECT':self.target_project(),'QA_CODE_SHA':'b'*40,'QA_INVOCATION_ID':ident(5)}
  self.b.observation=lambda *a:{};self.b.atomic_mailbox=lambda *a:None;self.b.phase_arguments=lambda h,p,a,s,i:(c.COMMAND,{'QA_PROJECT':self.target_project(),'QA_CODE_SHA':s,'QA_INVOCATION_ID':i});self.b.watch_job=self.watch
  self.b.read_private=lambda p,uid=999,limit=262144,mode=0o400,json_value=True:((json.loads(p.read_bytes()) if json_value else p.read_bytes()),c.digest(p.read_bytes()))
  freeze=self.b.frozen_input
  def frozen(h,path,value,uid=999):
   result=freeze(h,path,value,uid)
   if path.name==self.cut and not self.cut_seen:self.cut_seen=True;raise RuntimeError('CONFIRMED_CUT')
   return result
  self.b.frozen_input=frozen
  (root/'config').mkdir();(root/'config/ca.crt').write_text('synthetic CA');(root/'secrets').mkdir();(root/'journal').mkdir()
 def target_project(self):return 'mecanet-qa-p1l3-r03-target'
 def material_owned(self):return self.material
 def facts(self):return list(self.containers.values())
 def inspect_container(self,cid):return self.containers[cid]
 def read_created_job(self,j):return self.b.read400(self.TARGET/'evidence/jobs'/(j['jobId']+'-created.json'),0)[0]
 def created_job_identity(self,a,j,r):return a['id']==j['cid']==r['containerId'] and a['jobId']==j['jobId']==r['jobId'] and a['ownerId']==j['ownerId']==r['ownerId']
 def create_job(self,root,profile,command,env,mounts=(),sample=False):
  assert not any(x['service']==profile for x in self.containers.values()),'SINGLE_PROFILE_SLOT'
  invocation=env['QA_INVOCATION_ID'];assert invocation not in self.jobs,'SECOND_CREATE';cid=hex(len(self.jobs)+12)[2:]*64
  cid=cid[:64];r={'schema':'controller-job-created-v1','jobId':invocation,'containerId':cid,'project':self.target_project(),'service':profile,'ownerId':self.material['controllerOwner'],'imageDigest':'sha256:'+H,'commandHash':c.digest(command),'state':'CREATED BEFORE START/SQL','createdAt':'2026-10-15T00:00:00Z'}
  ch=self.b.frozen_input(self,root/'evidence/jobs'/(invocation+'-created.json'),r,0);job={'root':root,'profile':profile,'jobId':invocation,'cid':cid,'ownerId':r['ownerId'],'receiptHash':ch}
  self.jobs[invocation]={'job':job,'command':command,'mounts':{dst:pathlib.Path(src) for src,dst,_ in mounts},'inodes':{dst:src.stat().st_ino for src,dst,_ in mounts}}
  self.containers[cid]={'id':cid,'jobId':invocation,'ownerId':r['ownerId'],'service':profile,'status':'created','running':False,'pid':0};return job
 def start_job(self,job):
  model=self.jobs[job['jobId']];assert job['jobId'] not in self.started,'SECOND_START';assert self.containers[job['cid']]['status']=='created'
  for alias,path in model['mounts'].items():assert path.stat().st_ino==model['inodes'][alias],'BOUND_INODE_REPLACED'
  if model['command']==c.COMMAND:
   cfg=json.loads(model['mounts'][c.CONFIG_ALIAS].read_bytes());ctx=json.loads(model['mounts'][c.CONTEXT_ALIAS].read_bytes());assert cfg['commitFaultContextHash']==c.digest(ctx);assert ctx['planHash']==c.digest(ctx['plan'])
   assert model['mounts'][c.CONFIG_ALIAS] in self.sealed or ctx['mode']=='reconcile'
   if ctx['mode']=='inject':assert ctx['plan']['controllerContainerId']==job['cid']
   else:assert not (self.TARGET/'journal/target.jsonl.controller.lock').exists();assert (self.TARGET/'master/commit-controller-released.json').exists()
  self.started.append(job['jobId']);self.containers[job['cid']].update(status='running',running=True,pid=1)
 def run(self,*args):
  assert args[:2]==('docker','rm');actual=self.containers[args[2]];assert actual['running'] is False and actual['pid']==0;del self.containers[args[2]]
 def draft(self,h,path):
  assert not path.exists();path.write_bytes(c.canonical({'schema':'cp021-unconfirmed-draft-v1'}));s=path.stat();return(s.st_dev,s.st_ino)
 def seal(self,h,path,identity,value):
  s=path.stat();assert [s.st_dev,s.st_ino]==list(identity)
  if path in self.sealed:assert json.loads(path.read_bytes())==value,'CONFIRMED_CHANGED'
  else:path.write_bytes(c.canonical(value));self.sealed[path]=True
  return c.digest(value)
 def release(self,h,b,plan,plan_hash,failed,probe,probe_hash,probe_job,probe_proof):
  # Actual lock validation/unlink boundaries are tested separately above.
  path=self.TARGET/'master/commit-controller-released.json'
  if not path.exists():
   assert not (self.TARGET/'master/commit-retry-intent.json').exists();assert self.b.read400(self.TARGET/'evidence/jobs'/(probe_job['jobId']+'-end.json'),0)[0]['exitCode']==0
   (self.TARGET/'journal/target.jsonl.controller.lock').unlink();self.releases+=1
  return self.b.frozen_input(self,path,{'schema':'model-release','planHash':plan_hash,'probeHash':probe_hash},0)
 def watch(self,h,job,publish):
  model=self.jobs[job['jobId']];exit_code=0
  if model['command']==c.PROBE_COMMAND:
   self.probe_runs+=1;cfg=json.loads(model['mounts']['/run/qa-secrets/commit-end-probe-config.json'].read_bytes());p=cfg['plan'];o=cfg['occurrence'];assert p['controllerContainerId'] not in self.containers
   report={'schema':'cp019-commit-fault-end-probe-v1','invocationId':p['invocationId'],'containerId':p['controllerContainerId'],'ownerId':p['controllerOwner'],'resourceHash':p['resourceHash'],'backendPid':o['backendPid'],'backendStartedAt':o['backendStartedAt'],'controllerExited':True,'sqlBackendAbsent':True,'sqlOwnerAbsent':True};rh=self.b.frozen_input(self,self.TARGET/'evidence/commit-end-probe.json',report)
   output={'type':'cp021-commit-end-probe','status':'PASS','reportHash':rh,'secretsPrinted':False}
  else:
   ctx=json.loads(model['mounts'][c.CONTEXT_ALIAS].read_bytes());p=ctx['plan']
   if ctx['mode']=='inject':
    self.selected_effects+=1;exit_code=1;occ={'schema':'cp019-commit-fault-occurrence-v1','planHash':ctx['planHash'],'caseName':p['caseName'],'controllerContainerId':p['controllerContainerId'],'controllerOwner':p['controllerOwner'],'fault':p['fault'],'generation':p['generation'],'invocationId':p['invocationId'],'operationId':p['operationId'],'recoveryId':p['recoveryId'],'backendPid':13,'backendStartedAt':'2026-10-15T00:00:00Z','commitAcknowledged':True,'resultHash':H};self.b.frozen_input(self,self.TARGET/'evidence/target-commit-fault-occurrence.json',occ)
    (self.TARGET/'journal/target.jsonl').write_bytes(b'pending original operation\n');(self.TARGET/'journal/target.jsonl.controller.lock').write_bytes(c.canonical({'recoveryId':p['recoveryId'],'controllerOwner':p['controllerOwner'],'resourceHash':p['resourceHash']}));output={'type':'expected-model-fault'}
   else:
    self.retry_runs+=1;assert (self.TARGET/'journal/target.jsonl').read_bytes()==b'pending original operation\n';receipt={'commitFaultPlanHash':ctx['planHash'],'commitFaultOccurrenceHash':ctx['retryEndPair']['occurrenceHash'],'result':{'results':[{'method':'preparePromotion','reconciled':True}]}};rh=self.b.frozen_input(self,self.TARGET/'evidence/target-promotion.json',receipt)
    output={'type':'cp019-target-phase','phase':'promotion','planHash':self.base['planHash'],'receiptHash':rh,'secretOutput':False}
  created=self.read_created_job(job);actual=self.containers[job['cid']];actual.update(status='exited',running=False,pid=0,exitCode=exit_code,finishedAt='2026-10-15T00:00:01Z')
  (self.TARGET/'evidence/jobs'/(job['jobId']+'-output.log')).write_bytes(c.canonical(output));end={'schema':'controller-job-end-v1',**{k:created[k] for k in ['jobId','containerId','project','service','ownerId']},'createdReceiptHash':job['receiptHash'],'exitCode':exit_code,'finishedAt':actual['finishedAt'],'startedAt':'2026-10-15T00:00:00Z','containerStopped':True,'sqlAbsence':'NOT VERIFIED'}
  self.b.frozen_input(self,self.TARGET/'evidence/jobs'/(job['jobId']+'-end.json'),end,0)
  if exit_code:raise AssertionError('VARIANT_JOB_FAILED_KEEP')
  self.run('docker','rm',job['cid']);return json.dumps(output),{}
 def execute(self):
  native=pathlib.Path.lstat
  def metadata(path):
   s=native(path)
   if path not in self.sealed:return s
   return types.SimpleNamespace(**{k:getattr(s,k) for k in ['st_dev','st_ino','st_nlink','st_size','st_mtime_ns','st_ctime_ns']},st_mode=0o100400,st_uid=999)
  with patch.object(c,'draft',self.draft),patch.object(c,'seal_draft',self.seal),patch.object(c,'release_original_lock',self.release),patch.object(pathlib.Path,'lstat',metadata):return c.run(self,self.b,self.cfg,self.base,'harness',c.COMMAND,self.env,[])

class Boundaries(unittest.TestCase):
 def test_python_and_node_make_identical_prospective_plan_and_hash(self):
  self.assertTrue(NODE.is_file(),'APPROVED_NODE_RUNTIME_REQUIRED')
  self.assertEqual(subprocess.check_output([str(NODE),'--version'],text=True,timeout=10).strip(),'v24.21.0')
  m,base=fixture();expected=c.make_plan(m,base,ident(5),'c'*64)
  script="import{makeCommitFaultPlan}from'./tests/qa/cp019/commit-fault-hook.mjs';import{sha256}from'./server/saas/recovery/protocol.js';let s='';for await(const x of process.stdin)s+=x;const a=JSON.parse(s),plan=makeCommitFaultPlan(a);console.log(JSON.stringify({plan,hash:sha256(plan)}));"
  args={'material':m,'parentPlan':base['plan'],'parentPlanHash':base['planHash'],'variantLineageHash':H,'invocationId':ident(5),'controllerContainerId':'c'*64}
  output=subprocess.run([str(NODE),'--input-type=module','-e',script],cwd=HERE.parents[2],input=json.dumps(args),capture_output=True,text=True,check=True)
  self.assertEqual(json.loads(output.stdout),{'plan':expected,'hash':c.digest(expected)})
 def test_reentry_reuses_original_invocation_and_rejects_changed_binding(self):
  with tempfile.TemporaryDirectory() as tmp:
   h=types.SimpleNamespace(TARGET=pathlib.Path(tmp));b=MemoryBridge();cfg={'invocationId':ident(5),'phase':'promotion','sourceSha':'b'*40};binding={'baseHash':H}
   first=c.injection_intent(h,b,cfg,binding)
   with patch.object(c.uuid,'uuid4',side_effect=AssertionError('REGENERATED')):
    self.assertEqual(c.injection_intent(h,b,{**cfg,'invocationId':ident(6)},binding),first)
   with self.assertRaisesRegex(AssertionError,'COMMIT_HOST_RESUME_BINDING'):c.injection_intent(h,b,{**cfg,'sourceSha':'f'*40},binding)
 def test_draft_is_sealed_on_same_inode_and_never_rewrites_a_confirmed_config(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp).resolve();path=root/'secrets/cfg.json';path.parent.mkdir();path.write_bytes(c.canonical({'schema':'cp021-unconfirmed-draft-v1'}));identity=(path.stat().st_dev,path.stat().st_ino);mode=[0o600];real_stat=pathlib.Path.lstat;real_fstat=c.os.fstat
   def custody(s):return types.SimpleNamespace(**{k:getattr(s,k) for k in ['st_dev','st_ino','st_nlink','st_size','st_mtime_ns','st_ctime_ns']},st_mode=0o100000|mode[0],st_uid=999)
   h=types.SimpleNamespace(TARGET=root,syncdir=lambda _:None,target_bridge=lambda:MemoryBridge())
   with patch.object(pathlib.Path,'lstat',lambda p:custody(real_stat(p))),patch.object(c.os,'fstat',lambda fd:custody(real_fstat(fd))),patch.object(c.os,'fchmod',lambda fd,v:mode.__setitem__(0,v),create=True):
    self.assertEqual(c.seal_draft(h,path,identity,{'confirmed':True}),c.digest({'confirmed':True}));self.assertEqual((path.stat().st_dev,path.stat().st_ino),identity)
    self.assertEqual(c.seal_draft(h,path,identity,{'confirmed':True}),c.digest({'confirmed':True}))
    with self.assertRaisesRegex(AssertionError,'COMMIT_DRAFT_CONFIRMED_CHANGED'):c.seal_draft(h,path,identity,{'confirmed':False})
 def test_created_job_is_resumed_without_a_second_create(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);h=types.SimpleNamespace(TARGET=root);b=MemoryBridge();calls=[];command=['node','probe'];env={'QA_INVOCATION_ID':ident(5)}
   receipt={'schema':'controller-job-created-v1','jobId':ident(5),'containerId':'c'*64,'project':'project','service':'probe','ownerId':ident(2),'commandHash':c.digest(command)}
   b.frozen_input(h,root/'evidence/jobs'/(ident(5)+'-created.json'),receipt,0)
   actual={'id':'c'*64,'jobId':ident(5),'status':'created','running':False};h.facts=lambda:[actual];h.created_job_identity=lambda a,j,r:a['id']==j['cid'];h.create_job=lambda *a,**k:calls.append('CREATE')
   job=c.fixed_job(h,b,'probe',command,env,[],root/'master/probe-job.json')
   self.assertEqual(job['cid'],'c'*64);self.assertEqual(calls,[])
   self.assertEqual(c.fixed_job(h,b,'probe',command,env,[],root/'master/probe-job.json'),job)
 def test_unreceipted_created_container_is_never_adopted(self):
  with tempfile.TemporaryDirectory() as tmp:
   h=types.SimpleNamespace(TARGET=pathlib.Path(tmp),facts=lambda:[{'jobId':ident(5),'id':'c'*64}]);h.create_job=lambda *a,**k:self.fail('must not CREATE')
   with self.assertRaisesRegex(AssertionError,'COMMIT_JOB_UNRECEIPTED_KEEP'):c.fixed_job(h,MemoryBridge(),'probe',['node','probe'],{'QA_INVOCATION_ID':ident(5)},[],h.TARGET/'master/probe-job.json')
 def test_already_completed_probe_uses_end_and_output_without_start_or_sql(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);b=MemoryBridge();h=types.SimpleNamespace(TARGET=root,facts=lambda:[]);h.start_job=lambda _:self.fail('must not restart');h.run=lambda *a:self.fail('must not remove foreign container')
   job={'root':root,'cid':'c'*64,'jobId':ident(5),'profile':'probe','ownerId':ident(2),'receiptHash':H}
   created={'jobId':ident(5),'containerId':'c'*64,'project':'project','service':'probe','ownerId':ident(2),'schema':'controller-job-created-v1'};job['receiptHash']=b.frozen_input(h,root/'evidence/jobs'/(ident(5)+'-created.json'),created,0)
   end={'schema':'controller-job-end-v1',**{k:created[k] for k in ['jobId','containerId','project','service','ownerId']},'createdReceiptHash':job['receiptHash'],'exitCode':0,'finishedAt':'2026-10-15T00:00:01Z','startedAt':'2026-10-15T00:00:00Z','containerStopped':True,'sqlAbsence':'NOT VERIFIED'};b.frozen_input(h,root/'evidence/jobs'/(ident(5)+'-end.json'),end,0)
   (root/'evidence/jobs'/(ident(5)+'-output.log')).write_text('{"type":"PASS"}')
   b.read_private=lambda p,*a:(p.read_bytes(),c.digest(p.read_bytes()))
   output,proof=c.complete_job(h,b,job,lambda:self.fail('must not refresh mailbox'))
   self.assertEqual(json.loads(output),{'type':'PASS'});self.assertEqual(proof['containerFIN'],'PASS')
 def test_retry_intent_blocks_old_controller_lock_release_even_with_positive_probe(self):
  with tempfile.TemporaryDirectory() as tmp:
   h=types.SimpleNamespace(TARGET=pathlib.Path(tmp));(h.TARGET/'master').mkdir();(h.TARGET/'master/commit-retry-intent.json').write_text('{}')
   with self.assertRaisesRegex(AssertionError,'COMMIT_RELEASE_AFTER_RETRY_DENIED'):c.release_original_lock(h,MemoryBridge(),{},H,{},{},H)
 def test_release_requires_positive_probe_job_end_and_preserves_pending_intent(self):
  with tempfile.TemporaryDirectory() as tmp:
   h,b,p,f,o,oh,pj,pp,lock=release_fixture(pathlib.Path(tmp));journal=lock.parent/'target.jsonl';before=journal.read_bytes()
   (h.TARGET/'evidence/jobs'/(ident(6)+'-end.json')).unlink()
   with self.assertRaises(FileNotFoundError):model_release(h,b,p,c.digest(p),f,o,oh,pj,pp)
   self.assertTrue(lock.exists());self.assertEqual(journal.read_bytes(),before)
 def test_release_and_reentry_are_idempotent_and_cannot_unlock_retry_owner(self):
  with tempfile.TemporaryDirectory() as tmp:
   h,b,p,f,o,oh,pj,pp,lock=release_fixture(pathlib.Path(tmp));journal=lock.parent/'target.jsonl';before=journal.read_bytes()
   released=model_release(h,b,p,c.digest(p),f,o,oh,pj,pp);self.assertFalse(lock.exists());self.assertEqual(journal.read_bytes(),before)
   b.frozen_input(h,h.TARGET/'master/commit-retry-intent.json',{'already':'chosen'},0);lock.write_text('new retry controller lock')
   self.assertEqual(model_release(h,b,p,c.digest(p),f,o,oh,pj,pp),released);self.assertEqual(lock.read_text(),'new retry controller lock')
 def test_crash_after_unlink_resumes_only_with_the_same_persisted_release_intent(self):
  with tempfile.TemporaryDirectory() as tmp:
   h,b,p,f,o,oh,pj,pp,lock=release_fixture(pathlib.Path(tmp));original=b.frozen_input
   def fail_final(h,path,value,uid=999):
    if path.name=='commit-controller-released.json':raise RuntimeError('CUT_AFTER_UNLINK')
    return original(h,path,value,uid)
   b.frozen_input=fail_final
   with self.assertRaisesRegex(RuntimeError,'CUT_AFTER_UNLINK'):model_release(h,b,p,c.digest(p),f,o,oh,pj,pp)
   self.assertFalse(lock.exists());b.frozen_input=original
   self.assertRegex(model_release(h,b,p,c.digest(p),f,o,oh,pj,pp),'^[a-f0-9]{64}$')
 def test_replaced_lock_inode_is_never_unlinked_by_old_release_intent(self):
  with tempfile.TemporaryDirectory() as tmp:
   h,b,p,f,o,oh,pj,pp,lock=release_fixture(pathlib.Path(tmp));original=b.frozen_input
   def replace_after_intent(h,path,value,uid=999):
    result=original(h,path,value,uid)
    if path.name=='commit-controller-release-intent.json':
     other=lock.with_name('replacement');other.write_bytes(lock.read_bytes());lock.unlink();other.rename(lock)
    return result
   b.frozen_input=replace_after_intent
   with self.assertRaisesRegex(AssertionError,'COMMIT_RELEASE_LOCK_REPLACED'):model_release(h,b,p,c.digest(p),f,o,oh,pj,pp)
   self.assertTrue(lock.exists());self.assertFalse((h.TARGET/'master/commit-controller-released.json').exists())
 def test_probe_or_occurrence_change_never_releases_the_journal(self):
  with tempfile.TemporaryDirectory() as tmp:
   h,b,p,f,o,oh,pj,pp,lock=release_fixture(pathlib.Path(tmp));o['backendPid']=99
   with self.assertRaisesRegex(AssertionError,'COMMIT_RELEASE_CUSTODY'):model_release(h,b,p,c.digest(p),f,o,c.digest(o),pj,pp)
   self.assertTrue(lock.exists())
 def test_run_resume_at_confirmed_checkpoints_never_regenerates_job_or_operation_ids(self):
  for cut in ['commit-fault-plan.json','commit-failed-controller-end.json','commit-probe-job.json','commit-controller-released.json','commit-retry-intent.json','commit-retry-job.json']:
   with self.subTest(cut=cut),tempfile.TemporaryDirectory() as tmp:
    model=RunModel(pathlib.Path(tmp),cut)
    with self.assertRaisesRegex(RuntimeError,'CONFIRMED_CUT'):model.execute()
    model.cfg={**model.cfg,'invocationId':ident(99)};model.env={**model.env,'QA_INVOCATION_ID':ident(99)}
    result=model.execute();self.assertEqual(result['physicalCohortAcceptance'],'NOT VERIFIED');self.assertEqual(len(model.jobs),3);self.assertEqual(len(model.started),3);self.assertEqual((model.selected_effects,model.probe_runs,model.retry_runs,model.releases),(1,1,1,1))
    with patch.object(c.uuid,'uuid4',side_effect=AssertionError('REGENERATED')):self.assertEqual(model.execute(),result)
    self.assertEqual(len(model.started),3);self.assertEqual(model.selected_effects,1)

if __name__=='__main__':unittest.main()
