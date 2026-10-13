import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePreflight, fixtureDefinition, renderHba } from './schema/fixture.js';

test('preparer rejects missing ownership or non-synthetic target before connecting', () => {
  const valid = { project: 'mecanet-qa-p1l1', dataClass: 'synthetic', expectedSystemIdentifier: '1234567890123456789', expectedHost: 'postgres', allowBootstrap: true };
  assert.equal(validatePreflight(valid).expectedHost, 'postgres');
  assert.equal(validatePreflight({...valid,project:'mecanet-qa-p1l1-cp014'}).project,'mecanet-qa-p1l1-cp014');
  for (const bad of [{ ...valid, allowBootstrap: false }, { ...valid, project: 'coolify' }, { ...valid, dataClass: 'real' }, { ...valid, expectedHost: 'postgres://elsewhere' }, { ...valid, expectedSystemIdentifier: '' }]) assert.throws(() => validatePreflight(bad), /QA_PREFLIGHT_REQUIRED/);
});

test('private fixture has four identities and same UUID with distinct A/B contents', () => {
  const fixture = fixtureDefinition();
  assert.equal(fixture.identities.length, 4);
  assert.deepEqual(fixture.identities.map((i) => i.purpose).sort(), ['company','company','demo','operator']);
  assert.equal(fixture.tenants[0].products[0].id, fixture.tenants[1].products[0].id);
  assert.notEqual(fixture.tenants[0].products[0].name, fixture.tenants[1].products[0].name);
  assert.equal(fixture.tenants[0].identityId, fixture.identities[0].id);
  assert.equal(fixture.tenants[1].identityId, fixture.identities[1].id);
});

test('HBA contains exact TLS SCRAM pairs, deny-all and no public subnet', () => {
  const hba = renderHba('172.30.218.0/28', 'qa_bootstrap');
  assert.match(hba, /hostssl mecanet_tenant_a saas_tenant_a 172\.30\.218\.0\/28 scram-sha-256/);
  assert.match(hba, /host all all 0\.0\.0\.0\/0 reject/);
  assert.doesNotMatch(hba, /\btrust\b/);
  assert.throws(() => renderHba('0.0.0.0/0', 'qa_bootstrap'), /QA_PRIVATE_SUBNET_REQUIRED/);
});
