import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '../../.qa-private/browser/node_modules/playwright/index.mjs';

// Local layout evidence only. Every API response below is synthetic; this is
// deliberately separate from browser.mjs, which targets the real private QA.
const workspace = process.cwd();
const dist = path.join(workspace, 'client', 'dist-saas');
const output = path.join(workspace, '.qa-private', 'browser-layout');
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const filename = pathname === '/login' || pathname === '/cuenta/empresas' || /^\/app\/[a-f0-9-]+\/catalogo$/.test(pathname)
      ? 'saas.html' : decodeURIComponent(pathname).replace(/^\//, '');
    const resolved = path.resolve(dist, filename);
    assert(resolved.startsWith(`${dist}${path.sep}`));
    const content = await readFile(resolved);
    response.writeHead(200, { 'Content-Type': filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html', 'Cache-Control': 'no-store' });
    response.end(content);
  } catch { response.writeHead(404); response.end(); }
});
await mkdir(output, { recursive: true });
const assets = await readdir(path.join(dist, 'assets'));
const artifacts = Object.fromEntries(await Promise.all(['saas.html', ...assets.map(name => `assets/${name}`)].map(async name => [name, createHash('sha256').update(await readFile(path.join(dist, name))).digest('hex')])));
const evidence = { environment: 'LOCAL LAYOUT SIMULATION: API mocked; no PostgreSQL/TLS/session evidence', startedAt: new Date().toISOString(), node: process.version, artifacts, checks: [], screenshots: [] };
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: path.join(workspace, '.qa-private', 'browsers', 'chromium-1248', 'chrome-win64', 'chrome.exe'),
    args: ['--disable-background-networking', '--disable-component-update'], headless: true,
  });
  evidence.chromium = browser.version();
  const context = await browser.newContext({ viewport: { width: 320, height: 960 }, reducedMotion: 'reduce', locale: 'es-DO' });
  const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ctx = { identityId: 'fixture-a', purpose: 'company', contextVersion: '1' };
  let signedIn = false;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let data;
    if (url.pathname === '/api/auth/session' || url.pathname === '/api/auth/login') {
      if (url.pathname.endsWith('/login')) signedIn = true;
      data = signedIn ? { authenticated: true, csrfToken: 'synthetic-only', user: { id: 'fixture-a', email: 'ana@example.test' }, purpose: 'company', contextVersion: '1' } : { authenticated: false, csrfToken: 'synthetic-only' };
    } else if (url.pathname === '/api/tenants') data = { context: ctx, tenants: [{ id: tenantId, name: 'Taller Los Robles', dataEpoch: '1' }] };
    else if (url.pathname === '/api/auth/activity') data = { active: true };
    else if (url.pathname.includes('/catalog')) data = { context: ctx, tenantId, dataEpoch: '1', nextCursor: null, items: [
      { id: '1', sku: 'REP-001', name: 'Filtro de aceite' },
      { id: '2', sku: 'REP-002', name: 'Pastillas de freno delanteras' },
      { id: '3', sku: 'LUB-001', name: 'Aceite de motor sintético 5W-30' },
      { id: '4', sku: 'ACC-018', name: 'Juego de herramientas de precisión' },
    ] };
    else return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  let errors = 0;
  page.on('pageerror', () => { errors += 1; });
  await page.goto(`${origin}/login`);
  await page.getByLabel('Correo electrónico').waitFor();
  await page.screenshot({ path: path.join(output, 'login-320.png'), fullPage: true });
  evidence.screenshots.push('login-320.png');
  await page.getByLabel('Correo electrónico').fill('ana@example.test');
  await page.keyboard.press('Tab');
  assert(await page.getByLabel('Contraseña').evaluate(node => document.activeElement === node));
  await page.getByLabel('Contraseña').fill('synthetic-only-password');
  await page.keyboard.press('Enter');
  const company = page.getByRole('link', { name: /Taller Los Robles/ });
  await company.waitFor(); await company.focus(); await page.keyboard.press('Enter');
  await page.getByText('Filtro de aceite', { exact: true }).waitFor();
  evidence.checks.push({ name: 'Keyboard login and company selection with synthetic API', result: 'PASS' });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      radius: [...document.querySelectorAll('*')].filter(node => node.getBoundingClientRect().width > 0).map(node => {
        const css = getComputedStyle(node); return [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomLeftRadius, css.borderBottomRightRadius];
      }).flat(),
      controls: [...document.querySelectorAll('button, input')].every(node => node.getBoundingClientRect().height >= 44),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
    assert.equal(geometry.overflow, false); assert.equal(geometry.controls, true); assert.equal(geometry.reducedMotion, true);
    assert(geometry.radius.every(value => value === '0px'));
    const filename = `catalog-${width}.png`;
    await page.screenshot({ path: path.join(output, filename), fullPage: true });
    evidence.screenshots.push(filename);
    evidence.checks.push({ name: `Layout ${width}px: no overflow, all radii zero, controls at least44px, reduced motion`, result: 'PASS' });
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.screenshot({ path: path.join(output, 'catalog-dark.png'), fullPage: true });
  evidence.screenshots.push('catalog-dark.png');
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(output, 'catalog-text-200-percent.png'), fullPage: true });
  evidence.screenshots.push('catalog-text-200-percent.png');
  evidence.checks.push({ name: 'Text 200% layout stress; not a browser-zoom verification', result: 'PASS' });
  assert.equal(errors, 0);
  evidence.checks.push({ name: 'No page JavaScript exceptions', result: 'PASS' });
  evidence.result = 'PASS';
} catch (error) {
  evidence.result = 'FAIL'; evidence.errorType = error.constructor.name; process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  evidence.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
}
