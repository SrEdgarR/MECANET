"""Read-only Root resource monitor. Import is passive; no SQL or poll artifacts.

Root references authorize exact CIDs. Labels only select candidates to reject;
created/stopped containers without a reference are never enrolled or used as FIN.
TCP counts are ESTABLISHED server sockets, not the SQL max_connections setting.
"""
import datetime, hashlib, importlib.util, json, math, os, pathlib, re, stat, subprocess, threading, time
try:import resource
except ImportError:resource=None  # Windows runs pure models; physical Linux needs rusage.

if '_CP024_MEMORY_DIAGNOSTICS' in globals():diagnostics=_CP024_MEMORY_DIAGNOSTICS
else:
 _sample_source=pathlib.Path(__file__).with_name('resource-sample.py')
 assert _sample_source.is_file() and _sample_source.resolve()==_sample_source and not _sample_source.is_symlink(),'RESOURCE_DIAGNOSTIC_HELPER_REQUIRED'
 _sample_spec=importlib.util.spec_from_file_location('cp023_resource_sample',_sample_source);diagnostics=importlib.util.module_from_spec(_sample_spec);_sample_spec.loader.exec_module(diagnostics)

KINDS=('roster-empty','allclosed','commit-interrupted','promote-prefix','a5-restrictions')
HASH=re.compile(r'^[0-9a-f]{64}$');UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
SCHEMA='cp021-resource-monitor-summary-v1'
SOURCE=pathlib.Path('/opt/mecanet-qa-p1l3-r03');TARGET=pathlib.Path('/opt/mecanet-qa-p1l3-r03-target')
EVIDENCE_PARENTS={r/'evidence' for r in [SOURCE,TARGET,*[TARGET/'variants'/k for k in KINDS]]}
def directory_allowed(path,s):
 return stat.S_ISDIR(s.st_mode) and ((s.st_uid==0 and not stat.S_IMODE(s.st_mode)&0o022) or (path in EVIDENCE_PARENTS and s.st_uid==999 and stat.S_IMODE(s.st_mode)==0o700))

def require(value,code):
 if not value:raise AssertionError(code)
def fingerprint(s):return tuple(getattr(s,k) for k in ('st_dev','st_ino','st_uid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns'))
def read_root_bytes(path,allow600=False):
 path=pathlib.Path(path);before=path.lstat()
 require(path.is_absolute() and path.resolve()==path and stat.S_ISREG(before.st_mode) and before.st_uid==0 and before.st_nlink==1 and stat.S_IMODE(before.st_mode) in ((0o400,0o600) if allow600 else (0o400,)) and 2<=before.st_size<=262144,'RESOURCE_REFERENCE_CUSTODY')
 for parent in path.parents:
  s=parent.lstat();require(directory_allowed(parent,s),'RESOURCE_REFERENCE_PARENT')
 fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
 try:
  require(fingerprint(before)==fingerprint(os.fstat(fd)),'RESOURCE_REFERENCE_CHANGED')
  with os.fdopen(fd,'rb',closefd=False) as f:raw=f.read(262145)
  require(len(raw)==before.st_size and fingerprint(before)==fingerprint(os.fstat(fd))==fingerprint(path.lstat()),'RESOURCE_REFERENCE_CHANGED')
  return raw
 finally:os.close(fd)
def read_root_json(path,allow600=False):return json.loads(read_root_bytes(path,allow600))
def cpu_counters():
 fields=pathlib.Path('/proc/stat').read_text().splitlines()[0].split();require(fields[0]=='cpu' and len(fields)>=9,'RESOURCE_CPU_UNKNOWN');v=list(map(int,fields[1:9]));require(all(n>=0 for n in v),'RESOURCE_CPU_UNKNOWN');return v
def cpu_busy(before,after):
 require(len(before)==len(after)==8,'RESOURCE_CPU_UNKNOWN');d=[b-a for a,b in zip(before,after)];require(all(x>=0 for x in d) and sum(d)>0,'RESOURCE_CPU_UNKNOWN');return 100*(1-(d[3]+d[4])/sum(d))
def read_proc_start(pid):
 require(type(pid) is int and pid>0,'RESOURCE_POSTGRES_PID_UNKNOWN');raw=pathlib.Path('/proc',str(pid),'stat').read_text();end=raw.rfind(')');require(raw[:raw.find(' ')]==str(pid) and end>0,'RESOURCE_POSTGRES_PID_UNKNOWN');parts=raw[end+2:].split();require(len(parts)>=20 and parts[19].isdigit(),'RESOURCE_POSTGRES_PID_UNKNOWN');return parts[19]
def parse_tcp(raw):
 lines=raw.splitlines();require(bool(lines) and 'local_address' in lines[0] and ('rem_address' in lines[0] or 'remote_address' in lines[0]) and 'st' in lines[0],'RESOURCE_POSTGRES_TCP_UNKNOWN');result=set()
 for line in lines[1:]:
  if not line.strip():continue
  f=line.split();require(len(f)>=10 and re.fullmatch(r'[0-9A-Fa-f]+:[0-9A-Fa-f]{4}',f[1]) and re.fullmatch(r'[0-9A-Fa-f]{2}',f[3]) and f[9].isdigit(),'RESOURCE_POSTGRES_TCP_UNKNOWN')
  if f[3].upper()=='01' and int(f[1].rsplit(':',1)[1],16)==5432:
   require(int(f[9])>0,'RESOURCE_POSTGRES_TCP_UNKNOWN');result.add(int(f[9]))
 return result

def usage_seconds():
 require(resource is not None,'RESOURCE_MONITOR_USAGE_UNKNOWN');require(hasattr(resource,'RUSAGE_THREAD'),'RESOURCE_MONITOR_USAGE_UNKNOWN');u=resource.getrusage(resource.RUSAGE_THREAD);return u.ru_utime+u.ru_stime

class ResourceMonitor:
 def __init__(self,h,raw_run=None):
  self.h=h;self.raw_run=raw_run or h.run;self.abortFlag=threading.Event();self._stop=threading.Event();self._first_complete=threading.Event();self._lock=threading.RLock();self._thread=None;self._started=False;self._error=None;self._samples=0;self._cpu_samples=0;self._last_sample=None;self._sampling_at=None;self._cpu=None;self._cpu_at=None;self._cpu_max=0;self._mem_min=None;self._disk_min=None;self._tcp_max=0;self._pg_stop_transitions=0;self._own=set();self._elapsed=0.;self._usage=0.;self._last_complete=None;self._process_cpu_start=None;self._process_cpu_delta=None;self._first_failure_sample=None;self._pending_sample=None
  baseline=read_root_json(h.ROOT/'evidence/preflight.json',allow600=True);self.foreign=baseline['consumers'];require(isinstance(self.foreign,list) and all(isinstance(c,dict) and HASH.fullmatch(c.get('id','')) for c in self.foreign) and len({c['id'] for c in self.foreign})==len(self.foreign),'RESOURCE_FOREIGN_BASELINE')
 def roots(self):return [self.h.ROOT,self.h.TARGET,*[self.h.TARGET/'variants'/k for k in KINDS]]
 def fail(self,code,sample=None):
  with self._lock:
   if self._error is None:
    self._error=code;self._first_failure_sample={'reason':code,'failedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='microseconds').replace('+00:00','Z'),'sampleStatus':'AVAILABLE' if sample is not None else 'UNAVAILABLE','sample':json.loads(json.dumps(sample,allow_nan=False))}
   self.abortFlag.set()
 def summary(self):
  with self._lock:return {'schema':SCHEMA,'status':'FAIL' if self.abortFlag.is_set() else 'PASS','failed':self.abortFlag.is_set(),'error':self._error,'samples':self._samples,'cpuSamples':self._cpu_samples,'sampleIntervalSeconds':2,'maxSampleSeconds':round(self._elapsed,6),'monitorCpuSeconds':round(self._usage,6),'monitorCpuScope':'RUSAGE_THREAD delta during samples; controller process CPU hard cap not established','controllerProcessCpuSeconds':self._process_cpu_delta,'controllerCpuScope':'RUSAGE_SELF start/stop delta, includes the controller and monitor; no hard cap','rootCpuHardCapVerified':False,'maxHostCpuBusyPercent':round(self._cpu_max,3),'minimumAvailableMiB':self._mem_min,'minimumDiskFreeBytes':self._disk_min,'maxPostgresTcpConnections':self._tcp_max,'positivePostgresStopTransitions':self._pg_stop_transitions,'tcpScope':'ESTABLISHED local port 5432 sockets in exact PG PID network namespace; SQL and UNIX sessions not measured','observedOwnCids':len(self._own),'preservedForeignConsumers':len(self.foreign),'sqlPerPoll':0,'artifactsPerPoll':0,'containerFIN':'NOT VERIFIED','sqlFIN':'NOT VERIFIED','lastSample':json.loads(json.dumps(self._last_sample,allow_nan=False)),'firstFailureSample':json.loads(json.dumps(self._first_failure_sample,allow_nan=False))}
 def check(self):
  # O(1), no I/O, clock/budget charge, shell call or recursive h.run wrapper.
  if self._started and not self._stop.is_set():
   now=time.monotonic()
   with self._lock:
    if self._sampling_at is not None and now-self._sampling_at>2:self.fail('RESOURCE_SAMPLE_DEADLINE')
    elif self._sampling_at is None and self._last_complete is not None and now-self._last_complete>2:self.fail('RESOURCE_MONITOR_STALE')
    if self._thread is None or not self._thread.is_alive():self.fail('RESOURCE_MONITOR_THREAD_ENDED')
  require(not self.abortFlag.is_set(),self._error or 'RESOURCE_MONITOR_UNVERIFIED');return self.summary()
 def start(self):
  require(not self._started and not self._stop.is_set(),'RESOURCE_MONITOR_ALREADY_STARTED');self._started=True
  if resource is not None:
   u=resource.getrusage(resource.RUSAGE_SELF);self._process_cpu_start=u.ru_utime+u.ru_stime
  self._thread=threading.Thread(target=self._loop,name='cp021-resource-monitor',daemon=True);self._thread.start();return self.summary()
 def first_sample(self):
  # Positive completion event only. Timeout/failure denies the first mutation;
  # this is neither FIN/readiness nor a new CPU tolerance or retry policy.
  require(self._started and self._first_complete.wait(2),'RESOURCE_MONITOR_FIRST_SAMPLE_UNKNOWN');self.check();require(self._samples>=1,'RESOURCE_MONITOR_FIRST_SAMPLE_UNKNOWN');return self.summary()
 def stop(self):
  try:
   self._stop.set()
   if self._thread is not None:
    self._thread.join(timeout=2)
    if self._thread.is_alive():self.fail('RESOURCE_MONITOR_STOP_UNVERIFIED')
   if self._process_cpu_start is not None:
    u=resource.getrusage(resource.RUSAGE_SELF);self._process_cpu_delta=round(max(0,u.ru_utime+u.ru_stime-self._process_cpu_start),6)
   if self._samples==0:self.fail('RESOURCE_MONITOR_NO_SAMPLES')
   elif self._cpu_samples==0:self.fail('RESOURCE_MONITOR_CPU_UNVERIFIED')
  except BaseException:self.fail('RESOURCE_MONITOR_STOP_UNVERIFIED')
  return self.summary()
 def _loop(self):
  while not self._stop.is_set() and not self.abortFlag.is_set():
   began=time.monotonic();self._sample_once()
   if self._stop.wait(max(0,2-(time.monotonic()-began))):break
 def _record_sample(self,elapsed,usage):
  with self._lock:self._samples+=1;self._elapsed=max(self._elapsed,elapsed);self._usage+=max(0,usage);self._last_complete=time.monotonic();self._first_complete.set()
 def _sample_once(self):
  began=time.monotonic();used=None
  with self._lock:self._sampling_at=began;self._pending_sample=None
  try:
   used=usage_seconds();self.sample()
  except BaseException as e:
   code=str(e) if isinstance(e,AssertionError) and re.fullmatch(r'RESOURCE_[A-Z_]{1,80}',str(e)) else 'RESOURCE_SAMPLE_UNVERIFIED';self.fail(code,self._pending_sample)
  finally:
   elapsed=time.monotonic()-began
   try:cost=usage_seconds()-used if used is not None else 0
   except BaseException:cost=0;self.fail('RESOURCE_MONITOR_USAGE_UNKNOWN')
   self._record_sample(elapsed,cost)
   with self._lock:self._sampling_at=None
   if elapsed>2:self.fail('RESOURCE_SAMPLE_DEADLINE')
 def sample(self):
  now=time.monotonic();cpu=cpu_counters();busy=None;before=self._cpu;interval=None
  observed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='microseconds').replace('+00:00','Z')
  if self._cpu is not None:
   delta=now-self._cpu_at;interval=delta;require(0<delta<=4,'RESOURCE_CPU_WINDOW_UNKNOWN');busy=cpu_busy(self._cpu,cpu)
  self._cpu=cpu;self._cpu_at=now
  mem=pathlib.Path('/proc/meminfo').read_text().splitlines();rows=[x.split() for x in mem if x.startswith('MemAvailable:')];require(len(rows)==1 and len(rows[0])==3 and rows[0][2]=='kB','RESOURCE_MEMORY_UNKNOWN');available=int(rows[0][1])//1024
  disk=os.statvfs('/');free=disk.f_bavail*disk.f_frsize;total=disk.f_blocks*disk.f_frsize;context={'observed_at':observed_at,'monotonic_seconds':now,'interval_seconds':interval,'cpu_before':before,'cpu_after':cpu,'own_usage':diagnostics.process_usage(resource,include_thread=True)}
  with self._lock:self._last_sample=diagnostics.describe('monitor',cpu_busy=busy,available_mib=available,disk_free_bytes=free,disk_total_bytes=total,**context);self._pending_sample=self._last_sample
  facts=self.read_facts();self.observe(facts,available,free,total,busy,context=context)
 def read_facts(self):
  # GNU timeout is a bounded child, via the original unwrapped runner. No shell.
  listing=self.raw_run('timeout','--signal=KILL','0.5','docker','ps','-a','--no-trunc','--format','{"id":{{json .ID}},"project":{{json (.Label "com.docker.compose.project")}},"jobId":{{json (.Label "mecanet.qa.job-id")}}}')
  require(isinstance(listing,str) and len(listing)<=2*1024**2,'RESOURCE_DOCKER_INVENTORY_UNKNOWN');selectors=[json.loads(row) for row in listing.splitlines() if row.strip()];ids=[row.get('id','') for row in selectors];require(len(ids)<=4096 and len(set(ids))==len(ids) and all(HASH.fullmatch(cid) for cid in ids),'RESOURCE_DOCKER_INVENTORY_UNKNOWN');selected={r['id']:r for r in selectors}
  if not ids:return []
  fmt=self.h.FACTS_FORMAT;require(fmt.endswith('}'),'RESOURCE_DOCKER_FORMAT');fmt=fmt[:-1]+',"oomKilled":{{json .State.OOMKilled}}}'
  inspection_failed=False
  try:raw=self.raw_run('timeout','--signal=KILL','0.9','docker','inspect','--format',fmt,*ids)
  except subprocess.CalledProcessError as e:
   require(e.returncode==1 and isinstance(e.output,str),'RESOURCE_DOCKER_INSPECT_UNKNOWN');raw=e.output;inspection_failed=True
  require(isinstance(raw,str) and len(raw)<=4*1024**2,'RESOURCE_DOCKER_INVENTORY_UNKNOWN');facts=[json.loads(row) for row in raw.splitlines() if row.strip()];found={c.get('id') for c in facts};require(len(found)==len(facts) and found<=set(ids),'RESOURCE_DOCKER_INVENTORY_UNKNOWN')
  if inspection_failed:require(bool(set(ids)-found),'RESOURCE_DOCKER_INSPECT_UNKNOWN')
  for cid in set(ids)-found:require(self.removed_job_proven(cid,selected[cid]),'RESOURCE_DOCKER_DISAPPEARED')
  return facts
 def removed_job_proven(self,cid,selector):
  # Labels select a fixed filename only. Exact Root END plus its Root CREATED
  # hash authorize an inspect/remove race; an absent CID itself proves nothing.
  project=selector.get('project');job=selector.get('jobId','')
  if project not in [self.h.ROOT.name,self.h.TARGET.name] or not isinstance(job,str) or not UUID.fullmatch(job):return False
  roots=[self.h.ROOT] if project==self.h.ROOT.name else self.roots()[1:]
  found=[]
  for root in roots:
   folder=root/'evidence/jobs';path=folder/(job+'-end.json')
   if not path.exists() and not path.is_symlink():continue
   r=read_root_json(path)
   require(r.get('containerId')==cid and r.get('jobId')==job and r.get('schema')=='controller-job-end-v1' and r.get('containerStopped') is True and r.get('project')==project and type(r.get('exitCode')) is int and r['exitCode']>=0 and r.get('sqlAbsence')=='NOT VERIFIED' and isinstance(r.get('finishedAt'),str) and not r['finishedAt'].startswith('0001-'),'RESOURCE_JOB_END_UNKNOWN')
   created_path=folder/(job+'-created.json');raw=read_root_bytes(created_path);c=json.loads(raw);require(hashlib.sha256(raw).hexdigest()==r.get('createdReceiptHash') and c.get('containerId')==cid and all(c.get(k)==r.get(k) for k in ['jobId','project','service','ownerId']),'RESOURCE_JOB_END_CHANGED');self.normalize(c,'job');found.append(r)
  require(len(found)<=1,'RESOURCE_REFERENCE_DUPLICATE');return len(found)==1
 def normalize(self,r,kind):
  s=r.get('service');owner=r.get('ownerId');require(s in self.h.PROFILES and HASH.fullmatch(r.get('containerId','')) and isinstance(owner,str) and (UUID.fullmatch(owner) or (kind=='job' and s=='controller-tool' and owner=='pre-material')),'RESOURCE_REFERENCE_SHAPE');cpu,mem,image=self.h.PROFILES[s]
  if kind=='source':require(set(r)=={'schema','project','service','containerId','ownerId','imageRef','nanoCpus','memory','state'} and r['schema']=='source-service-created-v1' and r['state']=='BEFORE_START' and s in ['postgres','api1','api2','worker','web'],'RESOURCE_SOURCE_REFERENCE')
  elif kind=='pg':require(r.get('schema')=='target-postgres-created-v1' and s=='postgres' and r.get('state')=='CREATED BEFORE START/SQL','RESOURCE_TARGET_REFERENCE')
  elif kind=='runtime':require(r.get('schema')=='target-service-created-v1' and s in ['api1','api2','worker','web'],'RESOURCE_TARGET_REFERENCE')
  elif kind=='variant':require(r.get('schema')=='target-variant-service-created-v1' and r.get('kind') in KINDS and r.get('state')=='CREATED BEFORE START/SQL','RESOURCE_VARIANT_REFERENCE')
  else:require(kind=='job' and r.get('schema')=='controller-job-created-v1' and s in ['harness','probe','controller-tool','offline-pg'] and r.get('state')=='CREATED BEFORE START/SQL' and UUID.fullmatch(r.get('jobId','')) and HASH.fullmatch(r.get('commandHash','')),'RESOURCE_JOB_REFERENCE')
  image_actual=r.get('imageRef',image.split('@',1)[0]+'@'+str(r.get('imageDigest')))
  require(image_actual==image and r.get('nanoCpus',cpu)==cpu and r.get('memory',mem)==mem,'RESOURCE_REFERENCE_PROFILE')
  return {**r,'imageRef':image,'nanoCpus':cpu,'memory':mem}
 def reference_for(self,f):
  cid=f.get('id','');s=f.get('service');project=f.get('project');require(HASH.fullmatch(cid) and s in self.h.PROFILES,'RESOURCE_OWN_IDENTITY_UNKNOWN');paths=[]
  if project==self.h.ROOT.name:paths.append((self.h.ROOT/'master/source-services'/(s+'-'+cid+'.json'),'source'))
  elif project==self.h.TARGET.name:
   if s=='postgres':paths.append((self.h.TARGET/'master/postgres-created.json','pg'))
   paths.append((self.h.TARGET/'master/runtime'/(s+'-'+cid+'-created.json'),'runtime'))
   for k in KINDS:paths.append((self.h.TARGET/'variants'/k/'master/services'/(s+'-'+cid+'.json'),'variant'))
  else:raise AssertionError('RESOURCE_OWN_PROJECT_UNKNOWN')
  if f.get('jobId') is not None:
   require(UUID.fullmatch(f['jobId']),'RESOURCE_JOB_REFERENCE');roots=[self.h.ROOT] if project==self.h.ROOT.name else self.roots()[1:]
   paths.extend((root/'evidence/jobs'/(f['jobId']+'-created.json'),'job') for root in roots)
  found=[]
  for path,kind in paths:
   if not path.exists() and not path.is_symlink():continue
   r=read_root_json(path)
   # Main PG's single fixed path remains present while variants run.
   if kind=='pg' and r.get('containerId')!=cid:continue
   r=self.normalize(r,kind);require(r.get('containerId')==cid and r.get('project')==project and r.get('service')==s,'RESOURCE_REFERENCE_CHANGED');found.append(r)
  require(len(found)<=1,'RESOURCE_REFERENCE_DUPLICATE');return found[0] if found else None
 def pg_tcp_count(self,f):
  pid=f['pid'];before=read_proc_start(pid);inodes=set()
  for name in ['tcp','tcp6']:inodes.update(parse_tcp(pathlib.Path('/proc',str(pid),'net',name).read_text()))
  require(before==read_proc_start(pid),'RESOURCE_POSTGRES_PID_CHANGED');return len(inodes)
 def tcp_or_positive_stop(self,f):
  try:return self.pg_tcp_count(f)
  except (OSError,AssertionError):
   # An ordinary STOP can race the /proc read. Only a new positive observation
   # of the SAME Root-authorized CID may replace that sample with TCP=N/A.
   began=self._sampling_at if self._sampling_at is not None else time.monotonic();require(time.monotonic()-began<2,'RESOURCE_SAMPLE_DEADLINE')
   before=self.reference_for(f);require(before is not None,'RESOURCE_OWN_REFERENCE_REQUIRED');fmt=self.h.FACTS_FORMAT;require(fmt.endswith('}'),'RESOURCE_DOCKER_FORMAT');fmt=fmt[:-1]+',"oomKilled":{{json .State.OOMKilled}}}'
   remaining=2-(time.monotonic()-began)-.03;require(remaining>0,'RESOURCE_SAMPLE_DEADLINE');timeout=min(.4,remaining)
   raw=self.raw_run('timeout','--signal=KILL',format(timeout,'.6f'),'docker','inspect','--format',fmt,f['id']);require(isinstance(raw,str) and len(raw)<=32768,'RESOURCE_POSTGRES_STOP_UNVERIFIED');c=json.loads(raw);after=self.reference_for(c)
   require(before==after and all(c.get(k)==f.get(k) for k in ['id','project','service','ownerId','imageRef','nanoCpus','memory','startedAt']) and c.get('running') is False and c.get('status')=='exited' and c.get('pid')==0 and c.get('oomKilled') is False and type(c.get('exitCode')) is int and c['exitCode']==0,'RESOURCE_POSTGRES_STOP_UNVERIFIED')
   try:
    finished=datetime.datetime.fromisoformat(c['finishedAt'].replace('Z','+00:00'));started=datetime.datetime.fromisoformat(c['startedAt'].replace('Z','+00:00'));require(finished.year>1 and started.year>1 and finished.tzinfo is not None and started.tzinfo is not None and finished>=started,'RESOURCE_POSTGRES_STOP_UNVERIFIED')
   except (KeyError,TypeError,ValueError):raise AssertionError('RESOURCE_POSTGRES_STOP_UNVERIFIED') from None
   require(time.monotonic()-began<=2,'RESOURCE_SAMPLE_DEADLINE')
   with self._lock:self._pg_stop_transitions+=1
   return None
 def observe(self,facts,available,free,total,busy,context=None):
  captured=None
  try:
   context=context or {'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='microseconds').replace('+00:00','Z'),'monotonic_seconds':time.monotonic(),'interval_seconds':None}
   with self._lock:
    captured=diagnostics.describe('monitor',cpu_busy=busy,available_mib=available,disk_free_bytes=free,disk_total_bytes=total,**context);self._last_sample=captured
   # Preserve valid numeric observations before any limit assertion. These
   # extrema include rejected samples; they are measurements, not PASS evidence.
   with self._lock:
    if type(available) is int and available>=0:self._mem_min=available if self._mem_min is None else min(self._mem_min,available)
    if type(free) is int and free>=0:self._disk_min=free if self._disk_min is None else min(self._disk_min,free)
    if type(busy) in (int,float) and math.isfinite(busy) and 0<=busy<=100:self._cpu_samples+=1;self._cpu_max=max(self._cpu_max,busy)
   require(type(available) is int and available>=3072,'RESOURCE_MEMORY_LIMIT');require(type(free) is int and type(total) is int and total>0 and free>max(15*1024**3,total*.1),'RESOURCE_DISK_LIMIT')
   if busy is not None:require(isinstance(busy,(int,float)) and math.isfinite(busy) and 0<=busy<90,'RESOURCE_CPU_LIMIT')
   require(isinstance(facts,list) and all(isinstance(f,dict) for f in facts),'RESOURCE_DOCKER_INVENTORY_UNKNOWN');projected=[{k:v for k,v in f.items() if k!='oomKilled'} for f in facts];require(all(c in projected for c in self.foreign),'RESOURCE_FOREIGN_CHANGED')
   active=[];pg=[]
   for f in facts:
    if f.get('project') not in [self.h.ROOT.name,self.h.TARGET.name]:continue
    require(type(f.get('running')) is bool and type(f.get('oomKilled')) is bool,'RESOURCE_OWN_STATE_UNKNOWN')
    if not f['running'] and not f['oomKilled']:continue
    r=self.reference_for(f);require(r is not None,'RESOURCE_OWN_REFERENCE_REQUIRED');require(all(f.get(k)==r.get(q) for k,q in [('id','containerId'),('project','project'),('service','service'),('ownerId','ownerId'),('imageRef','imageRef'),('nanoCpus','nanoCpus'),('memory','memory')]) and (not r.get('jobId') or r['jobId']==f.get('jobId')),'RESOURCE_OWN_REFERENCE_CHANGED');self._own.add(f['id']);require(not f['oomKilled'],'RESOURCE_OWN_OOM_KILLED')
    if f['running']:
     require(f.get('status')=='running' and type(f.get('pid')) is int and f['pid']>0,'RESOURCE_OWN_STATE_UNKNOWN');active.append(f)
     if f['service']=='postgres':pg.append(f)
   with self._lock:
    captured['ownConfigured']={'nanoCpus':sum(c['nanoCpus'] for c in active),'memoryLimitBytes':sum(c['memory'] for c in active),'postgresCount':len(pg),'activeContainers':len(active),'scope':'Configured limits of active exact Root-referenced own CIDs; not measured CPU or RSS'}
    captured['thresholds'].update(nanoCpusUpperInclusive=1_000_000_000,memoryLimitBytesUpperInclusive=2048*1024**2,postgresUpperInclusive=1,postgresTcpUpperInclusive=60)
   require(len(pg)<=1,'RESOURCE_MULTIPLE_POSTGRES');require(sum(c['nanoCpus'] for c in active)<=1_000_000_000 and sum(c['memory'] for c in active)<=2048*1024**2,'RESOURCE_AGGREGATE_LIMIT')
   tcp=self.tcp_or_positive_stop(pg[0]) if pg else 0
   with self._lock:captured['ownMeasured']={'postgresTcpEstablished':tcp if type(tcp) is int and tcp>=0 else None,'scope':'Exact authorized PostgreSQL PID network namespace; TCP established server sockets only; no SQL or UNIX count'}
   require(tcp is None or type(tcp) is int and 0<=tcp<=60,'RESOURCE_POSTGRES_TCP_LIMIT')
   with self._lock:
    self._tcp_max=max(self._tcp_max,tcp) if tcp is not None else self._tcp_max
  except BaseException as e:
   self.fail(str(e) if isinstance(e,AssertionError) and re.fullmatch(r'RESOURCE_[A-Z_]{1,80}',str(e)) else 'RESOURCE_OBSERVATION_UNVERIFIED',captured)
