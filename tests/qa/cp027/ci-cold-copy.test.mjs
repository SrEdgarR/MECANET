import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {validateCopyLocations,assertSourceFin,assertPortableRecovery} from '../../integration/ci-cold-copy.mjs';
const root=resolve('.qa-private/cp023-ci');
test('copy requires distinct exclusive source and target directories',()=>{
 assert.deepEqual(validateCopyLocations(root,resolve(root,'data'),resolve(root,'target/data')),{root,source:resolve(root,'data'),target:resolve(root,'target/data')});
 for(const [source,target]of [[resolve(root,'data'),resolve(root,'data')],[resolve(root,'elsewhere'),resolve(root,'target/data')],[resolve(root,'data'),resolve(root,'target/other')],[resolve('../foreign'),resolve(root,'target/data')]])assert.throws(()=>validateCopyLocations(root,source,target));
});
test('a PID absence or timeout never proves source closure',()=>{
 const p={schema:'cp027-ci-source-fin-v1',cid:'a'.repeat(64),owner:'11111111-1111-4111-8111-111111111111',sourceSha:'b'.repeat(40),exited:true,exitCode:0,pid:0,poolsEnded:true,api:[{instance:'api1',exitCode:0,drained:true},{instance:'api2',exitCode:0,drained:true}]};
 assert.equal(assertSourceFin(p),p);
 for(const patch of [{exitCode:null},{exited:false},{poolsEnded:false},{pid:22},{api:[p.api[0]]},{api:[p.api[0],{...p.api[1],drained:false}]},{cid:'label-found'}])assert.throws(()=>assertSourceFin({...p,...patch}));
});
test('portable report requires source FIN, copy verification, A open B closed and new continuity',()=>{
 const p={recovery:{status:'PASS'},sourceClosure:{status:'PASS'},copy:{status:'PASS',verifiedFiles:3,sourceAfterHash:'a'.repeat(64),targetHash:'a'.repeat(64)},sourceFin:{status:'PASS'},targetHttp:{status:'PASS'},continuation:{status:'PASS',historical:true,oldSessionInvalid:true,oldEpochRejected:true,companyBBlocked:true}};
 assert.equal(assertPortableRecovery(p),true);
 for(const key of ['recovery','sourceClosure','copy','sourceFin','targetHttp','continuation'])assert.throws(()=>assertPortableRecovery({...p,[key]:{status:'NOT VERIFIED'}}));
});
