"""Local immutable release from Git blobs, approved installed modules and UI oracle.
No SSH, build, secrets, dependency installation, or working-tree source bytes.
"""
import hashlib, io, json, pathlib, subprocess, tarfile, re, os, posixpath, fnmatch

def git(*args):
    return subprocess.check_output(['git', *args])

def digest(value):
    return hashlib.sha256(value).hexdigest()

def canonical(value):
    return json.dumps(value, separators=(',', ':'), sort_keys=True).encode()

def validate_build_oracle(oracle, sha, blob=git):
    assert oracle['schema']=='cp019-ui-epoch-build-v1' and oracle['status']=='PASS' and oracle['secretOutput'] is False
    assert oracle['baselineSha256']=='4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec'
    source=blob('show',sha+':scripts/ci/saas-toolchain.mjs').decode()
    array=source.split('export const sourceFiles = Object.freeze([',1)[1].split(']);',1)[0]
    names=re.findall(r"'([a-zA-Z0-9_./-]+)'",array)
    assert len(names)==26 and len(set(names))==26,'CLOSED_BUILD_SOURCE_REGISTRY_REQUIRED'
    expected={name:name for name in names}
    expected.update({'scripts/ci/saas-toolchain/package.json':'client/package.json','scripts/ci/saas-toolchain/package-lock.json':'client/package-lock.json'})
    inputs=oracle['inputs'];assert len(inputs)==28 and len({e['source'] for e in inputs})==28 and {e['source'] for e in inputs}==set(expected),'CLOSED_BUILD_INPUTS_REQUIRED'
    for e in inputs:
        assert set(e)=={'source','target','bytes','sha256'} and e['target']==expected[e['source']],'BUILD_INPUT_SHAPE'
        value=blob('show',sha+':'+e['source'])
        assert len(value)==e['bytes'] and digest(value)==e['sha256'],'BUILD_SOURCE_PROVENANCE_REQUIRED'
    assets=oracle['assets'];assert len(assets)==3 and len({e['path'] for e in assets})==3,'CLOSED_BUILD_ASSETS_REQUIRED'
    assert sum(e['path']=='client/dist-saas/saas.html' for e in assets)==1,'CLOSED_BUILD_ASSETS_REQUIRED'
    for extension in ('js','css'):
        assert sum(bool(re.fullmatch(r'client/dist-saas/assets/saas-[A-Za-z0-9_-]+\.'+extension,e['path'])) for e in assets)==1,'CLOSED_BUILD_ASSETS_REQUIRED'
    assert all(set(e)=={'path','bytes','sha256'} and type(e['bytes']) is int and e['bytes']>0 and re.fullmatch('[a-f0-9]{64}',e['sha256']) for e in assets),'BUILD_ASSET_SHAPE'
    return assets

def runtime_safe_path(name):
    p=pathlib.PurePosixPath(name)
    return isinstance(name,str) and not p.is_absolute() and '\\' not in name and all(x not in ['', '.', '..','secrets','master','backup','__pycache__','.qa-private'] and not x.startswith('.env') for x in p.parts)

def runtime_tracked_file(name):
    if not runtime_safe_path(name):return False
    if name in ['tests/qa/cp019/resume.py','tests/qa/cp019/resume-state.py','tests/qa/cp019/compose-compat.py']:return False # Historical r02 continuations are never r03 runtime.
    p=pathlib.PurePosixPath(name)
    if name in ['package.json','tests/qa/issuer.js','tests/qa/cp019/budget-limits.json']:return True
    if name.startswith('server/saas/') and 'node_modules' not in p.parts:return p.suffix in ['.js','.mjs','.cjs','.json','.sql']
    if name in ['tests/qa/infra/nginx.conf','tests/qa/infra/postgresql.conf','tests/qa/infra/pg_hba.conf']:return True
    return name.startswith('tests/qa/cp019/') and p.suffix in ['.mjs','.py'] and '.test.' not in p.name

def runtime_dependency_file(name):
    if not runtime_safe_path(name) or '.bin' in pathlib.PurePosixPath(name).parts:return False
    p=pathlib.PurePosixPath(name)
    return p.suffix in ['.js','.mjs','.cjs','.json','.sql','.txt'] or p.name.upper().split('.')[0] in ['LICENSE','LICENCE','COPYING','NOTICE']

def validate_runtime_closure(entries):
    """Passive guard for own literal imports and installed runtime package entries.
    Dynamic expressions (the host's browser path) are deliberately not executed.
    Root metadata supplies ESM scope only; its legacy main/scripts are not staged.
    """
    assert 'package.json' in entries and json.loads(entries['package.json']).get('type')=='module','ROOT_ESM_PACKAGE_REQUIRED'
    scope='server/saas/package.json'
    assert scope in entries and json.loads(entries[scope]).get('type')=='module','SAAS_ESM_PACKAGE_REQUIRED'
    dependencies=json.loads(entries[scope]).get('dependencies',{})
    modules='server/saas/node_modules/'
    for name in dependencies:
        assert modules+name+'/package.json' in entries,'RUNTIME_PACKAGE_REQUIRED: '+name
    literals=re.compile(r'''\b(?:from\s*|import\s*)['"]([^'"\r\n]+)['"]|\b(?:import|require)\s*\(\s*['"]([^'"\r\n]+)['"]\s*\)''')
    for name,value in entries.items():
        if not runtime_tracked_file(name) or '/node_modules/' in name or pathlib.PurePosixPath(name).suffix not in ['.js','.mjs','.cjs']:continue
        for match in literals.findall(value.decode()):
            specifier=next(value for value in match if value)
            if specifier.startswith('node:'):continue
            if specifier.startswith('.'):
                target=posixpath.normpath(posixpath.join(posixpath.dirname(name),specifier))
                assert runtime_safe_path(target) and target in entries,'RUNTIME_IMPORT_REQUIRED: '+name+' -> '+specifier
            else:
                assert specifier in dependencies and modules+specifier+'/package.json' in entries,'RUNTIME_PACKAGE_REQUIRED: '+name+' -> '+specifier
    def package_entry(directory,target,legacy=False):
        assert isinstance(target,str),'RUNTIME_PACKAGE_ENTRY_REQUIRED'
        path=posixpath.normpath(posixpath.join(directory,target))
        assert path.startswith(directory+'/') and runtime_safe_path(path),'RUNTIME_PACKAGE_ENTRY_REQUIRED: '+path
        if '*' in path:
            assert any(fnmatch.fnmatchcase(name,path) for name in entries),'RUNTIME_PACKAGE_ENTRY_REQUIRED: '+path
        else:
            candidates=[path,path+'.js',path+'.json',path+'/index.js'] if legacy else [path]
            assert any(candidate in entries for candidate in candidates),'RUNTIME_PACKAGE_ENTRY_REQUIRED: '+path
    def runtime_exports(directory,value):
        if isinstance(value,str):package_entry(directory,value)
        elif isinstance(value,list):
            for target in value:runtime_exports(directory,target)
        elif isinstance(value,dict):
            for condition,target in value.items():
                if condition!='types':runtime_exports(directory,target)
    for name,value in entries.items():
        if not name.startswith(modules) or not name.endswith('/package.json'):continue
        package=json.loads(value);directory=posixpath.dirname(name)
        if package.get('main'):package_entry(directory,package['main'],legacy=True)
        elif 'main' not in package and 'exports' not in package:package_entry(directory,'index.js')
        runtime_exports(directory,package.get('exports'))

def main():
    root = pathlib.Path.cwd().resolve()
    target = root / '.qa-private/cp022-artifact.tar'
    manifest_path = target.parent / 'cp022-artifact.json'
    assert target.parent.resolve() == root / '.qa-private'
    assert not any(p.exists() or p.is_symlink() for p in (target,manifest_path)), 'ARTIFACT_EXISTS_KEEP'
    sha = git('rev-parse', 'HEAD').decode().strip()
    assert len(sha) == 40
    assert not git('status', '--porcelain', '--', 'package.json', 'server/saas', 'tests/qa', 'client/src/saas').strip(), 'COMMIT_SOURCE_BEFORE_STAGING'
    entries = {}
    tracked = git('ls-tree', '-r', '--name-only', sha, '--', 'package.json', 'server/saas', 'tests/qa').decode().splitlines()
    for name in tracked:
        assert not any(x in name.split('/') for x in ['.env', '.qa-private', '__pycache__', 'secrets', 'backup'])
        if runtime_tracked_file(name):entries[name] = git('show', sha + ':' + name)
    modules = root / 'server/saas/node_modules'
    for file in modules.rglob('*'):
        assert not file.is_symlink(), 'MODULE_LINK_REJECTED'
        if file.is_file() and runtime_dependency_file(file.relative_to(modules).as_posix()):
            entries[file.relative_to(root).as_posix()] = file.read_bytes()
    oracle = json.loads(git('show', sha + ':docs/evidence/cp019/ui-canonical-assets.json'))
    for entry in validate_build_oracle(oracle,sha):
        file = root / entry['path']
        assert file.resolve().is_relative_to(root / 'client/dist-saas') and not file.is_symlink()
        value = file.read_bytes()
        assert len(value)==entry['bytes'] and digest(value) == entry['sha256'], 'FROZEN_L3_BUILD_BYTES_REQUIRED'
        entries[entry['path']] = value
    validate_runtime_closure(entries)
    index = [{'path': name, 'bytes': len(value), 'sha256': digest(value)} for name, value in sorted(entries.items())]
    artifact = 'sha256:' + digest(canonical(index))
    manifest = {'schema': 'cp019-artifact-v1', 'digest': artifact, 'sourceSha': sha, 'codeSha': sha,
                'baseline': '4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec', 'entries': index}
    entries['artifact.json'] = canonical(manifest)
    assert len(entries) <= 2000 and sum(map(len, entries.values())) < 32 * 1024**2
    with tarfile.open(target, 'x') as archive:
        for name, value in sorted(entries.items()):
            info = tarfile.TarInfo(name)
            info.size = len(value)
            info.mode = 0o444
            archive.addfile(info, io.BytesIO(value))
    with manifest_path.open('xb') as file:
        file.write(canonical(manifest))
        file.flush()
        os.fsync(file.fileno())
    print(json.dumps({'sourceSha': sha, 'artifact': artifact, 'files': len(entries),
                      'bytes': sum(map(len, entries.values())), 'publicBundleFiles': 3, 'source': 'git-blobs'}))

if __name__ == '__main__':
    main()
