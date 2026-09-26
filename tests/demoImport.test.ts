import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, draft } from './sqlite';
import { loadDemoDataset } from '../src/analytics/demoData';
import { DemoImportService } from '../src/data/demoImport';
import { getAnalyticsDataset } from '../src/analytics/service';
import { getRatingTrend } from '../src/analytics/ratingTrend';

test('one-year fixture replaces old active and archived records as ordinary SQLite user data', async () => {
  const db = await setup();
  try {
    const oldActive = await db.tasks.create(draft('Old active'));
    const oldArchived = await db.tasks.create(draft('Old archived'));
    await db.entries.upsert(oldArchived.id, '2026-09-20', oldArchived.options[0].id);
    await db.tasks.archive(oldArchived.id);
    const fixture = loadDemoDataset();
    const importer = new DemoImportService(db.connection);
    await importer.replaceLocalData(fixture);
    const tasks = await db.tasks.getAll();
    assert.equal(tasks.length, 8);
    assert.ok(tasks.every(task => task.active));
    assert.equal(tasks.find(task => task.id === 'workout')?.options[2].label, 'Poor');
    assert.equal(await db.tasks.getById(oldActive.id), undefined);
    assert.equal(await db.tasks.getById(oldArchived.id), undefined);
    assert.equal((await db.entries.getAll()).length, 2245);
    assert.deepEqual(await db.tasks.getLifecycleTransitions(), []);
    assert.deepEqual(db.native.prepare('PRAGMA foreign_key_check').all(), []);
    const sample = fixture.entries.find(entry => entry.taskId === 'workout')!;
    const saved = await db.entries.getForTaskAndDate(sample.taskId, sample.localDate);
    assert.equal(saved?.id, sample.id);
    assert.equal(saved?.optionLabelAtEntry, sample.optionLabelAtEntry);
    assert.equal(saved?.normalizedWeightAtEntry, sample.normalizedWeightAtEntry);
    const myData = getAnalyticsDataset(tasks, await db.entries.getAll(),
      await db.tasks.getScaleVersions(), await db.tasks.getLifecycleTransitions());
    const trend = getRatingTrend({ task: myData.tasks.find(task => task.id === 'workout')!,
      entries: myData.entries, versions: myData.scaleVersions,
      period: { startDate: '2026-09-20', endDate: '2026-09-26' } });
    assert.ok(trend.observations.length > 0);
    await db.tasks.archive('workout');
    assert.equal((await db.tasks.getById('workout'))?.active, false);
    assert.equal((await db.entries.getForTaskAndDate(sample.taskId, sample.localDate))?.id, sample.id);
    await db.tasks.restore('workout');
    assert.equal((await db.tasks.getById('workout'))?.active, true);
    await importer.replaceLocalData(fixture);
    assert.equal((await db.entries.getAll()).length, 2245);
  } finally { db.native.close(); }
});

test('invalid or interrupted fixture import leaves existing local records intact', async () => {
  const db = await setup();
  try {
    const original = await db.tasks.create(draft('Keep me'));
    const fixture = loadDemoDataset();
    const importer = new DemoImportService(db.connection);
    assert.throws(() => importer.replaceLocalData({ ...fixture,
      entries: [...fixture.entries, fixture.entries[0]] }), /invalid recording/);
    assert.ok(await db.tasks.getById(original.id));
    db.native.exec(`CREATE TRIGGER deny_import BEFORE INSERT ON daily_entries
      BEGIN SELECT RAISE(ABORT, 'simulated import failure'); END;`);
    await assert.rejects(importer.replaceLocalData(fixture), /simulated import failure/);
    assert.deepEqual((await db.tasks.getAll()).map(task => task.id), [original.id]);
  } finally { db.native.close(); }
});
