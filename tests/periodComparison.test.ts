import test from 'node:test';
import assert from 'node:assert/strict';
import { getPeriodComparison, precedingEqualPeriod } from '../src/analytics/periodComparison';
import { loadDemoDataset } from './demoDataset';
import { AnalyticsEntry, AnalyticsTask } from '../src/analytics/types';
import { getAnalyticsDataset } from '../src/analytics/service';
import { setup } from './sqlite';

const task: AnalyticsTask = {
  id: 'study', name: 'Study', active: true, color: '#2A9D8F',
  createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  options: [
    { id: 'low', label: 'Low', position: 1, rank: 1, normalizedWeight: 0 },
    { id: 'medium', label: 'Medium', position: 2, rank: 2, normalizedWeight: 50 },
    { id: 'high', label: 'High', position: 3, rank: 3, normalizedWeight: 100 },
  ],
};
function entry(date: string, optionId: string): AnalyticsEntry {
  const option = task.options.find(item => item.id === optionId)!;
  return { id: `${date}-${optionId}`, taskId: task.id, optionId, localDate: date,
    optionLabelAtEntry: option.label, positionAtEntry: option.position,
    normalizedWeightAtEntry: 99 };
}
function compare(entries: AnalyticsEntry[], period = { startDate: '2026-09-18', endDate: '2026-09-24' },
  selectedTask = task) {
  return getPeriodComparison({ task: selectedTask, entries, period });
}

test('previous period has exactly the same number of local calendar days', () => {
  assert.deepEqual(precedingEqualPeriod({ startDate: '2026-09-18', endDate: '2026-09-24' }),
    { startDate: '2026-09-11', endDate: '2026-09-17', days: 7 });
  assert.deepEqual(precedingEqualPeriod({ startDate: '2024-03-01', endDate: '2024-03-03' }),
    { startDate: '2024-02-27', endDate: '2024-02-29', days: 3 });
  assert.throws(() => precedingEqualPeriod({ startDate: '2026-09-24', endDate: '2026-09-18' }));
});

test('missing days do not dilute percentages or become the lowest rating', () => {
  const result = compare([entry('2026-09-11', 'high'), entry('2026-09-18', 'low')]);
  assert.equal(result.status, 'ready');
  assert.equal(result.current.recordedDays, 1);
  assert.equal(result.current.days, 7);
  assert.equal(result.rows[0].label, 'Low');
  assert.equal(result.rows[0].currentPercentage, 100);
  assert.equal(result.rows[0].currentCount, 1);
  assert.equal(result.rows[2].previousPercentage, 100);
  assert.equal(result.rows[1].currentPercentage, 0);
});

test('unequal recording coverage keeps separate denominators', () => {
  const result = compare([
    entry('2026-09-11', 'low'), entry('2026-09-12', 'high'),
    entry('2026-09-18', 'low'), entry('2026-09-19', 'low'),
    entry('2026-09-20', 'high'), entry('2026-09-21', 'high'),
  ]);
  assert.equal(result.previous.recordedDays, 2);
  assert.equal(result.current.recordedDays, 4);
  assert.equal(result.rows[0].previousPercentage, 50);
  assert.equal(result.rows[0].currentPercentage, 50);
  assert.equal(result.rows[2].currentCount, 2);
});

test('an empty period has no percentage bars', () => {
  assert.deepEqual(compare([]).rows, []);
  assert.equal(compare([]).status, 'no-data');
  assert.equal(compare([entry('2026-09-18', 'low')]).status, 'empty-previous');
  assert.equal(compare([entry('2026-09-11', 'high')]).status, 'empty-current');
});

test('a one-day comparison retains the exact historical labels', () => {
  const result = compare([entry('2026-09-23', 'medium'), entry('2026-09-24', 'high')],
    { startDate: '2026-09-24', endDate: '2026-09-24' });
  assert.equal(result.currentEntry?.optionLabelAtEntry, 'High');
  assert.equal(result.previousEntry?.optionLabelAtEntry, 'Medium');
  assert.equal(result.current.days, 1);
});

test('stable option identities and historical labels remain comparable', () => {
  const result = compare([entry('2026-09-11', 'high'),
    { ...entry('2026-09-18', 'high'), optionLabelAtEntry: 'Excellent' }]);
  assert.equal(result.status, 'ready');
  assert.equal(result.rows[2].optionId, 'high');
  assert.equal(result.rows[2].currentPercentage, 100);
});

test('demo data follows the same pipeline and unusual Workout option order', () => {
  const demo = loadDemoDataset();
  const workout = demo.tasks.find(item => item.name === 'Workout')!;
  for (const days of [7, 30, 90]) {
    const endDate = '2026-09-22';
    const end = new Date(2026, 8, 22, 12);
    end.setDate(end.getDate() - days + 1);
    const startDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    const result = getPeriodComparison({ task: workout, entries: demo.entries,
      period: { startDate, endDate } });
    assert.equal(result.current.days, days);
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.rows.map(row => row.label), ['Skipped', 'Good', 'Poor', 'Average']);
    assert.equal(result.rows.reduce((sum, row) => sum + row.currentCount, 0),
      result.status === 'ready' ? result.current.recordedDays : 0);
  }
});

test('SQLite My Data entries use the same comparison pipeline', async () => {
  const db = await setup();
  try {
    const saved = await db.tasks.create({ name: 'Practice', options: [
      { id: 'none', label: 'None' }, { id: 'some', label: 'Some' }, { id: 'full', label: 'Full' },
    ] });
    await db.entries.upsert(saved.id, '2026-09-12', 'none');
    await db.entries.upsert(saved.id, '2026-09-19', 'full');
    const dataset = getAnalyticsDataset([(await db.tasks.getById(saved.id))!], await db.entries.getAll());
    const result = getPeriodComparison({ task: dataset.tasks[0], entries: dataset.entries,
      period: { startDate: '2026-09-18', endDate: '2026-09-24' } });
    assert.equal(result.status, 'ready');
    assert.equal(result.rows[0].previousPercentage, 100);
    assert.equal(result.rows[2].currentPercentage, 100);
    assert.equal(result.current.recordedDays, 1);
  } finally {
    db.native.close();
  }
});
