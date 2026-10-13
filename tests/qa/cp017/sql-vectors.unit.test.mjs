import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalWrite} from '../../../server/saas/writes/validation.js';
import {extensionDenialSql,sqlCreateVector} from './sql-vectors.mjs';
test('SQL replay vector uses the exact uppercase SKU and UTF8 bytes submitted through HTTP canonicalization',()=>{
 const meta={tenantId:'11111111-1111-4111-8111-111111111111',actorId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',operationId:'abcdef12-abcd-4abc-8abc-abcdefabcdef',dataEpoch:'2'},vector=sqlCreateVector(meta);
 const real=canonicalWrite({...meta,action:'catalog.create',input:vector.input});
 assert.equal(vector.input.sku,'PG-ABCDEF12');assert.equal(vector.preimage,real.preimage);assert.equal(createHash('sha256').update(vector.preimage,'utf8').digest('hex'),real.requestHash);
 assert.equal(JSON.parse(vector.preimage)[6][1],'Texto 😀 e\u0301 \u0001');
});
test('extension denial targets an existing schema instead of interpreting missing-schema failure as denied authority',()=>{
 assert.equal(extensionDenialSql,'CREATE EXTENSION dblink WITH SCHEMA catalog');
});
