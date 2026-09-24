import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NativeDatePicker from '@expo/ui/community/datetime-picker';
import { CustomRange, dateFromPicker, formatLocalDate, pickerValue, validateCustomRange } from '../../analytics/insightsDateRange';
import { parseLocalDate } from '../../domain/task';
import { colors as c, spacing as s, typography as t } from '../../theme';

interface Props {
  applied: CustomRange;
  today: string;
  onApply: (range: CustomRange) => void;
  onCancel: () => void;
}
type Field = 'start' | 'end';

export function NativeDateRangePicker({ applied, today, onApply, onCancel }: Props) {
  const [draft, setDraft] = useState<CustomRange>(applied);
  const [editing, setEditing] = useState<Field | null>(null);
  const [androidStep, setAndroidStep] = useState<'start' | 'between' | 'end' | 'confirm'>('start');
  const [hadConfirmation, setHadConfirmation] = useState(false);
  const nextDialog = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (nextDialog.current) clearTimeout(nextDialog.current); }, []);
  const error = validateCustomRange(draft, today);
  const changeStart = (date: Date) => {
    const startDate = dateFromPicker(date, Platform.OS === 'android' ? 'android' : 'ios');
    setDraft(current => ({ startDate, endDate: current.endDate < startDate ? startDate : current.endDate }));
  };
  const changeEnd = (date: Date) => setDraft(current =>
    ({ ...current, endDate: dateFromPicker(date, Platform.OS === 'android' ? 'android' : 'ios') }));
  const apply = () => { if (!error) onApply(draft); };

  if (Platform.OS === 'android') {
    if (androidStep === 'start' || androidStep === 'end') {
      const isStart = androidStep === 'start';
      return <NativeDatePicker
        key={androidStep} mode="date" presentation="dialog"
        value={pickerValue(isStart ? draft.startDate : draft.endDate, 'android')}
        minimumDate={isStart ? undefined : parseLocalDate(draft.startDate)}
        maximumDate={parseLocalDate(today)}
        onDismiss={() => hadConfirmation ? setAndroidStep('confirm') : onCancel()}
        onValueChange={(_, date) => {
          if (isStart) {
            changeStart(date);
            // The first Material dialog must finish dismissing before the next mounts.
            setAndroidStep('between');
            nextDialog.current = setTimeout(() => setAndroidStep('end'), 240);
          } else {
            changeEnd(date);
            setHadConfirmation(true);
            setAndroidStep('confirm');
          }
        }}
      />;
    }
    if (androidStep === 'between') return null;
    return <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <SafeAreaView style={styles.backdrop} edges={['top', 'bottom']}>
        <View style={styles.confirmCard}>
          <Text style={styles.sheetTitle}>Custom range</Text>
          <Text style={styles.help}>Choose the dates to include in Insights.</Text>
          <DateRow label="Start date" value={draft.startDate} onPress={() => setAndroidStep('start')}/>
          <DateRow label="End date" value={draft.endDate} onPress={() => setAndroidStep('end')}/>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.action}>
              <Text style={styles.actionText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!error }} disabled={!!error}
              onPress={apply} style={[styles.action, styles.apply]}>
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>;
  }

  return <Modal visible animationType="slide" presentationStyle="pageSheet"
    allowSwipeDismissal onRequestClose={onCancel}>
    <SafeAreaView style={styles.sheet} edges={['bottom']}>
      <View style={styles.sheetHeader}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.headerAction}>
          <Text style={styles.actionText}>Cancel</Text>
        </Pressable>
        <Text style={styles.sheetTitle} numberOfLines={1}>Custom range</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!error }} disabled={!!error}
          onPress={apply} style={styles.headerAction}>
          <Text style={[styles.actionText, styles.doneText]}>Apply</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.pickerContent}>
        <Text style={styles.help}>Choose the dates to include in Insights.</Text>
        <DateRow label="Start date" value={draft.startDate} selected={editing === 'start'}
          onPress={() => setEditing(current => current === 'start' ? null : 'start')}/>
        <DateRow label="End date" value={draft.endDate} selected={editing === 'end'}
          onPress={() => setEditing(current => current === 'end' ? null : 'end')}/>
        {editing && <View style={styles.pickerSection}>
          <Text style={styles.pickerHeading}>{editing === 'start' ? 'Start date' : 'End date'}</Text>
          <NativeDatePicker key={editing} mode="date" display="inline" style={styles.nativePicker}
            value={parseLocalDate(editing === 'start' ? draft.startDate : draft.endDate)}
            minimumDate={editing === 'end' ? parseLocalDate(draft.startDate) : undefined}
            maximumDate={parseLocalDate(today)}
            onValueChange={(_, date) => editing === 'start' ? changeStart(date) : changeEnd(date)}
            accentColor={c.selected} themeVariant="light"/>
          <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.pickerDone}>
            <Text style={styles.pickerDoneText}>Done</Text>
          </Pressable>
        </View>}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function DateRow({ label, value, selected = false, onPress }: {
  label: string; value: string; selected?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label + ', ' + formatLocalDate(value)}
    accessibilityState={{ selected }} onPress={onPress} style={[styles.dateRow, selected && styles.selectedRow]}>
    <Text style={styles.fieldLabel} numberOfLines={1}>{label}</Text>
    <View style={styles.dateValueWrap}>
      <Text style={styles.dateValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {formatLocalDate(value)}
      </Text>
      <Text style={styles.chevron}>›</Text>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: c.background },
  sheetHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: s.lg, backgroundColor: c.surface, borderBottomWidth: 1, borderColor: c.border, gap: s.sm },
  sheetTitle: { ...t.taskTitle, color: c.textPrimary, flexShrink: 1, textAlign: 'center' },
  headerAction: { minWidth: 58, minHeight: 44, justifyContent: 'center' },
  actionText: { ...t.body, color: c.textSecondary },
  doneText: { color: c.selected, textAlign: 'right', fontWeight: '600' },
  pickerContent: { paddingTop: s.lg, paddingBottom: s.xxl, gap: s.md },
  help: { ...t.secondary, color: c.textSecondary, marginHorizontal: s.lg },
  dateRow: { minHeight: 56, marginHorizontal: s.lg, paddingHorizontal: s.md, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    flexDirection: 'row', alignItems: 'center', gap: s.sm },
  selectedRow: { borderColor: c.borderStrong },
  fieldLabel: { ...t.body, color: c.textPrimary, flexShrink: 1 },
  dateValueWrap: { flex: 1, minWidth: 0, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: s.xs },
  dateValue: { ...t.secondary, color: c.textSecondary, flexShrink: 1, textAlign: 'right' },
  chevron: { fontSize: 23, lineHeight: 27, color: c.textSecondary },
  pickerSection: { marginHorizontal: s.xs, borderRadius: 14, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.surface, paddingVertical: s.sm, gap: s.xs },
  pickerHeading: { ...t.caption, color: c.textSecondary, marginHorizontal: s.lg },
  nativePicker: { width: '100%' },
  pickerDone: { alignSelf: 'flex-end', minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center',
    marginRight: s.md },
  pickerDoneText: { ...t.button, color: c.textPrimary },
  error: { ...t.secondary, color: c.danger, marginHorizontal: s.lg },
  backdrop: { flex: 1, backgroundColor: c.scrim, justifyContent: 'center', paddingHorizontal: s.lg },
  confirmCard: { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border,
    paddingVertical: s.xl, gap: s.md, minWidth: 0 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: s.sm, marginHorizontal: s.lg },
  action: { minWidth: 74, minHeight: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: s.sm },
  apply: { backgroundColor: c.selected },
  applyText: { ...t.button, color: c.selectedText },
});
