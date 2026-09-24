import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_DESIGN_KEY, readHomeDesign, writeHomeDesign } from '../src/components/homeDesignPreference';

test('Home comparison defaults to Classic and restores Slider after a restart', async () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => saved.get(key) ?? null,
    setItem: async (key: string, value: string) => { saved.set(key, value); },
  };
  assert.equal(await readHomeDesign(storage), 'classic');
  await writeHomeDesign(storage, 'slider');
  assert.equal(saved.get(HOME_DESIGN_KEY), 'slider');
  assert.equal(await readHomeDesign(storage), 'slider');
  await writeHomeDesign(storage, 'classic');
  assert.equal(await readHomeDesign(storage), 'classic');
  saved.set(HOME_DESIGN_KEY, 'unexpected');
  assert.equal(await readHomeDesign(storage), 'classic');
});
