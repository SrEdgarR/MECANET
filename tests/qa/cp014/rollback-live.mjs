// Private probe, executable from stdin across compatible, immutable QA releases.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createQaClient,assertStatus} from '/workspace/tests/qa/cp014/http-client.mjs';
import {createPgPool} from '/workspace/server/saas/db/pools.js';
assert.equal(process.env.QA_PROJECT,'mecanet-qa-p1l1-cp014');
const stage=process.env.QA_ROLLBACK_STAGE;assert(['capture','upgrade','rollback','final'].includes(stage));
assert.match(process.env.QA_ARTIFACT??'',/^sha256:[a-f0-9]{64}$/);
const ca=await readFile('/run/qa-ca.crt');
const qa=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
const login=JSON.parse(await readFile('/run/qa-secrets/fixture-login.json','utf8'));
const pool=await createPgPool({...qa.connections.saas_api,max:1});
const caller=createQaClient({ca,instance:'api1',login:{email:'a@qa.invalid',password:login.password},budget:100});
const stateFile='/run/qa-faults/rollback-private.json';
try{
 for(const instance of ['api1','api2']){
  const client=createQaClient({ca,instance,budget:60});let ready;
  for(let n=0;n<30;n++){ready=await client.request('/api/health/ready');if(ready.status===200)break;await delay(100)}assertStatus(ready,200);
 }
 const generation=(await pool.query('SELECT generation FROM saas.admission_fence WHERE id=1')).rows[0].generation;
 if(stage==='capture')await caller.login();
 else{const state=JSON.parse(await readFile(stateFile,'utf8'));assert.equal(state.generation,generation);caller.setCookies(state.cookie);caller.csrf=state.csrf;}
 const session=await caller.request('/api/auth/session');assertStatus(session,200);assert.equal(session.json.authenticated,true);
 const catalog=await caller.request('/api/tenants/11111111-1111-4111-8111-111111111111/catalog?limit=20');assertStatus(catalog,200);assert.equal(catalog.json.items.length,2);
 const dataHash=createHash('sha256').update(JSON.stringify(catalog.json.items)).digest('hex');
 if(stage==='capture')await writeFile(stateFile,JSON.stringify({cookie:caller.cookieHeader(),csrf:caller.csrf,dataHash,generation}),{mode:0o600});
 else assert.equal(dataHash,JSON.parse(await readFile(stateFile,'utf8')).dataHash);
 const result={result:'PASS',stage,artifact:process.env.QA_ARTIFACT,time:new Date().toISOString(),sameSession:stage!=='capture',dataHash,generation,bothReady:true,postgresChanged:false};
 await writeFile(`/run/qa-results/rollback-${stage}.json`,JSON.stringify(result),{mode:0o600});console.log(JSON.stringify(result));
}finally{await pool.end();}
