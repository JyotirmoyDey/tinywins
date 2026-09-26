import { RatingScaleVersion, TaskLifecycleTransition } from '../domain/task';
import { AnalyticsEntry, AnalyticsTask } from './types';
export type AnalyticsPeriod = { startDate: string; endDate: string };
export type RatingDistributionRow = { optionId: string; label: string; position: number; count: number; percentage: number };
export type RatingDistributionInput = { task: AnalyticsTask; entries: AnalyticsEntry[]; period: AnalyticsPeriod; scaleVersion?: string; versions?: RatingScaleVersion[] };
export type PeriodComparisonInput = { task: AnalyticsTask; entries: AnalyticsEntry[]; period: AnalyticsPeriod; versions: RatingScaleVersion[] };
export type ComparisonPeriod = AnalyticsPeriod & { days: number; recordedDays: number };
export type PeriodComparisonRow = { optionId: string; label: string; position: number;
  currentCount: number; previousCount: number; currentPercentage: number; previousPercentage: number };
export type PeriodComparisonResult = { status: 'ready' | 'no-data' | 'empty-current' | 'empty-previous' | 'incompatible';
  current: ComparisonPeriod; previous: ComparisonPeriod; rows: PeriodComparisonRow[];
  currentEntry: AnalyticsEntry | null; previousEntry: AnalyticsEntry | null };
export type RecordingConsistencyInput = { task: AnalyticsTask; entries: AnalyticsEntry[];
  lifecycle?: TaskLifecycleTransition[]; period: AnalyticsPeriod; today: string;
  timeline: '1D' | '7D' | '30D' | '90D' | 'CUSTOM' };
export type RecordingConsistencyGroup = { id: string; startDate: string; endDate: string;
  eligibleDays: number; recordedDays: number; percentage: number | null };
export type RecordingConsistencyResult = { mode: 'status' | 'daily' | 'weekly' | 'monthly';
  status: 'ready' | 'unknown-start' | 'no-eligible-days';
  eligibleDays: number; recordedDays: number; percentage: number | null;
  eligibilityStart: string | null; groups: RecordingConsistencyGroup[] };
export type WeekdayPatternsInput = { task: AnalyticsTask; entries: AnalyticsEntry[];
  versions: RatingScaleVersion[]; period: AnalyticsPeriod; timeline: '1D' | '7D' | '30D' | '90D' | 'CUSTOM' };
export type WeekdayPatternLevel = { id: string; label: string; active: boolean };
export type WeekdayPatternCell = { optionId: string; label: string; count: number;
  percentage: number | null; historicalLabels: string[] };
export type WeekdayPatternRow = { weekday: number; label: string; total: number;
  cells: WeekdayPatternCell[] };
export type WeekdayPatternsResult = { status: 'today' | 'single-day' | 'insufficient-range' | 'no-data' | 'ready';
  levels: WeekdayPatternLevel[]; rows: WeekdayPatternRow[]; recordedCount: number;
  excludedHistoryCount: number; limitedSample: boolean; singleDayEntry: AnalyticsEntry | null;
  singleDate: string | null };
type CalculatorRegistry = {
  ratingDistribution: (input: RatingDistributionInput) => RatingDistributionRow[];
  periodComparison: (input: PeriodComparisonInput) => PeriodComparisonResult;
  recordingConsistency: (input: RecordingConsistencyInput) => RecordingConsistencyResult;
  weekdayPatterns: (input: WeekdayPatternsInput) => WeekdayPatternsResult;
};
const calculators: Partial<CalculatorRegistry> = {};
export function registerAnalyticsCalculator<K extends keyof CalculatorRegistry>(name: K, calculator: CalculatorRegistry[K]) {
  // Registration stays typed by calculator name; chart components never run formulas.
  (calculators as Record<K, CalculatorRegistry[K]>)[name] = calculator;
}
export function runAnalyticsCalculator<K extends keyof CalculatorRegistry>(
  name: K, input: Parameters<CalculatorRegistry[K]>[0],
): ReturnType<CalculatorRegistry[K]> {
  const calculator = calculators[name];
  if (!calculator) throw new Error(`Unknown analytics calculator: ${name}`);
  return (calculator as (value: Parameters<CalculatorRegistry[K]>[0]) => ReturnType<CalculatorRegistry[K]>)(input);
}
