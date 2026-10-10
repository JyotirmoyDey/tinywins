import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors as c, radii as r, spacing as s, typography as t } from '../theme';

export function UndoSnackbar({ onUndo }: { onUndo: () => void }) {
  return <View testID="level-removed-snackbar" style={styles.container} accessibilityLiveRegion="polite">
    <Text style={styles.message}>Level removed</Text>
    <Pressable testID="undo-level-removal" accessibilityRole="button" accessibilityLabel="Undo level removal"
      onPress={onUndo} style={styles.action} hitSlop={4}>
      <Text style={styles.actionText}>Undo</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  container: { minHeight: 52, marginHorizontal: s.xxl, marginBottom: s.sm, paddingLeft: s.lg,
    paddingRight: s.xs, borderRadius: r.md, backgroundColor: c.selected,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  message: { ...t.secondary, color: c.selectedText, flexShrink: 1 },
  action: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  actionText: { ...t.button, color: c.selectedText },
});
