import React, { memo, useState } from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { parseLocalDate } from '../../domain/task';
import { JourneyPoint, JourneySeries, JourneyTogetherData, journeyTogetherConfig,
  visibleJourneyTasks } from '../../analytics/journeyTogether';
import { colors as c, spacing as s, typography as t } from '../../theme';

const p = journeyTogetherConfig.presentation;
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
function dateLabel(date: string) { return dateFormat.format(parseLocalDate(date)); }
function xAt(index: number, count: number, width: number) {
  const inset = p.horizontalInset + p.markerRadius;
  return count <= 1 ? width / 2 : inset + index * (width - inset * 2) / (count - 1);
}
function yAt(levelIndex: number, levelCount: number) {
  const height = p.miniPlotHeight;
  const inset = p.verticalInset + p.markerRadius;
  return levelCount <= 1 ? height / 2 :
    height - inset - levelIndex * (height - inset * 2) / (levelCount - 1);
}
function linePath(series: JourneySeries, dateCount: number, width: number) {
  return series.points.map((point, index) => {
    const x = xAt(point.slotIndex, dateCount, width);
    const y = yAt(point.levelIndex, series.levelCount);
    return `${index > 0 && point.connectsToPrevious ? 'L' : 'M'} ${x} ${y}`;
  }).join(' ');
}
function closestPoint(points: JourneyPoint[], dateCount: number, width: number, touchX: number) {
  return points.reduce<JourneyPoint | null>((closest, point) => {
    if (!closest) return point;
    return Math.abs(xAt(point.slotIndex, dateCount, width) - touchX) <
      Math.abs(xAt(closest.slotIndex, dateCount, width) - touchX) ? point : closest;
  }, null);
}

const MiniTrend = memo(function MiniTrend({ series, dateCount, kind, width, onOpen }: {
  series: JourneySeries; dateCount: number; kind: JourneyTogetherData['kind'];
  width: number; onOpen: (taskId: string) => void;
}) {
  const [inspected, setInspected] = useState<JourneyPoint | null>(null);
  const inspect = (event: GestureResponderEvent) => {
    setInspected(closestPoint(series.points, dateCount, width, event.nativeEvent.locationX));
  };
  return <View style={styles.activity}>
    <View style={styles.activityHeader}>
      <View style={[styles.colorDot, { backgroundColor: series.color }]} />
      <Text style={styles.activityName} numberOfLines={1}>{series.taskName}</Text>
      {series.archived && <Text style={styles.archivedLabel}>Archived</Text>}
      <Text style={styles.latest} numberOfLines={1} accessibilityLabel={series.latestRating
        ? `Latest rating, ${series.latestRating}` : 'No recordings'}>
        {series.latestRating ?? 'No recordings'}
      </Text>
    </View>
    {series.points.length === 0 ? <Pressable onPress={() => onOpen(series.taskId)}
      accessibilityRole="button" accessibilityLabel={`Open ${series.taskName} insights. No recordings in this period.`}
      style={styles.emptyPlot}><Text style={styles.emptyText}>No recordings</Text></Pressable> :
      kind === 'today' ? <Pressable onPress={() => onOpen(series.taskId)}
        accessibilityRole="button" accessibilityLabel={`Open ${series.taskName} insights. Today: ${series.points[0].label}.`}
        style={styles.todayPlot}><View style={[styles.todayMarker, { backgroundColor: series.color }]} />
        <Text style={styles.todayText} numberOfLines={2}>{series.points[0].label}</Text></Pressable> :
      <Pressable onPress={() => onOpen(series.taskId)} onLongPress={inspect} delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`${series.taskName} trend, ${series.points.length} plotted ${kind === 'grouped' ? 'periods' : 'days'}. Latest rating: ${series.latestRating}.`}
        accessibilityHint="Double tap to open activity insights. Long press to inspect a plotted rating."
        style={styles.plotTouch}>
        {width > 0 && <Svg width={width} height={p.miniPlotHeight} pointerEvents="none">
          {[0, 0.5, 1].map(fraction => <Line key={fraction} x1={0} x2={width}
            y1={p.verticalInset + fraction * (p.miniPlotHeight - p.verticalInset * 2)}
            y2={p.verticalInset + fraction * (p.miniPlotHeight - p.verticalInset * 2)}
            stroke={journeyTogetherConfig.style.gridColor} strokeWidth={1} />)}
          <Path d={linePath(series, dateCount, width)} fill="none" stroke={series.color}
            strokeWidth={p.lineWidth} strokeLinecap="round" strokeLinejoin="round" />
          {series.points.map(point => <Circle key={`${point.slotIndex}:${point.date}`}
            cx={xAt(point.slotIndex, dateCount, width)} cy={yAt(point.levelIndex, series.levelCount)}
            r={p.markerRadius} fill={series.color} />)}
        </Svg>}
      </Pressable>}
    {inspected && <Text style={styles.inspection} accessibilityLiveRegion="polite">
      {kind === 'grouped' ? `From ${dateLabel(inspected.date)} · ${inspected.label} median · ${inspected.recordedCount} recorded` :
        `${dateLabel(inspected.date)} · ${inspected.label}`}
    </Text>}
  </View>;
});

export function JourneyTogetherChart({ data, onSelectTask }: {
  data: JourneyTogetherData; onSelectTask: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(0);
  const visible = visibleJourneyTasks(data.series, expanded);
  const axisIndices = data.dates.length > 1
    ? [...new Set(Array.from({ length: p.axisLabelCount }, (_, index) =>
      Math.round(index * (data.dates.length - 1) / (p.axisLabelCount - 1))))] : [0];
  if (data.series.length === 0) return <Text style={styles.emptyText}>Add an activity to see your journey together.</Text>;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.container}>
    {visible.map(series => <MiniTrend key={series.taskId} series={series}
      dateCount={data.dates.length} kind={data.kind} width={width} onOpen={onSelectTask} />)}
    {width > 0 && data.dates.length > 0 && <View style={styles.axis}>
      {axisIndices.map(index => <Text key={index} style={[styles.axisLabel, {
        left: Math.max(0, Math.min(width - 64, xAt(index, data.dates.length, width) - 32)),
      }]} numberOfLines={1}>{dateLabel(data.dates[index])}</Text>)}
    </View>}
    {data.series.length > p.initialActivities && <Pressable onPress={() => setExpanded(value => !value)}
      accessibilityRole="button" accessibilityState={{ expanded }}
      accessibilityLabel={expanded ? 'Show fewer activities' : `Show all ${data.series.length} activities`}
      style={styles.showToggle}><Text style={styles.showToggleText}>{expanded ? 'Show less' : 'Show all'}</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: s.sm, minWidth: 0 },
  activity: { gap: s.xs, minWidth: 0 },
  activityHeader: { flexDirection: 'row', alignItems: 'center', minWidth: 0, gap: s.sm },
  colorDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  activityName: { ...t.body, fontWeight: '600', color: c.textPrimary, flex: 1, minWidth: 0 },
  archivedLabel: { ...t.caption, color: c.textSecondary, flexShrink: 0 },
  latest: { ...t.secondary, color: c.textSecondary, maxWidth: '42%', flexShrink: 1, textAlign: 'right' },
  plotTouch: { minHeight: p.miniPlotHeight, justifyContent: 'center' },
  emptyPlot: { minHeight: 44, justifyContent: 'center' },
  emptyText: { ...t.secondary, color: c.textTertiary },
  todayPlot: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: s.sm },
  todayMarker: { width: 8, height: 8, borderRadius: 4 },
  todayText: { ...t.body, color: c.textPrimary, flexShrink: 1 },
  inspection: { ...t.caption, color: c.textSecondary },
  axis: { height: 16, position: 'relative' },
  axisLabel: { ...t.caption, color: c.textSecondary, position: 'absolute', width: 64, textAlign: 'center' },
  showToggle: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: s.xs },
  showToggleText: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
});
