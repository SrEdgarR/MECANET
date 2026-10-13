import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePreflight } from './infra/preflight.js';
const safe = () => ({ project:'mecanet-qa-p1l1', root:'/opt/mecanet-qa-p1l1', architecture:'aarch64', availableMiB:8400, freeBytes:130*1024**3, totalBytes:145*1024**3, cpuBusyPercent:15, portFree:true, subnetsFree:true, baseline:'3b387b38784907b67e2209a35c3d5f400d70742e', sharesOtherResources:false, memoryLimitMiB:1984, cpuLimit:1 });
test('permite solamente recursos exclusivos dentro del sobre',()=>assert.equal(validatePreflight(safe()).allowed,true));
test('aborta capacidad, destino, red, puerto o autoridad insuficientes antes de I/O',()=>{
  for(const change of [{project:'coolify'},{root:'/data/coolify'},{availableMiB:3000},{freeBytes:12*1024**3},{cpuBusyPercent:85},{portFree:false},{subnetsFree:false},{sharesOtherResources:true},{baseline:'HEAD'},{cpuLimit:1.1},{memoryLimitMiB:2049}]) assert.throws(()=>validatePreflight({...safe(),...change}));
});
