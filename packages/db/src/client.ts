import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { dbEnv } from './env';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

/** Create an isolated pool + drizzle instance (used by tests, scripts). */
export function createDb(connectionString: string = dbEnv.DATABASE_URL): {
  db: Database;
  pool: Pool;
} {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool };
}

// Lazily-created shared singleton for app/server use. Apps must ensure the
// environment is loaded before the first import that touches `db`.
let _shared: { db: Database; pool: Pool } | undefined;

export function getDb(): Database {
  _shared ??= createDb();
  return _shared.db;
}

export function getPool(): Pool {
  _shared ??= createDb();
  return _shared.pool;
}

/** Convenience proxy so callers can `import { db } from '@pusula/db'`. */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
