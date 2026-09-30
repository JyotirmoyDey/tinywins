import test from 'node:test';
import assert from 'node:assert/strict';
import { backupFilename, writeEncryptedBackupToDirectory } from '../src/backup/exportSave';

const contents = JSON.stringify({ format: 'tinywins-encrypted-backup', version: 1,
  kdf: { algorithm: 'PBKDF2-HMAC-SHA256', iterations: 600000, salt: Buffer.alloc(16, 1).toString('base64') },
  encryption: { algorithm: 'AES-256-GCM', nonce: Buffer.alloc(12, 2).toString('base64') },
  ciphertext: Buffer.from('encrypted bytes').toString('base64'), tag: Buffer.alloc(16, 3).toString('base64') });

test('backup names retain the .tinywins extension and never reuse a visible filename', () => {
  assert.equal(backupFilename('2026-09-27'), 'tinywins-backup-2026-09-27.tinywins');
  assert.equal(backupFilename('2026-09-27', [
    'tinywins-backup-2026-09-27.tinywins', 'TINYWINS-BACKUP-2026-09-27-2.TINYWINS',
  ]), 'tinywins-backup-2026-09-27-3.tinywins');
});

test('device export writes and verifies the exact encrypted envelope', async () => {
  const saved = new Map<string, Uint8Array>([['tinywins-backup-2026-09-27.tinywins', Buffer.from('older backup')]]);
  const result = await writeEncryptedBackupToDirectory({
    list: () => [...saved.keys()].map(name => ({ name, uri: `content://${name}` })),
    createFile: name => ({ name: `${name}.bin`, uri: `content://${name}.bin`,
      get size() { return saved.get(`${name}.bin`)?.length ?? 0; },
      write: bytes => { saved.set(`${name}.bin`, bytes); },
      bytes: async () => saved.get(`${name}.bin`) ?? new Uint8Array() }),
  }, contents, '2026-09-27');
  assert.deepEqual(result, { filename: 'tinywins-backup-2026-09-27-2.tinywins.bin', verified: true });
  assert.equal(Buffer.from(saved.get('tinywins-backup-2026-09-27.tinywins')!).toString(), 'older backup');
  assert.equal(Buffer.from(saved.get(result.filename)!).toString(), contents);
});

test('device export does not report success when saved bytes differ', async () => {
  await assert.rejects(() => writeEncryptedBackupToDirectory({
    list: () => [],
    createFile: name => ({ name, size: 0, write: () => {}, bytes: async () => new Uint8Array() }),
  }, contents, '2026-09-27'), /empty or incomplete/);
});

test('empty encrypted backup is rejected before a file is created', async () => {
  let created = false;
  await assert.rejects(() => writeEncryptedBackupToDirectory({
    list: () => [], createFile: name => { created = true; return {
      name, write: () => {}, bytes: async () => new Uint8Array(),
    }; },
  }, '', '2026-09-27'), /empty/);
  assert.equal(created, false);
});

test('provider returning an existing file URI is rejected before writing', async () => {
  let wrote = false;
  await assert.rejects(() => writeEncryptedBackupToDirectory({
    list: () => [{ name: 'other.tinywins', uri: 'content://existing' }],
    createFile: name => ({ name, uri: 'content://existing', write: () => { wrote = true; },
      bytes: async () => new Uint8Array() }),
  }, contents, '2026-09-27'), /Nothing was overwritten/);
  assert.equal(wrote, false);
});

test('matching read-back bytes win over stale provider size metadata', async () => {
  let saved: Uint8Array<ArrayBufferLike> = new Uint8Array();
  const result = await writeEncryptedBackupToDirectory({ list: () => [],
    createFile: name => ({ name, size: 0, write: bytes => { saved = bytes; },
      bytes: async () => saved }),
  }, contents, '2026-09-27');
  assert.equal(result.verified, true);
});

test('provider that forbids read-back is reported as unverified, never confirmed', async () => {
  const result = await writeEncryptedBackupToDirectory({ list: () => [],
    createFile: name => ({ name, size: Buffer.byteLength(contents), write: () => {},
      bytes: async () => { throw new Error('read not permitted'); } }),
  }, contents, '2026-09-27');
  assert.equal(result.verified, false);
});
