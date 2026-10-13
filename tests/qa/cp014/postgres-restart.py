"""Restart only the exclusive CP-014 PostgreSQL, with all writers stopped."""
import json, os, pathlib, subprocess, time

ROOT = pathlib.Path('/opt/mecanet-qa-p1l1-cp014')
PROJECT = ROOT.name
BASE = '5624ef0da489d2285534a942bd6ce9eab22f280d'
assert os.geteuid() == 0 and ROOT.resolve() == ROOT
owner = json.loads((ROOT / 'owner.json').read_text())
assert owner['project'] == PROJECT and owner['owner'] == 'SrEdgarR/MECANET' and owner['base'] == BASE
compose = ['docker', 'compose', '-f', str(ROOT / 'compose.yaml')]

def output(*args):
    return subprocess.check_output(args, text=True).strip()

def state(container):
    # Narrow fields only; no Config.Env, secrets, labels or unrelated mounts dump.
    return json.loads(output('docker', 'inspect', '--format', '{{json .State}}', container))

def own_container(service):
    container = output(*compose, 'ps', '-aq', service)
    assert container and '\n' not in container
    project = output('docker', 'inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', container)
    actual_service = output('docker', 'inspect', '--format', '{{index .Config.Labels "com.docker.compose.service"}}', container)
    assert project == PROJECT and actual_service == service
    return container

stopped_writers = []
for service in ['api1', 'api2', 'worker']:
    container = own_container(service)
    observed = state(container)
    assert observed['Status'] == 'exited' and not observed['Running'], 'WRITERS_MUST_ALREADY_BE_STOPPED'
    stopped_writers.append({'service': service, 'containerId': container, 'finishedAt': observed['FinishedAt'], 'running': False})

postgres = own_container('postgres')
before_state = state(postgres)
assert before_state['Running']
image_id = output('docker', 'inspect', '--format', '{{.Image}}', postgres)
image_pin = output('docker', 'inspect', '--format', '{{.Config.Image}}', postgres)
assert image_pin == 'postgres@sha256:67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129'
data_format = '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{.Source}}{{end}}{{end}}'
data_mount = output('docker', 'inspect', '--format', data_format, postgres)
assert pathlib.Path(data_mount).resolve() == ROOT / 'data'
command = 'export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -At -v ON_ERROR_STOP=1'
query = "SELECT json_build_object('ready',true,'systemIdentifier',(pg_control_system()).system_identifier::text,'fsync',current_setting('fsync'),'fullPageWrites',current_setting('full_page_writes'),'synchronousCommit',current_setting('synchronous_commit'));"

def health(timeout=3):
    value = subprocess.check_output(['docker', 'exec', '-i', postgres, 'sh', '-c', command], input=query, text=True, stderr=subprocess.DEVNULL, timeout=timeout)
    return json.loads(value)

before = health()
expected_identifier = (ROOT / 'evidence' / 'system-id').read_text().strip()
assert before['systemIdentifier'] == expected_identifier
assert before['fsync'] == before['fullPageWrites'] == before['synchronousCommit'] == 'on'
started = time.monotonic()
subprocess.run(compose + ['stop', '-t', '20', 'postgres'], check=True, stdout=subprocess.DEVNULL)
exited = state(postgres)
assert not exited['Running'] and exited['Status'] == 'exited' and exited['ExitCode'] == 0 and not exited['OOMKilled']
subprocess.run(compose + ['start', 'postgres'], check=True, stdout=subprocess.DEVNULL)
health_deadline = time.monotonic() + 30
after = None
while time.monotonic() < health_deadline:
    try:
        after = health(timeout=min(3, max(.1, health_deadline - time.monotonic())))
        break
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError):
        time.sleep(.2)
assert after is not None and after == before, 'POSTGRES_RESTART_HEALTH_FAILED'
after_state = state(postgres)
assert after_state['Running'] and after_state['StartedAt'] != before_state['StartedAt']
assert own_container('postgres') == postgres
assert output('docker', 'inspect', '--format', '{{.Image}}', postgres) == image_id
assert output('docker', 'inspect', '--format', '{{.Config.Image}}', postgres) == image_pin
assert output('docker', 'inspect', '--format', data_format, postgres) == data_mount
assert all(not state(writer['containerId'])['Running'] for writer in stopped_writers)
result = {'result': 'PASS', 'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'project': PROJECT, 'containerId': postgres, 'imagePin': image_pin, 'imageId': image_id, 'dataMount': data_mount, 'systemIdentifier': expected_identifier, 'startedAtBefore': before_state['StartedAt'], 'startedAtAfter': after_state['StartedAt'], 'stoppedBeforeStart': True, 'exitCode': exited['ExitCode'], 'oomKilled': exited['OOMKilled'], 'sameContainerImageAndStorage': True, 'healthyAfter': after, 'elapsedSeconds': round(time.monotonic() - started, 3), 'healthBoundSeconds': 30, 'writersRemainStopped': stopped_writers, 'scope': 'Exclusive synthetic PostgreSQL restart; no restore, downgrade, reset or shared service operation'}
(ROOT / 'evidence' / 'postgres-restart.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
