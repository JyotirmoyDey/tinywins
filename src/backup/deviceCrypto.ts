import { TurboModuleRegistry } from 'react-native';
import type { BackupCrypto } from './format';

const NATIVE_BUILD_MESSAGE = 'Encrypted backups need a current TinyWins development or production build. Install the latest build, then try again.';

export function hasNativeBackupModule() {
  return TurboModuleRegistry.get('QuickBase64') !== null;
}

/** Never evaluate Quick Crypto if its required native module is absent. */
export async function getDeviceBackupCrypto(): Promise<BackupCrypto> {
  if (!hasNativeBackupModule()) throw new Error(NATIVE_BUILD_MESSAGE);
  try { return (await import('./nativeCrypto')).nativeBackupCrypto; }
  catch { throw new Error(NATIVE_BUILD_MESSAGE); }
}
