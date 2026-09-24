import test from 'node:test';
import assert from 'node:assert/strict';
import { movePosition, positionsForIds } from '../src/components/optionOrdering';

test('dragging upward shifts each crossed choice down and leaves others still', () => {
  const initial = positionsForIds(['a', 'b', 'c', 'd']);
  assert.deepEqual(movePosition(initial, 'c', 0), { a: 1, b: 2, c: 0, d: 3 });
  assert.deepEqual(initial, { a: 0, b: 1, c: 2, d: 3 });
});
test('dragging downward opens a slot and supports reversing direction mid-drag', () => {
  const initial = positionsForIds(['a', 'b', 'c', 'd']);
  const down = movePosition(initial, 'a', 3);
  assert.deepEqual(down, { a: 3, b: 0, c: 1, d: 2 });
  assert.deepEqual(movePosition(down, 'a', 1), { a: 1, b: 0, c: 2, d: 3 });
  assert.deepEqual(movePosition(down, 'a', 0), initial);
});
test('all supported list sizes preserve unique contiguous slots through repeated moves', () => {
  for (let count = 2; count <= 7; count++) {
    const ids = Array.from({ length: count }, (_, i) => `choice-${i}`);
    let positions = positionsForIds(ids);
    for (const id of ids) {
      for (let to = -1; to <= count; to++) {
        positions = movePosition(positions, id, to);
        assert.deepEqual(Object.values(positions).sort((a, b) => a - b), ids.map((_, i) => i));
        assert.equal(positions[id], Math.max(0, Math.min(count - 1, to)));
      }
    }
  }
});
test('staying in the same slot avoids publishing an unnecessary animation update', () => {
  const positions = positionsForIds(['a', 'b']);
  assert.equal(movePosition(positions, 'a', 0), positions);
  assert.equal(movePosition(positions, 'missing', 1), positions);
});
