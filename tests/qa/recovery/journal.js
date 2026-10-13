// PRIVATE SYNTHETIC RECOVERY ONLY. An integrity chain is not a digital signature;
// its final checkpoint must remain under custody outside the restored cluster.
import { open, readFile, unlink, lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ZERO = '0'.repeat(64), MAX_BYTES = 1024 * 1024, MAX_RECORDS = 1000;
const canonical = (value) => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key,JSON.parse(canonical(value[key]))])) : value);
export const sha256 = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
const signed = (record) => ({ ...record, hash: sha256(record) });
function validateMetadata(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'cohortId,generation,systemIdentifier' || !UUID.test(value.cohortId) || !UUID.test(value.generation) || !/^[0-9]{10,24}$/.test(value.systemIdentifier)) throw new Error('INVALID_JOURNAL_METADATA');
}
function validateTarget(action, target) {
  const shapes = { barrier:['generation'], revoke_identity:['identityId'], revoke_session:['sid'], purge_product:['productId','tenantId'] };
  if (!Object.hasOwn(shapes,action) || !target || Object.getPrototypeOf(target) !== Object.prototype || Object.keys(target).sort().join(',') !== shapes[action].join(',')) throw new Error('INVALID_JOURNAL_TARGET');
  for (const [key,value] of Object.entries(target)) if (!(key === 'sid' ? /^[A-Za-z0-9_-]{43}$/.test(value) : UUID.test(value))) throw new Error('INVALID_JOURNAL_TARGET');
}
export async function syncDirectoryStrict(dir) {
  const handle = await open(dir,'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
function matchCheckpoint(records, checkpoint) {
  if (!checkpoint || !Number.isSafeInteger(checkpoint.sequence) || records[checkpoint.sequence]?.hash !== checkpoint.hash) throw new Error('JOURNAL_CHECKPOINT_MISMATCH');
}
export function verifyJournal(text, { checkpoint, finalCheckpoint } = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES || !text.endsWith('\n')) throw new Error('JOURNAL_TRUNCATED');
  const lines = text.trimEnd().split('\n'); if (lines.length > MAX_RECORDS) throw new Error('JOURNAL_LIMIT');
  const records = [], intents = new Map(), results = new Set();
  for (const [index,line] of lines.entries()) {
    let row; try { row = JSON.parse(line); } catch { throw new Error('JOURNAL_TRUNCATED'); }
    if (row.sequence !== index) throw new Error('JOURNAL_SEQUENCE_GAP');
    if (row.previousHash !== (records.at(-1)?.hash ?? ZERO)) throw new Error('JOURNAL_HASH_MISMATCH');
    const {hash,...body} = row; if (hash !== sha256(body)) throw new Error('JOURNAL_HASH_MISMATCH');
    if (index === 0) { if (row.kind !== 'header') throw new Error('JOURNAL_HEADER_REQUIRED'); validateMetadata(row.metadata); }
    else if (row.kind === 'intent') {
      validateTarget(row.action,row.target);
      if (!UUID.test(row.operationId) || intents.has(row.operationId)) throw new Error('DUPLICATE_JOURNAL_INTENT');
      intents.set(row.operationId,row);
    } else if (row.kind === 'result') {
      if (!intents.has(row.operationId) || row.intentHash !== intents.get(row.operationId).hash || row.outcome !== 'committed') throw new Error('RESULT_WITHOUT_INTENT');
      if (results.has(row.operationId)) throw new Error('DUPLICATE_JOURNAL_RESULT');
      results.add(row.operationId);
    } else throw new Error('INVALID_JOURNAL_RECORD');
    records.push(row);
  }
  if (checkpoint) matchCheckpoint(records,checkpoint);
  if (finalCheckpoint) { matchCheckpoint(records,finalCheckpoint); if (finalCheckpoint.sequence !== records.length-1) throw new Error('JOURNAL_CHECKPOINT_MISMATCH'); }
  return { metadata: records[0].metadata, records, intents:[...intents.values()], pending:[...intents.values()].filter(row => !results.has(row.operationId)), checkpoint:{sequence:records.length-1,hash:records.at(-1).hash} };
}

async function writer(file, metadata, { expectedHead, syncDirectory = syncDirectoryStrict, create = false } = {}) {
  file = resolve(file); const lockPath = `${file}.lock`; let lock, handle;
  try { lock = await open(lockPath,'wx',0o600); } catch (error) { if (error.code === 'EEXIST') throw new Error('JOURNAL_WRITER_EXISTS'); throw error; }
  try {
    await lock.sync(); await syncDirectory(dirname(file));
    if (!create && (await lstat(file)).isSymbolicLink()) throw new Error('JOURNAL_SYMLINK_REJECTED');
    handle = await open(file,create?'wx':'a',0o600);
    let records;
    if (create) {
      validateMetadata(metadata);
      const header = signed({ sequence:0,kind:'header',metadata,previousHash:ZERO });
      await handle.writeFile(`${JSON.stringify(header)}\n`); await handle.sync(); await syncDirectory(dirname(file)); records=[header];
    } else {
      if (!expectedHead) throw new Error('JOURNAL_CHECKPOINT_REQUIRED');
      records = verifyJournal(await readFile(file,'utf8'),{finalCheckpoint:expectedHead}).records;
    }
    let closed=false, uncertain=false, serial=Promise.resolve();
    const sequence = (fn) => { const operation=serial.then(fn); serial=operation.catch(()=>{}); return operation; };
    async function append(body) {
      if (closed || uncertain) throw new Error('JOURNAL_CLOSED');
      const record=signed({sequence:records.length,...body,previousHash:records.at(-1).hash});
      const line=`${JSON.stringify(record)}\n`;
      if (Buffer.byteLength(line)>4096 || records.length>=MAX_RECORDS || (await handle.stat()).size+Buffer.byteLength(line)>MAX_BYTES) throw new Error('JOURNAL_LIMIT');
      try { await handle.writeFile(line); await handle.sync(); } catch (error) { uncertain=true; throw error; }
      records.push(record); return record;
    }
    return {
      intent(action,target,operationId=randomUUID()) { return sequence(async()=>{validateTarget(action,target);if(!UUID.test(operationId)||records.some(r=>r.kind==='intent'&&r.operationId===operationId))throw new Error('DUPLICATE_JOURNAL_INTENT');return append({kind:'intent',operationId,action,target});}); },
      result(operationId) { return sequence(async()=>{const intent=records.find(r=>r.kind==='intent'&&r.operationId===operationId);if(!intent)throw new Error('RESULT_WITHOUT_INTENT');if(records.some(r=>r.kind==='result'&&r.operationId===operationId))throw new Error('DUPLICATE_JOURNAL_RESULT');return append({kind:'result',operationId,intentHash:intent.hash,outcome:'committed'});}); },
      checkpoint() { return {sequence:records.length-1,hash:records.at(-1).hash}; },
      async close() { await serial; if(closed)return;closed=true;await handle.close();await lock.close();await unlink(lockPath);await syncDirectory(dirname(file)); },
    };
  } catch (error) { await handle?.close().catch(()=>{}); await lock.close().catch(()=>{}); await unlink(lockPath).catch(()=>{}); throw error; }
}
export const createJournal = (file,metadata,options={}) => writer(file,metadata,{...options,create:true});
export const openJournal = (file,options={}) => writer(file,null,options);
export async function replayRestrictive(verified, applyIntent) {
  if (typeof applyIntent !== 'function') throw new Error('REPLAY_HANDLER_REQUIRED');
  // Both completed and incomplete intents are applied; the SQL adapter is idempotent.
  for (const intent of verified.intents) if (intent.action !== 'barrier') await applyIntent(intent);
  return { applied:verified.intents.filter(r=>r.action!=='barrier').length, pendingRestrictivelyApplied:verified.pending.filter(r=>r.action!=='barrier').length };
}
