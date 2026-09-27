import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup, draft } from './sqlite';
import { migrate } from '../src/data/migrations';
import { CombinedInsightsLimitError } from '../src/data/repository';
import { initialCombinedTaskIds, MAX_COMBINED_INSIGHTS_ITEMS } from '../src/config/combinedInsights';
import { regularInsightsTaskId, selectedCombinedDataset, selectedInsightsTasks,
  withHomeInsightsSelection } from '../src/analytics/combinedSelection';
import { loadDemoDataset } from '../src/analytics/demoData';
import { getJourneyTogether } from '../src/analytics/journeyTogether';
import { getAnalyticsDataset, getCombinedRecordingCalendar, getRecordingConsistency,
  getWeekdayRecordingPattern } from '../src/analytics/service';
import { DemoImportService } from '../src/data/demoImport';

test('Home selection immediately governs the selector and combined charts without erasing history', async () => {
  const db = await setup();
  try {
    const first = await db.tasks.create(draft('First'));
    const second = await db.tasks.create(draft('Second'));
    await db.entries.upsert(first.id, '2026-09-20', first.options[0].id);
    await db.entries.upsert(second.id, '2026-09-20', second.options[1].id);
    const savedEntries = await db.entries.getAll();
    // Keep the analytics snapshot stale to verify that Home's current SQLite
    // task state controls visibility without waiting for a chart reload.
    const snapshot = getAnalyticsDataset(await db.tasks.getAll(), savedEntries,
      await db.tasks.getScaleVersions());
    await db.tasks.setCombinedInsightsSelection(first.id, false);
    const deselected = withHomeInsightsSelection(snapshot, await db.tasks.getAll(), false);
    assert.deepEqual(selectedInsightsTasks(deselected).map(task => task.id), [second.id]);
    assert.equal(regularInsightsTaskId(first.id, selectedInsightsTasks(deselected)), 'all');
    assert.deepEqual(selectedCombinedDataset(deselected).entries.map(entry => entry.taskId), [second.id]);
    assert.deepEqual(await db.entries.getAll(), savedEntries);
    await db.tasks.setCombinedInsightsSelection(first.id, true);
    const restored = withHomeInsightsSelection(snapshot, await db.tasks.getAll(), false);
    assert.equal(regularInsightsTaskId(first.id, selectedInsightsTasks(restored)), first.id);
    assert.deepEqual(restored.entries.filter(entry => entry.taskId === first.id),
      savedEntries.filter(entry => entry.taskId === first.id));
    await db.tasks.archive(first.id);
    const archived = withHomeInsightsSelection(snapshot, await db.tasks.getAll(), false);
    assert.equal(regularInsightsTaskId(first.id, selectedInsightsTasks(archived)), 'all');
    assert.ok(archived.tasks.find(task => task.id === first.id && !task.active));
  } finally { db.native.close(); }
});

test('Demo visibility follows Home selections by stable ID, never by matching names', async () => {
  const db = await setup();
  try {
    const home = await db.tasks.create(draft('Workout'));
    const demo = loadDemoDataset();
    assert.equal(selectedInsightsTasks(withHomeInsightsSelection(demo, [home], true)).length, 0);
    const matchingIdWithDifferentName = { ...home, id: demo.tasks[0].id, name: 'Different name' };
    const scoped = withHomeInsightsSelection(demo, [matchingIdWithDifferentName], true);
    assert.deepEqual(selectedInsightsTasks(scoped).map(task => task.id), [demo.tasks[0].id]);
    assert.equal(scoped.entries.length, demo.entries.length);
  } finally { db.native.close(); }
});

test('five selections are allowed, a sixth is rejected, and zero is valid', async () => {
  const db = await setup();
  try {
    const created = [];
    for (let i = 0; i < 6; i++) created.push(await db.tasks.create(draft(`Thing ${i}`)));
    assert.equal((await db.tasks.getAll()).filter(task => task.includeInCombinedInsights).length, 5);
    assert.equal(created[5].includeInCombinedInsights, false);
    await assert.rejects(db.tasks.setCombinedInsightsSelection(created[5].id, true), CombinedInsightsLimitError);
    await assert.rejects(db.tasks.create({ ...draft('Explicit sixth'), includeInCombinedInsights: true }), CombinedInsightsLimitError);
    const unselected = await db.tasks.create({ ...draft('No graph'), includeInCombinedInsights: false });
    assert.equal(unselected.includeInCombinedInsights, false);
    for (const task of created.slice(0, 5)) await db.tasks.setCombinedInsightsSelection(task.id, false);
    assert.equal((await db.tasks.getAll()).filter(task => task.includeInCombinedInsights).length, 0);
    await db.tasks.setCombinedInsightsSelection(created[5].id, true);
    assert.equal((await db.tasks.getById(created[5].id))?.includeInCombinedInsights, true);
  } finally { db.native.close(); }
});

test('archive frees a graph spot; restore keeps the same item unselected', async () => {
  const db = await setup();
  try {
    const first = await db.tasks.create(draft('First'));
    for (let i = 1; i < MAX_COMBINED_INSIGHTS_ITEMS; i++) await db.tasks.create(draft(`Other ${i}`));
    const sixth = await db.tasks.create(draft('Sixth'));
    await db.tasks.archive(first.id);
    assert.equal((await db.tasks.getById(first.id))?.includeInCombinedInsights, false);
    await db.tasks.setCombinedInsightsSelection(sixth.id, true);
    await db.tasks.restore(first.id);
    assert.equal((await db.tasks.getById(first.id))?.includeInCombinedInsights, false);
    await assert.rejects(db.tasks.setCombinedInsightsSelection(first.id, true), CombinedInsightsLimitError);
    await db.tasks.archive(first.id);
    await assert.rejects(db.tasks.setCombinedInsightsSelection(first.id, true), /Archived items/);
  } finally { db.native.close(); }
});

test('concurrent selections and creations cannot exceed five', async () => {
  const db = await setup();
  try {
    for (let i = 0; i < 4; i++) await db.tasks.create(draft(`Selected ${i}`));
    const a = await db.tasks.create({ ...draft('A'), includeInCombinedInsights: false });
    const b = await db.tasks.create({ ...draft('B'), includeInCombinedInsights: false });
    const results = await Promise.allSettled([
      db.tasks.setCombinedInsightsSelection(a.id, true), db.tasks.setCombinedInsightsSelection(b.id, true),
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected']);
    assert.equal((await db.tasks.getAll()).filter(task => task.includeInCombinedInsights).length, 5);
  } finally { db.native.close(); }
});

test('selection survives restart; migration chooses first five active Home items only once', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'tinywins-combined-'));
  const path = join(folder, 'combined.sqlite');
  try {
    const first = await setup(path);
    const tasks = [];
    for (let i = 0; i < 7; i++) tasks.push(await first.tasks.create(draft(`Item ${i}`)));
    await first.tasks.archive(tasks[0].id);
    // Simulate the prior installed schema, which had no graph preference.
    first.native.exec('ALTER TABLE tasks DROP COLUMN includeInCombinedInsights; PRAGMA user_version = 5;');
    await migrate(first.connection);
    const migrated = await first.tasks.getAll();
    assert.deepEqual(migrated.filter(task => task.includeInCombinedInsights).map(task => task.id),
      migrated.filter(task => task.active).slice(0, 5).map(task => task.id));
    await first.tasks.setCombinedInsightsSelection(migrated.find(task => task.includeInCombinedInsights)!.id, false);
    first.native.close();
    const reopened = await setup(path);
    assert.equal((await reopened.tasks.getAll()).filter(task => task.includeInCombinedInsights).length, 4);
    await migrate(reopened.connection);
    assert.equal((await reopened.tasks.getAll()).filter(task => task.includeInCombinedInsights).length, 4);
    reopened.native.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('failed selection write leaves the previous preference intact', async () => {
  const db = await setup();
  try {
    const task = await db.tasks.create({ ...draft('Rollback'), includeInCombinedInsights: false });
    db.native.exec(`CREATE TRIGGER reject_graph_choice BEFORE UPDATE OF includeInCombinedInsights ON tasks
      BEGIN SELECT RAISE(ABORT, 'write failed'); END;`);
    await assert.rejects(db.tasks.setCombinedInsightsSelection(task.id, true), /write failed/);
    assert.equal((await db.tasks.getById(task.id))?.includeInCombinedInsights, false);
  } finally { db.native.close(); }
});

test('all four combined calculations consume only the same selected stable IDs', () => {
  const dataset = loadDemoDataset();
  const chosen = new Set(dataset.tasks.slice(1, 3).map(task => task.id));
  const scoped = selectedCombinedDataset({ ...dataset, tasks: dataset.tasks.map(task => ({ ...task,
    includeInCombinedInsights: chosen.has(task.id) })) });
  const period = { startDate: '2026-07-01', endDate: '2026-07-30' };
  assert.deepEqual(new Set(scoped.tasks.map(task => task.id)), chosen);
  assert.ok(scoped.entries.every(entry => chosen.has(entry.taskId)));
  assert.deepEqual(new Set(getJourneyTogether({ dataset: scoped, period }).series.map(row => row.taskId)), chosen);
  assert.deepEqual(new Set(getRecordingConsistency(scoped.tasks, scoped.entries, period,
    scoped.lifecycle, period.endDate).rows.map(row => row.taskId)), chosen);
  const calendar = getCombinedRecordingCalendar(scoped.tasks, scoped.entries, period,
    scoped.lifecycle, period.endDate);
  assert.ok(calendar.every(day => day.eligible <= chosen.size && day.recorded <= chosen.size));
  const weekdays = getWeekdayRecordingPattern(scoped.tasks, scoped.entries, period);
  assert.equal(weekdays.reduce((sum, row) => sum + row.observations, 0), scoped.entries.filter(entry =>
    entry.localDate >= period.startDate && entry.localDate <= period.endDate).length);
  assert.equal(selectedCombinedDataset({ ...dataset, tasks: dataset.tasks.map(task => ({ ...task,
    includeInCombinedInsights: false })) }).tasks.length, 0);
  assert.equal(selectedCombinedDataset({ ...dataset, tasks: dataset.tasks.map(task => ({ ...task,
    includeInCombinedInsights: undefined })) }).tasks.length, 0);
  assert.equal(dataset.tasks.length, 8); // Individual Insights still receives the complete dataset.
});

test('initial selection is based on stable Home order, not array order or names', () => {
  const ids = initialCombinedTaskIds([
    { id: 'b', active: true, createdAt: '2026-01-01' },
    { id: 'a', active: true, createdAt: '2026-01-01' },
    { id: 'archived', active: false, createdAt: '2025-01-01' },
  ]);
  assert.deepEqual([...ids], ['a', 'b']);
});

test('imported one-year data starts with five graph selections and keeps recordings when one is archived', async () => {
  const db = await setup();
  try {
    await new DemoImportService(db.connection).replaceLocalData(loadDemoDataset());
    const tasks = await db.tasks.getAll();
    assert.equal(tasks.length, 8);
    assert.deepEqual(tasks.filter(task => task.includeInCombinedInsights).map(task => task.id),
      tasks.slice(0, 5).map(task => task.id));
    const selected = tasks[0];
    const before = (await db.entries.getAll()).filter(entry => entry.taskId === selected.id);
    await db.tasks.archive(selected.id);
    assert.equal((await db.tasks.getById(selected.id))?.includeInCombinedInsights, false);
    assert.deepEqual((await db.entries.getAll()).filter(entry => entry.taskId === selected.id), before);
    await db.tasks.restore(selected.id);
    assert.equal((await db.tasks.getById(selected.id))?.includeInCombinedInsights, false);
  } finally { db.native.close(); }
});
