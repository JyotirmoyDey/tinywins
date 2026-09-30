import { Buffer, createCipheriv, createDecipheriv, pbkdf2, randomBytes } from 'react-native-quick-crypto';
import type { BackupCrypto } from './format';

/** Import only after confirming the native QuickBase64 module is present. */
export const nativeBackupCrypto: BackupCrypto = {
  randomBytes: length => randomBytes(length),
  deriveKey: (password, salt, iterations) => new Promise((resolve, reject) => {
    pbkdf2(password, Buffer.from(salt), iterations, 32, 'sha256', (error, key) => {
      if (error) reject(error);
      else if (key) resolve(key);
      else reject(new Error('Could not derive backup key.'));
    });
  }),
  encrypt: async (plaintext, key, nonce, aad) => {
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce));
    cipher.setAAD(Buffer.from(aad));
    return { ciphertext: Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]),
      tag: cipher.getAuthTag() };
  },
  decrypt: async (ciphertext, tag, key, nonce, aad) => {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
  },
};
