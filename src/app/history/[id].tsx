import { memo, useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntry, useTaskActions, useTasks } from '../../state/TasksProvider';
import { Task, parseLocalDate, recentDates } from '../../domain/task';
import { createTaskDayEligibility } from '../../domain/taskLifecycle';
import { Button, Loading, ScreenHeader } from '../../components/ui';
import { RatingOptionButton } from '../../components/TaskCard';
import { colors as c, radii as r, spacing as s, typography as t } from '../../theme';
function dayLabel(date: string, today: string) {
  if (date === today) return 'Today';
  if (date === recentDates(today, 2)[1]) return 'Yesterday';
  return parseLocalDate(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const HistoryRow = memo(function HistoryRow({ taskId, date, today, eligible, onEdit }: { taskId: string; date: string; today: string; eligible: boolean; onEdit: (date: string) => void }) {
  const entry = useEntry(taskId, date);
  const canEdit = eligible || !!entry;
  return <Pressable accessibilityRole={canEdit ? 'button' : 'text'} disabled={!canEdit}
    accessibilityLabel={`${dayLabel(date, today)}, ${entry?.optionLabelAtEntry ?? 'No entry'}${canEdit ? ', edit response' : ', archived period'}`}
    onPress={() => onEdit(date)} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.65 : 1 }]}>
    <Text style={[t.body, { color: c.textSecondary }]}>{dayLabel(date, today)}</Text>
    <Text style={[t.button, { color: entry ? c.textPrimary : c.textTertiary, flexShrink: 1, textAlign: 'right' }]}>{entry?.optionLabelAtEntry ?? '—'}</Text>
  </Pressable>;
});
function DayEditor({ task, date, today, eligible, onClose }: { task: Task; date: string; today: string; eligible: boolean; onClose: () => void }) {
  const entry = useEntry(task.id, date); const { select } = useTaskActions(); const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const retired = entry && !task.options.some(option => option.id === entry.optionId);
  const changed = entry && task.options.some(option => option.id === entry.optionId && option.label !== entry.optionLabelAtEntry);
  const canChoose = (task.active || date < today) && (eligible || !!entry);
  const save = async (optionId: string | null) => {
    setError(null);
    try { await select(task, date, optionId); }
    catch { setError('Could not save this response. Please try again.'); }
  };
  return <Modal transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close response editor" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, s.lg) }]} accessibilityViewIsModal>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={[t.sectionTitle, { color: c.textPrimary }]}>{task.name}</Text>
          <Text style={[t.body, { color: c.textSecondary, marginTop: s.sm, marginBottom: s.xl }]}>{parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          {(retired || changed) && <Text style={[t.body, { color: c.textSecondary, marginBottom: s.lg }]}>Recorded: {entry.optionLabelAtEntry}{retired ? ' (retired choice)' : ' (previous label)'}. Keep this response, or select a current choice below.</Text>}
          {canChoose ? <View style={styles.choices}>{task.options.map(option => <RatingOptionButton key={option.id} label={option.label} disabled={false}
            selected={entry?.optionId === option.id && !changed} onPress={() => void save(option.id)} />)}</View>
            : <Text style={[t.secondary, { color: c.textSecondary }]}>This activity was archived on this date. Its existing recording remains available.</Text>}
          {entry && <View style={{ marginTop: s.lg }}><Button label="Clear response" subtle onPress={() => void save(null)} /></View>}
          {error && <Text accessibilityRole="alert" style={[t.body, { color: c.danger, marginTop: s.md }]}>{error}</Text>}
          <View style={{ marginTop: s.lg }}><Button label="Done" onPress={onClose} /></View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
export default function ActivityHistory() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter();
  const { data, today, loading, loadHistory } = useTasks();
  const [loaded, setLoaded] = useState(''); const [error, setError] = useState(false); const [editing, setEditing] = useState<string | null>(null);
  const dates = recentDates(today); const task = data.tasks.find(task => task.id === id);
  const eligibility = task ? createTaskDayEligibility(task, data.lifecycle, [], today) : null;
  const load = useCallback(() => {
    let active = true;
    void loadHistory(id, recentDates(today)).then(() => { if (active) { setLoaded(`${id}:${today}`); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [id, today, loadHistory]);
  useFocusEffect(load);
  return <SafeAreaView style={styles.screen}>
    <View style={{ paddingHorizontal: s.xxl }}><Button label="‹ Back" subtle onPress={() => router.back()} />
      <ScreenHeader title={task?.name ?? 'Activity history'} subtitle="Past 30 days · tap a day to edit" /></View>
    {error ? <View style={{ padding: s.xxl, gap: s.lg }}><Text style={t.body}>History could not be loaded.</Text><Button label="Try again" onPress={() => { load(); }} /></View>
      : loading || loaded !== `${id}:${today}` ? <Loading /> : !task ? <Text style={{ padding: s.xxl }}>Task not found.</Text>
      : <FlatList style={{ marginHorizontal: s.xxl, backgroundColor: c.surface, borderRadius: r.lg, borderWidth: 1, borderColor: c.border }} data={dates} keyExtractor={date => date} contentContainerStyle={{ paddingHorizontal: s.md, paddingBottom: s.md }}
        renderItem={({ item }) => <HistoryRow taskId={id} date={item} today={today}
          eligible={!!eligibility?.eligible(item) && (task.active || item < today)} onEdit={setEditing} />}
        ListFooterComponent={<Text style={[t.secondary, { color: c.textSecondary, paddingVertical: s.xxl }]}>— means no response was recorded.</Text>} />}
    {editing && task && <DayEditor key={`${id}:${editing}`} task={task} date={editing}
      today={today} eligible={!!eligibility?.eligible(editing)} onClose={() => setEditing(null)} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s.xl, borderBottomWidth: 1, borderColor: c.border, paddingVertical: s.md, paddingHorizontal: s.md, backgroundColor: c.surface },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: s.sm },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim },
  sheet: { maxHeight: '80%', backgroundColor: c.surface, padding: s.xxl, borderTopLeftRadius: r.xl, borderTopRightRadius: r.xl },
});
