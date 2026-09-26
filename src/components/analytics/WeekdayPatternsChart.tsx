import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WeekdayPatternsResult } from '../../analytics/engine';
import { weekdayPatternsConfig as config } from '../../analytics/weekdayPatterns';
import { formatLocalDate } from '../../analytics/insightsDateRange';
import { colors as c, radii as r, spacing as s, typography as t } from '../../theme';
import { heatmapCellWidth, heatmapGridWidth } from './weekdayPatternsLayout';

type Selection = { weekday: number; optionId: string } | null;

function frequencyColor(percentage: number | null) {
  if (percentage === null || percentage === 0) return config.style.emptyColor;
  const low = config.style.lowFrequencyColor;
  const high = config.style.highFrequencyColor;
  const fraction = Math.min(1, Math.max(0, percentage / 100));
  const channel = (offset: number) => Math.round(
    parseInt(low.slice(offset, offset + 2), 16) * (1 - fraction) +
    parseInt(high.slice(offset, offset + 2), 16) * fraction,
  ).toString(16).padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

export function WeekdayPatternsChart({ data }: { data: WeekdayPatternsResult }) {
  const [width, setWidth] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const selectedRow = data.rows.find(row => row.weekday === selection?.weekday);
  const selectedCell = selectedRow?.cells.find(cell => cell.optionId === selection?.optionId);
  const available = Math.max(0, width - config.presentation.weekdayColumnWidth);
  const cellWidth = heatmapCellWidth(width, data.levels.length,
    config.presentation.weekdayColumnWidth, config.presentation.totalColumnWidth,
    config.presentation.minimumCellWidth);
  const gridWidth = heatmapGridWidth(cellWidth, data.levels.length,
    config.presentation.totalColumnWidth);

  if (data.status === 'today' || data.status === 'single-day') return <View style={styles.notice}>
    <Text style={styles.noticeTitle}>{data.singleDayEntry?.optionLabelAtEntry ?? 'Not recorded'}</Text>
    <Text style={styles.noticeText}>{data.status === 'today' ? 'Today' : formatLocalDate(data.singleDate!)} · One day cannot show a weekday pattern.</Text>
  </View>;
  if (data.status === 'insufficient-range') return <View style={styles.notice}>
    <Text style={styles.noticeText}>Choose a longer period to explore weekday patterns.</Text>
    <Text style={styles.subtle}>{data.recordedCount} recorded {data.recordedCount === 1 ? 'day' : 'days'} in this range.</Text>
    {!!data.excludedHistoryCount && <Text style={styles.subtle}>
      {data.excludedHistoryCount} from a previous rating order excluded.
    </Text>}
  </View>;
  if (data.status === 'no-data') return <View style={styles.notice}>
    <Text style={styles.noticeText}>{data.excludedHistoryCount
      ? 'No ratings from the current rating order in this period.'
      : 'No ratings recorded in this period.'}</Text>
    {!!data.excludedHistoryCount && <Text style={styles.subtle}>
      {data.excludedHistoryCount} earlier {data.excludedHistoryCount === 1 ? 'rating uses' : 'ratings use'} a previous order.
    </Text>}
  </View>;

  return <View style={styles.wrap} onLayout={event => {
    const measured = event.nativeEvent.layout.width;
    setWidth(previous => previous === measured ? previous : measured);
  }}>
    <Text style={styles.caption}>{data.recordedCount} recorded {data.recordedCount === 1 ? 'day' : 'days'} · Cell shade shows frequency</Text>
    {data.limitedSample && <Text style={styles.subtle}>A limited sample; patterns may change with more recordings.</Text>}
    {!!data.excludedHistoryCount && <Text style={styles.subtle}>
      {data.excludedHistoryCount} {data.excludedHistoryCount === 1 ? 'rating' : 'ratings'} from a previous rating order excluded.
    </Text>}
    <View style={styles.table}>
      <View style={{ width: config.presentation.weekdayColumnWidth }}>
        <View style={{ height: config.presentation.rowHeight }} />
        {data.rows.map(row => <View key={row.weekday} style={styles.weekdayRow}>
          <Text style={styles.weekday} accessibilityLabel={row.label}>{row.label.slice(0, 3)}</Text>
        </View>)}
      </View>
      <ScrollView horizontal nestedScrollEnabled directionalLockEnabled
        showsHorizontalScrollIndicator={gridWidth > available}
        style={styles.horizontal} contentContainerStyle={{ width: gridWidth }}>
        <View>
          <View style={styles.gridRow}>
            {data.levels.map(level => <View key={level.id} style={[styles.headerCell, { width: cellWidth }]}>
              <Text style={styles.headerText} numberOfLines={1} ellipsizeMode="tail"
                accessibilityLabel={level.label}>{level.label}</Text>
            </View>)}
            <View style={[styles.headerCell, { width: config.presentation.totalColumnWidth }]}>
              <Text style={styles.headerText}>Total</Text>
            </View>
          </View>
          {data.rows.map(row => <View key={row.weekday} style={styles.gridRow}>
            {row.cells.map(cell => {
              const selected = selection?.weekday === row.weekday && selection.optionId === cell.optionId;
              const percentage = cell.percentage === null ? null : Math.round(cell.percentage);
              return <Pressable key={cell.optionId} accessibilityRole="button"
                accessibilityLabel={`${row.label}, ${cell.label}: ${row.total ? `${cell.count} of ${row.total} recordings, ${percentage} percent` : 'no recordings'}`}
                accessibilityState={{ selected }}
                onPress={() => setSelection(selected ? null : { weekday: row.weekday, optionId: cell.optionId })}
                style={[styles.cellTouch, { width: cellWidth, height: config.presentation.rowHeight }]}>
                <View style={[styles.cell, { backgroundColor: frequencyColor(cell.percentage),
                  borderRadius: config.presentation.cellRadius }, selected && styles.selectedCell]}>
                  <Text style={[styles.cellText, percentage !== null && percentage >= 70 && styles.cellTextLight]}>
                    {percentage === null ? '—' : `${percentage}%`}
                  </Text>
                </View>
              </Pressable>;
            })}
            <View style={[styles.totalCell, { width: config.presentation.totalColumnWidth,
              height: config.presentation.rowHeight }]}>
              <Text style={styles.totalText}>{row.total}</Text>
            </View>
          </View>)}
        </View>
      </ScrollView>
    </View>
    {selectedRow && selectedCell && <View style={styles.detail} accessibilityLiveRegion="polite">
      <Text style={styles.detailTitle}>{selectedRow.label} · {selectedCell.label}</Text>
      <Text style={styles.detailText}>{selectedRow.total
        ? `${selectedCell.count} of ${selectedRow.total} recorded observations · ${Math.round(selectedCell.percentage ?? 0)}%`
        : 'No recorded observations on this weekday.'}</Text>
      {selectedCell.historicalLabels.some(label => label !== selectedCell.label) &&
        <Text style={styles.subtle}>Recorded as: {selectedCell.historicalLabels.join(', ')}</Text>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: s.sm, minWidth: 0 },
  caption: { ...t.secondary, color: c.textPrimary },
  subtle: { ...t.caption, color: c.textSecondary },
  table: { flexDirection: 'row', minWidth: 0 },
  horizontal: { flex: 1, minWidth: 0 },
  weekdayRow: { height: config.presentation.rowHeight, justifyContent: 'center' },
  weekday: { ...t.caption, color: c.textSecondary, fontWeight: '600' },
  gridRow: { flexDirection: 'row' },
  headerCell: { height: config.presentation.rowHeight, paddingHorizontal: 2,
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: s.xs },
  headerText: { ...t.caption, fontSize: 10, color: c.textSecondary, textAlign: 'center' },
  cellTouch: { padding: 2 },
  cell: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  selectedCell: { borderWidth: 2, borderColor: c.selected },
  cellText: { ...t.caption, fontSize: 10, color: c.textPrimary, fontWeight: '600' },
  cellTextLight: { color: c.selectedText },
  totalCell: { justifyContent: 'center', alignItems: 'center' },
  totalText: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
  notice: { padding: s.md, borderRadius: r.md, backgroundColor: c.surfaceSecondary, gap: s.xs },
  noticeTitle: { ...t.sectionTitle, color: c.textPrimary },
  noticeText: { ...t.secondary, color: c.textSecondary },
  detail: { padding: s.sm, backgroundColor: c.surfaceSecondary, borderRadius: r.md, gap: 2 },
  detailTitle: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
  detailText: { ...t.caption, color: c.textSecondary },
});
