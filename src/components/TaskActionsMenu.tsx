import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Task } from '../domain/task';
import { useTaskActions } from '../state/TasksProvider';
import { colors as c, radii as r, spacing as s, typography as t } from '../theme';

/** Shared task management menu used by both Home card designs. */
export function TaskActionsMenu({ task, onClear, onBusyChange }: { task: Task; onClear?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mutate } = useTaskActions();
  const [open, setOpen] = useState(false);
  const remove = async (archive: boolean) => {
    setOpen(false); onBusyChange?.(true);
    try { await mutate(repo => archive ? repo.archiveTask(task.id) : repo.deleteTask(task.id)); }
    catch { Alert.alert('Could not update task', 'Please try again.'); }
    finally { onBusyChange?.(false); }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${task.name}`} onPress={() => setOpen(true)} style={styles.icon}>
      <Text style={styles.dots}>···</Text>
    </Pressable>
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close task actions" onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, s.lg) }]} accessibilityViewIsModal>
          <Text style={styles.taskName}>{task.name}</Text>
          <MenuItem label="Edit task" onPress={() => { setOpen(false); router.push(`/task/${task.id}`); }} />
          {onClear && <MenuItem label="Clear today's rating" onPress={() => { setOpen(false); onClear(); }} />}
          <MenuItem label="Archive task" onPress={() => void remove(true)} />
          <MenuItem label="Delete task" danger onPress={() => {
            setOpen(false);
            Alert.alert(`Delete ${task.name}?`, 'This permanently removes the task and its check-ins from this device.', [
              { text: 'Keep task', style: 'cancel' },
              { text: 'Delete task', style: 'destructive', onPress: () => void remove(false) },
            ]);
          }} />
          <MenuItem label="Cancel" onPress={() => setOpen(false)} />
        </View>
      </View>
    </Modal>
  </>;
}
function MenuItem({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.6 : 1 }]}>
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
