import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
test('writer migration revokes only its declared functions and preserves the foreign L1 measurement owner',async()=>{
 const sql=await readFile(new URL('../../../server/saas/db/migrations/003-control-writers.sql',import.meta.url),'utf8');
 assert.equal(/REVOKE\s+ALL\s+ON\s+ALL\s+FUNCTIONS/i.test(sql),false,'No schema-wide revocation may touch an independent L1 owner');
 const declared=[...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (saas\.[a-z_]+)\(([^)]*)\)/g)].map(([,name,args])=>`${name}(${args.split(',').filter(Boolean).map(a=>a.trim().split(/\s+/).at(-1)).join(',')})`);
 const revoked=[...sql.matchAll(/REVOKE ALL ON FUNCTION ([\s\S]*?) FROM PUBLIC;/g)].flatMap(([,body])=>[...body.matchAll(/saas\.[a-z_]+\([^)]*\)/g)].map(([signature])=>signature.replace(/\s/g,'')));
 assert.deepEqual([...new Set(revoked)].sort(),declared.sort());
 assert(!revoked.some(signature=>signature.startsWith('saas.measure_database_sizes(')));
});
