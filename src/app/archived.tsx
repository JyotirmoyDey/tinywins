import { useCallback } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTasks } from '../state/TasksProvider';
import { Button, Loading, ScreenHeader } from '../components/ui';
import { colors as c, spacing as s, typography as t, radii as r } from '../theme';
export default function ArchivedTasks() {
  const { data, loading, reload, mutate } = useTasks(); const router = useRouter();
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const restore = async (id: string) => {
    try { await mutate(repo => repo.restore(id)); }
    catch { Alert.alert('Could not restore task', 'Please try again.'); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.background, paddingHorizontal: s.xxl }}>
    <Button label="‹ Home" subtle onPress={() => router.back()} />
    <ScreenHeader title="Archived tasks" subtitle="Your past check-ins stay here." />
    {loading ? <Loading /> : <FlatList style={{ backgroundColor: c.surface, borderRadius: r.lg, borderWidth: 1, borderColor: c.border }} data={data.tasks.filter(task => !task.active)} keyExtractor={task => task.id}
      ListEmptyComponent={<Text style={[t.body, { color: c.textSecondary }]}>No archived tasks.</Text>}
      renderItem={({ item }) => <View style={{ backgroundColor: c.surface, padding: s.lg, borderBottomWidth: 1, borderColor: c.border, gap: s.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}, activity history`} onPress={() => router.push(`/history/${item.id}`)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[t.taskTitle, { color: c.textPrimary }]}>{item.name}</Text></Pressable>
        <Button label="Restore task" subtle onPress={() => void restore(item.id)} />
      </View>} />}
  </SafeAreaView>;
}
