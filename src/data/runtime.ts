import AsyncStorage from '@react-native-async-storage/async-storage';
import { openDatabaseAsync } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { Connection } from './connection';
import { migrate } from './migrations';
import { importLegacy } from './legacyImport';
import { TaskRepository } from './repository';
import { DailyEntryRepository } from './dailyEntryRepository';
let runtime: Promise<{ tasks: TaskRepository; entries: DailyEntryRepository }> | undefined;
export function getRepositories() {
  if (!runtime) runtime = initialize().catch(error => { runtime = undefined; throw error; });
  return runtime;
}
async function initialize() {
  const database = await openDatabaseAsync('tinywins.sqlite');
  try {
    const connection = new Connection(database);
    await migrate(connection);
    const imported = await connection.run(db => db.getFirstAsync('SELECT value FROM app_metadata WHERE key = ?', 'legacyImported'));
    if (!imported) await importLegacy(connection, await AsyncStorage.getItem('tinywins.database.v1'),
      __DEV__ && process.env.EXPO_PUBLIC_SEED_DEMO === 'true', randomUUID);
    return { tasks: new TaskRepository(connection, randomUUID), entries: new DailyEntryRepository(connection, randomUUID) };
  } catch (error) { await database.closeAsync(); throw error; }
}
