import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { parseLocalDate } from '../../domain/task';
import { RatingTrendData, ratingTrendConfig } from '../../analytics/ratingTrend';
import { AdaptiveTrend } from '../../analytics/ratingTrendPresentation';
import { dailyAxisTicks, weeklyMonthTicks } from './trendAxisTicks';
import { axisColumnWidth, expandedDailyScale, expandedDayIndexAt, expandedPlotHeight } from './trendPlotLayout';
import { isolatedTrendFragments, trendCurvePath } from './trendCurve';
import { colors as c, spacing as s, typography as t } from '../../theme';

const { style: chartStyle, presentation: layout } = ratingTrendConfig;
const inset = layout.plotInset;
function formatDay(value: string, full = false) {
  return parseLocalDate(value).toLocaleDateString(undefined, full ?
    { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' } :
    { month: 'short', day: 'numeric' });
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
type PlotMode = 'daily-line' | 'weekly';
type PlotPoint = {
  x: number; y: number; connectsToPrevious: boolean;
};
function TrendPlot({ data, view, taskName, mode, expanded = false, availableHeight }: {
  data: RatingTrendData; view: AdaptiveTrend; taskName: string; mode: PlotMode;
  expanded?: boolean; availableHeight?: number;
}) {
  const [width, setWidth] = useState(0);
  const [measuredLabels, setMeasuredLabels] = useState<Record<string, number>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedViewportX, setSelectedViewportX] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const scrollOffset = useRef(0);
  const scrollWindowX = useRef<number | null>(null);
  const initialScrollWidth = useRef<number | null>(null);
  const finger = useRef<{ pageX: number; fallbackX: number } | null>(null);
  const plotHeight = expanded ? expandedPlotHeight(availableHeight ?? layout.expandedChartHeight) :
    Math.max(layout.normalChartHeight, data.levels.length * 27 + 24);
  const measuredWidth = Math.max(44, ...Object.values(measuredLabels));
  const labelsReady = data.levels.every(level => measuredLabels[level.id] !== undefined);
  const axisWidth = axisColumnWidth(measuredWidth, width, expanded,
    layout.axisMaxWidthCompact, layout.axisMaxWidthExpanded, layout.axisLabelGap);
  const viewportWidth = Math.max(1, width - axisWidth);
  const timeScale = expanded ? expandedDailyScale(viewportWidth, data.dates.length,
    inset, layout.dailyExpandedPointsPerDay) : null;
  const chartWidth = timeScale?.chartWidth ?? viewportWidth;
  const chartHeight = plotHeight + 26;
  useEffect(() => {
    if (!expanded || !labelsReady || width <= 0) return;
    const frame = requestAnimationFrame(() => {
      viewportRef.current?.measureInWindow((x: number) => { scrollWindowX.current = x; });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, labelsReady, width, chartWidth]);
  const xSpan = chartWidth - inset * 2;
  const yFor = useCallback((index: number) => inset + (data.levels.length - 1 - index) /
    Math.max(1, data.levels.length - 1) * (plotHeight - inset * 2), [data.levels.length, plotHeight]);
  const dateIndices = useMemo(() => new Map(data.dates.map((date, index) => [date, index])), [data.dates]);
  const observationByDay = useMemo(() => new Map(data.observations.map((observation, index) =>
    [dateIndices.get(observation.date), index])), [data.observations, dateIndices]);
  const dailyX = useCallback((date: string) => data.dates.length === 1 ? chartWidth / 2 :
    inset + (dateIndices.get(date) ?? 0) / Math.max(1, data.dates.length - 1) * xSpan,
  [data.dates.length, dateIndices, chartWidth, xSpan]);
  const points = useMemo<PlotPoint[]>(() => expanded ?
    data.observations.map(observation => ({ x: dailyX(observation.date),
      y: yFor(observation.levelIndex), connectsToPrevious: observation.connectsToPrevious })) :
    view.groupedPoints.map(point => ({
      x: view.slots.length === 1 ? chartWidth / 2 :
        inset + point.slotIndex / Math.max(1, view.slots.length - 1) * xSpan,
      y: yFor(point.medianLevelIndex), connectsToPrevious: point.connectsToPrevious })),
  [expanded, data.observations, dailyX, yFor, view.groupedPoints, view.slots.length, chartWidth, xSpan]);
  const selectAt = useCallback((pageX: number, fallbackX: number) => {
    if (!expanded || !timeScale) return;
    const viewportX = scrollWindowX.current === null ? fallbackX : pageX - scrollWindowX.current;
    if (viewportX < 0 || viewportX > viewportWidth) { setSelectedIndex(null); return; }
    const dayIndex = expandedDayIndexAt(viewportX, scrollOffset.current,
      timeScale.dayStep, inset, data.dates.length);
    const observationIndex = dayIndex === null ? undefined : observationByDay.get(dayIndex);
    const observation = observationIndex === undefined ? undefined : points[observationIndex];
    if (observation) {
      setSelectedViewportX(viewportX);
      setSelectedIndex(observationIndex!);
    } else setSelectedIndex(null);
  }, [expanded, timeScale, viewportWidth, observationByDay, points, data.dates.length]);
  const selectedObservation = selectedIndex === null ? undefined : data.observations[selectedIndex];
  const selectedPoint = selectedIndex === null ? undefined : points[selectedIndex];
  const line = useMemo(() => trendCurvePath(points,
    chartStyle.curve === 'linear' ? 'linear' : 'monotoneX'), [points]);
  const fragments = useMemo(() => isolatedTrendFragments(points,
    chartStyle.isolatedFragmentLength), [points]);
  const slotDates = view.slots.map(slot => slot.axisDate);
  const ticks = expanded ? dailyAxisTicks(data.dates, chartWidth, inset,
    Math.max(4, Math.floor(chartWidth / 68))) : mode === 'weekly' ?
    weeklyMonthTicks(slotDates, data.dates[0], data.dates[data.dates.length - 1],
      chartWidth, inset, Math.max(4, Math.floor(chartWidth / layout.weeklyLabelSpacing))) :
    dailyAxisTicks(slotDates, chartWidth, inset, layout.dailyDateLabelCount);
  const summary = expanded ? `${taskName} daily trend. ${data.observations.length} recorded days.` :
    `${taskName} ${view.subtitle}. ${points.length} plotted medians from ${view.recordedCount} recorded days.` +
    (view.mixedScaleSlots ? ` ${view.mixedScaleSlots} scale-change intervals are shown in the expanded daily chart.` : '');
  const surface = <View collapsable={false}
    style={{ width: chartWidth, height: chartHeight }} accessible
    accessibilityRole={expanded ? 'adjustable' : 'image'}
    accessibilityLabel={selectedObservation ?
      `${summary} ${formatDay(selectedObservation.date, true)}, ${selectedObservation.labelAtEntry}.` : summary}
    accessibilityHint={expanded ? 'Swipe up or down to inspect recorded days.' : undefined}
    accessibilityActions={expanded ? [{ name: 'increment', label: 'Next recording' },
      { name: 'decrement', label: 'Previous recording' }] : undefined}
    onAccessibilityAction={expanded ? event => {
      const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
      const next = Math.max(0, Math.min(data.observations.length - 1,
        (selectedIndex ?? (delta > 0 ? -1 : data.observations.length)) + delta));
      const targetOffset = Math.max(0, Math.min((timeScale?.initialOffset ?? 0),
        points[next].x - viewportWidth / 2));
      scrollOffset.current = targetOffset;
      scroller.current?.scrollTo({ x: targetOffset, animated: false });
      setSelectedViewportX(points[next].x - targetOffset);
      setSelectedIndex(next);
    } : undefined}>
    <Svg width={chartWidth} height={chartHeight}>
      {chartStyle.showHorizontalGridlines && data.levels.map((level, index) => <Line key={level.id} x1={0} x2={chartWidth}
        y1={yFor(index)} y2={yFor(index)} stroke={chartStyle.gridColor} strokeWidth={1}/>)}
      {line ? <Path d={line} fill="none" stroke={chartStyle.lineColor}
        strokeWidth={chartStyle.lineWidth} strokeLinecap="round" strokeLinejoin="round"/> : null}
      {fragments ? <Path d={fragments} fill="none" stroke={chartStyle.lineColor}
        strokeWidth={chartStyle.lineWidth} strokeLinecap="round"/> : null}
      {expanded && selectedPoint && <Circle cx={selectedPoint.x} cy={selectedPoint.y} r={4.5}
        fill={c.surface} stroke={chartStyle.lineColor} strokeWidth={2}/>}
      {ticks.map(item => <SvgText key={item.index} x={item.x} y={chartHeight - 5} fontSize={10}
        fill={chartStyle.axisLabelColor} textAnchor={item.anchor}>{item.label}</SvgText>)}
    </Svg>
  </View>;
  return <View onLayout={event => {
    const next = event.nativeEvent.layout.width;
    setWidth(current => current === next ? current : next);
  }}>
    <View pointerEvents="none" style={styles.measureLabels}>
      {data.levels.map(level => <Text key={level.id} style={styles.axisLabel}
        onTextLayout={event => {
          const next = Math.ceil(event.nativeEvent.lines[0]?.width ?? 0);
          if (next && measuredLabels[level.id] !== next)
            setMeasuredLabels(current => ({ ...current, [level.id]: next }));
        }}>{level.label}</Text>)}
    </View>
    {width > 0 && (!expanded || labelsReady) && <View style={styles.plotRow}>
      <View style={[styles.axis, { width: axisWidth, height: plotHeight }]}>
        {data.levels.map((level, index) => <View key={level.id}
          style={[styles.axisLabelWrap, { top: yFor(index) - 16 }]}>
          <Text numberOfLines={1} ellipsizeMode="tail"
            accessibilityLabel={level.label} style={styles.axisLabel}>{level.label}</Text>
        </View>)}
      </View>
      {expanded ? <View ref={viewportRef} style={{ width: viewportWidth, height: chartHeight }}
        onLayout={() => viewportRef.current?.measureInWindow((x: number) => { scrollWindowX.current = x; })}>
        <ScrollView ref={scroller} horizontal scrollEnabled={timeScale?.scrollEnabled}
          showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
          onScroll={event => {
            scrollOffset.current = event.nativeEvent.contentOffset.x;
            if (finger.current) selectAt(finger.current.pageX, finger.current.fallbackX);
            else if (selectedPoint) {
              const markerX = selectedPoint.x - scrollOffset.current;
              if (markerX < 0 || markerX > viewportWidth) setSelectedIndex(null);
              else setSelectedViewportX(markerX);
            }
          }}
          onTouchStart={event => {
            finger.current = { pageX: event.nativeEvent.pageX, fallbackX: event.nativeEvent.locationX };
            selectAt(finger.current.pageX, finger.current.fallbackX);
          }}
          onTouchMove={event => {
            finger.current = { pageX: event.nativeEvent.pageX, fallbackX: event.nativeEvent.locationX };
            selectAt(finger.current.pageX, finger.current.fallbackX);
          }}
          onTouchEnd={() => { finger.current = null; }}
          onTouchCancel={() => { finger.current = null; setSelectedIndex(null); }}
          onContentSizeChange={contentWidth => {
            if (initialScrollWidth.current !== contentWidth) {
              initialScrollWidth.current = contentWidth;
              scrollOffset.current = timeScale?.initialOffset ?? 0;
              scroller.current?.scrollTo({ x: scrollOffset.current, animated: false });
            }
          }}
          style={{ width: viewportWidth, height: chartHeight }} contentContainerStyle={{ width: chartWidth }}>
          {surface}
        </ScrollView>
        {selectedObservation && selectedPoint && <View pointerEvents="none" style={[styles.tooltip, {
          left: Math.max(0, Math.min(viewportWidth - 158, selectedViewportX - 79)),
          top: Math.max(0, Math.min(chartHeight - 52, selectedPoint.y - 58)),
        }]}>
          <Text style={styles.tooltipDate}>{formatDay(selectedObservation.date, true)}</Text>
          <Text style={styles.tooltipRating} numberOfLines={1}>{selectedObservation.labelAtEntry}</Text>
        </View>}
      </View> : surface}
    </View>}
  </View>;
}
export function ExpandedRatingTrendChart({ data, view, taskName, height }: {
  data: RatingTrendData; view: AdaptiveTrend; taskName: string; height: number;
}) {
  if (data.observations.length === 0) return <Text style={styles.empty}>No ratings recorded for this period.</Text>;
  return <TrendPlot data={data} view={view} taskName={taskName} mode="daily-line"
    expanded availableHeight={height}/>;
}
export function RatingTrendChart({ data, view, taskName }: {
  data: RatingTrendData; view: AdaptiveTrend; taskName: string;
}) {
  if (view.presentation === 'empty') return <Text style={styles.empty}>
    {data.isNewEpochEmpty ? 'Your new trend starts with your next rating. Earlier ratings are preserved.' :
      'No ratings recorded for this period.'}</Text>;
  if (view.presentation === 'today' || view.presentation === 'sparse')
    return <SparseSummary data={data} today={view.presentation === 'today'}/>;
  if (view.groupedPoints.length === 0) return <Text style={styles.empty}>
    Ratings from different scale versions fall in the same interval. Expand to see each recorded day.
  </Text>;
  if (view.groupedPoints.length === 1) {
    const point = view.groupedPoints[0], slot = view.slots[point.slotIndex];
    return <View style={styles.sparse} accessible
      accessibilityLabel={`${formatDay(slot.startDate, true)} to ${formatDay(slot.endDate, true)}, median ${point.medianLabel}, ${point.recordedCount} recorded days`}>
      <View style={styles.sparseRow}>
        <Text style={styles.sparseDateText}>{formatDay(slot.startDate)}–{formatDay(slot.endDate)}</Text>
        <Text style={styles.sparseRating}>{point.medianLabel}</Text>
      </View>
      <Text style={styles.count}>{point.recordedCount} recorded {point.recordedCount === 1 ? 'day' : 'days'}</Text>
    </View>;
  }
  const mode: PlotMode = view.presentation;
  return <View>
    <TrendPlot data={data} view={view} taskName={taskName} mode={mode}/>
    <View style={styles.footer}>
      <Text style={styles.count}>{view.recordedCount} recorded {view.recordedCount === 1 ? 'day' : 'days'}</Text>
      {view.mixedScaleSlots > 0 && <Text style={styles.count}>Scale changes: see expanded view</Text>}
    </View>
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
  measureLabels: { position: 'absolute', opacity: 0, top: 0, left: 0 },
  plotRow: { flexDirection: 'row', alignItems: 'flex-start' },
  axis: { position: 'relative' },
  axisLabelWrap: { position: 'absolute', left: 0, right: s.sm, minHeight: 32, justifyContent: 'center' },
  axisLabel: { ...t.caption, color: c.textSecondary, textAlign: 'right', lineHeight: 15 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: s.md, marginTop: s.xs },
  tooltip: { position: 'absolute', width: 158, borderRadius: 8,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong,
    paddingHorizontal: s.sm, paddingVertical: s.xs },
  tooltipDate: { ...t.caption, color: c.textSecondary },
  tooltipRating: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
});
