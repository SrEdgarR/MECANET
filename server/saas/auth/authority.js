import {failure,uuid} from './validation.js';
export function createAuthority(pool,generation,{writersEnabled=false,recovery=null}={}) {
 if(!uuid.test(generation))throw new Error('EXPLICIT_GENERATION_REQUIRED');
 let writeService=null;
 const restrictionGuard=writersEnabled?` EXISTS (SELECT 1 FROM saas.write_restrictions x WHERE x.active
  AND (x.identity_id IS NULL OR x.identity_id=i.id) AND (x.session_ref IS NULL OR x.session_ref=r.writer_session_ref)
  AND (x.tenant_id IS NULL OR x.tenant_id=d.id) AND (x.action IS NULL OR x.action=$4))`:'';
 const query=(...args)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(failure('AUTHORITY_UNAVAILABLE')),500);
  pool.query(...args).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)});
 });
 async function authorize({sid,purpose,tenantId=null,action='catalog.read'}) {
  if(recovery&&!await recovery.guard())throw failure('SERVICE_UNAVAILABLE');
  if(!sid)throw failure('SESSION_EXPIRED',401);
  if(tenantId&&!uuid.test(tenantId))throw failure('INVALID_TENANT',400);
  const {rows}=await query({text:`SELECT i.id,i.email,i.purpose,i.security_version,r.generation,r.reauth_at,
    d.id AS tenant_id,d.db_name,d.secret_ref,d.credential_version,d.schema_version,d.data_epoch,d.status AS tenant_status,d.purpose AS tenant_purpose,
    m.status AS membership_status,g.status AS grant_status,p.action AS role_action
    ${writersEnabled?`,r.writer_session_ref,d.writer_secret_ref,d.writer_credential_version,${restrictionGuard} AS writer_restricted`:''}
    FROM saas.session_registry r JOIN saas.identities i ON i.id=r.identity_id
    LEFT JOIN saas.memberships m ON m.identity_id=i.id AND m.tenant_id=$3::uuid
    LEFT JOIN saas.tenant_directory d ON d.id=m.tenant_id
    LEFT JOIN saas.action_grants g ON g.identity_id=i.id AND g.tenant_id=d.id AND g.action=$4
    LEFT JOIN saas.role_policies p ON p.role=m.role AND p.action=$4
    WHERE r.sid=$1 AND r.purpose=$2 AND i.purpose=$2 AND r.status='active' AND i.status='active' AND i.verified
    AND r.security_version=i.security_version AND r.generation=$5::uuid AND r.absolute_expires_at>clock_timestamp()
    AND r.created_at+CASE WHEN r.purpose='demo' THEN interval '30 minutes' ELSE interval '8 hours' END>clock_timestamp()
    AND r.last_interactive_at>clock_timestamp()-CASE WHEN r.purpose='operator' THEN interval '15 minutes' ELSE interval '30 minutes' END
    AND (r.purpose<>'operator' OR i.mfa_verified)`,values:[sid,purpose,tenantId,action,generation],query_timeout:500});
  const row=rows[0];if(!row)throw failure('SESSION_EXPIRED',401);
  if(row.writer_restricted)throw failure(tenantId?'ACCESS_DENIED':'SESSION_EXPIRED',tenantId?403:401);
  if(tenantId&&(purpose!=='company'||row.tenant_purpose!=='company'||row.membership_status!=='active'||row.grant_status!=='active'||row.role_action!==action))throw failure('ACCESS_DENIED',403);
  if(tenantId&&row.tenant_status!=='active')throw failure('TENANT_UNAVAILABLE');
  if(tenantId&&row.schema_version===3&&!recovery)throw failure('TENANT_UNAVAILABLE');
  if(tenantId&&row.schema_version===3){
   const positive=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
   if(!positive(row.data_epoch)||!positive(row.credential_version)||(row.writer_secret_ref&&!positive(row.writer_credential_version)))throw failure('TENANT_UNAVAILABLE');
  }
  const descriptor=tenantId?{tenantId:row.tenant_id,dbName:row.db_name,secretRef:row.secret_ref,credentialVersion:row.schema_version>=2?String(row.credential_version):Number(row.credential_version),schemaVersion:row.schema_version,dataEpoch:row.schema_version>=2?String(row.data_epoch):Number(row.data_epoch),status:row.tenant_status,purpose:row.tenant_purpose,...(row.schema_version===3?{recoveryRunId:recovery.binding.runId,recoveryManifestHash:recovery.binding.manifestHash}:{})}:null;
  const writerDescriptor=writersEnabled&&[2,3].includes(descriptor?.schemaVersion)&&row.writer_secret_ref?{...descriptor,secretRef:row.writer_secret_ref,credentialVersion:String(row.writer_credential_version)}:null;
  return {user:{id:row.id,email:row.email},purpose,contextVersion:`${row.security_version}:${row.generation}`,generation:row.generation,
   descriptor,...(writersEnabled?{writerSessionRef:row.writer_session_ref,writerDescriptor}:{} )};
 }
 async function tenants(sid,purpose) {
  const ctx=await authorize({sid,purpose});if(purpose!=='company')throw failure('ACCESS_DENIED',403);
  if(writersEnabled){
   const {rows}=await query({text:`SELECT d.id,d.data_epoch::text,array_agg(DISTINCT g.action ORDER BY g.action) AS permissions
    FROM saas.session_registry r JOIN saas.identities i ON i.id=r.identity_id JOIN saas.memberships m ON m.identity_id=i.id
    JOIN saas.tenant_directory d ON d.id=m.tenant_id JOIN saas.action_grants g ON g.tenant_id=d.id AND g.identity_id=i.id
    JOIN saas.role_policies p ON p.role=m.role AND p.action=g.action
    WHERE r.sid=$1 AND r.generation=$2 AND r.status='active' AND i.status='active' AND r.security_version=i.security_version
    AND m.status='active' AND g.status='active' AND d.status='active' AND d.purpose='company'
    AND g.action IN ('catalog.read','catalog.create','inventory.read','inventory.receive')
    AND NOT EXISTS (SELECT 1 FROM saas.write_restrictions x WHERE x.active
     AND (x.identity_id IS NULL OR x.identity_id=i.id) AND (x.session_ref IS NULL OR x.session_ref=r.writer_session_ref)
     AND (x.tenant_id IS NULL OR x.tenant_id=d.id) AND (x.action IS NULL OR x.action=g.action))
    GROUP BY d.id ORDER BY d.id LIMIT 100`,values:[sid,generation],query_timeout:500});
   return {context:ctx,tenants:rows.map(r=>({id:r.id,name:`Empresa de prueba ${r.id.slice(0,4)}`,dataEpoch:r.data_epoch,permissions:r.permissions}))};
  }
  const {rows}=await pool.query({text:`SELECT d.id,d.data_epoch FROM saas.tenant_directory d JOIN saas.memberships m ON m.tenant_id=d.id JOIN saas.role_policies p ON p.role=m.role AND p.action='catalog.read' JOIN saas.action_grants g ON g.tenant_id=d.id AND g.identity_id=m.identity_id AND g.action='catalog.read' JOIN saas.session_registry r ON r.identity_id=m.identity_id JOIN saas.identities i ON i.id=r.identity_id WHERE r.sid=$1 AND r.status='active' AND r.security_version=i.security_version AND i.status='active' AND m.status='active' AND g.status='active' AND d.status='active' AND d.purpose='company' ORDER BY d.id LIMIT 100`,values:[sid],query_timeout:500});
  return {context:ctx,tenants:rows.map(r=>({id:r.id,name:`Empresa de prueba ${r.id.slice(0,4)}`,dataEpoch:Number(r.data_epoch)}))};
 }
 async function tenantContext({sid,purpose,tenantId}){if(!uuid.test(tenantId))throw failure('INVALID_TENANT',400);const visible=await tenants(sid,purpose);const tenant=visible.tenants.find(t=>t.id===tenantId.toLowerCase());if(!tenant)throw failure('ACCESS_DENIED',403);return authorize({sid,purpose,tenantId:tenant.id,action:tenant.permissions?.[0]??'catalog.read'})}
 // This context may ONLY resume a logout. It grants no tenant descriptor/action.
 // A queued restriction cannot turn a retry into an apparent completed logout.
 async function logoutContext({sid,purpose}) {
  if(recovery&&!await recovery.guard())throw failure('SERVICE_UNAVAILABLE');
  if(!writersEnabled||purpose!=='company')return authorize({sid,purpose});
  if(!sid)throw failure('SESSION_EXPIRED',401);
  const {rows}=await query({text:`SELECT i.id,i.email,i.security_version,r.generation,r.writer_session_ref,
   r.status,r.security_version AS session_security_version,
   EXISTS(SELECT 1 FROM saas.write_restrictions x WHERE x.active
    AND x.session_ref=r.writer_session_ref AND (x.identity_id IS NULL OR x.identity_id=i.id) AND x.reason_code='LOGOUT'
    AND x.status<>'ACKNOWLEDGED') AS logout_pending
   FROM saas.session_registry r JOIN saas.identities i ON i.id=r.identity_id
   WHERE r.sid=$1 AND r.purpose='company' AND i.purpose='company' AND r.generation=$2`,values:[sid,generation],query_timeout:500});
  const row=rows[0];if(!row)throw failure('SESSION_EXPIRED',401);
  if(!row.logout_pending)return authorize({sid,purpose});
  return {user:{id:row.id,email:row.email},purpose:'company',contextVersion:`${row.security_version}:${row.generation}`,generation:row.generation,writerSessionRef:row.writer_session_ref,logoutPending:true};
 }
 async function revoke(sid,ctx,options){if(recovery&&!await recovery.guard())throw failure('SERVICE_UNAVAILABLE');if(writersEnabled&&ctx.purpose==='company'){if(!writeService)throw failure('AUTHORITY_UNAVAILABLE');return writeService.requestSessionRevocation({sid,ctx,...options})}return pool.query('SELECT saas.revoke_session($1,$2,$3)',[sid,ctx.user.id,ctx.generation]);}
 async function activity(sid,ctx){if(recovery&&!await recovery.guard())throw failure('SERVICE_UNAVAILABLE');const {rows}=await pool.query('SELECT saas.touch_session($1,$2,$3) AS touched',[sid,ctx.user.id,ctx.generation]);if(!rows[0]?.touched)throw failure('SESSION_EXPIRED',401);}
 return {authorize,tenants,revoke,activity,tenantContext,logoutContext,setWriteService(service){if(!writersEnabled||writeService||typeof service?.requestSessionRevocation!=='function')throw new Error('WRITER_COMPOSITION_REJECTED');writeService=service}};
}
