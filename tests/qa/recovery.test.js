import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createJournal, openJournal, verifyJournal, replayRestrictive } from './recovery/journal.js';
import { validateRestorePlan, rotateRestoredCredentials } from './recovery/coordinator.js';
import * as recoveryCoordinator from './recovery/coordinator.js';
import { QA_ROLES } from './schema/fixture.js';

const metadata = () => ({ cohortId: randomUUID(), generation: randomUUID(), systemIdentifier: '7695987901305831451' });
async function tempJournal(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'mecanet-l1-journal-')); const file = join(dir, 'journal.jsonl');
  // Real files/file fsync. Directory sync is an explicit test double on Windows;
  // the default production implementation remains strict and is verified on Linux.
  const syncDirectory = process.platform === 'win32' ? async () => {} : undefined;
  try { await fn({ file, syncDirectory }); }
  finally { for (const p of [file,`${file}.lock`]) await unlink(p).catch(e => { if (e.code !== 'ENOENT') throw e; }); await rmdir(dir); }
}

test('journal persists intent before result, verifies chain and resumes at exact anchor', async () => tempJournal(async ({ file, syncDirectory }) => {
  const journal = await createJournal(file, metadata(), { syncDirectory });
  const intent = await journal.intent('revoke_identity', { identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' });
  const before = journal.checkpoint();
  assert.equal(verifyJournal(await readFile(file,'utf8'), { finalCheckpoint: before }).pending.length, 1);
  await journal.result(intent.operationId); const final = journal.checkpoint(); await journal.close();
  const restored = await openJournal(file, { expectedHead: final, syncDirectory });
  assert.deepEqual(restored.checkpoint(), final); await restored.close();
  assert.equal(verifyJournal(await readFile(file,'utf8'), { checkpoint: before, finalCheckpoint: final }).pending.length, 0);
}));

test('journal rejects competing writer, unknown result, excessive target and changed anchor', async () => tempJournal(async ({ file, syncDirectory }) => {
  const journal = await createJournal(file, metadata(), { syncDirectory });
  await assert.rejects(openJournal(file, { expectedHead: journal.checkpoint(), syncDirectory }), /JOURNAL_WRITER_EXISTS/);
  await assert.rejects(journal.result(randomUUID()), /RESULT_WITHOUT_INTENT/);
  await assert.rejects(journal.intent('revoke_identity', { identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', password: 'never-log' }), /INVALID_JOURNAL_TARGET/);
  const final = journal.checkpoint(); await journal.close();
  await assert.rejects(openJournal(file, { expectedHead: { ...final, hash: '0'.repeat(64) }, syncDirectory }), /JOURNAL_CHECKPOINT_MISMATCH/);
}));

test('tampering, sequence holes, truncated records and dropped tail block verification', async () => tempJournal(async ({ file, syncDirectory }) => {
  const journal = await createJournal(file, metadata(), { syncDirectory });
  const intent = await journal.intent('purge_product', { tenantId: '11111111-1111-4111-8111-111111111111', productId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
  await journal.result(intent.operationId); const final = journal.checkpoint(); await journal.close();
  const text = await readFile(file,'utf8');
  assert.throws(() => verifyJournal(text.replace('cccccccc-cccc','dddddddd-dddd'), { finalCheckpoint: final }), /JOURNAL_HASH_MISMATCH/);
  const lines = text.trimEnd().split('\n');
  assert.throws(() => verifyJournal(`${lines[0]}\n${lines[2]}\n`, { finalCheckpoint: final }), /JOURNAL_SEQUENCE_GAP/);
  assert.throws(() => verifyJournal(text.slice(0,-8), { finalCheckpoint: final }), /JOURNAL_TRUNCATED/);
  assert.throws(() => verifyJournal(`${lines.slice(0,2).join('\n')}\n`, { finalCheckpoint: final }), /JOURNAL_CHECKPOINT_MISMATCH/);
}));

test('an unresolved durable intent is replayed restrictively and replay failure stays closed', async () => tempJournal(async ({ file, syncDirectory }) => {
  const journal = await createJournal(file, metadata(), { syncDirectory });
  await journal.intent('revoke_identity', { identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' });
  const final = journal.checkpoint(); await journal.close();
  const verified = verifyJournal(await readFile(file,'utf8'), { finalCheckpoint: final }); const applied = [];
  await replayRestrictive(verified, async (intent) => applied.push(intent.operationId));
  assert.equal(applied.length, 1);
  await assert.rejects(replayRestrictive(verified, async () => { throw new Error('TARGET_UNAVAILABLE'); }), /TARGET_UNAVAILABLE/);
}));

test('physical restore keeps system ID but requires distinct destination and closed source', () => {
  const m = metadata();
  const valid = { project: 'mecanet-qa-p1l1', dataClass: 'synthetic', ...m, targetGeneration: randomUUID(), source: { service:'postgres', volume:'mecanet-qa-p1l1_pgdata' }, target: { service:'postgres_restore', volume:'mecanet-qa-p1l1_restore' }, proof: { sourceBarrier:true, sourceStopped:true, clockStopped:true, projectionStopped:true, apiOwnersStopped:[randomUUID(),randomUUID()], targetEgressClosed:true, targetTlsReviewed:true, targetHbaReviewed:true, targetPrivate:true, backupVerified:true }, backupManifestHash: 'a'.repeat(64), startLsn:'0/1000000', endLsn:'0/2000000' };
  assert.equal(validateRestorePlan(valid).systemIdentifier, m.systemIdentifier);
  for (const bad of [{ ...valid, target:valid.source }, { ...valid, proof:{ ...valid.proof, sourceStopped:false } }, { ...valid, targetGeneration:m.generation }, { ...valid, endLsn:'0/1' }]) assert.throws(() => validateRestorePlan(bad), /RESTORE_PREFLIGHT_REQUIRED/);
});

test('credential candidate contains exactly the private login roles with distinct 32-byte secrets', () => {
  assert.equal(typeof recoveryCoordinator.createRestoredCredentialCandidate,'function');
  const candidate=recoveryCoordinator.createRestoredCredentialCandidate();
  assert.deepEqual(Object.keys(candidate).sort(),[...Object.keys(QA_ROLES),'qa_bootstrap'].sort());
  assert.equal(Object.isFrozen(candidate),true);
  assert.equal(new Set(Object.values(candidate)).size,Object.keys(candidate).length);
  for(const password of Object.values(candidate)){
    assert.equal(typeof password==='string'&&password.length===43&&Buffer.from(password,'base64url').length===32,true,'candidate must contain a 32-byte secret');
  }
});

test('credential rotation rejects incomplete, extra or unsafe candidates before opening SQL', async () => {
  assert.equal(typeof recoveryCoordinator.createRestoredCredentialCandidate,'function');
  const candidate=recoveryCoordinator.createRestoredCredentialCandidate();let connects=0;
  const pool={connect:async()=>{connects++;throw new Error('UNEXPECTED_SQL');}};
  const missing={...candidate};delete missing.qa_bootstrap;
  const accessor={...candidate};Object.defineProperty(accessor,'qa_bootstrap',{get(){throw new Error('ACCESSOR_MUST_NOT_RUN');},enumerable:true});
  for(const invalid of [null,[],missing,{...candidate,saas_unapproved:candidate.qa_bootstrap},{...candidate,qa_bootstrap:'unsafe\nvalue'},{...candidate,qa_bootstrap:candidate.saas_api},accessor]){
    await assert.rejects(rotateRestoredCredentials(pool,invalid),/RECOVERY_CREDENTIAL_CANDIDATE_REQUIRED/);
  }
  assert.equal(connects,0);
});

test('credential rotation applies the supplied custody candidate exactly and returns no secrets', async () => {
  assert.equal(typeof recoveryCoordinator.createRestoredCredentialCandidate,'function');
  const candidate=recoveryCoordinator.createRestoredCredentialCandidate();const statements=[];let supplied=0,released=false;
  const expectedRoles=[...Object.keys(QA_ROLES),'qa_bootstrap'];
  const client={query:async(sql,args)=>{
    statements.push(sql);
    if(sql.startsWith('SELECT barrier'))return{rows:[{barrier:true}]};
    if(sql.startsWith('SELECT set_config')){assert.equal(args[0]===candidate[expectedRoles[supplied]],true,'ALTER ROLE must use the durably custodied candidate');supplied++;}
    return{rows:[]};
  },release:error=>{assert.equal(error,false);released=true;}};
  const result=await rotateRestoredCredentials({connect:async()=>client},candidate);
  assert.equal(supplied,expectedRoles.length);assert.equal(statements.at(-1),'COMMIT');assert.equal(released,true);
  assert.deepEqual(result,{rotatedRoles:expectedRoles.length,committed:true});
  for(const value of Object.values(candidate))assert.equal(JSON.stringify(result).includes(value),false,'rotation result cannot contain a secret');
});
