import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import axios from 'axios';
import semver from 'semver';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import UpdaterService, { validateReleaseArchive } from '../services/updaterService.js';

const version = semver.inc(UpdaterService.getCurrentVersion(), 'patch');
const required = [
  'package.json', 'package-lock.json', 'version.json', 'server.js',
  'INICIAR-MECANET.bat', 'CONFIGURAR-INICIAL.bat',
  'sistema/iniciar-servidor.bat', 'scripts/check-release-update.js',
  'scripts/apply-release-update.ps1', 'client/dist/index.html'
];

function releaseZip() {
  const zip = new AdmZip();
  for (const name of required) {
    const data = name === 'package.json' || name === 'version.json'
      ? JSON.stringify({ version })
      : 'contenido';
    zip.addFile(name, Buffer.from(data));
  }
  return zip;
}

test('acepta el ZIP del Release con la version esperada', () => {
  assert.doesNotThrow(() => validateReleaseArchive(releaseZip(), version));
});

test('rechaza rutas ajenas, archivos locales y versiones distintas', () => {
  const outside = releaseZip();
  outside.getEntry('server.js').entryName = '../server.js';
  assert.throws(() => validateReleaseArchive(outside, version), /Ruta no permitida/);

  const localConfig = releaseZip();
  localConfig.addFile('.env', Buffer.from('secreto'));
  assert.throws(() => validateReleaseArchive(localConfig, version), /Archivo no permitido/);

  assert.throws(() => validateReleaseArchive(releaseZip(), semver.inc(version, 'patch')), /no coincide/);
});

test('compara la version local con el ultimo Release de SrEdgarR/MECANET', async () => {
  const originalGet = axios.get;
  let requestedUrl;
  axios.get = async url => {
    requestedUrl = url;
    return { data: {
      tag_name: 'v' + version,
      name: 'v' + version,
      body: 'Cambio visible',
      assets: [{
        name: 'MECANET-v' + version + '.zip',
        state: 'uploaded',
        browser_download_url: 'https://github.com/SrEdgarR/MECANET/releases/download/v' + version + '/MECANET-v' + version + '.zip'
      }]
    } };
  };
  try {
    const update = await UpdaterService.checkForUpdates();
    assert.equal(requestedUrl, 'https://api.github.com/repos/SrEdgarR/MECANET/releases/latest');
    assert.equal(update.hasUpdate, true);
    assert.equal(update.currentVersion, UpdaterService.getCurrentVersion());
    assert.equal(update.releaseNotes, 'Cambio visible');
    assert.ok(update.downloadUrl.endsWith('MECANET-v' + version + '.zip'));
  } finally {
    axios.get = originalGet;
  }
});

test('rechaza un enlace de descarga externo', async () => {
  await assert.rejects(
    UpdaterService.downloadAndApplyUpdate({
      hasUpdate: true,
      version,
      downloadUrl: 'https://example.com/archivo.zip'
    }),
    /URL del ZIP/
  );
});

test('instala en una carpeta aislada y conserva .env', { skip: process.platform !== 'win32' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mecanet-update-fixture-'));
  const stage = path.join(root, '.mecanet-update-ABC123');
  const packageDir = path.join(stage, 'package');
  try {
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
      name: 'mecanet-update-fixture', version: '1.0.1'
    }));
    fs.writeFileSync(path.join(packageDir, 'package-lock.json'), JSON.stringify({
      name: 'mecanet-update-fixture', version: '1.0.1',
      lockfileVersion: 3, requires: true,
      packages: { '': { name: 'mecanet-update-fixture', version: '1.0.1' } }
    }));
    fs.writeFileSync(path.join(packageDir, 'nuevo.txt'), 'nuevo');
    fs.writeFileSync(path.join(root, '.env'), 'local');
    fs.writeFileSync(path.join(root, 'INICIAR-MECANET.bat'),
      '@echo off\r\necho iniciado>"%~dp0iniciado.txt"\r\n');
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'apply-release-update.ps1');
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
      '-Root', root, '-Stage', stage, '-WaitPid', '0', '-Launcher', 'INICIAR-MECANET.bat'
    ], { encoding: 'utf8', input: '\n', timeout: 30000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (let i = 0; i < 50 && !fs.existsSync(path.join(root, 'iniciado.txt')); i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(fs.readFileSync(path.join(root, 'nuevo.txt'), 'utf8'), 'nuevo');
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'local');
    assert.ok(fs.existsSync(path.join(root, 'iniciado.txt')), result.stdout + result.stderr);
    assert.ok(fs.existsSync(stage), 'rollback files remain available for manual recovery');
  } finally {
    if (path.dirname(root) !== os.tmpdir() ||
        !path.basename(root).startsWith('mecanet-update-fixture-')) {
      throw new Error('Ruta temporal inesperada.');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
