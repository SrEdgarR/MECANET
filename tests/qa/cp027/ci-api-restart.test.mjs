import test from 'node:test';
import assert from 'node:assert/strict';
import {assertApiRestart} from '../../integration/ci-cold-copy.mjs';
const previous=[{instance:'api1',pid:101},{instance:'api2',pid:102}],next=[{instance:'api1',pid:201},{instance:'api2',pid:202}];
const fin=previous.map(x=>({...x,exitCode:0,events:[{type:'development-api-stopped',pid:x.pid,drained:true,budget:{pools:0,leased:0}}]}));
test('restart requires two positively ended old API and two distinct new process identities',()=>{
 assert.equal(assertApiRestart(fin,previous,next),true);
 for(const [ended,old,fresh]of [[fin.slice(0,1),previous,next],[fin.map(x=>({...x,exitCode:1})),previous,next],[fin,previous,previous],[fin,previous,[next[0],{...next[1],pid:next[0].pid}]],[fin,previous,[next[0]]]])assert.throws(()=>assertApiRestart(ended,old,fresh));
});
