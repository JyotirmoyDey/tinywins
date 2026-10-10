import { TaskForm } from '../../components/TaskForm';
import { useLocalSearchParams } from 'expo-router';
export default function NewTask() {
  const { example } = useLocalSearchParams<{ example?: string }>();
  return <TaskForm key={typeof example === 'string' ? example : 'blank'} exampleId={typeof example === 'string' ? example : undefined} />;
}
