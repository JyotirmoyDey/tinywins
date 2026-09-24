import { useCallback, useMemo } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { OptionDraft } from '../domain/task';
import { colors as c, radii as r, spacing as s, typography as t } from '../theme';
import { movePosition, OPTION_ROW_HEIGHT, OptionPositions } from './optionOrdering';

export function EditableOptionRow({ option, index, count, onChange, onRemove, onMove, onDragStateChange, positions, activeId, scrollGesture, inputRef, onSubmit, onFocus, disabled }: {
  option: OptionDraft; index: number; count: number; onChange: (value: string) => void;
  onRemove: () => void; onMove: (id: string, to: number) => void;
  onDragStateChange: (dragging: boolean) => void;
  positions: SharedValue<OptionPositions>; activeId: SharedValue<string | null>;
  scrollGesture: ReturnType<typeof Gesture.Native>;
  inputRef: (input: TextInput | null) => void; onSubmit: () => void; onFocus: () => void; disabled: boolean;
}) {
  const id = option.id;
  const top = useSharedValue(index * OPTION_ROW_HEIGHT);
  const origin = useSharedValue(0);
  const ownsDrag = useSharedValue(false);
  const originalPositions = useSharedValue<OptionPositions>({});
  const beginDrag = useCallback(() => { Keyboard.dismiss(); onDragStateChange(true); }, [onDragStateChange]);
  const commitDrag = useCallback((to: number) => { onMove(id, to); onDragStateChange(false); }, [id, onMove, onDragStateChange]);

  // All frame-by-frame movement stays on the UI thread, including the neighbors.
  useAnimatedReaction(
    () => positions.get()[id],
    (position, previous) => {
      if (position !== undefined && position !== previous && activeId.get() !== id) {
        top.set(withTiming(position * OPTION_ROW_HEIGHT, { duration: 180 }));
      }
    },
    [id],
  );
  const animatedPosition = useAnimatedStyle(() => ({
    zIndex: activeId.get() === id ? 10 : 0,
    transform: [{ translateY: top.get() }],
  }));
  const animatedSurface = useAnimatedStyle(() => ({
    borderColor: activeId.get() === id ? c.primary : c.border,
    backgroundColor: activeId.get() === id ? c.primaryMuted : c.surface,
  }));

  const pan = useMemo(() => Gesture.Pan()
    .minDistance(1)
    .blocksExternalGesture(scrollGesture)
    .onStart(() => {
      ownsDrag.set(activeId.get() === null);
      if (!ownsDrag.get()) return;
      activeId.set(id);
      originalPositions.set({ ...positions.get() });
      origin.set(positions.get()[id] * OPTION_ROW_HEIGHT);
      top.set(origin.get());
      scheduleOnRN(beginDrag);
    })
    .onUpdate(event => {
      if (!ownsDrag.get() || activeId.get() !== id) return;
      top.set(Math.max(0, Math.min((count - 1) * OPTION_ROW_HEIGHT, origin.get() + event.translationY)));
      positions.set(movePosition(positions.get(), id, Math.round(top.get() / OPTION_ROW_HEIGHT)));
    })
    .onEnd((_event, success) => {
      if (!success || !ownsDrag.get() || activeId.get() !== id) return;
      const target = positions.get()[id];
      top.set(withTiming(target * OPTION_ROW_HEIGHT, { duration: 160 }, finished => {
        if (finished) {
          activeId.set(null);
          scheduleOnRN(commitDrag, target);
        }
      }));
    })
    .onFinalize((_event, success) => {
      const owned = ownsDrag.get();
      ownsDrag.set(false);
      if (success || !owned || activeId.get() !== id) return;
      // Interrupted gestures restore both the dragged choice and its neighbors.
      positions.set(originalPositions.get());
      top.set(withTiming(origin.get(), { duration: 160 }, finished => {
        if (finished) { activeId.set(null); scheduleOnRN(onDragStateChange, false); }
      }));
    }),
  [activeId, beginDrag, commitDrag, count, id, onDragStateChange, origin, originalPositions, ownsDrag, positions, scrollGesture, top]);
  return <Animated.View style={[styles.wrapper, animatedPosition]}>
    <Animated.View style={[styles.row, animatedSurface]}>
      <GestureDetector gesture={pan}><View collapsable={false} accessible accessibilityRole="adjustable"
        accessibilityLabel={`Move ${option.label || 'option'}, position ${index + 1} of ${count}`}
        accessibilityHint="Drag to reorder, or swipe up and down to change position."
        accessibilityActions={[{ name: 'increment', label: 'Move toward highest' }, { name: 'decrement', label: 'Move toward lowest' }]}
        onAccessibilityAction={event => onMove(option.id, Math.max(0, Math.min(count - 1, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        style={styles.handle}><Text style={{ color: c.textSecondary, fontSize: 24 }}>⠿</Text></View></GestureDetector>
      <TextInput ref={inputRef} onFocus={onFocus} editable={!disabled} value={option.label} onChangeText={onChange} placeholder={`Option ${index + 1}`}
        accessibilityLabel={`Option ${index + 1} label`} style={styles.input} maxLength={60} maxFontSizeMultiplier={1.3}
        placeholderTextColor={c.textSecondary} returnKeyType={index === count - 1 ? 'done' : 'next'}
        submitBehavior={index === count - 1 ? 'blurAndSubmit' : 'submit'} onSubmitEditing={onSubmit} />
      <Pressable onPress={onRemove} disabled={disabled || count <= 2} accessibilityRole="button" accessibilityLabel={`Remove ${option.label || 'option'}`}
        accessibilityState={{ disabled: disabled || count <= 2 }} style={[styles.handle, { opacity: count <= 2 ? 0.25 : 1 }]}>
        <Text style={{ fontSize: 24, color: c.textSecondary }}>−</Text>
      </Pressable>
    </Animated.View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 0, left: 0, right: 0, height: OPTION_ROW_HEIGHT, paddingBottom: s.md },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: r.md },
  handle: { width: 44, height: 56, alignItems: 'center', justifyContent: 'center' },
  input: { ...t.body, flex: 1, color: c.textPrimary, height: 56, paddingVertical: s.sm, paddingHorizontal: s.xs },
});
