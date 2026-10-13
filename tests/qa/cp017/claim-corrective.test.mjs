// Pure guard and artifact-contract tests. These never claim actual PG PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CLAIM_CORRECTIVE_PLAN,claimSourceBodyHash,validateClaimCorrectiveProof,assertClaimCorrectionPreserved} from './claim-corrective.mjs';
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sourceCommit='a'.repeat(40),systemIdentifier='7511111111111111111',now=Date.parse('2026-10-13T21:00:00Z');
const qa={project:'mecanet-qa-p1l2-cp017',generation,systemIdentifier,fixture:{identities:[{email:'fixture@qa.invalid'}]}},adminConnection={host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password:'synthetic-only',ssl:{ca:'synthetic',servername:'postgres',rejectUnauthorized:true}};
const proof={project:qa.project,sourceSha:sourceCommit,generation,systemIdentifier,observedAt:'2026-10-13T20:59:55Z',apis:[1,2].map(n=>({instance:`api${n}`,state:'exited',containerId:String(n).repeat(64),stoppedSourceSha:'c'.repeat(40)}))};
const operational={project:qa.project,sourceSha:sourceCommit,generation,systemIdentifier,workerStopped:true,webStopped:true,apis:proof.apis.map((a,n)=>({...a,owner:`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n+1}`,httpClosed:true,sqlOwnerAbsent:true,writerApplicationName:`mecanet-writer:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n+1}`}))};
test('v5 correction requires matching stopped process proofs and own fixture, never merely age or closed flags',()=>{
 assert.equal(validateClaimCorrectiveProof({adminConnection,qa,proof,operational,sourceCommit,now}).user,'qa_bootstrap');
 for(const mutate of [v=>v.operational.workerStopped=false,v=>v.operational.webStopped=false,v=>v.operational.apis[0].containerId='f'.repeat(64),v=>v.operational.apis[0].stoppedSourceSha='b'.repeat(40),v=>v.operational.apis[1].containerId=v.operational.apis[0].containerId,v=>v.operational.apis[1].owner=v.operational.apis[0].owner,v=>v.qa.systemIdentifier='wrong']){const v=structuredClone({adminConnection,qa,proof,operational,sourceCommit,now});mutate(v);assert.throws(()=>validateClaimCorrectiveProof(v))}
});
test('registered v3 is preserved; corrective v5 replaces only the same claim signature and binds the original ticket before CAS',async()=>{
 const [oldSql,newSql]=await Promise.all(['003-control-writers.sql','005-control-claim-ticket.sql'].map(f=>readFile(new URL(`../../../server/saas/db/migrations/${f}`,import.meta.url),'utf8')));
 assert.notEqual(claimSourceBodyHash(oldSql),claimSourceBodyHash(newSql));assert.throws(()=>claimSourceBodyHash('CREATE TABLE unintended(x int);'));
 assert.equal((newSql.match(/CREATE OR REPLACE FUNCTION/g)??[]).length,1);assert(!/\b(?:ALTER|DROP|GRANT|REVOKE|CREATE TABLE|CREATE ROLE)\b/.test(newSql));
 assert.match(newSql,/claim_write_intent\(p_tenant uuid,p_operation uuid,p_sid text,p_generation uuid,p_owner uuid\)/);assert.match(newSql,/SECURITY DEFINER SET search_path=pg_catalog,saas/);
 assert.match(newSql,/SELECT \* INTO t FROM saas\.tickets WHERE id=i\.ticket_id FOR UPDATE/);
 for(const binding of ["t.tenant_id IS DISTINCT FROM p_tenant","t.generation IS DISTINCT FROM p_generation","i.generation IS DISTINCT FROM p_generation","t.owner IS DISTINCT FROM p_owner","t.state IS DISTINCT FROM 'ACTIVE'","t.work_started IS DISTINCT FROM true"])assert(newSql.includes(binding));
 assert(newSql.indexOf('THEN RETURN; END IF;',newSql.indexOf('SELECT * INTO t'))<newSql.indexOf("UPDATE saas.write_intents SET status='EXECUTING'"));
 assert.match(newSql,/WHERE tenant_id=p_tenant AND operation_id=p_operation AND status='PENDING'/);
});
function snapshot(){const value={};for(const db of ['mecanet_control','mecanet_tenant_a','mecanet_tenant_b'])value[db]={data:{rows:'1',hash:'d'.repeat(64)},security:'e'.repeat(64),otherFunctions:'f'.repeat(64),fence:[],quota:[],oldRegistry:[]};value.mecanet_control.claim={metadata:{owner:'123',acl:'preserved',prosecdef:true},bodyHash:'a'.repeat(64)};return value}
test('only the intended function body may change, never tenant data, counters, permissions, guards or owner',()=>{
 const before=snapshot(),after=structuredClone(before),targetBodyHash='b'.repeat(64);after.mecanet_control.claim.bodyHash=targetBodyHash;assert.equal(assertClaimCorrectionPreserved(before,after,{changed:true,targetBodyHash}),true);assert.equal(assertClaimCorrectionPreserved(before,structuredClone(before)),true);
 for(const mutate of [a=>a.mecanet_tenant_a.data.hash='wrong',a=>a.mecanet_tenant_b.quota=['reset'],a=>a.mecanet_control.security='wrong',a=>a.mecanet_control.otherFunctions='wrong',a=>a.mecanet_control.fence=['OPEN'],a=>a.mecanet_control.claim.metadata.owner='other',a=>a.mecanet_control.oldRegistry=['rewritten']]){const a=structuredClone(after);mutate(a);assert.throws(()=>assertClaimCorrectionPreserved(before,a,{changed:true,targetBodyHash}))}
});
test('corrective plan preregisters acknowledged rollback, actual apply and hash-stable rerun with no promotion',()=>{
 assert.equal(CLAIM_CORRECTIVE_PLAN.version,5);assert.deepEqual(CLAIM_CORRECTIVE_PLAN.phases,['fault-before-registry','apply','rerun']);assert.equal(CLAIM_CORRECTIVE_PLAN.allWritersClosed,true);assert.equal(CLAIM_CORRECTIVE_PLAN.zeroSaasClients,true);assert.equal(CLAIM_CORRECTIVE_PLAN.businessMutations,0);assert.equal(CLAIM_CORRECTIVE_PLAN.permissionChanges,0);assert.equal(CLAIM_CORRECTIVE_PLAN.opensResources,0);assert.equal(CLAIM_CORRECTIVE_PLAN.HTTP,false);
});
