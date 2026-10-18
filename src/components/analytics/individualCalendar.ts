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

/** Current choices retain their configured order; retired recorded choices use their saved position. */
export function calendarLevels(task: AnalyticsTask, monthEntries: AnalyticsEntry[]): CalendarLevel[] {
  const levels: CalendarLevel[] = task.options.slice().sort((a, b) => a.position - b.position)
    .map(option => ({ id: option.id, label: option.label, active: true }));
  // Retired choices are retained by entry snapshots, including their saved order.
  for (const entry of monthEntries) {
    if (levels.some(level => level.id === entry.optionId)) continue;
    const position = Math.max(0, Math.min(levels.length, entry.positionAtEntry - 1));
    levels.splice(position, 0, { id: entry.optionId, label: entry.optionLabelAtEntry, active: false });
  }
  return levels;
}

export function individualCalendarData(task: AnalyticsTask, entries: AnalyticsEntry[], month: string) {
  const monthEntries = entries.filter(entry => entry.taskId === task.id && entry.localDate.startsWith(month + '-'))
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  const byDate = new Map(monthEntries.map(entry => [entry.localDate, entry]));
  const [year, monthNumber] = month.split('-').map(Number);
  const dayCount = new Date(year, monthNumber, 0, 12).getDate();
  const cells: IndividualCalendarCell[] = Array.from({ length: dayCount }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    const entry = byDate.get(date);
    if (!entry) return { date };
    const scaleSize = Math.max(task.options.length, entry.positionAtEntry, 2);
    const position = Math.max(0, Math.min(scaleSize - 1, entry.positionAtEntry - 1));
    return { date, optionId: entry.optionId, label: entry.optionLabelAtEntry,
      shade: sliderColor(position, Math.max(2, scaleSize)),
      useLightText: position / Math.max(1, scaleSize - 1) >= 0.6 };
  });
  return { levels: calendarLevels(task, monthEntries), cells };
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
