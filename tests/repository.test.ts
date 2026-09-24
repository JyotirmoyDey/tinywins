import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setup, draft } from './sqlite';
import { normalizeOptions, validateDraft, recentDates, localDate, parseLocalDate } from '../src/domain/task';
import { importLegacy } from '../src/data/legacyImport';
import { migrate } from '../src/data/migrations';

test('mapping covers 2–7 choices, trims names and keeps IDs', async () => {
  for (let n = 2; n <= 7; n++) {
    const input = Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, label: ` Choice ${i} ` }));
    const options = normalizeOptions('task', input);
    options.forEach((o, i) => { assert.equal(o.id, input[i].id); assert.equal(o.position, i + 1); assert.equal(o.rank, i + 1); assert.equal(o.normalizedWeight, Math.round(i / (n - 1) * 100)); assert.equal(o.label, `Choice ${i}`); });
  }
  assert.deepEqual(normalizeOptions('t', draft().options).map(o => o.normalizedWeight), [0, 33, 67, 100]);
  const { tasks, native } = await setup(); const task = await tasks.create(draft()); assert.equal(task.name, 'Sleep'); native.close();
});
test('historical snapshots keep position and weight across reorder, rename, and added scale points', async () => {
  const { tasks, entries, native } = await setup(); const task = await tasks.create({ name: 'Practice', options: ['Skipped', 'Poor', 'Good', 'Average'].map((label, i) => ({ id: `option-${i}`, label })) });
  const old = await entries.upsert(task.id, '2026-09-19', task.options[2].id);
  assert.equal(old.optionLabelAtEntry, 'Good'); assert.equal(old.positionAtEntry, 3); assert.equal(old.normalizedWeightAtEntry, 67);
  const reordered = await tasks.update(task.id, { name: task.name, options: [task.options[0], task.options[1], task.options[3], task.options[2]] }, true);
  const newer = await entries.upsert(task.id, '2026-09-20', reordered.options[3].id);
  assert.equal(newer.optionId, task.options[2].id); assert.equal(newer.positionAtEntry, 4); assert.equal(newer.normalizedWeightAtEntry, 100);
  const renamed = await tasks.update(task.id, { name: task.name, options: reordered.options.map(option => option.id === task.options[2].id ? { ...option, label: 'Excellent' } : option) });
  const future = await entries.upsert(task.id, '2026-09-21', renamed.options.find(option => option.id === task.options[2].id)!.id);
  assert.equal((await entries.getForTaskAndDate(task.id, '2026-09-19'))?.optionLabelAtEntry, 'Good');
  assert.equal((await entries.getForTaskAndDate(task.id, '2026-09-20'))?.optionLabelAtEntry, 'Good');
  assert.equal(future.optionLabelAtEntry, 'Excellent');
  const expanded = await tasks.update(task.id, { name: task.name, options: [...renamed.options, { id: 'new-option', label: 'Outstanding' }] });
  const afterAdd = await entries.upsert(task.id, '2026-09-22', expanded.options.find(option => option.id === task.options[2].id)!.id);
  assert.equal((await entries.getForTaskAndDate(task.id, '2026-09-20'))?.normalizedWeightAtEntry, 100);
  assert.equal(afterAdd.normalizedWeightAtEntry, 75);
  native.close();
});

test('editing an old date deliberately replaces its snapshot with current configuration', async () => {
  const { tasks, entries, native } = await setup(); const task = await tasks.create({ name: 'Practice', options: ['Skipped', 'Poor', 'Good', 'Average'].map((label, i) => ({ id: `edit-option-${i}`, label })) });
  const original = await entries.upsert(task.id, '2026-09-22', task.options[2].id);
  await tasks.update(task.id, { name: task.name, options: [task.options[0], task.options[1], task.options[3], task.options[2]] }, true);
  assert.equal((await entries.getForTaskAndDate(task.id, '2026-09-22'))?.normalizedWeightAtEntry, 67);
  const edited = await entries.upsert(task.id, '2026-09-22', task.options[2].id);
  assert.equal(edited.id, original.id); assert.equal(edited.positionAtEntry, 4); assert.equal(edited.normalizedWeightAtEntry, 100); native.close();
});

test('invalid task edits roll back atomically', async () => {
  const { tasks, native } = await setup(); const task = await tasks.create(draft());
  for (const invalid of [{ name: ' ', options: task.options }, { name: 'Sleep', options: task.options.slice(0, 1) }, { name: 'Sleep', options: [{ id: 'x', label: ' ' }, { id: 'x', label: 'a' }] }]) {
    assert.ok(validateDraft(invalid)); await assert.rejects(tasks.update(task.id, invalid));
  }
  assert.deepEqual(await tasks.getById(task.id), task); native.close();
});
test('first selection inserts, changing selection preserves entry ID and createdAt', async () => {
  const { tasks, entries, native } = await setup(); const task = await tasks.create(draft());
  const first = await entries.upsert(task.id, '2026-09-20', task.options[0].id);
  const second = await entries.upsert(task.id, '2026-09-20', task.options[2].id);
  assert.equal(second.id, first.id); assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.optionId, task.options[2].id); assert.equal(second.optionLabelAtEntry, 'Good');
  assert.equal((await entries.getForDate('2026-09-20')).length, 1); native.close();
});
test('SQL UNIQUE constraint prevents duplicate task/date rows independently of the repository', async () => {
  const { tasks, entries, db, native } = await setup(); const task = await tasks.create(draft());
  await entries.upsert(task.id, '2026-09-20', task.options[0].id);
  await assert.rejects(db.runAsync(`INSERT INTO daily_entries SELECT ?, taskId, optionId, localDate, createdAt, updatedAt, optionLabelAtEntry, positionAtEntry, rankAtEntry, normalizedWeightAtEntry, scaleVersionIdAtEntry, trendEpochIdAtEntry FROM daily_entries`, randomUUID()), /UNIQUE/);
  assert.equal((await entries.getForDate('2026-09-20')).length, 1); native.close();
});
test('missing and lowest are distinct; task/date pairs are independent', async () => {
  const { tasks, entries, native } = await setup(); const a = await tasks.create(draft()); const b = await tasks.create(draft('Focus'));
  assert.equal(await entries.getForTaskAndDate(a.id, '2026-09-20'), null);
  const lowest = await entries.upsert(a.id, '2026-09-20', a.options[0].id); assert.equal(lowest.normalizedWeightAtEntry, 0);
  await entries.upsert(b.id, '2026-09-20', b.options[1].id); await entries.upsert(a.id, '2026-09-19', a.options[3].id);
  assert.equal((await entries.getForDate('2026-09-20')).length, 2);
  assert.equal((await entries.getHistoryForTask(a.id, { from: '2026-09-01', to: '2026-09-30' })).length, 2);
  await entries.deleteEntry(a.id, '2026-09-20'); assert.equal(await entries.getForTaskAndDate(a.id, '2026-09-20'), null); native.close();
});
test('removing a used option retires it, removing an unused option deletes it', async () => {
  const { tasks, entries, native } = await setup(); const task = await tasks.create(draft());
  const saved = await entries.upsert(task.id, '2026-09-20', task.options[0].id);
  await tasks.update(task.id, { name: task.name, options: task.options.slice(2) });
  const all = await tasks.getOptions(task.id);
  assert.equal(all.find(o => o.id === task.options[0].id)?.active, false);
  assert.equal(all.find(o => o.id === task.options[1].id), undefined);
  assert.equal((await tasks.getById(task.id))?.options.length, 2);
  assert.deepEqual(await entries.getForTaskAndDate(task.id, '2026-09-20'), saved);
  await assert.rejects(entries.upsert(task.id, '2026-09-19', task.options[0].id)); native.close();
});
test('rename/reorder/add preserve identity and immutable historical snapshots', async () => {
  const { tasks, entries, native } = await setup(); const task = await tasks.create(draft());
  const saved = await entries.upsert(task.id, '2026-09-20', task.options[0].id);
  const options = [...task.options].reverse().map(o => ({ ...o, label: `${o.label}!` }));
  options.push({ ...options[0], id: randomUUID(), label: 'Rested' });
  const updated = await tasks.update(task.id, { name: 'Rest', options }, true);
  assert.deepEqual(updated.options.map(o => o.normalizedWeight), [0, 25, 50, 75, 100]);
  assert.equal(updated.options[3].id, task.options[0].id); assert.equal(updated.options[3].createdAt, task.options[0].createdAt);
  assert.deepEqual(await entries.getForTaskAndDate(task.id, '2026-09-20'), saved); native.close();
});
test('archive and restore retain history; permanent task deletion cascades', async () => {
  const { tasks, entries, db, native } = await setup(); const task = await tasks.create(draft());
  const saved = await entries.upsert(task.id, '2026-09-20', task.options[0].id);
  await tasks.archive(task.id); assert.equal((await tasks.getById(task.id))?.active, false);
  assert.deepEqual(await entries.getForTaskAndDate(task.id, '2026-09-20'), saved);
  await tasks.restore(task.id); assert.equal((await tasks.getById(task.id))?.active, true);
  await tasks.delete(task.id); assert.equal((await tasks.getAll()).length, 0); assert.equal((await tasks.getOptions(task.id)).length, 0);
  assert.equal((await entries.getForDate('2026-09-20')).length, 0);
  assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'), []); native.close();
});
test('rapid writes serialize and never create duplicate responses', async () => {
  const { tasks, entries, native } = await setup(); const task = await tasks.create(draft());
  await Promise.all(task.options.map(o => entries.upsert(task.id, '2026-09-20', o.id)));
  assert.equal((await entries.getForDate('2026-09-20')).length, 1);
  assert.equal((await entries.getForTaskAndDate(task.id, '2026-09-20'))?.optionId, task.options[3].id); native.close();
});
test('cross-task option IDs cannot corrupt configuration or responses', async () => {
  const { tasks, entries, native } = await setup(); const a = await tasks.create(draft()); const b = await tasks.create(draft('Other'));
  await assert.rejects(tasks.update(a.id, { name: 'Corrupt', options: b.options }));
  assert.deepEqual(await tasks.getById(a.id), a);
  await assert.rejects(entries.upsert(a.id, '2026-09-20', b.options[0].id)); native.close();
});
test('real file database survives closing and reopening; migrations are repeatable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tinywins-test-')); const path = join(dir, 'test.sqlite');
  try {
    const first = await setup(path); const task = await first.tasks.create(draft());
    const saved = await first.entries.upsert(task.id, '2026-09-20', task.options[0].id); first.native.close();
    const second = await setup(path); await migrate(second.connection);
    assert.deepEqual(await second.tasks.getById(task.id), task); assert.deepEqual(await second.entries.getForTaskAndDate(task.id, '2026-09-20'), saved);
    second.native.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('legacy import preserves IDs and removed-choice snapshots, runs only once', async () => {
  const { connection, tasks, entries, native } = await setup(); const now = '2026-09-20T12:00:00.000Z';
  const task = { id: 'old-task', ...draft(), createdAt: now, updatedAt: now, active: true };
  const entry = { id: 'old-entry', taskId: task.id, optionId: 'removed-choice', date: '2026-09-20', label: "Didn't practice", normalizedWeight: 0, updatedAt: now };
  const raw = JSON.stringify({ version: 1, tasks: [task], entries: [entry] });
  await importLegacy(connection, raw, false, randomUUID); await importLegacy(connection, raw, false, randomUUID);
  assert.equal((await tasks.getAll()).length, 1);
  assert.equal((await tasks.getOptions(task.id)).find(o => o.id === entry.optionId)?.active, false);
  const saved = await entries.getForTaskAndDate(task.id, entry.date); assert.equal(saved?.id, entry.id); assert.equal(saved?.optionLabelAtEntry, entry.label); assert.equal(saved?.positionAtEntry, 1); assert.equal(saved?.rankAtEntry, 1);
  await tasks.delete(task.id); await importLegacy(connection, raw, false, randomUUID); assert.equal((await tasks.getAll()).length, 0); native.close();
});
test('failed legacy import rolls back and can be retried without clearing old data', async () => {
  const { connection, tasks, db, native } = await setup();
  const bad = JSON.stringify({ version: 1, tasks: [{ id: 'old', ...draft(), active: true, createdAt: 'now', updatedAt: 'now' }], entries: [{ id: 'broken' }] });
  await assert.rejects(importLegacy(connection, bad, false, randomUUID)); assert.equal((await tasks.getAll()).length, 0);
  assert.equal(await db.getFirstAsync('SELECT * FROM app_metadata'), null);
  await importLegacy(connection, null, false, randomUUID); assert.equal((await tasks.getAll()).length, 0); native.close();
});
test('demo is optional and does not create check-ins', async () => {
  const { connection, tasks, entries, native } = await setup();
  await importLegacy(connection, null, true, randomUUID); assert.equal((await tasks.getAll()).length, 3);
  assert.equal((await entries.getForDate(localDate())).length, 0); native.close();
});
test('calendar generation handles month/year/leap boundaries without UTC arithmetic', () => {
  assert.deepEqual(recentDates('2024-03-01', 3), ['2024-03-01', '2024-02-29', '2024-02-28']);
  assert.deepEqual(recentDates('2026-01-01', 2), ['2026-01-01', '2025-12-31']);
  assert.equal(localDate(new Date(2026, 8, 20, 23, 59)), '2026-09-20');
  assert.throws(() => parseLocalDate('2026-02-30')); assert.throws(() => parseLocalDate('2026-1-1'));
});

test('full daily loop survives restart after task edits, restore, and yesterday correction', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tinywins-loop-')); const path = join(dir, 'loop.sqlite');
  try {
    const app = await setup(path); await importLegacy(app.connection, null, false, randomUUID);
    assert.equal((await app.tasks.getAll()).length, 0);
    const [guitar, sleep, meditation] = await Promise.all(['Guitar', 'Sleep', 'Meditation'].map(name => app.tasks.create(draft(name))));
    const today = localDate(); const yesterday = recentDates(today, 2)[1];
    await app.entries.upsert(guitar.id, today, guitar.options[0].id);
    await app.entries.upsert(guitar.id, today, guitar.options[2].id);
    await app.entries.upsert(sleep.id, today, sleep.options[3].id);
    const previous = await app.entries.upsert(guitar.id, yesterday, guitar.options[1].id);
    await app.entries.upsert(guitar.id, yesterday, guitar.options[3].id);
    await app.tasks.update(guitar.id, { name: 'Guitar Practice', options: [...guitar.options].reverse() }, true);
    await app.tasks.archive(sleep.id); await app.tasks.restore(sleep.id);
    app.native.close();
    const reopened = await setup(path);
    assert.equal((await reopened.tasks.getAll()).filter(t => t.active).length, 3);
    assert.equal((await reopened.tasks.getById(guitar.id))?.name, 'Guitar Practice');
    assert.equal((await reopened.tasks.getById(guitar.id))?.options[0].id, guitar.options[3].id);
    assert.equal((await reopened.entries.getForTaskAndDate(guitar.id, today))?.optionLabelAtEntry, 'Good');
    const corrected = await reopened.entries.getForTaskAndDate(guitar.id, yesterday);
    assert.equal(corrected?.id, previous.id); assert.equal(corrected?.optionLabelAtEntry, 'Excellent');
    assert.equal(corrected?.normalizedWeightAtEntry, 100);
    assert.equal(await reopened.entries.getForTaskAndDate(meditation.id, today), null);
    reopened.native.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('disk write errors roll back a configuration transaction and allow retry', async () => {
  const { tasks, db, native } = await setup(); const task = await tasks.create(draft());
  await db.execAsync("CREATE TRIGGER simulate_disk_error BEFORE UPDATE OF name ON tasks BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;");
  await assert.rejects(tasks.update(task.id, { name: 'Updated', options: [...task.options].reverse() }), /simulated write failure/);
  assert.deepEqual(await tasks.getById(task.id), task);
  await db.execAsync('DROP TRIGGER simulate_disk_error');
  assert.equal((await tasks.update(task.id, { name: 'Updated', options: task.options })).name, 'Updated'); native.close();
});
