import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Task } from '../domain/task';
import { useTasks } from '../state/TasksProvider';
import { COMBINED_INSIGHTS_LIMIT_MESSAGE, MAX_COMBINED_INSIGHTS_ITEMS } from '../config/combinedInsights';
import { CombinedInsightsLimitError } from '../data/repository';
import { colors as c } from '../theme';

export function CombinedInsightsToggle({ task }: { task: Task }) {
  const { data, mutate } = useTasks();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const selected = optimistic ?? task.includeInCombinedInsights;
  const count = data.tasks.filter(item => item.active && item.includeInCombinedInsights).length;
  const toggle = async () => {
    if (pending.current) return;
    const next = !selected;
    if (next && count >= MAX_COMBINED_INSIGHTS_ITEMS) {
      Alert.alert('Combined Insights is full', COMBINED_INSIGHTS_LIMIT_MESSAGE);
      return;
    }
    pending.current = true;
    setBusy(true);
    setOptimistic(next);
    try { await mutate(repo => repo.setCombinedInsightsSelection(task.id, next)); }
    catch (error) {
      Alert.alert('Could not update Insights', error instanceof CombinedInsightsLimitError
        ? COMBINED_INSIGHTS_LIMIT_MESSAGE : 'Please try again.');
    } finally { setOptimistic(null); pending.current = false; setBusy(false); }
  };
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`${task.name} ${selected ? 'included in' : 'not included in'} combined Insights`}
    accessibilityHint="Double tap to change inclusion in combined Insights"
    accessibilityState={{ selected, disabled: busy }} disabled={busy}
    onPress={() => void toggle()} style={({ pressed }) => [styles.touch, pressed && styles.pressed]}>
    <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
      <Path d="M3.5 20h17M6.5 16.5v-5m5.5 5V5m5.5 11.5V9"
        fill="none" stroke={selected ? '#318779' : c.textTertiary}
        strokeWidth={selected ? 2.5 : 1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </Pressable>;
}

const styles = StyleSheet.create({
  touch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
