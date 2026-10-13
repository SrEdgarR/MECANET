import { performance } from 'node:perf_hooks';

const metrics = Object.freeze({
  'db.physical_bytes': { unit: 'bytes', source: 'postgres.size', scope: /^(tenant:|control$|demo$)/ },
  'db.logical_bytes': { unit: 'bytes', source: 'postgres.size', scope: /^(tenant:|control$|demo$)/ },
  'service.rss_bytes': { unit: 'bytes', source: 'process.self', scope: /^service:/ },
  'service.cpu_usec': { unit: 'microseconds', source: 'process.self', scope: /^service:/ },
  'request.admitted': { unit: 'count', source: 'admission', scope: /^(tenant:|global$)/ },
  'request.rejected': { unit: 'count', source: 'admission', scope: /^(tenant:|global$)/ },
  'admission.conflicts': { unit: 'count', source: 'admission', scope: /^(tenant:|global$)/ },
  'admission.duration': { unit: 'milliseconds', source: 'admission', scope: /^(tenant:|global$)/ },
});
export function normalizeSample(input, scopes) {
  const metric = metrics[input?.metric];
  if (!metric || !scopes.has(input.scope) || !metric.scope.test(input.scope) || input.source !== metric.source) throw new TypeError('Metric outside allowlist');
  if (!['DIRECT', 'ESTIMATED', 'UNAVAILABLE'].includes(input.quality) || !Number.isFinite(input.coverage) || input.coverage < 0 || input.coverage > 1) throw new TypeError('Invalid measurement quality');
  if (input.quality !== 'UNAVAILABLE' && (!Number.isFinite(input.value) || input.value < 0)) throw new TypeError('Invalid measurement value');
  const date = new Date(input.asOf);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid measurement time');
  return { scope: input.scope, metric: input.metric, unit: metric.unit, value: input.quality === 'UNAVAILABLE' ? null : input.value, source: metric.source, quality: input.quality, asOf: date.toISOString(), coverage: input.quality === 'UNAVAILABLE' ? 0 : input.coverage, discontinuity: Boolean(input.discontinuity) };
}

export class ProjectionProducer {
  constructor({ scopes, generation, sourceId, publish, maxBufferBytes = 4 * 1024 * 1024, maxBatchBytes = 64 * 1024 }) {
    if (!(scopes instanceof Set) || scopes.size > 30 || typeof publish !== 'function' || !/^[a-z0-9-]{1,64}$/i.test(sourceId) || typeof generation !== 'string' || generation.length > 64) throw new TypeError('Invalid fixed projection configuration');
    if (!Number.isSafeInteger(maxBufferBytes) || maxBufferBytes < 256 || maxBufferBytes > 4 * 1024 * 1024 || !Number.isSafeInteger(maxBatchBytes) || maxBatchBytes < 256 || maxBatchBytes > Math.min(maxBufferBytes, 64 * 1024)) throw new TypeError('Invalid bounded buffer');
    Object.assign(this, { scopes: new Set(scopes), generation, sourceId, publish, maxBufferBytes, maxBatchBytes });
    this.queue = []; this.bufferBytes = 0; this.dropped = 0; this.sequence = 0; this.pending = null; this.collecting = false; this.flushing = false; this.stopped = false; this.last = { service: -Infinity, database: -Infinity, flush: -Infinity };
  }
  add(input) {
    if (this.stopped) return false;
    const sample = normalizeSample(input, this.scopes);
    if (this.dropped) { sample.discontinuity = true; sample.coverage = Math.min(sample.coverage, 0.99); }
    const bytes = Buffer.byteLength(JSON.stringify(sample)) + 1;
    const singleBatchBytes = Buffer.byteLength(JSON.stringify({ sourceId: this.sourceId, generation: this.generation, sequence: this.sequence + 1, samples: [sample] }));
    if (singleBatchBytes > this.maxBatchBytes || this.bufferBytes + bytes > this.maxBufferBytes) { this.dropped++; return false; }
    this.queue.push({ sample, bytes }); this.bufferBytes += bytes; return true;
  }
  async collect(sample) {
    if (this.stopped || this.collecting) return false;
    this.collecting = true;
    try { const samples = await sample(); for (const row of samples) this.add(row); return true; }
    finally { this.collecting = false; }
  }
  async flush() {
    if (this.flushing || !this.queue.length) return false;
    this.flushing = true;
    try {
      if (!this.pending) {
        const samples = [];
        for (const row of this.queue) {
          const candidate = { sourceId: this.sourceId, generation: this.generation, sequence: this.sequence + 1, samples: [...samples, row.sample] };
          if (Buffer.byteLength(JSON.stringify(candidate)) > this.maxBatchBytes) break;
          samples.push(row.sample);
        }
        if (!samples.length) return false;
        this.pending = { sourceId: this.sourceId, generation: this.generation, sequence: ++this.sequence, samples };
      }
      await this.publish(this.pending);
      for (let i = 0; i < this.pending.samples.length; i++) this.bufferBytes -= this.queue.shift().bytes;
      this.pending = null; return true;
    } catch { return false; }
    finally { this.flushing = false; }
  }
  // Called by the single private worker loop; never creates unbounded timers or a public route.
  async tick({ serviceSample, databaseSample, now = performance.now() }) {
    if (this.stopped) return;
    if (now - this.last.database >= 300000) { this.last.database = now; await this.collect(databaseSample); }
    if (now - this.last.service >= 15000) { this.last.service = now; await this.collect(serviceSample); }
    if (now - this.last.flush >= 30000) { this.last.flush = now; await this.flush(); }
  }
  stop() { this.stopped = true; }
}
