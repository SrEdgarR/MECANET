// One scoped forward migration of this synthetic cluster; never used by runtime.
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createPgPool} from '../../../server/saas/db/pools.js';
const ca=await readFile('/run/qa-ca.crt','utf8');
const password=await readFile('/run/qa-secrets/bootstrap','utf8');
const db=await createPgPool({host:'postgres',port:5432,database:'mecanet_control',user:'qa_bootstrap',password,ssl:{ca,servername:'postgres',rejectUnauthorized:true},max:1});
const config=JSON.parse(await readFile('/run/qa-secrets/connections.json','utf8'));
const {rows}=await db.query('SELECT system_identifier::text FROM pg_control_system()');
if(rows[0].system_identifier!==config.systemIdentifier)throw new Error('WRONG_QA_CLUSTER');
const rolePassword=randomBytes(32).toString('base64url');
const client=await db.connect();
try{
 await client.query('BEGIN');
 await client.query("SELECT set_config('qa.role_password',$1,true)",[rolePassword]);
 await client.query("DO $$ BEGIN EXECUTE format('CREATE ROLE saas_reconciler LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1 PASSWORD %L',current_setting('qa.role_password')); END $$");
 await client.query('GRANT CONNECT ON DATABASE mecanet_control TO saas_reconciler');
 await client.query('ALTER ROLE saas_issuer CONNECTION LIMIT 2');
 await client.query('SET ROLE saas_owner');
 await client.query(await readFile('server/saas/admission/maintenance.sql','utf8'));
 await client.query('COMMIT');
 config.connections.saas_reconciler={...config.connections.saas_clock,user:'saas_reconciler',password:rolePassword};
 await writeFile('/run/qa-secrets/connections.json',JSON.stringify(config),{mode:0o600});
 console.log('QA_MAINTENANCE_MIGRATION_APPLIED');
}catch(e){await client.query('ROLLBACK');throw e}finally{client.release();await db.end()}
