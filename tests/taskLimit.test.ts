import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACTIVE_TASK_LIMIT_MESSAGE, MAX_ACTIVE_TASKS } from '../src/config/taskLimits';
import { ActiveTaskLimitError } from '../src/data/repository';
import { importLegacy } from '../src/data/legacyImport';
import { draft, setup } from './sqlite';

test('ten active tasks can be created; an eleventh is rejected atomically', async () => {
  const { tasks, native } = await setup();
  try {
    for (let index = 0; index < MAX_ACTIVE_TASKS; index++)
      await tasks.create(draft(`Task ${index + 1}`));
    assert.equal((await tasks.getAll()).filter(task => task.active).length, MAX_ACTIVE_TASKS);
    await assert.rejects(tasks.create(draft('Eleventh')), error =>
      error instanceof ActiveTaskLimitError && error.message === ACTIVE_TASK_LIMIT_MESSAGE);
    assert.equal((await tasks.getAll()).length, MAX_ACTIVE_TASKS);
    assert.equal((await tasks.getScaleVersions()).length, MAX_ACTIVE_TASKS);
  } finally { native.close(); }
});

test('archiving frees one slot without deleting saved history', async () => {
  const { tasks, entries, native } = await setup();
  try {
    const created = [];
    for (let index = 0; index < MAX_ACTIVE_TASKS; index++)
      created.push(await tasks.create(draft(`Task ${index + 1}`)));
    const response = await entries.upsert(created[0].id, '2026-09-20', created[0].options[0].id);
    await tasks.archive(created[0].id);
    const replacement = await tasks.create(draft('Replacement'));
    assert.equal((await tasks.getAll()).filter(task => task.active).length, MAX_ACTIVE_TASKS);
    assert.equal((await tasks.getById(created[0].id))?.active, false);
    assert.equal((await tasks.getById(replacement.id))?.active, true);
    assert.deepEqual(await entries.getForTaskAndDate(created[0].id, '2026-09-20'), response);
  } finally { native.close(); }
});

test('restoring is blocked at capacity, but succeeds after another task is archived', async () => {
  const { tasks, native } = await setup();
  try {
    const archived = await tasks.create(draft('Archived'));
    await tasks.archive(archived.id);
    const active = [];
    for (let index = 0; index < MAX_ACTIVE_TASKS; index++)
      active.push(await tasks.create(draft(`Active ${index + 1}`)));
    await assert.rejects(tasks.restore(archived.id), ActiveTaskLimitError);
    assert.equal((await tasks.getById(archived.id))?.active, false);
    // Restoring an already-active task is an idempotent no-op, even at capacity.
    await tasks.restore(active[0].id);
    await tasks.archive(active[0].id);
    await tasks.restore(archived.id);
    assert.equal((await tasks.getById(archived.id))?.active, true);
    assert.equal((await tasks.getAll()).filter(task => task.active).length, MAX_ACTIVE_TASKS);
  } finally { native.close(); }
});

test('existing installations over ten stay intact and cannot activate more until below ten', async () => {
  const { connection, tasks, native } = await setup();
  try {
    const now = '2026-09-20T08:00:00.000Z';
    const oldTasks = Array.from({ length: MAX_ACTIVE_TASKS + 1 }, (_, index) => ({
      id: randomUUID(), name: `Existing ${index + 1}`, active: true,
      createdAt: now, updatedAt: now,
      options: ['Low', 'High'].map(label => ({ id: randomUUID(), label })),
    }));
    await importLegacy(connection, JSON.stringify({ version: 1, tasks: oldTasks, entries: [] }),
      false, randomUUID);
    assert.equal((await tasks.getAll()).length, MAX_ACTIVE_TASKS + 1);
    await assert.rejects(tasks.create(draft('New')), ActiveTaskLimitError);
    await tasks.archive(oldTasks[0].id);
    await assert.rejects(tasks.create(draft('Still full')), ActiveTaskLimitError);
    await tasks.archive(oldTasks[1].id);
    const created = await tasks.create(draft('Now allowed'));
    assert.equal((await tasks.getById(created.id))?.active, true);
    assert.equal((await tasks.getAll()).length, MAX_ACTIVE_TASKS + 2);
    assert.equal((await tasks.getAll()).filter(task => task.active).length, MAX_ACTIVE_TASKS);
  } finally { native.close(); }
});

test('concurrent creation at the boundary cannot exceed ten active tasks', async () => {
  const { tasks, native } = await setup();
  try {
    for (let index = 0; index < MAX_ACTIVE_TASKS - 1; index++)
      await tasks.create(draft(`Task ${index + 1}`));
    const results = await Promise.allSettled(Array.from({ length: 4 }, (_, index) =>
      tasks.create(draft(`Rapid ${index + 1}`))));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected' &&
      result.reason instanceof ActiveTaskLimitError).length, 3);
    assert.equal((await tasks.getAll()).filter(task => task.active).length, MAX_ACTIVE_TASKS);
  } finally { native.close(); }
});

test('a simultaneous restore and create share the final available slot', async () => {
  const { tasks, native } = await setup();
  try {
    const archived = await tasks.create(draft('Archived'));
    await tasks.archive(archived.id);
    for (let index = 0; index < MAX_ACTIVE_TASKS - 1; index++)
      await tasks.create(draft(`Task ${index + 1}`));
    const results = await Promise.allSettled([
      tasks.restore(archived.id), tasks.create(draft('New')),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected' &&
      result.reason instanceof ActiveTaskLimitError).length, 1);
    assert.equal((await tasks.getAll()).filter(task => task.active).length, MAX_ACTIVE_TASKS);
  } finally { native.close(); }
});

test('the limit still applies after closing and reopening the database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tinywins-limit-'));
  const path = join(dir, 'tasks.sqlite');
  try {
    const first = await setup(path);
    for (let index = 0; index < MAX_ACTIVE_TASKS; index++)
      await first.tasks.create(draft(`Task ${index + 1}`));
    first.native.close();
    const reopened = await setup(path);
    try {
      assert.equal((await reopened.tasks.getAll()).filter(task => task.active).length, MAX_ACTIVE_TASKS);
      await assert.rejects(reopened.tasks.create(draft('Too many')), ActiveTaskLimitError);
      const existing = (await reopened.tasks.getAll())[0];
      await reopened.tasks.archive(existing.id);
      await reopened.tasks.create(draft('Replacement'));
      assert.equal((await reopened.tasks.getAll()).filter(task => task.active).length, MAX_ACTIVE_TASKS);
    } finally { reopened.native.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
