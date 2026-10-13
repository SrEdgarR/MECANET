export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const failure = (code,status=503)=>Object.assign(new Error(code),{code,status});
export function validateLogin(body) {
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['email','password','purpose'].includes(k))||typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||body.email.length>254||typeof body.password!=='string'||body.password.length<1||body.password.length>512||!['company','demo','operator'].includes(body.purpose??'company')) throw failure('INVALID_LOGIN',400);
 return {email:body.email.toLowerCase(),password:body.password,purpose:body.purpose??'company'};
}
export function validateOrigin(headers,expected) {
 const url=new URL(expected);if(headers.host!==url.host)throw failure('INVALID_ORIGIN',403);
 let source=headers.origin;
 if(source===undefined&&headers.referer){try{source=new URL(headers.referer).origin}catch{throw failure('INVALID_ORIGIN',403)}}
 if(source!==url.origin)throw failure('INVALID_ORIGIN',403);return true;
}
export function parseCatalogQuery(query) {
 if(Object.keys(query).some(k=>!['limit','cursor'].includes(k))||(query.limit!==undefined&&(typeof query.limit!=='string'||!/^\d{1,3}$/.test(query.limit)))||(query.cursor!==undefined&&(typeof query.cursor!=='string'||!uuid.test(query.cursor))))throw failure('INVALID_QUERY',400);
 const limit=Number(query.limit??100);if(limit<1||limit>100)throw failure('INVALID_QUERY',400);
 return {limit,cursor:query.cursor??null};
}
