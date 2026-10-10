import test from 'node:test';
import assert from 'node:assert/strict';
import { focusedInputScrollTarget, keyboardContentPadding } from '../src/hooks/keyboardFocusMath';

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

test('a manually scrolled lower row keeps its offset when keyboard resize leaves it visible', () => {
  assert.equal(focusedInputScrollTarget({ viewportTop: 96, viewportHeight: 276,
    inputTop: 260, inputHeight: 56, scrollOffset: 318, margin: 20 }), null);
  assert.equal(focusedInputScrollTarget({ viewportTop: 96, viewportHeight: 228,
    inputTop: 260, inputHeight: 56, scrollOffset: 318, margin: 20 }), 330);
});

test('each level position, including a newly added bottom row, can be revealed above the keyboard', () => {
  const viewportTop = 110; const viewportHeight = 310; const keyboardTop = 390;
  const inputHeight = 56; const margin = 12; const visibleBottom = keyboardTop - margin;
  for (const inputTop of [170, 248, 326, 404, 482, 560, 638]) {
    const target = focusedInputScrollTarget({ viewportTop, viewportHeight, keyboardTop,
      inputTop, inputHeight, scrollOffset: 0, margin });
    const movedTop = inputTop - (target ?? 0);
    assert.ok(movedTop + inputHeight <= visibleBottom,
      `level at ${inputTop} should fit above the keyboard`);
  }
});

test('a later viewport resize recalculates the needed scroll instead of keeping an old target', () => {
  const first = focusedInputScrollTarget({ viewportTop: 120, viewportHeight: 540,
    inputTop: 510, inputHeight: 56, scrollOffset: 0, margin: 12 });
  assert.equal(first, null);
  const afterKeyboard = focusedInputScrollTarget({ viewportTop: 120, viewportHeight: 260,
    inputTop: 510, inputHeight: 56, scrollOffset: 0, margin: 12 });
  assert.equal(afterKeyboard, 198);
});

test('keyboard inset leaves enough scroll range to reveal the final row on a small screen', () => {
  const viewportTop = 100; const viewportHeight = 240; const keyboardTop = 210;
  const lastInputTop = 610; const inputHeight = 56; const clearance = 32;
  const target = focusedInputScrollTarget({ viewportTop, viewportHeight, keyboardTop,
    inputTop: lastInputTop, inputHeight, scrollOffset: 0, margin: clearance });
  assert.notEqual(target, null);
  const contentBottomBeforePadding = 675;
  assert.ok(contentBottomBeforePadding + 32 - viewportHeight < target!);
  for (const keyboardHeight of [180, 280, 360]) {
    const padding = keyboardContentPadding(32, keyboardHeight, 76, 20);
    const maxScroll = contentBottomBeforePadding + padding - viewportHeight;
    assert.ok(maxScroll >= target!, `keyboard height ${keyboardHeight} must not clamp the final row`);
  }
  assert.equal(keyboardContentPadding(32, 0, 76, 20), 32);
});
