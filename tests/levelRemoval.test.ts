import assert from 'node:assert/strict';
import test from 'node:test';
import { removeDraftLevel, restoreDraftLevel } from '../src/components/levelRemoval';
import { OptionDraft } from '../src/domain/task';

const levels: OptionDraft[] = [
  { id: 'one', label: 'First', description: 'first description' },
  { id: 'two', label: 'Second', description: 'second description' },
  { id: 'three', label: 'Third', description: 'third description' },
  { id: 'four', label: 'Fourth', description: 'fourth description' },
  { id: 'five', label: 'Fifth', description: 'fifth description' },
];

test('undo restores the full level draft at its original position', () => {
  const removed = removeDraftLevel(levels, 'two', 3);
  assert.ok(removed);
  assert.deepEqual(removed.options.map(option => option.id), ['one', 'three', 'four', 'five']);
  assert.deepEqual(restoreDraftLevel(removed.options, removed.removed), levels);
});

test('sequential undo restores the most recently removed level first', () => {
  const first = removeDraftLevel(levels, 'two', 3);
  assert.ok(first);
  const second = removeDraftLevel(first.options, 'four', 3);
  assert.ok(second);
  const latestRestored = restoreDraftLevel(second.options, second.removed);
  assert.deepEqual(latestRestored.map(option => option.id), ['one', 'three', 'four', 'five']);
  assert.deepEqual(restoreDraftLevel(latestRestored, first.removed), levels);
});

test('minimum of three levels and duplicate undo are guarded', () => {
  const first = removeDraftLevel(levels, 'one', 3);
  assert.ok(first);
  const second = removeDraftLevel(first.options, 'two', 3);
  assert.ok(second);
  assert.equal(removeDraftLevel(second.options, 'three', 3), null);
  assert.equal(removeDraftLevel(levels, 'missing', 3), null);
  const restored = restoreDraftLevel(second.options, second.removed);
  assert.equal(restoreDraftLevel(restored, second.removed), restored);
});
