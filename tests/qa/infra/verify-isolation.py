"""Read-only inspection and finite TCP negative probes from the exclusive API container."""
import json, subprocess, time

def run(*args):
    return subprocess.check_output(args, text=True)

project = 'mecanet-qa-p1l1'
own_ids = run('docker','ps','-aq','--filter',f'label=com.docker.compose.project={project}').split()
assert own_ids
own = json.loads(run('docker','inspect',*own_ids))
running = [x for x in own if x['State']['Running']]
assert len(running) == 5
assert sum(x['HostConfig']['NanoCpus'] for x in running) <= 1_000_000_000
assert sum(x['HostConfig']['Memory'] for x in running) <= 2048*1024*1024
for item in running:
    h = item['HostConfig']; service = item['Config']['Labels']['com.docker.compose.service']
    assert h['ReadonlyRootfs'] and not h['Privileged'] and h['NetworkMode'] != 'host'
    assert 'ALL' in h['CapDrop'] and h['PidsLimit'] > 0
    assert all(m['Source'].startswith('/opt/mecanet-qa-p1l1/') for m in item['Mounts'])
    assert all(n.startswith(project+'-') for n in item['NetworkSettings']['Networks'])
    ports = item['NetworkSettings']['Ports'] or {}
    published = [(port, binding) for port, values in ports.items() for binding in (values or [])]
    assert not published
for name in (project+'-data',project+'-front'):
    network=json.loads(run('docker','network','inspect',name))[0]
    assert network['Internal'] and not network['EnableIPv6']
    assert network['Options']['com.docker.network.bridge.gateway_mode_ipv4']=='isolated'
all_ids = run('docker','ps','-q').split()
other = [x for x in json.loads(run('docker','inspect',*all_ids)) if x['Id'] not in {i['Id'] for i in own}]
assert len(other) == 10, 'Unexpected shared-host state; inspect before proceeding'
foreign_ips = [n['IPAddress'] for x in other for n in x['NetworkSettings']['Networks'].values() if n['IPAddress']]
assert foreign_ips
targets=[['internet-v4','1.1.1.1',443],['metadata','169.254.169.254',80],['internet-v6','2606:4700:4700::1111',443]]
targets += [['other-network-'+str(i),ip,5432] for i,ip in enumerate(sorted(set(foreign_ips)))][:4]
api=next(x['Id'] for x in own if x['Config']['Labels']['com.docker.compose.service']=='api1')
script="""const net=require('node:net');(async()=>{const out=[];for(const [name,host,port]of JSON.parse(process.argv[1])){out.push(await new Promise(resolve=>{const s=net.connect({host,port});let done=false;const end=result=>{if(done)return;done=true;s.destroy();resolve({name,result})};s.setTimeout(600,()=>end('BLOCKED'));s.on('error',()=>end('BLOCKED'));s.on('connect',()=>end('UNEXPECTED_ACCESS'))}))}console.log(JSON.stringify(out))})()"""
probes=json.loads(run('docker','exec',api,'node','-e',script,json.dumps(targets)))
assert all(x['result']=='BLOCKED' for x in probes), probes
print(json.dumps({'time':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'result':'PASS','ownRunning':len(running),'otherContainersPreserved':len(other),'cpuLimit':sum(x['HostConfig']['NanoCpus'] for x in running)/1e9,'memoryLimitMiB':sum(x['HostConfig']['Memory'] for x in running)/1024**2,'published':'No remote TCP port; own Unix socket via SSH to local 127.0.0.1:18443','probes':probes,'limit':'Finite TCP probes, not an exhaustive network penetration test'}))
