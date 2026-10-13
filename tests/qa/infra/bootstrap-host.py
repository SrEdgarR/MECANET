"""Run only on the approved VPS. Creates fresh, exclusive QA files; never imports .env."""
import os, pathlib, secrets, subprocess, json, socket, time, pwd
ROOT = pathlib.Path('/opt/mecanet-qa-p1l1')
assert os.geteuid() == 0 and os.uname().machine == 'aarch64'
assert ROOT.resolve() == ROOT and not ROOT.exists(), 'QA root must be unused'
mem = dict(line.split(':',1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
assert int(mem['MemAvailable'].split()[0])//1024 >= 5120, 'RAM headroom'
v=os.statvfs('/'); assert v.f_bavail*v.f_frsize > max(15*1024**3,v.f_blocks*v.f_frsize*.1), 'disk headroom'
with socket.socket() as s: s.bind(('127.0.0.1',18443))
def cpu(): return list(map(int,pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
a=cpu();time.sleep(2);b=cpu();delta=[y-x for x,y in zip(a,b)];busy=100*(1-(delta[3]+delta[4])/sum(delta)); assert busy < 80, 'CPU preflight'
for folder in ['config','secrets','tls/postgres','tls/web','data','release','evidence','journal','backup','ingress']:
 (ROOT/folder).mkdir(parents=True,exist_ok=False); os.chmod(ROOT/folder,0o700)
os.chmod(ROOT,0o711)
os.chmod(ROOT/'release',0o755)
os.chown(ROOT/'ingress',101,pwd.getpwnam('ubuntu').pw_gid);os.chmod(ROOT/'ingress',0o770)
(ROOT/'owner.json').write_text(json.dumps({'project':'mecanet-qa-p1l1','baseline':'3b387b38784907b67e2209a35c3d5f400d70742e','state':'TEMPORARY','owner':'SrEdgarR/MECANET'}))
(ROOT/'secrets/bootstrap').write_text(secrets.token_urlsafe(48)); os.chmod(ROOT/'secrets/bootstrap',0o400);os.chown(ROOT/'secrets/bootstrap',999,999)
def openssl(*args): subprocess.run(['openssl',*args],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
openssl('req','-x509','-newkey','rsa:3072','-nodes','-keyout',str(ROOT/'tls/ca.key'),'-out',str(ROOT/'tls/ca.crt'),'-days','7','-subj','/CN=Mecanet QA temporary CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign')
for service,cn,san in [('postgres','postgres','DNS:postgres'),('web','app.mecanet.test','DNS:app.mecanet.test')]:
 d=ROOT/'tls'/service
 openssl('req','-newkey','rsa:3072','-nodes','-keyout',str(d/'server.key'),'-out',str(d/'server.csr'),'-subj','/CN='+cn)
 (d/'extensions').write_text('subjectAltName='+san+'\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nbasicConstraints=critical,CA:FALSE\n')
 openssl('x509','-req','-in',str(d/'server.csr'),'-CA',str(ROOT/'tls/ca.crt'),'-CAkey',str(ROOT/'tls/ca.key'),'-CAcreateserial','-out',str(d/'server.crt'),'-days','7','-extfile',str(d/'extensions'))
 os.chmod(d,0o755);os.chmod(d/'server.key',0o400);os.chown(d/'server.key',999 if service=='postgres' else 101,999 if service=='postgres' else 101)
 os.chmod(d/'server.crt',0o444)
os.chown(ROOT/'data',999,999)
print(json.dumps({'prepared':str(ROOT),'cpuBusyPercent':round(busy,2),'syntheticSecretsPrinted':False}))
