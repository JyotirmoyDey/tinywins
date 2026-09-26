import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeekdayPatterns } from '../src/analytics/weekdayPatterns';
import { getInsightsPeriod } from '../src/analytics/insightsDateRange';
import { AnalyticsEntry, AnalyticsTask } from '../src/analytics/types';
import { RatingScaleVersion } from '../src/domain/task';
import { heatmapCellWidth, heatmapGridWidth } from '../src/components/analytics/weekdayPatternsLayout';
import { loadDemoDataset } from '../src/analytics/demoData';
import { getAnalyticsDataset } from '../src/analytics/service';
import { setup } from './sqlite';

const today = '2026-09-25';
const option = (id: string, label: string, index: number) =>
  ({ id, label, position: index + 1, rank: index + 1, normalizedWeight: index * 50 });
const task: AnalyticsTask = { id: 'study', name: 'Study', color: '#398F80', active: true,
  createdAt: '2026-08-01T08:00:00.000Z', updatedAt: '2026-09-25T08:00:00.000Z',
  currentScaleVersionId: 'v1', currentTrendEpochId: 'e1',
  options: [option('skipped', 'Skipped', 0), option('medium', 'Medium', 1), option('high', 'High', 2)] };
const version = (id: string, ids: string[], epoch = 'e1'): RatingScaleVersion => ({
  id, taskId: task.id, trendEpochId: epoch, createdAt: '2026-08-01T08:00:00.000Z',
  effectiveLocalDate: '2026-08-01', options: ids.map((optionId, index) =>
    ({ id: optionId, label: optionId, position: index + 1 })),
});
const versions = [version('v1', ['skipped', 'medium', 'high'])];
function entry(date: string, optionId: string, extras: Partial<AnalyticsEntry> = {}): AnalyticsEntry {
  return { id: `entry-${date}`, taskId: task.id, optionId, localDate: date,
    optionLabelAtEntry: optionId, positionAtEntry: task.options.find(item => item.id === optionId)?.position ?? 1,
    normalizedWeightAtEntry: optionId === 'skipped' ? 0 : optionId === 'medium' ? 50 : 100,
    scaleVersionIdAtEntry: 'v1', trendEpochIdAtEntry: 'e1', ...extras };
}
function run(startDate: string, endDate: string, entries: AnalyticsEntry[],
  timeline: '1D' | '7D' | '30D' | '90D' | 'CUSTOM' = 'CUSTOM',
  selectedTask = task, scales = versions) {
  return getWeekdayPatterns({ task: selectedTask, entries, versions: scales,
    period: { startDate, endDate }, timeline });
}

test('1D reports the actual historical label; missing day stays unrecorded', () => {
  const saved = run(today, today, [entry(today, 'skipped', { optionLabelAtEntry: 'Skipped' })], '1D');
  assert.equal(saved.status, 'today');
  assert.equal(saved.singleDayEntry?.optionLabelAtEntry, 'Skipped');
  const missing = run(today, today, [], '1D');
  assert.equal(missing.singleDayEntry, null);
  assert.equal(missing.recordedCount, 0);
});

test('a one-day custom range shows its selected historical date instead of calling it today', () => {
  const result = run('2026-09-08', '2026-09-08', [entry('2026-09-08', 'high')]);
  assert.equal(result.status, 'single-day');
  assert.equal(result.singleDate, '2026-09-08');
  assert.equal(result.singleDayEntry?.optionId, 'high');
});

test('7D and short custom ranges never imply a recurring pattern', () => {
  const seven = getInsightsPeriod(today, '7D', { startDate: today, endDate: today });
  assert.equal(run(seven.startDate, seven.endDate,
    [entry(today, 'high')], '7D').status, 'insufficient-range');
  assert.equal(run('2026-09-20', today, [entry(today, 'high')]).status, 'insufficient-range');
});

test('30D weekday percentages use recorded entries only and count the explicit lowest rating', () => {
  const entries = [entry('2026-09-07', 'skipped'), entry('2026-09-14', 'skipped'),
    entry('2026-09-21', 'medium'), entry('2026-09-08', 'high')];
  const result = run('2026-08-27', today, entries, '30D');
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.levels.map(level => level.id), ['skipped', 'medium', 'high']);
  const monday = result.rows[0];
  assert.equal(monday.total, 3);
  assert.deepEqual(monday.cells.map(cell => cell.count), [2, 1, 0]);
  assert.deepEqual(monday.cells.map(cell => Math.round(cell.percentage!)), [67, 33, 0]);
  assert.equal(result.rows[2].total, 0);
  assert.ok(result.rows[2].cells.every(cell => cell.percentage === null));
  assert.equal(result.recordedCount, 4);
  assert.equal(result.limitedSample, true);
});

test('90D and long custom ranges use their exact inclusive periods', () => {
  const entries = [entry('2026-06-29', 'skipped'), entry('2026-07-06', 'medium'),
    entry('2026-09-21', 'high'), entry('2026-09-26', 'high')];
  const period = getInsightsPeriod(today, '90D', { startDate: today, endDate: today });
  const result = run(period.startDate, period.endDate, entries, '90D');
  assert.equal(result.status, 'ready');
  assert.equal(result.rows[0].total, 3);
  assert.equal(run('2026-09-01', today, entries).recordedCount, 1);
});

test('unequal weekday denominators yield independent percentages', () => {
  const result = run('2026-09-01', today, [entry('2026-09-07', 'high'),
    entry('2026-09-14', 'medium'), entry('2026-09-08', 'high')]);
  assert.equal(result.rows[0].total, 2);
  assert.equal(result.rows[0].cells.find(cell => cell.optionId === 'high')?.percentage, 50);
  assert.equal(result.rows[1].total, 1);
  assert.equal(result.rows[1].cells.find(cell => cell.optionId === 'high')?.percentage, 100);
});

test('zero observations gives a neutral no-data state', () => {
  const result = run('2026-08-27', today, [], '30D');
  assert.equal(result.status, 'no-data');
  assert.ok(result.rows.every(row => row.total === 0 &&
    row.cells.every(cell => cell.percentage === null)));
});

test('user-defined order is authoritative for two through seven levels', () => {
  for (let count = 2; count <= 7; count++) {
    const ids = ['skipped', 'good', 'poor', 'average', 'extra1', 'extra2', 'extra3'].slice(0, count);
    const configured = { ...task, options: ids.map((id, index) => option(id, id, index)) };
    const result = run('2026-08-27', today, [entry('2026-09-21', 'good')], '30D',
      configured, [version('v1', ids)]);
    assert.deepEqual(result.levels.map(level => level.id), ids);
  }
});

test('compatible additions and archived levels retain the correctly ordered union', () => {
  const configured = { ...task, options: [option('skipped', 'Skipped', 0),
    option('good', 'Good', 1), option('high', 'High', 2)], currentScaleVersionId: 'v2' };
  const scales = [version('v1', ['skipped', 'medium', 'high']),
    version('v2', ['skipped', 'medium', 'good', 'high'])];
  const result = run('2026-08-27', today, [entry('2026-09-01', 'medium', {
    optionLabelAtEntry: 'Medium', scaleVersionIdAtEntry: 'v1' }),
  entry('2026-09-08', 'good', { scaleVersionIdAtEntry: 'v2' })], '30D', configured, scales);
  assert.deepEqual(result.levels.map(level => level.id), ['skipped', 'medium', 'good', 'high']);
  assert.equal(result.levels[1].active, false);
  assert.equal(result.recordedCount, 2);
});

test('renames retain stable identity and expose original saved labels', () => {
  const renamed = { ...task, options: [task.options[0],
    { ...task.options[1], label: 'Excellent' }, task.options[2]] };
  const result = run('2026-08-27', today, [entry('2026-09-01', 'medium', {
    optionLabelAtEntry: 'Medium' })], '30D', renamed);
  assert.equal(result.levels[1].label, 'Excellent');
  assert.deepEqual(result.rows[1].cells[1].historicalLabels, ['Medium']);
});

test('reordered scales from previous epochs are excluded and counted', () => {
  const reordered = { ...task, currentTrendEpochId: 'e2', currentScaleVersionId: 'v2',
    options: [task.options[0], { ...task.options[2], position: 2 },
      { ...task.options[1], position: 3 }] };
  const scales = [...versions, version('v2', ['skipped', 'high', 'medium'], 'e2')];
  const result = run('2026-08-27', today, [entry('2026-09-01', 'medium'),
    entry('2026-09-08', 'high', { scaleVersionIdAtEntry: 'v2', trendEpochIdAtEntry: 'e2' })],
  '30D', reordered, scales);
  assert.equal(result.recordedCount, 1);
  assert.equal(result.excludedHistoryCount, 1);
  assert.equal(result.rows[1].total, 1);
});

test('an incompatible order inside an epoch cannot silently enter the heatmap', () => {
  const scales = [...versions, version('bad', ['high', 'medium', 'skipped'])];
  const result = run('2026-08-27', today, [entry('2026-09-01', 'high', {
    scaleVersionIdAtEntry: 'bad' }), entry('2026-09-08', 'medium')], '30D', task, scales);
  assert.equal(result.recordedCount, 1);
  assert.equal(result.excludedHistoryCount, 1);
});

test('grid widths preserve 44-point cells and scroll on narrow phones with seven levels', () => {
  for (const screen of [280, 320, 390]) {
    for (const count of [2, 4, 7]) {
      const cell = heatmapCellWidth(screen, count, 43, 48, 49);
      assert.ok(cell >= 49);
      const grid = heatmapGridWidth(cell, count, 48);
      assert.ok(grid >= count * 49 + 48);
      if (count === 7 && screen <= 390) assert.ok(grid > screen - 43);
    }
  }
});

test('My Data and Demo Data pass through the same calculator without mixing entries', async () => {
  const db = await setup();
  try {
    const saved = await db.tasks.create({ name: 'Private study', options: [
      { id: 'skip', label: 'Skipped' }, { id: 'done', label: 'Done' },
    ] });
    await db.entries.upsert(saved.id, '2026-09-21', 'skip');
    const my = getAnalyticsDataset([(await db.tasks.getById(saved.id))!],
      await db.entries.getAll(), await db.tasks.getScaleVersions());
    const demo = loadDemoDataset();
    const range = { startDate: '2026-08-27', endDate: today };
    const own = getWeekdayPatterns({ task: my.tasks[0], entries: my.entries,
      versions: my.scaleVersions, period: range, timeline: '30D' });
    const workout = demo.tasks.find(item => item.name === 'Workout')!;
    const example = getWeekdayPatterns({ task: workout, entries: demo.entries,
      versions: demo.scaleVersions, period: range, timeline: '30D' });
    assert.equal(own.recordedCount, 1);
    assert.ok(example.recordedCount > 1);
    assert.deepEqual(example.levels.map(level => level.label),
      ['Skipped', 'Good', 'Poor', 'Average']);
  } finally { db.native.close(); }
});
