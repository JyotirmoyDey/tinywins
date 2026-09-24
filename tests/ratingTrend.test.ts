import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './sqlite';
import { getAnalyticsDataset } from '../src/analytics/service';
import { getRatingTrend, ratingTrendConfig } from '../src/analytics/ratingTrend';
import { getInsightsPeriod } from '../src/analytics/insightsDateRange';
import { loadDemoDataset } from '../src/analytics/demoData';

const period = { startDate: '2026-09-15', endDate: '2026-09-24' };
async function chart(db: Awaited<ReturnType<typeof setup>>, taskId: string, range = period) {
  const task = (await db.tasks.getById(taskId))!;
  const dataset = getAnalyticsDataset([task], await db.entries.getAll(), await db.tasks.getScaleVersions());
  return getRatingTrend({ task: dataset.tasks[0], entries: dataset.entries, versions: dataset.scaleVersions, period: range });
}
function optionDraft(labels: string[]) {
  return labels.map((label, index) => ({ id: `rating-${index}`, label }));
}

test('categorical trend supports 2, 3, 4, 5 and 7 user-ordered levels without scores', async () => {
  for (const count of [2, 3, 4, 5, 7]) {
    const db = await setup();
    const labels = Array.from({ length: count }, (_, index) => `Custom ${index + 1}`);
    const task = await db.tasks.create({ name: 'Custom', options: optionDraft(labels) });
    await db.entries.upsert(task.id, '2026-09-20', task.options[count - 1].id);
    const result = await chart(db, task.id);
    assert.deepEqual(result.levels.map(level => level.label), labels);
    assert.equal(result.observations[0].levelIndex, count - 1);
    assert.equal(result.observations[0].labelAtEntry, labels[count - 1]);
    db.native.close();
  }
});

test('missing days break line; isolated recorded lowest remains an observation', async () => {
  const db = await setup();
  const task = await db.tasks.create({ name: 'Study', options: optionDraft(['Low', 'Medium', 'High']) });
  await db.entries.upsert(task.id, '2026-09-20', task.options[0].id);
  await db.entries.upsert(task.id, '2026-09-21', task.options[1].id);
  await db.entries.upsert(task.id, '2026-09-23', task.options[2].id);
  const result = await chart(db, task.id);
  assert.deepEqual(result.observations.map(item => item.connectsToPrevious), [false, true, false]);
  assert.equal(result.observations[0].levelIndex, 0);
  assert.ok(result.dates.includes('2026-09-22'));
  assert.ok(!result.observations.some(item => item.date === '2026-09-22'));
  db.native.close();
});

test('adding levels at beginning, middle and end preserves identities, changes scale version and breaks line', async () => {
  for (const insertAt of [0, 1, 3]) {
    const db = await setup();
    const task = await db.tasks.create({ name: 'Practice', options: optionDraft(['Low', 'Medium', 'High']) });
    const before = await db.entries.upsert(task.id, '2026-09-20', task.options[1].id);
    const edited = task.options.map(({ id, label }) => ({ id, label }));
    edited.splice(insertAt, 0, { id: `added-${insertAt}`, label: `Added ${insertAt}` });
    const updated = await db.tasks.update(task.id, { name: task.name, options: edited });
    assert.equal(updated.currentTrendEpochId, task.currentTrendEpochId);
    assert.notEqual(updated.currentScaleVersionId, task.currentScaleVersionId);
    const after = await db.entries.upsert(task.id, '2026-09-21', task.options[1].id);
    const result = await chart(db, task.id);
    assert.equal(result.observations.length, 2);
    assert.equal(result.observations[1].connectsToPrevious, false);
    assert.equal(result.levels[result.observations[0].levelIndex].id, before.optionId);
    assert.equal(result.levels[result.observations[1].levelIndex].id, after.optionId);
    assert.equal((await db.entries.getForTaskAndDate(task.id, '2026-09-20'))?.normalizedWeightAtEntry, 50);
    db.native.close();
  }
});

test('archived recorded level remains on the axis in its original position', async () => {
  const db = await setup();
  const task = await db.tasks.create({ name: 'Guitar', options: optionDraft(['Skipped', 'Low', 'Medium', 'High']) });
  const saved = await db.entries.upsert(task.id, '2026-09-20', task.options[2].id);
  const updated = await db.tasks.update(task.id, { name: task.name, options: task.options.filter(option => option.id !== saved.optionId) });
  assert.equal(updated.currentTrendEpochId, task.currentTrendEpochId);
  const result = await chart(db, task.id);
  assert.deepEqual(result.levels.map(level => level.label), ['Skipped', 'Low', 'Medium', 'High']);
  assert.equal(result.levels[2].active, false);
  assert.equal(result.observations[0].labelAtEntry, 'Medium');
  assert.equal((await db.entries.getForTaskAndDate(task.id, '2026-09-20'))?.normalizedWeightAtEntry, 67);
  db.native.close();
});

test('cosmetic rename keeps epoch and historical tooltip label', async () => {
  const db = await setup();
  const task = await db.tasks.create({ name: 'Study', options: optionDraft(['Low', 'Good', 'High']) });
  await db.entries.upsert(task.id, '2026-09-20', task.options[1].id);
  const renamed = await db.tasks.update(task.id, { name: task.name, options: task.options.map(option => ({
    id: option.id, label: option.label === 'Good' ? 'Excellent' : option.label,
  })) });
  assert.equal(renamed.currentTrendEpochId, task.currentTrendEpochId);
  assert.equal(renamed.currentScaleVersionId, task.currentScaleVersionId);
  const result = await chart(db, task.id);
  assert.equal(result.levels[1].label, 'Excellent');
  assert.equal(result.observations[0].labelAtEntry, 'Good');
  db.native.close();
});

test('reorder requires confirmation, starts new epoch and preserves previous records; same-day explicit save adopts new epoch', async () => {
  const db = await setup();
  const task = await db.tasks.create({ name: 'Workout', options: optionDraft(['Skipped', 'Good', 'Poor', 'Average']) });
  const old = await db.entries.upsert(task.id, '2026-09-24', task.options[1].id);
  const reordered = { name: task.name, options: [task.options[0], task.options[2], task.options[1], task.options[3]] };
  assert.equal(await db.tasks.requiresTrendReset(task.id, reordered), true);
  await assert.rejects(db.tasks.update(task.id, reordered), /confirmation/);
  assert.deepEqual(await db.tasks.getById(task.id), task);
  const updated = await db.tasks.update(task.id, reordered, true);
  assert.notEqual(updated.currentTrendEpochId, task.currentTrendEpochId);
  const resetChart = await chart(db, task.id);
  assert.equal(resetChart.observations.length, 0);
  assert.equal(resetChart.isNewEpochEmpty, true);
  assert.equal((await db.entries.getForTaskAndDate(task.id, '2026-09-24'))?.id, old.id);
  const newEntry = await db.entries.upsert(task.id, '2026-09-24', task.options[1].id);
  assert.equal(newEntry.id, old.id);
  assert.equal(newEntry.trendEpochIdAtEntry, updated.currentTrendEpochId);
  assert.equal(newEntry.optionLabelAtEntry, 'Good');
  assert.equal(newEntry.positionAtEntry, 3);
  assert.equal((await chart(db, task.id)).observations.length, 1);
  db.native.close();
});

test('reorder before any recorded history does not require confirmation', async () => {
  const db = await setup();
  const task = await db.tasks.create({ name: 'No history', options: optionDraft(['Low', 'Mid', 'High']) });
  const draft = { name: task.name, options: [...task.options].reverse() };
  assert.equal(await db.tasks.requiresTrendReset(task.id, draft), false);
  const updated = await db.tasks.update(task.id, draft);
  assert.equal(updated.currentTrendEpochId, task.currentTrendEpochId);
  db.native.close();
});

test('demo uses unusual Workout order and all global date presets feed the same trend calculator', () => {
  const dataset = loadDemoDataset();
  const task = dataset.tasks.find(item => item.name === 'Workout')!;
  assert.deepEqual(task.options.map(option => option.label), ['Skipped', 'Good', 'Poor', 'Average']);
  for (const preset of ['1D', '7D', '30D', '90D'] as const) {
    const result = getRatingTrend({ task, entries: dataset.entries, versions: dataset.scaleVersions,
      period: getInsightsPeriod('2026-09-22', preset, { startDate: '2026-09-01', endDate: '2026-09-22' }) });
    assert.equal(result.dates.length, Number.parseInt(preset, 10));
    assert.ok(result.observations.every(item => item.levelIndex >= 0));
  }
  const custom = getRatingTrend({ task, entries: dataset.entries, versions: dataset.scaleVersions,
    period: { startDate: '2026-07-01', endDate: '2026-07-31' } });
  assert.equal(custom.dates.length, 31);
  assert.ok(custom.observations.length > 0);
  assert.equal(ratingTrendConfig.displayOrder, 1);
});

test('v2 SQLite migration backfills identities without rewriting saved rating snapshots', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'tinywins-trend-migrate-'));
  const path = join(dir, 'old.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, active INTEGER NOT NULL);
      CREATE TABLE task_options (id TEXT PRIMARY KEY, taskId TEXT NOT NULL, label TEXT NOT NULL, position INTEGER NOT NULL, rank INTEGER NOT NULL, normalizedWeight INTEGER NOT NULL, active INTEGER NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE daily_entries (id TEXT PRIMARY KEY, taskId TEXT NOT NULL, optionId TEXT NOT NULL, localDate TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, optionLabelAtEntry TEXT NOT NULL, positionAtEntry INTEGER NOT NULL, rankAtEntry INTEGER NOT NULL, normalizedWeightAtEntry INTEGER NOT NULL, UNIQUE(taskId, localDate));
      INSERT INTO tasks VALUES ('t', 'Old task', '2026-08-01T12:00:00.000Z', '2026-09-20T12:00:00.000Z', 1);
      INSERT INTO task_options VALUES ('low', 't', 'Low', 1, 1, 0, 1, '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z');
      INSERT INTO task_options VALUES ('high', 't', 'High', 2, 2, 100, 1, '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z');
      INSERT INTO daily_entries VALUES ('e', 't', 'low', '2026-08-15', '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z', 'Original label', 1, 1, 0);
      PRAGMA user_version = 2;
    `);
    old.close();
    const db = await setup(path);
    const task = (await db.tasks.getById('t'))!;
    const saved = (await db.entries.getForTaskAndDate('t', '2026-08-15'))!;
    assert.equal(saved.optionLabelAtEntry, 'Original label');
    assert.equal(saved.normalizedWeightAtEntry, 0);
    assert.equal(saved.scaleVersionIdAtEntry, task.currentScaleVersionId);
    assert.equal(saved.trendEpochIdAtEntry, task.currentTrendEpochId);
    assert.equal((await db.tasks.getScaleVersions('t')).length, 1);
    db.native.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Rating Distribution remains separated by immutable scale versions after adding a level', async () => {
  const { getRatingDistribution, getRatingScaleVersions } = await import('../src/analytics/ratingDistribution');
  const db = await setup();
  const task = await db.tasks.create({ name: 'Reading', options: optionDraft(['Short', 'Good', 'Great']) });
  await db.entries.upsert(task.id, '2026-09-20', task.options[1].id);
  const updated = await db.tasks.update(task.id, { name: task.name, options: [...task.options, { id: 'extra', label: 'Excellent' }] });
  await db.entries.upsert(task.id, '2026-09-21', task.options[1].id);
  const dataset = getAnalyticsDataset([updated], await db.entries.getAll(), await db.tasks.getScaleVersions());
  const versions = getRatingScaleVersions(dataset.tasks[0], dataset.entries, dataset.scaleVersions);
  assert.deepEqual(versions, ['current', task.currentScaleVersionId]);
  const current = getRatingDistribution(dataset.tasks[0], dataset.entries, period, 'current', dataset.scaleVersions);
  const previous = getRatingDistribution(dataset.tasks[0], dataset.entries, period, task.currentScaleVersionId, dataset.scaleVersions);
  assert.equal(current.reduce((sum, row) => sum + row.count, 0), 1);
  assert.equal(previous.reduce((sum, row) => sum + row.count, 0), 1);
  assert.deepEqual(previous.map(row => row.label), ['Short', 'Good', 'Great']);
  db.native.close();
});

test('database rejects entries without a valid persisted scale and epoch identity', async () => {
  const db = await setup();
  const task = await db.tasks.create({ name: 'Guarded', options: optionDraft(['Low', 'High']) });
  await assert.rejects(db.db.runAsync(`INSERT INTO daily_entries
    (id, taskId, optionId, localDate, createdAt, updatedAt, optionLabelAtEntry,
      positionAtEntry, rankAtEntry, normalizedWeightAtEntry, scaleVersionIdAtEntry, trendEpochIdAtEntry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'invalid-entry', task.id, task.options[0].id, '2026-09-20', 'now', 'now', 'Low', 1, 1, 0, 'unknown-scale', 'unknown-epoch'),
  /Invalid historical rating-scale identity/);
  db.native.close();
});
