// Pure browser admission guards. Does not import Playwright or start Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ciBrowserRequestAllowed,ciBrowserLaunchArgs,oldCiSessionCookie,assertCiBrowserTerminal,ciBrowserElfArchitecture} from '../../integration/ci-browser.mjs';
const base='https://app.mecanet.test:18443',A='11111111-1111-4111-8111-111111111111';
test('CI browser admits only its exact same-origin UI and existing L2 paths',()=>{
 for(const path of ['/login','/favicon.ico','/assets/saas-A_1.js',`/app/${A}/inventario`,`/api/tenants/${A}/inventory?limit=20`,`/api/tenants/${A}/operations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,`/api/tenants/${A}/products/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/stock-receipts`])assert.equal(ciBrowserRequestAllowed(base+path),true,path);
 for(const value of ['https://example.test/login','http://app.mecanet.test:18443/login','https://app.mecanet.test:18442/login','https://127.0.0.1:18443/login','file:///etc/passwd',base+'/docs/private',base+'/api/operator',base+'/api/payments'])assert.equal(ciBrowserRequestAllowed(value),false,value);
});
test('Chromium certificate exception is limited to the supplied SPKI and resolver is loopback',()=>{
 const pin='A'.repeat(43)+'=',args=ciBrowserLaunchArgs(pin);
 assert.ok(args.includes('--ignore-certificate-errors-spki-list='+pin));assert.ok(args.includes('--host-resolver-rules=MAP app.mecanet.test 127.0.0.1, EXCLUDE localhost'));assert.ok(args.includes('--no-proxy-server'));
 assert.equal(args.some(a=>a==='--ignore-certificate-errors'||a==='--no-sandbox'),false);assert.throws(()=>ciBrowserLaunchArgs('*'));assert.throws(()=>ciBrowserLaunchArgs(''));
});
test('old source cookie stays private, exact and host-only without a global TLS bypass',()=>{
 const cookie=oldCiSessionCookie('__Host-mecanet-session=s%3Asynthetic.signature');assert.equal(cookie.url,base);assert.equal(cookie.name,'__Host-mecanet-session');assert.equal(cookie.secure,true);assert.equal(cookie.httpOnly,true);assert.equal(cookie.domain,undefined);
 for(const bad of ['',null,'other=value','__Host-mecanet-session=','__Host-mecanet-session=x; __Host-mecanet-session=y'])assert.throws(()=>oldCiSessionCookie(bad));
});
test('terminal browser evidence rejects late events after acknowledged cleanup',()=>{
 const report={cleanup:'PASS acknowledged context/browser close',blockedExternal:0,pageErrors:0,consoleErrors:0,requestFailures:0};
 assert.doesNotThrow(()=>assertCiBrowserTerminal(report,{fatal:null,activeRequests:0,assetCount:3}));
 assert.throws(()=>assertCiBrowserTerminal(report,{fatal:'CI_BROWSER_SERVED_ASSET_CHANGED',activeRequests:0,assetCount:3}),/CI_BROWSER_SERVED_ASSET_CHANGED/);
 assert.throws(()=>assertCiBrowserTerminal({...report,requestFailures:1},{fatal:null,activeRequests:0,assetCount:3}));
 assert.throws(()=>assertCiBrowserTerminal(report,{fatal:null,activeRequests:1,assetCount:3}),/CI_BROWSER_REQUESTS_UNFINISHED/);
 assert.throws(()=>assertCiBrowserTerminal({...report,cleanup:'UNKNOWN'},{fatal:null,activeRequests:0,assetCount:3}));
});
test('browser executable must have a native little-endian AArch64 ELF header',()=>{
 const header=Buffer.alloc(20);header.set([0x7f,0x45,0x4c,0x46,2,1]);header.writeUInt16LE(183,18);
 assert.equal(ciBrowserElfArchitecture(header),'AArch64 ELF64 little-endian');
 const x64=Buffer.from(header);x64.writeUInt16LE(62,18);assert.throws(()=>ciBrowserElfArchitecture(x64),/CI_BROWSER_NATIVE_EXECUTABLE_REQUIRED/);
 assert.throws(()=>ciBrowserElfArchitecture(Buffer.alloc(20)));assert.throws(()=>ciBrowserElfArchitecture(header.subarray(0,19)));
});
