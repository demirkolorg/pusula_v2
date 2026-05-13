import { createDb, type Database } from '@pusula/db';
import { env } from './env';

/**
 * Worker-owned Drizzle handle. The worker is a separate process from the API,
 * so it gets its own pool (built from the worker's own `DATABASE_URL`) rather
 * than sharing `@pusula/db`'s lazily-created app singleton.
 */
const { db: workerDb, pool: workerPool } = createDb(env.DATABASE_URL);

export const db: Database = workerDb;
export const pool = workerPool;
