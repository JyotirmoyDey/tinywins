import config from './config/rating-trend.json';
import { localDate, parseLocalDate } from '../domain/task';
import { AnalyticsEntry, AnalyticsTask } from './types';

export interface TrendPeriod { startDate: string; endDate: string }
export interface TrendLevel { id: string; label: string; active: boolean }
export interface TrendObservation {
  date: string; optionId: string; labelAtEntry: string;
  levelIndex: number; connectsToPrevious: boolean;
}
export interface RatingTrendData {
  dates: string[]; levels: TrendLevel[]; observations: TrendObservation[];
}
export interface RatingTrendInput {
  task: AnalyticsTask; entries: AnalyticsEntry[]; period: TrendPeriod;
}
export const ratingTrendConfig = config;
export function validateRatingTrendConfig(value: typeof config) {
  if (value.id !== 'rating-trend' || value.calculator !== 'ratingTrend' ||
    value.type !== 'adaptive-categorical' || value.timeline !== 'shared' ||
    value.calculation.categoryIdentity !== 'optionId' || !value.calculation.excludeMissing ||
    !value.calculation.connectConsecutiveDaysOnly ||
    !value.visible || value.displayOrder !== 1 ||
    value.calculation.weekStartsOn !== 'monday' || value.calculation.weeklyMiddle !== 'lower' ||
    value.presentation.sparseMaxObservations !== 1 ||
    value.presentation.maxPortraitPoints < 2 || value.presentation.maxPortraitPoints > 15 ||
    value.presentation.shortRangeMaxDays > value.presentation.maxPortraitPoints ||
    value.presentation.dayGroupingMaxDays < value.presentation.shortRangeMaxDays ||
    value.presentation.weekGroupingMinDays !== value.presentation.dayGroupingMaxDays + 1 ||
    value.presentation.normalChartHeight < 140 ||
    value.presentation.maxExpandedPlotDays < value.presentation.weekGroupingMinDays ||
    value.presentation.weeklyLabelSpacing < 50 ||
    value.presentation.plotInset < 8 ||
    value.presentation.axisMaxWidthCompact < 48 ||
    value.presentation.expandedInitialWindowDays < 3 ||
    value.style.transitionDurationMs < 0 ||
    !['monotoneX', 'linear'].includes(value.style.curve) ||
    value.style.lineWidth <= 0 ||
    value.style.isolatedFragmentLength <= 0 ||
    value.style.isolatedFragmentLength >= value.presentation.plotInset) throw new Error('Invalid rating trend configuration.');
  return value;
}
validateRatingTrendConfig(config);

function calendarDates(period: TrendPeriod) {
  const start = parseLocalDate(period.startDate), end = parseLocalDate(period.endDate);
  if (start > end) throw new Error('Start date must be on or before end date.');
  const dates: string[] = [];
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) dates.push(localDate(day));
  return dates;
}
export function getHistoricalLevels(task: AnalyticsTask, relevant: AnalyticsEntry[]): TrendLevel[] {
  const active = task.options.slice().sort((a, b) => a.position - b.position);
  const levels: TrendLevel[] = active.map(option => ({ id: option.id, label: option.label, active: true }));
  // Retired choices with history remain represented by the immutable entry snapshot.
  for (const entry of relevant) {
    if (levels.some(level => level.id === entry.optionId)) continue;
    const position = Math.max(0, Math.min(levels.length, entry.positionAtEntry - 1));
    levels.splice(position, 0, { id: entry.optionId, label: entry.optionLabelAtEntry, active: false });
  }
  return levels;
}
export function ratingTrend(input: RatingTrendInput): RatingTrendData {
  const dates = calendarDates(input.period);
  const dateSet = new Set(dates);
  const relevant = input.entries.filter(entry => entry.taskId === input.task.id &&
    dateSet.has(entry.localDate))
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  const levels = getHistoricalLevels(input.task, relevant);
  const byDate = new Map(relevant.map(entry => [entry.localDate, entry]));
  const observations: TrendObservation[] = [];
  dates.forEach((date, index) => {
    const entry = byDate.get(date);
    if (!entry) return;
    const previous = index > 0 ? byDate.get(dates[index - 1]) : undefined;
    observations.push({ date, optionId: entry.optionId, labelAtEntry: entry.optionLabelAtEntry,
      levelIndex: levels.findIndex(level => level.id === entry.optionId),
      connectsToPrevious: !!previous });
  });
  return { dates, levels, observations };
}
type Calculator = (input: RatingTrendInput) => RatingTrendData;
const calculators: Record<string, Calculator> = { ratingTrend };
export function runTrendCalculator(name: string, input: RatingTrendInput) {
  const calculator = calculators[name];
  if (!calculator) throw new Error(`Unknown trend calculator: ${name}`);
  return calculator(input);
}
export function getRatingTrend(input: RatingTrendInput) {
  return runTrendCalculator(ratingTrendConfig.calculator, input);
}
