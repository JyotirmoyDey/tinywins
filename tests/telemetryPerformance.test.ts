import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWithTrace } from '../src/telemetry/performance';

test('performance trace stops after a successful operation', async () => {
  const calls: string[] = [];
  const result = await runWithTrace(async () => {
    calls.push('start');
    return { stop: () => { calls.push('stop'); } };
  }, async () => { calls.push('operation'); return 42; });
  assert.equal(result, 42);
  assert.deepEqual(calls, ['start', 'operation', 'stop']);
});

test('performance trace stops when the operation fails', async () => {
  let stops = 0;
  const failure = new Error('database unavailable');
  await assert.rejects(runWithTrace(async () => ({ stop: () => { stops++; } }),
    async () => { throw failure; }), error => error === failure);
  assert.equal(stops, 1);
});

test('trace failures cannot change the user operation result', async () => {
  assert.equal(await runWithTrace(async () => { throw new Error('start failed'); }, async () => 'saved'), 'saved');
  assert.equal(await runWithTrace(async () => ({ stop: () => { throw new Error('stop failed'); } }),
    async () => 'saved'), 'saved');
});
