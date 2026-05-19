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
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 chars (32+ in production)'),
  APP_URL: z.string().min(1).default('http://localhost:3000'),
  API_URL: z.string().min(1).default('http://localhost:3001'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  S3_ENDPOINT: z.string().min(1).default('http://localhost:9000'),
  // Browser/device-facing base URL for the MinIO bucket (DEM-160). EVERY S3 URL
  // a client touches is built from this: the public avatar URL (`users.image`)
  // AND the presigned upload/download URLs (avatar PUT, attachment GET) — clients
  // cannot reach the internal `S3_ENDPOINT` (`http://minio:9000` in prod) and
  // `http://` is mixed-content on an HTTPS page. Only server-to-server S3 access
  // (the worker's cleanup) uses `S3_ENDPOINT`. In production set it to the public
  // MinIO origin (Traefik subdomain). Optional: when unset (local dev) every
  // client-facing URL — presigned PUT/GET AND the persisted `publicUrl`
  // (`users.image`) — derives its host from the incoming request `Host` so a
  // mobile device gets a reachable LAN IP instead of `localhost` (DEM-215 — see
  // `object-storage.ts` / `docs/architecture/09-depolama-ve-arama.md` §9.1.2).
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

// Üretim sertleştirme guard'ı: prod'da hiçbir kritik env zayıf/default değere
// sessizce düşmemeli. Geliştirme/test default'ları (`pusula` S3 anahtarları,
// `redis://localhost:6379`) prod'da gerçek bir konfigürasyon hatası demektir —
// boot'u açık hatayla durdur.
function assertProductionHardening(value: z.infer<typeof envSchema>): void {
  if (value.NODE_ENV !== 'production') return;
  const issues: string[] = [];
  if (value.S3_ACCESS_KEY_ID === 'pusula') {
    issues.push('S3_ACCESS_KEY_ID must not be the default "pusula" in production');
  }
  if (value.S3_SECRET_ACCESS_KEY === 'pusula-secret') {
    issues.push('S3_SECRET_ACCESS_KEY must not be the default "pusula-secret" in production');
  }
  if (value.REDIS_URL === 'redis://localhost:6379') {
    issues.push('REDIS_URL must not point at localhost in production');
  }
  if (value.AUTH_SECRET.length < 32) {
    issues.push('AUTH_SECRET must be at least 32 chars in production');
  }
  // APP_URL paylaşım linki / auth e-posta callback'lerinin tabanıdır; prod'da
  // localhost'a düşerse maillerdeki ve /share linkleri bozulur.
  if (value.APP_URL.includes('localhost')) {
    issues.push('APP_URL must not point at localhost in production');
  }
  if (issues.length > 0) {
    throw new Error(`Invalid production environment:\n- ${issues.join('\n- ')}`);
  }
}

const parsedEnv = envSchema.parse(process.env);
assertProductionHardening(parsedEnv);

export const env = parsedEnv;
export type Env = typeof env;
