// SC016 private QA compatibility evidence. Original custody never changes.
// This pure model grants no publication, runtime START or Environment Gate.
import {canonical,sha256} from '../../../server/saas/recovery/protocol.js';
const OLD='7f5986f01c1cce8c35ba3e9635d9001523da0bc8',BASE='4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec',SC016='6e1fe2d6ef789eef9637fd0ec9f6c5703998899cbc9df4f8a8c35990364bfc92',H=/^[0-9a-f]{64}$/,S=/^[0-9a-f]{40}$/;
const SQL=Object.freeze({'server/saas/db/migrations/006-control-recovery.sql':'d39d9883a700677518b02561ca348cd7883c1e3fd4cc9c2fcb56dd23d6431d64','server/saas/db/migrations/006-tenant-recovery.sql':'cefc4d33b05ab44e82c05627f919f4df8a4bbfdf7fa352f344abbe8eca1115fa'});
const check=(ok,label)=>{if(!ok)throw Error(label)},same=(a,b)=>canonical(a)===canonical(b),exact=(x,ks)=>x&&typeof x==='object'&&!Array.isArray(x)&&same(Object.keys(x).sort(),[...ks].sort());
function entries(a){
 check(exact(a,['schema','baseline','codeSha','sourceSha','digest','entries'])&&a.schema==='cp019-artifact-v1'&&a.baseline===BASE&&S.test(a.sourceSha??'')&&a.codeSha===a.sourceSha&&Array.isArray(a.entries)&&a.entries.length>0&&a.entries.length<=10000&&Buffer.byteLength(canonical(a))<=262144&&a.digest==='sha256:'+sha256(a.entries),'RUNTIME_ARTIFACT_REQUIRED');
 const result=new Map();let previous='';
 for(const e of a.entries){check(exact(e,['path','bytes','sha256'])&&typeof e.path==='string'&&e.path>previous&&e.path.length<=512&&!e.path.startsWith('/')&&!e.path.includes('\\')&&!e.path.split('/').some(x=>!x||x==='.'||x==='..'||x==='.qa-private'||x==='secrets'||x==='master'||x==='backup'||x.startsWith('.env'))&&Number.isSafeInteger(e.bytes)&&e.bytes>=0&&H.test(e.sha256??''),'RUNTIME_OVERLAY_ENTRY');result.set(e.path,e);previous=e.path}return result;
}
function allowed(path){return Object.hasOwn(SQL,path)||/^tests\/qa\/cp019\/[a-z][a-z0-9-]*\.(?:py|mjs)$/.test(path)&&!['tests/qa/cp019/resume.py','tests/qa/cp019/resume-state.py','tests/qa/cp019/compose-compat.py'].includes(path)}
export function makeRuntimeOverlay({originalArtifact,effectiveArtifact,materialHash}={}){
 const original=entries(originalArtifact),effective=entries(effectiveArtifact);check(originalArtifact.sourceSha===OLD&&effectiveArtifact.sourceSha!==OLD&&H.test(materialHash??''),'RUNTIME_OVERLAY_SOURCE');
 check([...original.keys()].every(path=>effective.has(path)),'RUNTIME_OVERLAY_REMOVAL');const changes=[];let changedBytes=0;
 for(const[path,after]of effective){const before=original.get(path)??null;if(before&&same(before,after))continue;check(allowed(path),'RUNTIME_OVERLAY_SCOPE');if(Object.hasOwn(SQL,path))check(before!==null&&after.sha256===SQL[path],'RUNTIME_OVERLAY_SQL_FIX');changes.push({path,before,after});changedBytes+=after.bytes}
 check(changes.length>0&&changes.length<=64&&changedBytes<=2*1024**2,'RUNTIME_OVERLAY_SIZE');
 return JSON.parse(canonical({schema:'cp024-runtime-overlay-v1',approvalHash:SC016,project:'mecanet-qa-p1l3-r03',attempt:'v2',originalSourceSha:OLD,effectiveSourceSha:effectiveArtifact.sourceSha,originalManifestHash:sha256(originalArtifact),effectiveManifestHash:sha256(effectiveArtifact),originalArtifactDigest:originalArtifact.digest.slice(7),effectiveArtifactDigest:effectiveArtifact.digest.slice(7),materialHash,changes}));
}
export function validateRuntimeArtifact({artifact,material,context=null}={}){
 entries(artifact);
 if(context===null){check(material?.artifactDigest===artifact.digest.slice(7),'SOURCE_BUILDER_ARTIFACT');return artifact.sourceSha}
 check(exact(context,['originalArtifact','overlay','expectedOriginalHash','expectedOverlayHash'])&&H.test(context.expectedOriginalHash??'')&&H.test(context.expectedOverlayHash??'')&&sha256(context.originalArtifact)===context.expectedOriginalHash&&sha256(context.overlay)===context.expectedOverlayHash,'RUNTIME_OVERLAY_ANCHOR');
 const x=context.overlay;check(x?.materialHash===sha256(material)&&x.originalArtifactDigest===material?.artifactDigest,'RUNTIME_OVERLAY_MATERIAL');
 check(x.effectiveManifestHash===sha256(artifact)&&x.effectiveArtifactDigest===artifact.digest.slice(7)&&x.effectiveSourceSha===artifact.sourceSha,'RUNTIME_OVERLAY_EFFECTIVE');
 const expected=makeRuntimeOverlay({originalArtifact:context.originalArtifact,effectiveArtifact:artifact,materialHash:sha256(material)});check(same(x,expected),'RUNTIME_OVERLAY_CONTENT');return artifact.sourceSha;
}
