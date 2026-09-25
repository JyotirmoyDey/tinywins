import config from './config/rating-trend.json';
import { localDate, parseLocalDate, RatingScaleVersion } from '../domain/task';
import { AnalyticsEntry, AnalyticsTask } from './types';

export interface TrendPeriod { startDate: string; endDate: string }
export interface TrendLevel { id: string; label: string; active: boolean }
export interface TrendObservation {
  date: string; optionId: string; labelAtEntry: string;
  levelIndex: number; scaleVersionId: string; connectsToPrevious: boolean;
}
export interface RatingTrendData {
  dates: string[]; levels: TrendLevel[]; observations: TrendObservation[];
  scaleChangeDates: string[]; epochId: string; isNewEpochEmpty: boolean;
}
export interface RatingTrendInput {
  task: AnalyticsTask; entries: AnalyticsEntry[]; versions: RatingScaleVersion[]; period: TrendPeriod;
}
export const ratingTrendConfig = config;
export function validateRatingTrendConfig(value: typeof config) {
  if (value.id !== 'rating-trend' || value.calculator !== 'ratingTrend' ||
    value.type !== 'adaptive-categorical' || value.timeline !== 'shared' ||
    value.calculation.categoryIdentity !== 'optionId' || !value.calculation.excludeMissing ||
    !value.calculation.connectConsecutiveDaysOnly || !value.calculation.breakOnScaleVersionChange ||
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
function buildLevels(task: AnalyticsTask, relevant: AnalyticsEntry[], versions: RatingScaleVersion[]): TrendLevel[] {
  const active = task.options.slice().sort((a, b) => a.position - b.position);
  const activeIds = new Set(active.map(option => option.id));
  const referenced = new Set(relevant.map(entry => entry.optionId));
  const levels: TrendLevel[] = active.map(option => ({ id: option.id, label: option.label, active: true }));
  const historical = versions.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const version of historical) {
    const order = version.options.slice().sort((a, b) => a.position - b.position);
    for (let i = 0; i < order.length; i++) {
      const option = order[i];
      if (activeIds.has(option.id) || !referenced.has(option.id) || levels.some(level => level.id === option.id)) continue;
      const before = order.slice(0, i).reverse().find(candidate => levels.some(level => level.id === candidate.id));
      const after = order.slice(i + 1).find(candidate => levels.some(level => level.id === candidate.id));
      const insertAt = before ? levels.findIndex(level => level.id === before.id) + 1 :
        after ? levels.findIndex(level => level.id === after.id) : levels.length;
      levels.splice(insertAt, 0, { id: option.id, label: option.label, active: false });
    }
  }
  // A migrated legacy record may refer to an option absent from the recovered
  // current configuration. Its saved identity and label remain readable.
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
  const currentEpoch = input.task.currentTrendEpochId;
  const relevant = input.entries.filter(entry => entry.taskId === input.task.id &&
    entry.trendEpochIdAtEntry === currentEpoch && dateSet.has(entry.localDate))
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  const versions = input.versions.filter(version => version.taskId === input.task.id && version.trendEpochId === currentEpoch);
  const levels = buildLevels(input.task, relevant, versions);
  const byDate = new Map(relevant.map(entry => [entry.localDate, entry]));
  const observations: TrendObservation[] = [];
  dates.forEach((date, index) => {
    const entry = byDate.get(date);
    if (!entry) return;
    const previous = index > 0 ? byDate.get(dates[index - 1]) : undefined;
    observations.push({ date, optionId: entry.optionId, labelAtEntry: entry.optionLabelAtEntry,
      levelIndex: levels.findIndex(level => level.id === entry.optionId),
      scaleVersionId: entry.scaleVersionIdAtEntry,
      connectsToPrevious: !!previous && previous.scaleVersionIdAtEntry === entry.scaleVersionIdAtEntry });
  });
  const scaleChangeDates = versions.filter(version => version.id !== versions[0]?.id &&
    dateSet.has(version.effectiveLocalDate)).map(version => version.effectiveLocalDate);
  const hasPriorEpoch = input.versions.some(version => version.taskId === input.task.id && version.trendEpochId !== currentEpoch);
  const hasCurrentEntry = input.entries.some(entry => entry.taskId === input.task.id && entry.trendEpochIdAtEntry === currentEpoch);
  return { dates, levels, observations, scaleChangeDates, epochId: currentEpoch, isNewEpochEmpty: hasPriorEpoch && !hasCurrentEntry };
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
