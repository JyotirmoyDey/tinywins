import { localDate, parseLocalDate } from '../domain/task';
import { RatingTrendData, TrendObservation, ratingTrendConfig } from './ratingTrend';

export type TrendPresentation = 'empty' | 'today' | 'sparse' | 'daily-line' | 'daily-dots' | 'weekly';
export type TrendRange = '1D' | '7D' | '30D' | '90D' | 'CUSTOM';

export interface WeeklyTrendPoint {
  id: string;
  weekStart: string;
  weekEnd: string;
  scaleVersionId: string;
  groupIndex: number;
  groupsInWeek: number;
  medianLevelIndex: number;
  minLevelIndex: number;
  maxLevelIndex: number;
  medianLabel: string;
  minLabel: string;
  maxLabel: string;
  observations: TrendObservation[];
  distribution: { optionId: string; label: string; count: number }[];
  connectsToPrevious: boolean;
}
export interface AdaptiveTrend {
  presentation: TrendPresentation;
  recordedCount: number;
  weeks: string[];
  weeklyPoints: WeeklyTrendPoint[];
}
export function mondayOf(date: string) {
  const day = parseLocalDate(date);
  day.setDate(day.getDate() - (day.getDay() + 6) % 7);
  return localDate(day);
}
function sundayOf(monday: string) {
  const day = parseLocalDate(monday);
  day.setDate(day.getDate() + 6);
  return localDate(day);
}
function nextWeek(monday: string) {
  const day = parseLocalDate(monday);
  day.setDate(day.getDate() + 7);
  return localDate(day);
}

/** Every week occupies one slot, including weeks with no entries. Scale versions
 * within a week form separate points so no median combines incompatible scales. */
export function getWeeklyRatingTrend(data: RatingTrendData) {
  const weeks = [...new Set(data.dates.map(mondayOf))];
  const byWeek = new Map<string, TrendObservation[]>();
  for (const observation of data.observations) {
    const week = mondayOf(observation.date);
    const entries = byWeek.get(week) ?? [];
    if (!byWeek.has(week)) byWeek.set(week, entries);
    entries.push(observation);
  }
  const weeklyPoints: WeeklyTrendPoint[] = [];
  for (const weekStart of weeks) {
    // Split chronological runs. An explicitly edited older day can introduce
    // a newer scale between two older-scale observations in the same week.
    const groups: [string, TrendObservation[]][] = [];
    for (const observation of byWeek.get(weekStart) ?? []) {
      const last = groups.at(-1);
      if (last?.[0] === observation.scaleVersionId) last[1].push(observation);
      else groups.push([observation.scaleVersionId, [observation]]);
    }
    groups.forEach(([scaleVersionId, observations], groupIndex) => {
      const ordered = observations.map(item => item.levelIndex).sort((a, b) => a - b);
      const medianLevelIndex = ordered[Math.floor((ordered.length - 1) / 2)];
      const minLevelIndex = ordered[0], maxLevelIndex = ordered[ordered.length - 1];
      const counts = new Map<string, { optionId: string; label: string; count: number }>();
      for (const observation of observations) {
        const existing = counts.get(observation.optionId);
        if (existing) existing.count++;
        else counts.set(observation.optionId, { optionId: observation.optionId,
          label: data.levels[observation.levelIndex]?.label ?? observation.labelAtEntry, count: 1 });
      }
      const previous = weeklyPoints.at(-1);
      const connectsToPrevious = !!previous && previous.weekStart !== weekStart &&
        nextWeek(previous.weekStart) === weekStart &&
        previous.scaleVersionId === scaleVersionId &&
        previous.groupIndex === previous.groupsInWeek - 1 && groupIndex === 0;
      weeklyPoints.push({
        id: `${weekStart}:${scaleVersionId}:${groupIndex}`, weekStart, weekEnd: sundayOf(weekStart),
        scaleVersionId, groupIndex, groupsInWeek: groups.length,
        medianLevelIndex, minLevelIndex, maxLevelIndex,
        medianLabel: data.levels[medianLevelIndex]?.label ?? observations[Math.floor((observations.length - 1) / 2)].labelAtEntry,
        minLabel: data.levels[minLevelIndex]?.label ?? observations[0].labelAtEntry,
        maxLabel: data.levels[maxLevelIndex]?.label ?? observations.at(-1)!.labelAtEntry,
        observations, distribution: [...counts.values()].sort((a, b) =>
          (data.levels.findIndex(level => level.id === a.optionId)) -
          (data.levels.findIndex(level => level.id === b.optionId))), connectsToPrevious,
      });
    });
  }
  return { weeks, weeklyPoints };
}

/** Prefer labels at month boundaries, with first/last context on a narrow screen. */
export function weeklyLabelIndices(weeks: string[], maximum: number) {
  if (weeks.length <= maximum) return weeks.map((_, index) => index);
  const candidates = [0, ...weeks.map((week, index) =>
    index > 0 && week.slice(0, 7) !== weeks[index - 1].slice(0, 7) ? index : -1).filter(index => index > 0), weeks.length - 1];
  const unique = [...new Set(candidates)];
  if (unique.length <= maximum) return unique;
  return [...new Set(Array.from({ length: maximum }, (_, index) =>
    unique[Math.round(index * (unique.length - 1) / Math.max(1, maximum - 1))]))];
}

export function getAdaptiveTrend(data: RatingTrendData, range: TrendRange): AdaptiveTrend {
  const recordedCount = data.observations.length;
  const p = ratingTrendConfig.presentation;
  let presentation: TrendPresentation;
  if (recordedCount === 0) presentation = 'empty';
  else if (range === '1D') presentation = 'today';
  else if (recordedCount <= p.sparseMaxObservations) presentation = 'sparse';
  else if (data.dates.length <= p.dailyLineMaxDays) presentation = 'daily-line';
  else if (data.dates.length <= p.dailyDotMaxDays) presentation = 'daily-dots';
  else presentation = 'weekly';
  const weekly = presentation === 'weekly' ? getWeeklyRatingTrend(data) : { weeks: [], weeklyPoints: [] };
  return { presentation, recordedCount, ...weekly };
}
