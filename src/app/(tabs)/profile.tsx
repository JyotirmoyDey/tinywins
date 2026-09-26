import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MenuView } from '@expo/ui/community/menu';
import Svg, { Path } from 'react-native-svg';
import { useTasks } from '../../state/TasksProvider';
import { setDevInsightsSource, useDevInsightsSource } from '../../analytics/devDataSource';
import { colors as c, spacing as s, typography as t } from '../../theme';
export default function Profile() {
  const router = useRouter();
  const { data, clearLocalData, loadOneYearTestData } = useTasks();
  const insightsSource = useDevInsightsSource();
  const resetPending = useRef(false);
  const [resetting, setResetting] = useState(false);
  const importPending = useRef(false);
  const [importing, setImporting] = useState(false);
  const archivedCount = data.tasks.filter(task => !task.active).length;
  const reset = async () => {
    if (resetPending.current) return;
    resetPending.current = true; setResetting(true);
    try {
      await clearLocalData();
      setDevInsightsSource('my');
      Alert.alert('Local data cleared', 'Your tasks and recordings have been removed from this device.');
    } catch {
      Alert.alert('Could not finish clearing data', 'Please try again. Some local data may remain.');
    } finally { resetPending.current = false; setResetting(false); }
  };
  const confirmReset = () => Alert.alert('Delete all local TinyWins data?',
    'This permanently removes your tasks, rating choices, recordings, and archived activities from this device.',
    [{ text: 'Cancel', style: 'cancel' },
      { text: 'Delete data', style: 'destructive', onPress: () => void reset() }]);
  const importTestData = async () => {
    if (importPending.current) return;
    importPending.current = true; setImporting(true);
    try {
      await loadOneYearTestData();
      setDevInsightsSource('my');
      Alert.alert('Test data ready', 'Eight activities and their recordings are now stored in My Data.');
    } catch {
      Alert.alert('Could not load test data', 'Your previous local records were kept. Please try again.');
    } finally { importPending.current = false; setImporting(false); }
  };
  const confirmImport = () => Alert.alert('Use one-year test data?',
    'This replaces all local tasks and recordings on this device with the eight activities in the test file.',
    [{ text: 'Cancel', style: 'cancel' },
      { text: 'Load test data', onPress: () => void importTestData() }]);
  return <SafeAreaView style={styles.screen} edges={['top']}>
    <View style={styles.content}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.description}>Your tasks and check-ins are saved on this device.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Archived Activities, ${archivedCount}`} onPress={() => router.push('/archived')}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}>
        <View style={styles.rowLeading}>
          <Svg width={21} height={21} viewBox="0 0 24 24" accessible={false}>
            <Path d="M3.5 5h17v4h-17zM5 9v10h14V9M10 13h4" fill="none" stroke={c.textPrimary}
              strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
          <Text style={styles.rowTitle}>Archived Activities</Text>
        </View>
        <Text style={styles.rowDetail}>{archivedCount}  ›</Text>
      </Pressable>
      {__DEV__ && <MenuView actions={[
        { id: 'my', title: 'My Data', state: insightsSource === 'my' ? 'on' : 'off' },
        { id: 'demo', title: 'Demo Data', state: insightsSource === 'demo' ? 'on' : 'off' },
      ]} onPressAction={event => { if (event.nativeEvent.event === 'my' || event.nativeEvent.event === 'demo') setDevInsightsSource(event.nativeEvent.event); }}>
        <View accessible accessibilityRole="button" accessibilityLabel={`Development insights data source, ${insightsSource === 'my' ? 'My Data' : 'Demo Data'}`} style={styles.row}>
          <Text style={styles.rowTitle}>Development · Insights data</Text>
          <Text style={styles.rowDetail}>{insightsSource === 'my' ? 'My Data' : 'Demo Data'}  ›</Text>
        </View>
      </MenuView>}
      {__DEV__ && <Pressable accessibilityRole="button" accessibilityLabel="Load one-year test data into My Data"
        accessibilityState={{ disabled: importing || resetting }} disabled={importing || resetting}
        onPress={confirmImport} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Text style={styles.rowTitle}>{importing ? 'Loading test data…' : 'Load one-year test data'}</Text>
      </Pressable>}
      {__DEV__ && <Pressable accessibilityRole="button" accessibilityLabel="Delete all local TinyWins data"
        accessibilityState={{ disabled: resetting || importing }} disabled={resetting || importing} onPress={confirmReset}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Text style={styles.deleteLabel}>{resetting ? 'Clearing local data…' : 'Delete local data'}</Text>
      </Pressable>}
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: s.xl, paddingTop: s.lg, gap: s.md },
  title: { ...t.screenTitle, color: c.textPrimary },
  description: { ...t.body, color: c.textSecondary, marginBottom: s.md },
  row: { minHeight: 58, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: s.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeading: { flexDirection: 'row', alignItems: 'center', gap: s.sm, flexShrink: 1 },
  rowTitle: { ...t.body, color: c.textPrimary }, rowDetail: { ...t.secondary, color: c.textSecondary },
  deleteLabel: { ...t.body, color: c.danger },
  pressed: { opacity: 0.65 },
});
