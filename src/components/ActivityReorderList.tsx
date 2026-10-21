import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { Task } from '../domain/task';
import { TaskSliderCard } from './TaskSliderCard';
import { activityLayoutForOrder, activityTopAtPosition, ActivityLayoutSlot,
  isMeaningfulActivityHeightChange, moveActivityPosition, moveActivityToIndex, positionsForActivityIds,
  shouldAdoptExternalActivityOrder, stableActivityIndexAtCenter } from './activityOrdering';
import { colors as c, spacing as s } from '../theme';
import { logger } from '../logging/logger';

type LayoutState = { slots: ActivityLayoutSlot[]; positions: Record<string, number>; ready: boolean };
type DragBase = { id: string; slots: ActivityLayoutSlot[]; scrollY: number };
type DragHandleProps = {
  id: string; name: string; index: number; count: number; enabled: boolean; scrollGesture: ReturnType<typeof Gesture.Native>;
  layout: SharedValue<LayoutState>;
  dragBase: SharedValue<DragBase | null>; dragTarget: SharedValue<number>; activeId: SharedValue<string | null>;
  rowTop: SharedValue<number>; scrollY: SharedValue<number>; touchY: SharedValue<number>;
  onStart: (id: string) => void;
  onFinish: (id: string, index: number, dragDistance?: number) => void; onCancel: (id: string) => void;
  onAccessibleMove: (id: string, index: number) => void;
};

const ActivityDragHandle = memo(function ActivityDragHandle({ id, name, index, count, enabled,
  scrollGesture, layout, dragBase, dragTarget, activeId, rowTop, scrollY, touchY, onStart, onFinish, onCancel,
  onAccessibleMove }: DragHandleProps) {
  const originTop = useSharedValue(0);
  const originalPositions = useSharedValue<Record<string, number>>({});
  const ownsDrag = useSharedValue(false);
  const gesture = useMemo(() => {
    const indexFor = (translationY: number) => {
      'worklet';
      const base = dragBase.get();
      if (!base || base.id !== id) return -1;
      const active = base.slots.find(slot => slot.id === id);
      if (!active) return -1;
      const center = active.top + active.height / 2 + translationY + scrollY.get() - base.scrollY;
      return stableActivityIndexAtCenter(base.slots, id, center, dragTarget.get(), 10);
    };
    return Gesture.Pan().enabled(enabled && count > 1).activateAfterLongPress(300).blocksExternalGesture(scrollGesture)
      .onStart(() => {
        const snapshot = layout.get();
        if (!snapshot.ready) return;
        const slots = snapshot.slots;
        const slot = slots.find(item => item.id === id);
        if (!slot || activeId.get() !== null) return;
        ownsDrag.set(true);
        activeId.set(id);
        originalPositions.set({ ...snapshot.positions });
        dragBase.set({ id, slots, scrollY: scrollY.get() });
        dragTarget.set(snapshot.positions[id]);
        originTop.set(slot.top);
        rowTop.set(slot.top);
        scheduleOnRN(onStart, id);
      })
      .onUpdate(event => {
        if (!ownsDrag.get() || activeId.get() !== id) return;
        const next = indexFor(event.translationY);
        touchY.set(event.absoluteY);
        if (next >= 0 && dragTarget.get() !== next) {
          dragTarget.set(next);
          const current = layout.get();
          layout.set({ ...current, positions: moveActivityPosition(current.positions, id, next) });
        }
        const base = dragBase.get();
        if (base) rowTop.set(originTop.get() + event.translationY + scrollY.get() - base.scrollY);
      })
      .onEnd(event => {
        if (!ownsDrag.get() || activeId.get() !== id) return;
        const next = indexFor(event.translationY);
        touchY.set(-1);
        if (next >= 0 && next !== dragTarget.get()) {
          const current = layout.get();
          layout.set({ ...current, positions: moveActivityPosition(current.positions, id, next) });
        }
        ownsDrag.set(false);
        // Keep the dragged card attached to the finger until RN commits the
        // matching canonical layout in onFinish. This avoids an intermediate snap.
        scheduleOnRN(onFinish, id, next >= 0 ? next : dragTarget.get(), event.translationY);
      })
      .onFinalize((_event, success) => {
        if (!success && ownsDrag.get() && dragBase.get()?.id === id) {
          touchY.set(-1);
          const current = layout.get();
          layout.set({ ...current, positions: originalPositions.get() });
          activeId.set(null);
          ownsDrag.set(false);
          scheduleOnRN(onCancel, id);
        }
      });
  }, [enabled, count, dragBase, id, scrollY, dragTarget, touchY, activeId,
    layout, rowTop, scrollGesture, onStart, onFinish, onCancel, originTop, originalPositions, ownsDrag]);

  const onAccessibilityAction = useCallback((event: { nativeEvent: { actionName: string } }) => {
    const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    const target = Math.max(0, Math.min(count - 1, index + delta));
    if (target !== index) onAccessibleMove(id, target);
  }, [count, id, index, onAccessibleMove]);

  return <GestureDetector gesture={gesture}>
    <View testID={`activity-drag-handle-${id}`} collapsable={false} style={styles.handle}
      accessible accessibilityRole="adjustable" accessibilityLabel={`Reorder ${name}`}
      accessibilityHint="Long press and drag to change the activity order. Screen reader users can adjust the position."
      accessibilityValue={{ min: 1, max: count, now: index + 1, text: `${index + 1} of ${count}` }}
      accessibilityActions={[{ name: 'increment', label: 'Move down' }, { name: 'decrement', label: 'Move up' }]}
      accessibilityState={{ disabled: !enabled || count < 2 }} onAccessibilityAction={onAccessibilityAction}>
      <Svg width={18} height={20} viewBox="0 0 18 20" accessible={false}>
        {[4, 10, 16].flatMap(y => [5, 13].map(x => <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.35} fill={c.textTertiary} />))}
      </Svg>
    </View>
  </GestureDetector>;
});

const ActivityReorderRow = memo(function ActivityReorderRow({ task, index, count, date, enabled, scrollGesture, layout, dragBase,
  dragTarget, activeId, scrollY, touchY, onMeasured, onStart, onFinish, onCancel, onAccessibleMove }: {
  task: Task; index: number; count: number; date: string; enabled: boolean; scrollGesture: ReturnType<typeof Gesture.Native>;
  layout: SharedValue<LayoutState>;
  dragBase: SharedValue<DragBase | null>; dragTarget: SharedValue<number>; activeId: SharedValue<string | null>;
  scrollY: SharedValue<number>; touchY: SharedValue<number>;
  onMeasured: (id: string, height: number) => void; onStart: (id: string) => void;
  onFinish: (id: string, index: number, dragDistance?: number) => void; onCancel: (id: string) => void;
  onAccessibleMove: (id: string, index: number) => void;
}) {
  const rowTop = useSharedValue(0);
  const rowScale = useSharedValue(1);
  const rowOpacity = useSharedValue(1);
  useAnimatedReaction(
    () => {
      const snapshot = layout.get();
      return { active: activeId.get() === task.id, ready: snapshot.ready,
        top: activityTopAtPosition(task.id, snapshot.positions, snapshot.slots) };
    },
    (next, previous) => {
      if (next.active !== previous?.active) {
        rowScale.set(withTiming(next.active ? 1.015 : 1, { duration: 100 }));
        rowOpacity.set(withTiming(next.active ? 0.96 : 1, { duration: 100 }));
      }
      if (!next.ready) {
        rowTop.set(next.top);
        return;
      }
      if (next.active) return;
      if (previous?.active || next.top !== previous?.top)
        rowTop.set(withTiming(next.top, { duration: 180 }));
    },
    [task.id, rowOpacity, rowScale],
  );
  const style = useAnimatedStyle(() => ({
    top: rowTop.get(),
    zIndex: activeId.get() === task.id ? 10 : 0,
    elevation: activeId.get() === task.id ? 6 : 0,
    transform: [{ scale: rowScale.get() }],
    opacity: rowOpacity.get(),
  }));
  return <Animated.View onLayout={event => onMeasured(task.id, event.nativeEvent.layout.height)} style={[styles.row, style]}>
    <TaskSliderCard task={task} date={date} dragHandle={<ActivityDragHandle id={task.id} name={task.name}
      index={index} count={count} enabled={enabled} scrollGesture={scrollGesture} layout={layout}
      dragBase={dragBase} dragTarget={dragTarget} activeId={activeId} rowTop={rowTop}
      scrollY={scrollY} touchY={touchY} onStart={onStart} onFinish={onFinish} onCancel={onCancel}
      onAccessibleMove={onAccessibleMove} />} />
  </Animated.View>;
});

type Props = { tasks: Task[]; date: string; onReorder: (ids: string[]) => Promise<void>;
  announce: (message: string) => void };

export function ActivityReorderList({ tasks, date, onReorder, announce }: Props) {
  const listRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const rowHeights = useRef(new Map<string, number>());
  const layoutDiagnostics = useRef({ callbacks: 0, updates: 0 });
  const initialIds = tasks.map(task => task.id);
  const initialLayout = activityLayoutForOrder(initialIds);
  const layout = useSharedValue<LayoutState>({ slots: initialLayout.slots,
    positions: positionsForActivityIds(initialIds), ready: false });
  const contentHeight = useSharedValue(initialLayout.totalHeight);
  const contentHeightStyle = useAnimatedStyle(() => ({ height: contentHeight.get() }));
  const activeId = useSharedValue<string | null>(null);
  const dragBase = useSharedValue<DragBase | null>(null);
  const dragTarget = useSharedValue(-1);
  const scrollY = useSharedValue(0);
  const touchY = useSharedValue(-1);
  const scrollGesture = useMemo(() => Gesture.Native(), []);
  const incomingIds = useMemo(() => tasks.map(task => task.id), [tasks]);
  const membershipKey = incomingIds.slice().sort().join('\u0000');
  const incomingOrderKey = incomingIds.join('\u0000');
  const [localOrder, setLocalOrder] = useState(() => ({ membershipKey, ids: incomingIds }));
  const orderIds = localOrder.membershipKey === membershipKey ? localOrder.ids : incomingIds;
  const membershipKeyRef = useRef(membershipKey);
  const orderRef = useRef(orderIds);
  const incomingIdsRef = useRef(incomingIds);
  useLayoutEffect(() => { orderRef.current = orderIds; }, [orderIds]);
  useLayoutEffect(() => { membershipKeyRef.current = membershipKey; }, [membershipKey]);
  useLayoutEffect(() => { incomingIdsRef.current = incomingIds; }, [incomingIds]);
  const layoutReadyRef = useRef(false);
  const dragSession = useRef<{ id: string; initialOrder: string[] } | null>(null);
  const lastPersistedOrder = useRef(incomingIds);
  const latestSave = useRef(0);
  const awaitingProviderOrderKey = useRef<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const scrollOffsetRef = useRef(0);
  const viewportBounds = useRef<{ top: number; bottom: number } | null>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tasksById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const orderedTasks = useMemo(() => orderIds.map(id => tasksById.get(id)).filter((task): task is Task => !!task), [orderIds, tasksById]);

  const syncLayout = useCallback((ids: string[], nextPositions = positionsForActivityIds(ids)) => {
    const measured = activityLayoutForOrder(ids, rowHeights.current);
    const ready = ids.length > 0 && ids.every(id => rowHeights.current.has(id));
    layout.set({ slots: measured.slots, positions: nextPositions, ready });
    contentHeight.set(measured.totalHeight);
    layoutReadyRef.current = ready;
  }, [contentHeight, layout]);

  const measureViewport = useCallback(() => {
    requestAnimationFrame(() => viewportRef.current?.measureInWindow((_x, top, _width, height) => {
      viewportBounds.current = { top, bottom: top + height };
    }));
  }, []);

  const updateRowLayout = useCallback((id: string, height: number) => {
    layoutDiagnostics.current.callbacks += 1;
    const previousHeight = rowHeights.current.get(id);
    if (!isMeaningfulActivityHeightChange(previousHeight, height)) {
      if (__DEV__ && layoutDiagnostics.current.callbacks % 25 === 0) {
        logger.debug('Activity reorder layout diagnostic', {
          activity_count: orderRef.current.length,
          measurement_callback_count: layoutDiagnostics.current.callbacks,
          measurement_update_count: layoutDiagnostics.current.updates,
        });
      }
      return;
    }
    layoutDiagnostics.current.updates += 1;
    if (__DEV__) logger.debug('Activity reorder layout diagnostic', {
      activity_count: orderRef.current.length,
      measurement_callback_count: layoutDiagnostics.current.callbacks,
      measurement_update_count: layoutDiagnostics.current.updates,
    });
    rowHeights.current.set(id, height);
    // Freeze the slot geometry for the duration of a drag. If native layout
    // reports a genuine content-height change, apply it after release/cancel.
    if (!dragSession.current) syncLayout(orderRef.current, layout.get().positions);
  }, [layout, syncLayout]);

  useEffect(() => {
    if (localOrder.membershipKey === membershipKey) return;
    latestSave.current = 0;
    awaitingProviderOrderKey.current = null;
    orderRef.current = incomingIds;
    lastPersistedOrder.current = incomingIds;
    layoutReadyRef.current = false;
    syncLayout(incomingIds);
  }, [incomingIds, localOrder.membershipKey, membershipKey, syncLayout]);

  useEffect(() => {
    // Provider data may rerender with unchanged IDs while its async reload is
    // settling. Only adopt an actual order change, and never replace a drop
    // with an older snapshot while its save/acknowledgement is pending.
    if (awaitingProviderOrderKey.current === incomingOrderKey) {
      awaitingProviderOrderKey.current = null;
      lastPersistedOrder.current = incomingIdsRef.current;
      return;
    }
    if (!shouldAdoptExternalActivityOrder(incomingOrderKey, orderIds.join('\u0000'),
      latestSave.current !== 0, awaitingProviderOrderKey.current)) return;
    const providerIds = incomingIdsRef.current;
    orderRef.current = providerIds;
    lastPersistedOrder.current = providerIds;
    // This is an external-source synchronization, guarded by exact order equality;
    // it runs once per actual provider-order change, not as derived-state churn.
    setLocalOrder({ membershipKey, ids: providerIds });
    syncLayout(providerIds);
  }, [incomingOrderKey, membershipKey, orderIds, syncLayout]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    autoScrollTimer.current = null;
    touchY.set(-1);
  }, [touchY]);

  const persistOrder = useCallback((ids: string[]) => {
    const saveId = ++latestSave.current;
    const saveMembership = membershipKey;
    const savedOrderKey = ids.join('\u0000');
    awaitingProviderOrderKey.current = savedOrderKey;
    const operation = saveQueue.current.then(() => onReorder(ids));
    // Serialize rapid drops so SQLite writes and rollback ownership stay ordered.
    saveQueue.current = operation.then(() => undefined, () => undefined);
    void operation.then(() => {
      if (membershipKeyRef.current !== saveMembership) return;
      lastPersistedOrder.current = ids;
      if (latestSave.current === saveId) latestSave.current = 0;
    }).catch(() => {
      if (latestSave.current !== saveId) return;
      latestSave.current = 0;
      awaitingProviderOrderKey.current = null;
      if (membershipKeyRef.current !== saveMembership) return;
      const rollback = lastPersistedOrder.current;
      orderRef.current = rollback;
      setLocalOrder({ membershipKey: saveMembership, ids: rollback });
      syncLayout(rollback);
      announce('Could not save the activity order. Please try again.');
    });
  }, [announce, membershipKey, onReorder, syncLayout]);

  const startDrag = useCallback((id: string) => {
    if (!layoutReadyRef.current) return;
    if (__DEV__) logger.debug('Activity reorder drag started', { activity_count: orderRef.current.length });
    dragSession.current = { id, initialOrder: orderRef.current.slice() };
    void Haptics.selectionAsync().catch(() => {});
    measureViewport();
    stopAutoScroll();
    autoScrollTimer.current = setInterval(() => {
      const y = touchY.get();
      const bounds = viewportBounds.current;
      if (y < 0 || !bounds) return;
      const edge = 58;
      let step = 0;
      if (y < bounds.top + edge) step = -Math.min(14, Math.max(3, Math.round((bounds.top + edge - y) / 3)));
      else if (y > bounds.bottom - edge) step = Math.min(14, Math.max(3, Math.round((y - (bounds.bottom - edge)) / 3)));
      if (step) listRef.current?.scrollTo({ y: Math.max(0, scrollOffsetRef.current + step), animated: false });
    }, 34);
  }, [layoutReadyRef, measureViewport, stopAutoScroll, touchY]);

  const finishDrag = useCallback((id: string, index: number, dragDistance = 0) => {
    const session = dragSession.current;
    if (!session || session.id !== id) return;
    if (__DEV__) logger.debug('Activity reorder drag finished', {
      activity_count: session.initialOrder.length, target_index: index, drag_distance: Math.round(dragDistance),
    });
    const next = moveActivityToIndex(session.initialOrder, id, index);
    dragSession.current = null;
    dragBase.set(null);
    dragTarget.set(-1);
    stopAutoScroll();
    orderRef.current = next;
    // Commit positions and measured slots as one shared-value update before
    // lowering the active card. The canonical layout has the same coordinates
    // as the in-gesture layout, including variable-height rows.
    const nextLayout = activityLayoutForOrder(next, rowHeights.current);
    layout.set({ slots: nextLayout.slots, positions: positionsForActivityIds(next), ready: layoutReadyRef.current });
    contentHeight.set(nextLayout.totalHeight);
    activeId.set(null);
    if (next.every((value, itemIndex) => value === session.initialOrder[itemIndex])) return;
    setLocalOrder({ membershipKey, ids: next });
    persistOrder(next);
  }, [activeId, contentHeight, dragBase, dragTarget, layout, layoutReadyRef,
    membershipKey, persistOrder, stopAutoScroll]);

  const cancelDrag = useCallback((id: string) => {
    const session = dragSession.current;
    if (!session || session.id !== id) return;
    dragSession.current = null;
    dragBase.set(null);
    dragTarget.set(-1);
    stopAutoScroll();
    orderRef.current = session.initialOrder;
    syncLayout(session.initialOrder);
  }, [dragBase, dragTarget, stopAutoScroll, syncLayout]);

  const moveWithAccessibility = useCallback((id: string, target: number) => {
    if (!layoutReadyRef.current) return;
    const next = moveActivityToIndex(orderRef.current, id, target);
    if (next === orderRef.current) return;
    orderRef.current = next;
    setLocalOrder({ membershipKey, ids: next });
    syncLayout(next);
    persistOrder(next);
  }, [membershipKey, persistOrder, syncLayout]);

  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = offset;
    scrollY.set(offset);
  }, [scrollY]);

  return <View ref={viewportRef} onLayout={measureViewport} style={styles.viewport}>
    <GestureDetector gesture={scrollGesture}>
      <Animated.ScrollView ref={listRef} onScroll={onScroll} scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Animated.View style={[styles.layoutContainer, contentHeightStyle]}>
          {orderedTasks.map((item, index) => <ActivityReorderRow key={item.id} task={item} index={index}
            count={orderedTasks.length} date={date} enabled={orderedTasks.length > 1} scrollGesture={scrollGesture}
            layout={layout} dragBase={dragBase} dragTarget={dragTarget}
            activeId={activeId} scrollY={scrollY} touchY={touchY} onMeasured={updateRowLayout}
            onStart={startDrag} onFinish={finishDrag} onCancel={cancelDrag}
            onAccessibleMove={moveWithAccessibility} />)}
      </Animated.View>
      </Animated.ScrollView>
    </GestureDetector>
  </View>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  content: { paddingHorizontal: s.xl, paddingTop: s.xs, paddingBottom: s.xxl },
  layoutContainer: { position: 'relative' },
  row: { position: 'absolute', top: 0, left: 0, right: 0, borderRadius: 18 },
  handle: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -4,
    borderRadius: 9 },
});
