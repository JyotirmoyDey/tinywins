import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RecordingConsistencyGroup, RecordingConsistencyResult } from '../../analytics/engine';
import { formatLocalDate } from '../../analytics/insightsDateRange';
import { individualRecordingConsistencyConfig as config } from '../../analytics/recordingConsistency';
import { colors as c, radii as r, spacing as s, typography as t } from '../../theme';
import { consistencyDateTicks } from './recordingConsistencyLayout';

function rangeLabel(group: RecordingConsistencyGroup) {
  return group.startDate === group.endDate ? formatLocalDate(group.startDate) :
    `${formatLocalDate(group.startDate)} – ${formatLocalDate(group.endDate)}`;
}

export function RecordingConsistencyChart({ data }: { data: RecordingConsistencyResult }) {
  const [width, setWidth] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.groups.find(group => group.id === selectedId);
  const plotHeight = data.mode === 'daily'
    ? config.presentation.dailyPlotHeight : config.presentation.plotHeight;
  const ticks = consistencyDateTicks(data.groups, width, data.mode,
    config.presentation.maxDateLabels, config.presentation.minDateLabelGap);

  if (data.status === 'unknown-start') return <Text style={styles.notice}>
    Recording coverage is unavailable because the start date is unknown.
  </Text>;
  if (data.status === 'no-eligible-days') return <Text style={styles.notice}>
    No eligible days in this period.
  </Text>;

  return <View style={styles.wrap}>
    <Text style={styles.summary}>{data.recordedDays} of {data.eligibleDays} eligible
      {data.eligibleDays === 1 ? ' day' : ' days'} recorded</Text>
    {data.mode === 'status' ? <View style={styles.status} accessibilityLabel={
      data.recordedDays ? 'Recorded for this day' : 'Not recorded for this day'}>
      <View style={[styles.statusDot, { backgroundColor: data.recordedDays
        ? config.style.barColor : config.style.emptyColor }]} />
      <Text style={styles.statusText}>{data.recordedDays ? 'Recorded' : 'Not recorded'}</Text>
    </View> : <View style={styles.chartRow}>
      <View style={[styles.yAxis, { height: plotHeight }]}>
        <Text style={[styles.axisText, styles.axisTop]}>100%</Text>
        <Text style={[styles.axisText, styles.axisMiddle]}>50%</Text>
        <Text style={[styles.axisText, styles.axisBottom]}>0%</Text>
      </View>
      <View style={styles.graph} onLayout={event => {
        const next = event.nativeEvent.layout.width;
        setWidth(current => current === next ? current : next);
      }}>
        <View style={[styles.plot, { height: plotHeight }]}>
          {[0, 0.5, 1].map(fraction => <View key={fraction} style={[styles.gridline,
            { top: fraction * (plotHeight - 1), borderColor: config.style.gridColor }]} />)}
          <View style={styles.columns}>
            {data.groups.map(group => <Pressable key={group.id} accessibilityRole="button"
              accessibilityLabel={`${rangeLabel(group)}: ${group.recordedDays} of ${group.eligibleDays} eligible days recorded${group.percentage === null ? '' : `, ${Math.round(group.percentage)} percent`}`}
              accessibilityState={{ selected: group.id === selectedId }}
              onPress={() => setSelectedId(group.id === selectedId ? null : group.id)}
              style={[styles.column, group.id === selectedId && styles.columnSelected]}>
              {group.percentage !== null && group.percentage > 0 && <View style={[styles.bar,
                { height: `${group.percentage}%`, backgroundColor: config.style.barColor,
                  borderTopLeftRadius: config.style.barRadius,
                  borderTopRightRadius: config.style.barRadius }]} />}
            </Pressable>)}
          </View>
        </View>
        <View style={styles.xAxis}>
          {ticks.map(tick => <Text key={tick.index} numberOfLines={1}
            style={[styles.dateLabel, { left: tick.left, width: tick.width }]}>{tick.label}</Text>)}
        </View>
      </View>
    </View>}
    {selected && data.mode !== 'status' && <View style={styles.detail} accessible>
      <Text style={styles.detailDate}>{rangeLabel(selected)}</Text>
      <Text style={styles.detailValue}>{selected.eligibleDays
        ? `${selected.recordedDays} of ${selected.eligibleDays} eligible days · ${Math.round(selected.percentage ?? 0)}% recorded`
        : 'No eligible days'}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: s.md },
  summary: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
  notice: { ...t.secondary, color: c.textSecondary, backgroundColor: c.surfaceSecondary,
    borderRadius: r.md, padding: s.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: s.sm,
    backgroundColor: c.surfaceSecondary, borderRadius: r.md, padding: s.md, minHeight: 50 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { ...t.body, color: c.textPrimary, fontWeight: '600' },
  chartRow: { flexDirection: 'row', gap: s.xs, minWidth: 0 },
  yAxis: { width: 30, position: 'relative' },
  axisText: { ...t.caption, fontSize: 10, color: c.textTertiary, position: 'absolute',
    left: 0, right: 0, textAlign: 'right' },
  axisTop: { top: -6 }, axisMiddle: { top: '50%', marginTop: -7 }, axisBottom: { bottom: -6 },
  graph: { flex: 1, minWidth: 0 },
  plot: { position: 'relative' },
  gridline: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1 },
  columns: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, minWidth: 0, height: '100%', justifyContent: 'flex-end',
    alignItems: 'center', marginHorizontal: 1 },
  columnSelected: { backgroundColor: c.surfaceSecondary },
  bar: { width: '72%', maxWidth: 24, minWidth: 3 },
  xAxis: { height: 19, position: 'relative', marginTop: s.xs },
  dateLabel: { ...t.caption, fontSize: 10, color: c.textSecondary,
    position: 'absolute', textAlign: 'center' },
  detail: { backgroundColor: c.surfaceSecondary, borderRadius: r.md, padding: s.sm, gap: 2 },
  detailDate: { ...t.caption, color: c.textSecondary },
  detailValue: { ...t.secondary, color: c.textPrimary },
});
