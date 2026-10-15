"""Passive physical variant provider. Root invokes this only after entry gates.

Variants are subdirectories of the approved TARGET, never new projects. This
module does not inspect the environment, choose material or perform I/O on import.
Every process is CREATED, bound to a Root0400 CID reference, then STARTED.
"""
import base64, copy, datetime, hashlib, hmac, json, os, pathlib, re, secrets, stat, subprocess, time, uuid

SOURCE='mecanet-qa-p1l3-r03';PROJECT=SOURCE+'-target'
KINDS=('roster-empty','allclosed','commit-interrupted','promote-prefix','a5-restrictions')
CASES=dict(zip(KINDS,('ready-empty','ready-allclosed','target-commit-fault','target-promote-fault','variant-a5-grant')))
BUSINESS={'api1','api2','worker','web'}
HASH=re.compile(r'^[0-9a-f]{64}$');UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
DATA_MAX=2*1024**3

def check(ok,code):
 if not ok:raise AssertionError(code)
def canonical(value):return json.dumps(value,separators=(',',':'),sort_keys=True,ensure_ascii=False,allow_nan=False).encode()
def digest(value):return hashlib.sha256(value if isinstance(value,bytes) else canonical(value)).hexdigest()
def uid():return str(uuid.uuid4())
def secret(size):return base64.urlsafe_b64encode(secrets.token_bytes(size)).rstrip(b'=').decode()
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def paths(kind):
 check(kind in KINDS,'VARIANT_KIND');root=pathlib.Path('/opt')/PROJECT/'variants'/kind
 return {'root':root,'data':root/'data/18/docker','dataRoot':root/'data','socket':root/'ingress/http.sock',**{name:root/name for name in ['ingress','journal','secrets','master','evidence']}}
def case_name(kind):check(kind in KINDS,'VARIANT_KIND');return CASES[kind]
def id_values(value):
 if isinstance(value,str):return [value] if UUID.fullmatch(value) else []
 if isinstance(value,dict):return [item for x in value.values() for item in id_values(x)]
 if isinstance(value,list):return [item for x in value for item in id_values(x)]
 return []
def all_ids(value):return set(id_values(value))
def scram(password,salt):
 salted=hashlib.pbkdf2_hmac('sha256',password.encode(),base64.b64decode(salt),4096)
 stored=hashlib.sha256(hmac.new(salted,b'Client Key',hashlib.sha256).digest()).digest();server=hmac.new(salted,b'Server Key',hashlib.sha256).digest()
 return 'SCRAM-SHA-256$4096:'+salt+'$'+base64.b64encode(stored).decode()+':'+base64.b64encode(server).decode()
def choose_effective(original):
 """Choice is called once, before prospective publication; never on retry."""
 m=copy.deepcopy(original);m['recoveryId']=uid();target=m['target']
 for key in ['generation','seedClockOwner','workerClockOwner','webOwner']:target[key]=uid()
 target['apiOwners']={key:uid() for key in target['apiOwners']}
 def replace_ids(value):
  if isinstance(value,list):return [replace_ids(x) for x in value]
  if isinstance(value,dict):return {k:replace_ids(x) for k,x in value.items()}
  check(isinstance(value,str) and UUID.fullmatch(value),'VARIANT_OPERATION_ID');return uid()
 target['operationIds']=replace_ids(target['operationIds']);target['sessionSecret']=secret(48)
 target['rolePasswords']={role:secret(32) for role in target['rolePasswords']};target['roleVerifiers']={}
 for role,password in target['rolePasswords'].items():
  salt=base64.b64encode(secrets.token_bytes(16)).decode();target['roleVerifiers'][role]={'salt':salt,'verifier':scram(password,salt)}
 m['stageOperationIds']={key:value if key.startswith('source-') else uid() for key,value in m['stageOperationIds'].items()}
 validate_pair(original,m);return m
def validate_pair(original,effective):
 check(set(original)==set(effective) and original['schema']==effective['schema'] and original['source']==effective['source'] and original['controllerOwner']==effective['controllerOwner'] and original['artifactDigest']==effective['artifactDigest'],'VARIANT_SOURCE_CHANGED')
 check(original['source']['project']==SOURCE and original['target']['project']==effective['target']['project']==PROJECT,'VARIANT_PROJECT')
 a,b=original['target'],effective['target'];check(set(a)==set(b) and set(original['stageOperationIds'])==set(effective['stageOperationIds']),'VARIANT_MATERIAL_SHAPE')
 for key in ['identityPassword','identityPasswordHash','referenceVersions','epochs']:check(a[key]==b[key],'VARIANT_ACTOR_CHANGED')
 old=all_ids(original);new=[effective['recoveryId'],b['generation'],b['seedClockOwner'],b['workerClockOwner'],b['webOwner'],*b['apiOwners'].values(),*id_values(b['operationIds'])]
 for key,value in effective['stageOperationIds'].items():
  if key.startswith('source-'):check(value==original['stageOperationIds'][key],'VARIANT_SOURCE_CHANGED')
  else:new.append(value)
 check(all(isinstance(x,str) and UUID.fullmatch(x) and x not in old for x in new) and len(new)==len(set(new)),'VARIANT_TARGET_REUSE')
 check(set(a['rolePasswords'])==set(b['rolePasswords'])==set(b['roleVerifiers']) and len(set(b['rolePasswords'].values()))==len(b['rolePasswords']) and all(p not in a['rolePasswords'].values() and p not in original['source']['rolePasswords'].values() and re.fullmatch('[A-Za-z0-9_-]{43}',p) and b['roleVerifiers'][r]['verifier']==scram(p,b['roleVerifiers'][r]['salt']) for r,p in b['rolePasswords'].items()),'VARIANT_TARGET_SECRET_REUSE')
 check(a['sessionSecret']!=b['sessionSecret'] and re.fullmatch('[A-Za-z0-9_-]{64}',b['sessionSecret']) and len(canonical(effective))<=262144,'VARIANT_TARGET_SECRET_REUSE');return True
def distinct_target(original,effective,existing):
 generated=all_ids(effective)-all_ids(original);other=all_ids(existing)-all_ids(original)
 check(generated.isdisjoint(other) and effective['target']['sessionSecret']!=existing['target']['sessionSecret'] and set(effective['target']['rolePasswords'].values()).isdisjoint(existing['target']['rolePasswords'].values()),'VARIANT_SIBLING_REUSE');return True
def caps(h):return {**h.CEILINGS,'seconds':1800,'caseSql':h.CASE_LIMITS['sql'],'caseHttp':80,'caseSeconds':45,'activePg':1,'cpuMilli':1000,'memoryMiB':2048,'dataBytes':DATA_MAX}
def ledger_continuity(anchor,current,registry_hash,ceilings,now):
 check(anchor['registryHash']==registry_hash and current.get('schema')=='cp019-budget-v1' and current.get('project')==SOURCE and current.get('startedUptime')==anchor['startedUptime'] and type(current.get('sequence')) is int and current['sequence']>=anchor['sequence'] and 0<=now-anchor['startedUptime']<=1800,'VARIANT_LEDGER_CHANGED')
 check(set(current['total'])==set(anchor['total'])==set(ceilings) and all(type(n) is int and anchor['total'][k]<=n<=ceilings[k] for k,n in current['total'].items()),'VARIANT_LEDGER_RESET');return True
def case_budget(h,kind):
 name=h.HOST_CASE;allowed={case_name(kind),*(['variant-a5-membership','variant-a5-identity'] if kind=='a5-restrictions' else []),'copy-verify'};check(name in allowed,'VARIANT_CASE_ALIAS');state,sh=read(h,h.ROOT/'budget/ledger.json',999,0o600);now=h.uptime();check(state.get('schema')=='cp019-budget-v1' and state.get('project')==SOURCE and 0<=now-state['startedUptime']<=1800 and state.get('plannedScenarios',{}).get(name)==h.CASE_LIMITS,'VARIANT_CASE_BUDGET')
 check(set(state['total'])==set(h.CEILINGS) and all(type(n) is int and 0<=n<=h.CEILINGS[k] for k,n in state['total'].items()),'VARIANT_CASE_BUDGET')
 existing=state.get('scenarios',{}).get(name)
 if existing is not None:check(existing['limits']==h.CASE_LIMITS and 0<=now-existing['startedUptime']<=45 and set(existing['total'])==set(h.CASE_LIMITS) and all(type(n) is int and 0<=n<=h.CASE_LIMITS[k] for k,n in existing['total'].items()),'VARIANT_CASE_EXPIRED')
 return name
def owners(material):
 c=material['target'];return {'postgres':material['controllerOwner'],'api1':c['apiOwners']['api1'],'api2':c['apiOwners']['api2'],'worker':c['workerClockOwner'],'web':c['webOwner'],**{s:material['controllerOwner'] for s in ['harness','probe','controller-tool','offline-pg']}}
def matches(c,r,profiles):
 s=r.get('service');return s in profiles and HASH.fullmatch(r.get('containerId','')) is not None and (r.get('nanoCpus'),r.get('memory'),r.get('imageRef'))==profiles[s] and all(c.get(k)==r.get(v) for k,v in [('id','containerId'),('project','project'),('service','service'),('ownerId','ownerId'),('nanoCpus','nanoCpus'),('memory','memory'),('imageRef','imageRef')]) and type(c.get('running')) is bool
def guard_references(current,references,future,profiles,base_active=()):
 """Actual variant facts plus already-validated main facts; labels cannot enroll."""
 by_id={r['containerId']:r for r in references};check(len(by_id)==len(references),'VARIANT_REFERENCE_DUPLICATE');seen=set();running={}
 for c in current:
  cid=c.get('id');check(cid not in seen,'VARIANT_CID_DUPLICATE');seen.add(cid);r=by_id.get(cid)
  check(r is not None and matches(c,r,profiles),'VARIANT_CID_UNKNOWN_OR_CHANGED')
  if c['running']:
   key=(r['kind'],r['service']);check(key not in running,'VARIANT_ACTIVE_SERVICE_DUPLICATE');running[key]=profiles[r['service']][:2]
 for kind,service in future:
  check(kind in KINDS and service in profiles,'VARIANT_FUTURE');running.setdefault((kind,service),profiles[service][:2])
 active=[(kind,s,cpu,mem) for (kind,s),(cpu,mem) in running.items()]+list(base_active)
 pg=sum(s=='postgres' for _,s,_,_ in active);check(pg<=1,'VARIANT_MULTIPLE_PG')
 check(len({root for root,s,_,_ in active})<=1,'VARIANT_COHORT_CONFLICT')
 if any(s in {'harness','probe'} for _,s,_,_ in active):check(pg==1,'VARIANT_PG_REQUIRED')
 if any(s in {'harness','controller-tool'} for _,s,_,_ in active):check(not any(s in BUSINESS for _,s,_,_ in active),'VARIANT_BUSINESS_ACTIVE')
 if any(s=='offline-pg' for _,s,_,_ in active):check(not any(s in BUSINESS|{'postgres'} for _,s,_,_ in active),'VARIANT_OFFLINE_CONFLICT')
 cpu=sum(c for _,_,c,_ in active);mem=sum(m for _,_,_,m in active);check(cpu<=10**9 and mem<=2048*1024**2,'VARIANT_AGGREGATE_LIMIT')
 return {'nanoCpus':cpu,'memoryMiB':mem//1024**2,'postgresCount':pg,'physicalCapacityVerified':False}
def derive_compose(template,material,kind):
 check(template.get('name')==PROJECT,'VARIANT_COMPOSE_PROJECT');result=copy.deepcopy(template);p=paths(kind);main=pathlib.Path('/opt')/PROJECT
 for service,spec in result['services'].items():
  check(service in owners(material) and not spec.get('ports'),'VARIANT_COMPOSE_SERVICE');volumes=[]
  for value in spec.get('volumes',[]):
   src,dst,access=value.rsplit(':',2);path=pathlib.Path(src)
   check(not path.is_relative_to(pathlib.Path('/opt')/SOURCE/'master') and not path.is_relative_to(main/'master'),'VARIANT_COMPOSE_MASTER')
   if path.is_relative_to(main):
    relative=path.relative_to(main)
    if relative.parts[0] in ['data','secrets','evidence','faults','journal','live','ingress','config']:path=p['root']/relative
    else:check(relative.parts[0]=='tls' and access=='ro','VARIANT_COMPOSE_SHARED')
   else:check(path.is_relative_to(pathlib.Path('/opt')/SOURCE/'staging') and access=='ro' or path==pathlib.Path('/opt')/SOURCE/'budget' and access=='rw','VARIANT_COMPOSE_MOUNT')
   check(access in ['ro','rw'] and dst.startswith('/'),'VARIANT_COMPOSE_MOUNT');volumes.append(str(path)+':'+dst+':'+access)
  spec['volumes']=volumes;spec['labels']={'mecanet.qa.service':service,'mecanet.qa.owner-id':owners(material)[service]}
 return result
def directory(path,uid=0,mode=0o700):
 check(path.resolve()==path and not path.is_symlink(),'VARIANT_DIRECTORY_PATH');s=path.lstat();check(stat.S_ISDIR(s.st_mode) and s.st_uid==uid and s.st_mode&0o777==mode,'VARIANT_DIRECTORY_CUSTODY')
def read(h,path,uid=0,mode=0o400,limit=262144,json_value=True):return h.target_bridge().read_private(path,uid,limit,mode,json_value)
def publish(h,path,value,uid=0):
 if path.exists() or path.is_symlink():
  saved,sha=read(h,path,uid);check(saved==value and sha==digest(value),'VARIANT_IMMUTABLE_CONFLICT');return sha
 h.write_plain(path,canonical(value),0o400,uid);saved,sha=read(h,path,uid);check(saved==value and sha==digest(value),'VARIANT_PUBLICATION');return sha
def source_inputs(h):
 original,oh=read(h,h.ROOT/'master/material.json');check(original==h.material_owned(),'VARIANT_ORIGINAL_MATERIAL_CHANGED')
 normal,nh=read(h,h.ROOT/'secrets/source-normal-manifest.json',999);capture,ch=read(h,h.ROOT/'secrets/source-capture-result.json',999);end,eh=read(h,h.ROOT/'secrets/source-live-end.json',999)
 index,ih=read(h,h.ROOT/'journal/copy-index.json',999,0o600,4*1024**2);raw,rh=read(h,h.ROOT/'journal/source.jsonl',999,0o600,1024**2,False)
 check(raw.endswith(b'\n') and not (h.ROOT/'journal/source.jsonl.controller.lock').exists(),'VARIANT_SOURCE_JOURNAL');records=[json.loads(row) for row in raw.splitlines()]
 check(0<len(records)<=1000 and records[-1].get('kind')=='observed' and records[-1]['sequence']==len(records)-1,'VARIANT_SOURCE_JOURNAL');head={'sequence':records[-1]['sequence'],'hash':records[-1]['hash']}
 check(capture['custodyHash']==oh and capture['normalManifestHash']==nh and capture['resourceHash']==digest(normal['resource']) and capture['runId']==original['source']['normal']['runId'] and end['hash']==digest(end['endProof']) and end['endProof']['recoveryId']==original['recoveryId'] and end['endProof']['sourceResourceHash']==digest(normal['resource']) and end['observedEnd']['sqlOwnersPresent']==[] and end['observedEnd']['httpPending']==[],'VARIANT_SOURCE_BINDING')
 return {'original':original,'normal':normal,'capture':capture,'end':end,'index':index,'head':head,'rawHash':rh}
def make_context(h,kind,inputs,ledger,effective):
 # JSON.stringify emits an integral Number as 100, while json.dumps emits a
 # Python float as 100.0. Normalize only this new anchor, never the live ledger.
 started=ledger['startedUptime'];started=int(started) if isinstance(started,float) and started.is_integer() else started
 validate_pair(inputs['original'],effective);a={'schema':'target-variant-budget-anchor-v1','project':SOURCE,'path':str(h.ROOT/'budget/ledger.json'),'registryHash':h.BUDGET_PLAN_SHA,'startedUptime':started,'sequence':ledger['sequence'],'total':copy.deepcopy(ledger['total'])}
 addition={'schema':'target-variant-lineage-v1','project':PROJECT,'kind':kind,'originalMaterialHash':digest(inputs['original']),'effectiveMaterialHash':digest(effective),'sourceOriginalRecoveryId':inputs['original']['recoveryId'],'recoveryId':effective['recoveryId'],'generation':effective['target']['generation'],'sourceCaptureHash':digest(inputs['capture']),'sourceNormalManifestHash':digest(inputs['normal']),'sourceResourceHash':digest(inputs['normal']['resource']),'sourceEndProofHash':digest(inputs['end']['endProof']),'copyIndexHash':digest(inputs['index']),'sourceJournalFinalCheckpoint':inputs['head'],'ledgerAnchor':a,'paths':{k:str(value) for k,value in paths(kind).items()},'cases':[case_name(kind),*(['variant-a5-membership','variant-a5-identity'] if kind=='a5-restrictions' else [])],'caps':caps(h)}
 return {'kind':kind,'originalMaterial':inputs['original'],'effectiveMaterial':effective,'addition':addition,'additionHash':digest(addition),'sourceNormalManifest':inputs['normal'],'ledgerAnchor':a}
def context_path(h,kind):return h.TARGET/'master'/('variant-'+kind+'-context.json')
def read_context_authority(h,kind):
 """Original Root custody, independent of whether work may still continue."""
 context,ch=read(h,context_path(h,kind));inputs=source_inputs(h);m=context['effectiveMaterial'];validate_pair(inputs['original'],m)
 expected=make_context(h,kind,inputs,{'startedUptime':context['ledgerAnchor']['startedUptime'],'sequence':context['ledgerAnchor']['sequence'],'total':context['ledgerAnchor']['total']},m)
 check(context==expected and ch==digest(expected),'VARIANT_CONTEXT_CHANGED');return context,ch
def load_context(h,kind):
 context,ch=read_context_authority(h,kind);ledger,_=read(h,h.ROOT/'budget/ledger.json',999,0o600);ledger_continuity(context['ledgerAnchor'],ledger,h.BUDGET_PLAN_SHA,h.CEILINGS,h.uptime())
 return context,ch
def target_bytes(h):
 """Both data and retained metadata share the existing TARGET 2GiB ceiling."""
 total=0
 for base,dirs,files in os.walk(h.TARGET,followlinks=False):
  for name in dirs:check(not (pathlib.Path(base)/name).is_symlink(),'VARIANT_TARGET_SYMLINK')
  for name in files:
   p=pathlib.Path(base)/name;s=p.lstat()
   if stat.S_ISSOCK(s.st_mode):check(p.parent.name=='ingress' and p.name in ['http.sock','web.sock','api1.sock','api2.sock'],'VARIANT_TARGET_SPECIAL');continue
   check(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'VARIANT_TARGET_SPECIAL');total+=s.st_size;check(total<=DATA_MAX,'VARIANT_TARGET_DATA_LIMIT')
 return total
def prepare(h,kind):
 paths(kind);check(h.ROOT==pathlib.Path('/opt')/SOURCE and h.TARGET==pathlib.Path('/opt')/PROJECT,'VARIANT_NAMESPACE');h.own(h.ROOT);h.own(h.TARGET);h.preserve();h.resources()
 case=case_name(kind);h.set_host_case('copy-verify');current=h.facts();check(not any(c.get('project') in [SOURCE,PROJECT] and c.get('running') for c in current),'VARIANT_PREPARE_REQUIRES_COLD')
 registry=h.read_budget_plan();check(case in registry['plannedScenarios'] and registry['plannedScopes'][case]=='target-window','VARIANT_CASE_UNREGISTERED');root=paths(kind)['root'];reference=context_path(h,kind)
 if reference.exists() or reference.is_symlink():context,ch=load_context(h,kind)
 else:
  check(not root.exists() and not root.is_symlink(),'VARIANT_ROOT_NOT_ADOPTED');inputs=source_inputs(h);ledger,_=read(h,h.ROOT/'budget/ledger.json',999,0o600);effective=choose_effective(inputs['original'])
  for sibling in KINDS:
   if sibling!=kind and context_path(h,sibling).exists():distinct_target(inputs['original'],effective,load_context(h,sibling)[0]['effectiveMaterial'])
  context=make_context(h,kind,inputs,ledger,effective);ch=publish(h,reference,context)
 parent=root.parent
 if not parent.exists():h.ledger_charge('artifactFiles');parent.mkdir(mode=0o700);h.syncdir(parent.parent)
 directory(parent)
 if not root.exists():h.ledger_charge('artifactFiles');root.mkdir(mode=0o711);h.syncdir(parent)
 directory(root,0,0o711)
 for folder in ['master','master/services','master/runtime','config','data','secrets','evidence','evidence/jobs','faults','live','journal','journal/heads','journal/plans','journal/target-heads','journal/target-plans','ingress']:
  p=root/folder;owner=101 if folder=='ingress' else 0 if folder.startswith('master') or folder in ['config','evidence/jobs'] else 999;mode=0o770 if folder=='ingress' else 0o700
  if not p.exists():h.ledger_charge('artifactFiles');p.mkdir(mode=mode);os.chown(p,owner,os.stat('/home/ubuntu').st_gid if folder=='ingress' else owner);os.chmod(p,mode);h.syncdir(p.parent)
  directory(p,owner,mode)
 publish(h,root/'master/context.json',{'schema':'target-variant-root-v1','kind':kind,'project':PROJECT,'contextHash':ch,'additionHash':context['additionHash']});publish(h,root/'secrets/target-variant-lineage.json',context,999)
 for name in ['ca.crt','postgresql.conf','pg_hba.conf','nginx.conf']:
  raw,rh=read(h,h.TARGET/'config'/name,0,0o444,json_value=False)
  if name=='nginx.conf':raw=raw.replace(b'/run/qa-ingress/web.sock',b'/run/qa-ingress/http.sock')
  destination=root/'config'/name
  if destination.exists():check(read(h,destination,0,0o444,json_value=False)[0]==raw,'VARIANT_CONFIG_CONFLICT')
  else:h.write_plain(destination,raw,0o444,0)
 template,th=read(h,h.TARGET/'compose.json',0,0o600);compose=derive_compose(template,context['effectiveMaterial'],kind);publish(h,root/'master/compose.json',compose)
 # Existing bridge readers use a Root0600 compose file. Its authority remains
 # the immutable Root0400 snapshot, and manual creation reads that snapshot.
 compose_path=root/'compose.json'
 if compose_path.exists():check(read(h,compose_path,0,0o600)[0]==compose,'VARIANT_COMPOSE_CONFLICT')
 else:h.write_plain(compose_path,canonical(compose),0o600,0)
 # PostgreSQL's PASSWORD_FILE consumes raw bytes, never a JSON string.
 bootstrap=root/'secrets/bootstrap';password=context['effectiveMaterial']['target']['rolePasswords']['qa_bootstrap'].encode()
 if bootstrap.exists():check(read(h,bootstrap,999,json_value=False)[0]==password,'VARIANT_BOOTSTRAP_CONFLICT')
 else:h.write_plain(bootstrap,password,0o400,999)
 target_bytes(h);return {'result':'PASS FOR PRIVATE PREPARATION ONLY','kind':kind,'contextHash':ch,'lineageHash':context['additionHash'],'containersCreated':0,'physicalRecovery':'NOT VERIFIED','secretsPrinted':False}

class VariantHost:
 """Explicit bound view; the base host's globals are never rewritten."""
 def __init__(self,h,kind):
  self.base=h;self.kind=kind;self.ROOT=h.ROOT;self.MAIN_TARGET=h.TARGET;self.TARGET=paths(kind)['root'];self.TARGET_PROJECT=PROJECT;self.PROFILES=h.PROFILES;self.PINS=h.PINS
 def __getattr__(self,name):return getattr(self.base,name)
 def target_project(self):return PROJECT
 def variant_case_name(self,phase=None):
  current=getattr(self.base,'HOST_CASE',None)
  return current if self.kind=='a5-restrictions' and current in ['variant-a5-membership','variant-a5-identity'] else case_name(self.kind)
 def variant_frame(self):return self.material_owned()
 def original_material(self):return load_context(self.base,self.kind)[0]['originalMaterial']
 def material_owned(self):return load_context(self.base,self.kind)[0]['effectiveMaterial']
 def variant_lineage(self):
  context,ch=load_context(self.base,self.kind);private,ph=read(self.base,self.TARGET/'secrets/target-variant-lineage.json',999);check(private==context and ph==ch,'VARIANT_LINEAGE_CUSTODY');return private,ph
 def own(self,root=None):
  root=self.ROOT if root is None else root
  if root in [self.ROOT,self.MAIN_TARGET]:return self.base.own(root)
  check(root==self.TARGET,'VARIANT_OWN_PATH');directory(root,0,0o711);marker,mh=read(self.base,root/'master/context.json');context,ch=load_context(self.base,self.kind)
  check(marker=={'schema':'target-variant-root-v1','kind':self.kind,'project':PROJECT,'contextHash':ch,'additionHash':context['additionHash']},'VARIANT_OWN_REFERENCE');return marker
 def set_host_case(self,name):
  check(name==case_name(self.kind) or name in ['variant-a5-membership','variant-a5-identity'] and self.kind=='a5-restrictions','VARIANT_CASE_ALIAS');return self.base.set_host_case(name)
 def enter_runtime_case(self,scope,name):check(scope=='target-window' and (name==case_name(self.kind) or self.kind=='a5-restrictions' and name in ['variant-a5-membership','variant-a5-identity']),'VARIANT_CASE_ALIAS');return self.base.enter_runtime_case(scope,name)
 def facts(self):return self.base.facts()
 def scope_facts(self):
  current=self.facts();self.guard_resources(current,[],self.expected_owners());ids={r['containerId'] for r in self.references()};return [c for c in current if c.get('project')==SOURCE or c.get('id') in ids]
 def expected_owners(self):
  out=copy.deepcopy(self.base.expected_owners());out[PROJECT]=owners(self.material_owned());return out
 def owned_identity(self,c,expected):
  if c.get('project')==SOURCE:return self.base.owned_identity(c,self.base.expected_owners())
  return any(matches(c,r,self.PROFILES) for r in self.references())
 def references(self):return variant_references(self.base,self.kind)
 def guard_resources(self,current,future,expected):
  converted=[(self.kind,s) for root,s in future if root==self.TARGET];check(len(converted)==len(future),'VARIANT_FUTURE_PATH')
  return self.base.guard_resources(current,[(self.TARGET,s) for _,s in converted],self.base.expected_owners())
 def guard_effect(self,root,services):
  self.own(root);self.preserve();self.resources();target_bytes(self.base);case_budget(self.base,self.kind);return self.guard_resources(self.facts(),[(root,s) for s in services],self.expected_owners())
 def verify_copy_completed(self):return verify_copy(self.base,self.kind)
 def register_service(self,service,cid,config_hash,command_hash=None):return register_service(self.base,self.kind,service,cid,config_hash,command_hash)
 def create_job(self,root,profile,command,environment=None,mounts=(),network=None,sample=True):
  check(root==self.TARGET,'VARIANT_JOB_ROOT');return create_job(self.base,self.kind,profile,command,environment,mounts,network,sample)
 def read_created_job(self,job):return read_created_job(self.base,self.kind,job)
 def created_job_identity(self,c,job,created):return self.base.created_job_identity(c,{**job,'root':pathlib.Path('/opt')/PROJECT},created)
 def start_job(self,job):return start_job(self.base,self.kind,job)
 def finish_job(self,job):return finish_job(self.base,self.kind,job)
 def controller_job(self,root,profile,command,environment=None,mounts=(),network=None,before_start=None,after_start=None,sample=True):
  job=self.create_job(root,profile,command,environment,mounts,network,sample)
  if before_start:before_start(job)
  self.start_job(job)
  if after_start:after_start(job)
  return self.finish_job(job)
 def compose(self,root,*args):
  check(root==self.TARGET and len(args)>=1,'VARIANT_COMPOSE_PATH')
  if args[0]=='ps':
   check(args[1:-1] in [('-q',),('-a','-q')],'VARIANT_COMPOSE_ACTION');rows=[r for r in self.references() if r['service']==args[-1]];check(len(rows)<=1,'VARIANT_SERVICE_DUPLICATE');return rows[0]['containerId'] if rows else ''
  if args[0] in ['up','create']:
   selected=[s for s in args[1:] if s in self.PROFILES]
   if args[0]=='create':check(args[1:5]==('--no-build','--pull','never','--no-recreate') and args[5:] in [('postgres',),('worker',),('api1','api2','web')],'VARIANT_COMPOSE_ACTION')
   else:check(selected and set(args[1:])-set(selected)<=set(['-d','--no-build','--pull','never','--no-deps']),'VARIANT_COMPOSE_ACTION')
   rows=[create_service(self.base,self.kind,s) for s in selected]
   if args[0]=='up':
    for row in rows:start_service(self.base,self.kind,row['service'],row['containerId'])
   return ''
  if args[0]=='start':
   check(len(args)==2,'VARIANT_COMPOSE_ACTION');rows=[r for r in self.references() if r['service']==args[1]];check(len(rows)==1,'VARIANT_SERVICE_REQUIRED');start_service(self.base,self.kind,args[1],rows[0]['containerId']);return ''
  raise AssertionError('VARIANT_COMPOSE_ACTION')

def variant_references(h,only_kind=None):
 result=[]
 for kind in ([only_kind] if only_kind else KINDS):
  root=paths(kind)['root'];directory_path=root/'master/services'
  if not root.exists() and not root.is_symlink():continue
  view=VariantHost(h,kind);view.own(root);directory(directory_path)
  context,ch=load_context(h,kind);result.extend(references_for_context(h,kind,context))
 return result
def references_for_context(h,kind,context):
 root=paths(kind)['root'];expected=owners(context['effectiveMaterial']);result=[]
 for path in (root/'master/services').iterdir():
  check(re.fullmatch(r'[a-z0-9-]+-[0-9a-f]{64}\.json',path.name),'VARIANT_REFERENCE_NAME');r,rh=read(h,path);s=r.get('service')
  check(set(r)=={'schema','project','kind','service','containerId','ownerId','imageRef','nanoCpus','memory','generation','recoveryId','lineageHash','dataPath','configHash','commandHash','createdAt','state'} and r['schema']=='target-variant-service-created-v1' and r['project']==PROJECT and r['kind']==kind and s in h.PROFILES and path.name==s+'-'+r['containerId']+'.json' and HASH.fullmatch(r['containerId']) and r['ownerId']==expected[s] and (r['nanoCpus'],r['memory'],r['imageRef'])==h.PROFILES[s] and r['generation']==context['effectiveMaterial']['target']['generation'] and r['recoveryId']==context['effectiveMaterial']['recoveryId'] and r['lineageHash']==context['additionHash'] and r['dataPath']==str(paths(kind)['data']) and HASH.fullmatch(r['configHash']) and HASH.fullmatch(r['commandHash']) and r['state']=='CREATED BEFORE START/SQL','VARIANT_REFERENCE_CHANGED');result.append(r)
 for path in (root/'evidence/jobs').iterdir():
  if not path.name.endswith('-created.json'):continue
  check(re.fullmatch('[0-9a-f-]{36}-created.json',path.name),'VARIANT_JOB_REFERENCE_NAME');job_id=path.name[:-13];created,created_hash=read(h,path);s=created.get('service');cpu,mem,image=h.PROFILES.get(s,(None,None,None))
  check(created.get('schema')=='controller-job-created-v1' and created.get('project')==PROJECT and created.get('jobId')==job_id and UUID.fullmatch(job_id) and s in ['harness','probe','controller-tool','offline-pg'] and created.get('ownerId')==expected[s] and created.get('imageDigest')==image.split('@',1)[1] and HASH.fullmatch(created.get('containerId','')) and created.get('state')=='CREATED BEFORE START/SQL' and HASH.fullmatch(created.get('commandHash','')),'VARIANT_JOB_REFERENCE_CHANGED')
  result.append({'kind':kind,'project':PROJECT,'service':s,'containerId':created['containerId'],'ownerId':created['ownerId'],'imageRef':image,'nanoCpus':cpu,'memory':mem,'jobId':job_id,'createdReceiptHash':created_hash})
 return result
def emergency_variant_references(h):
 """Read STOP authority only. Expiry cannot erase prior Root CREATED custody.
 No clocks, live budgets, pressure samples, publications or Docker calls occur.
 The normal reader and every START path still enforce their original limits.
 """
 check(h.ROOT==pathlib.Path('/opt')/SOURCE and h.TARGET==pathlib.Path('/opt')/PROJECT,'VARIANT_NAMESPACE');h.own(h.ROOT);h.own(h.TARGET);result=[]
 for kind in KINDS:
  root=paths(kind)['root']
  if not root.exists() and not root.is_symlink():continue
  directory(root,0,0o711);directory(root/'master');directory(root/'master/services');directory(root/'evidence/jobs');context,ch=read_context_authority(h,kind);marker,mh=read(h,root/'master/context.json');check(marker=={'schema':'target-variant-root-v1','kind':kind,'project':PROJECT,'contextHash':ch,'additionHash':context['additionHash']},'VARIANT_OWN_REFERENCE');result.extend(references_for_context(h,kind,context))
 check(len({r['containerId'] for r in result})==len(result),'VARIANT_REFERENCE_DUPLICATE');return result
def guard_all(h,current,future,main_owners,main_guard):
 """Root hook. main_guard also verifies its own persisted TARGET CID references."""
 refs=variant_references(h);known={r['containerId']:r for r in refs};variant=[c for c in current if c.get('id') in known];main=[c for c in current if c.get('id') not in known];main_future=[];variant_future=[]
 for root,service in future:
  if root in [h.ROOT,h.TARGET]:main_future.append((root,service))
  else:
   kinds=[k for k in KINDS if root==paths(k)['root']];check(len(kinds)==1,'VARIANT_FUTURE_PATH');variant_future.append((kinds[0],service))
 main_guard(main,main_future,main_owners)
 active={(c['project'],c['service']):h.PROFILES[c['service']][:2] for c in main if c.get('project') in [SOURCE,PROJECT] and c['running']}
 for root,service in main_future:active.setdefault((root.name,service),h.PROFILES[service][:2])
 return guard_references(variant,refs,variant_future,h.PROFILES,[(project,service,cpu,mem) for (project,service),(cpu,mem) in active.items()])
def register_service(h,kind,service,cid,config_hash,command_hash=None):
 view=VariantHost(h,kind);view.own(view.TARGET);context,ch=load_context(h,kind);check(service in h.PROFILES and HASH.fullmatch(cid) and HASH.fullmatch(config_hash),'VARIANT_REGISTER_ARGUMENTS');cpu,mem,image=h.PROFILES[service]
 r={'schema':'target-variant-service-created-v1','project':PROJECT,'kind':kind,'service':service,'containerId':cid,'ownerId':owners(context['effectiveMaterial'])[service],'imageRef':image,'nanoCpus':cpu,'memory':mem,'generation':context['effectiveMaterial']['target']['generation'],'recoveryId':context['effectiveMaterial']['recoveryId'],'lineageHash':context['additionHash'],'dataPath':str(paths(kind)['data']),'configHash':config_hash,'commandHash':command_hash or config_hash,'createdAt':stamp(),'state':'CREATED BEFORE START/SQL'}
 actual=h.inspect_container(cid);check(matches(actual,r,h.PROFILES) and actual.get('status')=='created' and actual.get('pid')==0 and not actual['running'] and isinstance(actual.get('startedAt'),str) and actual['startedAt']=='0001-01-01T00:00:00Z','VARIANT_CREATED_REQUIRED')
 existing=[x for x in view.references() if x['service']==service];check(not existing,'VARIANT_SERVICE_NOT_ADOPTED');publish(h,view.TARGET/'master/services'/(service+'-'+cid+'.json'),r);verify_mounts(h,kind,cid);return r
def verify_mounts(h,kind,cid):
 """HostConfig.Tmpfs is authoritative in CREATED; mounted tmpfs are optional."""
 actual=json.loads(h.run('docker','inspect','--format','{"mounts":{{json .Mounts}},"tmpfs":{{json .HostConfig.Tmpfs}},"ports":{{json .HostConfig.PortBindings}}}',cid));check(isinstance(actual,dict),'VARIANT_MOUNT_TYPE');mounts=actual.get('mounts');root=paths(kind)['root'];main=pathlib.Path('/opt')/PROJECT;service=h.inspect_container(cid).get('service');check(service in h.PROFILES,'VARIANT_MOUNT_SERVICE');bridge=h.target_bridge()
 if service in BUSINESS|{'postgres'}:
  compose,ch=read(h,root/'master/compose.json');spec=copy.deepcopy(compose['services'][service])
  if kind=='roster-empty' and service in ['api1','api2','worker']:
   action='clock' if service=='worker' else service;volumes=[]
   for volume in spec['volumes']:
    src,dst,access=volume.rsplit(':',2)
    if dst in ['/run/qa-secrets/api.json','/run/qa-secrets/worker.json']:volume=str(root/'secrets'/('readiness-'+action+'.json'))+':/run/qa-secrets/readiness-'+action+'.json:ro'
    volumes.append(volume)
   spec['volumes']=volumes
  bridge.validate_created_mounts(actual,spec);planned_tmpfs=bridge.created_tmpfs(spec)
 else:
  check(service in ['harness','probe','controller-tool','offline-pg'],'VARIANT_MOUNT_SERVICE');planned_tmpfs={'/tmp':'size=16m,uid=999,gid=999'};configured=actual.get('tmpfs');configured={} if configured is None else configured;check(isinstance(configured,dict) and configured==planned_tmpfs and not actual.get('ports'),'VARIANT_TMPFS_SCOPE')
 check(isinstance(mounts,list) and not actual.get('ports'),'VARIANT_MOUNT_TYPE');tmp_destinations=[]
 for mount in mounts:
  check(isinstance(mount,dict) and type(mount.get('RW')) is bool,'VARIANT_MOUNT_TYPE')
  if mount.get('Type')=='tmpfs':check(mount.get('Destination') in planned_tmpfs and mount.get('RW') is True,'VARIANT_TMPFS_SCOPE');tmp_destinations.append(mount['Destination']);continue
  check(mount.get('Type')=='bind','VARIANT_MOUNT_TYPE');src=pathlib.Path(mount['Source']);rw=mount['RW'];check(src.resolve()==src and not src.is_symlink(),'VARIANT_MOUNT_PATH')
  check(not src.is_relative_to(root/'master') and not src.is_relative_to(h.ROOT/'master') and not src.is_relative_to(main/'master'),'VARIANT_MASTER_NOT_MOUNTED')
  check(src.is_relative_to(root) or src.is_relative_to(h.ROOT/'staging') and not rw or src==h.ROOT/'budget' and rw or src.is_relative_to(main/'config') and not rw or src.is_relative_to(main/'tls') and not rw or src.is_relative_to(h.ROOT/'secrets') and not rw or src.is_relative_to(h.ROOT/'journal') and not rw or src==h.ROOT/'backup/source-copy' and not rw,'VARIANT_MOUNT_SCOPE')
 check(len(tmp_destinations)==len(set(tmp_destinations)),'VARIANT_TMPFS_SCOPE')
 if service=='postgres':
  data=[m for m in mounts if m.get('Destination')=='/var/lib/postgresql'];check(len(data)==1 and data[0]['Type']=='bind' and data[0]['Source']==str(root/'data') and data[0]['RW'] is True,'VARIANT_PG_DATA_BIND')
 return mounts

def readiness_spec(spec,material,context,config,service,root):
 """Empty runtime receives only its segmented file, never the secret folder."""
 check(service in ['api1','api2','worker'],'VARIANT_READINESS_SERVICE');action='clock' if service=='worker' else service;expected_owner=owners(material)[service]
 check(config.get('schema')=='cp019-empty-runtime-v1' and config.get('project')==PROJECT and config.get('kind')=='roster-empty' and config.get('service')==action and config.get('ownerId')==expected_owner and config.get('generation')==material['target']['generation'] and config.get('variantLineageHash')==context['additionHash'] and re.fullmatch('[0-9a-f]{40}',config.get('sourceSha','')) and config.get('recovery',{}).get('mode')=='NORMAL' and config['recovery'].get('runId')==material['recoveryId'],'VARIANT_READINESS_CONFIG')
 roles={'control':'saas_api','sessions':'saas_session','issuer':'saas_issuer'} if action!='clock' else {'connection':'saas_clock'}
 for key,role in roles.items():
  conn=config.get(key,{});check(conn.get('database')=='mecanet_control_empty' and conn.get('user')==role and conn.get('password')==material['target']['rolePasswords'][role] and conn.get('host')=='postgres' and conn.get('ssl',{}).get('rejectUnauthorized') is True,'VARIANT_READINESS_AUTHORITY')
 result=copy.deepcopy(spec);result['command']=['node','tests/qa/cp019/readiness-variant.mjs',action];result['environment']={'QA_PROJECT':PROJECT,'QA_SCENARIO':'target-window','QA_CODE_SHA':config['sourceSha'],'QA_OWNER_ID':expected_owner,'QA_INVOCATION_ID':uid()};volumes=[]
 for volume in result['volumes']:
  src,dst,access=volume.rsplit(':',2)
  if dst in ['/run/qa-secrets/api.json','/run/qa-secrets/worker.json']:volumes.append(str(root/'secrets'/('readiness-'+action+'.json'))+':/run/qa-secrets/readiness-'+action+'.json:ro')
  else:check(not dst.startswith('/run/qa-secrets'),'VARIANT_READINESS_SECRET_FOLDER');volumes.append(volume)
 result['volumes']=volumes;return result
def create_service(h,kind,service):
 view=VariantHost(h,kind);view.guard_effect(view.TARGET,[service]);specs,sh=read(h,view.TARGET/'master/compose.json');spec=specs['services'][service];check(not any(r['service']==service for r in view.references()),'VARIANT_SERVICE_NOT_ADOPTED');cpu,mem,image=h.PROFILES[service]
 if kind=='roster-empty' and service in ['api1','api2','worker']:
  context,ch=load_context(h,kind);action='clock' if service=='worker' else service;cfg,cfg_hash=read(h,view.TARGET/'secrets'/('readiness-'+action+'.json'),999);spec=readiness_spec(spec,context['effectiveMaterial'],context,cfg,service,view.TARGET)
 check(spec['image']==image and spec['labels']=={'mecanet.qa.service':service,'mecanet.qa.owner-id':owners(view.material_owned())[service]} and not spec.get('ports') and spec['restart']=='no','VARIANT_SERVICE_SPEC')
 networks=list(spec['networks']);check(networks and set(networks)<=set(['data','front']),'VARIANT_NETWORK_SCOPE');network=PROJECT+'-'+networks[0]
 args=['docker','create','--name',PROJECT+'-'+kind+'-'+service,'--label','com.docker.compose.project='+PROJECT,'--label','mecanet.qa.service='+service,'--label','mecanet.qa.owner-id='+spec['labels']['mecanet.qa.owner-id'],'--platform','linux/arm64','--network',network,'--network-alias',service,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--cpus',str(cpu/10**9),'--memory',str(mem),'--pids-limit',str(spec.get('pids_limit',64)),'--user',spec['user'],'--restart','no','--log-driver','json-file','--log-opt','max-size=8m','--log-opt','max-file=2']
 if service=='postgres':
  net=json.loads(h.run('docker','network','inspect',network));check(len(net)==1 and net[0]['Internal'] is True and [x.get('Subnet') for x in net[0]['IPAM']['Config']]==['10.77.66.0/25'] and all(x.get('IPv4Address','').split('/')[0]!='10.77.66.2' for x in net[0].get('Containers',{}).values()),'VARIANT_PG_IP_NOT_FREE');args+=['--ip','10.77.66.2']
 if service=='web':
  net=json.loads(h.run('docker','network','inspect',network));check(len(net)==1 and net[0]['Internal'] is True and [x.get('Subnet') for x in net[0]['IPAM']['Config']]==['10.77.66.128/25'] and all(x.get('IPv4Address','').split('/')[0]!='10.77.66.130' for x in net[0].get('Containers',{}).values()),'VARIANT_WEB_IP_NOT_FREE');args+=['--ip','10.77.66.130']
 for volume in spec.get('volumes',[]):args+=['-v',volume]
 for tmp in spec.get('tmpfs',[]):args+=['--tmpfs',tmp]
 for key,value in spec.get('environment',{}).items():check(isinstance(value,str) and '\0' not in value,'VARIANT_ENV');args+=['-e',key+'='+value]
 if spec.get('working_dir'):args+=['--workdir',spec['working_dir']]
 command=spec.get('command',[]);entry=spec.get('entrypoint',[])
 if entry:args+=['--entrypoint',entry[0]];command=[*entry[1:],*command]
 args+=[image,*command];case_budget(h,kind);cid=h.run(*args).strip();check(HASH.fullmatch(cid),'VARIANT_CREATED_CID');r=register_service(h,kind,service,cid,digest(spec),digest(command))
 for network in networks[1:]:h.run('docker','network','connect','--alias',service,PROJECT+'-'+network,cid)
 return r
def start_service(h,kind,service,cid):
 view=VariantHost(h,kind);view.guard_effect(view.TARGET,[service]);rows=[r for r in view.references() if r['service']==service and r['containerId']==cid];check(len(rows)==1,'VARIANT_CREATED_REFERENCE_REQUIRED');r=rows[0];actual=h.inspect_container(cid)
 check(matches(actual,r,h.PROFILES) and actual.get('status')=='created' and actual.get('pid')==0 and not actual['running'],'VARIANT_START_CHANGED');verify_mounts(h,kind,cid);case_budget(h,kind);h.run('docker','start',cid)
 return {'containerId':cid,'service':service,'started':True,'readiness':'NOT VERIFIED'}
def stop_pg(h,kind):
 view=VariantHost(h,kind);view.own(view.TARGET);view.preserve();rows=[r for r in view.references() if r['service']=='postgres'];check(len(rows)==1,'VARIANT_PG_REFERENCE_REQUIRED');r=rows[0];actual=h.inspect_container(r['containerId'])
 check(matches(actual,r,h.PROFILES),'VARIANT_PG_STOP_IDENTITY');check(not any(c.get('running') and c.get('project') in [SOURCE,PROJECT] and c.get('service')!='postgres' for c in h.facts()),'VARIANT_PG_STOP_RUNTIME_ACTIVE')
 if actual['running']:h.run_bounded('docker','stop','--time','30',r['containerId'],timeout=35)
 ended=h.inspect_container(r['containerId']);check(matches(ended,r,h.PROFILES) and ended['running'] is False and ended.get('pid')==0 and ended.get('status')=='exited' and ended.get('exitCode')==0 and not ended.get('finishedAt','0001-').startswith('0001-'),'VARIANT_PG_END_UNKNOWN_KEEP')
 receipt={'schema':'target-variant-pg-ended-v1','containerId':r['containerId'],'kind':kind,'lineageHash':r['lineageHash'],'exitCode':0,'finishedAt':ended['finishedAt'],'containerStopped':True,'sqlFIN':'NOT VERIFIED'};publish(h,view.TARGET/'master/postgres-end.json',receipt);return receipt
def verify_copy(h,kind):
 check(kind in KINDS,'VARIANT_COPY_KIND');view=VariantHost(h,kind);view.own(view.TARGET);context,ch=load_context(h,kind);inputs=source_inputs(h);check(digest(inputs['index'])==context['addition']['copyIndexHash'],'VARIANT_COPY_INDEX');deadline=time.monotonic()+45
 a,total=h.target_bridge().inventory_copy(h.ROOT/'backup/source-copy',inputs['index'],deadline);b,total2=h.target_bridge().inventory_copy(paths(kind)['data'],inputs['index'],deadline)
 check(a.keys()==b.keys() and all(a[p]!=b[p] for p in a) and total==total2,'VARIANT_COPY_NOT_INDEPENDENT');target_bytes(h)
 return {'result':'PASS FOR INDEPENDENT COPY ONLY','kind':kind,'indexHash':digest(inputs['index']),'files':len(a),'bytes':total,'physicalRecovery':'NOT VERIFIED'}
def copy_variant(h,kind):
 check(kind in KINDS,'VARIANT_COPY_KIND');h.set_host_case('copy-verify');view=VariantHost(h,kind);view.guard_effect(view.TARGET,[]);context,ch=load_context(h,kind);inputs=source_inputs(h);destination=paths(kind)['data'];index=inputs['index'];deadline=time.monotonic()+45
 check(not any(c.get('running') and c.get('project') in [SOURCE,PROJECT] for c in h.facts()),'VARIANT_COPY_REQUIRES_COLD');source=h.ROOT/'backup/source-copy';_,total=h.target_bridge().inventory_copy(source,index,deadline)
 if destination.exists():return verify_copy(h,kind)
 check(target_bytes(h)+total<=DATA_MAX,'VARIANT_TARGET_DATA_LIMIT')
 for p in [destination.parent,destination]:
  check(not p.exists() and not p.is_symlink(),'VARIANT_COPY_NOT_ADOPTED');h.ledger_charge('artifactFiles');p.mkdir(mode=0o700);os.chown(p,999,999);h.syncdir(p.parent)
 for entry in index['files']:
  check(time.monotonic()<deadline,'VARIANT_COPY_DEADLINE');src=source/entry['path'];dst=destination/entry['path']
  for parent in reversed(list(dst.parent.parents)):
   if parent.is_relative_to(destination) and not parent.exists():parent.mkdir(mode=0o700);os.chown(parent,999,999);h.syncdir(parent.parent)
  if not dst.parent.exists():dst.parent.mkdir(mode=0o700);os.chown(dst.parent,999,999);h.syncdir(dst.parent.parent)
  before=src.lstat();check(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and not src.is_symlink(),'VARIANT_COPY_SOURCE');fd=os.open(src,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0)|getattr(os,'O_BINARY',0));out=None
  try:
   opened=os.fstat(fd);check((opened.st_dev,opened.st_ino,opened.st_size)==(before.st_dev,before.st_ino,before.st_size),'VARIANT_COPY_CHANGED');out=os.open(dst,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0)|getattr(os,'O_BINARY',0),stat.S_IMODE(before.st_mode));state=hashlib.sha256();size=0
   while True:
    check(time.monotonic()<deadline,'VARIANT_COPY_DEADLINE');block=os.read(fd,65536)
    if not block:break
    state.update(block);size+=len(block);check(size<=entry['bytes'],'VARIANT_COPY_SIZE');offset=0
    while offset<len(block):offset+=os.write(out,block[offset:])
   after=os.fstat(fd);check((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and size==entry['bytes'] and state.hexdigest()==entry['sha256'],'VARIANT_COPY_CHANGED');os.fchown(out,999,999);os.fsync(out);h.syncdir(dst.parent)
  finally:
   if out is not None:os.close(out)
   os.close(fd)
 result=verify_copy(h,kind);publish(h,view.TARGET/'master/copy-completed.json',{'schema':'target-variant-copy-completed-v1','contextHash':ch,'additionHash':context['additionHash'],'result':result});return result

def job_arguments(h,kind,profile,command,environment=None,mounts=(),network=None):
 check(kind in KINDS and profile in ['harness','probe','controller-tool','offline-pg'] and isinstance(command,list) and command and all(isinstance(x,str) and '\0' not in x for x in command),'VARIANT_JOB_SCOPE')
 root=paths(kind)['root'];context,ch=load_context(h,kind);cpu,mem,image=h.PROFILES[profile];owner=owners(context['effectiveMaterial'])[profile];env=dict(environment or {})
 check(set(env)<={'QA_PROJECT','QA_STAGE','QA_CODE_SHA','QA_INVOCATION_ID','QA_HOST_GATE','QA_READY_FILE','QA_BUSINESS_GATE','QA_FIXTURE_DONE','QA_SOURCE_STOP_GATE'} and env.get('QA_PROJECT',PROJECT)==PROJECT,'VARIANT_JOB_ENV');env['QA_PROJECT']=PROJECT;job_id=env.get('QA_INVOCATION_ID') or uid();check(UUID.fullmatch(job_id),'VARIANT_JOB_INVOCATION');volumes=[]
 if profile in ['harness','probe']:
  config,sh=read(h,root/'master/compose.json');spec=config['services'][profile];check(spec['user']=='999:999' and not spec.get('ports'),'VARIANT_JOB_SERVICE');volumes=list(spec['volumes']);network=PROJECT+'-data'
 elif profile=='controller-tool':volumes=[str(h.ROOT/'staging')+':/workspace:ro'];network=network or 'none'
 else:check(not mounts,'VARIANT_OFFLINE_MOUNTS');volumes=[str(root/'data')+':/data:ro'];network='none'
 check(network in ['none',PROJECT+'-data'],'VARIANT_JOB_NETWORK')
 for src,dst,access in mounts:
  src=pathlib.Path(src);check(src.resolve()==src and not src.is_symlink() and dst.startswith('/run/') and access in ['ro','rw'],'VARIANT_JOB_MOUNT');volumes.append(str(src)+':'+dst+':'+access)
 # All variant jobs run unprivileged, including offline preparation. The only
 # writable source path is the existing global budget; backup/index stay RO.
 for volume in volumes:
  src,dst,access=volume.rsplit(':',2);p=pathlib.Path(src);check(access in ['ro','rw'] and p.resolve()==p and not p.is_symlink() and dst.startswith('/'),'VARIANT_JOB_VOLUME')
  check(not p.is_relative_to(root/'master') and not p.is_relative_to(h.ROOT/'master') and not p.is_relative_to(h.TARGET/'master'),'VARIANT_JOB_MASTER')
  check(p.is_relative_to(root) or p.is_relative_to(h.ROOT/'staging') and access=='ro' or p==h.ROOT/'budget' and access=='rw' or p.is_relative_to(h.ROOT/'secrets') and access=='ro' or p.is_relative_to(h.ROOT/'journal') and access=='ro' or p==h.ROOT/'backup/source-copy' and access=='ro' or p.is_relative_to(h.TARGET/'config') and access=='ro','VARIANT_JOB_VOLUME_SCOPE')
 args=['docker','create','--name',PROJECT+'-'+kind+'-job-'+job_id,'--label','com.docker.compose.project='+PROJECT,'--label','mecanet.qa.service='+profile,'--label','mecanet.qa.owner-id='+owner,'--label','mecanet.qa.job-id='+job_id,'--platform','linux/arm64','--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--cpus',str(cpu/10**9),'--memory',str(mem),'--pids-limit','64','--tmpfs','/tmp:size=16m,uid=999,gid=999','--user','999:999']
 if profile!='offline-pg':args+=['--workdir','/workspace']
 if profile=='probe':args+=['--group-add',str(os.stat('/home/ubuntu').st_gid)]
 for key,value in env.items():check(isinstance(value,str) and '\0' not in value,'VARIANT_JOB_ENV');args+=['-e',key+'='+value]
 for volume in volumes:args+=['-v',volume]
 return [*args,'--entrypoint',command[0],image,*command[1:]],job_id,owner
def create_job(h,kind,profile,command,environment=None,mounts=(),network=None,sample=True):
 view=VariantHost(h,kind)
 if sample:view.guard_effect(view.TARGET,[profile])
 else:view.own(view.TARGET);view.preserve();view.guard_resources(view.facts(),[(view.TARGET,profile)],view.expected_owners())
 check(not any(c.get('service')==profile for c in view.scope_facts() if c.get('project')==PROJECT),'VARIANT_PREVIOUS_JOB_RECONCILE');args,job_id,owner=job_arguments(h,kind,profile,command,environment,mounts,network);case_budget(h,kind);cid=h.run(*args).strip();check(HASH.fullmatch(cid),'VARIANT_JOB_CID');cpu,mem,image=h.PROFILES[profile]
 reference={'schema':'controller-job-created-v1','jobId':job_id,'containerId':cid,'project':PROJECT,'service':profile,'ownerId':owner,'imageDigest':image.split('@',1)[1],'commandHash':digest(command),'state':'CREATED BEFORE START/SQL','createdAt':stamp()};job={'cid':cid,'jobId':job_id,'root':view.TARGET,'profile':profile,'ownerId':owner,'receiptHash':digest(reference)};actual=h.inspect_container(cid)
 check(view.created_job_identity(actual,job,reference) and not actual['running'] and actual.get('status')=='created' and actual.get('pid')==0 and isinstance(actual.get('startedAt'),str) and actual['startedAt']=='0001-01-01T00:00:00Z','VARIANT_JOB_CREATED');publish(h,view.TARGET/'evidence/jobs'/(job_id+'-created.json'),reference);verify_mounts(h,kind,cid);return job
def read_created_job(h,kind,job):
 check(job.get('root')==paths(kind)['root'] and job.get('profile') in ['harness','probe','controller-tool','offline-pg'] and UUID.fullmatch(job.get('jobId','')) and HASH.fullmatch(job.get('cid','')) and HASH.fullmatch(job.get('receiptHash','')),'VARIANT_JOB_REFERENCE_SCOPE')
 created,ch=read(h,job['root']/'evidence/jobs'/(job['jobId']+'-created.json'));check(ch==job['receiptHash'] and set(created)=={'schema','jobId','containerId','project','service','ownerId','imageDigest','commandHash','state','createdAt'} and created['schema']=='controller-job-created-v1' and created['state']=='CREATED BEFORE START/SQL' and HASH.fullmatch(created['commandHash']),'VARIANT_JOB_REFERENCE_HASH');return created
def start_job(h,kind,job):
 view=VariantHost(h,kind);created=read_created_job(h,kind,job);actual=h.inspect_container(job['cid']);check(view.created_job_identity(actual,job,created) and not actual['running'] and actual.get('status')=='created' and actual.get('pid')==0,'VARIANT_JOB_START_CHANGED');view.guard_resources(view.facts(),[(view.TARGET,job['profile'])],view.expected_owners());verify_mounts(h,kind,job['cid']);case_budget(h,kind);h.run('docker','start',job['cid'])
def finish_job(h,kind,job):
 view=VariantHost(h,kind);created=read_created_job(h,kind,job);exit_code=h.run_bounded('docker','wait',job['cid'],timeout=45).strip();check(re.fullmatch('[0-9]+',exit_code),'VARIANT_JOB_WAIT_STATUS');actual=h.inspect_container(job['cid'])
 check(view.created_job_identity(actual,job,created) and not actual['running'] and actual.get('status')=='exited' and actual.get('pid')==0 and actual.get('exitCode')==int(exit_code) and not actual.get('finishedAt','0001-').startswith('0001-'),'VARIANT_JOB_END_UNKNOWN')
 output=subprocess.check_output(['docker','logs',job['cid']],text=True,timeout=5,stderr=subprocess.STDOUT);h.write_plain(job['root']/'evidence/jobs'/(job['jobId']+'-output.log'),output,0o400,999)
 end={'schema':'controller-job-end-v1','jobId':job['jobId'],'containerId':job['cid'],'project':PROJECT,'service':job['profile'],'ownerId':job['ownerId'],'createdReceiptHash':job['receiptHash'],'exitCode':actual['exitCode'],'finishedAt':actual['finishedAt'],'startedAt':actual['startedAt'],'containerStopped':True,'sqlAbsence':'NOT VERIFIED'};eh=publish(h,job['root']/'evidence/jobs'/(job['jobId']+'-end.json'),end)
 check(int(exit_code)==0,'VARIANT_JOB_FAILED_KEEP');again=h.inspect_container(job['cid']);check(view.created_job_identity(again,job,created) and not again['running'] and again['pid']==0 and again['status']=='exited' and again['exitCode']==0,'VARIANT_JOB_REMOVE_CHANGED');h.run('docker','rm',job['cid'])
 return output,{'containerId':job['cid'],'jobCreatedHash':job['receiptHash'],'jobEndHash':eh,'containerFIN':'PASS','sqlFIN':'NOT VERIFIED'}
def dispatch(h,action,args):
 check(action in ['variant-prepare','variant-copy','variant-copy-verify','variant-pg-start','variant-pg-stop','variant-resource'] and len(args)==1 and args[0] in KINDS,'VARIANT_ACTION');kind=args[0]
 if action=='variant-prepare':return prepare(h,kind)
 if action=='variant-copy':return copy_variant(h,kind)
 if action=='variant-copy-verify':return verify_copy(h,kind)
 if action=='variant-pg-stop':return stop_pg(h,kind)
 view=VariantHost(h,kind);return getattr(h.target_bridge(),'target_pg_start' if action=='variant-pg-start' else 'target_resource')(view)
