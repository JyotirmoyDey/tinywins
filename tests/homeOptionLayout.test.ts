import test from 'node:test';
import assert from 'node:assert/strict';
import { planHomeOptionRows } from '../src/components/homeOptionLayout';

for (const count of [2, 3, 4, 5, 7]) {
  test(`${count} short choices remain complete and ordered on a narrow phone`, () => {
    const labels = Array.from({ length: count }, (_, index) => `Opt ${index + 1}`);
    const rows = planHomeOptionRows(labels, 276);
    assert.deepEqual(rows.flat(), labels.map((_, index) => index));
    assert.ok(rows.length === 1 || rows.every(row => row.length <= 3));
    assert.ok(rows.length === 1 || rows.every(row => row.length >= 2));
  });
}
test('long labels use balanced rows and retain every choice at large text sizes', () => {
  const labels = ['Did not practice today', 'A short focused session', 'A fairly complete session', 'A long and thoughtful session', 'One exceptionally detailed response'];
  const rows = planHomeOptionRows(labels, 276, 1.5);
  assert.deepEqual(rows.flat(), [0, 1, 2, 3, 4]);
  assert.deepEqual(rows.map(row => row.length), [2, 2, 1]);
});
