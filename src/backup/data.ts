import { Buffer } from 'buffer';
import { Connection, SqlDatabase, SqlValue } from '../data/connection';
import { CURRENT_DATABASE_VERSION } from '../data/migrations';
import { MAX_PLAINTEXT_BYTES, PAYLOAD_VERSION, BackupFormatError } from './format';
import { characterCount, MAX_OPTION_DESCRIPTION_CHARACTERS } from '../domain/inputLimits';

const columns = {
  tasks: ['id', 'name', 'createdAt', 'updatedAt', 'active', 'createdLocalDate', 'archivedAt', 'chartColor', 'includeInCombinedInsights', 'levelsLocked', 'sortPosition'],
  task_options: ['id', 'taskId', 'label', 'position', 'rank', 'normalizedWeight', 'active', 'createdAt', 'updatedAt', 'description'],
  daily_entries: ['id', 'taskId', 'optionId', 'localDate', 'createdAt', 'updatedAt', 'optionLabelAtEntry',
    'positionAtEntry', 'rankAtEntry', 'normalizedWeightAtEntry'],
  task_lifecycle_transitions: ['id', 'taskId', 'type', 'occurredAt', 'localDate', 'utcOffsetMinutes',
    'timeZone', 'inferred'],
} as const;
export type BackupTable = keyof typeof columns;
type Row = Record<string, SqlValue>;
export type BackupTables = Record<BackupTable, Row[]>;
export interface BackupPayload {
  dataVersion: 2;
  sourceDatabaseVersion: number;
  createdAt: string;
  tables: BackupTables;
}

const tableNames = Object.keys(columns) as BackupTable[];
const order = ['tasks', 'task_options', 'daily_entries',
  'task_lifecycle_transitions'] as const;
const limits: Record<BackupTable, number> = { tasks: 10_000, task_options: 100_000,
  daily_entries: 1_000_000, task_lifecycle_transitions: 100_000 };

function fail(): never { throw new BackupFormatError('The backup contains invalid or incomplete data.'); }
function string(value: unknown, nullable = false): value is string | null {
  return value === null && nullable || typeof value === 'string' && value.length > 0 && value.length <= 100_000;
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}
function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === Number(value.slice(0, 4)) &&
    parsed.getMonth() + 1 === Number(value.slice(5, 7)) && parsed.getDate() === Number(value.slice(8, 10));
}
function timestamp(value: unknown) { return typeof value === 'string' && string(value) &&
  !Number.isNaN(Date.parse(value)); }
function checkRow(table: BackupTable, row: Row) {
  const expected = columns[table];
  const legacyOption = table === 'task_options' && !('description' in row);
  const legacyTask = table === 'tasks' && !('levelsLocked' in row);
  const legacySortPosition = table === 'tasks' && !('sortPosition' in row);
  if (Object.keys(row).length !== expected.length - Number(legacyOption) - Number(legacyTask) - Number(legacySortPosition) ||
    expected.some(column => !(column in row) && !(legacyOption && column === 'description') &&
      !(legacyTask && column === 'levelsLocked') && !(legacySortPosition && column === 'sortPosition'))) fail();
  if (!string(row.id)) fail();
  if (table === 'tasks') {
    if (!string(row.name) || typeof row.name !== 'string' || !row.name.trim() || !timestamp(row.createdAt) ||
      !timestamp(row.updatedAt) || !integer(row.active, 0, 1) ||
      !integer(row.includeInCombinedInsights, 0, 1) ||
      !(!('levelsLocked' in row) || integer(row.levelsLocked, 0, 1)) ||
      !(!('sortPosition' in row) || integer(row.sortPosition, 0)) ||
      !(row.createdLocalDate === null || date(row.createdLocalDate)) ||
      !(row.archivedAt === null || timestamp(row.archivedAt)) || !string(row.chartColor, true)) fail();
  } else if (table === 'task_options') {
    if (!string(row.taskId) || !string(row.label) || typeof row.label !== 'string' || !row.label.trim() ||
      !(!('description' in row) || row.description === null || typeof row.description === 'string' &&
        characterCount(row.description) <= MAX_OPTION_DESCRIPTION_CHARACTERS) ||
      !integer(row.position, 1) || !integer(row.rank, 1) ||
      !integer(row.normalizedWeight, 0, 100) || !integer(row.active, 0, 1) ||
      !timestamp(row.createdAt) || !timestamp(row.updatedAt)) fail();
  } else if (table === 'daily_entries') {
    if (!string(row.taskId) || !string(row.optionId) || !date(row.localDate) ||
      !timestamp(row.createdAt) || !timestamp(row.updatedAt) ||
      !string(row.optionLabelAtEntry) || !integer(row.positionAtEntry, 1) ||
      !integer(row.rankAtEntry, 1) || !integer(row.normalizedWeightAtEntry, 0, 100)) fail();
  } else if (table === 'task_lifecycle_transitions') {
    if (!string(row.taskId) || !['archived', 'restored'].includes(String(row.type)) ||
      !timestamp(row.occurredAt) || !date(row.localDate) ||
      !integer(row.utcOffsetMinutes, -840, 840) || !string(row.timeZone) ||
      !integer(row.inferred, 0, 1)) fail();
  }
}

export function validateBackupPayload(value: unknown): BackupPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const payload = value as BackupPayload;
  if (payload.dataVersion > PAYLOAD_VERSION)
    throw new BackupFormatError('This backup needs a newer version of TinyWins.');
  if (payload.dataVersion !== PAYLOAD_VERSION ||
    !integer(payload.sourceDatabaseVersion, 1, CURRENT_DATABASE_VERSION) || !timestamp(payload.createdAt) ||
    !payload.tables || typeof payload.tables !== 'object' || Array.isArray(payload.tables) ||
    Object.keys(payload.tables).length !== tableNames.length) fail();
  for (const table of tableNames) {
    const rows = payload.tables[table];
    if (!Array.isArray(rows) || rows.length > limits[table]) fail();
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) fail();
      checkRow(table, row);
      if (ids.has(row.id as string)) fail();
      ids.add(row.id as string);
    }
  }
  const tasks = new Map(payload.tables.tasks.map(row => [row.id, row]));
  const options = new Map(payload.tables.task_options.map(row => [row.id, row]));
  const entryDays = new Set<string>();
  for (const row of payload.tables.tasks) {
    if (payload.tables.task_options.filter(option => option.taskId === row.id && option.active === 1).length < 2) fail();
  }
  for (const row of payload.tables.task_options) if (!tasks.has(row.taskId)) fail();
  for (const row of payload.tables.task_lifecycle_transitions) if (!tasks.has(row.taskId)) fail();
  for (const row of payload.tables.daily_entries) {
    const option = options.get(row.optionId);
    const unique = `${row.taskId}\u0000${row.localDate}`;
    if (!tasks.has(row.taskId) || !option || option.taskId !== row.taskId ||
      entryDays.has(unique)) fail();
    entryDays.add(unique);
  }
  // Older backups predate descriptions and the permanent level lock. Infer the
  // lock from retained entries; absence cannot prove a cleared past check-in.
  const recordedTaskIds = new Set(payload.tables.daily_entries.map(row => row.taskId));
  const restoreOrder = new Map<string, string>();
  for (const transition of payload.tables.task_lifecycle_transitions) {
    if (transition.type !== 'restored') continue;
    const current = restoreOrder.get(String(transition.taskId));
    if (!current || String(transition.occurredAt) > current)
      restoreOrder.set(String(transition.taskId), String(transition.occurredAt));
  }
  const hasLegacyOrdering = payload.tables.tasks.some(row => !('sortPosition' in row));
  const initialPositions = new Map([...payload.tables.tasks]
    .sort((a, b) => (restoreOrder.get(String(a.id)) ?? String(a.createdAt)).localeCompare(
      restoreOrder.get(String(b.id)) ?? String(b.createdAt)) || String(a.id).localeCompare(String(b.id)))
    .map((row, position) => [String(row.id), position]));
  return { ...payload, tables: { ...payload.tables,
    tasks: payload.tables.tasks.map(row => ({ ...row,
      levelsLocked: recordedTaskIds.has(row.id) ? 1 : (row.levelsLocked ?? 0),
      sortPosition: hasLegacyOrdering ? initialPositions.get(String(row.id))! : row.sortPosition })),
    task_options: payload.tables.task_options.map(row => 'description' in row ? row : { ...row, description: null }) } };
}

async function checkDatabase(db: SqlDatabase) {
  const foreign = await db.getAllAsync('PRAGMA foreign_key_check');
  const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  if (foreign.length || integrity?.integrity_check !== 'ok')
    throw new BackupFormatError('The backup database failed its integrity check.');
}
async function readTables(db: SqlDatabase): Promise<BackupTables> {
  const result = {} as BackupTables;
  for (const table of tableNames) result[table] = await db.getAllAsync<Row>(`SELECT * FROM ${table} ORDER BY id`);
  return result;
}
function tablesMatch(actual: BackupTables, expected: BackupTables) {
  return tableNames.every(table => actual[table].length === expected[table].length &&
    actual[table].every((row, index) => {
      const other = expected[table][index];
      return Object.keys(other).length === Object.keys(row).length &&
        Object.keys(other).every(key => row[key] === other[key]);
    }));
}
export async function collectBackupPayload(connection: Connection): Promise<BackupPayload> {
  return connection.transaction(async db => {
    await checkDatabase(db);
    const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version;
    if (version !== CURRENT_DATABASE_VERSION)
      throw new BackupFormatError('The database version is not supported for backup.');
    const payload = validateBackupPayload({ dataVersion: PAYLOAD_VERSION,
      sourceDatabaseVersion: version, createdAt: new Date().toISOString(), tables: await readTables(db) });
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_PLAINTEXT_BYTES)
      throw new BackupFormatError('This backup is too large.');
    return payload;
  });
}

export function decodeBackupPayload(bytes: Uint8Array): BackupPayload {
  if (bytes.length > MAX_PLAINTEXT_BYTES) throw new BackupFormatError('This backup is too large.');
  try { return validateBackupPayload(JSON.parse(Buffer.from(bytes).toString('utf8'))); }
  catch (error) {
    if (error instanceof BackupFormatError) throw error;
    throw new BackupFormatError('The backup contains invalid data.');
  }
}

export function encodeBackupPayload(payload: BackupPayload): Uint8Array {
  return Buffer.from(JSON.stringify(validateBackupPayload(payload)), 'utf8');
}

/** One immediate transaction is both the replacement and its recovery boundary.
 * WAL rolls back an interruption; readback and integrity checks run before COMMIT. */
export async function restoreBackupPayload(connection: Connection, payload: BackupPayload) {
  const normalized = validateBackupPayload(payload);
  await connection.transaction(async db => {
    // The transaction itself is the recovery snapshot: SQLite retains the old
    // pages until COMMIT and rolls back all changes on failure or interruption.
    for (const table of [...order].reverse()) await db.execAsync(`DELETE FROM ${table}`);
    for (const table of order) {
      const names = columns[table];
      const statement = `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`;
      for (const row of normalized.tables[table]) await db.runAsync(statement,
        ...names.map(name => row[name]));
    }
    await db.runAsync(`INSERT INTO app_metadata(key, value) VALUES ('legacyImported', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
    await checkDatabase(db);
    if (!tablesMatch(await readTables(db), normalized.tables))
      throw new BackupFormatError('The restored data could not be verified.');
  });
}

export function backupPreview(payload: BackupPayload) {
  return { createdAt: payload.createdAt, items: payload.tables.tasks.length,
    archived: payload.tables.tasks.filter(row => row.active === 0).length,
    recordings: payload.tables.daily_entries.length };
}
