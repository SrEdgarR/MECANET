import test from 'node:test';
import assert from 'node:assert/strict';
import { clockDiagnostic } from '../../../server/saas/admission/diagnostics.js';

test('clock diagnostics disclose only a phase, allowed cause code and closed state', () => {
  const event = clockDiagnostic('reconcile', Object.assign(new Error('secret connection URL must not be emitted'), { code: '53300', detail: 'private role/password' }), { uncertain: true, stopped: true, tick: '123', version: '456', password: 'do not serialize' });
  assert.deepEqual(event, { type: 'qa-clock-error', phase: 'reconcile', code: '53300', uncertain: true, stopped: true });
  assert(!JSON.stringify(event).includes('secret'));
  assert(!JSON.stringify(event).includes('password'));
});

test('unknown codes and phases cannot smuggle sensitive error text into a clock log', () => {
  assert.deepEqual(clockDiagnostic('advance', { code: 'mongodb://secret.invalid', message: 'secret' }, {}), { type: 'qa-clock-error', phase: 'advance', code: 'CLOCK_FAILED', uncertain: false, stopped: false });
  assert.throws(() => clockDiagnostic('postgresql://secret', {}, {}), TypeError);
});
