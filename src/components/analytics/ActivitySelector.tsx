import { useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors as c, spacing as s } from '../../theme';

interface Activity { id: string; name: string; active?: boolean }
interface Props { tasks: Activity[]; selectedId: string; onSelect: (id: string) => void }

export function ActivitySelector({ tasks, selectedId, onSelect }: Props) {
  const scroll = useRef<ScrollView>(null);
  const widths = useRef(new Map<string, { x: number; width: number }>());
  const viewport = useRef(0);
  const positionSelected = useCallback(() => {
    const tab = widths.current.get(selectedId);
    if (tab && viewport.current) scroll.current?.scrollTo({ x: Math.max(0, tab.x + tab.width / 2 - viewport.current / 2), animated: true });
  }, [selectedId]);
  useEffect(() => { const frame = requestAnimationFrame(positionSelected); return () => cancelAnimationFrame(frame); }, [positionSelected, tasks]);
  return <View style={styles.wrapper}>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      onLayout={event => { viewport.current = event.nativeEvent.layout.width; positionSelected(); }}
      contentContainerStyle={styles.content} style={styles.scroll}>
      <View onLayout={event => { widths.current.set('all', { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width }); if (selectedId === 'all') positionSelected(); }}>
        <Tab testID="insights-activity-all" label="All" selected={selectedId === 'all'} onPress={() => onSelect('all')} />
      </View>
      {tasks.map(task => <View key={task.id} onLayout={event => { widths.current.set(task.id, { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width }); if (selectedId === task.id) positionSelected(); }}>
        <Tab testID={`insights-activity-${task.id}`} label={task.active === false ? `${task.name} · Archived` : task.name} selected={selectedId === task.id} onPress={() => onSelect(task.id)} />
      </View>)}
    </ScrollView>
    <View style={styles.divider} />
  </View>;
}

function Tab({ testID, label, selected, onPress }: { testID: string; label: string; selected: boolean; onPress: () => void }) {
  return <Pressable testID={testID} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
    <Text numberOfLines={1} maxFontSizeMultiplier={1.5} style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    <View style={[styles.indicator, selected && styles.activeIndicator]} />
  </Pressable>;
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, minWidth: 0 },
  scroll: { flex: 1, minWidth: 0 },
  content: { alignItems: 'stretch', gap: s.xl, paddingLeft: s.xl, paddingRight: s.md },
  tab: { minHeight: 40, maxWidth: 170, justifyContent: 'center', paddingTop: s.sm },
  pressed: { opacity: 0.55 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: c.textSecondary },
  selectedLabel: { color: c.textPrimary, fontWeight: '600' },
  indicator: { height: 2.5, borderRadius: 1.5, marginTop: s.sm, backgroundColor: 'transparent' },
  activeIndicator: { backgroundColor: c.textPrimary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border },
});
