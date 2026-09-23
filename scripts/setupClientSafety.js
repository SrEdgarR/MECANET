import { randomUUID } from 'node:crypto';

export const RECOVERY_COLLECTION_NAME = '__mecanet_setup_recovery';
const BACKUP_COLLECTION_PREFIX = '__mecanet_setup_backup_';
const DOCUMENT_BATCH_SIZE = 100;
const BACKUP_FORMAT = 'mecanet-setup-client-recovery-v1';
const VALID_BACKUP_STATUSES = new Set(['preparing', 'ready', 'in_progress', 'restoring', 'restored', 'committed']);

function isMongoUriValid(value) {
  const uri = String(value || '').trim();
  if (!uri || uri.includes('<') || uri.includes('>')) return false;

  try {
    const parsed = new URL(uri);
    const databaseName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean)[0] || '');
    return ['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)
      && Boolean(parsed.hostname)
      && Boolean(databaseName);
  } catch {
    return false;
  }
}

export function validateSetupEnvironment({
  env = process.env,
  dotenvError = null,
  envFilePath = '.env',
} = {}) {
  const issues = [];

  if (dotenvError?.code === 'ENOENT') {
    issues.push(`No se encontró ${envFilePath}. Ejecuta "npm run setup:local" y luego configura MONGODB_URI en ese archivo.`);
  } else if (dotenvError) {
    issues.push(`No se pudo leer ${envFilePath}. Revisa los permisos del archivo y vuelve a ejecutar el asistente.`);
  }

  if (env.APP_MODE === 'cloud' || env.VERCEL || env.RAILWAY_ENVIRONMENT || env.HEROKU_APP_NAME) {
    issues.push('setup-client solo debe ejecutarse desde una instalación local. No lo ejecutes dentro de Vercel, Railway, Heroku ni con APP_MODE=cloud.');
  }

  if (!isMongoUriValid(env.MONGODB_URI)) {
    issues.push('MONGODB_URI falta o no es válida: debe usar mongodb:// o mongodb+srv:// e incluir el nombre de la base de datos. Ejemplos: mongodb://localhost:27017/mecanet o mongodb+srv://usuario:clave@cluster/base.');
  }

  if (String(env.MONGODB_URI_FALLBACK || '').trim() && !isMongoUriValid(env.MONGODB_URI_FALLBACK)) {
    issues.push('MONGODB_URI_FALLBACK está definida pero no es válida. Corrígela o déjala vacía en .env.');
  }

  const jwtSecret = String(env.JWT_SECRET || '');
  if (jwtSecret.length < 32 || /CAMBIA_|placeholder|your_|un_secreto/i.test(jwtSecret)) {
    issues.push('JWT_SECRET falta, es demasiado corto o conserva un valor de ejemplo. Ejecuta "npm run setup:local" para generar uno seguro.');
  }

  const port = String(env.PORT || '').trim();
  if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
    issues.push('PORT debe ser un número entero entre 1 y 65535; corrige ese valor en .env o elimínalo para usar el puerto 5000.');
  }

  const nodeEnv = String(env.NODE_ENV || '').trim();
  if (nodeEnv && !['development', 'production', 'test'].includes(nodeEnv)) {
    issues.push('NODE_ENV debe ser development, production o test; corrige ese valor en .env.');
  }

  if (env.MONGODB_DNS_FALLBACK && !['true', 'false'].includes(String(env.MONGODB_DNS_FALLBACK).toLowerCase())) {
    issues.push('MONGODB_DNS_FALLBACK solo acepta true o false; corrige ese valor en .env.');
  }

  const timeoutVariables = [
    'MONGODB_CONNECT_ATTEMPT_TIMEOUT_MS',
    'MONGODB_SERVER_SELECTION_TIMEOUT_MS',
    'MONGODB_CONNECT_TIMEOUT_MS',
    'MONGODB_SOCKET_TIMEOUT_MS',
    'MONGODB_MAX_POOL_SIZE',
  ];
  for (const variable of timeoutVariables) {
    const value = String(env[variable] || '').trim();
    if (value && (!/^\d+$/.test(value) || Number(value) < 1)) {
      issues.push(`${variable} debe ser un número entero mayor que 0; corrige ese valor en .env.`);
    }
  }

  const ipFamily = String(env.MONGODB_IP_FAMILY || '').trim();
  if (ipFamily && !['4', '6'].includes(ipFamily)) {
    issues.push('MONGODB_IP_FAMILY solo acepta 4 o 6; corrige ese valor o elimina la variable de .env.');
  }

  return issues;
}

async function listCollectionInfos(db) {
  return db.listCollections({}, { nameOnly: false }).toArray();
}

function validateBackupMetadata(backup) {
  const validRunId = /^[a-f0-9]{32}$/.test(backup?.runId || '');
  const expectedPrefix = validRunId ? `${BACKUP_COLLECTION_PREFIX}${backup.runId}_` : '';
  const originalNames = new Set(backup?.originalCollectionNames || []);
  const backupNames = new Set();

  if (
    backup?._id !== 'active'
    || backup.format !== BACKUP_FORMAT
    || !VALID_BACKUP_STATUSES.has(backup.status)
    || !validRunId
    || !Array.isArray(backup.originalCollectionNames)
    || !Array.isArray(backup.managedCollectionNames)
    || !Array.isArray(backup.backupCollections)
  ) {
    throw new Error('El registro de recuperación no es válido. No se modificó la base; solicita revisión antes de continuar.');
  }

  for (const entry of backup.backupCollections) {
    if (
      !entry?.sourceName
      || !originalNames.has(entry.sourceName)
      || typeof entry.backupName !== 'string'
      || !entry.backupName.startsWith(expectedPrefix)
      || backupNames.has(entry.backupName)
    ) {
      throw new Error('El registro de recuperación contiene colecciones inválidas. No se modificó la base; solicita revisión antes de continuar.');
    }
    backupNames.add(entry.backupName);
  }
}

async function dropCollectionsIfPresent(db, names) {
  const existingNames = new Set((await listCollectionInfos(db)).map(({ name }) => name));
  for (const name of names) {
    if (existingNames.has(name)) {
      await db.dropCollection(name);
      existingNames.delete(name);
    }
  }
}

export async function createSetupBackup(db, managedCollectionNames = []) {
  if (await db.collection(RECOVERY_COLLECTION_NAME).countDocuments()) {
    throw new Error('Existe un registro de recuperación; revísalo antes de otra configuración.');
  }
  const collectionInfos = (await listCollectionInfos(db)).filter(({ name }) => name !== RECOVERY_COLLECTION_NAME);
  const collectionNames = collectionInfos.map(({ name }) => name);
  const reservedNames = collectionNames.filter((name) => (
    name === RECOVERY_COLLECTION_NAME || name.startsWith(BACKUP_COLLECTION_PREFIX)
  ));

  if (reservedNames.length) {
    throw new Error(`La base ya contiene nombres reservados para recuperación (${reservedNames.join(', ')}). Revisa o recupera esa copia antes de iniciar otra configuración.`);
  }

  const cappedCollections = collectionInfos
    .filter(({ name, options }) => !name.startsWith('system.') && options?.capped)
    .map(({ name }) => name);
  if (cappedCollections.length) {
    throw new Error(`No se puede vaciar de forma segura las colecciones capped: ${cappedCollections.join(', ')}. No se vació la base de datos.`);
  }

  const unsupportedCollections = collectionInfos
    .filter(({ name, type, options }) => {
      if (name.startsWith('system.')) return false;
      if (type === 'timeseries' || options?.timeseries) return true;
      return type !== 'collection' && type !== 'view';
    })
    .map(({ name }) => name);
  if (unsupportedCollections.length) {
    throw new Error(`Hay colecciones que no se pueden respaldar con seguridad (${unsupportedCollections.join(', ')}). No se vació la base de datos.`);
  }

  const id = randomUUID().replaceAll('-', '');
  const sourceCollections = collectionInfos
    .filter(({ name, type }) => type === 'collection' && !name.startsWith('system.'))
    .map(({ name }, index) => ({
      sourceName: name,
      backupName: `${BACKUP_COLLECTION_PREFIX}${id}_${index.toString(36)}`,
    }));

  const backup = {
    _id: 'active',
    format: BACKUP_FORMAT,
    runId: id,
    status: 'preparing',
    originalCollectionNames: collectionNames,
    managedCollectionNames: [...new Set(managedCollectionNames)],
    backupCollections: sourceCollections,
    createdAt: new Date(),
  };

  let acquired = false;
  try {
    const recoveryCollection = db.collection(RECOVERY_COLLECTION_NAME);
    // MongoDB crea la colección y el documento de control en la misma escritura.
    await recoveryCollection.insertOne(backup);
    acquired = true;

    for (const { sourceName, backupName } of sourceCollections) {
      await db.collection(sourceName)
        .aggregate([{ $match: {} }, { $out: backupName }], { allowDiskUse: true })
        .toArray();

      const [sourceCount, backupCount] = await Promise.all([
        db.collection(sourceName).countDocuments(),
        db.collection(backupName).countDocuments(),
      ]);

      if (sourceCount !== backupCount) {
        throw new Error(`La copia de ${sourceName} no coincide con el origen (${backupCount} de ${sourceCount} documentos). No se vació la base de datos.`);
      }
      backup.backupCollections.find((entry) => entry.sourceName === sourceName).documentCount = backupCount;
    }

    const readyResult = await db.collection(RECOVERY_COLLECTION_NAME).updateOne(
      { _id: 'active', runId: backup.runId },
      { $set: { status: 'ready', backupCollections: backup.backupCollections, updatedAt: new Date() } },
    );
    if (readyResult.matchedCount !== 1) {
      throw new Error('No se pudo registrar que el respaldo está completo. No se vació la base de datos.');
    }
    backup.status = 'ready';
    return backup;
  } catch (error) {
    try {
      if (acquired) await cleanupSetupBackup(db, backup);
    } catch (cleanupError) {
      throw new Error(
        `No se pudo completar la copia previa y tampoco limpiar todos sus archivos. La base original no se vació; conserva la copia de recuperación para revisarla. Detalle: ${error.message}`,
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

export async function setSetupBackupStatus(db, status, runId) {
  if (!runId) throw new Error('Falta el propietario del respaldo');
  const result = await db.collection(RECOVERY_COLLECTION_NAME).updateOne(
    { _id: 'active', runId },
    { $set: { status, updatedAt: new Date() } },
  );

  if (result.matchedCount !== 1) {
    throw new Error('No se encontró el registro de recuperación de setup-client. La base no debe vaciarse.');
  }
}

export async function cleanupSetupBackup(db, backup) {
  validateBackupMetadata(backup);
  const owner = await db.collection(RECOVERY_COLLECTION_NAME).findOne({ _id: 'active' });
  if (owner?.runId !== backup.runId) throw new Error('El respaldo pertenece a otra ejecución; no se eliminó.');
  const backupNames = (backup?.backupCollections || []).map(({ backupName }) => backupName);
  await dropCollectionsIfPresent(db, backupNames);
  await db.collection(RECOVERY_COLLECTION_NAME).deleteOne({ _id: 'active', runId: backup.runId });
}

async function restoreDocuments(db, sourceName, backupName) {
  const sourceCollection = db.collection(sourceName);
  await sourceCollection.deleteMany({});

  const cursor = db.collection(backupName).find({}).batchSize(DOCUMENT_BATCH_SIZE);
  let batch = [];
  for await (const document of cursor) {
    batch.push(document);
    if (batch.length >= DOCUMENT_BATCH_SIZE) {
      await sourceCollection.insertMany(batch);
      batch = [];
    }
  }

  if (batch.length) await sourceCollection.insertMany(batch);
}

async function verifySetupBackup(db, backup) {
  const currentNames = new Set((await listCollectionInfos(db)).map(({ name }) => name));

  for (const { sourceName, backupName, documentCount } of backup.backupCollections) {
    if (!Number.isInteger(documentCount) || documentCount < 0 || !currentNames.has(backupName)) {
      throw new Error(`Falta el respaldo verificable de ${sourceName}. No se borrarán más datos; conserva la base y solicita revisión.`);
    }

    const actualCount = await db.collection(backupName).countDocuments();
    if (actualCount !== documentCount) {
      throw new Error(`El respaldo de ${sourceName} cambió (${actualCount} de ${documentCount} documentos). No se continuará con la restauración automática.`);
    }
  }
}

export async function restoreSetupBackup(db, backup) {
  validateBackupMetadata(backup);
  await verifySetupBackup(db, backup);

  await setSetupBackupStatus(db, 'restoring', backup.runId);

  const originalNames = new Set(backup.originalCollectionNames);
  const managedNames = new Set(backup.managedCollectionNames || []);
  const collectionInfos = await listCollectionInfos(db);
  const createdDuringSetup = collectionInfos
    .filter(({ name, type }) => (
      type === 'collection'
      && managedNames.has(name)
      && !originalNames.has(name)
      && !name.startsWith('system.')
    ))
    .map(({ name }) => name);

  await dropCollectionsIfPresent(db, createdDuringSetup);

  for (const { sourceName, backupName } of backup.backupCollections) {
    await restoreDocuments(db, sourceName, backupName);
  }

  await setSetupBackupStatus(db, 'restored', backup.runId);
  return { restoredCollections: backup.backupCollections.length };
}

export async function recoverInterruptedSetup(db, { confirmedRunId } = {}) {
  const collectionInfos = await listCollectionInfos(db);
  const existingNames = new Set(collectionInfos.map(({ name }) => name));
  const backupNames = collectionInfos
    .filter(({ name }) => name.startsWith(BACKUP_COLLECTION_PREFIX))
    .map(({ name }) => name);

  if (!existingNames.has(RECOVERY_COLLECTION_NAME)) {
    if (backupNames.length) {
      throw new Error('Hay copias de recuperación sin su registro de control. No se modificó la base; solicita revisión antes de continuar.');
    }
    return { action: 'none' };
  }

  const backup = await db.collection(RECOVERY_COLLECTION_NAME).findOne({ _id: 'active' });
  if (!backup) {
    if (!backupNames.length && await db.collection(RECOVERY_COLLECTION_NAME).countDocuments() === 0) return { action: 'none' };
    throw new Error('Existe una colección reservada para recuperación, pero no tiene un registro válido. No se modificó la base; solicita revisión antes de continuar.');
  }
  validateBackupMetadata(backup);
  if (confirmedRunId !== backup.runId) {
    return { action: 'requires_confirmation', runId: backup.runId, status: backup.status };
  }


  if (['preparing', 'ready'].includes(backup.status)) {
    await cleanupSetupBackup(db, backup);
    return { action: 'discarded_backup' };
  }

  if (['in_progress', 'restoring'].includes(backup.status)) {
    await restoreSetupBackup(db, backup);
    await cleanupSetupBackup(db, backup);
    return { action: 'restored' };
  }

  if (backup.status === 'restored') {
    await cleanupSetupBackup(db, backup);
    return { action: 'restored' };
  }

  if (backup.status === 'committed') {
    await cleanupSetupBackup(db, backup);
    return { action: 'cleaned_committed_backup' };
  }

  throw new Error(`El estado de la copia de recuperación (${backup.status || 'desconocido'}) no es reconocido. No se modificó la base.`);
}
