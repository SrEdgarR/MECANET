const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bounded = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const epoch = value => (typeof value === 'string' || Number.isSafeInteger(value)) && String(value).length <= 80;
const blank = { phase: 'starting', user: null, tenants: [], tenant: null, items: [], nextCursor: null, message: '', busy: false, canLogout: false, retryAt: 0 };
const fault = status => Object.assign(new Error('Private request failed'), { status });

/** In-memory only. A generation is invalidated before each context transition.
 * Abort is a resource optimization, never the authority for accepting a result.
 */
export function createSaasClient(fetchRequest = globalThis.fetch.bind(globalThis), { monotonicNow = () => performance.now(), random = Math.random } = {}) {
  let state = { ...blank };
  let generation = 0;
  let abort;
  let csrf;
  let authority;
  let tenantDirectory = new Map();
  const listeners = new Set();
  const emit = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const begin = patch => {
    abort?.abort();
    abort = new AbortController();
    generation += 1;
    emit({ ...blank, canLogout: Boolean(authority), ...patch });
    return { generation, signal: abort.signal, authority, deadline: monotonicNow() + 8000 };
  };
  const current = request => request.generation === generation && !request.signal.aborted;
  const forget = () => { authority = undefined; csrf = undefined; tenantDirectory.clear(); };

  async function json(path, request, method = 'GET', body) {
    const headers = { Accept: 'application/json' };
    if (method === 'POST') {
      if (!csrf) throw fault(403);
      headers['X-CSRF-Token'] = csrf;
      headers['Content-Type'] = 'application/json';
    }
    let reply;
    try {
      reply = await fetchRequest(path, {
        method, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: request.transportSignal ?? request.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      // Browser fetch network failures are transient for reads only. Never
      // disclose the URL/error text or automatically repeat a POST mutation.
      if (error instanceof TypeError) throw Object.assign(fault(503), { retryable: method === 'GET' });
      throw error;
    }
    if (!current(request)) throw new DOMException('Context changed', 'AbortError');
    if (!reply.ok) {
      const after = reply.headers.get('Retry-After');
      const retryAt = /^\d{1,6}$/.test(after ?? '') ? Date.now() + Number(after) * 1000 : Date.parse(after ?? '');
      throw Object.assign(fault(reply.status), { retryAt: Number.isFinite(retryAt) ? retryAt : 0, retryable: [429, 502, 503, 504].includes(reply.status) });
    }
    if (reply.status === 204) return {};
    if (!reply.headers.get('Content-Type')?.includes('application/json')) throw fault(503);
    return reply.json();
  }

  async function waitForRetry(milliseconds, request) {
    if (!current(request)) throw new DOMException('Context changed', 'AbortError');
    await new Promise((resolve, reject) => {
      const cancelled = () => { clearTimeout(timer); request.signal.removeEventListener('abort', cancelled); reject(new DOMException('Context changed', 'AbortError')); };
      const timer = setTimeout(() => { request.signal.removeEventListener('abort', cancelled); resolve(); }, milliseconds);
      request.signal.addEventListener('abort', cancelled, { once: true });
    });
  }

  /** One finite read context: initial HTTP plus at most three fresh HTTP retries.
   * Each request is independently authorized/admitted and charged by the API.
   * This never retries SQL behind an existing ticket or any POST mutation.
   */
  async function readJson(path, request) {
    for (let retry = 0; retry <= 3; retry += 1) {
      if (!current(request)) throw new DOMException('Context changed', 'AbortError');
      const remaining = request.deadline - monotonicNow();
      if (remaining <= 0) throw fault(503);
      const transport = new AbortController(); let timer;
      const contextChanged = () => transport.abort();
      request.signal.addEventListener('abort', contextChanged, { once: true });
      let error;
      try {
        const result = await Promise.race([
          json(path, { ...request, transportSignal: transport.signal }),
          new Promise((_resolve, reject) => { timer = setTimeout(() => { transport.abort(); reject(fault(503)); }, remaining); }),
        ]);
        // Fetch/body parsing can settle before an overdue timer callback runs.
        // The monotonic deadline and current context still govern acceptance.
        if (!current(request)) throw new DOMException('Context changed', 'AbortError');
        if (request.deadline - monotonicNow() <= 0) throw fault(503);
        return result;
      } catch (caught) {
        if (!current(request)) throw new DOMException('Context changed', 'AbortError');
        error = transport.signal.aborted ? fault(503) : caught;
      } finally {
        clearTimeout(timer); request.signal.removeEventListener('abort', contextChanged);
      }
      if (!error.retryable || retry === 3) throw error;
      // Hide protected rows immediately while checking the same context again.
      fail(error, request);
      const jitter = Math.floor(Math.max(0, Math.min(0.99999, Number(random()) || 0)) * 251);
      const delay = Math.max([1000, 2000, 4000][retry] + jitter, (error.retryAt || 0) - Date.now());
      if (delay >= request.deadline - monotonicNow()) throw error;
      await waitForRetry(delay, request);
    }
    throw fault(503);
  }

  function fail(error, request) {
    if (!current(request) || error.name === 'AbortError') return;
    tenantDirectory.clear();
    if (error.status === 401) {
      forget();
      emit({ ...blank, phase: 'expired', message: 'Tu sesión terminó. Inicia sesión para continuar.' });
    } else {
      const phase = [403, 404].includes(error.status) ? 'denied' : error.status === 429 ? 'limited' : 'unavailable';
      const message = phase === 'denied' ? 'No tienes acceso a este contenido. Puedes volver a tus empresas.'
        : phase === 'limited' ? 'Límite temporal alcanzado. Espera antes de reintentar.'
          : 'No podemos comprobar el acceso ahora. El contenido está oculto. Inténtalo de nuevo.';
      emit({ ...blank, phase, message, canLogout: Boolean(authority), retryAt: error.retryAt || 0 });
    }
  }

  function acceptSession(value) {
    if (!value || typeof value.authenticated !== 'boolean' || !bounded(value.csrfToken, 512)) throw fault(503);
    csrf = value.csrfToken;
    if (!value.authenticated) { authority = undefined; return false; }
    if (!bounded(value.user?.id, 80) || !bounded(value.user?.email, 254) || !bounded(value.purpose, 24) || !epoch(value.contextVersion)) throw fault(503);
    authority = { identityId: value.user.id, purpose: value.purpose, contextVersion: String(value.contextVersion), user: { id: value.user.id, email: value.user.email } };
    if (value.purpose !== 'company') throw fault(403);
    return true;
  }

  function checkContext(context) {
    if (!authority || context?.identityId !== authority.identityId || context?.purpose !== authority.purpose
      || String(context?.contextVersion) !== authority.contextVersion) throw fault(503);
  }

  async function listTenants(request) {
    const result = await readJson('/api/tenants', request);
    if (!current(request)) return;
    checkContext(result.context);
    if (!Array.isArray(result.tenants) || result.tenants.length > 100) throw fault(503);
    const tenants = result.tenants.map(tenant => {
      if (!UUID.test(tenant.id) || !bounded(tenant.name, 160) || !epoch(tenant.dataEpoch)) throw fault(503);
      return { id: tenant.id, name: tenant.name, dataEpoch: String(tenant.dataEpoch) };
    });
    if (new Set(tenants.map(tenant => tenant.id)).size !== tenants.length) throw fault(503);
    tenantDirectory = new Map(tenants.map(tenant => [tenant.id, tenant]));
    emit({ ...blank, phase: 'tenants', user: authority.user, tenants, canLogout: true });
  }

  async function start(tenantId) {
    tenantDirectory.clear();
    const request = begin({ phase: 'starting' });
    try {
      const session = await json('/api/auth/session', request);
      if (!current(request)) return;
      if (!acceptSession(session)) { emit({ ...blank, phase: 'login' }); return; }
      request.authority = authority;
      await listTenants(request);
      // A deep link is revalidated against the fresh directory and current session.
      if (tenantId && current(request)) await selectTenant(tenantId, false);
    } catch (error) { fail(error, request); }
  }

  async function login(email, password) {
    if (state.busy || state.phase !== 'login' || !csrf) return;
    const request = begin({ phase: 'login', busy: true });
    try {
      const session = await json('/api/auth/login', request, 'POST', { email, password });
      if (!current(request)) return;
      if (!acceptSession(session)) throw fault(401);
      request.authority = authority;
      await listTenants(request);
    } catch (error) {
      if (!current(request)) return;
      if (error.status === 401) {
        authority = undefined;
        emit({ ...blank, phase: 'login', message: 'Correo o contraseña incorrectos.' });
      } else fail(error, request);
    }
  }

  async function showTenants() {
    if (!authority) return start();
    const request = begin({ phase: 'loading-tenants' });
    try { await listTenants(request); } catch (error) { fail(error, request); }
  }

  async function readCatalog(tenant, cursor, interactive) {
    const request = begin({ phase: 'loading-catalog', tenant, user: authority?.user });
    try {
      if (!request.authority || request.authority.purpose !== 'company') throw fault(403);
      if (interactive) await json('/api/auth/activity', request, 'POST', {});
      if (!current(request)) return;
      const query = new URLSearchParams({ limit: '20', ...(cursor ? { cursor } : {}) });
      const result = await readJson(`/api/tenants/${encodeURIComponent(tenant.id)}/catalog?${query}`, request);
      if (!current(request) || request.authority !== authority) return;
      checkContext(result.context);
      if (result.tenantId !== tenant.id || String(result.dataEpoch) !== tenant.dataEpoch || !Array.isArray(result.items) || result.items.length > 20) throw fault(503);
      if (result.nextCursor !== null && (!bounded(result.nextCursor, 512) || /[\x00-\x1f\x7f]/.test(result.nextCursor))) throw fault(503);
      const items = result.items.map(item => {
        if (!bounded(item.id, 80) || !bounded(item.sku, 80) || !bounded(item.name, 240)) throw fault(503);
        return { id: item.id, sku: item.sku, name: item.name };
      });
      emit({ ...blank, phase: 'catalog', tenant, user: authority.user, items, nextCursor: result.nextCursor, canLogout: true });
    } catch (error) { fail(error, request); }
  }

  async function selectTenant(tenantId, interactive = true) {
    const tenant = tenantDirectory.get(tenantId);
    if (!tenant || !authority || authority.purpose !== 'company') {
      const request = begin({}); fail(fault(403), request); return;
    }
    await readCatalog(tenant, null, interactive);
  }

  async function nextPage() {
    if (state.phase !== 'catalog' || !state.nextCursor) return;
    await readCatalog(state.tenant, state.nextCursor, true);
  }

  async function logout() {
    if (!authority || state.phase === 'logging-out') return;
    tenantDirectory.clear();
    const request = begin({ phase: 'logging-out' });
    try {
      await json('/api/auth/logout', request, 'POST', {});
      if (!current(request)) return;
      forget();
      await start();
    } catch (error) {
      if (!current(request)) return;
      if (error.status === 401) { forget(); await start(); return; }
      emit({ ...blank, phase: 'logout-uncertain', canLogout: true, message: 'No se pudo confirmar el cierre de sesión. El contenido está oculto. Reintenta el cierre.' });
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    start, login, showTenants, selectTenant, nextPage, logout,
    dispose: () => { abort?.abort(); generation += 1; forget(); listeners.clear(); state = { ...blank }; },
  };
}
