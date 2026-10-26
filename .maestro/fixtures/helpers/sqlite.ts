import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { setup } from '../../../tests/sqlite';
import { localDate, parseLocalDate } from '../../../src/domain/task';
import { getRatingDistribution } from '../../../src/analytics/ratingDistribution';
import { getRatingTrend } from '../../../src/analytics/ratingTrend';
import { getJourneyTogether } from '../../../src/analytics/journeyTogether';
import { selectedCombinedDataset } from '../../../src/analytics/combinedSelection';
import { getCombinedRecordingCalendar, getAnalyticsDataset, getRecordingConsistency,
  getWeekdayRecordingPattern } from '../../../src/analytics/service';
import { getRatingDistributionPeriod } from '../../../src/analytics/ratingDistribution';
import { AnalyticsEntry, AnalyticsTask } from '../../../src/analytics/types';
import { recordingUpdateFixture as fixture } from '../data/recording-update';
import { recordingDeleteFixture as deleteFixture } from '../data/recording-delete';
import { allInsightsArchiveFixture as archiveFixture } from '../data/all-insights-archive';
import { sameDayRecordingFixture as sameDayFixture } from '../data/same-day-recording';
import { historicalRecordingFixture as historicalFixture } from '../data/historical-recording';
import { dateFilterBoundariesFixture as boundaryFixture } from '../data/date-filter-boundaries';
import { sliderInteractionsFixture as sliderFixture } from '../data/slider-interactions';
import { levelReorderingBeforeRecordingFixture as levelBeforeFixture } from '../data/level-reordering-before-recording';
import { levelReorderingAfterRecordingFixture as levelAfterFixture } from '../data/level-reordering-after-recording';
import { chartSparseFixture } from '../data/chart-sparse-data';
import { chartManyRecordingsFixture } from '../data/chart-many-recordings';
import { chartSkippedDaysFixture } from '../data/chart-skipped-days';
import { repeatedArchiveRestoreFixture } from '../data/repeated-archive-restore';
import { androidNavigationFixture } from '../data/android-navigation';
import { deleteAllEmptyStatesFixture } from '../data/delete-all-empty-states';
import { getIndividualRecordingConsistency } from '../../../src/analytics/recordingConsistency';
import { getWeekdayPatterns } from '../../../src/analytics/weekdayPatterns';
import { getTaskTrendData } from '../../../src/analytics/ratingTrendPresentation';
import { individualCalendarData } from '../../../src/components/analytics/individualCalendar';

export function dateDaysAgo(today: string, daysAgo: number) {
  const date = parseLocalDate(today);
  date.setDate(date.getDate() - daysAgo);
  return localDate(date);
}

/** Converts SQLite's null-prototype query rows to ordinary objects for strict fixture comparisons. */
export function normalizeSqliteRows<T extends object>(rows: readonly T[]): T[] {
  return rows.map(row => Object.assign({}, row));
}

type ChartFixtureActivity = {
  id: string; name: string; createdDaysAgo: number;
  levels: readonly { id: string; title: string; description: string }[];
  recordings?: readonly { daysAgo: number; levelIndex: number }[];
  days?: readonly { daysAgo: number; state: 'skipped' | 'recorded' | 'missing'; levelIndex: number | null }[];
};

function chartFixtureIds(activityIds: readonly string[]) {
  let nextActivity = 0, nextEntry = 0;
  return () => nextActivity < activityIds.length ? activityIds[nextActivity++] :
    `chart-fixture-entry-${String(++nextEntry).padStart(4, '0')}`;
}

async function seedChartFixtureDatabase(path: string, today: string, activities: readonly ChartFixtureActivity[]) {
  parseLocalDate(today);
  resetFixtureDatabase(path);
  const store = await setup(path, chartFixtureIds(activities.map(activity => activity.id)));
  let expectedEntryCount = 0;
  try {
    const fixtureRecordings: { activityId: string; localDate: string; levelId: string }[] = [];
    for (const activity of activities) {
      const task = await store.tasks.create({ name: activity.name, options: activity.levels.map(level => ({
        id: level.id, label: level.title, description: level.description,
      })) });
      assert.equal(task.id, activity.id);
      const createdLocalDate = dateDaysAgo(today, activity.createdDaysAgo);
      const createdAtDate = parseLocalDate(createdLocalDate);
      createdAtDate.setHours(12, 0, 0, 0);
      const createdAt = createdAtDate.toISOString();
      await store.db.runAsync('UPDATE tasks SET createdLocalDate = ?, createdAt = ? WHERE id = ?',
        createdLocalDate, createdAt, activity.id);
      const recordings = activity.recordings ?? activity.days?.filter(day => day.state !== 'missing')
        .map(day => ({ daysAgo: day.daysAgo, levelIndex: day.levelIndex! })) ?? [];
      for (const recording of recordings) {
        const level = task.options[recording.levelIndex];
        assert.ok(level, `Fixture level ${recording.levelIndex} exists for ${activity.name}.`);
        fixtureRecordings.push({ activityId: activity.id,
          localDate: dateDaysAgo(today, recording.daysAgo), levelId: level.id });
      }
    }
    for (const recording of fixtureRecordings) {
      await store.entries.upsert(recording.activityId, recording.localDate, recording.levelId);
      expectedEntryCount++;
    }
    await store.db.runAsync("INSERT INTO app_metadata(key, value) VALUES ('legacyImported', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const tasks = await store.tasks.getAll();
    const entries = await store.entries.getAll();
    assert.equal(tasks.length, activities.length);
    assert.equal(entries.length, expectedEntryCount);
    assert.equal(new Set(entries.map(entry => `${entry.taskId}:${entry.localDate}`)).size, entries.length,
      'Fixture has at most one recording per activity and local date.');
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

async function readChartFixture(path: string) {
  const store = await setup(path);
  try {
    const tasks = await store.tasks.getAll();
    const entries = await store.entries.getAll();
    const lifecycle = await store.tasks.getLifecycleTransitions();
    const dataset = getAnalyticsDataset(tasks, entries, lifecycle);
    return { store, tasks, entries, lifecycle, dataset };
  } catch (error) {
    store.native.close();
    throw error;
  }
}

export async function seedChartSparseDatabase(path: string, today: string) {
  await seedChartFixtureDatabase(path, today, chartSparseFixture.activities);
  await verifyChartSparseDatabase(path, today);
}

export async function verifyChartSparseDatabase(path: string, today: string) {
  const { store, tasks, entries, lifecycle, dataset } = await readChartFixture(path);
  try {
    assert.equal(tasks.length, 2);
    assert.equal(entries.length, chartSparseFixture.expected.combinedTotal);
    const workout = dataset.tasks.find(task => task.id === 'chart-sparse-workout')!;
    const reading = dataset.tasks.find(task => task.id === 'chart-sparse-reading')!;
    const presetCounts = (task: typeof workout, range: '7D' | '30D' | '90D') => {
      const period = getRatingDistributionPeriod(today, range);
      const distribution = getRatingDistribution(task, entries, period);
      return distribution.reduce((sum, row) => sum + row.count, 0);
    };
    assert.deepEqual([presetCounts(workout, '7D'), presetCounts(workout, '30D'), presetCounts(workout, '90D')], [1, 2, 2]);
    const allYear = { startDate: dateDaysAgo(today, chartSparseFixture.customRange.startDaysAgo), endDate: today };
    const workoutTrend = getRatingTrend({ task: workout, entries, period: allYear });
    assert.equal(workoutTrend.observations.length, 4);
    assert.deepEqual(workoutTrend.observations.map(item => item.date),
      chartSparseFixture.activities[0].recordings.map(item => dateDaysAgo(today, item.daysAgo)).sort());
    assert.equal(workoutTrend.observations.every(item => !item.connectsToPrevious), true,
      'Sparse observations never connect across missing days.');
    const workoutDistribution = getRatingDistribution(workout, entries, allYear);
    assert.deepEqual(Object.fromEntries(workoutDistribution.map(row => [row.label, row.count])),
      chartSparseFixture.expected.workoutCounts);
    const emptyRange = { startDate: dateDaysAgo(today, chartSparseFixture.customRange.emptyStartDaysAgo),
      endDate: dateDaysAgo(today, chartSparseFixture.customRange.emptyEndDaysAgo) };
    assert.equal(getRatingTrend({ task: workout, entries, period: emptyRange }).observations.length, 0);
    assert.equal(getRatingDistribution(workout, entries, emptyRange).reduce((sum, row) => sum + row.count, 0), 0);
    const readingPeriod = getRatingDistributionPeriod(today, '90D');
    assert.equal(getRatingTrend({ task: reading, entries, period: readingPeriod }).observations.length, 1,
      'A one-recording history remains a single observation.');
    assert.deepEqual(Object.fromEntries(getRatingDistribution(reading, entries, readingPeriod)
      .filter(row => row.count).map(row => [row.label, row.count])), chartSparseFixture.expected.readingCounts);
    const calendar = individualCalendarData(workout, entries, today.slice(0, 7));
    assert.equal(calendar.cells.filter(cell => cell.optionId).length,
      entries.filter(entry => entry.taskId === workout.id && entry.localDate.startsWith(today.slice(0, 7))).length);
    const combined = selectedCombinedDataset(dataset);
    assert.equal(combined.tasks.length, 2, 'Both selected fixture activities contribute to All Insights.');
    const journey = getJourneyTogether({ dataset: combined, period: allYear, range: 'CUSTOM' });
    assert.deepEqual(journey.series.map(series => series.taskId), ['chart-sparse-workout', 'chart-sparse-reading']);
    assert.deepEqual(journey.series.map(series => series.points.length), [4, 1]);
    const combinedCoverage = getRecordingConsistency(combined.tasks, combined.entries, allYear,
      combined.lifecycle ?? [], today);
    assert.equal(combinedCoverage.recordedDays, 5);
    assert.equal(combinedCoverage.eligibleDays, 426);
    const combinedWeekdays = getWeekdayRecordingPattern(combined.tasks, combined.entries, allYear);
    assert.equal(combinedWeekdays.reduce((sum, day) => sum + day.observations, 0), 5);
    return { activityCount: tasks.length, recordingCount: entries.length,
      workoutCounts: chartSparseFixture.expected.workoutCounts,
      presetCounts: { '7D': 1, '30D': 2, '90D': 2 }, customCount: workoutTrend.observations.length,
      emptyCount: 0, combinedActivityCount: combined.tasks.length, combinedRecordedDays: combinedCoverage.recordedDays,
      combinedEligibleDays: combinedCoverage.eligibleDays };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function seedChartSkippedDaysDatabase(path: string, today: string) {
  await seedChartFixtureDatabase(path, today, chartSkippedDaysFixture.activities);
  await verifyChartSkippedDaysDatabase(path, today);
}

export async function verifyChartSkippedDaysDatabase(path: string, today: string) {
  const { store, tasks, entries, lifecycle, dataset } = await readChartFixture(path);
  try {
    const mixed = dataset.tasks.find(task => task.id === 'chart-skipped-mixed')!;
    const period = { startDate: dateDaysAgo(today, 29), endDate: today };
    const mixedEntries = entries.filter(entry => entry.taskId === mixed.id &&
      entry.localDate >= period.startDate && entry.localDate <= period.endDate);
    assert.equal(mixedEntries.length, chartSkippedDaysFixture.expected.mixedRecorded);
    const distribution = getRatingDistribution(mixed, entries, period);
    const counts = Object.fromEntries(distribution.map(row => [row.label, row.count]));
    assert.deepEqual(counts, { Skipped: 7, Low: 4, Good: 4 });
    const presentDates = new Set(mixedEntries.map(entry => entry.localDate));
    const missingDates = Array.from({ length: 30 }, (_, index) => dateDaysAgo(today, index))
      .filter(date => !presentDates.has(date));
    assert.equal(missingDates.length, chartSkippedDaysFixture.expected.missing);
    const trend = getRatingTrend({ task: mixed, entries, period });
    assert.equal(trend.observations.length, 15);
    assert.deepEqual(trend.observations.map(item => item.date),
      mixedEntries.map(entry => entry.localDate).sort(),
      'Each actual recording produces one observation, and absent dates produce none.');
    assert.equal(trend.observations.some(item => item.labelAtEntry === 'Skipped'), true,
      'Explicit Skipped choices remain observations with their own label.');
    assert.equal(trend.observations.every(item => !missingDates.includes(item.date)), true,
      'Missing days do not become trend observations.');
    assert.equal(trend.observations.filter(item => item.labelAtEntry === 'Skipped').length, 7);
    assert.equal(trend.observations.every(item => item.connectsToPrevious ===
      presentDates.has(dateDaysAgo(item.date, 1))), true,
      'Connections follow production semantics: true only when the immediately preceding calendar day has a recording.');
    const coverage = getIndividualRecordingConsistency({ task: mixed, entries, lifecycle, period, today, timeline: '30D' });
    assert.equal(coverage.eligibleDays, 30);
    assert.equal(coverage.recordedDays, 15, 'Explicit Skipped is recorded presence; missing dates are not.');
    assert.equal(coverage.percentage, 50);
    const weekday = getWeekdayPatterns({ task: mixed, entries, period, timeline: '30D' });
    assert.equal(weekday.recordedCount, 15);
    assert.equal(weekday.rows.reduce((sum, row) => sum + row.total, 0), 15);
    assert.equal(weekday.rows.flatMap(row => row.cells).filter(cell => cell.label === 'Skipped')
      .reduce((sum, cell) => sum + cell.count, 0), 7);
    const months = [...new Set(Array.from({ length: 30 }, (_, index) => dateDaysAgo(today, index).slice(0, 7)))];
    const calendarCells = months.flatMap(month => individualCalendarData(mixed, entries, month).cells);
    for (let index = 0; index < 30; index++) {
      const date = dateDaysAgo(today, index);
      const cell = calendarCells.find(item => item.date === date)!;
      assert.equal(!!cell.optionId, presentDates.has(date), `Calendar state matches recording presence for ${date}.`);
      const entry = mixedEntries.find(item => item.localDate === date);
      if (entry?.optionLabelAtEntry === 'Skipped') assert.equal(cell.label, 'Skipped');
    }
    const combined = selectedCombinedDataset(dataset);
    assert.equal(combined.tasks.length, 2);
    assert.equal(combined.entries.length, 45);
    const combinedCoverage = getRecordingConsistency(combined.tasks, combined.entries, period,
      combined.lifecycle ?? [], today);
    assert.equal(combinedCoverage.recordedDays, 45);
    assert.equal(combinedCoverage.eligibleDays, 60);
    const combinedCalendar = getCombinedRecordingCalendar(combined.tasks, combined.entries, period,
      combined.lifecycle ?? [], today);
    assert.equal(combinedCalendar.reduce((sum, day) => sum + day.recorded, 0), 45);
    const weekdayCombined = getWeekdayRecordingPattern(combined.tasks, combined.entries, period);
    assert.equal(weekdayCombined.reduce((sum, day) => sum + day.observations, 0), 45);
    const journey = getJourneyTogether({ dataset: combined, period, range: '30D' });
    assert.equal(journey.series.length, 2);
    return { activityCount: tasks.length, recordingCount: entries.length,
      mixedRecorded: mixedEntries.length, skippedCount: counts.Skipped, regularRatingCount: counts.Low + counts.Good,
      missingCount: missingDates.length, coverageRecorded: coverage.recordedDays,
      coverageEligible: coverage.eligibleDays, combinedRecorded: combinedCoverage.recordedDays,
      combinedEligible: combinedCoverage.eligibleDays };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function seedChartManyRecordingsDatabase(path: string, today: string) {
  await seedChartFixtureDatabase(path, today, chartManyRecordingsFixture.activities);
  await verifyChartManyRecordingsDatabase(path, today);
}

export async function verifyChartManyRecordingsDatabase(path: string, today: string) {
  const { store, tasks, entries, dataset } = await readChartFixture(path);
  try {
    assert.equal(tasks.length, chartManyRecordingsFixture.expected.activityCount);
    assert.equal(entries.length, chartManyRecordingsFixture.expected.totalRecordings);
    assert.equal(new Set(entries.map(entry => `${entry.taskId}:${entry.localDate}`)).size, entries.length);
    const ranges = [
      { timeline: '7D' as const, days: 7 }, { timeline: '30D' as const, days: 30 },
      { timeline: '90D' as const, days: 90 }, { timeline: 'CUSTOM' as const, days: 365 },
    ];
    for (const task of dataset.tasks) {
      const taskEntries = entries.filter(entry => entry.taskId === task.id);
      assert.equal(taskEntries.length, 365);
      assert.equal(new Set(taskEntries.map(entry => entry.localDate)).size, 365);
      for (const { timeline, days } of ranges) {
        const period = { startDate: dateDaysAgo(today, days - 1), endDate: today };
        const view = getTaskTrendData({ task, entries, period }, timeline).view;
        assert.equal(view.recordedCount, days, `${task.id} keeps all ${days} selected daily observations.`);
        const raw = view.presentation === 'weekly' ? view.weeklyPoints.flatMap(week => week.observations) :
          getRatingTrend({ task, entries, period }).observations;
        assert.equal(raw.length, days);
        assert.equal(raw.every(observation => observation.levelIndex >= 0 &&
          observation.levelIndex < task.options.length), true, 'Trend levels stay within their activity scale.');
        if (view.presentation === 'weekly') {
          assert.equal(view.weeklyPoints.reduce((sum, week) => sum + week.observations.length, 0), days);
          assert.equal(view.weeklyPoints.every(week => week.medianLevelIndex >= 0 &&
            week.medianLevelIndex < task.options.length), true);
        }
      }
    }
    const combined = selectedCombinedDataset(dataset);
    assert.equal(combined.tasks.length, chartManyRecordingsFixture.expected.combinedSelectedCount,
      'All Activities includes every activity selected under the existing five-activity participation limit.');
    assert.equal(combined.entries.length, 5 * 365);
    const year = { startDate: dateDaysAgo(today, 364), endDate: today };
    const journey = getJourneyTogether({ dataset: combined, period: year, range: 'CUSTOM' });
    assert.equal(journey.series.length, 5);
    assert.equal(journey.series.every(series => series.points.reduce((sum, point) => sum + point.recordedCount, 0) === 365), true,
      'All selected activities retain every observation across grouped miniature points.');
    const coverage = getRecordingConsistency(combined.tasks, combined.entries, year,
      combined.lifecycle ?? [], today);
    assert.equal(coverage.recordedDays, 5 * 365);
    assert.equal(coverage.eligibleDays, 5 * 365);
    return { activityCount: tasks.length, recordingCount: entries.length,
      selectedCombinedActivities: combined.tasks.length, combinedRecordedDays: coverage.recordedDays,
      combinedEligibleDays: coverage.eligibleDays };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function seedRepeatedArchiveRestoreDatabase(path: string, today: string) {
  await seedChartFixtureDatabase(path, today, repeatedArchiveRestoreFixture.activities);
  await verifyRepeatedArchiveRestoreDatabase(path, today, 'initial');
}

export async function verifyRepeatedArchiveRestoreDatabase(
  path: string,
  today: string,
  state: 'initial' | 'final' = 'final',
) {
  const { store, tasks, entries, lifecycle, dataset } = await readChartFixture(path);
  try {
    const fixture = repeatedArchiveRestoreFixture;
    const expectedIds = fixture.activities.map(activity => activity.id);
    assert.equal(tasks.length, fixture.expected.activityCount);
    assert.deepEqual([...new Set(tasks.map(task => task.id))].sort(), [...expectedIds].sort(),
      'The same three activity identities remain, without duplicates.');
    assert.equal(entries.length, fixture.expected.recordingCount,
      'Every original recording remains stored.');
    assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length,
      'Recording IDs remain unique.');
    assert.equal(new Set(entries.map(entry => `${entry.taskId}:${entry.localDate}`)).size, entries.length,
      'There is at most one recording per activity and local date.');

    const expectedEntries = fixture.activities.flatMap(activity => activity.recordings.map(recording => ({
      taskId: activity.id,
      localDate: dateDaysAgo(today, recording.daysAgo),
      optionId: activity.levels[recording.levelIndex].id,
      optionLabelAtEntry: activity.levels[recording.levelIndex].title,
    }))).sort((a, b) => `${a.taskId}:${a.localDate}`.localeCompare(`${b.taskId}:${b.localDate}`));
    const actualEntries = entries.map(entry => ({ taskId: entry.taskId, localDate: entry.localDate,
      optionId: entry.optionId, optionLabelAtEntry: entry.optionLabelAtEntry }))
      .sort((a, b) => `${a.taskId}:${a.localDate}`.localeCompare(`${b.taskId}:${b.localDate}`));
    assert.deepEqual(actualEntries, expectedEntries,
      'All fixture dates and selected level identities/labels remain unchanged.');

    for (const activity of fixture.activities) {
      const task = tasks.find(item => item.id === activity.id)!;
      assert.equal(task.name, activity.name);
      assert.equal(task.active, true, `${activity.name} is active in the ${state} state.`);
      assert.deepEqual(task.options.map(option => ({ id: option.id, label: option.label,
        description: option.description })), activity.levels.map(level => ({ id: level.id,
        label: level.title, description: level.description })),
      `${activity.name} keeps its level IDs, titles, descriptions, and order.`);
    }

    const transitions = lifecycle.filter(event => expectedIds.includes(event.taskId));
    assert.equal(new Set(transitions.map(event => event.id)).size, transitions.length,
      'Lifecycle transition IDs are unique.');
    const workoutId = fixture.activities[0].id;
    const readingId = fixture.activities[1].id;
    const workoutHistory = transitions.filter(event => event.taskId === workoutId).map(event => event.type);
    const readingHistory = transitions.filter(event => event.taskId === readingId).map(event => event.type);
    assert.deepEqual(workoutHistory, state === 'initial' ? [] :
      ['archived', 'restored', 'archived', 'restored', 'archived', 'restored']);
    assert.deepEqual(readingHistory, state === 'initial' ? [] : ['archived', 'restored']);
    assert.equal(transitions.filter(event => event.taskId === fixture.activities[2].id).length, 0,
      'Guitar is unaffected by archive/restore operations on other activities.');

    const period = getRatingDistributionPeriod(today, '90D');
    const combined = selectedCombinedDataset(dataset);
    assert.deepEqual([...combined.tasks.map(task => task.id)].sort(), [...expectedIds].sort());
    assert.equal(combined.entries.length, fixture.expected.initialCombinedRecorded);
    const consistency = getRecordingConsistency(combined.tasks, combined.entries, period,
      combined.lifecycle ?? [], today);
    assert.deepEqual({ recorded: consistency.recordedDays, eligible: consistency.eligibleDays },
      { recorded: fixture.expected.initialCombinedRecorded, eligible: fixture.expected.combinedEligible });
    const journey = getJourneyTogether({ dataset: combined, period, range: '90D' });
    assert.equal(journey.series.length, 3);
    const recordedByActivity = Object.fromEntries(journey.series.map(series => [series.taskId,
      series.points.reduce((sum, point) => sum + point.recordedCount, 0)]));
    assert.deepEqual(recordedByActivity, Object.fromEntries(fixture.activities.map(activity =>
      [activity.id, activity.recordings.length])));

    return { activityCount: tasks.length, archivedActivityCount: tasks.filter(task => !task.active).length,
      recordingCount: entries.length, lifecycleTransitions: transitions.length,
      combinedRecordedDays: consistency.recordedDays, combinedEligibleDays: consistency.eligibleDays,
      workoutHistoryCount: fixture.activities[0].recordings.length };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupRepeatedArchiveRestoreDatabase(path: string) {
  await cleanupFixtureActivities(path, repeatedArchiveRestoreFixture.activities.map(activity => activity.id));
}

export async function verifyRepeatedArchiveRestoreFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, repeatedArchiveRestoreFixture.activities.map(activity => activity.id));
}

export async function seedAndroidNavigationDatabase(path: string, today: string) {
  await seedChartFixtureDatabase(path, today, androidNavigationFixture.activities);
  await verifyAndroidNavigationDatabase(path, today, 'initial');
}

export async function verifyAndroidNavigationDatabase(
  path: string,
  today: string,
  state: 'initial' | 'workoutTodayModerate' = 'initial',
) {
  const { store, tasks, entries, lifecycle, dataset } = await readChartFixture(path);
  try {
    const fixture = androidNavigationFixture;
    assert.equal(tasks.length, fixture.expected.activityCount);
    assert.deepEqual([...new Set(tasks.map(task => task.id))].sort(),
      fixture.activities.map(activity => activity.id).sort());
    assert.equal(entries.length, fixture.expected.recordingCount);
    assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
    assert.equal(new Set(entries.map(entry => `${entry.taskId}:${entry.localDate}`)).size, entries.length);
    assert.equal(lifecycle.length, 0, 'The navigation scenarios do not archive or restore fixture activities.');

    const expectedEntries = fixture.activities.flatMap(activity => activity.recordings.map(recording => {
      const level = activity.levels[activity.id === 'android-nav-workout' &&
        state === 'workoutTodayModerate' && recording.daysAgo === 0 ? 1 : recording.levelIndex];
      return { taskId: activity.id, localDate: dateDaysAgo(today, recording.daysAgo),
        optionId: level.id, optionLabelAtEntry: level.title };
    })).sort((a, b) => `${a.taskId}:${a.localDate}`.localeCompare(`${b.taskId}:${b.localDate}`));
    const actualEntries = entries.map(entry => ({ taskId: entry.taskId, localDate: entry.localDate,
      optionId: entry.optionId, optionLabelAtEntry: entry.optionLabelAtEntry }))
      .sort((a, b) => `${a.taskId}:${a.localDate}`.localeCompare(`${b.taskId}:${b.localDate}`));
    assert.deepEqual(actualEntries, expectedEntries,
      'Only the intentionally committed Workout check-in may differ from the fixture.');

    for (const activity of fixture.activities) {
      const task = tasks.find(item => item.id === activity.id)!;
      assert.equal(task.name, activity.name);
      assert.equal(task.active, true);
      assert.deepEqual(task.options.map(option => ({ id: option.id, label: option.label,
        description: option.description })), activity.levels.map(level => ({ id: level.id,
        label: level.title, description: level.description })));
    }

    const workout = dataset.tasks.find(task => task.id === 'android-nav-workout')!;
    const period = { startDate: dateDaysAgo(today, 29), endDate: today };
    const distribution = getRatingDistribution(workout, entries, period);
    assert.equal(distribution.reduce((sum, row) => sum + row.count, 0), 3);
    if (state === 'workoutTodayModerate') {
      assert.deepEqual(Object.fromEntries(distribution.filter(row => row.count)
        .map(row => [row.label, row.count])), { Low: 1, Moderate: 2 });
    } else {
      assert.deepEqual(Object.fromEntries(distribution.filter(row => row.count)
        .map(row => [row.label, row.count])), { Low: 1, Moderate: 1, High: 1 });
    }
    const combined = selectedCombinedDataset(dataset);
    assert.equal(combined.tasks.length, 2);
    assert.equal(combined.entries.length, 5);
    const consistency = getRecordingConsistency(combined.tasks, combined.entries, period,
      combined.lifecycle ?? [], today);
    assert.deepEqual({ recorded: consistency.recordedDays, eligible: consistency.eligibleDays },
      { recorded: 5, eligible: 8 });
    const journey = getJourneyTogether({ dataset: combined, period, range: '30D' });
    assert.equal(journey.series.reduce((sum, series) => sum + series.points.reduce((count, point) =>
      count + point.recordedCount, 0), 0), 5);
    return { activityCount: tasks.length, recordingCount: entries.length,
      workoutCounts: Object.fromEntries(distribution.filter(row => row.count).map(row => [row.label, row.count])),
      combinedRecordedDays: consistency.recordedDays, combinedEligibleDays: consistency.eligibleDays };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupAndroidNavigationDatabase(path: string) {
  await cleanupFixtureActivities(path, androidNavigationFixture.activities.map(activity => activity.id));
}

export async function verifyAndroidNavigationFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, androidNavigationFixture.activities.map(activity => activity.id));
}

export async function seedDeleteAllEmptyStatesDatabase(path: string, today: string) {
  await seedChartFixtureDatabase(path, today, deleteAllEmptyStatesFixture.activities);
  await verifyDeleteAllEmptyStatesDatabase(path, today, 'initial');
}

/** Verifies each expected lifecycle checkpoint against the real repository and analytics functions. */
export async function verifyDeleteAllEmptyStatesDatabase(
  path: string,
  today: string,
  state: 'initial' | 'workoutDeleted' | 'readingDeleted' | 'allDeleted' = 'initial',
) {
  const { store, tasks, entries, lifecycle, dataset } = await readChartFixture(path);
  try {
    const fixture = deleteAllEmptyStatesFixture;
    const deletedCount = state === 'initial' ? 0 : state === 'workoutDeleted' ? 1 : state === 'readingDeleted' ? 2 : 3;
    const remaining = fixture.activities.slice(deletedCount);
    const expectedIds = remaining.map(activity => activity.id);
    assert.deepEqual(tasks.map(task => task.id), expectedIds,
      `The ${state} database contains only the expected activities in their original order.`);
    assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length, 'No duplicate activity IDs exist.');
    assert.equal(tasks.every(task => task.active), true, 'No deleted item remains archived or active.');
    assert.equal(lifecycle.length, 0, 'Permanent deletion does not leave archive/restore history.');

    const expectedEntries = remaining.flatMap(activity => activity.recordings.map(recording => ({
      taskId: activity.id,
      localDate: dateDaysAgo(today, recording.daysAgo),
      optionId: activity.levels[recording.levelIndex].id,
    }))).sort((a, b) => `${a.taskId}:${a.localDate}`.localeCompare(`${b.taskId}:${b.localDate}`));
    const actualEntries = entries.map(entry => ({ taskId: entry.taskId, localDate: entry.localDate,
      optionId: entry.optionId })).sort((a, b) => `${a.taskId}:${a.localDate}`.localeCompare(`${b.taskId}:${b.localDate}`));
    assert.deepEqual(actualEntries, expectedEntries, 'Remaining recordings retain their exact activity, date, and level.');
    assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length, 'No duplicate recording IDs exist.');
    assert.equal(new Set(entries.map(entry => `${entry.taskId}:${entry.localDate}`)).size, entries.length,
      'There is at most one recording per activity and calendar day.');

    const optionRows = normalizeSqliteRows(await store.db.getAllAsync<{ id: string; taskId: string; label: string;
      description: string | null; position: number }>(
      'SELECT id, taskId, label, description, position FROM task_options ORDER BY taskId, position'));
    const expectedOptions = remaining.flatMap(activity => activity.levels.map((level, index) => ({
      id: level.id, taskId: activity.id, label: level.title, description: level.description, position: index + 1,
    }))).sort((a, b) => `${a.taskId}:${a.position}`.localeCompare(`${b.taskId}:${b.position}`));
    assert.deepEqual(optionRows, expectedOptions, 'Each remaining activity keeps its original level definitions and order.');

    const orphanOptions = await store.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM task_options o LEFT JOIN tasks t ON t.id = o.taskId WHERE t.id IS NULL');
    const orphanEntries = await store.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM daily_entries e LEFT JOIN tasks t ON t.id = e.taskId WHERE t.id IS NULL');
    assert.equal(orphanOptions?.count, 0, 'No orphaned level definitions remain.');
    assert.equal(orphanEntries?.count, 0, 'No orphaned recordings remain.');
    assert.equal(optionRows.length, remaining.length * 3);

    const combined = selectedCombinedDataset(dataset);
    assert.deepEqual(combined.tasks.map(task => task.id), expectedIds,
      'Production All Activities selection excludes every deleted activity.');
    assert.equal(combined.entries.length, expectedEntries.length);
    const period = getRatingDistributionPeriod(today, '90D');
    const consistency = getRecordingConsistency(combined.tasks, combined.entries, period,
      combined.lifecycle ?? [], today);
    assert.deepEqual({ recorded: consistency.recordedDays, eligible: consistency.eligibleDays }, {
      recorded: expectedEntries.length, eligible: remaining.length * 4,
    }, 'Production combined consistency contains only surviving activity-days.');
    const journey = getJourneyTogether({ dataset: combined, period, range: '90D' });
    assert.deepEqual(journey.series.map(series => series.taskId), expectedIds,
      'Production combined trend contains only surviving activities.');
    assert.equal(journey.series.reduce((sum, series) => sum + series.points.reduce((count, point) =>
      count + point.recordedCount, 0), 0), expectedEntries.length);
    const calendar = getCombinedRecordingCalendar(combined.tasks, combined.entries, period,
      combined.lifecycle ?? [], today);
    assert.equal(calendar.reduce((sum, day) => sum + day.recorded, 0), expectedEntries.length);
    assert.equal(calendar.reduce((sum, day) => sum + day.eligible, 0), remaining.length * 4);
    const weekday = getWeekdayRecordingPattern(combined.tasks, combined.entries, period);
    assert.equal(weekday.reduce((sum, day) => sum + day.observations, 0), expectedEntries.length);

    return { activityCount: tasks.length, archivedActivityCount: tasks.filter(task => !task.active).length,
      levelCount: optionRows.length, recordingCount: entries.length, combinedActivityCount: combined.tasks.length,
      combinedRecordedDays: consistency.recordedDays, combinedEligibleDays: consistency.eligibleDays };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupDeleteAllEmptyStatesDatabase(path: string) {
  await cleanupFixtureActivities(path, deleteAllEmptyStatesFixture.activities.map(activity => activity.id));
}

export async function verifyDeleteAllEmptyStatesFixtureRemoved(path: string) {
  const store = await setup(path);
  try {
    await verifyFixtureActivitiesRemovedWithRepositories(store.tasks, store.entries,
      deleteAllEmptyStatesFixture.activities.map(activity => activity.id));
    const ids = deleteAllEmptyStatesFixture.activities.map(activity => activity.id);
    const placeholders = ids.map(() => '?').join(', ');
    const levels = await store.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM task_options WHERE taskId IN (${placeholders})`, ...ids);
    const transitions = await store.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM task_lifecycle_transitions WHERE taskId IN (${placeholders})`, ...ids);
    assert.equal(levels?.count, 0, 'Fixture levels were removed.');
    assert.equal(transitions?.count, 0, 'Fixture lifecycle records were removed.');
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupChartSparseDatabase(path: string) {
  await cleanupFixtureActivities(path, chartSparseFixture.activities.map(activity => activity.id));
}
export async function verifyChartSparseFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, chartSparseFixture.activities.map(activity => activity.id));
}
export async function cleanupChartSkippedDaysDatabase(path: string) {
  await cleanupFixtureActivities(path, chartSkippedDaysFixture.activities.map(activity => activity.id));
}
export async function verifyChartSkippedDaysFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, chartSkippedDaysFixture.activities.map(activity => activity.id));
}
export async function cleanupChartManyRecordingsDatabase(path: string) {
  await cleanupFixtureActivities(path, chartManyRecordingsFixture.activities.map(activity => activity.id));
}
export async function verifyChartManyRecordingsFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, chartManyRecordingsFixture.activities.map(activity => activity.id));
}

function levelReorderingBeforeIds() {
  let next = 0;
  return () => next++ === 0 ? levelBeforeFixture.activity.id : `level-before-entry-${next}`;
}

function levelReorderingAfterIds() {
  let next = 0;
  return () => next++ === 0 ? levelAfterFixture.activity.id : `level-after-entry-${next}`;
}

export async function seedLevelReorderingBeforeDatabase(path: string) {
  resetFixtureDatabase(path);
  const store = await setup(path, levelReorderingBeforeIds());
  try {
    const activity = await store.tasks.create({ name: levelBeforeFixture.activity.name,
      options: levelBeforeFixture.activity.levels.map(level => ({ id: level.id, label: level.title, description: level.description })) });
    assert.equal(activity.id, levelBeforeFixture.activity.id);
    assert.equal(activity.options.length, 4);
    assert.equal((await store.entries.getAll()).filter(entry => entry.taskId === activity.id).length, 0);
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function verifyLevelReorderingBeforeDatabase(path: string, reordered = false) {
  const store = await setup(path, levelReorderingBeforeIds());
  try {
    const tasks = await store.tasks.getAll();
    assert.equal(tasks.length, 1);
    const activity = tasks[0];
    assert.equal(activity.id, levelBeforeFixture.activity.id);
    assert.equal(activity.name, levelBeforeFixture.activity.name);
    const expectedIds = reordered ? levelBeforeFixture.expectedFinalIds : levelBeforeFixture.expectedInitialIds;
    assert.deepEqual(activity.options.map(level => level.id), [...expectedIds], 'Level identity order is correct.');
    assert.deepEqual(activity.options.map(level => ({ title: level.label, description: level.description })),
      expectedIds.map(id => {
        const level = levelBeforeFixture.activity.levels.find(candidate => candidate.id === id)!;
        return { title: level.title, description: level.description };
      }), 'Each level keeps its original title and description.');
    assert.equal(new Set(activity.options.map(level => level.id)).size, 4, 'No levels are duplicated.');
    assert.equal(new Set(activity.options.map(level => level.position)).size, 4, 'Ordering positions are unique.');
    const entries = (await store.entries.getAll()).filter(entry => entry.taskId === activity.id);
    assert.deepEqual(entries, [], 'No recordings were created in the before-recording scenario.');
    return { activityCount: tasks.length, levelCount: activity.options.length, recordingCount: entries.length,
      order: activity.options.map(level => level.label) };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function seedLevelReorderingAfterDatabase(path: string, deviceToday: string) {
  parseLocalDate(deviceToday);
  resetFixtureDatabase(path);
  const store = await setup(path, levelReorderingAfterIds());
  try {
    const activity = await store.tasks.create({ name: levelAfterFixture.activity.name,
      options: levelAfterFixture.activity.levels.map(level => ({ id: level.id, label: level.title, description: level.description })) });
    assert.equal(activity.id, levelAfterFixture.activity.id);
    const level = activity.options[levelAfterFixture.initialRecording.levelIndex];
    assert.ok(level);
    await store.entries.upsert(activity.id, dateDaysAgo(deviceToday, levelAfterFixture.initialRecording.daysAgo), level.id);
    const persisted = await store.tasks.getById(activity.id);
    assert.equal(persisted?.levelsLocked, true, 'The first recording locks the level definitions.');
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function verifyLevelReorderingAfterDatabase(path: string, deviceToday: string, updated = false) {
  const store = await setup(path, levelReorderingAfterIds());
  try {
    const tasks = await store.tasks.getAll();
    assert.equal(tasks.length, 1);
    const activity = tasks[0];
    assert.equal(activity.id, levelAfterFixture.activity.id);
    assert.equal(activity.levelsLocked, true);
    assert.deepEqual(activity.options.map(level => level.id), levelAfterFixture.activity.levels.map(level => level.id));
    assert.deepEqual(activity.options.map(level => ({ title: level.label, description: level.description })),
      levelAfterFixture.activity.levels.map(level => ({ title: level.title, description: level.description })));
    const entries = (await store.entries.getHistoryForTask(activity.id, {
      from: dateDaysAgo(deviceToday, levelAfterFixture.initialRecording.daysAgo),
      to: dateDaysAgo(deviceToday, levelAfterFixture.initialRecording.daysAgo),
    }));
    assert.equal(entries.length, 1, 'Exactly one recording exists on the fixture date.');
    const expectedLevel = levelAfterFixture.activity.levels[updated ? levelAfterFixture.updatedLevelIndex : levelAfterFixture.initialRecording.levelIndex];
    assert.equal(entries[0].optionId, expectedLevel.id, 'The daily recording points at the selected level identity.');
    assert.equal(entries[0].optionLabelAtEntry, expectedLevel.title, 'The recording snapshot matches its selected level.');
    return { activityCount: tasks.length, levelCount: activity.options.length, recordingCount: entries.length,
      recordingDate: entries[0].localDate, recordingValue: entries[0].optionLabelAtEntry };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupLevelReorderingBeforeDatabase(path: string) {
  await cleanupFixtureActivities(path, [levelBeforeFixture.activity.id]);
}
export async function verifyLevelReorderingBeforeFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, [levelBeforeFixture.activity.id]);
}
export async function cleanupLevelReorderingAfterDatabase(path: string) {
  await cleanupFixtureActivities(path, [levelAfterFixture.activity.id]);
}
export async function verifyLevelReorderingAfterFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, [levelAfterFixture.activity.id]);
}

/** Removes only a generated fixture database and its SQLite sidecars. */
export function resetFixtureDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const file = path + suffix;
    if (existsSync(file)) rmSync(file);
  }
}

function ids() {
  let next = 1;
  return () => next++ === 1 ? fixture.id : `recording-update-generated-${String(next - 1).padStart(3, '0')}`;
}

export async function seedRecordingUpdateDatabase(path: string, deviceToday: string) {
  parseLocalDate(deviceToday);
  resetFixtureDatabase(path);
  const store = await setup(path, ids());
  try {
    const task = await store.tasks.create({ name: fixture.name, options: fixture.levels.map(level => ({
      id: level.id, label: level.title, description: level.description,
    })) });
    for (const recording of fixture.recordings) {
      const date = dateDaysAgo(deviceToday, recording.daysAgo);
      const level = task.options[recording.levelIndex];
      assert.ok(level, `Fixture level index ${recording.levelIndex} exists.`);
      await store.entries.upsert(task.id, date, level.id);
    }
    await store.connection.run(db => db.runAsync(
      "INSERT INTO app_metadata(key, value) VALUES ('legacyImported', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value"));
    const seeded = await store.tasks.getById(task.id);
    assert.ok(seeded);
    assert.equal(seeded.name, fixture.name);
    assert.deepEqual(seeded.options.map(option => ({ label: option.label, description: option.description })),
      fixture.levels.map(level => ({ label: level.title, description: level.description })));
    assert.equal((await store.entries.getHistoryForTask(task.id, {
      from: dateDaysAgo(deviceToday, 2), to: deviceToday,
    })).length, 3);
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

/** Verifies fixture contents and production rating-distribution output. */
export async function verifyRecordingUpdateDatabase(path: string, deviceToday: string, edited = false) {
  const store = await setup(path, ids());
  try {
    const tasks = await store.tasks.getAll();
    assert.equal(tasks.length, 1, 'Exactly one fixture activity exists.');
    const task = tasks[0];
    assert.equal(task.id, fixture.id);
    assert.equal(task.name, fixture.name);
    assert.equal(task.active, true);
    assert.deepEqual(task.options.map(option => ({ label: option.label, description: option.description })),
      fixture.levels.map(level => ({ label: level.title, description: level.description })));

    const allEntries = await store.entries.getHistoryForTask(task.id, {
      from: dateDaysAgo(deviceToday, 2), to: deviceToday,
    });
    assert.equal(allEntries.length, 3, 'There is exactly one check-in for each fixture date.');
    assert.equal(new Set(allEntries.map(entry => entry.localDate)).size, 3, 'No duplicate dates exist.');
    const byDate = new Map(allEntries.map(entry => [entry.localDate, entry]));
    const expected = fixture.recordings.map(recording => ({
      date: dateDaysAgo(deviceToday, recording.daysAgo),
      optionId: task.options[edited && recording.daysAgo === fixture.editedRecording.daysAgo
        ? fixture.editedRecording.levelIndex : recording.levelIndex].id,
      label: fixture.levels[edited && recording.daysAgo === fixture.editedRecording.daysAgo
        ? fixture.editedRecording.levelIndex : recording.levelIndex].title,
    }));
    for (const record of expected) {
      const actual = byDate.get(record.date);
      assert.ok(actual, `Check-in exists for ${record.date}.`);
      assert.equal(actual.optionId, record.optionId, `Selected level identity is correct for ${record.date}.`);
      assert.equal(actual.optionLabelAtEntry, record.label, `Historical level snapshot is correct for ${record.date}.`);
    }

    const analyticsTask: AnalyticsTask = { ...task, color: task.chartColor ?? '#398F80' };
    const analyticsEntries: AnalyticsEntry[] = allEntries;
    const distribution = getRatingDistribution(analyticsTask, analyticsEntries, {
      startDate: dateDaysAgo(deviceToday, 2), endDate: deviceToday,
    });
    const counts = Object.fromEntries(distribution.map(row => [row.label, row.count]));
    const expectedCounts = edited ? fixture.expectedAfterEdit : { Low: 1, Moderate: 1, High: 1 };
    assert.deepEqual(counts, expectedCounts, 'Production rating-distribution calculation matches expected history.');
    return { activityCount: tasks.length, recordingCount: allEntries.length, distribution: counts };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

/** Deletes only this test's activity; repository foreign-key cascades clear its options and check-ins. */
export async function cleanupRecordingUpdateDatabase(path: string) {
  const store = await setup(path, ids());
  try {
    if (await store.tasks.getById(fixture.id)) await store.tasks.delete(fixture.id);
    assert.equal(await store.tasks.getById(fixture.id), undefined, 'Fixture activity was removed.');
    assert.deepEqual((await store.entries.getAll()).filter(entry => entry.taskId === fixture.id), [],
      'Fixture check-ins were removed with the activity.');
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function verifyRecordingUpdateFixtureRemoved(path: string) {
  const store = await setup(path, ids());
  try {
    assert.equal(await store.tasks.getById(fixture.id), undefined, 'Fixture activity is absent after cleanup.');
    assert.deepEqual((await store.entries.getAll()).filter(entry => entry.taskId === fixture.id), [],
      'Fixture check-ins are absent after cleanup.');
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

function deleteFixtureIds() {
  const activityIds = deleteFixture.activities.map(activity => activity.id);
  let activityIndex = 0;
  let entryIndex = 1;
  return () => activityIndex < activityIds.length ? activityIds[activityIndex++] :
    `recording-delete-entry-${String(entryIndex++).padStart(3, '0')}`;
}

export async function seedRecordingDeleteDatabase(path: string, deviceToday: string) {
  parseLocalDate(deviceToday);
  resetFixtureDatabase(path);
  const store = await setup(path, deleteFixtureIds());
  try {
    const tasks = [];
    for (const activity of deleteFixture.activities) {
      const task = await store.tasks.create({ name: activity.name, options: activity.levels.map(level => ({
        id: level.id, label: level.title, description: level.description,
      })) });
      assert.equal(task.id, activity.id);
      tasks.push(task);
    }
    for (const [activityIndex, activity] of deleteFixture.activities.entries()) {
      const task = tasks[activityIndex];
      for (const recording of activity.recordings) {
        const date = dateDaysAgo(deviceToday, recording.daysAgo);
        const level = task.options[recording.levelIndex];
        assert.ok(level, `Fixture level index ${recording.levelIndex} exists for ${activity.name}.`);
        await store.entries.upsert(task.id, date, level.id);
      }
    }
    await store.connection.run(db => db.runAsync(
      "INSERT INTO app_metadata(key, value) VALUES ('legacyImported', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value"));
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

/** Validates raw records and the same individual/combined analytics used by Insights. */
export async function verifyRecordingDeleteDatabase(path: string, deviceToday: string, deleted = false) {
  const store = await setup(path, deleteFixtureIds());
  try {
    const tasks = await store.tasks.getAll();
    assert.deepEqual(tasks.map(task => task.id), deleteFixture.activities.map(activity => activity.id),
      'Both fixture activities exist once and retain their order.');
    assert.equal(new Set(tasks.map(task => task.id)).size, 2, 'There are no duplicate activities.');
    assert.deepEqual(tasks.map(task => task.name), ['Workout', 'Reading']);
    for (const [index, activity] of deleteFixture.activities.entries()) {
      const task = tasks[index];
      assert.equal(task.active, true);
      assert.deepEqual(task.options.map(option => ({ label: option.label, description: option.description })),
        activity.levels.map(level => ({ label: level.title, description: level.description })));
    }

    const entries = await store.entries.getAll();
    const expectedCount = deleted ? 5 : 6;
    assert.equal(entries.length, expectedCount, `Expected ${expectedCount} total check-ins.`);
    const entryKeys = entries.map(entry => `${entry.taskId}:${entry.localDate}`);
    assert.equal(new Set(entryKeys).size, expectedCount, 'There are no duplicate activity/date check-ins.');
    const targetDate = dateDaysAgo(deviceToday, deleteFixture.deletedRecording.daysAgo);
    const workout = tasks.find(task => task.id === deleteFixture.activities[0].id)!;
    const reading = tasks.find(task => task.id === deleteFixture.activities[1].id)!;
    const workoutEntries = entries.filter(entry => entry.taskId === workout.id);
    const readingEntries = entries.filter(entry => entry.taskId === reading.id);
    assert.equal(workoutEntries.length, deleted ? 3 : 4);
    assert.equal(readingEntries.length, 2, 'Reading history remains unchanged.');
    const targetEntry = workoutEntries.find(entry => entry.localDate === targetDate);
    assert.equal(!!targetEntry, !deleted, 'Only the targeted Workout date is deleted.');
    assert.deepEqual(readingEntries.map(entry => [entry.localDate, entry.optionLabelAtEntry]).sort(),
      [
        [dateDaysAgo(deviceToday, 1), 'Low'],
        [deviceToday, 'High'],
      ].sort(), 'Reading’s two original recordings are unchanged.');

    const period = getRatingDistributionPeriod(deviceToday, '90D');
    const analyticsTasks: AnalyticsTask[] = tasks.map(task => ({
      ...task, color: task.chartColor ?? '#398F80',
    }));
    const byId = new Map(analyticsTasks.map(task => [task.id, task]));
    const analyticsEntries: AnalyticsEntry[] = entries;
    const workoutDistribution = getRatingDistribution(byId.get(workout.id)!, analyticsEntries, period);
    const readingDistribution = getRatingDistribution(byId.get(reading.id)!, analyticsEntries, period);
    const countMap = (rows: typeof workoutDistribution) => Object.fromEntries(rows.map(row => [row.label, row.count]));
    const workoutCounts = countMap(workoutDistribution);
    const readingCounts = countMap(readingDistribution);
    assert.deepEqual(workoutCounts, deleted ? { Low: 1, Moderate: 1, High: 1 } : { Low: 1, Moderate: 2, High: 1 });
    assert.deepEqual(readingCounts, { Low: 1, Moderate: 0, High: 1 });

    const workoutTrend = getRatingTrend({ task: byId.get(workout.id)!, entries: analyticsEntries, period });
    assert.equal(workoutTrend.observations.length, deleted ? 3 : 4);
    assert.equal(workoutTrend.observations.some(point => point.date === targetDate), !deleted,
      'The deleted date no longer contributes a trend observation.');
    const readingTrend = getRatingTrend({ task: byId.get(reading.id)!, entries: analyticsEntries, period });
    assert.equal(readingTrend.observations.length, 2);

    const dataset = getAnalyticsDataset(tasks, analyticsEntries, await store.tasks.getLifecycleTransitions());
    const combined = selectedCombinedDataset(dataset);
    assert.deepEqual(combined.tasks.map(task => task.id), deleteFixture.activities.map(activity => activity.id),
      'Both activities participate in All Insights.');
    const consistency = getRecordingConsistency(combined.tasks, combined.entries, period,
      combined.lifecycle, deviceToday);
    assert.equal(consistency.recordedDays, deleted ? 5 : 6);
    assert.equal(consistency.eligibleDays, 6);
    const combinedCalendar = getCombinedRecordingCalendar(combined.tasks, combined.entries, period,
      combined.lifecycle, deviceToday);
    const targetCell = combinedCalendar.find(cell => cell.date === targetDate);
    assert.ok(targetCell);
    assert.deepEqual({ eligible: targetCell.eligible, recorded: targetCell.recorded },
      deleted ? { eligible: 1, recorded: 0 } : { eligible: 1, recorded: 1 });
    const weekdayPattern = getWeekdayRecordingPattern(combined.tasks, combined.entries, period);
    assert.equal(weekdayPattern.reduce((sum, row) => sum + row.observations, 0), deleted ? 5 : 6);
    assert.equal(weekdayPattern.reduce((sum, row) => sum + row.recorded, 0), deleted ? 3 : 4);
    const journey = getJourneyTogether({ dataset: combined, period, range: '90D' });
    const workoutSeries = journey.series.find(series => series.taskId === workout.id);
    const readingSeries = journey.series.find(series => series.taskId === reading.id);
    assert.equal(workoutSeries?.points.reduce((sum, point) => sum + point.recordedCount, 0), deleted ? 3 : 4);
    assert.equal(readingSeries?.points.reduce((sum, point) => sum + point.recordedCount, 0), 2);

    return {
      activityCount: tasks.length, recordingCount: entries.length,
      workoutCounts, readingCounts,
      combinedRecordedDays: consistency.recordedDays,
      combinedEligibleDays: consistency.eligibleDays,
    };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupRecordingDeleteDatabase(path: string) {
  await cleanupFixtureActivities(path, deleteFixture.activities.map(activity => activity.id));
}

export async function verifyRecordingDeleteFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, deleteFixture.activities.map(activity => activity.id));
}

function sameDayRecordingIds() {
  const taskIds = sameDayFixture.activities.map(activity => activity.id);
  let taskIndex = 0;
  let entryIndex = 1;
  return () => taskIndex < taskIds.length ? taskIds[taskIndex++] :
    `same-day-recording-entry-${String(entryIndex++).padStart(3, '0')}`;
}

export async function seedSameDayRecordingDatabase(path: string, deviceToday: string) {
  parseLocalDate(deviceToday);
  resetFixtureDatabase(path);
  const store = await setup(path, sameDayRecordingIds());
  try {
    const tasks = [];
    for (const activity of sameDayFixture.activities) {
      const task = await store.tasks.create({ name: activity.name, options: activity.levels.map(level => ({
        id: level.id, label: level.title, description: level.description,
      })) });
      assert.equal(task.id, activity.id);
      tasks.push(task);
    }
    for (const [activityIndex, activity] of sameDayFixture.activities.entries()) {
      const task = tasks[activityIndex];
      for (const recording of activity.recordings) {
        const date = dateDaysAgo(deviceToday, recording.daysAgo);
        const level = task.options[recording.levelIndex];
        assert.ok(level, `Fixture level ${recording.levelIndex} exists for ${activity.name}.`);
        await store.entries.upsert(task.id, date, level.id);
      }
    }
    await store.connection.run(db => db.runAsync(
      "INSERT INTO app_metadata(key, value) VALUES ('legacyImported', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value"));
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

/** Checks current values, row identity, one-row-per-day integrity, and production Insights output. */
export async function verifySameDayRecordingDatabase(path: string, deviceToday: string, updated = false) {
  const store = await setup(path, sameDayRecordingIds());
  try {
    const tasks = await store.tasks.getAll();
    assert.deepEqual(tasks.map(task => task.id), sameDayFixture.activities.map(activity => activity.id));
    assert.equal(new Set(tasks.map(task => task.id)).size, 2, 'Both activities exist exactly once.');
    assert.deepEqual(tasks.map(task => task.name), ['Workout', 'Reading']);
    for (const [index, activity] of sameDayFixture.activities.entries()) {
      assert.equal(tasks[index].active, true);
      assert.deepEqual(tasks[index].options.map(option => ({ label: option.label, description: option.description })),
        activity.levels.map(level => ({ label: level.title, description: level.description })));
    }

    const entries = await store.entries.getAll();
    assert.equal(entries.length, 3, 'Same-day edits do not change the three-row total.');
    assert.equal(new Set(entries.map(entry => entry.id)).size, 3, 'Recording IDs are unique.');
    const keys = entries.map(entry => `${entry.taskId}:${entry.localDate}`);
    assert.equal(new Set(keys).size, 3, 'There is at most one recording per activity and local date.');
    const workout = tasks.find(task => task.id === sameDayFixture.activities[0].id)!;
    const reading = tasks.find(task => task.id === sameDayFixture.activities[1].id)!;
    const workoutEntries = entries.filter(entry => entry.taskId === workout.id);
    const readingEntries = entries.filter(entry => entry.taskId === reading.id);
    assert.equal(workoutEntries.length, 2);
    assert.equal(readingEntries.length, 1);

    const expected = updated ? sameDayFixture.expectedFinal : sameDayFixture.expectedInitial;
    const expectedEntries = [
      { taskId: workout.id, date: dateDaysAgo(deviceToday, 1), label: expected.workoutYesterday },
      { taskId: workout.id, date: deviceToday, label: expected.workoutToday },
      { taskId: reading.id, date: deviceToday, label: expected.readingToday },
    ];
    for (const item of expectedEntries) {
      const actual = entries.find(entry => entry.taskId === item.taskId && entry.localDate === item.date);
      assert.ok(actual, `${item.taskId} has one row for ${item.date}.`);
      assert.equal(actual.optionLabelAtEntry, item.label, `Stored level is correct for ${item.taskId} on ${item.date}.`);
    }

    const workoutToday = workoutEntries.find(entry => entry.localDate === deviceToday)!;
    assert.equal(workoutToday.id, 'same-day-recording-entry-002',
      'Updating today preserves the original recording ID rather than inserting a second row.');
    const period = { startDate: dateDaysAgo(deviceToday, 1), endDate: deviceToday };
    const analyticsTask: AnalyticsTask = { ...workout, color: workout.chartColor ?? '#398F80' };
    const distribution = getRatingDistribution(analyticsTask, entries, period);
    const counts = Object.fromEntries(distribution.map(row => [row.label, row.count]));
    assert.deepEqual(counts, updated
      ? sameDayFixture.expectedFinalWorkoutDistribution
      : { Low: 1, Moderate: 1, High: 0 });
    const trend = getRatingTrend({ task: analyticsTask, entries, period });
    assert.equal(trend.observations.length, 2, 'Workout has two actual trend observations.');
    const trendByDate = new Map(trend.observations.map(point => [point.date, point.labelAtEntry]));
    assert.equal(trendByDate.get(deviceToday), expected.workoutToday);
    assert.equal(trendByDate.get(dateDaysAgo(deviceToday, 1)), expected.workoutYesterday);

    return { activityCount: tasks.length, recordingCount: entries.length, workoutCounts: counts,
      workoutToday: expected.workoutToday, workoutYesterday: expected.workoutYesterday,
      readingToday: expected.readingToday, workoutTodayEntryId: workoutToday.id };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupSameDayRecordingDatabase(path: string) {
  await cleanupFixtureActivities(path, sameDayFixture.activities.map(activity => activity.id));
}

export async function verifySameDayRecordingFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, sameDayFixture.activities.map(activity => activity.id));
}

function historicalRecordingIds() {
  const taskIds = historicalFixture.activities.map(activity => activity.id);
  let taskIndex = 0;
  let entryIndex = 1;
  return () => taskIndex < taskIds.length ? taskIds[taskIndex++] :
    `historical-recording-entry-${String(entryIndex++).padStart(3, '0')}`;
}

export async function seedHistoricalRecordingDatabase(path: string, deviceToday: string) {
  parseLocalDate(deviceToday);
  resetFixtureDatabase(path);
  const store = await setup(path, historicalRecordingIds());
  try {
    const tasks = [];
    for (const activity of historicalFixture.activities) {
      const task = await store.tasks.create({ name: activity.name, options: activity.levels.map(level => ({
        id: level.id, label: level.title, description: level.description,
      })) });
      assert.equal(task.id, activity.id);
      tasks.push(task);
    }
    for (const [activityIndex, activity] of historicalFixture.activities.entries()) {
      const task = tasks[activityIndex];
      for (const recording of activity.recordings) {
        const date = dateDaysAgo(deviceToday, recording.daysAgo);
        const level = task.options[recording.levelIndex];
        assert.ok(level, `Fixture level ${recording.levelIndex} exists for ${activity.name}.`);
        await store.entries.upsert(task.id, date, level.id);
      }
    }
    await store.connection.run(db => db.runAsync(
      "INSERT INTO app_metadata(key, value) VALUES ('legacyImported', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value"));
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

/** Validates the missing-date insertion, unchanged neighboring rows, and production calculators. */
export async function verifyHistoricalRecordingDatabase(path: string, deviceToday: string, recorded = false) {
  const store = await setup(path, historicalRecordingIds());
  try {
    const tasks = await store.tasks.getAll();
    assert.deepEqual(tasks.map(task => task.id), historicalFixture.activities.map(activity => activity.id));
    assert.equal(new Set(tasks.map(task => task.id)).size, 2, 'Both fixture activities exist exactly once.');
    assert.deepEqual(tasks.map(task => task.name), ['Workout', 'Reading']);
    for (const [index, activity] of historicalFixture.activities.entries()) {
      assert.equal(tasks[index].active, true);
      assert.deepEqual(tasks[index].options.map(option => ({ label: option.label, description: option.description })),
        activity.levels.map(level => ({ label: level.title, description: level.description })));
    }

    const entries = await store.entries.getAll();
    const expectedCount = recorded ? 6 : 5;
    assert.equal(entries.length, expectedCount, `There are exactly ${expectedCount} fixture check-ins.`);
    assert.equal(new Set(entries.map(entry => entry.id)).size, expectedCount, 'Recording IDs are unique.');
    const keys = entries.map(entry => `${entry.taskId}:${entry.localDate}`);
    assert.equal(new Set(keys).size, expectedCount, 'There are no duplicate activity/date rows.');
    const workout = tasks.find(task => task.id === historicalFixture.activities[0].id)!;
    const reading = tasks.find(task => task.id === historicalFixture.activities[1].id)!;
    const workoutEntries = entries.filter(entry => entry.taskId === workout.id);
    const readingEntries = entries.filter(entry => entry.taskId === reading.id);
    assert.equal(workoutEntries.length, recorded ? 4 : 3);
    assert.equal(readingEntries.length, 2);
    const targetDate = dateDaysAgo(deviceToday, historicalFixture.targetDaysAgo);
    const targetEntry = workoutEntries.find(entry => entry.localDate === targetDate);
    assert.equal(!!targetEntry, recorded,
      'The target historical Workout date starts empty and is recorded only by the UI phase.');

    const expectedRows = [
      { taskId: workout.id, date: dateDaysAgo(deviceToday, 3), label: 'Low', id: 'historical-recording-entry-001' },
      ...(recorded ? [{ taskId: workout.id, date: targetDate, label: 'Moderate', id: targetEntry?.id ?? '' }] : []),
      { taskId: workout.id, date: dateDaysAgo(deviceToday, 1), label: 'Moderate', id: 'historical-recording-entry-002' },
      { taskId: workout.id, date: deviceToday, label: 'High', id: 'historical-recording-entry-003' },
      { taskId: reading.id, date: targetDate, label: 'Moderate', id: 'historical-recording-entry-004' },
      { taskId: reading.id, date: deviceToday, label: 'Low', id: 'historical-recording-entry-005' },
    ];
    for (const expected of expectedRows) {
      const actual = entries.find(entry => entry.taskId === expected.taskId && entry.localDate === expected.date);
      assert.ok(actual, `${expected.taskId} has the expected row for ${expected.date}.`);
      assert.equal(actual.optionLabelAtEntry, expected.label);
      if (!recorded || expected.taskId !== workout.id || expected.date !== targetDate)
        assert.equal(actual.id, expected.id, `An existing row identity is unchanged for ${expected.date}.`);
    }

    const period = { startDate: dateDaysAgo(deviceToday, 3), endDate: deviceToday };
    const analyticsTasks: AnalyticsTask[] = tasks.map(task => ({ ...task, color: task.chartColor ?? '#398F80' }));
    const byId = new Map(analyticsTasks.map(task => [task.id, task]));
    const workoutDistribution = getRatingDistribution(byId.get(workout.id)!, entries, period);
    const workoutCounts = Object.fromEntries(workoutDistribution.map(row => [row.label, row.count]));
    assert.deepEqual(workoutCounts, recorded ? { Low: 1, Moderate: 2, High: 1 } : { Low: 1, Moderate: 1, High: 1 });
    const workoutTrend = getRatingTrend({ task: byId.get(workout.id)!, entries, period });
    assert.equal(workoutTrend.observations.length, recorded ? 4 : 3);
    assert.equal(workoutTrend.observations.some(point => point.date === targetDate), recorded);
    const readingDistribution = getRatingDistribution(byId.get(reading.id)!, entries, period);
    assert.deepEqual(Object.fromEntries(readingDistribution.map(row => [row.label, row.count])),
      { Low: 1, Moderate: 1, High: 0 });

    const dataset = getAnalyticsDataset(tasks, entries, await store.tasks.getLifecycleTransitions());
    const combined = selectedCombinedDataset(dataset);
    assert.deepEqual(combined.tasks.map(task => task.id), historicalFixture.activities.map(activity => activity.id));
    const journey = getJourneyTogether({ dataset: combined, period, range: '90D' });
    const journeyCounts = journey.series.map(series => series.points.reduce((sum, point) => sum + point.recordedCount, 0));
    assert.deepEqual(journeyCounts, recorded ? [4, 2] : [3, 2]);
    const consistency = getRecordingConsistency(combined.tasks, combined.entries, period,
      combined.lifecycle, deviceToday);
    assert.equal(consistency.recordedDays, expectedCount);
    const expectedEligibleDays = 7;
    assert.equal(consistency.eligibleDays, expectedEligibleDays,
      'Unrecorded eligible days between each activity’s first recording and today remain in the denominator.');
    const combinedCalendar = getCombinedRecordingCalendar(combined.tasks, combined.entries, period,
      combined.lifecycle, deviceToday);
    assert.equal(combinedCalendar.reduce((sum, day) => sum + day.recorded, 0), expectedCount);
    assert.equal(combinedCalendar.reduce((sum, day) => sum + day.eligible, 0), expectedEligibleDays);
    const weekdays = getWeekdayRecordingPattern(combined.tasks, combined.entries, period);
    assert.equal(weekdays.reduce((sum, day) => sum + day.observations, 0), expectedCount);
    assert.equal(weekdays.reduce((sum, day) => sum + day.recorded, 0), 4,
      'Four distinct calendar dates are recorded across the two activities after the backfill.');

    return { activityCount: tasks.length, workoutCount: workoutEntries.length,
      readingCount: readingEntries.length, recordingCount: entries.length,
      workoutCounts, combinedRecordedDays: consistency.recordedDays,
      combinedEligibleDays: consistency.eligibleDays,
      combinedCalendarRecordedDays: combinedCalendar.reduce((sum, day) => sum + day.recorded, 0),
      combinedWeekdayObservations: weekdays.reduce((sum, day) => sum + day.observations, 0), targetDate,
      historicalWorkoutEntryId: targetEntry?.id };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupHistoricalRecordingDatabase(path: string) {
  await cleanupFixtureActivities(path, historicalFixture.activities.map(activity => activity.id));
}

export async function verifyHistoricalRecordingFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, historicalFixture.activities.map(activity => activity.id));
}

function archiveFixtureIds() {
  const activityIds = archiveFixture.activities.map(activity => activity.id);
  let activityIndex = 0;
  let entryIndex = 1;
  return () => activityIndex < activityIds.length ? activityIds[activityIndex++] :
    `all-insights-archive-entry-${String(entryIndex++).padStart(3, '0')}`;
}

export async function seedAllInsightsArchiveDatabase(path: string, deviceToday: string) {
  parseLocalDate(deviceToday);
  resetFixtureDatabase(path);
  const store = await setup(path, archiveFixtureIds());
  try {
    const tasks = [];
    for (const activity of archiveFixture.activities) {
      const task = await store.tasks.create({ name: activity.name, options: activity.levels.map(level => ({
        id: level.id, label: level.title, description: level.description,
      })) });
      assert.equal(task.id, activity.id);
      tasks.push(task);
    }
    for (const [activityIndex, activity] of archiveFixture.activities.entries()) {
      const task = tasks[activityIndex];
      for (const recording of activity.recordings) {
        const date = dateDaysAgo(deviceToday, recording.daysAgo);
        const level = task.options[recording.levelIndex];
        assert.ok(level, `Fixture level index ${recording.levelIndex} exists for ${activity.name}.`);
        await store.entries.upsert(task.id, date, level.id);
      }
    }
    await store.connection.run(db => db.runAsync(
      "INSERT INTO app_metadata(key, value) VALUES ('legacyImported', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value"));
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

/** Verifies lifecycle state, unchanged history, and production combined calculators. */
export async function verifyAllInsightsArchiveDatabase(
  path: string,
  deviceToday: string,
  state: 'initial' | 'archived' | 'restored' = 'initial',
) {
  const store = await setup(path, archiveFixtureIds());
  try {
    const tasks = await store.tasks.getAll();
    assert.deepEqual(tasks.map(task => task.id), archiveFixture.activities.map(activity => activity.id));
    assert.equal(tasks.length, 3);
    assert.equal(new Set(tasks.map(task => task.id)).size, 3, 'Activity IDs are unique.');
    assert.deepEqual(tasks.map(task => task.name), ['Workout', 'Reading', 'Guitar']);
    for (const [index, activity] of archiveFixture.activities.entries()) {
      assert.equal(tasks[index].active, state !== 'archived' || index !== 0,
        `${activity.name} has expected ${state} status.`);
      assert.deepEqual(tasks[index].options.map(option => ({ label: option.label, description: option.description })),
        activity.levels.map(level => ({ label: level.title, description: level.description })));
    }

    const entries = await store.entries.getAll();
    assert.equal(entries.length, 12, 'All twelve historical check-ins remain stored.');
    const keys = entries.map(entry => `${entry.taskId}:${entry.localDate}`);
    assert.equal(new Set(keys).size, 12, 'No activity/date check-in is duplicated.');
    const byTask = new Map(tasks.map(task => [task.id, entries.filter(entry => entry.taskId === task.id)]));
    for (const activity of archiveFixture.activities) {
      const activityEntries = byTask.get(activity.id)!;
      assert.equal(activityEntries.length, 4, `${activity.name} has four original check-ins.`);
      for (const recording of activity.recordings) {
        const date = dateDaysAgo(deviceToday, recording.daysAgo);
        const entry = activityEntries.find(item => item.localDate === date);
        const level = activity.levels[recording.levelIndex];
        assert.ok(entry, `${activity.name} has the recording from ${date}.`);
        assert.equal(entry.optionId, level.id);
        assert.equal(entry.optionLabelAtEntry, level.title);
      }
    }

    const transitions = await store.tasks.getLifecycleTransitions();
    const workoutTransitions = transitions.filter(event => event.taskId === archiveFixture.activities[0].id);
    assert.equal(workoutTransitions.filter(event => event.type === 'archived').length, state === 'initial' ? 0 : 1);
    assert.equal(workoutTransitions.filter(event => event.type === 'restored').length, state === 'restored' ? 1 : 0);
    if (state === 'archived') assert.equal(workoutTransitions.at(-1)?.type, 'archived');
    if (state === 'restored') assert.equal(workoutTransitions.at(-1)?.type, 'restored');

    const period = getRatingDistributionPeriod(deviceToday, '90D');
    const analyticsTasks: AnalyticsTask[] = tasks.map(task => ({ ...task, color: task.chartColor ?? '#398F80' }));
    const analyticsEntries: AnalyticsEntry[] = entries;
    const dataset = getAnalyticsDataset(analyticsTasks, analyticsEntries, transitions);
    const activeCombined = selectedCombinedDataset(dataset);
    const expectedActive = state === 'archived' ? archiveFixture.activities.slice(1) : archiveFixture.activities;
    assert.deepEqual(activeCombined.tasks.map(task => task.id), expectedActive.map(activity => activity.id));
    const expectedCombinedEntries = state === 'archived' ? 8 : 12;
    assert.equal(activeCombined.entries.length, expectedCombinedEntries,
      `Combined Insights includes only active activities in the ${state} state.`);
    const activeConsistency = getRecordingConsistency(activeCombined.tasks, activeCombined.entries, period,
      activeCombined.lifecycle, deviceToday);
    assert.deepEqual({ recorded: activeConsistency.recordedDays, eligible: activeConsistency.eligibleDays },
      { recorded: expectedCombinedEntries, eligible: expectedCombinedEntries });
    const activeCalendar = getCombinedRecordingCalendar(activeCombined.tasks, activeCombined.entries, period,
      activeCombined.lifecycle, deviceToday);
    assert.equal(activeCalendar.reduce((sum, day) => sum + day.recorded, 0), expectedCombinedEntries);
    assert.equal(activeCalendar.reduce((sum, day) => sum + day.eligible, 0), expectedCombinedEntries);
    const activeWeekdays = getWeekdayRecordingPattern(activeCombined.tasks, activeCombined.entries, period);
    assert.equal(activeWeekdays.reduce((sum, day) => sum + day.observations, 0), expectedCombinedEntries);
    assert.equal(activeWeekdays.reduce((sum, day) => sum + day.recorded, 0), 4);
    const activeJourney = getJourneyTogether({ dataset: activeCombined, period, range: '90D' });
    assert.deepEqual(activeJourney.series.map(series => series.taskId), expectedActive.map(activity => activity.id));
    assert.equal(activeJourney.series.reduce((sum, series) => sum + series.points.reduce((n, point) => n + point.recordedCount, 0), 0), expectedCombinedEntries);

    const workout = analyticsTasks.find(task => task.id === archiveFixture.activities[0].id)!;
    const workoutDistribution = getRatingDistribution(workout, analyticsEntries, period);
    assert.equal(workoutDistribution.reduce((sum, row) => sum + row.count, 0), 4);
    assert.equal(getRatingTrend({ task: workout, entries: analyticsEntries, period }).observations.length, 4,
      'Workout individual history remains intact.');

    // Exercise the archived selection filter against the actual lifecycle state.
    const archivedDataset = {
      ...dataset,
      tasks: state === 'archived' ? dataset.tasks : dataset.tasks.map(task => task.id === workout.id
        ? { ...task, active: false, includeInCombinedInsights: false, archivedAt: deviceToday }
        : task),
    };
    const archivedCombined = selectedCombinedDataset(archivedDataset);
    assert.deepEqual(archivedCombined.tasks.map(task => task.id),
      archiveFixture.activities.slice(1).map(activity => activity.id));
    assert.equal(archivedCombined.entries.length, 8);
    const archivedConsistency = getRecordingConsistency(archivedCombined.tasks, archivedCombined.entries,
      period, archivedCombined.lifecycle, deviceToday);
    assert.deepEqual({ recorded: archivedConsistency.recordedDays, eligible: archivedConsistency.eligibleDays },
      { recorded: 8, eligible: 8 });
    const archivedCalendar = getCombinedRecordingCalendar(archivedCombined.tasks, archivedCombined.entries,
      period, archivedCombined.lifecycle, deviceToday);
    assert.equal(archivedCalendar.reduce((sum, day) => sum + day.recorded, 0), 8);
    assert.equal(archivedCalendar.reduce((sum, day) => sum + day.eligible, 0), 8);
    const archivedWeekdays = getWeekdayRecordingPattern(archivedCombined.tasks, archivedCombined.entries, period);
    assert.equal(archivedWeekdays.reduce((sum, day) => sum + day.observations, 0), 8);
    assert.equal(archivedWeekdays.reduce((sum, day) => sum + day.recorded, 0), 4);
    const archivedJourney = getJourneyTogether({ dataset: archivedCombined, period, range: '90D' });
    assert.deepEqual(archivedJourney.series.map(series => series.taskId),
      archiveFixture.activities.slice(1).map(activity => activity.id));
    assert.equal(archivedJourney.series.reduce((sum, series) => sum + series.points.reduce((n, point) => n + point.recordedCount, 0), 0), 8);

    return { activityCount: tasks.length, activeActivityCount: tasks.filter(task => task.active).length,
      recordingCount: entries.length,
      activeCombinedCount: activeCombined.entries.length, activeRecordedDays: activeConsistency.recordedDays,
      archivedCombinedCount: archivedCombined.entries.length, archivedRecordedDays: archivedConsistency.recordedDays,
      workoutHistoryCount: workoutDistribution.reduce((sum, row) => sum + row.count, 0) };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupAllInsightsArchiveDatabase(path: string) {
  await cleanupFixtureActivities(path, archiveFixture.activities.map(activity => activity.id));
}

export async function verifyAllInsightsArchiveFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, archiveFixture.activities.map(activity => activity.id));
}

function boundaryFixtureIds() {
  let entryIndex = 0;
  return () => entryIndex++ === 0 ? boundaryFixture.activity.id :
    `date-filter-boundaries-entry-${String(entryIndex).padStart(3, '0')}`;
}

/** Seeds the seven fixed check-ins using local calendar-day arithmetic. */
export async function seedDateFilterBoundariesDatabase(path: string, deviceToday: string) {
  parseLocalDate(deviceToday);
  resetFixtureDatabase(path);
  const store = await setup(path, boundaryFixtureIds());
  try {
    const activity = boundaryFixture.activity;
    const task = await store.tasks.create({ name: activity.name, options: activity.levels.map(level => ({
      id: level.id, label: level.title, description: level.description,
    })) });
    assert.equal(task.id, activity.id);
    for (const recording of activity.recordings) {
      const level = task.options[recording.levelIndex];
      assert.ok(level, `Fixture level index ${recording.levelIndex} exists.`);
      await store.entries.upsert(task.id, dateDaysAgo(deviceToday, recording.daysAgo), level.id);
    }
    await store.connection.run(db => db.runAsync(
      "INSERT INTO app_metadata(key, value) VALUES ('legacyImported', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value"));
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

/** Checks seeded rows and exact ranges through the production rating-distribution calculator. */
export async function verifyDateFilterBoundariesDatabase(path: string, deviceToday: string) {
  const store = await setup(path, boundaryFixtureIds());
  try {
    const activities = await store.tasks.getAll();
    assert.equal(activities.length, 1, 'Exactly one boundary fixture activity exists.');
    const task = activities[0];
    assert.equal(task.id, boundaryFixture.activity.id);
    assert.equal(task.name, boundaryFixture.activity.name);
    assert.equal(task.active, true);
    assert.deepEqual(task.options.map(level => ({ label: level.label, description: level.description })),
      boundaryFixture.activity.levels.map(level => ({ label: level.title, description: level.description })));

    const entries = await store.entries.getAll();
    assert.equal(entries.length, 7, 'All seven boundary recordings remain present.');
    const activityEntries = entries.filter(entry => entry.taskId === task.id);
    assert.equal(activityEntries.length, 7);
    assert.equal(new Set(activityEntries.map(entry => entry.localDate)).size, 7,
      'There is exactly one recording per fixture calendar date.');
    const byDate = new Map(activityEntries.map(entry => [entry.localDate, entry]));
    for (const recording of boundaryFixture.activity.recordings) {
      const date = dateDaysAgo(deviceToday, recording.daysAgo);
      const entry = byDate.get(date);
      assert.ok(entry, `Expected recording exists on local date ${date}.`);
      assert.equal(entry.optionId, task.options[recording.levelIndex].id, `Correct level identity on ${date}.`);
      assert.equal(entry.optionLabelAtEntry, boundaryFixture.activity.levels[recording.levelIndex].title,
        `Correct historical level label on ${date}.`);
    }

    const analyticsTask: AnalyticsTask = { ...task, color: task.chartColor ?? '#398F80' };
    const ranges = {
      '7D': getRatingDistributionPeriod(deviceToday, '7D'),
      '30D': getRatingDistributionPeriod(deviceToday, '30D'),
      '90D': getRatingDistributionPeriod(deviceToday, '90D'),
      custom: {
        startDate: dateDaysAgo(deviceToday, boundaryFixture.customDaysAgo.inclusiveStart),
        endDate: dateDaysAgo(deviceToday, boundaryFixture.customDaysAgo.inclusiveEnd),
      },
      empty: {
        startDate: dateDaysAgo(deviceToday, boundaryFixture.customDaysAgo.emptyStart),
        endDate: dateDaysAgo(deviceToday, boundaryFixture.customDaysAgo.emptyEnd),
      },
    };
    const actualCounts = Object.fromEntries(Object.entries(ranges).map(([name, period]) => {
      const rows = getRatingDistribution(analyticsTask, activityEntries, period);
      return [name, rows.reduce((sum, row) => sum + row.count, 0)];
    }));
    assert.deepEqual(actualCounts, boundaryFixture.expectedCounts,
      'Production analytics includes both range endpoints and excludes just-outside dates.');
    return { activityCount: activities.length, recordingCount: entries.length, actualCounts };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupDateFilterBoundariesDatabase(path: string) {
  await cleanupFixtureActivities(path, [boundaryFixture.activity.id]);
}

export async function verifyDateFilterBoundariesFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, [boundaryFixture.activity.id]);
}

function sliderFixtureIds() {
  const activityIds = sliderFixture.activities.map(activity => activity.id);
  let activityIndex = 0;
  let entryIndex = 0;
  return () => activityIndex < activityIds.length ? activityIds[activityIndex++] :
    `slider-interactions-entry-${String(++entryIndex).padStart(3, '0')}`;
}

export async function seedSliderInteractionsDatabase(path: string, deviceToday: string) {
  parseLocalDate(deviceToday);
  resetFixtureDatabase(path);
  const store = await setup(path, sliderFixtureIds());
  try {
    const tasks = [];
    for (const activity of sliderFixture.activities) {
      const task = await store.tasks.create({ name: activity.name, options: activity.levels.map(level => ({
        id: level.id, label: level.title, description: level.description,
      })) });
      assert.equal(task.id, activity.id);
      tasks.push(task);
    }
    for (const [index, activity] of sliderFixture.activities.entries()) {
      const task = tasks[index];
      for (const recording of activity.recordings) {
        const level = task.options[recording.levelIndex];
        assert.ok(level, `Fixture level index ${recording.levelIndex} exists for ${activity.name}.`);
        await store.entries.upsert(task.id, dateDaysAgo(deviceToday, recording.daysAgo), level.id);
      }
    }
    await store.connection.run(db => db.runAsync(
      "INSERT INTO app_metadata(key, value) VALUES ('legacyImported', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value"));
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

/** Checks the exact same-day upsert result with the stored rows and production analytics. */
export async function verifySliderInteractionsDatabase(path: string, deviceToday: string, final = false) {
  const store = await setup(path, sliderFixtureIds());
  try {
    const tasks = await store.tasks.getAll();
    assert.deepEqual(tasks.map(task => task.id), sliderFixture.activities.map(activity => activity.id),
      'Workout and Reading remain present in their original order.');
    assert.equal(new Set(tasks.map(task => task.id)).size, 2, 'No duplicate activities exist.');
    for (const [index, activity] of sliderFixture.activities.entries()) {
      assert.equal(tasks[index].name, activity.name);
      assert.equal(tasks[index].active, true);
      assert.deepEqual(tasks[index].options.map(level => ({ label: level.label, description: level.description })),
        activity.levels.map(level => ({ label: level.title, description: level.description })));
    }

    const entries = await store.entries.getAll();
    assert.equal(entries.length, final ? 3 : 2, `Expected ${final ? 3 : 2} total check-ins.`);
    const keys = entries.map(entry => `${entry.taskId}:${entry.localDate}`);
    assert.equal(new Set(keys).size, entries.length, 'No duplicate activity/date check-ins exist.');
    const workout = tasks[0];
    const reading = tasks[1];
    const workoutEntries = entries.filter(entry => entry.taskId === workout.id);
    const readingEntries = entries.filter(entry => entry.taskId === reading.id);
    assert.equal(workoutEntries.length, final ? 2 : 1);
    assert.equal(readingEntries.length, 1);
    assert.equal(workoutEntries.filter(entry => entry.localDate === deviceToday).length, final ? 1 : 0,
      'Workout has at most one recording for today.');
    const workoutByDate = new Map(workoutEntries.map(entry => [entry.localDate, entry]));
    const yesterday = workoutByDate.get(dateDaysAgo(deviceToday, 1));
    assert.ok(yesterday, 'Workout yesterday remains recorded.');
    assert.equal(yesterday.optionLabelAtEntry, sliderFixture.expectedInitial.workoutYesterday);
    const today = workoutByDate.get(deviceToday);
    if (final) {
      assert.ok(today, 'Workout today was recorded through the UI.');
      assert.equal(today.optionLabelAtEntry, sliderFixture.expectedFinal.workoutToday);
    } else assert.equal(today, undefined, 'Workout today is initially unrecorded.');
    assert.equal(readingEntries[0].localDate, deviceToday);
    assert.equal(readingEntries[0].optionLabelAtEntry, sliderFixture.expectedInitial.readingToday,
      'Reading remains unchanged.');

    const period = getRatingDistributionPeriod(deviceToday, '90D');
    const analyticsTask: AnalyticsTask = { ...workout, color: workout.chartColor ?? '#398F80' };
    const distribution = getRatingDistribution(analyticsTask, entries, period);
    const counts = Object.fromEntries(distribution.map(row => [row.label, row.count]));
    const expectedCounts = final
      ? { 'Very Light': 0, Light: 1, Moderate: 0, Intense: 0, 'Very Intense': 1 }
      : { 'Very Light': 0, Light: 1, Moderate: 0, Intense: 0, 'Very Intense': 0 };
    assert.deepEqual(counts, expectedCounts, 'Production rating distribution reflects the final persisted level.');
    return { activityCount: tasks.length, recordingCount: entries.length, workoutCount: workoutEntries.length,
      readingCount: readingEntries.length, workoutYesterday: yesterday.optionLabelAtEntry,
      workoutToday: today?.optionLabelAtEntry ?? 'Not recorded', readingToday: readingEntries[0].optionLabelAtEntry,
      workoutDistribution: counts };
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

export async function cleanupSliderInteractionsDatabase(path: string) {
  await cleanupFixtureActivities(path, sliderFixture.activities.map(activity => activity.id));
}

export async function verifySliderInteractionsFixtureRemoved(path: string) {
  await verifyFixtureActivitiesRemoved(path, sliderFixture.activities.map(activity => activity.id));
}

async function cleanupFixtureActivities(path: string, idsToRemove: string[]) {
  const store = await setup(path, deleteFixtureIds());
  try {
    for (const id of idsToRemove) if (await store.tasks.getById(id)) await store.tasks.delete(id);
    await verifyFixtureActivitiesRemovedWithRepositories(store.tasks, store.entries, idsToRemove);
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}

async function verifyFixtureActivitiesRemovedWithRepositories(
  tasks: Awaited<ReturnType<typeof setup>>['tasks'], entries: Awaited<ReturnType<typeof setup>>['entries'], idsToRemove: string[]) {
  for (const id of idsToRemove) assert.equal(await tasks.getById(id), undefined, `Fixture activity ${id} was removed.`);
  assert.deepEqual((await entries.getAll()).filter(entry => idsToRemove.includes(entry.taskId)), [],
    'Fixture check-ins were removed with their activities.');
}

async function verifyFixtureActivitiesRemoved(path: string, idsToRemove: string[]) {
  const store = await setup(path, deleteFixtureIds());
  try {
    await verifyFixtureActivitiesRemovedWithRepositories(store.tasks, store.entries, idsToRemove);
  } finally {
    store.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    store.native.close();
  }
}
