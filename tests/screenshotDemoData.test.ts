import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, parseLocalDate } from '../src/domain/task';
import { loadScreenshotDataset, selectOnlyJsonFixture } from '../src/analytics/screenshotDemoData';
import { DemoImportService } from '../src/data/demoImport';
import { setup } from './sqlite';
import { screenshotFixture } from './demoFixture';

const loadFixture = (today: string) => loadScreenshotDataset(today, screenshotFixture);

function daysAgo(date: string, amount: number) {
  const value = parseLocalDate(date);
  value.setDate(value.getDate() - amount);
  return localDate(value);
}

test('180-day screenshot fixture maps to current local dates and preserves real gaps', () => {
  const today = '2026-10-20';
  const dataset = loadFixture(today);
  assert.equal(dataset.tasks.length, 5);
  assert.equal(dataset.entries.length, 626);
  assert.ok(dataset.tasks.every(task => task.active));
  assert.equal(dataset.tasks.find(task => task.id === 'screenshot-guitar_practice')?.name, 'Guitar Practice');
  assert.equal(dataset.tasks[0].createdLocalDate, daysAgo(today, 179));
  assert.equal(Math.max(...dataset.entries.map(entry => Date.parse(`${entry.localDate}T00:00:00Z`))), Date.parse(`${today}T00:00:00Z`));
  assert.equal(Math.min(...dataset.entries.map(entry => Date.parse(`${entry.localDate}T00:00:00Z`))), Date.parse(`${daysAgo(today, 179)}T00:00:00Z`));
  assert.ok(dataset.entries.length < dataset.tasks.length * 180, 'missing days must remain unrecorded');
  assert.equal(new Set(dataset.entries.map(entry => `${entry.taskId}:${entry.localDate}`)).size, 626);
  const guitar = dataset.tasks.find(task => task.id === 'screenshot-guitar_practice')!;
  assert.equal(guitar.options[0].description, "Didn't practise today");
  assert.deepEqual(dataset.lifecycle, []);
});

test('180-day screenshot fixture shifts dates relative to a new local anchor day', () => {
  const dataset = loadFixture('2027-01-02');
  assert.ok(dataset.entries.some(entry => entry.localDate === '2027-01-02'));
  assert.equal(dataset.tasks[0].createdLocalDate, '2026-07-07');
  assert.ok(dataset.entries.every(entry => entry.localDate >= '2026-07-07' && entry.localDate <= '2027-01-02'));
});

test('180-day screenshot fixture imports as regular SQLite data with level descriptions', async () => {
  const db = await setup();
  try {
    const dataset = loadFixture('2026-10-20');
    await new DemoImportService(db.connection).replaceLocalData(dataset);
    const tasks = await db.tasks.getAll();
    const entries = await db.entries.getAll();
    assert.equal(tasks.length, 5);
    assert.equal(entries.length, 626);
    const reading = tasks.find(task => task.id === 'screenshot-reading')!;
    assert.equal(reading.active, true);
    assert.equal(reading.options[0].description, "Didn't read today");
    const savedToday = await db.entries.getForTaskAndDate('screenshot-reading', '2026-10-20');
    assert.equal(savedToday?.optionLabelAtEntry, 'A little');
    assert.deepEqual(db.native.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.native.close(); }
});

test('screenshot loader chooses the only JSON fixture regardless of filename', () => {
  const modules: Record<string, unknown> = { './tinywins-demo-180d-guitar-varied.json': { default: screenshotFixture } };
  const context = Object.assign((key: string) => modules[key], { keys: () => Object.keys(modules) });
  assert.equal(selectOnlyJsonFixture(context), screenshotFixture);
});

test('screenshot loader rejects zero or multiple JSON fixtures', () => {
  const empty = Object.assign((_key: string) => undefined, { keys: () => [] });
  const multipleModules: Record<string, unknown> = { './one.json': {}, './two.json': {} };
  const multiple = Object.assign((key: string) => multipleModules[key], { keys: () => Object.keys(multipleModules) });
  assert.throws(() => selectOnlyJsonFixture(empty), /exactly one screenshot demo JSON file, found 0/);
  assert.throws(() => selectOnlyJsonFixture(multiple), /exactly one screenshot demo JSON file, found 2/);
});
