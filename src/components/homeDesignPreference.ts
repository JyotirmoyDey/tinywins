export type HomeDesign = 'classic' | 'slider';
export const HOME_DESIGN_KEY = 'tinywins.homeDesignComparison.v1';
interface PreferenceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}
export async function readHomeDesign(storage: PreferenceStorage): Promise<HomeDesign> {
  return (await storage.getItem(HOME_DESIGN_KEY)) === 'slider' ? 'slider' : 'classic';
}
export async function writeHomeDesign(storage: PreferenceStorage, design: HomeDesign): Promise<void> {
  await storage.setItem(HOME_DESIGN_KEY, design);
}
