import { DailyEntry, TaskLifecycleTransition, TaskOption, createEntrySnapshot, localDate, parseLocalDate } from '../domain/task';
import { createTaskDayEligibility } from '../domain/taskLifecycle';
import { Connection } from './connection';
export class DailyEntryRepository {
  // Every write snapshots the current option; joins to TaskOption are never used to interpret history.
  constructor(private connection: Connection, private id: () => string) {}
  getAll() {
    return this.connection.run(db => db.getAllAsync<DailyEntry>('SELECT * FROM daily_entries ORDER BY localDate DESC'));
  }
  getForDate(date: string) {
    parseLocalDate(date);
    return this.connection.run(db => db.getAllAsync<DailyEntry>('SELECT * FROM daily_entries WHERE localDate = ?', date));
  }
  getForTaskAndDate(taskId: string, date: string) {
    parseLocalDate(date);
    return this.connection.run(db => db.getFirstAsync<DailyEntry>('SELECT * FROM daily_entries WHERE taskId = ? AND localDate = ?', taskId, date));
  }
  getHistoryForTask(taskId: string, range: { from: string; to: string }) {
    parseLocalDate(range.from); parseLocalDate(range.to);
    return this.connection.run(db => db.getAllAsync<DailyEntry>('SELECT * FROM daily_entries WHERE taskId = ? AND localDate BETWEEN ? AND ? ORDER BY localDate DESC', taskId, range.from, range.to));
  }
  upsert(taskId: string, date: string, optionId: string) {
    parseLocalDate(date);
    if (date > localDate()) return Promise.reject(new Error('Choose today or an earlier date.'));
    return this.connection.transaction(async db => {
      const option = await db.getFirstAsync<TaskOption>('SELECT * FROM task_options WHERE id = ? AND taskId = ? AND active = 1', optionId, taskId);
      if (!option) throw new Error('This choice is no longer available.');
      const task = await db.getFirstAsync<{ id: string; active: number; createdAt: string;
        createdLocalDate: string | null; archivedAt: string | null;
        currentScaleVersionId: string; currentTrendEpochId: string }>('SELECT * FROM tasks WHERE id = ?', taskId);
      if (!task) throw new Error('Task not found.');
      if (!task.active && date === localDate()) throw new Error('Restore this activity before recording today.');
      const existing = await db.getFirstAsync<DailyEntry>(
        'SELECT * FROM daily_entries WHERE taskId = ? AND localDate = ?', taskId, date);
      if (!existing) {
        const transitions = await db.getAllAsync<TaskLifecycleTransition>(
          'SELECT rowid AS sequence, * FROM task_lifecycle_transitions WHERE taskId = ? ORDER BY localDate, occurredAt, rowid', taskId);
        const recorded = await db.getAllAsync<{ localDate: string }>(
          'SELECT localDate FROM daily_entries WHERE taskId = ?', taskId);
        const eligibility = createTaskDayEligibility({ ...task, active: !!task.active },
          transitions, recorded.map(row => row.localDate));
        // Existing history editing allows a user to backfill dates before a
        // newly created task. Once lifecycle transitions exist, fully archived
        // dates remain unavailable for new recordings.
        const retroactiveBeforeCreation = !!task.active && transitions.every(event => event.localDate > date) &&
          !!eligibility.start && date < eligibility.start;
        if (!eligibility.eligible(date) && !retroactiveBeforeCreation)
          throw new Error('This activity was not active on that date.');
      }
      const now = new Date().toISOString();
      const snapshot = createEntrySnapshot({ ...option, active: !!option.active });
      await db.runAsync(`INSERT INTO daily_entries(id, taskId, optionId, localDate, createdAt, updatedAt, optionLabelAtEntry, positionAtEntry, rankAtEntry, normalizedWeightAtEntry, scaleVersionIdAtEntry, trendEpochIdAtEntry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(taskId, localDate) DO UPDATE SET optionId = excluded.optionId,
        updatedAt = excluded.updatedAt, optionLabelAtEntry = excluded.optionLabelAtEntry, positionAtEntry = excluded.positionAtEntry,
        rankAtEntry = excluded.rankAtEntry, normalizedWeightAtEntry = excluded.normalizedWeightAtEntry,
        scaleVersionIdAtEntry = excluded.scaleVersionIdAtEntry, trendEpochIdAtEntry = excluded.trendEpochIdAtEntry`,
      this.id(), taskId, optionId, date, now, now, snapshot.optionLabelAtEntry, snapshot.positionAtEntry, snapshot.rankAtEntry, snapshot.normalizedWeightAtEntry, task.currentScaleVersionId, task.currentTrendEpochId);
      return (await db.getFirstAsync<DailyEntry>('SELECT * FROM daily_entries WHERE taskId = ? AND localDate = ?', taskId, date))!;
    });
  }
  deleteEntry(taskId: string, date: string) {
    parseLocalDate(date);
    return this.connection.transaction(async db => { await db.runAsync('DELETE FROM daily_entries WHERE taskId = ? AND localDate = ?', taskId, date); });
  }
}
