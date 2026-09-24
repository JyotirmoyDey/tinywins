import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { Connection, SqlDatabase } from '../src/data/connection';
import { migrate } from '../src/data/migrations';
import { TaskRepository } from '../src/data/repository';
import { DailyEntryRepository } from '../src/data/dailyEntryRepository';
export async function setup(path = ':memory:') {
  const native = new DatabaseSync(path);
  const db: SqlDatabase = {
    execAsync: async sql => { native.exec(sql); },
    runAsync: async (sql, ...params) => native.prepare(sql).run(...params),
    getAllAsync: async <T>(sql: string, ...params: (string | number | null)[]) => native.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, ...params: (string | number | null)[]) => (native.prepare(sql).get(...params) ?? null) as T | null,
  };
  const connection = new Connection(db); await migrate(connection);
  return { native, db, connection, tasks: new TaskRepository(connection, randomUUID), entries: new DailyEntryRepository(connection, randomUUID) };
}
export const draft = (name = ' Sleep ') => ({ name, options: ['Poor', 'Okay', 'Good', 'Excellent'].map(label => ({ id: randomUUID(), label })) });
