// One private bounded process: clock and restrictive writer maintenance.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createPgPool,createTenantPoolManager,createSecretResolver} from '../../../server/saas/db/pools.js';
import {createClock} from '../../../server/saas/admission/clock.js';
import {validateClockTransfer} from '../../../server/saas/admission/transfer.js';
import {createRestrictiveCoordinator} from '../../../server/saas/writes/coordinator.js';
import {createQaFaults} from './faults.mjs';
if(process.env.QA_PROJECT!=='mecanet-qa-p1l2-cp017')throw Error('CP017_TARGET_REQUIRED');
const config=JSON.parse(await readFile('/run/qa-secrets/worker.json','utf8'));
if(config.sessionSecret||config.issuer||config.writerEntries||config.entries||config.adminConnection)throw Error('PRIVATE_WORKER_EXCESS_AUTHORITY');
const clockPool=await createPgPool({...config.connection,max:1,connectionTimeoutMillis:2000,statement_timeout:500,lock_timeout:300,application_name:'mecanet-cp017-clock'});
const controlPool=await createPgPool({...config.maintenanceConnection,max:1,connectionTimeoutMillis:2000,statement_timeout:500,lock_timeout:300,application_name:'mecanet-cp017-maintenance'});
await Promise.all([clockPool,controlPool].map(p=>p.query('SELECT 1')));
const previous=(await clockPool.query('SELECT owner,generation,tick,clock_version FROM saas.time_authority WHERE id=1')).rows[0];
const transfer=validateClockTransfer(config.clockTransfer,previous,config.generation),clock=createClock({pool:clockPool,generation:config.generation});await clock.acquire(transfer.previousOwner);
const maintenancePools=createTenantPoolManager({resolveSecret:createSecretResolver({entries:config.maintenanceEntries,access:'maintenance'}),access:'write',allowedSchemaVersions:[2],maxPools:2,maxPerPool:1});
const coordinator=createRestrictiveCoordinator({controlPool,maintenancePools,generation:config.generation,checkpoint:createQaFaults({instance:'worker',owner:clock.owner}),resolveDescriptor:async guard=>{
 const entry=Object.values(config.maintenanceEntries).find(e=>e.tenantId===guard.tenant_id);if(!entry||String(entry.dataEpoch)!==String(guard.data_epoch))throw Error('MAINTENANCE_DESCRIPTOR_MISMATCH');return entry;
}});
let stopped=false,work=null,last=-Infinity;process.on('SIGTERM',()=>{stopped=true});process.on('SIGINT',()=>{stopped=true});
console.log('MECANET_CP017_PRIVATE_WORKER_STARTED');
try{while(!stopped){await delay(25);try{await clock.advance()}catch(error){if(error.code==='COMMIT_UNCERTAIN')await clock.reconcile();else if(!['ADMISSION_BUSY','40001','40P01'].includes(error.code))throw error}if(!work&&performance.now()-last>=200){last=performance.now();work=coordinator.runOnce().finally(()=>{work=null})}}}
catch(error){console.error(JSON.stringify({type:'qa-private-worker-failure',code:['40001','40P01','COMMIT_UNCERTAIN','CLOCK_OWNER_CONFLICT'].includes(error.code)?error.code:'PRIVATE_WORKER_UNAVAILABLE'}));process.exitCode=1}
finally{clock.stop();if(work)await work;await maintenancePools.close();await Promise.all([clockPool.end(),controlPool.end()])}
