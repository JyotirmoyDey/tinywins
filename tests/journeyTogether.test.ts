import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoDataset } from '../src/analytics/demoData';
import { getInsightsPeriod } from '../src/analytics/insightsDateRange';
import { colorsByTaskId, getJourneyTogether, journeyTogetherConfig,
  visibleJourneyTasks } from '../src/analytics/journeyTogether';
import { setup } from './sqlite';
import { getAnalyticsDataset } from '../src/analytics/service';

const demo = loadDemoDataset();
const today = '2026-09-22';
const custom = { startDate: '2026-08-01', endDate: today };
function period(preset: '1D' | '7D' | '30D' | '90D') {
  return getInsightsPeriod(today, preset, custom);
}

test('demo activities retain independent categorical scales and one aligned daily axis', () => {
  const result = getJourneyTogether({ dataset: demo, period: period('30D') });
  assert.equal(result.kind, 'daily');
  assert.equal(result.dates.length, 30);
  assert.deepEqual(result.series.map(series => series.taskName),
    demo.tasks.map(task => task.name));
  assert.deepEqual(demo.tasks.find(task => task.name === 'Workout')!.options.map(option => option.label),
    ['Skipped', 'Good', 'Poor', 'Average']);
  assert.deepEqual(result.series.map(series => series.levelCount), [4, 3, 4, 3, 5, 5, 3, 4]);
  assert.equal(new Set(result.series.map(series => series.color)).size, 8);
  for (const series of result.series) for (const point of series.points) {
    assert.equal(result.dates[point.slotIndex], point.date);
    assert.ok(point.levelIndex >= 0 && point.levelIndex < series.levelCount);
  }
});

test('1D shows actual observations, and missing days never become lowest ratings', () => {
  const onlyWorkout = { ...demo, tasks: demo.tasks.slice(0, 1), entries: [] };
  const empty = getJourneyTogether({ dataset: onlyWorkout, period: period('1D') });
  assert.equal(empty.kind, 'today');
  assert.equal(empty.series[0].latestRating, null);
  assert.equal(empty.series[0].points.length, 0);
  const workout = demo.tasks[0];
  const recorded = demo.entries.find(entry => entry.taskId === workout.id)!;
  const result = getJourneyTogether({ dataset: { ...onlyWorkout, entries: [recorded] },
    period: { startDate: recorded.localDate, endDate: recorded.localDate } });
  assert.equal(result.series[0].points.length, 1);
  assert.equal(result.series[0].points[0].label, recorded.optionLabelAtEntry);
});

test('7D and 30D use daily observations; 90D and long custom ranges reuse grouped medians', () => {
  for (const preset of ['7D', '30D'] as const) {
    const result = getJourneyTogether({ dataset: demo, period: period(preset) });
    assert.equal(result.kind, 'daily');
    assert.equal(result.dates.length, Number.parseInt(preset, 10));
    assert.ok(result.series.every(series => series.points.every(point => point.recordedCount === 1)));
  }
  const weekly = getJourneyTogether({ dataset: demo, period: period('90D') });
  assert.equal(weekly.kind, 'grouped');
  assert.ok(weekly.dates.length <= 15);
  assert.ok(weekly.series.some(series => series.points.some(point => point.recordedCount > 1)));
  assert.ok(weekly.series.every(series => series.points.every(point =>
    weekly.dates[point.slotIndex] === point.date)));
  const longer = getJourneyTogether({ dataset: demo,
    period: { startDate: '2026-06-01', endDate: today } });
  assert.equal(longer.kind, 'grouped');
  assert.ok(longer.dates.length <= 15);
});

test('gaps and incompatible scales interrupt only the affected activity', () => {
  const [first, second] = demo.tasks;
  const dates = ['2026-09-19', '2026-09-20', '2026-09-22'];
  const entries = dates.flatMap((date, index) => [first, second].map(task => ({
    ...demo.entries.find(entry => entry.taskId === task.id)!,
    id: `${task.id}-${date}`, taskId: task.id, localDate: date,
    optionId: task.options[index % task.options.length].id,
    optionLabelAtEntry: task.options[index % task.options.length].label,
    scaleVersionIdAtEntry: task.id === first.id && index === 1 ? 'another-scale' : `demo-scale-${task.id}`,
  })));
  const result = getJourneyTogether({ dataset: { ...demo, tasks: [first, second], entries },
    period: { startDate: dates[0], endDate: dates[2] } });
  assert.deepEqual(result.series[0].points.map(point => point.connectsToPrevious), [false, false, false]);
  assert.deepEqual(result.series[1].points.map(point => point.connectsToPrevious), [false, true, false]);
  assert.equal(result.dates[2], '2026-09-21');
});

test('a task trend reset does not change another task trend', () => {
  const reset = { ...demo.tasks[0], currentTrendEpochId: 'new-epoch' };
  const result = getJourneyTogether({ dataset: { ...demo, tasks: [reset, demo.tasks[1]] },
    period: period('90D') });
  assert.equal(result.series[0].points.length, 0);
  assert.ok(result.series[1].points.length > 0);
});

test('colors follow stable IDs, not order, names or the first-four presentation', () => {
  const ids = Array.from({ length: 10 }, (_, index) => `task-${index}`);
  const original = colorsByTaskId(ids);
  const reordered = colorsByTaskId([...ids].reverse());
  assert.deepEqual(original, reordered);
  assert.equal(new Set(original.values()).size, 10);
  assert.equal(visibleJourneyTasks(ids, false).length, 4);
  assert.equal(visibleJourneyTasks(ids, true).length, 10);
  assert.equal(journeyTogetherConfig.title, 'Your Journey Together');
});

test('My Data SQLite entries feed the same independent trend pipeline as Demo Data', async () => {
  const db = await setup();
  try {
    const guitar = await db.tasks.create({ name: 'Guitar', options: [
      { id: 'g-low', label: 'Low' }, { id: 'g-high', label: 'High' },
    ] });
    const study = await db.tasks.create({ name: 'Study', options: [
      { id: 's-low', label: 'Low' }, { id: 's-middle', label: 'Middle' }, { id: 's-high', label: 'High' },
    ] });
    await db.entries.upsert(guitar.id, '2026-09-21', guitar.options[1].id);
    await db.entries.upsert(study.id, '2026-09-22', study.options[0].id);
    const dataset = getAnalyticsDataset(await db.tasks.getAll(), await db.entries.getAll(),
      await db.tasks.getScaleVersions());
    const result = getJourneyTogether({ dataset,
      period: { startDate: '2026-09-20', endDate: '2026-09-22' } });
    assert.deepEqual(result.series.map(series => series.latestRating), ['High', 'Low']);
    assert.deepEqual(result.series.map(series => series.levelCount), [2, 3]);
    assert.deepEqual(result.series.map(series => series.points[0].slotIndex), [1, 2]);
    assert.equal(result.series[0].points[0].connectsToPrevious, false);
  } finally {
    db.native.close();
  }
});
