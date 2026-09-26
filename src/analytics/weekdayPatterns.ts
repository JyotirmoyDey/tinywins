import config from './config/weekday-patterns.json';
import { parseLocalDate } from '../domain/task';
import { AnalyticsEntry } from './types';
import { WeekdayPatternLevel, WeekdayPatternsInput, WeekdayPatternsResult,
  registerAnalyticsCalculator, runAnalyticsCalculator } from './engine';

export const weekdayPatternsConfig = config;
if (config.id !== 'weekday-patterns' || config.calculator !== 'weekdayPatterns' ||
  config.type !== 'weekday-rating-heatmap' || config.section !== 'patterns' ||
  config.timeline !== 'shared' || config.calculation.groupBy !== 'optionId' ||
  config.calculation.denominator !== 'recorded-weekday-entries' ||
  config.calculation.weekStartsOn !== 'monday' || !config.calculation.excludeMissing ||
  config.calculation.trendEpoch !== 'current' || config.calculation.limitedSampleBelow < 1 ||
  config.presentation.minimumCellWidth < 44) {
  throw new Error('Invalid weekday patterns configuration.');
}

const weekdayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ordered = (options: { id: string; label: string; position: number }[]) =>
  options.slice().sort((a, b) => a.position - b.position);

function levelsFor(input: WeekdayPatternsInput, entries: AnalyticsEntry[]): WeekdayPatternLevel[] {
  const active = ordered(input.task.options);
  const levels: WeekdayPatternLevel[] = active.map(option =>
    ({ id: option.id, label: option.label, active: true }));
  const referenced = new Set(entries.map(entry => entry.optionId));
  const versions = input.versions.filter(version => version.taskId === input.task.id &&
    version.trendEpochId === input.task.currentTrendEpochId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const version of versions) {
    const options = ordered(version.options);
    options.forEach((option, index) => {
      if (!referenced.has(option.id) || levels.some(level => level.id === option.id)) return;
      const before = options.slice(0, index).reverse().find(candidate =>
        levels.some(level => level.id === candidate.id));
      const after = options.slice(index + 1).find(candidate =>
        levels.some(level => level.id === candidate.id));
      const insertion = before ? levels.findIndex(level => level.id === before.id) + 1 :
        after ? levels.findIndex(level => level.id === after.id) : levels.length;
      levels.splice(insertion, 0, { id: option.id, label: option.label, active: false });
    });
  }
  // Legacy imports can have a saved level identity without a recoverable version.
  for (const entry of entries) {
    if (levels.some(level => level.id === entry.optionId)) continue;
    const insertion = Math.max(0, Math.min(levels.length, entry.positionAtEntry - 1));
    levels.splice(insertion, 0, { id: entry.optionId, label: entry.optionLabelAtEntry, active: false });
  }
  return levels;
}

function isCompatibleOrder(optionIds: string[], union: WeekdayPatternLevel[]) {
  const positions = new Map(union.map((level, index) => [level.id, index]));
  let previous = -1;
  for (const id of optionIds) {
    const position = positions.get(id);
    if (position === undefined || position <= previous) return false;
    previous = position;
  }
  return true;
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
  const epochEntries = inRange.filter(entry =>
    entry.trendEpochIdAtEntry === input.task.currentTrendEpochId);
  const levels = levelsFor(input, epochEntries);
  const versions = new Map(input.versions.filter(version => version.taskId === input.task.id)
    .map(version => [version.id, version]));
  const compatible = epochEntries.filter(entry => {
    const version = versions.get(entry.scaleVersionIdAtEntry);
    if (!version) return levels.some(level => level.id === entry.optionId);
    return version.trendEpochId === input.task.currentTrendEpochId &&
      isCompatibleOrder(ordered(version.options).map(option => option.id), levels);
  });
  const compatibleIds = new Set(compatible.map(entry => entry.id));
  const includedLevels = levelsFor(input, compatible);
  const rows = weekdayLabels.map((label, weekday) => {
    const observations = compatible.filter(entry =>
      (parseLocalDate(entry.localDate).getDay() + 6) % 7 === weekday);
    const total = observations.length;
    return { weekday, label, total, cells: includedLevels.map(level => {
      const selected = observations.filter(entry => entry.optionId === level.id);
      return { optionId: level.id, label: level.label, count: selected.length,
        percentage: total ? selected.length / total * 100 : null,
        historicalLabels: [...new Set(selected.map(entry => entry.optionLabelAtEntry))] };
    }) };
  });
  const excludedHistoryCount = inRange.length - compatibleIds.size;
  const status = input.timeline === '1D' ? 'today' : duration === 1 ? 'single-day' :
    input.timeline === '7D' || duration <= config.presentation.shortRangeMaxDays ?
      'insufficient-range' : compatible.length ? 'ready' : 'no-data';
  return { status, levels: includedLevels, rows, recordedCount: compatible.length,
    excludedHistoryCount, limitedSample: compatible.length < config.calculation.limitedSampleBelow,
    singleDayEntry: status === 'today' || status === 'single-day'
      ? inRange.find(entry => entry.localDate === input.period.endDate) ?? null : null,
    singleDate: status === 'today' || status === 'single-day' ? input.period.endDate : null };
}

registerAnalyticsCalculator('weekdayPatterns', weekdayPatterns);
export function getWeekdayPatterns(input: WeekdayPatternsInput) {
  return runAnalyticsCalculator('weekdayPatterns', input);
}
