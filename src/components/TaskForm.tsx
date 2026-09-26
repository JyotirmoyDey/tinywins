import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { OPTION_ROW_HEIGHT, positionsForIds } from './optionOrdering';
import { randomUUID } from 'expo-crypto';
import { Task, TaskDraft, validateDraft } from '../domain/task';
import { useKeyboardFocus } from '../hooks/useKeyboardFocus';
import { useTasks } from '../state/TasksProvider';
import { getRepositories } from '../data/runtime';
import { colors as c, radii as r, spacing as s, typography as t } from '../theme';
import { Button } from './ui';
import { EditableOptionRow } from './EditableOptionRow';
import { ActiveTaskLimitError } from '../data/repository';
import { ACTIVE_TASK_LIMIT_MESSAGE, MAX_ACTIVE_TASKS } from '../config/taskLimits';
export function TaskForm({ task }: { task?: Task }) {
  const router = useRouter(); const navigation = useNavigation(); const { data, loading, mutate, reload } = useTasks();
  const activeCount = data.tasks.filter(item => item.active).length;
  const atLimit = !task && !loading && activeCount >= MAX_ACTIVE_TASKS;
  const [name, setName] = useState(task?.name ?? '');
  const [options, setOptions] = useState(() => task?.options.map(({ id, label }) => ({ id, label })) ?? ['Low', 'Medium', 'High'].map(label => ({ id: randomUUID(), label })));
  const positions = useSharedValue(positionsForIds(options.map(option => option.id)));
  const activeId = useSharedValue<string | null>(null);
  const [sorting, setSorting] = useState(false);
  const optionIds = JSON.stringify(options.map(option => option.id));
  useEffect(() => { positions.set(positionsForIds(JSON.parse(optionIds))); }, [optionIds, positions]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollGesture = useMemo(() => Gesture.Native(), []);
  const [error, setError] = useState<string | null>(null);
  const reducedMotion = useRef(false); const inputs = useRef<Record<string, TextInput | null>>({});
  const nameInput = useRef<TextInput>(null);
  const { setViewport, setScrollView, onLayout: onKeyboardLayout, onScroll: onKeyboardScroll, onFocus: onKeyboardFocus, scrollTo, scrollToEnd } = useKeyboardFocus();
  const newOption = useRef<string | null>(null);
  const [initial] = useState(() => JSON.stringify({ name, options }));
  const dirty = initial !== JSON.stringify({ name, options });
  usePreventRemove(!saved && (dirty || busy || sorting), ({ data }) => {
    if (busy || sorting) return;
    Alert.alert('Discard changes?', 'Your changes have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => { if (saved) router.back(); }, [saved, router]);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { reducedMotion.current = value; });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reducedMotion.current = value; });
    const timer = !task ? setTimeout(() => nameInput.current?.focus(), 300) : undefined;
    return () => { clearTimeout(timer); listener.remove(); };
  }, [task]);
  const animate = useCallback(() => { if (!reducedMotion.current) LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 180 }); }, []);
  const moveOption = useCallback((id: string, to: number) => {
    setOptions(current => {
      const from = current.findIndex(option => option.id === id);
      if (from < 0 || from === to) return current;
      const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next;
    });
    AccessibilityInfo.announceForAccessibility(`Moved to position ${to + 1}`);
  }, []);
  const back = () => { if (!busy && !sorting) router.back(); };
  const mutateCheck = async (id: string, draft: TaskDraft) => (await getRepositories()).tasks.requiresTrendReset(id, draft);
  const save = async () => {
    if (busy || sorting) return;
    if (!task && (loading || atLimit)) {
      if (atLimit) setError(ACTIVE_TASK_LIMIT_MESSAGE);
      return;
    }
    const draft: TaskDraft = { name, options }; const message = validateDraft(draft);
    if (message) {
      setError(message); AccessibilityInfo.announceForAccessibility(message);
      if (!name.trim()) { scrollTo({ y: 0, animated: true }); nameInput.current?.focus(); }
      else { const blank = options.find(option => !option.label.trim()); if (blank) inputs.current[blank.id]?.focus(); }
      return;
    }
    setBusy(true); setError(null); Keyboard.dismiss();
    const persist = async (confirmTrendReset: boolean) => {
      try {
        await mutate(repo => task ? repo.updateTask(task.id, draft, confirmTrendReset) : repo.createTask(draft));
        AccessibilityInfo.announceForAccessibility(task ? 'Changes saved' : 'Created'); setSaved(true);
      } catch (failure) {
        if (failure instanceof ActiveTaskLimitError) {
          setError(ACTIVE_TASK_LIMIT_MESSAGE);
          void reload();
        } else setError('Could not save your changes. Please try again.');
        setBusy(false);
      }
    };
    if (task) {
      try {
        const needsReset = await mutateCheck(task.id, draft);
        if (needsReset) {
          Alert.alert('Reset your trend?',
            'Changing the order of your rating levels will restart the trend graph. Your previous ratings will be preserved, but the new trend will begin with the updated rating scale.',
            [{ text: 'Cancel', style: 'cancel', onPress: () => setBusy(false) },
              { text: 'Reorder and reset', onPress: () => void persist(true) }],
            { cancelable: false });
          return;
        }
      } catch { setError('Could not check these changes. Please try again.'); setBusy(false); return; }
    }
    await persist(false);
  };
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topbar}><Pressable accessibilityRole="button" accessibilityLabel="Cancel editing" onPress={back} disabled={busy} style={styles.back}>
        <Text style={[t.button, { color: c.textSecondary }]}>‹  Cancel</Text></Pressable>
        <Text style={[t.button, { color: c.textSecondary }]}>{task ? 'Edit' : 'New'}</Text><View style={{ width: 76 }} /></View>
      <View ref={setViewport} style={{ flex: 1 }} onLayout={onKeyboardLayout}><GestureDetector gesture={scrollGesture}><ScrollView ref={setScrollView} onScroll={event => onKeyboardScroll(event.nativeEvent.contentOffset.y)} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content} onContentSizeChange={() => {
          if (newOption.current) { const id = newOption.current; newOption.current = null; scrollToEnd({ animated: true }); inputs.current[id]?.focus(); }
        }}>
        <Text style={[t.screenTitle, { color: c.textPrimary }]}>{task ? `Edit · ${task.name}` : 'What would you like to track?'}</Text>
        <Text style={[t.body, styles.subtitle]}>{task ? 'Update the name or rating choices.' : 'Give it a name and choose how you’ll rate it.'}</Text>
        {!task && !loading && <Text style={styles.taskCount}>{activeCount} of {MAX_ACTIVE_TASKS}</Text>}
        {atLimit && <Text style={styles.limitMessage} accessibilityRole="alert">{ACTIVE_TASK_LIMIT_MESSAGE}</Text>}
        <Text style={styles.label}>Name</Text>
        <TextInput ref={nameInput} onFocus={() => onKeyboardFocus(nameInput.current)} value={name} onChangeText={value => { setName(value); setError(null); }} placeholder="Guitar Practice"
          placeholderTextColor={c.textSecondary} accessibilityLabel="Name" maxLength={80} returnKeyType="next" submitBehavior="submit"
          onSubmitEditing={() => inputs.current[options[0].id]?.focus()} style={styles.nameInput} editable={!busy && !sorting} />
        <Text style={[t.sectionTitle, { color: c.textPrimary, marginTop: s.xxxl }]}>How would you like to rate it?</Text>
        <Text style={[t.secondary, styles.subtitle]}>Use your own words. Drag the handles to order your choices.</Text>
        <View style={styles.orderLabel}><Text style={styles.orderText}>Lowest ↓</Text><Text style={styles.orderText}>{options.length} of 7 options</Text></View>
        <View style={{ height: options.length * OPTION_ROW_HEIGHT }} pointerEvents={busy ? 'none' : 'auto'}>{options.map((option, index) => <EditableOptionRow key={option.id}
          disabled={busy || sorting} onFocus={() => onKeyboardFocus(inputs.current[option.id])}
          positions={positions} activeId={activeId} onDragStateChange={setSorting}
          option={option} index={index} count={options.length} scrollGesture={scrollGesture}
          inputRef={input => { inputs.current[option.id] = input; }}
          onSubmit={() => index < options.length - 1 ? inputs.current[options[index + 1].id]?.focus() : Keyboard.dismiss()}
          onChange={label => { setOptions(current => current.map(o => o.id === option.id ? { ...o, label } : o)); setError(null); }}
          onRemove={() => { animate(); setOptions(current => current.filter(o => o.id !== option.id)); }}
          onMove={moveOption} />)}</View>
        <Text style={[styles.orderText, { marginBottom: s.xl }]}>Highest</Text>
        <Button label={options.length === 7 ? 'All 7 options added' : '＋ Add option'} subtle
          disabled={busy || sorting || options.length >= 7 || options.some(o => !o.label.trim())} onPress={() => {
            animate(); const id = randomUUID(); newOption.current = id; setOptions(current => [...current, { id, label: '' }]);
          }} />
        <Text style={[t.secondary, { color: c.textSecondary, marginTop: s.md }]}>Choose 2–7 options, from lowest to highest.</Text>
      </ScrollView></GestureDetector></View>
      <View style={styles.footer}>{error && !(atLimit && error === ACTIVE_TASK_LIMIT_MESSAGE) &&
        <Text accessibilityRole="alert" style={[t.secondary, { color: c.danger, marginBottom: s.sm }]}>{error}</Text>}
        <Button label={busy ? 'Saving…' : task ? 'Save Changes' : 'Create'}
          onPress={() => void save()} disabled={busy || sorting || (!task && (loading || atLimit))} /></View>
    </KeyboardAvoidingView>
  </SafeAreaView></GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background }, topbar: { paddingHorizontal: s.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  back: { minHeight: 44, minWidth: 76, justifyContent: 'center' }, content: { paddingHorizontal: s.xxl, paddingTop: s.xl, paddingBottom: s.xxxl },
  subtitle: { color: c.textSecondary, marginTop: s.sm, marginBottom: s.xxl }, label: { ...t.button, color: c.textPrimary, marginBottom: s.md },
  taskCount: { ...t.caption, color: c.textSecondary, marginBottom: s.sm },
  limitMessage: { ...t.secondary, color: c.textSecondary, marginBottom: s.lg },
  nameInput: { ...t.body, color: c.textPrimary, backgroundColor: c.surface, minHeight: 56, borderWidth: 1, borderColor: c.borderStrong, borderRadius: r.md, padding: s.lg },
  orderLabel: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: s.md }, orderText: { ...t.secondary, color: c.textSecondary },
  footer: { paddingHorizontal: s.xxl, paddingVertical: s.md, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.background },
});
