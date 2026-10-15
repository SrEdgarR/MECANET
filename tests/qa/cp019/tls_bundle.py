"""Generate private QA certificates outside the VPS; no import side effects."""
import hashlib,json,os,pathlib,subprocess,ssl,time

PROJECTS=('mecanet-qa-p1l3-r03','mecanet-qa-p1l3-r03-target')
NAMES=('ca.crt','ca.key','ca.srl','postgres/server.crt','postgres/server.csr','postgres/server.key','web/server.crt','web/server.csr','web/server.key')

def regular(path,root,limit=16384,expected_uid=None):
 assert path.resolve()==path and root.resolve()==root and path.is_relative_to(root) and not path.is_symlink() and path.is_file(),'TLS_INPUT_PATH'
 st=path.stat();assert st.st_nlink==1 and 0<st.st_size<=limit,'TLS_INPUT_FILE'
 if os.name!='nt':assert st.st_uid==(os.getuid() if expected_uid is None else expected_uid) and st.st_mode&0o777==0o400,'TLS_INPUT_PERMISSIONS'
 fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
 try:
  opened=os.fstat(fd);assert (st.st_dev,st.st_ino,st.st_size)==(opened.st_dev,opened.st_ino,opened.st_size),'TLS_INPUT_CHANGED'
  value=os.read(fd,limit+1);after=os.fstat(fd)
  assert len(value)==st.st_size and (opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns),'TLS_INPUT_CHANGED'
  return value
 finally:os.close(fd)

def handshake(ca,cert,key,hostname):
 """Cryptographic chain/key/SAN verification using memory BIO, no sockets."""
 server=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);server.minimum_version=ssl.TLSVersion.TLSv1_2
 server.load_cert_chain(str(cert),str(key))
 client=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT);client.minimum_version=ssl.TLSVersion.TLSv1_2
 client.load_verify_locations(cafile=str(ca))
 ci,co,si,so=(ssl.MemoryBIO() for _ in range(4))
 c=client.wrap_bio(ci,co,server_hostname=hostname);s=server.wrap_bio(si,so,server_side=True)
 done=[False,False]
 for _ in range(12):
  for n,obj in enumerate((c,s)):
   if not done[n]:
    try:obj.do_handshake();done[n]=True
    except ssl.SSLWantReadError:pass
  outbound=co.read();inbound=so.read()
  if outbound:si.write(outbound)
  if inbound:ci.write(inbound)
  if all(done):return {'tls':c.version(),'hostnameVerified':True,'chainVerified':True,'keyPairVerified':True}
 raise AssertionError('TLS_HANDSHAKE_NOT_PROVEN')

def validate_bundle(root,projects=PROJECTS,expected_uid=None):
 root=pathlib.Path(root)
 assert root.resolve()==root and root.is_dir() and not root.is_symlink(),'TLS_INPUT_ROOT'
 if os.name!='nt':assert root.stat().st_uid==(os.getuid() if expected_uid is None else expected_uid) and root.stat().st_mode&0o777==0o700,'TLS_INPUT_PERMISSIONS'
 manifest=regular(root/'manifest.json',root,expected_uid=expected_uid)
 body=json.loads(manifest)
 assert set(body)=={'schema','projects','producer','entries'} and body['schema']=='cp019-private-tls-v1' and body['projects']==list(projects),'TLS_MANIFEST'
 assert isinstance(body['producer'],str) and body['producer'].startswith('OpenSSL 3.') and len(body['producer'])<160,'TLS_PRODUCER'
 expected={p+'/'+n for p in projects for n in NAMES}
 assert len(body['entries'])==18 and {x['path'] for x in body['entries']}==expected,'TLS_FILE_SET'
 actual={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
 assert actual==expected|{'manifest.json'} and all(not p.is_symlink() for p in root.rglob('*')),'TLS_FILE_SET'
 for e in body['entries']:
  assert set(e)=={'path','bytes','sha256'} and e['path'] in expected,'TLS_ENTRY'
  value=regular(root/e['path'],root,expected_uid=expected_uid)
  assert len(value)==e['bytes'] and hashlib.sha256(value).hexdigest()==e['sha256'],'TLS_HASH'
 for directory in (p for p in root.rglob('*') if p.is_dir()):
  if os.name!='nt':assert directory.stat().st_uid==(os.getuid() if expected_uid is None else expected_uid) and directory.stat().st_mode&0o777==0o700,'TLS_INPUT_PERMISSIONS'
 ca_hashes=[]
 for project in projects:
  base=root/project;ca=base/'ca.crt';ca_hashes.append(hashlib.sha256(ca.read_bytes()).hexdigest())
  for service,host in [('postgres','postgres'),('web','app.mecanet.test')]:handshake(ca,base/service/'server.crt',base/service/'server.key',host)
 assert len(set(ca_hashes))==2,'TLS_CA_REUSED'
 return {'schema':'cp019-tls-verification-v1','result':'PASS','manifestHash':hashlib.sha256(manifest).hexdigest(),'projects':list(projects),'verifiedKeyPairs':4,'independentCAs':2,'networkUsed':False,'secretOutput':False}

def load_bundle(root,projects=PROJECTS,expected_uid=None):
 """Return bound bytes privately; the caller must never print the files map."""
 root=pathlib.Path(root);proof=validate_bundle(root,projects,expected_uid)
 manifest=regular(root/'manifest.json',root,expected_uid=expected_uid)
 assert hashlib.sha256(manifest).hexdigest()==proof['manifestHash'],'TLS_INPUT_CHANGED'
 files={}
 for entry in json.loads(manifest)['entries']:
  value=regular(root/entry['path'],root,expected_uid=expected_uid)
  assert hashlib.sha256(value).hexdigest()==entry['sha256'] and len(value)==entry['bytes'],'TLS_INPUT_CHANGED'
  files[entry['path']]=value
 return proof,files

def generate_bundle(root,openssl,projects=PROJECTS):
 root=pathlib.Path(root).resolve();openssl=pathlib.Path(openssl).resolve()
 # Capability is checked before mkdir or key generation, including absent binary.
 assert openssl.is_file() and not openssl.is_symlink(),'TLS_OPENSSL_EXECUTABLE_REQUIRED'
 version=subprocess.check_output([str(openssl),'version'],text=True,timeout=5).strip()
 assert version.startswith('OpenSSL 3.'),'TLS_OPENSSL_VERSION'
 assert not root.exists(),'TLS_BUNDLE_EXISTS_KEEP'
 root.mkdir(mode=0o700);start=time.monotonic()
 def run(args):
  assert time.monotonic()-start<30,'TLS_LOCAL_DEADLINE'
  result=subprocess.run([str(openssl),*args],cwd=root,capture_output=True,timeout=10)
  assert result.returncode==0,'TLS_GENERATION_FAILED_KEEP'
 for project in projects:
  base=root/project;base.mkdir(mode=0o700)
  for service in ('postgres','web'):(base/service).mkdir(mode=0o700)
  run(['req','-x509','-newkey','rsa:3072','-nodes','-keyout',str(base/'ca.key'),'-out',str(base/'ca.crt'),'-days','7','-subj','/CN=Mecanet '+project+' private QA','-addext','basicConstraints=critical,CA:TRUE'])
  for service,host in [('postgres','postgres'),('web','app.mecanet.test')]:
   run(['req','-newkey','rsa:3072','-nodes','-keyout',str(base/service/'server.key'),'-out',str(base/service/'server.csr'),'-subj','/CN='+host,'-addext','subjectAltName=DNS:'+host,'-addext','extendedKeyUsage=serverAuth','-addext','basicConstraints=critical,CA:FALSE'])
   run(['x509','-req','-in',str(base/service/'server.csr'),'-CA',str(base/'ca.crt'),'-CAkey',str(base/'ca.key'),'-CAcreateserial','-copy_extensions','copy','-out',str(base/service/'server.crt'),'-days','7'])
 for p in root.rglob('*'):
  if p.is_file():os.chmod(p,0o400)
 entries=[{'path':p+'/'+n,'bytes':len((root/p/n).read_bytes()),'sha256':hashlib.sha256((root/p/n).read_bytes()).hexdigest()} for p in projects for n in NAMES]
 raw=json.dumps({'schema':'cp019-private-tls-v1','projects':list(projects),'producer':version,'entries':entries},sort_keys=True,separators=(',',':')).encode()
 fd=os.open(root/'manifest.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o400)
 with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
 return validate_bundle(root,projects)
