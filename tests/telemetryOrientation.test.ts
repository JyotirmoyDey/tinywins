import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrientationTransitionTracker, normalizeOrientation } from '../src/telemetry/orientationState';

test('orientation telemetry emits only actual normalized transitions', () => {
  const tracker = createOrientationTransitionTracker();
  const changes = [1, 3, 4, 3, 2, 1, 0, 0].map(value => tracker.observe(normalizeOrientation(value))).filter(Boolean);
  assert.deepEqual(changes, [
    { from: 'portrait', to: 'landscape' },
    { from: 'landscape', to: 'portrait' },
    { from: 'portrait', to: 'unknown' },
  ]);
});

test('repeated Android callbacks in the same orientation have no event', () => {
  const tracker = createOrientationTransitionTracker('portrait');
  assert.deepEqual(tracker.observe('landscape'), { from: 'portrait', to: 'landscape' });
  assert.equal(tracker.observe('landscape'), null);
  assert.equal(tracker.observe('landscape'), null);
});
