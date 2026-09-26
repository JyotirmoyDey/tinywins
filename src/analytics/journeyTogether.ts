import config from './config/journey-together.json';
import { AnalyticsDataset } from './types';
import { getRatingTrend, TrendPeriod } from './ratingTrend';
import { getAdaptiveTrend } from './ratingTrendPresentation';
import { colorsByTaskId, fallbackTaskColor } from './taskColors';
import { tasksRelevantToPeriod } from './insightsScope';
export { colorsByTaskId } from './taskColors';

export const journeyTogetherConfig = config;

export interface JourneyPoint {
  slotIndex: number;
  date: string;
  label: string;
  levelIndex: number;
  recordedCount: number;
  connectsToPrevious: boolean;
}
export interface JourneySeries {
  taskId: string;
  taskName: string;
  archived: boolean;
  color: string;
  levelCount: number;
  latestRating: string | null;
  points: JourneyPoint[];
}
export interface JourneyTogetherData {
  dates: string[];
  kind: 'today' | 'daily' | 'grouped';
  series: JourneySeries[];
}

export function validateJourneyTogetherConfig(value: typeof config) {
  if (value.id !== 'journey-together' || value.calculator !== 'ratingTrend' ||
    value.type !== 'categorical-small-multiples' || value.scope !== 'all' ||
    value.timeline !== 'shared' || value.presentation.initialActivities < 1 ||
    value.presentation.dailyThroughDays < 7 || value.presentation.miniPlotHeight < 40 ||
    value.style.colors.length < 10 || value.style.colors.some(color => !/^#[0-9A-Fa-f]{6}$/.test(color))) {
    throw new Error('Invalid Your Journey Together configuration.');
  }
  return value;
}
validateJourneyTogetherConfig(config);

export function visibleJourneyTasks<T>(tasks: T[], expanded: boolean): T[] {
  return expanded ? tasks : tasks.slice(0, config.presentation.initialActivities);
}

/** Each task is calculated on its own categorical axis. The only shared value is
 * the calendar slot, never a cross-task rating or normalized weight. */
export function getJourneyTogether(input: {
  dataset: AnalyticsDataset;
  period: TrendPeriod;
  colorTaskIds?: string[];
}): JourneyTogetherData {
  const { dataset, period } = input;
  const tasks = tasksRelevantToPeriod(dataset, period);
  const colorMap = colorsByTaskId(input.colorTaskIds ?? tasks.map(task => task.id));
  const results = tasks.map(task => ({ task, trend: getRatingTrend({ task, entries: dataset.entries,
    versions: dataset.scaleVersions, period }) }));
  const sharedDates = results[0]?.trend.dates ?? [];
  const isToday = sharedDates.length === 1;
  const isDaily = sharedDates.length <= config.presentation.dailyThroughDays;
  const kind = isToday ? 'today' : isDaily ? 'daily' : 'grouped';
  const firstAdaptive = kind === 'grouped' && results[0]
    ? getAdaptiveTrend(results[0].trend, 'CUSTOM') : null;
  const dates = firstAdaptive?.slots.map(slot => slot.axisDate) ?? sharedDates;
  const series = results.map(({ task, trend }): JourneySeries => {
    const points: JourneyPoint[] = kind === 'grouped'
      ? getAdaptiveTrend(trend, 'CUSTOM').groupedPoints.map(point => ({
        slotIndex: point.slotIndex, date: dates[point.slotIndex], label: point.medianLabel,
        levelIndex: point.medianLevelIndex, recordedCount: point.recordedCount,
        connectsToPrevious: point.connectsToPrevious,
      }))
      : trend.observations.map(observation => ({
        slotIndex: sharedDates.indexOf(observation.date), date: observation.date,
        label: observation.labelAtEntry, levelIndex: observation.levelIndex,
        recordedCount: 1, connectsToPrevious: observation.connectsToPrevious,
      }));
    return { taskId: task.id, taskName: task.name, archived: !task.active,
      color: task.chartColor ?? task.color ?? colorMap.get(task.id) ?? fallbackTaskColor(task.id),
      levelCount: trend.levels.length,
      latestRating: trend.observations.at(-1)?.labelAtEntry ?? null,
      points };
  });
  return { dates, kind, series };
}
