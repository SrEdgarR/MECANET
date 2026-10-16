"""Passive Root-only TARGET lifecycle. No I/O occurs during import.
Docker identity/exits and immutable HTTP jobs feed the measured Node SQL FIN.
"""
import datetime, hashlib, json, os, pathlib, re, stat, uuid
SERVICES=('api1','api2','web','worker');MODES=('target-history','target-write','target-negatives')
HASH=re.compile(r'^[0-9a-f]{64}$');SHA=re.compile(r'^[0-9a-f]{40}$')
VARIANT_CASES={'allclosed':'ready-allclosed','commit-interrupted':'target-commit-fault','promote-prefix':'target-promote-fault','a5-restrictions':'variant-a5-identity'}
VARIANT_MODES={'allclosed':['readiness-ready'],'commit-interrupted':[],'promote-prefix':['promotion-barrier'],'a5-restrictions':['a5-grant','a5-membership','a5-identity']}
def check(ok,code):
 if not ok:raise AssertionError(code)
def canonical(value):return json.dumps(value,separators=(',',':'),sort_keys=True,ensure_ascii=False,allow_nan=False).encode()
def digest(value):return hashlib.sha256(value if isinstance(value,bytes) else canonical(value)).hexdigest()
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def read400(path,uid=999,limit=262144):
 check(path.resolve()==path and not path.is_symlink(),'LIFECYCLE_PRIVATE_PATH');before=path.lstat()
 check(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_uid==uid and before.st_mode&0o777==0o400 and 2<=before.st_size<=limit,'LIFECYCLE_PRIVATE_FILE')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  opened=os.fstat(fd);keys=('st_dev','st_ino','st_size','st_uid','st_mode','st_nlink','st_mtime_ns','st_ctime_ns');check(all(getattr(before,k)==getattr(opened,k) for k in keys),'LIFECYCLE_PRIVATE_CHANGED')
  with os.fdopen(fd,'rb',closefd=False) as file:raw=file.read(limit+1)
  check(len(raw)==before.st_size and all(getattr(opened,k)==getattr(os.fstat(fd),k)==getattr(path.lstat(),k) for k in keys),'LIFECYCLE_PRIVATE_CHANGED')
  value=json.loads(raw);check(canonical(value)==raw,'LIFECYCLE_PRIVATE_CANONICAL');return value,digest(raw)
 finally:os.close(fd)
def target_project(h):
 getter=getattr(h,'target_project',None);value=getter() if callable(getter) else h.TARGET.name
 check(value=='mecanet-qa-p1l3-r03-target','LIFECYCLE_NAMESPACE');return value

def frame(h,preserve=True):
 variant=callable(getattr(h,'variant_frame',None));check(h.ROOT==pathlib.Path('/opt/mecanet-qa-p1l3-r03') and target_project(h)=='mecanet-qa-p1l3-r03-target' and (h.TARGET==pathlib.Path('/opt/mecanet-qa-p1l3-r03-target') or variant and h.TARGET.parent==pathlib.Path('/opt/mecanet-qa-p1l3-r03-target/variants') and h.TARGET.name in ['roster-empty','allclosed','commit-interrupted','promote-prefix','a5-restrictions']),'LIFECYCLE_NAMESPACE');h.own(h.ROOT);h.own(h.TARGET)
 if preserve:h.preserve()
 m,base,bindings=h.target_bridge().bundle_context(h);check(bindings['custodyHash']==digest(m) and SHA.fullmatch(bindings['sourceSha']),'LIFECYCLE_BINDING');return m,base,bindings
def inventory(h,m,bindings):
 body,body_hash=read400(h.TARGET/'master/runtime-created.json',0)
 check(set(body)=={'schema','project','generation','runId','custodyHash','configBundleHash','services'} and body['schema']=='target-runtime-created-v1' and body['project']==target_project(h) and body['generation']==m['target']['generation'] and body['runId']==m['recoveryId'] and body['custodyHash']==digest(m) and body['configBundleHash']==bindings['configBundleHash'],'LIFECYCLE_INVENTORY')
 snapshot,snapshot_hash=read400(h.TARGET/'master'/('runtime-created-'+body_hash+'.json'),0);check(snapshot==body and snapshot_hash==body_hash,'LIFECYCLE_INVENTORY_CUSTODY')
 services=sorted(body['services']);check(services==['worker'] or services==list(SERVICES),'LIFECYCLE_INVENTORY');seen=set();owners=h.expected_owners()[target_project(h)]
 for service,row in body['services'].items():
  check(set(row)=={'containerId','ownerId','imageDigest','createdReceiptHash'} and HASH.fullmatch(row['containerId']) and HASH.fullmatch(row['createdReceiptHash']) and row['containerId'] not in seen and row['ownerId']==owners[service],'LIFECYCLE_CREATED_REFERENCE');seen.add(row['containerId'])
  created,ch=read400(h.TARGET/'master/runtime'/(service+'-'+row['containerId']+'-created.json'),0)
  check(set(created)=={'schema','project','service','containerId','ownerId','imageDigest','generation','runId','configBundleHash','configHash','createdAt'} and created['schema']=='target-service-created-v1' and ch==row['createdReceiptHash'] and all(created[k]==v for k,v in {'project':target_project(h),'service':service,'generation':m['target']['generation'],'runId':m['recoveryId'],'configBundleHash':bindings['configBundleHash'],**{k:row[k] for k in ['containerId','ownerId','imageDigest']}}.items()) and HASH.fullmatch(created['configHash']),'LIFECYCLE_CREATED_REFERENCE')
 return body
def runtime_facts(h,body):
 current=h.facts()
 # Emergency stop selects only the immutable inventory CIDs. A capacity
 # anomaly must not prevent stopping these already-owned processes.
 if callable(getattr(h,'variant_frame',None)):
  known={row['containerId'] for row in body['services'].values()};current=[c for c in current if c.get('project')==h.ROOT.name or c.get('id') in known]
 check(not any(c.get('project')==h.ROOT.name and c['running'] for c in current),'LIFECYCLE_SOURCE_ACTIVE');owners=h.expected_owners()
 runtime=[c for c in current if c.get('project')==target_project(h) and c.get('service') in SERVICES]
 check({c['service']:c['id'] for c in runtime}=={s:r['containerId'] for s,r in body['services'].items()} and len(runtime)==len(body['services']),'LIFECYCLE_RUNTIME_INVENTORY')
 for c in runtime:
  row=body['services'][c['service']];check(h.owned_identity(c,owners) and c['ownerId']==row['ownerId'] and c['imageRef'].split('@',1)[-1]==row['imageDigest'],'LIFECYCLE_RUNTIME_IDENTITY')
 return runtime

def variant_context(h,m):
 getter=getattr(h,'variant_lineage',None)
 if not callable(getter):return None
 context,ch=getter();kind=context.get('kind');addition=context.get('addition',{})
 check(kind in VARIANT_CASES and h.TARGET.name==kind and digest(context)==ch and context.get('effectiveMaterial')==m and addition.get('kind')==kind and context.get('additionHash')==digest(addition) and addition.get('effectiveMaterialHash')==digest(m),'LIFECYCLE_VARIANT_BINDING')
 return context,ch

def variant_command(mode):
 if mode=='promotion-barrier':return ['node','tests/qa/cp019/promotion-barrier.mjs']
 return ['node','tests/qa/cp019/readiness-variant.mjs','probe-'+mode[10:]] if mode.startswith('readiness-') else ['node','tests/qa/cp019/a5-negatives.mjs',mode[3:]]

def promotion_barrier_report(report,h,m,bindings,context,job):
 code='LIFECYCLE_VARIANT_HTTP_REPORT'
 check(set(report)=={'schema','status','kind','project','sourceSha','generation','recoveryId','variantLineageHash','custodyHash','configBundleHash','planHash','expectedReadyStatus','pendingHttp','globalBlocked','localOpen','effectUnchanged','beforeHash','afterHash','instances','post','operationId','authenticatedRequest'},code)
 expected={'schema':'cp021-promotion-barrier-v1','status':'PASS','kind':'promote-prefix','project':target_project(h),'sourceSha':bindings['sourceSha'],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'variantLineageHash':context['additionHash'],'custodyHash':bindings['custodyHash'],'configBundleHash':bindings['configBundleHash'],'planHash':job['planHash'],'expectedReadyStatus':503,'pendingHttp':0,'globalBlocked':True,'localOpen':True,'effectUnchanged':True,'operationId':m['target']['operationIds']['postProduct'],'authenticatedRequest':False}
 check(context['kind']=='promote-prefix' and all(report.get(k)==v and (type(v) not in [bool,int] or type(report[k]) is type(v)) for k,v in expected.items()) and HASH.fullmatch(report.get('beforeHash','')) and report['beforeHash']==report.get('afterHash'),code)
 check(report['instances']==[{'instance':api,'live':200,'ready':503} for api in ['api1','api2']] and report['post']=={'instance':'api2','status':503,'error':'SERVICE_UNAVAILABLE'},code)

def variant_http_metadata(h,m,bindings,services):
 selected=variant_context(h,m)
 if selected is None:return None
 context,ch=selected;kind=context['kind'];plan,ph=read400(h.TARGET/'master/variant-http-plan.json',0);inv,ih=read400(h.TARGET/'master/variant-http-inventory.json',0);modes=VARIANT_MODES[kind]
 expected_services=list(SERVICES)
 check(services==expected_services,'LIFECYCLE_VARIANT_INVENTORY')
 check(set(plan)=={'schema','kind','project','sourceSha','artifactDigest','recoveryId','generation','variantLineageHash','custodyHash','configBundleHash','createdServices','createdAt','jobs'} and ph==digest(plan) and plan['schema']=='cp021-variant-http-plan-v1' and all(plan.get(k)==v for k,v in {'kind':kind,'project':target_project(h),'sourceSha':bindings['sourceSha'],'artifactDigest':m['artifactDigest'],'recoveryId':m['recoveryId'],'generation':m['target']['generation'],'variantLineageHash':context['additionHash'],'custodyHash':bindings['custodyHash'],'configBundleHash':bindings['configBundleHash'],'createdServices':services}.items()) and isinstance(plan['createdAt'],str) and [j.get('mode') for j in plan['jobs']]==modes,'LIFECYCLE_VARIANT_HTTP_PLAN')
 for job in plan['jobs']:check(set(job)=={'mode','command','planHash'} and job['command']==variant_command(job['mode']) and HASH.fullmatch(job['planHash']) and job['planHash']==plan['jobs'][0]['planHash'],'LIFECYCLE_VARIANT_HTTP_PLAN')
 check(set(inv)=={'schema','kind','project','recoveryId','generation','variantLineageHash','planHash','jobs'} and ih==digest(inv) and inv['schema']=='cp021-variant-http-inventory-v1' and all(inv.get(k)==v for k,v in {'kind':kind,'project':target_project(h),'recoveryId':m['recoveryId'],'generation':m['target']['generation'],'variantLineageHash':context['additionHash'],'planHash':ph}.items()) and [j.get('mode') for j in inv['jobs']]==modes,'LIFECYCLE_VARIANT_HTTP_INVENTORY')
 for row in inv['jobs']:check(set(row)=={'mode','jobId','containerId','commandHash','reportHash','jobCreatedHash','jobEndHash','pendingHttp'} and type(row['pendingHttp']) is int and row['pendingHttp']==0 and str(uuid.UUID(row['jobId']))==row['jobId'] and all(HASH.fullmatch(row[k]) for k in ['containerId','commandHash','reportHash','jobCreatedHash','jobEndHash']),'LIFECYCLE_VARIANT_HTTP_INVENTORY')
 return context,ch,plan,ph,inv,ih

def variant_http_receipts(h,m,bindings,services):
 context,ch,plan,ph,inv,ih=variant_http_metadata(h,m,bindings,services);kind=context['kind'];jobs=h.TARGET/'evidence/jobs';check(jobs.resolve()==jobs and not jobs.is_symlink(),'LIFECYCLE_JOB_DIRECTORY')
 known_commands=[['node','tests/qa/cp019/acceptance.mjs',mode] for mode in ['source-fixture',*MODES,'browser-denials']]+[['node','tests/qa/cp019/a5-negatives.mjs',mode] for mode in ['mismatches','grant','membership','identity']]+[variant_command(mode) for mode in ['readiness-unready','readiness-ready','promotion-barrier']];known={digest(command) for command in known_commands};actual=[]
 for path in jobs.iterdir():
  if not re.fullmatch(r'[0-9a-f-]{36}-created\.json',path.name):continue
  created,sha=read400(path,0);check(created.get('schema')=='controller-job-created-v1' and created.get('project')==target_project(h),'LIFECYCLE_VARIANT_HTTP_CREATED')
  if created.get('commandHash') in known:actual.append((created.get('jobId'),created.get('containerId')))
 check(sorted(actual)==sorted((row['jobId'],row['containerId']) for row in inv['jobs']) and len(set(actual))==len(actual),'LIFECYCLE_VARIANT_HTTP_UNPLANNED')
 refs=[];seen=set()
 for job,row in zip(plan['jobs'],inv['jobs']):
  mode=job['mode'];phase=mode[10:] if mode.startswith('readiness-') else mode[3:];report_path=h.TARGET/('evidence/promotion-barrier.json' if mode=='promotion-barrier' else 'secrets/readiness-http-'+phase+'.json' if mode.startswith('readiness-') else 'evidence/a5-'+phase+'.json');report,rh=read400(report_path);created,crh=read400(jobs/(row['jobId']+'-created.json'),0);ended,eh=read400(jobs/(row['jobId']+'-end.json'),0)
  check(rh==row['reportHash'] and crh==row['jobCreatedHash'] and eh==row['jobEndHash'] and all(created.get(k)==v for k,v in {'schema':'controller-job-created-v1','jobId':row['jobId'],'containerId':row['containerId'],'project':target_project(h),'service':'probe','ownerId':m['controllerOwner'],'imageDigest':'sha256:ba6b7d0ee561d9d49deb99e2b93c98632cc287b6cca1a6b18d66127054efa4dc','commandHash':digest(job['command']),'state':'CREATED BEFORE START/SQL'}.items()) and row['commandHash']==created['commandHash'] and row['containerId'] not in seen,'LIFECYCLE_VARIANT_HTTP_CREATED');seen.add(row['containerId'])
  check(ended.get('schema')=='controller-job-end-v1' and all(ended.get(k)==created[k] for k in ['jobId','containerId','project','service','ownerId']) and ended.get('createdReceiptHash')==crh and ended.get('exitCode')==0 and ended.get('containerStopped') is True and ended.get('sqlAbsence')=='NOT VERIFIED' and not any(c['id']==row['containerId'] for c in h.facts()),'LIFECYCLE_VARIANT_HTTP_END')
  dates=[datetime.datetime.fromisoformat(value.replace('Z','+00:00')) for value in [plan['createdAt'],created['createdAt'],ended['startedAt'],ended['finishedAt']]];check(dates==sorted(dates),'LIFECYCLE_VARIANT_HTTP_ORDER')
  if mode=='promotion-barrier':promotion_barrier_report(report,h,m,bindings,context,job)
  elif mode.startswith('readiness-'):
   status=200 if phase=='ready' else 503;check(all(report.get(k)==v for k,v in {'schema':'cp019-readiness-http-v1','kind':kind,'phase':phase,'caseName':'ready-allclosed','planHash':job['planHash'],'variantLineageHash':context['additionHash'],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'sourceSha':bindings['sourceSha'],'expectedReadyStatus':status,'tenantAuthorization':False,'pendingHttp':0}.items()) and [r.get('instance') for r in report.get('instances',[])]==['api1','api2'] and all(r.get('live')==200 and r.get('ready')==status and type(r.get('probes')) is int and 2<=r['probes']<=20 for r in report['instances']),'LIFECYCLE_VARIANT_HTTP_REPORT')
  else:check(all(report.get(k)==v for k,v in {'schema':'cp020-a5-negatives-v1','mode':phase,'status':'PASS','generation':m['target']['generation'],'runId':m['recoveryId'],'sourceSha':bindings['sourceSha'],'custodyHash':bindings['custodyHash'],'configBundleHash':bindings['configBundleHash'],'restrictionPlanHash':job['planHash'],'acknowledged':True,'effectUnchanged':True,'guardsUnchanged':True,'restoredAuthority':False}.items()),'LIFECYCLE_VARIANT_HTTP_REPORT')
  refs.append({'mode':mode,'reportHash':rh,'jobCreatedHash':crh,'jobEndHash':eh,'report':report,'created':created,'end':ended})
 return refs

def variant_end_fields(h,m,bindings,services,case):
 selected=variant_http_metadata(h,m,bindings,services)
 if selected is None:return {}
 context,ch,plan,ph,inv,ih=selected
 check(case==VARIANT_CASES[context['kind']],'LIFECYCLE_END_CASE')
 return {'variantLineageContextHash':ch,'variantLineageHash':context['additionHash'],'caseName':case,'variantHttpPlanHash':ph,'variantHttpInventoryHash':ih}
def http_receipts(h,m,bindings,services):
 if callable(getattr(h,'variant_lineage',None)):return variant_http_receipts(h,m,bindings,services)
 if services==['worker']:return []
 jobs=h.TARGET/'evidence/jobs';check(jobs.resolve()==jobs and not jobs.is_symlink(),'LIFECYCLE_JOB_DIRECTORY');refs=[]
 for mode in MODES:
  report,rh=read400(h.TARGET/'evidence'/('acceptance-'+mode+'.json'))
  check(report.get('schema')=='cp019-acceptance-v1' and report.get('mode')==mode and report.get('status')=='PASS' and report.get('result',{}).get('status')=='PASS' and report.get('project')==target_project(h) and report.get('sourceCommit')==bindings['sourceSha'] and report.get('generation')==m['target']['generation'] and report.get('runId')==m['recoveryId'],'LIFECYCLE_HTTP_REPORT')
  command_hash=digest(['node','tests/qa/cp019/acceptance.mjs',mode]);matches=[]
  for path in jobs.iterdir():
   if not re.fullmatch(r'[0-9a-f-]{36}-created\.json',path.name):continue
   created,ch=read400(path,0)
   if created.get('commandHash')==command_hash and created.get('project')==target_project(h) and created.get('service')=='probe':matches.append((created,ch))
  check(len(matches)==1,'LIFECYCLE_HTTP_CREATED');created,ch=matches[0];job_id=created['jobId'];check(str(uuid.UUID(job_id))==job_id and created['ownerId']==m['controllerOwner'] and HASH.fullmatch(created['containerId']),'LIFECYCLE_HTTP_CREATED')
  end,eh=read400(jobs/(job_id+'-end.json'),0);check(end.get('schema')=='controller-job-end-v1' and all(end.get(k)==created[k] for k in ['jobId','containerId','project','service','ownerId']) and end.get('createdReceiptHash')==ch and end.get('containerStopped') is True and end.get('exitCode')==0 and end.get('sqlAbsence')=='NOT VERIFIED','LIFECYCLE_HTTP_END')
  check(not any(c['id']==created['containerId'] for c in h.facts()),'LIFECYCLE_HTTP_JOB_RETAINED');refs.append({'mode':mode,'reportHash':rh,'jobCreatedHash':ch,'jobEndHash':eh,'report':report,'created':created,'end':end})
 return refs
def publish_match(h,path,value,uid=999):
 try:old,sha=read400(path,uid);check(old==value and sha==digest(value),'LIFECYCLE_IMMUTABLE_CONFLICT');return sha
 except FileNotFoundError:pass
 h.write_plain(path,canonical(value),0o400,uid);old,sha=read400(path,uid);check(old==value and sha==digest(value),'LIFECYCLE_PUBLICATION');return sha
def optional400(path,uid=999):
 try:return read400(path,uid)
 except FileNotFoundError:return None
def end_scope(h,m,body,kind):
 check(kind in ['stop','end'],'LIFECYCLE_END_SCOPE');services=sorted(body['services'])
 selected=variant_context(h,m)
 if selected is not None:
  variant=selected[0]['kind'];case=VARIANT_CASES[variant];check(services==list(SERVICES),'LIFECYCLE_VARIANT_INVENTORY');check(variant!='a5-restrictions' or getattr(h,'HOST_CASE',None)=='variant-a5-identity','LIFECYCLE_END_CASE');return case
 if services==['worker']:suffix='prefix'
 elif body['services']['worker']['ownerId']==m['target']['workerClockOwner']:suffix='initial'
 else:
  context,_=read400(h.TARGET/'secrets/target-clock-restart-context.json');addition=context['clockRestart']['addition'];check(addition['generation']==m['target']['generation'] and addition['runId']==m['recoveryId'] and addition['previousOwner']==m['target']['workerClockOwner'] and addition['nextOwner']==body['services']['worker']['ownerId'],'LIFECYCLE_RESTART_OWNER');suffix='restarted'
 return 'target-'+kind+'-'+suffix
def publish_current_stop(h,value,version_path):
 path=h.TARGET/'master/runtime-stop.json';parent=path.parent;check(parent.resolve()==parent and not parent.is_symlink() and parent.stat().st_uid==0 and parent.stat().st_mode&0o777==0o700,'LIFECYCLE_STOP_DIRECTORY')
 saved,sha=read400(version_path,0);check(saved==value and sha==digest(value),'LIFECYCLE_STOP_VERSION')
 if path.exists() or path.is_symlink():read400(path,0)
 h.ledger_charge('artifactFiles');temp=parent/('.runtime-stop.'+uuid.uuid4().hex+'.tmp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
 try:
  with os.fdopen(fd,'wb',closefd=False) as file:file.write(canonical(value));file.flush();os.fchmod(fd,0o400);os.fchown(fd,0,0);os.fsync(fd)
  os.close(fd);fd=None;os.replace(temp,path);h.syncdir(parent)
 finally:
  if fd is not None:os.close(fd)
  if temp.exists():temp.unlink()
 current,ch=read400(path,0);check(current==value and ch==sha,'LIFECYCLE_STOP_CURRENT')
def stop_runtime(h):
 m,base,bindings=frame(h,False);body=inventory(h,m,bindings);case=end_scope(h,m,body,'stop');h.set_host_case(case);h.enter_runtime_case('target-window',case);before=runtime_facts(h,body);services=sorted(body['services']);http=http_receipts(h,m,bindings,services)
 # Receipt existence never substitutes a stopped runtime. Reinspect each exact
 # persisted CID immediately before the only stopping command.
 # Emergency termination of exact owned CIDs remains available when a resource
 # sample exceeds a limit. It cannot authorize new resources or erase debt.
 ids=[]
 for old in before:
  actual=h.inspect_container(old['id']);check(actual==old,'LIFECYCLE_RUNTIME_CHANGED')
  if actual['running']:ids.append(actual['id'])
 if ids:h.run_bounded('docker','stop','--time','30',*ids,timeout=35)
 ended=runtime_facts(h,body);containers=[]
 for c in ended:
  check(c['running'] is False and c.get('pid')==0 and c.get('status')=='exited' and c.get('exitCode')==0 and not c.get('finishedAt','0001-').startswith('0001-'),'LIFECYCLE_POSITIVE_END')
  containers.append({k:c[k] for k in ['id','service','ownerId','running','exitCode','finishedAt']})
 gate={'schema':'cp019-target-stop-v1','invocationId':str(uuid.uuid4()),'recoveryId':m['recoveryId'],'generation':m['target']['generation'],'targetResourceHash':base['anchors']['targetResourceHash'],'observedAt':stamp(),'containers':containers,'httpPending':[]}
 saved={'schema':'target-runtime-stop-v1','createdServices':services,'configBundleHash':bindings['configBundleHash'],'hostStop':gate,'hostStopHash':digest(gate),'httpReceipts':[{k:r[k] for k in ['mode','reportHash','jobCreatedHash','jobEndHash']} for r in http],**variant_end_fields(h,m,bindings,services,case)}
 path=h.TARGET/'master'/('runtime-stop-'+gate['invocationId']+'.json');publish_match(h,path,saved,0)
 # Current metadata pointer is Root-only. Immutable version remains the audit
 # authority; the wrapper can mount the matching input without overwriting it.
 publish_current_stop(h,saved,path)
 h.preserve();return {'result':'PASS FOR DOCKER/HTTP END ONLY','createdServices':services,'hostStop':gate,'stopReceiptHash':digest(saved),'sqlFIN':'NOT VERIFIED','secretsPrinted':False}
def target_end(h):
 m,base,bindings=frame(h);body=inventory(h,m,bindings);case=end_scope(h,m,body,'end');h.set_host_case(case);h.enter_runtime_case('target-window',case);runtime=runtime_facts(h,body);services=sorted(body['services']);check(all(not c['running'] and c.get('pid')==0 and c.get('status')=='exited' and c.get('exitCode')==0 for c in runtime),'LIFECYCLE_RUNTIME_NOT_ENDED')
 saved,_=read400(h.TARGET/'master/runtime-stop.json',0);check(saved['schema']=='target-runtime-stop-v1' and saved['createdServices']==services and saved['configBundleHash']==bindings['configBundleHash'] and saved['hostStopHash']==digest(saved['hostStop']),'LIFECYCLE_STOP_BINDING')
 variant_fields=variant_end_fields(h,m,bindings,services,case);check(all(saved.get(k)==v for k,v in variant_fields.items()),'LIFECYCLE_VARIANT_STOP_CHANGED')
 refs=http_receipts(h,m,bindings,services);check(saved['httpReceipts']==[{k:r[k] for k in ['mode','reportHash','jobCreatedHash','jobEndHash']} for r in refs],'LIFECYCLE_HTTP_CHANGED')
 for ref in refs:
  for kind in ['report','created','end']:publish_match(h,h.TARGET/'secrets'/('target-http-'+ref['mode']+'-'+kind+'.json'),ref[kind])
 if variant_fields:
  for kind in ['plan','inventory']:
   value,sha=read400(h.TARGET/'master'/('variant-http-'+kind+'.json'),0);check(sha==variant_fields['variantHttp'+kind.title()+'Hash'],'LIFECYCLE_VARIANT_HTTP_CHANGED');publish_match(h,h.TARGET/'secrets'/('target-variant-http-'+kind+'.json'),value)
 h.guard_effect(h.TARGET,['harness']);gate=json.loads(json.dumps(saved['hostStop']));gate['observedAt']=stamp();gate['invocationId']=str(uuid.uuid4());check(gate['containers']==[{k:c[k] for k in ['id','service','ownerId','running','exitCode','finishedAt']} for c in runtime],'LIFECYCLE_STOP_CHANGED')
 restart_hash=read400(h.TARGET/'secrets/target-clock-restart-context.json')[1] if case=='target-end-restarted' else None
 cfg={'schema':'cp019-target-end-input-v1','project':target_project(h),'invocationId':gate['invocationId'],**bindings,'clockRestartContextHash':restart_hash,'profile':'worker' if services==['worker'] else 'source','createdServices':services,'httpReceipts':saved['httpReceipts'],'hostStop':gate,'hostStopHash':digest(gate),**variant_fields}
 path=h.TARGET/'secrets'/('target-end-'+gate['invocationId']+'-input.json');publish_match(h,path,cfg)
 output,job=h.controller_job(h.TARGET,'harness',['node','tests/qa/cp019/target-end.mjs'],{'QA_PROJECT':target_project(h),'QA_CODE_SHA':bindings['sourceSha'],'QA_INVOCATION_ID':gate['invocationId']},mounts=[(path,'/run/qa-secrets/target-end-input.json','ro')],sample=False)
 output_name='target-live-end-after-restart.json' if restart_hash else 'target-live-end.json';result=json.loads(output);pair,ph=read400(h.TARGET/'secrets'/output_name)
 check(result.get('type')=='cp019-target-end' and result.get('status')=='PASS' and result.get('sourceSha')==bindings['sourceSha'] and result.get('recoveryId')==m['recoveryId'] and result.get('generation')==m['target']['generation'] and result.get('secretOutput') is False and result.get('pairHash')==ph and result.get('endProofHash')==digest(pair['endProof']) and pair['createdServices']==services,'LIFECYCLE_NODE_END_BINDING')
 check(all(result.get(k)==variant_fields[k] for k in ['caseName','variantLineageHash','variantHttpPlanHash','variantHttpInventoryHash']) if variant_fields else True,'LIFECYCLE_VARIANT_NODE_END_BINDING')
 return {'result':'PASS FOR MEASURED END ONLY','profile':cfg['profile'],'pairHash':ph,'endProofHash':result['endProofHash'],'jobProof':job,'physicalCohortAcceptance':'NOT VERIFIED','secretsPrinted':False}

def original_full_end(h,m,base,bindings,body):
 pair,sha=read400(h.TARGET/'secrets/target-live-end.json');proof=pair.get('endProof',{});observed=pair.get('observedEnd',{});processes=proof.get('processes',[])
 check(set(pair)=={'endProof','observedEnd','createdServices'} and pair['createdServices']==list(SERVICES) and proof.get('schema')=='source-end-v1' and proof.get('recoveryId')==m['recoveryId'] and proof.get('sourceResourceHash')==base['anchors']['targetResourceHash'] and sorted(p.get('service') for p in processes)==list(SERVICES) and observed.get('resourceHash')==base['anchors']['targetResourceHash'] and observed.get('sqlOwnersPresent')==[] and observed.get('httpPending')==[] and proof.get('httpOperationIds')==[],'LIFECYCLE_RESTART_FULL_FIN')
 check(proof.get('sqlOwners')==[p['ownerId'] for p in processes if p['service']!='web'],'LIFECYCLE_RESTART_SQL_OWNERS');rows=observed.get('containers',[]);check(len(rows)==4,'LIFECYCLE_RESTART_FULL_FIN')
 for p in processes:
  row=body['services'][p['service']];matches=[r for r in rows if r.get('id')==p['containerId']];check(p['containerId']==row['containerId'] and p['ownerId']==row['ownerId'] and p['exitCode']==0 and not p['finishedAt'].startswith('0001-') and len(matches)==1 and all(matches[0].get(k)==v for k,v in {'id':p['containerId'],'service':p['service'],'ownerId':p['ownerId'],'running':False,'exitCode':p['exitCode'],'finishedAt':p['finishedAt']}.items()),'LIFECYCLE_RESTART_FULL_FIN')
 return pair,sha
def restart_receipt(h,m,base,bindings,clock,name,version):
 old=optional400(h.TARGET/'evidence'/('target-'+name+'.json'))
 if old is None:return None
 receipt,sha=old;result=receipt.get('result',{});check(receipt.get('schema')=='target-runtime-receipt-v1' and receipt.get('phase')==name and all(receipt.get(k)==v for k,v in {'planHash':base['planHash'],'configBundleHash':bindings['configBundleHash'],'custodyHash':bindings['custodyHash'],'sourceSha':bindings['sourceSha'],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'clockRestartPlanHash':clock['extensionHash'],'additionHash':clock['additionHash']}.items()) and receipt.get('resultHash')==digest(h.target_bridge().stable_result(result)) and result.get('status')=='PASS' and result.get('stage')=='COMPLETE' and result.get('version')==version,'LIFECYCLE_RESTART_PHASE_NOT_PROVEN');return receipt,sha
def original_runtime_now(h,body,pair,deleted=None):
 current=h.facts();check(not any(c.get('project')==h.ROOT.name and c['running'] for c in current),'LIFECYCLE_SOURCE_ACTIVE');runtime=[c for c in current if c.get('project')==target_project(h) and c.get('service') in SERVICES];expected={s:r['containerId'] for s,r in body['services'].items() if not(deleted and s=='worker')};check({c['service']:c['id'] for c in runtime}==expected and len(runtime)==len(expected),'LIFECYCLE_RESTART_RUNTIME_CHANGED')
 for c in runtime:
  row=body['services'][c['service']];process=next(p for p in pair['endProof']['processes'] if p['service']==c['service']);check(h.owned_identity(c,h.expected_owners()) and c['ownerId']==row['ownerId'] and c['imageRef'].split('@',1)[-1]==row['imageDigest'] and c['running'] is False and c.get('pid')==0 and c.get('status')=='exited' and c.get('exitCode')==process['exitCode']==0 and c.get('finishedAt')==process['finishedAt'],'LIFECYCLE_RESTART_RUNTIME_CHANGED')
 return runtime
def cold_restart_choice(h,m,base,bindings,body,pair,pair_hash):
 bridge=h.target_bridge();reference=h.TARGET/'master/clock-restart-input.json';previous=optional400(reference,0);h.guard_effect(h.TARGET,['harness']);resource=bridge.target_resource(h);check(resource==base['manifest']['target'],'LIFECYCLE_RESTART_RESOURCE')
 if previous is None:
  raw,raw_hash=bridge.read_private(h.TARGET/'journal/target.jsonl',999,1024**2,0o600,False);check(raw.endswith(b'\n'),'LIFECYCLE_RESTART_JOURNAL');records=[json.loads(row) for row in raw.decode().splitlines()];check(0<len(records)<=1000 and records[-1].get('kind')=='observed','LIFECYCLE_RESTART_JOURNAL');checkpoint,_=bridge.read_private(h.TARGET/'journal/target-heads'/('head-'+str(len(records)-1).zfill(4)+'.json'),999,262144,0o600);check(checkpoint=={'sequence':len(records)-1,'hash':records[-1]['hash']},'LIFECYCLE_RESTART_JOURNAL')
  host={'observedAt':stamp(),'observedResources':{'source':base['manifest']['source'],'target':resource,'sourcePostgresRunning':False,'targetPostgresRunning':True,'runtimeConsumers':[]},'observedEnd':pair['observedEnd']};cfg={'schema':'cp020-clock-restart-input-v1','project':target_project(h),'invocationId':str(uuid.uuid4()),**bindings,'targetEndPairHash':pair_hash,'journalRawHash':raw_hash,'journalRecordsHash':digest(records),'journalCheckpoint':checkpoint,'hostReceipt':host,'hostReceiptHash':digest(host)};publish_match(h,reference,cfg,0)
 else:
  cfg=previous[0];check(cfg.get('schema')=='cp020-clock-restart-input-v1' and cfg.get('project')==target_project(h) and all(cfg.get(k)==v for k,v in bindings.items()) and cfg.get('targetEndPairHash')==pair_hash and cfg.get('hostReceiptHash')==digest(cfg['hostReceipt']) and cfg['hostReceipt']['observedResources']['source']==base['manifest']['source'] and cfg['hostReceipt']['observedResources']['target']==resource,'LIFECYCLE_RESTART_INPUT_CUSTODY')
 cfg=json.loads(json.dumps(cfg));cfg['invocationId']=str(uuid.uuid4());cfg['hostReceipt']['observedAt']=stamp();cfg['hostReceiptHash']=digest(cfg['hostReceipt']);path=h.TARGET/'secrets'/('target-restart-'+cfg['invocationId']+'-input.json');publish_match(h,path,cfg)
 output,job=h.controller_job(h.TARGET,'harness',['node','tests/qa/cp019/target-restart.mjs'],{'QA_PROJECT':target_project(h),'QA_CODE_SHA':bindings['sourceSha'],'QA_INVOCATION_ID':cfg['invocationId']},mounts=[(path,'/run/qa-secrets/target-restart-input.json','ro')],sample=False);result=json.loads(output);context,ch=read400(h.TARGET/'secrets/target-clock-restart-context.json');addition,ah=read400(h.TARGET/'secrets/target-clock-addition.json');worker,wh=read400(h.TARGET/'secrets/worker-restart.json');ended,eh=read400(h.TARGET/'secrets/target-old-worker-end.json')
 check(set(result)=={'type','status','contextHash','additionHash','workerConfigHash','workerEndPairHash','secretOutput','physicalRestart'} and result['type']=='cp020-clock-restart-custodied' and result['status']=='PASS' and result['secretOutput'] is False and result['physicalRestart']=='NOT VERIFIED' and all(result[k]==v for k,v in {'contextHash':ch,'additionHash':ah,'workerConfigHash':wh,'workerEndPairHash':eh}.items()) and context['schema']=='target-clock-restart-context-v1' and context['configBundleHash']==bindings['configBundleHash'],'LIFECYCLE_RESTART_NODE_BINDING');clock=context['clockRestart'];check(clock['addition']==addition and clock['additionHash']==ah and clock['extensionHash']==digest(clock['extension']) and addition['previousOwner']==m['target']['workerClockOwner'] and addition['generation']==m['target']['generation'] and addition['runId']==m['recoveryId'] and addition['nextOwner']!=addition['previousOwner'] and str(uuid.UUID(addition['nextOwner']))==addition['nextOwner'] and ended=={'endProof':clock['workerEndProof'],'observedEnd':clock['observedWorkerEnd']} and addition['endProofHash']==digest(ended['endProof']) and worker['clockOwner']==addition['nextOwner'] and worker['generation']==m['target']['generation'],'LIFECYCLE_RESTART_NODE_BINDING')
 publish_match(h,h.TARGET/'master/clock-restart-context.json',clock,0);publish_match(h,h.TARGET/'master/old-worker-end.json',ended,0);return clock,wh,eh,job
def delete_original_worker(h,m,body,pair,pair_hash,clock,worker_end_hash):
 old=body['services']['worker'];cid=old['containerId'];path=h.TARGET/'master/runtime'/('worker-'+cid+'-deleted.json');prior=optional400(path,0);expected={'schema':'target-service-deleted-v1','project':target_project(h),'service':'worker','containerId':cid,'ownerId':old['ownerId'],'generation':m['target']['generation'],'runId':m['recoveryId'],'createdReceiptHash':old['createdReceiptHash'],'fullEndPairHash':pair_hash,'workerEndPairHash':worker_end_hash}
 if prior is not None:
  observed=next(c for c in pair['observedEnd']['containers'] if c['id']==cid);check(set(prior[0])==set(expected)|{'observedExit','deletedAt'} and all(prior[0][k]==v for k,v in expected.items()) and prior[0]['observedExit']=={k:observed[k] for k in ['id','service','ownerId','running','exitCode','finishedAt']} and not any(c['id']==cid for c in h.facts()),'LIFECYCLE_RESTART_DELETE_CUSTODY');original_runtime_now(h,body,pair,prior[0]);return prior[1]
 runtime=original_runtime_now(h,body,pair);actual=next(c for c in runtime if c['id']==cid);check(h.inspect_container(cid)==actual and clock['workerEndProof']['processes'][0]['containerId']==cid,'LIFECYCLE_RESTART_DELETE_CHANGED');h.preserve();h.run_bounded('docker','rm',cid,timeout=15);check(not any(c['id']==cid for c in h.facts()),'LIFECYCLE_RESTART_DELETE_NOT_PROVEN');observed={k:actual[k] for k in ['id','service','ownerId','running','exitCode','finishedAt']};return publish_match(h,path,{**expected,'observedExit':observed,'deletedAt':stamp()},0)
def create_restart_worker(h,m,base,bindings,clock,worker_hash,body):
 bridge=h.target_bridge();owners=h.expected_owners();check(bridge.expected_target_worker_owner(h,m)==clock['addition']['nextOwner'],'LIFECYCLE_RESTART_MARKER');h.guard_effect(h.TARGET,['worker']);check(not any(c.get('project')==target_project(h) and c.get('service')=='worker' for c in h.facts()),'LIFECYCLE_RESTART_WORKER_EXISTS');cpu,mem,image=h.PROFILES['worker'];check((cpu,mem)==(100000000,192*1024**2),'LIFECYCLE_RESTART_PROFILE')
 args=['docker','create','--name',target_project(h)+'-worker-'+clock['addition']['nextOwner'],'--label','com.docker.compose.project='+target_project(h),'--label','mecanet.qa.service=worker','--label','mecanet.qa.owner-id='+clock['addition']['nextOwner'],'--platform','linux/arm64','--network',target_project(h)+'-data','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--cpus','0.1','--memory',str(mem),'--pids-limit','64','--tmpfs','/tmp:size=16m,uid=999,gid=999','--user','999:999','--workdir','/workspace','--restart','no','--log-driver','json-file','--log-opt','max-size=8m','--log-opt','max-file=2','-e','QA_PROJECT='+target_project(h),'-e','QA_SCENARIO=target-window']
 volumes=[str(src)+':'+dst+':'+access for src,dst,access in [(getattr(h,'runtime_directory',lambda:h.ROOT/'staging')(),'/workspace','ro'),(h.TARGET/'secrets/worker-restart.json','/run/qa-secrets/worker.json','ro'),(h.TARGET/'faults','/run/qa-faults','rw'),(getattr(h,'budget_directory',lambda:h.ROOT/'budget')(),'/run/qa-budget','rw')]]
 if callable(getattr(h,'bind_budget_service',None)):
  bound=h.bind_budget_service({'volumes':volumes,'environment':{}});volumes=bound['volumes']
  for key,value in bound['environment'].items():args+=['-e',key+'='+value]
 for volume in volumes:args+=['-v',volume]
 args += [image,'node','tests/qa/cp019/worker.mjs'];cid=h.run(*args).strip();check(HASH.fullmatch(cid),'LIFECYCLE_RESTART_CREATED_CID');actual=h.inspect_container(cid);check(h.owned_identity(actual,owners) and actual['project']==target_project(h) and actual['service']=='worker' and not actual['running'] and actual['status']=='created' and actual['pid']==0 and actual['ownerId']==clock['addition']['nextOwner'],'LIFECYCLE_RESTART_CREATED')
 created={'schema':'target-service-created-v1','project':target_project(h),'service':'worker','containerId':cid,'ownerId':actual['ownerId'],'imageDigest':image.split('@',1)[1],'generation':m['target']['generation'],'runId':m['recoveryId'],'configBundleHash':bindings['configBundleHash'],'configHash':worker_hash,'createdAt':stamp()};created_hash=publish_match(h,h.TARGET/'master/runtime'/('worker-'+cid+'-created.json'),created,0);body=json.loads(json.dumps(body));body['services']['worker']={'containerId':cid,'ownerId':created['ownerId'],'imageDigest':created['imageDigest'],'createdReceiptHash':created_hash};bridge.publish_inventory(h,body);bridge.start_recorded_containers(h,body,[actual],owners);return body
def worker_restart(h):
 m,base,bindings=frame(h);bridge=h.target_bridge();marker=optional400(h.TARGET/'master/current-worker.json',0);job=None
 if marker is None:
  h.set_host_case('target-cost-probe');h.enter_runtime_case('target-window','target-cost-probe');original=optional400(h.TARGET/'master/clock-restart-original-inventory.json',0)
  if original is None:
   body=inventory(h,m,bindings);check(sorted(body['services'])==list(SERVICES) and body['services']['worker']['ownerId']==m['target']['workerClockOwner'],'LIFECYCLE_RESTART_ORIGINAL_INVENTORY');publish_match(h,h.TARGET/'master/clock-restart-original-inventory.json',body,0)
  else:
   body=original[0];check(body['schema']=='target-runtime-created-v1' and sorted(body['services'])==list(SERVICES) and body['configBundleHash']==bindings['configBundleHash'] and body['custodyHash']==bindings['custodyHash'] and body['generation']==m['target']['generation'] and body['runId']==m['recoveryId'] and body['services']['worker']['ownerId']==m['target']['workerClockOwner'],'LIFECYCLE_RESTART_ORIGINAL_INVENTORY')
  pair,pair_hash=original_full_end(h,m,base,bindings,body);deleted=optional400(h.TARGET/'master/runtime'/('worker-'+body['services']['worker']['containerId']+'-deleted.json'),0);original_runtime_now(h,body,pair,deleted[0] if deleted else None);clock,worker_hash,end_hash,job=cold_restart_choice(h,m,base,bindings,body,pair,pair_hash);delete_original_worker(h,m,body,pair,pair_hash,clock,end_hash)
  h.set_host_case('target-clock-restart-plan');h.enter_runtime_case('target-window','target-clock-restart-plan');prepared=restart_receipt(h,m,base,bindings,clock,'clock-restart-plan','8')
  if prepared is None:bridge.phase(h,'clock-restart-plan');prepared=restart_receipt(h,m,base,bindings,clock,'clock-restart-plan','8')
  check(prepared is not None,'LIFECYCLE_RESTART_PHASE_NOT_PROVEN');context_hash=read400(h.TARGET/'master/clock-restart-context.json',0)[1];chosen={'schema':'target-current-worker-v1','ownerId':clock['addition']['nextOwner'],'previousOwner':clock['addition']['previousOwner'],'contextHash':context_hash,'additionHash':clock['additionHash'],'oldFinHash':end_hash,'prepareReceiptHash':prepared[1],'workerConfigHash':worker_hash};publish_match(h,h.TARGET/'master/current-worker.json',chosen,0);body=create_restart_worker(h,m,base,bindings,clock,worker_hash,body)
 else:
  clock,_=read400(h.TARGET/'master/clock-restart-context.json',0);check(bridge.expected_target_worker_owner(h,m)==clock['addition']['nextOwner'],'LIFECYCLE_RESTART_MARKER');body,bh=read400(h.TARGET/'master/runtime-created.json',0)
  if body['services']['worker']['ownerId']==m['target']['workerClockOwner']:
   original,oh=read400(h.TARGET/'master/clock-restart-original-inventory.json',0);snapshot,sh=read400(h.TARGET/'master'/('runtime-created-'+bh+'.json'),0);check(body==original==snapshot and bh==oh==sh and body['configBundleHash']==bindings['configBundleHash'] and body['custodyHash']==bindings['custodyHash'],'LIFECYCLE_RESTART_INVENTORY_CUSTODY');pair,ph=original_full_end(h,m,base,bindings,body);delete_original_worker(h,m,body,pair,ph,clock,marker[0]['oldFinHash']);check(restart_receipt(h,m,base,bindings,clock,'clock-restart-plan','8') is not None,'LIFECYCLE_RESTART_PHASE_NOT_PROVEN');h.set_host_case('target-clock-restart-plan');h.enter_runtime_case('target-window','target-clock-restart-plan');body=create_restart_worker(h,m,base,bindings,clock,marker[0]['workerConfigHash'],body)
  body=inventory(h,m,bindings);current=runtime_facts(h,body);check(all(c['service']=='worker' or not c['running'] and c.get('pid')==0 and c.get('status')=='exited' and c.get('exitCode')==0 for c in current),'LIFECYCLE_RESTART_BUSINESS_ACTIVE');worker=next(c for c in current if c['service']=='worker')
  if worker['status']=='created' and not worker['running'] and worker['pid']==0:
   h.set_host_case('target-clock-restart-plan');h.enter_runtime_case('target-window','target-clock-restart-plan');bridge.start_recorded_containers(h,body,[worker],h.expected_owners())
  else:check(worker['running'] is True and worker['status']=='running' and worker['pid']>0,'LIFECYCLE_RESTART_WORKER_NOT_RUNNING')
 current=runtime_facts(h,body);check(sum(c['service']=='worker' and c['running'] for c in current)==1 and all(not c['running'] for c in current if c['service']!='worker'),'LIFECYCLE_RESTART_NOT_PROVEN');recorded=restart_receipt(h,m,base,bindings,clock,'clock-restart-record','9')
 if recorded is None:bridge.phase(h,'clock-restart-record');recorded=restart_receipt(h,m,base,bindings,clock,'clock-restart-record','9')
 check(recorded is not None,'LIFECYCLE_RESTART_PHASE_NOT_PROVEN');h.preserve();return {'result':'PASS FOR CUSTODIED HOST SEQUENCE ONLY','workerContainerId':body['services']['worker']['containerId'],'ownerId':body['services']['worker']['ownerId'],'inventoryHash':digest(body),'recordReceiptHash':recorded[1],'chooserJobProof':job,'physicalRestart':'NOT VERIFIED','secretsPrinted':False}
