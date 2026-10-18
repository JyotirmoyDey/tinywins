import config from './config/weekday-patterns.json';
import { parseLocalDate } from '../domain/task';
import { AnalyticsEntry } from './types';
import { getHistoricalLevels } from './ratingTrend';
import { WeekdayPatternLevel, WeekdayPatternsInput, WeekdayPatternsResult,
  registerAnalyticsCalculator, runAnalyticsCalculator } from './engine';

export const weekdayPatternsConfig = config;
if (config.id !== 'weekday-patterns' || config.calculator !== 'weekdayPatterns' ||
  config.type !== 'weekday-rating-heatmap' || config.section !== 'patterns' ||
  config.timeline !== 'shared' || config.calculation.groupBy !== 'optionId' ||
  config.calculation.denominator !== 'recorded-weekday-entries' ||
  config.calculation.weekStartsOn !== 'monday' || !config.calculation.excludeMissing ||
  config.calculation.limitedSampleBelow < 1 ||
  config.presentation.minimumCellWidth < 44) {
  throw new Error('Invalid weekday patterns configuration.');
}

const weekdayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function levelsFor(input: WeekdayPatternsInput, entries: AnalyticsEntry[]): WeekdayPatternLevel[] {
  return getHistoricalLevels(input.task, entries);
}

/** Counts historical option identities, never current weights or label-derived meaning. */
export function weekdayPatterns(input: WeekdayPatternsInput): WeekdayPatternsResult {
  const start = parseLocalDate(input.period.startDate);
  const end = parseLocalDate(input.period.endDate);
  if (start > end) throw new Error('Start date must be on or before end date.');
  const duration = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000) + 1;
  const inRange = input.entries.filter(entry => entry.taskId === input.task.id &&
    entry.localDate >= input.period.startDate && entry.localDate <= input.period.endDate);
  const includedLevels = levelsFor(input, inRange);
  const rows = weekdayLabels.map((label, weekday) => {
    const observations = inRange.filter(entry =>
      (parseLocalDate(entry.localDate).getDay() + 6) % 7 === weekday);
    const total = observations.length;
    return { weekday, label, total, cells: includedLevels.map(level => {
      const selected = observations.filter(entry => entry.optionId === level.id);
      return { optionId: level.id, label: level.label, count: selected.length,
        percentage: total ? selected.length / total * 100 : null,
        historicalLabels: [...new Set(selected.map(entry => entry.optionLabelAtEntry))] };
    }) };
  });
  const status = input.timeline === '1D' ? 'today' : duration === 1 ? 'single-day' :
    input.timeline === '7D' || duration <= config.presentation.shortRangeMaxDays ?
      'insufficient-range' : inRange.length ? 'ready' : 'no-data';
  return { status, levels: includedLevels, rows, recordedCount: inRange.length,
    limitedSample: inRange.length < config.calculation.limitedSampleBelow,
    singleDayEntry: status === 'today' || status === 'single-day'
      ? inRange.find(entry => entry.localDate === input.period.endDate) ?? null : null,
    singleDate: status === 'today' || status === 'single-day' ? input.period.endDate : null };
}

registerAnalyticsCalculator('weekdayPatterns', weekdayPatterns);
export function getWeekdayPatterns(input: WeekdayPatternsInput) {
  return runAnalyticsCalculator('weekdayPatterns', input);
}
