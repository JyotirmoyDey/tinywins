import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { BackupFormatError } from './format';
import { backupFilename, writeEncryptedBackupToDirectory } from './exportSave';
import { readEncryptedBackupBytes } from './importRead';

export async function pickEncryptedBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*',
    copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new BackupFormatError('Choose a TinyWins backup file.');
  const file = new File(asset.uri);
  try {
    return readEncryptedBackupBytes(await file.bytes());
  } finally {
    // Only delete a picker copy in our cache, never a provider-owned document.
    if (asset.uri.startsWith(Paths.cache.uri)) {
      try { file.delete(); } catch { /* picker cache cleanup is best effort */ }
    }
  }
}

export async function saveEncryptedBackup(contents: string, localDay: string): Promise<
  { status: 'saved' | 'unverified'; filename?: string } | { status: 'cancelled' }
> {
  if (Platform.OS === 'ios') {
    await shareEncryptedBackup(contents, localDay, 'Save to Files');
    return { status: 'unverified' };
  }
  if (Platform.OS !== 'android') throw new BackupFormatError('Saving backups is only available on Android and iOS.');
  try {
    const directory = await Directory.pickDirectoryAsync();
    const result = await writeEncryptedBackupToDirectory(directory, contents, localDay);
    return { status: result.verified ? 'saved' : 'unverified', filename: result.filename };
  } catch (cause) {
    if (cause instanceof Error && /file picker was cancelled by the user/i.test(cause.message))
      return { status: 'cancelled' };
    if (cause instanceof Error && /no space|ENOSPC|not enough storage/i.test(cause.message))
      throw new BackupFormatError('Not enough storage in the chosen folder to save this backup.');
    if (cause instanceof Error && /permission|access denied|EACCES/i.test(cause.message))
      throw new BackupFormatError('TinyWins could not write to that folder. Choose another location.');
    throw cause;
  }
}

export async function shareEncryptedBackup(contents: string, localDay: string,
  dialogTitle = 'Share TinyWins backup') {
  if (Paths.availableDiskSpace < contents.length * 2)
    throw new BackupFormatError('Not enough free space to prepare the backup file.');
  if (!await Sharing.isAvailableAsync())
    throw new BackupFormatError('File sharing is not available on this device.');
  const temporaryDirectory = new Directory(Paths.cache, `tinywins-share-${randomUUID()}`);
  temporaryDirectory.create();
  const file = new File(temporaryDirectory, backupFilename(localDay));
  file.create();
  try {
    file.write(contents);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream',
      dialogTitle, UTI: 'public.data' });
  } finally { try { temporaryDirectory.delete(); } catch { /* encrypted cache cleanup is best effort */ } }
}
