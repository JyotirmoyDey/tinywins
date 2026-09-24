import { localDate, parseLocalDate } from '../../domain/task';

export interface AxisTick {
  index: number;
  label: string;
  x: number;
  left: number;
  right: number;
  anchor: 'start' | 'middle' | 'end';
}

function tick(index: number, label: string, count: number, width: number, inset: number): AxisTick {
  const rawX = count <= 1 ? width / 2 : inset + index / (count - 1) * (width - inset * 2);
  const labelWidth = Math.max(14, label.length * 6.2 + 2);
  const anchor = rawX < labelWidth / 2 + 2 ? 'start' :
    rawX > width - labelWidth / 2 - 2 ? 'end' : 'middle';
  const left = anchor === 'start' ? rawX : anchor === 'end' ? rawX - labelWidth : rawX - labelWidth / 2;
  return { index, label, x: rawX, left, right: left + labelWidth, anchor };
}

function nonOverlapping(candidates: AxisTick[], maximum: number, gap = 8): AxisTick[] {
  const selected: AxisTick[] = [];
  const priority = candidates.length < 3 ? candidates :
    [candidates[0], candidates[candidates.length - 1], ...candidates.slice(1, -1)];
  for (const candidate of priority) {
    if (selected.length >= maximum) break;
    if (selected.every(other => candidate.right + gap <= other.left || other.right + gap <= candidate.left))
      selected.push(candidate);
  }
  return selected.sort((a, b) => a.index - b.index);
}

/** Labels follow calendar positions; a collision removes a label, never a daily observation. */
export function dailyAxisTicks(dates: string[], width: number, inset: number, maximum: number): AxisTick[] {
  if (!dates.length || width <= 0) return [];
  const short = dates.length <= 7;
  const available = Math.max(1, width - inset * 2);
  const narrowWeek = short && available / Math.max(1, dates.length - 1) < 27;
  const indices = short ? dates.map((_, index) => index) :
    Array.from({ length: Math.min(maximum, dates.length) }, (_, index) =>
      Math.round(index * (dates.length - 1) / Math.max(1, Math.min(maximum, dates.length) - 1)));
  const candidates = [...new Set(indices)].map(index => {
    const date = parseLocalDate(dates[index]);
    const label = short ? date.toLocaleDateString(undefined, { weekday: narrowWeek ? 'narrow' : 'short' }) :
      date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return tick(index, label, dates.length, width, inset);
  });
  return nonOverlapping(candidates, short ? dates.length : maximum, short ? 3 : 8);
}

/** At most one label per calendar month, limited by both count and actual plotted width. */
export function weeklyMonthTicks(weeks: string[], firstDay: string, lastDay: string,
  width: number, inset: number, maximum: number): AxisTick[] {
  if (!weeks.length || width <= 0) return [];
  const first = parseLocalDate(firstDay), last = parseLocalDate(lastDay);
  const weekIndex = new Map(weeks.map((week, index) => [week, index]));
  const candidates: AxisTick[] = [];
  for (const month = new Date(first.getFullYear(), first.getMonth(), 1, 12);
    month <= last; month.setMonth(month.getMonth() + 1)) {
    const firstInMonth = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const visible = firstInMonth < first ? first : firstInMonth;
    const monday = new Date(visible);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    const index = weekIndex.get(localDate(monday));
    if (index === undefined || candidates.some(item => item.index === index)) continue;
    const label = visible.toLocaleDateString(undefined, { month: 'short' });
    candidates.push(tick(index, label, weeks.length, width, inset));
  }
  return nonOverlapping(candidates, Math.min(maximum, Math.max(1, Math.floor(width / 42))));
}
