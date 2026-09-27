import type { AnalyticsDataset } from './types';
import type { Task } from '../domain/task';
import { getAnalyticsDataset } from './service';

/** SQLite-backed Home tasks own the selection, even while Insights is mounted.
 * Demo entries stay isolated; only matching stable IDs inherit Home's choice. */
export function withHomeInsightsSelection(dataset: AnalyticsDataset, homeTasks: Task[], demo: boolean): AnalyticsDataset {
  if (!demo) return getAnalyticsDataset(homeTasks, dataset.entries,
    dataset.scaleVersions, dataset.lifecycle);
  const selectedIds = new Set(homeTasks.filter(task => task.active && task.includeInCombinedInsights)
    .map(task => task.id));
  return { ...dataset, tasks: dataset.tasks.map(task => ({ ...task,
    includeInCombinedInsights: task.active && selectedIds.has(task.id) })) };
}

export function selectedInsightsTasks(dataset: AnalyticsDataset) {
  return dataset.tasks.filter(task => task.active && task.includeInCombinedInsights === true);
}

export function regularInsightsTaskId(requestedId: string, selectedTasks: { id: string }[]) {
  return requestedId !== 'all' && selectedTasks.some(task => task.id === requestedId)
    ? requestedId : 'all';
}

/** One boundary for every All Activities chart. Individual Insights keep the full dataset. */
export function selectedCombinedDataset(dataset: AnalyticsDataset): AnalyticsDataset {
  const tasks = selectedInsightsTasks(dataset);
  const ids = new Set(tasks.map(task => task.id));
  return {
    tasks,
    entries: dataset.entries.filter(entry => ids.has(entry.taskId)),
    scaleVersions: dataset.scaleVersions.filter(version => ids.has(version.taskId)),
    lifecycle: dataset.lifecycle?.filter(event => ids.has(event.taskId)),
  };
}
