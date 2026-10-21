# TinyWins Privacy & Data Flow Audit

**Date of Audit:** October 19, 2026<br>
**Audited Target:** TinyWins (Expo SDK 57 / React Native 0.86 application)  
**Scope:** Complete application source code, configuration files, native plugins, and dependency tree.  
**Auditing Method:** Static code analysis and dependency inspection. All findings explicitly distinguish **[Verified]** behavior (directly observed in source code) from **[Assumption / External SDK Behavior]** (inherent to third-party SDK runtimes or OS platforms).

---

## Executive Summary

TinyWins operates primarily as a **local-first, offline-capable tracking application**. All core user data (habits/activities, rating levels, and daily check-in recordings) is stored in a local SQLite database (`tinywins.sqlite`) on the device. **No user accounts, passwords, email addresses, names, photos, contacts, GPS locations, or user-entered tracking notes are transmitted to any remote server or stored in the cloud.**

External network traffic is bounded to three destinations initiated by the app, plus Firebase SDK telemetry:
1. **Firebase Services (Google)**: TinyWins defines 14 Analytics event types and five production custom Performance traces. These are not the full collection: Firebase Analytics also collects automatic events and app/device/session context, and uses an app-instance identifier; Firebase Performance also collects supported automatic app-lifecycle, rendering, and network-request metrics. Crashlytics collects crash diagnostics and sanitized app breadcrumbs. See [Section 2.3](#23-firebase-telemetry-analytics-and-crash-reporting).
2. **Expo Updates (650 Industries / EAS)**: Over-The-Air (OTA) runtime update checks sending platform and runtime metadata.
3. **GitHub Pages (`tinywins-dev.github.io`)**: A static JSON fetch checking the minimum supported app version.

Backups are user-initiated, protected with AES-256-GCM and PBKDF2-HMAC-SHA256 (600,000 iterations), and saved locally or shared via OS dialogs without passing through any proprietary server.

---

## 1. Master Data Flow & Privacy Inventory

| Data Category | Specific Elements Collected | Collection Purpose | Storage Destination | Third-Party Recipient | Retention / Deletion Mechanism | Relevant Source Files | Evidence Status |
|---|---|---|---|---|---|---|---|
| **Activity Definitions** | Activity ID (`UUID`), name (max 30 graphemes), creation/update timestamps, active flag, archive timestamp, chart color, combined insights flag, levels locked flag | Core feature: allow users to define what activities they track | Local SQLite database (`tinywins.sqlite`), table: `tasks` | **None** | User-managed: soft-deleted via Archive; permanently deleted individually via Task Menu or in bulk via Archived Screen | `src/data/migrations.ts`<br>`src/data/repository.ts`<br>`src/domain/task.ts` | **[Verified]** |
| **Rating Level Definitions** | Option ID (`UUID`), task FK, label (max 20 graphemes), optional description, position, rank, normalized weight (0–100), active flag, timestamps | Core feature: configure rating scales per activity | Local SQLite database (`tinywins.sqlite`), table: `task_options` | **None** | Deleted on activity deletion (FK cascade); unreferenced inactive levels purged on task update | `src/data/migrations.ts`<br>`src/data/repository.ts`<br>`src/domain/ratingScale.ts` | **[Verified]** |
| **Daily Check-In Records** | Entry ID (`UUID`), task FK, option FK, ISO date (`YYYY-MM-DD`), recorded timestamp, historical snapshot of option label/position/rank/weight | Core feature: record daily habit status and drive analytics charts | Local SQLite database (`tinywins.sqlite`), table: `daily_entries` | **None** | Deleted when activity is deleted (cascade); single-day check-in can be cleared via Task Menu | `src/data/migrations.ts`<br>`src/data/dailyEntryRepository.ts`<br>`src/components/TaskActionsMenu.tsx` | **[Verified]** |
| **Activity Lifecycle Events** | Transition ID (`UUID`), task FK, transition type (`archived` / `restored`), timestamp, local date, UTC offset in minutes, IANA timezone string (e.g., `America/New_York`) | Insights calculation: aligns activity date bounds across user timezones | Local SQLite database (`tinywins.sqlite`), table: `task_lifecycle_transitions` | **None** | Deleted when parent activity is permanently deleted (`ON DELETE CASCADE`) | `src/data/migrations.ts`<br>`src/data/repository.ts`<br>`src/domain/taskLifecycle.ts` | **[Verified]** |
| **Migration Flags** | `legacyImported`: `"1"` | Prevent re-importing old v1 AsyncStorage records after migration or data reset | Local SQLite database (`tinywins.sqlite`), table: `app_metadata` | **None** | Retained across local data resets to protect state integrity; deleted upon app uninstall | `src/data/migrations.ts`<br>`src/data/localDataReset.ts`<br>`src/data/runtime.ts` | **[Verified]** |
| **Legacy V1 App Data** | Full JSON payload of legacy v1 tasks and entries | Migration fallback from pre-SQLite app releases | AsyncStorage key: `tinywins.database.v1` | **None** | Cleared upon dev/user local data reset or when overwritten | `src/data/localDataReset.ts`<br>`src/data/runtime.ts` | **[Verified]** |
| **In-Memory Check-in State** | Reactive dictionary mapping `taskId:date` to selection state | UI responsiveness during fast slider check-in interactions | Ephemeral memory (`EntryStore` React state) | **None** | Flushed on app termination, reload, or data reset | `src/state/EntryStore.ts`<br>`src/state/TasksProvider.tsx` | **[Verified]** |
| **Encrypted Backup Files** | Export of four domain tables (`tasks`, `task_options`, `daily_entries`, `task_lifecycle_transitions`), serialized to JSON, encrypted via AES-256-GCM, wrapped in `.tinywins` envelope. `app_metadata` is not exported; restore writes the local `legacyImported` marker. | Data portability: user-controlled disaster recovery | Local file system (`SAF` directory on Android, `Paths.cache` temp directory on iOS before share) | Transferred only if the user exports/shares via OS Share Sheet to a destination of their choice | User manages saved file; temporary cache files are deleted immediately after share sheet handoff | `src/backup/service.ts`<br>`src/backup/data.ts`<br>`src/backup/format.ts`<br>`src/backup/files.ts`<br>`src/backup/exportSave.ts` | **[Verified]** |
| **Usage Analytics** | 14 app-defined event types with allow-listed enum/numeric parameters, plus Firebase automatic events, app/device/session context, and an app-instance identifier | Product telemetry and Firebase Analytics' automatic app measurement | Firebase Analytics SDK → Google servers | Google LLC (Firebase Analytics) | Governed by Google Analytics retention and deletion controls | `src/telemetry/analytics.ts`<br>`src/telemetry/ChartVisibility.tsx`<br>`src/telemetry/OrientationTelemetry.tsx`<br>RNFirebase config in `node_modules/@react-native-firebase/analytics/android/build.gradle` | **[Verified app code/config; vendor SDK behavior]** |
| **Crash Reports & Diagnostics** | Uncaught exceptions, stack traces, and sanitized breadcrumbs (restricted to fixed string messages and enum metadata) | Stability monitoring: diagnose crashes and operational failures | Firebase Crashlytics SDK memory buffer → Google servers | Google LLC (Firebase Crashlytics) | 90 days retention by Firebase Crashlytics | `src/telemetry/crashlytics.ts`<br>`src/logging/logger.ts`<br>`firebase.json` | **[Verified]** |
| **Performance Monitoring** | Five app-defined production custom traces, one development-only test trace, plus SDK automatic lifecycle, screen-rendering, and supported HTTP/S network-request metrics and context (for example, request latency/payload sizes and device/app attributes) | Diagnose app performance and network behavior | Firebase Performance SDK → Google servers | Google LLC (Firebase Performance) | Governed by Firebase Performance retention and aggregation policies | `src/telemetry/performance.ts`<br>`android/app/build.gradle` (Perf Gradle plugin) | **[Verified app code/config; vendor SDK behavior]** |
| **OTA Update Metadata** | EAS project ID, runtime version, channel name (`production`), OS platform | Receive JavaScript bundle bug fixes without App Store redeployment | Transmitted over HTTPS to Expo servers (`u.expo.dev`) | 650 Industries, Inc. (Expo EAS) | Expo server request logs | `app.json`<br>`eas.json`<br>`src/update/UpdateGate.tsx` | **[Verified & SDK Behavior]** |
| **Version Gate Check** | HTTP `GET` request headers (`Accept: application/json`, standard user-agent) | Check whether running binary meets minimum required version | Transmitted over HTTPS to GitHub Pages | GitHub, Inc. (Microsoft Corporation) | Standard GitHub server access logs | `src/update/versionPolicy.ts`<br>`src/update/UpdateGate.tsx` | **[Verified]** |

---

## 2. In-Depth Technical Breakdown

### 2.1 Local Storage Architecture

1. **SQLite Database Engine**:
   - Managed via `expo-sqlite` (WAL mode enabled: `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`).
   - Database file: `tinywins.sqlite` stored within the sandboxed application document directory.
   - Database schema runs through 8 incremental migrations (`CURRENT_DATABASE_VERSION = 8`).
2. **Schema Tables & Stored Fields**:
   - `tasks`: Activity identity, display names, creation/archival dates, chart color, lock status.
   - `task_options`: Rating scale levels, ordinal position, weight, description.
   - `daily_entries`: Completed check-ins, dates (`YYYY-MM-DD`), historical scale metadata snapshots.
   - `task_lifecycle_transitions`: Archive and restore timestamps with UTC offset and IANA timezone.
   - `app_metadata`: Internal key-value table storing only `legacyImported = '1'`.
3. **AsyncStorage**:
   - Key: `tinywins.database.v1` — only used to hold raw data from prior non-SQLite releases for one-time migration. Cleared when data reset is executed.

---

### 2.2 External Data Transmission & Network Egress

TinyWins application code initiates only two outbound HTTP network calls:

1. **Version Policy Check**:
   - **Target**: `https://tinywins-dev.github.io/tinywins-config/version.json`
   - **Trigger**: App launch and returning to foreground (in production build).
   - **Data Sent**: Bare HTTP `GET`. No request body, no query parameters, no authentication tokens, no user identifiers.
   - **Response**: `{ minimumBuild: number, latestBuild: number, updateUrl: string }`.

2. **OTA Update Checks (Expo Updates)**:
   - **Target**: `https://u.expo.dev/958008c9-4f1d-4ec6-b2a6-2fc99d54122a`
   - **Trigger**: Native runtime initialization on application launch.
   - **Data Sent by SDK**: EAS project ID, runtime version (tied to app version `1.0.0`), release channel (`production`), platform (`ios` / `android`).

*Note on Outbound Navigation*: When an update is mandatory, `Linking.openURL()` opens the official Apple App Store (`apps.apple.com`) or Google Play Store (`play.google.com`). This is OS-level browser navigation, not an application data transmission.

---

### 2.3 Firebase Telemetry, Analytics, and Crash Reporting

#### A. Firebase Analytics (`@react-native-firebase/analytics`)
- **Collection State**: No Analytics opt-out is configured in `firebase.json`, and TinyWins does not call `setAnalyticsCollectionEnabled()`. The installed RNFirebase Android Gradle configuration defaults collection to enabled, and defaults automatic screen reporting to enabled. RNFirebase's iOS config script also only writes collection overrides when corresponding `firebase.json` values are supplied; there is no iOS override in this project. This verifies app configuration, not Firebase Console settings or data actually received from a particular device.
- **Gatekeeper Implementation**: All events must pass through `emit(name: EventName, params)` in `src/telemetry/analytics.ts`.
- **Closed Type Union**: The codebase explicitly enforces a strict TypeScript type `EventName`. Callers cannot introduce custom strings.
- **App-defined event types and parameters** (this is the closed list of events emitted by TinyWins code; it is not a complete inventory of Firebase Analytics collection):
  1. `activity_created`: `{ level_count: number, activity_count: number, platform: string }`
  2. `activity_archived`: `{ platform: string }`
  3. `activity_restored`: `{ platform: string }`
  4. `activity_deleted`: `{ deleted_count: number, platform: string }`
  5. `checkin_recorded`: `{ level_index: number, activity_count: number, platform: string }`
  6. `checkin_changed`: `{ level_index: number, activity_count: number, platform: string }`
  7. `checkin_removed`: `{ activity_count: number, platform: string }`
  8. `insights_opened`: `{ scope: 'all' | 'activity', platform: string }`
  9. `chart_viewed`: `{ chart_type: string, scope: 'all' | 'activity', platform: string }`
  10. `date_range_changed`: `{ range_type: string, platform: string }`
  11. `backup_exported`: `{ backup_size_bytes?: number, platform: string }`
  12. `backup_imported`: `{ activity_count: number, record_count: number, platform: string }`
  13. `backup_failed`: `{ operation: 'export' | 'import', failure_category: string, platform: string }`
  14. `screen_orientation_changed`: `{ from_orientation: string, to_orientation: string, screen_name?: string, platform: string }`
- **Developer-set user properties / user ID**: None. There are no calls to `setUserProperty()` or `setUserId()`. This does not mean the SDK collects no automatic properties or identifiers.
- **Automatic Analytics collection**: Firebase documents automatically collected events (including lifecycle/session events such as `first_open`, `session_start`, and `user_engagement`, depending on platform and app conditions) and may automatically report native screen transitions as `screen_view` ([automatic event list](https://support.google.com/analytics/answer/9234069?hl=en), [screen reporting](https://firebase.google.com/docs/analytics/screenviews)). With Expo Router hosted in a shared native activity/view controller, do not assume every JavaScript route transition becomes an automatic screen event. Firebase also associates Analytics data with an app-instance ID and can attach automatic app/device/session context. TinyWins now explicitly disables Google Advertising ID collection using `google_analytics_adid_collection_enabled: false` in `firebase.json`; this does not disable Analytics events or the app-instance identifier.
- **Rating-choice metadata**: `checkin_recorded` and `checkin_changed` include `level_index`. This sends the selected level's ordinal position, so it can reveal which position in the user's scale was chosen even though TinyWins does not send the activity name or level label. It does not convey the custom text or the meaning the user assigned to that level.
- **Exclusion of free text in app-defined events**: User-entered activity names, level descriptions, and check-in text are not parameters in TinyWins' 14 app-defined events. Automatic SDK metadata is separate from those app-defined parameters.

#### B. Firebase Crashlytics (`@react-native-firebase/crashlytics`)
- **Collection State**: Explicitly enabled at runtime via `setCrashlyticsCollectionEnabled(getCrashlytics(), true)` and configured in `firebase.json`:
  ```json
  "crashlytics_debug_enabled": true,
  "crashlytics_auto_collection_enabled": true,
  "crashlytics_disable_auto_disabler": true
  ```
- **Custom Keys / Attributes**: **None**. Zero calls to `setAttribute()` or `setAttributes()`.
- **Custom Identifiers**: **None**. No user ID or email is assigned.
- **Breadcrumb Sanitization**:
  - Breadcrumbs are generated by `logger.ts` via `formatLogLine()`.
  - Messages are restricted to an immutable compile-time list of 28 static strings (`knownMessages`).
  - Metadata is filtered through `safeMetadata()`, which discards any property that is not an allow-listed enum (`screen`, `operation`, `scope`, `orientation`, `date_range`, `failure_category`) or safe non-negative integer (`activity_count`, `level_count`, `level_index`, `range_days`).
  - Stack traces for unhandled exceptions or reported errors are transmitted via `recordError(instance, error)`.

#### C. Firebase Performance Monitoring (`@react-native-firebase/perf`)
- **Custom traces instrumented by TinyWins**:
  1. `home_load`
  2. `insights_load`
  3. `chart_render`
  4. `backup_export`
  5. `backup_import`
  6. `tinywins_perf_test` (strictly gated behind `__DEV__`)
- **Custom-trace attributes & metrics**: Duration only. TinyWins attaches no custom user attributes, counts, or parameters to production traces.
- **Automatic Performance collection**: This is additional to TinyWins' custom traces. The installed Android build applies `com.google.firebase.firebase-perf`; RNFirebase's Android configuration defaults Performance collection to enabled, and `firebase.json` does not override it. Firebase documents automatic app-start/foreground/background traces and screen-rendering data ([lifecycle traces](https://firebase.google.com/docs/perf-mon/app-start-foreground-background-traces), [Android setup and automatic collection](https://firebase.google.com/docs/perf-mon/get-started-android)). The Android Perf Gradle plugin also enables automatic HTTP/S network-request tracing for supported networking stacks; Firebase documents request/response timing, payload sizes, and success rate ([network traces](https://firebase.google.com/docs/perf-mon/network-traces?platform=android)). Automatic collection can include device/app context and session-level CPU/memory information ([Performance sessions](https://firebase.google.com/docs/perf-mon/console)). The exact requests observed depend on platform and networking implementation. The generated iOS native project is not present in this repository, so iOS build output and runtime collection were not independently inspected.

---

### 2.4 Third-Party SDK Automatic Data Collection

The following third-party native libraries are embedded in TinyWins:

1. **Google Firebase SDKs** (`@react-native-firebase/app`, `analytics`, `crashlytics`, `perf`):
   - **[Vendor documentation; app configuration inspected]** Firebase SDK behavior is broader than TinyWins' explicit Analytics event list and custom Performance traces ([Firebase's Android data-collection disclosure](https://firebase.google.com/docs/android/play-data-disclosure)):
     - **Analytics** may automatically log lifecycle/session events (for example, first open, session start, engagement, and app updates, as applicable) and native `screen_view` events. Automatic screen reporting is not disabled in the checked configuration; in this single-activity Expo app, this does not establish that every Expo Router route is tracked automatically.
     - Analytics generates an app-instance identifier. Firebase Installations separately generates a per-installation FID; these are pseudonymous installation identifiers, not a TinyWins account ID. Google documents that Analytics events may also carry automatic app/device/OS/locale and session context. TinyWins explicitly disables Google Advertising ID collection via RNFirebase configuration; local Android release manifest processing resolved `google_analytics_adid_collection_enabled` to `false` in `android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml`. This does not disable the other Analytics collection described here.
     - **Performance** automatically measures app lifecycle (including app start and foreground/background), screen rendering, and supported HTTP/S network requests. Network traces can include endpoint URL patterns, request/response timing, payload sizes, and success status; Firebase aggregates request data under URL patterns. Session views can include device/app attributes and CPU/memory usage. This is in addition to the five custom production traces listed above.
     - Firebase SDK requests expose network/IP information to Firebase services; Google documents IP-derived coarse geography for Analytics. TinyWins code does not access or store the user's IP address.
     - Crashlytics may collect crash stack traces, app state, device metadata, and a Crashlytics installation identifier as documented by Firebase; TinyWins' own breadcrumbs are separately sanitized as described above.
   - The Android defaults and Perf Gradle plugin were verified in the installed RNFirebase package and native Gradle files. Runtime dashboard contents and Firebase Console project settings were not inspected. Expo-generated iOS native output is absent, so platform-specific iOS output/runtime behavior remains unverified here.
2. **Expo Updates SDK** (`expo-updates`):
   - **[Assumption / External SDK Behavior]**: Automatically generates an installation-scoped anonymous client identifier (`EAS-Client-ID`) transmitted in HTTP headers during OTA check requests.
3. **Advertising SDKs**:
   - **[Verified]**: **No advertising SDKs exist** in `package.json` (no Google Mobile Ads / AdMob, no Meta Audience Network, no AppLovin, etc.).
   - **[Verified]**: The app does **not** include `expo-tracking-transparency` and does **not** request the iOS App Tracking Transparency (ATT) permission. Consequently, the iOS IDFA is inaccessible.
   - **[Assumption / External SDK Behavior]**: On Android, Google Play Services may provide the Google Advertising ID (GAID) to the Firebase library unless disabled via manifest configuration.

---

### 2.5 Encrypted Backup Architecture

TinyWins implements client-side encrypted backup files (`.tinywins`):

1. **Payload Generation**:
   - Collects records from 4 tables (`tasks`, `task_options`, `daily_entries`, `task_lifecycle_transitions`).
   - Validates database integrity (`PRAGMA integrity_check; PRAGMA foreign_key_check;`).
   - Caps maximum unencrypted payload size at 20 MB (`MAX_PLAINTEXT_BYTES = 20_000_000`).
2. **Cryptographic Primitives**:
   - **Key Derivation**: `PBKDF2-HMAC-SHA256` with **600,000 iterations** (`PBKDF2_ITERATIONS = 600_000`).
   - **Salt**: 16 cryptographically secure random bytes per backup.
   - **Cipher**: `AES-256-GCM` authenticated symmetric encryption.
   - **Nonce/IV**: 12 cryptographically secure random bytes per backup.
   - **Authentication Tag**: 16-byte GCM authentication tag.
   - **Additional Authenticated Data (AAD)**: JSON-serialized envelope header (`format`, `version`, `kdf`, `encryption`) is bound as AAD to prevent tampering with encryption parameters.
   - **Key Zeroing**: Derived cryptographic keys in memory are immediately overwritten (`key.fill(0)`) in a `finally` block.
3. **Password Security**:
   - Minimum password length: 12 characters.
   - The password is never stored on disk, never placed in AsyncStorage, and never logged or sent across any network.
4. **Storage & Sharing Workflow**:
   - **Android**: Prompts user to pick a folder via Storage Access Framework (`Directory.pickDirectoryAsync()`).
   - **iOS**: Writes encrypted bytes to a temporary isolated cache directory (`Paths.cache/tinywins-share-<UUID>/...`), opens the native OS Share Sheet (`expo-sharing`), and immediately purges the temporary cache directory in a `finally` block.
   - **Cloud Services**: Backups are never transmitted to any TinyWins-operated cloud backend.
5. **Restoration Verification**:
   - Enforces format checks, PBKDF2 iteration bounds (600,000 to 1,200,000), table row count limits, and comprehensive referential integrity checks.
   - Runs in an atomic SQLite `IMMEDIATE` transaction with full rollback on failure.
   - Verifies disk space before beginning restore (`Paths.availableDiskSpace < payload * 3`).

---

### 2.6 Data Deletion and Retention

#### User-Facing Data Deletion Mechanisms:
1. **Single Activity Deletion**:
   - Invoked via `TaskActionsMenu` on Home or Activity screens.
   - Invokes SQLite `DELETE FROM tasks WHERE id = ?`. Foreign key constraints (`ON DELETE CASCADE`) automatically wipe all child options, check-in history, and lifecycle transitions.
2. **Bulk Archived Activities Deletion**:
   - In `ArchivedActivities` screen (`src/app/archived.tsx`), user can tap "Delete all archived items".
   - Executes `DELETE FROM tasks WHERE active = 0`, cascading to all child records.
3. **Single Check-In Removal**:
   - User can reset today's check-in slider or invoke "Clear today's check-in", executing `DELETE FROM daily_entries WHERE taskId = ? AND localDate = ?`.
4. **Full Local Data Reset**:
   - Implemented in `src/data/localDataReset.ts` via `clearLocalRecords()`.
   - Executes `DELETE FROM tasks` (wiping all tasks, options, entries, and transitions).
   - Deletes `tinywins.database.v1` from `AsyncStorage`.
   - Leaves `app_metadata.legacyImported = '1'` intact to prevent unintended automatic migration of deleted legacy records.
   - *UI Availability Note*: The "Delete all local data" action is available on Profile in production and is protected by a native confirmation dialog.
   - *Scope*: This operation deletes TinyWins' local SQLite records and the legacy AsyncStorage migration payload only. It does not clear Firebase Analytics data on Google's servers, and it does not delete exported `.tinywins` backups saved outside the app. The app does not call Firebase Analytics' local `resetAnalyticsData()` API or initiate a Google Analytics user-data deletion request. Firebase distinguishes clearing device-local Analytics data/resetting the app-instance ID from requesting deletion of server-side Analytics data ([Analytics privacy controls](https://support.google.com/analytics/answer/9019185?hl=en), [Data deletion requests](https://support.google.com/analytics/answer/9940393?hl=en)).
5. **App Uninstallation**:
   - Removing the app deletes the app sandbox directory, eradicating `tinywins.sqlite`, `AsyncStorage`, and internal temporary files.
   - *Android OS Auto-Backup*: Generated rules exclude the SQLite `database` domain (including `tinywins.sqlite` and AsyncStorage's `RKStorage`) and the `files/SQLite/` directory (Expo SQLite's default location) from cloud backup and device-to-device transfer. Other eligible app data may still follow Android's normal backup behavior. TinyWins' separate encrypted export remains user-initiated.
   - Uninstalling also does not retract telemetry already received by Firebase or remove backup files the user saved/shared elsewhere. Users manage those separately; Firebase server-side Analytics deletion uses the available Google Analytics deletion controls, while exported backup copies must be deleted from their chosen storage locations.

---

### 2.7 Personal Information and Identifiers Audit

| Item / Identifier | Collected by TinyWins Code? | Handled by Third-Party SDKs? | Notes |
|---|---|---|---|
| **Real Name / Username** | ❌ No | ❌ No | No user account system |
| **Email Address** | ❌ No | ❌ No | No account registration or contact forms |
| **Phone Number** | ❌ No | ❌ No | No SMS or verification features |
| **Password** | ❌ Not stored | ❌ No | Backup passwords exist transiently in RAM only |
| **Precise GPS Location** | ❌ No | ❌ No | No location permissions requested in `app.json` |
| **Timezone / UTC Offset** | ⚠️ Yes (Locally) | ⚠️ Indirectly | Stored in `task_lifecycle_transitions` table for date calculations; Firebase SDK infers coarse country from IP |
| **Device Contacts** | ❌ No | ❌ No | No contacts permissions requested |
| **Photos / Camera / Mic** | ❌ No | ❌ No | No media permissions requested |
| **Payment / Credit Card** | ❌ No | ❌ No | No in-app purchases or billing SDKs |
| **IDFA (Apple Ad ID)** | ❌ No direct access in TinyWins code | ⚠️ Platform-dependent | App does not request ATT through `expo-tracking-transparency`; this alone is not treated as proof that all Firebase SDK access is impossible in every iOS configuration. The generated iOS build was not inspected. |
| **GAID (Google Ad ID)** | ❌ No direct access in TinyWins code | ❌ Collection disabled in project config | `google_analytics_adid_collection_enabled: false` is set in `firebase.json`; verify the generated/merged manifest for each native build. |
| **Analytics App Instance ID** | ❌ Not directly accessed | ✅ SDK-generated | Analytics uses an installation-scoped pseudonymous identifier; no `setUserId()` call exists. |
| **Firebase Installation ID (FID)** | ❌ Not directly accessed | ✅ SDK-generated | Firebase Installations creates a per-installation identifier; distinct from the Analytics app-instance ID. |
| **Entity UUIDs** | ⚠️ Yes (Locally) | ❌ No | Tasks and entries use `randomUUID()` from `expo-crypto`; never transmitted off-device |

---

### 2.8 Runtime Verification Status and Limits

- **Method used for this audit**: Source/configuration review. This does not prove every runtime SDK request or every value contained in an exception.
- **Android manifest check**: Local Gradle `:app:processReleaseMainManifest` completed successfully. The merged release manifest resolves `google_analytics_adid_collection_enabled` to `false`, but still declares `com.google.android.gms.permission.AD_ID`, `android.permission.ACCESS_ADSERVICES_AD_ID`, and `android.permission.ACCESS_ADSERVICES_ATTRIBUTION` from Google measurement dependencies. A permission declaration alone does not prove that the app reads or transmits that identifier. No release APK/AAB was produced or inspected, so packaged-artifact permissions still require confirmation.
- **Network traffic**: No on-device traffic capture was performed. No Android device was connected during this inspection. Actual Firebase traffic would need to be observed in a release-like build; HTTPS payload inspection would require TLS-aware instrumentation and should use a staging Firebase project and synthetic data.
- **Crashlytics**: Source review confirms that breadcrumbs and metadata are allow-listed in `src/logging/logger.ts`. However, `src/telemetry/crashlytics.ts` forwards the original `Error` to Crashlytics to preserve its stack, so an exception's message and stack are not content-scrubbed by that wrapper. Static review cannot guarantee that dependency or operating-system exceptions never contain sensitive values. No production Crashlytics console reports were accessed or inspected.
- **Further verification**: Inspect permissions on the final APK/AAB with Android build tools; capture domains/request metadata from a controlled device session; and review controlled non-fatal reports in a staging Firebase project. Reviewing production reports requires authorized Firebase Console access and should avoid exporting unrelated user diagnostics.

---

## 3. Recommended Privacy Policy Disclosures

When drafting the legal Privacy Policy for TinyWins, include the following clauses based on these audit findings:

1. **Local-First Architecture**: Disclose that user activities, ratings, and check-in logs are stored exclusively in local database files on the user's physical device.
2. **No User Accounts**: State that TinyWins does not operate user accounts, cloud database profiles, or personal identity management.
3. **Usage Telemetry & Diagnostics**:
   - Disclose the use of **Google Firebase Analytics**, **Firebase Crashlytics**, and **Firebase Performance Monitoring**.
   - Describe both TinyWins' app-defined events and Firebase's automatic collection: app-instance and device/app/session context, applicable lifecycle/screen events, and Performance Monitoring's supported app-rendering and network-request metrics. Explain that check-in events include the selected level's ordinal `level_index`, but not activity names, level labels/descriptions, or check-in text. Avoid describing the entire Firebase data flow as anonymous or strictly aggregate.
   - Link to Google's Privacy & Terms: `https://policies.google.com/privacy`.
4. **Over-The-Air Updates**: Disclose that **Expo Updates (650 Industries, Inc.)** queries update servers for app binary compatibility and OTA code releases.
5. **Encrypted Backups**: Explain that data backups are encrypted with user-provided passwords using industry-standard cryptography (AES-256-GCM / PBKDF2), stored where the user designates, and never synced to TinyWins servers.
6. **Data Deletion Rights**: Explain how users can delete individual activities, purge archived records, or uninstall the app to eliminate all locally held data.
