import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, parseLocalDate } from '../src/domain/task';
import { RatingTrendData, TrendObservation, getRatingTrend } from '../src/analytics/ratingTrend';
import { getAdaptiveTrend, getWeeklyRatingTrend, mondayOf, weeklyLabelIndices } from '../src/analytics/ratingTrendPresentation';
import { loadDemoDataset } from '../src/analytics/demoData';

const names = ['Skipped', 'Average', 'High'];
function fixture(dayCount: number, selected: { day: number; level: number; version?: string }[],
  startDate = '2026-06-01', labels = names): RatingTrendData {
  const start = parseLocalDate(startDate);
  const dates = Array.from({ length: dayCount }, (_, index) => {
    const day = new Date(start); day.setDate(start.getDate() + index); return localDate(day);
  });
  const observations: TrendObservation[] = selected.map(item => ({
    date: dates[item.day], optionId: `option-${item.level}`, labelAtEntry: labels[item.level],
    levelIndex: item.level, scaleVersionId: item.version ?? 'scale-a',
    connectsToPrevious: item.day > 0 && selected.some(previous =>
      previous.day === item.day - 1 && (previous.version ?? 'scale-a') === (item.version ?? 'scale-a')),
  })).sort((a, b) => a.date.localeCompare(b.date));
  return { dates, observations, levels: labels.map((label, index) => ({ id: `option-${index}`, label, active: true })),
    scaleChangeDates: [], epochId: 'epoch', isNewEpochEmpty: false };
}
test('adaptive modes preserve one rating and draw lines for two or more observations', () => {
  const empty = fixture(90, []);
  assert.equal(getAdaptiveTrend(empty, '90D').presentation, 'empty');
  assert.equal(getAdaptiveTrend(fixture(1, [{ day: 0, level: 1 }]), '1D').presentation, 'today');
  assert.equal(getAdaptiveTrend(fixture(90, [{ day: 2, level: 0 }]), '90D').presentation, 'sparse');
  assert.equal(getAdaptiveTrend(fixture(90, [{ day: 2, level: 0 }, { day: 83, level: 2 }]), '90D').presentation, 'weekly');
  assert.equal(getAdaptiveTrend(fixture(7, [{ day: 2, level: 0 }, { day: 3, level: 2 }]), '7D').presentation, 'daily-line');
  assert.equal(getAdaptiveTrend(fixture(7, [0, 1, 2].map(day => ({ day, level: day % 3 }))), '7D').presentation, 'daily-line');
  assert.equal(getAdaptiveTrend(fixture(30, Array.from({ length: 20 }, (_, day) => ({ day, level: day % 3 }))), '30D').presentation, 'daily-line');
  assert.equal(getAdaptiveTrend(fixture(90, Array.from({ length: 72 }, (_, day) => ({ day, level: day % 3 }))), '90D').presentation, 'weekly');
});
test('custom duration changes only presentation; every daily observation stays available', () => {
  for (const [days, expected] of [[14, 'daily-line'], [15, 'daily-line'], [60, 'daily-line'], [61, 'weekly'], [180, 'weekly']] as const) {
    const selected = Array.from({ length: Math.min(days, 75) }, (_, day) => ({ day, level: day % 3 }));
    const data = fixture(days, selected);
    const view = getAdaptiveTrend(data, 'CUSTOM');
    assert.equal(view.presentation, expected);
    assert.equal(view.recordedCount, selected.length);
    if (view.presentation === 'weekly')
      assert.equal(view.weeklyPoints.reduce((sum, point) => sum + point.observations.length, 0), selected.length);
  }
});
test('weekly median chooses an existing ordered category, using lower middle for an even week', () => {
  const data = fixture(14, [
    { day: 0, level: 2 }, { day: 1, level: 0 }, { day: 2, level: 1 }, { day: 3, level: 2 },
    { day: 7, level: 2 }, { day: 8, level: 1 }, { day: 9, level: 0 },
  ]);
  const { weeklyPoints } = getWeeklyRatingTrend(data);
  assert.equal(weeklyPoints.length, 2);
  assert.equal(weeklyPoints[0].medianLevelIndex, 1); // sorted 0,1,2,2
  assert.equal(weeklyPoints[0].medianLabel, 'Average');
  assert.equal(weeklyPoints[0].minLabel, 'Skipped');
  assert.equal(weeklyPoints[0].maxLabel, 'High');
  assert.equal(weeklyPoints[0].observations.length, 4);
  assert.deepEqual(weeklyPoints[0].distribution.map(item => [item.label, item.count]),
    [['Skipped', 1], ['Average', 1], ['High', 2]]);
  assert.equal(weeklyPoints[1].medianLevelIndex, 1); // sorted 0,1,2
  assert.equal(weeklyPoints[1].connectsToPrevious, true);
});
test('missing calendar weeks keep empty slots and interrupt the weekly line', () => {
  const data = fixture(28, [{ day: 0, level: 0 }, { day: 1, level: 1 }, { day: 21, level: 2 }]);
  const { weeks, weeklyPoints } = getWeeklyRatingTrend(data);
  assert.equal(weeks.length, 4);
  assert.equal(weeklyPoints.length, 2);
  assert.equal(weeklyPoints[1].connectsToPrevious, false);
  assert.ok(!weeklyPoints.some(point => point.weekStart === weeks[1] || point.weekStart === weeks[2]));
});
test('a mid-week scale change yields separate weekly markers without mixing medians or a connecting line', () => {
  const data = fixture(14, [
    { day: 0, level: 0, version: 'old' }, { day: 1, level: 2, version: 'old' },
    { day: 2, level: 1, version: 'new' }, { day: 3, level: 1, version: 'new' },
    { day: 7, level: 2, version: 'new' },
  ]);
  const { weeklyPoints } = getWeeklyRatingTrend(data);
  assert.equal(weeklyPoints.length, 3);
  assert.deepEqual(weeklyPoints.slice(0, 2).map(point => point.observations.length), [2, 2]);
  assert.equal(weeklyPoints[0].medianLevelIndex, 0);
  assert.equal(weeklyPoints[1].medianLevelIndex, 1);
  assert.equal(weeklyPoints[1].connectsToPrevious, false);
  assert.equal(weeklyPoints[2].connectsToPrevious, true);
  assert.notEqual(weeklyPoints[0].id, weeklyPoints[1].id);
});
test('historical edits can alternate scale versions without merging disjoint weekly segments', () => {
  const data = fixture(14, [
    { day: 0, level: 0, version: 'old' },
    { day: 1, level: 2, version: 'new' },
    { day: 2, level: 1, version: 'old' },
    { day: 7, level: 1, version: 'old' },
  ]);
  const { weeklyPoints } = getWeeklyRatingTrend(data);
  assert.deepEqual(weeklyPoints.map(point => point.scaleVersionId), ['old', 'new', 'old', 'old']);
  assert.deepEqual(weeklyPoints.slice(0, 3).map(point => point.observations.length), [1, 1, 1]);
  assert.equal(weeklyPoints[3].connectsToPrevious, true);
});

test('unusual user order and long labels stay categorical and readable in weekly data', () => {
  const labels = ['Skipped entirely', 'A surprisingly long custom middle response', 'High'];
  const data = fixture(7, [{ day: 0, level: 0 }, { day: 1, level: 1 }, { day: 2, level: 2 }], '2026-06-01', labels);
  const point = getWeeklyRatingTrend(data).weeklyPoints[0];
  assert.equal(point.medianLabel, labels[1]);
  assert.equal(point.observations[1].labelAtEntry, labels[1]);
  assert.equal(point.minLabel, labels[0]);
});
test('weeks start Monday in the local calendar and month labels favor transitions', () => {
  assert.equal(mondayOf('2026-09-20'), '2026-09-14');
  assert.equal(mondayOf('2026-09-21'), '2026-09-21');
  const data = fixture(90, Array.from({ length: 70 }, (_, day) => ({ day, level: day % 3 })));
  const weeks = getWeeklyRatingTrend(data).weeks;
  assert.ok(weeks.length >= 12 && weeks.length <= 14);
  const ticks = weeklyLabelIndices(weeks, 4);
  assert.equal(ticks[0], 0);
  assert.equal(ticks.at(-1), weeks.length - 1);
  assert.ok(ticks.length <= 4);
  assert.ok(ticks.some(index => index > 0 && weeks[index].slice(0, 7) !== weeks[index - 1].slice(0, 7)));
});
test('demo 90-day workout keeps all daily records while presenting weekly summaries', () => {
  const dataset = loadDemoDataset();
  const task = dataset.tasks.find(item => item.id === 'workout')!;
  assert.deepEqual(task.options.map(option => option.label), ['Skipped', 'Good', 'Poor', 'Average']);
  const data = getRatingTrend({ task, entries: dataset.entries, versions: dataset.scaleVersions,
    period: { startDate: '2026-06-25', endDate: '2026-09-22' } });
  const view = getAdaptiveTrend(data, '90D');
  assert.equal(view.presentation, 'weekly');
  assert.equal(view.weeklyPoints.reduce((sum, point) => sum + point.observations.length, 0), data.observations.length);
  assert.ok(view.weeklyPoints.every(point => Number.isInteger(point.medianLevelIndex)));
  assert.ok(view.weeklyPoints.every(point => point.observations.every(day => day.scaleVersionId === point.scaleVersionId)));
});

test('portrait grouping uses daily, two-day, and calendar-week slots with at most 15 points', () => {
  const demo = loadDemoDataset();
  const task = demo.tasks.find(item => item.id === 'workout')!;
  for (const [range, startDate, expectedSlots, subtitle] of [
    ['7D', '2026-09-16', 7, 'Daily trend'],
    ['30D', '2026-08-24', 15, '2-day median'],
    ['90D', '2026-06-25', 14, 'Weekly median'],
  ] as const) {
    const data = getRatingTrend({ task, entries: demo.entries, versions: demo.scaleVersions,
      period: { startDate, endDate: '2026-09-22' } });
    const view = getAdaptiveTrend(data, range);
    assert.equal(view.slots.length, expectedSlots);
    assert.equal(view.subtitle, subtitle);
    assert.ok(view.groupedPoints.length <= 15);
    assert.ok(view.groupedPoints.every(point => point.slotIndex < view.slots.length));
    assert.ok(view.groupedPoints.every(point => Number.isInteger(point.medianLevelIndex)));
    assert.equal(view.recordedCount, data.observations.length);
  }
});

test('portrait medians exclude missing days and use the lower actual rating for even groups', () => {
  const data = fixture(30, [
    { day: 0, level: 0 }, { day: 1, level: 2 },
    { day: 6, level: 2 },
    { day: 8, level: 1 }, { day: 9, level: 2 },
  ]);
  const view = getAdaptiveTrend(data, '30D');
  assert.equal(view.slots.length, 15);
  assert.deepEqual(view.groupedPoints.map(point => [point.slotIndex, point.medianLevelIndex, point.recordedCount]),
    [[0, 0, 2], [3, 2, 1], [4, 1, 2]]);
  assert.deepEqual(view.groupedPoints.map(point => point.connectsToPrevious), [false, false, true]);
  assert.equal(view.groupedPoints.reduce((sum, point) => sum + point.recordedCount, 0), 5);
});

test('a two-day slot spanning incompatible scales stays blank while expanded observations survive', () => {
  const data = fixture(30, [
    { day: 0, level: 0, version: 'old' }, { day: 1, level: 2, version: 'new' },
    { day: 2, level: 1, version: 'new' }, { day: 3, level: 2, version: 'new' },
    { day: 4, level: 0, version: 'new' },
  ]);
  const view = getAdaptiveTrend(data, '30D');
  assert.equal(view.mixedScaleSlots, 1);
  assert.deepEqual(view.groupedPoints.map(point => point.slotIndex), [1, 2]);
  assert.deepEqual(view.groupedPoints.map(point => point.connectsToPrevious), [false, true]);
  assert.equal(data.observations.length, 5);
});

test('long custom ranges grow from day groups to multi-week groups without exceeding the cap', () => {
  for (const [days, subtitle] of [
    [16, '2-day median'], [31, '3-day median'], [45, '3-day median'],
    [60, '4-day median'], [90, 'Weekly median'], [180, '2-week median'],
    [365, '4-week median'], [720, '8-week median'],
  ] as const) {
    const data = fixture(days, Array.from({ length: days }, (_, day) => ({ day, level: day % 3 })));
    const view = getAdaptiveTrend(data, 'CUSTOM');
    assert.equal(view.subtitle, subtitle);
    assert.ok(view.slots.length <= 15);
    assert.ok(view.groupedPoints.length <= 15);
    assert.equal(view.recordedCount, days);
  }
});
