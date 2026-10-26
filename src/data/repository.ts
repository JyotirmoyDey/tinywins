import { Task, TaskDraft, TaskLifecycleTransition, TaskOption, normalizeOptions, validateDraft, localDate } from '../domain/task';
import { changesScaleStructure } from '../domain/ratingScale';
import { Connection, SqlDatabase } from './connection';
import { ACTIVE_TASK_LIMIT_MESSAGE, MAX_ACTIVE_TASKS } from '../config/taskLimits';
import { nextTaskColor } from '../analytics/taskColors';
import { COMBINED_INSIGHTS_LIMIT_MESSAGE, MAX_COMBINED_INSIGHTS_ITEMS } from '../config/combinedInsights';
type TaskRow = Omit<Task, 'options' | 'active' | 'includeInCombinedInsights' | 'levelsLocked'> & { active: number; includeInCombinedInsights: number; levelsLocked: number };
type OptionRow = Omit<TaskOption, 'active' | 'description'> & { active: number; description: string | null };
const toOption = (row: OptionRow): TaskOption => ({ ...row, active: !!row.active,
  description: row.description ?? undefined });
export class LevelConfigurationLockedError extends Error {
  constructor() { super('Level names, descriptions, order, and number are permanent after the first check-in.'); }
}
export class ActiveTaskLimitError extends Error {
  constructor() { super(ACTIVE_TASK_LIMIT_MESSAGE); this.name = 'ActiveTaskLimitError'; }
}
export class CombinedInsightsLimitError extends Error {
  constructor() { super(COMBINED_INSIGHTS_LIMIT_MESSAGE); this.name = 'CombinedInsightsLimitError'; }
}
async function assertActiveTaskCapacity(db: SqlDatabase) {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM tasks WHERE active = 1');
  if ((row?.count ?? 0) >= MAX_ACTIVE_TASKS) throw new ActiveTaskLimitError();
}
async function selectedCount(db: SqlDatabase) {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM tasks WHERE active = 1 AND includeInCombinedInsights = 1');
  return row?.count ?? 0;
}
export async function readTask(db: SqlDatabase, id: string): Promise<Task | undefined> {
  const row = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', id);
  if (!row) return undefined;
  const options = await db.getAllAsync<OptionRow>('SELECT * FROM task_options WHERE taskId = ? AND active = 1 ORDER BY position', id);
  return { ...row, active: !!row.active, includeInCombinedInsights: !!row.includeInCombinedInsights,
    levelsLocked: !!row.levelsLocked,
    options: options.map(toOption) };
}
export class TaskRepository {
  constructor(private connection: Connection, private id: () => string) {}
  getAll(): Promise<Task[]> {
    return this.connection.run(async db => {
      const tasks = await db.getAllAsync<TaskRow>(`SELECT * FROM tasks ORDER BY
        sortPosition, id`);
      const options = await db.getAllAsync<OptionRow>('SELECT * FROM task_options WHERE active = 1 ORDER BY position');
      return tasks.map(task => ({ ...task, active: !!task.active, levelsLocked: !!task.levelsLocked,
        includeInCombinedInsights: !!task.includeInCombinedInsights,
        options: options.filter(o => o.taskId === task.id).map(toOption) }));
    });
  }
  getById(id: string) { return this.connection.run(db => readTask(db, id)); }
  getOptions(id: string) {
    return this.connection.run(async db => (await db.getAllAsync<OptionRow>('SELECT * FROM task_options WHERE taskId = ? ORDER BY active DESC, position', id))
      .map(toOption));
  }
  getLifecycleTransitions(taskId?: string): Promise<TaskLifecycleTransition[]> {
    return this.connection.run(async db => (await db.getAllAsync<Omit<TaskLifecycleTransition, 'inferred'> & { inferred: number }>(
      taskId ? `SELECT rowid AS sequence, * FROM task_lifecycle_transitions WHERE taskId = ? ORDER BY occurredAt, rowid` :
        `SELECT rowid AS sequence, * FROM task_lifecycle_transitions ORDER BY occurredAt, rowid`,
      ...(taskId ? [taskId] : []))).map(row => ({ ...row, inferred: !!row.inferred })));
  }
  create(draft: TaskDraft) {
    return this.connection.transaction(async db => {
      const error = validateDraft(draft); if (error) throw new Error(error);
      await assertActiveTaskCapacity(db);
      const occupied = await selectedCount(db);
      const include = draft.includeInCombinedInsights ?? occupied < MAX_COMBINED_INSIGHTS_ITEMS;
      if (include && occupied >= MAX_COMBINED_INSIGHTS_ITEMS) throw new CombinedInsightsLimitError();
      const id = this.id(); const now = new Date().toISOString();
      const usedColors = await db.getAllAsync<{ chartColor: string }>(
        'SELECT chartColor FROM tasks WHERE chartColor IS NOT NULL');
      const chartColor = nextTaskColor(usedColors.map(row => row.chartColor));
      const sortPosition = (await db.getFirstAsync<{ nextPosition: number }>(
        'SELECT COALESCE(MAX(sortPosition), -1) + 1 AS nextPosition FROM tasks'))!.nextPosition;
      await db.runAsync('INSERT INTO tasks(id, name, createdAt, updatedAt, active, createdLocalDate, archivedAt, chartColor, includeInCombinedInsights, sortPosition) VALUES (?, ?, ?, ?, 1, ?, NULL, ?, ?, ?)',
        id, draft.name.trim(), now, now, localDate(), chartColor, Number(include), sortPosition);
      const options = normalizeOptions(id, draft.options, now);
      for (const option of options) await insertOption(db, option);
      return (await readTask(db, id))!;
    });
  }
  update(id: string, draft: TaskDraft) {
    return this.connection.transaction(async db => {
      const current = await readTask(db, id);
      if (!current) throw new Error('Task not found.');
      const error = validateDraft(draft, current); if (error) throw new Error(error);
      const structural = changesScaleStructure(current.options, draft.options);
      const hasRecordings = !!await db.getFirstAsync('SELECT 1 FROM daily_entries WHERE taskId = ? LIMIT 1', id);
      const definitionsLocked = current.levelsLocked || hasRecordings;
      const definitionChanged = structural || current.options.some(option => {
        const next = draft.options.find(candidate => candidate.id === option.id);
        if (!next || next.label !== option.label) return true;
        if (next.description === undefined) return false;
        return (next.description.trim() || undefined) !== option.description;
      });
      if (definitionsLocked && definitionChanged) throw new LevelConfigurationLockedError();
      const now = new Date().toISOString();
      const existing = await db.getAllAsync<OptionRow>('SELECT * FROM task_options WHERE taskId = ?', id);
      // Deactivate first to avoid temporary collisions in the unique position index.
      await db.runAsync('UPDATE task_options SET active = 0, updatedAt = ? WHERE taskId = ? AND active = 1', now, id);
      const normalized = normalizeOptions(id, draft.options, now, Math.max(current.options.length, draft.options.length))
        .map(option => ({ ...option, description: draft.options.find(saved => saved.id === option.id)?.description === undefined
          ? existing.find(saved => saved.id === option.id)?.description ?? undefined : option.description }));
      for (const option of normalized) {
        if (existing.some(o => o.id === option.id)) {
          await db.runAsync('UPDATE task_options SET label = ?, description = ?, position = ?, rank = ?, normalizedWeight = ?, active = 1, updatedAt = ? WHERE id = ? AND taskId = ?',
            option.label, option.description ?? null, option.position, option.rank, option.normalizedWeight, now, option.id, id);
        } else await insertOption(db, option);
      }
      // Used options stay as inactive rows; only unreferenced removed options are deleted.
      await db.runAsync('DELETE FROM task_options WHERE taskId = ? AND active = 0 AND NOT EXISTS (SELECT 1 FROM daily_entries WHERE optionId = task_options.id)', id);
      await db.runAsync('UPDATE tasks SET name = ?, updatedAt = ? WHERE id = ?',
        draft.name.trim(), now, id);
      return (await readTask(db, id))!;
    });
  }
  archive(id: string) { return this.setActive(id, false); }
  restore(id: string) { return this.setActive(id, true); }
  reorderActive(ids: string[]) {
    return this.connection.transaction(async db => {
      const rows = await db.getAllAsync<{ id: string; active: number; sortPosition: number }>(
        'SELECT id, active, sortPosition FROM tasks ORDER BY sortPosition, id');
      const activeIds = rows.filter(row => row.active).map(row => row.id);
      if (ids.length !== activeIds.length || new Set(ids).size !== ids.length ||
        ids.some(id => !activeIds.includes(id))) throw new Error('The activity order changed. Please try again.');
      if (ids.every((id, index) => id === activeIds[index])) return;
      const reordered = rows.map(row => row.id);
      const activeSlots = rows.flatMap((row, index) => row.active ? [index] : []);
      activeSlots.forEach((slot, index) => { reordered[slot] = ids[index]; });
      // Use a temporary range so the update remains safe if a future schema
      // adds a uniqueness constraint on the sort position.
      const offset = Math.max(-1, ...rows.map(row => row.sortPosition)) + rows.length + 1;
      for (let index = 0; index < reordered.length; index++)
        await db.runAsync('UPDATE tasks SET sortPosition = ? WHERE id = ?', offset + index, reordered[index]);
      for (let index = 0; index < reordered.length; index++)
        await db.runAsync('UPDATE tasks SET sortPosition = ? WHERE id = ?', index, reordered[index]);
    });
  }
  private setActive(id: string, active: boolean) {
    return this.connection.transaction(async db => {
      const task = await readTask(db, id);
      if (!task) throw new Error('Task not found.');
      if (task.active === active) return;
      if (active) await assertActiveTaskCapacity(db);
      // Keep a selected item's combined-Insights preference while archived.
      // Inactive items are filtered out of Insights and don't consume a slot.
      // If other items filled the five-item limit meanwhile, restore it
      // unselected rather than exceeding the limit or displacing another item.
      const includeInCombinedInsights = active
        ? task.includeInCombinedInsights && await selectedCount(db) < MAX_COMBINED_INSIGHTS_ITEMS
        : task.includeInCombinedInsights;
      const moment = new Date(); const now = moment.toISOString();
      const day = localDate(moment);
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
      await db.runAsync('UPDATE tasks SET active = ?, archivedAt = ?, includeInCombinedInsights = ?, updatedAt = ? WHERE id = ?',
        Number(active), active ? null : now, Number(includeInCombinedInsights), now, id);
      await db.runAsync(`INSERT INTO task_lifecycle_transitions
        (id, taskId, type, occurredAt, localDate, utcOffsetMinutes, timeZone, inferred)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        this.id(), id, active ? 'restored' : 'archived', now, day,
        -moment.getTimezoneOffset(), timeZone);
    });
  }
  setCombinedInsightsSelection(id: string, selected: boolean) {
    return this.connection.transaction(async db => {
      const task = await db.getFirstAsync<{ active: number; includeInCombinedInsights: number }>(
        'SELECT active, includeInCombinedInsights FROM tasks WHERE id = ?', id);
      if (!task) throw new Error('Item not found.');
      if (!task.active) throw new Error('Archived items cannot be added to combined Insights.');
      if (!!task.includeInCombinedInsights === selected) return;
      if (selected && await selectedCount(db) >= MAX_COMBINED_INSIGHTS_ITEMS)
        throw new CombinedInsightsLimitError();
      await db.runAsync('UPDATE tasks SET includeInCombinedInsights = ? WHERE id = ?', Number(selected), id);
    });
  }
  delete(id: string) { return this.connection.transaction(async db => { await db.runAsync('DELETE FROM tasks WHERE id = ?', id); }); }
  deleteArchivedTasks() {
    return this.connection.transaction(async db => { await db.runAsync('DELETE FROM tasks WHERE active = 0'); });
  }
  deleteAllLocalData() {
    // Foreign-key cascades remove options, entries, and lifecycle transitions together.
    return this.connection.transaction(async db => { await db.runAsync('DELETE FROM tasks'); });
  }
  createTask(draft: TaskDraft) { return this.create(draft); }
  updateTask(id: string, draft: TaskDraft) { return this.update(id, draft); }
  archiveTask(id: string) { return this.archive(id); }
  deleteTask(id: string) { return this.delete(id); }
}
export function insertOption(db: SqlDatabase, option: TaskOption) {
  return db.runAsync('INSERT INTO task_options(id, taskId, label, position, rank, normalizedWeight, active, createdAt, updatedAt, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    option.id, option.taskId, option.label, option.position, option.rank, option.normalizedWeight, Number(option.active), option.createdAt, option.updatedAt, option.description ?? null);
}
