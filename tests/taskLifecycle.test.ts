import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup, draft } from './sqlite';
import { migrate } from '../src/data/migrations';
import { createTaskDayEligibility } from '../src/domain/taskLifecycle';
import { TaskLifecycleTransition, localDate } from '../src/domain/task';
import { getAnalyticsDataset, getRecordingConsistency } from '../src/analytics/service';
import { getIndividualRecordingConsistency } from '../src/analytics/recordingConsistency';
import { getRatingTrend } from '../src/analytics/ratingTrend';
import { getJourneyTogether } from '../src/analytics/journeyTogether';
import { loadDemoDataset } from '../src/analytics/demoData';
import { getRatingDistribution } from '../src/analytics/ratingDistribution';
import { individualCalendarData } from '../src/components/analytics/individualCalendar';
import { getPeriodComparison } from '../src/analytics/periodComparison';
import { getWeekdayPatterns } from '../src/analytics/weekdayPatterns';

test('archive and restore repeatedly preserve identity, configuration, entries, and version history', async () => {
  const db = await setup();
  try {
    const task = await db.tasks.create(draft('Guitar'));
    await db.entries.upsert(task.id, '2026-09-20', task.options[1].id);
    const versionsBefore = await db.tasks.getScaleVersions(task.id);
    await db.tasks.archive(task.id);
    await db.tasks.archive(task.id);
    assert.equal((await db.tasks.getById(task.id))?.active, false);
    assert.ok((await db.tasks.getById(task.id))?.archivedAt);
    assert.ok((await db.tasks.getById(task.id))?.chartColor);
    await assert.rejects(db.entries.upsert(task.id, '2026-09-26', task.options[0].id),
      /Restore this activity/);
    await db.tasks.restore(task.id);
    await db.tasks.restore(task.id);
    await db.tasks.archive(task.id);
    const events = await db.tasks.getLifecycleTransitions(task.id);
    assert.deepEqual(events.map(event => event.type), ['archived', 'restored', 'archived']);
    assert.ok(events.every(event => event.localDate && event.timeZone &&
      Number.isInteger(event.utcOffsetMinutes)));
    assert.equal((await db.entries.getForTaskAndDate(task.id, '2026-09-20'))?.optionLabelAtEntry,
      task.options[1].label);
    assert.deepEqual((await db.tasks.getById(task.id))?.options, task.options);
    assert.deepEqual(await db.tasks.getScaleVersions(task.id), versionsBefore);
    assert.equal((await db.tasks.getById(task.id))?.currentTrendEpochId, task.currentTrendEpochId);
  } finally { db.native.close(); }
});

test('failed lifecycle insert rolls back status and archive timestamp', async () => {
  const db = await setup();
  try {
    const task = await db.tasks.create(draft('Study'));
    db.native.exec(`CREATE TRIGGER deny_archive BEFORE INSERT ON task_lifecycle_transitions
      BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;`);
    await assert.rejects(db.tasks.archive(task.id), /simulated write failure/);
    assert.equal((await db.tasks.getById(task.id))?.active, true);
    assert.equal((await db.tasks.getById(task.id))?.archivedAt, null);
    assert.equal((await db.tasks.getLifecycleTransitions(task.id)).length, 0);
    db.native.exec('DROP TRIGGER deny_archive');
    await db.tasks.archive(task.id);
    assert.equal((await db.tasks.getLifecycleTransitions(task.id)).length, 1);
    const archiveStamp = (await db.tasks.getById(task.id))?.archivedAt;
    db.native.exec(`CREATE TRIGGER deny_restore BEFORE INSERT ON task_lifecycle_transitions
      WHEN NEW.type = 'restored' BEGIN SELECT RAISE(ABORT, 'simulated restore failure'); END;`);
    await assert.rejects(db.tasks.restore(task.id), /simulated restore failure/);
    assert.equal((await db.tasks.getById(task.id))?.active, false);
    assert.equal((await db.tasks.getById(task.id))?.archivedAt, archiveStamp);
    assert.equal((await db.tasks.getLifecycleTransitions(task.id)).length, 1);
  } finally { db.native.close(); }
});

test('a recording made before archiving today survives, and restoring reuses the same entry', async () => {
  const db = await setup();
  try {
    const day = localDate();
    const task = await db.tasks.create(draft('Meditation'));
    const saved = await db.entries.upsert(task.id, day, task.options[1].id);
    await db.tasks.archive(task.id);
    assert.equal((await db.entries.getForTaskAndDate(task.id, day))?.id, saved.id);
    await assert.rejects(db.entries.upsert(task.id, day, task.options[2].id), /Restore this activity/);
    await db.tasks.restore(task.id);
    const changed = await db.entries.upsert(task.id, day, task.options[2].id);
    assert.equal(changed.id, saved.id);
    assert.equal(changed.optionLabelAtEntry, task.options[2].label);
    assert.deepEqual((await db.tasks.getLifecycleTransitions(task.id)).map(event => event.type),
      ['archived', 'restored']);
  } finally { db.native.close(); }
});

test('deleting archived tasks removes only their history and preserves active tasks', async () => {
  const db = await setup();
  try {
    const active = await db.tasks.create(draft('Active'));
    const archived = await db.tasks.create(draft('Archived'));
    await db.entries.upsert(active.id, '2026-09-20', active.options[0].id);
    await db.entries.upsert(archived.id, '2026-09-20', archived.options[1].id);
    await db.tasks.archive(archived.id);
    await db.tasks.deleteArchivedTasks();
    assert.deepEqual((await db.tasks.getAll()).map(task => task.id), [active.id]);
    assert.ok(await db.entries.getForTaskAndDate(active.id, '2026-09-20'));
    assert.equal(await db.entries.getForTaskAndDate(archived.id, '2026-09-20'), null);
    assert.deepEqual(await db.tasks.getLifecycleTransitions(archived.id), []);
    assert.deepEqual(await db.tasks.getScaleVersions(archived.id), []);
  } finally { db.native.close(); }
});

test('new recordings are rejected inside an archived historical period', async () => {
  const db = await setup();
  try {
    const task = await db.tasks.create(draft('Workout'));
    db.native.prepare('UPDATE tasks SET createdAt = ?, createdLocalDate = ?, active = 1 WHERE id = ?')
      .run('2026-01-01T09:00:00.000Z', '2026-01-01', task.id);
    db.native.prepare(`INSERT INTO task_lifecycle_transitions
      (id,taskId,type,occurredAt,localDate,utcOffsetMinutes,timeZone,inferred)
      VALUES ('archive-old',?,'archived','2026-01-10T12:00:00.000Z','2026-01-10',0,'UTC',0),
      ('restore-old',?,'restored','2026-01-30T12:00:00.000Z','2026-01-30',0,'UTC',0)`)
      .run(task.id, task.id);
    await assert.rejects(db.entries.upsert(task.id, '2026-01-20', task.options[0].id),
      /not active/);
    const afterRestore = await db.entries.upsert(task.id, '2026-02-01', task.options[0].id);
    assert.equal(afterRestore.normalizedWeightAtEntry, 0);
    assert.equal(await db.entries.getForTaskAndDate(task.id, '2026-01-20'), null);
  } finally { db.native.close(); }
});

test('local end-of-day transitions distinguish archive days, same-day restore, and missing days', () => {
  const task = { id: 'activity', createdAt: '2026-01-01T09:00:00.000Z',
    createdLocalDate: '2026-01-01', archivedAt: null, active: true };
  const event = (type: 'archived' | 'restored', date: string, sequence: number): TaskLifecycleTransition => ({
    id: `event-${sequence}`, taskId: task.id, type, occurredAt: `${date}T12:00:00.000Z`,
    localDate: date, sequence, utcOffsetMinutes: 330, timeZone: 'Asia/Kolkata',
  });
  const events = [event('archived', '2026-01-10', 1), event('restored', '2026-01-20', 2),
    event('archived', '2026-01-20', 3), event('restored', '2026-01-20', 4),
    event('archived', '2026-02-01', 5)];
  const check = createTaskDayEligibility(task, events, ['2026-01-10'], '2026-02-05');
  assert.equal(check.eligible('2025-12-31'), false);
  assert.equal(check.eligible('2026-01-01'), true);
  assert.equal(check.eligible('2026-01-10'), true); // Recorded before archiving.
  assert.equal(check.eligible('2026-01-11'), false);
  assert.equal(check.eligible('2026-01-20'), true); // Final same-day state is restored.
  assert.equal(check.eligible('2026-02-01'), false);
  assert.equal(check.eligible('2026-02-06'), false);
  const noRecording = createTaskDayEligibility(task, events, [], '2026-02-05');
  assert.equal(noRecording.eligible('2026-01-10'), false);
});

test('individual and All Activities coverage exclude archived spans but count recorded lowest ratings', () => {
  const dataset = loadDemoDataset();
  const task = { ...dataset.tasks[0], id: 'tracked', createdAt: '2026-01-01T05:00:00.000Z',
    createdLocalDate: '2026-01-01' };
  const lifecycle: TaskLifecycleTransition[] = [
    { id: 'a', taskId: task.id, type: 'archived', occurredAt: '2026-01-10T15:00:00.000Z',
      localDate: '2026-01-10', utcOffsetMinutes: 0, timeZone: 'UTC' },
    { id: 'r', taskId: task.id, type: 'restored', occurredAt: '2026-01-20T15:00:00.000Z',
      localDate: '2026-01-20', utcOffsetMinutes: 0, timeZone: 'UTC' },
    { id: 'a2', taskId: task.id, type: 'archived', occurredAt: '2026-02-01T15:00:00.000Z',
      localDate: '2026-02-01', utcOffsetMinutes: 0, timeZone: 'UTC' },
  ];
  const entries = [{ ...dataset.entries[0], id: 'lowest', taskId: task.id,
    localDate: '2026-01-10', optionId: task.options[0].id,
    optionLabelAtEntry: task.options[0].label, normalizedWeightAtEntry: 0 },
  { ...dataset.entries[0], id: 'later', taskId: task.id, localDate: '2026-01-25' }];
  const period = { startDate: '2026-01-01', endDate: '2026-02-05' };
  const individual = getIndividualRecordingConsistency({ task, entries, lifecycle, period,
    today: period.endDate, timeline: 'CUSTOM' });
  const combined = getRecordingConsistency([task], entries, period, lifecycle, period.endDate);
  assert.equal(individual.eligibleDays, 22);
  assert.equal(individual.recordedDays, 2);
  assert.equal(combined.eligibleDays, 22);
  assert.equal(combined.recordedDays, 2);
  assert.equal(combined.rows[0].coverage, 2 / 22);
});

test('archived task retains Insights history and appears in historical All Activities journey', async () => {
  const db = await setup();
  try {
    const task = await db.tasks.create(draft('Reading'));
    await db.entries.upsert(task.id, '2026-09-20', task.options[0].id);
    await db.tasks.archive(task.id);
    const dataset = getAnalyticsDataset(await db.tasks.getAll(), await db.entries.getAll(),
      await db.tasks.getScaleVersions(), await db.tasks.getLifecycleTransitions());
    const period = { startDate: '2026-09-20', endDate: '2026-09-26' };
    assert.equal(dataset.tasks[0].active, false);
    assert.equal(getRatingTrend({ task: dataset.tasks[0], entries: dataset.entries,
      versions: dataset.scaleVersions, period }).observations.length, 1);
    assert.equal(getRatingDistribution(dataset.tasks[0], dataset.entries, period,
      'current', dataset.scaleVersions).reduce((sum, row) => sum + row.count, 0), 1);
    assert.equal(individualCalendarData(dataset.tasks[0], dataset.entries,
      dataset.scaleVersions, '2026-09').cells.find(cell => cell.date === '2026-09-20')?.label,
    task.options[0].label);
    assert.ok(getPeriodComparison({ task: dataset.tasks[0], entries: dataset.entries,
      versions: dataset.scaleVersions, period }));
    assert.ok(getIndividualRecordingConsistency({ task: dataset.tasks[0],
      entries: dataset.entries, lifecycle: dataset.lifecycle, period, today: '2026-09-26',
      timeline: '7D' }));
    assert.ok(getWeekdayPatterns({ task: dataset.tasks[0], entries: dataset.entries,
      versions: dataset.scaleVersions, period, timeline: '7D' }));
    const journey = getJourneyTogether({ dataset, period });
    assert.equal(journey.series.length, 1);
    assert.equal(journey.series[0].latestRating, task.options[0].label);
    assert.equal(getJourneyTogether({ dataset, period: { startDate: '2026-09-21',
      endDate: '2026-09-26' } }).series.length, 1); // Eligible active days still count.
  } finally { db.native.close(); }
});

test('restored activities move after existing active activities without changing their IDs', async () => {
  const db = await setup();
  try {
    const first = await db.tasks.create(draft('First'));
    const firstColor = first.chartColor;
    const second = await db.tasks.create(draft('Second'));
    await db.tasks.archive(first.id);
    const third = await db.tasks.create(draft('Third'));
    assert.notEqual(third.chartColor, firstColor);
    await new Promise(resolve => setTimeout(resolve, 2)); // Ensure distinct millisecond timestamps.
    await db.tasks.restore(first.id);
    assert.deepEqual((await db.tasks.getAll()).filter(task => task.active).map(task => task.id),
      [second.id, third.id, first.id]);
    assert.equal((await db.tasks.getById(first.id))?.chartColor, firstColor);
    const dataset = getAnalyticsDataset(await db.tasks.getAll(), [], []);
    assert.equal(dataset.tasks.find(task => task.id === first.id)?.color, firstColor);
  } finally { db.native.close(); }
});

test('v3 migration preserves existing archived tasks and backfills an inferred transition', async () => {
  const db = await setup();
  try {
    const task = await db.tasks.create(draft('Existing'));
    db.native.exec(`UPDATE tasks SET active = 0 WHERE id = '${task.id}';
      DROP TABLE task_lifecycle_transitions;
      ALTER TABLE tasks DROP COLUMN archivedAt;
      ALTER TABLE tasks DROP COLUMN createdLocalDate;
      ALTER TABLE tasks DROP COLUMN chartColor;
      PRAGMA user_version = 3;`);
    await migrate(db.connection);
    assert.equal((await db.tasks.getById(task.id))?.active, false);
    assert.ok((await db.tasks.getById(task.id))?.archivedAt);
    const transitions = await db.tasks.getLifecycleTransitions(task.id);
    assert.equal(transitions.length, 1);
    assert.equal(transitions[0].type, 'archived');
    assert.equal(transitions[0].inferred, true);
    await migrate(db.connection);
    assert.equal((await db.tasks.getLifecycleTransitions(task.id)).length, 1);
  } finally { db.native.close(); }
});

test('lifecycle transitions and archived state survive reopening a real SQLite file', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'tinywins-lifecycle-'));
  const path = join(folder, 'state.sqlite');
  try {
    const first = await setup(path);
    const task = await first.tasks.create(draft('Sleep'));
    await first.tasks.archive(task.id);
    first.native.close();
    const reopened = await setup(path);
    try {
      assert.equal((await reopened.tasks.getById(task.id))?.active, false);
      assert.equal((await reopened.tasks.getLifecycleTransitions(task.id)).length, 1);
      await reopened.tasks.restore(task.id);
      assert.equal((await reopened.tasks.getById(task.id))?.active, true);
      assert.equal((await reopened.tasks.getLifecycleTransitions(task.id)).length, 2);
    } finally { reopened.native.close(); }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
