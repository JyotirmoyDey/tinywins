import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, View } from 'react-native';
import { spacing } from '../theme';
import { focusedInputScrollTarget } from './keyboardFocusMath';
/** Keep the focused field inside the resized scroll viewport, above the Save footer. */
export function useKeyboardFocus() {
  const scroll = useRef<ScrollView | null>(null);
  const viewport = useRef<View | null>(null);
  const focused = useRef<TextInput | null>(null); const offset = useRef(0);
  const keyboardTop = useRef<number | undefined>(undefined);
  const lastTarget = useRef<number | null>(null);
  const reveal = useCallback(() => {
    const input = focused.current;
    if (!input?.isFocused()) return;
    viewport.current?.measureInWindow((_x, viewportTop, _width, viewportHeight) => {
      input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
        if (focused.current !== input || !input.isFocused()) return;
        const target = focusedInputScrollTarget({ viewportTop, viewportHeight, inputTop, inputHeight,
          keyboardTop: keyboardTop.current ?? Keyboard.metrics()?.screenY,
          scrollOffset: offset.current, margin: spacing.md });
        if (target === null || (lastTarget.current !== null && Math.abs(target - lastTarget.current) < 2)) return;
        lastTarget.current = target;
        scroll.current?.scrollTo({ y: target, animated: true });
      });
    });
  }, []);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY; reveal();
    });
    const hide = () => {
      keyboardTop.current = undefined; lastTarget.current = null;
    };
    const hidden = Keyboard.addListener('keyboardDidHide', hide);
    const willHide = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillHide', hide) : null;
    const frame = Platform.OS === 'ios' ? Keyboard.addListener('keyboardDidChangeFrame', event => {
      keyboardTop.current = event.endCoordinates.screenY; reveal();
    }) : null;
    return () => { shown.remove(); hidden.remove(); willHide?.remove(); frame?.remove(); };
  }, [reveal]);
  return {
    setViewport: (view: View | null) => { viewport.current = view; },
    setScrollView: (view: ScrollView | null) => { scroll.current = view; },
    scrollTo: (options: { y: number; animated: boolean }) => scroll.current?.scrollTo(options),
    scrollToEnd: (options: { animated: boolean }) => scroll.current?.scrollToEnd(options),
    onFocus: (input: TextInput | null) => { focused.current = input; lastTarget.current = null; reveal(); },
    onLayout: reveal,
    onScroll: (y: number) => { offset.current = y; },
  };
}
