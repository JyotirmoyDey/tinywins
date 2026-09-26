import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { getRatingTrend, ratingTrendConfig } from '../analytics/ratingTrend';
import { getAdaptiveTrend } from '../analytics/ratingTrendPresentation';
import { RatingDistributionTimeline } from '../analytics/ratingDistribution';
import { useAnalyticsData } from '../analytics/useAnalyticsData';
import { ExpandedRatingTrendChart } from '../components/analytics/RatingTrendChart';
import { expandedBoundsReady } from '../components/analytics/trendPlotLayout';
import { localDate, parseLocalDate } from '../domain/task';
import { colors as c, spacing as s, typography as t } from '../theme';

function validDate(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  try { parseLocalDate(value); return value; } catch { return fallback; }
}
function shortDate(value: string) {
  return parseLocalDate(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function timelineKey(value: string | undefined): RatingDistributionTimeline {
  return value === '1D' || value === '7D' || value === '30D' || value === '90D' || value === 'CUSTOM' ? value : 'CUSTOM';
}

export default function ExpandedTrendScreen() {
  const params = useLocalSearchParams<{ task?: string; source?: string; start?: string; end?: string; timeline?: string }>();
  const router = useRouter();
  const closing = useRef(false);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const sourceIsDemo = __DEV__ && params.source === 'demo';
  const { dataset, loading } = useAnalyticsData(sourceIsDemo);
  const today = localDate();
  const startDate = validDate(params.start, today);
  const endDate = validDate(params.end, today);
  const period = useMemo(() => startDate <= endDate ? { startDate, endDate } :
    { startDate: endDate, endDate: startDate }, [startDate, endDate]);
  const task = dataset.tasks.find(item => item.id === params.task);
  const data = useMemo(() => task ? getRatingTrend({ task, entries: dataset.entries,
    versions: dataset.scaleVersions, period }) : null,
  [task, dataset.entries, dataset.scaleVersions, period]);
  const view = useMemo(() => data ? getAdaptiveTrend(data, timelineKey(params.timeline)) : null,
    [data, params.timeline]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/insights');
  }, [router]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => listener.remove();
  }, [close]);
  // Render from the actual container size, then remount as native rotation changes it.
  const ready = expandedBoundsReady(bounds.width, bounds.height);
  const rangeLabel = period.startDate === period.endDate ? shortDate(period.startDate) :
    `${shortDate(period.startDate)} – ${shortDate(period.endDate)}`;

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
    <View style={styles.header}>
      <View style={styles.heading}>
        <Text style={styles.taskName} numberOfLines={1}>{task?.name ?? ratingTrendConfig.title}</Text>
        <Text style={styles.range} numberOfLines={1}>{rangeLabel}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close expanded trend"
        onPress={close} style={styles.close}>
        <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}>
          <Path d="M5 5 19 19M19 5 5 19" fill="none" stroke={c.textPrimary}
            strokeWidth={1.8} strokeLinecap="round"/>
        </Svg>
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </View>
    <View style={styles.chart} onLayout={event => {
      const { width, height } = event.nativeEvent.layout;
      setBounds(current => current.width === width && current.height === height ? current : { width, height });
    }}>
      {!ready ? <Text style={styles.message}>Preparing landscape chart…</Text> :
        loading ? <Text style={styles.message}>Loading chart…</Text> :
        data && view ? <ExpandedRatingTrendChart
          key={`${period.startDate}-${period.endDate}-${Math.round(bounds.width)}-${Math.round(bounds.height)}`}
          data={data} view={view} taskName={task?.name ?? 'Insights'} height={Math.floor(bounds.height)}/> :
          <Text style={styles.message}>This is no longer available.</Text>}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: s.lg, paddingVertical: s.xs, backgroundColor: c.background },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: s.md },
  heading: { flex: 1, minWidth: 0, gap: 2 },
  taskName: { ...t.taskTitle, color: c.textPrimary },
  range: { ...t.caption, color: c.textSecondary },
  close: { minWidth: 54, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 1 },
  closeText: { ...t.caption, fontSize: 11, color: c.textPrimary },
  chart: { flex: 1, minHeight: 0, justifyContent: 'center' },
  message: { ...t.secondary, color: c.textSecondary, textAlign: 'center' },
});
