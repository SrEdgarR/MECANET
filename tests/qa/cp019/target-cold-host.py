"""Passive Root lifecycle for the main cold PG and the own empty fixture.

No SQL, credential/ID selection, subprocess or I/O occurs on import. Emergency
STOP precedes any charged publication: exhausted budget cannot keep our exact
processes running, but a missing durable END never authorizes the next PG.
"""
import datetime,hashlib,json,pathlib,re

SOURCE='mecanet-qa-p1l3-r03';TARGET=SOURCE+'-target';KIND='roster-empty'
BUSINESS=('api1','api2','web','worker');TOOLS=('harness','probe','controller-tool','offline-pg')
HASH=re.compile(r'^[a-f0-9]{64}$');SHA=re.compile(r'^[a-f0-9]{40}$')
def check(ok,code):
 if not ok:raise AssertionError(code)
def canonical(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def digest(x):return hashlib.sha256(x if isinstance(x,bytes) else canonical(x)).hexdigest()
def exists(p):return p.exists() or p.is_symlink()
def read(h,path,uid=0,mode=0o400,json_value=True):return h.target_bridge().read_private(path,uid,262144,mode,json_value)
def publish(h,path,value):
 if exists(path):old,sha=read(h,path);check(old==value and sha==digest(value),'COLD_IMMUTABLE_CHANGED');return sha
 h.write_plain(path,canonical(value),0o400,0);old,sha=read(h,path);check(old==value and sha==digest(value),'COLD_PUBLICATION');return sha
def ended_at(value):
 try:return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp() if isinstance(value,str) and value.endswith('Z') and not value.startswith('0001-') else None
 except ValueError:return None
def positive_end(c):return c.get('running') is False and c.get('pid')==0 and c.get('status')=='exited' and type(c.get('exitCode')) is int and c['exitCode']==0 and ended_at(c.get('finishedAt')) is not None
def profile_match(h,c,r):
 return (r.get('nanoCpus'),r.get('memory'),r.get('imageRef'))==h.PROFILES.get(r.get('service')) and all(c.get(k)==r.get(v) for k,v in [('id','containerId'),('project','project'),('service','service'),('ownerId','ownerId'),('nanoCpus','nanoCpus'),('memory','memory'),('imageRef','imageRef')]) and type(c.get('running')) is bool

def validate_tool_end(h,c):
 """A label or a stopped PID alone cannot enroll an unknown SQL controller."""
 root=h.ROOT if c['project']==SOURCE else h.TARGET;matches=[]
 for path in (root/'evidence/jobs').glob('*-created.json'):
  r,rh=read(h,path)
  if r.get('containerId')==c['id']:matches.append((r,rh))
 check(len(matches)==1,'COLD_SQL_CONTROLLER_UNKNOWN');r,rh=matches[0];e,eh=read(h,root/'evidence/jobs'/(r['jobId']+'-end.json'))
 check(r.get('schema')=='controller-job-created-v1' and r.get('state')=='CREATED BEFORE START/SQL' and r.get('project')==c['project'] and r.get('service')==c['service'] and r.get('ownerId')==c['ownerId'] and r.get('jobId')==c.get('jobId') and e.get('schema')=='controller-job-end-v1' and all(e.get(k)==r[k] for k in ['jobId','containerId','project','service','ownerId']) and e.get('createdReceiptHash')==rh and e.get('exitCode')==c.get('exitCode') and e.get('finishedAt')==c.get('finishedAt') and e.get('containerStopped') is True and e.get('sqlAbsence')=='NOT VERIFIED' and c.get('running') is False and c.get('pid')==0 and c.get('status')=='exited' and ended_at(e.get('finishedAt')) is not None,'COLD_SQL_CONTROLLER_UNKNOWN')

def stop_main_pg(h):
 check(h.ROOT==pathlib.Path('/opt')/SOURCE and h.TARGET==pathlib.Path('/opt')/TARGET and not getattr(h,'kind',None),'COLD_MAIN_NAMESPACE');h.own(h.ROOT);h.own(h.TARGET)
 m=h.material_owned();r,rh=read(h,h.TARGET/'master/postgres-created.json');cpu,mem,image=h.PROFILES['postgres']
 check(set(r)=={'schema','project','containerId','ownerId','service','imageRef','nanoCpus','memory','generation','recoveryId','dataPath','composeHash','state'} and r['schema']=='target-postgres-created-v1' and r['project']==TARGET and r['service']=='postgres' and HASH.fullmatch(r['containerId']) and r['ownerId']==m['controllerOwner'] and (r['nanoCpus'],r['memory'],r['imageRef'])==(cpu,mem,image) and r['generation']==m['target']['generation'] and r['recoveryId']==m['recoveryId'] and r['dataPath']==str(h.TARGET/'data') and HASH.fullmatch(r['composeHash']) and r['state']=='CREATED BEFORE START/SQL','COLD_MAIN_PG_REFERENCE')
 actual=h.inspect_container(r['containerId']);check(profile_match(h,actual,r),'COLD_MAIN_PG_CHANGED');h.target_bridge().validate_created_postgres(h,r['containerId'])
 end_path=h.TARGET/'master/postgres-end.json'
 if not exists(end_path):
  current=h.facts();h.verify_main_target_references(current);owners=h.expected_owners()
  for c in current:
   if c.get('project') not in [SOURCE,TARGET] or c['id']==r['containerId']:continue
   check(h.owned_identity(c,owners),'COLD_OWN_PROCESS_CHANGED')
   if c.get('service') in BUSINESS:check(positive_end(c),'COLD_BUSINESS_MUST_BE_STOPPED')
   elif c.get('service') in TOOLS:validate_tool_end(h,c)
   else:check(c.get('service')=='postgres' and positive_end(c),'COLD_SQL_CONTROLLER_UNKNOWN')
  # No aggregate resource or ledger call may prevent this exact owned STOP.
  fresh=h.inspect_container(r['containerId']);check(fresh==actual,'COLD_MAIN_PG_CHANGED')
  if actual['running']:h.run_bounded('docker','stop','--time','30',r['containerId'],timeout=35)
 ended=h.inspect_container(r['containerId']);check(profile_match(h,ended,r) and positive_end(ended),'COLD_MAIN_PG_END_UNKNOWN')
 value={'schema':'target-main-postgres-ended-v1','project':TARGET,'containerId':r['containerId'],'ownerId':r['ownerId'],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'createdReceiptHash':rh,'imageRef':image,'dataPath':r['dataPath'],'exitCode':0,'finishedAt':ended['finishedAt'],'containerStopped':True,'pid':0,'sqlFIN':'NOT VERIFIED','data':'KEEP'}
 publish(h,end_path,value);return value

def empty_frame(h):
 check(h.ROOT==pathlib.Path('/opt')/SOURCE and h.TARGET==pathlib.Path('/opt')/TARGET and not getattr(h,'kind',None),'COLD_EMPTY_NAMESPACE');v=h.variant_bridge();view=v.VariantHost(h,KIND);view.own(view.TARGET);context,ch=v.load_context(h,KIND);m=context['effectiveMaterial'];a,ah=read(h,view.TARGET/'master/readiness-authority.json');p,ph=read(h,view.TARGET/'master/readiness-plan.json');alias,alias_hash=read(h,view.TARGET/'secrets/readiness-plan.json',999)
 check(a.get('schema')=='cp021-readiness-authority-v1' and a.get('kind')==KIND and a.get('caseName')=='ready-empty' and SHA.fullmatch(a.get('sourceSha','')) and p==alias and ph==alias_hash==a.get('planHash') and p.get('schema')=='cp019-empty-readiness-plan-v1' and p.get('database')=='mecanet_control_empty' and p.get('kind')==KIND and p.get('variantLineageHash')==context['additionHash'] and p.get('custodyHash')==digest(m) and p.get('sourceSha')==a['sourceSha'] and p.get('targetResource')==a.get('targetResource') and p.get('manifest',{}).get('runId')==m['recoveryId'] and p['manifest'].get('generation')==m['target']['generation'] and p['manifest'].get('expectedTenants')==[],'COLD_EMPTY_PLAN_REQUIRED')
 return v,view,context,m,a

def empty_stop(h):
 """Read only Root's sealed original authority, without live-ledger helpers.

 VariantHost.own/references/load_context enforce the normal admission budget.
 They deliberately are not emergency-stop dependencies. This narrow path can
 only stop the four CIDs in the already published empty runtime inventory.
 """
 check(h.ROOT==pathlib.Path('/opt')/SOURCE and h.TARGET==pathlib.Path('/opt')/TARGET and not getattr(h,'kind',None),'COLD_EMPTY_NAMESPACE');h.own(h.ROOT);h.own(h.TARGET);v=h.variant_bridge();view=v.VariantHost(h,KIND);check(view.TARGET==h.TARGET/'variants'/KIND,'COLD_EMPTY_NAMESPACE')
 context,ch=read(h,h.TARGET/'master'/('variant-'+KIND+'-context.json'));marker,mh=read(h,view.TARGET/'master/context.json');m=context.get('effectiveMaterial',{});addition=context.get('addition',{})
 check(context.get('kind')==KIND and ch==digest(context) and context.get('additionHash')==digest(addition) and addition.get('kind')==KIND and addition.get('effectiveMaterialHash')==digest(m) and m.get('target',{}).get('project')==TARGET and marker=={'schema':'target-variant-root-v1','kind':KIND,'project':TARGET,'contextHash':ch,'additionHash':context['additionHash']},'COLD_EMPTY_STOP_CONTEXT')
 inventory,ih=read(h,view.TARGET/'master/empty-runtime-created.json');check(set(inventory)=={'schema','kind','project','caseName','sourceSha','generation','recoveryId','lineageHash','planHash','preparedHash','services'} and inventory['schema']=='cp021-empty-runtime-created-v1' and inventory['kind']==KIND and inventory['project']==TARGET and inventory['caseName']=='ready-empty' and inventory['generation']==m['target']['generation'] and inventory['recoveryId']==m['recoveryId'] and inventory['lineageHash']==context['additionHash'] and SHA.fullmatch(inventory['sourceSha']) and HASH.fullmatch(inventory['planHash']) and HASH.fullmatch(inventory['preparedHash']) and set(inventory['services'])==set(BUSINESS),'COLD_EMPTY_INVENTORY_CHANGED')
 rows={};actuals={};owners=v.owners(m)
 for service in BUSINESS:
  row=inventory['services'][service];check(set(row)=={'containerId','ownerId','referenceHash'} and HASH.fullmatch(row['containerId']) and row['ownerId']==owners[service] and HASH.fullmatch(row['referenceHash']),'COLD_EMPTY_REFERENCE');r,rh=read(h,view.TARGET/'master/services'/(service+'-'+row['containerId']+'.json'))
  check(rh==row['referenceHash'] and r.get('schema')=='target-variant-service-created-v1' and all(r.get(k)==value for k,value in {'project':TARGET,'kind':KIND,'service':service,'containerId':row['containerId'],'ownerId':row['ownerId'],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'lineageHash':context['additionHash'],'state':'CREATED BEFORE START/SQL'}.items()),'COLD_EMPTY_REFERENCE');actual=h.inspect_container(r['containerId']);check(v.matches(actual,r,h.PROFILES),'COLD_EMPTY_PROCESS_CHANGED');v.verify_mounts(h,KIND,r['containerId']);rows[service]=r;actuals[service]=actual
 check(len({r['containerId'] for r in rows.values()})==4,'COLD_EMPTY_DUPLICATE')
 stop=[a['id'] for a in actuals.values() if a['running']]
 for old in actuals.values():check(h.inspect_container(old['id'])==old,'COLD_EMPTY_STOP_CHANGED')
 if stop:h.run_bounded('docker','stop','--time','30',*stop,timeout=35)
 ended=[]
 for service in BUSINESS:
  actual=h.inspect_container(rows[service]['containerId']);check(v.matches(actual,rows[service],h.PROFILES) and positive_end(actual),'COLD_EMPTY_END_UNKNOWN');ended.append({k:actual[k] for k in ['id','service','ownerId','running','pid','status','exitCode','finishedAt']})
 value={'schema':'cp021-empty-runtime-stopped-v1','kind':KIND,'project':TARGET,'caseName':'ready-empty','generation':m['target']['generation'],'recoveryId':m['recoveryId'],'lineageHash':context['additionHash'],'planHash':inventory['planHash'],'inventoryHash':ih,'createdServices':list(BUSINESS),'containers':ended,'containerFIN':'PASS','sqlFIN':'NOT VERIFIED','data':'KEEP'};publish(h,view.TARGET/'master/empty-runtime-stop.json',value);return value

def readiness_receipt(h,view,context,m,a,action):
 suffix={'prepare-empty':'prepared','probe-unready':'http-unready'}[action];receipt,rh=read(h,view.TARGET/'secrets'/('readiness-'+suffix+'.json'),999)
 check(all(receipt.get(k)==value for k,value in {'kind':KIND,'caseName':'ready-empty','planHash':a['planHash'],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'sourceSha':a['sourceSha'],'variantLineageHash':context['additionHash']}.items()),'COLD_EMPTY_RECEIPT')
 results=[]
 for path in (view.TARGET/'master').glob('readiness-result-*.json'):
  r,_=read(h,path)
  if r.get('action')==action:results.append(r)
 check(len(results)==1,'COLD_EMPTY_JOB_REQUIRED');result=results[0];inv=result['jobId'];j,jh=read(h,view.TARGET/'master'/('readiness-job-'+inv+'.json'));cfg,cfgh=read(h,view.TARGET/'master'/('readiness-config-'+inv+'.json'));created,ch=read(h,view.TARGET/'evidence/jobs'/(inv+'-created.json'));ended,eh=read(h,view.TARGET/'evidence/jobs'/(inv+'-end.json'));raw,_=read(h,view.TARGET/'evidence/jobs'/(inv+'-output.log'),999,json_value=False);out=json.loads(raw)
 check(result.get('schema')=='cp021-readiness-host-result-v1' and all(result.get(k)==value for k,value in {'kind':KIND,'receiptHash':rh,'createdHash':ch,'endHash':eh,'planHash':a['planHash'],'lineageHash':context['additionHash'],'generation':m['target']['generation'],'recoveryId':m['recoveryId']}.items()) and j.get('schema')=='cp021-readiness-job-reference-v1' and j.get('jobId')==inv and j.get('containerId')==created.get('containerId') and j.get('createdHash')==ch and j.get('cfgHash')==cfgh and cfg.get('action')==action and cfg.get('invocationId')==inv and cfg.get('planHash')==a['planHash'] and cfg.get('contextHash')==a.get('contextHash'),'COLD_EMPTY_JOB_REQUIRED')
 service=created.get('service');profile=h.PROFILES.get(service)
 check(profile and service in ['harness','probe'] and created.get('schema')=='controller-job-created-v1' and created.get('state')=='CREATED BEFORE START/SQL' and created.get('commandHash')==digest(['node','tests/qa/cp019/readiness-variant.mjs',action]) and created.get('project')==TARGET and created.get('jobId')==inv and created.get('ownerId')==m['controllerOwner'] and created.get('imageDigest')==profile[2].split('@',1)[1] and ended.get('schema')=='controller-job-end-v1' and all(ended.get(k)==created[k] for k in ['jobId','containerId','project','service','ownerId']) and ended.get('createdReceiptHash')==ch and ended.get('exitCode')==0 and ended.get('containerStopped') is True and ended.get('sqlAbsence')=='NOT VERIFIED' and ended_at(ended.get('finishedAt')) is not None and out=={'type':'cp019-readiness-job','action':action,'kind':KIND,'receiptHash':rh,'planHash':a['planHash'],'secretOutput':False,'physicalAcceptance':'NOT VERIFIED'},'COLD_EMPTY_JOB_END_REQUIRED')
 if action=='prepare-empty':check(receipt.get('schema')=='cp019-empty-prepared-v1' and receipt.get('database')=='mecanet_control_empty' and receipt.get('originalDataPreserved') is True and receipt.get('health')=='NOT VERIFIED' and set(receipt.get('configs',{}))=={'api1','api2','clock'} and all(HASH.fullmatch(x) for x in receipt['configs'].values()),'COLD_EMPTY_PREPARE_REQUIRED')
 else:check(receipt.get('schema')=='cp019-readiness-http-v1' and receipt.get('phase')=='unready' and receipt.get('expectedReadyStatus')==503 and receipt.get('pendingHttp')==0 and receipt.get('tenantAuthorization') is False and [r.get('instance') for r in receipt.get('instances',[])]==['api1','api2'] and all(r.get('live')==200 and r.get('ready')==503 and type(r.get('probes')) is int and 2<=r['probes']<=20 for r in receipt['instances']),'COLD_EMPTY_UNREADY_REQUIRED')
 return receipt,rh

def empty_refs(h,v,view,context,m):
 rows=[r for r in view.references() if r['service'] in BUSINESS];check(len({r['service'] for r in rows})==len(rows) and len({r['containerId'] for r in rows})==len(rows),'COLD_EMPTY_DUPLICATE')
 for r in rows:check(r['kind']==KIND and r['generation']==m['target']['generation'] and r['recoveryId']==m['recoveryId'] and r['lineageHash']==context['additionHash'],'COLD_EMPTY_REFERENCE')
 return {r['service']:r for r in rows}

def empty_inventory(h,v,view,context,m,a,prepared_hash,create=False):
 rows=empty_refs(h,v,view,context,m);check(set(rows)==set(BUSINESS),'COLD_EMPTY_FOUR_CREATED_REQUIRED');services={}
 for service in BUSINESS:
  r=rows[service];saved,rh=read(h,view.TARGET/'master/services'/(service+'-'+r['containerId']+'.json'));check(saved==r,'COLD_EMPTY_REFERENCE');services[service]={'containerId':r['containerId'],'ownerId':r['ownerId'],'referenceHash':rh}
 value={'schema':'cp021-empty-runtime-created-v1','kind':KIND,'project':TARGET,'caseName':'ready-empty','sourceSha':a['sourceSha'],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'lineageHash':context['additionHash'],'planHash':a['planHash'],'preparedHash':prepared_hash,'services':services};path=view.TARGET/'master/empty-runtime-created.json'
 if create:publish(h,path,value)
 else:saved,sha=read(h,path);check(saved==value and sha==digest(value),'COLD_EMPTY_INVENTORY_CHANGED')
 return rows,value

def empty_runtime(h,action):
 check(action in ['create','start-business','start-worker','stop'],'COLD_EMPTY_ACTION')
 if action=='stop':return empty_stop(h)
 v,view,context,m,a=empty_frame(h);h.set_host_case('ready-empty');h.enter_runtime_case('target-window','ready-empty')
 prepared,prepared_hash=readiness_receipt(h,view,context,m,a,'prepare-empty')
 for service in ['api1','api2','clock']:
  cfg,cfgh=read(h,view.TARGET/'secrets'/('readiness-'+service+'.json'),999);check(cfgh==prepared['configs'][service] and cfg.get('planHash')==a['planHash'] and cfg.get('variantLineageHash')==context['additionHash'] and cfg.get('generation')==m['target']['generation'] and cfg.get('recovery',{}).get('mode')=='NORMAL' and cfg['recovery'].get('runId')==m['recoveryId'],'COLD_EMPTY_CONFIG_CHANGED')
 if action=='create':
  existing=empty_refs(h,v,view,context,m);sealed=exists(view.TARGET/'master/empty-runtime-created.json')
  for service in BUSINESS:
   if service in existing:
    actual=h.inspect_container(existing[service]['containerId']);check(v.matches(actual,existing[service],h.PROFILES) and (sealed or actual['status']=='created' and actual['running'] is False and actual['pid']==0),'COLD_EMPTY_CREATE_RESUME')
   else:check(not sealed,'COLD_EMPTY_INVENTORY_CHANGED');v.create_service(h,KIND,service)
  rows,inventory=empty_inventory(h,v,view,context,m,a,prepared_hash,True)
  return {'result':'PASS FOR OWN CREATED REFERENCES ONLY','kind':KIND,'caseName':'ready-empty','createdServices':list(BUSINESS),'inventoryHash':digest(inventory),'startsPerformed':0,'readiness':'NOT VERIFIED'}
 rows,inventory=empty_inventory(h,v,view,context,m,a,prepared_hash)
 actuals={}
 for service,r in rows.items():
  actual=h.inspect_container(r['containerId']);check(v.matches(actual,r,h.PROFILES),'COLD_EMPTY_PROCESS_CHANGED');v.verify_mounts(h,KIND,r['containerId']);actuals[service]=actual
 if action=='start-business':check(actuals['worker']['status']=='created' and actuals['worker']['running'] is False and actuals['worker']['pid']==0,'COLD_EMPTY_WORKER_MUST_WAIT');selected=['api1','api2','web']
 else:
  check(all(actuals[s]['running'] is True and actuals[s]['status']=='running' and actuals[s]['pid']>0 for s in ['api1','api2','web']),'COLD_EMPTY_BUSINESS_REQUIRED');readiness_receipt(h,view,context,m,a,'probe-unready');selected=['worker']
 for service in selected:
  r=rows[service];actual=h.inspect_container(r['containerId']);check(v.matches(actual,r,h.PROFILES),'COLD_EMPTY_PROCESS_CHANGED')
  if actual['status']=='created' and actual['running'] is False and actual['pid']==0:v.start_service(h,KIND,service,r['containerId'])
  else:check(actual['running'] is True and actual['status']=='running' and actual['pid']>0,'COLD_EMPTY_TERMINATED_CANNOT_RESTART')
  started=h.inspect_container(r['containerId']);check(v.matches(started,r,h.PROFILES) and started['running'] is True and started['status']=='running' and started['pid']>0 and ended_at(started.get('startedAt')) is not None,'COLD_EMPTY_START_UNKNOWN')
  publish(h,view.TARGET/'master'/('empty-runtime-'+service+'-started.json'),{'schema':'cp021-empty-service-started-v1','kind':KIND,'service':service,'containerId':r['containerId'],'ownerId':r['ownerId'],'referenceHash':inventory['services'][service]['referenceHash'],'inventoryHash':digest(inventory),'startedAt':started['startedAt']})
 return {'result':'PASS FOR OWN PROCESS START ONLY','kind':KIND,'caseName':'ready-empty','services':selected,'inventoryHash':digest(inventory),'readiness':'NOT VERIFIED'}
