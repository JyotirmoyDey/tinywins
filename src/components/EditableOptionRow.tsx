import { useCallback, useMemo, useRef } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Path } from 'react-native-svg';
import { OptionDraft } from '../domain/task';
import { characterCount, nativeTextMaxLength, MAX_OPTION_CHARACTERS, MAX_OPTION_DESCRIPTION_CHARACTERS } from '../domain/inputLimits';
import { colors as c, radii as r, spacing as s, typography as t } from '../theme';
import { movePosition, OPTION_ROW_HEIGHT, OptionPositions } from './optionOrdering';

export function EditableOptionRow({ option, index, count, minimumCount = 3, onChange, onDescriptionChange, onRemove, onMove, onDragStateChange, positions, activeId, scrollGesture, inputRef, descriptionInputRef, onSubmit, onDescriptionSubmit, onFocus, onDescriptionFocus, disabled }: {
  option: OptionDraft; index: number; count: number; minimumCount?: number; onChange: (value: string) => void; onDescriptionChange: (value: string) => void;
  onRemove: () => void; onMove: (id: string, to: number) => void;
  onDragStateChange: (dragging: boolean) => void;
  positions: SharedValue<OptionPositions>; activeId: SharedValue<string | null>;
  scrollGesture: ReturnType<typeof Gesture.Native>;
  inputRef: (input: TextInput | null) => void; descriptionInputRef: (input: TextInput | null) => void;
  onSubmit: () => void; onDescriptionSubmit: () => void;
  onFocus: (row: View | null) => void; onDescriptionFocus: (row: View | null) => void; disabled: boolean;
}) {
  const id = option.id;
  const rowRef = useRef<View>(null);
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
  return <Animated.View ref={rowRef} style={[styles.wrapper, animatedPosition]}>
    <Animated.View style={[styles.row, animatedSurface]}>
      <GestureDetector gesture={pan}><View collapsable={false} accessible accessibilityRole="adjustable"
        onTouchStart={() => Keyboard.dismiss()}
        accessibilityLabel={`Move ${option.label || 'level'}, position ${index + 1} of ${count}`}
        accessibilityHint="Drag to reorder, or swipe up and down to change position."
        accessibilityActions={[{ name: 'increment', label: 'Move toward more' }, { name: 'decrement', label: 'Move toward less' }]}
        onAccessibilityAction={event => onMove(option.id, Math.max(0, Math.min(count - 1, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        style={styles.handle}><Text style={{ color: c.textSecondary, fontSize: 24 }}>⠿</Text></View></GestureDetector>
      <View style={styles.fields}>
        <View style={styles.titleLine}>
          <TextInput testID={`level-input-${index}`} ref={inputRef} onFocus={() => onFocus(rowRef.current)} editable={!disabled} value={option.label}
            maxLength={nativeTextMaxLength(option.label, MAX_OPTION_CHARACTERS)} onChangeText={onChange} placeholder={`Level ${index + 1}`}
            accessibilityLabel={`Level ${index + 1} name`} style={styles.input} maxFontSizeMultiplier={1.3}
            multiline numberOfLines={2} textAlignVertical="center"
            placeholderTextColor={c.textSecondary} returnKeyType="next"
            submitBehavior="submit" onSubmitEditing={onSubmit} />
          <Text style={styles.count} accessibilityLabel={`${characterCount(option.label)} of ${MAX_OPTION_CHARACTERS} characters`}>
            {characterCount(option.label)}/{MAX_OPTION_CHARACTERS}
          </Text>
        </View>
        <TextInput testID={`level-description-input-${index}`} ref={descriptionInputRef} onFocus={() => onDescriptionFocus(rowRef.current)}
          editable={!disabled} value={option.description ?? ''}
          maxLength={nativeTextMaxLength(option.description ?? '', MAX_OPTION_DESCRIPTION_CHARACTERS)} onChangeText={onDescriptionChange}
          placeholder="What does this level mean to you?" placeholderTextColor={c.textSecondary}
          accessibilityLabel={`Level ${index + 1} description`} style={styles.descriptionInput}
          maxFontSizeMultiplier={1.3} multiline numberOfLines={2} textAlignVertical="top"
          returnKeyType={index === count - 1 ? 'done' : 'next'}
          submitBehavior={index === count - 1 ? 'blurAndSubmit' : 'submit'} onSubmitEditing={onDescriptionSubmit} />
      </View>
      <Pressable testID={`remove-level-${index}`} onPress={onRemove} disabled={disabled || count <= minimumCount} accessibilityRole="button" accessibilityLabel={`Remove ${option.label || 'level'}`}
        accessibilityState={{ disabled: disabled || count <= minimumCount }} style={[styles.removeHandle, { opacity: count <= minimumCount ? 0.25 : 1 }]}>
        <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
          <Path d="M18 6 6 18M6 6l12 12" fill="none" stroke={c.textSecondary}
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
    </Animated.View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 0, left: 0, right: 0, height: OPTION_ROW_HEIGHT, paddingBottom: s.md },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: r.md },
  handle: { width: 44, height: 56, alignItems: 'center', justifyContent: 'center' },
  removeHandle: { width: 44, height: 44, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', marginTop: s.xs },
  fields: { flex: 1, minWidth: 0, paddingVertical: s.xs },
  titleLine: { flexDirection: 'row', alignItems: 'center' },
  input: { ...t.body, flex: 1, minWidth: 0, color: c.textPrimary, height: 52, paddingVertical: s.xs, paddingHorizontal: s.xs },
  descriptionInput: { ...t.caption, color: c.textSecondary, minHeight: 48, maxHeight: 48,
    paddingHorizontal: s.xs, paddingVertical: s.xs },
  count: { ...t.caption, color: c.textTertiary, minWidth: 38, textAlign: 'right' },
});
