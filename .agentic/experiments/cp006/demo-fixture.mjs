// Offline P0 fixture/model only. Never import into the application or a seed script.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const started = performance.now();
const asOf = '2026-10-07T18:00:00.000Z';
const base = new URL('./', import.meta.url);
const localFile = name => {
  assert(['demo-fixture.json', 'demo-results.json', 'demo-fixture.mjs'].includes(name));
  return fileURLToPath(new URL(name, base));
};
const hash = value => createHash('sha256').update(value).digest('hex');
const checks = [];
const check = (name, fn) => { fn(); checks.push({ name, status: 'PASS' }); };
const prices = [35000, 72500, 160000, 92500, 125000];
const products = Array.from({ length: 20 }, (_, i) => ({
  id: `DEMO-P${String(i + 1).padStart(2, '0')}`, sku: `DEMO-${i + 1}`,
  name: `Pieza ficticia ${i + 1}`, category: ['Filtros', 'Frenos', 'Aceites', 'Accesorios'][i % 4],
  priceMinor: prices[i % 5], closingStock: i % 7 === 0 ? 3 : 40 + i,
  lowStockThreshold: 5, source: 'preloaded'
}));
const customers = Array.from({ length: 5 }, (_, i) => ({ id: `DEMO-C${i + 1}`, name: `Cliente ficticio ${i + 1}`, source: 'preloaded' }));
const methods = ['Efectivo', 'Tarjeta', 'Transferencia'];
const sales = [];
const dayCounts = [0, 1, 2, 4, 3];
for (let day = 0; day < 30; day++) {
  for (let n = 0; n < dayCounts[day % 5]; n++) {
    const items = [0, 1].map(offset => {
      const p = products[(day + n * 3 + offset * 7) % products.length];
      const quantity = 1 + ((day + n + offset) % 2);
      return { productId: p.id, quantity, unitPriceMinor: p.priceMinor, lineTotalMinor: quantity * p.priceMinor };
    });
    sales.push({ id: `DEMO-S${String(sales.length + 1).padStart(3, '0')}`, source: 'preloaded',
      createdAt: new Date(Date.UTC(2026, 8, 8 + day, 12, n)).toISOString(),
      customerId: customers[(day + n) % 5].id, paymentMethod: methods[(day + n) % 3],
      items, totalMinor: items.reduce((s, item) => s + item.lineTotalMinor, 0) });
  }
}
for (const p of products) p.openingStock = p.closingStock + sales.flatMap(s => s.items).filter(i => i.productId === p.id).reduce((s, i) => s + i.quantity, 0);
const days = Array.from({ length: 30 }, (_, day) => new Date(Date.UTC(2026, 8, 8 + day)).toISOString().slice(0, 10));
const byDay = days.map(date => ({ date, totalMinor: sales.filter(s => s.createdAt.startsWith(date)).reduce((a, s) => a + s.totalMinor, 0), transactions: sales.filter(s => s.createdAt.startsWith(date)).length }));
const byPayment = methods.map(name => ({ name, totalMinor: sales.filter(s => s.paymentMethod === name).reduce((a, s) => a + s.totalMinor, 0), count: sales.filter(s => s.paymentMethod === name).length }));
const topProducts = products.map(p => {
  const items = sales.flatMap(s => s.items).filter(i => i.productId === p.id);
  return { productId: p.id, name: p.name, totalSold: items.reduce((a, i) => a + i.quantity, 0), totalRevenueMinor: items.reduce((a, i) => a + i.lineTotalMinor, 0) };
}).sort((a, b) => b.totalSold - a.totalSold || a.productId.localeCompare(b.productId)).slice(0, 5);
const totalMinor = sales.reduce((s, sale) => s + sale.totalMinor, 0);
const fixture = {
  fixtureVersion: 'demo-cp006-v1', synthetic: true, asOf, currency: 'DOP', amountUnit: 'minor',
  disclaimer: 'Datos ficticios; no seed de aplicación, ingreso real, cálculo fiscal ni UI verificada.',
  products, customers, sales,
  initialNewUsage: { sales: 0, quotations: 0, stockAdjustments: 0 },
  newActionCapsApproved: { sales: 10, quotations: 5, stockAdjustments: 10 },
  chartReference: { totalMinor, salesByDay: byDay, salesByPayment: byPayment, topProducts,
    lowStockProductIds: products.filter(p => p.closingStock <= p.lowStockThreshold).map(p => p.id) }
};

check('20 productos, 5 clientes y 60 ventas ficticias precargadas', () => {
  assert.equal(products.length, 20); assert.equal(customers.length, 5); assert.equal(sales.length, 60);
  assert.equal(new Set(sales.map(s => s.id)).size, 60);
});
check('referencias, importes enteros y stock reconstruible', () => {
  for (const s of sales) {
    assert(customers.some(c => c.id === s.customerId));
    assert(Number.isSafeInteger(s.totalMinor) && s.totalMinor > 0);
    assert.equal(s.totalMinor, s.items.reduce((a, i) => a + i.quantity * i.unitPriceMinor, 0));
    for (const i of s.items) assert(products.some(p => p.id === i.productId));
  }
  for (const p of products) assert(p.openingStock >= p.closingStock && p.closingStock >= 0);
});
check('gráficas con 30 días, 6 vacíos, 3 medios y top 5; mismo total', () => {
  assert.equal(byDay.length, 30); assert.equal(byDay.filter(d => !d.transactions).length, 6);
  assert.equal(topProducts.length, 5); assert.equal(byPayment.length, 3);
  assert(byPayment.every(p => p.count > 0));
  assert.equal(byDay.reduce((s, d) => s + d.totalMinor, 0), totalMinor);
  assert.equal(byPayment.reduce((s, p) => s + p.totalMinor, 0), totalMinor);
  assert.equal(fixture.chartReference.lowStockProductIds.length, 3);
});
check('precarga no consume ninguna de las tres cuotas de sesión', () => {
  assert.deepEqual(fixture.initialNewUsage, { sales: 0, quotations: 0, stockAdjustments: 0 });
  assert.deepEqual(fixture.newActionCapsApproved, { sales: 10, quotations: 5, stockAdjustments: 10 });
});

// Tiny state counterexample, not an API, DB implementation or concurrency benchmark.
const events = ['readA', 'readB', 'writeA', 'writeB'];
const permutations = list => list.length ? list.flatMap((v, i) => permutations(list.filter((_, j) => i !== j)).map(rest => [v, ...rest])) : [[]];
const schedules = permutations(events).filter(s => s.indexOf('readA') < s.indexOf('writeA') && s.indexOf('readB') < s.indexOf('writeB'));
let violatingSchedules = 0;
for (const schedule of schedules) {
  let used = 9; const allowed = {};
  for (const action of schedule) {
    const who = action.slice(-1);
    if (action.startsWith('read')) allowed[who] = used < 10;
    else if (allowed[who]) used++;
  }
  if (used > 10) violatingSchedules++;
}
check('contraejemplo: comprobar e incrementar por separado supera el cupo', () => {
  assert.equal(schedules.length, 6); assert.equal(violatingSchedules, 4);
});
check('contrato atómico abstracto: último cupo, reintento y caducidad', () => {
  for (const order of [['A', 'B'], ['B', 'A']]) {
    let used = 9; const seen = new Map();
    const attempt = (id, now) => {
      if (now >= 30) return 'expired'; // even a replay cannot access an expired demo
      if (seen.has(id)) return seen.get(id);
      if (used >= 10) return 'quota';
      used++; seen.set(id, 'committed'); return 'committed';
    };
    assert.equal(attempt(order[0], 29), 'committed');
    assert.equal(attempt(order[1], 29), 'quota');
    assert.equal(attempt(order[0], 29), 'committed');
    assert.equal(used, 10); assert.equal(attempt(order[0], 30), 'expired');
  }
});
const json = JSON.stringify(fixture, null, 2) + '\n';
check('peso acotado y plazo del ensayo', () => {
  assert(Buffer.byteLength(json) < 100_000); assert(performance.now() - started < 5000);
});
const mode = process.argv[2];
assert(['--write', '--check'].includes(mode), 'Usar --write o --check');
if (mode === '--check') assert.equal(readFileSync(localFile('demo-fixture.json'), 'utf8'), json, 'Fixture no reproducible');
const result = {
  experiment: 'DEM-EXP-01', date: '2026-10-08', runtime: process.version, platform: process.platform, arch: process.arch,
  productBase: 'fcd93a809d907e06e2ce514f71437827c993c74a',
  scriptSha256: hash(readFileSync(localFile('demo-fixture.mjs'))), fixtureSha256: hash(json),
  scope: 'Fixture y modelo abstracto offline. No prueba producto, Mongo, UI, carga ni aislamiento real.',
  checks, scenarios: { nonAtomicInterleavings: schedules.length, violatingSchedules, atomicOrders: 2 },
  summary: { products: 20, customers: 5, preloadedSales: 60, days: 30, emptyDays: 6, totalMinor, bytes: Buffer.byteLength(json) },
  elapsedMs: Number((performance.now() - started).toFixed(3)), resources: { network: false, database: false, processesLeft: 0, files: 'KEEP' }
};
if (mode === '--write') {
  writeFileSync(localFile('demo-fixture.json'), json);
  writeFileSync(localFile('demo-results.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({ status: 'PASS', mode, checks: checks.length, ...result.summary, violatingSchedules, scope: result.scope }));
