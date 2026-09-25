import { localDate, parseLocalDate } from '../domain/task';
import { RatingTrendData, TrendObservation, ratingTrendConfig } from './ratingTrend';

export type TrendPresentation = 'empty' | 'today' | 'sparse' | 'daily-line' | 'weekly';
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
  slots: TrendGroupSlot[];
  groupedPoints: GroupedTrendPoint[];
  subtitle: string;
  mixedScaleSlots: number;
}
export interface TrendGroupSlot {
  startDate: string;
  endDate: string;
  axisDate: string;
}
export interface GroupedTrendPoint {
  id: string;
  slotIndex: number;
  medianLevelIndex: number;
  medianLabel: string;
  scaleVersionId: string;
  recordedCount: number;
  connectsToPrevious: boolean;
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

function portraitGroups(dates: string[]): { slots: TrendGroupSlot[]; subtitle: string; weekly: boolean } {
  if (!dates.length) return { slots: [], subtitle: 'Daily trend', weekly: false };
  const p = ratingTrendConfig.presentation;
  if (dates.length <= p.dayGroupingMaxDays) {
    const span = dates.length <= p.shortRangeMaxDays ? 1 :
      Math.ceil(dates.length / p.maxPortraitPoints);
    const slots = Array.from({ length: Math.ceil(dates.length / span) }, (_, index) => {
      const startDate = dates[index * span];
      return { startDate, axisDate: startDate,
        endDate: dates[Math.min(dates.length - 1, (index + 1) * span - 1)] };
    });
    return { slots, subtitle: span === 1 ? 'Daily trend' : `${span}-day median`, weekly: false };
  }
  const weeks = [...new Set(dates.map(mondayOf))];
  let span = 1;
  while (Math.ceil(weeks.length / span) > p.maxPortraitPoints) span *= 2;
  const slots = Array.from({ length: Math.ceil(weeks.length / span) }, (_, index) => {
    const firstWeek = weeks[index * span];
    const lastWeek = weeks[Math.min(weeks.length - 1, (index + 1) * span - 1)];
    return { axisDate: firstWeek,
      startDate: index === 0 ? dates[0] : firstWeek,
      endDate: index === Math.ceil(weeks.length / span) - 1 ? dates.at(-1)! : sundayOf(lastWeek) };
  });
  return { slots, subtitle: span === 1 ? 'Weekly median' : `${span}-week median`, weekly: true };
}

/** Only compatible scale versions may contribute to one median. Mixed-version
 * buckets remain blank in portrait; expanded daily history retains every entry. */
function groupedMedians(data: RatingTrendData, slots: TrendGroupSlot[]) {
  const groupedPoints: GroupedTrendPoint[] = [];
  let mixedScaleSlots = 0;
  let observationIndex = 0;
  slots.forEach((slot, slotIndex) => {
    const observations: TrendObservation[] = [];
    while (observationIndex < data.observations.length &&
      data.observations[observationIndex].date < slot.startDate) observationIndex++;
    while (observationIndex < data.observations.length &&
      data.observations[observationIndex].date <= slot.endDate)
      observations.push(data.observations[observationIndex++]);
    if (!observations.length) return;
    const versions = new Set(observations.map(item => item.scaleVersionId));
    if (versions.size !== 1) { mixedScaleSlots++; return; }
    const ordered = observations.map(item => item.levelIndex).sort((a, b) => a - b);
    const medianLevelIndex = ordered[Math.floor((ordered.length - 1) / 2)];
    const scaleVersionId = observations[0].scaleVersionId;
    const previous = groupedPoints.at(-1);
    groupedPoints.push({ id: `${slot.axisDate}:${scaleVersionId}`, slotIndex,
      medianLevelIndex, medianLabel: data.levels[medianLevelIndex]?.label ?? observations[0].labelAtEntry,
      scaleVersionId, recordedCount: observations.length,
      connectsToPrevious: !!previous && previous.slotIndex === slotIndex - 1 &&
        previous.scaleVersionId === scaleVersionId });
  });
  return { groupedPoints, mixedScaleSlots };
}

export function getAdaptiveTrend(data: RatingTrendData, range: TrendRange): AdaptiveTrend {
  const recordedCount = data.observations.length;
  const p = ratingTrendConfig.presentation;
  const groups = portraitGroups(data.dates);
  const medians = groupedMedians(data, groups.slots);
  let presentation: TrendPresentation;
  if (recordedCount === 0) presentation = 'empty';
  else if (range === '1D') presentation = 'today';
  else if (recordedCount <= p.sparseMaxObservations) presentation = 'sparse';
  else if (!groups.weekly) presentation = 'daily-line';
  else presentation = 'weekly';
  const weekly = presentation === 'weekly' ? getWeeklyRatingTrend(data) : { weeks: [], weeklyPoints: [] };
  return { presentation, recordedCount, ...weekly, ...groups, ...medians };
}
