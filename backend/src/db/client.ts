import fs from 'node:fs';
import path from 'node:path';
import { Kysely, PostgresDialect, SqliteDialect, sql } from 'kysely';
import type { AppConfig } from '../config/env';
import type { DB, Database, Dialect } from './types';
import { migrateToLatest } from './migrations';

export interface DbHandle {
  db: DB;
  dialect: Dialect;
  close(): Promise<void>;
}

export async function createDb(config: Pick<AppConfig, 'databaseUrl' | 'databaseSsl' | 'sqlitePath'>): Promise<DbHandle> {
  if (config.databaseUrl) {
    const { default: pg } = await import('pg');
    // Keep BIGINT (e.g. COUNT/SUM) as JS numbers; amounts are far below 2^53.
    pg.types.setTypeParser(20, (v: string) => Number.parseInt(v, 10));
    pg.types.setTypeParser(1700, (v: string) => Number.parseFloat(v));
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    await migrateToLatest(db, 'postgres');
    return { db, dialect: 'postgres', close: () => db.destroy() };
  }

  const { default: SqliteDatabase } = await import('better-sqlite3');
  const file = config.sqlitePath === ':memory:' ? ':memory:' : path.resolve(config.sqlitePath);
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new SqliteDatabase(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  await migrateToLatest(db, 'sqlite');
  return { db, dialect: 'sqlite', close: () => db.destroy() };
}

export async function pingDb(db: DB): Promise<boolean> {
  try {
    await sql`select 1`.execute(db);
    return true;
  } catch {
    return false;
  }
}
