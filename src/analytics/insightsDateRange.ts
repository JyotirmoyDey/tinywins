import { localDate, parseLocalDate } from '../domain/task';
import { RatingDistributionTimeline, getRatingDistributionPeriod } from './ratingDistribution';
import { AnalyticsEntry, AnalyticsTask } from './types';

export interface CustomRange { startDate: string; endDate: string }

export function updateCustomRangeDraft(current: CustomRange, field: 'start' | 'end', selected: string): CustomRange {
  return field === 'start'
    ? { startDate: selected, endDate: current.endDate < selected ? selected : current.endDate }
    : { ...current, endDate: selected };
}

export function earliestRecordedDate(entries: AnalyticsEntry[], taskId?: string): string | null {
  let earliest: string | null = null;
  for (const entry of entries) {
    if (taskId && entry.taskId !== taskId) continue;
    if (!earliest || entry.localDate < earliest) earliest = entry.localDate;
  }
  return earliest;
}

/** Picker availability is based on when the selected task existed, not only on its first check-in.
 * If imported history predates a task's creation timestamp, use the recording instead. */
export function earliestAvailableDate(
  tasks: Pick<AnalyticsTask, 'id' | 'createdAt'>[],
  entries: Pick<AnalyticsEntry, 'taskId' | 'localDate'>[],
  today: string,
  taskId?: string,
): string | null {
  const selectedTasks = taskId ? tasks.filter(task => task.id === taskId) : tasks;
  const selectedIds = new Set(selectedTasks.map(task => task.id));
  const firstEntryByTask = new Map<string, string>();
  for (const entry of entries) {
    if (!selectedIds.has(entry.taskId) || entry.localDate > today) continue;
    const previous = firstEntryByTask.get(entry.taskId);
    if (!previous || entry.localDate < previous) firstEntryByTask.set(entry.taskId, entry.localDate);
  }
  let earliest: string | null = null;
  for (const task of selectedTasks) {
    const firstEntry = firstEntryByTask.get(task.id) ?? null;
    const created = new Date(task.createdAt);
    const creationDate = Number.isFinite(created.getTime()) ? localDate(created) : null;
    const reliableCreation = creationDate && creationDate <= today && (!firstEntry || creationDate <= firstEntry)
      ? creationDate : null;
    const candidate = reliableCreation ?? firstEntry;
    if (candidate && (!earliest || candidate < earliest)) earliest = candidate;
  }
  return earliest;
}

export function availableCustomRange(range: CustomRange, earliest: string | null, today: string): CustomRange {
  const minimum = earliest ?? today;
  const startDate = range.startDate < minimum || range.startDate > today ? minimum : range.startDate;
  const endDate = range.endDate < startDate || range.endDate > today ? today : range.endDate;
  return { startDate, endDate };
}

export function validateCustomRange(range: CustomRange, today: string, earliest?: string | null): string | null {
  try {
    parseLocalDate(range.startDate);
    parseLocalDate(range.endDate);
    parseLocalDate(today);
  } catch {
    return 'Choose valid start and end dates.';
  }
  if (range.startDate > range.endDate) return 'Start date must be on or before end date.';
  if (range.endDate > today) return 'Future dates are not available.';
  if (earliest && range.startDate < earliest) return `The first available date is ${formatLocalDate(earliest)}.`;
  return null;
}

export function getInsightsPeriod(today: string, timeline: RatingDistributionTimeline, custom: CustomRange) {
  if (timeline === 'CUSTOM') {
    const error = validateCustomRange(custom, today);
    if (error) throw new Error(error);
  }
  return getRatingDistributionPeriod(today, timeline, custom);
}

export function formatLocalDate(value: string, locale?: string) {
  return parseLocalDate(value).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Shared compact-cell label: day, localized abbreviated month, year. */
export function formatDateCell(value: string, locale?: string) {
  const parts = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' })
    .formatToParts(parseLocalDate(value));
  const part = (type: 'day' | 'month' | 'year') => parts.find(item => item.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} ${part('year')}`;
}

// Android Material date pickers emit the selected calendar day as UTC midnight.
// iOS SwiftUI date pickers emit a Date in the device's local calendar.
export function dateFromPicker(value: Date, platform: 'ios' | 'android' = 'ios') {
  if (platform === 'android') return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  return localDate(value);
}

export function pickerValue(date: string, platform: 'ios' | 'android') {
  const local = parseLocalDate(date);
  return platform === 'android' ? new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate())) : local;
}
