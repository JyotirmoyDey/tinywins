import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { OPTION_ROW_HEIGHT, positionsForIds } from './optionOrdering';
import { randomUUID } from 'expo-crypto';
import { OptionDraft, Task, TaskDraft, validateDraft } from '../domain/task';
import { useKeyboardFocus } from '../hooks/useKeyboardFocus';
import { keyboardContentPadding } from '../hooks/keyboardFocusMath';
import { useTasks } from '../state/TasksProvider';
import { getRepositories } from '../data/runtime';
import { colors as c, radii as r, spacing as s, typography as t } from '../theme';
import { Button } from './ui';
import { EditableOptionRow } from './EditableOptionRow';
import { ActiveTaskLimitError, CombinedInsightsLimitError } from '../data/repository';
import { ACTIVE_TASK_LIMIT_MESSAGE, MAX_ACTIVE_TASKS } from '../config/taskLimits';
import { COMBINED_INSIGHTS_LIMIT_MESSAGE } from '../config/combinedInsights';
import { characterCount, nativeTextMaxLength, MAX_NAME_CHARACTERS, MAX_OPTION_CHARACTERS, MAX_OPTION_DESCRIPTION_CHARACTERS } from '../domain/inputLimits';
import { limitNativeTextInput } from './limitedTextInput';
import { MAX_RATING_LEVELS, MIN_NEW_ACTIVITY_LEVELS } from '../config/ratingLevels';
import { trackActivityCreated } from '../telemetry';
import { logger } from '../logging/logger';
import { createSuggestedDraft } from '../config/firstActivityExamples';
import { createLevelTemplateOptions, levelTemplates, LevelTemplateId } from '../config/levelTemplates';
import { removeDraftLevel, RemovedLevel, restoreDraftLevel } from './levelRemoval';
import { UndoSnackbar } from './UndoSnackbar';
export function TaskForm({ task, exampleId }: { task?: Task; exampleId?: string }) {
  const router = useRouter(); const navigation = useNavigation(); const { data, loading, mutate, reload } = useTasks();
  const activeCount = data.tasks.filter(item => item.active).length;
  const atLimit = !task && !loading && activeCount >= MAX_ACTIVE_TASKS;
  const [suggestion] = useState(() => task ? undefined : createSuggestedDraft(exampleId, randomUUID));
  const [name, setName] = useState(task?.name ?? suggestion?.name ?? '');
  const [options, setOptions] = useState<OptionDraft[]>(() => task?.options.map(({ id, label, description }) => ({ id, label, description })) ?? suggestion?.options ?? createLevelTemplateOptions('custom', randomUUID));
  const optionsRef = useRef(options);
  const updateOptions = useCallback((change: (current: OptionDraft[]) => OptionDraft[]) => {
    const next = change(optionsRef.current);
    optionsRef.current = next;
    setOptions(next);
  }, []);
  const removedLevels = useRef<RemovedLevel[]>([]);
  const snackbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRemovalSnackbar, setShowRemovalSnackbar] = useState(false);
  const clearRemovalTimer = useCallback(() => {
    if (snackbarTimer.current !== null) clearTimeout(snackbarTimer.current);
    snackbarTimer.current = null;
  }, []);
  const clearRemovalHistory = useCallback(() => {
    clearRemovalTimer();
    removedLevels.current = [];
    setShowRemovalSnackbar(false);
  }, [clearRemovalTimer]);
  const startRemovalTimer = useCallback(() => {
    clearRemovalTimer();
    setShowRemovalSnackbar(true);
    snackbarTimer.current = setTimeout(() => {
      removedLevels.current = [];
      snackbarTimer.current = null;
      setShowRemovalSnackbar(false);
    }, 5000);
  }, [clearRemovalTimer]);
  useEffect(() => () => clearRemovalTimer(), [clearRemovalTimer]);
  const [selectedTemplate, setSelectedTemplate] = useState<LevelTemplateId | null>(suggestion ? null : 'custom');
  const positions = useSharedValue(positionsForIds(options.map(option => option.id)));
  const activeId = useSharedValue<string | null>(null);
  const [sorting, setSorting] = useState(false);
  const optionIds = JSON.stringify(options.map(option => option.id));
  useEffect(() => { positions.set(positionsForIds(JSON.parse(optionIds))); }, [optionIds, positions]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const scrollGesture = useMemo(() => Gesture.Native(), []);
  const [error, setError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const reducedMotion = useRef(false); const inputs = useRef<Record<string, TextInput | null>>({});
  const descriptionInputs = useRef<Record<string, TextInput | null>>({});
  const nameInput = useRef<TextInput>(null);
  const { keyboardInset, setViewport, setScrollView, onLayout: onKeyboardLayout, onScroll: onKeyboardScroll,
    onContentSizeChange: onKeyboardContentChange, onFocus: onKeyboardFocus, scrollTo } = useKeyboardFocus();
  const newOption = useRef<string | null>(null);
  const [initial] = useState(() => JSON.stringify({ name, options }));
  const dirty = initial !== JSON.stringify({ name, options });
  usePreventRemove(!saved && (dirty || busy || sorting), ({ data }) => {
    if (saving.current || busy || sorting) return;
    Alert.alert('Discard changes?', 'Your changes have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => { if (saved) router.back(); }, [saved, router]);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { reducedMotion.current = value; });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reducedMotion.current = value; });
    return () => listener.remove();
  }, []);
  const animate = useCallback(() => { if (!reducedMotion.current) LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 180 }); }, []);
  const moveOption = useCallback((id: string, to: number) => {
    updateOptions(current => {
      const from = current.findIndex(option => option.id === id);
      if (from < 0 || from === to) return current;
      const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next;
    });
    AccessibilityInfo.announceForAccessibility(`Moved to position ${to + 1}`);
  }, [updateOptions]);
  const back = () => { if (!busy && !sorting) router.back(); };
  const applyTemplate = (id: LevelTemplateId) => {
    if (busy || sorting) return;
    Keyboard.dismiss();
    newOption.current = null;
    clearRemovalHistory();
    updateOptions(() => createLevelTemplateOptions(id, randomUUID));
    setSelectedTemplate(id);
    setError(null);
    setLimitNotice(null);
  };
  const removeOption = (id: string) => {
    if (busy || sorting) return;
    const result = removeDraftLevel(optionsRef.current, id, MIN_NEW_ACTIVITY_LEVELS);
    if (!result) return;
    if (inputs.current[id]?.isFocused() || descriptionInputs.current[id]?.isFocused()) Keyboard.dismiss();
    if (newOption.current === id) newOption.current = null;
    animate();
    updateOptions(() => result.options);
    removedLevels.current.push(result.removed);
    startRemovalTimer();
  };
  const undoRemoval = () => {
    if (busy || sorting) return;
    const removed = removedLevels.current.pop();
    if (!removed) return;
    animate();
    updateOptions(current => restoreDraftLevel(current, removed));
    if (removedLevels.current.length) startRemovalTimer();
    else { clearRemovalTimer(); setShowRemovalSnackbar(false); }
  };
  const mutateCheck = async (id: string, draft: TaskDraft) => (await getRepositories()).tasks.requiresTrendReset(id, draft);
  const save = async () => {
    if (busy || sorting) return;
    if (!task && (loading || atLimit)) {
      if (atLimit) setError(ACTIVE_TASK_LIMIT_MESSAGE);
      return;
    }
    // New activities fill an available Combined Insights slot in the repository.
    const draft: TaskDraft = { name, options };
    const message = !task && options.length < MIN_NEW_ACTIVITY_LEVELS
      ? `Start with at least ${MIN_NEW_ACTIVITY_LEVELS} levels.` : validateDraft(draft, task);
    if (message) {
      setError(message); AccessibilityInfo.announceForAccessibility(message);
      if (!name.trim()) { scrollTo({ y: 0, animated: true }); nameInput.current?.focus(); }
      else { const blank = options.find(option => !option.label.trim()); if (blank) inputs.current[blank.id]?.focus(); }
      return;
    }
    saving.current = true; setBusy(true); setError(null); Keyboard.dismiss();
    if (!task) logger.info('Activity create started', { operation: 'create' });
    const persist = async (confirmTrendReset: boolean) => {
      try {
        await mutate(repo => task ? repo.updateTask(task.id, draft, confirmTrendReset) : repo.createTask(draft));
        if (!task) {
          trackActivityCreated(options.length, activeCount + 1);
          logger.info('Activity create completed', { operation: 'create', activity_count: activeCount + 1, level_count: options.length });
        }
        AccessibilityInfo.announceForAccessibility(task ? 'Changes saved' : 'Created'); setSaved(true);
      } catch (failure) {
        if (failure instanceof ActiveTaskLimitError) {
          setError(ACTIVE_TASK_LIMIT_MESSAGE);
          void reload();
        } else if (failure instanceof CombinedInsightsLimitError) {
          setError(COMBINED_INSIGHTS_LIMIT_MESSAGE);
          void reload();
        } else {
          logger.error(task ? 'Activity edit failed' : 'Activity create failed', { operation: 'database_write' }, failure);
          setError('Could not save your changes. Please try again.');
        }
        saving.current = false; setBusy(false);
      }
    };
    if (task) {
      try {
        const needsReset = await mutateCheck(task.id, draft);
        if (needsReset) {
          Alert.alert('Reset your trend?',
            'Changing the order of your levels will restart the trend graph. Your previous check-ins will be preserved, but the new trend will begin with the updated level order.',
            [{ text: 'Cancel', style: 'cancel', onPress: () => { saving.current = false; setBusy(false); } },
              { text: 'Reorder and reset', onPress: () => void persist(true) }],
            { cancelable: false });
          return;
        }
      } catch (cause) { logger.error('Activity edit failed', { operation: 'database_read' }, cause); setError('Could not check these changes. Please try again.'); saving.current = false; setBusy(false); return; }
    }
    await persist(false);
  };
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topbar}><Pressable accessibilityRole="button" accessibilityLabel="Cancel editing" onPress={back} disabled={busy} style={styles.back}>
        <Text style={[t.button, { color: c.textSecondary }]}>‹  Cancel</Text></Pressable>
        <Text style={[t.button, { color: c.textSecondary }]}>{task ? 'Edit' : 'New'}</Text><View style={{ width: 76 }} /></View>
      <View ref={setViewport} style={{ flex: 1 }} onLayout={onKeyboardLayout}><GestureDetector gesture={scrollGesture}><ScrollView ref={setScrollView} onScroll={event => onKeyboardScroll(event.nativeEvent.contentOffset.y)} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" scrollsChildToFocus={false}
        contentContainerStyle={[styles.content, { paddingBottom: keyboardContentPadding(
          s.xxxl, keyboardInset, OPTION_ROW_HEIGHT, s.xl) }]} onContentSizeChange={() => {
          if (newOption.current) {
            const id = newOption.current;
            requestAnimationFrame(() => {
              const input = inputs.current[id];
              if (input) { newOption.current = null; input.focus(); }
            });
          } else onKeyboardContentChange();
        }}>
        <Text testID="activity-editor-screen" numberOfLines={2} style={[t.screenTitle, { color: c.textPrimary }]}>{task ? `Edit · ${task.name}` : 'What would you like to track?'}</Text>
        {atLimit && <Text style={styles.limitMessage} accessibilityRole="alert">{ACTIVE_TASK_LIMIT_MESSAGE}</Text>}
        <View style={styles.fieldHeading}><Text style={styles.label}>Name</Text><Text style={styles.characterCount}>{characterCount(name)}/{MAX_NAME_CHARACTERS}</Text></View>
        <TextInput testID="activity-name-input" ref={nameInput} onFocus={() => onKeyboardFocus(nameInput.current)} value={name}
          maxLength={nativeTextMaxLength(name, MAX_NAME_CHARACTERS)} onChangeText={value => {
          const result = limitNativeTextInput(name, value, MAX_NAME_CHARACTERS,
            text => nameInput.current?.setNativeProps({ text }));
          setName(result.value); setError(null);
          setLimitNotice(result.exceeded ? `The name can be up to ${MAX_NAME_CHARACTERS} characters.` : null);
        }} placeholder="Guitar Practice"
          placeholderTextColor={c.textSecondary} accessibilityLabel="Name" returnKeyType="next" submitBehavior="submit"
          onSubmitEditing={() => inputs.current[options[0].id]?.focus()} style={styles.nameInput} editable={!busy && !sorting} />
        <Text style={[t.sectionTitle, styles.levelHeading]}>How will you describe your days?</Text>
        {!task && <>
          <Text style={styles.templatePrompt}>Choose a starting point. Make it your own.</Text>
          <View style={styles.templateChoices} accessibilityRole="radiogroup">
            {levelTemplates.map(template => <Pressable key={template.id} testID={`level-template-${template.id}`}
              accessibilityRole="radio" accessibilityLabel={`${template.title}. ${template.summary}`}
              accessibilityState={{ checked: selectedTemplate === template.id, disabled: busy || sorting }}
              disabled={busy || sorting} onPress={() => applyTemplate(template.id)}
              style={[styles.templateChoice, selectedTemplate === template.id && styles.templateChoiceSelected]}>
              <Text style={[styles.templateChoiceText, selectedTemplate === template.id && styles.templateChoiceTextSelected]}>{template.title}</Text>
              <Text style={[styles.templateSummary, selectedTemplate === template.id && styles.templateChoiceTextSelected]}>{template.summary}</Text>
            </Pressable>)}
          </View>
        </>}
        <View style={styles.orderLabel}><Text style={styles.orderText}>Less ↓</Text>
          <Text style={styles.orderText}>{options.length} levels</Text></View>
        <View style={{ height: options.length * OPTION_ROW_HEIGHT }} pointerEvents={busy ? 'none' : 'auto'}>{options.map((option, index) => <EditableOptionRow key={option.id}
          disabled={busy || sorting} onFocus={row => onKeyboardFocus(inputs.current[option.id], s.xxxl, row)}
          positions={positions} activeId={activeId} onDragStateChange={setSorting}
          option={option} index={index} count={options.length} minimumCount={MIN_NEW_ACTIVITY_LEVELS} scrollGesture={scrollGesture}
          inputRef={input => { inputs.current[option.id] = input; }}
          descriptionInputRef={input => { descriptionInputs.current[option.id] = input; }}
          onDescriptionFocus={row => onKeyboardFocus(descriptionInputs.current[option.id], s.xxxl, row)}
          onSubmit={() => descriptionInputs.current[option.id]?.focus()}
          onDescriptionSubmit={() => index < options.length - 1 ? inputs.current[options[index + 1].id]?.focus() : Keyboard.dismiss()}
          onChange={label => {
            const result = limitNativeTextInput(option.label, label, MAX_OPTION_CHARACTERS,
              text => inputs.current[option.id]?.setNativeProps({ text }));
            updateOptions(current => current.map(o => o.id === option.id ? { ...o, label: result.value } : o));
            setError(null);
            setLimitNotice(result.exceeded ? `Level names can be up to ${MAX_OPTION_CHARACTERS} characters.` : null);
          }}
          onDescriptionChange={description => {
            const result = limitNativeTextInput(option.description ?? '', description, MAX_OPTION_DESCRIPTION_CHARACTERS,
              text => descriptionInputs.current[option.id]?.setNativeProps({ text }));
            updateOptions(current => current.map(o => o.id === option.id ? { ...o, description: result.value } : o));
            setError(null);
            setLimitNotice(result.exceeded ? `Level descriptions can be up to ${MAX_OPTION_DESCRIPTION_CHARACTERS} characters.` : null);
          }}
          onRemove={() => removeOption(option.id)}
          onMove={moveOption} />)}</View>
        <Text style={[styles.orderText, { marginBottom: s.xl }]}>More</Text>
        <Button testID="add-level-button" label={options.length > MAX_RATING_LEVELS ? 'Remove levels to add another'
          : options.length === MAX_RATING_LEVELS ? `Maximum of ${MAX_RATING_LEVELS} levels` : '＋ Add level'} subtle
          disabled={busy || sorting || options.length >= MAX_RATING_LEVELS || options.some(o => !o.label.trim())} onPress={() => {
            animate(); clearRemovalHistory(); const id = randomUUID(); newOption.current = id; updateOptions(current => [...current, { id, label: '' }]);
          }} />
        {options.length > MAX_RATING_LEVELS && <Text style={[t.secondary, { color: c.textSecondary, marginTop: s.md }]}>
          Your existing levels are preserved. Remove levels to reach the current limit of {MAX_RATING_LEVELS}.
        </Text>}
      </ScrollView></GestureDetector></View>
      {showRemovalSnackbar && <UndoSnackbar onUndo={undoRemoval} />}
      <View style={styles.footer}>{limitNotice && !error && <Text accessibilityRole="alert" style={styles.limitNotice}>{limitNotice}</Text>}
        {error && !(atLimit && error === ACTIVE_TASK_LIMIT_MESSAGE) &&
        <Text accessibilityRole="alert" style={[t.secondary, { color: c.danger, marginBottom: s.sm }]}>{error}</Text>}
        <Button testID="save-activity-button" label={busy ? 'Saving…' : task ? 'Save Changes' : 'Create'}
          onPress={() => void save()} disabled={busy || sorting || (!task && (loading || atLimit))} /></View>
    </KeyboardAvoidingView>
  </SafeAreaView></GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background }, topbar: { paddingHorizontal: s.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  back: { minHeight: 44, minWidth: 76, justifyContent: 'center' }, content: { paddingHorizontal: s.xxl, paddingTop: s.xl, paddingBottom: s.xxxl },
  label: { ...t.button, color: c.textPrimary },
  fieldHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: s.xxl, marginBottom: s.md },
  characterCount: { ...t.caption, color: c.textSecondary },
  limitNotice: { ...t.caption, color: c.textSecondary, marginBottom: s.sm },
  limitMessage: { ...t.secondary, color: c.textSecondary, marginBottom: s.lg },
  nameInput: { ...t.body, color: c.textPrimary, backgroundColor: c.surface, minHeight: 56, borderWidth: 1, borderColor: c.borderStrong, borderRadius: r.md, padding: s.lg },
  levelHeading: { color: c.textPrimary, marginTop: s.xxxl },
  templatePrompt: { ...t.secondary, color: c.textSecondary, marginTop: s.sm, marginBottom: s.md },
  templateChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: s.sm },
  templateChoice: { width: '48%', flexGrow: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: s.sm, paddingVertical: s.sm, borderWidth: 1, borderColor: c.borderStrong,
    borderRadius: r.md, backgroundColor: c.surface },
  templateChoiceSelected: { backgroundColor: c.selected, borderColor: c.selected },
  templateChoiceText: { ...t.secondary, color: c.textPrimary, fontWeight: '600', textAlign: 'center' },
  templateSummary: { ...t.caption, color: c.textSecondary, textAlign: 'center', marginTop: 2 },
  templateChoiceTextSelected: { color: c.selectedText },
  orderLabel: { flexDirection: 'row', justifyContent: 'space-between', marginTop: s.xl, marginBottom: s.md }, orderText: { ...t.secondary, color: c.textSecondary },
  footer: { paddingHorizontal: s.xxl, paddingVertical: s.md, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.background },
});
