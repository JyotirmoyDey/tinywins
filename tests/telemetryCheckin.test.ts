import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkinTransition } from '../src/telemetry/checkinTransition';

test('check-in events represent committed state transitions, not repeated selection', () => {
  assert.equal(checkinTransition(undefined, null), null);
  assert.equal(checkinTransition(undefined, 'low'), 'recorded');
  assert.equal(checkinTransition('low', 'low'), null);
  assert.equal(checkinTransition('low', 'high'), 'changed');
  assert.equal(checkinTransition('low', null), 'removed');
});
