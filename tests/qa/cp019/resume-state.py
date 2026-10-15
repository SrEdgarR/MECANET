"""Passive, read-only entry gates for the one original r02 continuation.

No IDs, publications, budget charges, SQL, Docker mutations or clock resets.
The caller authenticates this module and the extension in a separate Root plan.
"""
import hashlib,ipaddress,json,math,os,pathlib,re,stat

RUNTIME_SHA='ca15ed980de8167cc6144285a43b85cfbf71a7d3'
SOURCE='mecanet-qa-p1l3-r02';TARGET=SOURCE+'-target'
HASH=re.compile(r'^[0-9a-f]{64}$')
HELPERS=frozenset(['host.py','tls_bundle.py','target-host.py','target-lifecycle.py','target-variant-host.py','target-readiness-host.py','browser-config.py','controller.py','resource-monitor.py','budget-limits.json','run.py'])
GLOBAL={'artifactFiles':8192,'sql':200000,'http':300,'journal':1000}
CASE={'artifactFiles':2000,'sql':8192,'http':80,'journal':1000}
TOOLS={'controller-tool','harness','probe','offline-pg'}
BUSINESS={'worker','api1','api2','web'}
FIXED=('owner.json','compose.json','master/material.json','master/material-ref.json','staging/artifact.json')

def check(ok,code):
 if not ok:raise AssertionError(code)

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def digest(value):return hashlib.sha256(value if isinstance(value,bytes) else canonical(value)).hexdigest()
def number(value):return type(value) in [int,float] and math.isfinite(value)

def read_private_bytes(path,uid,mode,limit=1024**2):
 """Bounded read from one private inode; the pathname must still name it."""
 check(path.resolve()==path and not path.is_symlink(),'RESUME_PRIVATE_PATH')
 before=path.lstat();keys=('st_dev','st_ino','st_uid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns')
 check(stat.S_ISREG(before.st_mode) and before.st_uid==uid and before.st_mode&0o777==mode and before.st_nlink==1 and 1<=before.st_size<=limit,'RESUME_PRIVATE_FILE')
 fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
 try:
  opened=os.fstat(fd);check(all(getattr(before,k)==getattr(opened,k) for k in keys),'RESUME_PRIVATE_CHANGED');raw=b''
  while len(raw)<=before.st_size:
   chunk=os.read(fd,before.st_size+1-len(raw))
   if not chunk:break
   raw+=chunk
  after=os.fstat(fd);named=path.lstat()
  check(len(raw)==before.st_size and all(getattr(before,k)==getattr(after,k)==getattr(named,k) for k in keys),'RESUME_PRIVATE_CHANGED');return raw
 finally:os.close(fd)

def roots(h):
 check(h.ROOT==pathlib.Path('/opt')/SOURCE and h.TARGET==pathlib.Path('/opt')/TARGET,'RESUME_ROOT_SCOPE');return (h.ROOT,h.TARGET)

def validate_roots(h):
 for root in roots(h):
  check(root.resolve()==root and not root.is_symlink(),'RESUME_ROOT_PATH');meta=root.lstat()
  check(stat.S_ISDIR(meta.st_mode) and meta.st_uid==0 and meta.st_mode&0o777==0o711,'RESUME_ROOT_CUSTODY');h.own(root)

def selected_path(h,path):
 for root in roots(h):
  if path.is_relative_to(root):
   relative=path.relative_to(root);parts=relative.parts
   return str(relative).replace('\\','/') in FIXED or len(parts)>=2 and parts[0] in ['config','tls','secrets']
 return False

def scope_inventory(h):
 """Enumerate the closed metadata/configuration scope, never data or evidence."""
 result=set()
 for root in roots(h):
  fixed=['owner.json','compose.json']+(['master/material.json','master/material-ref.json','staging/artifact.json'] if root==h.ROOT else [])
  for name in fixed:result.add(root/name)
  pending=[root/name for name in ['config','tls','secrets']]
  while pending:
   directory=pending.pop();check(directory.resolve()==directory and not directory.is_symlink(),'RESUME_SCOPE_LINK');meta=directory.lstat()
   check(stat.S_ISDIR(meta.st_mode) and not meta.st_mode&0o022,'RESUME_SCOPE_DIRECTORY')
   for path in directory.iterdir():
    check(path.resolve()==path and not path.is_symlink(),'RESUME_SCOPE_LINK');entry=path.lstat()
    if stat.S_ISDIR(entry.st_mode):pending.append(path)
    else:check(stat.S_ISREG(entry.st_mode),'RESUME_SCOPE_TYPE');result.add(path)
    check(len(result)+len(pending)<=512,'RESUME_SCOPE_SIZE')
 return result

def pinned_inputs(h,extension):
 rows=extension.get('preservedFiles');check(isinstance(rows,list) and 7<=len(rows)<=512,'RESUME_PIN_LIST');values={}
 for row in rows:
  check(isinstance(row,dict) and set(row)=={'path','uid','mode','sha256'} and isinstance(row['path'],str) and row['path'].startswith('/') and '\\' not in row['path'] and '..' not in pathlib.PurePosixPath(row['path']).parts,'RESUME_PIN_SHAPE')
  path=pathlib.Path(row['path']);check(selected_path(h,path) and path not in values,'RESUME_PIN_SCOPE')
  check(type(row['uid']) is int and row['uid'] in [0,101,999] and type(row['mode']) is int and row['mode'] in [0o400,0o444,0o600] and isinstance(row['sha256'],str) and HASH.fullmatch(row['sha256']),'RESUME_PIN_CUSTODY')
  raw=read_private_bytes(path,row['uid'],row['mode']);check(digest(raw)==row['sha256'],'RESUME_PIN_CHANGED');values[path]=raw
 check(set(values)==scope_inventory(h),'RESUME_PIN_OMITTED');return values

def counters(value,caps):return isinstance(value,dict) and set(value)==set(caps) and all(type(v) is int and 0<=v<=caps[k] for k,v in value.items())

def validate_ledger(h,extension):
 check(h.CEILINGS==GLOBAL and h.CASE_LIMITS==CASE and h.SCENARIO_COUNT==135,'RESUME_LIMITS_CHANGED')
 state=h.read_budget_snapshot();anchor=extension.get('originalLedgerAnchor');check(isinstance(anchor,dict) and all(k in anchor for k in ['startedUptime','sequence','total','registryHash']),'RESUME_LEDGER_ANCHOR')
 check(anchor['registryHash']==h.BUDGET_PLAN_SHA and number(anchor['startedUptime']) and anchor['startedUptime']>=0 and type(anchor['sequence']) is int and anchor['sequence']>=0 and counters(anchor['total'],GLOBAL),'RESUME_LEDGER_ANCHOR')
 now=h.uptime();check(number(now) and state.get('startedUptime')==anchor['startedUptime'] and 0<=now-anchor['startedUptime']<1800,'RESUME_ORIGINAL_CLOCK')
 check(type(state.get('sequence')) is int and state['sequence']>=anchor['sequence'] and counters(state.get('total'),GLOBAL) and all(state['total'][k]>=v for k,v in anchor['total'].items()),'RESUME_COUNTER_REGRESSION')
 check(all(anchor['total'][k]==state['total'][k]==0 for k in ['sql','http','journal']),'RESUME_WORK_ALREADY_STARTED')
 check(len(state.get('plannedScenarios',{}))==135 and state['plannedScenarios'].get('host-pg-start')==CASE and all(v==CASE for v in state['plannedScenarios'].values()) and 'host-pg-start' not in state.get('scenarios',{}),'RESUME_SOURCE_PG_CASE_OPENED')
 # The original host checks exact registry hash, scope, sums and every cap.
 h.validate_budget_remaining(state,'host-pg-start',now);return state

def ended_job(h,row):
 check(row.get('service') in TOOLS and row.get('running') is False and row.get('pid')==0 and row.get('status')=='exited' and type(row.get('exitCode')) is int and row.get('finishedAt') and not row['finishedAt'].startswith('0001-'),'RESUME_OWN_PROCESS_PRESENT')
 root=h.ROOT if row['project']==SOURCE else h.TARGET;job_id=row.get('jobId');check(isinstance(job_id,str) and re.fullmatch('[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}',job_id) and HASH.fullmatch(row.get('id','')),'RESUME_JOB_ID')
 created_raw=read_private_bytes(root/'evidence/jobs'/(job_id+'-created.json'),0,0o400);created=json.loads(created_raw);end=json.loads(read_private_bytes(root/'evidence/jobs'/(job_id+'-end.json'),0,0o400))
 pairs={'containerId':'id','project':'project','service':'service','ownerId':'ownerId','jobId':'jobId'}
 check(set(created)=={'schema','jobId','containerId','project','service','ownerId','imageDigest','commandHash','state','createdAt'} and created.get('schema')=='controller-job-created-v1' and created.get('state')=='CREATED BEFORE START/SQL' and HASH.fullmatch(created.get('commandHash','')) and isinstance(created.get('createdAt'),str) and created['createdAt'] and set(end)=={'schema','jobId','containerId','project','service','ownerId','createdReceiptHash','exitCode','finishedAt','startedAt','containerStopped','sqlAbsence'} and end.get('schema')=='controller-job-end-v1' and end.get('containerStopped') is True and end.get('sqlAbsence')=='NOT VERIFIED' and all(created.get(k)==end.get(k)==row.get(v) for k,v in pairs.items()),'RESUME_JOB_REFERENCE')
 profile=h.PROFILES[row['service']];check((row.get('nanoCpus'),row.get('memory'),row.get('imageRef'))==profile and created.get('imageDigest')==profile[2].split('@',1)[1] and end.get('createdReceiptHash')==digest(created_raw) and end.get('exitCode')==row['exitCode'] and end.get('finishedAt')==row['finishedAt'] and end.get('startedAt')==row.get('startedAt'),'RESUME_JOB_END_CHANGED')

def validate(h,extension,parentPlan):
 """Validate the original cold boundary, returning no material or raw inputs."""
 check(isinstance(extension,dict) and extension.get('schema')=='cp021-controller-extension-v1' and extension.get('runtimeSourceSha')==RUNTIME_SHA,'RESUME_EXTENSION')
 check(isinstance(parentPlan,dict) and parentPlan.get('schema')=='cp021-controller-plan-v1' and parentPlan.get('sourceSha')==RUNTIME_SHA and set(parentPlan.get('helpers',{}))==HELPERS and all(isinstance(v,str) and HASH.fullmatch(v) for v in parentPlan['helpers'].values()) and extension.get('parentPlanHash')==digest(parentPlan),'RESUME_PARENT_PLAN')
 check(isinstance(extension.get('artifactDigest'),str) and re.fullmatch('sha256:[0-9a-f]{64}',extension['artifactDigest']),'RESUME_ARTIFACT_DIGEST')
 validate_roots(h);state=validate_ledger(h,extension);inputs=pinned_inputs(h,extension)
 artifact=json.loads(inputs[h.ROOT/'staging/artifact.json']);material_raw=inputs[h.ROOT/'master/material.json'];material=json.loads(material_raw);reference=json.loads(inputs[h.ROOT/'master/material-ref.json'])
 check(artifact.get('sourceSha')==artifact.get('codeSha')==RUNTIME_SHA and artifact.get('digest')==extension['artifactDigest'] and isinstance(artifact.get('entries'),list) and artifact['digest']=='sha256:'+digest(artifact['entries']),'RESUME_ARTIFACT_CHANGED')
 for name,sha in parentPlan['helpers'].items():
  matches=[e for e in artifact['entries'] if e.get('path')=='tests/qa/cp019/'+('runner.py' if name=='run.py' else name)]
  check(len(matches)==1 and matches[0].get('sha256')==sha,'RESUME_PARENT_HELPER_CHANGED')
 check(reference.get('materialHash')==digest(material_raw) and material.get('artifactDigest')==extension['artifactDigest'][7:] and material.get('source',{}).get('project')==SOURCE and material.get('target',{}).get('project')==TARGET,'RESUME_MATERIAL_CHANGED')
 before=json.loads(read_private_bytes(h.ROOT/'evidence/preflight.json',0,0o600));foreign=before.get('consumers');check(isinstance(foreign,list) and len(foreign)==27 and len({c.get('id') for c in foreign})==27,'RESUME_FOREIGN_BASELINE')
 current=h.facts();check(all(row in current for row in foreign),'RESUME_FOREIGN_CHANGED')
 for row in current:
  if row.get('project') in [SOURCE,TARGET]:ended_job(h,row)
 check(h.preserve().get('result')=='PASS','RESUME_PRESERVATION');h.resources()
 # Do not let a long read-only validation extend the original global window.
 check(0<=h.uptime()-state['startedUptime']<1800,'RESUME_ORIGINAL_CLOCK')
 return {'schema':'cp021-resume-state-v1','status':'PASS','readOnly':True,'extensionHash':digest(extension),'parentPlanHash':digest(parentPlan),'ledgerHash':digest(state),'materialHash':digest(material_raw),'artifactDigest':extension['artifactDigest'],'preservedFiles':len(inputs),'preservedConsumers':len(foreign)}

def validate_networks(h,project,services):
 """Absent planned own networks may be created; foreign overlaps may not."""
 planned={};selected=None
 for root,subnets in [(h.ROOT,('10.77.61.0/24','10.77.62.0/24')),(h.TARGET,('10.77.63.0/25','10.77.63.128/25'))]:
  spec=json.loads(read_private_bytes(root/'compose.json',0,0o600));check(spec.get('name')==root.name and set(spec.get('networks',{}))=={'data','front'},'RESUME_COMPOSE_NETWORKS')
  for key,subnet in zip(('data','front'),subnets):
   network=spec['networks'][key];name=root.name+'-'+key
   check(network.get('name')==name and network.get('internal') is True and network.get('enable_ipv6') is False and network.get('driver_opts',{}).get('com.docker.network.bridge.gateway_mode_ipv4')=='isolated' and network.get('ipam',{}).get('config')==[{'subnet':subnet}],'RESUME_PLANNED_NETWORK')
   planned[name]=subnet
  if root.name==project:selected=spec
 for name in services:
  service=selected.get('services',{}).get(name);check(isinstance(service,dict) and not any(service.get(k) for k in ['depends_on','links','external_links','network_mode']) and set(service.get('networks',{}))<=set(['data','front']) and service.get('networks'),'RESUME_UNPLANNED_DEPENDENCY')
 ids=h.run('docker','network','ls','-q').split();check(len(ids)<=512 and all(re.fullmatch('[0-9a-f]{12,64}',value) for value in ids),'RESUME_NETWORK_INVENTORY')
 if not ids:return
 fmt='{"name":{{json .Name}},"internal":{{json .Internal}},"driver":{{json .Driver}},"ipv6":{{json .EnableIPv6}},"options":{{json .Options}},"ipam":{{json .IPAM.Config}}}'
 rows=[json.loads(line) for line in h.run('docker','network','inspect','--format',fmt,*ids).splitlines()];check(len(rows)==len(ids),'RESUME_NETWORK_INVENTORY');seen=set()
 for row in rows:
  name=row.get('name');check(isinstance(name,str) and name not in seen,'RESUME_NETWORK_INVENTORY');seen.add(name)
  configs=row.get('ipam') or [];check(isinstance(configs,list),'RESUME_NETWORK_INVENTORY')
  if name in planned:
   check(row.get('internal') is True and row.get('driver')=='bridge' and row.get('ipv6') is False and (row.get('options') or {}).get('com.docker.network.bridge.gateway_mode_ipv4')=='isolated' and [x.get('Subnet') for x in configs]==[planned[name]],'RESUME_EXISTING_NETWORK_CHANGED')
  else:
   check(not any(name.startswith(p+'-') for p in [SOURCE,TARGET]),'RESUME_UNPLANNED_NETWORK')
   for config in configs:
    if config.get('Subnet'):
     actual=ipaddress.ip_network(config['Subnet']);check(not any(actual.version==candidate.version and actual.overlaps(candidate) for candidate in map(ipaddress.ip_network,planned.values())),'RESUME_NETWORK_OVERLAP')

def validate_prerequisites(h,project,services):
 """Read actual Root references before CREATE can affect any dependency."""
 roots(h);check(project in [SOURCE,TARGET] and isinstance(services,(list,tuple)) and all(isinstance(s,str) for s in services) and len(services)==len(set(services)) and frozenset(services) in [frozenset(['postgres']),frozenset(['worker']),frozenset(['api1','api2','web'])],'RESUME_CREATE_SCOPE')
 root=h.ROOT if project==SOURCE else h.TARGET;h.own(root);h.preserve();current=h.facts();owners=h.expected_owners();own=[c for c in current if c.get('project') in [SOURCE,TARGET]]
 check(not any(c.get('project')==project and c.get('service') in services for c in own),'RESUME_CREATE_WOULD_RECREATE')
 if services==['postgres'] or services==('postgres',):
  check(not any(c.get('running') for c in own) and not any(c.get('project')==project and c.get('service') in BUSINESS|{'postgres'} for c in own),'RESUME_PG_NOT_COLD')
 else:
  postgres=[c for c in own if c.get('service')=='postgres' and c.get('running') is True]
  check(len(postgres)==1 and postgres[0].get('project')==project,'RESUME_PG_DEPENDENCY');dependencies=postgres
  if set(services)=={'api1','api2','web'}:
   workers=[c for c in own if c.get('project')==project and c.get('service')=='worker'];check(len(workers)==1,'RESUME_WORKER_DEPENDENCY');dependencies=dependencies+workers
  for row in dependencies:
   check(HASH.fullmatch(row.get('id','')) and h.owned_identity(row,owners) and row.get('running') is True and row.get('status')=='running' and type(row.get('pid')) is int and row['pid']>0,'RESUME_DEPENDENCY_CHANGED')
   if project==SOURCE:h.read_source_service_reference(row);h.validate_source_service_boundary(row['id'],h.source_compose_spec()['services'][row['service']])
   else:
    h.verify_main_target_references([row])
    if row['service']=='postgres':h.target_bridge().validate_created_postgres(h,row['id'])
   check(h.inspect_container(row['id'])==row,'RESUME_DEPENDENCY_CHANGED')
 h.guard_resources(current,[(root,s) for s in services],owners);validate_networks(h,project,services);h.resources();return True
