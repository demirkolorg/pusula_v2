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
  /**
   * Faz 13I (DEM-265) — rapor PDF render asset'leri için ayrı MinIO/S3
   * bucket. Attachment bucket'ından (`S3_BUCKET`) izolasyon: lifecycle
   * politikaları farklı (rapor 90g + son 5 sürüm policy; attachment
   * süresiz). Lokal dev'de aynı MinIO instance üzerinde sadece bucket
   * adı değişir; production'da retention/ACL'leri farklı policy ile
   * yönetmek için ayrı bucket şart. Default `pusula-reports` — local
   * MinIO setup'u boot-time'da bucket yoksa açar (Faz 13P retention
   * worker'da; 13I worker varsayar).
   */
  S3_REPORTS_BUCKET: z.string().min(1).default('pusula-reports'),
  // Sentry `pusula-worker` projesinin DSN'i. Server-side; boş/eksikse
  // `Sentry.init` no-op olur (lokal dev/test Sentry'siz çalışır).
  // Bkz. `docs/architecture/10-platform.md` §10.5.1.
  SENTRY_DSN_WORKER: z.string().min(1).optional(),
  /**
   * Faz 13I (DEM-265) — Puppeteer PDF render worker'ının `report.print.
   * requestToken` çağırırken taşıdığı paylaşılan secret. Aynı değer
   * `apps/api/src/env.ts`'de yaşar; eşleşmezse `apps/api` tRPC procedure
   * UNAUTHORIZED. Boş bırakılırsa worker print akışı no-op — render job
   * 'failed' status'unda kalır.
   */
  WORKER_SHARED_SECRET: z.string().min(32).optional(),
  /**
   * Faz 13I (DEM-265) — Worker'ın `report.print.requestToken` çağırdığı
   * tRPC endpoint'inin internal URL'i. Production'da private network
   * (`http://api:3001` compose service adı); dev'de `http://localhost:3001`.
   * Print sayfası ise public web URL'ini kullanır (`APP_URL`).
   */
  INTERNAL_API_URL: z.string().url().default('http://localhost:3001'),
  /**
   * Faz 13I (DEM-265) — Puppeteer'ın launch edeceği Chrome/Chromium binary
   * yolu. Docker image'da Alpine `apk add chromium` ile `/usr/bin/chromium-
   * browser` (Dockerfile'da set edilir). Lokal dev'de Windows/macOS:
   * `process.env.PUPPETEER_EXECUTABLE_PATH` set edilmediyse worker render
   * job'u launch edemez ve `failed` döner; testler puppeteer-core mock'lar.
   */
  PUPPETEER_EXECUTABLE_PATH: z.string().min(1).optional(),
});

// Üretim sertleştirme guard'ı (apps/api ile aynı disiplin): prod'da kritik env
// zayıf/default değere sessizce düşmesin — açık hatayla boot'u durdur.
// `DATABASE_URL` zaten `min(1)` ile zorunlu (default yok). `AUTH_SECRET`
// worker'da kullanılmadığı için kontrol edilmez.
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
  // APP_URL e-posta/push şablonlarındaki derin bağlantıların tabanıdır; prod'da
  // localhost'a düşerse davet/bildirim maillerindeki linkler bozulur (DEM —
  // worker servisine APP_URL geçilmediğinde yaşanan papercut).
  if (value.APP_URL.includes('localhost')) {
    issues.push('APP_URL must not point at localhost in production');
  }
  // Faz 13I (DEM-265) — INTERNAL_API_URL prod'da private network'e işaret
  // etmeli (compose service adı veya internal LB). Localhost'a düşerse worker
  // print akışı kırılır + Puppeteer render fail eder.
  if (value.INTERNAL_API_URL.includes('localhost')) {
    issues.push('INTERNAL_API_URL must not point at localhost in production');
  }
  // Faz 13I (DEM-265 security M1) — `WORKER_SHARED_SECRET` print akışının
  // single point of trust'ı; prod'da set edilmezse worker her render'da
  // `print_token_failed` ile retry → sessiz outage. Boot-time'da explicit
  // hata ver. Min 32 char garantisi zaten schema'da.
  if (!value.WORKER_SHARED_SECRET) {
    issues.push('WORKER_SHARED_SECRET must be set (>=32 chars) in production');
  }
  if (issues.length > 0) {
    throw new Error(`Invalid production environment:\n- ${issues.join('\n- ')}`);
  }
}

const parsedEnv = envSchema.parse(process.env);
assertProductionHardening(parsedEnv);

export const env = parsedEnv;
export type Env = typeof env;
