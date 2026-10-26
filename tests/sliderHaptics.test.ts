import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewThenCommitSliderValue, triggerSliderHaptic } from '../src/components/sliderFeedback';

test('rejected or throwing haptics cannot prevent slider selection from reaching its commit callback', async () => {
  for (const haptic of [
    () => Promise.reject(new Error('Haptics unavailable')),
    () => { throw new Error('Haptics unavailable'); },
  ]) {
    let previewed = -1;
    let committed = -1;
    assert.doesNotThrow(() => previewThenCommitSliderValue(
      4,
      index => {
        previewed = index;
        triggerSliderHaptic(haptic);
      },
      index => { committed = index; },
    ));
    await Promise.resolve();
    assert.equal(previewed, 4);
    assert.equal(committed, 4);
  }
});
