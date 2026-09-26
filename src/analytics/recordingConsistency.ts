import config from './config/recording-consistency-individual.json';
import { localDate, parseLocalDate } from '../domain/task';
import { createTaskDayEligibility } from '../domain/taskLifecycle';
import { RecordingConsistencyGroup, RecordingConsistencyInput,
  RecordingConsistencyResult, registerAnalyticsCalculator, runAnalyticsCalculator } from './engine';

export const individualRecordingConsistencyConfig = config;
if (config.id !== 'recording-consistency-individual' ||
  config.calculator !== 'recordingConsistency' || config.type !== 'adaptive-vertical-bar' ||
  config.section !== 'patterns' || config.timeline !== 'shared' ||
  config.calculation.metric !== 'recorded-eligible-days' ||
  config.calculation.weekStartsOn !== 'monday' ||
  config.calculation.eligibilityFallback !== 'first-recorded-date' ||
  !config.calculation.excludeFuture || !config.calculation.countLowestAsRecorded ||
  config.presentation.dailyMaxDays < 1 || config.presentation.maxWeeklyBars < 2) {
  throw new Error('Invalid recording consistency configuration.');
}

function selectedDates(input: RecordingConsistencyInput) {
  const start = parseLocalDate(input.period.startDate);
  const end = parseLocalDate(input.period.endDate);
  const today = parseLocalDate(input.today);
  if (start > end) throw new Error('Start date must be on or before end date.');
  const last = end < today ? end : today;
  const dates: string[] = [];
  for (const day = new Date(start); day <= last; day.setDate(day.getDate() + 1)) dates.push(localDate(day));
  return dates;
}

function mondayOf(date: string) {
  const day = parseLocalDate(date);
  day.setDate(day.getDate() - (day.getDay() + 6) % 7);
  return localDate(day);
}

function modeFor(input: RecordingConsistencyInput, dates: string[]): RecordingConsistencyResult['mode'] {
  if (input.timeline === '1D' || dates.length === 1) return 'status';
  if (input.timeline === '7D' || (input.timeline === 'CUSTOM' &&
    dates.length <= config.presentation.dailyMaxDays)) return 'daily';
  if (input.timeline === 'CUSTOM') {
    const weekCount = new Set(dates.map(mondayOf)).size;
    if (dates.length >= config.presentation.customMonthlyMinDays ||
      weekCount > config.presentation.maxWeeklyBars) return 'monthly';
  }
  return 'weekly';
}

/** Presence-only coverage: option IDs, labels, weights, and scale versions do not affect it. */
export function recordingConsistency(input: RecordingConsistencyInput): RecordingConsistencyResult {
  const dates = selectedDates(input);
  const mode = modeFor(input, dates);
  const recorded = new Set(input.entries.filter(entry => entry.taskId === input.task.id &&
    entry.localDate <= input.today).map(entry => entry.localDate));
  // Creation begins the first active period. Saved local transitions decide the
  // end-of-day state; recorded archive days remain eligible.
  const eligibility = createTaskDayEligibility(input.task, input.lifecycle ?? [], recorded, input.today);
  const eligibilityStart = eligibility.start;
  if (!eligibilityStart) return { mode, status: 'unknown-start', eligibleDays: 0,
    recordedDays: 0, percentage: null, eligibilityStart: null, groups: [] };
  const groups = new Map<string, RecordingConsistencyGroup>();
  for (const date of dates) {
    const id = mode === 'daily' || mode === 'status' ? date :
      mode === 'monthly' ? date.slice(0, 7) : mondayOf(date);
    let group = groups.get(id);
    if (!group) {
      group = { id, startDate: date, endDate: date, eligibleDays: 0,
        recordedDays: 0, percentage: null };
      groups.set(id, group);
    }
    group.endDate = date;
    if (eligibility.eligible(date)) {
      group.eligibleDays++;
      if (recorded.has(date)) group.recordedDays++;
    }
  }
  const rows = [...groups.values()].map(group => ({ ...group,
    percentage: group.eligibleDays ? group.recordedDays / group.eligibleDays * 100 : null }));
  const eligibleDays = rows.reduce((sum, group) => sum + group.eligibleDays, 0);
  const recordedDays = rows.reduce((sum, group) => sum + group.recordedDays, 0);
  return { mode, status: eligibleDays ? 'ready' : 'no-eligible-days',
    eligibleDays, recordedDays, percentage: eligibleDays ? recordedDays / eligibleDays * 100 : null,
    eligibilityStart, groups: rows };
}

registerAnalyticsCalculator('recordingConsistency', recordingConsistency);
export function getIndividualRecordingConsistency(input: RecordingConsistencyInput) {
  return runAnalyticsCalculator('recordingConsistency', input);
}
