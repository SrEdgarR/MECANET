"""Local immutable overlay release from committed Git blobs and original r03.

No SSH/Docker, builds, dependency updates or credential reads. Existing archives
and r03's selected material are inputs, never overwritten. Main is explicit.
"""
import hashlib,importlib.util,io,json,pathlib,re,subprocess,tarfile

ORIGINAL_MANIFEST='1e0027ea22dd103eb51d5e0e484a831a8369c3e44eaa46cc9717468159cfb622'
MATERIAL='5590432f06cc93eb7a0c8490ff2afb614eb7557bc688097c13cea9db96f885c6'
def check(ok,code):
 if not ok:raise AssertionError(code)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def load(name,file):
 s=importlib.util.spec_from_file_location(name,file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def git(root,*args):return subprocess.check_output(['git',*args],cwd=root)
def original_entries(archive,manifest):
 expected={r['path']:r for r in manifest['entries']};check(len(expected)==len(manifest['entries']),'OVERLAY_ORIGINAL_DUPLICATE');result={}
 with tarfile.open(archive,'r:*') as tar:
  members=tar.getmembers();check(all(m.isfile() and not m.issym() and not m.islnk() and m.name in set(expected)|{'artifact.json'} and m.size<32*1024**2 for m in members),'OVERLAY_ORIGINAL_TAR_SCOPE')
  check(len(members)==len(expected)+1 and len({m.name for m in members})==len(members) and sum(m.size for m in members)<32*1024**2,'OVERLAY_ORIGINAL_TAR_SIZE')
  for member in members:
   raw=tar.extractfile(member).read();check(len(raw)==member.size,'OVERLAY_ORIGINAL_TAR_READ')
   if member.name=='artifact.json':check(digest(raw)==ORIGINAL_MANIFEST,'OVERLAY_ORIGINAL_MANIFEST');continue
   row=expected[member.name];check(len(raw)==row['bytes'] and digest(raw)==row['sha256'],'OVERLAY_ORIGINAL_TAR_HASH');result[member.name]=raw
 return result
def build(root,source_sha):
 root=root.resolve();check(re.fullmatch('[0-9a-f]{40}',source_sha) and git(root,'rev-parse','HEAD').decode().strip()==source_sha,'OVERLAY_COMMITTED_HEAD')
 check(not git(root,'status','--porcelain','--','package.json','server/saas','tests/qa','client/src/saas').strip(),'OVERLAY_COMMIT_SOURCE_FIRST')
 private=root/'.qa-private';check(private.resolve()==private and not private.is_symlink(),'OVERLAY_PRIVATE_PATH')
 original_file=private/'cp022-artifact.json';check(original_file.resolve()==original_file and not original_file.is_symlink(),'OVERLAY_ORIGINAL_PATH');original_raw=original_file.read_bytes();check(digest(original_raw)==ORIGINAL_MANIFEST,'OVERLAY_ORIGINAL_MANIFEST');original=json.loads(original_raw)
 archive=private/'cp022-artifact.tar';check(archive.resolve()==archive and not archive.is_symlink(),'OVERLAY_ORIGINAL_PATH');files=original_entries(archive,original)
 selector=load('cp024_release_selector',root/'tests/qa/cp019/artifact.py');model=load('cp024_overlay_model',root/'tests/qa/cp019/runtime-overlay.py')
 tracked=git(root,'ls-tree','-r','--name-only',source_sha,'--','package.json','server/saas','tests/qa').decode().splitlines()
 # Dependencies and compiled UI remain byte exact from the sealed release.
 for name in tracked:
  if selector.runtime_tracked_file(name):
   raw=git(root,'show',source_sha+':'+name)
   if name not in files or files[name]!=raw:
    check(model.allowed(name),'OVERLAY_COMMITTED_SCOPE');files[name]=raw
 selector.validate_runtime_closure(files)
 entries=[{'path':name,'bytes':len(raw),'sha256':digest(raw)} for name,raw in sorted(files.items())]
 effective={'schema':'cp019-artifact-v1','baseline':original['baseline'],'codeSha':source_sha,'sourceSha':source_sha,'entries':entries,'digest':'sha256:'+digest(canonical(entries))}
 overlay=model.make_overlay(original,effective,MATERIAL)
 check(sum(map(len,files.values()))+len(canonical(effective))<32*1024**2,'OVERLAY_RELEASE_SIZE')
 return files,effective,overlay
def main():
 root=pathlib.Path.cwd().resolve();source_sha=git(root,'rev-parse','HEAD').decode().strip();files,effective,overlay=build(root,source_sha)
 target=root/'.qa-private/cp024-v2-artifact.tar';manifest=target.with_suffix('.json');overlay_path=target.parent/'cp024-v2-runtime-overlay.json'
 check(all(not p.exists() and not p.is_symlink() for p in [target,manifest,overlay_path]),'OVERLAY_OUTPUT_KEEP_EXISTS')
 files={**files,'artifact.json':canonical(effective)}
 with tarfile.open(target,'x') as tar:
  for name,raw in sorted(files.items()):
   entry=tarfile.TarInfo(name);entry.size=len(raw);entry.mode=0o444;entry.uid=entry.gid=0;entry.mtime=0;tar.addfile(entry,io.BytesIO(raw))
 for path,value in [(manifest,effective),(overlay_path,overlay)]:
  with path.open('xb') as f:f.write(canonical(value))
 print(json.dumps({'schema':'cp024-overlay-local-release-v1','sourceSha':source_sha,'originalManifestSha256':ORIGINAL_MANIFEST,'effectiveManifestSha256':digest(canonical(effective)),'originalArtifactDigest':overlay['originalArtifactDigest'],'effectiveArtifactDigest':overlay['effectiveArtifactDigest'],'overlaySha256':digest(canonical(overlay)),'files':len(files),'changedPaths':[c['path'] for c in overlay['changes']],'archiveBytes':target.stat().st_size,'archiveSha256':digest(target.read_bytes()),'remotePublished':False,'qaAttemptConsumed':False,'secretsRead':False}))
if __name__=='__main__':main()
