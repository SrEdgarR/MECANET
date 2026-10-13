// PRIVATE QA ONLY. Public app has no issuer unless explicitly composed by this harness.
import bcrypt from '../../server/saas/node_modules/bcryptjs/index.js';
import {failure} from '../../server/saas/auth/validation.js';
import {randomUUID} from 'node:crypto';
export function createFixtureIssuer({pool,generation,writerAuthority=null}) {
 async function verify({email,password,purpose}) {
  const {rows}=await pool.query('SELECT id,email,password_hash,purpose,security_version FROM saas.identities WHERE email=$1 AND purpose=$2 AND status=\'active\' AND verified',[email,purpose]);
  const row=rows[0];if(!row||!await bcrypt.compare(password,row.password_hash))throw failure('INVALID_CREDENTIALS',401);
  return row;
 }
 async function issue({sid,identity,previous,deadline=Infinity}) {
  const live=()=>{if(performance.now()>=deadline)throw failure('DB_DEADLINE')};live();
  if(previous&&writerAuthority){const ctx=await writerAuthority.logoutContext({sid:previous.sid,purpose:identity.purpose});await writerAuthority.revoke(previous.sid,ctx,{deadline});live();}
  const client=await pool.connect();let failed=false;
  try{
   await client.query('BEGIN');
   // Serialize issuance with the restore barrier; issuer cannot reopen it.
   const {rows}=await client.query('UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1 RETURNING barrier,generation');
   if(rows[0]?.barrier!==false||rows[0]?.generation!==generation)throw failure('ADMISSION_CLOSED');
   live();
   if(writerAuthority){const current=(await client.query('SELECT saas.lock_issuer_identity($1,$2,$3) AS allowed',[identity.id,identity.purpose,identity.security_version])).rows[0];if(current?.allowed!==true)throw failure('AUTHORITY_CHANGED',409)}
   else{const current=(await client.query(`SELECT security_version FROM saas.identities WHERE id=$1 AND purpose=$2 AND status='active' AND verified`,[identity.id,identity.purpose])).rows[0];if(!current||String(current.security_version)!==String(identity.security_version))throw failure('AUTHORITY_CHANGED',409)}
   if(previous&&!writerAuthority)await client.query('SELECT saas.revoke_session($1,$2,$3)',[previous.sid,previous.identityId,previous.generation]);
   live();
   await client.query(writerAuthority?`INSERT INTO saas.session_registry(sid,identity_id,purpose,generation,status,security_version,absolute_expires_at,reauth_at,writer_session_ref) VALUES($1,$2,$3,$4,'active',$5,clock_timestamp()+CASE WHEN $3='demo' THEN interval '30 minutes' ELSE interval '8 hours' END,clock_timestamp(),$6)`: `INSERT INTO saas.session_registry(sid,identity_id,purpose,generation,status,security_version,absolute_expires_at,reauth_at) VALUES($1,$2,$3,$4,'active',$5,clock_timestamp()+CASE WHEN $3='demo' THEN interval '30 minutes' ELSE interval '8 hours' END,clock_timestamp())`,[sid,identity.id,identity.purpose,generation,identity.security_version,...(writerAuthority?[randomUUID()]:[])]);
   live();
   await client.query('COMMIT');
  }catch(e){failed=true;try{await client.query('ROLLBACK')}catch{}throw e;}finally{client.release(failed)}
 }
 return {verify,issue};
}
