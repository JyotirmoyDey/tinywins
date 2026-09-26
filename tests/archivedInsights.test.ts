import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoDataset } from '../src/analytics/demoData';
import { archivedInsightsTask, insightsSourceForEntry, selectedInsightsTask, tasksRelevantToPeriod } from '../src/analytics/insightsScope';
import { getJourneyTogether } from '../src/analytics/journeyTogether';
import { AnalyticsDataset } from '../src/analytics/types';

test('Archived Activities selects My Data by stable ID even when Demo Data is selected', () => {
  const demo = loadDemoDataset();
  const realTask = { ...demo.tasks[0], id: 'real-workout', active: false };
  assert.equal(realTask.name, demo.tasks[0].name);
  assert.equal(insightsSourceForEntry('demo', 'archivedTask'), 'my');
  assert.equal(insightsSourceForEntry('demo'), 'demo');
  assert.equal(insightsSourceForEntry('demo', 'normal'), 'demo');
  assert.equal(selectedInsightsTask([realTask], realTask.id)?.id, realTask.id);
  assert.equal(selectedInsightsTask(demo.tasks, realTask.id), undefined);
  assert.equal(selectedInsightsTask([realTask], demo.tasks[0].id), undefined);
  assert.equal(archivedInsightsTask([realTask], realTask.id, 'archivedTask')?.id, realTask.id);
  assert.equal(archivedInsightsTask([realTask], demo.tasks[0].id, 'archivedTask'), undefined);
  assert.equal(archivedInsightsTask([realTask], realTask.id, 'normal'), undefined);
  assert.equal(archivedInsightsTask(demo.tasks, demo.tasks[0].id, 'archivedTask'), undefined);
});

test('archived tasks appear only for recorded or eligible tracking periods', () => {
  const demo = loadDemoDataset();
  const task = { ...demo.tasks[0], id: 'real-workout', active: false,
    createdLocalDate: '2026-01-01', archivedAt: '2026-01-10T12:00:00.000Z' };
  const dataset: AnalyticsDataset = {
    ...demo,
    tasks: [task],
    entries: [{ ...demo.entries[0], id: 'real-entry', taskId: task.id,
      localDate: '2026-01-05' }],
    scaleVersions: demo.scaleVersions.map(version => ({ ...version, taskId: task.id })),
    lifecycle: [{ id: 'archive', taskId: task.id, type: 'archived',
      occurredAt: '2026-01-10T12:00:00.000Z', localDate: '2026-01-10',
      utcOffsetMinutes: 0, timeZone: 'UTC' }],
  };
  const today = '2026-02-10';
  const period = (startDate: string, endDate: string) => ({ startDate, endDate });
  assert.deepEqual(tasksRelevantToPeriod(dataset, period('2026-01-01', '2026-01-06'), today).map(t => t.id), [task.id]);
  assert.deepEqual(tasksRelevantToPeriod(dataset, period('2026-01-06', '2026-01-09'), today).map(t => t.id), [task.id]);
  assert.deepEqual(tasksRelevantToPeriod(dataset, period('2026-01-10', '2026-01-19'), today), []);
  assert.equal(getJourneyTogether({ dataset, period: period('2026-01-01', '2026-01-06') }).series[0].archived, true);
  assert.equal(getJourneyTogether({ dataset, period: period('2026-01-11', '2026-01-19') }).series.length, 0);

  dataset.lifecycle?.push({ id: 'restore', taskId: task.id, type: 'restored',
    occurredAt: '2026-01-20T12:00:00.000Z', localDate: '2026-01-20',
    utcOffsetMinutes: 0, timeZone: 'UTC' });
  dataset.lifecycle?.push({ id: 'archive-again', taskId: task.id, type: 'archived',
    occurredAt: '2026-01-25T12:00:00.000Z', localDate: '2026-01-25',
    utcOffsetMinutes: 0, timeZone: 'UTC' });
  assert.deepEqual(tasksRelevantToPeriod(dataset, period('2026-01-20', '2026-01-24'), today).map(t => t.id), [task.id]);
  assert.deepEqual(tasksRelevantToPeriod(dataset, period('2026-01-25', '2026-02-10'), today), []);
});
