import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { colors as c, spacing as s, typography as t } from '../../theme';

interface Activity { id: string; name: string }
interface Props { tasks: Activity[]; selectedId: string; onSelect: (id: string) => void }

export function InsightsActivityMenu({ tasks, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const { height } = useWindowDimensions();
  const selectedName = selectedId === 'all' ? 'All Activities' :
    tasks.find(task => task.id === selectedId)?.name || 'All Activities';
  const choices = [{ id: 'all', name: 'All Activities' }, ...tasks];
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={'Activity, ' + selectedName}
      accessibilityHint="Choose an activity" onPress={() => setOpen(true)} style={styles.button}>
      <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.5}>{selectedName}</Text>
      <Svg width={12} height={12} viewBox="0 0 12 12" accessible={false}>
        <Path d="m2 4 4 4 4-4" fill="none" stroke={c.textSecondary} strokeWidth={1.5}
          strokeLinecap="round" strokeLinejoin="round"/>
      </Svg>
    </Pressable>
    <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button"
          accessibilityLabel="Close activity selector" onPress={() => setOpen(false)}/>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.heading}>Activities</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close activity selector"
              onPress={() => setOpen(false)} style={styles.close}>
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: height * 0.6 }} contentContainerStyle={styles.list}>
            {choices.map(choice => {
              const selected = choice.id === selectedId;
              return <Pressable key={choice.id} accessibilityRole="button"
                accessibilityState={{ selected }} accessibilityLabel={choice.name}
                onPress={() => { setOpen(false); onSelect(choice.id); }} style={styles.row}>
                <Text style={[styles.rowLabel, selected && styles.selected]}>{choice.name}</Text>
                {selected && <Text style={styles.check}>✓</Text>}
              </Pressable>;
            })}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  button: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center',
    gap: s.sm, paddingHorizontal: s.md },
  label: { ...t.secondary, color: c.textPrimary, fontWeight: '600', flex: 1, minWidth: 0 },
  backdrop: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: s.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: s.xl, minHeight: 48 },
  heading: { ...t.taskTitle, color: c.textPrimary },
  close: { minWidth: 48, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  closeText: { ...t.button, color: c.textPrimary },
  list: { paddingHorizontal: s.xl, paddingBottom: s.lg },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: s.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, paddingVertical: s.sm },
  rowLabel: { ...t.body, color: c.textPrimary, flex: 1, minWidth: 0 },
  selected: { fontWeight: '600' },
  check: { ...t.body, color: c.textPrimary },
});
