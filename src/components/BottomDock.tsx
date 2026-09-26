import { ComponentProps, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Tabs, useRouter } from 'expo-router';
import { colors as c } from '../theme';
import { useTasks } from '../state/TasksProvider';
import { ACTIVE_TASK_LIMIT_MESSAGE, MAX_ACTIVE_TASKS } from '../config/taskLimits';

type DockProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type DockAction = 'index' | 'insights' | 'add' | 'profile';
const inactive = c.navigationInactive;

function DockIcon({ action, active, disabled }: { action: DockAction; active: boolean; disabled?: boolean }) {
  const color = action === 'add' ? disabled ? c.textSecondary : c.selectedText : active ? c.selected : inactive;
  return <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
    {action === 'index' && <Path d="m3.5 10 8.5-7 8.5 7v10a1 1 0 0 1-1 1h-5.5v-6h-4v6H4.5a1 1 0 0 1-1-1V10Z" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
    {action === 'insights' && <Path d="M3.5 20.5h17M6.5 17v-5m5.5 5V4m5.5 13V9" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
    {action === 'add' && <Path d="M12 5v14M5 12h14" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />}
    {action === 'profile' && <><Circle cx={12} cy={8} r={3.5} fill="none" stroke={color} strokeWidth={1.8} /><Path d="M4.5 20c.6-3.7 3.3-5.5 7.5-5.5s6.9 1.8 7.5 5.5" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" /></>}
  </Svg>;
}

export function BottomDock({ state, navigation, insets }: DockProps) {
  const router = useRouter();
  const { data, loading } = useTasks();
  const addDisabled = loading || data.tasks.filter(task => task.active).length >= MAX_ACTIVE_TASKS;
  const atLimit = !loading && addDisabled;
  const pending = useRef<DockAction | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { shown.remove(); hidden.remove(); if (timer.current) clearTimeout(timer.current); };
  }, []);
  const activeRoute = state.routes[state.index];
  const currentTaskParam = (activeRoute.params as { task?: string } | undefined)?.task;
  const onPress = (action: DockAction) => {
    if (action === 'add' && addDisabled) return;
    if (pending.current === action) return;
    if (action !== 'add' && activeRoute.name === action &&
      (action !== 'insights' || !currentTaskParam || currentTaskParam === 'all')) return;
    pending.current = action;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { pending.current = null; }, 350);
    void Haptics.selectionAsync().catch(() => {});
    if (action === 'add') { router.push('/task/new'); return; }
    const route = state.routes.find(item => item.name === action);
    if (route) {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (event.defaultPrevented) return;
    }
    if (action === 'index') navigation.navigate('index');
    else if (action === 'insights') navigation.navigate('insights', { task: 'all', mode: 'normal' });
    else navigation.navigate('profile');
  };
  if (keyboardVisible) return null;
  return <View style={[styles.dock, { paddingBottom: insets.bottom }]}>
    {atLimit && <Text style={styles.limitMessage} accessibilityRole="alert">
      {ACTIVE_TASK_LIMIT_MESSAGE}
    </Text>}
    <View style={styles.items}>
      {(['index', 'insights', 'add', 'profile'] as const).map(action => {
        const active = action !== 'add' && activeRoute.name === action;
        const label = action === 'index' ? 'Home' : action === 'insights' ? 'Insights' : action === 'add' ? 'Add' : 'Profile';
        const disabled = action === 'add' && addDisabled;
        return <Pressable key={action} accessibilityRole={action === 'add' ? 'button' : 'tab'} accessibilityLabel={action === 'add' ? 'Add task' : label}
          accessibilityHint={disabled && atLimit ? ACTIVE_TASK_LIMIT_MESSAGE : undefined}
          accessibilityState={action === 'add' ? { disabled } : { selected: active }} disabled={disabled}
          onPress={() => onPress(action)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
          <View style={action === 'add' ? [styles.addCircle, disabled && styles.addCircleDisabled] : styles.icon}>
            <DockIcon action={action} active={active} disabled={disabled} /></View>
          <Text maxFontSizeMultiplier={1.5} style={[styles.label, { color: active ? c.selected : inactive }]}>{label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  dock: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  items: { height: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  item: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  addCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.selected, alignItems: 'center', justifyContent: 'center' },
  addCircleDisabled: { backgroundColor: c.surfaceSecondary },
  limitMessage: { color: c.textSecondary, fontSize: 12, lineHeight: 17,
    textAlign: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 2 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '500', textAlign: 'center' },
  pressed: { opacity: 0.65, transform: [{ scale: 0.96 }] },
});
