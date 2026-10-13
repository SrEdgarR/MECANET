import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../../server/saas/admission/clock.js';
import { CommitUncertainError } from '../../server/saas/admission/transaction.js';
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',oldOwner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
// Boundary fake tests clock scheduling/ack handling, not PostgreSQL isolation.
function fakeClockDb() {
  const state={generation,tick:'0',clock_version:'0',owner:oldOwner};let lostCommit=false,advances=0;
  const query=async(sql,args)=>{
    if(sql==='COMMIT'&&lostCommit){lostCommit=false;throw new Error('lost acknowledgement');}
    if(sql.startsWith('SELECT f.generation'))return{rows:[{...state,authority_tick:state.tick,authority_version:state.clock_version}]};
    if(sql.startsWith('SELECT generation')||sql.startsWith('SELECT owner'))return{rows:[{...state}]};
    if(sql.startsWith('UPDATE saas.admission_fence SET clock_version'))state.clock_version=args[0];
    if(sql.startsWith('UPDATE saas.time_authority SET owner')){state.owner=args[0];state.clock_version=args[1];}
    if(sql.startsWith('UPDATE saas.admission_fence SET tick')){state.tick=args[0];state.clock_version=args[1];advances++;}
    return{rows:[],rowCount:1};
  };
  return {pool:{query,async connect(){return{query,release(){}};}},state,lose(){lostCommit=true;},advances:()=>advances};
}
test('private clock waits from confirmed commit and never catches up elapsed ticks',async()=>{
  let now=0;const db=fakeClockDb();const clock=createClock({pool:db.pool,generation,owner,now:()=>now});
  await clock.acquire(oldOwner);now=99;assert.equal(await clock.advance(),false);
  now=10000;assert.equal(await clock.advance(),true);assert.equal(db.state.tick,'1');
  assert.equal(await clock.advance(),false);now=10100;assert.equal(await clock.advance(),true);assert.equal(db.state.tick,'2');
});
test('lost clock COMMIT cannot be repeated before a fresh reconciliation and delay',async()=>{
  let now=0;const db=fakeClockDb();const clock=createClock({pool:db.pool,generation,owner,now:()=>now});
  await clock.acquire(oldOwner);now=100;db.lose();await assert.rejects(clock.advance(),CommitUncertainError);
  now=1000;assert.equal(await clock.advance(),false);assert.equal(db.advances(),1);
  await clock.reconcile();assert.equal(await clock.advance(),false);now=1100;await clock.advance();assert.equal(db.state.tick,'2');
});
test('restart must acquire the expected owner and cannot steal via an expiry',async()=>{
  const db=fakeClockDb();const clock=createClock({pool:db.pool,generation,owner});
  await assert.rejects(clock.acquire(owner),{code:'CLOCK_OWNER_CONFLICT'});
  assert.equal(db.state.owner,oldOwner);
});
