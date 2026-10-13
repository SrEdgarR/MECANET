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
const counts=new Map(),blockedOrigins=new Set(),assetJobs=[];let requests=0,tenantPosts=0,activityPosts=0,pageErrors=0,browser,page,currentCheck='initialization';
const hintsKey='mecanet.operation-hints.v1',inventoryPath=`/app/${config.tenant.id}/inventario`;
const productsPath=`/api/tenants/${config.tenant.id}/products`;
async function check(name,action){currentCheck=name;await action();evidence.checks.push({name,result:'PASS'})}
const ackError=code=>Object.assign(Error(code),{code});
async function privateCreateAck(request,expectedBody){
 // Playwright's route.fetch uses Node DNS, outside Chromium's host resolver.
 // Keep this one intercepted request on the verified local tunnel. Cookies and
 // CSRF headers remain in memory; native request errors are never logged.
 const deadline=performance.now()+8000,url=new URL(request.url()),body=request.postDataBuffer(),headers=await request.allHeaders();
 if(request.method()!=='POST'||url.origin!==config.baseUrl||url.pathname!==productsPath||url.search||url.hash||!body||body.length>65536)throw ackError('ACK_REQUEST_REJECTED');
 try{assert.deepEqual(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body)),expectedBody)}catch{throw ackError('ACK_BODY_REJECTED')}
 if(headers.host!==undefined&&headers.host!==url.host)throw ackError('ACK_HOST_REJECTED');
 if(!headers.cookie||!headers['x-csrf-token']||!/^\d{1,19}$/.test(headers['x-data-epoch']??'')||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(headers['idempotency-key']??''))throw ackError('ACK_HEADERS_REJECTED');
 if(performance.now()>=deadline)throw ackError('ACK_DEADLINE');
 return new Promise((resolve,reject)=>{
  let settled=false,timer;const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value)};
  const req=https.request({hostname:'app.mecanet.test',port:18443,path:productsPath,method:'POST',headers:{...headers,host:url.host,'content-length':String(body.length),'accept-encoding':'identity'},ca,rejectUnauthorized:true,servername:'app.mecanet.test',agent:false,
   lookup:(_host,options,callback)=>options.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4),
   checkServerIdentity:(hostname,certificate)=>{
    try{const invalid=tls.checkServerIdentity(hostname,certificate);if(invalid)return ackError('ACK_TLS_REJECTED');const cert=new X509Certificate(certificate.raw);return createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64')===config.spkiSha256?undefined:ackError('ACK_SPKI_REJECTED')}catch{return ackError('ACK_TLS_REJECTED')}
   }},res=>{
    const chunks=[];let bytes=0;
    res.on('data',chunk=>{bytes+=chunk.length;if(bytes>65536){req.destroy();done(ackError('ACK_RESPONSE_LIMIT'));return}chunks.push(chunk)});
    res.on('error',()=>done(ackError('ACK_RESPONSE_FAILED')));res.on('aborted',()=>done(ackError('ACK_RESPONSE_FAILED')));
    res.on('end',()=>{if(!res.complete||performance.now()>=deadline)return done(ackError('ACK_DEADLINE'));const status=res.statusCode;if(!Number.isInteger(status))return done(ackError('ACK_RESPONSE_FAILED'));const key=`POST ${productsPath.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi,':id')} ${status}`;counts.set(key,(counts.get(key)??0)+1);done(null,{status,headers:res.headers,body:Buffer.concat(chunks)})});
   });
  req.on('error',()=>done(ackError('ACK_TRANSPORT_FAILED')));
  timer=setTimeout(()=>{req.destroy();done(ackError('ACK_DEADLINE'))},Math.max(1,deadline-performance.now()));req.end(body);
 });
}
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
 tab.on('request',request=>{const pathname=new URL(request.url()).pathname;if(request.method()==='POST'&&pathname.startsWith('/api/tenants/'))tenantPosts++;if(request.method()==='POST'&&pathname==='/api/auth/activity')activityPosts++});
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
 const started=performance.now(),deadline=started+8000;
 const remaining=()=>{const milliseconds=Math.ceil(deadline-performance.now());assert(milliseconds>0,'FINITE_ACCESS_RECOVERY_EXHAUSTED');return milliseconds};
 const activity=()=>{
  const pending=tab.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/auth/activity',{timeout:remaining()});
  // The UI action can fail before this promise is awaited. Keep its original
  // rejection for the explicit await, but never let it crash result finalizing.
  pending.catch(()=>{});return pending;
 };
 async function recover(reply,stage){
  assert.equal(reply.status(),503);assert.equal((await reply.json()).error,'ADMISSION_BUSY');
  assert.equal(evidence.accessRecoveries?.length??0,0,'ONLY_ONE_EXPLICIT_ACCESS_RECOVERY_ALLOWED');
  const after=reply.headers()['retry-after'];assert.match(after??'',/^\d{1,6}$/);const retryAt=Date.now()+Number(after)*1000,before=postCount(),beforeActivity=activityPosts;
  await tab.getByRole('heading',{level:1,name:'Servicio no disponible',exact:true}).waitFor({timeout:remaining()});
  assert.equal(await tab.getByRole('table').count(),0);assert.equal(await tab.getByRole('link',{name:'Abrir inventario',exact:true}).count(),0);
  const retry=tab.getByRole('button',{name:'Reintentar acceso',exact:true});if(retryAt-Date.now()>100)assert.equal(await retry.isEnabled(),false);
  const directory=tab.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/tenants'&&response.status()===200,{timeout:remaining()});directory.catch(()=>{});
  await retry.click({timeout:remaining()});const refreshed=await directory,body=await refreshed.json();
  await tab.getByRole('heading',{level:1,name:'Tus empresas',exact:true}).waitFor({timeout:remaining()});
  const restored=body.tenants.find(tenant=>tenant.id===config.tenant.id);assert.equal(body.context.purpose,'company');
  assert(restored&&['catalog.read','inventory.read','catalog.create','inventory.receive'].every(permission=>restored.permissions.includes(permission)),'OWNER_GRANTS_CHANGED_DURING_RECOVERY');
  // The explicit UI retry revalidates session/directory. A fresh deep link then
  // performs authorized reads (interactive=false), never replays activity POST.
  await tab.goto(config.baseUrl+inventoryPath,{waitUntil:'domcontentloaded',timeout:remaining()});
  await tab.getByRole('heading',{level:1,name:'Inventario',exact:true}).waitFor({timeout:remaining()});
  assert.equal(postCount(),before);assert.equal(activityPosts,beforeActivity);remaining();
  evidence.accessRecoveries=[{stage,firstStatus:503,errorCode:'ADMISSION_BUSY',explicitRecoveries:1,deadlineMs:8000,elapsedMs:Math.ceil(performance.now()-started),extraTenantPosts:0,extraActivityPosts:0}];
 }
 await tab.getByRole('heading',{level:1,name:'Tus empresas',exact:true}).waitFor({timeout:remaining()});
 const company=tab.locator(`a[href="/app/${config.tenant.id}/catalogo"]`);
 assert.equal(await company.count(),1,'OWNER_CATALOG_ENTRY_REQUIRED');assert.equal(await company.isVisible(),true);
 const selected=activity();await company.focus();await tab.keyboard.press('Enter');
 const selection=await selected;if(selection.status()===503)return recover(selection,'catalog-selection');assert.equal(selection.status(),200);
 await tab.getByRole('heading',{level:1,name:'Catálogo'}).waitFor({timeout:remaining()});const entering=activity();
 await tab.getByRole('link',{name:'Abrir inventario'}).click({timeout:remaining()});const entry=await entering;
 if(entry.status()===503)return recover(entry,'inventory-entry');assert.equal(entry.status(),200);await tab.getByRole('heading',{level:1,name:'Inventario',exact:true}).waitFor({timeout:remaining()});
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
async function receiptMovements(tab,{name,productId,receipt}){
 // An admitted transient read failure is not a failed receipt. Exercise the
 // existing explicit UI recovery once, within one total eight-second window;
 // never repeat the mutation or silently turn a persistent failure into PASS.
 const started=performance.now(),deadline=started+8000,before=postCount();let recovery=0;
 const remaining=()=>{const milliseconds=Math.ceil(deadline-performance.now());assert(milliseconds>0,'FINITE_MOVEMENT_RECOVERY_EXHAUSTED');return milliseconds};
 const movementPath=productsPath+'/'+productId+'/stock-movements';
 async function read(){
  const pending=tab.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname===movementPath,{timeout:remaining()});
  await tab.getByRole('button',{name:`Movimientos de ${name}`,exact:true}).click({timeout:remaining()});return pending;
 }
 let reply=await read();
 if([429,503].includes(reply.status())){
  const firstStatus=reply.status(),after=reply.headers()['retry-after'];
  assert.match(after??'',/^\d{1,6}$/);const retryAt=Date.now()+Number(after)*1000;
  await tab.getByRole('heading',{level:1,name:firstStatus===429?'Límite temporal':'Servicio no disponible',exact:true}).waitFor({timeout:remaining()});
  assert.equal(await tab.getByRole('table').count(),0);assert.equal(await tab.getByText(name,{exact:true}).count(),0);assert.equal(postCount(),before);
  const retry=tab.getByRole('button',{name:'Reintentar acceso',exact:true});
  if(retryAt-Date.now()>100)assert.equal(await retry.isEnabled(),false);
  // Playwright waits for the existing disabled control to become actionable;
  // the click itself is a single explicit user action, not an automatic GET.
  await retry.click({timeout:remaining()});recovery++;
  await tab.getByRole('heading',{level:1,name:'Tus empresas',exact:true}).waitFor({timeout:remaining()});
  await tab.locator(`a[href="/app/${config.tenant.id}/catalogo"]`).click({timeout:remaining()});
  await tab.getByRole('heading',{level:1,name:'Catálogo',exact:true}).waitFor({timeout:remaining()});
  await tab.getByRole('link',{name:'Abrir inventario',exact:true}).click({timeout:remaining()});
  await tab.getByRole('heading',{level:1,name:'Inventario',exact:true}).waitFor({timeout:remaining()});
  reply=await read();assert.equal(reply.status(),200,'EXPLICIT_MOVEMENT_RECOVERY_FAILED');
  evidence.readRecoveries??=[];evidence.readRecoveries.push({read:'stock-movements',firstStatus,recoveredStatus:reply.status(),explicitRecoveries:recovery,deadlineMs:8000,elapsedMs:Math.ceil(performance.now()-started),extraTenantPosts:postCount()-before});
 }
 assert.equal(reply.status(),200);const body=await reply.json();assert.equal(body.tenantId,config.tenant.id);assert.equal(body.dataEpoch,receipt.dataEpoch);assert.equal(body.items.length,1);
 const movement=body.items[0];assert.equal(movement.id,receipt.movementId);assert.equal(movement.operationId,receipt.operationId);assert.equal(movement.productId,productId);assert.equal(movement.quantity,'7');assert.equal(movement.onHandAfter,'7');assert.equal(movement.balanceVersion,'2');
 await tab.getByText('7 unidades recibidas',{exact:true}).waitFor({timeout:remaining()});assert.equal(await tab.locator('.movement-list li').count(),1);assert.equal(postCount(),before);remaining();
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
async function inventoryLegibility(tab){
 const region=tab.getByRole('region',{name:'Existencias de productos',exact:true});
 const geometry=await region.evaluate(node=>{
  const first=node.querySelector('tbody tr'),cells=[...first.cells],content=cells.slice(0,2).map(cell=>{const css=getComputedStyle(cell);return {width:cell.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),minimum:parseFloat(css.fontSize)*.65*12}});
  return {content,documentOverflow:document.documentElement.scrollWidth>innerWidth,scrollable:node.scrollWidth>node.clientWidth,headers:[...node.querySelectorAll('th')].map(cell=>{const range=document.createRange();range.selectNodeContents(cell);return {textHeight:range.getBoundingClientRect().height,maximum:parseFloat(getComputedStyle(cell).lineHeight)*3}})};
 });
 assert.equal(geometry.documentOverflow,false);assert(geometry.content.every(cell=>cell.width>=cell.minimum),'Inventory code/name columns collapsed into single-character lines');assert(geometry.headers.every(cell=>cell.textHeight<=cell.maximum),'Inventory headers are vertically fragmented');
 await region.focus();assert(await region.evaluate(node=>document.activeElement===node));
 if(geometry.scrollable){await region.evaluate(node=>{node.scrollLeft=0});await tab.keyboard.press('ArrowRight');await region.evaluate(node=>new Promise((resolve,reject)=>{const started=performance.now();const inspect=()=>node.scrollLeft>0?resolve():performance.now()-started>1000?reject(Error('REGION_KEYBOARD_SCROLL_FAILED')):requestAnimationFrame(inspect);inspect()}))}
 const actions=region.locator('tbody tr').first().getByRole('button');
 for(let index=0;index<await actions.count();index++){
  const button=actions.nth(index);await tab.keyboard.press('Tab');
  const box=await button.evaluate(node=>{const control=node.getBoundingClientRect(),region=node.closest('.table-region').getBoundingClientRect(),css=getComputedStyle(node),ring=parseFloat(css.outlineWidth)+parseFloat(css.outlineOffset);return {focused:document.activeElement===node,left:control.left,right:control.right,regionLeft:region.left,regionRight:region.right,ring,outline:css.outlineStyle}});
  assert.equal(box.focused,true);assert.notEqual(box.outline,'none');assert(box.left-box.ring>=box.regionLeft-1&&box.right+box.ring<=box.regionRight+1,'Focused inventory action/ring clipped by its scroll region');
 }
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
  await receiptMovements(page,{name,productId:created.productId,receipt:result});await screenshot(page,'inventory-received.png');
 });
 let lostOperation;const lostSku='ACK-'+randomUUID().slice(0,8).toUpperCase(),lostName='ACK sintético '+lostSku;
 await check('A received server ACK lost only toward the browser keeps a query hint and never re-POSTs on reload',async()=>{
  let intercepted=0,unexpectedStatus=false,interceptionFailure,finishInterception;
  const interceptionDone=new Promise(resolve=>{finishInterception=resolve});
  const interception=async route=>{
   try{if(route.request().method()!=='POST')return await route.continue();intercepted++;const response=await privateCreateAck(route.request(),{sku:lostSku,name:lostName});
    if(response.status!==201){unexpectedStatus=true;return await route.fulfill({status:response.status,headers:response.headers,body:response.body})}
    lostOperation=JSON.parse(response.body.toString('utf8'));await route.abort('failed');
   }catch(error){interceptionFailure=/^ACK_[A-Z_]+$/.test(error.code??'')?error.code:'ACK_CALLBACK_FAILED';try{await route.abort('failed')}catch{}}
   finally{finishInterception()}
  };
  await page.route(config.baseUrl+productsPath,interception);
  await page.getByLabel('Código del producto').fill(lostSku);await page.getByLabel('Nombre del producto').fill(lostName);await page.getByRole('button',{name:'Crear producto',exact:true}).click();
  await page.getByRole('heading',{name:'Resultado incierto',exact:true}).waitFor();
  let callbackTimer;try{await Promise.race([interceptionDone,new Promise((_resolve,reject)=>{callbackTimer=setTimeout(()=>reject(ackError('ACK_CALLBACK_DEADLINE')),8000)})])}finally{clearTimeout(callbackTimer)}
  if(interceptionFailure){evidence.ackHarnessFailure=interceptionFailure;throw ackError(interceptionFailure)}assert.equal(unexpectedStatus,false);assert.equal(intercepted,1);assert.equal(lostOperation.state,'CONFIRMED');
  const hints=await assertHintShape(page);assert(hints.some(h=>h.operationId===lostOperation.operationId&&h.tenantId===config.tenant.id));
  await screenshot(page,'inventory-client-ack-lost.png');const before=postCount();await page.unroute(config.baseUrl+productsPath,interception);
  const recovered=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname===`/api/tenants/${config.tenant.id}/operations/${lostOperation.operationId}`);
  await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{level:1,name:'Inventario',exact:true}).waitFor();const queried=await recovered;assert.equal(queried.status(),200);assert.equal((await queried.json()).state,'CONFIRMED');
  await page.waitForFunction(({key,id})=>!JSON.parse(sessionStorage.getItem(key)??'[]').some(hint=>hint.operationId===id),{key:hintsKey,id:lostOperation.operationId});
  assert.equal(postCount(),before);assert.equal(await page.getByRole('button',{name:'Reenviar la misma operación',exact:true}).count(),0);assert.equal((await assertHintShape(page)).length,0);const row=await ownRow(page,lostName);assert.equal(await row.count(),1);
  evidence.clientLostAckScope='An exact-CA/SNI/SPKI Node transport through the private loopback received a real201 then dropped only the browser ACK. Backend COMMIT uncertainty and reservation reconciliation require separate SQL tests.';
 });
 await check('Company change hides all company content and foreign direct operations are denied',async()=>{
  await page.getByRole('button',{name:'Cambiar empresa',exact:true}).click();await page.getByRole('heading',{level:1,name:'Tus empresas'}).waitFor();assert.equal(await page.getByText(name,{exact:true}).count(),0);assert.equal(await page.getByText(lostName,{exact:true}).count(),0);
  const codes=await page.evaluate(async tenantId=>{const urls=[`/api/tenants/${tenantId}/operations?state=pending&limit=2`,`/api/tenants/${tenantId}/operations/cccccccc-cccc-4ccc-8ccc-cccccccccccc`];return Promise.all(urls.map(async url=>(await fetch(url,{credentials:'same-origin'})).status))},config.otherTenantId);assert.deepEqual(codes,[403,403]);await openOwnerInventory(page);
 });
 for(const width of [320,768,1440])await check(`Inventory ${width}px has square controls, contained document and keyboard focus`,async()=>{
  await page.setViewportSize({width,height:960});await page.getByRole('heading',{level:1}).focus();
  const shape=await page.evaluate(()=>{const nodes=[...document.querySelectorAll('button,input,a,table,td,th,.inventory-panel,.operation-state,.notice')].filter(n=>n.getBoundingClientRect().width>0);return {overflow:document.documentElement.scrollWidth>innerWidth,radii:nodes.flatMap(n=>{const c=getComputedStyle(n);return [c.borderTopLeftRadius,c.borderTopRightRadius,c.borderBottomLeftRadius,c.borderBottomRightRadius]}),smallControls:nodes.filter(n=>n.matches('button,input')&&n.getBoundingClientRect().height<44).length,h1Count:document.querySelectorAll('h1').length,motion:matchMedia('(prefers-reduced-motion: reduce)').matches}});
  assert.equal(shape.overflow,false);assert.equal(shape.smallControls,0);assert.equal(shape.h1Count,1);assert.equal(shape.motion,true);assert(shape.radii.every(value=>value==='0px'));
  for(let step=0;step<8;step++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>{const node=document.activeElement;if(!node||node===document.body)return true;const r=node.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&getComputedStyle(node).outlineStyle!=='none'}))}await inventoryLegibility(page);await screenshot(page,`inventory-${width}.png`);
 });
 await check('Light text and focus palette meet contrast thresholds',async()=>{await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});await textContrast(page)});
 await check('Dark mode preserves contrast, square controls and reduced motion',async()=>{await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});assert(await page.evaluate(()=>matchMedia('(prefers-color-scheme: dark)').matches));await textContrast(page);await screenshot(page,'inventory-dark.png')});
 for(const width of [320,768,1440])await check(`Text200% at ${width}px reflows without document or control clipping`,async()=>{
  await page.setViewportSize({width,height:960});await page.evaluate(()=>{document.documentElement.style.fontSize='32px'});
  const shape=await page.evaluate(()=>({font:getComputedStyle(document.documentElement).fontSize,overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('main>button,.inventory-form>button,.catalog-tools button')].filter(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth}).length}));assert.equal(shape.font,'32px');assert.equal(shape.overflow,false);assert.equal(shape.clipped,0);await inventoryLegibility(page);await screenshot(page,`inventory-text-200-percent-${width}.png`);await page.evaluate(()=>{document.documentElement.style.fontSize=''});
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
 if(page&&!page.isClosed())try{evidence.failureState=await page.evaluate(()=>({pathname:location.pathname,heading:document.querySelector('h1')?.textContent,companyLinks:[...document.querySelectorAll('.tenant-list a')].map(node=>new URL(node.href).pathname),tables:document.querySelectorAll('table').length,retryVisible:[...document.querySelectorAll('button')].some(node=>node.textContent==='Reintentar acceso')}))}catch{}
 // Avoid recording login forms or any failure text that could contain secrets.
 if(page&&!page.isClosed()&&!/login|initialization/i.test(currentCheck)){try{if(!await page.locator('input[type="password"]').count())await screenshot(page,'failure-state.png')}catch{}}
 process.exitCode=1;
}finally{
 await browser?.close();evidence.finishedAt=new Date().toISOString();evidence.requests=requests;evidence.httpCounts=Object.fromEntries(counts);
 await writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({result:evidence.result,passed:evidence.checks.filter(c=>c.result==='PASS').length,failed:evidence.checks.filter(c=>c.result==='FAIL').map(c=>c.name),evidence:path.relative(workspace,output)}));
}
