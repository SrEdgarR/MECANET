"""Passive immutable v2 publication; no Docker, subprocesses or import effects.

Preparation works entirely in memory before the attempt. Publication requires
the exclusive live Root claim, a precharged exact plan, and explicit caller
factories; it does not run HostPort, restart PostgreSQL or open an HTTP route.
"""
import hashlib,io,json,os,pathlib,stat,tarfile
ROOT=pathlib.Path('/opt/mecanet-qa-p1l3-r03');TARGET=pathlib.Path(str(ROOT)+'-target');BASE=ROOT/'master/continuations/v2';RUNTIME=BASE/'runtime';AUTHORITY=BASE/'runtime-authority'
ORIGINAL='1e0027ea22dd103eb51d5e0e484a831a8369c3e44eaa46cc9717468159cfb622';MATERIAL='5590432f06cc93eb7a0c8490ff2afb614eb7557bc688097c13cea9db96f885c6'
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def check(ok,label):
 if not ok:raise AssertionError(label)
def syncdir(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def exclusive_file(path,raw,mode,uid=0):
 check(path.is_relative_to(ROOT) and path.parent.resolve()==path.parent and not path.exists() and not path.is_symlink(),'PUBLICATION_EXCLUSIVE_PATH');fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fchown(f.fileno(),uid,uid);os.fchmod(f.fileno(),mode);os.fsync(f.fileno())
 syncdir(path.parent);check(path.read_bytes()==raw,'PUBLICATION_DURABLE_READBACK');return sha(raw)
def private_raw(path,mode=0o600,uid=0):
 s=path.lstat();check(path.resolve()==path and stat.S_ISREG(s.st_mode) and s.st_uid==uid and stat.S_IMODE(s.st_mode)==mode and s.st_nlink==1 and 2<=s.st_size<=262144,'PUBLICATION_SOURCE_CUSTODY');fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  key=lambda v:(v.st_dev,v.st_ino,v.st_size,v.st_mtime_ns,v.st_ctime_ns);before=os.fstat(fd);check(key(before)==key(s),'PUBLICATION_SOURCE_CHANGED');raw=os.read(fd,262145);check(len(raw)==s.st_size and key(before)==key(os.fstat(fd))==key(path.lstat()),'PUBLICATION_SOURCE_CHANGED');return raw
 finally:os.close(fd)

def prepare(archive,overlay_raw,original_raw,source_compose_raw,target_compose_raw,overlay_model):
 check(isinstance(archive,bytes) and 0<len(archive)<=32*1024**2 and all(isinstance(v,bytes) and 2<=len(v)<=262144 for v in [overlay_raw,original_raw,source_compose_raw,target_compose_raw]),'PUBLICATION_INPUT_SIZE');check(sha(original_raw)==ORIGINAL,'PUBLICATION_ORIGINAL_ANCHOR');files={}
 with tarfile.open(fileobj=io.BytesIO(archive),mode='r:*') as tar:
  members=tar.getmembers();check(0<len(members)<=10000 and len({m.name for m in members})==len(members) and all(m.isfile() and not m.issym() and not m.islnk() and 0<=m.size<32*1024**2 and not pathlib.PurePosixPath(m.name).is_absolute() and '\\' not in m.name and all(p not in ['', '.', '..'] for p in m.name.split('/')) for m in members) and sum(m.size for m in members)<32*1024**2,'PUBLICATION_TAR_SCOPE')
  for member in members:raw=tar.extractfile(member).read();check(len(raw)==member.size,'PUBLICATION_TAR_READ');files[member.name]=raw
 check('artifact.json' in files,'PUBLICATION_MANIFEST_REQUIRED');effective=json.loads(files['artifact.json']);entries=overlay_model.entries(effective);check(set(files)=={'artifact.json',*entries},'PUBLICATION_TAR_CLOSURE')
 for name,e in entries.items():check(sha(files[name])==e['sha256'] and len(files[name])==e['bytes'],'PUBLICATION_ENTRY_HASH')
 original=json.loads(original_raw);overlay=json.loads(overlay_raw);overlay_model.validate_overlay(original,effective,MATERIAL,overlay,ORIGINAL,sha(overlay_raw));check(canonical(overlay)==overlay_raw and canonical(effective)==files['artifact.json'],'PUBLICATION_CANONICAL')
 source=json.loads(source_compose_raw);target=json.loads(target_compose_raw)
 for value,project in [(source,ROOT.name),(target,TARGET.name)]:check(isinstance(value,dict) and value.get('name')==project and set(value.get('services',{}))=={'postgres','api1','api2','worker','web','harness','probe'} and set(value.get('networks',{}))=={'data','front'} and all(not spec.get('ports') for spec in value['services'].values()),'PUBLICATION_COMPOSE_SCOPE')
 directories={RUNTIME}
 for name in files:
  p=RUNTIME/name
  while p.parent!=BASE:directories.add(p.parent);p=p.parent
 paths=sorted(p.relative_to(ROOT).as_posix() for p in directories);entries_plan=[{'path':(RUNTIME/name).relative_to(ROOT).as_posix(),'bytes':len(raw),'sha256':sha(raw)} for name,raw in sorted(files.items())]
 # Conservative directories count as artifacts too; no original charge is
 # removed. Bootstrap14 includes claim3, budget2+ledger1, authority1+files4,
 # frontiers1, plan1 and the UNIX socket1, all before the corresponding effect.
 plan={'schema':'cp024-runtime-publication-v1','originalManifestHash':ORIGINAL,'materialHash':MATERIAL,'effectiveManifestHash':sha(files['artifact.json']),'runtimeHash':sha(overlay_raw),'archiveHash':sha(archive),'sourceComposeHash':sha(source_compose_raw),'targetComposeHash':sha(target_compose_raw),'sourceSha':effective['sourceSha'],'runtimeDirectories':paths,'runtimeFiles':entries_plan,'costs':{'host-bootstrap':14,'host-stage':len(files)+len(directories),'host-config-source':1,'host-config-target':1}}
 return {'plan':plan,'files':files,'effective':effective,'overlayRaw':overlay_raw,'originalRaw':original_raw,'sourceRaw':source_compose_raw,'targetRaw':target_compose_raw}

def validate_prepared(prepared):
 check(isinstance(prepared,dict) and set(prepared)=={'plan','files','effective','overlayRaw','originalRaw','sourceRaw','targetRaw'},'PUBLICATION_PREPARED_SCOPE');p=prepared['plan'];files=prepared['files'];check(isinstance(files,dict) and files and all(isinstance(k,str) and isinstance(v,bytes) for k,v in files.items()),'PUBLICATION_PREPARED_FILES')
 check(p['originalManifestHash']==ORIGINAL==sha(prepared['originalRaw']) and p['materialHash']==MATERIAL and p['runtimeHash']==sha(prepared['overlayRaw']) and p['sourceComposeHash']==sha(prepared['sourceRaw']) and p['targetComposeHash']==sha(prepared['targetRaw']) and p['effectiveManifestHash']==sha(files['artifact.json']) and canonical(prepared['effective'])==files['artifact.json'],'PUBLICATION_PREPARED_CHANGED')
 rows=[{'path':(RUNTIME/name).relative_to(ROOT).as_posix(),'bytes':len(raw),'sha256':sha(raw)} for name,raw in sorted(files.items())];check(rows==p['runtimeFiles'],'PUBLICATION_PREPARED_CHANGED')
 directories={RUNTIME}
 for name in files:
  parts=pathlib.PurePosixPath(name);check(not parts.is_absolute() and '\\' not in name and all(v not in ['', '.', '..'] for v in name.split('/')),'PUBLICATION_PREPARED_PATH');path=RUNTIME/name
  while path.parent!=BASE:directories.add(path.parent);path=path.parent
 check(p['runtimeDirectories']==sorted(d.relative_to(ROOT).as_posix() for d in directories) and p['costs']=={'host-bootstrap':14,'host-stage':len(files)+len(directories),'host-config-source':1,'host-config-target':1},'PUBLICATION_COST_CHANGED');return True

def publish(prepared,claim,host_factory,broker_module,start_transport=False):
 """No retry/cleanup/adoption after uncertainty. Caller must finish safely.

 host_factory imports the effective host only after its files exist, avoiding
 preparatory writes of controller code before the charged attempt begins.
 """
 broker=None;transport=None
 try:
  check(os.geteuid()==0 and os.uname().machine=='aarch64' and type(start_transport) is bool,'PUBLICATION_ROOT_ARM64');claim.check_live();validate_prepared(prepared);plan=prepared['plan'];check(plan.get('schema')=='cp024-runtime-publication-v1' and sha(canonical(plan))==claim.body.get('publicationPlanHash') and plan['runtimeHash']==claim.context['admission']['runtimeHash'],'PUBLICATION_PLAN_BINDING')
  # These checks happen again before publication; no imported material or
  # stale compose is adopted as the original. Output contains hashes only.
  check(sha(private_raw(ROOT/'master/material.json'))==MATERIAL and private_raw(ROOT/'staging/artifact.json',0o444)==prepared['originalRaw'] and private_raw(ROOT/'compose.json')==prepared['sourceRaw'] and private_raw(TARGET/'compose.json')==prepared['targetRaw'],'PUBLICATION_SEALED_INPUT_CHANGED');check(private_raw(ROOT/'budget/ledger.json',0o600,999)==claim.context['baseLedger'],'PUBLICATION_V1_CHANGED')
  check(BASE.resolve()==BASE and BASE.is_dir() and BASE.stat().st_uid==0 and stat.S_IMODE(BASE.stat().st_mode)==0o700,'PUBLICATION_CLAIM_DIRECTORY')
  def before(scenario):claim.check_live();claim.model.remaining(claim.body['initialState'],*[claim.context[k] for k in ['baseLedger','baseLedgerHash','admission']],scenario,float(pathlib.Path('/proc/uptime').read_text().split()[0]))
  def mkdir(path,uid=0,scenario='host-bootstrap'):
   before(scenario);check(path.is_relative_to(ROOT) and path.parent.resolve()==path.parent,'PUBLICATION_DIRECTORY_SCOPE');path.mkdir(mode=0o700);os.chown(path,uid,uid);syncdir(path.parent)
  def write(path,raw,mode,uid=0,scenario='host-bootstrap'):before(scenario);return exclusive_file(path,raw,mode,uid)
  mkdir(ROOT/'budget/continuations');mkdir(ROOT/'budget/continuations/v2',999)
  write(ROOT/'budget/continuations/v2/ledger.json',canonical(claim.body['initialState']),0o600,999)
  mkdir(AUTHORITY);mkdir(BASE/'frontiers')
  for name,raw in [('admission.json',canonical(claim.context['admission'])),('v1-ledger.json',claim.context['baseLedger']),('runtime-overlay.json',prepared['overlayRaw']),('original-artifact.json',prepared['originalRaw'])]:write(AUTHORITY/name,raw,0o444)
  before('host-bootstrap');os.chmod(AUTHORITY,0o555);syncdir(BASE);write(BASE/'publication-plan.json',canonical(plan),0o400)
  for relative in sorted(plan['runtimeDirectories'],key=lambda p:(len(pathlib.PurePosixPath(p).parts),p)):mkdir(ROOT/relative,scenario='host-stage')
  for name,raw in sorted(prepared['files'].items()):write(RUNTIME/name,raw,0o444,scenario='host-stage')
  for relative in reversed(plan['runtimeDirectories']):before('host-stage');os.chmod(ROOT/relative,0o755)
  syncdir(BASE);h=host_factory(RUNTIME);check(h.ROOT==ROOT and h.TARGET==TARGET,'PUBLICATION_HOST_SCOPE');host_entry=next(e for e in prepared['effective']['entries'] if e['path']=='tests/qa/cp019/host.py');check(sha(pathlib.Path(h.__file__).read_bytes())==host_entry['sha256'],'PUBLICATION_HOST_PROVENANCE')
  broker=claim.bind_budget(h,broker_module,broker_module.RootFileStore(ROOT/'budget/continuations/v2/ledger.json'))
  for root,raw,name in [(ROOT,prepared['sourceRaw'],'source-compose.json'),(TARGET,prepared['targetRaw'],'target-compose.json')]:
   scenario='host-config-source' if root==ROOT else 'host-config-target';spec=h.derive_continuation_compose(json.loads(raw));check(spec['name']==root.name,'PUBLICATION_DERIVED_PROJECT');write(BASE/name,canonical(spec),0o600,scenario=scenario)
  check(private_raw(ROOT/'budget/ledger.json',0o600,999)==claim.context['baseLedger'],'PUBLICATION_V1_CHANGED')
  if start_transport:before('host-bootstrap');transport=broker_module.UnixServer(broker,ROOT/'budget/continuations/v2/counter.sock');transport.start();claim.enable_effects(h,transport)
  return {'host':h,'broker':broker,'transport':transport,'claim':claim,'plan':plan,'runtime':RUNTIME,'postgresStarted':False,'sql':0,'http':0}
 except BaseException:
  claim.fail('PUBLICATION_UNCERTAIN')
  if broker is not None:broker.fail('PUBLICATION_UNCERTAIN')
  if transport is not None:transport.stop()
  raise
