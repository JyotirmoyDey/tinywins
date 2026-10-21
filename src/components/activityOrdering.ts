export type ActivityLayoutSlot = { id: string; top: number; height: number };
export type ActivityOrderPositions = Record<string, number>;

export const ESTIMATED_ACTIVITY_ROW_HEIGHT = 164;
export const ACTIVITY_ROW_HEIGHT_TOLERANCE = 0.75;

/** Build a stable measured layout for an order. Missing measurements use the initial estimate. */
export function activityLayoutForOrder(ids: string[], heights: ReadonlyMap<string, number> = new Map(),
  estimate = ESTIMATED_ACTIVITY_ROW_HEIGHT) {
  let top = 0;
  const slots = ids.map(id => {
    const height = heights.get(id) ?? estimate;
    const slot = { id, top, height };
    top += height;
    return slot;
  });
  return { slots, totalHeight: top };
}

/** Ignore sub-pixel layout noise so onLayout cannot feed insignificant changes back into layout. */
export function isMeaningfulActivityHeightChange(previous: number | undefined, next: number,
  tolerance = ACTIVITY_ROW_HEIGHT_TOLERANCE) {
  return previous === undefined || Math.abs(previous - next) >= tolerance;
}

export function positionsForActivityIds(ids: string[]): ActivityOrderPositions {
  'worklet';
  const positions: ActivityOrderPositions = {};
  ids.forEach((id, index) => { positions[id] = index; });
  return positions;
}

/** Move one activity and shift each crossed activity into the newly opened slot. */
export function moveActivityPosition(positions: ActivityOrderPositions, id: string, target: number): ActivityOrderPositions {
  'worklet';
  const from = positions[id];
  const count = Object.keys(positions).length;
  const to = Math.max(0, Math.min(count - 1, Math.round(target)));
  if (from === undefined || from === to) return positions;
  const next = { ...positions };
  for (const key of Object.keys(next)) {
    const position = positions[key];
    if (key === id) next[key] = to;
    else if (from < to && position > from && position <= to) next[key] = position - 1;
    else if (from > to && position >= to && position < from) next[key] = position + 1;
  }
  return next;
}

/** Find the content-space top of an activity at its current shared position. */
export function activityTopAtPosition(id: string, positions: ActivityOrderPositions, slots: ActivityLayoutSlot[]) {
  'worklet';
  const target = positions[id];
  if (target === undefined) return 0;
  let top = 0;
  for (const slot of slots) {
    if (positions[slot.id] < target) top += slot.height;
  }
  return top;
}

export function moveActivityToIndex(ids: string[], id: string, targetIndex: number) {
  const from = ids.indexOf(id);
  if (from < 0 || ids.length < 2) return ids;
  const to = Math.max(0, Math.min(ids.length - 1, Math.round(targetIndex)));
  if (from === to) return ids;
  const next = ids.slice();
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** Ignore stale provider snapshots while a local order is saving or awaiting acknowledgement. */
export function shouldAdoptExternalActivityOrder(providerOrderKey: string, localOrderKey: string,
  saveInFlight: boolean, awaitingOrderKey: string | null) {
  return !saveInFlight && awaitingOrderKey === null && providerOrderKey !== localOrderKey;
}

/** Return the insertion slot crossed by a dragged row's center. */
export function activityIndexAtCenter(slots: ActivityLayoutSlot[], id: string, center: number) {
  'worklet';
  const rowCount = slots.length;
  if (!slots.some(slot => slot.id === id)) return -1;
  let index = 0;
  for (const slot of slots) {
    if (slot.id !== id && center >= slot.top + slot.height / 2) index++;
  }
  return Math.max(0, Math.min(rowCount - 1, index));
}

/** Require a small over-crossing before previewing another slot, preventing boundary jitter. */
export function stableActivityIndexAtCenter(slots: ActivityLayoutSlot[], id: string, center: number,
  currentIndex: number, hysteresis = 10) {
  'worklet';
  const candidate = activityIndexAtCenter(slots, id, center);
  if (candidate < 0 || candidate === currentIndex) return currentIndex;
  const originIndex = slots.findIndex(slot => slot.id === id);
  let boundaryIndex = candidate;
  // The raw target counts the rows passed by the dragged row's center. When
  // returning to its original slot, the crossed boundary is the neighbor on
  // the opposite side of the dragged item's original center.
  if (candidate > currentIndex && candidate === originIndex) boundaryIndex--;
  else if (candidate < currentIndex && candidate === originIndex) boundaryIndex++;
  const boundary = slots[boundaryIndex];
  if (!boundary) return currentIndex;
  const midpoint = boundary.top + boundary.height / 2;
  if (candidate < currentIndex && center >= midpoint - hysteresis) return currentIndex;
  if (candidate > currentIndex && center <= midpoint + hysteresis) return currentIndex;
  return candidate;
}
