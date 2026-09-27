import config from './config/journey-together.json';
import { AnalyticsDataset } from './types';
import { getRatingTrend, TrendPeriod } from './ratingTrend';
import { getTaskTrendData, TrendRange } from './ratingTrendPresentation';
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
    value.presentation.miniPlotHeight < 40 ||
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
  range?: TrendRange;
  colorTaskIds?: string[];
}): JourneyTogetherData {
  const { dataset, period } = input;
  const tasks = tasksRelevantToPeriod(dataset, period);
  const colorMap = colorsByTaskId(input.colorTaskIds ?? tasks.map(task => task.id));
  // Existing callers that only supply dates retain the matching named preset.
  // The Insights screen always passes the user's actual selection, including Custom.
  const dayCount = tasks.length ? getRatingTrend({ task: tasks[0], entries: [],
    versions: [], period }).dates.length : 0;
  const range = input.range ?? ({ 1: '1D', 7: '7D', 30: '30D', 90: '90D' } as Record<number, TrendRange>)[dayCount] ?? 'CUSTOM';
  const results = tasks.map(task => ({ task, ...getTaskTrendData({ task, entries: dataset.entries,
    versions: dataset.scaleVersions, period }, range) }));
  // Slots depend on the shared period and range, never on a task's recordings.
  // Each activity still calculates its own medians and scale boundaries.
  const dates = results[0]?.view.slots.map(slot => slot.axisDate) ?? [];
  const kind = range === '1D' ? 'today' : results[0]?.view.slots.every(slot =>
    slot.startDate === slot.endDate) ? 'daily' : 'grouped';
  const series = results.map(({ task, trend, view }): JourneySeries => {
    const points: JourneyPoint[] = view.presentation === 'today' || view.presentation === 'sparse'
      ? trend.observations.map(observation => ({
        slotIndex: view.slots.findIndex(slot => observation.date >= slot.startDate &&
          observation.date <= slot.endDate),
        date: observation.date, label: observation.labelAtEntry,
        levelIndex: observation.levelIndex, recordedCount: 1,
        connectsToPrevious: observation.connectsToPrevious,
      })) : view.groupedPoints.map(point => ({
        slotIndex: point.slotIndex, date: view.slots[point.slotIndex].axisDate,
        label: point.medianLabel, levelIndex: point.medianLevelIndex,
        recordedCount: point.recordedCount,
        connectsToPrevious: point.connectsToPrevious,
      }));
    return { taskId: task.id, taskName: task.name, archived: !task.active,
      color: task.chartColor ?? task.color ?? colorMap.get(task.id) ?? fallbackTaskColor(task.id),
      levelCount: trend.levels.length,
      latestRating: trend.observations.at(-1)?.labelAtEntry ?? null,
      points };
  });
  return { dates, kind, series };
}
