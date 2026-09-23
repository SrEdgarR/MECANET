import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicDirectoryFiles, localSecrets } from './publicationSafety.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'distribucion', 'MECANET-Portable');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) throw new Error('Versión inválida');
const output = path.join(root, 'distribucion', `MECANET-v${version}-Portable.zip`);
if (fs.existsSync(output)) throw new Error('El ZIP ya existe. Archívelo antes de crear otro.');
const zip = new AdmZip();
for (const { relative, file } of publicDirectoryFiles(folder, localSecrets(root))) {
  zip.addFile('MECANET-Portable/' + relative, fs.readFileSync(file));
}
zip.writeZip(output);
console.log('Paquete público creado: ' + output);
