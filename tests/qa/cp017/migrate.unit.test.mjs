import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWriterMigration } from './migrate.mjs';
// Deliberately synthetic placeholders; rejected before any connection or role.
const connection={host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password:'fiction-only-not-a-credential',ssl:{ca:'fiction-only-ca',rejectUnauthorized:true}};
const fixture={identities:[],tenants:[{dbName:'mecanet_tenant_a',purpose:'company'},{dbName:'mecanet_tenant_b',purpose:'company'}]};
const inputs={adminConnection:connection,fixture,generation:'11111111-1111-4111-8111-111111111111',connections:{},entries:{}};
test('writer migrator rejects nonprivate host/user/database before any DDL',async()=>{
 for(const override of [{host:'localhost'},{host:'193.122.135.72'},{user:'saas_api'},{database:'mecanet_control'}])await assert.rejects(applyWriterMigration({...inputs,adminConnection:{...connection,...override}}),/WRITER_MIGRATION_PREFLIGHT_REQUIRED/);
 assert.deepEqual(inputs.connections,{});
});
test('writer migrator requires the exact synthetic A/B cohort rather than arbitrary database labels',async()=>{
 for(const tenants of [[{dbName:'production',purpose:'company'}],[{dbName:'mecanet_tenant_a',purpose:'company'},{dbName:'foreign_business',purpose:'company'}]])await assert.rejects(applyWriterMigration({...inputs,fixture:{...fixture,tenants}}),/WRITER_SYNTHETIC_COHORT_REQUIRED/);
});
test('unknown fault modes, generation and provenance reject before a network operation',async()=>{
 for(const override of [{failAfter:'truncate'},{generation:'not-a-generation'},{sourceCommit:'not-a-sha'}])await assert.rejects(applyWriterMigration({...inputs,...override}),/WRITER_MIGRATION_PREFLIGHT_REQUIRED/);
});
