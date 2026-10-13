import session from 'express-session';
import pgSession from 'connect-pg-simple';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {failure,validateOrigin} from './validation.js';
const Store=pgSession(session);
export function sessionMiddlewares({pool,secret}) {
 if(typeof secret!=='string'||secret.length<48)throw new Error('SESSION_SECRET_REQUIRED');
 return Object.fromEntries(['company','demo','operator'].map(purpose=>[purpose,session({
  name:`__Host-mecanet-${purpose==='company'?'session':purpose}`,
  secret,genid:()=>randomBytes(32).toString('base64url'),
  resave:false,saveUninitialized:false,rolling:false,
  store:new Store({pool,schemaName:'session_store',tableName:`${purpose}_sessions`,createTableIfMissing:false,pruneSessionInterval:false,disableTouch:true}),
  cookie:{path:'/',secure:true,httpOnly:true,sameSite:'lax',maxAge:purpose==='demo'?30*60*1000:8*60*60*1000},
 })]));
}
export function csrfMiddleware(origin){return (req,res,next)=>{
 try {
  validateOrigin(req.headers,origin);
  const token=req.get('X-CSRF-Token'),expected=req.session?.csrfToken;
  if(typeof token!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(token)||typeof expected!=='string'||token.length!==expected.length||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))throw failure('CSRF_REJECTED',403);
  next();
 }catch(error){next(error)}
};}
export const csrfToken=()=>randomBytes(32).toString('base64url');
export const saveSession=req=>new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
export const regenerate=req=>new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
