import { HOME_DESIGN_KEY } from '../components/homeDesignPreference';

export const LEGACY_DATABASE_KEY = 'tinywins.database.v1';

type ResetRepository = { deleteAllLocalData(): Promise<unknown> };
type ResetStorage = { removeItem(key: string): Promise<unknown> };

export async function clearLocalRecords(repository: ResetRepository, storage: ResetStorage) {
  await repository.deleteAllLocalData();
  // Keep SQLite's legacyImported marker. Remove the old backup so a later
  // installation cannot bring these deleted records back.
  await storage.removeItem(LEGACY_DATABASE_KEY);
  await storage.removeItem(HOME_DESIGN_KEY);
}
