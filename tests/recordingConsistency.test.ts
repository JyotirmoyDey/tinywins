import test from 'node:test';
import assert from 'node:assert/strict';
import { getIndividualRecordingConsistency } from '../src/analytics/recordingConsistency';
import { consistencyDateTicks } from '../src/components/analytics/recordingConsistencyLayout';
import { AnalyticsEntry, AnalyticsTask } from '../src/analytics/types';
import { loadDemoDataset } from '../src/analytics/demoData';
import { getInsightsPeriod } from '../src/analytics/insightsDateRange';
import { getAnalyticsDataset } from '../src/analytics/service';
import { setup } from './sqlite';

const today = '2026-09-25';
const task: AnalyticsTask = {
  id: 'study', name: 'Study', active: true, color: '#398F80',
  createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-25T12:00:00.000Z',
  currentScaleVersionId: 'v2', currentTrendEpochId: 'epoch-2',
  options: [
    { id: 'low', label: 'Skipped', position: 1, rank: 1, normalizedWeight: 0 },
    { id: 'high', label: 'High', position: 2, rank: 2, normalizedWeight: 100 },
  ],
};
function entry(date: string, optionId = 'low', taskId = task.id,
  scaleVersionIdAtEntry = 'v1', trendEpochIdAtEntry = 'epoch-1'): AnalyticsEntry {
  return { id: `${taskId}-${date}`, taskId, optionId, localDate: date,
    optionLabelAtEntry: optionId === 'low' ? 'Skipped' : 'High',
    positionAtEntry: optionId === 'low' ? 1 : 2,
    normalizedWeightAtEntry: optionId === 'low' ? 0 : 100,
    scaleVersionIdAtEntry, trendEpochIdAtEntry };
}
function calculate(period: { startDate: string; endDate: string },
  entries: AnalyticsEntry[] = [], selectedTask = task,
  timeline: '1D' | '7D' | '30D' | '90D' | 'CUSTOM' = 'CUSTOM') {
  return getIndividualRecordingConsistency({ task: selectedTask, entries, period, today, timeline });
}

test('1D reports Recorded for an explicit lowest response and Not recorded for absence', () => {
  const period = { startDate: today, endDate: today };
  const recorded = calculate(period, [entry(today)], task, '1D');
  assert.equal(recorded.mode, 'status');
  assert.equal(recorded.recordedDays, 1);
  assert.equal(recorded.percentage, 100);
  const missing = calculate(period, [], task, '1D');
  assert.equal(missing.recordedDays, 0);
  assert.equal(missing.percentage, 0);
});

test('7D keeps seven daily indicators and counts missing days as unrecorded', () => {
  const period = getInsightsPeriod(today, '7D', { startDate: today, endDate: today });
  const result = calculate(period, [entry('2026-09-19'), entry('2026-09-21', 'high')], task, '7D');
  assert.equal(result.mode, 'daily');
  assert.equal(result.groups.length, 7);
  assert.equal(result.eligibleDays, 7);
  assert.equal(result.recordedDays, 2);
  assert.equal(result.groups.find(group => group.id === '2026-09-20')?.percentage, 0);
  assert.equal(result.groups.find(group => group.id === '2026-09-19')?.percentage, 100);
});

test('30D and 90D use Monday-start calendar weeks', () => {
  for (const timeline of ['30D', '90D'] as const) {
    const period = getInsightsPeriod(today, timeline, { startDate: today, endDate: today });
    const result = calculate(period, [entry('2026-09-22')], task, timeline);
    assert.equal(result.mode, 'weekly');
    assert.equal(result.groups.at(-1)?.id, '2026-09-21');
    assert.equal(result.groups.at(-1)?.endDate, today);
  }
});

test('partial weeks divide by actual eligible days, including a newly created task', () => {
  const newTask = { ...task, createdAt: '2026-09-18T08:00:00.000Z' };
  const result = calculate({ startDate: '2026-09-15', endDate: '2026-09-22' },
    [entry('2026-09-18'), entry('2026-09-19'), entry('2026-09-20'), entry('2026-09-22')],
    newTask, 'CUSTOM');
  assert.equal(result.eligibilityStart, '2026-09-18');
  assert.equal(result.eligibleDays, 5);
  const firstWeek = result.groups.find(group => group.id === '2026-09-14')!;
  assert.equal(firstWeek.eligibleDays, 3);
  assert.equal(firstWeek.recordedDays, 3);
  assert.equal(firstWeek.percentage, 100);
  assert.equal(result.groups.find(group => group.id === '2026-09-21')?.percentage, 50);
});

test('custom ranges adapt from daily to weekly to monthly', () => {
  assert.equal(calculate({ startDate: '2026-09-23', endDate: today }).mode, 'daily');
  assert.equal(calculate({ startDate: '2026-07-01', endDate: today }).mode, 'weekly');
  const long = calculate({ startDate: '2026-03-01', endDate: today });
  assert.equal(long.mode, 'monthly');
  assert.ok(long.groups.length < 10);
  assert.equal(long.groups.at(-1)?.id, '2026-09');
});

test('no recordings still gives zero coverage when creation is known', () => {
  const result = calculate({ startDate: '2026-09-01', endDate: '2026-09-07' });
  assert.equal(result.status, 'ready');
  assert.equal(result.eligibleDays, 7);
  assert.equal(result.recordedDays, 0);
  assert.ok(result.groups.every(group => group.percentage === 0));
});

test('an unknown imported start falls back to first entry, never an invented creation day', () => {
  const imported = { ...task, createdAt: 'not-a-date' };
  const fallback = calculate({ startDate: '2026-09-01', endDate: today },
    [entry('2026-09-20')], imported);
  assert.equal(fallback.eligibilityStart, '2026-09-20');
  assert.equal(fallback.eligibleDays, 6);
  assert.equal(fallback.recordedDays, 1);
  const unknown = calculate({ startDate: '2026-09-01', endDate: today }, [], imported);
  assert.equal(unknown.status, 'unknown-start');
  assert.equal(unknown.percentage, null);
});

test('days before creation and future dates are excluded', () => {
  const newTask = { ...task, createdAt: '2026-09-24T08:00:00.000Z' };
  const result = calculate({ startDate: '2026-09-21', endDate: '2026-10-03' },
    [entry('2026-09-25'), entry('2026-09-26')], newTask);
  assert.equal(result.eligibleDays, 2);
  assert.equal(result.recordedDays, 1);
  assert.equal(result.groups.at(-1)?.endDate, today);
  assert.equal(calculate({ startDate: '2026-09-01', endDate: '2026-09-07' },
    [], newTask).status, 'no-eligible-days');
});

test('scale additions, renames, archives and trend resets do not reset presence history', () => {
  const result = calculate({ startDate: '2026-09-18', endDate: '2026-09-24' }, [
    entry('2026-09-18', 'low', task.id, 'old-scale', 'old-epoch'),
    entry('2026-09-19', 'high', task.id, 'new-scale', 'new-epoch'),
  ]);
  assert.equal(result.recordedDays, 2);
  assert.equal(result.eligibleDays, 7);
  assert.equal(result.status, 'ready');
});

test('different local calendar boundaries retain Monday week starts', () => {
  const result = calculate({ startDate: '2026-08-29', endDate: '2026-09-08' },
    [entry('2026-09-01')]);
  assert.deepEqual(result.groups.map(group => group.id),
    ['2026-08-24', '2026-08-31', '2026-09-07']);
  assert.equal(result.groups[1].recordedDays, 1);
});

test('date ticks stay inside narrow iPhone and Android plot widths without overlap', () => {
  const result = calculate({ startDate: '2026-06-25', endDate: today }, [], task, '90D');
  for (const width of [226, 248, 286, 350]) {
    const ticks = consistencyDateTicks(result.groups, width, result.mode, 4, 64);
    for (let index = 0; index < ticks.length; index++) {
      assert.ok(ticks[index].left >= 0);
      assert.ok(ticks[index].left + ticks[index].width <= width);
      if (index) assert.ok(ticks[index].left >= ticks[index - 1].left + ticks[index - 1].width + 7);
    }
  }
});

test('My Data SQLite and Demo Data use the same calculator without mixing tasks', async () => {
  const db = await setup();
  try {
    const saved = await db.tasks.create({ name: 'Practice', options: [
      { id: 'skip', label: 'Skipped' }, { id: 'done', label: 'Done' },
    ] });
    await db.entries.upsert(saved.id, '2026-09-22', 'skip');
    const own = getAnalyticsDataset([(await db.tasks.getById(saved.id))!],
      await db.entries.getAll(), await db.tasks.getScaleVersions());
    const demo = loadDemoDataset();
    const period = { startDate: '2026-09-16', endDate: '2026-09-22' };
    const myResult = calculate(period, own.entries, own.tasks[0], '7D');
    const demoTask = demo.tasks.find(item => item.name === 'Workout')!;
    const demoResult = calculate(period, demo.entries, demoTask, '7D');
    assert.equal(myResult.recordedDays, 1);
    assert.ok(demoResult.recordedDays > 1);
    assert.ok(myResult.recordedDays !== demoResult.recordedDays);
  } finally {
    db.native.close();
  }
});
