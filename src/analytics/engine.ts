import { RatingScaleVersion } from '../domain/task';
import { AnalyticsEntry, AnalyticsTask } from './types';
export type AnalyticsPeriod = { startDate: string; endDate: string };
export type RatingDistributionRow = { optionId: string; label: string; position: number; count: number; percentage: number };
export type RatingDistributionInput = { task: AnalyticsTask; entries: AnalyticsEntry[]; period: AnalyticsPeriod; scaleVersion?: string; versions?: RatingScaleVersion[] };
type Calculator<T> = (input: RatingDistributionInput) => T;
const calculators = new Map<string, Calculator<RatingDistributionRow[]>>();
export function registerAnalyticsCalculator(name: string, calculator: Calculator<RatingDistributionRow[]>) { calculators.set(name, calculator); }
export function runAnalyticsCalculator(name: string, input: RatingDistributionInput) { const calculator = calculators.get(name); if (!calculator) throw new Error(`Unknown analytics calculator: ${name}`); return calculator(input); }
