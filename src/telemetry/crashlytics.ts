export type ErrorOperation = 'database_read' | 'database_write' | 'backup_export' | 'backup_import' | 'backup_file' | 'analytics_read' | 'orientation_lock' | 'unknown';
let initialization: Promise<boolean> | null = null;

export function initializeCrashlytics(): Promise<boolean> {
  if (initialization) return initialization;
  initialization = import('@react-native-firebase/crashlytics')
    .then(async ({ getCrashlytics, setCrashlyticsCollectionEnabled }) => {
      await setCrashlyticsCollectionEnabled(getCrashlytics(), true);
      return true;
    }).catch(() => false);
  return initialization;
}

export function addBreadcrumb(message: string) {
  try {
    void initializeCrashlytics().then(async () => {
      const { getCrashlytics, log } = await import('@react-native-firebase/crashlytics');
      await log(getCrashlytics(), message);
    }).catch(() => {});
  } catch { /* Diagnostics must not affect the app. */ }
}

export function reportError(cause: unknown, operation: ErrorOperation, breadcrumb: string = operation) {
  // Preserve the original stack, but never turn arbitrary user/file text into an error message.
  const error = cause instanceof Error ? cause : new Error(`Unexpected ${operation} failure`);
  try {
    void initializeCrashlytics().then(async () => {
      const { getCrashlytics, log, recordError } = await import('@react-native-firebase/crashlytics');
      const instance = getCrashlytics();
      await log(instance, breadcrumb);
      await recordError(instance, error);
    }).catch(() => {});
  } catch { /* Reporting must not replace the original application error. */ }
}
