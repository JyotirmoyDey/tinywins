import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import test from 'node:test';
import { setup, draft } from './sqlite';
import { BackupCrypto, BackupFormatError, decryptBackup, encryptBackup,
  parseBackupEnvelope } from '../src/backup/format';
import { collectBackupPayload, decodeBackupPayload, restoreBackupPayload } from '../src/backup/data';
import { createEncryptedBackup, inspectEncryptedBackup } from '../src/backup/service';
import { localDate } from '../src/domain/task';
import { readEncryptedBackupBytes } from '../src/backup/importRead';
import { writeEncryptedBackupToDirectory } from '../src/backup/exportSave';

const crypto: BackupCrypto = {
  randomBytes,
  deriveKey: async (password, salt, iterations) => pbkdf2Sync(password, salt, iterations, 32, 'sha256'),
  encrypt: async (plaintext, key, nonce, aad) => {
    const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(aad);
    return { ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]), tag: cipher.getAuthTag() };
  },
  decrypt: async (ciphertext, tag, key, nonce, aad) => {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aad); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  },
};
const password = 'correct horse battery staple';

test('PBKDF2-SHA256 matches a published test vector', () => {
  assert.equal(pbkdf2Sync('password', 'salt', 1, 32, 'sha256').toString('hex'),
    '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
});

test('authenticated envelope round trips; wrong password, tampering and versions fail', async () => {
  const plain = Buffer.from('TinyWins 🪴');
  const first = await encryptBackup(plain, password, crypto);
  const second = await encryptBackup(plain, password, crypto);
  assert.equal(Buffer.from(await decryptBackup(first, password, crypto)).toString(), 'TinyWins 🪴');
  assert.notEqual(parseBackupEnvelope(first).kdf.salt, parseBackupEnvelope(second).kdf.salt);
  assert.notEqual(parseBackupEnvelope(first).encryption.nonce, parseBackupEnvelope(second).encryption.nonce);
  await assert.rejects(decryptBackup(first, 'a different password', crypto), /Incorrect password/);
  const envelope = parseBackupEnvelope(first);
  await assert.rejects(decryptBackup(JSON.stringify({ ...envelope,
    ciphertext: Buffer.from('tampered').toString('base64') }), password, crypto), /Incorrect password/);
  await assert.rejects(decryptBackup(JSON.stringify({ ...envelope, kdf: { ...envelope.kdf,
    salt: randomBytes(16).toString('base64') } }), password, crypto), /Incorrect password/);
  assert.throws(() => parseBackupEnvelope(JSON.stringify({ ...envelope, version: 2 })), /newer version/);
  assert.throws(() => parseBackupEnvelope(JSON.stringify({ ...envelope,
    kdf: { ...envelope.kdf, iterations: 1 } })), /security settings/);
  assert.throws(() => parseBackupEnvelope('{'), BackupFormatError);
});

test('empty installation can be backed up and restored', async () => {
  const source = await setup(); const destination = await setup();
  try {
    const file = await createEncryptedBackup(source.connection, password, crypto);
    let saved: Uint8Array<ArrayBufferLike> = new Uint8Array();
    await writeEncryptedBackupToDirectory({ list: () => [], createFile: name => ({
      name: `${name}.bin`, get size() { return saved.length; },
      write: bytes => { saved = bytes; }, bytes: async () => saved,
    }) }, file, '2026-09-27');
    const imported = readEncryptedBackupBytes(saved);
    assert.equal(imported, file);
    const payload = await inspectEncryptedBackup(imported, password, crypto);
    await restoreBackupPayload(destination.connection, payload);
    assert.deepEqual((await collectBackupPayload(destination.connection)).tables, payload.tables);
  } finally { source.native.close(); destination.native.close(); }
});

test('empty and corrupt selected documents are rejected by content', () => {
  assert.throws(() => readEncryptedBackupBytes(new Uint8Array()), /empty/);
  assert.throws(() => readEncryptedBackupBytes(Buffer.from('not a TinyWins backup')), /invalid/);
});

test('full history, settings, archive lifecycle, Unicode and long records survive round trip', async () => {
  const source = await setup(); const destination = await setup();
  try {
    const guitarDraft = draft('Guitar 🎸');
    const first = await source.tasks.create({ ...guitarDraft, options: guitarDraft.options.map((option, index) =>
      index === 0 ? { ...option, description: 'Gentle practice' } : option) });
    const sleepDraft = draft('Sleep 😴');
    const second = await source.tasks.create({ ...sleepDraft, options: sleepDraft.options.map((option, index) =>
      index === 0 ? { ...option, description: 'A restless night' } : option) });
    await source.tasks.setCombinedInsightsSelection(second.id, false);
    const dates = Array.from({ length: 120 }, (_, index) => {
      const day = new Date(); day.setDate(day.getDate() - 119 + index); return localDate(day);
    });
    for (const [index, date] of dates.entries()) {
      if (index % 5 !== 0) await source.entries.upsert(first.id, date, first.options[index % 4].id);
      if (index % 3 === 0) await source.entries.upsert(second.id, date, second.options[0].id);
    }
    await source.tasks.update(first.id, { name: 'Guitar 🎸', options: [
      ...first.options.slice(0, 2).map(o => ({ id: o.id, label: o.label, description: o.description })),
      { id: 'new-unicode-option', label: 'Très bon 🌟', description: 'Musical progress' },
      ...first.options.slice(2).map(o => ({ id: o.id, label: o.label, description: o.description })),
    ] });
    await source.tasks.archive(second.id);
    await source.tasks.restore(second.id);
    await source.tasks.archive(second.id);
    const before = await collectBackupPayload(source.connection);
    assert.equal(before.tables.task_options.find(row => row.id === first.options[0].id)?.description, 'Gentle practice');
    assert.equal(before.tables.task_options.find(row => row.id === second.options[0].id)?.description, 'A restless night');
    assert.equal(before.tables.daily_entries.some(row => row.normalizedWeightAtEntry === 0), true);
    assert.equal(before.tables.daily_entries.some(row => row.localDate === dates[0] && row.taskId === first.id), false);
    const file = await createEncryptedBackup(source.connection, password, crypto);
    const inspected = await inspectEncryptedBackup(file, password, crypto);
    await restoreBackupPayload(destination.connection, inspected);
    const after = await collectBackupPayload(destination.connection);
    assert.deepEqual(after.tables, before.tables);
    assert.equal((await destination.tasks.getById(second.id))?.options[0].description, 'A restless night');
    assert.equal(after.tables.task_lifecycle_transitions.length, 3);
    assert.equal(after.tables.tasks.find(row => row.id === second.id)?.active, 0);
    assert.equal(after.tables.tasks.find(row => row.id === second.id)?.includeInCombinedInsights, 0);
    assert.equal(after.tables.rating_scale_versions.length, 3);
    assert.equal(after.tables.daily_entries.length > 100, true);
    // A repeated restore is idempotent and leaves no duplicate daily entries.
    await restoreBackupPayload(destination.connection, inspected);
    assert.deepEqual((await collectBackupPayload(destination.connection)).tables, before.tables);
  } finally { source.native.close(); destination.native.close(); }
});

test('older backups without level descriptions import with absent descriptions', async () => {
  const source = await setup(); const target = await setup();
  try {
    const task = await source.tasks.create(draft('Earlier data'));
    const current = await collectBackupPayload(source.connection);
    const old = structuredClone(current);
    old.sourceDatabaseVersion = 6;
    old.tables.task_options = old.tables.task_options.map(({ description: _description, ...row }) => row);
    const decoded = decodeBackupPayload(Buffer.from(JSON.stringify(old)));
    assert.equal(decoded.tables.task_options.every(row => row.description === null), true);
    await restoreBackupPayload(target.connection, decoded);
    assert.equal((await target.tasks.getById(task.id))?.options.every(option => option.description === undefined), true);
    assert.equal((await collectBackupPayload(target.connection)).tables.task_options.length, task.options.length);
  } finally { source.native.close(); target.native.close(); }
});

test('rollback preserves existing data if an insert fails during restoration', async () => {
  const source = await setup(); const destination = await setup();
  try {
    await source.tasks.create(draft('Source'));
    await destination.tasks.create(draft('Existing'));
    const original = await collectBackupPayload(destination.connection);
    const incoming = await collectBackupPayload(source.connection);
    destination.native.exec(`CREATE TRIGGER block_restore BEFORE INSERT ON tasks
      WHEN NEW.name = 'Source' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    await assert.rejects(restoreBackupPayload(destination.connection, incoming), /injected failure/);
    assert.deepEqual((await collectBackupPayload(destination.connection)).tables, original.tables);
  } finally { source.native.close(); destination.native.close(); }
});

test('newer database payload is rejected without touching current data', async () => {
  const db = await setup();
  try {
    await db.tasks.create(draft());
    const original = await collectBackupPayload(db.connection);
    const incompatible = { ...original, sourceDatabaseVersion: 999 };
    await assert.rejects(restoreBackupPayload(db.connection, incompatible), /invalid or incomplete/);
    assert.deepEqual((await collectBackupPayload(db.connection)).tables, original.tables);
    // A compatible backup from an earlier database version remains importable.
    await restoreBackupPayload(db.connection, { ...original, sourceDatabaseVersion: 5 });
  } finally { db.native.close(); }
});

test('ten active items and archived history restore without changing identifiers', async () => {
  const source = await setup(); const target = await setup();
  try {
    const tasks = [];
    for (let index = 0; index < 10; index++) tasks.push(await source.tasks.create(draft(`Item ${index}`)));
    await source.entries.upsert(tasks[9].id, localDate(), tasks[9].options[0].id);
    await source.tasks.archive(tasks[9].id);
    const before = await collectBackupPayload(source.connection);
    await restoreBackupPayload(target.connection, before);
    const after = await collectBackupPayload(target.connection);
    assert.deepEqual(after.tables, before.tables);
    assert.equal(after.tables.tasks.filter(task => task.active === 1).length, 9);
    assert.equal(after.tables.daily_entries[0].normalizedWeightAtEntry, 0);
  } finally { source.native.close(); target.native.close(); }
});

test('invalid relationships and duplicate task dates are rejected before replacement', async () => {
  const db = await setup();
  try {
    const task = await db.tasks.create(draft());
    await db.entries.upsert(task.id, localDate(), task.options[0].id);
    const original = await collectBackupPayload(db.connection);
    const broken = structuredClone(original);
    broken.tables.daily_entries[0].optionId = 'nonexistent';
    await assert.rejects(restoreBackupPayload(db.connection, broken), /invalid or incomplete/);
    const duplicate = structuredClone(original);
    duplicate.tables.daily_entries.push({ ...duplicate.tables.daily_entries[0], id: 'duplicate' });
    await assert.rejects(restoreBackupPayload(db.connection, duplicate), /invalid or incomplete/);
    assert.deepEqual((await collectBackupPayload(db.connection)).tables, original.tables);
  } finally { db.native.close(); }
});
