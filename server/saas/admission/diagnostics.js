// Private worker diagnostics: never serialize driver errors, SQL, credentials or data.
const codes = new Set(['COMMIT_UNCERTAIN', 'ADMISSION_BUSY', '40001', '40P01', 'CLOCK_OWNER_CONFLICT', 'CLOCK_TRANSFER_PROOF_REQUIRED', 'CLOCK_INCONSISTENT', '53300', '57014', '57P01', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'CONNECTION_LOST']);

export function clockDiagnostic(phase, error, state = {}) {
  if (!['advance', 'reconcile'].includes(phase)) throw new TypeError('Clock diagnostic phase required');
  const code = codes.has(error?.code) ? error.code : 'CLOCK_FAILED';
  return { type: 'qa-clock-error', phase, code, uncertain: state.uncertain === true, stopped: state.stopped === true };
}
