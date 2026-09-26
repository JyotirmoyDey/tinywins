import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTasks } from '../state/TasksProvider';
import { Loading } from '../components/ui';
import { colors as c, spacing as s, typography as t, radii as r } from '../theme';
import { ActiveTaskLimitError } from '../data/repository';
import { MAX_ACTIVE_TASKS } from '../config/taskLimits';
import { colorsByTaskId } from '../analytics/taskColors';
import { parseLocalDate } from '../domain/task';
export default function ArchivedActivities() {
  const { data, loading, reload, mutate } = useTasks(); const router = useRouter();
  const pending = useRef(new Set<string>());
  const deletingArchived = useRef(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const archived = useMemo(() => data.tasks.filter(task => !task.active), [data.tasks]);
  const activityColors = useMemo(() => colorsByTaskId(data.tasks.map(task => task.id)), [data.tasks]);
  const atLimit = data.tasks.filter(task => task.active).length >= MAX_ACTIVE_TASKS;
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const restore = async (id: string) => {
    if (pending.current.has(id)) return;
    pending.current.add(id); setPendingIds([...pending.current]);
    try { await mutate(repo => repo.restore(id)); }
    catch (error) { Alert.alert('Could not restore', error instanceof ActiveTaskLimitError
      ? 'You can track up to 10 things at once. Archive one to make room.'
      : 'Please try again. This item is still archived.'); }
    finally { pending.current.delete(id); setPendingIds([...pending.current]); }
  };
  const deleteArchived = async () => {
    if (deletingArchived.current) return;
    deletingArchived.current = true; setDeleting(true);
    try { await mutate(repo => repo.deleteArchivedTasks()); }
    catch { Alert.alert('Could not delete archived items', 'Please try again. What you’re currently tracking has not changed.'); }
    finally { deletingArchived.current = false; setDeleting(false); }
  };
  const confirmDeleteArchived = () => Alert.alert('Delete all archived items?',
    'This permanently deletes everything in Archived and its recorded history. What you’re currently tracking will stay.',
    [{ text: 'Cancel', style: 'cancel' },
      { text: 'Delete archived items', style: 'destructive', onPress: () => void deleteArchived() }]);
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile"
        onPress={() => router.navigate('/profile')} hitSlop={4}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
        <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}>
          <Path d="m14.5 5-7 7 7 7" fill="none" stroke={c.textPrimary}
            strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={styles.backLabel}>Profile</Text>
      </Pressable>
      <Text style={styles.title}>Archived</Text>
      {!loading && atLimit && archived.length > 0 && <Text style={styles.limitNote}>
        You can track up to 10 things at once. Archive one to make room.
      </Text>}
    </View>
    {loading ? <Loading /> : <FlatList data={archived} keyExtractor={task => task.id}
      contentContainerStyle={styles.list}
      ListFooterComponent={archived.length > 0 ? <Pressable accessibilityRole="button"
        accessibilityLabel="Delete all archived items" accessibilityState={{ disabled: deleting }}
        disabled={deleting} onPress={confirmDeleteArchived} style={styles.deleteArchived}>
        <Text style={styles.deleteArchivedText}>{deleting ? 'Deleting…' : 'Delete all archived items'}</Text>
      </Pressable> : null}
      ListEmptyComponent={<View style={styles.empty}>
        <Svg width={30} height={30} viewBox="0 0 24 24" accessible={false}>
          <Rect x={3} y={4} width={18} height={5} rx={1.5} fill="none" stroke={c.textSecondary} strokeWidth={1.4} />
          <Path d="M5 9v10h14V9M10 13h4" fill="none" stroke={c.textSecondary}
            strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={styles.emptyTitle}>No archived items yet.</Text>
        <Text style={styles.emptyDetail}>Anything you archive will appear here.</Text>
      </View>}
      renderItem={({ item }) => {
        const transition = data.lifecycle.filter(event => event.taskId === item.id && event.type === 'archived').at(-1);
        const archiveDate = transition?.localDate ?? (item.archivedAt ? item.archivedAt.slice(0, 10) : null);
        const dateText = archiveDate ? parseLocalDate(archiveDate).toLocaleDateString(undefined,
          { year: 'numeric', month: 'short', day: 'numeric' }) : 'Date unavailable';
        return <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={[styles.colorDot, { backgroundColor: item.chartColor ?? activityColors.get(item.id) ?? c.textSecondary }]} />
            <View style={styles.cardText}>
              <Text style={styles.taskName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.archiveDate}>Archived {dateText}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`View insights for ${item.name}`}
              onPress={() => router.push({ pathname: '/insights', params: { task: item.id, mode: 'archivedTask' } })}
              style={styles.action}><Text style={styles.actionText}>View Insights</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Restore ${item.name}`}
              accessibilityState={{ disabled: pendingIds.includes(item.id) }}
              disabled={pendingIds.includes(item.id)} onPress={() => void restore(item.id)}
              style={[styles.action, styles.restoreAction]}><Text style={styles.restoreText}>
                {pendingIds.includes(item.id) ? 'Restoring…' : 'Restore'}
              </Text></Pressable>
          </View>
        </View>;
      }} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  header: { paddingHorizontal: s.xl, paddingTop: s.xs, paddingBottom: s.md },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    minHeight: 44, gap: s.xs, paddingRight: s.md },
  backLabel: { ...t.body, color: c.textPrimary },
  pressed: { opacity: 0.55 },
  title: { ...t.screenTitle, color: c.textPrimary, marginTop: s.sm },
  list: { paddingHorizontal: s.xl, paddingBottom: s.xxl, gap: s.md },
  limitNote: { ...t.secondary, color: c.textSecondary, marginBottom: s.md },
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: r.lg, padding: 14, gap: s.sm },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: s.sm, minWidth: 0 },
  colorDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  cardText: { flex: 1, minWidth: 0, gap: s.xs },
  taskName: { ...t.taskTitle, color: c.textPrimary },
  archiveDate: { ...t.secondary, color: c.textSecondary },
  actions: { flexDirection: 'row', gap: s.sm },
  action: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: c.borderStrong, borderRadius: r.md, paddingHorizontal: s.sm },
  actionText: { ...t.button, color: c.textPrimary, textAlign: 'center' },
  restoreAction: { backgroundColor: c.selected, borderColor: c.selected },
  restoreText: { ...t.button, color: c.selectedText },
  empty: { alignItems: 'center', alignSelf: 'center', paddingTop: s.huge,
    paddingHorizontal: s.md, gap: s.sm, maxWidth: 300 },
  emptyTitle: { ...t.sectionTitle, color: c.textPrimary, textAlign: 'center' },
  emptyDetail: { ...t.body, color: c.textSecondary, textAlign: 'center' },
  deleteArchived: { minHeight: 44, alignSelf: 'center', justifyContent: 'center',
    paddingHorizontal: s.lg, marginTop: s.sm },
  deleteArchivedText: { ...t.secondary, color: c.danger },
});
