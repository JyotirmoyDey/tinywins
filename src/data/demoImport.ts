import { AnalyticsDataset } from '../analytics/types';
import { MAX_ACTIVE_TASKS } from '../config/taskLimits';
import { initialCombinedTaskIds } from '../config/combinedInsights';
import { parseLocalDate } from '../domain/task';
import { Connection } from './connection';

/** Imports a validated development fixture as ordinary local user records.
 * No analytics screen reads this service, and it never writes demo data on load. */
export class DemoImportService {
  constructor(private connection: Connection) {}

  replaceLocalData(dataset: AnalyticsDataset) {
    validateDataset(dataset);
    return this.connection.transaction(async db => {
      // This includes previously archived tasks and their dependent history.
      await db.runAsync('DELETE FROM tasks');
      const initialGraphIds = initialCombinedTaskIds(dataset.tasks);
      for (const [sortPosition, task] of dataset.tasks.entries()) {
        await db.runAsync(`INSERT INTO tasks
          (id,name,createdAt,updatedAt,active,createdLocalDate,archivedAt,chartColor,includeInCombinedInsights,sortPosition)
          VALUES (?,?,?,?,1,?,NULL,?,?,?)`,
        task.id, task.name, task.createdAt, task.updatedAt, task.createdLocalDate ?? null,
        task.chartColor ?? task.color, Number(initialGraphIds.has(task.id)), task.sortPosition ?? sortPosition);
        for (const option of task.options) await db.runAsync(`INSERT INTO task_options
          (id,taskId,label,position,rank,normalizedWeight,active,createdAt,updatedAt,description)
          VALUES (?,?,?,?,?,?,1,?,?,?)`,
        option.id, task.id, option.label, option.position, option.rank,
        option.normalizedWeight, task.createdAt, task.updatedAt, option.description ?? null);
      }
      for (const entry of dataset.entries) {
        const recordedAt = `${entry.localDate}T12:00:00.000Z`;
        await db.runAsync(`INSERT INTO daily_entries
          (id,taskId,optionId,localDate,createdAt,updatedAt,optionLabelAtEntry,
           positionAtEntry,rankAtEntry,normalizedWeightAtEntry)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
        entry.id, entry.taskId, entry.optionId, entry.localDate, recordedAt, recordedAt,
        entry.optionLabelAtEntry, entry.positionAtEntry, entry.positionAtEntry,
        entry.normalizedWeightAtEntry);
      }
      await db.runAsync(`UPDATE tasks SET levelsLocked = 1 WHERE EXISTS (
        SELECT 1 FROM daily_entries WHERE daily_entries.taskId = tasks.id)`);
    });
  }
}

export function validateDataset(dataset: AnalyticsDataset) {
  if (!dataset.tasks.length || dataset.tasks.length > MAX_ACTIVE_TASKS)
    throw new Error('The test dataset has an invalid number of tasks.');
  const taskIds = new Set<string>(); const optionIds = new Set<string>();
  for (const task of dataset.tasks) {
    if (!task.id || !task.name.trim() || taskIds.has(task.id) ||
      task.options.length < 2 || task.options.length > 7)
      throw new Error('The test dataset has an invalid task.');
    taskIds.add(task.id);
    if (task.createdLocalDate) parseLocalDate(task.createdLocalDate);
    for (const [index, option] of task.options.entries()) {
      if (!option.id || !option.label.trim() || optionIds.has(option.id) ||
        option.position !== index + 1 || option.rank !== option.position ||
        !Number.isInteger(option.normalizedWeight) || option.normalizedWeight < 0 ||
        option.normalizedWeight > 100)
        throw new Error('The test dataset has an invalid rating option.');
      optionIds.add(option.id);
    }
  }
  const entryIds = new Set<string>(); const taskDays = new Set<string>();
  for (const entry of dataset.entries) {
    const task = dataset.tasks.find(candidate => candidate.id === entry.taskId);
    const key = `${entry.taskId}:${entry.localDate}`;
    parseLocalDate(entry.localDate);
    if (!entry.id || entryIds.has(entry.id) || taskDays.has(key) ||
      !task?.options.some(option => option.id === entry.optionId) ||
      !entry.optionLabelAtEntry.trim() || !Number.isInteger(entry.positionAtEntry) ||
      entry.positionAtEntry < 1 || !Number.isInteger(entry.normalizedWeightAtEntry) ||
      entry.normalizedWeightAtEntry < 0 || entry.normalizedWeightAtEntry > 100)
      throw new Error('The test dataset has an invalid recording.');
    entryIds.add(entry.id); taskDays.add(key);
  }
}
