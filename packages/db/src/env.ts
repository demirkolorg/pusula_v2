import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Best-effort: load the monorepo root `.env` so the db tooling and scripts work
// regardless of the cwd they're invoked from. Vars already present in the
// environment take precedence (override: false).
//
// Faz 14F follow-up (2026-05-25): Next.js 16 Turbopack server bundle'da
// `import.meta.dirname` `undefined` döner (`apps/web`'in route handler'ı bu
// modülü import edince patlıyordu). `fileURLToPath(import.meta.url)` tüm
// runner'larda (Node ESM + tsx + Turbopack + Vitest) tutarlı; native modül
// resolve disiplini için tercih edilir.
const moduleDir =
  import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
loadDotenv({
  path: resolve(moduleDir, '../../..', '.env'),
  override: false,
  quiet: true,
});

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

export const dbEnv = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
});
