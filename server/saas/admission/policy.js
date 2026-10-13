import { performance } from 'node:perf_hooks';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MiB = 1024 * 1024;
const essentialShare = Object.freeze({ active: 1, waiting: 1, qh60: 12, qh1: 2, qc60: 36, qc1: 6, qt60: 256 * 1024, qt1: 64 * 1024 });
const profiles = Object.freeze({
  essential: { active: 2, waiting: 8, qh60: 120, qh1: 20, qc60: 300, qc1: 50, qt60: 10 * MiB, qt1: 2 * MiB, logicalBytes: 512 * MiB },
  business: { active: 3, waiting: 12, qh60: 240, qh1: 40, qc60: 600, qc1: 100, qt60: 20 * MiB, qt1: 4 * MiB, logicalBytes: 2048 * MiB },
  maximum: { active: 4, waiting: 16, qh60: 360, qh1: 60, qc60: 900, qc1: 150, qt60: 30 * MiB, qt1: 6 * MiB, logicalBytes: 5120 * MiB },
});

export function profile(name, lane) {
  if (!Object.hasOwn(profiles, name)) throw new TypeError('Unknown fixed profile');
  const result = { ...profiles[name] };
  if (lane === 'ordinary') for (const key of Object.keys(essentialShare)) result[key] -= essentialShare[key];
  else if (lane === 'essential') Object.assign(result, essentialShare);
  else if (lane !== undefined) throw new TypeError('Unknown tenant lane');
  return result;
}

export function scopesFor(tenantId, lane) {
  if (!UUID.test(tenantId) || !['ordinary', 'essential', 'demo'].includes(lane)) throw new TypeError('Invalid admitted scope');
  return ['global', `lane:${lane}`, `tenant:${tenantId}`, `tenant:${tenantId}:${lane}`];
}

export function calculateUsage(rows, tick) {
  const current = BigInt(tick);
  const value = { qh60: 0, qh1: 0, qc60: 0, qc1: 0, qt60: 0, qt1: 0 };
  for (const row of rows) {
    const distance = current - BigInt(row.tick);
    if (distance < 0n) throw new Error('Window is ahead of authoritative clock');
    for (const [window, buckets] of [['60', 601n], ['1', 11n]]) {
      if (distance >= buckets) continue;
      for (const metric of ['qh', 'qc', 'qt']) {
        const n = Number(row[metric] ?? 0);
        if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(value[metric + window] + n)) throw new Error('Invalid quota counter');
        value[metric + window] += n;
      }
    }
  }
  return value;
}

export function checkBudget(limits, usage, addition = {}) {
  for (const key of ['qh60', 'qh1', 'qc60', 'qc1', 'qt60', 'qt1', 'active', 'waiting']) {
    const metric = key.startsWith('qh') ? 'qh' : key.startsWith('qc') ? 'qc' : key.startsWith('qt') ? 'qt' : key;
    const reserve = metric === 'qc' ? usage.reservedQc ?? 0 : metric === 'qt' ? usage.reservedQt ?? 0 : 0;
    const limit = limits[key];
    const next = (usage[key] ?? 0) + reserve + (addition[metric] ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(next) || next > limit) return key;
  }
  return null;
}

export function validateOverride(fields, durationSeconds) {
  if (!fields || Object.getPrototypeOf(fields) !== Object.prototype || !Object.keys(fields).length) throw new TypeError('Empty quota change');
  const ranges = { qh60: [24, 360], active: [2, 4], logicalBytes: [64 * MiB, 5120 * MiB] };
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 86400 || durationSeconds > 604800) throw new TypeError('Override duration outside 24 hours–7 days');
  for (const [key, value] of Object.entries(fields)) {
    if (!Object.hasOwn(ranges, key) || !Number.isSafeInteger(value) || value < ranges[key][0] || value > ranges[key][1]) throw new TypeError('Quota field outside allowlist/range');
  }
  return { ...fields };
}

// Wall-clock timestamps never replenish quota. Each API must witness committed progress.
export class ClockObservation {
  constructor({ generation, now = () => performance.now() }) { this.generation = generation; this.now = now; this.last = null; this.progressAt = null; this.blocked = true; }
  observe(row) {
    if (!row || row.generation !== this.generation || row.barrier) { this.blocked = true; return false; }
    const current = { tick: BigInt(row.tick), version: BigInt(row.clock_version) };
    if (this.last && (current.tick < this.last.tick || current.version < this.last.version)) { this.blocked = true; return false; }
    if (this.last && current.tick > this.last.tick && current.version > this.last.version) { this.progressAt = this.now(); this.blocked = false; }
    this.last = current;
    return this.ready();
  }
  ready() { return !this.blocked && this.progressAt !== null && this.now() - this.progressAt < 1000; }
}
