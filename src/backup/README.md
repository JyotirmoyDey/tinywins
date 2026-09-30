# TinyWins backup format (v1)

The `.tinywins` file is UTF-8 JSON with only these top-level fields:

```json
{
  "format": "tinywins-encrypted-backup",
  "version": 1,
  "kdf": { "algorithm": "PBKDF2-HMAC-SHA256", "iterations": 600000, "salt": "base64" },
  "encryption": { "algorithm": "AES-256-GCM", "nonce": "base64" },
  "ciphertext": "base64",
  "tag": "base64"
}
```

The salt is 16 random bytes and the nonce is 12 random bytes, freshly generated per file. PBKDF2 derives a 32-byte key from the user password. AES-GCM uses a 16-byte tag. Its additional authenticated data is the UTF-8 byte sequence produced by `JSON.stringify({format, version, kdf, encryption})`, with those object keys in that exact order and nested keys in the order shown above. The ciphertext is an uncompressed UTF-8 JSON payload. No personal information is in the plaintext envelope.

The decrypted payload has `dataVersion: 1`, `sourceDatabaseVersion`, `createdAt`, and `tables`. It includes the complete user-owned rows of `tasks`, `task_options`, `rating_scale_versions`, `daily_entries`, and `task_lifecycle_transitions`, retaining IDs and historical snapshots. The SQLite-only `legacyImported` marker is re-established after restore so older AsyncStorage data cannot reappear. Development-only Home comparison settings, demo configuration, and recalculable chart data are not included. A backup from an older SQLite version is accepted when it already contains every v1 payload field; newer database or payload versions are rejected.

Export reads all tables in a serialized `BEGIN IMMEDIATE` transaction, so concurrent writes cannot change part of the snapshot. Import fully authenticates and validates the file before writing. It replaces the five tables in a single transaction, then checks foreign keys, SQLite integrity, and readback before committing. SQLite's transaction/WAL rollback retains the previous database on any pre-commit failure or app termination. `app_metadata` is updated in the same transaction. The user must confirm replacement after seeing an authenticated preview.

The format is cross-platform because all serialized values are UTF-8 JSON, SQLite scalar values, and standard base64, PBKDF2-HMAC-SHA256, and AES-256-GCM. The app derives keys and encrypts with `react-native-quick-crypto` on a background native implementation. The package requires its native `QuickBase64` module, so Backup & Restore requires a current development or production build; Expo Go and older development builds show a clear error before loading the package. Existing files made with the former Expo Crypto adapter use the same standard format and remain compatible. Automated tests use Node's independent crypto implementation and a real SQLite driver. Device validation still needed: save on Android and restore on iOS, then the reverse; confirm sharing actually saved the file, native picker cancellation, wrong-password handling, low-storage behavior, app termination during restore, and that Home, Archived, individual Insights, and combined Insights show the same history afterward.

Backup creation now stops at an encrypted-file-ready step. Android Save to Device uses Expo FileSystem's Storage Access Framework directory picker, creates a new file without replacing an existing URI, and verifies its actual bytes before reporting success. A provider may change the `.tinywins` display name or append an extension; the app reports that real name instead of leaving a zero-byte file behind. If read-back is unavailable, the result is explicitly unverified. Restore judges the picked document by its encrypted contents, not its provider-specific name or MIME type. Share Backup remains separate. On iOS, SDK 57's document picker imports files and has no document-export operation. Save to Files therefore opens the iOS share sheet with an explicitly labeled instruction to choose Save to Files; a closed sheet is not treated as verified save. Both actions use the same encrypted envelope. The iOS fallback uses existing `expo-sharing` and does not add another native module. Physical-device validation of Files locations and SAF providers remains necessary.
