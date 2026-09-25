import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NativeDatePicker from '@expo/ui/community/datetime-picker';
import Svg, { Path } from 'react-native-svg';
import {
  CustomRange, availableCustomRange, dateFromPicker, formatDateCell, pickerValue, updateCustomRangeDraft,
  validateCustomRange,
} from '../../analytics/insightsDateRange';
import { parseLocalDate } from '../../domain/task';
import { colors as c, spacing as s, typography as t } from '../../theme';

interface Props {
  applied: CustomRange;
  today: string;
  earliest: string | null;
  onApply: (range: CustomRange) => void;
  onCancel: () => void;
  /** Use inside the expanded chart's portrait modal, avoiding stacked native modals. */
  embedded?: boolean;
}
type Field = 'start' | 'end';

export function NativeDateRangePicker({ applied, today, earliest, onApply, onCancel, embedded = false }: Props) {
  const { height, width } = useWindowDimensions();
  const minimum = earliest ?? today;
  const [draft, setDraft] = useState<CustomRange>(() => availableCustomRange(applied, earliest, today));
  const [openField, setOpenField] = useState<Field | null>(null);
  const error = validateCustomRange(draft, today, earliest);

  const changeDate = (field: Field, date: Date) => {
    const selected = dateFromPicker(date, Platform.OS === 'android' ? 'android' : 'ios');
    setDraft(current => updateCustomRangeDraft(current, field, selected));
  };
  const apply = () => { if (!error) onApply(draft); };

  const content = <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button"
        accessibilityLabel="Dismiss date range" onPress={onCancel}/>
      <SafeAreaView edges={embedded ? [] : ['bottom']} style={[styles.sheet, { maxHeight: height * 0.86 }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.headerAction}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>Date range</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Apply date range"
            accessibilityState={{ disabled: !!error }} disabled={!!error} onPress={apply}
            style={styles.headerAction}>
            <Text style={[styles.applyText, error && styles.disabledText]}>Apply</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body} bounces={false}>
          <View style={styles.cells}>
            <DateCell label="From" value={draft.startDate} selected={openField === 'start'}
              onPress={() => setOpenField('start')}/>
            <DateCell label="To" value={draft.endDate} selected={openField === 'end'}
              onPress={() => setOpenField('end')}/>
          </View>
          {Platform.OS === 'ios' && openField && <View style={styles.calendarSection}>
            <View style={styles.calendarHeading}>
              <Text style={styles.calendarTitle}>{openField === 'start' ? 'From' : 'To'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close calendar"
                onPress={() => setOpenField(null)} style={styles.doneAction}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
            <NativeDatePicker key={openField} mode="date" display="inline"
              style={{ width: Math.min(width - s.lg * 2, 400), alignSelf: 'center' }}
              value={parseLocalDate(openField === 'start' ? draft.startDate : draft.endDate)}
              minimumDate={parseLocalDate(openField === 'start' ? minimum : draft.startDate)}
              maximumDate={parseLocalDate(today)}
              onValueChange={(_, date) => changeDate(openField, date)}
              accentColor={c.selected} themeVariant="light"/>
          </View>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !earliest }}
            disabled={!earliest} onPress={() => { setDraft({ startDate: minimum, endDate: today }); setOpenField(null); }}
            style={styles.shortcut}>
            <Text style={[styles.shortcutText, !earliest && styles.disabledText]}>All available dates</Text>
          </Pressable>
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </SafeAreaView>
      {Platform.OS === 'android' && openField && <NativeDatePicker
        key={openField} mode="date" presentation="dialog"
        value={pickerValue(openField === 'start' ? draft.startDate : draft.endDate, 'android')}
        minimumDate={pickerValue(openField === 'start' ? minimum : draft.startDate, 'android')}
        maximumDate={pickerValue(today, 'android')}
        onDismiss={() => setOpenField(null)}
        onValueChange={(_, date) => {
          changeDate(openField, date);
          setOpenField(null);
        }}/>}
    </View>;
  return embedded ? <View style={StyleSheet.absoluteFill}>{content}</View> :
    <Modal visible transparent animationType="slide" presentationStyle="overFullScreen"
      onRequestClose={onCancel} statusBarTranslucent={Platform.OS === 'android'}>{content}</Modal>;
}

function DateCell({ label, value, selected, onPress }: {
  label: string; value: string; selected: boolean; onPress: () => void;
}) {
  const displayDate = formatDateCell(value);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${displayDate}, choose date`}
    accessibilityState={{ selected }} onPress={onPress} style={[styles.dateCell, selected && styles.selectedCell]}>
    <View style={styles.cellTop}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Svg width={16} height={16} viewBox="0 0 24 24" accessible={false}>
        <Path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
          fill="none" stroke={c.textSecondary} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/>
      </Svg>
    </View>
    <Text style={styles.cellDate} numberOfLines={2}>{displayDate}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim },
  sheet: { width: '100%', backgroundColor: c.surface, borderTopLeftRadius: 22,
    borderTopRightRadius: 22, borderColor: c.border, borderTopWidth: 1 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: s.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  headerAction: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  cancelText: { ...t.body, color: c.textSecondary },
  applyText: { ...t.body, color: c.selected, fontWeight: '600', textAlign: 'right' },
  title: { ...t.taskTitle, color: c.textPrimary, textAlign: 'center', flex: 1, minWidth: 0 },
  body: { paddingHorizontal: s.lg, paddingTop: s.md, paddingBottom: s.sm },
  bodyScroll: { flexGrow: 0 },
  cells: { flexDirection: 'row', gap: s.sm },
  dateCell: { flex: 1, minWidth: 0, minHeight: 70, paddingHorizontal: s.md, paddingVertical: s.sm,
    borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.surfaceSecondary },
  selectedCell: { borderColor: c.borderStrong },
  cellTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s.xs },
  cellLabel: { ...t.caption, color: c.textSecondary },
  cellDate: { ...t.secondary, color: c.textPrimary, fontWeight: '600', marginTop: s.xs, flexShrink: 1 },
  calendarSection: { marginTop: s.sm },
  calendarHeading: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarTitle: { ...t.secondary, color: c.textSecondary },
  doneAction: { minWidth: 44, minHeight: 36, alignItems: 'flex-end', justifyContent: 'center' },
  doneText: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
  shortcut: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: s.xs },
  shortcutText: { ...t.secondary, color: c.textPrimary },
  disabledText: { color: c.textTertiary },
  error: { ...t.secondary, color: c.danger, marginBottom: s.sm },
});
