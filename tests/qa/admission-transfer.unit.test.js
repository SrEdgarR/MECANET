import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClockTransfer } from '../../server/saas/admission/transfer.js';
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const state={generation,owner,tick:'0',clock_version:'0'};
const initial={kind:'first-start',previousOwner:owner,generation,confirmed:true,reference:'qa:first-preflight'};
test('first start requires untouched clock and exact trusted ownership attestation',()=>{
  assert.equal(validateClockTransfer(initial,state,generation).previousOwner,owner);
  assert.throws(()=>validateClockTransfer(initial,{...state,tick:'1'},generation));
  assert.throws(()=>validateClockTransfer({...initial,confirmed:false},state,generation));
  assert.throws(()=>validateClockTransfer({...initial,previousOwner:generation},state,generation));
});
test('restarting never substitutes lease timeout for previous process stop evidence',()=>{
  const transfer={...initial,kind:'stopped-process'};
  assert.throws(()=>validateClockTransfer(transfer,state,generation));
  assert.throws(()=>validateClockTransfer({...transfer,containerId:'a'.repeat(64),observedState:'running',stoppedAt:new Date().toISOString()},state,generation));
  const valid={...transfer,containerId:'a'.repeat(64),observedState:'exited',stoppedAt:new Date().toISOString()};
  assert.equal(validateClockTransfer(valid,state,generation).previousOwner,owner);
});
