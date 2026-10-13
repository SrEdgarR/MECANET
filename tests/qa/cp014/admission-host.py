"""Exclusive CP-014 API end evidence. No shared daemon resource is mutated."""
import json
import os
import pathlib
import re
import subprocess
import sys
import time

ROOT = pathlib.Path('/opt/mecanet-qa-p1l1-cp014')
PROJECT = 'mecanet-qa-p1l1-cp014'
assert os.geteuid() == 0 and ROOT.resolve() == ROOT
assert json.loads((ROOT / 'owner.json').read_text())['project'] == PROJECT
assert (ROOT / 'compose.yaml').resolve().parent == ROOT
command = ['docker', 'compose', '-p', PROJECT, '-f', str(ROOT / 'compose.yaml')]
mode = sys.argv[1] if len(sys.argv) == 2 else ''
assert mode in ('prove-api-end', 'restart-api')

def output(arguments, input_text=None):
    return subprocess.check_output(arguments, input=input_text, text=True).strip()

def container(service):
    value = output(command + ['ps', '-aq', service])
    assert re.fullmatch(r'[a-f0-9]{12,64}', value)
    metadata = json.loads(output(['docker', 'inspect', value]))[0]
    assert metadata['Config']['Labels']['com.docker.compose.project'] == PROJECT
    assert metadata['Config']['Labels']['com.docker.compose.service'] == service
    return metadata

def save_proof(value):
    target = ROOT / 'evidence' / 'admission-runner-proof.json'
    assert target.resolve().parent == ROOT / 'evidence'
    candidate = target.with_name(target.name + '.new')
    with open(candidate, 'x') as stream:
        os.chmod(candidate, 0o600)
        os.chown(candidate, 999, 999)
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(candidate, target)
    descriptor = os.open(str(target.parent), os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)

if mode == 'prove-api-end':
    cohort = json.loads((ROOT / 'secrets' / 'connections.json').read_text())
    runners = []
    for service in ('api1', 'api2'):
        metadata = container(service)
        assert metadata['State']['Running']
        identity = json.loads(output(['docker', 'exec', metadata['Id'], 'cat', '/tmp/qa-owner.json']))
        assert re.fullmatch(r'[a-f0-9-]{36}', identity['owner'])
        assert identity['generation'] == cohort['generation']
        runners.append({'service': service, 'containerId': metadata['Id'], 'owner': identity['owner'], 'generation': identity['generation']})
    subprocess.run(command + ['stop', 'api1', 'api2'], check=True, timeout=80)
    for runner in runners:
        metadata = container(runner['service'])
        assert metadata['Id'] == runner['containerId']
        assert metadata['State']['Status'] == 'exited' and not metadata['State']['Running']
        runner.update(observedState='exited', running=False, finishedAt=metadata['State']['FinishedAt'], responseEndpointsStopped=True)
    postgres = container('postgres')
    assert postgres['State']['Running']
    # Reads the credential inside the own PostgreSQL container. Never prints it.
    sql_command = 'export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -At -v ON_ERROR_STOP=1'
    owners = [runner['owner'] for runner in runners]
    sql = "SELECT row_to_json(t) FROM (SELECT (SELECT count(*) FROM pg_stat_activity WHERE usename IN ('saas_tenant_a','saas_tenant_b','saas_demo')) AS tenant_count,(SELECT count(*) FROM pg_stat_activity WHERE application_name='mecanet-qa-api:" + owners[0] + "') AS api1_count,(SELECT count(*) FROM pg_stat_activity WHERE application_name='mecanet-qa-api:" + owners[1] + "') AS api2_count) t;"
    observed = json.loads(output(['docker', 'exec', '-i', postgres['Id'], 'sh', '-c', sql_command], sql))
    assert observed['tenant_count'] == 0
    for index, runner in enumerate(runners, 1):
        runner['apiBackendCount'] = observed['api' + str(index) + '_count']
        assert runner['apiBackendCount'] == 0
    proof = {'project': PROJECT, 'generation': cohort['generation'], 'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'tenantBackendCount': observed['tenant_count'], 'runners': runners}
    save_proof(proof)
    print(json.dumps({'phase': mode, 'status': 'PASS', 'ownApiContainersExited': 2, 'oldApiBackends': 0, 'tenantBackends': 0, 'sharedResourcesChanged': 0}))
else:
    proof = json.loads((ROOT / 'evidence' / 'admission-runner-proof.json').read_text())
    assert proof['project'] == PROJECT and len(proof['runners']) == 2
    for runner in proof['runners']:
        metadata = container(runner['service'])
        assert metadata['Id'] == runner['containerId']
        assert metadata['State']['Status'] == 'exited' and not metadata['State']['Running']
    subprocess.run(command + ['up', '-d', '--no-deps', '--force-recreate', 'api1', 'api2'], check=True, timeout=80)
    # Nginx resolves each Docker upstream at startup. Recreating the APIs can
    # change their IPs; recreate only our web entry after their new endpoints
    # exist so the two private upstream sockets keep their exact identities.
    subprocess.run(command + ['up', '-d', '--no-deps', '--force-recreate', 'web'], check=True, timeout=80)
    print(json.dumps({'phase': mode, 'restartRequested': True, 'onlyServices': ['api1', 'api2', 'web'], 'privateUpstreamsRefreshed': True, 'sharedResourcesChanged': 0}))
