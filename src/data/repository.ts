import { RatingScaleVersion, Task, TaskDraft, TaskOption, normalizeOptions, validateDraft, localDate } from '../domain/task';
import { changesScaleStructure, reordersExistingOptions } from '../domain/ratingScale';
import { Connection, SqlDatabase } from './connection';
type TaskRow = Omit<Task, 'options' | 'active'> & { active: number };
type OptionRow = Omit<TaskOption, 'active'> & { active: number };
type VersionRow = Omit<RatingScaleVersion, 'options'> & { optionsJson: string };
export class TrendResetConfirmationRequired extends Error {
  constructor() { super('Reordering recorded rating levels requires confirmation.'); }
}
function toVersion(row: VersionRow): RatingScaleVersion {
  return { id: row.id, taskId: row.taskId, trendEpochId: row.trendEpochId,
    createdAt: row.createdAt, effectiveLocalDate: row.effectiveLocalDate, options: JSON.parse(row.optionsJson) };
}
async function insertVersion(db: SqlDatabase, version: RatingScaleVersion) {
  await db.runAsync('INSERT INTO rating_scale_versions(id, taskId, trendEpochId, createdAt, effectiveLocalDate, optionsJson) VALUES (?, ?, ?, ?, ?, ?)',
    version.id, version.taskId, version.trendEpochId, version.createdAt, version.effectiveLocalDate, JSON.stringify(version.options));
}
export async function readTask(db: SqlDatabase, id: string): Promise<Task | undefined> {
  const row = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', id);
  if (!row) return undefined;
  const options = await db.getAllAsync<OptionRow>('SELECT * FROM task_options WHERE taskId = ? AND active = 1 ORDER BY position', id);
  return { ...row, active: !!row.active, options: options.map(option => ({ ...option, active: !!option.active })) };
}
export class TaskRepository {
  constructor(private connection: Connection, private id: () => string) {}
  getAll(): Promise<Task[]> {
    return this.connection.run(async db => {
      const tasks = await db.getAllAsync<TaskRow>('SELECT * FROM tasks ORDER BY createdAt, id');
      const options = await db.getAllAsync<OptionRow>('SELECT * FROM task_options WHERE active = 1 ORDER BY position');
      return tasks.map(task => ({ ...task, active: !!task.active, options: options.filter(o => o.taskId === task.id).map(o => ({ ...o, active: !!o.active })) }));
    });
  }
  getById(id: string) { return this.connection.run(db => readTask(db, id)); }
  getOptions(id: string) {
    return this.connection.run(async db => (await db.getAllAsync<OptionRow>('SELECT * FROM task_options WHERE taskId = ? ORDER BY active DESC, position', id))
      .map(option => ({ ...option, active: !!option.active })));
  }
  getScaleVersions(taskId?: string) {
    return this.connection.run(async db => (await db.getAllAsync<VersionRow>(
      taskId ? 'SELECT * FROM rating_scale_versions WHERE taskId = ? ORDER BY createdAt, rowid' : 'SELECT * FROM rating_scale_versions ORDER BY createdAt, rowid',
      ...(taskId ? [taskId] : []))).map(toVersion));
  }
  async requiresTrendReset(id: string, draft: TaskDraft) {
    return this.connection.run(async db => {
      const task = await readTask(db, id);
      if (!task) throw new Error('Task not found.');
      if (!reordersExistingOptions(task.options, draft.options)) return false;
      return !!await db.getFirstAsync('SELECT 1 FROM daily_entries WHERE taskId = ? LIMIT 1', id);
    });
  }
  create(draft: TaskDraft) {
    return this.connection.transaction(async db => {
      const error = validateDraft(draft); if (error) throw new Error(error);
      const id = this.id(); const now = new Date().toISOString();
      const scaleId = this.id(); const epochId = this.id();
      await db.runAsync('INSERT INTO tasks(id, name, createdAt, updatedAt, active, currentScaleVersionId, currentTrendEpochId) VALUES (?, ?, ?, ?, 1, ?, ?)',
        id, draft.name.trim(), now, now, scaleId, epochId);
      const options = normalizeOptions(id, draft.options, now);
      for (const option of options) await insertOption(db, option);
      await insertVersion(db, { id: scaleId, taskId: id, trendEpochId: epochId, createdAt: now, effectiveLocalDate: localDate(),
        options: options.map(({ id, label, position }) => ({ id, label, position })) });
      return (await readTask(db, id))!;
    });
  }
  update(id: string, draft: TaskDraft, confirmTrendReset = false) {
    return this.connection.transaction(async db => {
      const error = validateDraft(draft); if (error) throw new Error(error);
      const current = await readTask(db, id);
      if (!current) throw new Error('Task not found.');
      const reorder = reordersExistingOptions(current.options, draft.options);
      const structural = changesScaleStructure(current.options, draft.options);
      const hasHistory = reorder && !!await db.getFirstAsync('SELECT 1 FROM daily_entries WHERE taskId = ? LIMIT 1', id);
      if (hasHistory && !confirmTrendReset) throw new TrendResetConfirmationRequired();
      const now = new Date().toISOString();
      const existing = await db.getAllAsync<OptionRow>('SELECT * FROM task_options WHERE taskId = ?', id);
      // Deactivate first to avoid temporary collisions in the unique position index.
      await db.runAsync('UPDATE task_options SET active = 0, updatedAt = ? WHERE taskId = ? AND active = 1', now, id);
      const normalized = normalizeOptions(id, draft.options, now);
      for (const option of normalized) {
        if (existing.some(o => o.id === option.id)) {
          await db.runAsync('UPDATE task_options SET label = ?, position = ?, rank = ?, normalizedWeight = ?, active = 1, updatedAt = ? WHERE id = ? AND taskId = ?',
            option.label, option.position, option.rank, option.normalizedWeight, now, option.id, id);
        } else await insertOption(db, option);
      }
      // Used options stay as inactive rows; only unreferenced removed options are deleted.
      await db.runAsync('DELETE FROM task_options WHERE taskId = ? AND active = 0 AND NOT EXISTS (SELECT 1 FROM daily_entries WHERE optionId = task_options.id)', id);
      const epochId = hasHistory ? this.id() : current.currentTrendEpochId;
      const scaleId = structural ? this.id() : current.currentScaleVersionId;
      if (structural) await insertVersion(db, { id: scaleId, taskId: id, trendEpochId: epochId, createdAt: now,
        effectiveLocalDate: localDate(), options: normalized.map(({ id, label, position }) => ({ id, label, position })) });
      await db.runAsync('UPDATE tasks SET name = ?, updatedAt = ?, currentScaleVersionId = ?, currentTrendEpochId = ? WHERE id = ?',
        draft.name.trim(), now, scaleId, epochId, id);
      return (await readTask(db, id))!;
    });
  }
  archive(id: string) { return this.setActive(id, false); }
  restore(id: string) { return this.setActive(id, true); }
  private setActive(id: string, active: boolean) {
    return this.connection.transaction(async db => {
      if (!await readTask(db, id)) throw new Error('Task not found.');
      await db.runAsync('UPDATE tasks SET active = ?, updatedAt = ? WHERE id = ?', Number(active), new Date().toISOString(), id);
    });
  }
  delete(id: string) { return this.connection.transaction(async db => { await db.runAsync('DELETE FROM tasks WHERE id = ?', id); }); }
  createTask(draft: TaskDraft) { return this.create(draft); }
  updateTask(id: string, draft: TaskDraft, confirmTrendReset = false) { return this.update(id, draft, confirmTrendReset); }
  archiveTask(id: string) { return this.archive(id); }
  deleteTask(id: string) { return this.delete(id); }
}
export function insertOption(db: SqlDatabase, option: TaskOption) {
  return db.runAsync('INSERT INTO task_options(id, taskId, label, position, rank, normalizedWeight, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    option.id, option.taskId, option.label, option.position, option.rank, option.normalizedWeight, Number(option.active), option.createdAt, option.updatedAt);
}
