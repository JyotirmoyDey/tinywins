import test from 'node:test';
import assert from 'node:assert/strict';
import { dateFromPicker, pickerValue, getInsightsPeriod, validateCustomRange } from '../src/analytics/insightsDateRange';

test('Insights presets include the current local calendar day', () => {
  const today = '2026-09-24';
  const custom = { startDate: today, endDate: today };
  assert.deepEqual(getInsightsPeriod(today, '1D', custom), custom);
  assert.deepEqual(getInsightsPeriod(today, '7D', custom), { startDate: '2026-09-18', endDate: today });
  assert.deepEqual(getInsightsPeriod(today, '30D', custom), { startDate: '2026-08-26', endDate: today });
  assert.deepEqual(getInsightsPeriod(today, '90D', custom), { startDate: '2026-06-27', endDate: today });
});

test('custom range is inclusive and accepts past dates but never future dates', () => {
  const today = '2026-09-24';
  const valid = { startDate: '2025-01-02', endDate: '2026-09-24' };
  assert.equal(validateCustomRange(valid, today), null);
  assert.deepEqual(getInsightsPeriod(today, 'CUSTOM', valid), valid);
  assert.match(validateCustomRange({ startDate: '2026-09-25', endDate: '2026-09-25' }, today)!, /Future/);
  assert.match(validateCustomRange({ startDate: '2026-09-24', endDate: '2026-09-23' }, today)!, /Start date/);
  assert.match(validateCustomRange({ startDate: '2026-02-30', endDate: today }, today)!, /valid/);
});

test('native picker dates are read as local calendar dates', () => {
  const selected = new Date(2026, 8, 24, 12);
  assert.equal(dateFromPicker(selected, 'ios'), '2026-09-24');
  const android = pickerValue('2026-09-24', 'android');
  assert.equal(android.toISOString(), '2026-09-24T00:00:00.000Z');
  assert.equal(dateFromPicker(android, 'android'), '2026-09-24');
});
