import { createHash, randomUUID } from 'node:crypto';
import { validateOverride, UUID } from './policy.js';
import { serializable, AdmissionError, CommitUncertainError } from './transaction.js';

// Private handler with saas_policy credentials; usage.read does not authorize this operation.
export function createPolicyAdmin({ pool, generation, authorize }) {
  if (typeof authorize !== 'function' || !UUID.test(generation)) throw new TypeError('Policy authority is required');
  return {
    async expireOverrides({ maintenanceActorId }) {
      if (!UUID.test(maintenanceActorId)) throw new TypeError('Private maintenance identity required');
      // One override per bounded invocation; expiration is a versioned change, not a reset.
      return serializable(pool, async client => {
        const fence = (await client.query('UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 AND generation=$1 AND barrier=false RETURNING id', [generation])).rows[0];
        if (!fence) throw new AdmissionError('ADMISSION_CLOSED');
        const current = (await client.query("SELECT scope_key,version,limits,base_limits,override_expires_at FROM saas.policies WHERE scope_key ~ '^tenant:[a-f0-9-]{36}$' AND override_expires_at<=clock_timestamp() ORDER BY scope_key LIMIT 1 FOR UPDATE")).rows[0];
        if (!current) return null;
        const tenantId = current.scope_key.slice(7); const version = Number(current.version) + 1; const requestId = randomUUID();
        await client.query('UPDATE saas.policies SET version=$2,limits=base_limits,override_expires_at=NULL WHERE scope_key=$1', [current.scope_key, version]);
        await client.query('UPDATE saas.policies SET version=version+1,limits=base_limits,override_expires_at=NULL WHERE scope_key=$1', [`${current.scope_key}:ordinary`]);
        const requestHash = createHash('sha256').update(JSON.stringify(['expire',current.scope_key,current.version])).digest('hex');
        await client.query("INSERT INTO saas.policy_audit(request_id,actor_id,tenant_id,action,reason,expected_version,before_limits,after_limits,version,expires_at,request_hash) VALUES($1,$2,$3,'quota.change','Override expired; counters preserved',$4,$5,$6,$7,$8,$9)", [requestId, maintenanceActorId, tenantId, current.version, current.limits, current.base_limits, version, current.override_expires_at, requestHash]);
        return { tenantId, version };
      });
    },
    async change({ actor, tenantId, expectedVersion, requestId, fields, durationSeconds, reason }) {
      await authorize(actor, 'quota.change');
      if (!UUID.test(actor.id) || !UUID.test(tenantId) || !UUID.test(requestId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || typeof reason !== 'string' || !reason.trim() || reason.length > 160) throw new TypeError('Invalid quota change');
      const validated = validateOverride(fields, durationSeconds);
      const requestHash = createHash('sha256').update(JSON.stringify([actor.id, tenantId, expectedVersion, Object.entries(validated).sort(), durationSeconds, reason])).digest('hex');
      try {
        return await serializable(pool, async client => {
          const fence = (await client.query('UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 AND generation=$1 AND barrier=false RETURNING id', [generation])).rows[0];
          if (!fence) throw new AdmissionError('ADMISSION_CLOSED');
          const previous = (await client.query('SELECT version,request_hash FROM saas.policy_audit WHERE request_id=$1', [requestId])).rows[0];
          if (previous) { if (previous.request_hash !== requestHash) throw new AdmissionError('IDEMPOTENCY_CONFLICT', 409); return { version: Number(previous.version), repeated: true }; }
          const scope = `tenant:${tenantId}`;
          const current = (await client.query('SELECT version,limits,base_limits FROM saas.policies WHERE scope_key=$1 FOR UPDATE', [scope])).rows[0];
          if (!current || Number(current.version) !== expectedVersion) throw new AdmissionError('POLICY_VERSION_CONFLICT', 409);
          const after = { ...current.base_limits, ...validated };
          // Burst is contained in the long ceiling; never add capacity by changing a profile.
          after.qh1 = Math.min(after.qh1, after.qh60);
          const ordinary = { ...after, active: after.active - 1, waiting: after.waiting - 1, qh60: after.qh60 - 12, qh1: after.qh1 - 2, qc60: after.qc60 - 36, qc1: after.qc1 - 6, qt60: after.qt60 - 262144, qt1: after.qt1 - 65536 };
          for (const value of Object.values(ordinary)) if (!Number.isSafeInteger(value) || value < 0) throw new AdmissionError('INCOHERENT_POLICY', 409);
          const version = expectedVersion + 1;
          const totalResult = await client.query("UPDATE saas.policies SET version=$2,limits=$3,override_expires_at=clock_timestamp()+$4*interval '1 second' WHERE scope_key=$1 RETURNING override_expires_at", [scope, version, after, durationSeconds]);
          const laneResult = await client.query('UPDATE saas.policies SET version=version+1,limits=$2,override_expires_at=$3 WHERE scope_key=$1', [`${scope}:ordinary`, ordinary, totalResult.rows[0].override_expires_at]);
          if (laneResult.rowCount !== 1) throw new AdmissionError('POLICY_UNAVAILABLE');
          await client.query("INSERT INTO saas.policy_audit(request_id,actor_id,tenant_id,action,reason,expected_version,before_limits,after_limits,version,expires_at,request_hash) VALUES($1,$2,$3,'quota.change',$4,$5,$6,$7,$8,$9,$10)", [requestId, actor.id, tenantId, reason, expectedVersion, current.limits, after, version, totalResult.rows[0].override_expires_at, requestHash]);
          return { version, repeated: false };
        });
      } catch (error) { if (error instanceof CommitUncertainError) error.requestId = requestId; throw error; }
    },
  };
}
