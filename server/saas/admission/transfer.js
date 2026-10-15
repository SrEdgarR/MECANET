import { UUID } from './policy.js';

// Trusted deploy-controller evidence, never request data. The worker has no Docker
// socket and cannot prove another container's exit itself. A missing proof blocks startup.
export function validateClockTransfer(transfer, state, generation, recoveryBinding=null) {
  if (!transfer || !state || !UUID.test(generation) || state.generation !== generation || transfer.generation !== generation || transfer.previousOwner !== state.owner || !UUID.test(state.owner) || transfer.confirmed !== true || !/^[a-zA-Z0-9:_-]{1,160}$/.test(transfer.reference ?? '')) throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
  if(recoveryBinding){
    const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
    const decimal=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n;
    if(!['NORMAL','RECOVERY'].includes(recoveryBinding.mode)||recoveryBinding.generation!==generation||transfer.mode!==recoveryBinding.mode||!UUID.test(transfer.runId??'')||transfer.runId!==recoveryBinding.runId||!hash(transfer.manifestHash)||transfer.manifestHash!==recoveryBinding.manifestHash||!UUID.test(transfer.nextOwner??'')||transfer.nextOwner===transfer.previousOwner||!UUID.test(transfer.transferId??'')||!hash(transfer.transferHash)||!hash(transfer.endProofHash)||!decimal(transfer.expectedClockVersion)||!decimal(transfer.expectedTick)||transfer.expectedClockVersion!==String(state.clock_version)||transfer.expectedTick!==String(state.tick))throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
    if(transfer.kind==='recovery-initial'){
      if(transfer.mode==='NORMAL'&&(transfer.expectedClockVersion!=='0'||transfer.expectedTick!=='0'))throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
    }else if(transfer.kind==='stopped-process'){
      if(!/^[a-f0-9]{12,64}$/.test(transfer.containerId??'')||transfer.observedState!=='exited'||!Number.isFinite(new Date(transfer.stoppedAt).getTime())||transfer.sqlOwnerAbsent!==true)throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
    }else throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
    return Object.freeze(Object.fromEntries(['kind','mode','generation','runId','manifestHash','previousOwner','nextOwner','transferId','transferHash','endProofHash','expectedClockVersion','expectedTick','reference'].map(key=>[key,transfer[key]])));
  }
  if (transfer.kind === 'first-start') {
    if (String(state.tick) !== '0' || String(state.clock_version) !== '0') throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
  } else if (transfer.kind === 'stopped-process') {
    if (!/^[a-f0-9]{12,64}$/.test(transfer.containerId ?? '') || transfer.observedState !== 'exited' || !Number.isFinite(new Date(transfer.stoppedAt).getTime())) throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
  } else throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
  return { previousOwner: transfer.previousOwner, reference: transfer.reference };
}
