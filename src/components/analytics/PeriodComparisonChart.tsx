import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PeriodComparisonResult, PeriodComparisonRow } from '../../analytics/engine';
import { formatLocalDate } from '../../analytics/insightsDateRange';
import { periodComparisonConfig as config } from '../../analytics/periodComparison';
import { localDate } from '../../domain/task';
import { colors as c, radii as r, spacing as s, typography as t } from '../../theme';

type Selection = { optionId: string; period: 'current' | 'previous' } | null;

function periodLabel(start: string, end: string) {
  return start === end ? formatLocalDate(start) : `${formatLocalDate(start)} – ${formatLocalDate(end)}`;
}

function Coverage({ label, startDate, endDate, recorded, days }: {
  label: string; startDate: string; endDate: string; recorded: number; days: number;
}) {
  return <View style={styles.coverageRow}>
    <View style={styles.coverageName}>
      <Text style={styles.coverageTitle}>{label}</Text>
      <Text style={styles.coverageDates}>{periodLabel(startDate, endDate)}</Text>
    </View>
    <Text style={styles.coverageCount}>{recorded} of {days} days</Text>
  </View>;
}

function ComparisonBars({ row, selected, onSelect }: {
  row: PeriodComparisonRow; selected: Selection; onSelect: (value: Selection) => void;
}) {
  const bars = [
    { period: 'previous' as const, count: row.previousCount, percentage: row.previousPercentage,
      color: config.style.previousColor },
    { period: 'current' as const, count: row.currentCount, percentage: row.currentPercentage,
      color: config.style.currentColor },
  ];
  const active = selected?.optionId === row.optionId
    ? bars.find(bar => bar.period === selected.period) : undefined;
  return <View style={styles.optionGroup}>
    <Text style={styles.optionLabel}>{row.label}</Text>
    {bars.map(bar => <Pressable key={bar.period} accessibilityRole="button"
      accessibilityLabel={`${row.label}, ${bar.period} period: ${bar.count} recordings, ${Math.round(bar.percentage)} percent`}
      accessibilityState={{ selected: selected?.optionId === row.optionId && selected.period === bar.period }}
      onPress={() => onSelect(selected?.optionId === row.optionId && selected.period === bar.period
        ? null : { optionId: row.optionId, period: bar.period })}
      style={styles.barTouch}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(config.presentation.barMaximum, bar.percentage)}%`,
          backgroundColor: bar.color, borderRadius: config.style.barRadius }]} />
      </View>
      <Text style={styles.barPercent}>{Math.round(bar.percentage)}%</Text>
    </Pressable>)}
    {active && <Text style={styles.detail} accessibilityLiveRegion="polite">
      {active.period === 'current' ? 'Current' : 'Previous'}: {active.count} recorded
      {active.count === 1 ? ' day' : ' days'} · {Math.round(active.percentage)}%
    </Text>}
  </View>;
}

export function PeriodComparisonChart({ data }: { data: PeriodComparisonResult }) {
  const [selected, setSelected] = useState<Selection>(null);
  const oneDay = data.current.days === 1;
  const currentTitle = data.current.endDate === localDate() ? 'Today' : formatLocalDate(data.current.endDate);
  const previousTitle = data.current.endDate === localDate() ? 'Yesterday' : formatLocalDate(data.previous.endDate);
  return <View style={styles.wrap}>
    {config.presentation.showRecordingCoverage && <View style={styles.coverage}>
      <Coverage label={oneDay ? previousTitle : 'Previous'} {...data.previous}
        recorded={data.previous.recordedDays} />
      <Coverage label={oneDay ? currentTitle : 'Current'} {...data.current}
        recorded={data.current.recordedDays} />
    </View>}
    {oneDay ? <>
      <View style={styles.observations}>
        <View style={styles.observation}>
          <Text style={styles.observationCaption}>{previousTitle}</Text>
          <Text style={styles.observationValue}>{data.previousEntry?.optionLabelAtEntry ?? 'Not recorded'}</Text>
        </View>
        <View style={styles.observation}>
          <Text style={styles.observationCaption}>{currentTitle}</Text>
          <Text style={styles.observationValue}>{data.currentEntry?.optionLabelAtEntry ?? 'Not recorded'}</Text>
        </View>
      </View>
      {data.status === 'incompatible' && <Text style={styles.notice}>
        These days use different rating scales, so their ratings are shown separately.
      </Text>}
    </> : data.status === 'ready' ? <>
      {config.presentation.showLegend && <View style={styles.legend}>
        <View style={[styles.legendSwatch, { backgroundColor: config.style.previousColor }]} />
        <Text style={styles.legendText}>Previous</Text>
        <View style={[styles.legendSwatch, { backgroundColor: config.style.currentColor }]} />
        <Text style={styles.legendText}>Current</Text>
      </View>}
      {data.rows.map(row => <ComparisonBars key={row.optionId} row={row}
        selected={selected} onSelect={setSelected} />)}
    </> : <Text style={styles.notice}>
      {data.status === 'incompatible'
        ? 'These periods use different rating scales. Compare dates within one scale to see a distribution.'
        : data.status === 'no-data' ? 'No ratings recorded in either period.'
          : data.status === 'empty-current' ? 'No ratings recorded in the selected period.'
            : 'No ratings recorded in the previous period.'}
    </Text>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: s.md },
  coverage: { gap: s.xs, paddingBottom: s.xs },
  coverageRow: { flexDirection: 'row', alignItems: 'center', gap: s.sm, minWidth: 0 },
  coverageName: { flex: 1, minWidth: 0 },
  coverageTitle: { ...t.caption, color: c.textPrimary, fontWeight: '600' },
  coverageDates: { ...t.caption, color: c.textSecondary },
  coverageCount: { ...t.caption, color: c.textSecondary, textAlign: 'right', flexShrink: 0 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: s.xs, flexWrap: 'wrap' },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { ...t.caption, color: c.textSecondary, marginRight: s.md },
  optionGroup: { gap: 2 },
  optionLabel: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
  barTouch: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: s.sm },
  track: { height: 10, flex: 1, borderRadius: config.style.barRadius,
    backgroundColor: c.surfaceSecondary, overflow: 'hidden' },
  fill: { height: '100%' },
  barPercent: { ...t.caption, color: c.textSecondary, width: 36, textAlign: 'right' },
  detail: { ...t.caption, color: c.textSecondary, paddingBottom: s.xs },
  notice: { ...t.secondary, color: c.textSecondary, backgroundColor: c.surfaceSecondary,
    padding: s.md, borderRadius: r.md },
  observations: { flexDirection: 'row', gap: s.sm },
  observation: { flex: 1, minWidth: 0, backgroundColor: c.surfaceSecondary,
    borderRadius: r.md, padding: s.md, gap: s.xs },
  observationCaption: { ...t.caption, color: c.textSecondary },
  observationValue: { ...t.body, color: c.textPrimary, fontWeight: '600' },
});
