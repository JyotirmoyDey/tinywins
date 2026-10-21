import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activityIndexAtCenter, activityLayoutForOrder, activityTopAtPosition,
  isMeaningfulActivityHeightChange, moveActivityPosition, moveActivityToIndex,
  positionsForActivityIds, shouldAdoptExternalActivityOrder, stableActivityIndexAtCenter } from '../src/components/activityOrdering';
import { setup, draft } from './sqlite';
import { collectBackupPayload, restoreBackupPayload, validateBackupPayload } from '../src/backup/data';
import { migrate } from '../src/data/migrations';

test('drag target and move helper support either direction and clamp to list edges', () => {
  const slots = [
    { id: 'a', top: 0, height: 100 },
    { id: 'b', top: 110, height: 80 },
    { id: 'c', top: 200, height: 120 },
  ];
  assert.equal(activityIndexAtCenter(slots, 'a', 260), 2);
  assert.equal(activityIndexAtCenter(slots, 'c', -20), 0);
  assert.deepEqual(moveActivityToIndex(['a', 'b', 'c'], 'a', 2), ['b', 'c', 'a']);
  assert.deepEqual(moveActivityToIndex(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
  assert.deepEqual(moveActivityToIndex(['a', 'b'], 'missing', 0), ['a', 'b']);
});

test('move helper handles both edges and rapid consecutive drops deterministically', () => {
  const initial = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveActivityToIndex(initial, 'a', 3), ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveActivityToIndex(initial, 'd', 0), ['d', 'a', 'b', 'c']);
  const firstDrop = moveActivityToIndex(initial, 'b', 0);
  const secondDrop = moveActivityToIndex(firstDrop, 'd', 1);
  assert.deepEqual(firstDrop, ['b', 'a', 'c', 'd']);
  assert.deepEqual(secondDrop, ['b', 'd', 'a', 'c']);
});

test('cancelled reorder can restore the original order without mutating its snapshot', () => {
  const original = ['first', 'second', 'third'];
  const provisional = moveActivityToIndex(original, 'first', 2);
  assert.deepEqual(provisional, ['second', 'third', 'first']);
  assert.deepEqual(original, ['first', 'second', 'third']);
  // The gesture cancellation path restores this captured order and never asks
  // the repository to persist the provisional movement.
  assert.deepEqual(original.slice(), ['first', 'second', 'third']);
});

test('measured variable-height layout is stable across reorders and ignores sub-pixel noise', () => {
  const heights = new Map([['short', 118], ['tall', 204], ['regular', 156]]);
  const first = activityLayoutForOrder(['short', 'tall', 'regular'], heights);
  const reordered = activityLayoutForOrder(['regular', 'short', 'tall'], heights);
  assert.deepEqual(first.slots.map(slot => [slot.id, slot.top, slot.height]), [
    ['short', 0, 118], ['tall', 118, 204], ['regular', 322, 156],
  ]);
  assert.deepEqual(reordered.slots.map(slot => [slot.id, slot.top, slot.height]), [
    ['regular', 0, 156], ['short', 156, 118], ['tall', 274, 204],
  ]);
  assert.equal(first.totalHeight, reordered.totalHeight);
  assert.equal(isMeaningfulActivityHeightChange(118, 118.4), false);
  assert.equal(isMeaningfulActivityHeightChange(118, 119), true);
  assert.equal(isMeaningfulActivityHeightChange(undefined, 118), true);
});

test('repeated onLayout values do not cause repeated layout commits', () => {
  let committedHeight: number | undefined;
  let commits = 0;
  for (const measurement of [164, 164.1, 164.2, 164.6, 165]) {
    if (!isMeaningfulActivityHeightChange(committedHeight, measurement)) continue;
    committedHeight = measurement;
    commits += 1;
  }
  assert.equal(commits, 2);
  assert.equal(committedHeight, 165);
});

test('provider order synchronization ignores local saves and stale snapshots, then accepts external changes', () => {
  const dropped = ['b', 'a', 'c'].join('\u0000');
  const staleProvider = ['a', 'b', 'c'].join('\u0000');
  assert.equal(shouldAdoptExternalActivityOrder(staleProvider, dropped, true, dropped), false);
  assert.equal(shouldAdoptExternalActivityOrder(staleProvider, dropped, false, dropped), false);
  assert.equal(shouldAdoptExternalActivityOrder(dropped, dropped, false, null), false);
  assert.equal(shouldAdoptExternalActivityOrder(staleProvider, dropped, false, null), true);
});

test('drag target uses a small hysteresis so a card does not flip at a slot boundary', () => {
  const slots = [
    { id: 'first', top: 0, height: 120 },
    { id: 'second', top: 120, height: 160 },
  ];
  assert.equal(stableActivityIndexAtCenter(slots, 'second', 51, 1, 10), 1);
  assert.equal(stableActivityIndexAtCenter(slots, 'second', 49, 1, 10), 0);
  assert.equal(stableActivityIndexAtCenter(slots, 'second', 69, 0, 10), 0);
  assert.equal(stableActivityIndexAtCenter(slots, 'second', 71, 0, 10), 1);
  assert.equal(stableActivityIndexAtCenter(slots, 'first', 211, 0, 10), 1);
});

test('shared UI-thread positions animate neighbors using measured variable row heights', () => {
  const slots = [
    { id: 'short', top: 0, height: 120 },
    { id: 'tall', top: 120, height: 190 },
    { id: 'regular', top: 310, height: 150 },
  ];
  const initial = positionsForActivityIds(['short', 'tall', 'regular']);
  const moved = moveActivityPosition(initial, 'regular', 0);
  assert.deepEqual(moved, { short: 1, tall: 2, regular: 0 });
  assert.equal(activityTopAtPosition('regular', moved, slots), 0);
  assert.equal(activityTopAtPosition('short', moved, slots), 150);
  assert.equal(activityTopAtPosition('tall', moved, slots), 270);
  assert.deepEqual(moveActivityPosition(moved, 'regular', 2), initial);
});

test('activity order persists, new items append, archive preserves slots, and check-ins remain unchanged', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tinywins-order-'));
  const path = join(directory, 'test.sqlite');
  let db = await setup(path);
  try {
    const first = await db.tasks.create(draft('First'));
    const second = await db.tasks.create(draft('Second'));
    const third = await db.tasks.create(draft('Third'));
    const entry = await db.entries.upsert(second.id, '2026-10-19', second.options[1].id);
    await db.tasks.reorderActive([third.id, first.id, second.id]);
    assert.deepEqual((await db.tasks.getAll()).map(task => task.id), [third.id, first.id, second.id]);
    await db.tasks.archive(first.id);
    const fourth = await db.tasks.create(draft('Fourth'));
    assert.deepEqual((await db.tasks.getAll()).map(task => task.id), [third.id, first.id, second.id, fourth.id]);
    await db.tasks.restore(first.id);
    assert.deepEqual((await db.tasks.getAll()).map(task => task.id), [third.id, first.id, second.id, fourth.id]);
    assert.equal((await db.entries.getForTaskAndDate(second.id, '2026-10-19'))?.id, entry.id);
    db.native.close();
    db = await setup(path);
    assert.deepEqual((await db.tasks.getAll()).map(task => task.id), [third.id, first.id, second.id, fourth.id]);
    assert.equal((await db.entries.getForTaskAndDate(second.id, '2026-10-19'))?.id, entry.id);
  } finally { db.native.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('consecutive activity reorders persist in order and a failed reorder transaction rolls back cleanly', async () => {
  const db = await setup();
  try {
    const first = await db.tasks.create(draft('First'));
    const second = await db.tasks.create(draft('Second'));
    const third = await db.tasks.create(draft('Third'));
    await db.tasks.reorderActive([third.id, first.id, second.id]);
    await db.tasks.reorderActive([second.id, third.id, first.id]);
    assert.deepEqual((await db.tasks.getAll()).map(task => task.id), [second.id, third.id, first.id]);

    db.native.exec(`CREATE TRIGGER reject_activity_order BEFORE UPDATE OF sortPosition ON tasks
      BEGIN SELECT RAISE(ABORT, 'intentional test failure'); END;`);
    await assert.rejects(db.tasks.reorderActive([first.id, second.id, third.id]));
    assert.deepEqual((await db.tasks.getAll()).map(task => task.id), [second.id, third.id, first.id]);
  } finally { db.native.close(); }
});

test('encrypted-backup payload data preserves custom order and old payloads receive a stable default', async () => {
  const source = await setup();
  const target = await setup();
  try {
    const first = await source.tasks.create(draft('First'));
    const second = await source.tasks.create(draft('Second'));
    const third = await source.tasks.create(draft('Third'));
    await source.tasks.reorderActive([third.id, first.id, second.id]);
    const current = await collectBackupPayload(source.connection);
    await restoreBackupPayload(target.connection, current);
    assert.deepEqual((await target.tasks.getAll()).map(task => task.id), [third.id, first.id, second.id]);

    const legacy = validateBackupPayload({ ...current, sourceDatabaseVersion: 9,
      tables: { ...current.tables, tasks: current.tables.tasks.map(({ sortPosition: _sortPosition, ...task }) => task) } });
    assert.deepEqual(legacy.tables.tasks.map(task => task.sortPosition).sort((a, b) => Number(a) - Number(b)), [0, 1, 2]);
  } finally { source.native.close(); target.native.close(); }
});

test('existing databases receive deterministic initial positions during migration', async () => {
  const db = await setup();
  try {
    const first = await db.tasks.create(draft('First'));
    const second = await db.tasks.create(draft('Second'));
    const third = await db.tasks.create(draft('Third'));
    db.native.exec(`ALTER TABLE tasks DROP COLUMN sortPosition;
      UPDATE tasks SET createdAt = CASE id
        WHEN '${first.id}' THEN '2026-01-02T12:00:00.000Z'
        WHEN '${second.id}' THEN '2026-01-01T12:00:00.000Z'
        ELSE '2026-01-03T12:00:00.000Z' END;
      PRAGMA user_version = 9;`);
    await migrate(db.connection);
    assert.deepEqual((await db.tasks.getAll()).map(task => task.id), [second.id, first.id, third.id]);
    assert.deepEqual((await db.tasks.getAll()).map(task => task.sortPosition), [0, 1, 2]);
  } finally { db.native.close(); }
});
