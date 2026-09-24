import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MenuView } from '@expo/ui/community/menu';
import { useTasks } from '../../state/TasksProvider';
import { setDevInsightsSource, useDevInsightsSource } from '../../analytics/devDataSource';
import { colors as c, spacing as s, typography as t } from '../../theme';
export default function Profile() {
  const router = useRouter();
  const { data } = useTasks();
  const insightsSource = useDevInsightsSource();
  const archivedCount = data.tasks.filter(task => !task.active).length;
  return <SafeAreaView style={styles.screen} edges={['top']}>
    <View style={styles.content}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.description}>Your tasks and check-ins are saved on this device.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Archived tasks, ${archivedCount}`} onPress={() => router.push('/archived')}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}>
        <Text style={styles.rowTitle}>Archived tasks</Text>
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
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: s.xl, paddingTop: s.lg, gap: s.md },
  title: { ...t.screenTitle, color: c.textPrimary },
  description: { ...t.body, color: c.textSecondary, marginBottom: s.md },
  row: { minHeight: 58, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: s.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { ...t.body, color: c.textPrimary }, rowDetail: { ...t.secondary, color: c.textSecondary },
});
