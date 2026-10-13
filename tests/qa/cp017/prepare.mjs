// Exclusive fresh synthetic cohort. Never loads .env or production credentials.
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import bcrypt from '../../../server/saas/node_modules/bcryptjs/index.js';
import {prepareQaCluster} from '../schema/fixture.js';
import {seedAdmission} from '../admission-fixture.js';
import {applyWriterMigration} from './migrate.mjs';
const project='mecanet-qa-p1l2-cp017';if(process.env.QA_PROJECT!==project)throw Error('CP017_EXCLUSIVE_TARGET_REQUIRED');
const path='/run/qa-secrets/';const ca=await readFile('/run/qa-ca.crt','utf8');const bootstrap=await readFile(path+'bootstrap','utf8');
const adminConnection={host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password:bootstrap,ssl:{ca,servername:'postgres',rejectUnauthorized:true}};
const password=randomBytes(24).toString('base64url'),generation=randomUUID(),clockOwner=randomUUID();
const result=await prepareQaCluster({
 preflight:{project,dataClass:'synthetic',allowBootstrap:true,expectedHost:'postgres',expectedSystemIdentifier:(await readFile('/run/qa-system-id','utf8')).trim()},adminConnection,
 passwordHash:await bcrypt.hash(password,12),
 admissionSql:(await readFile('server/saas/admission/schema.sql','utf8'))+'\n'+await readFile('server/saas/admission/maintenance.sql','utf8'),
 observationSql:await readFile('server/saas/observability/schema.sql','utf8'),
 admissionSeed:(client,args)=>seedAdmission(client,{...args,generation,clockOwner})
});
Object.assign(result,{generation,clockOwner,project});
await writeFile(path+'connections.json',JSON.stringify(result),{flag:'wx',mode:0o600});
await writeFile(path+'fixture-login.json',JSON.stringify({password,identities:result.fixture.identities.map(({email,purpose})=>({email,purpose}))}),{flag:'wx',mode:0o600});
await writeFile(path+'session-signing',randomBytes(48).toString('base64url'),{flag:'wx',mode:0o600});
const checkpoint=async metadata=>{Object.assign(result,metadata);await writeFile(path+'connections.json',JSON.stringify(result),{mode:0o600})};
if(process.env.QA_STAGE==='foundation'){console.log(JSON.stringify({prepared:true,stage:'foundation',project,tenantDatabases:2,generation,secretOutput:false}));process.exit(0)}
const migrated=await applyWriterMigration({adminConnection,fixture:result.fixture,generation,connections:result.connections,entries:result.entries,checkpoint,sourceCommit:process.env.QA_CODE_SHA});
Object.assign(result,migrated);await checkpoint({});
await writeFile(path+'fixture-login.json',JSON.stringify({password,identities:result.fixture.identities.map(({email,purpose})=>({email,purpose}))}),{mode:0o600});
console.log(JSON.stringify({prepared:true,project,tenantDatabases:2,generation,systemIdentifier:result.systemIdentifier,secretOutput:false}));
