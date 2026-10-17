import test from 'node:test';import assert from 'node:assert/strict';
import {ciUiRoute} from '../../integration/ci-browser-ui.mjs';
test('only final UI routes and the three exact assets can be served',()=>{
 const a=['/saas.html','/assets/saas-ABC.js','/assets/saas-ABC.css'];assert.equal(ciUiRoute('/login',a),'/saas.html');assert.equal(ciUiRoute('/app/11111111-1111-4111-8111-111111111111/inventario',a),'/saas.html');assert.equal(ciUiRoute(a[1],a),a[1]);
 for(const p of ['/api/tenants','/.env','/assets/not-pinned.js','/../server/secret','/%2e%2e/private'])assert.equal(ciUiRoute(p,a),null);
});
