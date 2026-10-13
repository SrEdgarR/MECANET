import {failure,uuid} from './validation.js';
export function createAuthority(pool,generation) {
 if(!uuid.test(generation))throw new Error('EXPLICIT_GENERATION_REQUIRED');
 const query=(...args)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(failure('AUTHORITY_UNAVAILABLE')),500);
  pool.query(...args).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)});
 });
 async function authorize({sid,purpose,tenantId=null,action='catalog.read'}) {
  if(!sid)throw failure('SESSION_EXPIRED',401);
  if(tenantId&&!uuid.test(tenantId))throw failure('INVALID_TENANT',400);
  const {rows}=await query({text:`SELECT i.id,i.email,i.purpose,i.security_version,r.generation,r.reauth_at,
    d.id AS tenant_id,d.db_name,d.secret_ref,d.credential_version,d.schema_version,d.data_epoch,d.status AS tenant_status,d.purpose AS tenant_purpose,
    m.status AS membership_status,g.status AS grant_status,p.action AS role_action
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
  if(tenantId&&(purpose!=='company'||row.tenant_purpose!=='company'||row.membership_status!=='active'||row.grant_status!=='active'||row.role_action!==action))throw failure('ACCESS_DENIED',403);
  if(tenantId&&row.tenant_status!=='active')throw failure('TENANT_UNAVAILABLE');
  return {user:{id:row.id,email:row.email},purpose,contextVersion:`${row.security_version}:${row.generation}`,generation:row.generation,
   descriptor:tenantId?{tenantId:row.tenant_id,dbName:row.db_name,secretRef:row.secret_ref,credentialVersion:Number(row.credential_version),schemaVersion:row.schema_version,dataEpoch:Number(row.data_epoch),status:row.tenant_status,purpose:row.tenant_purpose}:null};
 }
 async function tenants(sid,purpose) {
  const ctx=await authorize({sid,purpose});if(purpose!=='company')throw failure('ACCESS_DENIED',403);
  const {rows}=await pool.query({text:`SELECT d.id,d.data_epoch FROM saas.tenant_directory d JOIN saas.memberships m ON m.tenant_id=d.id JOIN saas.role_policies p ON p.role=m.role AND p.action='catalog.read' JOIN saas.action_grants g ON g.tenant_id=d.id AND g.identity_id=m.identity_id AND g.action='catalog.read' JOIN saas.session_registry r ON r.identity_id=m.identity_id JOIN saas.identities i ON i.id=r.identity_id WHERE r.sid=$1 AND r.status='active' AND r.security_version=i.security_version AND i.status='active' AND m.status='active' AND g.status='active' AND d.status='active' AND d.purpose='company' ORDER BY d.id LIMIT 100`,values:[sid],query_timeout:500});
  return {context:ctx,tenants:rows.map(r=>({id:r.id,name:`Empresa de prueba ${r.id.slice(0,4)}`,dataEpoch:Number(r.data_epoch)}))};
 }
 async function revoke(sid,ctx){return pool.query('SELECT saas.revoke_session($1,$2,$3)',[sid,ctx.user.id,ctx.generation]);}
 async function activity(sid,ctx){const {rows}=await pool.query('SELECT saas.touch_session($1,$2,$3) AS touched',[sid,ctx.user.id,ctx.generation]);if(!rows[0]?.touched)throw failure('SESSION_EXPIRED',401);}
 return {authorize,tenants,revoke,activity};
}
