// Loopback-only preview of documentation; never serves .env or application files.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.md':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  try {
    if(req.method!=='GET' && req.method!=='HEAD') {res.writeHead(405);return res.end();}
    let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(pathname==='/') pathname='/docs/project-map/index.html';
    const relative=pathname.slice(1);
    const target=path.resolve(root,relative);
    const safeRelative=path.relative(root,target).replaceAll('\\','/');
    const allowed=safeRelative==='DEPLOYMENT.md'||['docs/','.agentic/','tasks/'].some(prefix=>safeRelative.startsWith(prefix));
    const mime=types[path.extname(target)];
    if(!allowed || !mime || safeRelative.startsWith('../') || path.isAbsolute(safeRelative)) {res.writeHead(404);return res.end('Not found');}
    const bytes=await readFile(target);
    res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
    res.end(req.method==='HEAD'?undefined:bytes);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.listen(4174,'127.0.0.1',()=>console.log('Local documentation map: http://127.0.0.1:4174/docs/project-map/index.html'));
