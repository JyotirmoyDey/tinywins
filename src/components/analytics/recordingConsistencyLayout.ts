import { RecordingConsistencyGroup, RecordingConsistencyResult } from '../../analytics/engine';
import { parseLocalDate } from '../../domain/task';

export type ConsistencyTick = { index: number; label: string; left: number; width: number };

export function consistencyDateTicks(groups: RecordingConsistencyGroup[], width: number,
  mode: RecordingConsistencyResult['mode'], maxLabels: number, minGap: number): ConsistencyTick[] {
  if (!groups.length || width <= 0 || mode === 'status') return [];
  const labelWidth = Math.min(58, width);
  const label = (group: RecordingConsistencyGroup) => {
    const date = parseLocalDate(group.startDate);
    return mode === 'daily' ? date.toLocaleDateString(undefined, { weekday: 'narrow' }) :
      mode === 'monthly' ? date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) :
        date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  if (mode === 'daily') return groups.map((group, index) => ({
    index, label: label(group), left: index * width / groups.length,
    width: width / groups.length,
  }));
  const limit = Math.max(1, Math.min(maxLabels, Math.floor((width + 8) / (labelWidth + minGap))));
  const candidates = limit === 1 ? [groups.length - 1] : Array.from({ length: limit }, (_, index) =>
    Math.round(index * (groups.length - 1) / (limit - 1)));
  const ticks: ConsistencyTick[] = [];
  for (const index of [...new Set(candidates)]) {
    const center = (index + 0.5) * width / groups.length;
    const left = Math.max(0, Math.min(width - labelWidth, center - labelWidth / 2));
    if (ticks.length && left < ticks[ticks.length - 1].left + labelWidth + 7) continue;
    ticks.push({ index, label: label(groups[index]), left, width: labelWidth });
  }
  return ticks;
}
