import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// `pnpm db:*` invokes drizzle-kit with cwd = packages/db, so the repo root
// `.env` is two levels up. (drizzle-kit also resolves `schema`/`out` from cwd.)
loadDotenv({ path: resolve(process.cwd(), '..', '..', '.env'), override: false, quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy `env.example` to `.env` at the repo root.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: databaseUrl },
  verbose: true,
  strict: true,
});
