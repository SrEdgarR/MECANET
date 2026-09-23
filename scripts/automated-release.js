import fs from 'fs';
import { publicSourceFiles, assertPublicBytes, localSecrets, buildEnvironment } from './publicationSafety.js';
import os from 'node:os';
import path from 'path';
import { execFileSync, execSync } from 'child_process';
import readline from 'readline';
import axios from 'axios';
import AdmZip from 'adm-zip';
import semver from 'semver';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { validateReleaseArchive } from '../services/updaterService.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'SrEdgarR/MECANET';
dotenv.config({ path: path.join(rootDir, '.env') });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = prompt => new Promise(resolve => rl.question(prompt, resolve));
const git = (...args) => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const headers = {
  Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'MECANET-Release-Publisher'
};

async function main() {
  try {
    if (!process.env.GITHUB_TOKEN) throw new Error('Configure GITHUB_TOKEN antes de publicar.');
    const remote = git('remote', 'get-url', 'origin');
    if (!/^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)SrEdgarR\/MECANET(?:\.git)?$/i.test(remote)) {
      throw new Error('El remoto origin debe apuntar a SrEdgarR/MECANET.');
    }
    if (git('status', '--porcelain')) {
      throw new Error('Confirme o guarde los cambios locales antes de publicar.');
    }
    const branch = git('branch', '--show-current');
    if (!branch) throw new Error('No se puede publicar desde un HEAD sin rama.');

    const packagePath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (!semver.valid(pkg.version)) throw new Error('La version actual no es valida.');
    console.log('Version actual: v' + pkg.version);
    const typeArg = process.argv.indexOf('--type');
    const type = typeArg >= 0
      ? process.argv[typeArg + 1]
      : (await question('Tipo de Release (patch/minor/major) [patch]: ')).trim() || 'patch';
    if (!['patch', 'minor', 'major'].includes(type)) throw new Error('Tipo de Release invalido.');
    const version = semver.inc(pkg.version, type);
    console.log('Nueva version: v' + version);
    console.log('Escriba las notas del Release. Termine con una linea vacia:');
    const lines = [];
    while (true) {
      const line = await question('> ');
      if (!line.trim()) break;
      lines.push(line);
    }
    const notes = lines.join('\n').trim();
    if (!notes) throw new Error('Las notas de cambios son obligatorias.');
    if ((await question('Publicar v' + version + ' en ' + repository + '? [S/N]: ')).trim().toLowerCase() !== 's') {
      console.log('Publicacion cancelada.');
      return;
    }

    pkg.version = version;
    writeJson(packagePath, pkg);
    const versionPath = path.join(rootDir, 'version.json');
    writeJson(versionPath, {
      version,
      lastUpdated: new Date().toISOString().slice(0, 10),
      releaseNotes: notes
    });
    const clientPackagePath = path.join(rootDir, 'client', 'package.json');
    const clientPkg = JSON.parse(fs.readFileSync(clientPackagePath, 'utf8'));
    clientPkg.version = version;
    writeJson(clientPackagePath, clientPkg);

    // Reject accidental tracked secrets before any upload or build.
    const secrets = localSecrets(rootDir);
    for (const { relative, file } of publicSourceFiles(rootDir)) assertPublicBytes(relative, fs.readFileSync(file), secrets);
    console.log('Actualizando lockfile y creando ZIP...');
    execSync('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', {
      cwd: rootDir, stdio: 'inherit', env: buildEnvironment(os.tmpdir())
    });
    execSync('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', {
      cwd: path.join(rootDir, 'client'), stdio: 'inherit', env: buildEnvironment(os.tmpdir())
    });
    execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'create-release-zip.js')], {
      cwd: rootDir, stdio: 'inherit'
    });
    const zipPath = path.join(rootDir, 'distribucion', 'MECANET-v' + version + '.zip');
    if (!fs.existsSync(zipPath)) throw new Error('No se genero el ZIP del Release.');
    validateReleaseArchive(new AdmZip(zipPath), version);

    git('add', '--', 'package.json', 'package-lock.json', 'version.json',
      'client/package.json', 'client/package-lock.json');
    git('commit', '-m', 'Release v' + version);
    const commit = git('rev-parse', 'HEAD');
    console.log('Subiendo version a ' + repository + '...');
    git('push', 'origin', 'HEAD:refs/heads/' + branch);

    console.log('Creando Release borrador...');
    const releaseUrl = 'https://api.github.com/repos/' + repository + '/releases';
    const { data: release } = await axios.post(releaseUrl, {
      tag_name: 'v' + version,
      target_commitish: commit,
      name: 'v' + version,
      body: notes,
      draft: true,
      prerelease: false
    }, { headers, timeout: 30000 });
    const uploadUrl = new URL(release.upload_url.replace(/\{.*$/, ''));
    if (uploadUrl.protocol !== 'https:' || uploadUrl.hostname !== 'uploads.github.com' ||
        uploadUrl.pathname !== '/repos/' + repository + '/releases/' + release.id + '/assets') {
      throw new Error('GitHub devolvio una URL de subida inesperada.');
    }
    uploadUrl.searchParams.set('name', path.basename(zipPath));
    console.log('Adjuntando ' + path.basename(zipPath) + '...');
    await axios.post(uploadUrl.toString(), fs.createReadStream(zipPath), {
      headers: {
        ...headers,
        'Content-Type': 'application/zip',
        'Content-Length': fs.statSync(zipPath).size
      },
      maxBodyLength: Infinity,
      timeout: 120000
    });
    const { data: published } = await axios.patch(releaseUrl + '/' + release.id, {
      draft: false,
      make_latest: 'true'
    }, { headers, timeout: 30000 });
    console.log('Release publicado: ' + published.html_url);
  } catch (error) {
    console.error('Error al publicar: ' + (error.response?.data?.message || error.message));
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
