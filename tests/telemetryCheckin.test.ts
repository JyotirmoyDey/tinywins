import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkinTransition } from '../src/telemetry/checkinTransition';

test('check-in events represent committed state transitions, not repeated selection', () => {
  assert.equal(checkinTransition(undefined, null), null);
  assert.equal(checkinTransition(undefined, 'low'), 'recorded');
  assert.equal(checkinTransition('low', 'low', 'v1', 'v1'), null);
  assert.equal(checkinTransition('low', 'high', 'v1', 'v1'), 'changed');
  assert.equal(checkinTransition('low', 'low', 'v1', 'v2'), 'changed');
  assert.equal(checkinTransition('low', null), 'removed');
});
