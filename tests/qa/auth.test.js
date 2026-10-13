import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLogin, validateOrigin, parseCatalogQuery } from '../../server/saas/auth/validation.js';
test('login acotado no acepta objetos, claves extra ni correo no válido',()=>{
 assert.equal(validateLogin({email:'A@fixture.invalid',password:'1234567890123456'}).email,'a@fixture.invalid');
 for(const body of [{email:{$gt:''},password:'x'},{email:'a@fixture.invalid',password:'x',paid:true},{email:'x',password:'x'},{email:'a@fixture.invalid',password:'x'.repeat(513)}]) assert.throws(()=>validateLogin(body));
});
test('origen/host exacto y Referer solo alternativa verificable',()=>{
 const origin='https://app.mecanet.test:18443';
 assert.equal(validateOrigin({host:'app.mecanet.test:18443',origin},origin),true);
 assert.equal(validateOrigin({host:'app.mecanet.test:18443',referer:origin+'/login'},origin),true);
 for(const headers of [{host:'evil.invalid',origin},{host:'app.mecanet.test:18443',origin:'null'},{host:'app.mecanet.test:18443',origin:'https://evil.invalid',referer:origin},{host:'app.mecanet.test:18443'}]) assert.throws(()=>validateOrigin(headers,origin));
});
test('consulta solo acepta cursor UUID y límite entero acotado',()=>{
 assert.deepEqual(parseCatalogQuery({limit:'2'}),{limit:2,cursor:null});
 for(const query of [{limit:'101'},{limit:'0'},{cursor:"';DROP TABLE products;--"},{filter:'name'},{limit:['2','3']}]) assert.throws(()=>parseCatalogQuery(query));
});
