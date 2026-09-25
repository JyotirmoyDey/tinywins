import type { RatingScaleVersion } from '../../domain/task';
import type { AnalyticsEntry, AnalyticsTask } from '../../analytics/types';
import { sliderColor } from '../sliderMath';

export type CalendarLevel = { id: string; label: string; active: boolean };
export type IndividualCalendarCell = {
  date: string;
  optionId?: string;
  label?: string;
  shade?: string;
  useLightText?: boolean;
};

/** Current choices retain their configured order; retired choices are inserted beside
 * their historical neighbors only when they have a recording in this month. */
export function calendarLevels(task: AnalyticsTask, monthEntries: AnalyticsEntry[], versions: RatingScaleVersion[]): CalendarLevel[] {
  const levels: CalendarLevel[] = task.options.slice().sort((a, b) => a.position - b.position)
    .map(option => ({ id: option.id, label: option.label, active: true }));
  const recordedIds = new Set(monthEntries.map(entry => entry.optionId));
  const entryById = new Map(monthEntries.map(entry => [entry.optionId, entry]));
  const historical = versions.filter(version => version.taskId === task.id)
    .slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const version of historical) {
    const ordered = version.options.slice().sort((a, b) => a.position - b.position);
    for (let index = 0; index < ordered.length; index++) {
      const option = ordered[index];
      if (!recordedIds.has(option.id) || levels.some(level => level.id === option.id)) continue;
      const before = ordered.slice(0, index).reverse().find(item => levels.some(level => level.id === item.id));
      const after = ordered.slice(index + 1).find(item => levels.some(level => level.id === item.id));
      const insertAt = before ? levels.findIndex(level => level.id === before.id) + 1 :
        after ? levels.findIndex(level => level.id === after.id) : levels.length;
      levels.splice(insertAt, 0, { id: option.id,
        label: entryById.get(option.id)?.optionLabelAtEntry ?? option.label, active: false });
    }
  }
  // Imported legacy entries may predate version snapshots. Their saved IDs,
  // positions and labels are still enough to expose a filter.
  for (const entry of monthEntries) {
    if (levels.some(level => level.id === entry.optionId)) continue;
    const position = Math.max(0, Math.min(levels.length, entry.positionAtEntry - 1));
    levels.splice(position, 0, { id: entry.optionId, label: entry.optionLabelAtEntry, active: false });
  }
  return levels;
}

export function individualCalendarData(task: AnalyticsTask, entries: AnalyticsEntry[], versions: RatingScaleVersion[], month: string) {
  const monthEntries = entries.filter(entry => entry.taskId === task.id && entry.localDate.startsWith(month + '-'))
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  const byDate = new Map(monthEntries.map(entry => [entry.localDate, entry]));
  const versionById = new Map(versions.map(version => [version.id, version]));
  const [year, monthNumber] = month.split('-').map(Number);
  const dayCount = new Date(year, monthNumber, 0, 12).getDate();
  const cells: IndividualCalendarCell[] = Array.from({ length: dayCount }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    const entry = byDate.get(date);
    if (!entry) return { date };
    const scaleSize = versionById.get(entry.scaleVersionIdAtEntry)?.options.length ??
      Math.max(task.options.length, entry.positionAtEntry, 2);
    const position = Math.max(0, Math.min(scaleSize - 1, entry.positionAtEntry - 1));
    return { date, optionId: entry.optionId, label: entry.optionLabelAtEntry,
      shade: sliderColor(position, Math.max(2, scaleSize)),
      useLightText: position / Math.max(1, scaleSize - 1) >= 0.6 };
  });
  return { levels: calendarLevels(task, monthEntries, versions), cells };
}

/** null means the dynamic All selection, including levels appearing in later months. */
export function matchesCalendarFilter(cell: IndividualCalendarCell, selectedIds: ReadonlySet<string> | null) {
  return !!cell.optionId && (selectedIds === null || selectedIds.has(cell.optionId));
}

export function matchingDateCount(cells: IndividualCalendarCell[], selectedIds: ReadonlySet<string> | null) {
  return new Set(cells.filter(cell => matchesCalendarFilter(cell, selectedIds)).map(cell => cell.date)).size;
}

export function toggleCalendarLevel(selectedIds: ReadonlySet<string> | null, levelId: string, availableIds: string[]) {
  const next = new Set(selectedIds ?? availableIds);
  if (next.has(levelId)) next.delete(levelId); else next.add(levelId);
  return next.size === availableIds.length && availableIds.every(id => next.has(id)) ? null : next;
}
