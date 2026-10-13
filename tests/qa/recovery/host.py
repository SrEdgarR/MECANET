"""Private operator controller. Run locally on the approved VPS as root; no SSH.

Mutations are restricted to the pre-existing owned QA project. This controller
never reopens the source/target, deletes bind data, or changes a shared resource.
"""
import argparse
import fcntl
import hashlib
import ipaddress
import json
import os
import pathlib
import shutil
import subprocess
import time
import uuid

ROOT = pathlib.Path('/opt/mecanet-qa-p1l1')
PROJECT = 'mecanet-qa-p1l1'
PG_IMAGE = 'postgres@sha256:67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129'
RESTORE_NET = PROJECT + '-restore'
PGDATA = ROOT / 'data/18/docker'
RESTORE_DATA = ROOT / 'restore-data/18/docker'
AUDIT = []


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def owned(path, exists=True):
    path = pathlib.Path(path)
    require(path != ROOT and path.is_relative_to(ROOT), 'PATH_OUTSIDE_QA')
    require(path.resolve(strict=exists).is_relative_to(ROOT), 'PATH_ESCAPES_QA')
    for part in [path, *list(path.parents)[:len(path.relative_to(ROOT).parts) - 1]]:
        require(not part.is_symlink(), 'SYMLINK_NOT_ALLOWED')
    if exists:
        require(path.exists(), 'OWNED_PATH_MISSING')
    return path


def run(args, timeout=60, input_text=None):
    started = time.monotonic()
    try:
        result = subprocess.run(args, input=input_text, text=True, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        AUDIT.append({'tool': pathlib.Path(args[0]).name, 'timeout': timeout})
        raise RuntimeError('OWN_QA_COMMAND_TIMEOUT') from None
    AUDIT.append({'tool': pathlib.Path(args[0]).name, 'exitCode': result.returncode, 'seconds': round(time.monotonic() - started, 3)})
    require(result.returncode == 0, 'OWN_QA_COMMAND_FAILED_' + pathlib.Path(args[0]).name)
    return result.stdout


def durable_json(path, value, uid=999):
    path = owned(path, exists=False)
    temporary = path.with_name(path.name + '.new')
    with open(temporary, 'x', encoding='utf8') as handle:
        os.chmod(temporary, 0o600)
        os.chown(temporary, uid, uid)
        json.dump(value, handle, separators=(',', ':'))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def json_file(relative):
    return json.loads(owned(ROOT / relative).read_text())


def compose(restore=False):
    args = ['docker', 'compose', '--profile', 'tools', '--profile', 'recovery', '-p', PROJECT, '-f', str(ROOT / 'compose.yaml'), '-f', str(ROOT / 'recovery.compose.yaml')]
    if restore:
        args += ['-f', str(ROOT / 'restore-only.compose.yaml')]
    return args


def inspect_id(identifier):
    rows = json.loads(run(['docker', 'inspect', identifier]))
    require(len(rows) == 1, 'AMBIGUOUS_CONTAINER')
    item = rows[0]
    require(item['Config'].get('Labels', {}).get('com.docker.compose.project') == PROJECT, 'FOREIGN_CONTAINER')
    return item


def service(name, required=True):
    ids = run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + PROJECT,
               '--filter', 'label=com.docker.compose.service=' + name,
               '--filter', 'label=com.docker.compose.oneoff=False']).split()
    require(len(ids) <= 1, 'AMBIGUOUS_SERVICE')
    if not ids:
        require(not required, 'QA_SERVICE_MISSING_' + name)
        return None
    return inspect_id(ids[0])


def source_sql(sql):
    pg = service('postgres')
    require(pg['State']['Running'], 'SOURCE_POSTGRES_STOPPED')
    # Constant private shell reads the own container's mounted secret. Passwords
    # are never interpolated into a command, output, evidence or process argument.
    command = 'export PGPASSWORD; PGPASSWORD="$(cat /run/secrets/bootstrap)"; exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -At -v ON_ERROR_STOP=1'
    return json.loads(run(['docker', 'exec', '-i', pg['Id'], 'sh', '-c', command], input_text=sql))


def source_facts():
    facts = source_sql("SELECT row_to_json(q) FROM (SELECT (SELECT system_identifier::text FROM pg_control_system()) AS system_id,current_setting('server_version_num')::int AS version,barrier,generation::text,tick::text,(SELECT count(*)::int FROM saas.tickets WHERE state IN ('WAITING','ACTIVE','UNCERTAIN')) AS live FROM saas.admission_fence WHERE id=1)q;")
    qa = json_file('secrets/connections.json')
    require(facts['system_id'] == qa['systemIdentifier'] and facts['version'] == 180006 and facts['generation'] == qa['generation'], 'SOURCE_COHORT_MISMATCH')
    return facts


def own_running():
    ids = run(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=' + PROJECT]).split()
    return [inspect_id(identifier) for identifier in ids]


def envelope(extra_cpu=0, extra_memory=0):
    running = own_running()
    require(all(item['HostConfig']['NanoCpus'] > 0 and item['HostConfig']['Memory'] > 0 for item in running), 'UNBOUNDED_OWN_CONTAINER')
    require(sum(item['HostConfig']['NanoCpus'] for item in running) + extra_cpu <= 1_000_000_000, 'CPU_LIMIT_EXCEEDED')
    require(sum(item['HostConfig']['Memory'] for item in running) + extra_memory <= 2 * 1024**3, 'MEMORY_LIMIT_EXCEEDED')
    return {'running': len(running), 'cpu': sum(item['HostConfig']['NanoCpus'] for item in running) / 1e9, 'memoryMiB': sum(item['HostConfig']['Memory'] for item in running) // 1024**2}


def headroom():
    memory = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
    available = int(memory['MemAvailable'].split()[0]) * 1024
    disk = shutil.disk_usage(ROOT)
    require(available >= 5 * 1024**3, 'HOST_MEMORY_PRESSURE')
    require(disk.free > max(15 * 1024**3, disk.total * .1), 'HOST_DISK_PRESSURE')
    def sample():
        return list(map(int, pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
    first = sample()
    time.sleep(.5)
    delta = [b - a for a, b in zip(first, sample())]
    busy = 1 - (delta[3] + delta[4]) / sum(delta)
    require(busy < .8, 'HOST_CPU_PRESSURE')
    return {'availableMemoryBytes': available, 'diskFreeBytes': disk.free, 'cpuBusyPercent': round(busy * 100, 2)}


def tool(service_name, command, tag, restore=False, timeout=60):
    name = PROJECT + '-recovery-' + tag
    require(not run(['docker', 'ps', '-aq', '--filter', 'name=^/' + name + '$']).strip(), 'TOOL_CONTAINER_ALREADY_EXISTS')
    cpu = 50_000_000 if service_name == 'harness' else 250_000_000
    envelope(cpu, 128 * 1024**2)
    try:
        return run(compose(restore) + ['run', '--rm', '--no-deps', '-T', '--name', name, service_name, *command], timeout=timeout)
    finally:
        # Timeout of the Compose client does not imply its container exited.
        ids = run(['docker', 'ps', '-aq', '--filter', 'name=^/' + name + '$']).split()
        for identifier in ids:
            item = inspect_id(identifier)
            require(item['Config']['Labels']['com.docker.compose.service'] == service_name, 'TOOL_SERVICE_MISMATCH')
            if item['State']['Running']:
                run(['docker', 'stop', '-t', '10', identifier], timeout=20)
            run(['docker', 'rm', identifier])


def ensure_stopped():
    stopped = {}
    for name in ['api1', 'api2', 'web', 'worker']:
        item = service(name)
        require(not item['State']['Running'] and item['State']['Status'] == 'exited', 'SOURCE_RUNNER_STILL_RUNNING_' + name)
        stopped[name] = {'id': item['Id'], 'finishedAt': item['State']['FinishedAt'], 'state': 'exited'}
    return stopped


def safe_tree(path):
    path = owned(path)
    total = 0
    files = 0
    for folder, directories, names in os.walk(path, followlinks=False):
        for name in [*directories, *names]:
            child = pathlib.Path(folder) / name
            require(not child.is_symlink(), 'BACKUP_SYMLINK_NOT_ALLOWED')
        for name in names:
            child = pathlib.Path(folder) / name
            require(child.is_file(), 'BACKUP_SPECIAL_FILE_NOT_ALLOWED')
            total += child.stat().st_size
            files += 1
    return {'bytes': total, 'files': files}


def init():
    for name in ['recovery', 'backup']:
        directory = owned(ROOT / name, exists=False)
        directory.mkdir(exist_ok=True)
        require(not any(directory.iterdir()), 'RECOVERY_DIRECTORY_NOT_EMPTY_' + name)
        os.chown(directory, 999, 999)
        os.chmod(directory, 0o700)
    require(not (ROOT / 'restore-data').exists(), 'RESTORE_DIRECTORY_ALREADY_EXISTS')
    for name in ['recovery.compose.yaml', 'restore-only.compose.yaml']:
        source = owned(ROOT / 'release/tests/qa/infra' / name)
        destination = owned(ROOT / name, exists=False)
        if destination.exists():
            require(destination.read_bytes() == source.read_bytes(), 'RECOVERY_CONFIG_MISMATCH')
        else:
            with open(destination, 'xb') as handle:
                handle.write(source.read_bytes())
                handle.flush()
                os.fsync(handle.fileno())
        os.chmod(destination, 0o600)
    qa = json_file('secrets/connections.json')
    backup = qa['connections']['saas_backup']
    require(backup['host'] == 'postgres' and backup['user'] == 'saas_backup' and backup['port'] == 5432, 'BACKUP_IDENTITY_MISMATCH')
    require('\n' not in backup['password'] and '\r' not in backup['password'], 'INVALID_BACKUP_SECRET')
    password = backup['password'].replace('\\', '\\\\').replace(':', '\\:')
    pgpass = owned(ROOT / 'secrets/backup.pgpass', exists=False)
    content = 'postgres:5432:replication:saas_backup:' + password + '\n'
    if pgpass.exists():
        require(pgpass.read_text() == content and pgpass.stat().st_uid == 999 and pgpass.stat().st_mode & 0o777 == 0o400, 'BACKUP_SECRET_MISMATCH')
    else:
        with open(pgpass, 'x') as handle:
            os.chmod(pgpass, 0o400)
            os.chown(pgpass, 999, 999)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
    config = json.loads(run(compose(True) + ['config', '--format', 'json']))
    require(set(config['services']['harness']['networks']) == {'restore'}, 'RESTORE_HELPER_SOURCE_NETWORK')
    require(config['services']['postgres-restore']['image'] == PG_IMAGE, 'RESTORE_IMAGE_MISMATCH')
    durable_json(ROOT / 'recovery/host-init.json', {'project': PROJECT, 'initializedAt': time.time(), 'envelope': envelope(), 'headroom': headroom(), 'restoreHelperNetworks': ['restore']})
    return {'initialized': True, 'secretsPrinted': False}


def snapshot_proof():
    require(json_file('recovery/state.json')['phase'] == 'barrier', 'BARRIER_PHASE_REQUIRED')
    facts = source_facts()
    require(facts['barrier'] is True, 'SOURCE_BARRIER_NOT_CLOSED')
    # Freeze maintenance before comparing authority fingerprints: window pruning
    # is a real writer even though it cannot admit work through the closed fence.
    run(compose() + ['stop', '-t', '35', 'worker'], timeout=45)
    require(not service('worker')['State']['Running'], 'WORKER_NOT_STOPPED')
    observations = []
    for name in ['api1', 'api2']:
        item = service(name)
        require(item['State']['Running'] and item['Config']['User'] == '999:999', 'API_NOT_RUNNING_AS_QA_UID')
        owner = json.loads(run(['docker', 'exec', item['Id'], 'cat', '/tmp/qa-owner.json']))
        owner_id = str(uuid.UUID(owner['owner']))
        require(owner['generation'] == facts['generation'], 'API_GENERATION_MISMATCH')
        address = item['NetworkSettings']['Networks'][PROJECT + '-data']['IPAddress']
        rows = source_sql("SELECT coalesce(json_agg(q),'[]'::json) FROM (SELECT pid,application_name,host(client_addr) AS client_addr FROM pg_stat_activity WHERE application_name='mecanet-qa-api:" + owner_id + "')q;")
        require(rows and all(row['client_addr'] == address for row in rows), 'API_OWNER_PG_PROVENANCE_MISMATCH')
        observations.append({'service': name, 'containerId': item['Id'], 'uid': 999, 'owner': owner_id, 'generation': owner['generation'], 'clientAddress': address, 'pgBackends': rows})
    require(len({row['owner'] for row in observations}) == 2, 'DUPLICATE_API_OWNER')
    fingerprint_sql = "SELECT row_to_json(q) FROM (SELECT (SELECT count(*) FROM saas.tickets) AS tickets,(SELECT count(*) FROM saas.session_registry) AS sessions,(SELECT coalesce(sum(qh+qc+qt),0)::text FROM saas.windows) AS consumption)q;"
    before = source_sql(fingerprint_sql)
    script = """const http=await import('node:http');const out=[];for(const host of ['api1','api2']){const row=await new Promise((resolve,reject)=>{const req=http.get({host,port:3000,path:'/api/auth/session',headers:{Host:'app.mecanet.test:18443'}},res=>{let body='';res.on('data',b=>{body+=b;if(body.length>4096)req.destroy()});res.on('end',()=>resolve({host,status:res.statusCode,body:JSON.parse(body)}))});req.setTimeout(3000,()=>req.destroy(new Error('TIMEOUT')));req.on('error',reject)});if(row.status!==503||!['ADMISSION_CLOSED','CLOCK_UNAVAILABLE'].includes(row.body.error))throw new Error('BARRIER_REJECT_REQUIRED');out.push({host,status:row.status,error:row.body.error})}console.log(JSON.stringify(out))"""
    rejected = json.loads(tool('harness', ['node', '--input-type=module', '-e', script], 'barrier-probe'))
    require(source_sql(fingerprint_sql) == before, 'BARRIER_PROBE_CHANGED_AUTHORITY')
    # Capture provenance before stopping; each runner is checked again afterward.
    run(compose() + ['stop', '-t', '35', 'api1', 'api2', 'web', 'worker'], timeout=55)
    stopped = ensure_stopped()
    backend_count = source_sql("SELECT row_to_json(q) FROM (SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name LIKE 'mecanet-qa-api:%' OR application_name IN ('mecanet-qa-session','mecanet-qa-issuer','mecanet-qa-saas_clock','mecanet-qa-saas_measure','mecanet-qa-saas_reconciler','mecanet-qa-saas_policy'))q;")
    require(backend_count['n'] == 0, 'SOURCE_BACKENDS_STILL_PRESENT')
    final = source_facts()
    proof = {'sourceBarrier': True, 'sourceStopped': False, 'clockStopped': True, 'projectionStopped': True, 'apiOwnersStopped': [row['owner'] for row in observations], 'apiProvenance': observations, 'apiRejections': rejected, 'stoppedContainers': stopped, 'sourceFacts': final, 'liveTickets': final['live'], 'observedAt': time.time()}
    durable_json(ROOT / 'recovery/proof.json', proof)
    require(final['barrier'] is True and final['live'] == 0, 'RECOVERY_UNSETTLED_TICKETS_PROOF_SAVED')
    return {'barrier': True, 'apiRejected': 2, 'sourceRunnersStopped': True, 'liveTickets': 0}


def backup():
    ensure_stopped()
    require(json_file('recovery/state.json')['phase'] == 'snapshot', 'SNAPSHOT_REQUIRED')
    facts = source_facts()
    require(facts['barrier'] and facts['live'] == 0, 'SOURCE_NOT_CLOSED')
    destination = owned(ROOT / 'backup/base', exists=False)
    require(not destination.exists(), 'BACKUP_DESTINATION_NOT_NEW')
    headroom_before = headroom()
    detail = source_sql("SELECT row_to_json(q) FROM (SELECT (SELECT count(*) FROM pg_tablespace WHERE spcname NOT IN ('pg_default','pg_global')) AS other_tablespaces,current_setting('max_wal_size') AS max_wal_size,(SELECT coalesce(sum(size),0) FROM pg_ls_waldir()) AS wal_bytes)q;")
    require(int(detail['other_tablespaces']) == 0 and detail['max_wal_size'] == '512MB' and int(detail['wal_bytes']) <= 1024**3, 'WAL_OR_TABLESPACE_PREFLIGHT_FAILED')
    started = time.monotonic()
    tool('backup', ['pg_basebackup', '--host=postgres', '--username=saas_backup', '--pgdata=/backup/base', '--format=plain', '--wal-method=stream', '--checkpoint=fast', '--manifest-checksums=SHA256', '--max-rate=16M', '--no-password'], 'basebackup', timeout=300)
    version = tool('backup', ['pg_verifybackup', '--version'], 'verify-version').strip()
    expected_version = 'pg_verifybackup (PostgreSQL) 18.6'
    require(version == expected_version or version.startswith(expected_version + ' '), 'WRONG_BACKUP_TOOL_VERSION')
    tool('backup', ['pg_verifybackup', '/backup/base'], 'verifybackup', timeout=300)
    dimensions = safe_tree(destination)
    require(dimensions['bytes'] <= 2 * 1024**3, 'BACKUP_SIZE_LIMIT_EXCEEDED')
    manifest = (destination / 'backup_manifest').read_bytes()
    proof = {'pgVerifybackupExitCode': 0, 'toolVersion': '18.6', 'toolVersionOutput': version, 'manifestSha256': hashlib.sha256(manifest).hexdigest(), 'dimensions': dimensions, 'walBefore': detail, 'elapsedSeconds': round(time.monotonic() - started, 3), 'headroomBefore': headroom_before, 'headroomAfter': headroom(), 'observedAt': time.time()}
    durable_json(ROOT / 'recovery/backup-proof.json', proof)
    return {'backupVerified': True, 'bytes': dimensions['bytes'], 'files': dimensions['files'], 'elapsedSeconds': proof['elapsedSeconds']}


def check_restore_network_absent():
    names = run(['docker', 'network', 'ls', '--format', '{{.Name}}']).split()
    require(RESTORE_NET not in names, 'RESTORE_NETWORK_ALREADY_EXISTS')
    destination = ipaddress.ip_network('10.77.33.0/24')
    for name in names:
        item = json.loads(run(['docker', 'network', 'inspect', name]))[0]
        for config in item.get('IPAM', {}).get('Config') or []:
            if config.get('Subnet'):
                subnet = ipaddress.ip_network(config['Subnet'], strict=False)
                require(subnet.version != 4 or not subnet.overlaps(destination), 'RESTORE_SUBNET_CONFLICT')


def start_restore():
    ensure_stopped()
    state = json_file('recovery/state.json')
    require(state['phase'] == 'canaries', 'POST_BACKUP_CANARIES_REQUIRED')
    source = source_facts()
    require(source['barrier'] and source['live'] == 0, 'SOURCE_NOT_CLOSED')
    require(hashlib.sha256(owned(ROOT / 'backup/base/backup_manifest').read_bytes()).hexdigest() == state['backupManifestHash'], 'BACKUP_MANIFEST_CHANGED')
    require(json_file('recovery/backup-proof.json')['pgVerifybackupExitCode'] == 0, 'BACKUP_NOT_VERIFIED')
    require(service('postgres-restore', required=False) is None, 'RESTORE_CONTAINER_ALREADY_EXISTS')
    require(not (ROOT / 'restore-data').exists() and not (ROOT / 'tls/postgres-restore').exists(), 'RESTORE_DESTINATION_NOT_NEW')
    check_restore_network_absent()
    headroom()
    safe_tree(ROOT / 'backup/base')
    frozen_script = """const{readFile}=await import('node:fs/promises');const{createPgPool}=await import('./server/saas/db/pools.js');const{captureNonrestrictiveState}=await import('./tests/qa/recovery/coordinator.js');const state=JSON.parse(await readFile('/run/qa-recovery/state.json'));const pool=await createPgPool({host:'postgres',port:5432,database:'mecanet_control',user:'qa_bootstrap',password:await readFile('/run/qa-secrets/bootstrap','utf8'),ssl:{ca:await readFile('/run/qa-ca.crt','utf8'),servername:'postgres',rejectUnauthorized:true},max:1,connectionTimeoutMillis:2000,statement_timeout:2000});try{if((await captureNonrestrictiveState(pool)).hash!==state.nonrestrictive.hash)throw new Error('SOURCE_CHANGED_AFTER_BARRIER');console.log(JSON.stringify({sourceFrozen:true}))}finally{await pool.end()}"""
    require(json.loads(tool('harness', ['node', '--input-type=module', '-e', frozen_script], 'source-frozen'))['sourceFrozen'] is True, 'SOURCE_NOT_FROZEN')
    source_container = service('postgres')
    require(source_container['Config']['User'] == '999:999', 'PG_UID_NOT_VERIFIED')
    source_mounts = [item for item in source_container['Mounts'] if item['Destination'] == '/var/lib/postgresql']
    require(len(source_mounts) == 1 and source_mounts[0]['Type'] == 'bind' and source_mounts[0]['Source'] == str(ROOT / 'data'), 'SOURCE_PGDATA_MISMATCH')
    run(compose() + ['stop', '-t', '35', 'postgres'], timeout=45)
    stopped_source = service('postgres')
    require(not stopped_source['State']['Running'] and stopped_source['State']['Status'] == 'exited', 'SOURCE_POSTGRES_STILL_RUNNING')
    RESTORE_DATA.parent.mkdir(parents=True, exist_ok=False)
    shutil.copytree(owned(ROOT / 'backup/base'), owned(RESTORE_DATA, exists=False), symlinks=False)
    for folder, directories, names in os.walk(ROOT / 'restore-data'):
        os.chown(folder, 999, 999)
        os.chmod(folder, 0o700)
        for name in names:
            path = pathlib.Path(folder) / name
            os.chown(path, 999, 999)
            os.chmod(path, 0o600)
    require(not (RESTORE_DATA / 'standby.signal').exists() and not (RESTORE_DATA / 'recovery.signal').exists(), 'COPIED_RECOVERY_SIGNAL')
    auto = owned(RESTORE_DATA / 'postgresql.auto.conf').read_text()
    require(not [line for line in auto.splitlines() if line.strip() and not line.lstrip().startswith('#')], 'COPIED_AUTO_CONFIG_NOT_EMPTY')
    configuration = owned(ROOT / 'config/postgresql.conf').read_text()
    require(configuration == owned(ROOT / 'release/tests/qa/infra/postgresql.conf').read_text(), 'POSTGRES_CONFIGURATION_REVIEW_REQUIRED')
    for token in ['primary_conninfo', 'restore_command', 'archive_command', 'include_dir', 'include_if_exists', 'data_directory']:
        require(token not in configuration, 'SOURCE_CONNECTION_OR_PATH_CONFIG')
    hba = owned(ROOT / 'config/pg_hba.conf').read_text()
    require(hba == owned(ROOT / 'release/tests/qa/infra/pg_hba.conf').read_text(), 'HBA_REVIEW_REQUIRED')
    hba = '\n'.join(line for line in hba.replace('10.77.31.0/24', '10.77.33.0/24').splitlines() if not line.startswith('hostssl replication ')) + '\n'
    require('10.77.31.' not in hba, 'SOURCE_NETWORK_IN_RESTORE_HBA')
    for name, content in [('restore-postgresql.conf', configuration), ('restore-pg_hba.conf', hba)]:
        with open(owned(ROOT / 'config' / name, exists=False), 'x') as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(ROOT / 'config' / name, 0o444)
    tls = owned(ROOT / 'tls/postgres-restore', exists=False)
    tls.mkdir(mode=0o755)
    extensions = tls / 'extensions'
    extensions.write_text('subjectAltName=DNS:postgres-restore\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nbasicConstraints=critical,CA:FALSE\n')
    run(['openssl', 'req', '-newkey', 'rsa:3072', '-nodes', '-keyout', str(tls / 'server.key'), '-out', str(tls / 'server.csr'), '-subj', '/CN=postgres-restore'])
    run(['openssl', 'x509', '-req', '-in', str(tls / 'server.csr'), '-CA', str(ROOT / 'tls/ca.crt'), '-CAkey', str(ROOT / 'tls/ca.key'), '-set_serial', str(uuid.uuid4().int), '-out', str(tls / 'server.crt'), '-days', '7', '-extfile', str(extensions)])
    os.chown(tls / 'server.key', 999, 999)
    os.chmod(tls / 'server.key', 0o400)
    os.chmod(tls / 'server.crt', 0o444)
    run(['openssl', 'verify', '-CAfile', str(ROOT / 'tls/ca.crt'), '-verify_hostname', 'postgres-restore', str(tls / 'server.crt')])
    bootstrap = {'connection': {'host': 'postgres-restore', 'port': 5432, 'database': 'mecanet_control', 'user': 'qa_bootstrap', 'password': owned(ROOT / 'secrets/bootstrap').read_text(), 'ssl': {'ca': owned(ROOT / 'config/ca.crt').read_text(), 'servername': 'postgres-restore', 'rejectUnauthorized': True}}, 'source': {'service': 'postgres', 'volume': PROJECT + '_source-data', 'type': 'bind', 'path': str(ROOT / 'data')}, 'target': {'service': 'postgres-restore', 'volume': PROJECT + '_restore-data', 'type': 'bind', 'path': str(ROOT / 'restore-data')}}
    durable_json(ROOT / 'secrets/restore-bootstrap.json', bootstrap)
    config = json.loads(run(compose(True) + ['config', '--format', 'json']))
    require(set(config['services']['harness']['networks']) == {'restore'}, 'RESTORE_HELPER_SOURCE_NETWORK')
    require(all(mount['source'] != str(ROOT / 'data') for mount in config['services']['harness']['volumes']), 'SOURCE_DATA_MOUNTED_IN_HELPER')
    envelope(350_000_000, 640 * 1024**2)
    run(compose(True) + ['up', '-d', '--no-deps', 'postgres-restore'])
    target = service('postgres-restore')
    require(set(target['NetworkSettings']['Networks']) == {RESTORE_NET}, 'RESTORE_TARGET_NETWORKS_INVALID')
    require(not any(target['NetworkSettings']['Ports'].values()), 'RESTORE_PUBLIC_PORT')
    network = json.loads(run(['docker', 'network', 'inspect', RESTORE_NET]))[0]
    require(network.get('Labels', {}).get('com.docker.compose.project') == PROJECT and network['Internal'] and not network['EnableIPv6'] and network['Options'].get('com.docker.network.bridge.gateway_mode_ipv4') == 'isolated', 'RESTORE_NETWORK_NOT_ISOLATED')
    script = """const{readFile}=await import('node:fs/promises');const{createPgPool}=await import('./server/saas/db/pools.js');const net=await import('node:net');const c=JSON.parse(await readFile('/run/qa-secrets/restore-bootstrap.json'));let pool,row;for(let n=0;n<30;n++){try{pool=await createPgPool({...c.connection,max:1,connectionTimeoutMillis:500,statement_timeout:2000});row=(await pool.query(`SELECT system_identifier::text,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid())AS tls,(SELECT barrier FROM saas.admission_fence WHERE id=1)AS barrier,(SELECT generation::text FROM saas.admission_fence WHERE id=1)AS generation FROM pg_control_system()`)).rows[0];await pool.end();break}catch{await pool?.end().catch(()=>{});await new Promise(r=>setTimeout(r,500))}}if(!row)throw new Error('TARGET_NOT_READY');const probes=[];for(const[host,port]of[['1.1.1.1',443],['169.254.169.254',80],['10.77.31.2',5432]]){const result=await new Promise(resolve=>{const s=net.connect({host,port});let done=false;const end=r=>{if(done)return;done=true;s.destroy();resolve(r)};s.setTimeout(600,()=>end('BLOCKED'));s.on('error',()=>end('BLOCKED'));s.on('connect',()=>end('UNEXPECTED_ACCESS'))});if(result!=='BLOCKED')throw new Error('EGRESS_NOT_CLOSED');probes.push({host,port,result})}console.log(JSON.stringify({row,probes}))"""
    target_facts = json.loads(tool('harness', ['node', '--input-type=module', '-e', script], 'target-probe', restore=True, timeout=40))
    require(target_facts['row']['system_identifier'] == state['systemIdentifier'] and target_facts['row']['tls'] is True and target_facts['row']['barrier'] is True and target_facts['row']['generation'] == state['generation'], 'RESTORED_COHORT_NOT_CLOSED')
    require(not service('postgres')['State']['Running'], 'SOURCE_RESTARTED_DURING_RESTORE')
    proof = json_file('recovery/proof.json')
    proof.update(sourceStopped=True, sourceBarrier=True, targetEgressClosed=True, targetTlsReviewed=True, targetHbaReviewed=True, targetPrivate=True, backupVerified=True, sourceStoppedContainer={'id': stopped_source['Id'], 'finishedAt': stopped_source['State']['FinishedAt']}, targetContainer={'id': target['Id'], 'networkId': network['Id'], 'bind': str(ROOT / 'restore-data'), 'inode': (ROOT / 'restore-data').stat().st_ino}, sourceBind={'path': str(ROOT / 'data'), 'inode': (ROOT / 'data').stat().st_ino}, targetFacts=target_facts, observedAt=time.time())
    durable_json(ROOT / 'recovery/proof.json', proof)
    return {'sourceStopped': True, 'targetReady': True, 'targetTlsVerified': True, 'targetEgressProbesBlocked': 3, 'barrier': True, 'applicationReopened': False}


def cleanup_target():
    result = json_file('recovery/result.json')
    require(result['barrier'] is True and result['applicationReopened'] is False, 'CLOSED_RESTORE_RESULT_REQUIRED')
    require(not service('postgres')['State']['Running'], 'SOURCE_MUST_STAY_STOPPED')
    target = service('postgres-restore')
    run(compose(True) + ['stop', '-t', '35', 'postgres-restore'], timeout=45)
    require(not inspect_id(target['Id'])['State']['Running'], 'RESTORE_STILL_RUNNING')
    run(['docker', 'rm', target['Id']])
    network = json.loads(run(['docker', 'network', 'inspect', RESTORE_NET]))[0]
    require(network.get('Labels', {}).get('com.docker.compose.project') == PROJECT and not network.get('Containers'), 'RESTORE_NETWORK_NOT_OWN_EMPTY')
    run(['docker', 'network', 'rm', network['Id']])
    durable_json(ROOT / 'recovery/host-cleanup.json', {'targetContainerRemoved': target['Id'], 'targetNetworkRemoved': network['Id'], 'bindDataPreserved': True, 'backupPreserved': True, 'journalPreserved': True, 'sourceStopped': True, 'observedAt': time.time()})
    return {'targetContainerRemoved': True, 'targetNetworkRemoved': True, 'allBindDataPreserved': True, 'sourceStopped': True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['init', 'snapshot-proof', 'backup', 'start-restore', 'cleanup-target'])
    action = parser.parse_args().action
    require(os.geteuid() == 0 and os.uname().machine == 'aarch64', 'APPROVED_LINUX_ARM64_ROOT_REQUIRED')
    require(ROOT.resolve() == ROOT and not ROOT.is_symlink(), 'QA_ROOT_INVALID')
    owner = json_file('owner.json')
    require(owner.get('project') == PROJECT and owner.get('owner') == 'SrEdgarR/MECANET', 'QA_OWNERSHIP_NOT_ACREDITED')
    with open(owned(ROOT / '.recovery-host.lock', exists=False), 'a') as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = {'init': init, 'snapshot-proof': snapshot_proof, 'backup': backup, 'start-restore': start_restore, 'cleanup-target': cleanup_target}[action]()
        durable_json(ROOT / ('evidence/recovery-host-' + action + '.json'), {'action': action, 'result': result, 'commands': AUDIT, 'observedAt': time.time()}, uid=0)
        print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, KeyError, ValueError, subprocess.SubprocessError) as error:
        # Do not print traceback/local variables/child command output containing
        # private connection files. Existing data and closed states are retained.
        code = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print(json.dumps({'completed': False, 'error': code, 'reopen': False, 'automaticDataCleanup': False}))
        raise SystemExit(1)
