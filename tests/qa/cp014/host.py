"""Exclusive CP-014 cohort. Never opens or rewrites the closed CP-013 source."""
import hashlib, ipaddress, json, os, pathlib, pwd, secrets, socket, subprocess, sys, time

ROOT = pathlib.Path('/opt/mecanet-qa-p1l1-cp014')
PROJECT = ROOT.name
OLD = pathlib.Path('/opt/mecanet-qa-p1l1')
BASE = '5624ef0da489d2285534a942bd6ce9eab22f280d'

def run(*args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs)

def compose(*args):
    return run('docker','compose','-f',str(ROOT/'compose.yaml'),*args)

def own():
    assert os.geteuid() == 0 and ROOT.resolve() == ROOT
    owner = json.loads((ROOT/'owner.json').read_text())
    assert owner['project'] == PROJECT and owner['owner'] == 'SrEdgarR/MECANET' and owner['base'] == BASE
    return owner

def facts():
    ids = run('docker','ps','-aq').split()
    template='{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"image":{{json .Image}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}}}'
    return [normalize_labels(json.loads(line)) for line in run('docker','inspect','--format',template,*ids).splitlines()] if ids else []

def normalize_labels(record):
    # Docker renders an absent Compose label as null or an empty string.
    # Preserve all identity/image/state fields when comparing snapshots.
    return {**record, 'project': record.get('project') or '', 'service': record.get('service') or ''}

def headroom():
    mem = dict(line.split(':',1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
    available = int(mem['MemAvailable'].split()[0])//1024
    v = os.statvfs('/'); free = v.f_bavail*v.f_frsize
    assert available >= 5120 and free > max(15*1024**3, v.f_blocks*v.f_frsize*.1), 'RAM/disk abort threshold'
    def cpu(): return list(map(int,pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
    a=cpu(); time.sleep(2); b=cpu(); d=[y-x for x,y in zip(a,b)]
    busy=100*(1-(d[3]+d[4])/sum(d)); assert busy < 80, 'CPU abort threshold'
    return {'availableMiB':available,'diskFreeBytes':free,'cpuBusyPercent':round(busy,2)}

def bootstrap():
    assert os.geteuid()==0 and os.uname().machine=='aarch64' and ROOT.resolve()==ROOT and not ROOT.exists()
    old = json.loads((OLD/'owner.json').read_text()); assert old['project']=='mecanet-qa-p1l1'
    before=facts(); assert all(not x['running'] for x in before if x['project']=='mecanet-qa-p1l1')
    assert len([x for x in before if x['running']])==10 and not any(x['project']==PROJECT for x in before)
    networks=json.loads(run('docker','network','inspect',*run('docker','network','ls','-q').split()))
    candidates=[ipaddress.ip_network('10.77.41.0/24'),ipaddress.ip_network('10.77.42.0/24')]
    for n in networks:
        for c in n['IPAM'].get('Config') or []:
            subnet=ipaddress.ip_network(c['Subnet'])
            assert not any(subnet.version==p.version and subnet.overlaps(p) for p in candidates)
    resources=headroom()
    evidence={str(p.relative_to(OLD)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [OLD/'backup/base/backup_manifest',OLD/'recovery/result.json']}
    for folder in ['config','secrets','tls/postgres','tls/web','data','staging','artifacts','evidence','ingress','faults','faults/api1','faults/api2']:
        (ROOT/folder).mkdir(parents=True,exist_ok=False); os.chmod(ROOT/folder,0o700)
    os.chmod(ROOT,0o711); os.chmod(ROOT/'staging',0o755);os.chmod(ROOT/'artifacts',0o755)
    os.chown(ROOT/'ingress',101,pwd.getpwnam('ubuntu').pw_gid);os.chmod(ROOT/'ingress',0o770)
    for folder in ['data','secrets','evidence','faults','faults/api1','faults/api2']:
        os.chown(ROOT/folder,999,999)
    owner={'project':PROJECT,'base':BASE,'baseline':'3b387b38784907b67e2209a35c3d5f400d70742e','state':'TEMPORARY','owner':'SrEdgarR/MECANET'}
    (ROOT/'owner.json').write_text(json.dumps(owner))
    (ROOT/'evidence/preflight.json').write_text(json.dumps({'time':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'resources':resources,'before':before,'preservedCP013':evidence,'limits':{'cpu':1,'memoryMiB':2048},'result':'PASS'}))
    (ROOT/'secrets/bootstrap').write_text(secrets.token_urlsafe(48));os.chmod(ROOT/'secrets/bootstrap',0o400);os.chown(ROOT/'secrets/bootstrap',999,999)
    def openssl(*args): subprocess.run(['openssl',*args],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    openssl('req','-x509','-newkey','rsa:3072','-nodes','-keyout',str(ROOT/'tls/ca.key'),'-out',str(ROOT/'tls/ca.crt'),'-days','7','-subj','/CN=Mecanet CP014 QA CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign')
    for service,cn,san,uid in [('postgres','postgres','DNS:postgres',999),('web','app.mecanet.test','DNS:app.mecanet.test',101)]:
        d=ROOT/'tls'/service
        openssl('req','-newkey','rsa:3072','-nodes','-keyout',str(d/'server.key'),'-out',str(d/'server.csr'),'-subj','/CN='+cn)
        (d/'extensions').write_text('subjectAltName='+san+'\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nbasicConstraints=critical,CA:FALSE\n')
        openssl('x509','-req','-in',str(d/'server.csr'),'-CA',str(ROOT/'tls/ca.crt'),'-CAkey',str(ROOT/'tls/ca.key'),'-CAcreateserial','-out',str(d/'server.crt'),'-days','7','-extfile',str(d/'extensions'))
        os.chmod(d,0o755);os.chmod(d/'server.key',0o400);os.chown(d/'server.key',uid,uid);os.chmod(d/'server.crt',0o444)
    (ROOT/'config/ca.crt').write_bytes((ROOT/'tls/ca.crt').read_bytes());os.chmod(ROOT/'config/ca.crt',0o444)
    print(json.dumps({'prepared':str(ROOT),'result':'PASS','resources':resources,'oldCohortPreserved':True,'secretOutput':False}))

def configure():
    own(); assert not (ROOT/'compose.yaml').exists()
    source=ROOT/'staging/tests/qa/infra'
    text=(source/'compose.yaml').read_text().replace('mecanet-qa-p1l1',PROJECT).replace(str(ROOT/'release'),str(ROOT/'staging')).replace('10.77.31','10.77.41').replace('10.77.32','10.77.42')
    # Runtime source is later selected by immutable digest; never a bind to CP013.
    text=text.replace('command: [node, tests/qa/prepare.mjs]','command: [node, tests/qa/prepare.mjs]\n    environment: {QA_PROJECT: '+PROJECT+'}')
    text=text.replace('  api1: &api','  api1: &api').replace('  api2: *api','  api2:\n    <<: *api\n    environment: {QA_INSTANCE: api2}')
    text=text.replace('    command: [node, tests/qa/entry.mjs]','    command: [node, tests/qa/entry.mjs]\n    environment: {QA_INSTANCE: api1}')
    for order in ('front, data','data, front'):
        text=text.replace('    networks: ['+order+']','    networks: {front: {ipv4_address: 10.77.42.3}, data: {}}')
    text=text.replace('    environment: {QA_INSTANCE: api2}','    environment: {QA_INSTANCE: api2}\n    networks: {front: {ipv4_address: 10.77.42.4}, data: {}}')
    text=text.replace('      - '+str(ROOT)+'/secrets/api.json:/run/qa-secrets/api.json:ro','      - '+str(ROOT)+'/secrets/api.json:/run/qa-secrets/api.json:ro\n      - '+str(ROOT)+'/faults:/run/qa-faults')
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
    volumes:
      - ROOT/staging:/workspace:ro
      - ROOT/secrets:/run/qa-secrets:ro
      - ROOT/config/ca.crt:/run/qa-ca.crt:ro
      - ROOT/ingress:/run/qa-ingress:ro
      - ROOT/faults:/run/qa-faults
      - ROOT/evidence:/run/qa-results
    tmpfs: ["/tmp:size=16m"]
    networks: [data]
    logging:
      driver: json-file
      options: {max-size: 8m, max-file: "2"}
'''.replace('ROOT',str(ROOT))
    text=text.replace('\nnetworks:\n','\n'+probe+'networks:\n')
    assert '/opt/mecanet-qa-p1l1/' not in text
    (ROOT/'compose.yaml').write_text(text)
    for name in ['postgresql.conf','pg_hba.conf']:
        (ROOT/'config'/name).write_text((source/name).read_text().replace('10.77.31','10.77.41'))
        os.chmod(ROOT/'config'/name,0o444)
    nginx=(source/'nginx.conf').read_text()
    server=nginx[nginx.index(' server {'):nginx.rfind('\n}')]
    extras=''
    for instance in ['api1','api2']:
        extras+=server.replace('web.sock',instance+'.sock').replace('proxy_pass http://api;','proxy_pass http://'+instance+':3000;')+'\n'
    (ROOT/'config/nginx.conf').write_text(nginx[:nginx.rfind('\n}')]+extras+'\n}\n');os.chmod(ROOT/'config/nginx.conf',0o444)
    compose('config','--quiet')
    print('CP014_CONFIG_VALID')

def finish_config():
    own(); config=json.loads((ROOT/'secrets/connections.json').read_text())
    secret=(ROOT/'secrets/session-signing').read_text()
    api={'control':config['connections']['saas_api'],'sessions':config['connections']['saas_session'],'issuer':config['connections']['saas_issuer'],'generation':config['generation'],'entries':config['entries'],'sessionSecret':secret,'trustedProxy':'10.77.42.2'}
    for name,obj in [('api.json',api)]:
        with open(ROOT/'secrets'/name,'x') as f: os.chmod(f.name,0o600);os.chown(f.name,999,999);json.dump(obj,f)
    print('CP014_PRIVATE_CONFIG_WRITTEN')

def preserve_check():
    own(); pre=json.loads((ROOT/'evidence/preflight.json').read_text())
    assert all(hashlib.sha256((OLD/name).read_bytes()).hexdigest()==digest for name,digest in pre['preservedCP013'].items())
    now=facts(); other=[normalize_labels(x) for x in pre['before'] if x['project']!='mecanet-qa-p1l1']
    assert all(x in now for x in other), 'Other consumers changed; abort and inspect'
    assert all(not x['running'] for x in now if x['project']=='mecanet-qa-p1l1')
    print(json.dumps({'result':'PASS','otherConsumersPreserved':len(other),'closedCP013Preserved':True,'time':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'own':[x for x in now if x['project']==PROJECT]}))

def transfer():
    own(); headroom()
    script=(ROOT/'staging/tests/qa/infra/transfer-worker.py').read_text().replace('mecanet-qa-p1l1',PROJECT)
    assert '/opt/mecanet-qa-p1l1/' not in script
    sys.argv=[str(ROOT/'staging/tests/qa/infra/transfer-worker.py'),'full']
    exec(compile(script,'cp014-transfer-worker','exec'),{'__name__':'__main__'})

def system_id():
    own(); pg=compose('ps','-q','postgres').strip();assert pg
    command='export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d postgres -At -v ON_ERROR_STOP=1'
    value=run('docker','exec','-i',pg,'sh','-c',command,input='SELECT system_identifier::text FROM pg_control_system();').strip()
    assert value.isdecimal() and 10<=len(value)<=24
    (ROOT/'evidence/system-id').write_text(value);os.chmod(ROOT/'evidence/system-id',0o444)
    print(json.dumps({'systemIdentifier':value,'syntheticNewCohort':True}))

def first_worker():
    own(); assert not compose('ps','-aq','worker').strip()
    qa=json.loads((ROOT/'secrets/connections.json').read_text())
    file=ROOT/'secrets/worker.json'; config=json.loads(file.read_text())
    assert config['clockTransfer']['kind']=='first-start'
    config.update(measurementConnection=qa['connections']['saas_measure'],reconcilerConnection=qa['connections']['saas_reconciler'],policyConnection=qa['connections']['saas_policy'])
    with open(file,'w') as f: json.dump(config,f);f.flush();os.fsync(f.fileno())
    compose('up','-d','--no-deps','worker')
    print('CP014_INITIAL_WORKER_STARTED')

def accept_artifact():
    own(); headroom()
    manifest=json.loads(pathlib.Path('/home/ubuntu/mecanet-cp014-artifact.json').read_text())
    digest=manifest['digest']; assert digest.startswith('sha256:') and len(digest)==71 and all(c in '0123456789abcdef' for c in digest[7:])
    assert manifest['architecture']=='linux/arm64' and len(manifest['codeSha'])==40
    target=ROOT/'artifacts'/('sha256-'+digest[7:]);assert not target.exists()
    target.mkdir(mode=0o755)
    archive=pathlib.Path('/home/ubuntu/mecanet-cp014-release.tar')
    # Locally generated archive; reject links, traversal and unexpected roots before extraction.
    import tarfile
    with tarfile.open(archive) as tar:
        for item in tar.getmembers():
            p=pathlib.PurePosixPath(item.name)
            assert not p.is_absolute() and '..' not in p.parts and (item.isfile() or item.isdir())
            assert any(item.name==x or item.name.startswith(x+'/') for x in ['server/saas','tests/qa','client/dist-saas'])
        tar.extractall(target,filter='data')
    lines=[]
    expected=set()
    for e in manifest['entries']:
        p=target/e['path'];assert p.resolve().is_relative_to(target) and p.is_file() and not p.is_symlink()
        data=p.read_bytes();assert len(data)==e['bytes'] and hashlib.sha256(data).hexdigest()==e['sha256']
        lines.append(e['sha256']+'  '+e['path']+'\n');expected.add(e['path'])
    actual={str(p.relative_to(target)) for p in target.rglob('*') if p.is_file()}
    assert actual==expected and hashlib.sha256(''.join(lines).encode()).hexdigest()==digest[7:]
    (target/'manifest.json').write_text(json.dumps(manifest));subprocess.run(['chmod','-R','a+rX',str(target)],check=True)
    subprocess.run(['chmod','-R','a-w',str(target)],check=True)
    (ROOT/'evidence'/('artifact-'+digest[7:]+'.json')).write_text(json.dumps({'digest':digest,'codeSha':manifest['codeSha'],'files':len(expected),'verified':True,'runtime':manifest['runtime']}))
    print(json.dumps({'artifact':digest,'codeSha':manifest['codeSha'],'files':len(expected),'verified':True}))

def select_artifact():
    own();headroom();digest=sys.argv[2]
    assert len(digest)==71 and digest.startswith('sha256:') and all(c in '0123456789abcdef' for c in digest[7:])
    target=ROOT/'artifacts'/('sha256-'+digest[7:]); manifest=json.loads((target/'manifest.json').read_text());assert manifest['digest']==digest
    for e in manifest['entries']:
        data=(target/e['path']).read_bytes();assert hashlib.sha256(data).hexdigest()==e['sha256']
    # Only source mounts change. PostgreSQL data/config/image and shared resources remain unchanged.
    pg=compose('ps','-q','postgres').strip();assert pg
    pg_template='{{.Id}}|{{.Image}}|{{.State.StartedAt}}|{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{.Source}}{{end}}{{end}}'
    pg_before=run('docker','inspect','--format',pg_template,pg)
    compose('stop','api1','api2','web')
    text=(ROOT/'compose.yaml').read_text()
    # API addresses cannot claim the web's fixed trusted-proxy address during
    # simultaneous recreation. This affects only our isolated front subnet.
    for order in ('front, data','data, front'):
        text=text.replace('    networks: ['+order+']','    networks: {front: {ipv4_address: 10.77.42.3}, data: {}}')
    if 'ipv4_address: 10.77.42.4' not in text:
        text=text.replace('    environment: {QA_INSTANCE: api2}','    environment: {QA_INSTANCE: api2}\n    networks: {front: {ipv4_address: 10.77.42.4}, data: {}}')
    assert all(text.count('ipv4_address: 10.77.42.'+n)==1 for n in ['2','3','4']), 'Own front IPs must be exact and distinct'
    import re
    text=re.sub(r'/opt/mecanet-qa-p1l1-cp014/(?:staging|artifacts/sha256-[0-9a-f]{64})(?=[:/])',str(target),text)
    (ROOT/'compose.yaml').write_text(text);compose('config','--quiet')
    compose('up','-d','--no-deps','--force-recreate','api1','api2')
    compose('up','-d','--no-deps','--force-recreate','web')
    transfer()
    assert compose('ps','-q','postgres').strip()==pg and run('docker','inspect','--format',pg_template,pg)==pg_before
    record={'digest':digest,'codeSha':manifest['codeSha'],'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'postgresUntouched':True,'postgresIdentity':pg_before.strip()}
    (ROOT/'evidence/selected-artifact.json').write_text(json.dumps(record))
    (ROOT/'evidence'/('selection-'+str(time.time_ns())+'.json')).write_text(json.dumps(record))
    print(json.dumps({'selectedArtifact':digest,'codeSha':manifest['codeSha'],'postgresUntouched':True}))

def isolation():
    own()
    script=(ROOT/'staging/tests/qa/infra/verify-isolation.py').read_text().replace('mecanet-qa-p1l1',PROJECT)
    exec(compile(script,'cp014-isolation','exec'),{'__name__':'__main__'})

if __name__=='__main__':
    {'bootstrap':bootstrap,'configure':configure,'finish-config':finish_config,'preserve-check':preserve_check,'transfer':transfer,'system-id':system_id,'first-worker':first_worker,'accept-artifact':accept_artifact,'select-artifact':select_artifact,'isolation':isolation}[sys.argv[1]]()
