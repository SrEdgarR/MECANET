import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
import readline from 'readline';
import UpdaterService from '../services/updaterService.js';

const launcher = process.argv[2];
if (!['INICIAR-MECANET.bat', 'CONFIGURAR-INICIAL.bat'].includes(launcher)) {
  console.error('Lanzador de MECANET invalido.');
  process.exitCode = 1;
} else {
  try {
    console.log('Consultando el ultimo Release de SrEdgarR/MECANET...');
    const update = await UpdaterService.checkForUpdates();
    if (update.hasUpdate) {
      console.log('\nHay una actualizacion disponible.');
      console.log('Version instalada:  v' + update.currentVersion);
      console.log('Version disponible: v' + update.version);
      console.log('\nNotas del Release:\n' + update.releaseNotes + '\n');
      if (!update.downloadUrl) {
        console.warn('El Release no contiene MECANET-v' + update.version + '.zip. Se continua con la version instalada.');
      } else if (!process.stdin.isTTY) {
        console.log('No hay una consola interactiva. Se continua con la version instalada.');
      } else {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise(resolve => rl.question('Desea actualizar ahora? [S/N]: ', resolve));
        rl.close();
        if (answer.trim().toLowerCase() === 's') {
          try {
            await UpdaterService.downloadAndApplyUpdate(update, launcher);
            process.exitCode = 2;
          } catch (error) {
            console.error('No se pudo preparar la actualizacion: ' + error.message);
            console.log('Se continua con la version instalada.');
          }
        } else {
          console.log('Actualizacion omitida. Se continua con la version instalada.');
        }
      }
    } else {
      console.log('MECANET v' + update.currentVersion + ' ya esta actualizado.');
    }
  } catch (error) {
    console.warn('No se pudo consultar GitHub: ' + error.message);
    console.log('Se continua con la version instalada.');
  }
}
