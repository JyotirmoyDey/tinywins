import React from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { colors as c, typography as t, spacing as s, radii as r } from '../theme';
export function Button({ label, onPress, subtle = false, disabled = false }: {
  label: string; onPress: () => void; subtle?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, subtle && styles.subtle, { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}>
    <Text style={[t.button, { color: subtle ? c.textPrimary : c.selectedText }]}>{label}</Text>
  </Pressable>;
}
export function ScreenHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <View style={styles.header}><View style={{ flex: 1 }}><Text style={[t.screenTitle, { color: c.textPrimary }]}>{title}</Text>
    {subtitle && <Text style={[t.body, { color: c.textSecondary, marginTop: s.xs }]}>{subtitle}</Text>}</View>{action}</View>;
}
export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <View style={styles.empty}>
    <View style={styles.mark}><Text style={{ fontSize: 22, color: c.textPrimary }}>✓</Text></View>
    <Text style={[t.sectionTitle, styles.center]}>{'Small moments.\nMeaningful progress.'}</Text>
    <Text style={[t.body, styles.center, { color: c.textSecondary }]}>Track the things that matter to you, one small check-in at a time.</Text>
    <Button label="Create your first task" onPress={onAdd} />
    <Text style={[t.secondary, { color: c.textSecondary }]}>Your pace. Your choices.</Text>
  </View>;
}
export function Loading() { return <View style={styles.empty}><ActivityIndicator color={c.primary} accessibilityLabel="Loading tasks" /></View>; }
const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: r.md, backgroundColor: c.primary, paddingHorizontal: s.xl, alignItems: 'center', justifyContent: 'center' },
  subtle: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong }, header: { flexDirection: 'row', alignItems: 'center', gap: s.md, paddingVertical: s.xxl },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: s.xxl, paddingHorizontal: s.xxl, paddingBottom: 64 },
  mark: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, width: 56, height: 56, borderRadius: r.xl, justifyContent: 'center', alignItems: 'center' },
  center: { textAlign: 'center', color: c.textPrimary },
});
