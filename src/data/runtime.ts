import AsyncStorage from '@react-native-async-storage/async-storage';
import { openDatabaseAsync } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { Connection } from './connection';
import { migrate } from './migrations';
import { importLegacy } from './legacyImport';
import { TaskRepository } from './repository';
import { DailyEntryRepository } from './dailyEntryRepository';
import { DemoImportService } from './demoImport';
import { LEGACY_DATABASE_KEY } from './localDataReset';
let runtime: Promise<{ tasks: TaskRepository; entries: DailyEntryRepository;
  demoImporter: DemoImportService }> | undefined;
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
    return { tasks: new TaskRepository(connection, randomUUID),
      entries: new DailyEntryRepository(connection, randomUUID),
      demoImporter: new DemoImportService(connection) };
  } catch (error) { await database.closeAsync(); throw error; }
}

export async function replaceLocalWithOneYearTestData() {
  if (!__DEV__) throw new Error('Test data import is available only in development.');
  const { loadDemoDataset } = await import('../analytics/demoData');
  const dataset = loadDemoDataset();
  const repos = await getRepositories();
  await AsyncStorage.removeItem(LEGACY_DATABASE_KEY);
  await repos.demoImporter.replaceLocalData(dataset);
}
