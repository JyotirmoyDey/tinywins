import { useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors as c, spacing as s, typography as t } from '../../theme';

interface Activity { id: string; name: string }
interface Props { tasks: Activity[]; selectedId: string; onSelect: (id: string) => void }

export function ActivitySelector({ tasks, selectedId, onSelect }: Props) {
  const scroll = useRef<ScrollView>(null);
  const widths = useRef(new Map<string, { x: number; width: number }>());
  const viewport = useRef(0);
  const positionSelected = useCallback(() => {
    const chip = widths.current.get(selectedId);
    if (chip && viewport.current) scroll.current?.scrollTo({ x: Math.max(0, chip.x + chip.width / 2 - viewport.current / 2), animated: true });
  }, [selectedId]);
  useEffect(() => { const frame = requestAnimationFrame(positionSelected); return () => cancelAnimationFrame(frame); }, [positionSelected, tasks]);
  return <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
    onLayout={event => { viewport.current = event.nativeEvent.layout.width; positionSelected(); }}
    contentContainerStyle={styles.content} style={styles.scroll}>
    <View onLayout={event => { widths.current.set('all', { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width }); if (selectedId === 'all') positionSelected(); }}><Chip label="All" selected={selectedId === 'all'} onPress={() => onSelect('all')} /></View>
    {tasks.map(task => <View key={task.id} onLayout={event => { widths.current.set(task.id, { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width }); if (selectedId === task.id) positionSelected(); }}><Chip label={task.name} selected={selectedId === task.id} onPress={() => onSelect(task.id)} /></View>)}
  </ScrollView>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}>
    <Text numberOfLines={1} maxFontSizeMultiplier={1.5} style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minWidth: 0 },
  content: { alignItems: 'center', gap: s.sm, paddingLeft: s.xl, paddingRight: s.sm, paddingVertical: s.xs },
  chip: { minHeight: 44, maxWidth: 170, paddingHorizontal: s.md, borderWidth: 1, borderColor: c.border, borderRadius: 11, backgroundColor: c.surfaceSecondary, justifyContent: 'center' },
  selected: { backgroundColor: c.selected, borderColor: c.selected },
  pressed: { opacity: 0.72 },
  label: { ...t.caption, color: c.textPrimary },
  selectedLabel: { color: c.selectedText },
});
