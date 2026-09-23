import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReturn, exchangePrice } from '../services/returnPolicy.js';
import { redactSecrets } from '../services/redactSecrets.js';
import { searchLiteral } from '../services/searchLiteral.js';
import { privatePath, assertPublicBytes } from './publicationSafety.js';

const sale = { status: 'Completada', total: 60,
  items: [{ product: 'product-1', quantity: 2, priceAtSale: 100, subtotal: 120 }] };

test('refund includes item and invoice discounts and never exceeds payment', () => {
  const first = calculateReturn(sale, [{ productId: 'product-1', quantity: 1 }]);
  const second = calculateReturn(sale, [{ productId: 'product-1', quantity: 1 }], [first]);
  assert.equal(first.totalAmount, 30);
  assert.equal(first.totalAmount + second.totalAmount, sale.total);
  assert.throws(() => calculateReturn(sale, [{ productId: 'product-1', quantity: 1 }], [first, second]));
});

test('rejects duplicate, negative, fractional and excessive return quantities', () => {
  for (const quantity of [-1, 0, 1.5, Infinity, 3]) {
    assert.throws(() => calculateReturn(sale, [{ productId: 'product-1', quantity }]));
  }
  assert.throws(() => calculateReturn(sale, [{ productId: 'product-1', quantity: 1 }, { productId: 'product-1', quantity: 1 }]));
  assert.throws(() => calculateReturn({ ...sale, status: 'Cancelada' }, [{ productId: 'product-1', quantity: 1 }]));
});

test('groups repeated original sale lines and allocates the last cent', () => {
  const original = { status: 'Completada', total: 10.01,
    items: [{ product: 'p', quantity: 1, subtotal: 5 }, { product: 'p', quantity: 2, subtotal: 10 }] };
  const first = calculateReturn(original, [{ productId: 'p', quantity: 1 }]);
  const second = calculateReturn(original, [{ productId: 'p', quantity: 2 }], [first]);
  assert.equal(first.totalAmount, 3.33);
  assert.equal(second.totalAmount, 6.68);
});

test('exchange price comes from catalog and requires positive integer quantity', () => {
  const product = { sellingPrice: 100, discountPercentage: 20, stock: 2 };
  assert.equal(exchangePrice(product, 1), 80);
  assert.throws(() => exchangePrice(product, -1));
  assert.throws(() => exchangePrice(product, 3));
});

test('redacts nested credentials and audit change values', () => {
  const clean = redactSecrets({ smtp: { password: 'dummy-value' }, weatherApiKey: 'dummy-key',
    changes: [{ field: 'smtp.password', oldValue: 'before', newValue: 'after' }], count: 3 });
  assert.equal(clean.smtp.password, '[REDACTED]');
  assert.equal(clean.weatherApiKey, '[REDACTED]');
  assert.equal(clean.changes[0].newValue, '[REDACTED]');
  assert.equal(clean.count, 3);
});

test('publication refuses private paths and exact locally configured secrets', () => {
  for (const name of ['.env', 'scripts/.env.railway', '.git/config', 'backup.dump', 'logs/output.log']) assert.equal(privatePath(name), true);
  assert.equal(privatePath('.env.example'), false);
  assert.throws(() => assertPublicBytes('server.js', Buffer.from('dummy-sensitive-value'), [Buffer.from('dummy-sensitive-value')]));
});

test('search treats operators as text', () => {
  assert.equal(searchLiteral('(a+)+$'), '\\(a\\+\\)\\+\\$');
  assert.equal(searchLiteral('x'.repeat(200)).length, 128);
});
