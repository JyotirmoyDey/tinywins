import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoDataset } from './demoDataset';
import { getInsightsPeriod } from '../src/analytics/insightsDateRange';
import { getJourneyTogether } from '../src/analytics/journeyTogether';

test('selected screenshot demo contains valid tasks and unique historical observations', () => {
  const dataset = loadDemoDataset();
  assert.ok(dataset.tasks.length > 0);
  assert.ok(dataset.entries.length > 0);
  assert.equal(new Set(dataset.tasks.map(task => task.id)).size, dataset.tasks.length);
  assert.equal(new Set(dataset.entries.map(entry => `${entry.taskId}:${entry.localDate}`)).size,
    dataset.entries.length);
  const dates = dataset.entries.map(entry => entry.localDate).sort();
  assert.equal(dates.at(-1), '2026-10-20');
  assert.ok(dataset.tasks.every(task => task.createdLocalDate === dates[0]));
  assert.ok(dataset.entries.every(entry => dataset.tasks.some(task => task.id === entry.taskId &&
    task.options.some(option => option.id === entry.optionId))));
  assert.deepEqual(dataset.lifecycle, []);
});

test('screenshot demo preserves historical levels, missing dates, and independent trends', () => {
  const dataset = loadDemoDataset();
  for (const task of dataset.tasks) {
    const entries = dataset.entries.filter(entry => entry.taskId === task.id);
    assert.ok(entries.length > 0);
    assert.ok(entries.some(entry => entry.normalizedWeightAtEntry === 0));
    assert.ok(entries.some(entry => entry.normalizedWeightAtEntry === 100));
  }
  const dates = dataset.entries.map(entry => entry.localDate).sort();
  const period = getInsightsPeriod(dates.at(-1)!, 'CUSTOM',
    { startDate: dates[0], endDate: dates.at(-1)! });
  const journey = getJourneyTogether({ dataset, period });
  assert.equal(journey.series.length, dataset.tasks.filter(task => task.includeInCombinedInsights).length);
  assert.ok(journey.dates[0] <= dates[0]); // Weekly axis begins at the week containing the range.
  assert.ok(journey.series.every(series => series.points.length > 0));
});
