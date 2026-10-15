"""Closed r03 orchestration. Imported passively; effects require an explicit port.

The port implements existing Root controllers and positive evidence checks. This
sequence neither invents budget cases nor supplies FIN, SQL or acceptance proof.
An exception terminates the sequence; the outer runner must perform exact-CID
emergency STOP/KEEP in finally, independently of remaining time and quotas.
"""
KINDS=('roster-empty','allclosed','commit-interrupted','promote-prefix','a5-restrictions')

def public_result(value):
 """Root event bodies may contain authority plans or credentials: hash only."""
 import hashlib,json
 raw=json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
 assert len(raw)<=4*1024**2,'CONTROLLER_RESULT_SIZE'
 return {'resultHash':hashlib.sha256(raw).hexdigest(),'resultBody':'PRIVATE / OMITTED','acceptance':'NOT VERIFIED'}

def safe_finish(h,monitor,booted,step):
 """Start exact-CID cleanup before touching the monitor's shutdown path.

 Failure details are private. A monitor failure (including a malformed or
 zero-sample summary) never suppresses cleanup or becomes an execution PASS.
 """
 import re
 cleanup=None;summary=None;failure=None;should_cleanup=booted
 try:
  if not should_cleanup:
   try:should_cleanup=(h.ROOT/'owner.json').exists()
   except BaseException:should_cleanup=True;failure='CLEANUP_NOT_VERIFIED'
  if should_cleanup:
   try:
    cleanup=step('cleanup',h.cleanup)
    if not isinstance(cleanup,dict) or cleanup.get('result')!='PASS':failure='CLEANUP_NOT_VERIFIED'
   except BaseException:cleanup={'result':'FAIL','code':'CLEANUP_NOT_VERIFIED'};failure='CLEANUP_NOT_VERIFIED'
 finally:
  if monitor is not None:
   try:
    summary=monitor.stop()
    valid=isinstance(summary,dict) and summary.get('schema')=='cp021-resource-monitor-summary-v1' and summary.get('status') in ['PASS','FAIL'] and type(summary.get('failed')) is bool and type(summary.get('samples')) is int and summary['samples']>=1 and (summary.get('error') is None or isinstance(summary['error'],str) and re.fullmatch('[A-Z][A-Z0-9_]{1,70}',summary['error']))
    if not valid:raise ValueError('MONITOR_SUMMARY')
    if summary['status']!='PASS' or summary['failed'] or summary.get('error') is not None:failure=failure or 'RESOURCE_MONITOR_NOT_VERIFIED'
   except BaseException:summary={'schema':'cp021-resource-monitor-summary-v1','status':'FAIL','failed':True,'error':'RESOURCE_MONITOR_NOT_VERIFIED','samples':0};failure=failure or 'RESOURCE_MONITOR_NOT_VERIFIED'
  elif booted:failure=failure or 'RESOURCE_MONITOR_NOT_VERIFIED'
 return {'cleanup':cleanup,'resourceMonitor':summary,'failure':failure}

class RelayInput:
 """One bounded stdin reader, shared by phase gates and browser messages.

 The reader only frames input. EOF/abort/error are irreversible pre-effect
 guards; queued browser messages are consumed exclusively by the browser.
 """
 def __init__(self,stream):
  import queue,threading
  self.stream=stream;self.messages=queue.Queue(maxsize=16);self.failed=threading.Event();self.stopped=threading.Event();self.thread=None;self.error=None
 def fail(self,code):
  if not self.failed.is_set():self.error=code;self.failed.set()
 def start(self):
  import threading
  assert self.thread is None,'CONTROLLER_INPUT_ALREADY_STARTED';self.thread=threading.Thread(target=self.read,name='cp021-input',daemon=True);self.thread.start()
 def read(self):
  import json,queue
  try:
   while not self.stopped.is_set():
    line=self.stream.readline(8193)
    if not line:self.fail('CONTROLLER_INPUT_EOF');return
    if len(line)>8192 or not line.endswith('\n'):self.fail('CONTROLLER_INPUT_FRAME');return
    try:value=json.loads(line)
    except (ValueError,TypeError):self.fail('CONTROLLER_INPUT_FRAME');return
    if not isinstance(value,dict):self.fail('CONTROLLER_INPUT_FRAME');return
    if value.get('status')=='FAIL':self.fail('LOCAL_ABORT_REQUEST');return
    if value.get('type') not in ['cp020-browser-gate','cp020-browser-result']:self.fail('CONTROLLER_INPUT_FRAME');return
    try:self.messages.put_nowait(value)
    except queue.Full:self.fail('CONTROLLER_INPUT_OVERFLOW');return
  except BaseException:self.fail('CONTROLLER_INPUT_UNAVAILABLE')
 def check(self):
  if self.failed.is_set():raise AssertionError(self.error)
 def get(self,timeout):
  import queue,time
  assert 0<=timeout<=10,'CONTROLLER_INPUT_TIMEOUT';deadline=time.monotonic()+timeout
  while True:
   self.check()
   try:value=self.messages.get(timeout=min(.1,max(0,deadline-time.monotonic())));self.check();return value
   except queue.Empty:
    if time.monotonic()>=deadline:self.check();return None
 def stop(self):
  # A blocked stdin reader is a daemon, not a process/SQL FIN claim. Closing
  # somebody else's input stream or waiting for it must never delay cleanup.
  self.stopped.set()

def recover(p,kind,finish=True):
 p.pg_start(kind);p.assemble(kind)
 for phase in ['begin-enroll','rotate','canary','configure','clock-plan']:
  p.phase(kind,phase)
  if kind=='main' and phase=='rotate':p.credentials()
 p.runtime_configs(kind);p.runtime(kind,'worker');p.phase(kind,'post-worker-verify')
 if finish:
  p.phase(kind,'promotion');p.phase(kind,'activation');p.runtime(kind,'business')

def abort(p,kind):
 for phase in ['abort-close','abort-local','abort-finish']:p.phase(kind,phase)

def execute(p):
 """No retry/reset/fallback. All phases share their original registered clocks."""
 p.preflight();p.bootstrap();p.stage();p.material();p.configs();p.source_pg_start()
 for stage in ['foundation','writers','correctives']:p.prepare(stage)
 p.source_resource();p.source_phase('source-close-b');p.schema('pre')
 for phase in ['source-migrate-a','source-migrate-b','source-migrate-central','source-initialize-a','source-initialize-b','source-initialize-control']:p.source_phase(phase)
 p.schema('post');p.source_phase('source-clock-plan');p.source_live()
 for phase in ['source-close-admission','source-close-restore','source-capture']:p.source_final(phase)
 p.source_pg_off('precopy');p.source_copy_checkpoint();p.target_copy()
 p.source_canary_start();p.source_final('source-closed-canary');p.source_final('source-closed-canary');p.source_pg_off('postcanary')
 # The Source canary advances its journal. Seal the final lineage only after its
 # positive second shutdown; all five copies precede any Target PostgreSQL.
 for kind in KINDS:
  p.prepare_variant(kind);p.copy_variant(kind)
  if kind in ['allclosed','a5-restrictions']:p.select_close(kind)
  if kind=='a5-restrictions':p.select_a5()
 recover(p,'main')
 for mode in ['target-history','target-write','target-negatives']:p.acceptance(mode)
 p.browser();p.browser_postcheck();p.a5('main','mismatches')
 p.stop('main');p.end('main');p.worker_restart();p.stop('main');p.end('main');abort(p,'main');p.main_pg_off()

 kind='roster-empty';p.pg_start(kind);p.readiness_inputs(kind);p.readiness(kind,'prepare-empty')
 p.empty_runtime(kind,'create');p.empty_runtime(kind,'start-business');p.readiness(kind,'probe-unready')
 p.empty_runtime(kind,'start-worker');p.readiness(kind,'complete-empty');p.readiness(kind,'probe-ready')
 p.readiness(kind,'close-empty');p.empty_stop(kind);p.readiness(kind,'end-empty');p.pg_stop(kind)

 kind='allclosed';recover(p,kind);p.readiness_inputs(kind);p.http_plan(kind)
 p.readiness(kind,'final-close');p.readiness(kind,'probe-ready');p.http_inventory(kind);p.stop(kind);p.end(kind);p.pg_stop(kind)

 kind='commit-interrupted';recover(p,kind);p.http_plan(kind);p.http_inventory(kind)
 p.stop(kind);p.end(kind);abort(p,kind);p.pg_stop(kind)

 kind='promote-prefix';recover(p,kind,finish=False);p.prefix_prepare();p.phase(kind,'promote-fault')
 p.runtime(kind,'business-prefix');p.http_plan(kind);p.promotion_http();p.http_inventory(kind)
 p.stop(kind);p.end(kind);abort(p,kind);p.pg_stop(kind)

 kind='a5-restrictions';recover(p,kind);p.restriction_plan();p.http_plan(kind)
 for mode in ['grant','membership','identity']:p.a5(kind,mode)
 p.readiness_inputs(kind);p.readiness(kind,'final-close');p.http_inventory(kind)
 p.stop(kind);p.end(kind);p.pg_stop(kind)
 # Intentional malformed links stay KEEP in negative fixtures. No provider
 # strict Target traversal may follow these final copy-negative effects.
 p.journal_negatives();p.copy_negatives()

class HostPort:
 """Narrow adapter: one explicit, guarded Root step per action; no SQL in Python."""
 def __init__(self,h,step,browser,browser_postcheck,archive='/tmp/mecanet-cp022-artifact.tar'):
  self.h=h;self.step=step;self.browser_call=browser;self.post_call=browser_postcheck;self.archive=archive
 def perform(self,name,fn):return self.step(name,fn)
 def view(self,kind):return self.h if kind=='main' else self.h.variant_bridge().VariantHost(self.h,kind)
 def preflight(self):return self.perform('preflight',self.h.preflight)
 def bootstrap(self):return self.perform('bootstrap',self.h.bootstrap)
 def stage(self):return self.perform('stage',lambda:self.h.stage(self.archive))
 def material(self):return self.perform('material',self.h.material)
 def configs(self):return self.perform('configs',self.h.configs)
 def source_pg_start(self):return self.perform('source-pg-start',self.h.pg_start)
 def prepare(self,stage):return self.perform('prepare-'+stage,lambda:self.h.prepare(stage))
 def source_resource(self):return self.perform('source-resource',self.h.source_resource)
 def source_phase(self,phase):
  self.perform(phase+'-config',lambda:self.h.source_config(phase,'select'));return self.perform(phase,lambda:self.h.source_phase(phase))
 def schema(self,mode):return self.perform('schema-'+mode,lambda:self.h.probes_bridge().schema_probe(self.h,mode))
 def source_live(self):
  self.perform('source-clock-ack-config',lambda:self.h.source_config('source-clock-ack','select'));return self.perform('source-live',self.h.source_live)
 def source_final(self,phase):return self.perform(phase,lambda:self.h.source_final(phase))
 def source_pg_off(self,phase):return self.perform('source-off-'+phase,lambda:self.h.source_pg_off(phase))
 def source_copy_checkpoint(self):return self.perform('source-copy-checkpoint',self.h.source_copy_checkpoint)
 def target_copy(self):return self.perform('target-copy',lambda:self.h.target_dispatch('target-copy',[]))
 def source_canary_start(self):return self.perform('source-canary-start',self.h.source_pg_canary_start)
 def prepare_variant(self,kind):return self.perform(kind+'-custody',lambda:self.h.variant_bridge().prepare(self.h,kind))
 def copy_variant(self,kind):return self.perform(kind+'-copy',lambda:self.h.variant_bridge().copy_variant(self.h,kind))
 def select_close(self,kind):return self.perform(kind+'-close-choice',lambda:self.h.readiness_bridge().select_close_id(self.h,kind))
 def select_a5(self):return self.perform('a5-choices',lambda:self.h.http_bridge().select_a5_ids(self.h))
 def pg_start(self,kind):return self.perform(kind+'-pg-start',lambda:self.h.target_bridge().target_pg_start(self.view(kind)))
 def pg_stop(self,kind):return self.perform(kind+'-pg-stop',lambda:self.h.variant_bridge().stop_pg(self.h,kind))
 def assemble(self,kind):return self.perform(kind+'-prepare',lambda:self.h.target_bridge().target_prepare(self.view(kind)))
 def phase(self,kind,phase):return self.perform(kind+'-'+phase,lambda:self.h.target_bridge().phase(self.view(kind),phase))
 def credentials(self):return self.perform('credential-probe',lambda:self.h.probes_bridge().credential_probe(self.h))
 def runtime_configs(self,kind):return self.perform(kind+'-runtime-configs',lambda:self.h.target_bridge().phase(self.view(kind),'clock-plan','configs'))
 def runtime(self,kind,mode):return self.perform(kind+'-runtime-'+mode,lambda:self.h.target_bridge().runtime_start(self.view(kind),mode))
 def acceptance(self,mode):return self.perform(mode,lambda:self.h.target_dispatch('target-acceptance',[mode]))
 def browser(self):return self.perform('browser',self.browser_call)
 def browser_postcheck(self):return self.perform('browser-postcheck',self.post_call)
 def a5(self,kind,mode):return self.perform(kind+'-a5-'+mode,lambda:self.h.http_bridge().run_a5(self.h,kind,mode))
 def stop(self,kind):return self.perform(kind+'-stop',lambda:self.h.target_bridge().stop_runtime(self.view(kind)))
 def end(self,kind):return self.perform(kind+'-end',lambda:self.h.target_bridge().target_end(self.view(kind)))
 def worker_restart(self):return self.perform('main-worker-restart',lambda:self.h.target_dispatch('target-worker-restart',[]))
 def main_pg_off(self):return self.perform('main-pg-off',lambda:self.h.cold_bridge().stop_main_pg(self.h))
 def readiness_inputs(self,kind):return self.perform(kind+'-readiness-inputs',lambda:self.h.readiness_bridge().prepare_inputs(self.h,kind))
 def readiness(self,kind,action):return self.perform(kind+'-'+action,lambda:self.h.readiness_bridge().run(self.h,kind,action))
 def empty_runtime(self,kind,action):
  assert kind=='roster-empty','CONTROLLER_EMPTY_SCOPE';return self.perform(kind+'-'+action,lambda:self.h.cold_bridge().empty_runtime(self.h,action))
 def empty_stop(self,kind):return self.empty_runtime(kind,'stop')
 def http_plan(self,kind):return self.perform(kind+'-http-plan',lambda:self.h.http_bridge().publish_http_plan(self.h,kind))
 def http_inventory(self,kind):return self.perform(kind+'-http-inventory',lambda:self.h.http_bridge().publish_http_inventory(self.h,kind))
 def prefix_prepare(self):return self.perform('prefix-prepare',lambda:self.h.probes_bridge().prefix_prepare(self.view('promote-prefix')))
 def promotion_http(self):return self.perform('promotion-http',lambda:self.h.http_bridge().run_promotion(self.h))
 def restriction_plan(self):return self.perform('a5-restriction-plan',lambda:self.h.http_bridge().publish_restriction_plan(self.h))
 def journal_negatives(self):return self.perform('journal-negatives',self.h.journal_negatives)
 def copy_negatives(self):return self.perform('copy-negatives',self.h.copy_negatives)
