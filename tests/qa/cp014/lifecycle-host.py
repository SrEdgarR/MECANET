"""Bounded drain of exact, synthetic CP-014 API; no shared service controls."""
import json, os, pathlib, subprocess, sys, time

ROOT = pathlib.Path('/opt/mecanet-qa-p1l1-cp014')
PROJECT = ROOT.name
assert os.geteuid() == 0 and ROOT.resolve() == ROOT
owner = json.loads((ROOT / 'owner.json').read_text())
assert owner['project'] == PROJECT and owner['owner'] == 'SrEdgarR/MECANET'
assert owner['base'] == '5624ef0da489d2285534a942bd6ce9eab22f280d'
checkpoint = sys.argv[1] if len(sys.argv) > 1 else 'admission.bytes'
instance = sys.argv[2] if len(sys.argv) > 2 else 'api1'
assert checkpoint in ('admission.started', 'admission.bytes')
assert instance in ('api1', 'api2')
key = instance + '-' + checkpoint.replace('.', '-')
c = ['docker', 'compose', '-f', str(ROOT / 'compose.yaml')]

def compose(*args):
    return subprocess.check_output(c + list(args), text=True)

def inspect(container):
    result = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True))[0]
    labels = result['Config']['Labels']
    assert labels.get('com.docker.compose.project') == PROJECT
    return result

container = compose('ps', '-q', instance).strip()
assert container and inspect(container)['State']['Running']
assert inspect(container)['Config']['Labels']['com.docker.compose.service'] == instance
postgres = compose('ps', '-q', 'postgres').strip()
assert postgres and inspect(postgres)['State']['Running']
assert inspect(postgres)['Config']['Labels']['com.docker.compose.service'] == 'postgres'
command = 'export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -At -v ON_ERROR_STOP=1'

def sql(query):
    # The fixed command consumes an own fixture secret without displaying it.
    return json.loads(subprocess.check_output(['docker', 'exec', '-i', postgres, 'sh', '-c', command], input=query, text=True))

before = inspect(container)
before_owner = json.loads(compose('exec', '-T', instance, 'cat', '/tmp/qa-owner.json'))['owner']
ready_path = ROOT / 'faults' / ('lifecycle-' + key + '-ready.json')
flight_path = ROOT / 'evidence' / ('lifecycle-' + key + '-flight.json')
for file in [ready_path, flight_path]:
    assert file.resolve().is_relative_to(ROOT)
    if file.exists():
        file.unlink()
probe = subprocess.Popen(c + ['run', '--rm', '--no-deps', 'probe', 'node', 'tests/qa/cp014/lifecycle-live.mjs', 'flight', checkpoint, instance], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
signalled = False
try:
    deadline = time.monotonic() + 20
    while not ready_path.exists() and time.monotonic() < deadline:
        assert probe.poll() is None, 'LIFECYCLE_PROBE_ENDED_BEFORE_GATE'
        time.sleep(.05)
    assert ready_path.exists(), 'LIFECYCLE_GATE_NOT_REACHED'
    gate = json.loads(ready_path.read_text())
    assert gate['instance'] == instance and gate['checkpoint'] == checkpoint and gate['owner'] == before_owner
    ticket_id = gate['ticketId']
    assert len(ticket_id) == 36 and all(ch in '0123456789abcdef-' for ch in ticket_id)
    ticket_before = sql("SELECT row_to_json(t) FROM (SELECT id,owner,state,work_started,reserved_qc,reserved_qt FROM saas.tickets WHERE id='" + ticket_id + "')t;")
    assert ticket_before['state'] == 'ACTIVE' and ticket_before['work_started'] is True and ticket_before['reserved_qc'] == 0
    if checkpoint == 'admission.bytes':
        assert ticket_before['reserved_qt'] > 0
    assert inspect(container)['State']['Running']
    started = time.monotonic()
    subprocess.run(['docker', 'kill', '--signal', 'TERM', container], check=True, stdout=subprocess.DEVNULL)
    signalled = True
    stdout, stderr = probe.communicate(timeout=14)
    if probe.returncode != 0:
        # Probe emits only a sanitized status/code; never raw request/config.
        print(stdout.strip())
        print(stderr.strip())
    assert probe.returncode == 0 and flight_path.exists(), 'LIFECYCLE_FLIGHT_FAILED'
    stop_deadline = started + 30
    while inspect(container)['State']['Running'] and time.monotonic() < stop_deadline:
        time.sleep(.05)
    stopped = inspect(container)
    elapsed = time.monotonic() - started
    assert not stopped['State']['Running'] and elapsed <= 30, 'DRAIN_EXCEEDED_30_SECONDS'
    assert stopped['State']['ExitCode'] == 0 and stopped['State']['OOMKilled'] is False
    ticket_after = sql("SELECT row_to_json(t) FROM (SELECT id,state,reserved_qc,reserved_qt,work_started FROM saas.tickets WHERE id='" + ticket_id + "')t;")
    assert ticket_after['state'] == 'FINISHED' and ticket_after['reserved_qc'] == 0 and ticket_after['reserved_qt'] == 0
    workspace = next(m['Source'] for m in before['Mounts'] if m['Destination'] == '/workspace')
    assert pathlib.Path(workspace).resolve().is_relative_to(ROOT)
    result = {'result': 'PASS', 'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'checkpoint': checkpoint, 'instance': instance, 'containerId': container, 'nodeImageId': before['Image'], 'workspace': workspace, 'apiOwner': before_owner, 'ticketBefore': ticket_before, 'ticketAfter': ticket_after, 'termSignalConfirmed': True, 'orderedStopSeconds': round(elapsed, 3), 'exitCode': stopped['State']['ExitCode'], 'oomKilled': stopped['State']['OOMKilled'], 'flight': json.loads(flight_path.read_text()), 'contractSeconds': 30}
    (ROOT / 'evidence' / ('lifecycle-' + key + '-host.json')).write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except BaseException:
    if probe.poll() is None:
        probe.terminate()
        try:
            probe.wait(timeout=3)
        except subprocess.TimeoutExpired:
            probe.kill(); probe.wait(timeout=3)
    raise
finally:
    # Reopening this new cohort is safe: no restore barrier is changed. Only
    # the exact signalled API is started; PostgreSQL/worker/other apps untouched.
    if signalled and not inspect(container)['State']['Running']:
        subprocess.run(c + ['up', '-d', '--no-deps', instance], check=True)
