import {CASE_LIMITS} from './budget-limits.mjs';
// Clock and restrictive maintenance only. No sessions, public routes or master.
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createPgPool,createTenantPoolManager,createSecretResolver} from '../../../server/saas/db/pools.js';
import {createClock} from '../../../server/saas/admission/clock.js';
import {validateClockTransfer} from '../../../server/saas/admission/transfer.js';
import {createRestrictiveCoordinator} from '../../../server/saas/writes/coordinator.js';
import {createRecoveryRuntime} from '../../../server/saas/recovery/runtime.js';
import {validateRecoveryBinding,validatePrivateConnection,validateEntries} from './entry.mjs';
import {readPrivateJson} from './prepare.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateWorkerConfig(config,project){
 if(!config||Object.keys(config).sort().join(',')!=='clockOwner,clockTransfer,connection,generation,maintenanceConnection,maintenanceEntries,recovery')throw Error('PRIVATE_WORKER_EXCESS_AUTHORITY');
 const recovery=validateRecoveryBinding(config,project),t=config.clockTransfer;if(!UUID.test(config.clockOwner??'')||[config.generation,recovery.runId].includes(config.clockOwner)||!t||!['recovery-initial','stopped-process'].includes(t.kind)||t.nextOwner!==config.clockOwner||t.generation!==config.generation||t.runId!==recovery.runId||t.manifestHash!==recovery.manifestHash||t.mode!==recovery.mode)throw Error('QA_CLOCK_OWNER_REQUIRED');
 validatePrivateConnection(config.connection,'saas_clock');validatePrivateConnection(config.maintenanceConnection,'saas_writer_maintenance');validateEntries(config.maintenanceEntries,'maintenance',recovery);return config;
}
export async function main(){
 const config=validateWorkerConfig((await readPrivateJson('/run/qa-secrets/worker.json')).value,process.env.QA_PROJECT);
 if(!['source-window','target-window'].includes(process.env.QA_SCENARIO))throw Error('QA_RUNTIME_SCENARIO_REQUIRED');
 const {newLedger,measuredPool}=await import('./ledger.mjs');const ledger=await newLedger('/run/qa-budget/ledger.json',{scenario:process.env.QA_SCENARIO,limits:{sql:CASE_LIMITS.sql,http:80}});
 const pool=async c=>measuredPool(await createPgPool({...c,max:1,connectionTimeoutMillis:2000,statement_timeout:500,lock_timeout:300}),ledger);
 const clockPool=await pool({...config.connection,application_name:'mecanet-cp019-clock'}),controlPool=await pool({...config.maintenanceConnection,application_name:'mecanet-cp019-maintenance'});
 const recovery=createRecoveryRuntime({controlPool,generation:config.generation,expectedRunId:config.recovery.runId,manifestHash:config.recovery.manifestHash,mode:config.recovery.mode});
 let clock;try{
  const previous=(await clockPool.query('SELECT owner,generation,tick,clock_version FROM saas.time_authority WHERE id=1')).rows[0];
  const transfer=validateClockTransfer(config.clockTransfer,previous,config.generation,recovery.binding);clock=createClock({pool:clockPool,generation:config.generation,owner:config.clockOwner,recoveryTransfer:transfer});
  try{await clock.acquire(transfer.previousOwner)}catch(error){if(error.code==='COMMIT_UNCERTAIN')await clock.reconcile();else throw error}
 }catch(error){clock?.stop();await Promise.all([clockPool.end(),controlPool.end()]);throw error}
 const maintenancePools=createTenantPoolManager({resolveSecret:createSecretResolver({entries:config.maintenanceEntries,access:'maintenance'}),access:'write',allowedSchemaVersions:[2,3],maxPools:2,maxPerPool:1,recovery,recoveryAccess:'maintenance',createPool:pool});
 const coordinator=createRestrictiveCoordinator({controlPool,maintenancePools,generation:config.generation,recovery,resolveDescriptor:async guard=>{const entry=Object.values(config.maintenanceEntries).find(e=>e.tenantId===guard.tenant_id);if(!entry||String(entry.dataEpoch)!==String(guard.data_epoch))throw Error('MAINTENANCE_DESCRIPTOR_MISMATCH');return entry}});
 let stopped=false,work=null,last=-Infinity,fatal;process.on('SIGTERM',()=>{stopped=true});process.on('SIGINT',()=>{stopped=true});console.log('MECANET_CP019_PRIVATE_WORKER_STARTED');
 try{while(!stopped){await delay(25);try{await clock.advance()}catch(error){if(error.code==='COMMIT_UNCERTAIN')await clock.reconcile();else if(!['ADMISSION_BUSY','40001','40P01'].includes(error.code))throw error}if(!work&&performance.now()-last>=200){last=performance.now();work=coordinator.runOnce().catch(error=>{fatal=error;stopped=true}).finally(()=>{work=null})}}if(fatal)throw fatal}
 finally{clock.stop();if(work)await work;await maintenancePools.close();await Promise.all([clockPool.end(),controlPool.end()])}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({type:'cp019-worker-failed',code:['40001','40P01','COMMIT_UNCERTAIN','CLOCK_OWNER_CONFLICT'].includes(error.code)?error.code:'PRIVATE_WORKER_UNAVAILABLE'}));process.exitCode=1});
