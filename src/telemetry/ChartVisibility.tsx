import { useCallback, useEffect, useRef } from 'react';
import { Dimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { trackChartViewed } from './analytics';
import { withPerformanceTrace } from './performance';

type Scope = 'activity' | 'all';
const checks = new Set<() => void>();
export function checkVisibleCharts() { checks.forEach(check => check()); }
export function ChartVisibility({ chartType, scope, children }: React.PropsWithChildren<{
  chartType: string; scope: Scope;
}>) {
  const view = useRef<View>(null);
  const visible = useRef(false);
  const focused = useRef(false);
  const check = useCallback(() => {
    if (!focused.current) return;
    view.current?.measureInWindow((_x, y, _width, height) => {
      const windowHeight = Dimensions.get('window').height;
      const nowVisible = height > 0 && y < windowHeight - 80 && y + height > 80;
      if (nowVisible && !visible.current) trackChartViewed(chartType, scope);
      visible.current = nowVisible;
    });
  }, [chartType, scope]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    const frame = requestAnimationFrame(check);
    return () => { focused.current = false; visible.current = false; cancelAnimationFrame(frame); };
  }, [check]));
  useEffect(() => {
    checks.add(check);
    const frame = requestAnimationFrame(check);
    return () => { checks.delete(check); cancelAnimationFrame(frame); };
  }, [check]);
  // A chart render trace ends at first native layout, independent of React rerenders.
  const traceStarted = useRef(false);
  return <View ref={view} collapsable={false} onLayout={() => {
    if (!traceStarted.current) {
      traceStarted.current = true;
      void withPerformanceTrace('chart_render', () => new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      }));
    }
    check();
  }}>{children}</View>;
}
