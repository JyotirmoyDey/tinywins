import config from './config/rating-distribution.json';
import { AnalyticsEntry, AnalyticsTask } from './types';
import { registerAnalyticsCalculator, RatingDistributionInput, RatingDistributionRow, runAnalyticsCalculator } from './engine';
import { RatingScaleVersion, parseLocalDate, localDate } from '../domain/task';
export type RatingDistributionTimeline = '1D'|'7D'|'30D'|'90D'|'CUSTOM';
export const ratingDistributionConfig = config;
function validateRatingDistributionConfig(value: typeof config) { if (value.calculator !== 'ratingDistribution' || value.type !== 'horizontal-bar' || value.timeline.default !== '1d' || !value.timeline.options.includes('custom')) throw new Error('Invalid rating distribution configuration.'); return value; }
validateRatingDistributionConfig(ratingDistributionConfig);
function dateSet(period: RatingDistributionInput['period']) { const start = parseLocalDate(period.startDate); const end = parseLocalDate(period.endDate); if (start > end) throw new Error('Start date must be on or before end date.'); const dates = new Set<string>(); const cursor = new Date(start); while (cursor <= end) { dates.add(localDate(cursor)); cursor.setDate(cursor.getDate() + 1); } return dates; }
export function ratingDistribution(input: RatingDistributionInput): RatingDistributionRow[] {
  const dates = dateSet(input.period);
  const versionId = input.scaleVersion && input.scaleVersion !== 'current' ? input.scaleVersion : input.task.currentScaleVersionId;
  const savedVersion = input.versions?.find(version => version.id === versionId && version.taskId === input.task.id);
  const options = versionId === input.task.currentScaleVersionId ? input.task.options : savedVersion?.options ?? [];
  const counts = new Map<string, number>();
  input.entries.filter(entry => entry.taskId === input.task.id && dates.has(entry.localDate) &&
    (entry.scaleVersionIdAtEntry === versionId ||
      // Compatibility for older in-memory analytics callers.
      (!entry.scaleVersionIdAtEntry && (entry.scaleVersionAtEntry ?? 'current') === (input.scaleVersion ?? 'current'))))
    .forEach(entry => counts.set(entry.optionId, (counts.get(entry.optionId) || 0) + 1));
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return options.slice().sort((a,b) => a.position - b.position).map(option => ({
    optionId: option.id, label: option.label, position: option.position,
    count: counts.get(option.id) || 0, percentage: total ? ((counts.get(option.id) || 0) / total) * 100 : 0,
  }));
}
registerAnalyticsCalculator('ratingDistribution', ratingDistribution);
export function getRatingDistribution(task: AnalyticsTask, entries: AnalyticsEntry[], period: RatingDistributionInput['period'], scaleVersion = 'current', versions: RatingScaleVersion[] = []) {
  return runAnalyticsCalculator('ratingDistribution', { task, entries, period, scaleVersion, versions });
}
export function getRatingDistributionPeriod(today: string, timeline: RatingDistributionTimeline, custom?: RatingDistributionInput['period']): RatingDistributionInput['period'] { if (timeline === 'CUSTOM') { if (!custom) throw new Error('Choose a custom date range.'); const start = parseLocalDate(custom.startDate); const end = parseLocalDate(custom.endDate); if (start > end) throw new Error('Start date must be on or before end date.'); return custom; } const days = timeline === '1D' ? 1 : timeline === '7D' ? 7 : timeline === '30D' ? 30 : 90; const end = parseLocalDate(today); const start = new Date(end); start.setDate(end.getDate() - days + 1); return { startDate: localDate(start), endDate: today }; }
export function getRatingScaleVersions(task: AnalyticsTask, entries: AnalyticsEntry[], versions: RatingScaleVersion[] = []) {
  const known = new Set(versions.filter(version => version.taskId === task.id).map(version => version.id));
  const historical = [...new Set(entries.filter(entry => entry.taskId === task.id && entry.scaleVersionIdAtEntry &&
    entry.scaleVersionIdAtEntry !== task.currentScaleVersionId && known.has(entry.scaleVersionIdAtEntry))
    .map(entry => entry.scaleVersionIdAtEntry))];
  return ['current', ...historical];
}
