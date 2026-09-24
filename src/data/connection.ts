export type SqlValue = string | number | null;
/** Small adapter shared by Expo SQLite and the real SQLite test driver. */
export interface SqlDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
}
export class Connection {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly db: SqlDatabase) {}
  run<T>(action: (db: SqlDatabase) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => action(this.db));
    this.tail = result.catch(() => {});
    return result;
  }
  transaction<T>(action: (db: SqlDatabase) => Promise<T>): Promise<T> {
    return this.run(async db => {
      await db.execAsync('BEGIN IMMEDIATE');
      try { const result = await action(db); await db.execAsync('COMMIT'); return result; }
      catch (error) { await db.execAsync('ROLLBACK'); throw error; }
    });
  }
}
