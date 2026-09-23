import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERY_COLLECTION_NAME,
  createSetupBackup,
  recoverInterruptedSetup,
  setSetupBackupStatus,
  validateSetupEnvironment,
} from './setupClientSafety.js';

class MemoryDatabase {
  constructor(initialCollections = {}) {
    this.documents = new Map(Object.entries(initialCollections).map(([name, docs]) => [name, structuredClone(docs)]));
  }

  listCollections(filter = {}) {
    return {
      toArray: async () => [...this.documents.keys()]
        .filter((name) => !filter.name || name === filter.name)
        .map((name) => ({ name, type: 'collection' })),
    };
  }

  collection(name) {
    const database = this;
    return {
      aggregate(pipeline) {
        const backupName = pipeline.find((stage) => stage.$out)?.$out;
        return {
          toArray: async () => {
            const documents = structuredClone(database.documents.get(name) || []);
            if (database.incompleteBackup) documents.pop();
            database.documents.set(backupName, documents);
            return [];
          },
        };
      },
      countDocuments: async () => (database.documents.get(name) || []).length,
      deleteMany: async () => {
        const deletedCount = (database.documents.get(name) || []).length;
        database.documents.set(name, []);
        return { deletedCount };
      },
      find() {
        const docs = structuredClone(database.documents.get(name) || []);
        return {
          batchSize() { return this; },
          async *[Symbol.asyncIterator]() { yield* docs; },
        };
      },
      findOne: async (filter) => (database.documents.get(name) || []).find((doc) => doc._id === filter._id && (!filter.runId || doc.runId === filter.runId)) || null,
      insertMany: async (docs) => {
        database.documents.set(name, [...(database.documents.get(name) || []), ...structuredClone(docs)]);
      },
      deleteOne: async (filter) => {
        const docs = database.documents.get(name) || [];
        const remaining = docs.filter(doc => !(doc._id === filter._id && (!filter.runId || doc.runId === filter.runId)));
        database.documents.set(name, remaining);
        return { deletedCount: docs.length - remaining.length };
      },
      insertOne: async (doc) => {
        if ((database.documents.get(name) || []).some(item => item._id === doc._id)) throw new Error('Duplicate key');
        database.documents.set(name, [...(database.documents.get(name) || []), structuredClone(doc)]);
      },
      updateOne: async (filter, update) => {
        const docs = database.documents.get(name) || [];
        const index = docs.findIndex((doc) => doc._id === filter._id && (!filter.runId || doc.runId === filter.runId));
        if (index === -1) return { matchedCount: 0 };
        docs[index] = { ...docs[index], ...structuredClone(update.$set) };
        return { matchedCount: 1 };
      },
    };
  }

  async createCollection(name) {
    if (this.documents.has(name)) throw new Error(`Collection ${name} already exists`);
    this.documents.set(name, []);
  }

  async dropCollection(name) {
    if (!this.documents.delete(name)) throw new Error(`Collection ${name} does not exist`);
  }
}

const validEnvironment = {
  MONGODB_URI: 'mongodb://localhost:27017/mecanet',
  JWT_SECRET: 'a'.repeat(64),
  PORT: '5000',
  NODE_ENV: 'development',
};

test('accepts a valid local environment without exposing its values', () => {
  assert.deepEqual(validateSetupEnvironment({ env: validEnvironment }), []);
});

test('accepts an Atlas SRV URI with a selected database', () => {
  const env = {
    ...validEnvironment,
    MONGODB_URI: 'mongodb+srv://mecan_user:p%40ssword@cluster.example.net/mecanet?retryWrites=true',
  };
  assert.deepEqual(validateSetupEnvironment({ env }), []);
});

test('blocks cloud environments before a destructive setup', () => {
  const issues = validateSetupEnvironment({ env: { ...validEnvironment, APP_MODE: 'cloud' } });
  assert.match(issues[0], /solo debe ejecutarse desde una instalación local/);
});

test('explains missing .env, invalid Mongo URI, JWT secret, and port', () => {
  const issues = validateSetupEnvironment({
    env: { MONGODB_URI: 'mongodb://localhost:27017', JWT_SECRET: 'CAMBIA_ESTE_VALOR', PORT: '70000' },
    dotenvError: { code: 'ENOENT' },
    envFilePath: '.env',
  });

  assert.equal(issues.length, 4);
  assert.match(issues[0], /\.env/);
  assert.match(issues[1], /MONGODB_URI/);
  assert.match(issues[2], /JWT_SECRET/);
  assert.match(issues[3], /PORT/);
  assert.ok(issues.every((issue) => !issue.includes('CAMBIA_ESTE_VALOR')));
});

test('restores the original documents and removes collections created during a failed setup', async () => {
  const db = new MemoryDatabase({
    users: [{ _id: 'user-1', email: 'existing@example.com' }],
    sales: [{ _id: 'sale-1', total: 42 }],
  });
  const managedCollections = ['users', 'settings'];
  const backup = await createSetupBackup(db, managedCollections);
  await setSetupBackupStatus(db, 'in_progress', backup.runId);

  await db.collection('users').deleteMany({});
  await db.collection('sales').deleteMany({});
  await db.createCollection('settings');
  await db.collection('settings').insertOne({ _id: 'new-settings', currency: 'DOP' });

  const result = await recoverInterruptedSetup(db, { confirmedRunId: backup.runId });

  assert.equal(result.action, 'restored');
  assert.deepEqual(db.documents.get('users'), [{ _id: 'user-1', email: 'existing@example.com' }]);
  assert.deepEqual(db.documents.get('sales'), [{ _id: 'sale-1', total: 42 }]);
  assert.equal(db.documents.has('settings'), false);
  assert.equal((db.documents.get(RECOVERY_COLLECTION_NAME) || []).length, 0);
  assert.ok(![...db.documents.keys()].some((name) => name.startsWith('__mecanet_setup_backup_')));
});

test('discards an incomplete backup before any reset began', async () => {
  const db = new MemoryDatabase({ products: [{ _id: 'product-1', name: 'Bujía' }] });
  const backup = await createSetupBackup(db, ['products']);

  const result = await recoverInterruptedSetup(db, { confirmedRunId: backup.runId });

  assert.equal(result.action, 'discarded_backup');
  assert.deepEqual(db.documents.get('products'), [{ _id: 'product-1', name: 'Bujía' }]);
  assert.equal((db.documents.get(RECOVERY_COLLECTION_NAME) || []).length, 0);
});

test('removes a committed backup without undoing the completed setup', async () => {
  const db = new MemoryDatabase({ products: [{ _id: 'product-1', name: 'Bujía' }] });
  const backup = await createSetupBackup(db, ['products', 'settings']);
  await setSetupBackupStatus(db, 'in_progress', backup.runId);
  await db.collection('products').deleteMany({});
  await db.createCollection('settings');
  await db.collection('settings').insertOne({ _id: 'settings-1', currency: 'DOP' });
  await setSetupBackupStatus(db, 'committed', backup.runId);

  const result = await recoverInterruptedSetup(db, { confirmedRunId: backup.runId });

  assert.equal(result.action, 'cleaned_committed_backup');
  assert.deepEqual(db.documents.get('products'), []);
  assert.deepEqual(db.documents.get('settings'), [{ _id: 'settings-1', currency: 'DOP' }]);
  assert.equal((db.documents.get(RECOVERY_COLLECTION_NAME) || []).length, 0);
});

test('preserves a pre-existing collection that conflicts with the reserved recovery name', async () => {
  const originalDocuments = [{ _id: 'keep-me', data: 'original' }];
  const db = new MemoryDatabase({ [RECOVERY_COLLECTION_NAME]: originalDocuments });

  await assert.rejects(recoverInterruptedSetup(db), /registro válido/);
  assert.deepEqual(db.documents.get(RECOVERY_COLLECTION_NAME), originalDocuments);
});

test('refuses to reset capped collections before creating a backup or deleting data', async () => {
  const db = new MemoryDatabase({ cappedLogs: [{ _id: 'log-1', message: 'keep me' }] });
  db.listCollections = () => ({
    toArray: async () => [{ name: 'cappedLogs', type: 'collection', options: { capped: true } }],
  });

  await assert.rejects(createSetupBackup(db), /colecciones capped/);
  assert.deepEqual(db.documents.get('cappedLogs'), [{ _id: 'log-1', message: 'keep me' }]);
  assert.equal((db.documents.get(RECOVERY_COLLECTION_NAME) || []).length, 0);
});

test('does not proceed when the snapshot document count differs from the source', async () => {
  const originalDocuments = [{ _id: 'sale-1' }, { _id: 'sale-2' }];
  const db = new MemoryDatabase({ sales: originalDocuments });
  db.incompleteBackup = true;

  await assert.rejects(createSetupBackup(db), /no coincide con el origen/);
  assert.deepEqual(db.documents.get('sales'), originalDocuments);
  assert.equal((db.documents.get(RECOVERY_COLLECTION_NAME) || []).length, 0);
  assert.ok(![...db.documents.keys()].some((name) => name.startsWith('__mecanet_setup_backup_')));
});

test('refuses automatic restoration if a required snapshot is missing', async () => {
  const db = new MemoryDatabase({ sales: [{ _id: 'sale-1', total: 42 }] });
  const backup = await createSetupBackup(db, ['sales']);
  await setSetupBackupStatus(db, 'in_progress', backup.runId);
  await db.collection('sales').deleteMany({});
  await db.dropCollection(backup.backupCollections[0].backupName);

  await assert.rejects(recoverInterruptedSetup(db, { confirmedRunId: backup.runId }), /Falta el respaldo verificable/);
  assert.deepEqual(db.documents.get('sales'), []);
  assert.equal(db.documents.has(RECOVERY_COLLECTION_NAME), true);
});

test('never restores data without a fresh recovery confirmation', async () => {
  const db = new MemoryDatabase({ sales: [{ _id: 'old-sale', total: 10 }] });
  const backup = await createSetupBackup(db, ['sales']);
  await setSetupBackupStatus(db, 'in_progress', backup.runId);
  await db.collection('sales').insertOne({ _id: 'new-sale', total: 20 });
  const before = structuredClone(db.documents.get('sales'));
  const inspection = await recoverInterruptedSetup(db);
  assert.equal(inspection.action, 'requires_confirmation');
  assert.deepEqual(db.documents.get('sales'), before);
  await assert.rejects(setSetupBackupStatus(db, 'committed', 'different-owner'));
});
