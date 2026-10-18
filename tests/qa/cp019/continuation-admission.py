"""Passive v2 admission primitive; no adoption or execution on import.

Root owns a single O_EXCL claim in the existing private master. An uncertain
claim consumes the attempt and is KEEP. There is deliberately no resume/load
constructor. Caller still owes publication, consumer and Environment Gates.
"""
import copy,hashlib,json,os,pathlib,re,stat

ROOT=pathlib.Path('/opt/mecanet-qa-p1l3-r03');_CREATED=object()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def sha(value):return hashlib.sha256(value).hexdigest()
def check(ok,code):
 if not ok:raise AssertionError(code)
def root_identity():
 pid=os.getpid();raw=pathlib.Path('/proc',str(pid),'stat').read_text();end=raw.rfind(')');parts=raw[end+2:].split();check(end>0 and raw.split(' ',1)[0]==str(pid) and len(parts)>=20 and parts[19].isdigit(),'ADMISSION_ROOT_IDENTITY');return {'pid':pid,'procStart':parts[19]}
def uptime():return float(pathlib.Path('/proc/uptime').read_text().split()[0])
def syncdir(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)

class RootClaimStore:
 """The fixed immutable claim is never removed, replaced or adopted."""
 def __init__(self):
  self.path=ROOT/'master/continuations/v2/claim.json';p=ROOT/'master';s=p.lstat();check(os.geteuid()==0 and p.resolve()==p and stat.S_ISDIR(s.st_mode) and s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o700,'ADMISSION_PRIVATE_MASTER')
 def read(self):
  p=self.path;s=p.lstat();check(p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o400 and s.st_nlink==1 and 2<=s.st_size<=262144,'ADMISSION_CLAIM_CUSTODY');fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
  try:
   before=os.fstat(fd);keys=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns,x.st_ctime_ns);check(keys(s)==keys(before),'ADMISSION_CLAIM_CHANGED');raw=os.read(fd,262145);check(len(raw)==before.st_size and keys(before)==keys(os.fstat(fd))==keys(p.lstat()),'ADMISSION_CLAIM_CHANGED');return json.loads(raw)
  finally:os.close(fd)
 def compare_create(self,value):
  # A partial file after any exception remains proof of a consumed attempt.
  check(all(not p.exists() and not p.is_symlink() for p in [ROOT/'master/continuations',ROOT/'budget/continuations']),'ADMISSION_PRIOR_PARTIAL_ATTEMPT')
  raw=canonical(value);check(len(raw)<=262144,'ADMISSION_CLAIM_SIZE');directory=ROOT/'master/continuations';directory.mkdir(mode=0o700);syncdir(directory.parent);self.path.parent.mkdir(mode=0o700);syncdir(directory);fd=os.open(self.path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
  with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fchmod(f.fileno(),0o400);os.fsync(f.fileno())
  syncdir(self.path.parent);check(canonical(self.read())==raw,'ADMISSION_DURABLE_READBACK')

class Claim:
 def __init__(self,token,model,context,store,body,identity):
  check(token is _CREATED,'ADMISSION_NO_ADOPTION');self.model=model;self.context=copy.deepcopy(context);self.store=store;self.body=copy.deepcopy(body);self.identity=identity;self.failure=None;self.closed=False;self.last_boundary=None;self.effect_ready=False
 def fail(self,code):
  self.failure=self.failure or code;self.closed=True;self.effect_ready=False
 def check_live(self):
  try:
   check(not self.closed and self.failure is None and self.identity()==self.body['rootLifetime'],'ADMISSION_ROOT_ENDED');check(canonical(self.store.read())==canonical(self.body),'ADMISSION_SEAL_CHANGED');return True
  except BaseException:self.fail('ADMISSION_UNCERTAIN');raise
 def bind_budget(self,h,broker_module,store):
  """After publication of exactly the reserved state; never creates a ledger."""
  try:
   self.check_live();check(h.CONTINUATION_CONTEXT is None and h.CONTINUATION_BROKER is None and h.CONTINUATION_EFFECT_RECEIPT is None,'ADMISSION_BIND_ONCE');check(canonical(store.read())==canonical(self.body['initialState']),'ADMISSION_INITIAL_STATE_NOT_EXACT')
   h.configure_continuation(self.context);broker=broker_module.Broker(self.model,self.context,store,self.body['initialState'],h.uptime,lambda record,peer:broker_module.verify_docker_peer(h,record,peer),self.body['rootLifetime'])
   h.CONTINUATION_BROKER=broker;h.CONTINUATION_EFFECT_RECEIPT=self;return broker
  except BaseException:
   self.fail('ADMISSION_BIND_UNCERTAIN')
   if h.CONTINUATION_BROKER is not None:h.CONTINUATION_BROKER.fail('ADMISSION_BIND_UNCERTAIN')
   raise
 def enable_effects(self,h,transport):
  try:
   self.check_live();check(h.CONTINUATION_EFFECT_RECEIPT is self and h.CONTINUATION_BROKER is transport.broker and transport.path==str(ROOT/'budget/continuations/v2/counter.sock') and transport.socket is not None and transport.socket.getsockname()==transport.path and transport.thread is not None and transport.thread.is_alive() and not transport.stop_event.is_set(),'ADMISSION_TRANSPORT_NOT_READY');h.CONTINUATION_BROKER.root_snapshot();self.effect_ready=True
  except BaseException:
   self.fail('ADMISSION_TRANSPORT_UNCERTAIN')
   if h.CONTINUATION_BROKER is not None:h.CONTINUATION_BROKER.fail('ADMISSION_TRANSPORT_UNCERTAIN')
   raise
 def boundary(self,h,label,evidence,outcome,write_immutable):
  """One durable receipt per frontier, not one artifact per SQL statement.

  evidence is an already verified bounded result; a receipt hashes it without
  claiming SQL/FIN from labels or elapsed time. New Root cannot adopt a chain.
  """
  try:
   self.check_live();check(re.fullmatch('[a-z][a-z0-9-]{0,63}',label or '') and outcome in ['PASS','FAIL','UNKNOWN'] and isinstance(evidence,dict),'ADMISSION_BOUNDARY_INPUT');h.ledger_charge('artifactFiles');state=h.CONTINUATION_BROKER.root_snapshot();self.model.remaining(state,*[self.context[k] for k in ['baseLedger','baseLedgerHash','admission']],h.HOST_CASE,h.uptime());body={'schema':'cp024-root-frontier-v1','admissionHash':self.context['admissionHash'],'rootClaimHash':sha(canonical(self.body)),'rootLifetime':self.body['rootLifetime'],'previousReceiptHash':self.last_boundary,'label':label,'outcome':outcome,'evidenceHash':sha(canonical(evidence)),'ledgerSequence':state['sequence'],'ledgerHash':sha(canonical(state)),'ledger':state};raw=canonical(body);check(len(raw)<=262144,'ADMISSION_FRONTIER_SIZE');returned=write_immutable(label,raw);check(returned==sha(raw),'ADMISSION_FRONTIER_READBACK');self.last_boundary=returned;return body
  except BaseException:
   self.fail('ADMISSION_FRONTIER_UNCERTAIN')
   if h.CONTINUATION_BROKER is not None:h.CONTINUATION_BROKER.fail('ADMISSION_FRONTIER_UNCERTAIN')
   raise

def create_claim(model,context,store,gate_pins,identity=root_identity,clock=uptime,publication=None):
 """First own effect reserves the claim itself, using already approved clocks.

 gate_pins are Root's previously validated evidence references, not assertions
 that a hash alone proves a gate. The consuming controller must verify bodies.
 """
 check(isinstance(context,dict) and set(context)=={'baseLedger','baseLedgerHash','admission','admissionHash'},'ADMISSION_CONTEXT');base=model.validate_base(context['baseLedger'],context['baseLedgerHash']);model.validate_admission(context['admission'],base,context['baseLedgerHash']);check(context['admissionHash']==sha(canonical(context['admission'])),'ADMISSION_HASH');check(isinstance(gate_pins,dict) and set(gate_pins)=={'quality','independentReview','transport','environment','publicationProjection'} and all(isinstance(v,str) and re.fullmatch('[0-9a-f]{64}',v) for v in gate_pins.values()),'ADMISSION_GATE_PINS')
 costs={'host-bootstrap':3} if publication is None else publication.get('costs');check(isinstance(costs,dict) and set(costs)<={'host-bootstrap','host-stage','host-config-source','host-config-target'} and type(costs.get('host-bootstrap')) is int and costs['host-bootstrap']>=3 and all(type(v) is int and v>0 for v in costs.values()),'ADMISSION_PUBLICATION_COSTS')
 life=identity();check(set(life)=={'pid','procStart'} and type(life['pid']) is int and life['pid']>0 and isinstance(life['procStart'],str) and life['procStart'].isdigit(),'ADMISSION_ROOT_IDENTITY');state=model.initial(context['baseLedger'],context['baseLedgerHash'],context['admission'])
 for scenario,amount in sorted(costs.items()):state=model.update(state,context['baseLedger'],context['baseLedgerHash'],context['admission'],scenario,context['admission']['startedUptime'],kind='artifactFiles',amount=amount)
 body={'schema':'cp024-root-exclusive-claim-v1','attempt':'v2','rootLifetime':life,'admissionHash':context['admissionHash'],'gateEvidencePins':copy.deepcopy(gate_pins),'publicationPlanHash':None if publication is None else sha(canonical(publication)),'initialState':state,'restart':'FORBIDDEN / uncertain attempts KEEP; no new Root adoption'}
 model.remaining(state,context['baseLedger'],context['baseLedgerHash'],context['admission'],'host-bootstrap',clock());model.validate_creation_upper(state);store.compare_create(body);check(canonical(store.read())==canonical(body),'ADMISSION_DURABLE_READBACK');check(identity()==life,'ADMISSION_ROOT_CHANGED');return Claim(_CREATED,model,context,store,body,identity)
