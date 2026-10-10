import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLogLine, type LogMetadata } from '../src/logging/logger';

test('logger formats selected safe metadata without user-created text', () => {
  const line = formatLogLine('INFO', 'Insights opened', {
    scope: 'activity', activity_count: 3,
    name: 'Private Guitar Name', password: 'secret',
    screen: 'Private screen',
  } as unknown as LogMetadata);
  assert.equal(line, '[INFO] Insights opened {"scope":"activity","activity_count":3}');
});

test('logger rejects arbitrary messages and unsafe numeric metadata', () => {
  assert.equal(formatLogLine('INFO', 'Private note' as never), null);
  assert.equal(formatLogLine('WARN', 'Backup import rejected', {
    failure_category: 'invalid_format', activity_count: Number.NaN,
  }), '[WARN] Backup import rejected {"failure_category":"invalid_format"}');
});
