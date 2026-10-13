import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaasClient } from './client.js';

const A = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'A', dataEpoch: '1' };
const B = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'B', dataEpoch: '1' };
const session = { authenticated: true, csrfToken: 'private-fixture-csrf', user: { id: 'identity', email: 'a@qa.invalid' }, purpose: 'company', contextVersion: 'v1' };
const context = { identityId: session.user.id, purpose: session.purpose, contextVersion: session.contextVersion };
const response = (body, status = 200, after) => ({ status, ok: status < 400, headers: new Headers({ 'Content-Type': 'application/json', ...(after ? { 'Retry-After': after } : {}) }), json: async () => body });
const catalog = tenant => ({ context, tenantId: tenant.id, dataEpoch: tenant.dataEpoch, items: [{ id: 'product', sku: tenant.name, name: `Only ${tenant.name}` }], nextCursor: null });
const owned = [];
function harness(handler) {
  const calls = [];
  const fetch = vi.fn(async (url, options) => {
    calls.push({ url, at: Date.now(), options });
    if (url === '/api/auth/session') return response(session);
    if (url === '/api/tenants') return response({ context, tenants: [A, B] });
    if (url === '/api/auth/activity') return response({ ok: true });
    return handler(url, options);
  });
  const client = createSaasClient(fetch, { monotonicNow: () => Date.now(), random: () => 0 });
  owned.push(client); return { client, fetch, calls, reads: () => calls.filter(call => call.url.includes('/catalog?')) };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { for (const client of owned.splice(0)) client.dispose(); vi.useRealTimers(); });

describe('approved bounded HTTP read retries', () => {
  it('retries catalog GET at 1/2/4 seconds and hides protected context until the same generation succeeds', async () => {
    let attempts = 0;
    const { client, reads } = harness(() => response(catalog(A), ++attempts < 4 ? 503 : 200));
    await client.start(); const pending = client.selectTenant(A.id, false);
    await vi.advanceTimersByTimeAsync(0); expect(reads()).toHaveLength(1);
    expect(client.getSnapshot()).toMatchObject({ phase: 'unavailable', items: [], user: null, tenant: null });
    await vi.advanceTimersByTimeAsync(999); expect(reads()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); expect(reads()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000); expect(reads()).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(4000); await pending;
    expect(reads().map(call => call.at)).toEqual([0, 1000, 3000, 7000]);
    expect(client.getSnapshot()).toMatchObject({ phase: 'catalog', items: [{ name: 'Only A' }] });
    expect(reads().every(call => call.options.method === 'GET' && call.options.credentials === 'same-origin')).toBe(true);
  });

  it('allows no more than three retries and never repeats a POST mutation', async () => {
    const { client, fetch, reads } = harness(url => response({}, 503));
    await client.start(); const pending = client.selectTenant(A.id, false);
    await vi.advanceTimersByTimeAsync(8000); await pending;
    expect(reads()).toHaveLength(4); expect(client.getSnapshot().phase).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(30000); expect(reads()).toHaveLength(4);
    await client.start(); await client.logout();
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch.mock.calls.filter(([url]) => url === '/api/auth/logout')).toHaveLength(1);
    expect(client.getSnapshot().phase).toBe('logout-uncertain');
  });

  it('honors Retry-After and declines a wait beyond the eight-second context deadline', async () => {
    let attempts = 0;
    const first = harness(() => response(catalog(A), ++attempts === 1 ? 429 : 200, '2'));
    await first.client.start(); const pending = first.client.selectTenant(A.id, false);
    await vi.advanceTimersByTimeAsync(1999); expect(first.reads()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); await pending; expect(first.reads().map(call => call.at)).toEqual([0, 2000]);
    const second = harness(() => response({}, 429, '12'));
    await second.client.start(); await second.client.selectTenant(A.id, false);
    expect(second.client.getSnapshot()).toMatchObject({ phase: 'limited', items: [] });
    await vi.advanceTimersByTimeAsync(20000); expect(second.reads()).toHaveLength(1);
  });

  it('aborts the old retry when switching company and never displays its late content', async () => {
    const { client, reads } = harness(url => url.includes(A.id) ? response({}, 503) : response(catalog(B)));
    await client.start(); const old = client.selectTenant(A.id, false);
    await vi.advanceTimersByTimeAsync(0); await client.showTenants(); await client.selectTenant(B.id, false); await old;
    await vi.advanceTimersByTimeAsync(30000);
    expect(reads().filter(call => call.url.includes(A.id))).toHaveLength(1);
    expect(client.getSnapshot()).toMatchObject({ phase: 'catalog', tenant: { id: B.id }, items: [{ name: 'Only B' }] });
  });

  it('purges 401 immediately and does not retry denied or malformed responses', async () => {
    for (const status of [401, 403, 404]) {
      const { client, reads } = harness(() => response({}, status));
      await client.start(); await client.selectTenant(A.id, false);
      await vi.advanceTimersByTimeAsync(10000); expect(reads()).toHaveLength(1);
      expect(client.getSnapshot().items).toEqual([]);
      if (status === 401) expect(client.getSnapshot()).toMatchObject({ phase: 'expired', user: null, canLogout: false });
    }
  });

  it('bounds a hanging fetch by the remaining deadline even if the transport ignores abort', async () => {
    let resolve, signal;
    const { client, reads } = harness((_url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); });
    await client.start(); const pending = client.selectTenant(A.id, false);
    await vi.advanceTimersByTimeAsync(8000); await pending;
    expect(signal.aborted).toBe(true); expect(reads()).toHaveLength(1); expect(client.getSnapshot().phase).toBe('unavailable');
    resolve(response(catalog(A))); await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot()).toMatchObject({ phase: 'unavailable', items: [] });
  });

  it('rejects a parsed response at or after the deadline even when the timer has not run', async () => {
    for (const elapsed of [8000, 8001]) {
      vi.setSystemTime(0);
      const { client, reads } = harness(() => ({
        ...response({}),
        json: async () => {
          // Advancing the clock without firing timers models parsing or a busy
          // event loop resolving the fetch before its overdue timer callback.
          vi.setSystemTime(elapsed);
          return catalog(A);
        },
      }));
      await client.start(); await client.selectTenant(A.id, false);
      expect(client.getSnapshot()).toMatchObject({ phase: 'unavailable', items: [], tenant: null });
      expect(reads()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(20000); expect(reads()).toHaveLength(1);
    }
  });

  it('retries a real-fetch shaped network error without disclosing its details', async () => {
    let attempts = 0;
    const { client, reads } = harness(() => { if (++attempts === 1) throw new TypeError('SECRET_HOST'); return response(catalog(A)); });
    await client.start(); const pending = client.selectTenant(A.id, false);
    await vi.advanceTimersByTimeAsync(0); expect(JSON.stringify(client.getSnapshot())).not.toContain('SECRET_HOST');
    await vi.advanceTimersByTimeAsync(1000); await pending; expect(reads()).toHaveLength(2); expect(client.getSnapshot().phase).toBe('catalog');
  });

  it('does not automatically replay login or activity when they return 503', async () => {
    for (const action of ['login', 'activity']) {
      const fetch = vi.fn(async url => {
        if (url === '/api/auth/session') return response(action === 'login' ? { authenticated: false, csrfToken: 'pre' } : session);
        if (url === '/api/tenants') return response({ context, tenants: [A] });
        if (url === `/api/auth/${action}`) return response({}, 503);
        throw new Error('A failed mutation must not proceed to catalogue');
      });
      const client = createSaasClient(fetch, { monotonicNow: () => Date.now(), random: () => 0 }); owned.push(client);
      await client.start(); if (action === 'login') await client.login('a@qa.invalid', 'temporary-fixture'); else await client.selectTenant(A.id);
      await vi.advanceTimersByTimeAsync(30000);
      expect(fetch.mock.calls.filter(([url]) => url === `/api/auth/${action}`)).toHaveLength(1);
      expect(client.getSnapshot()).toMatchObject({ phase: 'unavailable', items: [] });
    }
  });

  it('adds finite jitter to each retry without changing the 1/2/4 second base or eight-second ceiling', async () => {
    let attempts = 0; const times = [];
    const fetch = vi.fn(async url => {
      if (url === '/api/auth/session') return response(session);
      if (url === '/api/tenants') return response({ context, tenants: [A] });
      times.push(Date.now()); return response(catalog(A), ++attempts < 4 ? 503 : 200);
    });
    const client = createSaasClient(fetch, { monotonicNow: () => Date.now(), random: () => 0.99999 }); owned.push(client);
    await client.start(); const pending = client.selectTenant(A.id, false);
    await vi.advanceTimersByTimeAsync(8000); await pending;
    expect(times).toEqual([0, 1250, 3500, 7750]); expect(times.at(-1)).toBeLessThan(8000);
    expect(client.getSnapshot().phase).toBe('catalog');
  });
});
