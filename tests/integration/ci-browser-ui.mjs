// Three verified public build files served by API1 on its own loopback TLS socket.
// No proxy, second origin, .env, arbitrary static directory or public listener.
import assert from 'node:assert/strict';
import {readFile,lstat,realpath,mkdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const origin='https://app.mecanet.test:18443';
export function ciUiRoute(url,assets){
 const path=new URL(url,origin).pathname;
 if(path==='/favicon.ico')return'favicon';
 if(assets.includes(path))return path;
 if(['/','/login','/cuenta/empresas'].includes(path)||/^\/app\/[0-9a-f-]{36}\/(?:catalogo|inventario)\/?$/.test(path))return'/saas.html';
 return null;
}
async function regular(path){const s=await lstat(path);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=1048576,'CI_UI_REGULAR_BOUNDED');assert.equal(await realpath(path),resolve(path),'CI_UI_ALIAS');return readFile(path)}
export async function prepareCiUi(root){
 const r=JSON.parse(await regular(resolve('.qa-private/saas-toolchain/last-result.json')));assert.equal(r.result,'PASS');assert.equal(r.sourceCodeSha,process.env.GITHUB_SHA,'CI_UI_BUILD_SHA_CHANGED');assert.equal(r.assets.length,3);
 for(const input of r.inputs)assert.equal(hash(await regular(resolve(input.source))),input.sha256,'CI_UI_SOURCE_CHANGED');
 const dir=resolve(root,'ui');await mkdir(dir,{mode:0o700,recursive:true});const files=[];
 for(const a of r.assets){assert.match(a.path,/^client\/dist-saas\/(?:saas\.html|assets\/saas-[A-Za-z0-9_-]+\.(?:js|css))$/);const b=await regular(resolve(a.path));assert.equal(hash(b),a.sha256);const name=a.path.slice('client/dist-saas/'.length).replace('assets/','');const path=resolve(dir,name);
  try{const h=await open(path,'wx',0o600);try{await h.writeFile(b);await h.sync()}finally{await h.close()}}catch(e){if(e.code!=='EEXIST')throw e}
  assert.equal(hash(await regular(path)),a.sha256);files.push({url:'/'+a.path.slice('client/dist-saas/'.length),name,sha256:a.sha256});
 }
 const d=await open(dir,'r');try{await d.sync()}finally{await d.close()}
 return{schema:'cp028-ci-ui-v1',root:dir,files,inputFingerprint:r.inputFingerprintSha256};
}
export async function loadCiUi(config,privateRoot){
 assert.equal(config.schema,'cp028-ci-ui-v1');assert.equal(config.root,resolve(privateRoot,'ui'));assert.equal(config.files.length,3);const files=new Map();
 for(const a of config.files){assert.match(a.name,/^(?:saas\.html|saas-[A-Za-z0-9_-]+\.(?:js|css))$/);assert.equal(a.url,a.name==='saas.html'?'/saas.html':'/assets/'+a.name);const b=await regular(resolve(config.root,a.name));assert.equal(hash(b),a.sha256);assert.equal(files.has(a.url),false);files.set(a.url,b)}
 assert.ok(files.has('/saas.html'));assert.equal([...files.keys()].filter(x=>x.endsWith('.js')).length,1);assert.equal([...files.keys()].filter(x=>x.endsWith('.css')).length,1);
 return(req,res)=>{if(req.headers.host!==new URL(origin).host){res.writeHead(421).end();return}if(req.method!=='GET'){res.writeHead(405).end();return}const route=ciUiRoute(req.url,[...files.keys()]);if(route==='favicon'){res.writeHead(204,{'Cache-Control':'public,max-age=31536000,immutable'}).end();return}if(!route){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':route.endsWith('.js')?'text/javascript':route.endsWith('.css')?'text/css':'text/html;charset=utf-8','Cache-Control':route==='/saas.html'?'no-store':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'}).end(files.get(route))};
}
