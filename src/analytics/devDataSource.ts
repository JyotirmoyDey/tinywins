import { useSyncExternalStore } from 'react';

export type InsightsSource = 'my' | 'demo';
let source: InsightsSource = 'my';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => source;

export function useDevInsightsSource(): InsightsSource {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  return __DEV__ ? current : 'my';
}

export function setDevInsightsSource(next: InsightsSource) {
  if (!__DEV__ || source === next) return;
  source = next;
  listeners.forEach(listener => listener());
}
