import test from 'node:test';
import assert from 'node:assert/strict';
import { EntryStore } from '../src/state/EntryStore';
import { DailyEntry } from '../src/domain/task';
const date = '2026-09-20';
const entry = (taskId: string, label = 'Low'): DailyEntry => ({ id: taskId, taskId, optionId: label, localDate: date,
  createdAt: 'now', updatedAt: 'now', optionLabelAtEntry: label, positionAtEntry: 1, rankAtEntry: 1, normalizedWeightAtEntry: 0, scaleVersionIdAtEntry: 'scale', trendEpochIdAtEntry: 'epoch' });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
test('selection is immediate and notifies only the changed card among 20 tasks', async () => {
  const store = new EntryStore(); const counts = Array(20).fill(0);
  counts.forEach((_, i) => store.subscribe(`${i}`, date, () => counts[i]++));
  const disk = deferred<DailyEntry>(); const response = entry('3');
  const write = store.optimistic('3', date, response, () => disk.promise, async () => null);
  assert.equal(store.get('3', date), response); assert.equal(counts[3], 1); assert.equal(counts.reduce((a, b) => a + b), 1);
  disk.resolve(response); await write; assert.equal(counts[3], 1);
});
test('older save completion does not overwrite a newer optimistic choice', async () => {
  const store = new EntryStore(); const first = deferred<DailyEntry>(); const second = deferred<DailyEntry>();
  const low = entry('task'); const high = entry('task', 'High');
  const one = store.optimistic('task', date, low, () => first.promise, async () => null);
  const two = store.optimistic('task', date, high, () => second.promise, async () => null);
  first.resolve(low); await one; assert.equal(store.get('task', date), high);
  second.resolve(high); await two; assert.equal(store.get('task', date), high);
});
test('a stale focus reload cannot overwrite a newer saved selection', async () => {
  const store = new EntryStore(); const checkpoint = store.checkpoint(); const high = entry('task', 'High');
  await store.optimistic('task', date, high, async () => high, async () => null);
  store.hydrateDate(date, [entry('task')], checkpoint); assert.equal(store.get('task', date), high);
});
test('failed writes restore the last confirmed response even if recovery read fails', async () => {
  const store = new EntryStore(); const original = entry('task'); store.hydrateDate(date, [original]);
  await assert.rejects(store.optimistic('task', date, entry('task', 'High'), async () => { throw new Error('Disk full'); }, async () => { throw new Error('Read failed'); }));
  assert.equal(store.get('task', date), original);
});
test('clearing and loading a missing day remain absent, not a zero-weight response', async () => {
  const store = new EntryStore(); store.hydrateDate(date, [entry('task')]);
  await store.optimistic('task', date, undefined, async () => undefined, async () => null);
  assert.equal(store.get('task', date), undefined);
  store.hydrateHistory('task', ['2026-09-19'], []); assert.equal(store.get('task', '2026-09-19'), undefined);
});
