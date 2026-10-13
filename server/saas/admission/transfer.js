import { UUID } from './policy.js';

// Trusted deploy-controller evidence, never request data. The worker has no Docker
// socket and cannot prove another container's exit itself. A missing proof blocks startup.
export function validateClockTransfer(transfer, state, generation) {
  if (!transfer || !state || !UUID.test(generation) || state.generation !== generation || transfer.generation !== generation || transfer.previousOwner !== state.owner || !UUID.test(state.owner) || transfer.confirmed !== true || !/^[a-zA-Z0-9:_-]{1,160}$/.test(transfer.reference ?? '')) throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
  if (transfer.kind === 'first-start') {
    if (String(state.tick) !== '0' || String(state.clock_version) !== '0') throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
  } else if (transfer.kind === 'stopped-process') {
    if (!/^[a-f0-9]{12,64}$/.test(transfer.containerId ?? '') || transfer.observedState !== 'exited' || !Number.isFinite(new Date(transfer.stoppedAt).getTime())) throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
  } else throw new Error('CLOCK_TRANSFER_PROOF_REQUIRED');
  return { previousOwner: transfer.previousOwner, reference: transfer.reference };
}
