import { describe, expect, it } from 'vitest';
import { createOperationHints, HINTS_KEY } from './operation-hints.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const operation = index => `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, '0')}`;
export function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

describe('bounded untrusted operation hints', () => {
  it('stores exactly tenant and operation IDs, preserving only the current tenant on read', () => {
    const storage = memoryStorage(); const hints = createOperationHints(() => storage);
    expect(hints.persist(A, operation(1))).toBe(true);
    expect(hints.persist(B, operation(2))).toBe(true);
    expect(JSON.parse(storage.getItem(HINTS_KEY))).toEqual([{ tenantId: A, operationId: operation(1) }, { tenantId: B, operationId: operation(2) }]);
    expect(hints.forTenant(A)).toEqual([operation(1)]);
    hints.remove(A, operation(1)); expect(hints.forTenant(A)).toEqual([]); expect(hints.forTenant(B)).toEqual([operation(2)]);
    hints.clear(); expect(storage.getItem(HINTS_KEY)).toBeNull();
  });

  it('deduplicates and stops at 32 without evicting an uncertain operation', () => {
    const hints = createOperationHints(() => memory);
    const memory = memoryStorage();
    for (let index = 1; index <= 32; index += 1) expect(hints.persist(A, operation(index))).toBe(true);
    expect(hints.persist(A, operation(1))).toBe(true);
    expect(hints.persist(A, operation(33))).toBe(false);
    expect(hints.forTenant(A)).toHaveLength(32);
  });

  it('requires a durable roundtrip and rejects unavailable or lying storage', () => {
    for (const storage of [undefined, { getItem: () => null, setItem: () => {}, removeItem: () => {} }, { getItem() { throw new Error('denied'); } }]) {
      const hints = createOperationHints(() => storage);
      expect(hints.persist(A, operation(1))).toBe(false); expect(hints.forTenant(A)).toEqual([]);
    }
  });

  it('rejects invalid IDs, extra fields and oversized or corrupted records without adopting payload', () => {
    const storage = memoryStorage(); const hints = createOperationHints(() => storage);
    expect(hints.persist('../../wrong', operation(1))).toBe(false);
    for (const data of ['bad json', JSON.stringify([{ tenantId: A, operationId: operation(1), body: 'BUSINESS_SECRET' }]), JSON.stringify(Array(33).fill({ tenantId: A, operationId: operation(1) })), 'x'.repeat(10000)]) {
      storage.setItem(HINTS_KEY, data); expect(hints.forTenant(A)).toEqual([]);
    }
  });
});
