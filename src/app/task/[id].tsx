import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { useTasks } from '../../state/TasksProvider';
import { TaskForm } from '../../components/TaskForm';
import { Button, Loading } from '../../components/ui';
export default function EditTask() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { data, loading } = useTasks(); const router = useRouter();
  if (loading) return <Loading />;
  const task = data.tasks.find(t => t.id === id);
  if (!task) return <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 24 }}><Text>Not found.</Text><Button label="Back home" onPress={() => router.replace('/')} /></SafeAreaView>;
  return <TaskForm key={task.id} task={task} />;
}
