// Real dedicated Chromium, real private API/PG. No legacy config, .env, traces,
// cookies, payload dumps, foreign origins or public VPS address are accepted.
import assert from 'node:assert/strict';
import {createHash,randomUUID,X509Certificate} from 'node:crypto';
import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import {pathToFileURL} from 'node:url';

const workspace=process.cwd(),privateRoot=await realpath(path.join(workspace,'.qa-private'));
async function privatePath(input,mustExist=true){
 assert.equal(typeof input,'string');const resolved=path.resolve(workspace,input);
 assert(resolved.startsWith(privateRoot+path.sep),'Outside exclusive private QA area');
 if(!mustExist)return resolved;const actual=await realpath(resolved);assert(actual.startsWith(privateRoot+path.sep),'Private QA symlink escapes');return actual;
}
const config=JSON.parse(await readFile(path.join(privateRoot,'cp017-browser-config.json'),'utf8'));
assert.equal(config.baseUrl,'https://app.mecanet.test:18443');assert.match(config.spkiSha256,/^[A-Za-z0-9+/]{43}=$/);
assert.match(config.sourceCommit,/^[0-9a-f]{40}$/);assert.match(config.tenant.id,/^[0-9a-f-]{36}$/);assert.match(config.otherTenantId,/^[0-9a-f-]{36}$/);
assert.notEqual(config.tenant.id,config.otherTenantId);assert.equal(config.writer.tenantId,config.tenant.id);
for(const account of [config.user,config.writer]){assert.equal(typeof account.email,'string');assert.equal(typeof account.password,'string');assert(account.password.length>=20)}
const ca=await readFile(await privatePath(config.caCertificatePath));
const modulePath=await privatePath(config.playwrightModule),executablePath=await privatePath(config.browserExecutable);
const output=await privatePath(config.outputDirectory,false);await mkdir(output,{recursive:true});await privatePath(config.outputDirectory);
const evidence={environment:'CP017 synthetic cohort; private HTTPS loopback; real API/PostgreSQL',sourceCommit:config.sourceCommit,startedAt:new Date().toISOString(),node:process.version,checks:[],screenshots:[],assets:[]};
const counts=new Map(),blockedOrigins=new Set(),assetJobs=[];let requests=0,tenantPosts=0,pageErrors=0,browser,page,currentCheck='initialization';
const hintsKey='mecanet.operation-hints.v1',inventoryPath=`/app/${config.tenant.id}/inventario`;
const productsPath=`/api/tenants/${config.tenant.id}/products`;
async function check(name,action){currentCheck=name;await action();evidence.checks.push({name,result:'PASS'})}
function handshake({authority=ca,hostname='app.mecanet.test'}={}){
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname,port:18443,path:'/',method:'HEAD',ca:authority,rejectUnauthorized:true,servername:hostname,agent:false,checkServerIdentity:tls.checkServerIdentity,
   lookup:(_host,options,callback)=>options.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4)},res=>{
   const certificate=new X509Certificate(res.socket.getPeerCertificate().raw);res.resume();resolve(createHash('sha256').update(certificate.publicKey.export({type:'spki',format:'der'})).digest('base64'));
  });req.setTimeout(8000,()=>req.destroy(Error('TLS_PREFLIGHT_TIMEOUT')));req.on('error',reject);req.end();
 });
}
async function dedicatedContext(){
 const context=await browser.newContext({viewport:{width:1440,height:960},locale:'es-DO',reducedMotion:'reduce'});
 await context.route('**/*',route=>{requests++;const url=new URL(route.request().url());if(requests>150)return route.abort('blockedbyclient');if(url.origin!==config.baseUrl){blockedOrigins.add(url.origin);return route.abort('blockedbyclient')}return route.continue()});
 const tab=await context.newPage();tab.setDefaultTimeout(10000);tab.on('pageerror',()=>{pageErrors++});
 tab.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/tenants/'))tenantPosts++});
 tab.on('response',response=>{
  const pathname=new URL(response.url()).pathname;
  if(pathname.startsWith('/api/')){const key=`${response.request().method()} ${pathname.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi,':id')} ${response.status()}`;counts.set(key,(counts.get(key)??0)+1)}
  if(/\/assets\/[^/]+\.(?:js|css)$/.test(pathname))assetJobs.push(response.body().then(bytes=>{const sha256=createHash('sha256').update(bytes).digest('hex');if(!evidence.assets.some(a=>a.path===pathname&&a.sha256===sha256))evidence.assets.push({path:pathname,sha256})}).catch(()=>{}));
 });return {context,page:tab};
}
async function login(tab,account){
 await tab.goto(config.baseUrl+'/login',{waitUntil:'networkidle'});await tab.getByLabel('Correo electrónico').fill(account.email);await tab.getByLabel('Contraseña').fill(account.password);
 await tab.getByLabel('Contraseña').press('Enter');await tab.getByRole('heading',{level:1,name:'Tus empresas'}).waitFor();
}
async function openOwnerInventory(tab){
 const company=tab.locator(`a[href="/app/${config.tenant.id}/catalogo"]`);await company.focus();await tab.keyboard.press('Enter');
 await tab.getByRole('heading',{level:1,name:'Catálogo'}).waitFor();await tab.getByRole('link',{name:'Abrir inventario'}).click();await tab.getByRole('heading',{level:1,name:'Inventario',exact:true}).waitFor();
}
async function createProduct(tab,sku,name){
 await tab.getByLabel('Código del producto').fill(sku);await tab.getByLabel('Nombre del producto').fill(name);
 const received=tab.waitForResponse(response=>new URL(response.url()).pathname===productsPath&&response.request().method()==='POST');
 await tab.getByRole('button',{name:'Crear producto',exact:true}).click();const reply=await received;assert.equal(reply.status(),201);const result=await reply.json();
 assert.equal(result.state,'CONFIRMED');assert.equal(result.movementId,null);assert.equal(result.onHand,'0');assert.equal(result.balanceVersion,'1');
 await tab.getByRole('heading',{name:'Operación confirmada',exact:true}).waitFor();return result;
}
async function ownRow(tab,name){
 await tab.getByRole('button',{name:'Actualizar inventario',exact:true}).click();await tab.getByRole('heading',{level:1,name:'Inventario',exact:true}).waitFor();
 for(let pageNumber=0;pageNumber<4;pageNumber++){
  const row=tab.getByRole('row').filter({has:tab.getByText(name,{exact:true})});if(await row.count())return row;
  const next=tab.getByRole('button',{name:'Página siguiente',exact:true});if(!await next.isEnabled())break;await next.click();await tab.getByRole('heading',{level:1,name:'Inventario',exact:true}).waitFor();
 }throw Error('SYNTHETIC_PRODUCT_NOT_VISIBLE');
}
function postCount(){return tenantPosts}
async function assertHintShape(tab){
 const hints=await tab.evaluate(key=>{const value=sessionStorage.getItem(key);return value?JSON.parse(value):[]},hintsKey);
 assert(Array.isArray(hints)&&hints.length<=32);for(const hint of hints){assert.deepEqual(Object.keys(hint).sort(),['operationId','tenantId']);assert.match(hint.operationId,/^[0-9a-f-]{36}$/);assert.match(hint.tenantId,/^[0-9a-f-]{36}$/)}return hints;
}
async function screenshot(tab,name){await tab.screenshot({path:path.join(output,name),fullPage:true});evidence.screenshots.push(name)}
async function textContrast(tab){
 const palette=await tab.evaluate(()=>{const style=getComputedStyle(document.documentElement);return Object.fromEntries(['canvas','surface','ink','muted','accent','accent-ink','error','error-surface','focus'].map(key=>[key,style.getPropertyValue('--'+key).trim()]))});
 const luminance=color=>{assert.match(color,/^#[0-9a-f]{6}$/i);const channels=[1,3,5].map(start=>parseInt(color.slice(start,start+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722};
 const ratio=(first,second)=>{const a=luminance(palette[first]),b=luminance(palette[second]);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
 for(const [front,back]of[['ink','surface'],['muted','surface'],['ink','canvas'],['muted','canvas'],['accent','surface'],['accent-ink','accent'],['error','error-surface']])assert(ratio(front,back)>=4.5,front+' text contrast');
 assert(ratio('focus','surface')>=3);assert(ratio('focus','canvas')>=3);
}

try{
 await check('TLS validates the exact private CA, hostname and SPKI',async()=>assert.equal(await handshake(),config.spkiSha256));
 await check('TLS rejects an unrelated CA and wrong hostname',async()=>{await assert.rejects(handshake({authority:tls.rootCertificates[0]}),error=>/CERT|VERIFY|ISSUER/.test(error.code??''));await assert.rejects(handshake({hostname:'wrong.mecanet.test'}),error=>error.code==='ERR_TLS_CERT_ALTNAME_INVALID')});
 const {chromium}=await import(pathToFileURL(modulePath).href);
 browser=await chromium.launch({executablePath,headless:true,args:['--host-resolver-rules=MAP app.mecanet.test 127.0.0.1, EXCLUDE localhost',`--ignore-certificate-errors-spki-list=${config.spkiSha256}`,'--disable-background-networking','--disable-component-update','--no-proxy-server']});evidence.chromium=browser.version();
 const owner=await dedicatedContext();page=owner.page;
 await check('Owner keyboard login and company selector enter the approved inventory',async()=>{await login(page,config.user);await openOwnerInventory(page);assert(await page.getByRole('heading',{level:1}).evaluate(node=>document.activeElement===node));assert.equal(await page.getByLabel(/precio|coste|impuesto/i).count(),0)});
 const sku='BROWSER-'+randomUUID().slice(0,8).toUpperCase(),name='Producto sintético '+sku;let created;
 await check('Create validation keeps associated errors and focus without issuing a POST',async()=>{const before=postCount();await page.getByRole('button',{name:'Crear producto',exact:true}).click();assert.equal(await page.getByLabel('Código del producto').getAttribute('aria-invalid'),'true');assert(await page.getByLabel('Código del producto').evaluate(node=>document.activeElement===node));assert.equal(postCount(),before)});
 await check('A real product is created once with stock zero and known pre-send reference',async()=>{created=await createProduct(page,sku,name);const row=await ownRow(page,name);assert.equal((await row.getByRole('cell').allTextContents())[2],'0');assert.equal((await assertHintShape(page)).length,0);await screenshot(page,'inventory-created.png')});
 await check('Positive receipt changes real stock once and records an opaque movement',async()=>{
  await page.getByRole('button',{name:`Recibir unidades de ${name}`,exact:true}).click();assert(await page.getByLabel('Unidades recibidas').evaluate(node=>document.activeElement===node));
  const before=postCount();await page.getByLabel('Unidades recibidas').fill('0');await page.getByRole('button',{name:'Registrar recepción',exact:true}).click();assert.equal(await page.getByLabel('Unidades recibidas').getAttribute('aria-invalid'),'true');assert.equal(postCount(),before);
  await page.getByLabel('Unidades recibidas').fill('7');await page.getByLabel('Motivo de la recepción').fill('Recepción sintética navegador');
  const received=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===productsPath+'/'+created.productId+'/stock-receipts');
  await page.getByRole('button',{name:'Registrar recepción',exact:true}).click();const reply=await received;assert.equal(reply.status(),201);const result=await reply.json();assert.equal(result.onHand,'7');assert.equal(result.balanceVersion,'2');assert.notEqual(result.movementId,null);
  await page.getByRole('heading',{name:'Operación confirmada',exact:true}).waitFor();const row=await ownRow(page,name);assert.equal((await row.getByRole('cell').allTextContents())[2],'7');
  await page.getByRole('button',{name:`Movimientos de ${name}`,exact:true}).click();await page.getByText('7 unidades recibidas',{exact:true}).waitFor();assert.equal(await page.locator('.movement-list li').count(),1);await screenshot(page,'inventory-received.png');
 });
 let lostOperation;const lostSku='ACK-'+randomUUID().slice(0,8).toUpperCase(),lostName='ACK sintético '+lostSku;
 await check('A received server ACK lost only toward the browser keeps a query hint and never re-POSTs on reload',async()=>{
  let intercepted=0,unexpectedStatus=false;
  const interception=async route=>{if(route.request().method()!=='POST')return route.continue();intercepted++;const response=await route.fetch();if(response.status()!==201){unexpectedStatus=true;return route.fulfill({response})}lostOperation=await response.json();await route.abort('failed')};
  await page.route(config.baseUrl+productsPath,interception);
  await page.getByLabel('Código del producto').fill(lostSku);await page.getByLabel('Nombre del producto').fill(lostName);await page.getByRole('button',{name:'Crear producto',exact:true}).click();
  await page.getByRole('heading',{name:'Resultado incierto',exact:true}).waitFor();assert.equal(unexpectedStatus,false);assert.equal(intercepted,1);assert.equal(lostOperation.state,'CONFIRMED');
  const hints=await assertHintShape(page);assert(hints.some(h=>h.operationId===lostOperation.operationId&&h.tenantId===config.tenant.id));
  await screenshot(page,'inventory-client-ack-lost.png');const before=postCount();await page.unroute(config.baseUrl+productsPath,interception);
  const recovered=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname===`/api/tenants/${config.tenant.id}/operations/${lostOperation.operationId}`);
  await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{level:1,name:'Inventario',exact:true}).waitFor();const queried=await recovered;assert.equal(queried.status(),200);assert.equal((await queried.json()).state,'CONFIRMED');
  await page.waitForFunction(({key,id})=>!JSON.parse(sessionStorage.getItem(key)??'[]').some(hint=>hint.operationId===id),{key:hintsKey,id:lostOperation.operationId});
  assert.equal(postCount(),before);assert.equal(await page.getByRole('button',{name:'Reenviar la misma operación',exact:true}).count(),0);assert.equal((await assertHintShape(page)).length,0);const row=await ownRow(page,lostName);assert.equal(await row.count(),1);
  evidence.clientLostAckScope='Route.fetch received a real201 then dropped only the browser ACK. Backend COMMIT uncertainty and reservation reconciliation require separate SQL tests.';
 });
 await check('Company change hides all company content and foreign direct operations are denied',async()=>{
  await page.getByRole('button',{name:'Cambiar empresa',exact:true}).click();await page.getByRole('heading',{level:1,name:'Tus empresas'}).waitFor();assert.equal(await page.getByText(name,{exact:true}).count(),0);assert.equal(await page.getByText(lostName,{exact:true}).count(),0);
  const codes=await page.evaluate(async tenantId=>{const urls=[`/api/tenants/${tenantId}/operations?state=pending&limit=2`,`/api/tenants/${tenantId}/operations/cccccccc-cccc-4ccc-8ccc-cccccccccccc`];return Promise.all(urls.map(async url=>(await fetch(url,{credentials:'same-origin'})).status))},config.otherTenantId);assert.deepEqual(codes,[403,403]);await openOwnerInventory(page);
 });
 for(const width of [320,768,1440])await check(`Inventory ${width}px has square controls, contained document and keyboard focus`,async()=>{
  await page.setViewportSize({width,height:960});await page.getByRole('heading',{level:1}).focus();
  const shape=await page.evaluate(()=>{const nodes=[...document.querySelectorAll('button,input,a,table,td,th,.inventory-panel,.operation-state,.notice')].filter(n=>n.getBoundingClientRect().width>0);return {overflow:document.documentElement.scrollWidth>innerWidth,radii:nodes.flatMap(n=>{const c=getComputedStyle(n);return [c.borderTopLeftRadius,c.borderTopRightRadius,c.borderBottomLeftRadius,c.borderBottomRightRadius]}),smallControls:nodes.filter(n=>n.matches('button,input')&&n.getBoundingClientRect().height<44).length,h1Count:document.querySelectorAll('h1').length,motion:matchMedia('(prefers-reduced-motion: reduce)').matches}});
  assert.equal(shape.overflow,false);assert.equal(shape.smallControls,0);assert.equal(shape.h1Count,1);assert.equal(shape.motion,true);assert(shape.radii.every(value=>value==='0px'));
  for(let step=0;step<8;step++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>{const node=document.activeElement;if(!node||node===document.body)return true;const r=node.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&getComputedStyle(node).outlineStyle!=='none'}))}await screenshot(page,`inventory-${width}.png`);
 });
 await check('Light text and focus palette meet contrast thresholds',async()=>{await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});await textContrast(page)});
 await check('Dark mode preserves contrast, square controls and reduced motion',async()=>{await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});assert(await page.evaluate(()=>matchMedia('(prefers-color-scheme: dark)').matches));await textContrast(page);await screenshot(page,'inventory-dark.png')});
 for(const width of [320,768,1440])await check(`Text200% at ${width}px reflows without document or control clipping`,async()=>{
  await page.setViewportSize({width,height:960});await page.evaluate(()=>{document.documentElement.style.fontSize='32px'});
  const shape=await page.evaluate(()=>({font:getComputedStyle(document.documentElement).fontSize,overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('main>button,.inventory-form>button,.catalog-tools button')].filter(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth}).length}));assert.equal(shape.font,'32px');assert.equal(shape.overflow,false);assert.equal(shape.clipped,0);await screenshot(page,`inventory-text-200-percent-${width}.png`);await page.evaluate(()=>{document.documentElement.style.fontSize=''});
 });
 const writer=await dedicatedContext();const writerReads=[];writer.page.on('request',req=>{if(req.method()==='GET'&&/\/(?:inventory|stock-movements)(?:\?|$)/.test(new URL(req.url()).pathname))writerReads.push(req.url())});
 await check('A receive-only member reaches its form without inventory or movement reads',async()=>{
  await login(writer.page,config.writer);await writer.page.locator(`a[href="${inventoryPath}"]`).click();await writer.page.getByRole('heading',{level:1,name:'Inventario',exact:true}).waitFor();
  assert.equal(writerReads.length,0);assert.equal(await writer.page.getByLabel('Código del producto').count(),0);assert.equal(await writer.page.getByRole('table').count(),0);await writer.page.getByLabel('Referencia del producto').waitFor();
  await writer.page.getByLabel('Referencia del producto').fill(created.productId);await writer.page.getByLabel('Unidades recibidas').fill('3');await writer.page.getByLabel('Motivo de la recepción').fill('Miembro sintético autorizado');
  const received=writer.page.waitForResponse(res=>res.request().method()==='POST'&&new URL(res.url()).pathname===productsPath+'/'+created.productId+'/stock-receipts');await writer.page.getByRole('button',{name:'Registrar recepción',exact:true}).click();const reply=await received;assert.equal(reply.status(),201);assert.equal((await reply.json()).onHand,'10');await writer.page.getByRole('heading',{name:'Operación confirmada',exact:true}).waitFor();assert.equal(writerReads.length,0);await screenshot(writer.page,'inventory-member-receive-only.png');
 });
 await check('Readless member receives403 for inventory/movements and foreign company without content',async()=>{
  const statuses=await writer.page.evaluate(async({tenantId,otherId,productId})=>{const urls=[`/api/tenants/${tenantId}/inventory?limit=2`,`/api/tenants/${tenantId}/products/${productId}/stock-movements?limit=2`,`/api/tenants/${otherId}/operations?state=pending&limit=2`];return Promise.all(urls.map(async url=>{const res=await fetch(url,{credentials:'same-origin'});const body=await res.json();return {status:res.status,error:body.error,hasItems:Object.hasOwn(body,'items')}}))},{tenantId:config.tenant.id,otherId:config.otherTenantId,productId:created.productId});assert(statuses.every(item=>item.status===403&&item.error==='ACCESS_DENIED'&&!item.hasItems));
 });
 await check('Logout clears tab hints and company content, and the member session cannot read afterward',async()=>{
  for(const tab of [writer.page,page]){await tab.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await tab.getByLabel('Correo electrónico').waitFor();assert.equal((await assertHintShape(tab)).length,0);assert.equal(await tab.getByText(name,{exact:true}).count(),0);assert.equal(await tab.getByRole('table').count(),0)}
  const status=await writer.page.evaluate(async tenantId=>(await fetch(`/api/tenants/${tenantId}/operations?state=pending&limit=2`,{credentials:'same-origin'})).status,config.tenant.id);assert.equal(status,401);
 });
 await check('Browser has no JavaScript exception or external application request within the150request budget',async()=>{assert.equal(pageErrors,0);assert.equal(blockedOrigins.size,0);assert(requests<=150)});
 await Promise.allSettled(assetJobs);evidence.result='PASS';
}catch(error){
 evidence.result='FAIL';evidence.checks.push({name:currentCheck,result:'FAIL',errorType:error?.constructor?.name??'Error',...(typeof error?.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?{errorCode:error.code}:{})});
 // Avoid recording login forms or any failure text that could contain secrets.
 if(page&&!page.isClosed()&&!/login|initialization/i.test(currentCheck)){try{if(!await page.locator('input[type="password"]').count())await screenshot(page,'failure-state.png')}catch{}}
 process.exitCode=1;
}finally{
 await browser?.close();evidence.finishedAt=new Date().toISOString();evidence.requests=requests;evidence.httpCounts=Object.fromEntries(counts);
 await writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({result:evidence.result,passed:evidence.checks.filter(c=>c.result==='PASS').length,failed:evidence.checks.filter(c=>c.result==='FAIL').map(c=>c.name),evidence:path.relative(workspace,output)}));
}
