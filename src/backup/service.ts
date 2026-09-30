import { Connection } from '../data/connection';
import { BackupCrypto, decryptBackup, encryptBackup } from './format';
import { BackupPayload, collectBackupPayload, decodeBackupPayload,
  encodeBackupPayload, restoreBackupPayload } from './data';

export async function createEncryptedBackup(connection: Connection, password: string,
  crypto: BackupCrypto, onProgress?: (message: string) => void): Promise<string> {
  const payload = await collectBackupPayload(connection);
  onProgress?.('Encrypting your backup…');
  return encryptBackup(encodeBackupPayload(payload), password, crypto);
}

export async function inspectEncryptedBackup(file: string, password: string,
  crypto: BackupCrypto): Promise<BackupPayload> {
  return decodeBackupPayload(await decryptBackup(file, password, crypto));
}

export async function restoreInspectedBackup(connection: Connection, payload: BackupPayload) {
  await restoreBackupPayload(connection, payload);
}

async function deviceCrypto() {
  return (await import('./deviceCrypto')).getDeviceBackupCrypto();
}
export async function createLocalBackup(password: string, onProgress?: (message: string) => void) {
  const { getRepositories } = await import('../data/runtime');
  const [repos, crypto] = await Promise.all([getRepositories(), deviceCrypto()]);
  return createEncryptedBackup(repos.connection, password, crypto, onProgress);
}
export async function unlockLocalBackup(file: string, password: string) {
  return inspectEncryptedBackup(file, password, await deviceCrypto());
}
export async function restoreLocalBackup(payload: BackupPayload) {
  const { Paths } = await import('expo-file-system');
  const requiredSpace = encodeBackupPayload(payload).length * 3;
  if (Paths.availableDiskSpace < requiredSpace)
    throw new Error('Not enough free space to restore this backup.');
  const { getRepositories } = await import('../data/runtime');
  const repos = await getRepositories();
  await restoreInspectedBackup(repos.connection, payload);
}
