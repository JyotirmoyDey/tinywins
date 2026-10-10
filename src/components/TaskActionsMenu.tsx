import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Task } from '../domain/task';
import { useTaskActions } from '../state/TasksProvider';
import { colors as c, radii as r, spacing as s, typography as t } from '../theme';
import { trackActivityArchived } from '../telemetry';
import { deleteTaskWithTelemetry } from '../telemetry/taskDeletion';
import { logger } from '../logging/logger';

/** Shared task management menu used by both Home card designs. */
export function TaskActionsMenu({ task, onClear, onBusyChange }: { task: Task; onClear?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mutate, announce } = useTaskActions();
  const [open, setOpen] = useState(false);
  const pending = useRef(false);
  const remove = async (archive: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setOpen(false); onBusyChange?.(true);
    try {
      await mutate(repo => archive ? repo.archiveTask(task.id) : deleteTaskWithTelemetry(repo, task.id));
      if (archive) { trackActivityArchived(); logger.info('Activity archive completed', { operation: 'archive' }); }
      if (archive) announce('Archived. You can restore it from Profile.');
    }
    catch (cause) { logger.error(archive ? 'Activity archive failed' : 'Activity delete failed', { operation: 'database_write' }, cause); Alert.alert('Could not make this change', 'Please try again.'); }
    finally { pending.current = false; onBusyChange?.(false); }
  };
  return <>
    <Pressable testID={`activity-menu-${task.id}`} accessibilityRole="button" accessibilityLabel={`Actions for ${task.name}`} onPress={() => setOpen(true)} style={styles.icon}>
      <Text style={styles.dots}>···</Text>
    </Pressable>
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close actions" onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, s.lg) }]} accessibilityViewIsModal>
          <Text style={styles.taskName}>{task.name}</Text>
          <MenuItem label="Edit" onPress={() => { setOpen(false); router.push(`/task/${task.id}`); }} />
          {onClear && <MenuItem label="Clear today's check-in" onPress={() => { setOpen(false); onClear(); }} />}
          <MenuItem label="Archive" testID="archive-activity-action" onPress={() => {
            setOpen(false);
            Alert.alert(`Archive ${task.name}?`,
              'It will disappear from your daily list. Your check-ins and history will still be available in Archived.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Archive', onPress: () => void remove(true) },
              ]);
          }} />
          <MenuItem label="Delete" danger onPress={() => {
            setOpen(false);
            Alert.alert(`Delete ${task.name}?`, 'This permanently removes its check-ins and history from this device.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => void remove(false) },
            ]);
          }} />
          <MenuItem label="Cancel" onPress={() => setOpen(false)} />
        </View>
      </View>
    </Modal>
  </>;
}
function MenuItem({ label, onPress, danger, testID }: { label: string; onPress: () => void; danger?: boolean; testID?: string }) {
  return <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.6 : 1 }]}>
    <Text style={[t.body, { color: danger ? c.danger : c.textPrimary }]}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -s.sm },
  dots: { fontSize: 24, color: c.textSecondary },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: r.xl, borderTopRightRadius: r.xl, padding: s.lg, paddingBottom: 40 },
  taskName: { ...t.taskTitle, color: c.textPrimary, padding: s.lg },
  menuItem: { minHeight: 52, padding: s.lg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border },
});
