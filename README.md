# TinyWins

A mobile-only Expo SDK 57 / React Native / TypeScript app. Task configuration and daily responses live in an on-device SQLite database. No account, server, sync, analytics, or payments.

## Run

Use Node.js 22.13+ (Node 24 is recommended for the integration tests).

```sh
npm ci
npm start -- --clear
```

Open with SDK 57-compatible Expo Go on an Android phone or iPhone. SQLite, Gesture Handler, Reanimated, and Haptics used here are included in that SDK. Restart the Expo server after installing these new dependencies; do not clear the app's device data when upgrading. `npm run android` opens a configured Android emulator. `npm run ios` requires macOS and an iOS simulator.

Optional demo tasks, only on a new development database with no previous data:

```sh
EXPO_PUBLIC_SEED_DEMO=true npm start -- --clear
```

Existing data always takes precedence. The demo does not create any daily responses and does not reseed deleted tasks.

## Files

```text
src/
  app/
    index.tsx                 Home / today's check-ins
    task/new.tsx              Create task
    task/[id].tsx             Edit task
    history/[id].tsx          30-day activity history and response editor
    archived.tsx              Archived tasks and Restore
  components/                 Cards, form, draggable choices, shared controls
  hooks/useKeyboardFocus.ts   Keep focused inputs inside the keyboard-resized viewport
  domain/task.ts              Entities, input validation, weights, local dates
  data/
    connection.ts             Shared queue and SQLite transactions
    migrations.ts             Versioned schema initialization
    legacyImport.ts           One-time AsyncStorage-to-SQLite import
    runtime.ts                Open the native database and wire repositories
    repository.ts             TaskRepository
    dailyEntryRepository.ts   DailyEntryRepository
  state/
    TasksProvider.tsx         Startup, focus/resume refresh, actions, haptics
    EntryStore.ts             Optimistic per-task/date subscriptions
  theme.ts                    Centralized design tokens
tests/                        Real SQLite integration, state, and ordering tests
```

## Schema and persistence

The file is `tinywins.sqlite`, opened by `src/data/runtime.ts` with `expo-sqlite`. All SQL lives in `src/data/`; UI components call repository-backed actions.

| Table | Stored fields and constraints |
| --- | --- |
| `tasks` | UUID `id`, trimmed `name`, `createdAt`, `updatedAt`, boolean `active` |
| `task_options` | UUID `id`, `taskId`, `label`, one-based `position`, one-based `rank`, `normalizedWeight`, `active`, `createdAt`, `updatedAt` |
| `daily_entries` | UUID `id`, `taskId`, `optionId`, `localDate`, `createdAt`, `updatedAt`, immutable `optionLabelAtEntry`, `positionAtEntry`, `rankAtEntry`, `normalizedWeightAtEntry` |
| `app_metadata` | Marks the completed one-time legacy import |

SQLite enforces `UNIQUE(taskId, localDate)` on entries, unique positions among active options, nonblank names/labels, valid weight bounds, and foreign keys. A composite foreign key ensures an entry's option belongs to its task. Boolean values are stored as 0/1 and returned as booleans in the domain model.

The 2–7 active-choice constraint is validated by the repository before any transaction writes. Changes to tasks and their options happen in one transaction, so a failed edit cannot leave a task with partially updated choices. The shared connection serializes reads and writes; `BEGIN IMMEDIATE`, commit/rollback, WAL, foreign keys, and a busy timeout are initialized centrally. SQL user values are bound parameters.

`TaskRepository` exposes `getAll`, `getById`, `getOptions`, `create`, `update`, `archive`, `restore`, and `delete`. The existing task-form method aliases remain for compatibility.

`DailyEntryRepository` exposes `getForDate`, `getForTaskAndDate`, `upsert`, `getHistoryForTask`, and `deleteEntry`.

## Migrations and existing installations

`migrations.ts` reads `PRAGMA user_version`, applies each newer numbered migration in a transaction, and advances the version only after the schema succeeds. A fresh database initializes automatically. A database from a newer unsupported app version is rejected instead of overwritten. Add future schema changes to the migration array; do not modify migrations already shipped.

`legacyImport.ts` then imports the previous `tinywins.database.v1` AsyncStorage JSON in a separate atomic transaction. It preserves task, option, and entry IDs, labels, dates, and recorded weights. Previously removed choices referenced by entries are reconstructed as inactive options. The import-complete marker is committed alongside the imported rows. Failure rolls back the entire import and leaves the old data intact; retrying is safe. A successful import never runs again, even if the user later deletes every task.

The old JSON is retained as an upgrade backup, but is never used as the primary state or written again. Earlier versions did not record option creation timestamps or entry creation timestamps separately, so import uses the available task timestamps / entry update timestamp. Older SQLite rows without rank snapshots retain a nullable legacy `rankAtEntry`; newly created and newly imported entries always write a rank snapshot, using the current rank as the best recoverable value for old AsyncStorage rows. Migration 2 adds the non-null `positionAtEntry` column and backfills it from the currently referenced option position plus one; this is the best recoverable meaning for rows created before snapshots existed.

## Ordering and historical meaning

`normalizeOptions()` in `src/domain/task.ts` calculates current active choices from lowest to highest:

```ts
position = i + 1; // one-based current order
rank = i + 1;
normalizedWeight = Math.round((i / (N - 1)) * 100);
```

For four choices: `0, 33, 67, 100`. Reordering retains UUIDs, changes positions/ranks/weights, and preserves original creation timestamps. Numeric metadata is never shown on the form or cards.

When an option is removed, a used option becomes inactive and disappears from future choices; an unused option can be physically deleted. Archive hides the task from Home without removing configuration or entries. Home's Archived tasks button opens a small list with Restore. Permanent task deletion requires a warning that all its check-ins will be removed, then deletes the task, options, and history together.

Entry snapshots preserve the meaning at recording time. `createEntrySnapshot(taskOption)` is the single snapshot-building boundary used by current and historical selection flows; future analytics must consume `normalizedWeightAtEntry`, never the current option weight. even if the current choice is renamed, reordered, or retired. Configuration edits never rewrite those snapshots. Explicitly changing a recorded response updates its snapshot to the newly selected choice. This duplicates three small values per entry, but keeps history meaningful without versioning every configuration edit.

## Daily check-in state flow

1. Startup initializes/migrates SQLite, loads tasks and today's entries, then enables Home. There is no intermediate interactive state with missing saved selections.
2. Each card subscribes to its own `taskId + localDate` entry through `useSyncExternalStore`.
3. A tap immediately updates that one entry in memory and calls `Haptics.selectionAsync()` in `TasksProvider.tsx`. Haptic errors are ignored so unsupported hardware does not block saving.
4. SQLite writes immediately through `DailyEntryRepository.upsert()`. `INSERT ... ON CONFLICT(taskId, localDate) DO UPDATE` keeps the existing entry ID and creation time while replacing the option and snapshots. The database prevents duplicate days, including under rapid taps.
5. Completion reconciles the cached entry with the persisted row. Revision checks prevent an older completion or focus refresh from overwriting a newer tap. Failures restore confirmed data and show an inline error; normal saves have no spinner, dialog, or toast.

Tapping a different choice replaces today's response. Tapping the selected choice again clears it. An unanswered task has **no row**, not a zero-weight row. Explicitly selecting the first choice stores an entry with weight zero. Missing and lowest remain distinct everywhere.

`localDate()` uses local `getFullYear()`, `getMonth()`, and `getDate()`; it never derives today from `toISOString()`. Home refreshes on focus and app resume, and checks for local-day rollover. A card tap resolves the local date again to avoid writing yesterday during rollover. Archive/new task/edit actions refresh configuration without changing historical responses.

## Activity history

Tap a task name to open its last 30 calendar days, newest first. `recentDates()` starts at local noon and decrements with `setDate()` so month/year boundaries and daylight-saving changes do not rely on subtracting fixed 24-hour periods.

Days are generated independently of database rows. Missing days display `—` with the accessible description “No entry”; recorded days display `optionLabelAtEntry`, including an explicitly recorded lowest choice.

Tap any day to open the response editor. Choosing a current option saves immediately through the same upsert path. Clear response deletes the entry for that day. Done simply closes the editor; it is not a Save button. If the old choice is inactive or renamed, the original recorded label remains visible with an explanation. Users may keep it, clear it, or replace it with a current choice. Retired choices cannot be assigned to new dates. Archived tasks retain readable/editable history through the archive list.

## UX and performance

- Compact wrapping choice buttons with 44px minimum targets, explicit selected accessibility state, readable contrast, muted fill, and a checkmark.
- Per-entry subscriptions and memoized cards: selecting one response does not reload all tasks or rerender every card. A test checks notifications with 20 tasks.
- Immediate optimistic feedback, light selection haptics, serialized durable writes, and stale-read protection.
- UI-thread drag tracking with live neighbor displacement and short settling animations. Option IDs remain stable.
- Safe-area-aware screens and sheets; keyboard-resized forms keep the Save footer visible and scroll focused fields into the visible viewport.
- Uncommitted task edits are guarded on Cancel/back/gesture navigation. Save and conflicting form actions are disabled during sorting.

## Automated verification

```sh
npm run typecheck
npm run lint
npm test
npx expo export --platform ios --platform android
npx expo-doctor
```

The test suite uses Node's real SQLite driver against the same migrations, SQL, and repositories as the app. It covers file close/reopen persistence, first/change/clear selection, unique constraints, missing-vs-lowest, multiple task/date pairs, snapshot preservation, used/unused choice removal, reordering, archive/restore/delete, transaction failures, legacy migration rollback/idempotence, the full daily loop across a restart, calendar boundaries, stale optimistic saves, and keyed subscriptions. Native exports verify compilation, not phone interaction.

## Manual Android and iOS checks

Run the following on **both** platforms. Do not uninstall or clear device storage during a persistence test.

1. Upgrade an existing installation and verify its previous tasks and check-ins appear. For a genuinely fresh-install test, use a separate emulator/device or intentionally clear test-only data. Confirm the empty state.
2. Create a first task, then two more. Rename/add/remove choices and drag them into order. Use seven choices to verify keyboard focus, scrolling, visible Save, and long labels.
3. Select today's lowest choice on one task, a middle choice on another, and leave the third untouched. Verify checkmarks, gentle haptics on supported hardware, and immediate response. Tap a different choice rapidly; only the final choice should remain selected.
4. Fully close the app: on Android, use Force stop (for Expo Go, force-stop Expo Go); on iOS, swipe the app away in the app switcher. Reopen the same project. Verify task names, option order, and today's responses are retained.
5. Tap the first task's name. Verify today's explicit lowest response displays its actual label and untouched dates show `—`. Tap Yesterday, add a response, then change it. Reopen history and verify one corrected response.
6. Remove a used option and rename/reorder remaining options. Verify the old history label still appears. Tap that day: the retired/renamed response is explained and can be kept or replaced with a current choice.
7. Archive a task. Verify it disappears from Home. Open Archived tasks, inspect its history, restore it, and verify its previous entries return unchanged.
8. Open Delete task and cancel. Then confirm deletion on a disposable task; verify its history is also gone.
9. Restart again and verify all remaining configuration, corrections, restored tasks, and the unrecorded task. Test background/resume across a local midnight or timezone change on a test device.
10. Check VoiceOver/TalkBack labels, selected states, adjustable drag-handle actions, larger text, bottom gesture areas, and 20-task scrolling/tapping.

Phone-only visual, haptic, keyboard, and touch tests must still be performed on Android/iOS hardware or simulators; this workspace has no configured native emulator.

## Remaining limits / before cloud sync

- History UI intentionally covers only the most recent 30 days. The database retains older rows and the repository supports arbitrary date ranges.
- Dragging a seven-choice list on very small screens may require scrolling before dragging; automatic edge scrolling is not implemented. The fixed-height editor rows cap input font scaling at 1.3; broader large-text adaptation merits device QA.
- Data is device-local. Uninstalling/clearing app storage deletes it. The retained legacy JSON is an upgrade fallback, not an ongoing backup.
- Before sync: define conflict resolution, deletion tombstones, a device/timezone policy, and schema/snapshot versioning. Do not upload the legacy backup as a second data source. Decide when to remove that backup after upgrade verification.
- Test low-storage/device interruption behavior on real devices and add native UI automation before release. Current tests verify transactional and state behavior, not native gestures or haptic hardware.

References: [Expo SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [Expo Haptics](https://docs.expo.dev/versions/v57.0.0/sdk/haptics/).
