import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { parseLocalDate } from '../../domain/task';
import { colors as c, spacing as s, typography as t } from '../../theme';
import { calendarCellSize, calendarFill, monthGridDates, monthHeading } from './calendarLayout';
import { CalendarLevel, matchingDateCount, matchesCalendarFilter, toggleCalendarLevel } from './individualCalendar';

export type CalendarCell = {
  date: string; ratio?: number; label?: string; detail?: string;
  recorded?: number; eligible?: number; color?: string; optionId?: string;
  shade?: string; useLightText?: boolean;
};
type Props = {
  month: string; onMonthChange: (month: string) => void;
  cells: CalendarCell[]; color: string; kind: 'individual' | 'coverage'; levels?: CalendarLevel[];
};
function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split('-').map(Number);
  const next = new Date(year, month - 1 + amount, 1, 12);
  return next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0');
}
function hasRecording(cell?: CalendarCell) {
  return !!cell && (cell.recorded !== undefined ? cell.recorded > 0 : cell.label !== undefined);
}
function formatDay(date: string) {
  return parseLocalDate(date).toLocaleDateString(undefined,
    { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function MonthCalendar({ month, onMonthChange, cells, color, kind, levels = [] }: Props) {
  const [width, setWidth] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const { fontScale } = useWindowDimensions();
  const byDate = useMemo(() => new Map(cells.map(cell => [cell.date, cell])), [cells]);
  const values = useMemo(() => monthGridDates(month), [month]);
  const currentSelected = selectedDate?.startsWith(month + '-') ? byDate.get(selectedDate) : undefined;
  const matchingCount = kind === 'individual' ? matchingDateCount(cells, selectedIds) : 0;
  const availableIds = levels.map(level => level.id);
  const noneSelected = selectedIds !== null && selectedIds.size === 0;
  const allSelected = selectedIds === null;
  const cellSize = calendarCellSize(width);
  const heading = monthHeading(month, Math.max(0, width - 88), fontScale);
  const today = new Date();
  const todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') +
    '-' + String(today.getDate()).padStart(2, '0');

  return <View style={styles.wrap} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {kind === 'individual' && <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}
        contentContainerStyle={styles.filterContent} accessibilityLabel="Rating level filters">
        <FilterChip label="None" selected={noneSelected} onPress={() => setSelectedIds(new Set())}/>
        {levels.map(level => <FilterChip key={level.id} label={level.label}
          selected={selectedIds === null || selectedIds.has(level.id)}
          onPress={() => setSelectedIds(previous => toggleCalendarLevel(previous, level.id, availableIds))}/>)}
        <FilterChip label="All" selected={allSelected} onPress={() => setSelectedIds(null)}/>
      </ScrollView>
      <Text style={styles.matchCount} accessibilityLiveRegion="polite">
        {matchingCount} matching {matchingCount === 1 ? 'day' : 'days'} this month
      </Text>
    </>}
    <View style={styles.monthHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous month"
        onPress={() => { setSelectedDate(null); onMonthChange(shiftMonth(month, -1)); }} style={styles.arrow}>
        <Text style={styles.arrowText}>‹</Text>
      </Pressable>
      <Text style={styles.monthTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
        accessibilityLabel={parseLocalDate(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
        {heading}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next month"
        onPress={() => { setSelectedDate(null); onMonthChange(shiftMonth(month, 1)); }} style={styles.arrow}>
        <Text style={styles.arrowText}>›</Text>
      </Pressable>
    </View>
    <View style={styles.weekdays}>
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) =>
        <Text key={day + index} style={styles.weekday}>{day}</Text>)}
    </View>
    {cellSize > 0 && <View style={styles.grid}>
      {values.map((date, index) => {
        const cell = date ? byDate.get(date) : undefined;
        const recorded = hasRecording(cell);
        const matched = kind === 'individual' && !!cell && matchesCalendarFilter(cell, selectedIds);
        const isToday = date === todayKey;
        return <Pressable key={date || 'empty-' + index} disabled={!date}
          accessibilityRole={date ? 'button' : undefined}
          accessibilityLabel={date ? formatDay(date) + ', ' +
            (recorded ? (cell?.label || cell?.detail || (cell?.recorded + ' of ' + cell?.eligible + ' recorded')) : 'Not recorded') : undefined}
          accessibilityState={date ? { selected: date === selectedDate } : undefined}
          onPress={() => date && setSelectedDate(date)}
          style={[styles.day, { width: cellSize, height: cellSize,
            backgroundColor: !date ? 'transparent' : kind === 'individual' ?
              (matched ? cell?.shade || calendarFill(color, cell?.ratio ?? 0) : calendarFill(color, null)) :
              calendarFill(cell?.color || color, recorded ? cell?.ratio ?? 0 : null) },
          isToday && styles.today]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
            style={[styles.dayText, matched && cell?.useLightText && styles.dayTextLight,
              isToday && styles.todayText]}>{date ? Number(date.slice(-2)) : ''}</Text>
        </Pressable>;
      })}
    </View>}
    {selectedDate?.startsWith(month + '-') && <View style={styles.detail} accessible>
      <Text style={styles.detailDate}>{formatDay(selectedDate)}</Text>
      <Text style={styles.detailValue}>{kind === 'individual' ? currentSelected?.label || 'Not recorded' :
        currentSelected?.detail || (currentSelected?.recorded || 0) + ' of ' + (currentSelected?.eligible || 0) + ' recorded'}</Text>
    </View>}
    {kind === 'coverage' && <View style={styles.legend}>
      <LegendItem color={calendarFill(color, null)} label="No record"/>
      <LegendItem color={calendarFill(color, 0.35)} label="Some"/>
      <LegendItem color={calendarFill(color, 1)} label="All eligible"/>
    </View>}
  </View>;
}
function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Filter ${label}`}
    accessibilityState={{ selected }} onPress={onPress}
    style={[styles.filterChip, selected && styles.filterChipSelected]}>
    <Text numberOfLines={1} style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
      {selected ? '✓ ' : ''}{label}
    </Text>
  </Pressable>;
}
function LegendItem({ color, label }: { color: string; label: string }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]}/>
    <Text style={styles.legendText}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  wrap: { gap: s.sm, minWidth: 0 },
  filters: { flexGrow: 0, minWidth: 0, width: '100%' },
  filterContent: { alignItems: 'center', gap: s.xs, paddingRight: s.xs },
  filterChip: { minHeight: 36, minWidth: 44, maxWidth: 160, paddingHorizontal: s.sm,
    borderRadius: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    alignItems: 'center', justifyContent: 'center' },
  filterChipSelected: { borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary },
  filterChipText: { ...t.caption, fontSize: 12, color: c.textPrimary, fontWeight: '500' },
  filterChipTextSelected: { fontWeight: '700' },
  matchCount: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  arrow: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 27, lineHeight: 31, color: c.textPrimary, fontWeight: '300' },
  monthTitle: { flex: 1, minWidth: 0, textAlign: 'center', ...t.taskTitle, color: c.textPrimary },
  weekdays: { flexDirection: 'row', paddingTop: s.xs },
  weekday: { flex: 1, textAlign: 'center', ...t.caption, color: c.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 4, rowGap: 4 },
  day: { borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dayText: { ...t.caption, color: c.textPrimary, fontSize: 12 },
  dayTextLight: { color: c.selectedText },
  today: { borderWidth: 1.5, borderColor: c.textPrimary },
  todayText: { fontWeight: '700' },
  detail: { backgroundColor: c.surfaceSecondary, borderRadius: 10, paddingHorizontal: s.md, paddingVertical: s.sm, gap: s.xs },
  detailDate: { ...t.caption, color: c.textSecondary },
  detailValue: { ...t.secondary, color: c.textPrimary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: s.md, rowGap: s.xs, paddingTop: s.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: s.xs },
  legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: c.border },
  legendText: { ...t.caption, color: c.textSecondary },
});
