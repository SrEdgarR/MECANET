import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import readline from 'node:readline';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import Sale from '../models/Sale.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Return from '../models/Return.js';
import CashierSession from '../models/CashierSession.js';
import CashWithdrawal from '../models/CashWithdrawal.js';
import AuditLog from '../models/AuditLog.js';
import Log from '../models/Log.js';
import connectDB from '../config/db.js';
import {
  cleanupSetupBackup,
  createSetupBackup,
  recoverInterruptedSetup,
  restoreSetupBackup,
  setSetupBackupStatus,
  validateSetupEnvironment,
} from './setupClientSafety.js';
import {
  createAdminUser,
  printGeneratedPassword,
  promptAdminCredentials,
} from './adminCredentials.js';

const models = [
  { name: 'Users', model: User },
  { name: 'Settings', model: Settings },
  { name: 'Products', model: Product },
  { name: 'Customers', model: Customer },
  { name: 'Suppliers', model: Supplier },
  { name: 'Sales', model: Sale },
  { name: 'PurchaseOrders', model: PurchaseOrder },
  { name: 'Returns', model: Return },
  { name: 'CashierSessions', model: CashierSession },
  { name: 'CashWithdrawals', model: CashWithdrawal },
  { name: 'AuditLogs', model: AuditLog },
  { name: 'Logs', model: Log },
];

const question = (rl, prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function askRequired(rl, prompt) {
  while (true) {
    const value = (await question(rl, prompt)).trim();
    if (value) return value;
    console.log('Este campo es obligatorio.');
  }
}

async function askTaxRate(rl) {
  while (true) {
    const input = (await question(rl, '  Tasa de impuesto en % [18]: ')).trim();
    if (!input) return 18;

    const rate = Number(input);
    if (Number.isFinite(rate) && rate >= 0 && rate <= 100) return rate;
    console.log('Escribe un número entre 0 y 100.');
  }
}

async function askTimezone(rl) {
  while (true) {
    const timezone = (await question(rl, '  Zona horaria [America/New_York]: ')).trim() || 'America/New_York';
    try {
      new Intl.DateTimeFormat('es', { timeZone: timezone });
      return timezone;
    } catch {
      console.log('Esa zona horaria no es válida. Usa un identificador IANA, por ejemplo America/Santo_Domingo.');
    }
  }
}

function printEnvironmentProblems(issues) {
  console.error('\n❌ La configuración local no está lista:');
  issues.forEach((issue, index) => console.error(`  ${index + 1}. ${issue}`));
  console.error('\nCorrige lo indicado y vuelve a ejecutar "npm run setup-client". No se modificó la base de datos.');
}

function sanitizeMongoError(error) {
  let message = String(error?.message || error || 'Error desconocido');
  for (const uri of [process.env.MONGODB_URI, process.env.MONGODB_URI_FALLBACK].filter(Boolean)) {
    message = message.replaceAll(uri, '[URI oculto]');
    try {
      const parsed = new URL(uri);
      for (const secret of [parsed.username, parsed.password]) {
        if (!secret) continue;
        message = message.replaceAll(secret, '[oculto]');
        const decoded = decodeURIComponent(secret);
        if (decoded !== secret) message = message.replaceAll(decoded, '[oculto]');
      }
    } catch {
      // La URI inválida ya se reporta sin imprimir su valor.
    }
  }
  return message.slice(0, 600);
}

async function ensureModelCollections(db) {
  const existingNames = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  );

  for (const { name, model } of models) {
    const collectionName = model.collection.collectionName;
    if (!existingNames.has(collectionName)) {
      await model.createCollection();
      existingNames.add(collectionName);
    }
    await model.createIndexes();
    console.log(`  ✅ ${name.padEnd(20)} - colección e índices listos`);
  }
}

async function setupClient() {
  let rl;
  let db;
  let backup;
  let connectionVerified = false;
  let wipeStarted = false;
  let setupCommitted = false;

  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║       CONFIGURACIÓN INICIAL DE CLIENTE - MECANET          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('PASO 1: VALIDAR CONFIGURACIÓN Y CONEXIÓN');
    const envFilePath = path.resolve(process.cwd(), '.env');
    const envResult = dotenv.config({ path: envFilePath });
    const envIssues = validateSetupEnvironment({
      env: process.env,
      dotenvError: envResult.error,
      envFilePath,
    });

    if (envIssues.length) {
      printEnvironmentProblems(envIssues);
      process.exitCode = 1;
      return;
    }

    console.log('✅ .env contiene las variables requeridas y tiene valores válidos.');
    if (process.env.MONGODB_URI_FALLBACK) {
      console.log('ℹ️ Para proteger el destino, setup-client usará solo MONGODB_URI y no cambiará a MONGODB_URI_FALLBACK.');
    }
    console.log('📡 Comprobando acceso a MongoDB...');
    await connectDB({ allowFallback: false });
    db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB se conectó, pero no se pudo seleccionar la base de datos.');
    await db.command({ ping: 1 });
    connectionVerified = true;
    console.log(`✅ Conexión comprobada: ${mongoose.connection.host}/${db.databaseName}\n`);

    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let recovery = await recoverInterruptedSetup(db);
    if (recovery.action === 'requires_confirmation') {
      console.log('Hay una configuración anterior pendiente. Detén MECANET y conserva una copia actual antes de recuperar.');
      console.log('La recuperación puede reemplazar los datos actuales con el respaldo anterior.');
      const answer = await question(rl, 'Escribe RECUPERAR para autorizar esta recuperación, o Enter para salir: ');
      if (answer.trim() !== 'RECUPERAR') return;
      recovery = await recoverInterruptedSetup(db, { confirmedRunId: recovery.runId });
    }
    if (recovery.action === 'restored') {
      console.log('✅ Se restauraron los datos de una configuración anterior interrumpida.');
      console.log('No se inició otro vaciado. Revisa la base y vuelve a ejecutar setup-client si aún lo necesitas.');
      process.exitCode = 1;
      return;
    }
    if (recovery.action === 'discarded_backup') {
      console.log('ℹ️ Se limpió una copia incompleta anterior; los datos originales seguían intactos.\n');
    } else if (recovery.action === 'cleaned_committed_backup') {
      console.log('ℹ️ Se limpió una copia temporal de una configuración completada anteriormente.\n');
    }



    console.log('PASO 2: RECOPILAR DATOS DEL ADMINISTRADOR Y DEL NEGOCIO\n');
    const adminName = await askRequired(rl, 'Nombre completo del administrador: ');
    const adminCredentials = await promptAdminCredentials(rl);

    console.log('\n📋 DATOS DEL NEGOCIO:\n');
    const businessName = (await question(rl, '  Nombre del negocio [MECANET]: ')).trim() || 'MECANET';
    const businessPhone = (await question(rl, '  Teléfono del negocio (opcional): ')).trim();
    const businessAddress = (await question(rl, '  Dirección del negocio (opcional): ')).trim();
    const businessEmail = (await question(rl, `  Email del negocio (opcional) [${adminCredentials.email}]: `)).trim()
      || adminCredentials.email;

    console.log('\n📋 CONFIGURACIÓN REGIONAL:\n');
    const currency = (await question(rl, '  Moneda [DOP]: ')).trim().toUpperCase() || 'DOP';
    const taxRate = await askTaxRate(rl);
    const timezone = await askTimezone(rl);

    console.log('\nPASO 3: CONFIRMAR INICIALIZACIÓN');
    console.log(`Servidor MongoDB: ${mongoose.connection.host}`);
    console.log(`Base de datos: ${db.databaseName}`);
    console.log('El proceso guardará una copia temporal y luego reemplazará los datos actuales.');
    console.log('La copia puede ocupar espacio adicional comparable al tamaño actual de los datos.');
    console.log('Si la aplicación está ejecutándose, detenla antes de continuar para evitar escrituras simultáneas.');
    const confirmation = (await question(rl, 'Escribe "SI" para confirmar y continuar: ')).trim().toUpperCase();
    if (confirmation !== 'SI') {
      console.log('\nOperación cancelada. No se vació la base de datos.');
      return;
    }

    console.log('\nPASO 4: RESPALDAR Y VACIAR DATOS');
    backup = await createSetupBackup(db, models.map(({ model }) => model.collection.collectionName));
    console.log(`✅ Respaldo temporal verificado para ${backup.backupCollections.length} colecciones.`);
    await setSetupBackupStatus(db, 'in_progress', backup.runId);
    wipeStarted = true;

    let deletedCount = 0;
    for (const { sourceName } of backup.backupCollections) {
      const result = await db.collection(sourceName).deleteMany({});
      console.log(`  🗑️  ${sourceName.padEnd(22)} ${result.deletedCount} documentos eliminados`);
      deletedCount += result.deletedCount;
    }
    console.log(`✅ Vaciado terminado: ${deletedCount} documentos.\n`);

    console.log('PASO 5: CREAR ADMINISTRADOR Y CONFIGURACIÓN DEL NEGOCIO');
    const adminUser = await createAdminUser(User, {
      name: adminName,
      email: adminCredentials.email,
      password: adminCredentials.password,
    });

    const settings = await Settings.create({
      businessName,
      businessPhone,
      businessAddress,
      businessEmail,
      taxRate,
      currency,
      timezone,
      language: 'es',
      dateFormat: 'DD/MM/YYYY',
      receiptPrefix: 'INV',
      lowStockThreshold: 10,
      enableNotifications: true,
      enableEmailNotifications: false,
      theme: 'light',
    });

    console.log('PASO 6: PREPARAR COLECCIONES E ÍNDICES');
    await ensureModelCollections(db);

    await setSetupBackupStatus(db, 'committed', backup.runId);
    setupCommitted = true;
    try {
      await cleanupSetupBackup(db, backup);
      console.log('✅ Copia temporal eliminada tras completar la configuración.');
    } catch (cleanupError) {
      console.warn(`⚠️ La configuración terminó, pero no se pudo borrar la copia temporal: ${cleanupError.message}`);
      console.warn('Se limpiará automáticamente al volver a iniciar setup-client.');
    }

    console.log('\n🎉 CONFIGURACIÓN COMPLETADA');
    console.log(`Administrador: ${adminUser.email} (${adminUser.role})`);
    console.log(`Negocio: ${settings.businessName}`);
    console.log(`Moneda: ${settings.currency} | Impuesto: ${settings.taxRate}% | Zona horaria: ${settings.timezone}`);
    printGeneratedPassword(adminCredentials);
    console.log('\nInicia el servidor con "npm run dev" y accede con las credenciales del administrador.');
  } catch (error) {
    if (!connectionVerified) {
      console.error('\n❌ No fue posible comprobar la conexión con MongoDB.');
      console.error(`Detalle: ${sanitizeMongoError(error)}`);
      console.error('Revisa MONGODB_URI en .env, el usuario y contraseña de Atlas y que la IP esté permitida en Network Access. No se vació la base de datos.');
    } else {
      console.error(`\n❌ Error durante la configuración: ${error.message}`);
      if (!wipeStarted) console.error('No se vació la base de datos.');
    }

    if (backup && wipeStarted && !setupCommitted) {
      console.error('Intentando restaurar la copia previa...');
      try {
        const result = await restoreSetupBackup(db, backup);
        console.error(`✅ Restauración completada: ${result.restoredCollections} colecciones recuperadas.`);
        try {
          await cleanupSetupBackup(db, backup);
        } catch (cleanupError) {
          console.error(`⚠️ Los datos ya fueron restaurados, pero quedó una copia temporal pendiente de limpieza: ${cleanupError.message}`);
          console.error('setup-client la limpiará automáticamente al volver a ejecutarse.');
        }
      } catch (restoreError) {
        console.error(`⚠️ No se pudo completar la restauración: ${restoreError.message}`);
        console.error('La copia se conservó en MongoDB. Vuelve a ejecutar setup-client para que intente restaurarla automáticamente.');
      }
    } else if (backup && !wipeStarted && !setupCommitted) {
      try {
        await cleanupSetupBackup(db, backup);
      } catch (cleanupError) {
        console.error(`⚠️ Los datos originales no se vaciaron; quedó una copia temporal pendiente de limpieza: ${cleanupError.message}`);
      }
    }

    process.exitCode = 1;
  } finally {
    rl?.close();
    await mongoose.disconnect().catch(() => undefined);
  }
}

setupClient();
