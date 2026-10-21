# TinyWins Activity Reordering — Investigation Findings

**Scope:** Read-only inspection of the Home activity reorder implementation and the level reorder implementation. No application code was changed.

## Summary

The Home screen uses a custom drag-and-drop list built with Gesture Handler, Reanimated shared values, an `Animated.ScrollView`, and measured absolute-positioned rows. It keeps drag movement on the UI thread, commits the React order on release, and persists the final order to SQLite.

The jumpiness is most plausibly caused by the dragged card moving immediately while neighbouring variable-height cards catch up asynchronously, combined with the handoff between measured layouts, React order, and persisted order. The reported “Maximum update depth exceeded” error may involve a layout-measurement-to-state feedback loop, but the current source does not establish a definitive cause. A component stack and the timing of the error are needed to identify it with confidence.

## A. Current activity reorder implementation

### 1. Gesture library and mechanism

`src/components/ActivityReorderList.tsx` implements activity dragging with:

- `react-native-gesture-handler`’s `Gesture.Pan` and `GestureDetector`.
- Reanimated shared values and animated reactions for UI-thread movement.
- `scheduleOnRN` from `react-native-worklets` to invoke JavaScript callbacks at drag start, release, and cancellation.
- Expo Haptics for selection feedback when dragging begins.

The pan gesture activates after a 300 ms long press and blocks the list’s native scroll gesture while active.

### 2. State ownership and persistence

During a drag, `ActivityReorderList` owns the temporary visual order in Reanimated shared values (`positions`, `activeId`, `dragTarget`, and `rowTop`). The component keeps a drag-session snapshot in a ref.

On release, `finishDrag` computes the final ID sequence, updates local React state with `setLocalOrder`, and calls the `onReorder` callback. `TasksProvider.reorderActivities` then invokes `TaskRepository.reorderActive()` and reloads task data.

The durable order is stored as `tasks.sortPosition`. `TaskRepository.reorderActive()` updates positions inside a transaction. It does not write to SQLite on each drag movement.

Accessibility reorder actions commit immediately through the same local-order and persistence path.

### 3. State and database updates during the gesture

- **During movement:** Reanimated shared values change on the UI thread. React order state and SQLite are not intentionally updated for each pan frame.
- **At release:** React local order is committed, then the final order is persisted once and the provider reloads tasks.
- **At cancellation:** The component restores the original shared and local order; no persistence is requested.
- **Accessibility adjustment:** Local order is updated and persisted immediately.

### 4. List rendering

The Home route renders `ActivityReorderList`, which uses an `Animated.ScrollView`. It is neither a `FlatList` nor a `DraggableFlatList`. Activity rows are rendered with `map()` as absolutely positioned animated views, inside a content container whose height is maintained separately.

### 5. React keys

Activity rows use stable persistent IDs as React keys: `key={item.id}`. The ID-based keying is appropriate and is unlikely to be the source of the observed jumps by itself.

### 6. Animations

The active row follows the finger through its animated `top` position and receives elevated stacking, a small scale change, and slight opacity change. Neighbour rows animate their new `top` positions with `withSpring` (damping 24, stiffness 220, mass 0.8, overshoot clamping).

Target changes use a 10-point hysteresis around slot boundaries to reduce rapid target flipping.

### 7. Height, scrolling, and layout during dragging

The list’s overall content height is based on row measurements and should not change simply because cards change order. However:

- Rows have variable heights and are measured through `onLayout`.
- The list scroll position changes during edge auto-scroll. A timer issues non-animated scroll steps of up to 14 points about every 34 ms.
- Layout slots are recalculated when row measurements or the order change.
- After release, the visual shared-value order, React child order, layout snapshot, and database-backed task order are synchronized in separate steps.

These characteristics make the implementation more sensitive to timing than a fixed-height list.

## B. “Maximum update depth exceeded” investigation

### 1. Relevant effects and state-update paths

#### `src/app/(tabs)/index.tsx`

- `useFocusEffect(useCallback(..., [reload]))` reloads tasks when Home gains focus.
- Active activities are derived with `useMemo` from provider task state.
- The Home route passes the provider’s `reorderActivities` and `announce` callbacks to `ActivityReorderList`.

#### `src/components/ActivityReorderList.tsx`

- `useLayoutEffect` updates `orderRef` when `orderIds` changes.
- The order synchronization `useEffect` updates shared positions/layout slots and conditionally updates `contentHeight` and `measuredIds` React state.
- A cleanup `useEffect` stops the auto-scroll timer.
- Each animated row’s `onLayout` calls `updateRowLayout`; that callback may update shared layout slots and, when comparisons detect a difference, call `setContentHeight` or `setMeasuredIds`.
- `finishDrag`, `cancelDrag`, and accessibility movement update `localOrder` and the shared position map.
- Auto-scroll updates the scroll view imperatively and records scroll offsets in refs/shared values.
- `useAnimatedReaction` updates Reanimated shared values; it does not directly set React state.

#### `src/state/TasksProvider.tsx`

- A mount effect starts the initial load, registers an `AppState` listener, and checks for a local-day change.
- `reload()` fetches tasks and only replaces the task state when the serialized data differs.
- `reorderActivities()` persists through the repository and then calls `reload()`.
- The provider’s task context is memoized. Its entry store is exposed through `useSyncExternalStore` to cards.

#### `src/components/TaskSliderCard.tsx`

- Card-local React state covers slider preview, measured slider width, busy state, and errors.
- The date effect clears slider preview when the date changes.
- A slider `onLayout` updates width; setting the same primitive width should bail out of React state updates.
- Slider movement itself uses shared values, and is separate from the activity drag handle.

#### `src/components/EditableOptionRow.tsx` and `src/components/TaskForm.tsx`

- Level-row movement is animated through shared values.
- `TaskForm` synchronizes the level-position map when the serialized option-ID order changes.
- React option order changes at drag completion, while the level editor uses a fixed-height row grid.

### 2. Potential update cycle

The main React state feedback path in the activity list is:

`row onLayout` → `updateRowLayout` → `setContentHeight` or `setMeasuredIds` → React render/layout → another `onLayout`.

The current implementation has guards intended to stop updates when row heights and measured ID sequences have not changed. Therefore, the code does **not** show an unconditional setter on every render. A loop remains plausible if measurements keep changing enough to bypass the guards or if layout/order synchronization repeatedly changes what is measured.

The order synchronization effect itself conditionally updates React state and should settle when its inputs and measured values are stable. Reanimated shared-value changes do not themselves trigger React renders.

### 3. Most likely trigger

Based on the current source, the leading code-level suspect is **layout measurement feedback** in the custom absolute-positioned list, especially if the error occurs while cards shift. If it occurs only after release, inspect the sequence of local order commit, provider reload, and order/layout synchronization.

A successful repository write alone is less likely to cause a repeated React update loop: `reorderActive()` is transactional, and the provider performs one reload after it completes. The current source does not prove the exact trigger. The React component stack and whether the error appears during initial Home layout, during dragging, or after release are needed to distinguish the paths.

### 4. Why the previous attempted fix may not have resolved it

The current code includes guards for near-equal row heights and unchanged measured ID sequences, plus hysteresis and animation changes. These reduce repeated measurement updates and boundary chatter, but they leave the measurement-to-React-state path in place. They also do not prove whether measurements are oscillating on the target device or whether the error arises during the post-release synchronization.

The current reorder component is untracked in Git, so there is no committed source diff available to compare the earlier implementation with the present one. The prior adjustment history is therefore inferred from the current code and the debugging conversation, not from a complete Git diff.

## C. Comparison with level ordering

The level editor in `src/components/EditableOptionRow.tsx` also uses a pan gesture, Reanimated shared positions, and animated neighbour movement. Its layout is simpler:

- The parent in `src/components/TaskForm.tsx` reserves a fixed height based on the number of levels.
- Each level row uses the fixed `OPTION_ROW_HEIGHT` grid.
- Neighbours use `withTiming` over 180 ms.
- React option order changes at drag completion.
- Level edits remain a draft until the user saves the form.

Activity ordering adds measured variable-height cards, a custom scroll view, edge auto-scroll, spring-based neighbour motion, and immediate database persistence followed by provider reload. Those differences plausibly explain why activity reordering is more timing-sensitive and visually less consistent. Both implementations do use stable IDs and keep the frame-by-frame movement out of React state.

## D. Likely causes and minimal recommended next step

### Jumpiness, ranked by confidence

1. **High confidence:** The dragged card follows the finger immediately while neighbours catch up with springs. If the active row crosses another slot before the neighbour finishes moving, their visible card bounds can overlap temporarily. There is no continuously moving placeholder that opens space synchronously.
2. **High confidence:** Activity cards have variable measured heights, unlike the level editor’s fixed-height rows. This makes slot movement and spring settling less uniform.
3. **Medium confidence:** Edge auto-scroll advances in discrete non-animated steps. Scroll events, finger coordinates, and shared scroll offsets can arrive at slightly different times, making edge dragging feel abrupt.
4. **Medium confidence:** On release, the visual order, React child order, layout snapshot, and persisted task order are reconciled in separate steps. A brief mismatch can look like a snap.

### Update-depth error

The best source-level lead is the `onLayout` → state → layout feedback path, but the guards make the precise failure uncertain. There is no clear evidence that normal Home rendering or SQLite persistence alone creates an infinite loop.

### Are the issues related?

They share the same custom list and layout measurements, so a measurement/layout problem could contribute to both. They are not necessarily the same bug: the visual overlap has a direct explanation in asynchronous neighbour animation, while the React error needs its component stack or runtime measurements to confirm.

### Minimal next step

Before changing the architecture, capture the full React error component stack and determine whether the error occurs during initial Home layout, while dragging, or after release. In a development reproduction, inspect whether `onLayout` repeatedly changes row heights, `contentHeight`, or `measuredIds`.

For motion, the smallest likely experiment is to match the level editor’s fixed-duration neighbour timing more closely and keep geometry stable during the gesture. This trades some spring feel for more predictable movement. It should be validated on-device; it does not, by itself, diagnose or guarantee a fix for the React update-depth error.

## Verification limits

This was a static source inspection. No code was modified, and no physical-device drag or runtime error reproduction was performed. Existing `tests/activityOrdering.test.ts` exercises ordering calculations, SQLite persistence, and backup order compatibility, but it does not mount the React list or test native gesture/layout behavior.

## Relevant files

- `src/components/ActivityReorderList.tsx` — Home drag gesture, row layout, animation, local order state, and edge auto-scroll.
- `src/components/activityOrdering.ts` — activity position calculations and target selection.
- `src/app/(tabs)/index.tsx` — Home list integration and focus reload.
- `src/state/TasksProvider.tsx` — task reload and reorder persistence callback.
- `src/data/repository.ts` — transactional `reorderActive()` and `sortPosition` persistence.
- `src/components/TaskSliderCard.tsx` — card state, slider layout, and separate slider gesture.
- `src/components/EditableOptionRow.tsx` — level reorder gesture and animation.
- `src/components/TaskForm.tsx` — fixed-height level list and option-order synchronization.
- `tests/activityOrdering.test.ts` — ordering math and persistence tests; no mounted UI gesture coverage.
