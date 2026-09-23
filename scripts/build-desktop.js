import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import AdmZip from 'adm-zip';
import { buildEnvironment } from './publicationSafety.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(pkg.version)) throw new Error('Versión inválida');
execFileSync(process.execPath, [path.join(root, 'scripts', 'create-release-zip.js')], { cwd: root, stdio: 'inherit' });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'mecanet-public-exe-'));
try {
  const env = buildEnvironment(stage);
  new AdmZip(path.join(root, 'distribucion', 'MECANET-v' + pkg.version + '.zip')).extractAllTo(stage, false);
  const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  execFileSync(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: stage, env, stdio: 'inherit'
  });
  const pkgRoot = path.join(root, 'node_modules', 'pkg');
  const pkgInfo = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
  if (pkgInfo.name !== '@yao-pkg/pkg') throw new Error('Instale las dependencias actualizadas antes de compilar.');
  const cli = typeof pkgInfo.bin === 'string' ? pkgInfo.bin : pkgInfo.bin.pkg;
  const output = path.join(root, 'distribucion', 'MECANET-v' + pkg.version + '.exe');
  if (fs.existsSync(output)) throw new Error('El ejecutable ya existe. Archívelo antes de reemplazarlo.');
  execFileSync(process.execPath, [path.join(pkgRoot, cli), '.', '--compress', 'GZip',
    '--output', output, '--targets', 'node24-win-x64'], { cwd: stage, env, stdio: 'inherit' });
  console.log('Ejecutable creado: ' + output);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
