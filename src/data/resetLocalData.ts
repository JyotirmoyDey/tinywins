import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRepositories } from './runtime';
import { clearLocalRecords } from './localDataReset';

/** Development-only user action. Never runs on startup or during migrations. */
export async function resetLocalData() {
  const repos = await getRepositories();
  await clearLocalRecords(repos.tasks, AsyncStorage);
}
