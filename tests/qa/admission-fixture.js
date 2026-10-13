import { profile } from '../../server/saas/admission/policy.js';

// Imported only by the private, preflighted fixture harness. Never by an API entrypoint.
export async function seedAdmission(client, { generation, clockOwner, tenantIds }) {
  const common = { qt60: 60 * 1024 * 1024, qt1: 12 * 1024 * 1024, logicalBytes: 0 };
  const rows = [
    ['global', { ...common, active: 8, waiting: 48, qh60: 600, qh1: 100, qc60: 1200, qc1: 200 }],
    ['lane:ordinary', { ...common, active: 6, waiting: 40, qh60: 480, qh1: 80, qc60: 1080, qc1: 160 }],
    ['lane:essential', { ...common, active: 1, waiting: 4, qh60: 60, qh1: 10, qc60: 60, qc1: 20 }],
    ['lane:demo', { ...common, active: 1, waiting: 4, qh60: 60, qh1: 10, qc60: 60, qc1: 20 }],
    ['entry:auth', { ...common, active: 2, waiting: 16, qh60: 120, qh1: 20, qc60: 120, qc1: 120, qt60: 120 * 65536, qt1: 120 * 65536 }],
    ['entry:operator', { ...common, active: 2, waiting: 8, qh60: 60, qh1: 10, qc60: 60, qc1: 60, qt60: 60 * 65536, qt1: 60 * 65536 }],
  ];
  for (const id of tenantIds) rows.push([`tenant:${id}`, profile('essential')], [`tenant:${id}:ordinary`, profile('essential', 'ordinary')], [`tenant:${id}:essential`, profile('essential', 'essential')]);
  if (tenantIds.includes('33333333-3333-4333-8333-333333333333')) rows.push(['tenant:33333333-3333-4333-8333-333333333333:demo', profile('essential')]);
  for (const [scope, limits] of rows) {
    await client.query('INSERT INTO saas.policies(scope_key,version,limits,base_limits) VALUES($1,1,$2,$2)', [scope, limits]);
    await client.query('INSERT INTO saas.admission_scopes(scope_key) VALUES($1)', [scope]);
  }
  await client.query('INSERT INTO saas.admission_fence(id,generation,tick,clock_version,barrier) VALUES(1,$1,0,0,false)', [generation]);
  await client.query('INSERT INTO saas.time_authority(id,owner,generation,tick,clock_version) VALUES(1,$1,$2,0,0)', [clockOwner, generation]);
}
