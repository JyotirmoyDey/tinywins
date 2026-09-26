import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoDataset } from '../src/analytics/demoData';
import { getInsightsPeriod } from '../src/analytics/insightsDateRange';
import { getJourneyTogether } from '../src/analytics/journeyTogether';

test('one-year organic demo contains eight isolated tasks and unique historical observations', () => {
  const dataset = loadDemoDataset();
  assert.equal(dataset.tasks.length, 8);
  assert.equal(dataset.entries.length, 2245);
  assert.equal(new Set(dataset.tasks.map(task => task.id)).size, 8);
  assert.equal(new Set(dataset.entries.map(entry => `${entry.taskId}:${entry.localDate}`)).size,
    dataset.entries.length);
  assert.equal(dataset.entries.map(entry => entry.localDate).sort()[0], '2025-09-27');
  assert.equal(dataset.entries.map(entry => entry.localDate).sort().at(-1), '2026-09-26');
  assert.ok(dataset.tasks.every(task => task.createdLocalDate === '2025-09-27'));
  assert.ok(dataset.entries.every(entry => dataset.tasks.some(task => task.id === entry.taskId &&
    task.options.some(option => option.id === entry.optionId))));
  assert.deepEqual(dataset.lifecycle, []);
});

test('one-year demo preserves historical values, missing dates, and all eight independent trends', () => {
  const dataset = loadDemoDataset();
  const workout = dataset.tasks.find(task => task.id === 'workout')!;
  assert.deepEqual(workout.options.map(option => option.label),
    ['Skipped', 'Good', 'Poor', 'Average']);
  assert.ok(dataset.entries.some(entry => entry.taskId === workout.id &&
    entry.normalizedWeightAtEntry === 0));
  assert.ok(dataset.entries.some(entry => entry.taskId === workout.id &&
    entry.normalizedWeightAtEntry === 100));
  assert.ok(dataset.entries.filter(entry => entry.taskId === workout.id).length < 365);
  const period = getInsightsPeriod('2026-09-26', 'CUSTOM',
    { startDate: '2025-09-27', endDate: '2026-09-26' });
  const journey = getJourneyTogether({ dataset, period });
  assert.equal(journey.series.length, 8);
  assert.equal(journey.dates[0], '2025-09-22'); // Week containing the first selected day.
  assert.ok(journey.series.every(series => series.points.length > 0));
});
