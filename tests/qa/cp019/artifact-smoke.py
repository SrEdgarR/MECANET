"""Passive import smoke of the exact HEAD runtime; never builds a tar or starts QA.

Run after committing this file:
  python -B tests/qa/cp019/artifact-smoke.py --source-sha HEAD40 --node ABSOLUTE_NODE
Only Git blob reads, installed module bytes and the closed UI build oracle are used.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import time
import types

MAX_FILES = 600
MAX_BYTES = 32 * 1024**2
SECONDS = 60
NODE_VERSION = 'v24.21.0'
IMPORTS = (
    'tests/qa/cp019/entry.mjs',
    'tests/qa/cp019/worker.mjs',
    'tests/qa/cp019/runtime-driver.mjs',
    'tests/qa/cp019/target-runtime.mjs',
    'tests/qa/cp019/browser.mjs',
    'server/saas/node_modules/pg/esm/index.mjs',
    'tests/qa/cp019/a5-negatives.mjs',
    'tests/qa/cp019/schema-fault-probe.mjs',
    'tests/qa/cp019/archived-l2-pools.mjs',
    'tests/qa/cp019/commit-fault-hook.mjs',
    'tests/qa/cp019/commit-fault-probe.mjs',
    'tests/qa/cp019/readiness-variant.mjs',
    'tests/qa/cp019/promotion-barrier.mjs',
)


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def support_environment():
    # No inherited NODE_OPTIONS, database settings, credentials or tool hooks.
    return {name: os.environ[name] for name in ('SystemRoot', 'WINDIR') if name in os.environ}


def collect_entries(root, sha, artifact, git):
    entries = {}
    size = 0

    def add(name, value):
        nonlocal size
        require(artifact.runtime_safe_path(name) and name not in entries, 'SMOKE_ENTRY_PATH')
        require(len(entries) < MAX_FILES and size + len(value) < MAX_BYTES, 'SMOKE_RUNTIME_BOUND')
        entries[name] = value
        size += len(value)

    tracked = git('ls-tree', '-r', '--name-only', sha, '--', 'package.json', 'server/saas', 'tests/qa').decode().splitlines()
    for name in tracked:
        if artifact.runtime_tracked_file(name):
            add(name, git('show', sha + ':' + name))
    modules = root / 'server/saas/node_modules'
    require(modules.is_dir() and not modules.is_symlink() and modules.resolve().is_relative_to(root), 'SMOKE_INSTALLED_MODULES_REQUIRED')
    for file in sorted(modules.rglob('*')):
        require(not file.is_symlink(), 'SMOKE_MODULE_LINK')
        if file.is_file() and artifact.runtime_dependency_file(file.relative_to(modules).as_posix()):
            require(size + file.stat().st_size < MAX_BYTES, 'SMOKE_RUNTIME_BOUND')
            add(file.relative_to(root).as_posix(), file.read_bytes())
    oracle = json.loads(git('show', sha + ':docs/evidence/cp019/ui-canonical-assets.json'))
    assets = artifact.validate_build_oracle(oracle, sha, git)
    for asset in assets:
        file = root / asset['path']
        require(file.resolve().is_relative_to(root / 'client/dist-saas') and not file.is_symlink(), 'SMOKE_UI_PATH')
        require(file.stat().st_size == asset['bytes'], 'SMOKE_UI_BYTES')
        value = file.read_bytes()
        require(artifact.digest(value) == asset['sha256'], 'SMOKE_UI_HASH')
        add(asset['path'], value)
    artifact.validate_runtime_closure(entries)
    require(all(name in entries for name in IMPORTS), 'SMOKE_IMPORT_SET')
    old_controllers={'tests/qa/cp019/resume.py','tests/qa/cp019/resume-state.py','tests/qa/cp019/compose-compat.py'}
    require(not old_controllers.intersection(entries) and not old_controllers.intersection(IMPORTS), 'SMOKE_HISTORICAL_R02_CONTROLLER_REJECTED')
    schema = entries['tests/qa/cp019/schema-fault-probe.mjs'].decode()
    component = re.search(r"const ARCHIVED_L2_COMPONENT=Object\.freeze\(\{baseSha:'([0-9a-f]{40})',sourcePath:'server/saas/db/pools\.js',sha256:'([0-9a-f]{64})'\}\);", schema)
    require(component is not None, 'SMOKE_ARCHIVED_COMPONENT_BINDING')
    old_sha, old_hash = component.groups()
    archived = entries['tests/qa/cp019/archived-l2-pools.mjs']
    require(artifact.digest(archived) == old_hash, 'SMOKE_ARCHIVED_COMPONENT_HASH')
    require(archived == git('show', old_sha + ':server/saas/db/pools.js'), 'SMOKE_ARCHIVED_COMPONENT_BLOB')
    return entries, assets, old_sha, old_hash


def stage_entries(stage, entries):
    for name, value in sorted(entries.items()):
        file = stage / name
        require(file.resolve().is_relative_to(stage) and file != stage, 'SMOKE_STAGE_PATH')
        file.parent.mkdir(parents=True, exist_ok=True)
        with file.open('xb') as output:
            output.write(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--node', required=True)
    args = parser.parse_args()
    started = time.monotonic()
    root = pathlib.Path(__file__).resolve().parents[3]
    require(__debug__, 'SMOKE_PYTHON_OPTIMIZATION_REJECTED')
    require(re.fullmatch('[0-9a-f]{40}', args.source_sha) is not None, 'SMOKE_SOURCE_SHA')
    node = pathlib.Path(args.node)
    require(node.is_absolute() and node.is_file() and not node.is_symlink() and node.name.lower() in ('node', 'node.exe'), 'SMOKE_NODE_PATH')
    node = node.resolve(strict=True)
    git_executable = shutil.which('git')
    require(git_executable is not None, 'SMOKE_GIT_REQUIRED')
    support = support_environment()
    git_environment = {**support, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_TERMINAL_PROMPT': '0', 'GIT_OPTIONAL_LOCKS': '0'}

    def run(argv, cwd, env, limit=15):
        remaining = SECONDS - (time.monotonic() - started)
        require(remaining > 0, 'SMOKE_TIME_BOUND')
        result = subprocess.run(argv, cwd=cwd, env=env, capture_output=True, timeout=min(limit, remaining), check=False)
        require(result.returncode == 0, 'SMOKE_CHILD_FAILED')
        return result.stdout

    def git(*arguments):
        return run([git_executable, '--no-pager', '--no-optional-locks', *arguments], root, git_environment)

    sha = args.source_sha
    require(git('rev-parse', 'HEAD').decode().strip() == sha, 'SMOKE_HEAD_MISMATCH')
    own_name = pathlib.Path(__file__).resolve().relative_to(root).as_posix()
    own_bytes = git('show', sha + ':' + own_name)
    require(pathlib.Path(__file__).read_bytes() == own_bytes, 'SMOKE_SCRIPT_BLOB_REQUIRED')
    selector_name = 'tests/qa/cp019/artifact.py'
    selector_bytes = git('show', sha + ':' + selector_name)
    artifact = types.ModuleType('cp020_artifact_blob')
    exec(compile(selector_bytes, selector_name, 'exec'), artifact.__dict__)
    require(run([str(node), '--version'], root, support).decode().strip() == NODE_VERSION, 'SMOKE_NODE_VERSION')
    entries, assets, old_sha, old_hash = collect_entries(root, sha, artifact, git)
    index = [{'path': name, 'bytes': len(value), 'sha256': artifact.digest(value)} for name, value in sorted(entries.items())]
    temp_root = pathlib.Path(tempfile.gettempdir()).resolve()
    stage = None
    try:
        with tempfile.TemporaryDirectory(prefix='mecanet-cp020-artifact-smoke-', dir=temp_root) as directory:
            stage = pathlib.Path(directory).resolve()
            require(stage.parent == temp_root and not stage.is_relative_to(root) and stage.name.startswith('mecanet-cp020-artifact-smoke-') and not stage.is_symlink(), 'SMOKE_TEMP_PATH')
            stage_entries(stage, entries)
            # --eval supplies no module main path, so the fixed CLI guards remain false.
            code = "import {pathToFileURL} from 'node:url';import {join} from 'node:path';const base=process.argv[1],names=JSON.parse(process.argv[2]);for(const name of names)await import(pathToFileURL(join(base,name)).href);console.log(JSON.stringify({status:'PASS',imports:names.length,node:process.version}));"
            result = run([str(node), '--input-type=module', '--eval', code, str(stage), json.dumps(IMPORTS)], stage, {**support, 'TEMP': str(stage), 'TMP': str(stage)}, limit=25)
            require(json.loads(result) == {'status': 'PASS', 'imports': len(IMPORTS), 'node': NODE_VERSION}, 'SMOKE_PASSIVE_IMPORT_OUTPUT')
    finally:
        require(stage is None or not stage.exists(), 'SMOKE_TEMP_CLEANUP')
    require(git('rev-parse', 'HEAD').decode().strip() == sha, 'SMOKE_HEAD_CHANGED')
    require(time.monotonic() - started < SECONDS, 'SMOKE_TIME_BOUND')
    print(json.dumps({'schema': 'cp020-artifact-smoke-v1', 'status': 'PASS', 'sourceSha': sha,
        'selectorSha256': artifact.digest(selector_bytes), 'smokeSha256': artifact.digest(own_bytes),
        'runtimeIndexSha256': artifact.digest(artifact.canonical(index)), 'files': len(entries),
        'bytes': sum(map(len, entries.values())), 'publicBundleFiles': len(assets),
        'passiveImports': list(IMPORTS), 'nodeVersion': NODE_VERSION,
        'archivedComponent': {'baseSha': old_sha, 'sha256': old_hash},
        'temporaryStageRemoved': True, 'archiveWritten': False, 'secretOutput': False,
        'elapsedSeconds': round(time.monotonic() - started, 3)}))


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        # Child logs and paths never become public evidence, including on failure.
        code = str(error) if re.fullmatch('SMOKE_[A-Z_]+', str(error)) else 'PASSIVE_ARTIFACT_SMOKE_FAILED'
        print(json.dumps({'schema': 'cp020-artifact-smoke-v1', 'status': 'FAIL', 'code': code, 'secretOutput': False}))
        raise SystemExit(1)
