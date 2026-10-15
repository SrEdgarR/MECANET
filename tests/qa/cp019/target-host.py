"""Passive TARGET host bridge. Root supplies the verified host controller h.
No command, filesystem or environment access occurs during import.
"""
import datetime, hashlib, importlib.util, json, os, pathlib, re, stat, time, uuid

PHASES=('begin-enroll','rotate','canary','configure','clock-plan','post-worker-verify','promotion','activation','abort-close','abort-local','abort-finish','clock-restart-plan','clock-restart-record','promote-fault')
BUSINESS=('api1','api2','web','worker')
HASH=re.compile(r'^[0-9a-f]{64}$')
SHA=re.compile(r'^[0-9a-f]{40}$')

def canonical(x):return json.dumps(x,separators=(',',':'),sort_keys=True,ensure_ascii=False,allow_nan=False).encode()
def digest(x):return hashlib.sha256(x if isinstance(x,bytes) else canonical(x)).hexdigest()
def check(value,code):
 if not value:raise AssertionError(code)
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def target_project(h):
 getter=getattr(h,'target_project',None);value=getter() if callable(getter) else h.TARGET.name
 check(value=='mecanet-qa-p1l3-r03-target','TARGET_NAMESPACE');return value

def target_case(h,name):
 getter=getattr(h,'variant_case_name',None);return getter(name) if callable(getter) else ('target-'+name if name in PHASES else name)

def frame(h):
 check(h.ROOT.name=='mecanet-qa-p1l3-r03' and target_project(h)=='mecanet-qa-p1l3-r03-target','TARGET_NAMESPACE')
 getter=getattr(h,'variant_frame',None)
 if callable(getter):
  check(h.ROOT==pathlib.Path('/opt/mecanet-qa-p1l3-r03') and h.TARGET.parent==pathlib.Path('/opt/mecanet-qa-p1l3-r03-target/variants') and h.TARGET.name in ['roster-empty','allclosed','commit-interrupted','promote-prefix','a5-restrictions'],'TARGET_NAMESPACE');return getter()
 check(h.TARGET.name==target_project(h),'TARGET_NAMESPACE');h.own(h.ROOT);h.own(h.TARGET);return h.material_owned()
def read_private(path,uid=999,limit=262144,mode=0o400,json_value=True):
 check(path.resolve()==path and not path.is_symlink(),'TARGET_PRIVATE_PATH');before=path.lstat()
 check(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_uid==uid and before.st_mode&0o777==mode and 2<=before.st_size<=limit,'TARGET_PRIVATE_FILE')
 fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
 try:
  opened=os.fstat(fd);check((opened.st_dev,opened.st_ino,opened.st_size,opened.st_mode,opened.st_uid,opened.st_nlink)==(before.st_dev,before.st_ino,before.st_size,before.st_mode,before.st_uid,before.st_nlink),'TARGET_PRIVATE_CHANGED')
  with os.fdopen(fd,'rb',closefd=False) as file:raw=file.read(limit+1)
  after=os.fstat(fd);named=path.lstat();check(len(raw)==before.st_size and (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns)==(opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns,opened.st_ctime_ns) and (named.st_dev,named.st_ino,named.st_nlink,named.st_mode,named.st_uid)==(after.st_dev,after.st_ino,1,after.st_mode,uid),'TARGET_PRIVATE_CHANGED')
  return (json.loads(raw) if json_value else raw),digest(raw)
 finally:os.close(fd)

def read400(path,uid=999,limit=262144):return read_private(path,uid,limit)

def expected_target_worker_owner(h,material):
 """No recursive expected_owners call; prospective additions alone do nothing."""
 marker=h.TARGET/'master/current-worker.json';original=material['target']['workerClockOwner']
 if not marker.exists() and not marker.is_symlink():return original
 chosen,_=read400(marker,0)
 check(set(chosen)=={'schema','ownerId','previousOwner','contextHash','additionHash','oldFinHash','prepareReceiptHash','workerConfigHash'} and chosen['schema']=='target-current-worker-v1','TARGET_WORKER_MARKER')
 context,ch=read400(h.TARGET/'master/clock-restart-context.json',0);end,eh=read400(h.TARGET/'master/old-worker-end.json',0)
 receipt,rh=read400(h.TARGET/'evidence/target-clock-restart-plan.json');cfg,wh=read400(h.TARGET/'secrets/worker-restart.json')
 addition=context['addition'];extension=context['extension'];proof=end['endProof'];observed=end['observedEnd'];processes=proof.get('processes',[])
 check(chosen['contextHash']==ch and chosen['additionHash']==context['additionHash']==digest(addition) and chosen['oldFinHash']==eh and chosen['prepareReceiptHash']==rh and chosen['workerConfigHash']==wh,'TARGET_WORKER_CUSTODY')
 check(chosen['previousOwner']==addition['previousOwner']==original and chosen['ownerId']==addition['nextOwner'] and chosen['ownerId']!=original and str(uuid.UUID(chosen['ownerId']))==chosen['ownerId'],'TARGET_WORKER_OWNER')
 check(addition['side']=='target' and addition['generation']==material['target']['generation'] and addition['runId']==material['recoveryId'] and addition['custodyHash']==digest(material) and addition['materialHash']==digest(material) and addition['endProofHash']==digest(proof),'TARGET_WORKER_BINDING')
 check(proof.get('schema')=='worker-end-v1' and proof.get('recoveryId')==material['recoveryId'] and proof.get('sourceResourceHash')==addition['resourceHash'] and len(processes)==1 and processes[0]['service']=='worker' and processes[0]['ownerId']==original and HASH.fullmatch(processes[0]['containerId']) and proof['sqlOwners']==[original] and proof['httpOperationIds']==[],'TARGET_WORKER_OLD_END')
 proc=processes[0];rows=observed.get('containers',[])
 check(observed.get('resourceHash')==addition['resourceHash'] and observed.get('sqlOwnersPresent')==[] and observed.get('httpPending')==[] and len(rows)==1 and all(rows[0].get(k)==v for k,v in {'id':proc['containerId'],'service':'worker','ownerId':original,'running':False,'exitCode':proc['exitCode'],'finishedAt':proc['finishedAt']}.items()) and proc['exitCode']==0,'TARGET_WORKER_OLD_END')
 check(not any(c['id']==proc['containerId'] for c in h.facts()),'TARGET_OLD_WORKER_RETAINED')
 check(receipt.get('schema')=='target-runtime-receipt-v1' and receipt.get('phase')=='clock-restart-plan' and receipt.get('clockRestartPlanHash')==digest(extension) and receipt.get('additionHash')==context['additionHash'] and receipt.get('result',{}).get('stage')=='COMPLETE' and receipt['result']['version']=='8' and receipt['result'].get('status')=='PASS','TARGET_WORKER_PREPARE_NOT_PROVEN')
 check(cfg.get('clockOwner')==chosen['ownerId'] and cfg.get('generation')==material['target']['generation'] and cfg.get('recovery')=={'mode':'RECOVERY','runId':material['recoveryId'],'manifestHash':addition['manifestHash']} and all(cfg.get('clockTransfer',{}).get(k)==addition[k] for k in ['previousOwner','nextOwner','transferId','transferHash','endProofHash','expectedClockVersion','expectedTick']),'TARGET_WORKER_CONFIG')
 return chosen['ownerId']

def own_current(h):
 m=frame(h);h.preserve();current=h.facts();owners=h.expected_owners()
 h.guard_resources(current,[],owners)
 check(not any(c.get('project')==h.ROOT.name and c.get('running') for c in current),'SOURCE_MUST_BE_OFF')
 scoped=getattr(h,'scope_facts',None);current=scoped() if callable(scoped) else current
 return m,current,owners

def validate_created_postgres(h,cid):
 """Inspect all planned mounts/tmpfs/ports/networks before the first START."""
 compose,ch=read_private(getattr(h,'compose_path',lambda root:root/'compose.json')(h.TARGET),0,262144,0o600);check(compose.get('name')==target_project(h) and isinstance(compose.get('services',{}).get('postgres'),dict),'TARGET_CREATED_PG_SPEC')
 actual=inspect_created_service(h,cid,compose['services']['postgres']);bind=[x for x in actual['mounts'] if x.get('Destination')=='/var/lib/postgresql']
 check(len(bind)==1 and bind[0].get('Type')=='bind' and bind[0].get('Source')==str(h.TARGET/'data') and bind[0].get('RW') is True,'TARGET_CREATED_PG_BIND')
 networks=actual['networks'];name=target_project(h)+'-data'
 check(list(networks)==[name] and networks[name].get('IPAMConfig',{}).get('IPv4Address')=='10.77.66.2' and networks[name].get('IPAddress') in ['', '10.77.66.2'],'TARGET_CREATED_PG_NETWORK')
 net=json.loads(h.run('docker','network','inspect','--format','{"name":{{json .Name}},"internal":{{json .Internal}},"ipam":{{json .IPAM.Config}}}',name))
 check(net.get('name')==name and net.get('internal') is True and [x.get('Subnet') for x in net.get('ipam',[])]==['10.77.66.0/25'],'TARGET_CREATED_PG_NETWORK')
 return True

def target_pg_start(h):
 m,current,owners=own_current(h);h.set_host_case(target_case(h,'target-pg-start'))
 check(not any(c.get('project')==target_project(h) and c.get('running') for c in current),'TARGET_MUST_BE_COLD')
 check((h.TARGET/'data/18/docker/PG_VERSION').is_file(),'TARGET_COPY_REQUIRED')
 h.enter_runtime_case('target-window',target_case(h,'target-pg-start'));(h.verify_copy_completed() if callable(getattr(h,'verify_copy_completed',None)) else verify_copy_completed(h));h.set_host_case(target_case(h,'target-pg-start'));h.enter_runtime_case('target-window',target_case(h,'target-pg-start'))
 h.guard_effect(h.TARGET,['postgres'])
 h.compose(h.TARGET,'create','--no-build','--pull','never','--no-recreate','postgres')
 cid=h.compose(h.TARGET,'ps','-a','-q','postgres').strip();check(HASH.fullmatch(cid or ''),'TARGET_PG_CID')
 created=h.inspect_container(cid);check(h.owned_identity(created,owners) and created['status']=='created' and not created['running'] and created['pid']==0 and created.get('project')==target_project(h) and created.get('service')=='postgres' and isinstance(created.get('startedAt'),str) and created['startedAt']=='0001-01-01T00:00:00Z','TARGET_PG_CREATED')
 compose,compose_hash=read_private(getattr(h,'compose_path',lambda root:root/'compose.json')(h.TARGET),0,262144,0o600)
 reference={'schema':'target-postgres-created-v1','project':target_project(h),'containerId':cid,'ownerId':owners[target_project(h)]['postgres'],'service':'postgres','imageRef':h.PROFILES['postgres'][2],'nanoCpus':h.PROFILES['postgres'][0],'memory':h.PROFILES['postgres'][1],'generation':m['target']['generation'],'recoveryId':m['recoveryId'],'dataPath':str(h.TARGET/'data'),'composeHash':compose_hash,'state':'CREATED BEFORE START/SQL'}
 frozen_input(h,h.TARGET/'master/postgres-created.json',reference,0)
 validate_created_postgres(h,cid) # Identity custody is durable before a boundary rejection.
 h.guard_resources(h.facts(),[(h.TARGET,'postgres')],owners);check(h.inspect_container(cid)==created,'TARGET_PG_START_CHANGED');h.assert_case_budget();h.run('docker','start',cid);h.wait_pg_ready(cid)
 actual=h.inspect_container(cid);check(h.owned_identity(actual,owners) and actual['running'] and actual['service']=='postgres' and actual['project']==target_project(h),'TARGET_PG_IDENTITY')
 output=h.run('docker','exec',cid,'pg_controldata','/var/lib/postgresql/18/docker');fields={x.split(':',1)[0].strip():x.split(':',1)[1].strip() for x in output.splitlines() if ':' in x};sid=fields.get('Database system identifier')
 source_sid=(h.ROOT/'evidence/system-id').read_text().strip();check(sid==source_sid and re.fullmatch('[0-9]{10,24}',sid or ''),'TARGET_SYSTEM_ID')
 h.write_plain(h.TARGET/'evidence/system-id',sid,0o444);own_current(h)
 return {'result':'PASS','side':'target','postgresContainer':cid,'systemIdentifier':sid,'readiness':'NOT VERIFIED'}

def target_resource(h):
 m,current,owners=own_current(h);pg=[c for c in current if c.get('project')==target_project(h) and c.get('service')=='postgres']
 check(len(pg)==1 and pg[0]['running'] and h.owned_identity(pg[0],owners),'TARGET_PG_NOT_OWNED');c=pg[0];cid=c['id']
 mounts=json.loads(h.run('docker','inspect','--format','{{json .Mounts}}',cid));bind=[x for x in mounts if x['Destination']=='/var/lib/postgresql']
 check(len(bind)==1 and bind[0]['Type']=='bind' and bind[0]['Source']==str(h.TARGET/'data') and bind[0]['RW'] is True,'TARGET_VOLUME_BIND')
 networks=json.loads(h.run('docker','inspect','--format','{{json .NetworkSettings.Networks}}',cid));name=target_project(h)+'-data'
 check(list(networks)==[name] and networks[name]['IPAddress']=='10.77.66.2','TARGET_NETWORK')
 net=json.loads(h.run('docker','network','inspect','--format','{"id":{{json .Id}},"name":{{json .Name}},"internal":{{json .Internal}},"ipam":{{json .IPAM.Config}}}',name));check(net['name']==name and net['internal'] is True and [x.get('Subnet') for x in net['ipam']]==['10.77.66.0/25'],'TARGET_NETWORK')
 data=h.TARGET/'data/18/docker';check(data.is_dir() and data.resolve()==data and not data.is_symlink(),'TARGET_DATA_PATH');s=data.stat()
 output=h.run('docker','exec',cid,'pg_controldata','/var/lib/postgresql/18/docker');sid=next((x.split(':',1)[1].strip() for x in output.splitlines() if x.startswith('Database system identifier:')),None)
 check(sid==(h.TARGET/'evidence/system-id').read_text().strip() and re.fullmatch('[0-9]{10,24}',sid or ''),'TARGET_SYSTEM_ID')
 machine=pathlib.Path('/etc/machine-id').read_bytes().strip();check(machine,'HOST_ID_REQUIRED')
 return {'project':target_project(h),'cohortId':m['target']['generation'],'hostIdentity':digest(machine),'containerId':cid,'containerLabels':{'project':c['project'],'service':'postgres'},'imageDigest':'sha256:'+h.PINS['postgres'],'volumeId':'cp019-'+digest((str(data)+':'+str(s.st_dev)+':'+str(s.st_ino)).encode()),'dataPath':str(data),'networkId':net['id'],'networkSubnet':'10.77.66.0/25','networkIP':'10.77.66.2','socketPath':str(h.TARGET/('ingress/http.sock' if callable(getattr(h,'variant_frame',None)) else 'ingress/web.sock')),'generation':m['target']['generation'],'systemIdentifier':sid}

def atomic_mailbox(h,name,value):
 check(name in ['target-host.json','target-copy-host.json'],'TARGET_MAILBOX_NAME')
 check(isinstance(value,dict) and set(value)=={'receipt','receiptHash'} and isinstance(value['receipt'],dict) and value['receiptHash']==digest(value['receipt']) and value['receipt'].get('schema')==('target-host-receipt-v1' if name=='target-host.json' else 'cp019-offline-host-v1'),'TARGET_MAILBOX_ENVELOPE');directory=h.TARGET/'live'
 check(directory.resolve()==directory and not directory.is_symlink() and directory.is_dir(),'TARGET_MAILBOX_DIRECTORY');s=directory.stat();check(s.st_uid==999 and s.st_mode&0o777==0o700,'TARGET_MAILBOX_DIRECTORY')
 payload=canonical(value);check(len(payload)<=262144,'TARGET_MAILBOX_LIMIT');path=directory/name
 if path.exists() or path.is_symlink():read400(path)
 h.ledger_charge('artifactFiles');temp=directory/('.'+name+'.'+uuid.uuid4().hex+'.tmp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o400)
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:f.write(payload);f.flush();os.fchmod(fd,0o400);os.fchown(fd,999,999);os.fsync(fd)
  os.close(fd);fd=None;os.replace(temp,path);h.syncdir(directory)
 finally:
  if fd is not None:os.close(fd)
  if temp.exists():temp.unlink()
 saved,sha=read400(path);check(saved==value and sha==digest(payload),'TARGET_MAILBOX_READBACK');return sha

def phase_arguments(h,phase,action,source_sha,invocation_id):
 check(phase in PHASES and action in ['run','configs'] and (action!='configs' or phase=='clock-plan') and SHA.fullmatch(source_sha or '') and str(uuid.UUID(invocation_id))==invocation_id,'TARGET_PHASE_ARGUMENTS')
 return ['node','tests/qa/cp019/target-runtime.mjs',action,phase],{'QA_PROJECT':target_project(h),'QA_CODE_SHA':source_sha,'QA_INVOCATION_ID':invocation_id}

def bundle_context(h):
 m=frame(h);header,hh=read400(h.TARGET/'secrets/target-config-bundle.json');capture,ch=read400(h.TARGET/'secrets/source-capture.json');base=header['bundle']
 check(header['schema']=='cp019-target-bundle-header-v1' and HASH.fullmatch(header['parentFullBundleHash']) and base['manifest']['target']['generation']==m['target']['generation'] and base['manifest']['source']['generation']==m['source']['generation'] and base['anchors']['custodyHash']==digest(m),'TARGET_BUNDLE_BINDING')
 artifact=json.loads((getattr(h,'runtime_directory',lambda:h.ROOT/'staging')()/'artifact.json').read_text());check(SHA.fullmatch(artifact.get('sourceSha','')),'TARGET_ARTIFACT_REQUIRED')
 return m,base,{'configBundleHash':header['parentFullBundleHash'],'configBundleHeaderHash':hh,'sourceCaptureHash':ch,'custodyHash':digest(m),'sourceSha':artifact['sourceSha']}

def source_end_observation(h,base):
 pair,_=read400(h.ROOT/'secrets/source-live-end.json');proof=base['sourceEndProof'];check(pair.get('endProof')==proof and pair.get('hash')==digest(proof),'SOURCE_END_CUSTODY')
 observed=json.loads(json.dumps(pair['observedEnd']));check(observed.get('sqlOwnersPresent')==[] and observed.get('httpPending')==[],'SOURCE_SQL_FIN_REQUIRED')
 rows=[]
 for p in proof['processes']:
  c=h.inspect_container(p['containerId']);check(h.owned_identity(c,h.expected_owners()) and c['running'] is False and c['pid']==0 and c['status']=='exited' and all(c[k]==p[v] for k,v in [('service','service'),('ownerId','ownerId'),('exitCode','exitCode'),('finishedAt','finishedAt')]),'SOURCE_END_CHANGED')
  rows.append({'id':c['id'],'service':c['service'],'ownerId':c['ownerId'],'running':False,'pid':0,'status':'exited','exitCode':c['exitCode'],'finishedAt':c['finishedAt']})
 observed['containers']=rows;return observed

def observation(h,phase,cfg,base):
 m,current,owners=own_current(h);resource=target_resource(h);check(resource==base['manifest']['target'],'TARGET_RESOURCE_CHANGED')
 source=base['manifest']['source'];pg=h.inspect_container(source['containerId']);check(h.owned_identity(pg,owners) and not pg['running'] and pg['pid']==0 and pg['status']=='exited','SOURCE_PG_END_REQUIRED')
 consumers=[{'service':c['service'],'containerId':c['id'],'ownerId':c['ownerId'],'running':True,'imageDigest':c['imageRef'].split('@',1)[1]} for c in current if c.get('project')==target_project(h) and c.get('service') in BUSINESS and c['running']]
 body={'schema':'target-host-receipt-v1','phase':phase,'caseName':target_case(h,phase),'invocationId':cfg['invocationId'],'sourceSha':cfg['sourceSha'],'recoveryId':m['recoveryId'],'generation':m['target']['generation'],'custodyHash':cfg['custodyHash'],'configBundleHash':cfg['configBundleHash'],'sourceCaptureHash':cfg['sourceCaptureHash'],'manifestHash':base['anchors']['manifestHash'],'targetResourceHash':base['anchors']['targetResourceHash'],'sourceEndProofHash':base['proofBundle']['sourceEndProofHash'],'observedResources':{'source':source,'target':resource,'sourcePostgresRunning':False,'targetPostgresRunning':True,'runtimeConsumers':consumers},'observedSourceEnd':source_end_observation(h,base)}
 if callable(getattr(h,'variant_lineage',None)):
  context,context_hash=h.variant_lineage();check(cfg.get('variantLineageContextHash')==context_hash and cfg.get('variantLineageHash')==context['additionHash'],'TARGET_VARIANT_BINDING');body['variantLineageHash']=context['additionHash']
 if cfg.get('clockRestartContextHash'):
  ctx,sha=read400(h.TARGET/'secrets/target-clock-restart-context.json');check(sha==cfg['clockRestartContextHash'],'TARGET_RESTART_CONTEXT');body.update(clockRestartPlanHash=ctx['clockRestart']['extensionHash'],additionHash=ctx['clockRestart']['additionHash'])
 if cfg.get('abortPrefixContextHash'):
  ctx,sha=read400(h.TARGET/'secrets/target-abort-prefix-context.json');check(sha==cfg['abortPrefixContextHash'],'TARGET_PREFIX_CONTEXT');body['abortPrefixPlanHash']=ctx['abortPrefix']['extensionHash']
 if phase.startswith('abort-'):
  pair,_=read400(target_end_pair_path(h,cfg));check(pair['endProof']['sourceResourceHash']==base['anchors']['targetResourceHash'] and pair['endProof']['recoveryId']==m['recoveryId'],'TARGET_END_REQUIRED');body.update(targetEnd=pair,targetEndProofHash=digest(pair['endProof']))
 body['observedAt']=stamp();return {'receipt':body,'receiptHash':digest(body)}

def phase_config(h,phase):
 check(phase in PHASES,'TARGET_PHASE_ARGUMENTS');m,base,bindings=bundle_context(h);path=h.TARGET/'secrets'/('target-'+phase+'-config.json')
 if path.exists() or path.is_symlink():
  cfg,_=read400(path);check(cfg.get('schema')=='target-runtime-config-v1' and cfg['phase']==phase and all(cfg[k]==v for k,v in bindings.items()),'TARGET_PHASE_CONFIG_COLLISION');return cfg,base
 cfg={'schema':'target-runtime-config-v1','phase':phase,'invocationId':str(uuid.uuid4()),**bindings,'journalCreate':phase=='begin-enroll','bootstrapCredential':'source' if phase in ['begin-enroll','rotate'] else 'target'}
 if callable(getattr(h,'variant_lineage',None)):
  context,context_hash=h.variant_lineage();cfg.update(variantLineageContextHash=context_hash,variantLineageHash=context['additionHash'],variantCaseName=target_case(h,phase))
 if phase=='clock-plan':cfg['sourceHistoryHash']=read400(h.ROOT/'secrets/source-history.json')[1]
 restart=h.TARGET/'secrets/target-clock-restart-context.json';prefix=h.TARGET/'secrets/target-abort-prefix-context.json'
 if phase.startswith('clock-restart-') or phase.startswith('abort-') and restart.exists():cfg['clockRestartContextHash']=read400(restart)[1]
 if phase=='promote-fault' or phase.startswith('abort-') and prefix.exists():cfg['abortPrefixContextHash']=read400(prefix)[1]
 check(not (cfg.get('clockRestartContextHash') and cfg.get('abortPrefixContextHash')),'TARGET_COMPENSATION_CONFLICT');h.write_plain(path,canonical(cfg),0o400,999);saved,sha=read400(path);check(saved==cfg and sha==digest(cfg),'TARGET_CONFIG_READBACK');return cfg,base

def watch_job(h,job,publish,deadline_seconds=45):
 """Fresh mailbox samples through the actual exit; timeout is never FIN."""
 check(0<deadline_seconds<=45,'TARGET_JOB_DEADLINE');deadline=time.monotonic()+h.remaining_case_seconds(deadline_seconds)
 while time.monotonic()<deadline:
  c=h.inspect_container(job['cid']);check(h.created_job_identity(c,job,h.read_created_job(job)),'TARGET_JOB_IDENTITY')
  check(time.monotonic()<deadline,'TARGET_JOB_TIMEOUT_KEEP')
  if not c['running']:
   check(c['status']=='exited' and c['pid']==0,'TARGET_JOB_FIN_UNKNOWN');return h.finish_job(job)
  publish();time.sleep(.5)
 raise AssertionError('TARGET_JOB_TIMEOUT_KEEP')

def require_prefix_custody(h,base):
 check(getattr(h,'kind',None)=='promote-prefix','TARGET_PREFIX_CUSTODY_SCOPE')
 context,ch=read400(h.TARGET/'secrets/target-abort-prefix-context.json');proof,ph=read400(h.TARGET/'master/prefix-host-result.json',0);prefix=context.get('abortPrefix',{});extension=prefix.get('extension',{})
 check(proof.get('schema')=='cp021-prefix-host-result-v1' and proof.get('caseName')=='target-promote-fault' and proof.get('contextHash')==ch and proof.get('extensionHash')==prefix.get('extensionHash')==digest(extension) and extension.get('parentPlanHash')==base['planHash'] and extension.get('variantLineageHash')==base.get('variantLineageHash') and prefix.get('faultPoint')==extension.get('faultPoint')=='PROMOTION_AFTER_OPEN_A','TARGET_PREFIX_CUSTODY_REQUIRED')
 verified,verified_hash=h.probes_bridge().verify_prefix_custody(h)
 check(verified==context and verified_hash==ch,'TARGET_PREFIX_BUILDER_CUSTODY_CHANGED')
 return context,proof

def phase(h,phase,action='run'):
 check(phase in PHASES and action in ['run','configs'] and (action!='configs' or phase=='clock-plan'),'TARGET_PHASE_ARGUMENTS')
 m,current,owners=own_current(h);h.set_host_case(target_case(h,phase));h.enter_runtime_case('target-window',target_case(h,phase));cfg,base=phase_config(h,phase)
 if getattr(h,'kind',None)=='promote-prefix' and (phase=='promote-fault' or phase.startswith('abort-')):require_prefix_custody(h,base)
 cfg={**cfg,'invocationId':str(uuid.uuid4())};config_path=h.TARGET/'secrets'/('target-'+phase+'-invocation-'+cfg['invocationId']+'.json');command,env=phase_arguments(h,phase,action,cfg['sourceSha'],cfg['invocationId'])
 live=[c for c in current if c.get('project')==target_project(h) and c.get('service') in BUSINESS and c['running']];check(not live or len(live)==1 and live[0]['service']=='worker','TARGET_PHASE_NOT_QUIESCENT')
 profile='probe' if live else 'harness';mounts=[(h.ROOT/'backup/source-copy','/run/qa-copy','ro'),(h.TARGET/'live','/run/qa-live','ro'),(h.ROOT/'secrets','/run/qa-source-secrets','ro')]
 if getattr(h,'kind',None)=='commit-interrupted' and phase=='promotion' and action=='run':return h.commit_bridge().run(h,__import__('types').SimpleNamespace(**globals()),cfg,base,profile,command,env,mounts)
 frozen_input(h,config_path,cfg);mounts.append((config_path,'/run/qa-secrets/target-'+phase+'-config.json','ro'))
 publish=lambda:atomic_mailbox(h,'target-host.json',observation(h,phase,cfg,base));publish()
 job=h.create_job(h.TARGET,profile,command,env,mounts=mounts,sample=not bool(live));publish();h.start_job(job)
 output,proof=watch_job(h,job,publish);result=json.loads(output)
 if action=='run':check(result.get('type')=='cp019-target-phase' and result.get('phase')==phase and result.get('planHash')==base['planHash'] and HASH.fullmatch(result.get('receiptHash','')) and result.get('secretOutput') is False,'TARGET_PHASE_RESULT')
 else:check(result.get('type')=='cp019-target-configs' and result.get('generation')==m['target']['generation'] and result.get('recoveryId')==m['recoveryId'] and result.get('planHash')==base['planHash'] and result.get('secretOutput') is False,'TARGET_CONFIG_RESULT')
 return {'result':'PASS','phase':phase,'action':action,'jobProof':proof,'physicalCohortAcceptance':'NOT VERIFIED'}

def validate_copy_result(result):
 check(isinstance(result,dict) and set(result)=={'type','status','indexHash','boundaryHash','files','bytes','targetFiles','secretOutput','physicalRecovery'} and result['type']=='cp019-target-copy-prepared' and result['status']=='PASS' and HASH.fullmatch(result.get('indexHash','')) and HASH.fullmatch(result.get('boundaryHash','')) and type(result.get('files')) is int and 0<result['files']<=10000 and type(result.get('bytes')) is int and 0<result['bytes']<=2*1024**3 and type(result.get('targetFiles')) is int and result['targetFiles']==result['files'] and result['secretOutput'] is False and result['physicalRecovery']=='NOT VERIFIED','TARGET_COPY_RESULT');return result

def frozen_input(h,path,value,uid=999):
 if path.exists() or path.is_symlink():
  old,sha=read400(path,uid);check(old==value and sha==digest(value),'TARGET_INPUT_COLLISION');return sha
 h.write_plain(path,canonical(value),0o400,uid);old,sha=read400(path,uid);check(old==value and sha==digest(value),'TARGET_INPUT_READBACK');return sha

def artifact(h):
 value,sha=read_private(getattr(h,'runtime_directory',lambda:h.ROOT/'staging')()/'artifact.json',0,262144,0o444);check(SHA.fullmatch(value.get('sourceSha','')),'TARGET_ARTIFACT_REQUIRED');return value,sha

def job_provenance(h,job_id,proof,command):
 check(str(uuid.UUID(job_id))==job_id and set(proof)=={'containerId','jobCreatedHash','jobEndHash','containerFIN','sqlFIN'} and proof['containerFIN']=='PASS' and proof['sqlFIN']=='NOT VERIFIED','TARGET_JOB_PROOF')
 created,ch=read400(h.TARGET/'evidence/jobs'/(job_id+'-created.json'),0);ended,eh=read400(h.TARGET/'evidence/jobs'/(job_id+'-end.json'),0)
 check(ch==proof['jobCreatedHash'] and eh==proof['jobEndHash'] and created.get('schema')=='controller-job-created-v1' and created.get('state')=='CREATED BEFORE START/SQL' and created.get('commandHash')==digest(command) and created['containerId']==ended['containerId']==proof['containerId'] and created['jobId']==ended['jobId']==job_id and created['project']==ended['project']==target_project(h) and created['service']==ended['service'] and created['ownerId']==ended['ownerId']==frame(h)['controllerOwner'] and ended.get('schema')=='controller-job-end-v1' and ended.get('createdReceiptHash')==ch and ended.get('exitCode')==0 and ended.get('containerStopped') is True and ended.get('sqlAbsence')=='NOT VERIFIED' and not ended.get('finishedAt','0001-').startswith('0001-'),'TARGET_JOB_PROOF');return created,ended

def copy_boundary(h,cfg,shutdown):
 m,current,owners=own_current(h);check(not any(c.get('running') and c.get('project') in [h.ROOT.name,target_project(h)] and c.get('service')!='controller-tool' for c in current),'TARGET_COPY_CONSUMERS')
 p=h.inspect_container(cfg['sourceResource']['containerId']);check(h.owned_identity(p,owners) and p['running'] is False and p['pid']==0 and p['status']=='exited' and p['exitCode']==0 and shutdown['result']=='PASS' and shutdown['clusterState']=='shut down' and shutdown['systemIdentifier']==cfg['sourceResource']['systemIdentifier'],'TARGET_COPY_SOURCE_PG_END')
 pg={'containerId':p['id'],'project':p['project'],'running':False,'exitCode':p['exitCode'],'finishedAt':p['finishedAt'],'state':'shut down','systemIdentifier':shutdown['systemIdentifier'],'imageDigest':p['imageRef'].split('@',1)[1],'dataPath':cfg['sourceResource']['dataPath']}
 observed=source_end_observation(h,{'sourceEndProof':cfg['sourceEndProof']})
 mounts=[{'hostPath':cfg['sourceResource']['dataPath'],'containerPath':'/run/qa-source','writable':False},{'hostPath':str(h.ROOT/'backup'),'containerPath':'/run/qa-backup','writable':True},{'hostPath':str(h.ROOT/'journal'),'containerPath':'/run/qa-journal','writable':True}]
 body={'schema':'cp019-offline-host-v1','invocationId':cfg['invocationId'],'custodyHash':cfg['custodyHash'],'sourceEndProofHash':cfg['sourceEndProofHash'],'boundary':{'observedEnd':observed,'postgres':pg,'mounts':mounts},'sourcePostgresRunning':False,'targetPostgresRunning':False,'observedAt':stamp()};return {'receipt':body,'receiptHash':digest(body)}

def target_copy(h):
 m,current,owners=own_current(h);check(not any(c.get('running') and c.get('project') in [h.ROOT.name,target_project(h)] for c in current),'TARGET_COPY_REQUIRES_OFF')
 h.set_host_case('copy-offline');normal,nh=read400(h.ROOT/'secrets/source-normal-manifest.json');end,eh=read400(h.ROOT/'secrets/source-live-end.json');checkpoint,cph=read400(h.ROOT/'secrets/source-copy-checkpoint.json');art,ah=artifact(h)
 check(normal['resource']['generation']==m['source']['generation'] and end['hash']==digest(end['endProof']) and end['endProof']['sourceResourceHash']==digest(normal['resource']),'TARGET_COPY_SOURCE_BINDING')
 cfg={'schema':'cp019-target-copy-v1','project':target_project(h),'invocationId':str(uuid.uuid4()),'custodyHash':digest(m),'sourceResource':normal['resource'],'sourceEndProof':end['endProof'],'sourceEndProofHash':end['hash']};path=h.TARGET/'secrets/target-copy-config.json'
 if path.exists():
  existing,_=read400(path);check(all(existing.get(k)==v for k,v in cfg.items() if k!='invocationId'),'TARGET_INPUT_COLLISION');cfg=existing
 cfg_hash=frozen_input(h,path,cfg);shutdown=h.offline_pg();h.set_host_case('copy-offline')
 mounts=[(h.ROOT/'data/18/docker','/run/qa-source','ro'),(h.ROOT/'backup','/run/qa-backup','rw'),(h.ROOT/'journal','/run/qa-journal','rw'),(h.TARGET/'data','/run/qa-target','rw'),(h.TARGET/'secrets','/run/qa-secrets','rw'),(h.TARGET/'live','/run/qa-live','ro'),(getattr(h,'budget_directory',lambda:h.ROOT/'budget')(),'/run/qa-budget','rw'),(path,'/run/qa-secrets/target-prepare.json','ro')]
 command=['node','tests/qa/cp019/target-prepare.mjs','copy-before-target'];env={'QA_PROJECT':target_project(h),'QA_CODE_SHA':art['sourceSha'],'QA_INVOCATION_ID':cfg['invocationId']};publish=lambda:atomic_mailbox(h,'target-copy-host.json',copy_boundary(h,cfg,shutdown))
 publish();job=h.create_job(h.TARGET,'controller-tool',command,env,mounts=mounts,network='none');publish();h.start_job(job);output,proof=watch_job(h,job,publish);result=validate_copy_result(json.loads(output));job_provenance(h,job['jobId'],proof,command)
 record={'schema':'target-copy-host-result-v1','project':target_project(h),'sourceSha':art['sourceSha'],'inputConfigHash':cfg_hash,'copyCheckpointHash':cph,'sourceEndProofHash':end['hash'],'indexHash':result['indexHash'],'nodeResult':result,'jobId':job['jobId'],'jobProof':proof}
 frozen_input(h,h.TARGET/'evidence/target-copy.json',record,0);verify_copy_completed(h)
 return {'result':'PASS FOR TWO INDEPENDENT COPIES ONLY','indexHash':result['indexHash'],'files':result['files'],'bytes':result['bytes'],'jobProof':proof,'physicalRecovery':'NOT VERIFIED','secretsPrinted':False}

def inventory_copy(root,index,deadline):
 check(root.resolve()==root and root.is_dir() and not root.is_symlink(),'TARGET_COPY_DIRECTORY');expected={}
 check(set(index)=={'schema','files'} and index['schema']=='copy-index-v1' and isinstance(index['files'],list) and 0<len(index['files'])<=10000,'TARGET_COPY_INDEX');total=0
 for entry in index['files']:
  check(set(entry)=={'path','bytes','sha256'} and isinstance(entry['path'],str) and not pathlib.PurePosixPath(entry['path']).is_absolute() and all(x not in ['.','..',''] for x in entry['path'].split('/')) and '\\' not in entry['path'] and entry['path'] not in expected and type(entry['bytes']) is int and entry['bytes']>=0 and HASH.fullmatch(entry.get('sha256','')),'TARGET_COPY_INDEX');expected[entry['path']]=entry;total+=entry['bytes']
 check(total<=2*1024**3,'TARGET_COPY_SIZE');seen={}
 for directory,dirs,files in os.walk(root,followlinks=False):
  check(time.monotonic()<deadline,'TARGET_COPY_VERIFY_DEADLINE')
  for name in dirs:check(not (pathlib.Path(directory)/name).is_symlink(),'TARGET_COPY_LINK')
  for name in files:
   path=pathlib.Path(directory)/name;relative=path.relative_to(root).as_posix();check(relative in expected and len(seen)<10000 and path.resolve()==path and not path.is_symlink(),'TARGET_COPY_EXTRA_OR_LINK');s=path.lstat();e=expected[relative];check(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size==e['bytes'],'TARGET_COPY_FILE')
   fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0));hash_state=hashlib.sha256();size=0
   try:
    before=os.fstat(fd);check((before.st_dev,before.st_ino,before.st_size)==(s.st_dev,s.st_ino,s.st_size),'TARGET_COPY_CHANGED')
    with os.fdopen(fd,'rb',closefd=False) as source:
     while True:
      check(time.monotonic()<deadline,'TARGET_COPY_VERIFY_DEADLINE');data=source.read(65536)
      if not data:break
      hash_state.update(data);size+=len(data)
    after=os.fstat(fd);named=path.lstat();check((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and (named.st_dev,named.st_ino,named.st_nlink)==(after.st_dev,after.st_ino,1),'TARGET_COPY_CHANGED')
   finally:os.close(fd)
   check(size==e['bytes'] and hash_state.hexdigest()==e['sha256'],'TARGET_COPY_HASH');seen[relative]=(s.st_dev,s.st_ino)
 check(set(seen)==set(expected),'TARGET_COPY_INCOMPLETE');return seen,total

def verify_copy_completed(h):
 m,current,owners=own_current(h);h.set_host_case('copy-verify');check(not any(c.get('running') and c.get('project') in [h.ROOT.name,target_project(h)] for c in current),'TARGET_COPY_VERIFY_REQUIRES_OFF')
 result,rh=read400(h.TARGET/'evidence/target-copy.json',0);cfg,cfg_hash=read400(h.TARGET/'secrets/target-copy-config.json');checkpoint,cph=read400(h.ROOT/'secrets/source-copy-checkpoint.json');end,eh=read400(h.ROOT/'secrets/source-live-end.json');art,ah=artifact(h)
 check(set(result)=={'schema','project','sourceSha','inputConfigHash','copyCheckpointHash','sourceEndProofHash','indexHash','nodeResult','jobId','jobProof'} and result['schema']=='target-copy-host-result-v1' and result['project']==target_project(h) and result['sourceSha']==art['sourceSha'] and result['inputConfigHash']==cfg_hash and result['copyCheckpointHash']==cph and result['sourceEndProofHash']==cfg['sourceEndProofHash']==end['hash'] and cfg['custodyHash']==digest(m) and cfg['sourceEndProof']==end['endProof'],'TARGET_COPY_RECEIPT')
 r=validate_copy_result(result['nodeResult']);job_provenance(h,result['jobId'],result['jobProof'],['node','tests/qa/cp019/target-prepare.mjs','copy-before-target']);index,ih=read_private(h.ROOT/'journal/copy-index.json',999,4*1024**2,0o600);check(ih==result['indexHash']==r['indexHash'] and ih==digest(index),'TARGET_COPY_INDEX_HASH');deadline=time.monotonic()+45
 a,size=inventory_copy(h.ROOT/'backup/source-copy',index,deadline);b,size2=inventory_copy(h.TARGET/'data/18/docker',index,deadline);check(set(a)==set(b) and all(a[k]!=b[k] for k in a) and len(a)==r['files']==r['targetFiles'] and size==size2==r['bytes'],'TARGET_COPY_NOT_INDEPENDENT');own_current(h)
 return {'result':'PASS','receiptHash':rh,'indexHash':ih,'files':len(a),'bytes':size,'physicalRecovery':'NOT VERIFIED'}

def target_prepare(h):
 m,current,owners=own_current(h);h.set_host_case(target_case(h,'manifest-final'));resource=target_resource(h);check(not any(c.get('project')==target_project(h) and c.get('service') in BUSINESS and c['running'] for c in current),'TARGET_PREPARE_REQUIRES_COLD')
 values={};hashes={}
 for key,name in [('material','material'),('foundation','source-foundation'),('writers','source-writers'),('correctives','source-correctives'),('sourceNormalManifest','source-normal-manifest'),('sourceCapture','source-capture-result'),('sourceLiveEnd','source-live-end')]:values[key],hashes[key]=read400(h.ROOT/'secrets'/(name+'.json'))
 check(values['material']==(h.original_material() if callable(getattr(h,'original_material',None)) else m) and values['sourceLiveEnd']['hash']==digest(values['sourceLiveEnd']['endProof']),'TARGET_PREPARE_SOURCE_BINDING');values['copyIndex'],hashes['copyIndex']=read_private(h.ROOT/'journal/copy-index.json',999,4*1024**2,0o600)
 raw,raw_hash=read_private(h.ROOT/'journal/source.jsonl',999,1024**2,0o600,False);check(raw.endswith(b'\n') and not (h.ROOT/'journal/source.jsonl.controller.lock').exists(),'TARGET_PREPARE_JOURNAL');records=[json.loads(line) for line in raw.splitlines()];check(0<len(records)<=1000,'TARGET_PREPARE_JOURNAL');hashes['sourceJournalRecords']=digest(records);copy_cp,cph=read400(h.ROOT/'secrets/source-copy-checkpoint.json');final_cp={'sequence':records[-1]['sequence'],'hash':records[-1]['hash']}
 if callable(getattr(h,'variant_lineage',None)):
  context,context_hash=h.variant_lineage();hashes['variantLineage']=context_hash
 art,ah=artifact(h);hashes['producerArtifact']=ah;hashes['verifierArtifact']=ah;ca,ca_hash=read_private(h.TARGET/'config/ca.crt',0,65536,0o444,False);hashes['targetCa']=ca_hash
 source=values['sourceNormalManifest']['resource'];end=values['sourceLiveEnd'];source_end_observation(h,{'sourceEndProof':end['endProof']})
 cfg={'schema':'cp019-target-prepare-v1','project':target_project(h),'sourceSha':art['sourceSha'],'producerSha':values['sourceCapture']['sourceCommit'],'inputHashes':hashes,'sourceJournalRawHash':raw_hash,'targetResource':resource,'observedResources':{'source':source,'target':resource},'sourceEndProof':end['endProof'],'observedSourceEnd':end['observedEnd'],'sourceEndProofHash':end['hash'],'sourceJournalCopyCheckpoint':copy_cp,'sourceJournalFinalCheckpoint':final_cp};path=h.TARGET/'secrets/target-assemble-config.json';cfg_hash=frozen_input(h,path,cfg)
 mounts=[(h.ROOT/'secrets','/run/qa-source-secrets','ro'),(h.ROOT/'journal','/run/qa-source-journal','ro'),(getattr(h,'runtime_directory',lambda:h.ROOT/'staging')(),'/run/qa-source-artifact','ro'),(h.TARGET/'config/ca.crt','/run/qa-target-ca.crt','ro'),(h.TARGET/'secrets','/run/qa-secrets','rw'),(getattr(h,'budget_directory',lambda:h.ROOT/'budget')(),'/run/qa-budget','rw'),(path,'/run/qa-secrets/target-prepare.json','ro')]
 command=['node','tests/qa/cp019/target-prepare.mjs','assemble'];job=h.create_job(h.TARGET,'controller-tool',command,{'QA_PROJECT':target_project(h),'QA_CODE_SHA':art['sourceSha']},mounts=mounts,network='none');h.start_job(job);output,proof=watch_job(h,job,lambda:None);result=json.loads(output)
 check(set(result)=={'type','status','configBundleHash','configBundleHeaderHash','sourceCaptureHash','custodyHash','manifestHash','planHash','budgetCase','filesPublished','filesReused','secretOutput','physicalRecovery'}|({'variantLineageHash'} if callable(getattr(h,'variant_lineage',None)) else set()) and result['type']=='cp019-target-prepared' and result['status']=='PASS' and result['budgetCase']==target_case(h,'manifest-final') and result['sourceCaptureHash']==hashes['sourceCapture'] and result['custodyHash']==digest(m) and all(HASH.fullmatch(result[k]) for k in ['configBundleHash','configBundleHeaderHash','manifestHash','planHash']) and result['secretOutput'] is False and result['physicalRecovery']=='NOT VERIFIED','TARGET_PREPARE_RESULT')
 header,hh=read400(h.TARGET/'secrets/target-config-bundle.json');alias,mh=read400(h.TARGET/'secrets/material.json');check(hh==result['configBundleHeaderHash'] and header['parentFullBundleHash']==result['configBundleHash'] and mh==digest(m) and alias==m,'TARGET_PREPARE_READBACK');job_provenance(h,job['jobId'],proof,command)
 frozen_input(h,h.TARGET/'evidence/target-prepare.json',{'schema':'target-prepare-host-result-v1','inputConfigHash':cfg_hash,'nodeResult':result,'jobId':job['jobId'],'jobProof':proof},0);return {'result':'PASS FOR ASSEMBLY ONLY','configBundleHash':result['configBundleHash'],'configBundleHeaderHash':hh,'jobProof':proof,'physicalRecovery':'NOT VERIFIED','secretsPrinted':False}

def stable_result(value):
 result=json.loads(json.dumps(value))
 for k in ['elapsedMs','sqlCommands','controlCommands','reconciled']:result.pop(k,None)
 for row in result.get('results',[]):row.pop('reconciled',None)
 return result

def validate_runtime_receipt(r,m,base,bindings,phase):
 expected=base['plan']['phases'][phase]['steps'][-1];result=r.get('result',{});rows=result.get('results',[]);after=expected['args']['after']
 check(r.get('schema')=='target-runtime-receipt-v1' and r.get('phase')==phase and r.get('planHash')==base['planHash'] and all(r.get(k)==v for k,v in bindings.items() if k in ['configBundleHash','custodyHash','sourceSha']) and r.get('generation')==m['target']['generation'] and r.get('recoveryId')==m['recoveryId'] and r.get('resultHash')==digest(stable_result(result)) and result.get('status')=='PASS' and result.get('phase')==phase and isinstance(rows,list) and len(rows)>0 and rows[-1].get('method')==expected['method'] and rows[-1].get('stage')==after['stage'] and rows[-1].get('version')==after['version'],'TARGET_RUNTIME_GATE');return r

def runtime_inventory(h,m,base,bindings):
 path=h.TARGET/'master/runtime-created.json'
 if not path.exists() and not path.is_symlink():return {'schema':'target-runtime-created-v1','project':target_project(h),'generation':m['target']['generation'],'runId':m['recoveryId'],'custodyHash':bindings['custodyHash'],'configBundleHash':bindings['configBundleHash'],'services':{}}
 inventory,ih=read400(path,0);check(set(inventory)=={'schema','project','generation','runId','custodyHash','configBundleHash','services'} and inventory['schema']=='target-runtime-created-v1' and all(inventory[k]==v for k,v in {'project':target_project(h),'generation':m['target']['generation'],'runId':m['recoveryId'],'custodyHash':bindings['custodyHash'],'configBundleHash':bindings['configBundleHash']}.items()) and isinstance(inventory['services'],dict) and set(inventory['services'])<=set(BUSINESS),'TARGET_RUNTIME_INVENTORY')
 historical,hh=read400(h.TARGET/'master'/('runtime-created-'+ih+'.json'),0);check(historical==inventory and hh==ih,'TARGET_RUNTIME_INVENTORY_CUSTODY')
 for service,row in inventory['services'].items():
  check(set(row)=={'containerId','ownerId','imageDigest','createdReceiptHash'} and HASH.fullmatch(row.get('containerId','')) and HASH.fullmatch(row.get('createdReceiptHash','')),'TARGET_RUNTIME_INVENTORY')
  receipt,rh=read400(h.TARGET/'master/runtime'/(service+'-'+row['containerId']+'-created.json'),0);check(rh==row['createdReceiptHash'] and receipt['schema']=='target-service-created-v1' and receipt['project']==target_project(h) and receipt['service']==service and receipt['generation']==m['target']['generation'] and receipt['runId']==m['recoveryId'] and receipt['configBundleHash']==bindings['configBundleHash'] and all(receipt[k]==row[k] for k in ['containerId','ownerId','imageDigest']),'TARGET_RUNTIME_INVENTORY_CUSTODY')
 return inventory

def publish_inventory(h,value):
 path=h.TARGET/'master/runtime-created.json';sha=digest(value);snapshot=path.parent/('runtime-created-'+sha+'.json');frozen_input(h,snapshot,value,0)
 if path.exists() or path.is_symlink():read400(path,0)
 h.ledger_charge('artifactFiles');temporary=path.parent/('.runtime-created.'+uuid.uuid4().hex+'.tmp');fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o400)
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:f.write(canonical(value));f.flush();os.fchmod(fd,0o400);os.fchown(fd,0,0);os.fsync(fd)
  os.close(fd);fd=None;os.replace(temporary,path);h.syncdir(path.parent)
 finally:
  if fd is not None:os.close(fd)
  if temporary.exists():temporary.unlink()
 saved,rh=read400(path,0);check(saved==value and rh==sha,'TARGET_RUNTIME_INVENTORY_READBACK');return sha

def start_recorded_containers(h,inventory,created,owners):
 for original in created:
  saved,sha=read400(h.TARGET/'master/runtime-created.json',0);historical,hh=read400(h.TARGET/'master'/('runtime-created-'+sha+'.json'),0);check(saved==inventory==historical and sha==hh,'TARGET_RUNTIME_INVENTORY_CUSTODY');name=original['service'];row=inventory['services'][name];reference,rh=read400(h.TARGET/'master/runtime'/(name+'-'+row['containerId']+'-created.json'),0)
  check(rh==row['createdReceiptHash'] and reference['schema']=='target-service-created-v1' and reference['project']==target_project(h) and reference['service']==name and all(reference[k]==row[k] for k in ['containerId','ownerId','imageDigest']) and original['id']==row['containerId'] and original['ownerId']==row['ownerId'],'TARGET_RUNTIME_CREATED_REQUIRED');h.preserve();h.guard_resources(h.facts(),[(h.TARGET,name)],owners);c=h.inspect_container(original['id']);check(c==original and h.owned_identity(c,owners),'TARGET_RUNTIME_START_CHANGED');h.assert_case_budget();h.run('docker','start',c['id'])

def runtime_case_name(mode):
 check(mode in ['worker','business','business-prefix'],'TARGET_RUNTIME_MODE');return 'target-worker-start' if mode=='worker' else 'target-business-start'

def validate_prefix_business(h,receipt,m,base,bindings):
 check(getattr(h,'kind',None)=='promote-prefix','TARGET_PREFIX_BUSINESS_SCOPE')
 context,ch=read400(h.TARGET/'secrets/target-abort-prefix-context.json');proof,ph=read400(h.TARGET/'master/prefix-host-result.json',0);prefix=context.get('abortPrefix',{});extension=prefix.get('extension',{});result=receipt.get('result',{});steps=result.get('results',[])
 check(proof.get('schema')=='cp021-prefix-host-result-v1' and proof.get('contextHash')==ch and proof.get('extensionHash')==prefix.get('extensionHash')==digest(extension) and context.get('configBundleHash')==bindings['configBundleHash'] and prefix.get('faultPoint')==extension.get('faultPoint')=='PROMOTION_AFTER_OPEN_A','TARGET_PREFIX_CUSTODY_REQUIRED')
 check(receipt.get('schema')=='target-runtime-receipt-v1' and receipt.get('phase')=='promote-fault' and receipt.get('planHash')==base['planHash'] and receipt.get('abortPrefixPlanHash')==prefix['extensionHash'] and receipt.get('variantLineageHash')==base.get('variantLineageHash') and receipt.get('generation')==m['target']['generation'] and receipt.get('recoveryId')==m['recoveryId'] and all(receipt.get(k)==bindings[k] for k in ['configBundleHash','custodyHash','sourceSha']) and receipt.get('resultHash')==digest(stable_result(result)) and result.get('status')=='PASS' and result.get('phase')=='promote-fault' and len(steps)==2 and steps[0].get('method')=='preparePromotion' and steps[0].get('stage')=='PROMOTING' and steps[0].get('version')=='6' and steps[1].get('method')=='openLocal' and steps[1].get('stage')=='LOCAL_OPEN' and steps[1].get('version')=='5','TARGET_PREFIX_NOT_PROVEN')
 return True

def created_tmpfs(spec):
 """Docker records configured tmpfs in HostConfig even before they are mounted."""
 rows=spec.get('tmpfs',[]);check(isinstance(rows,list),'TARGET_CREATED_TMPFS_SPEC');expected={}
 for row in rows:
  check(isinstance(row,str) and ':' in row and not any(ord(c)<32 or ord(c)==127 for c in row),'TARGET_CREATED_TMPFS_SPEC');dest,options=row.split(':',1)
  check(dest in ['/tmp','/var/run/postgresql'] and dest not in expected and options and all(options.split(',')),'TARGET_CREATED_TMPFS_SPEC');expected[dest]=options
 return expected

def validate_created_mounts(actual,spec):
 expected=[]
 for volume in spec['volumes']:
  source,dest,access=volume.rsplit(':',2);check(access in ['ro','rw'],'TARGET_CREATED_RUNTIME_MOUNT');expected.append((source,dest,access=='rw'))
 check(len({x[1] for x in expected})==len(expected),'TARGET_CREATED_RUNTIME_MOUNT');planned_tmpfs=created_tmpfs(spec);check(not set(planned_tmpfs)&{x[1] for x in expected},'TARGET_CREATED_TMPFS_SPEC')
 mounts=actual.get('mounts');check(isinstance(mounts,list),'TARGET_CREATED_RUNTIME_MOUNT');binds=[];tmp_destinations=[]
 for mount in mounts:
  check(isinstance(mount,dict) and type(mount.get('RW')) is bool,'TARGET_CREATED_RUNTIME_MOUNT')
  if mount.get('Type')=='bind':
   check(isinstance(mount.get('Source'),str) and isinstance(mount.get('Destination'),str),'TARGET_CREATED_RUNTIME_MOUNT');binds.append((mount['Source'],mount['Destination'],mount['RW']))
  else:
   check(mount.get('Type')=='tmpfs' and mount.get('Destination') in planned_tmpfs and mount['RW'] is True,'TARGET_CREATED_RUNTIME_MOUNT');tmp_destinations.append(mount['Destination'])
 tmpfs=actual.get('tmpfs');tmpfs={} if tmpfs is None else tmpfs
 check(sorted(binds)==sorted(expected) and len(set(tmp_destinations))==len(tmp_destinations) and isinstance(tmpfs,dict) and tmpfs==planned_tmpfs and not actual.get('ports'),'TARGET_CREATED_RUNTIME_MOUNT')
 return True

def inspect_created_service(h,cid,spec):
 actual=json.loads(h.run('docker','inspect','--format','{"mounts":{{json .Mounts}},"tmpfs":{{json .HostConfig.Tmpfs}},"networks":{{json .NetworkSettings.Networks}},"ports":{{json .HostConfig.PortBindings}}}',cid));check(isinstance(actual,dict),'TARGET_CREATED_RUNTIME_MOUNT');validate_created_mounts(actual,spec)
 check(isinstance(actual.get('networks'),dict) and set(actual['networks'])=={target_project(h)+'-'+name for name in spec['networks']},'TARGET_CREATED_RUNTIME_NETWORK');return actual

def validate_created_service(h,cid,spec):
 """CREATED tmpfs may be absent from Mounts; exact HostConfig remains required."""
 inspect_created_service(h,cid,spec);return True

def runtime_start(h,mode):
 check(mode!='business-prefix' or getattr(h,'kind',None)=='promote-prefix','TARGET_PREFIX_BUSINESS_SCOPE')
 case_name=target_case(h,runtime_case_name(mode));m,current,owners=own_current(h);h.set_host_case(case_name);h.enter_runtime_case('target-window',case_name);m,base,bindings=bundle_context(h);phase_name='clock-plan' if mode=='worker' else 'promote-fault' if mode=='business-prefix' else 'activation';receipt,rh=read400(h.TARGET/'evidence'/('target-'+phase_name+'.json'))
 if mode=='business-prefix':validate_prefix_business(h,receipt,m,base,bindings)
 else:validate_runtime_receipt(receipt,m,base,bindings,phase_name)
 configs={}
 for name in ['worker','api1','api2']:
  cfg,sha=read400(h.TARGET/'secrets'/(name+'.json'));check(cfg==base['configs'][name] and cfg['generation']==m['target']['generation'] and cfg.get('recovery')=={'mode':'RECOVERY','runId':m['recoveryId'],'manifestHash':base['anchors']['manifestHash']} and cfg.get('clockOwner' if name=='worker' else 'ownerId')==owners[target_project(h)][name],'TARGET_RUNTIME_CONFIG');configs[name]=sha
 inventory=runtime_inventory(h,m,base,bindings);selected=['worker'] if mode=='worker' else ['api1','api2','web']
 if mode=='worker':check(inventory['services']=={} and not any(c.get('project')==target_project(h) and c.get('service') in BUSINESS for c in current),'TARGET_RUNTIME_ALREADY_CREATED')
 else:
  check(set(inventory['services'])=={'worker'} and all(not any(c.get('project')==target_project(h) and c.get('service')==s for c in current) for s in selected),'TARGET_RUNTIME_ALREADY_CREATED');known=inventory['services']['worker'];worker=h.inspect_container(known['containerId']);check(h.owned_identity(worker,owners) and worker['running'] and worker['ownerId']==known['ownerId'],'TARGET_RUNTIME_WORKER_REQUIRED')
 compose,cs=read_private(getattr(h,'compose_path',lambda root:root/'compose.json')(h.TARGET),0,262144,0o600);check(compose['name']==target_project(h),'TARGET_RUNTIME_COMPOSE')
 for name in selected:
  spec=compose['services'][name];check(not spec.get('ports') and spec['restart']=='no' and spec['labels']=={'mecanet.qa.service':name,'mecanet.qa.owner-id':owners[target_project(h)][name]} and spec['image']==h.PROFILES[name][2] and set(spec['networks'])<=set(['data','front']),'TARGET_RUNTIME_COMPOSE')
  for volume in spec['volumes']:
   source,dest,access=volume.rsplit(':',2);p=pathlib.Path(source);shared_tls=(callable(getattr(h,'variant_frame',None)) and name=='web' and p==pathlib.Path('/opt/mecanet-qa-p1l3-r03-target/tls/web') and dest=='/run/tls' and access=='ro');check(p.resolve()==p and (p.is_relative_to(h.TARGET) or p.is_relative_to(getattr(h,'runtime_directory',lambda:h.ROOT/'staging')()) or p==getattr(h,'budget_directory',lambda:h.ROOT/'budget')() or shared_tls or getattr(h,'is_continuation_readonly_input',lambda *args:False)(p,dest,access)) and ((not p.is_relative_to(h.TARGET/'master') and not p.is_relative_to(h.ROOT/'master')) or getattr(h,'is_continuation_readonly_input',lambda *args:False)(p,dest,access)) and access in ['ro','rw'],'TARGET_RUNTIME_MOUNT')
 if mode=='worker':h.guard_effect(h.TARGET,selected)
 else:h.preserve();h.guard_resources(h.facts(),[(h.TARGET,n) for n in selected],owners)
 h.compose(h.TARGET,'create','--no-build','--pull','never','--no-recreate',*selected)
 created=[];directory=h.TARGET/'master/runtime'
 if not directory.exists():h.ledger_charge('artifactFiles');directory.mkdir(mode=0o700);h.syncdir(directory.parent)
 check(directory.resolve()==directory and directory.is_dir() and not directory.is_symlink() and directory.stat().st_uid==0 and directory.stat().st_mode&0o777==0o700,'TARGET_RUNTIME_RECEIPT_DIRECTORY')
 for name in selected:
  cid=h.compose(h.TARGET,'ps','-a','-q',name).strip();check(HASH.fullmatch(cid),'TARGET_RUNTIME_CID');c=h.inspect_container(cid);check(h.owned_identity(c,owners) and c['project']==target_project(h) and c['service']==name and not c['running'] and c['status']=='created' and c['pid']==0 and isinstance(c.get('startedAt'),str) and c['startedAt']=='0001-01-01T00:00:00Z','TARGET_RUNTIME_CREATED')
  config_hash=configs[name] if name!='web' else read_private(h.TARGET/'config/nginx.conf',0,262144,0o444,False)[1]
  reference={'schema':'target-service-created-v1','project':target_project(h),'service':name,'containerId':cid,'ownerId':owners[target_project(h)][name],'imageDigest':h.PROFILES[name][2].split('@',1)[1],'generation':m['target']['generation'],'runId':m['recoveryId'],'configBundleHash':bindings['configBundleHash'],'configHash':config_hash,'createdAt':stamp()};refhash=frozen_input(h,directory/(name+'-'+cid+'-created.json'),reference,0);inventory['services'][name]={'containerId':cid,'ownerId':reference['ownerId'],'imageDigest':reference['imageDigest'],'createdReceiptHash':refhash};created.append(c)
 publish_inventory(h,inventory) # All references fsynced before any process can issue SQL.
 for c in created:validate_created_service(h,c['id'],compose['services'][c['service']])
 start_recorded_containers(h,inventory,created,owners)
 actual=h.facts();h.guard_resources(actual,[],owners);scoped=getattr(h,'scope_facts',None);actual=scoped() if callable(scoped) else actual;check(all(sum(c.get('project')==target_project(h) and c.get('service')==n and c.get('id')==inventory['services'][n]['containerId'] and c.get('ownerId')==inventory['services'][n]['ownerId'] and c['running'] for c in actual)==1 for n in inventory['services']),'TARGET_RUNTIME_START_NOT_PROVEN')
 return {'result':'PASS FOR OWN PROCESS START ONLY','mode':mode,'createdServices':sorted(inventory['services']),'inventoryHash':digest(inventory),'runtimeConsumers':[{k:c[k] for k in ['id','service','ownerId','running','imageRef','nanoCpus','memory']} for c in actual if c.get('project')==target_project(h) and c.get('service') in inventory['services']],'readyHTTP':'NOT VERIFIED','privatePortsOnly':True,'secretsPrinted':False}

def lifecycle(h):
 value,sha=artifact(h);path=getattr(h,'runtime_directory',lambda:h.ROOT/'staging')()/'tests/qa/cp019/target-lifecycle.py';entries=[x for x in value['entries'] if x['path']=='tests/qa/cp019/target-lifecycle.py'];check(len(entries)==1 and path.resolve()==path and path.is_file() and not path.is_symlink() and path.stat().st_size==entries[0]['bytes'] and digest(path.read_bytes())==entries[0]['sha256'],'TARGET_LIFECYCLE_PROVENANCE');spec=importlib.util.spec_from_file_location('cp020_target_lifecycle',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def stop_runtime(h):return lifecycle(h).stop_runtime(h)
def target_end(h):return lifecycle(h).target_end(h)
def worker_restart(h):return lifecycle(h).worker_restart(h)

def target_end_pair_path(h,cfg):
 restart=cfg.get('clockRestartContextHash');check(restart is None or isinstance(restart,str) and HASH.fullmatch(restart),'TARGET_RESTART_CONTEXT');return h.TARGET/'secrets'/('target-live-end-after-restart.json' if restart is not None else 'target-live-end.json')

def seal_acceptance_report(h,mode,m,bindings,job_id=None,proof=None):
 check(mode in ['target-history','target-write','target-negatives'],'TARGET_ACCEPTANCE_MODE');job_provenance(h,job_id,proof,['node','tests/qa/cp019/acceptance.mjs',mode]);path=h.TARGET/'evidence'/('acceptance-'+mode+'.json');before=path.lstat();mode_bits=before.st_mode&0o777;check(mode_bits in [0o400,0o600],'TARGET_ACCEPTANCE_REPORT_MODE');report,sha=read_private(path,999,262144,mode_bits)
 check(report.get('schema')=='cp019-acceptance-v1' and report.get('mode')==mode and report.get('project')==target_project(h) and report.get('sourceCommit')==bindings['sourceSha'] and report.get('generation')==m['target']['generation'] and report.get('runId')==m['recoveryId'] and report.get('status')=='PASS' and report.get('result',{}).get('status')=='PASS','TARGET_ACCEPTANCE_REPORT')
 if mode_bits==0o600:
  fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
  try:
   opened=os.fstat(fd);named=path.lstat();keys=('st_dev','st_ino','st_uid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns');check(all(getattr(before,k)==getattr(opened,k)==getattr(named,k) for k in keys),'TARGET_ACCEPTANCE_REPORT_CHANGED')
   with os.fdopen(fd,'rb',closefd=False) as f:raw=f.read(262145)
   check(len(raw)==before.st_size and digest(raw)==sha and all(getattr(opened,k)==getattr(os.fstat(fd),k)==getattr(path.lstat(),k) for k in keys),'TARGET_ACCEPTANCE_REPORT_CHANGED');os.fchmod(fd,0o400);os.fsync(fd)
  finally:os.close(fd)
  h.syncdir(path.parent)
 saved,rh=read400(path);check(saved==report and rh==sha,'TARGET_ACCEPTANCE_REPORT_READBACK');return saved,rh

def acceptance(h,mode):
 check(mode in ['target-history','target-write','target-negatives'],'TARGET_ACCEPTANCE_MODE');m,current,owners=own_current(h);m,base,bindings=bundle_context(h);inventory=runtime_inventory(h,m,base,bindings);check(set(inventory['services'])==set(BUSINESS),'TARGET_ACCEPTANCE_RUNTIME_REQUIRED');validate_runtime_receipt(read400(h.TARGET/'evidence/target-activation.json')[0],m,base,bindings,'activation');h.set_host_case(mode+'-env');h.enter_runtime_case('target-window',mode+'-env')
 for name,row in inventory['services'].items():
  c=h.inspect_container(row['containerId']);check(c['running'] and h.owned_identity(c,owners) and c['ownerId']==row['ownerId'] and c['service']==name,'TARGET_ACCEPTANCE_RUNTIME_CHANGED')
 path=h.TARGET/'evidence'/('acceptance-'+mode+'.json');command=['node','tests/qa/cp019/acceptance.mjs',mode]
 if path.exists() or path.is_symlink():
  matches=[]
  for candidate in (h.TARGET/'evidence/jobs').iterdir():
   if re.fullmatch('[0-9a-f-]{36}-created.json',candidate.name):
    created,ch=read400(candidate,0)
    if created.get('commandHash')==digest(command) and created.get('project')==target_project(h) and created.get('service')=='probe':matches.append((created,ch))
  check(len(matches)==1,'TARGET_ACCEPTANCE_ORIGINAL_JOB');created,ch=matches[0];ended,eh=read400(h.TARGET/'evidence/jobs'/(created['jobId']+'-end.json'),0);proof={'containerId':created['containerId'],'jobCreatedHash':ch,'jobEndHash':eh,'containerFIN':'PASS','sqlFIN':'NOT VERIFIED'};report,rh=seal_acceptance_report(h,mode,m,bindings,created['jobId'],proof);return {'result':'PASS FOR ORIGINAL HTTP REPORT ONLY','mode':mode,'reportHash':rh,'jobProof':proof,'reexecutedHTTP':False,'allL3Acceptance':'NOT VERIFIED','secretsPrinted':False}
 cfg,cfg_hash=read400(h.TARGET/'secrets/acceptance.json');check(cfg['project']==target_project(h) and cfg['sourceCommit']==bindings['sourceSha'] and cfg['generation']==m['target']['generation'] and cfg['recovery']=={'mode':'RECOVERY','runId':m['recoveryId'],'manifestHash':base['anchors']['manifestHash']},'TARGET_ACCEPTANCE_CONTEXT')
 job=h.create_job(h.TARGET,'probe',command,{'QA_PROJECT':target_project(h),'QA_CODE_SHA':bindings['sourceSha']},sample=False);h.start_job(job);output,proof=watch_job(h,job,lambda:None);result=json.loads(output);check(set(result)=={'type','mode','status','sourceCommit','secretsPrinted'} and result['type']=='cp019-acceptance' and result['mode']==mode and result['status']=='PASS' and result['sourceCommit']==bindings['sourceSha'] and result['secretsPrinted'] is False,'TARGET_ACCEPTANCE_RESULT');report,rh=seal_acceptance_report(h,mode,m,bindings,job['jobId'],proof);return {'result':'PASS FOR OWN HTTP SCENARIO ONLY','mode':mode,'reportHash':rh,'jobProof':proof,'allL3Acceptance':'NOT VERIFIED','secretsPrinted':False}
