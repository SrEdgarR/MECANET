"""SC016 own Root counter transport; one writer in the existing controller.

No import effects. No TCP, SQL, process creation, resource adoption or retries.
The caller authenticates startup seal, Root lifetime and CREATED client CIDs.
"""
import copy,datetime,hashlib,json,os,pathlib,secrets,socket,stat,struct,threading,time,re

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def check(ok,label):
 if not ok:raise AssertionError(label)
def syncdir(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)

class RootFileStore:
 """Only the existing Root process writes; app mounts must be read-only."""
 def __init__(self,path):
  self.path=pathlib.Path(path);check(os.geteuid()==0 and self.path==pathlib.Path('/opt/mecanet-qa-p1l3-r03/budget/continuations/v2/ledger.json'),'BROKER_ROOT_STORE_SCOPE')
 def read(self):
  p=self.path;s=p.lstat();check(p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_uid==999 and stat.S_IMODE(s.st_mode)==0o600 and s.st_nlink==1 and 2<=s.st_size<=262144,'BROKER_LEDGER_CUSTODY')
  fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
  try:
   before=os.fstat(fd);check((s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns)==(before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns),'BROKER_LEDGER_CHANGED');raw=os.read(fd,262145);after=os.fstat(fd);named=p.lstat();check(len(raw)==s.st_size and (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)==(named.st_dev,named.st_ino,named.st_size,named.st_mtime_ns),'BROKER_LEDGER_CHANGED');return json.loads(raw)
  finally:os.close(fd)
 def persist(self,value):
  raw=canonical(value);check(2<=len(raw)<=262144,'BROKER_LEDGER_SIZE');parent=self.path.parent;check(parent.resolve()==parent and not parent.is_symlink(),'BROKER_LEDGER_PARENT');tmp=parent/('.root-broker-'+secrets.token_hex(12)+'.tmp');fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  try:
   with os.fdopen(fd,'wb') as f:f.write(raw);os.fchown(f.fileno(),999,999);os.fchmod(f.fileno(),0o600);os.fsync(f.fileno())
   os.replace(tmp,self.path);syncdir(parent);check(canonical(self.read())==raw,'BROKER_DURABLE_READBACK')
  finally:
   if tmp.exists():tmp.unlink()

class Broker:
 def __init__(self,model,context,store,initial_seal,clock,verify_client,root_lifetime,root_identity=None):
  self.model=model;self.context=copy.deepcopy(context);self.store=store;self.clock=clock;self.verify_client=verify_client;self.lock=threading.RLock();self.clients={};self.failure=None;self.closed=False;self.root_pid=os.getpid();self.root_identity=root_identity or (lambda:{'pid':os.getpid(),'procStart':proc_start(os.getpid())});self.root_lifetime=copy.deepcopy(root_lifetime);check(self.root_lifetime==self.root_identity(),'BROKER_ROOT_LIFETIME_MISMATCH')
  actual=store.read();check(canonical(actual)==canonical(initial_seal),'BROKER_INITIAL_SEAL_NOT_EXACT');self.validate(actual);self.state=copy.deepcopy(actual)
 def args(self):c=self.context;return c['baseLedger'],c['baseLedgerHash'],c['admission']
 def validate(self,state):return self.model.validate(state,*self.args(),self.clock())
 def guard(self):check(not self.closed and self.failure is None and os.getpid()==self.root_pid and self.root_identity()==self.root_lifetime,'BROKER_ROOT_LIFETIME_ENDED')
 def root_snapshot(self):
  with self.lock:return copy.deepcopy(self.current())
 def fail(self,reason):
  with self.lock:
   if self.failure is None:self.failure=reason
 def current(self):
  self.guard();state=self.store.read();self.validate(state)
  # Exact positive Root memory catches rollback of any delta, including one
  # above v1's floor. No new Root may adopt a ledger after this process ends.
  check(canonical(state)==canonical(self.state),'BROKER_LEDGER_MEMORY_MISMATCH');return state
 def persist_charged(self,previous,after,scenario):
  # SC013 counts real creations, including the counter's own O_EXCL temp.
  # Fold that charge into the SAME transition: no recursive persist/sequence,
  # and no temporary is opened if its case or accumulated cap is exhausted.
  self.model.remaining(after,*self.args(),scenario,self.clock());check(scenario in after['scenarios'],'BROKER_PERSIST_CASE_REQUIRED')
  check(all(after['scenarios'].get(name)==value for name,value in previous['scenarios'].items() if name!=scenario) and set(after['scenarios'])-set(previous['scenarios'])<=set([scenario]),'BROKER_PERSIST_CASE_MISMATCH')
  result=copy.deepcopy(after);case=result['scenarios'][scenario]
  check(result['total']['artifactFiles']+1<=self.model.GLOBAL['artifactFiles'] and case['total']['artifactFiles']+1<=self.model.CASE['artifactFiles'],'CONTINUATION_OVERFLOW')
  result['total']['artifactFiles']+=1;case['total']['artifactFiles']+=1;self.validate(result);self.model.validate_progress(previous,result);check(result['sequence']==previous['sequence']+1,'BROKER_ROOT_SEQUENCE');self.store.persist(result);check(canonical(self.store.read())==canonical(result),'BROKER_DURABLE_READBACK');self.state=copy.deepcopy(result);return result
 def register(self,client_id,record):
  with self.lock:
   self.guard();check(isinstance(client_id,str) and len(client_id)<=64 and client_id not in self.clients and len(self.clients)<256,'BROKER_CLIENT_COLLISION')
   check(isinstance(record,dict) and set(record)=={'containerId','project','service','ownerId','uid','scope','case','allowedEnterCases'} and record['uid'] in [0,999] and record['scope'] in ['source-window','target-window'] and isinstance(record['allowedEnterCases'],list),'BROKER_CLIENT_REFERENCE')
   self.clients[client_id]={'record':copy.deepcopy(record),'peer':None,'enrolled':False,'ended':False,'next':1}
 def request(self,client_id,peer,request):
  with self.lock:
   try:
    self.guard();check(client_id in self.clients,'BROKER_CLIENT_UNREGISTERED');c=self.clients[client_id];check(not c['ended'],'BROKER_CLIENT_ENDED')
    check(isinstance(request,dict) and set(request)=={'schema','clientId','admissionHash','sequence','method','scenario','name','kind','amount'} and request['schema']=='cp024-budget-rpc-v1' and request['clientId']==client_id and request['admissionHash']==self.context['admissionHash'] and type(request['sequence']) is int and request['sequence']==c['next'],'BROKER_REQUEST_IDENTITY')
    record=c['record'];check(request['scenario'] in [record['case'],record['scope']],'BROKER_SCENARIO_ALIAS')
    if c['peer'] is None:
     token=self.verify_client(record,peer);check(request['method']=='enroll' and token is not False and token is not None,'BROKER_PEER_IDENTITY');c['peer']=peer;c['scenario']=request['scenario'];c['pidToken']=token
    else:check(c['peer']==peer and request['scenario']==c['scenario'] and c['enrolled'],'BROKER_PEER_CHANGED')
    if isinstance(c['pidToken'],str):check(proc_start(peer[0])==c['pidToken'],'BROKER_PEER_PID_REUSED')
    state=self.current();method=request['method']
    if method=='enroll':check(not c['enrolled'] and request['name'] is None and request['kind'] is None and request['amount'] is None,'BROKER_ENROLL_ONCE');c['enrolled']=True
    elif method=='snapshot':check(request['name'] is None and request['kind'] is None and request['amount'] is None,'BROKER_SNAPSHOT_ARGS')
    else:
     scenario=c['scenario'];name=state['activeScenarios'][scenario] if scenario in ['source-window','target-window'] else scenario
     if method=='enter':
      check(scenario==record['scope'] and request['name'] in record['allowedEnterCases'] and request['kind'] is None and request['amount'] is None,'BROKER_ENTER_DENIED');after=self.model.update(state,*self.args(),request['name'],self.clock(),scope=scenario)
     else:
      check(method=='charge' and request['name'] is None,'BROKER_METHOD');after=self.model.update(state,*self.args(),name,self.clock(),kind=request['kind'],amount=request['amount'])
     state=self.persist_charged(state,after,request['name'] if method=='enter' else name)
    c['next']+=1;return {'schema':'cp024-budget-ack-v1','admissionHash':self.context['admissionHash'],'clientId':client_id,'sequence':request['sequence'],'rootPid':self.root_pid,'state':copy.deepcopy(state)}
   except BaseException:
    self.fail('BROKER_UNCERTAIN_OR_REJECTED');raise
 def root_update(self,mutator,*,scenario):
  with self.lock:
   try:
    state=self.current();after=mutator(copy.deepcopy(state));self.validate(after);return copy.deepcopy(self.persist_charged(state,after,scenario))
   except BaseException:self.fail('BROKER_ROOT_UNCERTAIN');raise
 def ended(self,client_id,peer):
  with self.lock:
   if client_id in self.clients and self.clients[client_id]['peer']==peer:self.clients[client_id]['ended']=True
 def stop(self):
  with self.lock:self.closed=True

class UnixServer:
 """Bounded persistent connections; SO_PEERCRED is required physically."""
 def __init__(self,broker,path,peer_credentials=None):
  self.broker=broker;self.path=str(path);self.peer_credentials=peer_credentials or self.linux_peer;self.stop_event=threading.Event();self.socket=None;self.thread=None;self.handlers=[];self.connections=set();self.lock=threading.Lock();self.changed=threading.Condition(self.lock)
 @staticmethod
 def linux_peer(connection):return struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,struct.calcsize('3i')))
 def start(self):
  check(self.socket is None and not pathlib.Path(self.path).exists() and len(os.fsencode(self.path))<104,'BROKER_SOCKET_EXISTS_OR_PATH')
  self.socket=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.socket.bind(self.path);os.chmod(self.path,0o600)
  if hasattr(os,'geteuid') and os.geteuid()==0:os.chown(self.path,999,999)
  self.socket.listen(8);self.socket.settimeout(.2);self.thread=threading.Thread(target=self.accept,name='cp024-own-budget',daemon=True);self.thread.start()
 def accept(self):
  while not self.stop_event.is_set():
   try:connection,_=self.socket.accept()
   except socket.timeout:continue
   except OSError:
    if not self.stop_event.is_set():self.broker.fail('BROKER_ACCEPT_FAILED')
    break
   with self.lock:
    if len(self.connections)>=8:connection.close();self.broker.fail('BROKER_CONNECTION_LIMIT');continue
    self.connections.add(connection)
   thread=threading.Thread(target=self.handle,args=(connection,),daemon=True);self.handlers.append(thread);thread.start()
 def handle(self,connection):
  client_id=None;peer=None;pending=b''
  try:
   peer=self.peer_credentials(connection);check(isinstance(peer,tuple) and len(peer)==3 and all(type(v) is int for v in peer),'BROKER_PEER_UNKNOWN');connection.settimeout(.2)
   while not self.stop_event.is_set():
    try:chunk=connection.recv(2048)
    except socket.timeout:continue
    if not chunk:check(not pending,'BROKER_PARTIAL_FRAME');break
    pending+=chunk;check(len(pending)<=4096,'BROKER_FRAME_LIMIT')
    while b'\n' in pending:
     line,pending=pending.split(b'\n',1);request=json.loads(line);name=request.get('clientId');check(client_id is None or client_id==name,'BROKER_CONNECTION_CLIENT_CHANGED');client_id=name;reply=self.broker.request(client_id,peer,request);raw=canonical(reply);check(len(raw)<=262144,'BROKER_ACK_LIMIT');connection.sendall(raw+b'\n')
  except BaseException:
   if not self.stop_event.is_set():self.broker.fail('BROKER_TRANSPORT_OR_REQUEST_UNCERTAIN')
  finally:
   if client_id is not None:self.broker.ended(client_id,peer)
   with self.changed:self.connections.discard(connection);self.changed.notify_all()
   connection.close()
 def clients_finished(self,maximum=2):
  # Wait only for a positively observed EOF, never interpret a timeout as FIN.
  check(type(maximum) in [int,float] and 0<maximum<=30,'BROKER_FIN_BOUND');deadline=time.monotonic()+maximum
  with self.changed:
   while self.connections:
    left=deadline-time.monotonic()
    if left<=0:return False
    self.changed.wait(left)
   return True
 def stop(self):
  with self.lock:
   live=len(self.connections)
  if live:self.broker.fail('BROKER_STOP_WITH_LIVE_CLIENTS')
  self.stop_event.set();self.broker.stop()
  if self.socket:self.socket.close()
  with self.lock:
   for connection in self.connections:
    try:connection.shutdown(socket.SHUT_RDWR)
    except OSError:pass
  threads=([self.thread] if self.thread else [])+self.handlers
  for thread in threads:thread.join(2)
  return {'serverThreadEnded':all(not thread.is_alive() for thread in threads),'clientFIN':'PASS' if live==0 else 'NOT VERIFIED','failure':self.broker.failure,'socket':'KEEP / bound identity; never unlinked by age'}

def proc_start(pid):
 check(type(pid) is int and pid>0,'BROKER_PEER_PID');raw=pathlib.Path('/proc',str(pid),'stat').read_text();end=raw.rfind(')');check(end>0 and raw.split(' ',1)[0]==str(pid),'BROKER_PEER_PID');parts=raw[end+2:].split();check(len(parts)>=20 and parts[19].isdigit(),'BROKER_PEER_PID');return parts[19]

def verify_docker_peer(h,record,peer):
 """SO_PEERCRED + exact live PID + existing Root CREATED reference."""
 pid,uid,gid=peer;check(uid==record['uid'] and gid==uid and uid in [0,999],'BROKER_PEER_UID');actual=h.inspect_container(record['containerId']);check(actual['running'] is True and actual['status']=='running' and actual['pid']==pid and all(actual[k]==record[k] for k in ['project','service','ownerId']),'BROKER_PEER_CID_PID')
 owners=h.expected_owners();variant=actual['project']==h.TARGET.name and (h.TARGET/'variants').exists()
 if variant:
  refs=h.variant_bridge().variant_references(h);matches=[r for r in refs if r.get('containerId')==actual['id']]
  if matches:check(len(matches)==1 and h.variant_bridge().matches(actual,matches[0],h.PROFILES),'BROKER_VARIANT_REFERENCE');return proc_start(pid)
 check(h.owned_identity(actual,owners),'BROKER_PEER_PROFILE')
 if actual['service'] in ['api1','api2','worker']:
  if actual['project']==h.ROOT.name:h.read_source_service_reference(actual)
  else:h.verify_main_target_references([actual])
 else:
  job=actual.get('jobId');check(isinstance(job,str) and re.fullmatch('[0-9a-f-]{36}',job),'BROKER_JOB_REFERENCE');root=h.ROOT if actual['project']==h.ROOT.name else h.TARGET;ref,rh=h.target_bridge().read400(root/'evidence/jobs'/(job+'-created.json'),0);check(ref.get('schema')=='controller-job-created-v1' and all(ref[k]==actual[v] for k,v in [('containerId','id'),('project','project'),('service','service'),('ownerId','ownerId'),('jobId','jobId')]),'BROKER_JOB_REFERENCE')
 return proc_start(pid)
