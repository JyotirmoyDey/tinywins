import { normalizeOptions, parseLocalDate, validateDraft } from '../domain/task';
import { Connection } from './connection';
import { insertOption } from './repository';
interface LegacyTask {
  id: string; name: string; createdAt: string; updatedAt: string; active: boolean;
  options: { id: string; label: string }[];
}
interface LegacyEntry {
  id: string; taskId: string; optionId: string; date: string; label: string;
  normalizedWeight: number; rankAtEntry?: number | null; updatedAt: string;
}
function requireString(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('The previous local data could not be imported safely.');
}
/** Atomic and idempotent. The original AsyncStorage value remains as a backup. */
export async function importLegacy(connection: Connection, raw: string | null, seed: boolean, id: () => string) {
  await connection.transaction(async db => {
    if (await db.getFirstAsync('SELECT value FROM app_metadata WHERE key = ?', 'legacyImported')) return;
    let tasks: LegacyTask[] = []; let entries: LegacyEntry[] = [];
    if (raw !== null) {
      const value = JSON.parse(raw);
      if (value?.version !== 1 || !Array.isArray(value.tasks) || !Array.isArray(value.entries)) throw new Error('Unrecognized previous local data.');
      tasks = value.tasks; entries = value.entries;
    } else if (seed) {
      const now = new Date().toISOString();
      tasks = [
        ['Guitar Practice', "Didn't practice", 'Short', 'Good', 'Great'],
        ['Sleep', 'Poor', 'Okay', 'Good', 'Excellent'], ['Meditation', 'Skipped', 'Short', 'Complete'],
      ].map(([name, ...labels]) => ({ id: id(), name, createdAt: now, updatedAt: now, active: true,
        options: labels.map(label => ({ id: id(), label })) }));
    }
    for (const task of tasks) {
      requireString(task.id); requireString(task.createdAt); requireString(task.updatedAt);
      if (!Array.isArray(task.options) || typeof task.active !== 'boolean') throw new Error('Invalid previous task.');
      const error = validateDraft(task); if (error) throw new Error(error);
      const scaleId = id(); const epochId = id();
      await db.runAsync('INSERT INTO tasks(id, name, createdAt, updatedAt, active, currentScaleVersionId, currentTrendEpochId) VALUES (?, ?, ?, ?, ?, ?, ?)',
        task.id, task.name.trim(), task.createdAt, task.updatedAt, Number(task.active), scaleId, epochId);
      const normalized = normalizeOptions(task.id, task.options, task.createdAt);
      for (const option of normalized) {
        requireString(option.id); await insertOption(db, { ...option, updatedAt: task.updatedAt });
      }
      await db.runAsync('INSERT INTO rating_scale_versions(id, taskId, trendEpochId, createdAt, effectiveLocalDate, optionsJson) VALUES (?, ?, ?, ?, ?, ?)',
        scaleId, task.id, epochId, task.createdAt, task.createdAt.slice(0, 10), JSON.stringify(normalized.map(({ id, label, position }) => ({ id, label, position }))));
    }
    for (const entry of entries) {
      requireString(entry.id); requireString(entry.optionId); requireString(entry.label); requireString(entry.updatedAt);
      parseLocalDate(entry.date);
      if (!tasks.some(task => task.id === entry.taskId)) throw new Error('An old response has no matching task.');
      const option = await db.getFirstAsync<{ taskId: string }>('SELECT taskId FROM task_options WHERE id = ?', entry.optionId);
      if (option && option.taskId !== entry.taskId) throw new Error('An old choice belongs to another task.');
      // Older versions physically removed choices. Reconstruct a retired identity
      // from the saved snapshot so the historical foreign key remains meaningful.
      if (!option) await insertOption(db, { id: entry.optionId, taskId: entry.taskId, label: entry.label,
        position: 1, rank: 1, normalizedWeight: entry.normalizedWeight, active: false,
        createdAt: entry.updatedAt, updatedAt: entry.updatedAt });
      await db.runAsync(`INSERT INTO daily_entries(id, taskId, optionId, localDate, createdAt, updatedAt,
        optionLabelAtEntry, positionAtEntry, rankAtEntry, normalizedWeightAtEntry, scaleVersionIdAtEntry, trendEpochIdAtEntry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        (SELECT currentScaleVersionId FROM tasks WHERE id = ?), (SELECT currentTrendEpochId FROM tasks WHERE id = ?))`,
      entry.id, entry.taskId, entry.optionId, entry.date, entry.updatedAt, entry.updatedAt, entry.label, entry.rankAtEntry ?? 1, entry.rankAtEntry ?? 1, entry.normalizedWeight, entry.taskId, entry.taskId);
    }
    await db.runAsync('INSERT INTO app_metadata(key, value) VALUES (?, ?)', 'legacyImported', '1');
  });
}
