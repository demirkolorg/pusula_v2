import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// In dev, inherit the monorepo root `.env`. In production the process env wins.
loadDotenv({ path: resolve(import.meta.dirname, '../../..', '.env'), override: false, quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 chars'),
  APP_URL: z.string().min(1).default('http://localhost:3000'),
  API_URL: z.string().min(1).default('http://localhost:3001'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  // Transactional email (Resend) — used for the password-reset link (and later
  // signup verification). Optional: with no key, the auth flow still works and
  // the reset callback degrades to best-effort (logs the link instead of
  // mailing it). See `docs/architecture/07-auth.md` (Şifre sıfırlama akışı).
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default('Pusula <no-reply@pusula.local>'),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
