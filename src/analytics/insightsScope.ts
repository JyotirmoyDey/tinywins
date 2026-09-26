import { AnalyticsDataset, AnalyticsTask } from './types';
import { createTaskDayEligibility } from '../domain/taskLifecycle';
import { localDate, parseLocalDate } from '../domain/task';

export function insightsSourceForEntry(preferred: 'my' | 'demo', mode?: string) {
  // Archived Activities always refers to a real task ID, never a demo task name.
  return mode === 'archivedTask' ? 'my' : preferred;
}

export function archivedInsightsTask(tasks: AnalyticsTask[], taskId?: string, mode?: string) {
  if (mode !== 'archivedTask') return undefined;
  const task = selectedInsightsTask(tasks, taskId);
  return task && !task.active ? task : undefined;
}

export function selectedInsightsTask(tasks: AnalyticsTask[], taskId?: string) {
  return taskId && taskId !== 'all' ? tasks.find(task => task.id === taskId) : undefined;
}

/** Keep an archived task in All Activities only while the selected period
 * intersects a recorded day or an eligible active tracking day. */
export function tasksRelevantToPeriod(dataset: AnalyticsDataset,
  period: { startDate: string; endDate: string }, today = localDate()): AnalyticsTask[] {
  const lastDay = period.endDate < today ? period.endDate : today;
  return dataset.tasks.filter(task => {
    if (task.active) return true;
    const recordedDates = dataset.entries.filter(entry => entry.taskId === task.id)
      .map(entry => entry.localDate);
    if (recordedDates.some(date => date >= period.startDate && date <= lastDay)) return true;
    if (period.startDate > lastDay) return false;
    const eligibility = createTaskDayEligibility(task, dataset.lifecycle ?? [], recordedDates, today);
    if (!eligibility.start) return false;
    const cursor = parseLocalDate(period.startDate > eligibility.start
      ? period.startDate : eligibility.start);
    const end = parseLocalDate(lastDay);
    while (cursor <= end) {
      if (eligibility.eligible(localDate(cursor))) return true;
      cursor.setDate(cursor.getDate() + 1);
    }
    return false;
  });
}
