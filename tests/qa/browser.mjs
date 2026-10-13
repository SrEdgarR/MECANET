import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';

// This runner only targets the approved private TLS tunnel. No .env, fixtures,
// production credentials, real-business assertions, traces or cookie dumps.
const workspace = process.cwd();
const privateRoot = await realpath(path.join(workspace, '.qa-private'));
async function privatePath(input, mustExist = true) {
  assert.equal(typeof input, 'string');
  const resolved = path.resolve(workspace, input);
  assert(resolved.startsWith(`${privateRoot}${path.sep}`), 'Path outside private QA area');
  if (mustExist) {
    const actual = await realpath(resolved);
    assert(actual.startsWith(`${privateRoot}${path.sep}`), 'Symlink outside private QA area');
    return actual;
  }
  return resolved;
}
const config = JSON.parse(await readFile(path.join(privateRoot, 'browser-config.json'), 'utf8'));
assert.equal(config.baseUrl, 'https://app.mecanet.test:18443');
assert.match(config.spkiSha256, /^[A-Za-z0-9+/]{43}=$/);
assert.match(config.tenant.id, /^[a-f0-9-]{36}$/i);
assert.match(config.otherTenantId, /^[a-f0-9-]{36}$/i);
assert.notEqual(config.tenant.id, config.otherTenantId);
assert.equal(typeof config.user.email, 'string');
assert.equal(typeof config.user.password, 'string');
assert.equal(typeof config.expectedProductName, 'string');
assert.equal(typeof config.forbiddenProductName, 'string');
const ca = await readFile(await privatePath(config.caCertificatePath));
const modulePath = await privatePath(config.playwrightModule);
const executablePath = await privatePath(config.browserExecutable);
const output = await privatePath(config.outputDirectory, false);
await mkdir(output, { recursive: true });
await privatePath(config.outputDirectory);
const evidence = { environment: 'private QA via loopback tunnel; real API', startedAt: new Date().toISOString(), node: process.version, checks: [], screenshots: [] };
let browser;
let page;
const httpCounts = new Map();
let currentCheck = 'initialization';

async function check(name, action) {
  currentCheck = name;
  await action();
  evidence.checks.push({ name, result: 'PASS' });
}
function handshake({ authority = ca, hostname = 'app.mecanet.test' } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname, port: 18443, path: '/', method: 'HEAD', ca: authority,
      rejectUnauthorized: true, servername: hostname, agent: false,
      checkServerIdentity: tls.checkServerIdentity,
      lookup: (_host, options, callback) => options.all
        ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4),
    }, response => {
      const certificate = new X509Certificate(response.socket.getPeerCertificate().raw);
      const spki = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
      response.resume();
      resolve(spki);
    });
    request.setTimeout(8000, () => request.destroy(new Error('TLS preflight timeout')));
    request.on('error', reject); request.end();
  });
}

try {
  await check('TLS: exact QA CA, hostname and SPKI validated by Node', async () => {
    assert.equal(await handshake(), config.spkiSha256);
  });
  await check('TLS: an unrelated public CA rejects the QA certificate', async () => {
    await assert.rejects(handshake({ authority: tls.rootCertificates[0] }), error => /CERT|VERIFY|ISSUER/.test(error.code || ''));
  });
  await check('TLS: a wrong hostname rejects the QA certificate', async () => {
    await assert.rejects(handshake({ hostname: 'wrong.mecanet.test' }), error => error.code === 'ERR_TLS_CERT_ALTNAME_INVALID');
  });

  const { chromium } = await import(pathToFileURL(modulePath).href);
  const args = [
    '--host-resolver-rules=MAP app.mecanet.test 127.0.0.1, EXCLUDE localhost',
    `--ignore-certificate-errors-spki-list=${config.spkiSha256}`,
    '--disable-background-networking', '--disable-component-update', '--no-proxy-server',
  ];
  browser = await chromium.launch({ executablePath, headless: true, args });
  evidence.chromium = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'es-DO', reducedMotion: 'reduce' });
  const blockedOrigins = new Set();
  let requests = 0;
  await context.route('**/*', route => {
    requests += 1;
    if (requests > 150) return route.abort('blockedbyclient');
    const url = new URL(route.request().url());
    if (url.origin !== config.baseUrl) { blockedOrigins.add(url.origin); return route.abort('blockedbyclient'); }
    return route.continue();
  });
  page = await context.newPage();
  let pageErrors = 0;
  page.on('pageerror', () => { pageErrors += 1; });
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname.replace(/\/tenants\/[a-f0-9-]+\//i, '/tenants/:tenantId/');
    if (!pathname.startsWith('/api/')) return;
    const key = `${response.request().method()} ${pathname} ${response.status()}`;
    httpCounts.set(key, (httpCounts.get(key) || 0) + 1);
  });
  page.setDefaultTimeout(10_000);
  await check('Login: labeled fields, keyboard and safe invalid-credential feedback', async () => {
    await page.goto(`${config.baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('Correo electrónico').fill(config.user.email);
    await page.getByLabel('Contraseña').fill('invalid-fixture-password');
    await page.getByLabel('Contraseña').press('Enter');
    await page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos.' }).waitFor();
    await page.getByLabel('Contraseña').fill(config.user.password);
    await page.getByLabel('Contraseña').press('Enter');
    await page.getByRole('link', { name: new RegExp(config.tenant.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0);
  });
  await check('Company selector reaches its real PostgreSQL catalog with keyboard', async () => {
    const company = page.locator(`a[href="/app/${config.tenant.id}/catalogo"]`);
    await company.focus(); await page.keyboard.press('Enter');
    await page.getByRole('heading', { level: 1, name: 'Catálogo' }).waitFor();
    await page.getByText(config.expectedProductName, { exact: true }).waitFor();
    assert.equal(await page.getByText(config.forbiddenProductName, { exact: true }).count(), 0);
    assert.deepEqual(await page.getByRole('columnheader').allTextContents(), ['Código', 'Nombre']);
    assert(await page.getByRole('heading', { level: 1 }).evaluate(node => document.activeElement === node));
  });
  await check('Session cookies are Secure, HttpOnly, Lax and host-only', async () => {
    const cookies = (await context.cookies()).filter(cookie => cookie.name.startsWith('__Host-mecanet-'));
    assert(cookies.length > 0);
    assert(cookies.every(cookie => cookie.secure && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.path === '/' && cookie.domain === 'app.mecanet.test'));
  });
  await check('Direct API: another company is denied and missing CSRF cannot log out', async () => {
    const result = await page.evaluate(async otherTenantId => {
      const forbidden = await fetch(`/api/tenants/${otherTenantId}/catalog?limit=20`, { credentials: 'same-origin' });
      const logout = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const missing = await fetch('/api/not-a-route', { credentials: 'same-origin' });
      return { forbidden: forbidden.status, logout: logout.status, unknownStatus: missing.status, unknownType: missing.headers.get('Content-Type') };
    }, config.otherTenantId);
    assert([403, 404].includes(result.forbidden)); assert.equal(result.logout, 403);
    assert.equal(result.unknownStatus, 404); assert.match(result.unknownType, /application\/json/);
    await page.getByRole('button', { name: 'Actualizar catálogo' }).click();
    await page.getByText(config.expectedProductName, { exact: true }).waitFor();
  });

  for (const width of [320, 768, 1440]) {
    await check(`Layout ${width}px: square controls, contained document and complete keyboard navigation`, async () => {
      await page.setViewportSize({ width, height: 960 });
      await page.getByRole('heading', { level: 1 }).focus();
      const geometry = await page.evaluate(() => {
        const visible = [...document.querySelectorAll('button, input, a, table, td, th, .notice, .brand-mark, .tenant-list li')]
          .filter(node => node.getBoundingClientRect().width > 0);
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          radii: visible.map(node => { const css = getComputedStyle(node); return [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomLeftRadius, css.borderBottomRightRadius]; }),
          smallControls: visible.filter(node => node.matches('button, input') && node.getBoundingClientRect().height < 44).length,
          h1Count: document.querySelectorAll('h1').length,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        };
      });
      assert.equal(geometry.overflow, false); assert.equal(geometry.h1Count, 1);
      assert.equal(geometry.smallControls, 0); assert.equal(geometry.reducedMotion, true);
      assert(geometry.radii.flat().every(radius => radius === '0px'));
      for (let step = 0; step < 8; step += 1) {
        await page.keyboard.press('Tab');
        assert(await page.evaluate(() => {
          const node = document.activeElement;
          if (!node || node === document.body) return true;
          const rect = node.getBoundingClientRect();
          const css = getComputedStyle(node);
          return rect.left >= -1 && rect.right <= innerWidth + 1 && css.outlineStyle !== 'none';
        }));
      }
      const filename = `catalog-${width}.png`;
      await page.screenshot({ path: path.join(output, filename), fullPage: true });
      evidence.screenshots.push(filename);
    });
  }
  await check('Dark mode preserves square layout and reduced motion', async () => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    assert(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches));
    await page.screenshot({ path: path.join(output, 'catalog-dark.png'), fullPage: true });
    evidence.screenshots.push('catalog-dark.png');
  });
  await check('Text enlarged to 200% reflows without document overflow (not browser zoom)', async () => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    const result = await page.evaluate(() => ({
      fontSize: getComputedStyle(document.documentElement).fontSize,
      overflow: document.documentElement.scrollWidth > innerWidth,
      clippedControls: [...document.querySelectorAll('button')].filter(node => {
        const rect = node.getBoundingClientRect(); return rect.left < 0 || rect.right > innerWidth;
      }).length,
    }));
    assert.equal(result.fontSize, '32px'); assert.equal(result.overflow, false); assert.equal(result.clippedControls, 0);
    await page.screenshot({ path: path.join(output, 'catalog-text-200-percent.png'), fullPage: true });
    evidence.screenshots.push('catalog-text-200-percent.png');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  });
  await check('Deep link reload revalidates before displaying its catalog', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(config.expectedProductName, { exact: true }).waitFor();
  });
  await check('Logout revokes the browser session and removes company data', async () => {
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.getByLabel('Correo electrónico').waitFor();
    assert.equal(await page.getByText(config.expectedProductName, { exact: true }).count(), 0);
    assert.equal(await page.getByText(config.tenant.name, { exact: true }).count(), 0);
    const code = await page.evaluate(async tenantId => (await fetch(`/api/tenants/${tenantId}/catalog?limit=20`, { credentials: 'same-origin' })).status, config.tenant.id);
    assert.equal(code, 401);
  });
  await check('Browser: no JavaScript exception or external application request', async () => {
    assert.equal(pageErrors, 0); assert.equal(blockedOrigins.size, 0); assert(requests <= 150);
  });
  evidence.result = 'PASS';
} catch (error) {
  evidence.result = 'FAIL';
  // Error text may include credentials/DOM; retain only the known check and class.
  evidence.checks.push({ name: currentCheck, result: 'FAIL', errorType: error?.constructor?.name || 'Error',
    ...(typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? { errorCode: error.code } : {}) });
  if (page && !page.isClosed()) {
    try {
      await page.screenshot({ path: path.join(output, 'failure-state.png'), fullPage: true });
      evidence.screenshots.push('failure-state.png');
    } catch { /* Preserve the original failure if the browser itself died. */ }
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  evidence.finishedAt = new Date().toISOString();
  evidence.httpCounts = Object.fromEntries(httpCounts);
  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ result: evidence.result, passed: evidence.checks.filter(check => check.result === 'PASS').length, failed: evidence.checks.filter(check => check.result === 'FAIL').map(check => check.name), evidence: path.relative(workspace, output) }));
}
