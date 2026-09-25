import { RatingDistributionTimeline } from '../../analytics/ratingDistribution';
import { CustomRange, formatLocalDate } from '../../analytics/insightsDateRange';

const choices = [
  { id: '1D', title: 'Today (1D)' },
  { id: '7D', title: 'Last 7 days' },
  { id: '30D', title: 'Last 30 days' },
  { id: '90D', title: 'Last 90 days' },
  { id: 'CUSTOM', title: 'Custom range' },
] as const;

/** A single non-toggle checkmark avoids iOS keeping two checked Toggle rows during menu dismissal. */
export function dateMenuActions(value: RatingDistributionTimeline, custom: CustomRange, platform: 'ios' | 'android') {
  return choices.map(choice => ({
    id: choice.id,
    title: choice.id === 'CUSTOM' && value === 'CUSTOM'
      ? 'Custom · ' + formatLocalDate(custom.startDate) + ' – ' + formatLocalDate(custom.endDate)
      : choice.title,
    image: platform === 'ios' && value === choice.id ? 'checkmark' as const : undefined,
    state: platform === 'android' && value === choice.id ? 'on' as const : undefined,
  }));
}
