import config from './config/period-comparison.json';
import { localDate, parseLocalDate } from '../domain/task';
import { AnalyticsEntry } from './types';
import { getHistoricalLevels } from './ratingTrend';
import { PeriodComparisonInput, PeriodComparisonResult, PeriodComparisonRow,
  registerAnalyticsCalculator, runAnalyticsCalculator } from './engine';

export const periodComparisonConfig = config;
if (config.id !== 'period-comparison' || config.calculator !== 'periodComparison' ||
  config.type !== 'paired-horizontal-bar' || config.section !== 'patterns' ||
  config.timeline !== 'shared' || config.calculation.previousPeriod !== 'immediately-preceding-equal-days' ||
  config.calculation.groupBy !== 'optionId' || !config.calculation.excludeMissing ||
  config.presentation.barMaximum !== 100) {
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
  const levels = getHistoricalLevels(input.task, entries);
  const counts = (values: Iterable<AnalyticsEntry>) => {
    const result = new Map<string, number>();
    for (const entry of values) result.set(entry.optionId, (result.get(entry.optionId) ?? 0) + 1);
    return result;
  };
  const currentCounts = counts(currentEntries.values());
  const previousCounts = counts(previousEntries.values());
  const rows = levels.map((option, index) => {
    const currentCount = currentCounts.get(option.id) ?? 0;
    const previousCount = previousCounts.get(option.id) ?? 0;
    return { optionId: option.id, label: option.label,
      position: index + 1, currentCount, previousCount,
      currentPercentage: currentCount / current.recordedDays * 100,
      previousPercentage: previousCount / previous.recordedDays * 100 };
  });
  return { ...base, status: 'ready', rows };
}

registerAnalyticsCalculator('periodComparison', periodComparison);
export function getPeriodComparison(input: PeriodComparisonInput) {
  return runAnalyticsCalculator('periodComparison', input);
}
