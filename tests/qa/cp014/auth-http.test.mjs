// PRIVATE synthetic QA only. TWO actual HTTP API processes + standard PG store.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {createPgPool} from '../../../server/saas/db/pools.js';
import {createQaClient,assertStatus} from './http-client.mjs';
import {arm,waitEvent,release} from './faults.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const mode=process.env.QA_AUTH_MODE??'boundaries';
assert(['boundaries','faults','faults-accounting','lost','restart'].includes(mode));
const purposeCookie=p=>`__Host-mecanet-${p==='company'?'session':p}`;
function sidFromCookie(cookie){const value=cookie.split('; ').find(v=>v.startsWith('__Host-mecanet-session='))?.split('=').slice(1).join('=');const decoded=decodeURIComponent(value??'');assert(/^s:[A-Za-z0-9_-]{43}\.[A-Za-z0-9+/]{43}$/.test(decoded),'A private signed SID must have the standard shape');return decoded.slice(2).split('.')[0]}
async function probeCounts(){return Promise.all(['api1','api2'].map(async instance=>{try{return JSON.parse(await readFile(`/run/qa-faults/${instance}/pool-probes.json`,'utf8'))}catch(e){if(e.code==='ENOENT')return {instance,attempts:0,counts:{}};throw e}}))}
const replayFile='/run/qa-faults/auth-private-replay.json';
test(`CP014 ${mode}: real two-process authentication and purpose boundaries`,{timeout:150000},async t=>{
 const config=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
 const fixture=JSON.parse(await readFile('/run/qa-secrets/fixture-login.json','utf8'));
 const ca=await readFile('/run/qa-ca.crt');assert(config.fixture?.identities?.every(i=>i.email.endsWith('@qa.invalid')));
 const identities=fixture.identities;
 const clientFor=(email,instance='api1',purpose=identities.find(i=>i.email===email)?.purpose??'company')=>createQaClient({instance,purpose,ca,login:{email,password:fixture.password}});
 async function loginBounded(client){
  for(let attempt=0;attempt<3;attempt++){
   try{return await client.login()}catch(error){
    if(attempt===2||error.code!=='ERR_ASSERTION'||error.actual!==503||error.expected!==200||!error.message.includes('503/SERVICE_UNAVAILABLE'))throw error;
    t.diagnostic(`Bounded functional bootstrap retry ${attempt+1}: HTTP 503/SERVICE_UNAVAILABLE; no quota or deadline change`);await sleep(350);
   }
  }
 }
 const registry=await createPgPool({...config.connections.saas_revoker,max:1,connectionTimeoutMillis:2000,statement_timeout:500,application_name:'mecanet-cp014-auth-inspection'});
 const sessions=await createPgPool({...config.connections.saas_session,max:1,connectionTimeoutMillis:2000,statement_timeout:500,application_name:'mecanet-cp014-auth-store-fixture'});
 const sidState=async sid=>(await registry.query('SELECT status,purpose FROM saas.session_registry WHERE sid=$1',[sid])).rows[0];
 const denyReplay=async(cookie)=>{for(const instance of ['api1','api2'])assertStatus(await clientFor('a@qa.invalid',instance).request(`/api/tenants/${A}/catalog?limit=20`,{cookieOverride:cookie}),401)};
 async function remember(cookie){let previous=[];try{previous=JSON.parse(await readFile(replayFile,'utf8')).cookies}catch(e){if(e.code!=='ENOENT')throw e}previous.push(cookie);await writeFile(replayFile,JSON.stringify({cookies:previous}),{mode:0o600});}
 try{
  if(mode==='restart'){
   await t.test('Every revoked cookie remains denied by both restarted API processes',async()=>{const replay=JSON.parse(await readFile(replayFile,'utf8'));assert(replay.cookies.length>=4);for(const cookie of replay.cookies){assert.equal((await sidState(sidFromCookie(cookie)))?.status,'revoked');await denyReplay(cookie)}});
   return;
  }
  const company=clientFor('a@qa.invalid');await loginBounded(company);
  if(mode==='boundaries'){
   const others=[clientFor('b@qa.invalid','api2'),clientFor('demo@qa.invalid','api1'),clientFor('operator@qa.invalid','api2')];
   const issued=[];for(const client of others)issued.push(await loginBounded(client));
   for(const reply of issued)for(const value of reply.headers['set-cookie']??[]){assert(/; Path=\//.test(value),'Cookie path must be host root');assert(/; HttpOnly/.test(value),'Cookie must be HttpOnly');assert(/; Secure/.test(value),'Cookie must be Secure');assert(/; SameSite=Lax/.test(value),'Cookie must be SameSite=Lax');assert(!/; Domain=/i.test(value),'Cookie must be host-only')}
   await t.test('Company/demo/operator use real signed host-only Secure HttpOnly cookies and standard stores',async()=>{
    for(const [client,purpose]of [[company,'company'],[others[0],'company'],[others[1],'demo'],[others[2],'operator']]){
     const reply=await client.request('/api/auth/session');assertStatus(reply,200);assert.equal(reply.json.authenticated,true);assert.equal(reply.json.purpose,purpose);assert(client.cookieHeader().startsWith(`${purposeCookie(purpose)}=`));
    }
   });
   await t.test('Valid identities cannot cross company/demo/operator boundaries; denial precedes every tenant-pool acquisition',async()=>{
    const before=await probeCounts();
    const forbidden=[[company,B],[others[0],A],[others[1],A],[others[1],B],[others[2],A],[others[2],B]];
    for(const [client,target]of forbidden){const reply=await client.request(`/api/tenants/${target}/catalog?limit=20`);assertStatus(reply,403);assert.deepEqual(Object.keys(reply.json),['error']);assert.equal(reply.json.error,'ACCESS_DENIED')}
    for(const client of others.slice(1))assertStatus(await client.request('/api/tenants'),403);
    assert.deepEqual(await probeCounts(),before,'No forbidden request reaches the tenant-pool boundary');
   });
   await t.test('Forged paths, headers, bodies and query overrides cannot expose another company',async()=>{
    const before=await probeCounts();
    for(const path of [`/api/tenants/${B}/catalog`,`/api/tenants/not-a-uuid/catalog`,`/api/tenants/${A}/catalog?tenantId=${B}`,`/api/tenants/${A}/catalog?database=mecanet_tenant_b`,`/api/tenants/${A}/catalog?role=operator`]){
     const reply=await company.request(path,{headers:{'X-Tenant-Id':B,'X-User-Role':'operator','X-Database':'mecanet_tenant_b'},body:{tenantId:B,purpose:'operator',role:'owner'}});assertStatus(reply,path.includes(B)&&!path.includes('?')?403:400);assert(!reply.text.includes('Empresa ficticia B'));
    }
    assertStatus(await company.request(`/api/tenants/${A}/catalog`,{cookieOverride:`${company.cookieHeader()}; ${others[2].cookieHeader()}`}),400);
    assert.deepEqual(await probeCounts(),before);
    await sleep(1400);
    const reply=await company.request(`/api/tenants/${A}/catalog?limit=20`,{headers:{'X-Tenant-Id':B,'X-User-Role':'operator'},body:{tenantId:B,role:'operator'}});assertStatus(reply,200);assert.equal(reply.json.tenantId,A);assert(reply.json.items.every(i=>!i.name.includes('Empresa ficticia B')));
    await sleep(1400);const b=await others[0].request(`/api/tenants/${B}/catalog?limit=20`);assertStatus(b,200);assert(b.json.items.every(i=>!i.name.includes('Empresa ficticia A')));
   });
   await t.test('Logout COMMIT on API2 survives a deliberately delayed standard-store save from API1',async()=>{
    const cookie=company.cookieHeader(),sid=sidFromCookie(cookie);
    const original=(await sessions.query('SELECT sess FROM session_store.company_sessions WHERE sid=$1',[sid])).rows[0].sess;
    const missing={...original};delete missing.csrfToken;
    await sessions.query('UPDATE session_store.company_sessions SET sess=$2 WHERE sid=$1',[sid,missing]);
    const gate=await arm({instance:'api1',stage:'session.before-set'});
    const late=company.request('/api/auth/session');late.catch(()=>{});
    try{
     await waitEvent(gate);await sessions.query('UPDATE session_store.company_sessions SET sess=$2 WHERE sid=$1',[sid,original]);
     const logout=clientFor('a@qa.invalid','api2');logout.setCookies(cookie);logout.csrf=original.csrfToken;
     const revokeGate=await arm({instance:'api2',stage:'authority.after-revoke'});const pendingLogout=logout.request('/api/auth/logout',{method:'POST',body:{}});pendingLogout.catch(()=>{});
     try{await waitEvent(revokeGate);assert.equal((await sidState(sid)).status,'revoked');await denyReplay(cookie);await release(revokeGate);assertStatus(await pendingLogout,200)}finally{await release(revokeGate)}
     assert.equal((await sidState(sid)).status,'revoked','The logout acknowledgement follows authoritative COMMIT');
     await release(gate);const lateReply=await late;assertStatus(lateReply,200);assert.equal(lateReply.json.authenticated,false);
     assert.equal((await sessions.query('SELECT count(*)::int n FROM session_store.company_sessions WHERE sid=$1',[sid])).rows[0].n,1,'Late standard upsert physically recreated JSON');
     assert.equal((await sidState(sid)).status,'revoked');await denyReplay(cookie);await remember(cookie);
    }finally{await release(gate)}
   });
   await t.test('Concurrent rotations through both API processes reject the old SID after each confirmed response',async()=>{
    const first=clientFor('a@qa.invalid','api1');await loginBounded(first);const old=first.cookieHeader(),oldCsrf=first.csrf;
    const second=clientFor('a@qa.invalid','api2');second.setCookies(old);second.csrf=oldCsrf;
    const gate=await arm({instance:'api2',stage:'session.after-get'});
    const secondLogin=second.request('/api/auth/login',{method:'POST',body:{email:'a@qa.invalid',password:fixture.password}});secondLogin.catch(()=>{});
    try{
     await waitEvent(gate);const response=await first.request('/api/auth/login',{method:'POST',body:{email:'a@qa.invalid',password:fixture.password}});assertStatus(response,200);await denyReplay(old);
     await release(gate);assertStatus(await secondLogin,200);assert(first.cookieHeader()!==second.cookieHeader(),'Concurrent rotations must issue distinct private cookies');assert(first.cookieHeader()!==old,'First rotation must replace its old cookie');assert(second.cookieHeader()!==old,'Second rotation must replace its old cookie');
     for(const client of [first,second]){const valid=await client.request('/api/auth/session');assertStatus(valid,200);assert.equal(valid.json.authenticated,true)}
     assert.equal((await sidState(sidFromCookie(old))).status,'revoked');await denyReplay(old);await remember(old);
    }finally{await release(gate)}
   });
  }
  if(mode==='faults'||mode==='faults-accounting'){
   const prepared=[company];if(mode==='faults'){prepared.push(clientFor('a@qa.invalid'));await loginBounded(prepared[1])}
   const stages=mode==='faults'?['issuer.after-commit','session.after-set']:['admission.bytes'];
   for(const [index,stage]of stages.entries())await t.test(`Failure at ${stage} emits no authenticated cookie and cannot resurrect the replaced SID`,async()=>{
    // Use the standard cookie obtained before any fault; login rotation is real.
    const selected=prepared[index],cookie=selected.cookieHeader();assert(cookie);const gate=await arm({instance:'api1',stage,action:'reject'});
    try{
     const reply=await selected.request('/api/auth/login',{method:'POST',body:{email:'a@qa.invalid',password:fixture.password}});assertStatus(reply,503);await waitEvent(gate);
     for(const value of reply.headers['set-cookie']??[])assert(/^__Host-mecanet-session=;/.test(value),'503 must not grant a new authenticated cookie');
     assert.equal((await sidState(sidFromCookie(cookie))).status,'revoked');await denyReplay(cookie);await remember(cookie);
    }finally{await release(gate)}
    // Both uncertain auth tickets remain durable until a stopped runner and
    // settled SQL/response are positively proved by the separate controller.
   });
  }
  if(mode==='lost')await t.test('Response lost after authoritative rotation COMMIT cannot return authority to its old cookie',async()=>{
   const cookie=company.cookieHeader(),gate=await arm({instance:'api1',stage:'issuer.after-commit'}),abort=new AbortController();
   const pending=company.request('/api/auth/login',{method:'POST',body:{email:'a@qa.invalid',password:fixture.password},signal:abort.signal});pending.catch(()=>{});
   try{await Promise.race([waitEvent(gate),pending.then(reply=>{throw new Error(`QA_LOGIN_ENDED_BEFORE_CHECKPOINT:${reply.status}:${reply.json?.error??'NO_PUBLIC_CODE'}`)})]);assert.equal((await sidState(sidFromCookie(cookie))).status,'revoked');abort.abort();await assert.rejects(pending,e=>e.code==='ABORT_ERR');await release(gate);await sleep(300);await denyReplay(cookie);await remember(cookie)}finally{await release(gate)}
  });
 }finally{await Promise.all([registry.end(),sessions.end()])}
});
