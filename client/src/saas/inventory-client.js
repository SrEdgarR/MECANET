import { createOperationHints } from './operation-hints.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n;
const positive = value => decimal(value) && value !== '0';
const publicStates = new Set(['PENDING', 'CONFIRMED', 'REJECTED', 'UNKNOWN']);
const terminal = state => state === 'CONFIRMED' || state === 'REJECTED';
const unavailable = () => Object.assign(new Error('Inventory contract unavailable'), { status: 503 });
const permission = (tenant, action) => tenant?.permissions?.includes(action) === true;
const ownKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
export const validInventoryText = (value, maximum) => typeof value === 'string' && value.length > 0 && [...value].length <= maximum
  && !value.includes('\u0000') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
function createBody(value) {
  if (!ownKeys(value, ['sku', 'name']) || typeof value.sku !== 'string' || !validInventoryText(value.name, 200)) return null;
  const sku = value.sku.trim().replace(/[a-z]/g, letter => letter.toUpperCase());
  return /^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(sku) ? { sku, name: value.name } : null;
}
function receiveBody(value) {
  return ownKeys(value, ['quantity', 'reason']) && positive(value.quantity) && BigInt(value.quantity) <= 1000000n && validInventoryText(value.reason, 160)
    ? { quantity: value.quantity, reason: value.reason } : null;
}

export function createInventoryActions(bridge, { storage, operationUuid = () => globalThis.crypto.randomUUID() } = {}) {
  const hints = createOperationHints(storage === undefined ? undefined : () => storage);
  const payloads = new Map();
  const lookups = new Map();
  let selectedLookup = 0;
  let lookupSequence = 0;
  let movementGeneration = 0;
  const requestFor = () => bridge.request();
  const guard = tenant => ({ tenantId: tenant.id, dataEpoch: tenant.dataEpoch, identityId: bridge.authority()?.identityId, contextVersion: bridge.authority()?.contextVersion });
  const matches = (saved, tenant) => saved && tenant && saved.tenantId === tenant.id && saved.dataEpoch === tenant.dataEpoch
    && saved.identityId === bridge.authority()?.identityId && saved.contextVersion === bridge.authority()?.contextVersion;
  function envelope(value, tenant) {
    try { bridge.checkContext(value?.context); } catch (error) { error.contextLost = true; throw error; }
    if (value.tenantId !== tenant.id || String(value.dataEpoch) !== tenant.dataEpoch) throw Object.assign(unavailable(), { contextLost: true });
  }
  function page(value, tenant, project) {
    envelope(value, tenant);
    if (!Array.isArray(value.items) || value.items.length > 20 || (value.nextCursor !== null && !UUID.test(value.nextCursor))) throw unavailable();
    return { items: value.items.map(project), nextCursor: value.nextCursor };
  }
  function inventoryRow(item) {
    if (!UUID.test(item?.id) || !validInventoryText(item.sku, 64) || !validInventoryText(item.name, 200) || !decimal(item.onHand) || !positive(item.version)) throw unavailable();
    return { id: item.id.toLowerCase(), sku: item.sku, name: item.name, onHand: item.onHand, version: item.version };
  }
  function result(value, tenant, operationId) {
    if (!value || value.operationId !== operationId || !publicStates.has(value.state)) throw unavailable();
    if (String(value.dataEpoch) !== tenant.dataEpoch) throw Object.assign(unavailable(), { contextLost: true });
    if (value.state === 'CONFIRMED') {
      if (!UUID.test(value.productId) || (value.movementId !== null && !UUID.test(value.movementId)) || !decimal(value.onHand) || !positive(value.balanceVersion)) throw unavailable();
      return { operationId, state: value.state, productId: value.productId, movementId: value.movementId, onHand: value.onHand, balanceVersion: value.balanceVersion, dataEpoch: tenant.dataEpoch };
    }
    if (value.state === 'REJECTED') return { operationId, state: value.state, dataEpoch: tenant.dataEpoch };
    return { operationId, state: value.state, dataEpoch: tenant.dataEpoch };
  }
  function saveOperation(operation, tenant, { selected = true, message = '' } = {}) {
    if (terminal(operation.state)) { hints.remove(tenant.id, operation.operationId); payloads.delete(operation.operationId); }
    const exposed = { ...operation, canReplay: !terminal(operation.state) && Boolean(matches(payloads.get(operation.operationId)?.guard, tenant)) };
    const operations = [...bridge.state().operations.filter(item => item.operationId !== operation.operationId && !terminal(item.state)), exposed];
    bridge.emit({ operations, ...(selected ? { operation: exposed, operationMessage: message } : {}) });
  }
  async function lookupOperation(operationId, { selected = true, request = requestFor(), tenant = bridge.state().tenant } = {}) {
    if (!UUID.test(operationId) || !tenant || bridge.authority()?.purpose !== 'company') return;
    operationId = operationId.toLowerCase();
    const sequence = ++lookupSequence; lookups.set(operationId, sequence);
    const selectedSequence = selected ? ++selectedLookup : selectedLookup;
    const latest = () => bridge.current(request) && lookups.get(operationId) === sequence && (!selected || selectedSequence === selectedLookup);
    try {
      const value = await bridge.getOnce(`/api/tenants/${tenant.id}/operations/${operationId}`, request);
      if (!latest() || bridge.state().tenant?.id !== tenant.id) return;
      envelope(value, tenant);
      const operation = result(value.result ?? value, tenant, operationId);
      if (value.state !== operation.state) throw unavailable();
      saveOperation(operation, tenant, { selected, message: terminal(operation.state) ? '' : 'El resultado sigue pendiente de comprobar.' });
    } catch (error) {
      if (!bridge.current(request)) return;
      if (error.contextLost) { bridge.fail(error, request); return; }
      if (!latest()) return;
      if (error.status === 401 || error.status === 403) { bridge.fail(error, request); return; }
      saveOperation({ operationId, state: 'UNKNOWN', dataEpoch: tenant.dataEpoch }, tenant, { selected,
        message: error.status === 404 ? 'La ausencia de resultado no confirma una reversión. Conserva la referencia y vuelve a consultar.' : 'No podemos comprobar el resultado ahora. Conserva su referencia.' });
    } finally { if (lookups.get(operationId) === sequence) lookups.delete(operationId); }
  }
  async function recover(tenant, request, cursor) {
    const ids = new Set(hints.forTenant(tenant.id));
    const query = new URLSearchParams({ state: 'pending', limit: '20', ...(cursor ? { cursor } : {}) });
    const value = await bridge.getOnce(`/api/tenants/${tenant.id}/operations?${query}`, request);
    if (!bridge.current(request)) return;
    const pending = page(value, tenant, item => {
      if (!UUID.test(item?.operationId) || !['catalog.create', 'inventory.receive'].includes(item.action) || !permission(tenant, item.action)
        || !['PENDING', 'UNKNOWN'].includes(item.state) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.createdAt)) throw unavailable();
      return { operationId: item.operationId.toLowerCase(), action: item.action, state: item.state, createdAt: item.createdAt, canReplay: false };
    });
    bridge.emit({ operations: pending.items, operationsCursor: pending.nextCursor });
    for (const item of pending.items) ids.add(item.operationId);
    for (const id of ids) {
      if (!bridge.current(request)) return;
      await lookupOperation(id, { selected: false, request, tenant });
    }
  }
  async function readInventory(tenant, cursor, interactive) {
    const request = bridge.begin({ phase: 'loading-inventory', tenant, user: bridge.authority()?.user });
    movementGeneration += 1;
    try {
      if (bridge.authority()?.purpose !== 'company') throw Object.assign(unavailable(), { status: 403 });
      if (interactive) await bridge.json('/api/auth/activity', request, 'POST', {});
      let selected = { items: [], nextCursor: null };
      if (permission(tenant, 'inventory.read')) {
        const query = new URLSearchParams({ limit: '20', ...(cursor ? { cursor } : {}) });
        selected = page(await bridge.readJson(`/api/tenants/${tenant.id}/inventory?${query}`, request), tenant, inventoryRow);
      }
      if (!bridge.current(request)) return;
      bridge.emit({ phase: 'inventory', tenant, user: bridge.authority().user, ...selected, canLogout: true });
      await recover(tenant, request);
    } catch (error) { bridge.fail(error, request); }
  }
  async function selectInventory(tenantId, interactive = true) {
    const tenant = bridge.tenant(tenantId);
    if (!tenant || !['inventory.read', 'catalog.create', 'inventory.receive'].some(action => permission(tenant, action))) {
      const request = bridge.begin({}); bridge.fail(Object.assign(unavailable(), { status: 403 }), request); return;
    }
    await readInventory(tenant, null, interactive);
  }
  async function submit(action, productId, input, priorId) {
    const state = bridge.state(); const tenant = state.tenant;
    if (state.phase !== 'inventory' || state.writeBusy || !permission(tenant, action)) return;
    const body = action === 'catalog.create' ? createBody(input) : receiveBody(input);
    if (!body || (action === 'inventory.receive' && !UUID.test(productId))) { bridge.emit({ operationMessage: 'Revisa los datos del formulario antes de continuar.' }); return; }
    let operationId;
    try { operationId = (priorId ?? operationUuid()).toLowerCase(); } catch { operationId = ''; }
    if (!UUID.test(operationId) || !hints.persist(tenant.id, operationId)) {
      bridge.emit({ operationMessage: 'No podemos conservar la referencia de esta operación en la pestaña. Revisa el almacenamiento antes de continuar.' }); return;
    }
    if (!priorId && payloads.has(operationId)) { bridge.emit({ operationMessage: 'La referencia ya existe. Consulta el resultado antes de continuar.' }); return; }
    const request = requestFor();
    const path = action === 'catalog.create' ? `/api/tenants/${tenant.id}/products` : `/api/tenants/${tenant.id}/products/${productId.toLowerCase()}/stock-receipts`;
    payloads.set(operationId, { action, productId, body, guard: guard(tenant) });
    bridge.emit({ writeBusy: true, operation: { operationId, state: 'PENDING', canReplay: false }, operationMessage: '' });
    try {
      const value = await bridge.postOnce(path, request, body, { 'Idempotency-Key': operationId, 'X-Data-Epoch': tenant.dataEpoch });
      if (!bridge.current(request)) return;
      saveOperation(result(value, tenant, operationId), tenant);
    } catch (error) {
      if (!bridge.current(request)) return;
      if (error.contextLost || error.status === 401 || error.status === 403) { bridge.fail(error, request); return; }
      const message = error.status === 429 ? 'Se alcanzó un cupo. Consulta la operación antes de iniciar otra.'
        : error.status === 409 ? 'Hay un conflicto de referencia, producto o versión. Consulta el resultado antes de continuar.'
          : error.status === 400 ? 'La solicitud no pudo aceptarse. Conserva la referencia y comprueba su resultado.'
            : 'No recibimos un resultado confirmado. Consulta la referencia; no se enviará de nuevo automáticamente.';
      saveOperation({ operationId, state: 'UNKNOWN', dataEpoch: tenant.dataEpoch }, tenant, { message });
    } finally { if (bridge.current(request)) bridge.emit({ writeBusy: false }); }
  }
  async function resendOperation(operationId) {
    const saved = payloads.get(operationId);
    if (!saved || !matches(saved.guard, bridge.state().tenant)) return;
    await submit(saved.action, saved.productId, saved.body, operationId);
  }
  async function readMovements(productId, cursor) {
    const tenant = bridge.state().tenant;
    if (bridge.state().phase !== 'inventory' || !permission(tenant, 'inventory.read') || !UUID.test(productId) || (cursor && !UUID.test(cursor))) return;
    const product = bridge.state().items.find(item => item.id === productId);
    if (!product) return;
    const request = requestFor(); const local = ++movementGeneration;
    bridge.emit({ movementProduct: product, movements: [], movementCursor: null, movementsLoading: true });
    try {
      const query = new URLSearchParams({ limit: '20', ...(cursor ? { cursor } : {}) });
      const value = await bridge.getOnce(`/api/tenants/${tenant.id}/products/${productId}/stock-movements?${query}`, request);
      if (!bridge.current(request) || local !== movementGeneration) return;
      const selected = page(value, tenant, item => {
        if (!UUID.test(item?.id) || !UUID.test(item.operationId) || !positive(item.quantity) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.recordedAt)) throw unavailable();
        return { id: item.id, operationId: item.operationId, quantity: item.quantity, recordedAt: item.recordedAt };
      });
      bridge.emit({ movements: selected.items, movementCursor: selected.nextCursor, movementsLoading: false });
    } catch (error) { if (bridge.current(request) && local === movementGeneration) bridge.fail(error, request); }
  }
  return { selectInventory, createProduct: body => submit('catalog.create', null, body), receiveStock: (id, body) => submit('inventory.receive', id, body),
    lookupOperation, resendOperation, readMovements,
    nextInventoryPage: () => bridge.state().phase === 'inventory' && bridge.state().nextCursor ? readInventory(bridge.state().tenant, bridge.state().nextCursor, true) : undefined,
    nextMovementPage: () => bridge.state().movementCursor ? readMovements(bridge.state().movementProduct.id, bridge.state().movementCursor) : undefined,
    nextOperationsPage: async () => {
      if (bridge.state().phase !== 'inventory' || !bridge.state().operationsCursor) return;
      const request = requestFor();
      try { await recover(bridge.state().tenant, request, bridge.state().operationsCursor); } catch (error) { bridge.fail(error, request); }
    },
    reset: ({ clearHints = false } = {}) => { payloads.clear(); lookups.clear(); selectedLookup += 1; movementGeneration += 1; if (clearHints) hints.clear(); } };
}
