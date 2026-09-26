import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect } from 'expo-router';
import { Button, Loading } from '../../components/ui';
import { TaskCard } from '../../components/TaskCard';
import { TaskSliderCard } from '../../components/TaskSliderCard';
import { HomeDesign, useHomeDesign } from '../../components/useHomeDesign';
import { useTasks } from '../../state/TasksProvider';
import { colors as c, spacing as s, typography as t } from '../../theme';

export default function Home() {
  const router = useRouter(); const { data, today, loading, error, notice, reload } = useTasks();
  const { design, ready: designReady, choose } = useHomeDesign();
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const tasks = useMemo(() => data.tasks.filter(task => task.active), [data.tasks]);
  const add = () => router.push('/task/new');
  const formattedDate = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  return <GestureHandlerRootView style={styles.root}><SafeAreaView style={styles.screen} edges={['top']}>
    <View style={styles.header}>
      <View style={styles.headerText}><Text style={styles.title}>TinyWins</Text><Text style={styles.date}>{formattedDate}</Text></View>
    </View>
    {notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    {__DEV__ && designReady && <View style={styles.designControl} accessibilityLabel="Home design comparison">{(['classic','slider'] as HomeDesign[]).map(choice => <Pressable key={choice} accessibilityRole="button" accessibilityState={{ selected: design === choice }} accessibilityLabel={`${choice === 'classic' ? 'Classic' : 'Slider'} Home design`} onPress={() => choose(choice)} style={[styles.designChoice, design === choice && styles.designSelected]}><Text style={[styles.designText, design === choice && styles.designTextSelected]}>{choice === 'classic' ? 'Classic' : 'Slider'}</Text></Pressable>)}</View>}
    {loading || !designReady ? <Loading /> : error ? <View style={styles.message}><Text style={[t.body, { color: c.textPrimary }]}>{error}</Text><Button label="Try again" onPress={() => void reload()} /></View>
      : !tasks.length ? <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing here yet.</Text>
          <Text style={styles.emptyBody}>{"Start by adding something you'd like to track."}</Text>
          <Button label="Add New" onPress={add} />
        </View>
        : <FlatList data={tasks} keyExtractor={item => item.id} renderItem={({ item }) => design === 'slider' ? <TaskSliderCard task={item} date={today} /> : <TaskCard task={item} date={today} />} extraData={design}
          contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" />}
    {data.tasks.some(task => !task.active) && !loading && designReady && <View style={styles.archived}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/archived')} style={styles.archivedAction}>
        <Text style={styles.archivedText}>Archived</Text>
      </Pressable>
    </View>}
  </SafeAreaView></GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, screen: { flex: 1, backgroundColor: c.background },
  designControl: { alignSelf: 'center', flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, marginBottom: s.sm },
  notice: { ...t.secondary, color: c.textSecondary, paddingHorizontal: s.xl, paddingBottom: s.sm },
  designChoice: { minWidth: 90, minHeight: 44, paddingHorizontal: s.md, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  designSelected: { backgroundColor: c.selected },
  designText: { ...t.caption, color: c.textSecondary }, designTextSelected: { color: c.selectedText },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: s.xl, paddingTop: s.sm, paddingBottom: s.md },
  headerText: { flex: 1 }, title: { fontSize: 27, lineHeight: 31, letterSpacing: -0.6, fontWeight: '700', color: c.textPrimary },
  date: { ...t.secondary, color: c.textSecondary, marginTop: 2 },
  list: { paddingHorizontal: s.xl, paddingTop: s.xs, paddingBottom: s.xxl },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: s.xxxl, paddingBottom: s.huge, gap: s.md },
  emptyTitle: { ...t.sectionTitle, color: c.textPrimary, textAlign: 'center' },
  emptyBody: { ...t.body, color: c.textSecondary, textAlign: 'center', marginBottom: s.sm },
  message: { flex: 1, justifyContent: 'center', padding: s.xxl, gap: s.lg },
  archived: { paddingHorizontal: s.xl, paddingBottom: s.sm, alignItems: 'center' },
  archivedAction: { minHeight: 44, paddingHorizontal: s.lg, justifyContent: 'center' },
  archivedText: { ...t.secondary, color: c.textSecondary },
});
