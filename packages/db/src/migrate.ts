/**
 * Applies pending SQL migrations from `./drizzle` against `DATABASE_URL`.
 * Run with: `pnpm db:migrate` (root) or `pnpm --filter @pusula/db migrate`.
 */
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

async function main() {
  const { db, pool } = createDb();
  const migrationsFolder = resolve(import.meta.dirname, '..', 'drizzle');
  console.warn(`[db] applying migrations from ${migrationsFolder} ...`);
  await migrate(db, { migrationsFolder });
  console.warn('[db] migrations applied.');
  await pool.end();
}

main().catch((err) => {
  console.error('[db] migration failed:', err);
  process.exitCode = 1;
});
