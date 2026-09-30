import { Buffer } from 'buffer';
import { BackupFormatError, MAX_BACKUP_BYTES, parseBackupEnvelope } from './format';

/** Document-provider names and MIME types are hints, not backup identity. */
export function readEncryptedBackupBytes(bytes: Uint8Array): string {
  if (!bytes.length) throw new BackupFormatError('The selected backup file is empty.');
  if (bytes.length > MAX_BACKUP_BYTES)
    throw new BackupFormatError('This backup is too large for this version of TinyWins.');
  const text = Buffer.from(bytes).toString('utf8');
  parseBackupEnvelope(text);
  return text;
}
