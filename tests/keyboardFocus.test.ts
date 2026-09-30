import test from 'node:test';
import assert from 'node:assert/strict';
import { focusedInputScrollTarget } from '../src/hooks/keyboardFocusMath';

test('fourth and fifth level fields move above an iOS keyboard without overscrolling visible fields', () => {
  const common = { viewportTop: 130, viewportHeight: 650, keyboardTop: 390, inputHeight: 56, scrollOffset: 0, margin: 12 };
  assert.equal(focusedInputScrollTarget({ ...common, inputTop: 300 }), null);
  assert.equal(focusedInputScrollTarget({ ...common, inputTop: 420 }), 98);
  assert.equal(focusedInputScrollTarget({ ...common, inputTop: 496 }), 174);
});

test('Android resized viewport and switching between focused rows use the actual visible bounds', () => {
  const common = { viewportTop: 130, viewportHeight: 250, inputHeight: 56, scrollOffset: 25, margin: 12 };
  assert.equal(focusedInputScrollTarget({ ...common, inputTop: 420 }), 133);
  assert.equal(focusedInputScrollTarget({ ...common, inputTop: 280 }), null);
  assert.equal(focusedInputScrollTarget({ ...common, inputTop: 120 }), 3);
});
