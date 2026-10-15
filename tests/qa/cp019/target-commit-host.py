"""Passive, Root-only COMMIT/ACK QA controller. No import-time effects.

The prospective plan binds the real CREATED CID. Two unconfirmed draft files
are bound at CREATE, finalized on the SAME inodes, fsynced and made 400 before
START. Neither a confirmed config nor any material/operation ID is rewritten.
"""
import datetime,hashlib,json,os,pathlib,re,stat,uuid

def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else canonical(v)).hexdigest()
def check(v,code):
 if not v:raise AssertionError(code)

COMMAND=['node','tests/qa/cp019/target-runtime.mjs','run','promotion']
PROBE_COMMAND=['node','tests/qa/cp019/commit-fault-probe.mjs']
CONFIG_ALIAS='/run/qa-secrets/target-promotion-config.json'
CONTEXT_ALIAS='/run/qa-secrets/target-commit-fault-context.json'
def exists(path):return path.exists() or path.is_symlink()
def timestamp(value):
 try:return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
 except (TypeError,ValueError,AttributeError):raise AssertionError('COMMIT_END_TIME') from None

def make_plan(m,base,invocation,cid):
 check(re.fullmatch('[0-9a-f]{64}',cid or '') and str(uuid.UUID(invocation))==invocation,'COMMIT_HOST_CREATED')
 p=base['plan'];check(base['planHash']==digest(p) and p['schema']=='target-driver-plan-v1' and p['generation']==m['target']['generation'] and p['recoveryId']==m['recoveryId'],'COMMIT_HOST_PLAN')
 step=p['phases']['promotion']['steps'][0];a=step['args']
 check(step['method']=='preparePromotion' and a['operationKey']=='target-prepare-promote' and a['expected']=={'stage':'VERIFIED','version':'5','global_blocked':True} and a['after']=={'stage':'PROMOTING','version':'6','global_blocked':True} and re.fullmatch('[a-f0-9]{64}',a.get('proofHash','')),'COMMIT_HOST_PROMOTION')
 return {'schema':'cp019-commit-fault-plan-v1','caseName':'target-commit-fault','phase':'promotion','invocationId':invocation,'controllerContainerId':cid,'recoveryId':m['recoveryId'],'generation':m['target']['generation'],'controllerOwner':m['controllerOwner'],'operationId':m['stageOperationIds']['target-prepare-promote'],'sourceSha':p['sourceSha'],'parentPlanHash':base['planHash'],'variantLineageHash':base['variantLineageHash'],'resourceHash':p['resourceHash'],'sourceEndProofHash':p['sourceEndProofHash'],'expectedHash':digest(a['expected']),'afterHash':digest(a['after']),'statement':{'text':'SELECT * FROM saas.prepare_recovery_promotion($1::uuid,$2::uuid,$3::bigint)','values':[m['recoveryId'],m['controllerOwner'],'5']},'fault':'SUPPRESS_ACK_AFTER_ACKNOWLEDGED_COMMIT'}

def draft(h,path):
 check(path.parent==h.TARGET/'secrets' and not path.exists() and not path.is_symlink(),'COMMIT_DRAFT_COLLISION')
 h.write_plain(path,canonical({'schema':'cp021-unconfirmed-draft-v1'}),0o600,999)
 before=path.lstat();check(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_uid==999 and before.st_mode&0o777==0o600,'COMMIT_DRAFT_CUSTODY')
 return (before.st_dev,before.st_ino)

def seal_draft(h,path,identity,value):
 """Resume only the identical bound inode. A confirmed 400 is read-only."""
 check(path.resolve()==path and not path.is_symlink(),'COMMIT_DRAFT_PATH')
 before=path.lstat();check((before.st_dev,before.st_ino)==tuple(identity) and stat.S_ISREG(before.st_mode) and before.st_uid==999 and before.st_nlink==1,'COMMIT_DRAFT_CHANGED')
 if before.st_mode&0o777==0o400:
  saved,sha=h.target_bridge().read400(path);check(saved==value and sha==digest(value),'COMMIT_DRAFT_CONFIRMED_CHANGED');return sha
 fd=os.open(path,os.O_RDWR|getattr(os,'O_NOFOLLOW',0))
 try:
  s=os.fstat(fd);check((s.st_dev,s.st_ino)==tuple(identity) and stat.S_ISREG(s.st_mode) and s.st_uid==999 and s.st_nlink==1 and s.st_mode&0o777==0o600,'COMMIT_DRAFT_CHANGED')
  old=os.read(fd,4096);check(old==canonical({'schema':'cp021-unconfirmed-draft-v1'}),'COMMIT_DRAFT_CONFIRMED_ALREADY')
  raw=canonical(value);check(2<=len(raw)<=262144,'COMMIT_DRAFT_SIZE');os.lseek(fd,0,os.SEEK_SET);os.ftruncate(fd,0)
  offset=0
  while offset<len(raw):
   count=os.write(fd,raw[offset:]);check(count>0,'COMMIT_DRAFT_SHORT_WRITE');offset+=count
  os.fchmod(fd,0o400);os.fsync(fd)
  named=path.lstat();check((named.st_dev,named.st_ino)==tuple(identity) and named.st_nlink==1 and named.st_mode&0o777==0o400,'COMMIT_DRAFT_CHANGED')
 finally:os.close(fd)
 h.syncdir(path.parent)
 saved,sha=h.target_bridge().read400(path);check(saved==value and sha==digest(value),'COMMIT_DRAFT_READBACK');return sha

def job_end(h,b,job,expected_exit):
 created,ch=b.read400(job['root']/'evidence/jobs'/(job['jobId']+'-created.json'),0)
 ended,eh=b.read400(job['root']/'evidence/jobs'/(job['jobId']+'-end.json'),0)
 check(created.get('schema')=='controller-job-created-v1' and ended.get('schema')=='controller-job-end-v1' and created['jobId']==job['jobId'] and created['containerId']==job['cid'] and created['service']==job['profile'] and created['ownerId']==job['ownerId'] and ended['createdReceiptHash']==ch==job['receiptHash'] and type(ended['exitCode']) is int and ended['exitCode']==expected_exit and ended['containerStopped'] is True and ended['sqlAbsence']=='NOT VERIFIED' and all(ended[k]==created[k] for k in ['jobId','containerId','project','service','ownerId']) and timestamp(ended['startedAt'])<=timestamp(ended['finishedAt']) and not ended['finishedAt'].startswith('0001-'),'COMMIT_JOB_END')
 actual=next((x for x in h.facts() if x['id']==job['cid']),None)
 if actual is not None:check(h.created_job_identity(actual,job,created) and actual['running'] is False and actual['pid']==0 and actual['status']=='exited' and actual['exitCode']==expected_exit and actual['finishedAt']==ended['finishedAt'],'COMMIT_JOB_END_CHANGED')
 return created,ch,ended,eh,actual

def failed_end(h,b,job,plan,occurrence):
 created,ch,ended,eh,actual=job_end(h,b,job,1)
 check(created['jobId']==plan['invocationId'] and created['containerId']==plan['controllerContainerId'] and created['ownerId']==plan['controllerOwner'] and created['commandHash']==digest(COMMAND),'COMMIT_FAILED_JOB_IDENTITY')
 check(occurrence.get('schema')=='cp019-commit-fault-occurrence-v1' and occurrence.get('planHash')==digest(plan) and occurrence.get('controllerContainerId')==job['cid'] and occurrence.get('invocationId')==plan['invocationId'] and occurrence.get('commitAcknowledged') is True and type(occurrence.get('backendPid')) is int and occurrence['backendPid']>0 and isinstance(occurrence.get('backendStartedAt'),str),'COMMIT_OCCURRENCE')
 observed={'containerId':created['containerId'],'ownerId':created['ownerId'],'running':False,'pid':0,'status':'exited','exitCode':1,'finishedAt':ended['finishedAt']}
 return created,ch,ended,eh,observed

def injection_intent(h,b,cfg,binding):
 path=h.TARGET/'master/commit-injection-intent.json';stable={k:v for k,v in cfg.items() if k not in ['invocationId','commitFaultContextHash']}
 if exists(path):
  value,_=b.read400(path,0);check(value.get('schema')=='cp021-commit-injection-intent-v1' and value.get('binding')==binding and {k:v for k,v in value['config'].items() if k!='invocationId'}==stable,'COMMIT_HOST_RESUME_BINDING');return value
 value={'schema':'cp021-commit-injection-intent-v1','binding':binding,'config':{**stable,'invocationId':cfg['invocationId']}};b.frozen_input(h,path,value,0);return value

def fixed_job(h,b,profile,command,environment,mounts,path):
 """CREATE at most once; only the Root receipt can recover an interrupted CREATE."""
 invocation=environment['QA_INVOCATION_ID'];check(str(uuid.UUID(invocation))==invocation,'COMMIT_JOB_INVOCATION')
 binding={'profile':profile,'commandHash':digest(command),'environmentHash':digest(environment),'mountsHash':digest([[str(s),d,m] for s,d,m in mounts])}
 if exists(path):
  saved,_=b.read400(path,0);check(saved.get('schema')=='cp021-commit-job-v1' and saved.get('binding')==binding,'COMMIT_JOB_RESUME_BINDING');job={**saved['job'],'root':pathlib.Path(saved['job']['root'])}
  check(job['root']==h.TARGET and job['jobId']==invocation and job['profile']==profile,'COMMIT_JOB_REFERENCE');created,ch=b.read400(h.TARGET/'evidence/jobs'/(invocation+'-created.json'),0)
  check(ch==job['receiptHash'] and created['containerId']==job['cid'] and created['jobId']==invocation and created['ownerId']==job['ownerId'] and created['commandHash']==digest(command),'COMMIT_JOB_REFERENCE');return job
 receipt_path=h.TARGET/'evidence/jobs'/(invocation+'-created.json')
 if exists(receipt_path):
  created,ch=b.read400(receipt_path,0);check(created.get('schema')=='controller-job-created-v1' and created['jobId']==invocation and created['service']==profile and created['commandHash']==digest(command),'COMMIT_JOB_RECOVERY_REFERENCE')
  job={'cid':created['containerId'],'jobId':invocation,'root':h.TARGET,'profile':profile,'ownerId':created['ownerId'],'receiptHash':ch}
  actual=next((x for x in h.facts() if x['id']==job['cid']),None);check(actual and h.created_job_identity(actual,job,created) and actual['status']=='created' and actual['running'] is False,'COMMIT_JOB_RECOVERY_NOT_CREATED')
 else:
  check(not any(x.get('jobId')==invocation for x in h.facts()),'COMMIT_JOB_UNRECEIPTED_KEEP');job=h.create_job(h.TARGET,profile,command,environment,mounts=mounts,sample=False)
  check(job['jobId']==invocation,'COMMIT_JOB_INVOCATION')
 b.frozen_input(h,path,{'schema':'cp021-commit-job-v1','binding':binding,'job':{**job,'root':str(job['root'])}},0);return job

def completed_job(h,b,job,expected_exit):
 created,ch,ended,eh,actual=job_end(h,b,job,expected_exit)
 raw,_=b.read_private(job['root']/'evidence/jobs'/(job['jobId']+'-output.log'),999,262144,0o400,False)
 if expected_exit==0 and actual is not None:
  # A crash after durable END but before rm must not rerun the successful job.
  h.run('docker','rm',job['cid'])
 return raw.decode(),{'containerId':job['cid'],'jobCreatedHash':ch,'jobEndHash':eh,'containerFIN':'PASS','sqlFIN':'NOT VERIFIED'}

def complete_job(h,b,job,publish,expected_exit=0):
 if exists(job['root']/'evidence/jobs'/(job['jobId']+'-end.json')):return completed_job(h,b,job,expected_exit)
 actual=h.inspect_container(job['cid']);created,_=b.read400(job['root']/'evidence/jobs'/(job['jobId']+'-created.json'),0)
 check(h.created_job_identity(actual,job,created),'COMMIT_JOB_IDENTITY')
 if actual['status']=='created':
  check(actual['running'] is False,'COMMIT_JOB_CREATED_RUNNING');publish();h.start_job(job)
 else:check(actual['running'] is True or actual['status']=='exited' and actual['pid']==0,'COMMIT_JOB_RESUME_STATE')
 try:b.watch_job(h,job,publish)
 except AssertionError as error:
  check(expected_exit==1 and str(error) in ['VARIANT_JOB_FAILED_KEEP','JOB_FAILED_RETAINED_FOR_RECONCILIATION'],'COMMIT_JOB_FAILED_KEEP')
 return completed_job(h,b,job,expected_exit)

def lock_identity(s):return [s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_mode,s.st_uid,s.st_nlink]

def release_original_lock(h,b,plan,plan_hash,failed,probe,probe_hash,probe_job=None,probe_proof=None):
 """QA Root equivalent of releaseTerminatedController, never a generic API.

 The failed job's actual immutable CREATED/END and the positively ended SQL
 probe authorize only this original lock inode. Journal records stay intact.
 A durable retry intent forbids any subsequent use of the old process proof.
 """
 root=h.TARGET;done=root/'master/commit-controller-released.json';intent_path=root/'master/commit-controller-release-intent.json'
 anchors={'planHash':plan_hash,'failedEndHash':digest(failed),'probeHash':probe_hash,'probeJobProof':probe_proof}
 if exists(done):
  saved,sha=b.read400(done,0);check(saved.get('anchors')==anchors and saved.get('schema')=='cp021-commit-controller-released-v1','COMMIT_RELEASE_CHANGED');return sha
 check(not exists(root/'master/commit-retry-intent.json'),'COMMIT_RELEASE_AFTER_RETRY_DENIED')
 check(plan_hash==digest(plan) and probe_job is not None and probe_proof is not None,'COMMIT_RELEASE_PROOFS')
 probe_created,ch,_,eh,_=job_end(h,b,probe_job,0);check(probe_created.get('commandHash')==digest(PROBE_COMMAND) and probe_job['jobId']!=plan['invocationId'] and probe_proof=={'containerId':probe_job['cid'],'jobCreatedHash':ch,'jobEndHash':eh,'containerFIN':'PASS','sqlFIN':'NOT VERIFIED'},'COMMIT_RELEASE_PROBE_END')
 created=failed['created'];ended=failed['ended'];observed=failed['observed']
 saved_created,sch=b.read400(root/'evidence/jobs'/(plan['invocationId']+'-created.json'),0);saved_ended,seh=b.read400(root/'evidence/jobs'/(plan['invocationId']+'-end.json'),0)
 occurrence,oh=b.read400(root/'evidence/target-commit-fault-occurrence.json');saved_probe,sph=b.read400(root/'evidence/commit-end-probe.json')
 check((saved_created,sch,saved_ended,seh)==(created,failed['createdHash'],ended,failed['endedHash']) and oh==failed['occurrenceHash'] and occurrence.get('planHash')==plan_hash and occurrence.get('controllerContainerId')==plan['controllerContainerId'] and occurrence.get('invocationId')==plan['invocationId'] and occurrence.get('commitAcknowledged') is True and probe.get('backendPid')==occurrence.get('backendPid') and probe.get('backendStartedAt')==occurrence.get('backendStartedAt') and (saved_probe,sph)==(probe,probe_hash),'COMMIT_RELEASE_CUSTODY')
 check(failed['createdHash']==digest(created) and failed['endedHash']==digest(ended) and ended['createdReceiptHash']==failed['createdHash'] and created['containerId']==plan['controllerContainerId'] and created['jobId']==plan['invocationId'] and created['ownerId']==plan['controllerOwner'] and ended['containerId']==created['containerId'] and ended['exitCode']==1 and ended['containerStopped'] is True and observed=={'containerId':created['containerId'],'ownerId':created['ownerId'],'running':False,'pid':0,'status':'exited','exitCode':1,'finishedAt':ended['finishedAt']},'COMMIT_RELEASE_FAILED_END')
 check(probe_hash==digest(probe) and probe.get('schema')=='cp019-commit-fault-end-probe-v1' and probe.get('invocationId')==plan['invocationId'] and probe.get('containerId')==plan['controllerContainerId'] and probe.get('ownerId')==plan['controllerOwner'] and probe.get('resourceHash')==plan['resourceHash'] and probe.get('controllerExited') is True and probe.get('sqlBackendAbsent') is True and probe.get('sqlOwnerAbsent') is True,'COMMIT_RELEASE_SQL_REQUIRED')
 lock=root/'journal/target.jsonl.controller.lock';owner={'recoveryId':plan['recoveryId'],'controllerOwner':plan['controllerOwner'],'resourceHash':plan['resourceHash']}
 if exists(intent_path):
  intent,ih=b.read400(intent_path,0);check(intent.get('schema')=='cp021-commit-controller-release-intent-v1' and intent.get('anchors')==anchors and intent.get('lockHash')==digest(owner),'COMMIT_RELEASE_INTENT_CHANGED')
 else:
  before=lock.lstat();saved,lock_hash=b.read_private(lock,999,262144,0o600);check(saved==owner and lock_hash==digest(owner) and lock_identity(before)==lock_identity(lock.lstat()),'COMMIT_RELEASE_LOCK_OWNER')
  intent={'schema':'cp021-commit-controller-release-intent-v1','anchors':anchors,'lockHash':lock_hash,'lockIdentity':lock_identity(before)};ih=b.frozen_input(h,intent_path,intent,0)
 if exists(lock):
  saved,lh=b.read_private(lock,999,262144,0o600);check(saved==owner and lh==intent['lockHash'],'COMMIT_RELEASE_LOCK_OWNER');fd=os.open(lock,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
  try:
   check(lock_identity(os.fstat(fd))==intent['lockIdentity']==lock_identity(lock.lstat()),'COMMIT_RELEASE_LOCK_REPLACED');os.unlink(lock)
  finally:os.close(fd)
 h.syncdir(lock.parent);check(not exists(lock),'COMMIT_RELEASE_LOCK_REAPPEARED')
 return b.frozen_input(h,done,{'schema':'cp021-commit-controller-released-v1','anchors':anchors,'releaseIntentHash':ih,'lockHash':intent['lockHash'],'released':True},0)

def fixed_invocation(h,b,path,binding):
 if exists(path):
  saved,_=b.read400(path,0);check(saved.get('schema')=='cp021-commit-next-invocation-v1' and saved.get('binding')==binding and str(uuid.UUID(saved['invocationId']))==saved['invocationId'],'COMMIT_NEXT_INVOCATION_CHANGED');return saved['invocationId']
 invocation=str(uuid.uuid4());b.frozen_input(h,path,{'schema':'cp021-commit-next-invocation-v1','binding':binding,'invocationId':invocation},0);return invocation

def fixed_draft(h,b,path,record):
 if exists(record):
  saved,_=b.read400(record,0);check(saved.get('schema')=='cp021-commit-draft-v1' and saved.get('path')==str(path),'COMMIT_DRAFT_REFERENCE');before=path.lstat();identity=saved['identity'];check([before.st_dev,before.st_ino]==identity,'COMMIT_DRAFT_CHANGED');return identity
 identity=draft(h,path);b.frozen_input(h,record,{'schema':'cp021-commit-draft-v1','path':str(path),'identity':list(identity)},0);return identity

def run(h,b,cfg,base,profile,command,environment,mounts):
 """A finite, receipt-driven resume. No stage restarts a terminated job.

 Invoke before publishing the normal promotion invocation config. These two
 aliases are owned here so CREATE can bind drafts before their CID is known.
 Every ledger entry stays in the already opened target-commit-fault case.
 """
 check(getattr(h,'kind',None)=='commit-interrupted' and command==COMMAND and profile in ['probe','harness'] and cfg.get('phase')=='promotion' and environment.get('QA_INVOCATION_ID')==cfg['invocationId'],'COMMIT_HOST_SCOPE')
 check(not any(d in [CONFIG_ALIAS,CONTEXT_ALIAS] for _,d,_ in mounts),'COMMIT_HOST_ALIAS_COLLISION')
 m=h.material_owned();root=h.TARGET
 binding={'baseHash':digest(base),'profile':profile,'command':command,'environment':{k:v for k,v in environment.items() if k!='QA_INVOCATION_ID'},'mounts':[[str(s),d,mode] for s,d,mode in mounts]}
 intent=injection_intent(h,b,cfg,binding);cfg=intent['config'];environment={**environment,'QA_INVOCATION_ID':cfg['invocationId']}
 config_path=root/'secrets'/('target-promotion-invocation-'+cfg['invocationId']+'.json');context_path=root/'secrets'/('commit-fault-inject-'+cfg['invocationId']+'.json')
 ci=fixed_draft(h,b,config_path,root/'master/commit-config-draft.json');ti=fixed_draft(h,b,context_path,root/'master/commit-context-draft.json')
 bindings=[*mounts,(config_path,CONFIG_ALIAS,'ro'),(context_path,CONTEXT_ALIAS,'ro')]
 job=fixed_job(h,b,profile,command,environment,bindings,root/'master/commit-injection-job.json')
 plan=make_plan(m,base,cfg['invocationId'],job['cid']);plan_hash=digest(plan)
 b.frozen_input(h,root/'master/commit-fault-plan.json',{'schema':'cp021-commit-created-plan-v1','plan':plan,'planHash':plan_hash,'job':{**job,'root':str(job['root'])}},0)
 context={'schema':'target-commit-fault-context-v1','configBundleHash':cfg['configBundleHash'],'sourceCaptureHash':cfg['sourceCaptureHash'],'variantLineageHash':base['variantLineageHash'],'mode':'inject','plan':plan,'planHash':plan_hash,'retryEndPair':None,'retryProbe':None}
 if any(p.lstat().st_mode&0o777!=0o400 for p in [config_path,context_path]):
  actual=h.inspect_container(job['cid']);check(actual['status']=='created' and actual['running'] is False and h.created_job_identity(actual,job,h.read_created_job(job)),'COMMIT_DRAFT_STARTED_KEEP')
 cfg={**cfg,'commitFaultContextHash':seal_draft(h,context_path,ti,context)};seal_draft(h,config_path,ci,cfg)
 publish=lambda:b.atomic_mailbox(h,'target-host.json',b.observation(h,'promotion',cfg,base))
 complete_job(h,b,job,publish,1)
 occurrence,oh=b.read400(root/'evidence/target-commit-fault-occurrence.json');created,ch,ended,eh,observed=failed_end(h,b,job,plan,occurrence)
 failed={'created':created,'createdHash':ch,'ended':ended,'endedHash':eh,'observed':observed,'occurrenceHash':oh}
 b.frozen_input(h,root/'master/commit-failed-controller-end.json',failed,0)
 # Root END, log and occurrence are durable. Removing only the exact stopped
 # CID frees the one probe slot; this is not SQL FIN or retry authorization.
 _,_,_,_,actual=job_end(h,b,job,1)
 if actual is not None:h.run('docker','rm',job['cid'])
 ca=b.read_private(root/'config/ca.crt',0,65536,0o444,False)[0].decode()
 probe_cfg={'schema':'cp021-commit-end-config-v1','project':h.target_project(),'caseName':'target-commit-fault','custodyHash':cfg['custodyHash'],'sourceSha':cfg['sourceSha'],'systemIdentifier':base['manifest']['target']['systemIdentifier'],'plan':plan,'planHash':plan_hash,'occurrence':occurrence,'occurrenceHash':oh,'observed':observed,'jobCreated':created,'jobCreatedHash':ch,'jobEnd':ended,'jobEndHash':eh,'connection':{'host':'postgres','port':5432,'database':'mecanet_control','user':'qa_bootstrap','password':m['target']['rolePasswords']['qa_bootstrap'],'ssl':{'ca':ca,'servername':'postgres','rejectUnauthorized':True},'max':1,'connectionTimeoutMillis':2000,'statement_timeout':2000,'lock_timeout':300}}
 probe_path=root/'secrets/commit-end-probe-config.json';probe_cfg_hash=b.frozen_input(h,probe_path,probe_cfg)
 probe_inv=fixed_invocation(h,b,root/'master/commit-probe-intent.json',{'configHash':probe_cfg_hash,'commandHash':digest(PROBE_COMMAND)})
 probe_env={'QA_PROJECT':h.target_project(),'QA_CODE_SHA':cfg['sourceSha'],'QA_INVOCATION_ID':probe_inv}
 probe_job=fixed_job(h,b,'probe',PROBE_COMMAND,probe_env,[(probe_path,'/run/qa-secrets/commit-end-probe-config.json','ro')],root/'master/commit-probe-job.json')
 output,probe_proof=complete_job(h,b,probe_job,publish);result=json.loads(output);probe,ph=b.read400(root/'evidence/commit-end-probe.json')
 expected_probe={'schema':'cp019-commit-fault-end-probe-v1','invocationId':plan['invocationId'],'containerId':plan['controllerContainerId'],'ownerId':plan['controllerOwner'],'resourceHash':plan['resourceHash'],'backendPid':occurrence['backendPid'],'backendStartedAt':occurrence['backendStartedAt'],'controllerExited':True,'sqlBackendAbsent':True,'sqlOwnerAbsent':True}
 check(result=={'type':'cp021-commit-end-probe','status':'PASS','reportHash':ph,'secretsPrinted':False} and probe==expected_probe,'COMMIT_END_PROBE_REQUIRED')
 pair={'schema':'cp021-commit-retry-end-v1','planHash':plan_hash,'invocationId':plan['invocationId'],'occurrenceHash':oh,'jobCreated':created,'jobCreatedHash':ch,'jobEnd':ended,'jobEndHash':eh,'observed':observed,'backend':{'pid':occurrence['backendPid'],'absent':True,'resourceHash':plan['resourceHash'],'probeHash':ph}}
 b.frozen_input(h,root/'master/commit-retry-end.json',pair,0)
 released_hash=release_original_lock(h,b,plan,plan_hash,failed,probe,ph,probe_job,probe_proof)
 # The original proof can never unlock a subsequently created retry controller.
 retry_inv=fixed_invocation(h,b,root/'master/commit-retry-intent.json',{'planHash':plan_hash,'retryEndHash':digest(pair),'releasedHash':released_hash})
 retry={**cfg,'invocationId':retry_inv};retry_context=root/'secrets/commit-fault-reconcile-context.json'
 retry['commitFaultContextHash']=b.frozen_input(h,retry_context,{**context,'mode':'reconcile','retryEndPair':pair,'retryProbe':probe})
 retry_path=root/'secrets'/('target-promotion-invocation-'+retry_inv+'.json');b.frozen_input(h,retry_path,retry)
 retry_command,retry_env=b.phase_arguments(h,'promotion','run',cfg['sourceSha'],retry_inv)
 retry_job=fixed_job(h,b,profile,retry_command,retry_env,[*mounts,(retry_path,CONFIG_ALIAS,'ro'),(retry_context,CONTEXT_ALIAS,'ro')],root/'master/commit-retry-job.json')
 publish_retry=lambda:b.atomic_mailbox(h,'target-host.json',b.observation(h,'promotion',retry,base))
 output,proof=complete_job(h,b,retry_job,publish_retry);result=json.loads(output)
 check(result.get('type')=='cp019-target-phase' and result.get('phase')=='promotion' and result.get('planHash')==base['planHash'] and result.get('secretOutput') is False,'COMMIT_RETRY_RESULT')
 receipt,rh=b.read400(root/'evidence/target-promotion.json');check(result.get('receiptHash')==rh and receipt.get('commitFaultPlanHash')==plan_hash and receipt.get('commitFaultOccurrenceHash')==oh and receipt.get('result',{}).get('results',[{}])[0].get('method')=='preparePromotion' and receipt['result']['results'][0].get('reconciled') is True,'COMMIT_RETRY_NOT_RECONCILED')
 return {'result':'PASS FOR COMMIT/ACK FAULT ONLY','phase':'promotion','action':'run','jobProof':proof,'probeJobProof':probe_proof,'planHash':plan_hash,'occurrenceHash':oh,'retryEndHash':digest(pair),'journalReleaseHash':released_hash,'receiptHash':rh,'physicalCohortAcceptance':'NOT VERIFIED'}
