import test from 'node:test';
import assert from 'node:assert/strict';
import { profile, scopesFor, calculateUsage, checkBudget, validateOverride, ClockObservation } from '../../server/saas/admission/policy.js';
import { serializable, CommitUncertainError } from '../../server/saas/admission/transaction.js';
import { performance } from 'node:perf_hooks';

const tenant = '11111111-1111-4111-8111-111111111111';
test('ordinary budget contains the essential share; it does not add capacity', () => {
  const total = profile('essential');
  const ordinary = profile('essential', 'ordinary');
  const essential = profile('essential', 'essential');
  for (const key of ['active', 'waiting', 'qh60', 'qh1', 'qc60', 'qc1', 'qt60', 'qt1']) assert.equal(ordinary[key] + essential[key], total[key], key);
  assert.equal(total.qh60, 120);
});
test('scope construction accepts only an accredited UUID and fixed lane', () => {
  assert.deepEqual(scopesFor(tenant, 'ordinary'), ['global', 'lane:ordinary', `tenant:${tenant}`, `tenant:${tenant}:ordinary`]);
  assert.throws(() => scopesFor('forged/db', 'ordinary'));
  assert.throws(() => scopesFor(tenant, 'unlimited'));
});
test('601/11 conservative windows retain the oldest boundary bucket', () => {
  const rows = [{ tick: '0', qh: '2', qc: '3', qt: '4' }, { tick: '600', qh: '5', qc: '7', qt: '9' }];
  assert.equal(calculateUsage(rows, 600n).qh60, 7);
  assert.equal(calculateUsage(rows, 601n).qh60, 5);
  assert.equal(calculateUsage([{ tick: 0, qh: 1 }], 10n).qh1, 1);
  assert.equal(calculateUsage([{ tick: 0, qh: 1 }], 11n).qh1, 0);
});
test('live byte and work reservations survive an empty consumption window', () => {
  const usage = { ...calculateUsage([], 700n), reservedQc: 50, reservedQt: 2 * 1024 * 1024, active: 0, waiting: 0 };
  assert.equal(checkBudget(profile('essential'), usage, { qh: 1, qc: 1, qt: 1, waiting: 1 }), 'qc1');
  assert.equal(checkBudget(profile('essential'), { ...usage, reservedQc: 0 }, { qh: 0, qc: 0, qt: 1 }), 'qt1');
});
test('a policy reduction never resets existing debt', () => {
  const limit = { ...profile('essential'), active: 2, qh60: 60 };
  const used = { ...calculateUsage([{ tick: 5, qh: 90 }], 5n), active: 3 };
  assert.equal(checkBudget(limit, used, { qh: 1 }), 'qh60');
  assert.equal(checkBudget(limit, { ...used, qh60: 0, qh1: 0 }, { active: 1 }), 'active');
});
test('overrides are exact allowlist and bounded, not an unlimited policy', () => {
  assert.deepEqual(validateOverride({ qh60: 24, active: 2, logicalBytes: 64 * 1024 * 1024 }, 86400), { qh60: 24, active: 2, logicalBytes: 67108864 });
  for (const value of [{ unlimited: true }, { qh60: 23 }, { active: 5 }, { logicalBytes: Infinity }, { qt60: 1 }]) assert.throws(() => validateOverride(value, 86400));
  assert.throws(() => validateOverride({ active: 2 }, 604801));
});
test('clock is not ready until observed progress and closes after one monotonic second', () => {
  let now = 0;
  const clock = new ClockObservation({ generation: 'g', now: () => now });
  assert.equal(clock.observe({ generation: 'g', tick: '1', clock_version: '1', barrier: false }), false);
  now = 101;
  assert.equal(clock.observe({ generation: 'g', tick: '2', clock_version: '2', barrier: false }), true);
  now = 1101;
  assert.equal(clock.ready(), false);
  assert.equal(clock.observe({ generation: 'other', tick: '3', clock_version: '3', barrier: false }), false);
});
test('clock regression and barrier do not refill the budget', () => {
  let now = 0;
  const clock = new ClockObservation({ generation: 'g', now: () => now });
  clock.observe({ generation: 'g', tick: 8, clock_version: 8 });
  now = 100; clock.observe({ generation: 'g', tick: 9, clock_version: 9 });
  assert.equal(clock.observe({ generation: 'g', tick: 8, clock_version: 10 }), false);
  assert.equal(clock.observe({ generation: 'g', tick: 10, clock_version: 11, barrier: true }), false);
});

test('serialization retry rolls back the entire transaction and never releases dirty client', async () => {
  let attempts = 0; const releases = []; const commands = [];
  const pool = { async connect() { return { async query(sql) { commands.push(sql); return { rows: [] }; }, release(error) { releases.push(error); } }; } };
  const result = await serializable(pool, async () => { if (++attempts < 3) throw Object.assign(new Error('conflict'), { code: '40001' }); return 42; });
  assert.equal(result, 42); assert.equal(attempts, 3); assert.equal(commands.filter(x => x === 'ROLLBACK').length, 2); assert.deepEqual(releases, [undefined, undefined, undefined]);
});
test('lost COMMIT acknowledgement is uncertain and never repeats the work', async () => {
  let work = 0; let released;
  const pool = { async connect() { return { async query(sql) { if (sql === 'COMMIT') throw new Error('connection lost'); return { rows: [] }; }, release(error) { released = error; } }; } };
  await assert.rejects(serializable(pool, async () => ++work), CommitUncertainError);
  assert.equal(work, 1); assert.ok(released);
});
test('persistent conflicts stop at three attempts', async () => {
  let attempts = 0;
  const pool = { async connect() { return { async query() { return { rows: [] }; }, release() {} }; } };
  await assert.rejects(serializable(pool, async () => { attempts++; throw Object.assign(new Error('conflict'), { code: '40P01' }); }), { code: 'ADMISSION_BUSY' });
  assert.equal(attempts, 3);
});
test('a stalled pool acquisition observes the complete control deadline and releases a late client', async () => {
  let released = false; let deliver;
  const pool = { connect() { return new Promise(resolve => { deliver = resolve; }); } };
  const pending = serializable(pool, async () => 1, { deadline: performance.now() + 25 });
  const outcome = await Promise.race([pending.then(() => 'success', e => e.code), new Promise(resolve => setTimeout(() => resolve('hung'), 80))]);
  deliver({ release() { released = true; } });
  assert.equal(outcome, 'ADMISSION_BUSY');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(released, true);
});
test('a stalled SQL control command destroys the connection at the complete deadline',async()=>{
  let discarded;
  const pool={async connect(){return{query(){return new Promise(()=>{});},release(error){discarded=error;}};}};
  const started=performance.now();
  await assert.rejects(serializable(pool,async()=>1,{deadline:started+25}),{code:'ADMISSION_BUSY'});
  assert.ok(performance.now()-started<150);assert.ok(discarded);
});
