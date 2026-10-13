import { describe, expect, it, vi } from 'vitest';
import { createSaasClient } from './client.js';
import { HINTS_KEY } from './operation-hints.js';

const A = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Empresa A', dataEpoch: '1', permissions: ['catalog.read', 'inventory.read', 'catalog.create', 'inventory.receive'] };
const B = { ...A, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Empresa B', dataEpoch: '2' };
const productId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const movementId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const operationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const session = { authenticated: true, csrfToken: 'private-csrf', user: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', email: 'a@example.test' }, purpose: 'company', contextVersion: 'v1' };
const context = { identityId: session.user.id, purpose: session.purpose, contextVersion: session.contextVersion };
const response = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => body });
const result = (tenant = A, extra = {}) => ({ operationId, state: 'CONFIRMED', productId, movementId: null, onHand: '0', balanceVersion: '1', dataEpoch: tenant.dataEpoch, ...extra });
const page = tenant => ({ context, tenantId: tenant.id, dataEpoch: tenant.dataEpoch, items: [{ id: productId, sku: 'SKU-01', name: 'Producto sintético', onHand: '0', version: '1' }], nextCursor: null });
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }; };
function harness(handler = () => response(result()), options = {}) {
  const memory = options.storage ?? storage();
  const fetch = vi.fn(async (url, request) => {
    if (url === '/api/auth/session') return response(session);
    if (url === '/api/tenants') return response({ context, tenants: options.tenants ?? [A, B] });
    if (url === '/api/auth/activity') return response({ ok: true });
    if (url.endsWith('/inventory?limit=20')) return response(page(url.includes(B.id) ? B : A));
    if (url.includes('/operations?')) return options.pending ? options.pending(url) : response({ context, tenantId: url.includes(B.id) ? B.id : A.id, dataEpoch: url.includes(B.id) ? '2' : '1', items: [], nextCursor: null });
    return handler(url, request);
  });
  return { client: createSaasClient(fetch, { storage: memory, operationUuid: () => operationId }), fetch, memory };
}
const open = async client => { await client.start(); await client.selectInventory(A.id, false); };

describe('private inventory intent recovery', () => {
  it('persists only the known IDs before one POST and submits exact headers/DTO', async () => {
    let persisted;
    const { client, fetch, memory } = harness((_url, request) => { persisted = JSON.parse(memory.getItem(HINTS_KEY)); return response(result(), 201); });
    await open(client); await client.createProduct({ sku: ' abc-1 ', name: 'Café' });
    const posts = fetch.mock.calls.filter(([, request]) => request.method === 'POST' && request.headers['Idempotency-Key']);
    expect(posts).toHaveLength(1); expect(persisted).toEqual([{ tenantId: A.id, operationId }]);
    expect(posts[0][1].headers).toMatchObject({ 'Idempotency-Key': operationId, 'X-Data-Epoch': '1', 'X-CSRF-Token': 'private-csrf' });
    expect(JSON.parse(posts[0][1].body)).toEqual({ sku: 'ABC-1', name: 'Café' });
    expect(client.getSnapshot().operation).toMatchObject({ operationId, state: 'CONFIRMED' });
    expect(memory.getItem(HINTS_KEY)).toBeNull();
  });

  it('will not POST when the recovery hint cannot be stored', async () => {
    const { client, fetch } = harness(undefined, { storage: { getItem() { throw new Error('denied'); }, setItem() {}, removeItem() {} } });
    await open(client); await client.createProduct({ sku: 'ABC', name: 'Nombre' });
    expect(fetch.mock.calls.filter(([, request]) => request.headers['Idempotency-Key'])).toHaveLength(0);
    expect(client.getSnapshot().operationMessage).toMatch(/conservar.*referencia/i);
  });

  it('lost ACK keeps stock unchanged and permits only explicit replay with the original guard', async () => {
    let calls = 0;
    const { client, fetch, memory } = harness((_url, request) => {
      if (request.method === 'POST' && ++calls === 1) throw new TypeError('INTERNAL_SECRET');
      return response(result(A, { movementId, onHand: '2', balanceVersion: '2' }), 201);
    });
    await open(client); await client.receiveStock(productId, { quantity: '2', reason: 'Recepción ficticia' });
    expect(client.getSnapshot().operation).toMatchObject({ operationId, state: 'UNKNOWN', canReplay: true });
    expect(client.getSnapshot().items[0].onHand).toBe('0');
    expect(JSON.stringify(client.getSnapshot())).not.toMatch(/INTERNAL_SECRET|Recepción ficticia/);
    expect(JSON.parse(memory.getItem(HINTS_KEY))).toEqual([{ tenantId: A.id, operationId }]);
    expect(calls).toBe(1); await client.resendOperation(operationId); expect(calls).toBe(2);
    const posts = fetch.mock.calls.filter(([, request]) => request.headers['Idempotency-Key']);
    expect(posts[0][1].body).toBe(posts[1][1].body); expect(posts[1][1].headers['Idempotency-Key']).toBe(operationId);
  });

  it('reload recovers hints and own pending list, but has no payload to replay', async () => {
    const memory = storage(); memory.setItem(HINTS_KEY, JSON.stringify([{ tenantId: A.id, operationId }]));
    const { client, fetch } = harness(url => response({ context, tenantId: A.id, dataEpoch: '1', operationId, state: 'UNKNOWN', result: null }), { storage: memory });
    await open(client);
    expect(fetch.mock.calls.some(([url]) => url.endsWith(`/operations/${operationId}`))).toBe(true);
    expect(client.getSnapshot().operations).toContainEqual(expect.objectContaining({ operationId, state: 'UNKNOWN', canReplay: false }));
    await client.resendOperation(operationId);
    expect(fetch.mock.calls.filter(([, request]) => request.headers['Idempotency-Key'])).toHaveLength(0);
  });

  it('404 is still uncertain and never creates a replacement operation', async () => {
    const memory = storage(); memory.setItem(HINTS_KEY, JSON.stringify([{ tenantId: A.id, operationId }]));
    const { client, fetch } = harness(() => response({}, 404), { storage: memory });
    await open(client); await client.lookupOperation(operationId);
    expect(client.getSnapshot().operation).toMatchObject({ operationId, state: 'UNKNOWN', canReplay: false });
    expect(client.getSnapshot().operationMessage).toMatch(/no confirma.*reversión/i);
    expect(fetch.mock.calls.filter(([, request]) => request.headers['Idempotency-Key'])).toHaveLength(0);
    expect(memory.getItem(HINTS_KEY)).not.toBeNull();
  });

  it('a write-only member cannot read stock or movements and gets only the granted form', async () => {
    const { client, fetch } = harness(undefined, { tenants: [{ ...A, permissions: ['catalog.create'] }] });
    await open(client); await client.readMovements(productId);
    expect(client.getSnapshot().tenant.permissions).toEqual(['catalog.create']);
    expect(fetch.mock.calls.some(([url]) => url.includes('/inventory?') || url.includes('/stock-movements'))).toBe(false);
    await client.receiveStock(productId, { quantity: '1', reason: 'Motivo' });
    expect(fetch.mock.calls.some(([url]) => url.includes('/stock-receipts'))).toBe(false);
  });

  it('rejects unsafe Unicode, fractional/leading-zero quantity and unknown body fields before POST', async () => {
    const { client, fetch } = harness(); await open(client);
    for (const body of [{ sku: 'ABC', name: '\u0000' }, { sku: 'ABC', name: '\ud800' }, { sku: 'ABC', name: 'Nombre', tenantId: B.id }]) await client.createProduct(body);
    for (const quantity of ['0', '01', '1.5', '-1', '1000001']) await client.receiveStock(productId, { quantity, reason: 'Motivo' });
    expect(fetch.mock.calls.filter(([, request]) => request.headers['Idempotency-Key'])).toHaveLength(0);
  });

  it('switching company discards a late write reply while preserving the A hint for recovery', async () => {
    let resolve;
    const { client, fetch, memory } = harness(() => new Promise(done => { resolve = done; }));
    await open(client); const pending = client.createProduct({ sku: 'ABC', name: 'Solo A' });
    await vi.waitFor(() => expect(fetch.mock.calls.some(([, request]) => request.headers['Idempotency-Key'])).toBe(true));
    await client.selectInventory(B.id, false); resolve(response(result(), 201)); await pending;
    expect(client.getSnapshot().tenant.id).toBe(B.id); expect(client.getSnapshot().operation).toBeNull();
    expect(memory.getItem(HINTS_KEY)).toContain(A.id);
  });

  it('logout clears hints before uncertain revocation and hides all business content', async () => {
    const memory = storage(); memory.setItem(HINTS_KEY, JSON.stringify([{ tenantId: A.id, operationId }]));
    const { client } = harness((_url, request) => request.method === 'POST' ? response({}, 503) : response({ context, tenantId: A.id, dataEpoch: '1', operationId, state: 'UNKNOWN', result: null }), { storage: memory });
    await open(client); await client.logout();
    expect(memory.getItem(HINTS_KEY)).toBeNull(); expect(client.getSnapshot()).toMatchObject({ phase: 'logout-uncertain', items: [], operations: [] });
  });

  it('result lookup with a changed identity hides content and clears tab hints', async () => {
    const memory = storage();
    const { client } = harness(() => response({ context: { ...context, identityId: B.id }, tenantId: A.id, dataEpoch: '1', operationId, state: 'UNKNOWN' }), { storage: memory });
    await open(client); memory.setItem(HINTS_KEY, JSON.stringify([{ tenantId: A.id, operationId }]));
    await client.lookupOperation(operationId);
    expect(client.getSnapshot()).toMatchObject({ phase: 'unavailable', items: [], operations: [] });
    expect(memory.getItem(HINTS_KEY)).toBeNull();
  });

  it('a confirmed-looking reply from another data epoch cannot remain in the business view', async () => {
    const { client, memory } = harness(() => response(result(A, { dataEpoch: '2', onHand: '500' }), 201));
    await open(client); await client.createProduct({ sku: 'ABC', name: 'Nombre' });
    expect(client.getSnapshot()).toMatchObject({ phase: 'unavailable', items: [], operation: null });
    expect(memory.getItem(HINTS_KEY)).toContain(operationId);
  });

  it('an unanswered result lookup is finite and never resends the writer', async () => {
    vi.useFakeTimers();
    try {
      const { client, fetch } = harness(() => new Promise(() => {})); await open(client);
      const checking = client.lookupOperation(operationId); await vi.advanceTimersByTimeAsync(8000); await checking;
      expect(client.getSnapshot().operation).toMatchObject({ operationId, state: 'UNKNOWN' });
      expect(fetch.mock.calls.filter(([, request]) => request.headers['Idempotency-Key'])).toHaveLength(0);
      client.dispose();
    } finally { vi.useRealTimers(); }
  });

  it('401 on a write clears hints, credentials and protected rows immediately', async () => {
    const { client, memory } = harness(() => response({}, 401)); await open(client);
    await client.receiveStock(productId, { quantity: '1', reason: 'Prueba' });
    expect(client.getSnapshot()).toMatchObject({ phase: 'expired', items: [], operations: [], operation: null, user: null });
    expect(memory.getItem(HINTS_KEY)).toBeNull();
  });

  it('recovers and paginates own server pending intents without a local payload', async () => {
    const secondId = '99999999-9999-4999-8999-999999999999';
    const { client, fetch } = harness(url => response({ context, tenantId: A.id, dataEpoch: '1', operationId: url.endsWith(secondId) ? secondId : operationId, state: 'UNKNOWN' }), {
      pending: url => response({ context, tenantId: A.id, dataEpoch: '1', items: [{ operationId: url.includes('cursor=') ? secondId : operationId, action: 'catalog.create', state: 'PENDING', createdAt: '2026-10-13T12:00:00.000Z' }], nextCursor: url.includes('cursor=') ? null : operationId }),
    });
    await open(client); expect(client.getSnapshot().operations).toContainEqual(expect.objectContaining({ operationId, canReplay: false }));
    await client.nextOperationsPage(); expect(client.getSnapshot().operations).toContainEqual(expect.objectContaining({ operationId: secondId, canReplay: false }));
    expect(client.getSnapshot().operationsCursor).toBeNull();
    expect(fetch.mock.calls.filter(([url]) => url.includes('/operations?') && url.includes(`cursor=${operationId}`))).toHaveLength(1);
    expect(fetch.mock.calls.filter(([, request]) => request.headers['Idempotency-Key'])).toHaveLength(0);
  });

  it('a hanging writer times out into UNKNOWN, retains its ID, and ignores a late ACK', async () => {
    vi.useFakeTimers();
    try {
      let resolve;
      const { client, fetch, memory } = harness(() => new Promise(done => { resolve = done; })); await open(client);
      const writing = client.receiveStock(productId, { quantity: '2', reason: 'Prueba' });
      await vi.advanceTimersByTimeAsync(8000); await writing;
      expect(client.getSnapshot().operation).toMatchObject({ operationId, state: 'UNKNOWN' });
      expect(client.getSnapshot().items[0].onHand).toBe('0'); expect(memory.getItem(HINTS_KEY)).toContain(operationId);
      resolve(response(result(A, { movementId, onHand: '2', balanceVersion: '2' }), 201)); await vi.advanceTimersByTimeAsync(0);
      expect(client.getSnapshot().operation.state).toBe('UNKNOWN');
      expect(fetch.mock.calls.filter(([, request]) => request.headers['Idempotency-Key'])).toHaveLength(1); client.dispose();
    } finally { vi.useRealTimers(); }
  });
});
