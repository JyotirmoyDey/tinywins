import { Buffer } from 'buffer';

export const BACKUP_FORMAT = 'tinywins-encrypted-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const PAYLOAD_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
export const MAX_BACKUP_BYTES = 30_000_000;
export const MAX_PLAINTEXT_BYTES = 20_000_000;
const MIN_ITERATIONS = 600_000;
const MAX_ITERATIONS = 1_200_000;

export interface BackupCrypto {
  randomBytes(length: number): Uint8Array | Promise<Uint8Array>;
  deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array>;
  encrypt(plaintext: Uint8Array, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array):
    Promise<{ ciphertext: Uint8Array; tag: Uint8Array }>;
  decrypt(ciphertext: Uint8Array, tag: Uint8Array, key: Uint8Array,
    nonce: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
}

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: 1;
  kdf: { algorithm: 'PBKDF2-HMAC-SHA256'; iterations: number; salt: string };
  encryption: { algorithm: 'AES-256-GCM'; nonce: string };
  ciphertext: string;
  tag: string;
}

export class BackupFormatError extends Error {
  constructor(message: string) { super(message); this.name = 'BackupFormatError'; }
}

function base64(bytes: Uint8Array) { return Buffer.from(bytes).toString('base64'); }
function decode(value: unknown, exactLength?: number): Uint8Array {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    value.length % 4 !== 0) throw new BackupFormatError('The backup file is invalid.');
  const result = Buffer.from(value, 'base64');
  if (base64(result) !== value || exactLength !== undefined && result.length !== exactLength)
    throw new BackupFormatError('The backup file is invalid.');
  return result;
}
function aad(envelope: BackupEnvelope) {
  return Buffer.from(JSON.stringify({ format: envelope.format, version: envelope.version,
    kdf: envelope.kdf, encryption: envelope.encryption }), 'utf8');
}
function hasKeys(value: Record<string, unknown>, names: string[]) {
  const actual = Object.keys(value);
  return actual.length === names.length && names.every(name => actual.includes(name));
}

export function parseBackupEnvelope(text: string): BackupEnvelope {
  if (Buffer.byteLength(text, 'utf8') > MAX_BACKUP_BYTES)
    throw new BackupFormatError('This backup is too large for this version of TinyWins.');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new BackupFormatError('The backup file is invalid.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BackupFormatError('The backup file is invalid.');
  const item = value as Record<string, unknown>;
  if (!hasKeys(item, ['format', 'version', 'kdf', 'encryption', 'ciphertext', 'tag']))
    throw new BackupFormatError('The backup file is invalid.');
  if (item.format !== BACKUP_FORMAT) throw new BackupFormatError('This is not a TinyWins backup.');
  if (typeof item.version !== 'number' || item.version > BACKUP_FORMAT_VERSION)
    throw new BackupFormatError('This backup needs a newer version of TinyWins.');
  if (item.version !== BACKUP_FORMAT_VERSION)
    throw new BackupFormatError('This backup format is not supported.');
  const kdf = item.kdf as Record<string, unknown> | undefined;
  const encryption = item.encryption as Record<string, unknown> | undefined;
  if (!kdf || typeof kdf !== 'object' || Array.isArray(kdf) ||
    !encryption || typeof encryption !== 'object' || Array.isArray(encryption) ||
    !hasKeys(kdf, ['algorithm', 'iterations', 'salt']) ||
    !hasKeys(encryption, ['algorithm', 'nonce']) ||
    kdf.algorithm !== 'PBKDF2-HMAC-SHA256' ||
    !Number.isInteger(kdf.iterations) || (kdf.iterations as number) < MIN_ITERATIONS ||
    (kdf.iterations as number) > MAX_ITERATIONS || encryption.algorithm !== 'AES-256-GCM')
    throw new BackupFormatError('The backup security settings are invalid.');
  decode(kdf.salt, 16); decode(encryption.nonce, 12); decode(item.tag, 16);
  const ciphertext = decode(item.ciphertext);
  if (ciphertext.length > MAX_PLAINTEXT_BYTES)
    throw new BackupFormatError('This backup is too large for this version of TinyWins.');
  return item as unknown as BackupEnvelope;
}

export async function encryptBackup(plaintext: Uint8Array, password: string,
  crypto: BackupCrypto): Promise<string> {
  if (password.length < 12) throw new BackupFormatError('Use a password of at least 12 characters.');
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new BackupFormatError('This backup is too large.');
  const [salt, nonce] = await Promise.all([crypto.randomBytes(16), crypto.randomBytes(12)]);
  if (salt.length !== 16 || nonce.length !== 12)
    throw new BackupFormatError('Backup encryption failed.');
  const envelope: BackupEnvelope = { format: BACKUP_FORMAT, version: 1,
    kdf: { algorithm: 'PBKDF2-HMAC-SHA256', iterations: PBKDF2_ITERATIONS, salt: base64(salt) },
    encryption: { algorithm: 'AES-256-GCM', nonce: base64(nonce) }, ciphertext: '', tag: '' };
  const key = await crypto.deriveKey(password, salt, PBKDF2_ITERATIONS);
  try {
    const encrypted = await crypto.encrypt(plaintext, key, nonce, aad(envelope));
    if (encrypted.tag.length !== 16) throw new BackupFormatError('Backup encryption failed.');
    envelope.ciphertext = base64(encrypted.ciphertext);
    envelope.tag = base64(encrypted.tag);
    const text = JSON.stringify(envelope);
    if (Buffer.byteLength(text, 'utf8') > MAX_BACKUP_BYTES)
      throw new BackupFormatError('This backup is too large.');
    return text;
  } finally { key.fill(0); }
}

export async function decryptBackup(text: string, password: string,
  crypto: BackupCrypto): Promise<Uint8Array> {
  const envelope = parseBackupEnvelope(text);
  const key = await crypto.deriveKey(password, decode(envelope.kdf.salt, 16), envelope.kdf.iterations);
  try {
    const plaintext = await crypto.decrypt(decode(envelope.ciphertext), decode(envelope.tag, 16),
      key, decode(envelope.encryption.nonce, 12), aad(envelope));
    if (plaintext.length > MAX_PLAINTEXT_BYTES)
      throw new BackupFormatError('This backup is too large.');
    return plaintext;
  } catch (error) {
    if (error instanceof BackupFormatError) throw error;
    throw new BackupFormatError('Incorrect password or damaged backup file.');
  } finally { key.fill(0); }
}
