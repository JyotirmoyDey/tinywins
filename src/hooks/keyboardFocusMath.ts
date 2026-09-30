/** Screen coordinates keep this valid whether Android resizes or iOS pads the form. */
export function focusedInputScrollTarget({ viewportTop, viewportHeight, inputTop, inputHeight,
  keyboardTop, scrollOffset, margin }: {
  viewportTop: number; viewportHeight: number; inputTop: number; inputHeight: number;
  keyboardTop?: number; scrollOffset: number; margin: number;
}): number | null {
  const visibleBottom = Math.min(viewportTop + viewportHeight, keyboardTop ?? Infinity) - margin;
  const visibleTop = viewportTop + margin;
  if (visibleBottom <= visibleTop) return null;
  const delta = inputTop + inputHeight > visibleBottom ? inputTop + inputHeight - visibleBottom
    : inputTop < visibleTop ? inputTop - visibleTop : 0;
  return Math.abs(delta) < 2 ? null : Math.max(0, scrollOffset + delta);
}
