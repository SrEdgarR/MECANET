import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalWrite} from '../../../server/saas/writes/validation.js';
import {canonicalSkuForOracle} from './integration-sku-oracle.mjs';
const args={tenantId:'11111111-1111-4111-8111-111111111111',actorId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',action:'catalog.create',dataEpoch:'2'};
test('SKU oracle counts the normalized stored row and two independent audited attempts, not the lowercase raw fixture',()=>{
 const rawSku='RACE-deadbeef',first=canonicalWrite({...args,input:{sku:rawSku,name:'Synthetic A'}}),second=canonicalWrite({...args,input:{sku:rawSku,name:'Synthetic B'}});
 const products=[{sku:'RACE-DEADBEEF'}],count=sku=>products.filter(p=>p.sku===sku).length;
 assert.equal(count(rawSku),0,'old raw-SKU oracle reproduces the false negative');
 assert.equal(count(canonicalSkuForOracle(first)),1);assert.equal(count(canonicalSkuForOracle(second)),1);assert.notEqual(first.requestHash,second.requestHash);
});
test('SKU oracle reuses approved trimming/ASCII case conversion without changing names or the two original request hashes',()=>{
 const input={sku:'  RaCe-a1b2c3d4  ',name:'Case-preserved 😀 e\u0301'},canonical=canonicalWrite({...args,input}),before=canonical.preimage,hash=canonical.requestHash;
 assert.equal(canonicalSkuForOracle(canonical),'RACE-A1B2C3D4');assert.equal(canonical.preimage,before);assert.equal(canonical.requestHash,hash);assert.equal(JSON.parse(before)[6][1],input.name);
});
test('receipt or malformed preimage cannot silently become the catalog counting oracle',()=>{
 const receipt=canonicalWrite({...args,action:'inventory.receive',productId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',input:{quantity:'1',reason:'Synthetic'}});
 assert.throws(()=>canonicalSkuForOracle(receipt),{message:'CATALOG_CANONICAL_ORACLE_REQUIRED'});assert.throws(()=>canonicalSkuForOracle({preimage:'not-json'}));
});
