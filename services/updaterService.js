import { privatePath } from '../scripts/publicationSafety.js';
import axios from 'axios';
import AdmZip from 'adm-zip';
import semver from 'semver';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'SrEdgarR/MECANET';
const maxZipSize = 250 * 1024 * 1024;
const maxExtractedSize = 500 * 1024 * 1024;
const rootFiles = new Set([
  '.env.example', 'package.json', 'package-lock.json', 'version.json', 'server.js',
  'start.cjs', 'wrapper.cjs', 'nodemon.json', 'README.md', 'CHANGELOG.md', 'LEEME-PRIMERO.txt', 'DETENER-MECANET.bat',
  'INICIAR-MECANET.bat', 'CONFIGURAR-INICIAL.bat'
]);
const folders = new Set([
  'config', 'controllers', 'middleware', 'models', 'routes',
  'services', 'scripts', 'docs', 'sistema'
]);
const requiredFiles = [
  'package.json', 'package-lock.json', 'version.json', 'server.js',
  'INICIAR-MECANET.bat', 'CONFIGURAR-INICIAL.bat',
  'sistema/iniciar-servidor.bat', 'scripts/check-release-update.js',
  'scripts/apply-release-update.ps1', 'client/dist/index.html'
];

export function validateReleaseArchive(zip, version) {
  if (!semver.valid(version)) throw new Error('Versión de Release inválida.');
  const entries = zip.getEntries();
  const names = new Set();
  let extractedSize = 0;

  if (entries.length === 0 || entries.length > 10000) {
    throw new Error('El ZIP contiene una cantidad de archivos inválida.');
  }
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    const segments = name.split('/').filter(Boolean);
    const clean = segments.join('/');
    if (!clean || name.startsWith('/') || name.includes('//') ||
        segments.some(part => part === '.' || part === '..' ||
          /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(part))) {
      throw new Error('Ruta no permitida en el ZIP: ' + name);
    }
    if (!rootFiles.has(clean) && !folders.has(segments[0]) &&
        !(segments[0] === 'client' &&
          (segments[1] === 'dist' || clean === 'client/package.json' || entry.isDirectory))) {
      throw new Error('Archivo no permitido en el ZIP: ' + name);
    }
    const attributes = entry.attr ?? entry.header.attr ?? 0;
    if (privatePath(clean) || ((attributes >>> 16) & 0xf000) === 0xa000 || (attributes & 0x400) ||
        !Number.isSafeInteger(entry.header.size) || entry.header.size < 0) {
      throw new Error('Archivo no permitido en el ZIP: ' + name);
    }
    if (names.has(clean.toLowerCase())) {
      throw new Error('Archivo duplicado en el ZIP: ' + name);
    }
    names.add(clean.toLowerCase());
    extractedSize += entry.header.size;
    if (extractedSize > maxExtractedSize) {
      throw new Error('El ZIP descomprimido excede el tamaño permitido.');
    }
  }
  for (const file of requiredFiles) {
    if (!names.has(file.toLowerCase())) throw new Error('Falta ' + file + ' en el ZIP.');
  }
  if (!zip.test()) throw new Error('El ZIP está dañado.');
  const pkg = JSON.parse(zip.readAsText('package.json'));
  const versionFile = JSON.parse(zip.readAsText('version.json'));
  if (pkg.version !== version || versionFile.version !== version) {
    throw new Error('La versión dentro del ZIP no coincide con el Release.');
  }
}

class UpdaterService {
  getCurrentVersion() {
    return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
  }

  async checkForUpdates() {
    const headers = {
      'User-Agent': 'MECANET-Updater',
      Accept: 'application/vnd.github+json'
    };
    if (process.env.GITHUB_READ_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_READ_TOKEN;
    const { data: release } = await axios.get(
      'https://api.github.com/repos/' + repository + '/releases/latest',
      { headers, timeout: 7000 }
    );
    const currentVersion = this.getCurrentVersion();
    const version = String(release.tag_name || '').replace(/^v/, '');
    if (!semver.valid(currentVersion) || !semver.valid(version)) {
      throw new Error('No se pudo comparar la versión instalada con el Release.');
    }
    const hasUpdate = semver.gt(version, currentVersion);
    const asset = hasUpdate
      ? release.assets?.find(item => item.name === 'MECANET-v' + version + '.zip' && item.state === 'uploaded')
      : null;
    return {
      hasUpdate, currentVersion, version,
      releaseNotes: release.body || 'Sin notas de versión.',
      name: release.name || 'v' + version,
      downloadUrl: asset?.browser_download_url || null,
      assetApiUrl: asset?.url || null,
      digest: asset?.digest || null
    };
  }

  async downloadAndApplyUpdate(update, launcher = 'INICIAR-MECANET.bat') {
    if (!['INICIAR-MECANET.bat', 'CONFIGURAR-INICIAL.bat'].includes(launcher)) {
      throw new Error('Lanzador de actualización inválido.');
    }
    if (!update?.hasUpdate || !semver.valid(update.version)) {
      throw new Error('No hay una actualización válida.');
    }
    if (!update.downloadUrl) throw new Error('El Release no incluye el ZIP de MECANET.');
    const url = new URL(update.downloadUrl);
    const expectedPath = '/SrEdgarR/MECANET/releases/download/v' + update.version +
      '/MECANET-v' + update.version + '.zip';
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' ||
        decodeURIComponent(url.pathname) !== expectedPath || url.search) {
      throw new Error('La URL del ZIP no pertenece al Release esperado.');
    }
    const readToken = process.env.GITHUB_READ_TOKEN;
    let downloadUrl = update.downloadUrl;
    const headers = { 'User-Agent': 'MECANET-Updater' };
    if (readToken) {
      if (!update.assetApiUrl) throw new Error('El Release no incluye la URL privada del ZIP.');
      const assetUrl = new URL(update.assetApiUrl);
      if (assetUrl.protocol !== 'https:' || assetUrl.hostname !== 'api.github.com' ||
          !/^\/repos\/SrEdgarR\/MECANET\/releases\/assets\/\d+$/.test(assetUrl.pathname) ||
          assetUrl.search) {
        throw new Error('La URL privada del ZIP no pertenece al repositorio esperado.');
      }
      downloadUrl = assetUrl.toString();
      headers.Accept = 'application/octet-stream';
      headers.Authorization = 'Bearer ' + readToken;
    }

    if (!/^sha256:[a-f0-9]{64}$/i.test(update.digest || '')) throw new Error('GitHub no proporcionó un SHA-256 verificable.');
    const stage = fs.mkdtempSync(path.join(rootDir, '.mecanet-update-'));
    try {
      console.log('Descargando y validando el ZIP del Release...');
      const { data } = await axios.get(downloadUrl, {
        responseType: 'arraybuffer', timeout: 120000,
        maxContentLength: maxZipSize, maxRedirects: 5,
        headers
      });
      const buffer = Buffer.from(data);
      if (!buffer.length || buffer.length > maxZipSize) throw new Error('Tamaño del ZIP inválido.');
      if (update.digest) {
        if (!/^sha256:[a-f0-9]{64}$/i.test(update.digest) ||
            'sha256:' + createHash('sha256').update(buffer).digest('hex') !== update.digest.toLowerCase()) {
          throw new Error('El hash SHA-256 del ZIP no coincide con GitHub.');
        }
      }
      const zip = new AdmZip(buffer);
      validateReleaseArchive(zip, update.version);
      const packageDir = path.join(stage, 'package');
      fs.mkdirSync(packageDir);
      zip.extractAllTo(packageDir, false);
      fs.copyFileSync(path.join(rootDir, 'scripts', 'apply-release-update.ps1'), path.join(stage, 'apply.ps1'));

      const child = spawn('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(stage, 'apply.ps1'),
        '-Root', rootDir, '-Stage', stage, '-WaitPid', String(process.pid), '-Launcher', launcher
      ], { cwd: rootDir, detached: true, stdio: 'inherit', windowsHide: true });
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      child.unref();
      console.log('ZIP validado. Preparando la instalación...');
      return { success: true, version: update.version };
    } catch (error) {
      fs.rmSync(stage, { recursive: true, force: true });
      throw error;
    }
  }
}

export default new UpdaterService();
