import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { parseLocalDate } from '../../domain/task';
import { RatingTrendData, ratingTrendConfig } from '../../analytics/ratingTrend';
import { AdaptiveTrend, WeeklyTrendPoint, mondayOf } from '../../analytics/ratingTrendPresentation';
import { dailyAxisTicks, weeklyMonthTicks } from './trendAxisTicks';
import { colors as c, spacing as s, typography as t } from '../../theme';

const { style: chartStyle, presentation: layout, interaction } = ratingTrendConfig;
const inset = 18;
let lastHapticAt = 0;
function selectionHaptic() {
  if (!interaction.hapticOnChange) return;
  const now = Date.now();
  if (now - lastHapticAt < interaction.hapticIntervalMs) return;
  lastHapticAt = now;
  void Haptics.selectionAsync().catch(() => {});
}
function formatDay(value: string, full = false) {
  return parseLocalDate(value).toLocaleDateString(undefined, full ?
    { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' } :
    { month: 'short', day: 'numeric' });
}
function WeeklyDetail({ point }: { point: WeeklyTrendPoint }) {
  return <View style={styles.weekDetail}>
    <Text style={styles.detailHeading}>{formatDay(point.weekStart)}–{formatDay(point.weekEnd)}</Text>
    <Text style={styles.detailMain}>Median · {point.medianLabel}</Text>
    <Text style={styles.detailSecondary}>{point.observations.length} recorded {point.observations.length === 1 ? 'day' : 'days'} · Range: {point.minLabel}–{point.maxLabel}</Text>
  </View>;
}
function SparseSummary({ data, today }: { data: RatingTrendData; today: boolean }) {
  return <View style={styles.sparse}>
    {data.observations.map(observation => <View key={observation.date} style={styles.sparseRow} accessible
      accessibilityLabel={`${formatDay(observation.date, true)}, ${observation.labelAtEntry}`}>
      <View style={styles.sparseDate}><View style={styles.sparseDot}/><Text style={styles.sparseDateText}>
        {today ? 'Today' : formatDay(observation.date)}
      </Text></View>
      <Text style={styles.sparseRating}>{observation.labelAtEntry}</Text>
    </View>)}
    <Text style={styles.count}>{data.observations.length} recorded {data.observations.length === 1 ? 'rating' : 'ratings'}</Text>
  </View>;
}
type PlotMode = 'daily-line' | 'daily-dots' | 'weekly';
type PlotPoint = {
  id: string; x: number; y: number; date: string; levelIndex: number;
  connectsToPrevious: boolean; weekly?: WeeklyTrendPoint; label: string;
  minY?: number; maxY?: number;
};
function TrendPlot({ data, view, taskName, mode, expanded = false, onOpenWeek }: {
  data: RatingTrendData; view: AdaptiveTrend; taskName: string; mode: PlotMode;
  expanded?: boolean; onOpenWeek?: (point: WeeklyTrendPoint) => void;
}) {
  const [width, setWidth] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastIndex = useSharedValue(-1);
  const plotHeight = Math.max(expanded ? layout.expandedChartHeight : layout.normalChartHeight,
    data.levels.length * 27 + 24);
  const longestLabel = Math.max(0, ...data.levels.map(level => level.label.length));
  const axisWidth = Math.min(Math.max(width < 310 ? 82 : 92, longestLabel * 5.2 + 12),
    Math.min(140, width * 0.42));
  const viewportWidth = Math.max(1, width - axisWidth);
  const scrollableWeeks = mode === 'weekly' && view.weeks.length > layout.weeklyScrollableAfterWeeks;
  const chartWidth = scrollableWeeks ? Math.max(viewportWidth,
    (view.weeks.length - 1) * layout.weeklyPointsPerWeek + inset * 2) :
    expanded ? Math.max(viewportWidth, data.dates.length * layout.dailyExpandedPointsPerDay) : viewportWidth;
  const chartHeight = plotHeight + 26;
  const xSpan = chartWidth - inset * 2;
  const yFor = useCallback((index: number) => inset + (data.levels.length - 1 - index) /
    Math.max(1, data.levels.length - 1) * (plotHeight - inset * 2), [data.levels.length, plotHeight]);
  const dateIndices = useMemo(() => new Map(data.dates.map((date, index) => [date, index])), [data.dates]);
  const weekIndices = useMemo(() => new Map(view.weeks.map((week, index) => [week, index])), [view.weeks]);
  const dailyX = useCallback((date: string) => data.dates.length === 1 ? chartWidth / 2 :
    inset + (dateIndices.get(date) ?? 0) / Math.max(1, data.dates.length - 1) * xSpan,
  [data.dates.length, dateIndices, chartWidth, xSpan]);
  const weekX = useCallback((week: string) => view.weeks.length === 1 ? chartWidth / 2 :
    inset + (weekIndices.get(week) ?? 0) / Math.max(1, view.weeks.length - 1) * xSpan,
  [view.weeks.length, weekIndices, chartWidth, xSpan]);
  const points = useMemo<PlotPoint[]>(() => mode === 'weekly' ?
    view.weeklyPoints.map(point => {
      const slot = xSpan / Math.max(1, view.weeks.length - 1);
      const offset = point.groupsInWeek > 1 ?
        (point.groupIndex - (point.groupsInWeek - 1) / 2) * Math.min(12, slot / 3) : 0;
      return { id: point.id, x: Math.max(inset, Math.min(chartWidth - inset, weekX(point.weekStart) + offset)),
        y: yFor(point.medianLevelIndex), date: point.weekStart, levelIndex: point.medianLevelIndex,
        connectsToPrevious: point.connectsToPrevious, weekly: point, label: point.medianLabel,
        minY: yFor(point.minLevelIndex), maxY: yFor(point.maxLevelIndex) };
    }) :
    data.observations.map(observation => ({ id: observation.date, x: dailyX(observation.date),
      y: yFor(observation.levelIndex), date: observation.date, levelIndex: observation.levelIndex,
      connectsToPrevious: observation.connectsToPrevious, label: observation.labelAtEntry })),
  [mode, view.weeklyPoints, view.weeks.length, data.observations, xSpan, chartWidth, weekX, yFor, dailyX]);
  const chosen = points.find(point => point.id === selectedId) ?? null;
  const chosenIndex = chosen ? points.indexOf(chosen) : -1;
  const reveal = useCallback((index: number) => { if (points[index]) setSelectedId(points[index].id); }, [points]);
  const clear = useCallback(() => setSelectedId(null), []);
  const xs = useMemo(() => points.map(point => point.x), [points]);
  const gesture = useMemo(() => {
    const move = (x: number) => {
      'worklet';
      if (!xs.length) return;
      let closest = 0; let distance = Infinity;
      for (let index = 0; index < xs.length; index++) {
        const delta = Math.abs(xs[index] - x);
        if (delta < distance) { distance = delta; closest = index; }
      }
      const radius = Math.max(interaction.nearestTouchRadius,
        xSpan / Math.max(1, mode === 'weekly' ? view.weeks.length : data.dates.length));
      if (distance > radius) {
        if (lastIndex.get() !== -1) { lastIndex.set(-1); scheduleOnRN(clear); }
      } else if (lastIndex.get() !== closest) {
        lastIndex.set(closest);
        scheduleOnRN(reveal, closest);
        scheduleOnRN(selectionHaptic);
      }
    };
    const tap = Gesture.Tap().maxDistance(10).onEnd((event, success) => { if (success) move(event.x); });
    if (expanded || scrollableWeeks) return tap;
    return Gesture.Race(
      Gesture.Pan().activeOffsetX([-8, 8]).failOffsetY([-12, 12])
        .onStart(event => { move(event.x); }).onUpdate(event => { move(event.x); }),
      tap,
    );
  }, [xs, xSpan, mode, view.weeks.length, data.dates.length, lastIndex, reveal, clear, expanded, scrollableWeeks]);
  const line = mode === 'daily-dots' ? '' : points.reduce((path, point, index) => {
    if (!point.connectsToPrevious || index === 0) return path;
    const previous = points[index - 1];
    return path + ` M ${previous.x} ${previous.y} L ${point.x} ${point.y}`;
  }, '');
  const ticks = mode === 'weekly' ?
    weeklyMonthTicks(view.weeks, data.dates[0], data.dates[data.dates.length - 1],
      chartWidth, inset, Math.max(4, Math.floor(chartWidth / layout.weeklyLabelSpacing))) :
    dailyAxisTicks(data.dates, chartWidth, inset, expanded ?
      Math.max(4, Math.floor(chartWidth / 68)) : layout.dailyDateLabelCount);
  const accessibilityValue = chosen ? chosen.weekly ?
    `Week of ${formatDay(chosen.weekly.weekStart)}, median ${chosen.weekly.medianLabel}, ${chosen.weekly.observations.length} recorded days, lowest ${chosen.weekly.minLabel}, highest ${chosen.weekly.maxLabel}` :
    `${formatDay(chosen.date, true)}, ${chosen.label}` :
    `${points.length} ${mode === 'weekly' ? 'weekly summaries' : 'daily ratings'}. Swipe up or down to explore.`;
  const surface = <GestureDetector gesture={gesture}><View collapsable={false}
    style={{ width: chartWidth, height: chartHeight }} accessible accessibilityRole="adjustable"
    accessibilityLabel={`${taskName} ${mode === 'weekly' ? 'weekly overview' : 'rating trend'}`}
    accessibilityValue={{ text: accessibilityValue }}
    accessibilityHint="Touch the chart or swipe up and down with a screen reader to explore recorded ratings."
    accessibilityActions={[{ name: 'increment', label: 'Next observation' }, { name: 'decrement', label: 'Previous observation' }]}
    onAccessibilityAction={event => {
      const next = event.nativeEvent.actionName === 'increment' ? chosenIndex + 1 :
        chosenIndex < 0 ? points.length - 1 : chosenIndex - 1;
      const bounded = Math.max(0, Math.min(points.length - 1, next));
      if (bounded !== chosenIndex) { lastIndex.set(bounded); reveal(bounded); selectionHaptic(); }
    }}>
    <Svg width={chartWidth} height={chartHeight}>
      {data.levels.map((level, index) => <Line key={level.id} x1={0} x2={chartWidth}
        y1={yFor(index)} y2={yFor(index)} stroke={chartStyle.gridColor} strokeWidth={1}/>)}
      {data.scaleChangeDates.map(date => <Line key={date}
        x1={mode === 'weekly' ? weekX(mondayOf(date)) : dailyX(date)}
        x2={mode === 'weekly' ? weekX(mondayOf(date)) : dailyX(date)}
        y1={inset} y2={plotHeight - inset} stroke={c.borderStrong} strokeDasharray="3 5" strokeWidth={1}/>)}
      {chosen?.weekly && chosen.minY !== chosen.maxY &&
        <Line x1={chosen.x} x2={chosen.x} y1={chosen.minY} y2={chosen.maxY}
          stroke={chartStyle.variationColor} strokeWidth={2} strokeLinecap="round"/>}
      {line ? <Path d={line} fill="none" stroke={chartStyle.lineColor}
        strokeWidth={chartStyle.lineWidth} strokeLinecap="round"/> : null}
      {points.map(point => <Circle key={point.id} cx={point.x} cy={point.y}
        r={point.id === selectedId ? chartStyle.activeMarkerRadius :
          mode === 'weekly' ? chartStyle.weeklyMarkerRadius : chartStyle.markerRadius}
        stroke={chartStyle.lineColor} strokeWidth={1.7}
        fill={mode === 'daily-dots' ? chartStyle.lineColor : chartStyle.markerFill}/>)}
      {ticks.map(item => <SvgText key={item.index} x={item.x} y={chartHeight - 5} fontSize={10}
        fill={chartStyle.axisLabelColor} textAnchor={item.anchor}>{item.label}</SvgText>)}
    </Svg>
  </View></GestureDetector>;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {width > 0 && <View style={styles.plotRow}>
      <View style={[styles.axis, { width: axisWidth, height: plotHeight }]}>
        {data.levels.map((level, index) => <View key={level.id}
          style={[styles.axisLabelWrap, { top: yFor(index) - 16 }]}>
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.76}
            accessibilityLabel={level.label} style={styles.axisLabel}>{level.label}</Text>
        </View>)}
      </View>
      {expanded || scrollableWeeks ? <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ width: viewportWidth }} contentContainerStyle={{ width: chartWidth }}>
        {surface}
      </ScrollView> : surface}
    </View>}
    {chosen && <View style={styles.tooltip}>
      {chosen.weekly ? <>
        <View style={styles.tooltipText} accessible accessibilityLabel={accessibilityValue}>
          <Text style={styles.detailHeading}>{formatDay(chosen.weekly.weekStart)}–{formatDay(chosen.weekly.weekEnd)}
            {' · '}{chosen.weekly.observations.length} recorded</Text>
          <Text style={styles.detailMain}>Median: {chosen.weekly.medianLabel}</Text>
          <Text style={styles.detailSecondary}>
            Lowest {chosen.weekly.minLabel} · Highest {chosen.weekly.maxLabel}
          </Text>
        </View>
        {onOpenWeek && <Pressable accessibilityRole="button" onPress={() => onOpenWeek(chosen.weekly!)}
          style={styles.inlineAction}><Text style={styles.inlineActionText}>Inspect week</Text></Pressable>}
      </> : <View accessible accessibilityLabel={accessibilityValue}>
        <Text style={styles.detailHeading}>{formatDay(chosen.date, true)}</Text>
        <Text style={styles.detailMain}>{chosen.label}</Text>
      </View>}
    </View>}
  </View>;
}
type Detail = { kind: 'daily' } | { kind: 'week'; point: WeeklyTrendPoint };
function TrendDetailModal({ detail, onClose, data, view, taskName }: {
  detail: Detail; onClose: () => void; data: RatingTrendData; view: AdaptiveTrend; taskName: string;
}) {
  const observations = detail.kind === 'week' ? detail.point.observations : data.observations;
  return <Modal visible animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
    onRequestClose={onClose}>
    <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaView style={styles.modalScreen} edges={['top', 'bottom']}>
      <View style={styles.modalHeader}>
        <View style={{ flex: 1 }}><Text style={styles.modalTitle}>{detail.kind === 'week' ? 'Recorded this week' : 'Daily ratings'}</Text>
          <Text style={styles.modalSubtitle}>{taskName}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close trend detail" onPress={onClose}
          style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      <FlatList data={observations} keyExtractor={item => item.date}
        contentContainerStyle={styles.modalContent}
        ListHeaderComponent={<View style={styles.modalListHeader}>
          {detail.kind === 'daily' ? <View style={styles.expandedCard}>
            {data.dates.length <= layout.maxExpandedPlotDays ? <>
              <Text style={styles.detailSecondary}>Daily ratings in their calendar positions. Empty days stay blank.</Text>
              <TrendPlot data={data} view={view} taskName={taskName} mode="daily-dots" expanded/>
            </> : <Text style={styles.detailSecondary}>Every recorded day in the selected period is listed below.</Text>}
          </View> : <View style={styles.expandedCard}>
            <WeeklyDetail point={detail.point}/>
            <Text style={styles.detailSecondary}>Responses: {detail.point.distribution.map(item => `${item.label} ${item.count}`).join(' · ')}</Text>
            <Text style={styles.detailSecondary}>For an even number of ratings, the lower middle rating is the median.</Text>
          </View>}
          <Text style={styles.listHeading}>{observations.length} recorded {observations.length === 1 ? 'day' : 'days'}</Text>
        </View>}
        renderItem={({ item, index }) => <View style={[styles.observationRow,
          index === 0 && styles.firstObservation, index === observations.length - 1 && styles.lastObservation]}
          accessible accessibilityLabel={`${formatDay(item.date, true)}, ${item.labelAtEntry}`}>
          <Text style={styles.observationDate}>{formatDay(item.date, true)}</Text>
          <Text style={styles.observationRating}>{item.labelAtEntry}</Text>
        </View>}
      />
    </SafeAreaView></GestureHandlerRootView>
  </Modal>;
}
export function RatingTrendChart({ data, view, taskName }: {
  data: RatingTrendData; view: AdaptiveTrend; taskName: string;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  if (view.presentation === 'empty') return <Text style={styles.empty}>
    {data.isNewEpochEmpty ? 'Your new trend starts with your next rating. Earlier ratings are preserved.' :
      'No ratings recorded for this period.'}</Text>;
  if (view.presentation === 'today' || view.presentation === 'sparse')
    return <SparseSummary data={data} today={view.presentation === 'today'}/>;
  const mode: PlotMode = view.presentation;
  return <View>
    <TrendPlot data={data} view={view} taskName={taskName} mode={mode}
      onOpenWeek={point => setDetail({ kind: 'week', point })}/>
    <View style={styles.footer}>
      <Text style={styles.count}>{view.recordedCount} recorded {view.recordedCount === 1 ? 'day' : 'days'}</Text>
      {(mode === 'weekly' || mode === 'daily-dots') && interaction.allowExpandedDaily &&
        <Pressable accessibilityRole="button" accessibilityLabel="View all daily ratings"
          onPress={() => setDetail({ kind: 'daily' })} style={styles.footerAction}>
          <Text style={styles.footerActionText}>View all days</Text>
        </Pressable>}
      {mode === 'weekly' && <Pressable accessibilityRole="button" accessibilityLabel="About weekly ratings"
        onPress={() => setShowInfo(value => !value)} style={styles.infoAction}>
        <Text style={styles.infoText}>ⓘ</Text>
      </Pressable>}
    </View>
    <Modal transparent visible={showInfo} animationType="fade" onRequestClose={() => setShowInfo(false)}>
      <View style={styles.infoBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button"
          accessibilityLabel="Close weekly overview information" onPress={() => setShowInfo(false)}/>
        <View style={styles.infoSheet}>
          <Text style={styles.infoTitle}>About weekly overview</Text>
          <Text style={styles.infoBody}>Weeks start Monday. Each marker shows the middle recorded rating for that week. With an even number of ratings, the lower middle rating is used. Missing weeks stay blank, and scale changes remain separate.</Text>
          <Pressable accessibilityRole="button" onPress={() => setShowInfo(false)} style={styles.infoClose}>
            <Text style={styles.infoCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    {detail && <TrendDetailModal detail={detail} onClose={() => setDetail(null)}
      data={data} view={view} taskName={taskName}/>}
  </View>;
}
const styles = StyleSheet.create({
  empty: { ...t.secondary, color: c.textSecondary, paddingVertical: s.sm },
  sparse: { gap: s.sm, paddingTop: s.xs },
  sparseRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: s.md, backgroundColor: c.surfaceSecondary, borderRadius: 10, paddingHorizontal: s.md, paddingVertical: s.sm },
  sparseDate: { flexDirection: 'row', alignItems: 'center', gap: s.sm, flexShrink: 0 },
  sparseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: chartStyle.lineColor },
  sparseDateText: { ...t.secondary, color: c.textSecondary },
  sparseRating: { ...t.body, fontWeight: '600', color: c.textPrimary, flexShrink: 1, textAlign: 'right' },
  count: { ...t.caption, color: c.textSecondary },
  plotRow: { flexDirection: 'row', alignItems: 'flex-start' },
  axis: { position: 'relative' },
  axisLabelWrap: { position: 'absolute', left: 0, right: s.sm, minHeight: 32, justifyContent: 'center' },
  axisLabel: { ...t.caption, color: c.textSecondary, textAlign: 'right', lineHeight: 15 },
  tooltip: { backgroundColor: c.surfaceSecondary, borderRadius: 10, paddingHorizontal: s.md,
    paddingVertical: s.sm, marginTop: s.xs, gap: s.xs, flexDirection: 'row', alignItems: 'center' },
  tooltipText: { flex: 1, minWidth: 0, gap: 2 },
  weekDetail: { gap: s.xs },
  detailHeading: { ...t.caption, color: c.textSecondary },
  detailMain: { ...t.body, fontWeight: '600', color: c.textPrimary },
  detailSecondary: { ...t.caption, color: c.textSecondary },
  inlineAction: { minHeight: 44, justifyContent: 'center', paddingLeft: s.sm, flexShrink: 0 },
  inlineActionText: { ...t.caption, color: c.textPrimary, textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: s.md, marginTop: s.xs },
  footerAction: { minHeight: 40, justifyContent: 'center', marginLeft: 'auto' },
  footerActionText: { ...t.caption, color: c.textPrimary, fontWeight: '600' },
  infoAction: { minWidth: 36, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  infoText: { fontSize: 17, color: c.textSecondary },
  infoBackdrop: { flex: 1, backgroundColor: c.scrim, justifyContent: 'center', padding: s.xl },
  infoSheet: { backgroundColor: c.surface, borderRadius: 16, padding: s.lg, gap: s.md },
  infoTitle: { ...t.taskTitle, color: c.textPrimary },
  infoBody: { ...t.secondary, color: c.textSecondary },
  infoClose: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' },
  infoCloseText: { ...t.button, color: c.textPrimary },
  modalScreen: { flex: 1, backgroundColor: c.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: s.xl, paddingVertical: s.md,
    borderBottomWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  modalTitle: { ...t.sectionTitle, color: c.textPrimary },
  modalSubtitle: { ...t.secondary, color: c.textSecondary },
  close: { minWidth: 52, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  closeText: { ...t.button, color: c.textPrimary },
  modalContent: { padding: s.xl, paddingBottom: s.xxxl },
  modalListHeader: { gap: s.xl, marginBottom: s.md },
  expandedCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: 16, padding: s.lg, gap: s.md },
  listHeading: { ...t.caption, color: c.textSecondary },
  observationRow: { minHeight: 48, paddingHorizontal: s.lg, paddingVertical: s.sm, backgroundColor: c.surface,
    borderLeftWidth: 1, borderRightWidth: 1,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s.md },
  firstObservation: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  lastObservation: { borderBottomWidth: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  observationDate: { ...t.secondary, color: c.textSecondary, flexShrink: 1 },
  observationRating: { ...t.secondary, color: c.textPrimary, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
});
