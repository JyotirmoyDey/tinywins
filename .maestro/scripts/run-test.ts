import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cleanupRecordingDeleteDatabase,
  cleanupRecordingUpdateDatabase,
  cleanupAllInsightsArchiveDatabase,
  cleanupSameDayRecordingDatabase,
  cleanupHistoricalRecordingDatabase,
  cleanupDateFilterBoundariesDatabase,
  cleanupSliderInteractionsDatabase,
  cleanupLevelReorderingBeforeDatabase,
  cleanupLevelReorderingAfterDatabase,
  cleanupChartSparseDatabase,
  cleanupChartSkippedDaysDatabase,
  cleanupChartManyRecordingsDatabase,
  cleanupRepeatedArchiveRestoreDatabase,
  cleanupAndroidNavigationDatabase,
  cleanupDeleteAllEmptyStatesDatabase,
  seedRecordingDeleteDatabase,
  seedRecordingUpdateDatabase,
  seedAllInsightsArchiveDatabase,
  seedSameDayRecordingDatabase,
  seedHistoricalRecordingDatabase,
  seedDateFilterBoundariesDatabase,
  seedSliderInteractionsDatabase,
  seedLevelReorderingBeforeDatabase,
  seedLevelReorderingAfterDatabase,
  seedChartSparseDatabase,
  seedChartSkippedDaysDatabase,
  seedChartManyRecordingsDatabase,
  seedRepeatedArchiveRestoreDatabase,
  seedAndroidNavigationDatabase,
  seedDeleteAllEmptyStatesDatabase,
  verifyRecordingDeleteDatabase,
  verifyRecordingDeleteFixtureRemoved,
  verifyRecordingUpdateDatabase,
  verifyRecordingUpdateFixtureRemoved,
  verifyAllInsightsArchiveDatabase,
  verifyAllInsightsArchiveFixtureRemoved,
  verifySameDayRecordingDatabase,
  verifySameDayRecordingFixtureRemoved,
  verifyHistoricalRecordingDatabase,
  verifyHistoricalRecordingFixtureRemoved,
  verifyDateFilterBoundariesDatabase,
  verifyDateFilterBoundariesFixtureRemoved,
  verifySliderInteractionsDatabase,
  verifySliderInteractionsFixtureRemoved,
  verifyLevelReorderingBeforeDatabase,
  verifyLevelReorderingAfterDatabase,
  verifyLevelReorderingBeforeFixtureRemoved,
  verifyLevelReorderingAfterFixtureRemoved,
  verifyChartSparseDatabase,
  verifyChartSkippedDaysDatabase,
  verifyChartManyRecordingsDatabase,
  verifyChartSparseFixtureRemoved,
  verifyChartSkippedDaysFixtureRemoved,
  verifyChartManyRecordingsFixtureRemoved,
  verifyRepeatedArchiveRestoreDatabase,
  verifyRepeatedArchiveRestoreFixtureRemoved,
  verifyAndroidNavigationDatabase,
  verifyAndroidNavigationFixtureRemoved,
  verifyDeleteAllEmptyStatesDatabase,
  verifyDeleteAllEmptyStatesFixtureRemoved,
  dateDaysAgo,
} from '../fixtures/helpers/sqlite';
import { parseLocalDate } from '../../src/domain/task';
import { chartSkippedDaysFixture } from '../fixtures/data/chart-skipped-days';

const packageId = 'com.plainleaf.tinywins';
const databaseName = 'tinywins.sqlite';
const scenario = process.argv[2];
const flows: Record<string, string> = {
  'recording-update': '.maestro/p0/recording-update.yaml',
  'recording-delete': '.maestro/p0/recording-delete.yaml',
  'all-insights-archive': '.maestro/p0/all-insights-archive.yaml',
  'same-day-recording': '.maestro/p1/same-day-recording.yaml',
  'historical-recording': '.maestro/p1/historical-recording.yaml',
  'date-filter-boundaries': '.maestro/p1/date-filter-boundaries.yaml',
  'slider-interactions': '.maestro/p1/slider-interactions.yaml',
  'level-reordering-before-recording': '.maestro/p1/level-reordering-before-recording.yaml',
  'level-reordering-after-recording': '.maestro/p1/level-reordering-after-recording.yaml',
  'chart-skipped-days': '.maestro/p2/chart-skipped-days.yaml',
  'chart-sparse-data': '.maestro/p2/chart-sparse-data.yaml',
  'chart-many-recordings': '.maestro/p2/chart-many-recordings.yaml',
  'repeated-archive-restore': '.maestro/p2/repeated-archive-restore.yaml',
  'android-back-navigation': '.maestro/p2/android-back-navigation.yaml',
  'app-interruption-recovery': '.maestro/p2/app-interruption-recovery.yaml',
  'delete-all-empty-states': '.maestro/p2/delete-all-empty-states.yaml',
};

function pickerInputDate(localDay: string, locale: string) {
  return new Intl.DateTimeFormat(locale || 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(parseLocalDate(localDay));
}

function command(binary: string, args: string[], options: { encoding?: 'utf8'; stdio?: 'inherit' } = {}) {
  return execFileSync(binary, args, { encoding: options.encoding, stdio: options.stdio ?? 'pipe' });
}

function captureDeviceFile(remotePath: string, targetPath: string, optional = false) {
  const listing = String(command('adb', ['shell', 'run-as', packageId, 'ls', 'files/SQLite'], { encoding: 'utf8' }));
  if (!listing.split(/\s+/).includes(remotePath.split('/').at(-1) ?? '') && optional) return;
  const output = command('adb', ['exec-out', 'run-as', packageId, 'cat', remotePath]) as Buffer;
  if (!output.length && !optional) throw new Error(`Device database file is empty: ${remotePath}`);
  if (output.length) writeFileSync(targetPath, output);
}

function installDatabaseOnDevice(sourcePath: string) {
  const transferName = 'tinywins-maestro-fixture.sqlite';
  const transferPath = `/data/local/tmp/${transferName}`;
  command('adb', ['push', sourcePath, transferPath], { stdio: 'inherit' });
  command('adb', ['shell', 'chmod', '644', transferPath]);
  command('adb', ['shell', 'run-as', packageId, 'mkdir', '-p', 'files/SQLite']);
  command('adb', ['shell', 'run-as', packageId, 'rm', '-f',
    `files/SQLite/${databaseName}`, `files/SQLite/${databaseName}-wal`, `files/SQLite/${databaseName}-shm`]);
  command('adb', ['shell', 'run-as', packageId, 'cp', transferPath, `files/SQLite/${databaseName}`]);
  command('adb', ['shell', 'run-as', packageId, 'chmod', '600', `files/SQLite/${databaseName}`]);
  command('adb', ['shell', 'rm', '-f', transferPath]);
}

async function main() {
  if (!scenario || !flows[scenario]) throw new Error(`Usage: npm run e2e -- ${Object.keys(flows).join('|')}`);
  const temp = mkdtempSync(join(tmpdir(), 'tinywins-maestro-'));
  const hostDatabase = join(temp, databaseName);
  const stagedDatabase = join(temp, 'staged-' + databaseName);
  const resultDatabase = join(temp, 'result-' + databaseName);
  const cleanupDatabase = join(temp, 'cleanup-' + databaseName);
  const cleanedDeviceDatabase = join(temp, 'cleaned-device-' + databaseName);
  let stage = 1;
  let deviceDatabaseLoaded = false;
  try {
    console.log('[1/4] PREPARING TEST DATA');
    console.log(`Loading fixture: ${scenario}`);
    const deviceToday = String(command('adb', ['shell', 'date', '+%F'], { encoding: 'utf8' })).trim();
    parseLocalDate(deviceToday);
    console.log('Creating activities and levels...');
    console.log('Creating fixture recordings...');
    const isArchive = scenario === 'all-insights-archive';
    const isSameDay = scenario === 'same-day-recording';
    const isHistorical = scenario === 'historical-recording';
    const isDateBoundaries = scenario === 'date-filter-boundaries';
    const isSlider = scenario === 'slider-interactions';
    const isLevelBefore = scenario === 'level-reordering-before-recording';
    const isLevelAfter = scenario === 'level-reordering-after-recording';
    const isChartSkipped = scenario === 'chart-skipped-days';
    const isChartSparse = scenario === 'chart-sparse-data';
    const isChartMany = scenario === 'chart-many-recordings';
    const isRepeatedArchiveRestore = scenario === 'repeated-archive-restore';
    const isAndroidBack = scenario === 'android-back-navigation';
    const isAppInterruption = scenario === 'app-interruption-recovery';
    const isDelete = scenario === 'recording-delete';
    const isDeleteAllEmpty = scenario === 'delete-all-empty-states';
    if (isArchive) await seedAllInsightsArchiveDatabase(hostDatabase, deviceToday);
    else if (isSameDay) await seedSameDayRecordingDatabase(hostDatabase, deviceToday);
    else if (isHistorical) await seedHistoricalRecordingDatabase(hostDatabase, deviceToday);
    else if (isDateBoundaries) await seedDateFilterBoundariesDatabase(hostDatabase, deviceToday);
    else if (isSlider) await seedSliderInteractionsDatabase(hostDatabase, deviceToday);
    else if (isDelete) await seedRecordingDeleteDatabase(hostDatabase, deviceToday);
    else if (isLevelBefore) await seedLevelReorderingBeforeDatabase(hostDatabase);
    else if (isLevelAfter) await seedLevelReorderingAfterDatabase(hostDatabase, deviceToday);
    else if (isChartSkipped) await seedChartSkippedDaysDatabase(hostDatabase, deviceToday);
    else if (isChartSparse) await seedChartSparseDatabase(hostDatabase, deviceToday);
    else if (isChartMany) await seedChartManyRecordingsDatabase(hostDatabase, deviceToday);
    else if (isRepeatedArchiveRestore) await seedRepeatedArchiveRestoreDatabase(hostDatabase, deviceToday);
    else if (isAndroidBack || isAppInterruption) await seedAndroidNavigationDatabase(hostDatabase, deviceToday);
    else if (isDeleteAllEmpty) await seedDeleteAllEmptyStatesDatabase(hostDatabase, deviceToday);
    else await seedRecordingUpdateDatabase(hostDatabase, deviceToday);
    const prepared = isArchive
      ? await verifyAllInsightsArchiveDatabase(hostDatabase, deviceToday, 'initial')
      : isSameDay
        ? await verifySameDayRecordingDatabase(hostDatabase, deviceToday)
        : isHistorical
          ? await verifyHistoricalRecordingDatabase(hostDatabase, deviceToday)
      : isDateBoundaries
        ? await verifyDateFilterBoundariesDatabase(hostDatabase, deviceToday)
      : isSlider
        ? await verifySliderInteractionsDatabase(hostDatabase, deviceToday)
      : isDelete
        ? await verifyRecordingDeleteDatabase(hostDatabase, deviceToday)
      : isLevelBefore
        ? await verifyLevelReorderingBeforeDatabase(hostDatabase)
      : isLevelAfter
        ? await verifyLevelReorderingAfterDatabase(hostDatabase, deviceToday)
      : isChartSkipped
        ? await verifyChartSkippedDaysDatabase(hostDatabase, deviceToday)
      : isChartSparse
        ? await verifyChartSparseDatabase(hostDatabase, deviceToday)
      : isChartMany
        ? await verifyChartManyRecordingsDatabase(hostDatabase, deviceToday)
      : isRepeatedArchiveRestore
        ? await verifyRepeatedArchiveRestoreDatabase(hostDatabase, deviceToday, 'initial')
      : isAndroidBack || isAppInterruption
        ? await verifyAndroidNavigationDatabase(hostDatabase, deviceToday, 'initial')
      : isDeleteAllEmpty
        ? await verifyDeleteAllEmptyStatesDatabase(hostDatabase, deviceToday, 'initial')
      : await verifyRecordingUpdateDatabase(hostDatabase, deviceToday);
    console.log(`Fixture ready: ${prepared.activityCount} activities, ${prepared.recordingCount} check-ins.`);

    stage = 2;
    console.log('\n[2/4] LOADING TEST DATABASE');
    console.log('Stopping TinyWins...');
    command('adb', ['shell', 'am', 'force-stop', packageId]);
    console.log('Loading SQLite fixture...');
    installDatabaseOnDevice(hostDatabase);
    deviceDatabaseLoaded = true;
    captureDeviceFile(`files/SQLite/${databaseName}`, stagedDatabase);
    const staged = isArchive
      ? await verifyAllInsightsArchiveDatabase(stagedDatabase, deviceToday, 'initial')
      : isSameDay
        ? await verifySameDayRecordingDatabase(stagedDatabase, deviceToday)
        : isHistorical
          ? await verifyHistoricalRecordingDatabase(stagedDatabase, deviceToday)
      : isDateBoundaries
        ? await verifyDateFilterBoundariesDatabase(stagedDatabase, deviceToday)
      : isSlider
        ? await verifySliderInteractionsDatabase(stagedDatabase, deviceToday)
      : isDelete
        ? await verifyRecordingDeleteDatabase(stagedDatabase, deviceToday)
      : isLevelBefore
        ? await verifyLevelReorderingBeforeDatabase(stagedDatabase)
      : isLevelAfter
        ? await verifyLevelReorderingAfterDatabase(stagedDatabase, deviceToday)
      : isChartSkipped
        ? await verifyChartSkippedDaysDatabase(stagedDatabase, deviceToday)
      : isChartSparse
        ? await verifyChartSparseDatabase(stagedDatabase, deviceToday)
      : isChartMany
        ? await verifyChartManyRecordingsDatabase(stagedDatabase, deviceToday)
      : isRepeatedArchiveRestore
        ? await verifyRepeatedArchiveRestoreDatabase(stagedDatabase, deviceToday, 'initial')
      : isAndroidBack || isAppInterruption
        ? await verifyAndroidNavigationDatabase(stagedDatabase, deviceToday, 'initial')
      : isDeleteAllEmpty
        ? await verifyDeleteAllEmptyStatesDatabase(stagedDatabase, deviceToday, 'initial')
      : await verifyRecordingUpdateDatabase(stagedDatabase, deviceToday);
    if (staged.activityCount !== prepared.activityCount || staged.recordingCount !== prepared.recordingCount)
      throw new Error('Staged SQLite fixture does not match the prepared fixture.');
    console.log('Database ready and verified on Android.');

    stage = 3;
    console.log('\n[3/4] RUNNING MAESTRO');
    console.log(`Executing ${flows[scenario]}...`);
    const maestroArgs = isChartSparse
      ? (() => {
          const input = (daysAgo: number) => pickerInputDate(dateDaysAgo(deviceToday, daysAgo),
            String(command('adb', ['shell', 'settings', 'get', 'system', 'system_locales'], { encoding: 'utf8' })).trim());
          return ['test', '-e', `customFromDateInput=${input(364)}`, '-e', `customToDateInput=${input(0)}`,
            '-e', `emptyFromDateInput=${input(120)}`, '-e', `emptyToDateInput=${input(100)}`, flows[scenario]];
        })()
      : isChartMany
        ? (() => {
            const locale = String(command('adb', ['shell', 'settings', 'get', 'system', 'system_locales'], { encoding: 'utf8' })).trim();
            return ['test', '-e', `yearFromDateInput=${pickerInputDate(dateDaysAgo(deviceToday, 364), locale)}`,
              '-e', `yearToDateInput=${pickerInputDate(deviceToday, locale)}`, flows[scenario]];
          })()
      : isChartSkipped
        ? (() => {
            const month = deviceToday.slice(0, 7);
            const monthStates = chartSkippedDaysFixture.activities[0].days
              .map(day => ({ date: dateDaysAgo(deviceToday, day.daysAgo), state: day.state }))
              .filter(day => day.date.startsWith(month));
            const calendarRecordedDays = monthStates.filter(day => day.state !== 'missing').length;
            const calendarSkippedDays = monthStates.filter(day => day.state === 'skipped').length;
            return ['test', '-e', `todayDate=${deviceToday}`,
              '-e', `calendarRecordedDays=${calendarRecordedDays}`,
              '-e', `calendarSkippedDays=${calendarSkippedDays}`, flows[scenario]];
          })()
      : isDelete
      ? ['test', '-e', `targetDate=${dateDaysAgo(deviceToday, 2)}`, flows[scenario]]
      : isDateBoundaries
        ? (() => {
            const locale = String(command('adb', ['shell', 'settings', 'get', 'system', 'system_locales'], { encoding: 'utf8' })).trim();
            const input = (daysAgo: number) => pickerInputDate(dateDaysAgo(deviceToday, daysAgo), locale);
            return ['test', '-e', `fromDateInput=${input(30)}`, '-e', `toDateInput=${input(7)}`,
              '-e', `emptyFromInput=${input(59)}`, '-e', `emptyToInput=${input(50)}`, flows[scenario]];
          })()
      : ['test', flows[scenario]];
    command('maestro', maestroArgs, { stdio: 'inherit' });

    stage = 4;
    console.log('\n[4/4] RESULTS');
    command('adb', ['shell', 'am', 'force-stop', packageId]);
    const deviceDirectory = `files/SQLite/${databaseName}`;
    captureDeviceFile(deviceDirectory, resultDatabase);
    captureDeviceFile(deviceDirectory + '-wal', resultDatabase + '-wal', true);
    if (isArchive) {
      const archived = await verifyAllInsightsArchiveDatabase(resultDatabase, deviceToday, 'archived');
      console.log(`PASS — archive persisted before restoration; ${archived.activeActivityCount} active activities, ${archived.recordingCount} stored check-ins, ${archived.activeCombinedCount} combined check-ins; Workout retains ${archived.workoutHistoryCount} individual check-ins.`);
      console.log('Restoring the same activity through the Archived UI...');
      command('maestro', ['test', '.maestro/p0/helpers/all-insights-restore.yaml'], { stdio: 'inherit' });
      command('adb', ['shell', 'am', 'force-stop', packageId]);
      captureDeviceFile(deviceDirectory, resultDatabase);
      captureDeviceFile(deviceDirectory + '-wal', resultDatabase + '-wal', true);
      const restored = await verifyAllInsightsArchiveDatabase(resultDatabase, deviceToday, 'restored');
      console.log(`PASS — restored database: ${restored.activeActivityCount} active activities, ${restored.recordingCount} stored check-ins, ${restored.activeCombinedCount} selected combined check-ins; Workout history ${restored.workoutHistoryCount}.`);
    } else if (isSameDay) {
      const result = await verifySameDayRecordingDatabase(resultDatabase, deviceToday, true);
      console.log(`PASS — ${result.activityCount} activities and ${result.recordingCount} check-ins remain; Workout today=${result.workoutToday}, yesterday=${result.workoutYesterday}, Reading today=${result.readingToday}.`);
      console.log(`Workout distribution from production analytics: ${JSON.stringify(result.workoutCounts)}; today's entry ID remains ${result.workoutTodayEntryId}.`);
    } else if (isHistorical) {
      const result = await verifyHistoricalRecordingDatabase(resultDatabase, deviceToday, true);
      console.log(`PASS — ${result.activityCount} activities; Workout=${result.workoutCount}, Reading=${result.readingCount}, total=${result.recordingCount}.`);
      console.log(`Workout distribution from production analytics: ${JSON.stringify(result.workoutCounts)}; ${result.combinedRecordedDays} of ${result.combinedEligibleDays} combined task-days recorded.`);
      console.log(`New historical date ${result.targetDate} has exactly one Workout check-in (entry ${result.historicalWorkoutEntryId}).`);
    } else if (isDateBoundaries) {
      const result = await verifyDateFilterBoundariesDatabase(resultDatabase, deviceToday);
      console.log(`PASS — database unchanged: ${result.activityCount} activity, ${result.recordingCount} check-ins; production analytics counts ${JSON.stringify(result.actualCounts)}.`);
    } else if (isSlider) {
      const result = await verifySliderInteractionsDatabase(resultDatabase, deviceToday, true);
      console.log(`PASS — final slider data: Workout ${result.workoutYesterday} yesterday, ${result.workoutToday} today; Reading ${result.readingToday} today; ${result.recordingCount} total unique check-ins.`);
      console.log(`Workout production distribution: ${JSON.stringify(result.workoutDistribution)}.`);
    } else if (isDelete) {
      const result = await verifyRecordingDeleteDatabase(resultDatabase, deviceToday, true);
      console.log(`PASS — UI deleted only the target check-in; database contains ${result.activityCount} activities and ${result.recordingCount} check-ins.`);
      console.log(`Workout distribution: ${JSON.stringify(result.workoutCounts)}; Reading distribution: ${JSON.stringify(result.readingCounts)}.`);
      console.log(`Combined coverage: ${result.combinedRecordedDays} of ${result.combinedEligibleDays} eligible task-days.`);
    } else if (isLevelBefore) {
      const result = await verifyLevelReorderingBeforeDatabase(resultDatabase, true);
      console.log(`PASS — ${result.levelCount} levels persisted in order: ${result.order.join(' → ')}; ${result.recordingCount} recordings.`);
    } else if (isLevelAfter) {
      const result = await verifyLevelReorderingAfterDatabase(resultDatabase, deviceToday, true);
      console.log(`PASS — level definitions remained unchanged; the historical recording updated to ${result.recordingValue}; ${result.recordingCount} recording remains.`);
    } else if (isChartSkipped) {
      const result = await verifyChartSkippedDaysDatabase(resultDatabase, deviceToday);
      console.log(`PASS — ${result.skippedCount} explicit Skipped, ${result.regularRatingCount} rated, ${result.missingCount} missing dates; individual coverage ${result.coverageRecorded}/${result.coverageEligible}; All Activities ${result.combinedRecorded}/${result.combinedEligible}.`);
    } else if (isChartSparse) {
      const result = await verifyChartSparseDatabase(resultDatabase, deviceToday);
      console.log(`PASS — sparse data preserved: ${result.activityCount} activities, ${result.recordingCount} check-ins; 7D/30D/90D counts ${JSON.stringify(result.presetCounts)}, custom ${result.customCount}, empty ${result.emptyCount}; combined ${result.combinedRecordedDays}/${result.combinedEligibleDays}.`);
    } else if (isChartMany) {
      const result = await verifyChartManyRecordingsDatabase(resultDatabase, deviceToday);
      console.log(`PASS — ${result.activityCount} activities, ${result.recordingCount} check-ins; All Activities selected ${result.selectedCombinedActivities} items, coverage ${result.combinedRecordedDays}/${result.combinedEligibleDays}.`);
    } else if (isRepeatedArchiveRestore) {
      const result = await verifyRepeatedArchiveRestoreDatabase(resultDatabase, deviceToday, 'final');
      console.log(`PASS — ${result.activityCount} original activities remain active, ${result.recordingCount} recordings are unchanged, and ${result.archivedActivityCount} activities remain archived.`);
      console.log(`Lifecycle history: ${result.lifecycleTransitions} unique transitions; combined coverage ${result.combinedRecordedDays}/${result.combinedEligibleDays}.`);
    } else if (isAndroidBack || isAppInterruption) {
      const finalState = isAppInterruption ? 'workoutTodayModerate' : 'initial';
      const result = await verifyAndroidNavigationDatabase(resultDatabase, deviceToday, finalState);
      console.log(`PASS — ${result.activityCount} activities, ${result.recordingCount} unique recordings; Workout distribution ${JSON.stringify(result.workoutCounts)}; combined coverage ${result.combinedRecordedDays}/${result.combinedEligibleDays}.`);
    } else if (isDeleteAllEmpty) {
      const result = await verifyDeleteAllEmptyStatesDatabase(resultDatabase, deviceToday, 'allDeleted');
      console.log(`PASS — final database is empty: ${result.activityCount} activities, ${result.levelCount} levels, ${result.recordingCount} recordings; combined coverage ${result.combinedRecordedDays}/${result.combinedEligibleDays}.`);
    } else {
      const result = await verifyRecordingUpdateDatabase(resultDatabase, deviceToday, true);
      console.log(`PASS — UI updated the existing check-in; database contains ${result.activityCount} activity and ${result.recordingCount} check-ins.`);
      console.log(`Production rating distribution: ${JSON.stringify(result.distribution)}.`);
    }
  } catch (error) {
    console.error(`\n[${stage}/4] FAIL`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    if (deviceDatabaseLoaded) {
      try {
        console.log('\nCleaning this test fixture from TinyWins...');
        command('adb', ['shell', 'am', 'force-stop', packageId]);
        captureDeviceFile(`files/SQLite/${databaseName}`, cleanupDatabase);
        captureDeviceFile(`files/SQLite/${databaseName}-wal`, cleanupDatabase + '-wal', true);
        const isArchive = scenario === 'all-insights-archive';
        const isSameDay = scenario === 'same-day-recording';
        const isHistorical = scenario === 'historical-recording';
        const isDateBoundaries = scenario === 'date-filter-boundaries';
        const isSlider = scenario === 'slider-interactions';
        const isDelete = scenario === 'recording-delete';
        const isLevelBefore = scenario === 'level-reordering-before-recording';
        const isLevelAfter = scenario === 'level-reordering-after-recording';
        const isChartSkipped = scenario === 'chart-skipped-days';
        const isChartSparse = scenario === 'chart-sparse-data';
        const isChartMany = scenario === 'chart-many-recordings';
        const isRepeatedArchiveRestore = scenario === 'repeated-archive-restore';
        const isAndroidBack = scenario === 'android-back-navigation';
        const isAppInterruption = scenario === 'app-interruption-recovery';
        const isDeleteAllEmpty = scenario === 'delete-all-empty-states';
        if (isArchive) await cleanupAllInsightsArchiveDatabase(cleanupDatabase);
        else if (isSameDay) await cleanupSameDayRecordingDatabase(cleanupDatabase);
        else if (isHistorical) await cleanupHistoricalRecordingDatabase(cleanupDatabase);
        else if (isDateBoundaries) await cleanupDateFilterBoundariesDatabase(cleanupDatabase);
        else if (isSlider) await cleanupSliderInteractionsDatabase(cleanupDatabase);
        else if (isDelete) await cleanupRecordingDeleteDatabase(cleanupDatabase);
        else if (isLevelBefore) await cleanupLevelReorderingBeforeDatabase(cleanupDatabase);
        else if (isLevelAfter) await cleanupLevelReorderingAfterDatabase(cleanupDatabase);
        else if (isChartSkipped) await cleanupChartSkippedDaysDatabase(cleanupDatabase);
        else if (isChartSparse) await cleanupChartSparseDatabase(cleanupDatabase);
        else if (isChartMany) await cleanupChartManyRecordingsDatabase(cleanupDatabase);
        else if (isRepeatedArchiveRestore) await cleanupRepeatedArchiveRestoreDatabase(cleanupDatabase);
        else if (isAndroidBack || isAppInterruption) await cleanupAndroidNavigationDatabase(cleanupDatabase);
        else if (isDeleteAllEmpty) await cleanupDeleteAllEmptyStatesDatabase(cleanupDatabase);
        else await cleanupRecordingUpdateDatabase(cleanupDatabase);
        installDatabaseOnDevice(cleanupDatabase);
        captureDeviceFile(`files/SQLite/${databaseName}`, cleanedDeviceDatabase);
        captureDeviceFile(`files/SQLite/${databaseName}-wal`, cleanedDeviceDatabase + '-wal', true);
        if (isArchive) await verifyAllInsightsArchiveFixtureRemoved(cleanedDeviceDatabase);
        else if (isSameDay) await verifySameDayRecordingFixtureRemoved(cleanedDeviceDatabase);
        else if (isHistorical) await verifyHistoricalRecordingFixtureRemoved(cleanedDeviceDatabase);
        else if (isDateBoundaries) await verifyDateFilterBoundariesFixtureRemoved(cleanedDeviceDatabase);
        else if (isSlider) await verifySliderInteractionsFixtureRemoved(cleanedDeviceDatabase);
        else if (isDelete) await verifyRecordingDeleteFixtureRemoved(cleanedDeviceDatabase);
        else if (isLevelBefore) await verifyLevelReorderingBeforeFixtureRemoved(cleanedDeviceDatabase);
        else if (isLevelAfter) await verifyLevelReorderingAfterFixtureRemoved(cleanedDeviceDatabase);
        else if (isChartSkipped) await verifyChartSkippedDaysFixtureRemoved(cleanedDeviceDatabase);
        else if (isChartSparse) await verifyChartSparseFixtureRemoved(cleanedDeviceDatabase);
        else if (isChartMany) await verifyChartManyRecordingsFixtureRemoved(cleanedDeviceDatabase);
        else if (isRepeatedArchiveRestore) await verifyRepeatedArchiveRestoreFixtureRemoved(cleanedDeviceDatabase);
        else if (isAndroidBack || isAppInterruption) await verifyAndroidNavigationFixtureRemoved(cleanedDeviceDatabase);
        else if (isDeleteAllEmpty) await verifyDeleteAllEmptyStatesFixtureRemoved(cleanedDeviceDatabase);
        else await verifyRecordingUpdateFixtureRemoved(cleanedDeviceDatabase);
        console.log('Fixture cleanup verified; TinyWins no longer contains this test activity or its check-ins.');
      } catch (cleanupError) {
        console.error('Fixture cleanup failed:', cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
        process.exitCode = 1;
      }
    }
    rmSync(temp, { recursive: true, force: true });
  }
}

void main();
