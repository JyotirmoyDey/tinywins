import { Connection } from './connection';
import { localDate } from '../domain/task';
import { colorsByTaskId, nextTaskColor } from '../analytics/taskColors';
const migrations = [
  `CREATE TABLE tasks (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1))
  );
  CREATE TABLE task_options (
    id TEXT PRIMARY KEY NOT NULL, taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label TEXT NOT NULL CHECK(length(trim(label)) > 0), position INTEGER NOT NULL CHECK(position >= 1),
    rank INTEGER NOT NULL CHECK(rank > 0), normalizedWeight INTEGER NOT NULL CHECK(normalizedWeight BETWEEN 0 AND 100),
    active INTEGER NOT NULL CHECK(active IN (0,1)), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
    UNIQUE(taskId, id)
  );
  CREATE UNIQUE INDEX active_option_position ON task_options(taskId, position) WHERE active = 1;
  CREATE TABLE daily_entries (
    id TEXT PRIMARY KEY NOT NULL, taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    optionId TEXT NOT NULL, localDate TEXT NOT NULL CHECK(length(localDate) = 10),
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, optionLabelAtEntry TEXT NOT NULL,
    positionAtEntry INTEGER NOT NULL,
    rankAtEntry INTEGER NOT NULL, normalizedWeightAtEntry INTEGER NOT NULL CHECK(normalizedWeightAtEntry BETWEEN 0 AND 100),
    UNIQUE(taskId, localDate),
    FOREIGN KEY(taskId, optionId) REFERENCES task_options(taskId, id) ON DELETE CASCADE
  );
  CREATE INDEX entries_by_date ON daily_entries(localDate);
  CREATE TABLE app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
  `DROP INDEX IF EXISTS active_option_position;
   ALTER TABLE daily_entries ADD COLUMN positionAtEntry INTEGER NOT NULL DEFAULT 1;
   UPDATE daily_entries SET positionAtEntry = COALESCE(
     (SELECT position + 1 FROM task_options WHERE task_options.id = daily_entries.optionId AND task_options.taskId = daily_entries.taskId),
     COALESCE(rankAtEntry, 1));
   UPDATE task_options SET position = position + 1, rank = rank + 1;
   CREATE UNIQUE INDEX active_option_position ON task_options(taskId, position) WHERE active = 1;`,
  `ALTER TABLE tasks ADD COLUMN currentScaleVersionId TEXT;
   ALTER TABLE tasks ADD COLUMN currentTrendEpochId TEXT;
   ALTER TABLE daily_entries ADD COLUMN scaleVersionIdAtEntry TEXT;
   ALTER TABLE daily_entries ADD COLUMN trendEpochIdAtEntry TEXT;
   CREATE TABLE rating_scale_versions (
     id TEXT PRIMARY KEY NOT NULL, taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     trendEpochId TEXT NOT NULL, createdAt TEXT NOT NULL, effectiveLocalDate TEXT NOT NULL,
     optionsJson TEXT NOT NULL
   );
   CREATE INDEX scale_versions_by_task ON rating_scale_versions(taskId, createdAt);`,
  `ALTER TABLE tasks ADD COLUMN createdLocalDate TEXT;
   ALTER TABLE tasks ADD COLUMN archivedAt TEXT;
   CREATE TABLE task_lifecycle_transitions (
     id TEXT PRIMARY KEY NOT NULL,
     taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     type TEXT NOT NULL CHECK(type IN ('archived','restored')),
     occurredAt TEXT NOT NULL,
     localDate TEXT NOT NULL CHECK(length(localDate) = 10),
     utcOffsetMinutes INTEGER NOT NULL,
     timeZone TEXT NOT NULL,
     inferred INTEGER NOT NULL DEFAULT 0 CHECK(inferred IN (0,1))
   );
   CREATE INDEX lifecycle_by_task_date ON task_lifecycle_transitions(taskId, localDate, occurredAt);`,
  `ALTER TABLE tasks ADD COLUMN chartColor TEXT;`,
];
export async function migrate(connection: Connection) {
  await connection.run(db => db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;'));
  await connection.transaction(async db => {
    const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version;
    if (version > migrations.length) throw new Error('This database needs a newer version of TinyWins.');
    for (let index = version; index < migrations.length; index++) {
      if (index === 1) {
        const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(daily_entries)');
        if (!columns.some(column => column.name === 'positionAtEntry')) {
          await db.execAsync(migrations[index]);
        } else {
          // Fresh databases already include the field in migration 1; only
          // normalize the legacy zero-based TaskOption positions if needed.
          await db.execAsync('DROP INDEX IF EXISTS active_option_position; UPDATE task_options SET position = position + 1, rank = rank + 1 WHERE EXISTS (SELECT 1 FROM task_options WHERE position = 0); CREATE UNIQUE INDEX active_option_position ON task_options(taskId, position) WHERE active = 1;');
        }
      } else if (index === 2) {
        await db.execAsync(migrations[index]);
        const tasks = await db.getAllAsync<{ id: string; createdAt: string }>('SELECT id, createdAt FROM tasks');
        for (const task of tasks) {
          const scaleId = `${task.id}:legacy-scale`;
          const epochId = `${task.id}:legacy-trend`;
          const options = await db.getAllAsync<{ id: string; label: string; position: number }>('SELECT id, label, position FROM task_options WHERE taskId = ? ORDER BY active DESC, position, id', task.id);
          // Earlier releases did not record scale versions. This is a best-effort
          // snapshot of the current configuration; previous orders cannot be recovered.
          await db.runAsync('INSERT INTO rating_scale_versions(id, taskId, trendEpochId, createdAt, effectiveLocalDate, optionsJson) VALUES (?, ?, ?, ?, ?, ?)',
            scaleId, task.id, epochId, task.createdAt, task.createdAt.slice(0, 10), JSON.stringify(options));
          await db.runAsync('UPDATE tasks SET currentScaleVersionId = ?, currentTrendEpochId = ? WHERE id = ?', scaleId, epochId, task.id);
          await db.runAsync('UPDATE daily_entries SET scaleVersionIdAtEntry = ?, trendEpochIdAtEntry = ? WHERE taskId = ?', scaleId, epochId, task.id);
        }
        await db.execAsync(`CREATE TRIGGER entry_trend_identity_insert BEFORE INSERT ON daily_entries
          WHEN NEW.scaleVersionIdAtEntry IS NULL OR NEW.trendEpochIdAtEntry IS NULL OR NOT EXISTS (
            SELECT 1 FROM rating_scale_versions WHERE id = NEW.scaleVersionIdAtEntry
            AND taskId = NEW.taskId AND trendEpochId = NEW.trendEpochIdAtEntry)
          BEGIN SELECT RAISE(ABORT, 'Invalid historical rating-scale identity'); END;
          CREATE TRIGGER entry_trend_identity_update BEFORE UPDATE OF scaleVersionIdAtEntry, trendEpochIdAtEntry ON daily_entries
          WHEN NEW.scaleVersionIdAtEntry IS NULL OR NEW.trendEpochIdAtEntry IS NULL OR NOT EXISTS (
            SELECT 1 FROM rating_scale_versions WHERE id = NEW.scaleVersionIdAtEntry
            AND taskId = NEW.taskId AND trendEpochId = NEW.trendEpochIdAtEntry)
          BEGIN SELECT RAISE(ABORT, 'Invalid historical rating-scale identity'); END;`);
      } else if (index === 3) {
        await db.execAsync(migrations[index]);
        const tasks = await db.getAllAsync<{ id: string; createdAt: string; updatedAt: string; active: number }>(
          'SELECT id, createdAt, updatedAt, active FROM tasks');
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
        for (const task of tasks) {
          const created = new Date(task.createdAt);
          const createdDay = Number.isNaN(created.getTime()) ? null : localDate(created);
          const archived = new Date(task.updatedAt);
          const inferredArchive = Number.isNaN(archived.getTime()) ? new Date() : archived;
          await db.runAsync('UPDATE tasks SET createdLocalDate = ?, archivedAt = ? WHERE id = ?',
            createdDay, task.active ? null : inferredArchive.toISOString(), task.id);
          if (!task.active) await db.runAsync(`INSERT INTO task_lifecycle_transitions
            (id, taskId, type, occurredAt, localDate, utcOffsetMinutes, timeZone, inferred)
            VALUES (?, ?, 'archived', ?, ?, ?, ?, 1)`,
            `${task.id}:migration-archive`, task.id, inferredArchive.toISOString(),
            localDate(inferredArchive), -inferredArchive.getTimezoneOffset(), timeZone);
        }
      } else if (index === 4) {
        await db.execAsync(migrations[index]);
        const tasks = await db.getAllAsync<{ id: string }>('SELECT id FROM tasks ORDER BY id');
        const previous = colorsByTaskId(tasks.map(task => task.id));
        const used = new Set<string>();
        for (const task of tasks) {
          const suggested = previous.get(task.id);
          const color = suggested && !used.has(suggested) ? suggested : nextTaskColor(used);
          await db.runAsync('UPDATE tasks SET chartColor = ? WHERE id = ?', color, task.id);
          used.add(color);
        }
      } else await db.execAsync(migrations[index]);
      await db.execAsync(`PRAGMA user_version = ${index + 1}`);
    }
  });
}
