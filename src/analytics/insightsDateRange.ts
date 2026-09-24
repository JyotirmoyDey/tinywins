import { localDate, parseLocalDate } from '../domain/task';
import { RatingDistributionTimeline, getRatingDistributionPeriod } from './ratingDistribution';

export interface CustomRange { startDate: string; endDate: string }

export function validateCustomRange(range: CustomRange, today: string): string | null {
  try {
    parseLocalDate(range.startDate);
    parseLocalDate(range.endDate);
    parseLocalDate(today);
  } catch {
    return 'Choose valid start and end dates.';
  }
  if (range.startDate > range.endDate) return 'Start date must be on or before end date.';
  if (range.endDate > today) return 'Future dates are not available.';
  return null;
}

export function getInsightsPeriod(today: string, timeline: RatingDistributionTimeline, custom: CustomRange) {
  if (timeline === 'CUSTOM') {
    const error = validateCustomRange(custom, today);
    if (error) throw new Error(error);
  }
  return getRatingDistributionPeriod(today, timeline, custom);
}

export function formatLocalDate(value: string, locale?: string) {
  return parseLocalDate(value).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Android Material date pickers emit the selected calendar day as UTC midnight.
// iOS SwiftUI date pickers emit a Date in the device's local calendar.
export function dateFromPicker(value: Date, platform: 'ios' | 'android' = 'ios') {
  if (platform === 'android') return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  return localDate(value);
}

export function pickerValue(date: string, platform: 'ios' | 'android') {
  const local = parseLocalDate(date);
  return platform === 'android' ? new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate())) : local;
}
