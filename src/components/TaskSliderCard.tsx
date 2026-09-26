import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { Task } from '../domain/task';
import { useEntry, useTaskActions } from '../state/TasksProvider';
import { colors as c, radii as r, spacing as s, typography as t } from '../theme';
import { TaskActionsMenu } from './TaskActionsMenu';
import { SLIDER_INSET, sliderColor, sliderDisplay, sliderIndexFromX, sliderXForIndex } from './sliderMath';

const trackColor = '#E9E9E5';
const unrecordedColor = '#DADAD6';
const thumbSize = 20;

export const TaskSliderCard = memo(function TaskSliderCard({ task, date }: { task: Task; date: string }) {
  const router = useRouter();
  const { select: saveSelection } = useTaskActions();
  const entry = useEntry(task.id, date);
  const options = useMemo(() => task.options.slice().sort((a, b) => a.position - b.position), [task.options]);
  const colors = useMemo(() => options.map((_, index) => sliderColor(index, options.length)), [options]);
  const saved = sliderDisplay(options, entry);
  const savedIndex = saved.selectedIndex;
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastPreview = useRef(savedIndex);
  const lastCommittedId = useRef(entry?.trendEpochIdAtEntry === task.currentTrendEpochId ? entry?.optionId : undefined);
  const savedIndexRef = useRef(savedIndex);
  const thumbX = useSharedValue(SLIDER_INSET);
  const hasSelection = useSharedValue(false);
  const fillColor = useSharedValue(unrecordedColor);
  const activeIndex = useSharedValue(-1);
  const savedIndexShared = useSharedValue(savedIndex);
  const dragging = useSharedValue(false);

  useEffect(() => {
    savedIndexRef.current = savedIndex;
    savedIndexShared.set(savedIndex);
    lastCommittedId.current = entry?.trendEpochIdAtEntry === task.currentTrendEpochId ? entry?.optionId : undefined;
    if (dragging.get()) return;
    lastPreview.current = savedIndex;
    activeIndex.set(savedIndex);
    hasSelection.set(savedIndex >= 0);
    fillColor.set(savedIndex >= 0 ? colors[savedIndex] : unrecordedColor);
    thumbX.set(savedIndex >= 0 ? sliderXForIndex(savedIndex, width, options.length) : SLIDER_INSET);
  }, [savedIndex, entry?.optionId, entry?.trendEpochIdAtEntry, task.currentTrendEpochId, width, options.length, colors, dragging, activeIndex, savedIndexShared, hasSelection, fillColor, thumbX]);

  const previewStep = useCallback((index: number) => {
    if (lastPreview.current === index) return;
    lastPreview.current = index;
    setPreviewIndex(index);
    void Haptics.selectionAsync().catch(() => {});
  }, []);
  const cancelPreview = useCallback(() => {
    lastPreview.current = savedIndexRef.current;
    setPreviewIndex(null);
  }, []);
  const commitStep = useCallback((index: number) => {
    const option = options[index];
    setPreviewIndex(null);
    if (!option || lastCommittedId.current === option.id) return;
    lastCommittedId.current = option.id;
    setError(null);
    // The EntryStore paints optimistically and serializes writes for this task/day.
    // Slider gestures provide their own per-position haptics, so skip the save haptic.
    void saveSelection(task, date, option.id, false).catch(() => {
      setError('Could not save this check-in. Try the slider again.');
    });
  }, [options, saveSelection, task, date]);
  const clear = useCallback(() => {
    if (!entry) return;
    setError(null);
    lastCommittedId.current = undefined;
    setPreviewIndex(null);
    void saveSelection(task, date, null).catch(() => setError('Could not clear this check-in. Please try again.'));
  }, [entry, saveSelection, task, date]);

  const gesture = useMemo(() => {
    const moveTo = (x: number) => {
      'worklet';
      const bounded = Math.max(SLIDER_INSET, Math.min(width - SLIDER_INSET, x));
      thumbX.set(bounded);
      const index = sliderIndexFromX(bounded, width, options.length);
      if (activeIndex.get() !== index) {
        activeIndex.set(index);
        fillColor.set(colors[index]);
        scheduleOnRN(previewStep, index);
      }
      hasSelection.set(true);
      return index;
    };
    const pan = Gesture.Pan().enabled(!busy && width > SLIDER_INSET * 2)
      .activeOffsetX([-6, 6]).failOffsetY([-12, 12])
      .onStart(event => { dragging.set(true); moveTo(event.x); })
      .onUpdate(event => { moveTo(event.x); })
      .onEnd(event => {
        const index = moveTo(event.x);
        thumbX.set(withTiming(sliderXForIndex(index, width, options.length), { duration: 110 }));
        dragging.set(false);
        scheduleOnRN(commitStep, index);
      })
      .onFinalize((_event, success) => {
        if (success || !dragging.get()) return;
        dragging.set(false);
        const previous = savedIndexShared.get();
        activeIndex.set(previous);
        hasSelection.set(previous >= 0);
        fillColor.set(previous >= 0 ? colors[previous] : unrecordedColor);
        thumbX.set(withTiming(previous >= 0 ? sliderXForIndex(previous, width, options.length) : SLIDER_INSET, { duration: 110 }));
        scheduleOnRN(cancelPreview);
      });
    const tap = Gesture.Tap().enabled(!busy && width > SLIDER_INSET * 2).maxDistance(10)
      .onEnd((event, success) => {
        if (!success) return;
        const index = moveTo(event.x);
        thumbX.set(withTiming(sliderXForIndex(index, width, options.length), { duration: 110 }));
        scheduleOnRN(commitStep, index);
      });
    return Gesture.Race(pan, tap);
  }, [width, options.length, colors, busy, thumbX, hasSelection, fillColor, activeIndex, savedIndexShared, dragging, previewStep, cancelPreview, commitStep]);

  const fillStyle = useAnimatedStyle(() => ({
    width: hasSelection.get() ? Math.max(6, thumbX.get() - SLIDER_INSET) : 0,
    backgroundColor: fillColor.get(), opacity: hasSelection.get() ? 1 : 0,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: hasSelection.get() ? 1 : 0,
    transform: [{ translateX: thumbX.get() - thumbSize / 2 }],
  }));
  const shownIndex = previewIndex ?? savedIndex;
  const label = previewIndex !== null ? options[previewIndex]?.label : saved.label;
  const accessibilityValue = `${task.name}: ${label}`;
  const accessibilityChange = (action: string) => {
    if (busy) return;
    const current = lastPreview.current;
    const index = current < 0 ? 0 : Math.max(0, Math.min(options.length - 1, current + (action === 'increment' ? 1 : -1)));
    activeIndex.set(index); hasSelection.set(true); fillColor.set(colors[index]);
    thumbX.set(withTiming(sliderXForIndex(index, width, options.length), { duration: 110 }));
    previewStep(index); commitStep(index);
  };
  return <View style={styles.card}>
    <View style={styles.heading}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${task.name}, insights`}
        onPress={() => router.navigate({ pathname: '/insights', params: { task: task.id, mode: 'normal' } })} style={styles.taskLink}>
        <Text numberOfLines={2} style={styles.taskName}>{task.name}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${task.name}, ${label}. Show full rating label`} onPress={() => Alert.alert(task.name, label)} style={styles.labelTouch}>
        <Text numberOfLines={2} style={[styles.selectedLabel, !entry && previewIndex === null && styles.unrecordedLabel]}>{label}</Text>
      </Pressable>
      <TaskActionsMenu task={task} onClear={entry ? clear : undefined} onBusyChange={setBusy} />
    </View>
    <GestureDetector gesture={gesture}>
      <Animated.View collapsable={false} style={styles.sliderTouch} accessible accessibilityRole="adjustable"
        accessibilityLabel={`${task.name} rating`} accessibilityValue={{ text: accessibilityValue }}
        accessibilityHint="Drag or tap to choose a rating. Swipe up or down to change options with a screen reader."
        accessibilityActions={[{ name: 'increment', label: 'Next rating' }, { name: 'decrement', label: 'Previous rating' }]}
        onAccessibilityAction={event => accessibilityChange(event.nativeEvent.actionName)}
        onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        <View pointerEvents="none" style={styles.track} />
        <Animated.View pointerEvents="none" style={[styles.fill, fillStyle]} />
        {width > 0 && options.map((option, index) => <View key={option.id} pointerEvents="none" style={[styles.marker, { left: sliderXForIndex(index, width, options.length) - 2, backgroundColor: shownIndex >= 0 && index <= shownIndex ? c.surface : unrecordedColor }]} />)}
        <Animated.View pointerEvents="none" style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </GestureDetector>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
});

const styles = StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: r.lg, borderColor: c.border, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, marginBottom: s.sm },
  heading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: s.xs },
  taskLink: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' },
  taskName: { ...t.taskTitle, color: c.textPrimary },
  labelTouch: { maxWidth: '42%', minHeight: 44, minWidth: 0, justifyContent: 'center', alignItems: 'flex-end' },
  selectedLabel: { ...t.secondary, color: c.textPrimary, fontWeight: '600', textAlign: 'right' },
  unrecordedLabel: { color: c.textSecondary, fontWeight: '400' },
  sliderTouch: { height: 44, justifyContent: 'center' },
  track: { position: 'absolute', top: 19, left: SLIDER_INSET, right: SLIDER_INSET, height: 6, borderRadius: 3, backgroundColor: trackColor },
  fill: { position: 'absolute', top: 19, left: SLIDER_INSET, height: 6, borderRadius: 3 },
  marker: { position: 'absolute', top: 20, width: 4, height: 4, borderRadius: 2 },
  thumb: { position: 'absolute', top: 12, left: 0, width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.textSecondary },
  error: { ...t.secondary, color: c.danger, marginTop: s.xs },
});
