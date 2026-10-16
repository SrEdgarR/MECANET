// Own Root mount only; no arbitrary path, material file or credentials accepted.
import {canonical,sha256} from '../../../server/saas/recovery/protocol.js';
import {readContinuationAuthority,readContinuationArtifactFile,readContinuationEffectiveArtifact} from './continuation-authority.mjs';
import {makeRuntimeOverlay} from './runtime-overlay.mjs';
const ORIGINAL='1e0027ea22dd103eb51d5e0e484a831a8369c3e44eaa46cc9717468159cfb622',MATERIAL='5590432f06cc93eb7a0c8490ff2afb614eb7557bc688097c13cea9db96f885c6';
const check=(ok,label)=>{if(!ok)throw Error(label)};
export async function readRuntimeOverlayAuthority(env=process.env){
 if(env.QA_BUDGET_ATTEMPT===undefined)return null;
 const authority=await readContinuationAuthority(env),raw=await readContinuationArtifactFile('runtime-overlay.json'),originalRaw=await readContinuationArtifactFile('original-artifact.json'),overlay=JSON.parse(raw),originalArtifact=JSON.parse(originalRaw);
 check(sha256(raw)===authority.admission.runtimeHash&&raw.equals(Buffer.from(canonical(overlay)))&&sha256(originalRaw)===ORIGINAL&&originalRaw.equals(Buffer.from(canonical(originalArtifact)))&&overlay.materialHash===MATERIAL,'RUNTIME_OVERLAY_AUTHORITY');
 const effective=JSON.parse(await readContinuationEffectiveArtifact()),expected=makeRuntimeOverlay({originalArtifact,effectiveArtifact:effective,materialHash:MATERIAL});check(canonical(expected)===canonical(overlay),'RUNTIME_OVERLAY_EFFECTIVE');
 return {originalArtifact,overlay,expectedOriginalHash:ORIGINAL,expectedOverlayHash:authority.admission.runtimeHash};
}
