import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, draft } from './sqlite';
import { clearLocalRecords, LEGACY_DATABASE_KEY } from '../src/data/localDataReset';
import { HOME_DESIGN_KEY } from '../src/components/homeDesignPreference';
import { EntryStore } from '../src/state/EntryStore';

test('local reset removes active and archived tasks with all dependent history', async () => {
  const db = await setup();
  try {
    db.native.prepare("INSERT INTO app_metadata(key, value) VALUES ('legacyImported', '1')").run();
    const active = await db.tasks.create(draft('Study'));
    const archived = await db.tasks.create(draft('Guitar'));
    await db.entries.upsert(active.id, '2026-09-20', active.options[0].id);
    await db.entries.upsert(archived.id, '2026-09-20', archived.options[1].id);
    await db.tasks.archive(archived.id);
    const storage = new Map([[LEGACY_DATABASE_KEY, 'old backup'], [HOME_DESIGN_KEY, 'slider']]);
    await clearLocalRecords(db.tasks, { removeItem: async key => { storage.delete(key); } });
    for (const table of ['tasks', 'task_options', 'daily_entries',
      'rating_scale_versions', 'task_lifecycle_transitions']) {
      assert.equal((db.native.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count, 0);
    }
    assert.equal(storage.size, 0);
    assert.equal((db.native.prepare("SELECT value FROM app_metadata WHERE key = 'legacyImported'").get() as
      { value: string }).value, '1');
    assert.deepEqual(await db.tasks.getAll(), []);
    await db.tasks.create(draft('New test data'));
    assert.equal((await db.tasks.getAll()).length, 1);
  } finally { db.native.close(); }
});

test('reset clears cached selections and notifies subscribers', () => {
  const store = new EntryStore();
  const entry = { id: 'entry', taskId: 'task', optionId: 'choice', localDate: '2026-09-20',
    createdAt: '', updatedAt: '', optionLabelAtEntry: 'Low', positionAtEntry: 1,
    rankAtEntry: 1, normalizedWeightAtEntry: 0, scaleVersionIdAtEntry: 'scale',
    trendEpochIdAtEntry: 'epoch' };
  store.hydrateDate(entry.localDate, [entry]);
  let notifications = 0;
  const unsubscribe = store.subscribe(entry.taskId, entry.localDate, () => { notifications++; });
  store.clear();
  assert.equal(store.get(entry.taskId, entry.localDate), undefined);
  assert.equal(notifications, 1);
  unsubscribe();
});
