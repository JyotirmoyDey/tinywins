import config from './config/period-comparison.json';
import { localDate, parseLocalDate, RatingScaleVersion } from '../domain/task';
import { AnalyticsEntry } from './types';
import { PeriodComparisonInput, PeriodComparisonResult, PeriodComparisonRow,
  registerAnalyticsCalculator, runAnalyticsCalculator } from './engine';

export const periodComparisonConfig = config;
if (config.id !== 'period-comparison' || config.calculator !== 'periodComparison' ||
  config.type !== 'paired-horizontal-bar' || config.section !== 'patterns' ||
  config.timeline !== 'shared' || config.calculation.previousPeriod !== 'immediately-preceding-equal-days' ||
  config.calculation.groupBy !== 'optionId' || !config.calculation.excludeMissing ||
  !config.calculation.requireCompatibleScale || config.presentation.barMaximum !== 100) {
  throw new Error('Invalid period comparison configuration.');
}

function dayCount(startDate: string, endDate: string) {
  const start = parseLocalDate(startDate), end = parseLocalDate(endDate);
  const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const count = Math.round((calendarDay(end) - calendarDay(start)) / 86_400_000) + 1;
  if (count < 1) throw new Error('Start date must be on or before end date.');
  return count;
}

export function precedingEqualPeriod(period: PeriodComparisonInput['period']) {
  const days = dayCount(period.startDate, period.endDate);
  const end = parseLocalDate(period.startDate);
  end.setDate(end.getDate() - 1);
  const start = parseLocalDate(period.startDate);
  start.setDate(start.getDate() - days);
  return { startDate: localDate(start), endDate: localDate(end), days };
}

function order(version: RatingScaleVersion) {
  return version.options.slice().sort((a, b) => a.position - b.position);
}
function identity(version: RatingScaleVersion) {
  return JSON.stringify(order(version).map(option => option.id));
}

/** Compare recorded option identities only. Missing days never enter either denominator. */
export function periodComparison(input: PeriodComparisonInput): PeriodComparisonResult {
  const days = dayCount(input.period.startDate, input.period.endDate);
  const previousPeriod = precedingEqualPeriod(input.period);
  const forPeriod = (start: string, end: string) => new Map(input.entries
    .filter(entry => entry.taskId === input.task.id && entry.localDate >= start && entry.localDate <= end)
    .map(entry => [entry.localDate, entry]));
  const currentEntries = forPeriod(input.period.startDate, input.period.endDate);
  const previousEntries = forPeriod(previousPeriod.startDate, previousPeriod.endDate);
  const current = { ...input.period, days, recordedDays: currentEntries.size };
  const previous = { ...previousPeriod, recordedDays: previousEntries.size };
  const currentEntry = days === 1 ? currentEntries.get(input.period.endDate) ?? null : null;
  const previousEntry = days === 1 ? previousEntries.get(previousPeriod.endDate) ?? null : null;
  const base = { current, previous, rows: [] as PeriodComparisonRow[], currentEntry, previousEntry };
  if (!currentEntries.size && !previousEntries.size) return { ...base, status: 'no-data' };
  if (!currentEntries.size) return { ...base, status: 'empty-current' };
  if (!previousEntries.size) return { ...base, status: 'empty-previous' };

  const entries = [...previousEntries.values(), ...currentEntries.values()];
  const versions = new Map(input.versions.filter(version => version.taskId === input.task.id)
    .map(version => [version.id, version]));
  const firstVersion = versions.get(entries[0].scaleVersionIdAtEntry);
  if (!firstVersion || !firstVersion.options.length) return { ...base, status: 'incompatible' };
  const scaleIdentity = identity(firstVersion);
  const epoch = entries[0].trendEpochIdAtEntry;
  const compatible = entries.every(entry => {
    const version = versions.get(entry.scaleVersionIdAtEntry);
    return version?.trendEpochId === epoch && entry.trendEpochIdAtEntry === epoch &&
      identity(version) === scaleIdentity && version.options.some(option => option.id === entry.optionId);
  });
  if (!compatible) return { ...base, status: 'incompatible' };

  const latestVersion = versions.get([...currentEntries.values()].at(-1)!.scaleVersionIdAtEntry)!;
  const savedOptions = order(latestVersion);
  const currentOptions = input.task.options.slice().sort((a, b) => a.position - b.position);
  const labels = JSON.stringify(currentOptions.map(option => option.id)) === scaleIdentity
    ? new Map(currentOptions.map(option => [option.id, option.label]))
    : new Map(savedOptions.map(option => [option.id, option.label]));
  const counts = (values: Iterable<AnalyticsEntry>) => {
    const result = new Map<string, number>();
    for (const entry of values) result.set(entry.optionId, (result.get(entry.optionId) ?? 0) + 1);
    return result;
  };
  const currentCounts = counts(currentEntries.values());
  const previousCounts = counts(previousEntries.values());
  const rows = savedOptions.map(option => {
    const currentCount = currentCounts.get(option.id) ?? 0;
    const previousCount = previousCounts.get(option.id) ?? 0;
    return { optionId: option.id, label: labels.get(option.id) ?? option.label,
      position: option.position, currentCount, previousCount,
      currentPercentage: currentCount / current.recordedDays * 100,
      previousPercentage: previousCount / previous.recordedDays * 100 };
  });
  return { ...base, status: 'ready', rows };
}

registerAnalyticsCalculator('periodComparison', periodComparison);
export function getPeriodComparison(input: PeriodComparisonInput) {
  return runAnalyticsCalculator('periodComparison', input);
}
