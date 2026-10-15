// Boundary tests only: no PostgreSQL, credentials or physical recovery claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDefinition,validatePreflight,validateRolePasswords,QA_LOGIN_LIMITS} from './fixture.mjs';
import {CORRECTIVE_MIGRATIONS} from './migrate.mjs';
const project='mecanet-qa-p1l3-r03';
const preflight={project,dataClass:'synthetic',allowBootstrap:true,expectedHost:'postgres',expectedSystemIdentifier:'1234567890123456789'};
const passwords=()=>Object.fromEntries([...Object.keys(QA_LOGIN_LIMITS),'qa_bootstrap'].map((r,i)=>[r,String.fromCharCode(65+i).repeat(43)]));
test('the source is fresh and A has no legacy products before four real writer operations',()=>{
 const f=fixtureDefinition();assert.equal(f.tenants.length,3);assert.equal(f.tenants[0].products.length,0);assert.equal(f.tenants[1].products.length,2);assert.equal(f.tenants[2].purpose,'demo');
 assert.equal(Object.keys(QA_LOGIN_LIMITS).length,17);assert.equal(Object.values(QA_LOGIN_LIMITS).reduce((a,b)=>a+b,0),46);
});
test('only the own fresh source may be prepared; a target or previous QA is rejected',()=>{
 assert.equal(validatePreflight(preflight),preflight);
 for(const patch of [{project:'mecanet-qa-p1l2-cp017'},{project:project+'-target'},{allowBootstrap:false},{dataClass:'real'},{expectedHost:'193.122.135.72'},{expectedSystemIdentifier:'unknown'}])assert.throws(()=>validatePreflight({...preflight,...patch}),/QA_PREFLIGHT_REQUIRED/);
});
test('the complete stable role bundle is mandatory before any DDL; no generation inside retries',()=>{
 const p=passwords();assert.equal(validateRolePasswords(p),p);assert.deepEqual(validateRolePasswords(structuredClone(p)),p);
 for(const change of [p=>delete p.saas_writer_b,p=>p.extra='x'.repeat(43),p=>p.saas_api=p.saas_session,p=>p.qa_bootstrap='short']){const q=structuredClone(p);change(q);assert.throws(()=>validateRolePasswords(q),/QA_CUSTODIED_ROLES_REQUIRED/)}
});
test('fresh L3 explicitly retains the already canonical SKU and ticket correctives before006',()=>{
 assert.deepEqual(CORRECTIVE_MIGRATIONS.map(x=>[x.database,x.version,x.file]),[['mecanet_tenant_a',4,'004-tenant-writers-fix.sql'],['mecanet_tenant_b',4,'004-tenant-writers-fix.sql'],['mecanet_control',5,'005-control-claim-ticket.sql']]);
 assert.ok(Object.isFrozen(CORRECTIVE_MIGRATIONS));
});
