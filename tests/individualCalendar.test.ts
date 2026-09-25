import assert from 'node:assert/strict';
import test from 'node:test';
import type { RatingScaleVersion } from '../src/domain/task';
import type { AnalyticsEntry, AnalyticsTask } from '../src/analytics/types';
import { loadDemoDataset } from '../src/analytics/demoData';
import { calendarLevels, individualCalendarData, matchingDateCount,
  matchesCalendarFilter, toggleCalendarLevel } from '../src/components/analytics/individualCalendar';
import { sliderColor } from '../src/components/sliderMath';
import { calendarCellSize, monthGridDates } from '../src/components/analytics/calendarLayout';

const task: AnalyticsTask = {
  id: 't', name: 'Practice', active: true, createdAt: '2026-08-01T12:00:00Z',
  updatedAt: '2026-09-01T12:00:00Z', currentScaleVersionId: 'v2',
  currentTrendEpochId: 'epoch', color: '#398F80',
  options: [
    { id: 'low', label: 'Low', position: 1, rank: 1, normalizedWeight: 0 },
    { id: 'good', label: 'Good', position: 2, rank: 2, normalizedWeight: 50 },
    { id: 'perfect', label: 'Perfect', position: 3, rank: 3, normalizedWeight: 100 },
  ],
};
const versions: RatingScaleVersion[] = [
  { id: 'v1', taskId: 't', trendEpochId: 'epoch', createdAt: '2026-08-01T12:00:00Z',
    effectiveLocalDate: '2026-08-01', options: [
      { id: 'low', label: 'Low', position: 1 },
      { id: 'retired', label: 'Okay', position: 2 },
      { id: 'good', label: 'Good', position: 3 },
      { id: 'perfect', label: 'Perfect', position: 4 },
    ] },
  { id: 'v2', taskId: 't', trendEpochId: 'epoch', createdAt: '2026-09-01T12:00:00Z',
    effectiveLocalDate: '2026-09-01', options: task.options.map(option =>
      ({ id: option.id, label: option.label, position: option.position })) },
];
function entry(day: string, optionId: string, label: string, position: number, version = 'v2'): AnalyticsEntry {
  return { id: `${day}-${optionId}`, taskId: 't', localDate: day, optionId,
    optionLabelAtEntry: label, positionAtEntry: position, normalizedWeightAtEntry: 0,
    scaleVersionIdAtEntry: version, trendEpochIdAtEntry: 'epoch' };
}
const entries: AnalyticsEntry[] = [
  ...Array.from({ length: 7 }, (_, index) => entry(`2026-09-${String(index + 1).padStart(2, '0')}`, 'good', 'Good', 2)),
  ...Array.from({ length: 4 }, (_, index) => entry(`2026-09-${String(index + 8).padStart(2, '0')}`, 'perfect', 'Perfect', 3)),
  entry('2026-09-12', 'retired', 'Okay', 2, 'v1'),
  entry('2026-09-13', 'low', 'Low', 1),
  entry('2026-10-01', 'perfect', 'Perfect', 3),
];

test('level filters toggle independently and count distinct matching dates', () => {
  const september = individualCalendarData(task, entries, versions, '2026-09');
  assert.deepEqual(september.levels.map(level => level.id), ['low', 'retired', 'good', 'perfect']);
  assert.equal(matchingDateCount(september.cells, null), 13);
  const available = september.levels.map(level => level.id);
  let selection: Set<string> | null = new Set(); // None
  assert.equal(matchingDateCount(september.cells, selection), 0);
  selection = toggleCalendarLevel(selection, 'good', available);
  selection = toggleCalendarLevel(selection, 'perfect', available);
  assert.equal(matchingDateCount(september.cells, selection), 11);
  selection = toggleCalendarLevel(selection, 'good', available);
  assert.equal(matchingDateCount(september.cells, selection), 4);
  const october = individualCalendarData(task, entries, versions, '2026-10');
  assert.equal(matchingDateCount(october.cells, selection), 1);
  assert.equal(matchingDateCount(september.cells, selection), 4); // selection survives month navigation
  assert.equal(matchingDateCount(september.cells, new Set()), 0);
  assert.equal(matchingDateCount(september.cells, null), 13);
  assert.equal(matchingDateCount([
    entryCell('2026-09-08', 'perfect'), entryCell('2026-09-08', 'perfect'),
  ], new Set(['perfect'])), 1);
});

function entryCell(date: string, optionId: string) { return { date, optionId }; }

test('archived identities remain filterable and use their historical shade and label', () => {
  const september = individualCalendarData(task, entries, versions, '2026-09');
  assert.equal(september.levels.find(level => level.id === 'retired')?.active, false);
  assert.equal(september.levels.find(level => level.id === 'retired')?.label, 'Okay');
  const archivedDay = september.cells.find(cell => cell.date === '2026-09-12')!;
  assert.equal(archivedDay.shade, sliderColor(1, 4));
  assert.equal(archivedDay.label, 'Okay');
  assert.equal(matchesCalendarFilter(archivedDay, new Set(['retired'])), true);
  assert.equal(matchesCalendarFilter(archivedDay, new Set(['good'])), false);
  assert.equal(matchingDateCount(september.cells, new Set(['retired'])), 1);
  assert.equal(september.cells.find(cell => cell.date === '2026-09-14')?.label, undefined);
  assert.equal(september.levels.find(level => level.id === 'low')?.active, true);
  assert.equal(matchingDateCount(september.cells, new Set(['low'])), 1);
  assert.equal(calendarLevels(task, entries.filter(item => item.localDate.startsWith('2026-10-')), versions)
    .some(level => level.id === 'retired'), false);
});

test('same option ID keeps historical day label after a current rename', () => {
  const renamed = { ...task, options: task.options.map(option =>
    option.id === 'good' ? { ...option, label: 'Excellent' } : option) };
  const september = individualCalendarData(renamed, entries, versions, '2026-09');
  assert.equal(september.levels.find(level => level.id === 'good')?.label, 'Excellent');
  assert.equal(september.cells.find(cell => cell.date === '2026-09-01')?.label, 'Good');
});

test('demo Workout follows its unusual configured order and keeps missing days neutral', () => {
  const demo = loadDemoDataset();
  const workout = demo.tasks.find(item => item.name === 'Workout')!;
  assert.deepEqual(workout.options.map(option => option.label), ['Skipped', 'Good', 'Poor', 'Average']);
  const month = individualCalendarData(workout, demo.entries, demo.scaleVersions, '2026-09');
  assert.deepEqual(month.levels.map(level => level.label), ['Skipped', 'Good', 'Poor', 'Average']);
  assert.equal(matchingDateCount(month.cells, null),
    demo.entries.filter(item => item.taskId === workout.id && item.localDate.startsWith('2026-09-')).length);
  for (const cell of month.cells) {
    if (!cell.optionId) assert.equal(matchesCalendarFilter(cell, null), false);
  }
});

test('seven calendar columns fit a narrow iPhone card without horizontal overflow', () => {
  // 320-point screen, 20-point page margins and 16-point card padding per side.
  const cardContentWidth = 320 - 20 * 2 - 16 * 2;
  const cellSize = calendarCellSize(cardContentWidth);
  assert.ok(cellSize > 0);
  assert.ok(cellSize * 7 + 4 * 6 <= cardContentWidth);
  assert.equal(monthGridDates('2026-09').length % 7, 0);
});
