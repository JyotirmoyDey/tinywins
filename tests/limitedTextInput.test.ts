import assert from 'node:assert/strict';
import test from 'node:test';
import { limitNativeTextInput } from '../src/components/limitedTextInput';

test('over-limit typing restores the native field even when React state is unchanged', () => {
  const restored: string[] = [];
  const previous = 'a'.repeat(24);
  const result = limitNativeTextInput(previous, `${previous}b`, 24, value => restored.push(value));
  assert.deepEqual(result, { value: previous, exceeded: true });
  assert.deepEqual(restored, [previous]);
});

test('paste is clipped by visible characters and the native field receives the clipped text', () => {
  const restored: string[] = [];
  const pasted = 'a'.repeat(17) + '👨‍👩‍👧‍👦' + 'extra';
  const result = limitNativeTextInput('', pasted, 18, value => restored.push(value));
  assert.equal(result.value, 'a'.repeat(17) + '👨‍👩‍👧‍👦');
  assert.deepEqual(restored, [result.value]);
});

test('valid edits and shortening a legacy over-limit value need no native correction', () => {
  const restored: string[] = [];
  assert.equal(limitNativeTextInput('', 'New name', 24, value => restored.push(value)).value, 'New name');
  assert.equal(limitNativeTextInput('a'.repeat(30), 'a'.repeat(29), 24, value => restored.push(value)).value.length, 29);
  assert.deepEqual(restored, []);
});
