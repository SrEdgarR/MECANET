'use strict';
// Modelo puro de P0: no API, DB, archivos leídos ni código del producto.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const started = performance.now();
let assertions = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const ratio = (n, d = 1n) => ({ n: BigInt(n), d: BigInt(d) });
const plus = (a, b) => ratio(a.n * b.d + b.n * a.d, a.d * b.d);
const minus = (a, b) => plus(a, ratio(-b.n, b.d));
const times = (a, b) => ratio(a.n * b.n, a.d * b.d);
const sum = (values) => values.reduce(plus, ratio(0));
const round = ({ n, d }) => {
  assert(d > 0n);
  const sign = n < 0n ? -1n : 1n;
  return sign * ((2n * (n < 0n ? -n : n) + d) / (2n * d));
};
const money = (value) => {
  const cents = typeof value === 'bigint' ? value : round(value);
  const magnitude = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
};
const plans = [
  { id: 'Esencial', monthly: 79900n, users: 4, products: 300 },
  { id: 'Negocio', monthly: 149000n, users: 10, products: 4000 },
  { id: 'Máxima', monthly: 249000n, users: 25, products: 10000 },
].map(p => ({ ...p, annual: round(ratio(p.monthly * 12n * 85n, 100n)) }));
eq(plans.map(p => p.annual), [814980n, 1519800n, 2539800n]);
eq(round(ratio(5n, 2n)), 3n);
eq(round(ratio(-5n, 2n)), -3n);
eq(plans.map(p => p.annual / 12n), [67915n, 126650n, 211650n]);
const catalog = plans.map(p => ({
  plan: p.id, monthlyDop: money(p.monthly), annualDop: money(p.annual),
  twelveMonthlyDop: money(p.monthly * 12n), savingsDop: money(p.monthly * 12n - p.annual),
  monthlyServiceEquivalentDop: money(ratio(p.annual, 12n)), users: p.users, products: p.products,
}));
const mix = (name, monthlyCounts, annualCounts) => {
  const monthly = sum(plans.map((p, i) => ratio(p.monthly * BigInt(monthlyCounts[i]))));
  const annualCash = sum(plans.map((p, i) => ratio(p.annual * BigInt(annualCounts[i]))));
  const annualEarned = times(annualCash, ratio(1n, 12n));
  const revenue = plus(monthly, annualEarned);
  const count = monthlyCounts.concat(annualCounts).reduce((a, b) => a + b, 0);
  const transactions = plus(ratio(monthlyCounts.reduce((a, b) => a + b, 0)), ratio(annualCounts.reduce((a, b) => a + b, 0), 12n));
  return { name, monthlyCounts, annualCounts, count, revenue, transactions,
    firstCash: plus(monthly, annualCash), unearnedAfterFirst: minus(annualCash, annualEarned) };
};
const scenarios = [
  mix('1 Esencial mensual', [1, 0, 0], [0, 0, 0]),
  mix('1 Esencial anual', [0, 0, 0], [1, 0, 0]),
  mix('3 mixtos mensuales: 1/1/1', [1, 1, 1], [0, 0, 0]),
  mix('3 mixtos anuales: 1/1/1', [0, 0, 0], [1, 1, 1]),
  mix('20 mixtos mensuales: 10/8/2', [10, 8, 2], [0, 0, 0]),
  mix('20 mixtos anuales: 10/8/2', [0, 0, 0], [10, 8, 2]),
  mix('20 mixtos híbridos: 5/4/1 mensual + 5/4/1 anual', [5, 4, 1], [5, 4, 1]),
];
eq(scenarios.map(s => money(s.revenue)), ['799.00', '679.15', '4779.00', '4062.15', '24890.00', '21156.50', '23023.25']);
eq(money(scenarios[5].firstCash), '253878.00');
eq(money(scenarios[5].unearnedAfterFirst), '232721.50');
eq(money(scenarios[6].firstCash), '139384.00');
eq(money(scenarios[6].unearnedAfterFirst), '116360.75');
// Todos los costes siguientes son entradas ficticias de sensibilidad, no tarifas.
const sensitivity = {
  label: 'HIPÓTESIS; NO TARIFAS REALES NI PRESUPUESTO APROBADO',
  fixedCents: { dedicatedBase: 100000n, sharedAllocated: 50000n, backupRecovery: 40000n,
    metricsBase: 10000n, mailBase: 0n, domainOperations: 100000n },
  variablePerTenantCents: { storage: 2000n, backups: 2000n, mail: 500n, metrics: 500n, operations: 5000n },
  gatewayBasisPoints: [200, 400, 600], gatewayFixedCents: 1000n,
  reserveCents: 100000n, extraHeavyTenantCents: 150000n,
};
const fixed = sum(Object.values(sensitivity.fixedCents).map(v => ratio(v)));
const perTenant = sum(Object.values(sensitivity.variablePerTenantCents).map(v => ratio(v)));
eq(money(fixed), '3000.00');
eq(money(perTenant), '100.00');
const costRow = (scenario, bps, heavy = false) => {
  const gateway = plus(times(scenario.revenue, ratio(bps, 10000n)), times(scenario.transactions, ratio(sensitivity.gatewayFixedCents)));
  const variable = times(perTenant, ratio(scenario.count));
  const extra = ratio(heavy ? sensitivity.extraHeavyTenantCents : 0n);
  const contribution = minus(scenario.revenue, sum([fixed, variable, gateway, extra]));
  const afterReserve = minus(contribution, ratio(sensitivity.reserveCents));
  return { scenario: scenario.name, gatewayHypothesisPercent: bps / 100, heavyTenant: heavy,
    revenueDop: money(scenario.revenue), gatewayDop: money(gateway), fixedDop: money(fixed),
    variableDop: money(variable), heavyExtraDop: money(extra), contributionBeforeTaxDop: money(contribution),
    reserveDop: money(sensitivity.reserveCents), headroomAfterReserveDop: money(afterReserve) };
};
const sensitivities = scenarios.flatMap(s => sensitivity.gatewayBasisPoints.map(bps => costRow(s, bps)));
const heavy = [costRow(scenarios[0], 400, true), costRow(scenarios[4], 400, true), costRow(scenarios[5], 400, true)];
eq(costRow(scenarios[4], 400).headroomAfterReserveDop, '17694.40');
eq(costRow(scenarios[5], 400).headroomAfterReserveDop, '14293.57');
eq(heavy[1].headroomAfterReserveDop, '16194.40');
// Anclar siempre al origen. UTC es el eje de cálculo; la propuesta de UI usa -04:00.
const anchorDate = (origin, months) => {
  const d = new Date(origin);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d.getUTCDate(), last),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())).toISOString();
};
const calendar = [
  { start: '2027-01-31T04:00:00.000Z', months: [1, 2], expected: ['2027-02-28T04:00:00.000Z', '2027-03-31T04:00:00.000Z'] },
  { start: '2028-01-31T04:00:00.000Z', months: [1, 2], expected: ['2028-02-29T04:00:00.000Z', '2028-03-31T04:00:00.000Z'] },
  { start: '2028-02-29T04:00:00.000Z', months: [12, 48], expected: ['2029-02-28T04:00:00.000Z', '2032-02-29T04:00:00.000Z'] },
].map(c => { const actual = c.months.map(n => anchorDate(c.start, n)); eq(actual, c.expected); return { ...c, actual }; });
const start = new Date('2028-02-29T04:00:00.000Z');
const end = new Date(anchorDate(start.toISOString(), 12));
const asOf = new Date('2028-03-31T04:00:00.000Z');
const earned = ratio(plans[0].annual * BigInt(asOf - start), BigInt(end - start));
eq(end - start, 365 * 86400000);
eq(asOf - start, 31 * 86400000);
eq(money(earned), '692.17');
eq(round(plus(earned, minus(ratio(plans[0].annual), earned))), plans[0].annual);
const durationMs = performance.now() - started;
assert(durationMs < 2000); assertions++;
assert(process.memoryUsage().rss < 128 * 1024 * 1024); assertions++;
const result = {
  experiment: 'CP-006 economía/calendario; evidencia LOCAL sintética, no integración',
  date: '2026-10-07', baseSha: 'fcd93a809d907e06e2ce514f71437827c993c74a',
  realTariffs: { gateway: null, oracle: null, mail: null, metrics: null, backup: null, storage: null, operations: null, taxes: null },
  realProfitability: 'NOT VERIFIED', catalog,
  scenarios: scenarios.map(s => ({ name: s.name, monthlyCounts: s.monthlyCounts, annualCounts: s.annualCounts,
    clients: s.count, serviceMonthEquivalentDop: money(s.revenue), firstCollectionDop: money(s.firstCash),
    unearnedAfterFirstServiceMonthDop: money(s.unearnedAfterFirst) })),
  sensitivityInputs: sensitivity, sensitivities, heavyTenantSensitivities: heavy, calendar,
  earnedCalendarExample: { plan: 'Esencial anual', start: start.toISOString(), end: end.toISOString(), asOf: asOf.toISOString(),
    elapsedDays: 31, serviceDays: 365, earnedDop: money(earned), remainingDop: money(minus(ratio(plans[0].annual), earned)),
    rule: 'prorrata temporal experimental; política contable no aprobada; /12 es equivalente para comparar, no devengo calendario' },
  evidence: { status: 'PASS', assertions, node: process.version, platform: process.platform, arch: process.arch,
    durationMs: Number(durationMs.toFixed(3)), rssBytes: process.memoryUsage().rss },
};
console.log(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
