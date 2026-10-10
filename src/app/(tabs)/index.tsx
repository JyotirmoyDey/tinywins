import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect } from 'expo-router';
import { Button, Loading } from '../../components/ui';
import { TaskSliderCard } from '../../components/TaskSliderCard';
import { useTasks } from '../../state/TasksProvider';
import { colors as c, spacing as s, typography as t } from '../../theme';
import { MAX_COMBINED_INSIGHTS_ITEMS } from '../../config/combinedInsights';
import { firstActivityExamples } from '../../config/firstActivityExamples';
import { FirstActivityIcon } from '../../components/FirstActivityIcon';

export default function Home() {
  const router = useRouter(); const { data, today, loading, error, notice, reload } = useTasks();
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const tasks = useMemo(() => data.tasks.filter(task => task.active), [data.tasks]);
  const selectedCount = tasks.filter(task => task.includeInCombinedInsights).length;
  const add = () => router.push('/task/new');
  const formattedDate = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  return <GestureHandlerRootView style={styles.root}><SafeAreaView style={styles.screen} edges={['top']}>
    <View style={styles.header}>
      <View style={styles.headerText}><Text testID="home-screen" style={styles.title}>TinyWins</Text><Text style={styles.date}>{formattedDate}</Text></View>
    </View>
    {notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    {loading ? <Loading /> : error ? <View style={styles.message}><Text style={[t.body, { color: c.textPrimary }]}>{error}</Text><Button label="Try again" onPress={() => void reload()} /></View>
      : data.tasks.length === 0 ? <ScrollView style={styles.firstTimeScroll} contentContainerStyle={styles.firstTimeContent}>
          <Text style={styles.firstTimeTitle}>Little things, worth noticing.</Text>
          <Text style={styles.firstTimeBody}>Pick something that matters to you. Record how your days go, and discover your patterns over time.</Text>
          <Text style={styles.examplesLabel}>Need a little inspiration?</Text>
          <View style={styles.examples}>
            {firstActivityExamples.map(example => <Pressable key={example.id} testID={`activity-example-${example.id}`}
              accessibilityRole="button" accessibilityLabel={`Use ${example.name} example`}
              accessibilityHint="Opens an editable activity with suggested levels"
              onPress={() => router.push({ pathname: '/task/new', params: { example: example.id } })}
              style={({ pressed }) => [styles.example, pressed && styles.examplePressed]}>
              <FirstActivityIcon exampleId={example.id} />
              <Text style={styles.exampleName}>{example.name}</Text>
            </Pressable>)}
          </View>
          <Button testID="create-my-own-activity" label="Create something of my own" onPress={add} />
        </ScrollView>
      : !tasks.length ? <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing here yet.</Text>
          <Text style={styles.emptyBody}>{"Start by adding something you'd like to track."}</Text>
          <Button label="Add New" onPress={add} />
        </View>
        : <><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>What I&apos;m Tracking</Text>
          <Text style={styles.insightsCount}>{selectedCount} of {MAX_COMBINED_INSIGHTS_ITEMS} in Insights</Text></View>
          <FlatList data={tasks} keyExtractor={item => `${today}:${item.id}`} renderItem={({ item }) => <TaskSliderCard task={item} date={today} />}
            contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" /></>}
    {data.tasks.some(task => !task.active) && !loading && <View style={styles.archived}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/archived')} style={styles.archivedAction}>
        <Text style={styles.archivedText}>Archived</Text>
      </Pressable>
    </View>}
  </SafeAreaView></GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, screen: { flex: 1, backgroundColor: c.background },
  notice: { ...t.secondary, color: c.textSecondary, paddingHorizontal: s.xl, paddingBottom: s.sm },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: s.xl, paddingTop: s.sm, paddingBottom: s.md },
  headerText: { flex: 1 }, title: { fontSize: 27, lineHeight: 31, letterSpacing: -0.6, fontWeight: '700', color: c.textPrimary },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: s.sm,
    paddingHorizontal: s.xl, paddingBottom: s.xs },
  sectionTitle: { ...t.secondary, color: c.textPrimary, fontWeight: '600', flexShrink: 1 },
  insightsCount: { ...t.caption, color: c.textSecondary, flexShrink: 0 },
  date: { ...t.secondary, color: c.textSecondary, marginTop: 2 },
  list: { paddingHorizontal: s.xl, paddingTop: s.xs, paddingBottom: s.xxl },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: s.xxxl, paddingBottom: s.huge, gap: s.md },
  emptyTitle: { ...t.sectionTitle, color: c.textPrimary, textAlign: 'center' },
  emptyBody: { ...t.body, color: c.textSecondary, textAlign: 'center', marginBottom: s.sm },
  firstTimeScroll: { flex: 1 },
  firstTimeContent: { flexGrow: 1, paddingHorizontal: s.xl,
    paddingTop: s.xxxl, paddingBottom: s.xxxl, gap: s.lg },
  firstTimeTitle: { ...t.screenTitle, color: c.textPrimary },
  firstTimeBody: { ...t.secondary, color: c.textSecondary, marginBottom: s.md },
  examplesLabel: { ...t.secondary, color: c.textPrimary, fontWeight: '600' },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: s.md, marginBottom: s.sm },
  example: { flexBasis: '45%', flexGrow: 1, minWidth: 0, minHeight: 88, borderRadius: 14, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.border, paddingHorizontal: s.md, paddingVertical: s.md,
    justifyContent: 'center', alignItems: 'flex-start', gap: s.xs },
  examplePressed: { opacity: 0.65 },
  exampleName: { ...t.secondary, color: c.textPrimary, fontWeight: '600', flexShrink: 1 },
  message: { flex: 1, justifyContent: 'center', padding: s.xxl, gap: s.lg },
  archived: { paddingHorizontal: s.xl, paddingBottom: s.sm, alignItems: 'center' },
  archivedAction: { minHeight: 44, paddingHorizontal: s.lg, justifyContent: 'center' },
  archivedText: { ...t.secondary, color: c.textSecondary },
});
