export const HINTS_KEY = 'mecanet.operation-hints.v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximum = 32;

// This tab-local record is a recovery hint, never authorization or business data.
export function createOperationHints(getStorage = () => globalThis.sessionStorage) {
  function read() {
    try {
      const storage = getStorage();
      if (!storage) return { valid: false, entries: [] };
      const raw = storage.getItem(HINTS_KEY);
      if (raw === null) return { valid: true, entries: [] };
      if (typeof raw !== 'string' || raw.length > 4096) return { valid: false, entries: [] };
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries) || entries.length > maximum || entries.some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry)
        || Object.keys(entry).sort().join(',') !== 'operationId,tenantId' || !uuid.test(entry.tenantId) || !uuid.test(entry.operationId))) return { valid: false, entries: [] };
      const normalized = entries.map(entry => ({ tenantId: entry.tenantId.toLowerCase(), operationId: entry.operationId.toLowerCase() }));
      if (new Set(normalized.map(entry => `${entry.tenantId}:${entry.operationId}`)).size !== normalized.length) return { valid: false, entries: [] };
      return { valid: true, entries: normalized };
    } catch { return { valid: false, entries: [] }; }
  }
  function persist(tenantId, operationId) {
    if (!uuid.test(tenantId) || !uuid.test(operationId)) return false;
    const record = read(); if (!record.valid) return false;
    const hint = { tenantId: tenantId.toLowerCase(), operationId: operationId.toLowerCase() };
    const existing = record.entries.some(entry => entry.tenantId === hint.tenantId && entry.operationId === hint.operationId);
    if (!existing && record.entries.length >= maximum) return false;
    const entries = existing ? record.entries : [...record.entries, hint];
    try {
      getStorage().setItem(HINTS_KEY, JSON.stringify(entries));
      const saved = read();
      return saved.valid && saved.entries.length === entries.length
        && saved.entries.some(entry => entry.tenantId === hint.tenantId && entry.operationId === hint.operationId);
    } catch { return false; }
  }
  function remove(tenantId, operationId) {
    const record = read(); if (!record.valid) return;
    const entries = record.entries.filter(entry => entry.tenantId !== tenantId || entry.operationId !== operationId);
    try { if (entries.length) getStorage().setItem(HINTS_KEY, JSON.stringify(entries)); else getStorage().removeItem(HINTS_KEY); } catch { /* Reads remain possible when storage is unavailable. */ }
  }
  function clear() { try { getStorage()?.removeItem(HINTS_KEY); } catch { /* No in-memory payload survives the caller's identity reset. */ } }
  return { persist, remove, clear, forTenant: tenantId => read().entries.filter(entry => entry.tenantId === tenantId).map(entry => entry.operationId) };
}
