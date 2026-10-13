import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { applyWriterMigration } from './migrate.mjs';
import {sanitizeTapDiagnostics,sanitizeSqlFailure} from './sql-live.mjs';
import {validateCorrectiveProof} from './corrective.mjs';
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
test('real SQL diagnostics expose only a fixed test, HTTP error, SQLSTATE and code location',()=>{
 const raw="not ok 2 - SQL validates the same exact canonical UTF8 digest and derives the effect from it\n  code: 'ERR_ASSERTION'\n  error: 'Expected HTTP 201, received 503/WRITE_UNCERTAIN'\n  stack: 'at file:///app/tests/qa/cp017/sql-writers.test.mjs:62:7'\n  detail: 'fictional private payload'\n  query: 'SELECT private_body'\n";
 assert.deepEqual(sanitizeTapDiagnostics(raw),[{test:'SQL validates the same exact canonical UTF8 digest and derives the effect from it',codes:['ERR_ASSERTION'],http:{expected:201,received:503,publicCode:'WRITE_UNCERTAIN'},locations:[{file:'sql-writers.test.mjs',line:62,column:7}],fixedMessages:['WRITE_UNCERTAIN']}]);
});
test('real SQL diagnostics suppress arbitrary error values, paths and test text',()=>{
 const raw="not ok 9 - fictional private payload\n  code: 'FICTIONALSECRET'\n  error: 'Expected HTTP 201, received 503/FICTIONALSECRET'\n  stack: 'at /home/private-account/credentials.js:1:2'\n";
 assert.deepEqual(sanitizeTapDiagnostics(raw),[{test:'UNIDENTIFIED_TEST',http:{expected:201,received:503,publicCode:'UNKNOWN_PUBLIC_CODE'}}]);
});
test('outer real SQL failures never print PostgreSQL detail, where, query, message or private JSON',()=>{
 assert.deepEqual(sanitizeSqlFailure({code:'42501',position:'148',message:'fictional confidential text',detail:'fictional credentials',where:'private query',query:'SELECT private_body',stack:'private path'}),{errorCode:'42501',sqlPosition:'148'});
 assert.deepEqual(sanitizeSqlFailure({message:'fictional confidential JSON',code:'ARBITRARYSECRET',position:'private'}),{errorCode:'QA_SQL_FAILED'});
});
test('corrective v4 changes only the SKU variable and retains the approved fixed writer contract',async()=>{
 const source=await readFile(new URL('../../../server/saas/db/migrations/003-tenant-writers.sql',import.meta.url),'utf8');
 const corrective=await readFile(new URL('../../../server/saas/db/migrations/004-tenant-writers-fix.sql',import.meta.url),'utf8');
 const begin=source.indexOf('CREATE FUNCTION inventory.apply_write('),end=source.indexOf('CREATE FUNCTION inventory.create_product(',begin);
 const expected=source.slice(begin,end).replace('CREATE FUNCTION inventory.apply_write(','CREATE OR REPLACE FUNCTION inventory.apply_write(')
  .replace('product uuid; sku text; pname text;','product uuid; v_sku text; pname text;').replace('sku:=doc->6->>0;pname','v_sku:=doc->6->>0;pname')
  .replace('IF sku !~','IF v_sku !~').replace('VALUES(product,sku,pname','VALUES(product,v_sku,pname');
 assert.equal(corrective.slice(corrective.indexOf('CREATE OR REPLACE FUNCTION')),expected);
 assert.equal((corrective.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.match(corrective,/ON CONFLICT\(sku\) DO NOTHING/);
 assert.doesNotMatch(corrective,/DECLARE[^]*product uuid; sku text;/);
});
test('corrective preflight rejects live APIs, stale host proof and another cluster before connection',()=>{
 const sourceCommit='1'.repeat(40),now=Date.parse('2026-10-13T19:20:00Z');
 const qa={generation:inputs.generation,systemIdentifier:'1234567890123456789',fixture:{identities:[{email:'a@qa.invalid'}]}};
 const proof={project:'mecanet-qa-p1l2-cp017',sourceSha:sourceCommit,systemIdentifier:qa.systemIdentifier,generation:qa.generation,observedAt:new Date(now).toISOString(),apis:[{instance:'api1',state:'exited',containerId:'a'.repeat(64)},{instance:'api2',state:'exited',containerId:'b'.repeat(64)}]};
 const request={adminConnection:connection,qa,proof,sourceCommit,now};
 assert.equal(validateCorrectiveProof(request).host,'postgres');
 for(const change of [{apis:proof.apis.map((p,i)=>i===0?{...p,state:'running'}:p)},{systemIdentifier:'0000000000000000000'},{sourceSha:'2'.repeat(40)}])assert.throws(()=>validateCorrectiveProof({...request,proof:{...proof,...change}}),/CORRECTIVE_API_STOP_PROOF_REQUIRED/);
 assert.throws(()=>validateCorrectiveProof({...request,proof:{...proof,observedAt:new Date(now-300001).toISOString()}}),/CORRECTIVE_RECENT_PROOF_REQUIRED/);
});
