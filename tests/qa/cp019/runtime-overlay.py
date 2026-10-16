"""Root-side SC016 overlay model. No files, processes or material choices."""
import copy,hashlib,json,re
OLD='7f5986f01c1cce8c35ba3e9635d9001523da0bc8'
BASE='4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec'
SC016='6e1fe2d6ef789eef9637fd0ec9f6c5703998899cbc9df4f8a8c35990364bfc92'
SQL={'server/saas/db/migrations/006-control-recovery.sql':'d39d9883a700677518b02561ca348cd7883c1e3fd4cc9c2fcb56dd23d6431d64','server/saas/db/migrations/006-tenant-recovery.sql':'cefc4d33b05ab44e82c05627f919f4df8a4bbfdf7fa352f344abbe8eca1115fa'}
HASH=re.compile(r'^[0-9a-f]{64}$');SHA=re.compile(r'^[0-9a-f]{40}$')
def check(ok,label):
 if not ok:raise AssertionError(label)
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def digest(value):return hashlib.sha256(value if isinstance(value,bytes) else canonical(value)).hexdigest()
def entries(a):
 check(isinstance(a,dict) and set(a)=={'schema','baseline','codeSha','sourceSha','digest','entries'} and a['schema']=='cp019-artifact-v1' and a['baseline']==BASE and isinstance(a['sourceSha'],str) and SHA.fullmatch(a['sourceSha']) and a['codeSha']==a['sourceSha'] and isinstance(a['entries'],list) and 0<len(a['entries'])<=10000 and len(canonical(a))<=262144 and a['digest']=='sha256:'+digest(a['entries']),'RUNTIME_ARTIFACT_REQUIRED')
 out={};prior=''
 for e in a['entries']:
  check(isinstance(e,dict) and set(e)=={'path','bytes','sha256'} and isinstance(e['path'],str) and prior<e['path'] and len(e['path'])<=512 and not e['path'].startswith('/') and '\\' not in e['path'] and not any(x in ['', '.', '..','.qa-private','secrets','master','backup'] or x.startswith('.env') for x in e['path'].split('/')) and type(e['bytes']) is int and 0<=e['bytes']<=9007199254740991 and isinstance(e['sha256'],str) and HASH.fullmatch(e['sha256']),'RUNTIME_OVERLAY_ENTRY')
  out[e['path']]=e;prior=e['path']
 return out
def allowed(path):return path in SQL or re.fullmatch(r'tests/qa/cp019/[a-z][a-z0-9-]*\.(py|mjs)',path) and path not in ['tests/qa/cp019/resume.py','tests/qa/cp019/resume-state.py','tests/qa/cp019/compose-compat.py']
def make_overlay(original,effective,material_hash):
 before=entries(original);after=entries(effective);check(original['sourceSha']==OLD and effective['sourceSha']!=OLD and isinstance(material_hash,str) and HASH.fullmatch(material_hash),'RUNTIME_OVERLAY_SOURCE')
 check(set(before)<=set(after),'RUNTIME_OVERLAY_REMOVAL');changes=[];changed_bytes=0
 for path,item in after.items():
  old=before.get(path)
  if old==item:continue
  check(allowed(path),'RUNTIME_OVERLAY_SCOPE')
  if path in SQL:check(old is not None and item['sha256']==SQL[path],'RUNTIME_OVERLAY_SQL_FIX')
  changes.append({'path':path,'before':old,'after':item});changed_bytes+=item['bytes']
 check(0<len(changes)<=64 and changed_bytes<=2*1024**2,'RUNTIME_OVERLAY_SIZE')
 return copy.deepcopy({'schema':'cp024-runtime-overlay-v1','approvalHash':SC016,'project':'mecanet-qa-p1l3-r03','attempt':'v2','originalSourceSha':OLD,'effectiveSourceSha':effective['sourceSha'],'originalManifestHash':digest(original),'effectiveManifestHash':digest(effective),'originalArtifactDigest':original['digest'][7:],'effectiveArtifactDigest':effective['digest'][7:],'materialHash':material_hash,'changes':changes})
def validate_overlay(original,effective,material_hash,overlay,expected_original,expected_overlay):
 check(digest(original)==expected_original and digest(overlay)==expected_overlay,'RUNTIME_OVERLAY_ANCHOR')
 check(overlay==make_overlay(original,effective,material_hash),'RUNTIME_OVERLAY_CONTENT');return overlay
