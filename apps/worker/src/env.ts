import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv({
  path: resolve(import.meta.dirname, '../../..', '.env'),
  override: false,
  quiet: true,
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  /** Where to point email/push deep-links back at. Same value `apps/api` uses. */
  APP_URL: z.string().min(1).default('http://localhost:3000'),
  // Faz 6B (DEM-91) — transactional notification email (Resend, shared with the
  // DEM-68 auth password-reset channel). Optional in dev/test: without a key the
  // email processor logs the message and stamps the outbox as if it were sent,
  // so worker boot doesn't require Resend creds locally.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default('Pusula <no-reply@pusula.local>'),
  // Faz 6B (DEM-91) — Expo Push enhanced security access token. Optional;
  // production-only knob. Without it the SDK uses anonymous push (still works,
  // just no rate-limit lift / signed sender).
  EXPO_PUSH_ACCESS_TOKEN: z.string().min(1).optional(),
  // E2E/CI guardrail: even if a local `.env` contains real Resend/Expo creds,
  // Playwright can force notification side effects into log-only mode.
  NOTIFICATION_EXTERNAL_DRY_RUN: z
    .enum(['0', '1', 'false', 'true'])
    .default('0')
    .transform((value) => value === '1' || value === 'true'),
  // Faz 11C (DEM-149) — S3/MinIO settings shared with `apps/api`. The worker
  // needs them for the `pusula-attachment-cleanup` queue (delete trigger +
  // orphan sweep `DeleteObjectCommand`). Same defaults as the API host so
  // dev/CI keep working without explicit env wiring.
  S3_ENDPOINT: z.string().min(1).default('http://localhost:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('pusula'),
  S3_ACCESS_KEY_ID: z.string().min(1).default('pusula'),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default('pusula-secret'),
  // Sentry `pusula-worker` projesinin DSN'i. Server-side; boş/eksikse
  // `Sentry.init` no-op olur (lokal dev/test Sentry'siz çalışır).
  // Bkz. `docs/architecture/10-platform.md` §10.5.1.
  SENTRY_DSN_WORKER: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
