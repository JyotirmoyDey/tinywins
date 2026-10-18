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
  const dataset = getAnalyticsDataset([task], await db.entries.getAll());
  return getRatingTrend({ task: dataset.tasks[0], entries: dataset.entries, period: range });
}
function optionDraft(labels: string[]) {
  return labels.map((label, index) => ({ id: `rating-${index}`, label }));
}

test('categorical trend supports 2, 3, 4 and 5 newly configured user-ordered levels without scores', async () => {
  for (const count of [2, 3, 4, 5]) {
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

test('levels may be added before the first check-in and then become permanently locked', async () => {
  for (const insertAt of [0, 1, 3]) {
    const db = await setup();
    const task = await db.tasks.create({ name: 'Practice', options: optionDraft(['Low', 'Medium', 'High']) });
    const edited = task.options.map(({ id, label }) => ({ id, label }));
    edited.splice(insertAt, 0, { id: `added-${insertAt}`, label: `Added ${insertAt}` });
    const updated = await db.tasks.update(task.id, { name: task.name, options: edited });
    assert.equal(updated.levelsLocked, false);
    const after = await db.entries.upsert(task.id, '2026-09-21', task.options[1].id);
    const result = await chart(db, task.id);
    assert.equal(result.observations.length, 1);
    assert.equal(result.levels[result.observations[0].levelIndex].id, after.optionId);
    assert.equal((await db.tasks.getById(task.id))?.levelsLocked, true);
    db.native.close();
  }
});

test('deleting or reordering levels is blocked after recording, even after clearing the entry', async () => {
  const db = await setup();
  const task = await db.tasks.create({ name: 'Guitar', options: optionDraft(['Skipped', 'Low', 'Medium', 'High']) });
  const saved = await db.entries.upsert(task.id, '2026-09-20', task.options[2].id);
  await assert.rejects(db.tasks.update(task.id, { name: task.name,
    options: task.options.filter(option => option.id !== saved.optionId) }), /permanent/);
  await assert.rejects(db.tasks.update(task.id, { name: task.name,
    options: [...task.options].reverse() }), /permanent/);
  await db.entries.deleteEntry(task.id, '2026-09-20');
  await assert.rejects(db.tasks.update(task.id, { name: task.name,
    options: [...task.options, { id: 'extra', label: 'Extra' }] }), /permanent/);
  assert.equal((await db.tasks.getById(task.id))?.levelsLocked, true);
  assert.equal(saved.normalizedWeightAtEntry, 67);
  db.native.close();
});

test('cosmetic rename preserves historical tooltip label without version metadata', async () => {
  const db = await setup();
  const task = await db.tasks.create({ name: 'Study', options: optionDraft(['Low', 'Good', 'High']) });
  await db.entries.upsert(task.id, '2026-09-20', task.options[1].id);
  const renamed = await db.tasks.update(task.id, { name: task.name, options: task.options.map(option => ({
    id: option.id, label: option.label === 'Good' ? 'Excellent' : option.label,
  })) });
  const result = await chart(db, task.id);
  assert.equal(result.levels[1].label, 'Excellent');
  assert.equal(result.observations[0].labelAtEntry, 'Good');
  db.native.close();
});

test('reordering before recording is allowed and later structural edits stay locked', async () => {
  const db = await setup();
  const task = await db.tasks.create({ name: 'Workout', options: optionDraft(['Skipped', 'Good', 'Poor', 'Average']) });
  const reordered = { name: task.name, options: [task.options[0], task.options[2], task.options[1], task.options[3]] };
  const updated = await db.tasks.update(task.id, reordered);
  const newEntry = await db.entries.upsert(task.id, '2026-09-24', task.options[1].id);
  assert.equal(newEntry.positionAtEntry, 3);
  await assert.rejects(db.tasks.update(task.id, { name: task.name, options: task.options }), /permanent/);
  assert.equal((await chart(db, task.id)).observations.length, 1);
  db.native.close();
});

test('reorder before any recording preserves the configured order in the trend', async () => {
  const db = await setup();
  const task = await db.tasks.create({ name: 'No history', options: optionDraft(['Low', 'Mid', 'High']) });
  const draft = { name: task.name, options: [...task.options].reverse() };
  const updated = await db.tasks.update(task.id, draft);
  assert.deepEqual(updated.options.map(option => option.id), draft.options.map(option => option.id));
  db.native.close();
});

test('demo uses unusual Workout order and all global date presets feed the same trend calculator', () => {
  const dataset = loadDemoDataset();
  const task = dataset.tasks.find(item => item.name === 'Workout')!;
  assert.deepEqual(task.options.map(option => option.label), ['Skipped', 'Good', 'Poor', 'Average']);
  for (const preset of ['1D', '7D', '30D', '90D'] as const) {
    const result = getRatingTrend({ task, entries: dataset.entries,
      period: getInsightsPeriod('2026-09-22', preset, { startDate: '2026-09-01', endDate: '2026-09-22' }) });
    assert.equal(result.dates.length, Number.parseInt(preset, 10));
    assert.ok(result.observations.every(item => item.levelIndex >= 0));
  }
  const custom = getRatingTrend({ task, entries: dataset.entries,
    period: { startDate: '2026-07-01', endDate: '2026-07-31' } });
  assert.equal(custom.dates.length, 31);
  assert.ok(custom.observations.length > 0);
  assert.equal(ratingTrendConfig.displayOrder, 1);
});

test('removing obsolete scale metadata preserves actual saved rating snapshots', async () => {
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
    const task = await db.tasks.create({ name: 'Old task', options: optionDraft(['Low', 'High']) });
    await db.entries.upsert(task.id, '2026-08-15', task.options[0].id);
    await db.db.execAsync(`ALTER TABLE tasks ADD COLUMN currentScaleVersionId TEXT;
      ALTER TABLE tasks ADD COLUMN currentTrendEpochId TEXT;
      ALTER TABLE daily_entries ADD COLUMN scaleVersionIdAtEntry TEXT;
      ALTER TABLE daily_entries ADD COLUMN trendEpochIdAtEntry TEXT;
      CREATE TABLE rating_scale_versions (id TEXT PRIMARY KEY, taskId TEXT, trendEpochId TEXT, createdAt TEXT, effectiveLocalDate TEXT, optionsJson TEXT);
      PRAGMA user_version = 8;`);
    const savedBefore = (await db.entries.getForTaskAndDate(task.id, '2026-08-15'))!;
    db.native.close();
    const reopened = await setup(path);
    const saved = (await reopened.entries.getForTaskAndDate(task.id, '2026-08-15'))!;
    assert.equal(saved.optionId, savedBefore.optionId);
    assert.equal(saved.optionLabelAtEntry, savedBefore.optionLabelAtEntry);
    assert.equal(saved.positionAtEntry, savedBefore.positionAtEntry);
    assert.equal(saved.normalizedWeightAtEntry, savedBefore.normalizedWeightAtEntry);
    assert.equal(await reopened.db.getFirstAsync('SELECT * FROM rating_scale_versions'), null);
    assert.ok(!(await reopened.db.getAllAsync<{ name: string }>('PRAGMA table_info(tasks)')).some(row => row.name.includes('ScaleVersion') || row.name.includes('TrendEpoch')));
    assert.ok(!(await reopened.db.getAllAsync<{ name: string }>('PRAGMA table_info(daily_entries)')).some(row => row.name.includes('Version') || row.name.includes('Epoch')));
    reopened.native.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Rating Distribution counts the full period across legacy scale identities', async () => {
  const { getRatingDistribution } = await import('../src/analytics/ratingDistribution');
  const db = await setup();
  const task = await db.tasks.create({ name: 'Reading', options: optionDraft(['Short', 'Good', 'Great']) });
  await db.entries.upsert(task.id, '2026-09-20', task.options[1].id);
  await db.entries.upsert(task.id, '2026-09-21', task.options[1].id);
  const dataset = getAnalyticsDataset([(await db.tasks.getById(task.id))!], await db.entries.getAll());
  const rows = getRatingDistribution(dataset.tasks[0], dataset.entries, period);
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), 2);
  assert.deepEqual(rows.map(row => row.label), ['Short', 'Good', 'Great']);
  db.native.close();
});

