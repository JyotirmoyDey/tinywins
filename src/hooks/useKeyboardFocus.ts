import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, ScrollView, TextInput, View } from 'react-native';
import { spacing } from '../theme';
/** Keep the focused field inside the resized scroll viewport, above the Save footer. */
export function useKeyboardFocus() {
  const scroll = useRef<ScrollView | null>(null);
  const viewport = useRef<View | null>(null);
  const focused = useRef<TextInput | null>(null); const offset = useRef(0);
  const reveal = useCallback(() => {
    const input = focused.current;
    if (!input?.isFocused()) return;
    viewport.current?.measureInWindow((_x, viewportTop, _width, viewportHeight) => {
      input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
        if (!input.isFocused()) return;
        const bottom = viewportTop + viewportHeight - spacing.md;
        const top = viewportTop + spacing.md;
        const delta = inputTop + inputHeight > bottom ? inputTop + inputHeight - bottom : inputTop < top ? inputTop - top : 0;
        if (delta) scroll.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
      });
    });
  }, [scroll]);
  useEffect(() => { const listener = Keyboard.addListener('keyboardDidShow', reveal); return () => listener.remove(); }, [reveal]);
  return {
    setViewport: (view: View | null) => { viewport.current = view; },
    setScrollView: (view: ScrollView | null) => { scroll.current = view; },
    scrollTo: (options: { y: number; animated: boolean }) => scroll.current?.scrollTo(options),
    scrollToEnd: (options: { animated: boolean }) => scroll.current?.scrollToEnd(options),
    onFocus: (input: TextInput | null) => { focused.current = input; reveal(); },
    onLayout: reveal,
    onScroll: (y: number) => { offset.current = y; },
  };
}
