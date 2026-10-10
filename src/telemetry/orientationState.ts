import type { OrientationName } from './analytics';

export function normalizeOrientation(value: number): OrientationName {
  if (value === 1 || value === 2) return 'portrait';
  if (value === 3 || value === 4) return 'landscape';
  return 'unknown';
}

export function createOrientationTransitionTracker(initial?: OrientationName) {
  let last = initial;
  return {
    observe(next: OrientationName): { from: OrientationName; to: OrientationName } | null {
      const previous = last;
      last = next;
      if (previous === undefined || previous === next) return null;
      return { from: previous, to: next };
    },
    current: () => last,
  };
}
