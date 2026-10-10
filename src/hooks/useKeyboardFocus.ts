import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, LayoutChangeEvent, Platform, ScrollView, TextInput, View } from 'react-native';
import { spacing } from '../theme';
import { focusedInputScrollTarget } from './keyboardFocusMath';
/** Keep the focused field inside the resized scroll viewport, above the Save footer. */
export function useKeyboardFocus() {
  const scroll = useRef<ScrollView | null>(null);
  const viewport = useRef<View | null>(null);
  const focused = useRef<TextInput | null>(null); const offset = useRef(0);
  const focusedBoundary = useRef<View | null>(null);
  const clearance = useRef(spacing.md);
  const keyboardTop = useRef<number | undefined>(undefined);
  const keyboardHeight = useRef(0);
  const fullViewportHeight = useRef(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const keyboardVisible = useRef(false);
  const pendingReveal = useRef(false);
  const frame = useRef<number | null>(null);
  const reveal = useCallback(() => {
    const input = focused.current;
    if (!input?.isFocused()) return;
    viewport.current?.measureInWindow((_x, viewportTop, _width, viewportHeight) => {
      if (viewportHeight <= 0) return;
      // Level inputs sit inside a taller row. Reveal the complete row, including
      // its description, rather than stopping when only the focused title is visible.
      (focusedBoundary.current ?? input).measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
        if (focused.current !== input || !input.isFocused() || inputHeight <= 0) return;
        const target = focusedInputScrollTarget({ viewportTop, viewportHeight, inputTop, inputHeight,
          keyboardTop: keyboardTop.current ?? Keyboard.metrics()?.screenY,
          scrollOffset: offset.current, margin: clearance.current });
        pendingReveal.current = false;
        if (target === null) return;
        // The keyboard has already resized the viewport. An immediate correction cannot
        // race a still-running animated scroll when Android finishes focusing the input.
        offset.current = target;
        scroll.current?.scrollTo({ y: target, animated: false });
      });
    });
  }, []);
  const scheduleReveal = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => { frame.current = null; reveal(); });
    });
  }, [reveal]);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => {
      keyboardVisible.current = true;
      pendingReveal.current = true;
      keyboardTop.current = event.endCoordinates.screenY;
      keyboardHeight.current = Math.max(0, event.endCoordinates.height);
      setKeyboardInset(keyboardHeight.current);
      scheduleReveal();
    });
    const hide = () => {
      keyboardVisible.current = false; pendingReveal.current = false;
      keyboardTop.current = undefined; keyboardHeight.current = 0;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setKeyboardInset(0);
    };
    const hidden = Keyboard.addListener('keyboardDidHide', hide);
    const willHide = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillHide', hide) : null;
    const changedFrame = Platform.OS === 'ios' ? Keyboard.addListener('keyboardDidChangeFrame', event => {
      keyboardTop.current = event.endCoordinates.screenY;
      keyboardHeight.current = Math.max(0, event.endCoordinates.height);
      setKeyboardInset(keyboardHeight.current);
      if (keyboardVisible.current) { pendingReveal.current = true; scheduleReveal(); }
    }) : null;
    return () => { shown.remove(); hidden.remove(); willHide?.remove(); changedFrame?.remove();
      if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [scheduleReveal]);
  useEffect(() => {
    // Wait for the extra scrollable padding to be committed before measuring.
    if (keyboardVisible.current && focused.current?.isFocused()) {
      pendingReveal.current = true;
      scheduleReveal();
    }
  }, [keyboardInset, scheduleReveal]);
  const onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    fullViewportHeight.current = Math.max(fullViewportHeight.current, height);
    if (keyboardVisible.current && focused.current?.isFocused()) {
      const resizedBy = fullViewportHeight.current - height;
      setKeyboardInset(Math.max(keyboardHeight.current, Keyboard.metrics()?.height ?? 0, resizedBy));
    }
    if (keyboardVisible.current && focused.current?.isFocused()) {
      pendingReveal.current = true;
      scheduleReveal();
    }
  };
  return {
    keyboardInset,
    setViewport: (view: View | null) => { viewport.current = view; },
    setScrollView: (view: ScrollView | null) => { scroll.current = view; },
    scrollTo: (options: { y: number; animated: boolean }) => scroll.current?.scrollTo(options),
    onFocus: (input: TextInput | null, margin = spacing.md, boundary: View | null = null) => {
      focused.current = input; focusedBoundary.current = boundary; clearance.current = margin;
      pendingReveal.current = true;
      // Preserve the user's offset while a closed keyboard opens. The final
      // correction runs from keyboardDidShow after Android's resize.
      if (keyboardVisible.current) scheduleReveal();
    },
    onLayout,
    onContentSizeChange: () => {
      if (keyboardVisible.current && focused.current?.isFocused()) {
        pendingReveal.current = true;
        scheduleReveal();
      }
    },
    onScroll: (y: number) => { offset.current = y; },
  };
}
