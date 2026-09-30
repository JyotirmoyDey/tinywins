import { Buffer } from 'buffer';
import { BackupFormatError, parseBackupEnvelope } from './format';

/** The encrypted envelope is exported verbatim; this layer never decrypts or rewrites it. */
export interface ExportDirectory {
  list(): { name: string; uri?: string }[];
  createFile(name: string, mimeType: string): ExportFile;
}

export interface ExportFile {
  name: string;
  uri?: string;
  size?: number | null;
  write(contents: Uint8Array): void;
  bytes(): Promise<Uint8Array>;
}

export interface SavedBackup { filename: string; verified: boolean }

export function backupFilename(localDay: string, existingNames: readonly string[] = []): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDay)) throw new Error('Invalid backup date.');
  const stem = `tinywins-backup-${localDay}`;
  const taken = new Set(existingNames.map(name => name.toLocaleLowerCase()));
  for (let number = 1; number <= 9999; number++) {
    const name = `${stem}${number === 1 ? '' : `-${number}`}.tinywins`;
    if (!taken.has(name.toLocaleLowerCase())) return name;
  }
  throw new Error('This folder contains too many backups for today. Choose another folder.');
}

export async function writeEncryptedBackupToDirectory(
  directory: ExportDirectory, contents: string, localDay: string,
): Promise<SavedBackup> {
  if (!contents) throw new BackupFormatError('The encrypted backup is empty. Create it again.');
  parseBackupEnvelope(contents);
  const expected = Buffer.from(contents, 'utf8');
  if (!expected.length) throw new BackupFormatError('The encrypted backup is empty. Create it again.');
  const existing = directory.list();
  const name = backupFilename(localDay, existing.map(file => file.name));
  // A custom MIME avoids providers appending a generic .bin extension.
  const file = directory.createFile(name, 'application/x-tinywins');
  // SAF providers may change the display name or extension. The URI, not the
  // returned name, determines whether this is a newly created document.
  if (file.uri && existing.some(item => item.uri === file.uri))
    throw new BackupFormatError('The chosen folder returned an existing file. Nothing was overwritten.');
  file.write(expected);
  let actual: Uint8Array;
  try { actual = await file.bytes(); }
  catch {
    if (file.size === 0 || file.size != null && file.size !== expected.length)
      throw new BackupFormatError('The saved backup is empty or incomplete. Try another folder.');
    return { filename: file.name || name, verified: false };
  }
  // Read-back bytes are authoritative; some SAF providers report stale size metadata.
  if (actual.length !== expected.length || !Buffer.from(actual).equals(expected))
    throw new BackupFormatError('The saved backup is empty or incomplete. Try another folder.');
  return { filename: file.name || name, verified: true };
}
