import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoDataset } from '../src/analytics/demoData';
import { createEntrySnapshot, DailyEntry, normalizeOptions } from '../src/domain/task';
import { SLIDER_INSET, sliderColor, sliderDisplay, sliderIndexFromX, sliderXForIndex } from '../src/components/sliderMath';

function entryFor(option: ReturnType<typeof normalizeOptions>[number]): DailyEntry {
  return { id: 'entry', taskId: option.taskId, localDate: '2026-09-24', createdAt: '2026-09-24T12:00:00Z', updatedAt: '2026-09-24T12:00:00Z', ...createEntrySnapshot(option), scaleVersionIdAtEntry: 'scale', trendEpochIdAtEntry: 'epoch' };
}

test('every slider notch maps exactly to one ordered option for 2–7 choices', () => {
  const width = 286;
  for (const count of [2, 3, 4, 5, 7]) {
    const seen = new Set<number>();
    for (let index = 0; index < count; index++) {
      const x = sliderXForIndex(index, width, count);
      assert.equal(sliderIndexFromX(x, width, count), index);
      seen.add(sliderIndexFromX(x, width, count));
    }
    assert.equal(seen.size, count);
    assert.equal(sliderIndexFromX(-100, width, count), 0);
    assert.equal(sliderIndexFromX(width + 100, width, count), count - 1);
    assert.equal(sliderXForIndex(0, width, count), SLIDER_INSET);
  }
});

test('teal shades follow user-defined position, including the demo Workout order', () => {
  for (const count of [2, 3, 4, 5, 7]) {
    assert.equal(sliderColor(0, count), '#B8DCD2');
    assert.equal(sliderColor(count - 1, count), '#20695D');
    assert.equal(new Set(Array.from({ length: count }, (_, i) => sliderColor(i, count))).size, count);
  }
  const workout = loadDemoDataset().tasks.find(task => task.id === 'workout')!;
  assert.deepEqual(workout.options.map(option => option.label), ['Skipped', 'Good', 'Poor', 'Average']);
  assert.equal(workout.options[1].normalizedWeight, 33);
  assert.equal(sliderColor(1, 4), '#79BDAE');
});

test('unrecorded is distinct from the first response and a retired option keeps its saved label', () => {
  const options = normalizeOptions('study', [
    { id: 'low-id', label: 'Low' }, { id: 'medium-id', label: 'Medium' }, { id: 'high-id', label: 'High' },
  ]);
  assert.deepEqual(sliderDisplay(options), { selectedIndex: -1, label: 'Not recorded' });
  const lowest = entryFor(options[0]);
  assert.deepEqual(sliderDisplay(options, lowest), { selectedIndex: 0, label: 'Low' });
  assert.equal(lowest.normalizedWeightAtEntry, 0);
  const medium = entryFor(options[1]);
  assert.deepEqual(sliderDisplay(options.filter(option => option.id !== medium.optionId), medium), { selectedIndex: -1, label: 'Medium' });
  assert.equal(options[sliderIndexFromX(sliderXForIndex(1, 286, 3), 286, 3)].id, medium.optionId);
});
