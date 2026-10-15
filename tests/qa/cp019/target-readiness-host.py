"""Passive Root orchestration for copied readiness fixtures and final closure.

Only functions called by the audited host perform I/O. No SSH, initdb, source
mutation, current-version adoption, command fallback or retry budget exists.
"""
import copy, datetime, hashlib, json, os, pathlib, re, stat, time, uuid

SOURCE='mecanet-qa-p1l3-r03';PROJECT=SOURCE+'-target'
KINDS=('roster-empty','allclosed','a5-restrictions')
A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
HASH=re.compile(r'^[0-9a-f]{64}$');SHA=re.compile(r'^[0-9a-f]{40}$');UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
ACTIONS=('prepare-empty','complete-empty','close-empty','end-empty','final-close','probe-unready','probe-ready')

def check(ok,code):
 if not ok:raise AssertionError(code)
def canonical(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def digest(x):return hashlib.sha256(x if isinstance(x,bytes) else canonical(x)).hexdigest()
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def all_ids(x):
 if isinstance(x,str):return {x} if UUID.fullmatch(x) else set()
 if isinstance(x,dict):return set().union(*(all_ids(v) for v in x.values()))
 if isinstance(x,list):return set().union(*(all_ids(v) for v in x))
 return set()
def case_name(kind):check(kind in KINDS,'READINESS_KIND');return {'roster-empty':'ready-empty','allclosed':'ready-allclosed','a5-restrictions':'variant-a5-identity'}[kind]
def validate_input(x,kinds=KINDS):
 c=x['lineage'];kind=c['kind'];m=c['effectiveMaterial'];r=x['targetResource'];a=c['addition'];root=pathlib.PurePosixPath('/opt')/PROJECT/'variants'/kind
 check(kind in kinds and SHA.fullmatch(x.get('sourceSha','')) and isinstance(x.get('targetCa'),str) and 0<len(x['targetCa'])<=65536,'READINESS_INPUT')
 check(c['additionHash']==digest(a) and a['effectiveMaterialHash']==digest(m) and a['originalMaterialHash']==digest(c['originalMaterial']) and a['sourceEndProofHash']==digest(c['sourceEndProof']) and a['copyIndexHash']==digest(c['copyIndex']) and a['sourceCaptureHash']==digest(c['sourceCapture']),'READINESS_LINEAGE')
 check(r['project']==PROJECT and r['generation']==m['target']['generation'] and r['dataPath']==str(root/'data/18/docker') and r['socketPath']==str(root/'ingress/http.sock') and r['systemIdentifier']==c['sourceResource']['systemIdentifier'] and HASH.fullmatch(r['containerId']) and r['containerId']!=c['sourceResource']['containerId'],'READINESS_RESOURCE')
 return c,m,r
def make_empty_plan(x):
 c,m,r=validate_input(x,('roster-empty',));check(all(HASH.fullmatch(c['sourceCapture']['sourceFingerprints'].get(k,'')) for k in ['central',A,B]),'READINESS_SOURCE_FINGERPRINT')
 manifest={'schema':'cp019-empty-normal-manifest-v1','mode':'NORMAL','runId':m['recoveryId'],'generation':m['target']['generation'],'controllerOwner':m['controllerOwner'],'expectedTenants':[],'sourceSha':x['sourceSha'],'variantLineageHash':c['additionHash'],'sourceEndProofHash':c['addition']['sourceEndProofHash'],'copyIndexHash':c['addition']['copyIndexHash'],'resourceHash':digest(r),'database':'mecanet_control_empty'}
 body={'kind':'recovery-initial','mode':'NORMAL','generation':m['target']['generation'],'runId':m['recoveryId'],'manifestHash':digest(manifest),'previousOwner':m['target']['seedClockOwner'],'nextOwner':m['target']['workerClockOwner'],'transferId':m['target']['operationIds']['clockTransfer'],'endProofHash':c['addition']['sourceEndProofHash'],'expectedClockVersion':'0','expectedTick':'0','confirmed':True,'reference':'custodied-'+c['addition']['sourceEndProofHash']}
 return {'schema':'cp019-empty-readiness-plan-v1','caseName':'ready-empty','kind':'roster-empty','database':'mecanet_control_empty','preserveDatabases':['mecanet_control','mecanet_tenant_a','mecanet_tenant_b','mecanet_demo'],'sourceSha':x['sourceSha'],'sourceSystemIdentifier':c['sourceResource']['systemIdentifier'],'targetResource':copy.deepcopy(r),'variantLineageHash':c['additionHash'],'custodyHash':digest(m),'sourceEndProofHash':c['addition']['sourceEndProofHash'],'sourceFingerprints':copy.deepcopy(c['sourceCapture']['sourceFingerprints']),'manifest':manifest,'manifestHash':digest(manifest),'clockTransfer':{**body,'transferHash':digest(body)},'proofHash':digest({'manifestHash':digest(manifest),'sourceEndProofHash':c['addition']['sourceEndProofHash'],'copyIndexHash':c['addition']['copyIndexHash'],'stage':'EMPTY_INITIAL_NORMAL'})}
def make_final_close_plan(x,manifest_hash,parent_plan_hash,restriction_id):
 c,m,r=validate_input(x,('allclosed','a5-restrictions'));kind=c['kind'];version='3' if kind=='allclosed' else '9'
 check(HASH.fullmatch(manifest_hash) and HASH.fullmatch(parent_plan_hash) and UUID.fullmatch(restriction_id) and restriction_id not in all_ids(m),'READINESS_FINAL_CLOSE_CHOICE')
 def fence(tenant,version,state):return {'tenantId':tenant,'generation':m['target']['generation'],'dataEpoch':'3','state':state,'writerVersion':version}
 return {'schema':'cp019-final-close-plan-v1','kind':kind,'caseName':case_name(kind),'restrictionId':restriction_id,'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'controllerOwner':m['controllerOwner'],'parentPlanHash':parent_plan_hash,'manifestHash':manifest_hash,'variantLineageHash':c['additionHash'],'resourceHash':digest(r),'sourceEndProofHash':c['addition']['sourceEndProofHash'],'expectedRun':{'stage':'COMPLETE','version':'7'},'expectedA':fence(A,version,'OPEN'),'afterA':fence(A,str(int(version)+1),'CLOSED'),'expectedB':fence(B,'2','CLOSED'),'globalBarrier':kind=='a5-restrictions','reasonCode':'TENANT'}

def bridge(h):return h.variant_bridge()
def read(h,path,uid=0,limit=262144,mode=0o400,json_value=True):return h.target_bridge().read_private(path,uid,limit,mode,json_value)
def publish(h,path,value,uid=0,limit=262144):
 raw=canonical(value);check(2<=len(raw)<=limit,'READINESS_INPUT_BOUND')
 if path.exists() or path.is_symlink():
  old,sha=read(h,path,uid,limit);check(old==value and sha==digest(value),'READINESS_IMMUTABLE_COLLISION');return sha
 h.write_plain(path,raw,0o400,uid);old,sha=read(h,path,uid,limit);check(old==value and sha==digest(value),'READINESS_PUBLICATION');return sha
def select_close_id(h,kind):
 """Explicit offline choice before this variant has any PostgreSQL reference.
 An existing choice is read exactly; no chooser runs on a retry."""
 check(kind in ('allclosed','a5-restrictions'),'READINESS_FINAL_CLOSE_KIND');v=bridge(h);view=v.VariantHost(h,kind);view.own(view.TARGET);view.preserve();c,ch=v.load_context(h,kind);path=view.TARGET/'master/readiness-close-choice.json'
 if path.exists() or path.is_symlink():
  saved,sha=read(h,path);check(saved.get('schema')=='cp021-final-close-choice-v1' and saved.get('kind')==kind and saved.get('lineageHash')==c['additionHash'] and saved.get('generation')==c['effectiveMaterial']['target']['generation'] and saved.get('recoveryId')==c['effectiveMaterial']['recoveryId'] and UUID.fullmatch(saved.get('restrictionId','')) and saved['restrictionId'] not in all_ids(c['effectiveMaterial']) and saved.get('expectedWriterVersion')==('3' if kind=='allclosed' else '9'),'READINESS_CLOSE_CHOICE_CHANGED');return saved
 check(not any(r['service'] in {'postgres','harness','probe','worker','api1','api2','web'} for r in view.references()),'READINESS_CLOSE_CHOICE_MUST_PRECEDE_SQL');value={'schema':'cp021-final-close-choice-v1','kind':kind,'lineageHash':c['additionHash'],'generation':c['effectiveMaterial']['target']['generation'],'recoveryId':c['effectiveMaterial']['recoveryId'],'restrictionId':str(uuid.uuid4()),'expectedWriterVersion':'3' if kind=='allclosed' else '9','caseName':case_name(kind)};publish(h,path,value);return value
def assemble_input(h,kind):
 v=bridge(h);view=v.VariantHost(h,kind);view.own(view.TARGET);view.preserve();c,ch=v.load_context(h,kind);s=v.source_inputs(h);resource=h.target_bridge().target_resource(view);artifact,ah=read(h,getattr(h,'runtime_directory',lambda:h.ROOT/'staging')()/'artifact.json',0,262144,0o444);ca,cah=read(h,view.TARGET/'config/ca.crt',0,65536,0o444,False)
 full={**copy.deepcopy(c),'sourceCapture':s['capture'],'sourceResource':s['normal']['resource'],'sourceEndProof':s['end']['endProof'],'observedSourceEnd':s['end']['observedEnd'],'copyIndex':s['index'],'sourceJournalFinalCheckpoint':s['head']};x={'lineage':full,'targetResource':resource,'sourceSha':artifact['sourceSha'],'targetCa':ca.decode('utf8')};validate_input(x);return view,x
def prepare_inputs(h,kind):
 """Publish immutable Root0400 authority plus separate UID9990400 inputs.
 This function runs no SQL and never replaces copied databases or material."""
 view,x=assemble_input(h,kind);h.set_host_case(case_name(kind));h.enter_runtime_case('target-window',case_name(kind));c=x['lineage'];small={k:copy.deepcopy(v) for k,v in c.items() if k!='copyIndex'};plan=None;bindings={}
 if kind=='roster-empty':plan=make_empty_plan(x);name='plan'
 else:
  choice,choice_hash=read(h,view.TARGET/'master/readiness-close-choice.json');check(choice.get('kind')==kind and choice.get('lineageHash')==c['additionHash'] and choice.get('expectedWriterVersion')==('3' if kind=='allclosed' else '9'),'READINESS_CLOSE_CHOICE_REQUIRED');m,b,bindings=h.target_bridge().bundle_context(view);check(m==c['effectiveMaterial'] and b['manifest']['target']==x['targetResource'] and b.get('variantLineageHash')==c['additionHash'],'READINESS_CLOSE_BUNDLE');plan=make_final_close_plan(x,b['anchors']['manifestHash'],b['planHash'],choice['restrictionId']);name='final-close'
 for suffix,value in [('context',small),(name,plan)]:
  publish(h,view.TARGET/'master'/('readiness-'+suffix+'.json'),value);publish(h,view.TARGET/'secrets'/('readiness-'+suffix+'.json'),value,999)
 index_hash=publish(h,view.TARGET/'secrets/readiness-copy-index.json',c['copyIndex'],999,4*1024**2)
 authority={'schema':'cp021-readiness-authority-v1','kind':kind,'caseName':case_name(kind),'sourceSha':x['sourceSha'],'contextHash':digest(small),'copyIndexHash':index_hash,'planHash':digest(plan),'targetResource':x['targetResource'],'targetCa':x['targetCa'],'httpCa':x['targetCa'],**{k:v for k,v in bindings.items() if k in ['configBundleHash','configBundleHeaderHash']}}
 publish(h,view.TARGET/'master/readiness-authority.json',authority);return authority
def load_authority(h,kind):
 view,x=assemble_input(h,kind);a,ah=read(h,view.TARGET/'master/readiness-authority.json');check(a.get('schema')=='cp021-readiness-authority-v1' and a.get('kind')==kind and a.get('caseName')==case_name(kind) and a.get('sourceSha')==x['sourceSha'] and a.get('targetResource')==x['targetResource'] and a.get('targetCa')==a.get('httpCa')==x['targetCa'],'READINESS_AUTHORITY_CHANGED')
 small,sh=read(h,view.TARGET/'secrets/readiness-context.json',999);index,ih=read(h,view.TARGET/'secrets/readiness-copy-index.json',999,4*1024**2);check({**small,'copyIndex':index}==x['lineage'] and sh==a['contextHash'] and ih==a['copyIndexHash'],'READINESS_SOURCE_CHANGED');name='plan' if kind=='roster-empty' else 'final-close';plan,ph=read(h,view.TARGET/'secrets'/('readiness-'+name+'.json'),999);root_plan,rph=read(h,view.TARGET/'master'/('readiness-'+name+'.json'));check(plan==root_plan and ph==rph==a['planHash'],'READINESS_PLAN_CUSTODY')
 expected=make_empty_plan(x) if kind=='roster-empty' else make_final_close_plan(x,plan['manifestHash'],plan['parentPlanHash'],plan['restrictionId']);check(plan==expected,'READINESS_PLAN_CHANGED');return view,x,a
def observation(h,view,x,cfg):
 v=bridge(h);view.guard_resources(view.facts(),[],view.expected_owners());r=h.target_bridge().target_resource(view);check(r==x['targetResource'],'READINESS_LIVE_RESOURCE_CHANGED');c=x['lineage'];source=c['sourceResource'];pg=h.inspect_container(source['containerId']);check(view.owned_identity(pg,view.expected_owners()) and pg['running'] is False and pg.get('status')=='exited' and pg.get('pid')==0,'READINESS_SOURCE_PG_REQUIRED');observed=h.target_bridge().source_end_observation(view,{'sourceEndProof':c['sourceEndProof']});consumers=[]
 for ref in view.references():
  if ref['service'] not in v.BUSINESS:continue
  actual=h.inspect_container(ref['containerId']);check(v.matches(actual,ref,h.PROFILES),'READINESS_LIVE_PROCESS_CHANGED');consumers.append({'service':ref['service'],'containerId':ref['containerId'],'ownerId':ref['ownerId'],'imageDigest':ref['imageRef'].split('@',1)[1],'running':actual['running'],'exitCode':actual.get('exitCode'),'finishedAt':actual.get('finishedAt')})
 body={'schema':'cp019-readiness-host-v1','kind':c['kind'],'action':cfg['action'],'invocationId':cfg['invocationId'],'sourceSha':x['sourceSha'],'targetResourceHash':digest(r),'variantLineageHash':c['additionHash'],'sourceEndProofHash':c['addition']['sourceEndProofHash'],'observedAt':stamp(),'sourcePostgresRunning':False,'targetPostgresRunning':True,'observedSourceEnd':observed,'runtimeConsumers':consumers};return {'receipt':body,'receiptHash':digest(body)}
def mailbox(h,view,packet):
 check(set(packet)=={'receipt','receiptHash'} and packet['receiptHash']==digest(packet['receipt']) and packet['receipt'].get('schema')=='cp019-readiness-host-v1','READINESS_MAILBOX');directory=view.TARGET/'live';s=directory.lstat();check(directory.resolve()==directory and not directory.is_symlink() and stat.S_ISDIR(s.st_mode) and s.st_uid==999 and stat.S_IMODE(s.st_mode)==0o700,'READINESS_MAILBOX_DIRECTORY');h.ledger_charge('artifactFiles');temp=directory/('.readiness-'+uuid.uuid4().hex+'.tmp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
 try:
  with os.fdopen(fd,'wb',closefd=False) as file:file.write(canonical(packet));file.flush();os.fchmod(fd,0o400);os.fchown(fd,999,999);os.fsync(fd)
  os.close(fd);fd=None;os.replace(temp,directory/'target-host.json');h.syncdir(directory)
 finally:
  if fd is not None:os.close(fd)
  if temp.exists():temp.unlink()
def validate_action(kind,action):
 check(kind in KINDS and action in ACTIONS,'READINESS_ACTION');check(action in (ACTIONS if kind=='roster-empty' else ['final-close','probe-unready','probe-ready'] if kind=='allclosed' else ['final-close']),'READINESS_ACTION_SCOPE');check(not(kind=='roster-empty' and action=='final-close'),'READINESS_ACTION_SCOPE')
def validate_node_receipt(receipt,x,a,action):
 kind=x['lineage']['kind'];m=x['lineage']['effectiveMaterial'];common={'kind':kind,'caseName':case_name(kind),'planHash':a['planHash'],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'sourceSha':x['sourceSha'],'variantLineageHash':x['lineage']['additionHash']};check(all(receipt.get(k)==v for k,v in common.items()),'READINESS_NODE_BINDING')
 if action.startswith('probe-'):
  phase=action.removeprefix('probe-');status=200 if phase=='ready' else 503;rows=receipt.get('instances',[]);check(receipt.get('schema')=='cp019-readiness-http-v1' and receipt.get('phase')==phase and receipt.get('expectedReadyStatus')==status and receipt.get('pendingHttp')==0 and receipt.get('tenantAuthorization') is False and [r.get('instance') for r in rows]==['api1','api2'] and all(r.get('live')==200 and r.get('ready')==status and type(r.get('probes')) is int and 1<=r['probes']<=20 for r in rows),'READINESS_HTTP_REPORT')
 elif action=='prepare-empty':check(receipt.get('schema')=='cp019-empty-prepared-v1' and receipt.get('database')=='mecanet_control_empty' and receipt.get('originalDataPreserved') is True and receipt.get('health')=='NOT VERIFIED','READINESS_EMPTY_REPORT')
 elif action=='complete-empty':check(receipt.get('schema')=='cp019-empty-completed-v1' and receipt.get('database')=='mecanet_control_empty' and receipt.get('technicalSqlReady') is True and receipt.get('httpReady')=='NOT VERIFIED','READINESS_EMPTY_REPORT')
 elif action=='final-close':check(receipt.get('schema')=='cp019-final-close-receipt-v1' and receipt.get('closedVersion')==('4' if kind=='allclosed' else '10') and receipt.get('globalBarrier') is (kind=='a5-restrictions') and receipt.get('bPreserved') is True and receipt.get('positiveRuntimeEnd')=='NOT VERIFIED','READINESS_CLOSE_REPORT')
 else:check(receipt.get('schema')=='cp019-empty-finish-receipt-v1' and receipt.get('action')==action and receipt.get('barrier') is True and receipt.get('data')=='KEEP' and receipt.get('sqlOwnersAbsent') is (action=='end-empty') and receipt.get('physicalProcessEnd')==('HOST_OBSERVED' if action=='end-empty' else 'NOT VERIFIED'),'READINESS_EMPTY_END_REPORT')
 return receipt
def run(h,kind,action):
 validate_action(kind,action);view,x,a=load_authority(h,kind);h.set_host_case(a['caseName']);h.enter_runtime_case('target-window',a['caseName']);job_id=str(uuid.uuid4());cfg={k:copy.deepcopy(v) for k,v in a.items() if k not in ['kind','caseName']};cfg.update(schema='cp019-readiness-job-v1',action=action,invocationId=job_id);path=view.TARGET/'secrets'/('readiness-config-'+job_id+'.json');publish(h,view.TARGET/'master'/('readiness-config-'+job_id+'.json'),cfg);publish(h,path,cfg,999)
 command=['node','tests/qa/cp019/readiness-variant.mjs',action];env={'QA_PROJECT':PROJECT,'QA_CODE_SHA':x['sourceSha'],'QA_INVOCATION_ID':job_id};live=[r for r in view.scope_facts() if r.get('service') in bridge(h).BUSINESS and r['running']];profile='probe' if live else 'harness';mounts=[(path,'/run/qa-secrets/readiness-config.json','ro'),(view.TARGET/'secrets/readiness-copy-index.json','/run/qa-copy-index.json','ro'),(view.TARGET/'live','/run/qa-live','ro')]
 job=view.create_job(view.TARGET,profile,command,env,mounts=mounts,sample=not bool(live));created=view.read_created_job(job);check(job['jobId']==job_id and created['commandHash']==digest(command),'READINESS_CREATED_BINDING');publish(h,view.TARGET/'master'/('readiness-job-'+job_id+'.json'),{'schema':'cp021-readiness-job-reference-v1','kind':kind,'action':action,'jobId':job_id,'containerId':job['cid'],'planHash':a['planHash'],'cfgHash':digest(cfg),'createdHash':digest(created),'generation':x['lineage']['effectiveMaterial']['target']['generation'],'recoveryId':x['lineage']['effectiveMaterial']['recoveryId'],'lineageHash':x['lineage']['additionHash']})
 update=lambda:mailbox(h,view,observation(h,view,x,cfg));update();view.start_job(job);output,proof=h.target_bridge().watch_job(view,job,update);result=json.loads(output);check(result.get('type')=='cp019-readiness-job' and result.get('action')==action and result.get('kind')==kind and result.get('planHash')==a['planHash'] and HASH.fullmatch(result.get('receiptHash','')) and result.get('secretOutput') is False,'READINESS_JOB_RESULT')
 suffix='http-'+action.removeprefix('probe-') if action.startswith('probe-') else {'prepare-empty':'prepared','complete-empty':'completed','close-empty':'closed','end-empty':'ended','final-close':'closed'}[action];receipt,rh=read(h,view.TARGET/'secrets'/('readiness-'+suffix+'.json'),999);check(rh==result['receiptHash'],'READINESS_NODE_RECEIPT');validate_node_receipt(receipt,x,a,action);end,eh=read(h,view.TARGET/'evidence/jobs'/(job_id+'-end.json'));check(proof['jobCreatedHash']==digest(created) and proof['jobEndHash']==eh and end.get('createdReceiptHash')==digest(created) and end.get('exitCode')==0 and end.get('containerStopped') is True,'READINESS_JOB_END');publish(h,view.TARGET/'master'/('readiness-result-'+job_id+'.json'),{'schema':'cp021-readiness-host-result-v1','kind':kind,'action':action,'jobId':job_id,'receiptHash':rh,'createdHash':digest(created),'endHash':eh,'planHash':a['planHash'],'lineageHash':x['lineage']['additionHash'],'generation':x['lineage']['effectiveMaterial']['target']['generation'],'recoveryId':x['lineage']['effectiveMaterial']['recoveryId']});return {'result':'PASS FOR OWN JOB BOUNDARY ONLY','kind':kind,'action':action,'receiptHash':rh,'jobProof':proof,'physicalAcceptance':'NOT VERIFIED'}
def dispatch(h,action,args):
 check(action in ['readiness-select-close','readiness-prepare-inputs','readiness-run'] and len(args)==(2 if action=='readiness-run' else 1),'READINESS_DISPATCH');kind=args[0]
 if action=='readiness-select-close':return select_close_id(h,kind)
 if action=='readiness-prepare-inputs':return prepare_inputs(h,kind)
 return run(h,kind,args[1])
