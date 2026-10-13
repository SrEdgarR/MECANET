// Private CA and fixed Unix listeners. Never trusts TLS globally or follows redirects.
import https from 'node:https';
import tls from 'node:tls';
import assert from 'node:assert/strict';
export const QA_ORIGIN='https://app.mecanet.test:18443';
export function createQaClient({instance='api1',purpose='company',ca,login,budget=120}){
 assert(['api1','api2','web'].includes(instance));assert(['company','demo','operator'].includes(purpose));assert(ca);assert(budget<=160);
 const jar=new Map();let csrf='',requests=0;
 const cookieHeader=()=>[...jar].map(([name,value])=>`${name}=${value}`).join('; ');
 function request(pathname,{method='GET',body,headers={},cookieOverride,dropResponse=false,onHeaders,signal}={}){
  assert(pathname.startsWith('/')&&!/[\r\n]/.test(pathname));assert(++requests<=budget,'Bounded private HTTP budget');
  const payload=body===undefined?null:JSON.stringify(body);
  const outgoing={Host:'app.mecanet.test:18443',Accept:'application/json',Cookie:cookieOverride??cookieHeader(),...(method==='POST'?{Origin:QA_ORIGIN,'X-CSRF-Token':csrf,'Content-Type':'application/json'}:{}),...headers};
  for(const [name,value]of Object.entries(outgoing))if(value===undefined)delete outgoing[name];if(payload){outgoing['Content-Length']=Buffer.byteLength(payload);outgoing['Content-Type']='application/json'}
  let abort;
  const result=new Promise((resolve,reject)=>{
   const req=https.request({socketPath:`/run/qa-ingress/${instance==='web'?'web':instance}.sock`,hostname:'app.mecanet.test',servername:'app.mecanet.test',path:pathname,method,headers:outgoing,ca,rejectUnauthorized:true,checkServerIdentity:tls.checkServerIdentity,agent:false,signal},res=>{
    if(onHeaders)onHeaders({status:res.statusCode,headers:res.headers});
    if(dropResponse){res.destroy();return resolve({lost:true,status:res.statusCode})}
    for(const cookie of res.headers['set-cookie']??[]){const pair=/^([^=;]+)=([^;]*)/.exec(cookie);if(!pair)continue;if(!pair[2]||/Max-Age=0(?:;|$)/i.test(cookie))jar.delete(pair[1]);else jar.set(pair[1],pair[2])}
    let bytes=0;const chunks=[];res.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576)res.destroy(new Error('QA_RESPONSE_TOO_LARGE'));else chunks.push(chunk)});res.on('error',reject);res.on('end',()=>{
     const text=Buffer.concat(chunks).toString('utf8');let json;try{json=JSON.parse(text)}catch{}if(json?.csrfToken)csrf=json.csrfToken;resolve({status:res.statusCode,headers:res.headers,json,text});
    });
   });abort=()=>req.destroy(new Error('QA_RESPONSE_INTERRUPTED'));req.setTimeout(11500,()=>req.destroy(new Error('QA_REQUEST_TIMEOUT')));req.on('error',reject);if(payload)req.write(payload);req.end();
  });result.abort=()=>abort?.();return result;
 }
 // Purpose for pre-session is selected by body; GET cannot carry JSON reliably.
 async function loginStandard(){
  assert(login?.email&&login?.password);
  const initial=await request('/api/auth/session',{body:{purpose}});assertStatus(initial,200);assert.equal(initial.json.authenticated,false);
  const reply=await request('/api/auth/login',{method:'POST',body:{email:login.email,password:login.password,purpose}});assertStatus(reply,200);assert.equal(reply.json.authenticated,true);assert.equal(reply.json.purpose,purpose);return reply;
 }
 return {request,login:loginStandard,cookieHeader,get csrf(){return csrf},set csrf(value){csrf=value},setCookies(cookie){jar.clear();for(const pair of cookie.split('; ')){const [name,...rest]=pair.split('=');jar.set(name,rest.join('='))}},get requests(){return requests}};
}
export function assertStatus(reply,status){
 const code=typeof reply.json?.error==='string'&&/^[A-Z_]{1,60}$/.test(reply.json.error)?reply.json.error:'NO_PUBLIC_CODE';
 assert.equal(reply.status,status,`Expected HTTP ${status}, received ${reply.status}/${code}`);
 assert.match(reply.headers?.['content-type']??'',/application\/json/);assert.match(reply.headers?.['cache-control']??'',/no-store/);
}
