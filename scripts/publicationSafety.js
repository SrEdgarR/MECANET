import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const privatePath = relative => relative.replace(/\\/g, '/').split('/').some(part =>
  /^(?:\.env(?:\..*)?|\.git|\.railway|\.kilo|logs|backups?|MECANET-Distribuciones|\.mecanet-configured)$/i.test(part) && part !== '.env.example'
) || /\.(?:pem|p12|pfx|key|sqlite3?|dump|bak|log|zip|7z)$/i.test(relative);

export function assertRegularPath(root, relative) {
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(path.resolve(root) + path.sep)) throw new Error('Ruta fuera del paquete');
  let current = path.resolve(root);
  if (fs.lstatSync(current).isSymbolicLink()) throw new Error('La raíz no puede ser un enlace');
  for (const segment of path.relative(root, absolute).split(path.sep)) {
    current = path.join(current, segment);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Enlace no permitido: ' + relative);
  }
  if (!fs.statSync(absolute).isFile()) throw new Error('No es un archivo regular: ' + relative);
  return absolute;
}

export function localSecrets(root) {
  const values = [];
  for (const folder of [root, path.join(root, 'client')]) {
    for (const name of fs.readdirSync(folder).filter(n => /^\.env(?:\.|$)/.test(n) && n !== '.env.example')) {
      const filename = path.join(folder, name);
      if (!fs.lstatSync(filename).isFile()) continue;
      for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?([\w]+)\s*=\s*(.*?)\s*$/);
        if (!match || !/password|secret|token|api_?key|mongo.*uri/i.test(match[1])) continue;
        const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
        if (/mongo.*uri/i.test(match[1])) {
          try { const uri = new URL(value); if (!uri.password) continue; } catch { continue; }
        }
        if (value.length >= 12 && !/CAMBIA|PLACEHOLDER|TU_|example/i.test(value)) values.push(Buffer.from(value));
      }
    }
  }
  return values;
}

export function assertPublicBytes(relative, bytes, secrets = []) {
  if (privatePath(relative)) throw new Error('Archivo privado excluido: ' + relative);
  if (secrets.some(secret => bytes.includes(secret))) throw new Error('Se detectó una credencial local en: ' + relative);
  const content = bytes.toString('utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content) ||
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[A-Z0-9]{16})\b/.test(content)) {
    throw new Error('Posible secreto en: ' + relative);
  }
}

export function publicSourceFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean).filter(relative => fs.existsSync(path.join(root, relative)))
    .map(relative => {
      const file = assertRegularPath(root, relative);
      if (privatePath(relative)) throw new Error('Git contiene un archivo privado: ' + relative);
      return { relative: relative.replace(/\\/g, '/'), file };
    });
}

export function publicDirectoryFiles(root, secrets = []) {
  const files = [];
  const walk = directory => {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Enlace no permitido');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replace(/\\/g, '/');
      if (entry.isSymbolicLink() || privatePath(relative)) throw new Error('Archivo privado o enlace en: ' + relative);
      if (entry.isDirectory()) walk(absolute);
      else {
        const bytes = fs.readFileSync(assertRegularPath(root, relative));
        assertPublicBytes(relative, bytes, secrets);
        files.push({ relative, file: absolute });
      }
    }
  };
  walk(root);
  return files;
}

export function buildEnvironment(scratch) {
  const env = { NODE_ENV: 'production', HOME: scratch, USERPROFILE: scratch,
    npm_config_cache: path.join(scratch, 'npm-cache'), npm_config_userconfig: path.join(scratch, 'empty.npmrc') };
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP']) {
    const actual = Object.keys(process.env).find(key => key.toUpperCase() === name.toUpperCase());
    if (actual) env[name] = process.env[actual];
  }
  return env;
}
