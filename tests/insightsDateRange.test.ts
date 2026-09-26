import test from 'node:test';
import assert from 'node:assert/strict';
import { availableCustomRange, dateFromPicker, earliestAvailableDate, earliestRecordedDate, formatDateCell, formatLocalDate, pickerValue, getInsightsPeriod, updateCustomRangeDraft, validateCustomRange } from '../src/analytics/insightsDateRange';
import { loadDemoDataset } from '../src/analytics/demoData';
import { dateMenuActions } from '../src/components/analytics/dateMenuActions';
import { localDate } from '../src/domain/task';

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

test('recorded-date bounds use the selected task or all entries without inventing missing days', () => {
  const dataset = loadDemoDataset();
  const expectedAll = dataset.entries.map(entry => entry.localDate).sort()[0];
  assert.equal(earliestRecordedDate(dataset.entries), expectedAll);
  for (const task of dataset.tasks) {
    const dates = dataset.entries.filter(entry => entry.taskId === task.id).map(entry => entry.localDate).sort();
    assert.equal(earliestRecordedDate(dataset.entries, task.id), dates[0] ?? null);
  }
  assert.equal(earliestRecordedDate(dataset.entries, 'new-task'), null);
});

test('picker bounds use reliable task creation dates in My Data and Demo Data', () => {
  const demo = loadDemoDataset();
  assert.equal(earliestAvailableDate(demo.tasks, demo.entries, '2026-09-25'), '2025-09-27');
  for (const task of demo.tasks) {
    assert.equal(earliestAvailableDate(demo.tasks, demo.entries, '2026-09-25', task.id), '2025-09-27');
  }
  const tasks = [{ id: 'study', createdAt: '2026-09-18T15:00:00.000Z' }];
  const entries = [{ taskId: 'study', localDate: '2026-09-22' }];
  const localCreationDay = localDate(new Date(tasks[0].createdAt));
  assert.equal(earliestAvailableDate(tasks, entries, '2026-09-25', 'study'), localCreationDay);
  assert.equal(earliestAvailableDate(tasks, [], '2026-09-25', 'study'), localCreationDay);
  assert.equal(earliestAvailableDate(tasks, entries, '2026-09-25', 'other'), null);
});

test('picker bounds fall back to history when creation timestamps are invalid or newer than recordings', () => {
  const entries = [{ taskId: 'study', localDate: '2026-06-15' }];
  assert.equal(earliestAvailableDate([{ id: 'study', createdAt: 'invalid' }], entries, '2026-09-25'), '2026-06-15');
  assert.equal(earliestAvailableDate([{ id: 'study', createdAt: '2026-09-22T12:00:00Z' }], entries, '2026-09-25'), '2026-06-15');
  assert.equal(earliestAvailableDate([{ id: 'study', createdAt: '2027-01-01T00:00:00Z' }], entries, '2026-09-25'), '2026-06-15');
});

test('both compact date cells use the same day-month-year layout with localized month names', () => {
  const start = formatDateCell('2026-09-02', 'en-US');
  const end = formatDateCell('2026-10-25', 'en-US');
  assert.equal(start, '02 Sep 2026');
  assert.equal(end, '25 Oct 2026');
  assert.match(formatDateCell('2026-09-02', 'fr-FR'), /^02 sept\. 2026$/);
});

test('custom picker suggests a valid range when switching tasks or sources', () => {
  const today = '2026-09-24';
  const previous = { startDate: '2025-01-01', endDate: '2025-01-08' };
  assert.match(validateCustomRange(previous, today, '2026-08-01')!, /first available date/);
  assert.deepEqual(availableCustomRange(previous, '2026-08-01', today),
    { startDate: '2026-08-01', endDate: today });
  assert.deepEqual(availableCustomRange(previous, null, today),
    { startDate: today, endDate: today });
});

test('date menu shows exactly one checkmark when switching presets and Custom', () => {
  const custom = { startDate: '2026-09-01', endDate: '2026-09-24' };
  for (const selected of ['1D', '7D', '30D', '90D', 'CUSTOM'] as const) {
    const ios = dateMenuActions(selected, custom, 'ios');
    const android = dateMenuActions(selected, custom, 'android');
    assert.equal(ios.filter(action => action.image === 'checkmark').length, 1);
    assert.equal(android.filter(action => action.state === 'on').length, 1);
    assert.equal(ios.find(action => action.image === 'checkmark')?.id, selected);
    assert.equal(android.find(action => action.state === 'on')?.id, selected);
    assert.ok(ios.filter(action => action.id !== selected).every(action => action.image === undefined));
    assert.ok(android.filter(action => action.id !== selected).every(action => action.state === undefined));
  }
  const selectedCustom = dateMenuActions('CUSTOM', custom, 'ios').find(action => action.id === 'CUSTOM');
  assert.ok(selectedCustom?.title.includes(formatLocalDate(custom.startDate)));
});

test('date sheet keeps edits temporary until Apply and reopens the applied range after Cancel', () => {
  const applied = { startDate: '2026-09-10', endDate: '2026-09-24' };
  const opened = availableCustomRange(applied, '2026-08-01', '2026-09-24');
  const changed = updateCustomRangeDraft(opened, 'start', '2026-09-20');
  assert.deepEqual(applied, { startDate: '2026-09-10', endDate: '2026-09-24' });
  assert.deepEqual(changed, { startDate: '2026-09-20', endDate: '2026-09-24' });
  assert.equal(validateCustomRange(changed, '2026-09-24', '2026-08-01'), null);
  assert.deepEqual(availableCustomRange(applied, '2026-08-01', '2026-09-24'), applied);
  assert.deepEqual(updateCustomRangeDraft({ startDate: '2026-09-10', endDate: '2026-09-20' },
    'start', '2026-09-23'), { startDate: '2026-09-23', endDate: '2026-09-23' });
});
