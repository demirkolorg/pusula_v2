/**
 * Public API + Bot Erişimi (Task 3) — `apiKeyAuth` Hono middleware.
 *
 * `/api/v1/*` (Task 4'te mount edilir) zincirinin kimlik katmanı:
 *
 *   Authorization: Bearer psk_<43-char>
 *     → format guard (psk_ + base64url; DB'ye gitmeden ucuz eleme)
 *     → `token_prefix` lookup (index'li) → aday satır(lar)
 *     → SHA-256 `hashApiKeyToken` + `crypto.timingSafeEqual` (sabit-süre karar)
 *     → revoked / expired kontrolü
 *     → bot user yükle + `is_bot` doğrula
 *     → per-key Redis rate limit (INCR + EXPIRE, sabit pencere) → aşımda 429
 *     → `last_used_at` throttle'lı güncelle (fire-and-forget)
 *     → `c.set('apiKeyAuth', { apiKey, botUser })` → `next()`
 *
 * Worker `x-worker-secret` doğrulamasındaki (`src/trpc.ts`) `timingSafeEqual`
 * disiplinini izler: uzunluk uyuşmazsa erken `false` (timingSafeEqual aksi
 * halde throw eder). Plain token asla loglanmaz — yalnız `token_prefix`.
 *
 * Rate limit sabit pencere (fixed window): `ratelimit:apikey:<keyId>` anahtarı
 * `INCR` edilir; ilk artışta `EXPIRE <window>` set edilir. Sayaç limiti aşarsa
 * kalan TTL'den `Retry-After` hesaplanır. **Redis client enjekte edilebilir**
 * (factory parametresi) — production `apps/api`'nin ioredis fabrikası, testler
 * in-memory fake. Redis hatasında **fail-open** + Sentry uyarısı (bot
 * entegrasyonunu Redis bakımı kırmasın; kötüye kullanım riski key sahibinin
 * kendi panosuyla sınırlı).
 *
 * Bkz. `docs/architecture/21-public-api-ve-bot-erisimi.md`,
 * `docs/superpowers/plans/2026-07-13-public-api-ve-bot-erisimi.md` Task 3.
 */
import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import * as Sentry from '@sentry/node';
import { apiKeys, eq, getDb, users } from '@pusula/db';
import { apiKeyTokenPrefix, hashApiKeyToken } from '@pusula/api/lib/api-key-token';

type ApiKeyRow = typeof apiKeys.$inferSelect;
type BotUserRow = typeof users.$inferSelect;

/** Doğrulanmış API key + bot kullanıcısı — `c.set('apiKeyAuth', …)`. */
export interface ApiKeyAuthResult {
  apiKey: ApiKeyRow;
  botUser: BotUserRow;
}

/** `apiKeyAuth` mount edilen Hono alt-uygulamasının Variables tipi. */
export type ApiKeyAuthEnv = { Variables: { apiKeyAuth: ApiKeyAuthResult } };

/**
 * Rate limit için gereken minimal Redis yüzeyi (ioredis yapısal olarak sağlar;
 * testler in-memory fake enjekte eder). Fixed-window sayaç: `INCR` + `EXPIRE`
 * + kalan `TTL`.
 */
export interface ApiKeyRateLimitStore {
  incr(key: string): Promise<number>;
  /** Saniye cinsinden TTL set eder (yalnız pencere ilk açılışında çağrılır). */
  expire(key: string, seconds: number): Promise<unknown>;
  /** Kalan TTL (saniye). Anahtar yoksa/expiry yoksa negatif döner. */
  ttl(key: string): Promise<number>;
}

export interface ApiKeyAuthOptions {
  /**
   * Redis-backed fixed-window rate limit store. `null`/omit → rate limiting
   * devre dışı (yalnız Redis'siz yerel geliştirme; production her zaman verir).
   */
  rateLimitStore?: ApiKeyRateLimitStore | null;
  /** Pencerede izin verilen maksimum istek (varsayılan 120). */
  rateLimitMax?: number;
  /** Pencere uzunluğu, saniye (varsayılan 60). */
  rateLimitWindowSec?: number;
  /**
   * Redis hatası raporlayıcısı (fail-open). Varsayılan: Sentry + `console.warn`.
   * Enjekte edilebilir (test'te fail-open davranışını doğrulamak için).
   */
  reportError?: (err: unknown, context: string) => void;
}

const RATE_LIMIT_KEY_PREFIX = 'ratelimit:apikey:';
const DEFAULT_MAX = 120;
const DEFAULT_WINDOW_SEC = 60;
/** `last_used_at` en çok bu aralıkla (ms) yazılır — dakikada ≤ 1 yazım. */
const LAST_USED_THROTTLE_MS = 60_000;
/** `psk_` (4) + 43 karakter base64url gövde. */
const TOKEN_SHAPE = /^psk_[A-Za-z0-9_-]{43}$/;

function defaultReportError(err: unknown, context: string): void {
  console.warn(
    `[api] apiKeyAuth ${context} failed (fail-open):`,
    err instanceof Error ? err.message : String(err),
  );
  Sentry.captureException(err, { tags: { area: 'apiKeyAuth', context } });
}

/** `Authorization: Bearer <token>` başlığından token'ı ayıkla. */
function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  return match ? match[1]! : null;
}

/** İki SHA-256 hex hash'ini sabit-süreli karşılaştır (uzunluk uyuşmazsa false). */
function hashesEqual(storedHex: string, candidateHex: string): boolean {
  const stored = Buffer.from(storedHex, 'hex');
  const candidate = Buffer.from(candidateHex, 'hex');
  if (stored.length !== candidate.length || stored.length === 0) return false;
  return timingSafeEqual(stored, candidate);
}

interface RateLimitDecision {
  allowed: boolean;
  retryAfterSec?: number;
}

/** Fixed-window sayaç: INCR + (ilk artışta) EXPIRE. Redis hatası → fail-open. */
async function checkRateLimit(
  store: ApiKeyRateLimitStore,
  apiKeyId: string,
  max: number,
  windowSec: number,
  reportError: (err: unknown, context: string) => void,
): Promise<RateLimitDecision> {
  const key = `${RATE_LIMIT_KEY_PREFIX}${apiKeyId}`;
  try {
    const count = await store.incr(key);
    if (count === 1) {
      // Pencere ilk kez açıldı — TTL set et. Aksi halde anahtar kalıcı olur.
      await store.expire(key, windowSec);
    }
    if (count > max) {
      let ttl = await store.ttl(key);
      if (ttl < 0) {
        // Sayaç TTL'siz kalmış (ilk `EXPIRE` kaçtı / TTL süresi düştü ama sayaç
        // hâlâ limitin üstünde) — pencere süresini yeniden ata. Aksi halde
        // anahtar kalıcı olur ve 429 kilidi hiç açılmaz (kalıcı self-heal).
        await store.expire(key, windowSec);
        ttl = windowSec;
      }
      return { allowed: false, retryAfterSec: Math.max(1, ttl) };
    }
    return { allowed: true };
  } catch (err) {
    reportError(err, 'rate limit');
    return { allowed: true }; // fail-open
  }
}

/** `last_used_at`'i throttle'lı, fire-and-forget güncelle (await edilmez). */
function touchLastUsedAt(apiKey: ApiKeyRow): void {
  const now = Date.now();
  if (apiKey.lastUsedAt && now - apiKey.lastUsedAt.getTime() < LAST_USED_THROTTLE_MS) {
    return;
  }
  void getDb()
    .update(apiKeys)
    .set({ lastUsedAt: new Date(now) })
    .where(eq(apiKeys.id, apiKey.id))
    .catch(() => undefined);
}

/**
 * `apiKeyAuth` middleware fabrikası. `rateLimitStore` (Redis) enjekte edilir;
 * omit edilirse rate limit atlanır (yalnız Redis'siz yerel geliştirme).
 */
export function apiKeyAuth(options: ApiKeyAuthOptions = {}): MiddlewareHandler<ApiKeyAuthEnv> {
  const store = options.rateLimitStore ?? null;
  const max = options.rateLimitMax ?? DEFAULT_MAX;
  const windowSec = options.rateLimitWindowSec ?? DEFAULT_WINDOW_SEC;
  const reportError = options.reportError ?? defaultReportError;

  return async (c, next) => {
    // Her yanıt cache'lenemez (401/429 dahil erken dönüşleri de kapsar).
    c.header('Cache-Control', 'no-store');

    const token = parseBearerToken(c.req.header('authorization'));
    if (!token) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'API anahtarı gerekli.' } },
        401,
      );
    }
    if (!TOKEN_SHAPE.test(token)) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Geçersiz API anahtarı.' } },
        401,
      );
    }

    const db = getDb();
    const prefix = apiKeyTokenPrefix(token);
    const candidates = await db.select().from(apiKeys).where(eq(apiKeys.tokenPrefix, prefix));

    const candidateHash = hashApiKeyToken(token);
    const apiKey = candidates.find((row) => hashesEqual(row.tokenHash, candidateHash));
    if (!apiKey) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Geçersiz API anahtarı.' } },
        401,
      );
    }

    if (apiKey.revokedAt) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'API anahtarı iptal edilmiş.' } },
        401,
      );
    }
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'API anahtarının süresi dolmuş.' } },
        401,
      );
    }

    const [botUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, apiKey.botUserId))
      .limit(1);
    if (!botUser || !botUser.isBot) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Geçersiz API anahtarı.' } },
        401,
      );
    }

    if (store) {
      const decision = await checkRateLimit(store, apiKey.id, max, windowSec, reportError);
      if (!decision.allowed) {
        c.header('Retry-After', String(decision.retryAfterSec ?? windowSec));
        return c.json(
          {
            error: {
              code: 'TOO_MANY_REQUESTS',
              message: 'İstek limiti aşıldı. Lütfen sonra tekrar deneyin.',
            },
          },
          429,
        );
      }
    }

    touchLastUsedAt(apiKey);

    c.set('apiKeyAuth', { apiKey, botUser });
    await next();
  };
}
