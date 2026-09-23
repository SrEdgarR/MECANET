import AdmZip from 'adm-zip';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { publicSourceFiles, publicDirectoryFiles, assertPublicBytes, localSecrets, buildEnvironment } from './publicationSafety.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(pkg.version)) throw new Error('Versión inválida');
const secrets = localSecrets(root);
const selected = publicSourceFiles(root);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'mecanet-public-build-'));
const env = buildEnvironment(stage);
const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
if (!fs.existsSync(npm)) throw new Error('No se encontró npm junto a Node.js');
const runNpm = (args, cwd) => execFileSync(process.execPath, [npm, ...args], { cwd, env, stdio: 'inherit' });
try {
  // Build selected source in a fresh directory, without .env or publisher credentials.
  const client = path.join(stage, 'client');
  fs.mkdirSync(client);
  for (const { relative, file } of selected.filter(item => item.relative.startsWith('client/'))) {
    const bytes = fs.readFileSync(file);
    assertPublicBytes(relative, bytes, secrets);
    const destination = path.join(stage, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  }
  runNpm(['ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'], client);
  runNpm(['run', 'build'], client);
  const zip = new AdmZip();
  const roots = new Set(['.env.example', 'package.json', 'package-lock.json', 'version.json', 'server.js',
    'README.md', 'CHANGELOG.md', 'LEEME-PRIMERO.txt', 'DETENER-MECANET.bat', 'INICIAR-MECANET.bat', 'CONFIGURAR-INICIAL.bat']);
  const folders = new Set(['config', 'controllers', 'middleware', 'models', 'routes', 'services', 'scripts', 'sistema']);
  for (const { relative, file } of selected) {
    if (!roots.has(relative) && !folders.has(relative.split('/')[0])) continue;
    const bytes = fs.readFileSync(file);
    assertPublicBytes(relative, bytes, secrets);
    zip.addFile(relative, bytes);
  }
  for (const { relative, file } of publicDirectoryFiles(path.join(client, 'dist'), secrets)) {
    zip.addFile('client/dist/' + relative, fs.readFileSync(file));
  }
  zip.addFile('client/package.json', fs.readFileSync(path.join(client, 'package.json')));
  const output = path.join(root, 'distribucion');
  fs.mkdirSync(output, { recursive: true });
  if (fs.lstatSync(output).isSymbolicLink()) throw new Error('distribucion no puede ser un enlace');
  const filename = path.join(output, 'MECANET-v' + pkg.version + '.zip');
  if (fs.existsSync(filename)) throw new Error('Ya existe el ZIP. Archívelo antes de generar otro: ' + filename);
  zip.writeZip(filename);
  console.log('Release creado: ' + filename);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
