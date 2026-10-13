import { normalizeSample } from './producer.js';

// Fixed, own projection table only. No host access or business-table reads.
export function createProjectionRepository({ pool, scopes }) {
  return {
    async publish(batch) {
      if (!batch || !Array.isArray(batch.samples) || Buffer.byteLength(JSON.stringify(batch)) > 65536 || !Number.isSafeInteger(batch.sequence) || batch.sequence < 1 || !/^[a-z0-9-]{1,64}$/i.test(batch.sourceId) || !/^[a-z0-9-]{1,64}$/i.test(batch.generation)) throw new TypeError('Invalid bounded projection batch');
      const samples = batch.samples.map(row => normalizeSample(row, scopes));
      const client = await pool.connect(); let discard;
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout='2s'");
        for (const sample of samples) {
          // Last technical sample per fixed minute/hour is a gauge, never a financial counter.
          for (const granularity of ['minute', 'hour']) await client.query('INSERT INTO saas.usage_projection(source_id,generation,scope,metric,unit,value,source,quality,as_of,bucket,granularity,coverage,discontinuity,sequence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,date_trunc($10,$9::timestamptz),$10,$11,$12,$13) ON CONFLICT(source_id,generation,scope,metric,granularity,bucket) DO UPDATE SET value=EXCLUDED.value,quality=EXCLUDED.quality,as_of=EXCLUDED.as_of,coverage=EXCLUDED.coverage,discontinuity=saas.usage_projection.discontinuity OR EXCLUDED.discontinuity,sequence=EXCLUDED.sequence WHERE saas.usage_projection.sequence<EXCLUDED.sequence OR (saas.usage_projection.sequence=EXCLUDED.sequence AND saas.usage_projection.as_of<EXCLUDED.as_of)', [batch.sourceId, batch.generation, sample.scope, sample.metric, sample.unit, sample.value, sample.source, sample.quality, sample.asOf, granularity, sample.coverage, sample.discontinuity, batch.sequence]);
        }
        await client.query("DELETE FROM saas.usage_projection WHERE (granularity='minute' AND bucket<clock_timestamp()-interval '24 hours') OR (granularity='hour' AND bucket<clock_timestamp()-interval '30 days')");
        await client.query('COMMIT');
      } catch (error) { try { await client.query('ROLLBACK'); } catch (rollbackError) { discard = rollbackError; } throw error; }
      finally { client.release(discard); }
    },
    async read({ scope, authorized, limit = 100 }) {
      if (authorized !== true || !scopes.has(scope)) throw Object.assign(new Error('USAGE_FORBIDDEN'), { status: 403 });
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Invalid projection bound');
      return (await pool.query('SELECT source_id,generation,scope,metric,unit,value,source,quality,as_of,coverage,discontinuity,granularity FROM saas.usage_projection WHERE scope=$1 ORDER BY bucket DESC,metric LIMIT $2', [scope, limit])).rows;
    },
  };
}

export function createServiceSampler({ scope, scopes, now = () => new Date(), usage = () => {
  const cpu = process.cpuUsage();
  return { rss: process.memoryUsage().rss, cpuMicroseconds: cpu.user + cpu.system };
} }) {
  let firstSample = true;
  return async () => {
    const current = usage();
    const common = { scope, source: 'process.self', quality: 'DIRECT', asOf: now().toISOString(), coverage: 1, discontinuity: firstSample };
    const samples = [
      normalizeSample({ ...common, metric: 'service.rss_bytes', value: current.rss }, scopes),
      normalizeSample({ ...common, metric: 'service.cpu_usec', value: current.cpuMicroseconds }, scopes),
    ];
    // CPU is cumulative only within this process. A new sampler starts another
    // series; readers retain source_id/generation even if timestamps overlap.
    firstSample = false;
    return samples;
  };
}

export function createDatabaseSampler({ pool, scopes, now = () => new Date() }) {
  return async () => {
    const asOf = now().toISOString();
    try {
      const rows = (await pool.query('SELECT scope,metric,value FROM saas.measure_database_sizes()')).rows;
      return rows.map(row => normalizeSample({ scope: row.scope, metric: row.metric, value: Number(row.value), source: 'postgres.size', quality: 'DIRECT', asOf, coverage: 1 }, scopes));
    } catch {
      return [...scopes].filter(scope => /^(tenant:|control$|demo$)/.test(scope)).map(scope => normalizeSample({ scope, metric: 'db.physical_bytes', value: null, source: 'postgres.size', quality: 'UNAVAILABLE', asOf, coverage: 0, discontinuity: true }, scopes));
    }
  };
}
