import { describe, expect, it, vi } from 'vitest';
import { createSaasClient } from './client.js';

const A = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Empresa A', dataEpoch: '1' };
const B = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Empresa B', dataEpoch: '2' };
const session = { authenticated: true, csrfToken: 'private-csrf', user: { id: 'identity-a', email: 'a@example.test' }, purpose: 'company', contextVersion: 'v1' };
const context = { identityId: session.user.id, purpose: session.purpose, contextVersion: session.contextVersion };
const response = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => body });
const catalog = (tenant, name = 'Producto A') => ({ context, tenantId: tenant.id, dataEpoch: tenant.dataEpoch, items: [{ id: 'same-product', sku: 'SKU-01', name }], nextCursor: null });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function harness(handler) {
  const fetch = vi.fn(async (url, options) => {
    if (url === '/api/auth/session') return response(session);
    if (url === '/api/tenants') return response({ context, tenants: [A, B] });
    if (url === '/api/auth/activity') return response({ ok: true });
    return handler(url, options);
  });
  return { client: createSaasClient(fetch), fetch };
}

describe('private SaaS client authority boundaries', () => {
  it('sends CSRF and same-origin credentials without persisting credentials', async () => {
    const fetch = vi.fn(async (url) => {
      if (url === '/api/auth/session') return response({ authenticated: false, csrfToken: 'pre-login' });
      if (url === '/api/auth/login') return response(session);
      if (url === '/api/tenants') return response({ context, tenants: [A] });
      throw new Error('unexpected URL');
    });
    const client = createSaasClient(fetch);
    await client.start();
    await client.login('a@example.test', 'temporary-password');
    const call = fetch.mock.calls.find(([url]) => url === '/api/auth/login')[1];
    expect(call.headers['X-CSRF-Token']).toBe('pre-login');
    expect(call.credentials).toBe('same-origin');
    expect(call.cache).toBe('no-store');
    expect(client.getSnapshot().phase).toBe('tenants');
    expect(JSON.stringify(client.getSnapshot())).not.toContain('temporary-password');
    expect(JSON.stringify(client.getSnapshot())).not.toContain('private-csrf');
  });

  it('discards A arriving after B, even when fetch ignores abort', async () => {
    const delayedA = deferred();
    const { client, fetch } = harness(url => url.includes(A.id) ? delayedA.promise : response(catalog(B, 'Solo B')));
    await client.start();
    const first = client.selectTenant(A.id);
    await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes(A.id))).toBe(true));
    await client.selectTenant(B.id);
    delayedA.resolve(response(catalog(A, 'NO MOSTRAR A')));
    await first;
    expect(client.getSnapshot().tenant.id).toBe(B.id);
    expect(client.getSnapshot().items.map(item => item.name)).toEqual(['Solo B']);
  });

  it('rejects mismatched tenant/epoch and projects only the catalog DTO', async () => {
    const { client } = harness(() => response({ ...catalog(A), dataEpoch: 'old', items: [{ ...catalog(A).items[0], secret: 'hidden' }] }));
    await client.start();
    await client.selectTenant(A.id);
    expect(client.getSnapshot().phase).toBe('unavailable');
    expect(client.getSnapshot().items).toEqual([]);
    expect(JSON.stringify(client.getSnapshot())).not.toContain('hidden');
  });

  it('401 removes protected state; 503 hides it without reporting a logout', async () => {
    let status = 200;
    const { client } = harness(() => { const reply = response(catalog(A), status); if (status === 503) reply.headers.set('Retry-After', '12'); return reply; });
    await client.start(); await client.selectTenant(A.id);
    status = 503;
    await client.nextPage(); // no cursor: no extra request
    await client.selectTenant(A.id);
    expect(client.getSnapshot()).toMatchObject({ phase: 'unavailable', items: [], tenant: null });
    expect(client.getSnapshot().message).not.toContain('sesión terminó');
    await client.start(); status = 401; await client.selectTenant(A.id);
    expect(client.getSnapshot()).toMatchObject({ phase: 'expired', user: null, items: [], tenant: null });
  });

  it('logout discards pending content and reports uncertain revocation on failure', async () => {
    const pending = deferred();
    const { client, fetch } = harness(url => url === '/api/auth/logout' ? response({}, 503) : pending.promise);
    await client.start();
    const reading = client.selectTenant(A.id);
    await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes(A.id))).toBe(true));
    await client.logout();
    pending.resolve(response(catalog(A, 'Late secret')));
    await reading;
    expect(client.getSnapshot()).toMatchObject({ phase: 'logout-uncertain', items: [], user: null });
    expect(client.getSnapshot().message).toContain('No se pudo confirmar');
  });

  it('keeps valid demo/operator sessions out of company content', async () => {
    for (const purpose of ['demo', 'operator']) {
      const fetch = vi.fn(async () => response({ ...session, purpose }));
      const client = createSaasClient(fetch);
      await client.start();
      expect(client.getSnapshot().phase).toBe('denied');
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('never uses an unlisted tenant or arbitrary URL/cursor from the caller', async () => {
    const { client, fetch } = harness(() => response(catalog(A)));
    await client.start();
    await client.selectTenant('../../control');
    expect(client.getSnapshot().phase).toBe('denied');
    expect(fetch.mock.calls.some(([url]) => url.includes('control'))).toBe(false);
  });

  it('paginates with the opaque server cursor and erases the previous page while pending', async () => {
    const next = deferred();
    const { client, fetch } = harness(url => url.includes('cursor=') ? next.promise : response({ ...catalog(A), nextCursor: 'opaque+/=' }));
    await client.start(); await client.selectTenant(A.id);
    const pending = client.nextPage();
    expect(client.getSnapshot().items).toEqual([]);
    await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes('cursor=opaque%2B%2F%3D'))).toBe(true));
    next.resolve(response(catalog(A, 'Página dos')));
    await pending;
    expect(client.getSnapshot().items.map(item => item.name)).toEqual(['Página dos']);
    expect(fetch.mock.calls.filter(([url]) => url === '/api/auth/activity')).toHaveLength(2);
  });

  it('does not renew inactivity on bootstrap, deep link refresh or directory reads', async () => {
    const { client, fetch } = harness(() => response(catalog(A)));
    await client.start(A.id); await client.showTenants();
    expect(fetch.mock.calls.some(([url]) => url === '/api/auth/activity')).toBe(false);
  });

  it('a duplicate submit cannot start a second login and bad credentials remain a login error', async () => {
    const pending = deferred();
    const fetch = vi.fn(async url => url === '/api/auth/session' ? response({ authenticated: false, csrfToken: 'pre' }) : pending.promise);
    const client = createSaasClient(fetch);
    await client.start();
    const first = client.login('a@example.test', 'wrong-password');
    await client.login('a@example.test', 'wrong-password');
    expect(fetch.mock.calls.filter(([url]) => url === '/api/auth/login')).toHaveLength(1);
    pending.resolve(response({}, 401)); await first;
    expect(client.getSnapshot()).toMatchObject({ phase: 'login', busy: false, message: 'Correo o contraseña incorrectos.' });
  });

  it('a network failure closes content without logging response details or declaring logout', async () => {
    const { client } = harness(() => { throw new Error('internal-host PRIVATE_SECRET'); });
    await client.start(); await client.selectTenant(A.id);
    expect(client.getSnapshot()).toMatchObject({ phase: 'unavailable', items: [], user: null });
    expect(JSON.stringify(client.getSnapshot())).not.toMatch(/PRIVATE_SECRET|internal-host|sesión terminó/);
  });

  it('rejects an HTML API response and bounds the returned page before display', async () => {
    const { client } = harness(() => ({ ...response({}), headers: new Headers({ 'Content-Type': 'text/html' }) }));
    await client.start(); await client.selectTenant(A.id);
    expect(client.getSnapshot().phase).toBe('unavailable');
    const second = harness(() => response({ ...catalog(A), items: Array(21).fill(catalog(A).items[0]) })).client;
    await second.start(); await second.selectTenant(A.id);
    expect(second.getSnapshot()).toMatchObject({ phase: 'unavailable', items: [] });
  });

  it('rejects a different identity or authority version after a cookie changes in another tab', async () => {
    for (const changed of [{ ...context, identityId: 'identity-b' }, { ...context, contextVersion: 'v2' }, { ...context, purpose: 'demo' }]) {
      const { client } = harness(() => response({ ...catalog(A), context: changed }));
      await client.start(); await client.selectTenant(A.id);
      expect(client.getSnapshot()).toMatchObject({ phase: 'unavailable', user: null, items: [] });
    }
  });

  it('carries a Retry-After beyond the finite read budget without retained protected rows', async () => {
    const limited = { ...response({}, 429), headers: new Headers({ 'Content-Type': 'application/json', 'Retry-After': '12' }) };
    const { client, fetch } = harness(() => limited);
    await client.start();
    const before = Date.now();
    await client.selectTenant(A.id);
    expect(client.getSnapshot()).toMatchObject({ phase: 'limited', items: [] });
    expect(client.getSnapshot().retryAt).toBeGreaterThanOrEqual(before + 12000);
    const calls = fetch.mock.calls.length;
    await Promise.resolve();
    expect(fetch.mock.calls).toHaveLength(calls);
  });
});
