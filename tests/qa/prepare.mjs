import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes,randomUUID } from 'node:crypto';
import bcrypt from '../../server/saas/node_modules/bcryptjs/index.js';
import { prepareQaCluster } from './schema/fixture.js';
import { seedAdmission } from './admission-fixture.js';
const ca=await readFile('/run/qa-ca.crt','utf8');
const bootstrap=await readFile('/run/qa-secrets/bootstrap','utf8');
const password=randomBytes(24).toString('base64url');
const generation=randomUUID(),clockOwner=randomUUID();
const result=await prepareQaCluster({
 preflight:{project:process.env.QA_PROJECT??'mecanet-qa-p1l1',dataClass:'synthetic',allowBootstrap:true,expectedHost:'postgres',expectedSystemIdentifier:(await readFile('/run/qa-system-id','utf8')).trim()},
 adminConnection:{host:'postgres',port:5432,database:'postgres',user:'qa_bootstrap',password:bootstrap,ssl:{ca,servername:'postgres',rejectUnauthorized:true}},
 passwordHash:await bcrypt.hash(password,12),
 admissionSql:(await readFile('server/saas/admission/schema.sql','utf8'))+'\n'+await readFile('server/saas/admission/maintenance.sql','utf8'),
 observationSql:await readFile('server/saas/observability/schema.sql','utf8'),
 admissionSeed:(client,args)=>seedAdmission(client,{...args,generation,clockOwner}),
});
Object.assign(result,{generation,clockOwner});
await writeFile('/run/qa-secrets/connections.json',JSON.stringify(result),{mode:0o600,flag:'wx'});
await writeFile('/run/qa-secrets/fixture-login.json',JSON.stringify({password,identities:result.fixture.identities.map(({email,purpose})=>({email,purpose}))}),{mode:0o600,flag:'wx'});
await writeFile('/run/qa-secrets/session-signing',randomBytes(48).toString('base64url'),{mode:0o600,flag:'wx'});
await writeFile('/run/qa-secrets/worker.json',JSON.stringify({connection:result.connections.saas_clock,generation,clockTransfer:{kind:'first-start',previousOwner:clockOwner,generation,confirmed:true,reference:'qa:initial-preflight'}}),{mode:0o600,flag:'wx'});
console.log(JSON.stringify({prepared:true,syntheticIdentities:result.fixture.identities.length,tenantDatabases:result.fixture.tenants.length,systemIdentifier:result.systemIdentifier,secretsPrinted:false}));
