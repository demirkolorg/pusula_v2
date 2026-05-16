import { resolve } from 'node:path';
import { emailSchema } from '@pusula/domain';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// In dev, inherit the monorepo root `.env`. In production the process env wins.
loadDotenv({
  path: resolve(import.meta.dirname, '../../..', '.env'),
  override: false,
  quiet: true,
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 chars'),
  APP_URL: z.string().min(1).default('http://localhost:3000'),
  API_URL: z.string().min(1).default('http://localhost:3001'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  S3_ENDPOINT: z.string().min(1).default('http://localhost:9000'),
  // Browser-facing base URL for the MinIO bucket (DEM-160). EVERY S3 URL the
  // browser touches is built from this: the public avatar URL (`users.image`)
  // AND the presigned upload/download URLs (avatar PUT, attachment GET) — the
  // browser cannot reach the internal `S3_ENDPOINT` (`http://minio:9000` in
  // prod) and `http://` is mixed-content on an HTTPS page. Only server-to-server
  // S3 access (the worker's cleanup) uses `S3_ENDPOINT`. Optional: when unset it
  // falls back to `S3_ENDPOINT` (correct for local dev, where `S3_ENDPOINT`
  // is already the host-mapped `http://localhost:9100`). In production set it
  // to the public MinIO origin (Traefik subdomain). See
  // `docs/architecture/09-depolama-ve-arama.md` §9.1.1.
  S3_PUBLIC_URL: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('pusula'),
  S3_ACCESS_KEY_ID: z.string().min(1).default('pusula'),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default('pusula-secret'),
  // Transactional email (Resend) — used for the password-reset link (and later
  // signup verification). Optional: with no key, the auth flow still works and
  // the reset callback degrades to best-effort (logs the link instead of
  // mailing it). See `docs/architecture/07-auth.md` (Şifre sıfırlama akışı).
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default('Pusula <no-reply@pusula.local>'),
  // Dev-only recipient override (v1's `MAIL_DEV_ALICI_OVERRIDE`, renamed for the
  // v2 `EMAIL_*` naming): when set and `NODE_ENV !== 'production'`, every
  // transactional auth email goes to this address instead of the real recipient.
  // Ignored in production. Handy because the Resend test sender
  // (`onboarding@resend.dev`) only delivers to the Resend account owner.
  EMAIL_DEV_OVERRIDE: emailSchema.optional(),
  // Sentry `pusula-api` projesinin DSN'i. Server-side; boş/eksikse `Sentry.init`
  // no-op olur (lokal dev/test Sentry'siz çalışır). Bkz. `10-platform.md` §10.5.1.
  SENTRY_DSN_API: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
