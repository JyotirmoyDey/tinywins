import config from './config/rating-distribution.json';
import { AnalyticsEntry, AnalyticsTask } from './types';
import { registerAnalyticsCalculator, RatingDistributionInput, RatingDistributionRow, runAnalyticsCalculator } from './engine';
import { parseLocalDate, localDate } from '../domain/task';
import { getHistoricalLevels } from './ratingTrend';
export type RatingDistributionTimeline = '1D'|'7D'|'30D'|'90D'|'CUSTOM';
export const ratingDistributionConfig = config;
function validateRatingDistributionConfig(value: typeof config) { if (value.calculator !== 'ratingDistribution' || value.type !== 'horizontal-bar' || value.timeline.default !== '1d' || !value.timeline.options.includes('custom')) throw new Error('Invalid rating distribution configuration.'); return value; }
validateRatingDistributionConfig(ratingDistributionConfig);
function dateSet(period: RatingDistributionInput['period']) { const start = parseLocalDate(period.startDate); const end = parseLocalDate(period.endDate); if (start > end) throw new Error('Start date must be on or before end date.'); const dates = new Set<string>(); const cursor = new Date(start); while (cursor <= end) { dates.add(localDate(cursor)); cursor.setDate(cursor.getDate() + 1); } return dates; }
export function ratingDistribution(input: RatingDistributionInput): RatingDistributionRow[] {
  const dates = dateSet(input.period);
  const relevant = input.entries.filter(entry => entry.taskId === input.task.id && dates.has(entry.localDate));
  const options = getHistoricalLevels(input.task, relevant);
  const counts = new Map<string, number>();
  relevant.forEach(entry => counts.set(entry.optionId, (counts.get(entry.optionId) || 0) + 1));
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return options.map((option, index) => ({
    optionId: option.id, label: option.label, position: index + 1,
    count: counts.get(option.id) || 0, percentage: total ? ((counts.get(option.id) || 0) / total) * 100 : 0,
  }));
}
registerAnalyticsCalculator('ratingDistribution', ratingDistribution);
export function getRatingDistribution(task: AnalyticsTask, entries: AnalyticsEntry[], period: RatingDistributionInput['period']) {
  return runAnalyticsCalculator('ratingDistribution', { task, entries, period });
}
export function getRatingDistributionPeriod(today: string, timeline: RatingDistributionTimeline, custom?: RatingDistributionInput['period']): RatingDistributionInput['period'] { if (timeline === 'CUSTOM') { if (!custom) throw new Error('Choose a custom date range.'); const start = parseLocalDate(custom.startDate); const end = parseLocalDate(custom.endDate); if (start > end) throw new Error('Start date must be on or before end date.'); return custom; } const days = timeline === '1D' ? 1 : timeline === '7D' ? 7 : timeline === '30D' ? 30 : 90; const end = parseLocalDate(today); const start = new Date(end); start.setDate(end.getDate() - days + 1); return { startDate: localDate(start), endDate: today }; }
