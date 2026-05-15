import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Best-effort: load the monorepo root `.env` so the db tooling and scripts work
// regardless of the cwd they're invoked from. Vars already present in the
// environment take precedence (override: false).
loadDotenv({
  path: resolve(import.meta.dirname, '../../..', '.env'),
  override: false,
  quiet: true,
});

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

export const dbEnv = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
});
