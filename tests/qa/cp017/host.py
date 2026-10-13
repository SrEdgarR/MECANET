"""Exclusive synthetic L2 cohort. No global proxy, network, daemon or build mutation."""
import hashlib, ipaddress, json, os, pathlib, pwd, secrets, subprocess, sys, time, tarfile, shutil
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
 assert destination.parent.resolve()==ROOT/'artifacts' and not destination.exists()
 expected={e['path']:e for e in manifest['entries']};assert len(expected)==len(manifest['entries'])
 destination.mkdir(mode=0o755)
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
 config=(ROOT/'compose.yaml').read_text();config=config.replace(str(ROOT/'staging'),str(destination));(ROOT/'compose.yaml').write_text(config)
 compose('config','--quiet');(ROOT/'evidence/artifact.json').write_text(json.dumps({'digest':manifest['digest'],'codeSha':manifest['codeSha'],'files':len(expected),'bytes':sum(e['bytes']for e in expected.values()),'verified':True,'runtime':manifest['runtime']}))
 print(json.dumps({'artifactAccepted':True,'codeSha':manifest['codeSha'],'digest':manifest['digest'],'files':len(expected)}))

def own_tool():
 own();assert len(sys.argv)==3 and sys.argv[2] in ['foundation','migration','sql','integration','recovery-check']
 action=sys.argv[2];live=any(x['running'] for x in facts() if x['project']==PROJECT and x['name'].endswith(('-api1-1','-api2-1','-web-1')))
 service='probe' if action in ['sql','integration'] else 'harness';assert service=='probe' or not live,'HARNESS_RUNTIME_OVERLAP'
 artifact=json.loads((ROOT/'evidence/artifact.json').read_text())
 files={'foundation':'prepare.mjs','migration':'migration-live.mjs','sql':'sql-live.mjs','integration':'integration.mjs','recovery-check':'recovery-check.mjs'}
 args=['run','--rm','--no-deps','-e','QA_CODE_SHA='+artifact['codeSha']]
 if action=='foundation':args+=['-e','QA_STAGE=foundation']
 # Add only the exclusive synthetic result destination; no shared host mount.
 args+=['-v',str(ROOT/'evidence')+':/run/qa-results',service,'node','tests/qa/cp017/'+files[action]]
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

def stop_own():
 own();compose('stop','api1','api2','web','worker','postgres');preserve();owner=own();owner['state']='STOPPED_PRIVATE_SYNTHETIC';(ROOT/'owner.json').write_text(json.dumps(owner))
 print('CP017_OWN_RUNTIME_STOPPED_NO_DATA_DELETION')
if __name__=='__main__':
 action=sys.argv[1];assert action in ['preflight','bootstrap','preserve','configure','start-postgres','accept-artifact','tool','foundation-backup','finish-config','runtime','stop-own']
 if action=='preflight':print(json.dumps(preflight()))
 elif action=='bootstrap':bootstrap()
 elif action=='configure':configure()
 elif action=='start-postgres':start_postgres()
 elif action=='accept-artifact':accept_artifact()
 elif action=='tool':own_tool()
 elif action=='foundation-backup':foundation_backup()
 elif action=='finish-config':finish_config()
 elif action=='runtime':runtime()
 elif action=='stop-own':stop_own()
 else:preserve()
