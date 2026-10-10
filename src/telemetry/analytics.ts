import { Platform } from 'react-native';

type Scope = 'all' | 'activity';
type BackupOperation = 'export' | 'import';
type FailureCategory = 'encryption' | 'file_io' | 'validation' | 'database' | 'unknown';
export type OrientationName = 'portrait' | 'landscape' | 'unknown';

type EventName = 'activity_created' | 'activity_archived' | 'activity_restored' | 'activity_deleted'
  | 'checkin_recorded' | 'checkin_changed' | 'checkin_removed' | 'insights_opened'
  | 'chart_viewed' | 'date_range_changed' | 'backup_exported' | 'backup_imported'
  | 'backup_failed' | 'screen_orientation_changed';

// Only semantic helpers below can send events. Callers cannot add user-entered strings.
function emit(name: EventName, params: Record<string, string | number> = {}) {
  try {
    const safe = { ...params, platform: Platform.OS };
    if (__DEV__) console.info(`[Analytics] ${name}`);
    void import('@react-native-firebase/analytics')
      .then(({ getAnalytics, logEvent }) => logEvent(getAnalytics(), name, safe))
      .catch(() => {});
  } catch { /* Telemetry must not affect a committed user operation. */ }
}

export const trackActivityCreated = (levelCount: number, activityCount: number) => emit('activity_created', { level_count: levelCount, activity_count: activityCount });
export const trackActivityArchived = () => emit('activity_archived');
export const trackActivityRestored = () => emit('activity_restored');
export const trackActivityDeleted = (deletedCount = 1) => emit('activity_deleted', { deleted_count: deletedCount });
export const trackCheckinRecorded = (levelIndex: number, activityCount: number) => emit('checkin_recorded', { level_index: levelIndex, activity_count: activityCount });
export const trackCheckinChanged = (levelIndex: number, activityCount: number) => emit('checkin_changed', { level_index: levelIndex, activity_count: activityCount });
export const trackCheckinRemoved = (activityCount: number) => emit('checkin_removed', { activity_count: activityCount });
export const trackInsightsOpened = (scope: Scope) => emit('insights_opened', { scope });
export const trackChartViewed = (chartType: string, scope: Scope) => emit('chart_viewed', { chart_type: chartType, scope });
export const trackDateRangeChanged = (rangeType: string) => emit('date_range_changed', { range_type: rangeType });
export const trackBackupExported = (backupSizeBytes?: number) => emit('backup_exported', backupSizeBytes === undefined ? {} : { backup_size_bytes: backupSizeBytes });
export const trackBackupImported = (activityCount: number, recordCount: number) => emit('backup_imported', { activity_count: activityCount, record_count: recordCount });
export const trackBackupFailed = (operation: BackupOperation, category: FailureCategory) => emit('backup_failed', { operation, failure_category: category });
export const trackOrientationChanged = (from: OrientationName, to: OrientationName, screenName?: string) =>
  emit('screen_orientation_changed', { from_orientation: from, to_orientation: to, ...(screenName ? { screen_name: screenName } : {}) });
