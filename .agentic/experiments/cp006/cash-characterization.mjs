// P0 offline characterization only. Not imported by the application.
import assert from 'node:assert/strict';
import { calculateReturn } from '../../../services/returnPolicy.js';

const started = performance.now();
const bound = () => assert.ok(performance.now() - started < 5000, 'ABORT: local 5 s bound');
const cents = value => Math.round(value * 100);

function compositions(total) {
  if (total === 0) return [[]];
  const result = [];
  for (let head = 1; head <= total; head++) {
    for (const tail of compositions(total - head)) result.push([head, ...tail]);
  }
  return result;
}

let partitionCases = 0;
let returnCalls = 0;
for (let quantity = 1; quantity <= 6; quantity++) {
  const partitions = compositions(quantity);
  for (let amountCents = 0; amountCents <= 1001; amountCents++) {
    for (const partition of partitions) {
      const sale = { status: 'Completada', total: amountCents / 100,
        items: [{ product: 'synthetic-part', quantity, subtotal: amountCents / 100 }] };
      const previous = [];
      let sum = 0;
      for (const partial of partition) {
        const result = calculateReturn(sale, [{ productId: 'synthetic-part', quantity: partial }], previous);
        sum += cents(result.totalAmount);
        assert.ok(sum <= amountCents);
        assert.ok(cents(result.totalAmount) >= 0);
        previous.push(result);
        returnCalls++;
      }
      assert.equal(sum, amountCents);
      assert.throws(() => calculateReturn(sale, [{ productId: 'synthetic-part', quantity: 1 }], previous));
      partitionCases++;
    }
    bound();
  }
}

const original = { status: 'Completada', total: 10.01,
  items: [{ product: 'synthetic-part', quantity: 3, subtotal: 10.01 }] };
const firstPending = calculateReturn(original, [{ productId: 'synthetic-part', quantity: 1 }]);
const secondPending = calculateReturn(original, [{ productId: 'synthetic-part', quantity: 2 }], [firstPending]);
const secondAfterRejectingFirst = calculateReturn(original, secondPending.items, []);
assert.equal(cents(firstPending.totalAmount), 333);
assert.equal(cents(secondPending.totalAmount), 668);
assert.equal(cents(secondAfterRejectingFirst.totalAmount), 667);

const sameProductLines = { status: 'Completada', total: 300,
  items: [{ product: 'synthetic-same-part', quantity: 1, subtotal: 100 },
    { product: 'synthetic-same-part', quantity: 1, subtotal: 200 }] };
const groupedReturn = calculateReturn(sameProductLines, [{ productId: 'synthetic-same-part', quantity: 1 }]);
assert.equal(cents(groupedReturn.totalAmount), 15000);

function permutations(events) {
  if (!events.length) return [[]];
  return events.flatMap((event, i) => permutations(events.filter((_, j) => i !== j)).map(tail => [event, ...tail]));
}
const schedules = permutations(['read', 'commit', 'freeze', 'snapshot']).filter(events =>
  events.indexOf('read') < events.indexOf('commit') && events.indexOf('freeze') < events.indexOf('snapshot'));
assert.equal(schedules.length, 6);

function model(events, useCommitFence) {
  let open = true;
  let admitted = false;
  let committed = 0;
  let cutoff = 0;
  let members = null;
  for (const event of events) {
    if (event === 'read') admitted = open;
    if (event === 'commit' && admitted && (!useCommitFence || open)) committed++;
    if (event === 'freeze') { open = false; cutoff = committed; }
    if (event === 'snapshot') members = cutoff;
  }
  return { events, committed, members, exclusiveCompleteSet: committed === members };
}
const withoutFence = schedules.map(events => model(events, false));
const withFence = schedules.map(events => model(events, true));
const counterexamples = withoutFence.filter(result => !result.exclusiveCompleteSet);
assert.equal(counterexamples.length, 2);
assert.ok(withFence.every(result => result.exclusiveCompleteSet));
bound();

console.log(JSON.stringify({
  scope: 'CP-006 offline pure-function characterization and bounded abstract model; not POS/Mongo integration',
  date: '2026-10-07', node: process.version,
  inspectedProductBaseSha: 'fcd93a809d907e06e2ce514f71437827c993c74a',
  returnPolicySha256: '0ace4186888395af3abadad7270e41a4f143e81eec479bc4db7a4d0bf8b7676a',
  sequentialPartitions: { status: 'PASS', amountCents: [0, 1001], quantity: [1, 6], partitionCases, returnCalls,
    claim: 'Conservation only for the bounded valid sequential fixtures; exhausted quantity rejected' },
  rejectedPending: { status: 'PASS', claim: 'Observed old reservation differs from recomputation after an earlier rejection',
    firstPendingCents: cents(firstPending.totalAmount), secondReservedCents: cents(secondPending.totalAmount),
    secondRecomputedCents: cents(secondAfterRejectingFirst.totalAmount),
    controllerExecution: 'NOT VERIFIED; the existing mismatch guard was only inspected' },
  repeatedProductLines: { status: 'PASS', claim: 'Observed product-level grouping loses the selected line price',
    soldLineCents: [10000, 20000], returnedOneUnitCents: cents(groupedReturn.totalAmount) },
  closeModel: { status: 'PASS', schedules: schedules.length, withoutFenceCounterexamples: counterexamples,
    withFenceViolations: withFence.filter(result => !result.exclusiveCompleteSet).length,
    premise: 'freeze and fenced commit are atomic in this model; physical enforcement remains NOT VERIFIED' },
  elapsedMs: Math.round(performance.now() - started),
  resources: 'One terminating process; no DB/network/env-file/service; files KEEP, DELETE none'
}, null, 2));
