import React, { memo, useMemo, useRef, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Task } from '../domain/task';
import { useEntry, useTaskActions } from '../state/TasksProvider';
import { colors as c, radii as r, spacing as s, typography as t } from '../theme';
import { planHomeOptionRows } from './homeOptionLayout';
import { TaskActionsMenu } from './TaskActionsMenu';

export function RatingOptionButton({ label, selected, disabled, onPress, style, textStyle }: {
  label: string; selected: boolean; disabled: boolean; onPress: () => void;
  style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
}) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
    accessibilityState={{ selected, disabled }} accessibilityLabel={label}
    style={({ pressed }) => [styles.option, selected && styles.selected, style, pressed && { opacity: 0.72, transform: [{ scale: 0.98 }] }]}>
    <Text style={[t.button, { color: selected ? c.selectedText : c.textPrimary, flexShrink: 1 }, textStyle]}>{selected ? '✓  ' : ''}{label}</Text>
  </Pressable>;
}

export const TaskCard = memo(function TaskCard({ task, date }: { task: Task; date: string }) {
  const router = useRouter(); const { select: saveSelection } = useTaskActions();
  const { width, fontScale } = useWindowDimensions();
  const entry = useEntry(task.id, date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingOption = useRef<string | null>(null);
  const selected = entry?.optionId;
  const optionRows = useMemo(() => planHomeOptionRows(task.options.map(option => option.label), width - 2 * s.xl - 2 * 14 - 2, fontScale), [task.options, width, fontScale]);

  const select = async (optionId: string) => {
    if (selected === optionId && entry?.trendEpochIdAtEntry === task.currentTrendEpochId) return;
    if (pendingOption.current === optionId) return;
    pendingOption.current = optionId;
    setError(null);
    try { await saveSelection(task, date, optionId); }
    catch { setError('Could not save this check-in. Tap a choice to try again.'); }
    finally { if (pendingOption.current === optionId) pendingOption.current = null; }
  };
  const clear = async () => {
    if (!entry) return;
    setError(null);
    try { await saveSelection(task, date, null); }
    catch { setError('Could not clear this check-in. Please try again.'); }
  };
  return <View style={styles.card}>
    <View style={styles.heading}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${task.name}, insights`}
        onPress={() => router.navigate({ pathname: '/insights', params: { task: task.id, mode: 'normal' } })} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
        <Text style={[t.taskTitle, { color: c.textPrimary }]}>{task.name}</Text></Pressable>
      <TaskActionsMenu task={task} onBusyChange={setBusy} />
    </View>
    <View style={styles.options}>{optionRows.map((row, index) => <View key={index} style={styles.optionRow}>
      {row.map(optionIndex => { const option = task.options[optionIndex]; return <RatingOptionButton key={option.id} label={option.label}
        selected={selected === option.id} disabled={busy} onPress={() => void select(option.id)} style={[styles.homeOption, { flexBasis: optionRows.length === 1 ? Math.max(44, option.label.length * 7.2 * fontScale + 22) : 0 }]} textStyle={styles.homeOptionText} />; })}
    </View>)}</View>
    {entry && <View style={styles.savedRow}><Text style={styles.savedText} numberOfLines={1}>
      {task.options.some(option => option.id === selected) ? 'Saved for today' : `Saved: ${entry.optionLabelAtEntry}`}
    </Text><Pressable accessibilityRole="button" accessibilityLabel={`Clear today's response for ${task.name}`}
      onPress={() => void clear()} hitSlop={6} style={styles.clearButton}><Text style={styles.clearText}>Clear</Text></Pressable></View>}
    {error && <Text accessibilityRole="alert" style={[t.secondary, { color: c.danger, marginTop: s.sm }]}>{error}</Text>}
  </View>;
});
const styles = StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: r.lg, borderColor: c.border, borderWidth: 1, padding: 14, marginBottom: s.md },
  heading: { flexDirection: 'row', alignItems: 'center', marginBottom: s.xs },
  options: { gap: 6 }, optionRow: { flexDirection: 'row', gap: 6 },
  homeOption: { flexGrow: 1, flexShrink: 1, minWidth: 0, paddingHorizontal: s.sm, paddingVertical: s.sm },
  homeOptionText: { textAlign: 'center' },
  option: { minHeight: 44, maxWidth: '100%', paddingHorizontal: s.md, paddingVertical: s.sm, borderWidth: 1, borderColor: c.borderStrong, borderRadius: r.md, backgroundColor: c.surface, justifyContent: 'center' },
  selected: { backgroundColor: c.selected, borderColor: c.selected },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: s.xs },
  savedText: { ...t.caption, color: c.textSecondary, flex: 1 },
  clearButton: { minHeight: 36, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  clearText: { ...t.caption, color: c.textSecondary },
});
