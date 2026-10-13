"""Exclusive synthetic L2 cohort. No global proxy, network, daemon or build mutation."""
import hashlib, ipaddress, json, os, pathlib, pwd, secrets, subprocess, sys, time, tarfile, shutil, re
ROOT=pathlib.Path('/opt/mecanet-qa-p1l2-cp017')
PROJECT=ROOT.name
BASE='a0098178fc27467bf4c12da0e97723e0b80ce683'
APPROVAL='ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71'
def run(*args,**kwargs): return subprocess.check_output(args,text=True,**kwargs)
def compose(*args): return run('docker','compose','-f',str(ROOT/'compose.yaml'),*args)
def own():
 assert os.geteuid()==0 and ROOT.resolve()==ROOT
 owner=json.loads((ROOT/'owner.json').read_text())
 assert owner['project']==PROJECT and owner['owner']=='SrEdgarR/MECANET' and owner['base']==BASE and owner['approval']==APPROVAL
 return owner
def facts():
 ids=run('docker','ps','-aq').split()
 template='{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"image":{{json .Image}},"project":{{json (index .Config.Labels "com.docker.compose.project")}}}'
 return [{**x,'project':x.get('project') or ''} for x in [json.loads(line) for line in run('docker','inspect','--format',template,*ids).splitlines()]] if ids else []
def resources():
 mem=dict(line.split(':',1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
 available=int(mem['MemAvailable'].split()[0])//1024;v=os.statvfs('/');free=v.f_bavail*v.f_frsize
 assert available-2048>=3072 and free>max(15*1024**3,v.f_blocks*v.f_frsize*.1),'QA_CAPACITY_ABORT'
 def cpu():return list(map(int,pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
 a=cpu();time.sleep(2);b=cpu();d=[y-x for x,y in zip(a,b)];busy=100*(1-(d[3]+d[4])/sum(d))
 assert busy<80,'QA_CPU_ABORT'
 return {'availableMiB':available,'diskFreeBytes':free,'cpuBusyPercent':round(busy,2),'sampleSeconds':2,'capacityGeneralVerified':False}
def preflight():
 assert os.geteuid()==0 and os.uname().machine=='aarch64' and ROOT.resolve()==ROOT and not ROOT.exists(),'QA_TARGET_ABORT'
 before=facts();assert not any(x['project']==PROJECT for x in before)
 assert all(not x['running'] for x in before if x['project'] in ['mecanet-qa-p1l1','mecanet-qa-p1l1-cp014']),'PREVIOUS_COHORT_ACTIVE'
 ids=run('docker','network','ls','-q').split();networks=json.loads(run('docker','network','inspect',*ids)) if ids else []
 target=[ipaddress.ip_network('10.77.51.0/24'),ipaddress.ip_network('10.77.52.0/24')]
 for network in networks:
  for config in network['IPAM'].get('Config') or []:
   if config.get('Subnet'):
    subnet=ipaddress.ip_network(config['Subnet']);assert not any(subnet.version==t.version and subnet.overlaps(t) for t in target),'QA_NETWORK_CONFLICT'
 pins={'node':'sha256:ba6b7d0ee561d9d49deb99e2b93c98632cc287b6cca1a6b18d66127054efa4dc','postgres':'sha256:67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129','nginx':'sha256:3abad30db61dfb2a339ea21acc9f3e6bbe78e291fcff2f835f4510c8fdfcbd83'}
 for image,digest in pins.items():
  assert run('docker','image','inspect','--format','{{.Architecture}}',image+'@'+digest).strip()=='arm64','QA_IMAGE_CHAIN_ABORT'
 return {'result':'PASS','time':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'base':BASE,'approval':APPROVAL,'architecture':'aarch64','resources':resources(),'before':before,'pins':pins,'limits':{'cpu':1,'memoryMiB':2048,'maxConnections':60},'entry':'exclusive UNIX socket / SSH loopback TLS; no public TCP','dataClass':'synthetic','secretsPrinted':False}
def bootstrap():
 proof=preflight()
 for folder in ['config','secrets','tls/postgres','tls/web','data','staging','artifacts','evidence','ingress','faults/api1','faults/api2','faults/worker','backup','journal','restore']:
  (ROOT/folder).mkdir(parents=True,exist_ok=False);os.chmod(ROOT/folder,0o700)
 os.chmod(ROOT,0o711);os.chmod(ROOT/'staging',0o755);os.chmod(ROOT/'artifacts',0o755)
 os.chown(ROOT/'ingress',101,pwd.getpwnam('ubuntu').pw_gid);os.chmod(ROOT/'ingress',0o770)
 for folder in ['data','secrets','evidence','faults','faults/api1','faults/api2','faults/worker','journal']:
  os.chown(ROOT/folder,999,999)
 (ROOT/'owner.json').write_text(json.dumps({'project':PROJECT,'owner':'SrEdgarR/MECANET','base':BASE,'approval':APPROVAL,'state':'TEMPORARY'}))
 (ROOT/'evidence/preflight.json').write_text(json.dumps(proof));os.chmod(ROOT/'evidence/preflight.json',0o600)
 (ROOT/'secrets/bootstrap').write_text(secrets.token_urlsafe(48));os.chmod(ROOT/'secrets/bootstrap',0o400);os.chown(ROOT/'secrets/bootstrap',999,999)
 def openssl(*args):subprocess.run(['openssl',*args],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 openssl('req','-x509','-newkey','rsa:3072','-nodes','-keyout',str(ROOT/'tls/ca.key'),'-out',str(ROOT/'tls/ca.crt'),'-days','7','-subj','/CN=Mecanet CP017 private synthetic QA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign')
 for service,cn,san,uid in [('postgres','postgres','DNS:postgres',999),('web','app.mecanet.test','DNS:app.mecanet.test',101)]:
  d=ROOT/'tls'/service
  openssl('req','-newkey','rsa:3072','-nodes','-keyout',str(d/'server.key'),'-out',str(d/'server.csr'),'-subj','/CN='+cn)
  (d/'extensions').write_text('subjectAltName='+san+'\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nbasicConstraints=critical,CA:FALSE\n')
  openssl('x509','-req','-in',str(d/'server.csr'),'-CA',str(ROOT/'tls/ca.crt'),'-CAkey',str(ROOT/'tls/ca.key'),'-CAcreateserial','-out',str(d/'server.crt'),'-days','7','-extfile',str(d/'extensions'))
  os.chmod(d,0o755);os.chmod(d/'server.key',0o400);os.chown(d/'server.key',uid,uid);os.chmod(d/'server.crt',0o444)
 (ROOT/'config/ca.crt').write_bytes((ROOT/'tls/ca.crt').read_bytes());os.chmod(ROOT/'config/ca.crt',0o444)
 print(json.dumps({'result':'PASS','resources':proof['resources'],'project':PROJECT,'ownResourceCreated':True,'secretsPrinted':False}))
def preserve():
 own();before=json.loads((ROOT/'evidence/preflight.json').read_text())['before'];now=facts()
 assert all(x in now for x in before),'OTHER_CONSUMER_CHANGED'
 print(json.dumps({'result':'PASS','preservedOtherConsumers':len(before),'ownContainers':sum(x['project']==PROJECT for x in now)}))
def configure():
 own();assert not (ROOT/'compose.yaml').exists();source=pathlib.Path('/tmp/mecanet-cp017-config')
 text=(source/'compose.yaml').read_text().replace('mecanet-qa-p1l1',PROJECT).replace(str(ROOT/'release'),str(ROOT/'staging')).replace('10.77.31','10.77.51').replace('10.77.32','10.77.52')
 text=text.replace('command: [node, tests/qa/entry.mjs]','command: [node, tests/qa/cp017/entry.mjs]\n    environment: {QA_INSTANCE: api1, QA_PROJECT: '+PROJECT+'}')
 text=text.replace('  api2: *api','  api2:\n    <<: *api\n    environment: {QA_INSTANCE: api2, QA_PROJECT: '+PROJECT+'}\n    networks: {front: {ipv4_address: 10.77.52.4}, data: {}}')
 text=text.replace('    networks: [data, front]','    networks: {front: {ipv4_address: 10.77.52.3}, data: {}}')
 text=text.replace('command: [node, tests/qa/prepare.mjs]','command: [node, tests/qa/cp017/prepare.mjs]\n    environment: {QA_PROJECT: '+PROJECT+'}')
 text=text.replace('command: [node, tests/qa/worker.mjs]','command: [node, tests/qa/cp017/worker.mjs]\n    environment: {QA_PROJECT: '+PROJECT+'}')
 text=text.replace('      - '+str(ROOT)+'/secrets/api.json:/run/qa-secrets/api.json:ro','      - '+str(ROOT)+'/secrets/api.json:/run/qa-secrets/api.json:ro\n      - '+str(ROOT)+'/faults:/run/qa-faults')
 text=text.replace('      - '+str(ROOT)+'/secrets/worker.json:/run/qa-secrets/worker.json:ro','      - '+str(ROOT)+'/secrets/worker.json:/run/qa-secrets/worker.json:ro\n      - '+str(ROOT)+'/faults:/run/qa-faults')
 probe='''  probe:
    profiles: [tools]
    image: node@sha256:ba6b7d0ee561d9d49deb99e2b93c98632cc287b6cca1a6b18d66127054efa4dc
    platform: linux/arm64
    user: "999:999"
    group_add: ["1001"]
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    cpus: 0.05
    mem_limit: 128m
    pids_limit: 64
    working_dir: /workspace
    environment: {QA_PROJECT: mecanet-qa-p1l2-cp017}
    volumes:
      - ROOT/staging:/workspace:ro
      - ROOT/secrets:/run/qa-secrets:ro
      - ROOT/config/ca.crt:/run/qa-ca.crt:ro
      - ROOT/ingress:/run/qa-ingress:ro
      - ROOT/faults:/run/qa-faults
      - ROOT/evidence:/run/qa-results
      - ROOT/journal:/run/qa-journal
    tmpfs: ["/tmp:size=16m"]
    networks: [data]
    logging:
      driver: json-file
      options: {max-size: 8m, max-file: "2"}
'''.replace('ROOT',str(ROOT))
 text=text.replace('\nnetworks:\n','\n'+probe+'networks:\n')
 assert '/opt/mecanet-qa-p1l1' not in text and 'ports:' not in text and 'build:' not in text
 (ROOT/'compose.yaml').write_text(text)
 config=(source/'postgresql.conf').read_text();(ROOT/'config/postgresql.conf').write_text(config)
 hba=(source/'pg_hba.conf').read_text().replace('10.77.31','10.77.51')
 hba=hba.replace('saas_reconciler 10.77','saas_reconciler,saas_writer_maintenance 10.77').replace('saas_tenant_a 10.77','saas_tenant_a,saas_writer_a,saas_maintainer_a 10.77').replace('saas_tenant_b 10.77','saas_tenant_b,saas_writer_b,saas_maintainer_b 10.77')
 (ROOT/'config/pg_hba.conf').write_text(hba)
 nginx=(source/'nginx.conf').read_text().replace('/catalogo$','/(?:catalogo|inventario)$')
 server=nginx[nginx.index(' server {'):nginx.rfind('\n}')]
 extra=''.join(server.replace('web.sock',instance+'.sock').replace('proxy_pass http://api;','proxy_pass http://'+instance+':3000;')+'\n' for instance in ['api1','api2'])
 (ROOT/'config/nginx.conf').write_text(nginx[:nginx.rfind('\n}')]+extra+'\n}\n')
 for name in ['postgresql.conf','pg_hba.conf','nginx.conf']:os.chmod(ROOT/'config'/name,0o444)
 compose('config','--quiet');print('CP017_CONFIG_VALID_NO_PUBLIC_PORT')
def start_postgres():
 own();resources();compose('up','-d','--no-build','--pull','never','postgres')
 pg=compose('ps','-q','postgres').strip();assert pg
 for _ in range(30):
  try:
   command='export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d postgres -At -v ON_ERROR_STOP=1'
   value=run('docker','exec','-i',pg,'sh','-c',command,input='SELECT system_identifier::text FROM pg_control_system();').strip()
   assert value.isdecimal() and 10<=len(value)<=24
   (ROOT/'evidence/system-id').write_text(value);os.chmod(ROOT/'evidence/system-id',0o444)
   print(json.dumps({'postgresStarted':True,'systemIdentifier':value,'ownProject':PROJECT}));return
  except subprocess.CalledProcessError:time.sleep(1)
 raise AssertionError('OWN_POSTGRES_NOT_READY')

def accept_artifact():
 own();archive=pathlib.Path('/tmp/mecanet-cp017-artifact.tar.gz');manifest=json.loads(pathlib.Path('/tmp/mecanet-cp017-artifact.json').read_text())
 assert len(manifest['codeSha'])==40 and manifest['digest'].startswith('sha256:')
 assert all(not x['running'] for x in facts() if x['project']==PROJECT and not x['name'].endswith('-postgres-1')),'STOP_OWN_RUNTIME_FIRST'
 destination=ROOT/'artifacts'/manifest['digest'].split(':')[1]
 assert destination.parent.resolve()==ROOT/'artifacts'
 expected={e['path']:e for e in manifest['entries']};assert len(expected)==len(manifest['entries'])
 if destination.exists():
  stored=json.loads((destination/'artifact.json').read_text());assert stored==manifest
 else:destination.mkdir(mode=0o755)
 with tarfile.open(archive,'r:gz') as bundle:
  members=bundle.getmembers();assert len(members)==len(expected)
  for m in members:
   assert m.name in expected and m.isfile() and not m.issym() and not m.islnk() and m.size==expected[m.name]['bytes']
   assert m.name.startswith(('server/saas/','tests/qa/','client/dist-saas/')) and '..' not in pathlib.PurePosixPath(m.name).parts
   content=bundle.extractfile(m).read();assert hashlib.sha256(content).hexdigest()==expected[m.name]['sha256']
   p=destination/m.name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(content);os.chmod(p,0o444)
 digest=hashlib.sha256(''.join(e['sha256']+'  '+e['path']+'\n' for e in manifest['entries']).encode()).hexdigest();assert manifest['digest']=='sha256:'+digest
 (destination/'artifact.json').write_text(json.dumps(manifest));os.chmod(destination/'artifact.json',0o444)
 for d,sub,files in os.walk(destination):os.chmod(d,0o755)
 config=(ROOT/'compose.yaml').read_text();config=config.replace(str(ROOT/'staging'),str(destination))
 config=re.sub(re.escape(str(ROOT/'artifacts'))+r'/[0-9a-f]{64}',str(destination),config)
 assert len(set(re.findall(re.escape(str(ROOT/'artifacts'))+r'/([0-9a-f]{64})',config)))==1
 assert manifest['digest'].split(':')[1] in config
 (ROOT/'compose.yaml').write_text(config)
 compose('config','--quiet');(ROOT/'evidence/artifact.json').write_text(json.dumps({'digest':manifest['digest'],'codeSha':manifest['codeSha'],'files':len(expected),'bytes':sum(e['bytes']for e in expected.values()),'verified':True,'runtime':manifest['runtime']}))
 print(json.dumps({'artifactAccepted':True,'codeSha':manifest['codeSha'],'digest':manifest['digest'],'files':len(expected)}))

def own_tool():
 own();assert len(sys.argv)>=3 and sys.argv[2] in ['foundation','migration','sql','integration','recovery-check','corrective','resources-api1','resources-api2','promote','quota','revocation','quota-boundary','quota-growth','read-closure']
 action=sys.argv[2];live=any(x['running'] for x in facts() if x['project']==PROJECT and x['name'].endswith(('-api1-1','-api2-1','-web-1')))
 service='probe' if action in ['sql','integration','revocation','recovery-check'] or action=='quota' and (len(sys.argv)<5 or sys.argv[4]!='closed') else 'harness';assert service=='probe' or not live,'HARNESS_RUNTIME_OVERLAP'
 artifact=json.loads((ROOT/'evidence/artifact.json').read_text())
 files={'foundation':'prepare.mjs','migration':'migration-live.mjs','sql':'sql-live.mjs','integration':'integration.mjs','recovery-check':'recovery-check.mjs','corrective':'corrective.mjs','resources-api1':'resource-closure.mjs','resources-api2':'resource-closure.mjs','promote':'promote.mjs','quota':'quota-live.mjs','revocation':'revocation-live.mjs','quota-boundary':'quota-boundary.mjs','quota-growth':'quota-growth-boundary.mjs','read-closure':'read-closure.mjs'}
 args=['run','--rm','--no-deps','-e','QA_CODE_SHA='+artifact['codeSha']]
 if action=='foundation':args+=['-e','QA_STAGE=foundation']
 if action=='quota':
  assert len(sys.argv)>=4 and sys.argv[3] in ['privileges','unicode','last-product','last-byte','debt'];args+=['-e','QA_QUOTA_PHASE='+sys.argv[3]]
  if len(sys.argv)==5:
   assert sys.argv[4] in ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];args+=['-e','QA_QUOTA_TENANT='+sys.argv[4]]
  elif len(sys.argv)>5:
   assert sys.argv[4]=='closed' and len(sys.argv)==7 and re.fullmatch('[a-f0-9-]{36}',sys.argv[5]) and re.fullmatch('[a-f0-9-]{36}',sys.argv[6]);args+=['-e','QA_QUOTA_PREPARE=closed','-e','QA_QUOTA_TENANT='+sys.argv[5],'-e','QA_QUOTA_RESTRICTION='+sys.argv[6]]
 # Add only the exclusive synthetic result destination; no shared host mount.
 args+=['-v',str(ROOT/'evidence')+':/run/qa-results',service,'node','tests/qa/cp017/'+files[action]]
 if action.startswith('resources-'):args+=['host-end-proof-'+action.split('-')[1]+'.json']
 if action=='revocation':
  assert len(sys.argv)==4 and sys.argv[3] in ['share-logout','membership','identity','capture-rotation','verify-rotation','capture-epoch','verify-epoch','block-tenant-b','drain'];args+=[sys.argv[3]]
 if action=='quota-boundary':
  assert len(sys.argv)==4 and sys.argv[3] in ['tenant','global'];args+=[sys.argv[3]]
 try:print(compose(*args),end='')
 except subprocess.CalledProcessError as error:
  print(error.output,end='');raise SystemExit(error.returncode)

def foundation_backup():
 own();assert not any(x['running'] for x in facts() if x['project']==PROJECT and x['name'].endswith(('-api1-1','-api2-1','-worker-1')))
 destination=ROOT/'backup/foundation';assert destination.resolve()==ROOT/'backup/foundation' and not destination.exists()
 compose('stop','postgres');shutil.copytree(ROOT/'data',destination)
 pairs=[]
 for p in sorted(destination.rglob('*')):
  if p.is_file():pairs.append({'path':str(p.relative_to(destination)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 digest=hashlib.sha256(json.dumps(pairs,separators=(',',':')).encode()).hexdigest()
 (ROOT/'backup/foundation-manifest.json').write_text(json.dumps({'files':pairs,'digest':digest,'scope':'private L1 synthetic cluster before writer migration','offline':True}));os.chmod(ROOT/'backup/foundation-manifest.json',0o600)
 compose('up','-d','--no-build','--pull','never','postgres');print(json.dumps({'foundationBackup':True,'files':len(pairs),'digest':digest,'productionData':False}))

def finish_config():
 own();q=json.loads((ROOT/'secrets/connections.json').read_text());signing=(ROOT/'secrets/session-signing').read_text();c=q['connections']
 api={'control':c['saas_api'],'sessions':c['saas_session'],'issuer':c['saas_issuer'],'sessionSecret':signing,'generation':q['generation'],'entries':q['entries'],'writerEntries':q['writerEntries']}
 worker={'connection':c['saas_clock'],'generation':q['generation'],'maintenanceConnection':q['writerMaintenance'],'maintenanceEntries':q['maintenanceEntries'],'clockTransfer':{'kind':'first-start','previousOwner':q['clockOwner'],'generation':q['generation'],'confirmed':True,'reference':'cp017-exclusive-foundation-first-start'}}
 for name,value in [('api.json',api),('worker.json',worker)]:
  p=ROOT/'secrets'/name;assert not p.exists();p.write_text(json.dumps(value));os.chmod(p,0o400);os.chown(p,999,999)
 folder=ROOT/'faults/worker';folder.mkdir(mode=0o700,exist_ok=True);os.chown(folder,999,999)
 print('CP017_RUNTIME_PRIVATE_ROLES_CONFIGURED_NO_SECRET_OUTPUT')

def runtime():
 own();resources();compose('up','-d','--no-build','--pull','never','worker','api1','api2','web');preserve()

def container_artifact(cid):
 mounts=json.loads(run('docker','inspect','--format','{{json .Mounts}}',cid));source=next(m['Source'] for m in mounts if m['Destination']=='/workspace')
 assert re.fullmatch(re.escape(str(ROOT/'artifacts'))+'/[a-f0-9]{64}',source)
 manifest=json.loads((pathlib.Path(source)/'artifact.json').read_text());assert manifest['digest']=='sha256:'+pathlib.Path(source).name
 return manifest

def prove_stop():
 own();assert len(sys.argv)==3 and sys.argv[2] in ['api1','api2'];instance=sys.argv[2]
 cid=compose('ps','-q',instance).strip();assert re.fullmatch(r'[0-9a-f]{64}',cid)
 record=json.loads(run('docker','exec',cid,'cat','/tmp/qa-owner.json'))
 assert re.fullmatch(r'[0-9a-f-]{36}',record['owner'])
 compose('stop',instance)
 state=json.loads(run('docker','inspect','--format','{{json .State}}',cid))
 assert not state['Running'] and state['Status']=='exited'
 proof={'project':PROJECT,'sourceSha':container_artifact(cid)['codeSha'],
  'generation':record['generation'],'instance':instance,'owner':record['owner'],'containerId':cid,'running':False,'exitCode':state['ExitCode'],
  'containerStoppedAt':state['FinishedAt'],'httpClosed':True,'writerApplicationName':'mecanet-writer:'+record['owner']}
 pg=compose('ps','-q','postgres').strip()
 command='export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -qAt -v ON_ERROR_STOP=1'
 # Only fixed SQL with host-generated UUIDs, no credentials or HTTP input.
 sql="BEGIN READ ONLY; SELECT json_build_object('absent',NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name IN ('mecanet-writer:"+record['owner']+"','mecanet-qa-api:"+record['owner']+"')),'operations',(SELECT coalesce(json_agg(json_build_object('tenantId',i.tenant_id,'operationId',i.operation_id,'ticketId',i.ticket_id)),'[]') FROM saas.write_intents i JOIN saas.tickets t ON t.id=i.ticket_id WHERE t.owner='"+record['owner']+"'::uuid AND i.generation='"+record['generation']+"'::uuid)); ROLLBACK;"
 observed=json.loads(run('docker','exec','-i',pg,'sh','-c',command,input=sql).strip());assert observed['absent'] is True,'SQL_OWNER_STILL_PRESENT'
 proof.update({'sqlOwnerAbsent':True,'operations':observed['operations']})
 p=ROOT/'evidence'/('host-end-proof-'+instance+'.json');p.write_text(json.dumps(proof));os.chmod(p,0o400);os.chown(p,999,999)
 print(json.dumps({'instance':instance,'owner':record['owner'],'processExitProven':True,'sqlOwnerAbsent':True,'operations':len(proof['operations'])}))

def close_writers():
 own();assert len(sys.argv)==3 and sys.argv[2] in ['POLICY','RESTORE'];reason=sys.argv[2]
 pg=compose('ps','-q','postgres').strip();assert pg
 command='export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -qAt -v ON_ERROR_STOP=1'
 generation=json.loads((ROOT/'secrets/connections.json').read_text())['generation'];assert re.fullmatch('[a-f0-9-]{36}',generation)
 sql="SELECT saas.request_write_restriction(gen_random_uuid(),NULL,NULL,w.tenant_id,NULL,'"+generation+"'::uuid,'"+reason+"') IS NOT NULL FROM saas.tenant_writer_state w WHERE state='OPEN';"
 run('docker','exec','-i',pg,'sh','-c',command,input=sql)
 for _ in range(40):
  closed=run('docker','exec','-i',pg,'sh','-c',command,input="BEGIN READ ONLY; SELECT count(*) FROM saas.tenant_writer_state w WHERE w.state='CLOSED' AND EXISTS(SELECT 1 FROM saas.write_restriction_tenants t JOIN saas.write_restrictions r ON r.id=t.restriction_id WHERE t.tenant_id=w.tenant_id AND t.closed_version=w.writer_version AND t.close_proven AND t.stage='ACKNOWLEDGED' AND r.status='ACKNOWLEDGED'); ROLLBACK;").strip()
  if closed=='2':print('CP017_BOTH_WRITERS_EXCLUSIVE_CLOSE_ACKNOWLEDGED');return
  time.sleep(.2)
 raise AssertionError('WRITER_CLOSE_NOT_ACKNOWLEDGED')

def corrective_proof():
 own();apis=[]
 for instance in ['api1','api2']:
  proof=json.loads((ROOT/'evidence'/('host-end-proof-'+instance+'.json')).read_text())
  state=json.loads(run('docker','inspect','--format','{{json .State}}',proof['containerId']))
  assert not state['Running'] and state['Status']=='exited'
  apis.append({'instance':instance,'state':'exited','containerId':proof['containerId'],'stoppedSourceSha':proof['sourceSha']})
 q=json.loads((ROOT/'secrets/connections.json').read_text());manifest=json.loads((ROOT/'evidence/artifact.json').read_text())
 p=ROOT/'evidence/corrective-proof.json';p.write_text(json.dumps({'project':PROJECT,'sourceSha':manifest['codeSha'],'systemIdentifier':q['systemIdentifier'],'generation':q['generation'],'observedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'apis':apis}));os.chmod(p,0o400);os.chown(p,999,999)
 history={'acceptedArtifacts':[]}
 for directory in (ROOT/'artifacts').iterdir():
  if directory.is_dir() and re.fullmatch('[0-9a-f]{64}',directory.name):
   a=json.loads((directory/'artifact.json').read_text());assert a['digest']=='sha256:'+directory.name
   history['acceptedArtifacts'].append({'codeSha':a['codeSha'],'digest':a['digest']})
 p=ROOT/'evidence/artifact-history.json';p.write_text(json.dumps(history));os.chmod(p,0o400);os.chown(p,999,999)
 print('CP017_CORRECTIVE_STOP_PROOF_VERIFIED_NO_SECRET_OUTPUT')

def pause_own():
 own();assert all(not x['running'] for x in facts() if x['project']==PROJECT and x['name'].endswith(('-api1-1','-api2-1')))
 compose('stop','worker','web');preserve()

def restart_proof():
 own();cid=compose('ps','--all','-q','worker').strip();assert re.fullmatch(r'[0-9a-f]{64}',cid)
 state=json.loads(run('docker','inspect','--format','{{json .State}}',cid));assert not state['Running'] and state['Status']=='exited'
 pg=compose('ps','-q','postgres').strip()
 command='export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -qAt -v ON_ERROR_STOP=1'
 observed=json.loads(run('docker','exec','-i',pg,'sh','-c',command,input="BEGIN READ ONLY; SELECT json_build_object('owner',owner,'generation',generation,'absent',NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name IN ('mecanet-cp017-clock','mecanet-cp017-maintenance'))) FROM saas.time_authority WHERE id=1; ROLLBACK;").strip())
 assert observed['absent'] is True and re.fullmatch(r'[0-9a-f-]{36}',observed['owner'])
 p=ROOT/'secrets/worker.json';worker=json.loads(p.read_text());assert worker['generation']==observed['generation']
 worker['clockTransfer']={'kind':'stopped-process','previousOwner':observed['owner'],'generation':observed['generation'],'confirmed':True,'reference':'cp017-own-worker-stopped-sql-absent','containerId':cid,'observedState':'exited','stoppedAt':state['FinishedAt']}
 p.write_text(json.dumps(worker));os.chmod(p,0o400);os.chown(p,999,999)
 print('CP017_CLOCK_RESTART_PROCESS_AND_SQL_END_PROVEN')

def promotion_proof():
 own();apis=[]
 assert all(not x['running'] for x in facts() if x['project']==PROJECT and not x['name'].endswith('-postgres-1')),'PROMOTION_RUNTIME_ACTIVE'
 for instance in ['api1','api2']:
  p=json.loads((ROOT/'evidence'/('host-end-proof-'+instance+'.json')).read_text())
  state=json.loads(run('docker','inspect','--format','{{json .State}}',p['containerId']))
  assert not state['Running'] and state['Status']=='exited' and p['httpClosed'] and p['sqlOwnerAbsent']
  apis.append({**{k:p[k] for k in ['instance','containerId','owner','httpClosed','sqlOwnerAbsent','writerApplicationName']},'state':'exited','stoppedSourceSha':p['sourceSha']})
 assert len({p['owner'] for p in apis})==2 and len({p['containerId'] for p in apis})==2
 pg=compose('ps','-q','postgres').strip();assert pg
 command='export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -qAt -v ON_ERROR_STOP=1'
 absent=run('docker','exec','-i',pg,'sh','-c',command,input="BEGIN READ ONLY; SELECT count(*) FROM pg_stat_activity WHERE usename LIKE 'saas_%'; ROLLBACK;").strip();assert absent=='0','PROMOTION_SQL_OWNER_ALIVE'
 q=json.loads((ROOT/'secrets/connections.json').read_text());a=json.loads((ROOT/'evidence/artifact.json').read_text())
 p=ROOT/'evidence/operational-host-proof.json';p.write_text(json.dumps({'project':PROJECT,'sourceSha':a['codeSha'],'generation':q['generation'],'systemIdentifier':q['systemIdentifier'],'apis':apis,'workerStopped':True,'webStopped':True,'observedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}));os.chmod(p,0o400);os.chown(p,999,999)
 print('CP017_PROMOTION_PROCESS_AND_SQL_END_PROVEN')

def refresh_config():
 own();assert all(not x['running'] for x in facts() if x['project']==PROJECT and not x['name'].endswith('-postgres-1'))
 q=json.loads((ROOT/'secrets/connections.json').read_text())
 for name,fields in [('api.json',['entries','writerEntries']),('worker.json',['maintenanceEntries'])]:
  p=ROOT/'secrets'/name;old=json.loads(p.read_text());assert old['generation']==q['generation']
  for key in fields:old[key]=q[key]
  p.write_text(json.dumps(old));os.chmod(p,0o400);os.chown(p,999,999)
 print('CP017_OWN_RUNTIME_CONFIGURATION_REFRESHED_NO_SECRET_OUTPUT')

def operational_promotion():
 own();assert all(not x['running'] for x in facts() if x['project']==PROJECT and not x['name'].endswith('-postgres-1'))
 assert len(sys.argv)>=4 and sys.argv[2] in ['prepare','promote'] and sys.argv[3] in ['POLICY','ROTATION','EPOCH']
 a=json.loads((ROOT/'evidence/artifact.json').read_text());args=['run','--rm','--no-deps','-e','QA_CODE_SHA='+a['codeSha']]
 if sys.argv[2]=='prepare':
  assert len(sys.argv)>=5 and re.fullmatch('[a-f0-9-]{36}',sys.argv[4]);args+=['-e','QA_PROMOTION_RESTRICTION='+sys.argv[4]]
  if sys.argv[3]=='POLICY':
   assert len(sys.argv) in [6,7] and sys.argv[5] in ['last-product','last-byte','debt'];args+=['-e','QA_QUOTA_PHASE='+sys.argv[5]]
   if len(sys.argv)==7:
    assert re.fullmatch('[a-f0-9-]{36}',sys.argv[6]);args+=['-e','QA_QUOTA_RETAINED_OPERATION='+sys.argv[6]]
  else:assert len(sys.argv)==5
 else:assert len(sys.argv)==4
 args+=['-v',str(ROOT/'evidence')+':/run/qa-results','harness','node','tests/qa/cp017/promotion.mjs',sys.argv[2],sys.argv[3]]
 try:print(compose(*args),end='')
 except subprocess.CalledProcessError as e:print(e.output,end='');raise SystemExit(e.returncode)

def rollback_target():
 own();assert len(sys.argv)==3 and re.fullmatch('sha256:[a-f0-9]{64}',sys.argv[2])
 assert all(not x['running'] for x in facts() if x['project']==PROJECT and not x['name'].endswith('-postgres-1')),'ROLLBACK_RUNTIME_ACTIVE'
 current=json.loads((ROOT/'evidence/artifact.json').read_text());target=ROOT/'artifacts'/sys.argv[2].split(':')[1];assert target.resolve().parent==ROOT/'artifacts'
 desired=json.loads((target/'artifact.json').read_text());assert desired['digest']==sys.argv[2]
 latest=json.loads((ROOT/'artifacts'/current['digest'].split(':')[1]/'artifact.json').read_text());expected=[e for e in latest['entries'] if e['path'].startswith('server/saas/db/migrations/')]
 names=['001-control.sql','002-tenant.sql','003-control-writers.sql','003-tenant-writers.sql','004-tenant-writers-fix.sql'];assert len(expected)==len(names) and {e['path'].split('/')[-1] for e in expected}==set(names)
 assert len([e for e in desired['entries'] if e['path'].startswith('server/saas/db/migrations/')])==len(names)
 for entry in expected:assert any(e['path']==entry['path'] and e['sha256']==entry['sha256'] for e in desired['entries']),'ROLLBACK_SCHEMA_INCOMPATIBLE'
 config=json.loads(compose('--profile','*','config','--format','json'))
 for service in ['api1','api2','web']:
  for volume in config['services'][service]['volumes']:
   old=volume.get('source','')
   if old.startswith(str(ROOT/'artifacts')+'/'):
    suffix=re.sub('^'+re.escape(str(ROOT/'artifacts'))+'/[a-f0-9]{64}','',old);volume['source']=str(target)+suffix
 (ROOT/'compose.yaml').write_text(json.dumps(config));compose('config','--quiet')
 q=json.loads((ROOT/'secrets/connections.json').read_text());proof={'project':PROJECT,'generation':q['generation'],'schemaCompatible':True,'runtimeDigest':desired['digest'],'runtimeSourceSha':desired['codeSha'],'controllerSourceSha':current['codeSha'],'apis':[{'instance':i,'sourceSha':desired['codeSha']} for i in ['api1','api2']]}
 p=ROOT/'evidence/rollback-runtime-proof.json';p.write_text(json.dumps(proof));os.chmod(p,0o400);os.chown(p,999,999)
 print(json.dumps({'ownCompatibleRuntimeTarget':desired['codeSha'],'digest':desired['digest'],'schemaVersion':2,'noProcessStarted':True}))

def rollback_tool():
 own();assert len(sys.argv)==3 and sys.argv[2] in ['capture','rollback','forward'];a=json.loads((ROOT/'evidence/artifact.json').read_text())
 proof=json.loads((ROOT/'evidence/rollback-runtime-proof.json').read_text())
 actualApis=[]
 for instance in ['api1','api2']:
  cid=compose('ps','-q',instance).strip();assert re.fullmatch('[a-f0-9]{64}',cid)
  actual=container_artifact(cid);assert actual['codeSha']==proof['runtimeSourceSha'] and actual['digest']==proof['runtimeDigest']
  actualApis.append({'instance':instance,'containerId':cid,'running':True,'sourceSha':actual['codeSha']})
 proof['apis']=actualApis;p=ROOT/'evidence/rollback-runtime-proof.json';p.write_text(json.dumps(proof));os.chmod(p,0o400);os.chown(p,999,999)
 print(compose('run','--rm','--no-deps','-e','QA_CODE_SHA='+a['codeSha'],'-v',str(ROOT/'evidence')+':/run/qa-results','-v',str(ROOT/'journal')+':/run/qa-journal','probe','node','tests/qa/cp017/rollback.mjs',sys.argv[2]),end='')

def metadata_tool():
 own();assert len(sys.argv)==3 and sys.argv[2] in ['closed','pools'];a=json.loads((ROOT/'evidence/artifact.json').read_text())
 live=any(x['running'] for x in facts() if x['project']==PROJECT and x['name'].endswith(('-api1-1','-api2-1','-web-1')))
 assert live if sys.argv[2]=='pools' else not live
 service='probe' if live else 'harness'
 try:print(compose('run','--rm','--no-deps','-e','QA_CODE_SHA='+a['codeSha'],'-v',str(ROOT/'evidence')+':/run/qa-results',service,'node','tests/qa/cp017/metadata-live.mjs',sys.argv[2]),end='')
 except subprocess.CalledProcessError as e:print(e.output,end='');raise SystemExit(e.returncode)

def repair_tool_profiles():
 own();config=json.loads(compose('--profile','*','config','--format','json'));assert set(config['services'])=={'postgres','api1','api2','web','worker'},'REPAIR_ONLY_MISSING_OWN_PROFILES'
 a=json.loads((ROOT/'evidence/artifact.json').read_text());source=str(ROOT/'artifacts'/a['digest'].split(':')[1])
 for name in ['harness','probe']:
  service={'profiles':['tools'],'image':'node@sha256:ba6b7d0ee561d9d49deb99e2b93c98632cc287b6cca1a6b18d66127054efa4dc','platform':'linux/arm64','user':'999:999','read_only':True,'cap_drop':['ALL'],'security_opt':['no-new-privileges:true'],'cpus':.25 if name=='harness' else .05,'mem_limit':'128m','pids_limit':64,'working_dir':'/workspace','environment':{'QA_PROJECT':PROJECT},'networks':['data'],'tmpfs':['/tmp:size=16m'],'volumes':[source+':/workspace:ro',str(ROOT/'secrets')+':/run/qa-secrets'+('' if name=='harness' else ':ro'),str(ROOT/'config/ca.crt')+':/run/qa-ca.crt:ro',str(ROOT/'evidence')+':/run/qa-results',str(ROOT/'journal')+':/run/qa-journal']}
  if name=='probe':service['group_add']=['1001'];service['volumes']+=[str(ROOT/'ingress')+':/run/qa-ingress:ro',str(ROOT/'faults')+':/run/qa-faults']
  config['services'][name]=service
 (ROOT/'compose.yaml').write_text(json.dumps(config));compose('--profile','*','config','--quiet');preserve();print('CP017_ONLY_MISSING_OWN_TOOL_PROFILES_RESTORED')

def recovery_proof():
 own();apis=[]
 assert all(not x['running'] for x in facts() if x['project']==PROJECT and not x['name'].endswith('-postgres-1')),'RESTORE_SOURCE_RUNTIME_ACTIVE'
 for instance in ['api1','api2']:
  p=json.loads((ROOT/'evidence'/('host-end-proof-'+instance+'.json')).read_text());s=json.loads(run('docker','inspect','--format','{{json .State}}',p['containerId']));assert not s['Running'] and s['Status']=='exited'
  apis.append({'instance':instance,'containerId':p['containerId'],'state':'exited','stoppedSourceSha':p['sourceSha']})
 pg=compose('ps','-q','postgres').strip();assert pg
 command='export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -qAt -v ON_ERROR_STOP=1'
 n=run('docker','exec','-i',pg,'sh','-c',command,input="BEGIN READ ONLY; SELECT count(*) FROM pg_stat_activity WHERE usename LIKE 'saas_%'; ROLLBACK;").strip();assert n=='0','RESTORE_SQL_OWNER_ALIVE'
 q=json.loads((ROOT/'secrets/connections.json').read_text());a=json.loads((ROOT/'evidence/artifact.json').read_text())
 proof={'project':PROJECT,'sourceSha':a['codeSha'],'generation':q['generation'],'systemIdentifier':q['systemIdentifier'],'sourceRuntimeStopped':True,'sqlOwnersAbsent':True,'apis':apis,'observedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 p=ROOT/'evidence/recovery-proof.json';p.write_text(json.dumps(proof));os.chmod(p,0o400);os.chown(p,999,999)
 print('CP017_RECOVERY_SOURCE_END_PROVEN')

def recovery_copy():
 own();proof=json.loads((ROOT/'evidence/recovery-proof.json').read_text());assert proof['sourceRuntimeStopped'] and proof['sqlOwnersAbsent']
 assert all(not x['running'] for x in facts() if x['project']==PROJECT and not x['name'].endswith('-postgres-1'))
 source=ROOT/'data';destination=ROOT/'backup/writer-closed';assert source.resolve()==ROOT/'data' and destination.resolve()==ROOT/'backup/writer-closed' and not destination.exists()
 assert not source.is_symlink() and not any(p.is_symlink() for p in source.rglob('*')),'RESTORE_SYMLINK_ABORT'
 assert sum(p.stat().st_size for p in source.rglob('*') if p.is_file())<2*1024**3,'RESTORE_COPY_SIZE_ABORT'
 resources();compose('stop','postgres');assert not any(x['running'] for x in facts() if x['project']==PROJECT)
 shutil.copytree(source,destination);pairs=[]
 for p in sorted(destination.rglob('*')):
  assert not p.is_symlink(),'RESTORE_SYMLINK_ABORT'
  if p.is_file():pairs.append({'path':str(p.relative_to(destination)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 digest=hashlib.sha256(json.dumps(pairs,separators=(',',':')).encode()).hexdigest()
 (ROOT/'backup/writer-manifest.json').write_text(json.dumps({'files':pairs,'digest':digest,'offlineWholeCluster':True,'sourceRuntimeStopped':True}));os.chmod(ROOT/'backup/writer-manifest.json',0o600)
 proof.update({'backupVerified':True,'backupManifestHash':digest});p=ROOT/'evidence/recovery-proof.json';p.write_text(json.dumps(proof));os.chmod(p,0o400);os.chown(p,999,999)
 compose('up','-d','--no-build','--pull','never','postgres');preserve();print(json.dumps({'ownClosedBackup':True,'files':len(pairs),'bytes':sum(p['bytes']for p in pairs),'manifestHash':digest,'wholeClusterOffline':True}))

def recovery_target():
 own();resources();compose('stop','postgres');assert not any(x['running'] for x in facts() if x['project']==PROJECT)
 target=ROOT/'restore';assert target.resolve()==ROOT/'restore' and not (target/'data').exists()
 subnet=ipaddress.ip_network('10.77.53.0/24')
 ids=run('docker','network','ls','-q').split()
 for n in json.loads(run('docker','network','inspect',*ids)):
  for c in n['IPAM'].get('Config') or []:
   if c.get('Subnet'):
    other=ipaddress.ip_network(c['Subnet']);assert other.version!=subnet.version or not other.overlaps(subnet),'RESTORE_NETWORK_CONFLICT'
 manifest=json.loads((ROOT/'backup/writer-manifest.json').read_text());backup=ROOT/'backup/writer-closed'
 assert not backup.is_symlink() and not any(p.is_symlink() for p in backup.rglob('*')),'RESTORE_SYMLINK_ABORT'
 assert len({e['path'] for e in manifest['files']})==len(manifest['files'])
 assert {str(p.relative_to(backup)) for p in backup.rglob('*') if p.is_file()}=={e['path'] for e in manifest['files']},'RESTORE_BACKUP_INVENTORY_MISMATCH'
 for e in manifest['files']:
  p=backup/e['path'];assert p.resolve().is_relative_to(backup.resolve()) and not p.is_symlink() and p.is_file() and p.stat().st_size==e['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==e['sha256'],'RESTORE_BACKUP_CHECKSUM_FAILED'
 assert hashlib.sha256(json.dumps(manifest['files'],separators=(',',':')).encode()).hexdigest()==manifest['digest']
 shutil.copytree(backup,target/'data');assert not list((target/'data').rglob('postmaster.pid'))
 assert (target/'data/18/docker/PG_VERSION').read_text().strip()=='18','RESTORE_PGDATA_LAYOUT_MISMATCH'
 # copytree preserves modes, not the postgres UID. Only the new, validated
 # own destination is changed; never the source, backup or shared volumes.
 data=target/'data';assert data.resolve()==ROOT/'restore/data'
 for p in [data,*data.rglob('*')]:
  assert not p.is_symlink() and p.resolve().is_relative_to(data.resolve())
  os.chown(p,999,999)
 assert all(p.stat().st_uid==999 and p.stat().st_gid==999 for p in [data,*data.rglob('*')])
 for p in ['standby.signal','recovery.signal']:assert not list((target/'data').rglob(p))
 (target/'pg_hba.conf').write_text((ROOT/'config/pg_hba.conf').read_text().replace('10.77.51','10.77.53'));os.chmod(target/'pg_hba.conf',0o444)
 artifact=json.loads((ROOT/'evidence/artifact.json').read_text());directory=str(ROOT/'artifacts'/artifact['digest'].split(':')[1]);name=PROJECT+'-restore'
 text=f'''name: {name}
services:
  postgres:
    image: postgres@sha256:67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129
    platform: linux/arm64
    user: "999:999"
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    cpus: 0.35
    mem_limit: 640m
    pids_limit: 128
    command: [postgres, -c, config_file=/run/qa-config/postgresql.conf]
    environment: {{PGDATA: /var/lib/postgresql/18/docker}}
    volumes:
      - {target}/data:/var/lib/postgresql
      - {ROOT}/config/postgresql.conf:/run/qa-config/postgresql.conf:ro
      - {target}/pg_hba.conf:/etc/postgresql/pg_hba.conf:ro
      - {ROOT}/tls/postgres:/run/tls:ro
    tmpfs: ["/var/run/postgresql:uid=999,gid=999,mode=0700", "/tmp:size=16m"]
    networks: [isolated]
  harness:
    image: node@sha256:ba6b7d0ee561d9d49deb99e2b93c98632cc287b6cca1a6b18d66127054efa4dc
    platform: linux/arm64
    user: "999:999"
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    cpus: 0.25
    mem_limit: 128m
    pids_limit: 64
    working_dir: /workspace
    environment: {{QA_PROJECT: {PROJECT}, QA_CODE_SHA: {artifact['codeSha']}}}
    volumes:
      - {directory}:/workspace:ro
      - {ROOT}/secrets:/run/qa-secrets:ro
      - {ROOT}/config/ca.crt:/run/qa-ca.crt:ro
      - {ROOT}/evidence:/run/qa-results
      - {ROOT}/journal:/run/qa-journal
    tmpfs: ["/tmp:size=16m"]
    networks: [isolated]
networks:
  isolated:
    internal: true
    ipam:
      config: [{{subnet: 10.77.53.0/24}}]
'''
 (target/'compose.yaml').write_text(text);run('docker','compose','-f',str(target/'compose.yaml'),'config','--quiet')
 proof=json.loads((ROOT/'evidence/recovery-proof.json').read_text());proof.update({'targetPrivate':True,'targetEgressClosed':True,'targetHost':'postgres','backupVerified':True,'backupManifestHash':manifest['digest']});p=ROOT/'evidence/recovery-proof.json';p.write_text(json.dumps(proof));os.chmod(p,0o400);os.chown(p,999,999)
 run('docker','compose','-f',str(target/'compose.yaml'),'up','-d','--no-build','--pull','never','postgres');preserve();print('CP017_SECOND_ISOLATED_RESTORE_TARGET_STARTED_NO_PUBLIC_ENTRY')

def recovery_tool():
 own();phase=sys.argv[2];assert phase in ['close','post-copy','verify-target']
 if phase=='verify-target':print(run('docker','compose','-f',str(ROOT/'restore/compose.yaml'),'run','--rm','--no-deps','harness','node','tests/qa/cp017/recovery.mjs',phase),end='')
 else:
  assert all(not x['running'] for x in facts() if x['project']==PROJECT and not x['name'].endswith('-postgres-1'))
  a=json.loads((ROOT/'evidence/artifact.json').read_text());print(compose('run','--rm','--no-deps','-e','QA_CODE_SHA='+a['codeSha'],'-v',str(ROOT/'evidence')+':/run/qa-results','-v',str(ROOT/'journal')+':/run/qa-journal','harness','node','tests/qa/cp017/recovery.mjs',phase),end='')

def drain_control():
 own();request=ROOT/'evidence/drain-request.json';deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  if request.exists():
   candidate=json.loads(request.read_text())
   if time.time()-__import__('datetime').datetime.fromisoformat(candidate['requestedAt'].replace('Z','+00:00')).timestamp()<5:break
  time.sleep(.05)
 else:raise AssertionError('DRAIN_FRESH_REQUEST_MISSING')
 a=json.loads((ROOT/'evidence/artifact.json').read_text());q=json.loads((ROOT/'secrets/connections.json').read_text())
 assert candidate['project']==PROJECT and candidate['sourceSha']==a['codeSha'] and candidate['generation']==q['generation'] and candidate['instance']=='api1' and candidate['signal']=='SIGTERM'
 assert all(re.fullmatch('[a-f0-9-]{36}',candidate[k]) for k in ['owner','operationId','ticketId'])
 cid=compose('ps','-q','api1').strip();assert re.fullmatch('[a-f0-9]{64}',cid)
 label=run('docker','inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',cid).strip();assert label==PROJECT
 record=json.loads(run('docker','exec',cid,'cat','/tmp/qa-owner.json'));assert record['owner']==candidate['owner'] and record['generation']==candidate['generation']
 t=time.monotonic();started=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat();run('docker','kill','--signal','SIGTERM',cid)
 proof={**{k:candidate[k]for k in ['project','sourceSha','generation','instance','owner','operationId','ticketId']},'containerId':cid,'artifactDigest':a['digest'],'signal':'SIGTERM','drainStartedAt':started}
 p=ROOT/'evidence/drain-started-proof.json';p.write_text(json.dumps(proof));os.chmod(p,0o400);os.chown(p,999,999)
 while time.monotonic()-t<35:
  state=json.loads(run('docker','inspect','--format','{{json .State}}',cid))
  if not state['Running']:break
  time.sleep(.05)
 assert not state['Running'] and state['Status']=='exited','OWN_DRAIN_PROCESS_NOT_ENDED'
 pg=compose('ps','-q','postgres').strip();command='export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -qAt -v ON_ERROR_STOP=1'
 sql="BEGIN READ ONLY; SELECT json_build_object('absent',NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name IN ('mecanet-writer:"+record['owner']+"','mecanet-qa-api:"+record['owner']+"')),'operations',(SELECT coalesce(json_agg(json_build_object('tenantId',i.tenant_id,'operationId',i.operation_id,'ticketId',i.ticket_id)),'[]') FROM saas.write_intents i JOIN saas.tickets t ON t.id=i.ticket_id WHERE t.owner='"+record['owner']+"'::uuid AND i.generation='"+record['generation']+"'::uuid)); ROLLBACK;"
 observed=json.loads(run('docker','exec','-i',pg,'sh','-c',command,input=sql).strip());assert observed['absent']
 end={'project':PROJECT,'sourceSha':a['codeSha'],'generation':record['generation'],'instance':'api1','owner':record['owner'],'containerId':cid,'running':False,'exitCode':state['ExitCode'],'containerStoppedAt':state['FinishedAt'],'httpClosed':True,'writerApplicationName':'mecanet-writer:'+record['owner'],'sqlOwnerAbsent':True,'operations':observed['operations']}
 p=ROOT/'evidence/host-end-proof-api1.json';p.write_text(json.dumps(end));os.chmod(p,0o400);os.chown(p,999,999)
 print(json.dumps({'ownApi1DrainEnded':True,'sqlOwnerAbsent':True,'elapsedSeconds':round(time.monotonic()-t,3),'containerId':cid}))

def stop_own():
 own();compose('stop','api1','api2','web','worker','postgres')
 target=ROOT/'restore/compose.yaml'
 if target.exists():
  assert target.resolve()==ROOT/'restore/compose.yaml'
  assert json.loads(run('docker','compose','-f',str(target),'config','--format','json'))['name']==PROJECT+'-restore'
  run('docker','compose','-f',str(target),'stop')
 assert not any(x['running'] for x in facts() if x['project'] in [PROJECT,PROJECT+'-restore'])
 preserve();owner=own();owner['state']='STOPPED_PRIVATE_SYNTHETIC';(ROOT/'owner.json').write_text(json.dumps(owner))
 print('CP017_OWN_RUNTIME_STOPPED_NO_DATA_DELETION')
if __name__=='__main__':
 if len(sys.argv)>1 and sys.argv[1] not in ['preflight','bootstrap']:
  own();artifactPath=ROOT/'evidence/artifact.json';record={'controllerSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'artifactCodeSha':json.loads(artifactPath.read_text())['codeSha'] if artifactPath.exists() else None,'controllerSource':'private own-cohort controller bytes; separate from API artifact','observedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
  p=ROOT/'evidence/controller-provenance.json';p.write_text(json.dumps(record));os.chmod(p,0o400);os.chown(p,999,999)
 action=sys.argv[1];assert action in ['preflight','bootstrap','preserve','configure','start-postgres','accept-artifact','tool','foundation-backup','finish-config','runtime','stop-own','prove-stop','corrective-proof','pause-own','restart-proof','recovery-proof','recovery-copy','recovery-target','recovery-tool','close-writers','drain-control','promotion-proof','refresh-config','operational-promotion','rollback-target','rollback-tool','metadata-tool','repair-tool-profiles']
 if action=='preflight':print(json.dumps(preflight()))
 elif action=='bootstrap':bootstrap()
 elif action=='configure':configure()
 elif action=='start-postgres':start_postgres()
 elif action=='accept-artifact':accept_artifact()
 elif action=='tool':own_tool()
 elif action=='foundation-backup':foundation_backup()
 elif action=='finish-config':finish_config()
 elif action=='runtime':runtime()
 elif action=='prove-stop':prove_stop()
 elif action=='close-writers':close_writers()
 elif action=='corrective-proof':corrective_proof()
 elif action=='pause-own':pause_own()
 elif action=='restart-proof':restart_proof()
 elif action=='promotion-proof':promotion_proof()
 elif action=='refresh-config':refresh_config()
 elif action=='operational-promotion':operational_promotion()
 elif action=='rollback-target':rollback_target()
 elif action=='rollback-tool':rollback_tool()
 elif action=='metadata-tool':metadata_tool()
 elif action=='repair-tool-profiles':repair_tool_profiles()
 elif action=='recovery-proof':recovery_proof()
 elif action=='recovery-copy':recovery_copy()
 elif action=='recovery-target':recovery_target()
 elif action=='recovery-tool':recovery_tool()
 elif action=='drain-control':drain_control()
 elif action=='stop-own':stop_own()
 else:preserve()
