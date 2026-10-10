import { addBreadcrumb, reportError, type ErrorOperation } from '../telemetry/crashlytics';

/** Fixed messages keep user-entered names, labels, and file contents out of diagnostics. */
const messages = [
  'App startup completed', 'Home loaded', 'Home load failed',
  'Insights opened', 'Insights data loaded', 'Insights data load failed',
  'Date range changed', 'Orientation changed', 'Orientation lock failed',
  'Activity create started', 'Activity create completed', 'Activity create failed',
  'Activity edit failed', 'Activity archive completed', 'Activity archive failed',
  'Activity restore completed', 'Activity restore failed', 'Activity delete completed', 'Activity delete failed',
  'Check-in save failed', 'Backup export started', 'Backup export completed',
  'Backup export failed', 'Backup export unverified', 'Backup import started', 'Backup import completed',
  'Backup import failed', 'Backup import rejected',
] as const;
export type LogMessage = typeof messages[number];
const knownMessages = new Set<string>(messages);

type Operation = 'database_read' | 'database_write' | 'analytics_read' | 'backup_export'
  | 'backup_import' | 'backup_file' | 'orientation_lock' | 'create' | 'archive'
  | 'restore' | 'delete' | 'checkin' | 'export' | 'import';
type Screen = 'home' | 'insights' | 'backup' | 'archived' | 'create' | 'orientation';
type Scope = 'all' | 'activity';
type Orientation = 'portrait' | 'landscape' | 'unknown';
type FailureCategory = 'encryption' | 'file_io' | 'validation' | 'database' | 'invalid_format' | 'unknown';
export interface LogMetadata {
  screen?: Screen;
  operation?: Operation;
  scope?: Scope;
  orientation?: Orientation;
  date_range?: '1d' | '7d' | '30d' | '90d' | 'custom';
  failure_category?: FailureCategory;
  activity_count?: number;
  level_count?: number;
  level_index?: number;
  range_days?: number;
}

const allowed: Record<string, readonly string[]> = {
  screen: ['home', 'insights', 'backup', 'archived', 'create', 'orientation'],
  operation: ['database_read', 'database_write', 'analytics_read', 'backup_export', 'backup_import',
    'backup_file', 'orientation_lock', 'create', 'archive', 'restore', 'delete', 'checkin', 'export', 'import'],
  scope: ['all', 'activity'], orientation: ['portrait', 'landscape', 'unknown'],
  date_range: ['1d', '7d', '30d', '90d', 'custom'],
  failure_category: ['encryption', 'file_io', 'validation', 'database', 'invalid_format', 'unknown'],
};
const counts = new Set(['activity_count', 'level_count', 'level_index', 'range_days']);
function safeMetadata(metadata?: LogMetadata): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  if (!metadata) return result;
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(allowed, key) && allowed[key].includes(value)) result[key] = value;
    else if (counts.has(key) && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) result[key] = value;
  }
  return result;
}

const infoBreadcrumbs = new Set<LogMessage>([
  'App startup completed', 'Home loaded', 'Insights opened', 'Insights data loaded',
  'Date range changed', 'Orientation changed', 'Activity create started',
  'Activity create completed', 'Activity archive completed', 'Activity restore completed',
  'Activity delete completed', 'Backup export started', 'Backup export completed',
  'Backup import started', 'Backup import completed',
]);
const errorOperations = new Set<Operation>([
  'database_read', 'database_write', 'backup_export', 'backup_import', 'backup_file',
  'analytics_read', 'orientation_lock',
]);
export function formatLogLine(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  message: LogMessage, metadata?: LogMetadata): string | null {
  if (!knownMessages.has(message)) return null;
  const safe = safeMetadata(metadata);
  const detail = Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : '';
  return `[${level}] ${message}${detail}`;
}
function write(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: LogMessage,
  metadata?: LogMetadata, cause?: unknown) {
  try {
    const line = formatLogLine(level, message, metadata);
    if (!line) return;
    if (__DEV__) {
      if (level === 'DEBUG') console.debug(line);
      else if (level === 'INFO') console.info(line);
      else if (level === 'WARN') console.warn(line);
      else console.error(line);
    }
    if (level === 'WARN' || level === 'INFO' && infoBreadcrumbs.has(message)) addBreadcrumb(line);
    if (level === 'ERROR') {
      const operation: ErrorOperation = metadata?.operation && errorOperations.has(metadata.operation)
        ? metadata.operation as ErrorOperation : 'unknown';
      reportError(cause, operation, line);
    }
  } catch { /* Logging is never part of the user operation. */ }
}

export const logger = {
  debug: (message: LogMessage, metadata?: LogMetadata) => write('DEBUG', message, metadata),
  info: (message: LogMessage, metadata?: LogMetadata) => write('INFO', message, metadata),
  warn: (message: LogMessage, metadata?: LogMetadata) => write('WARN', message, metadata),
  error: (message: LogMessage, metadata?: LogMetadata, cause?: unknown) => write('ERROR', message, metadata, cause),
};
