/**
 * Public API + Bot Erişimi — `Idempotency-Key` dedup katmanı (best-effort,
 * Redis-backed).
 *
 * `apps/api/src/public-api/idempotency.ts` yalnız header'ı UUID doğrular ve
 * `clientMutationId`'ye köprüler (procedure-içi idempotency). Bu modül ONUN
 * ÜZERİNE **taşıma-katmanı** dedup ekler: AI ajanları ağ hatasında agresif
 * retry yapar; procedure idempotency'si aynı mutasyonu tekrar uygulamasa da her
 * retry yeni bir tRPC turu (DB + activity + realtime) tüketir. Bu middleware
 * aynı `(apiKeyId, Idempotency-Key)` çiftinin ilk 2xx yanıtını 24 saat cache'ler
 * ve tekrarını **aynen replay** eder (`Idempotency-Replayed: true`), böylece
 * caller hiç çağrılmaz.
 *
 * Semantik (mutasyon = POST/PATCH/DELETE, geçerli UUID anahtarı olan istek):
 *  - cache HIT + aynı gövde imzası → saklanan yanıt aynen döner (replay).
 *  - cache HIT + FARKLI gövde imzası → 409 `IDEMPOTENCY_KEY_REUSED` (anahtar
 *    yeniden kullanılmış; kopya kayıt riski).
 *  - cache MISS → `next()`; yanıt 2xx ise `{ status, body, bodyHash }` cache'lenir.
 *
 * `bodyHash = SHA-256(method + path + raw body)` — aynı anahtarın farklı bir
 * mutasyona yapıştırılmasını yakalar (path da imzaya girer).
 *
 * Fail-open: store (Redis) hata verirse dedup atlanır (istek normal işler) +
 * `reportError`. `apiKeyAuth` rate-limit'iyle aynı disiplin — bot entegrasyonunu
 * Redis bakımı kırmasın; risk key sahibinin kendi panosuyla sınırlı.
 *
 * Body okuma: Hono `c.req.json()` bu sürümde `c.req.text()` üzerine kuruludur
 * (aynı `"text"` bodyCache anahtarı). Middleware'de `c.req.text()` çağrısı
 * gövdeyi cache'ler; handler'daki `readBody` (`c.req.json()`) aynı cache'lenmiş
 * promise'i tekrar kullanır — çifte-tüketim yok, `raw.clone()` gerekmez.
 */
import { createHash } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as Sentry from '@sentry/node';
import type { ApiKeyAuthEnv } from '../middleware/api-key-auth';
import { IDEMPOTENCY_HEADER, parseIdempotencyKey } from './idempotency';

/** Dedup penceresi (saniye) — 24 saat. AI ajanı retry ufkunu kapsar. */
export const IDEMPOTENCY_TTL_SEC = 24 * 60 * 60;

/** Yalnız bu HTTP metotları dedup edilir (mutasyonlar). */
const MUTATION_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

/** Cache'lenen yanıt kaydı (yalnız 2xx). */
export interface IdempotencyRecord {
  /** Saklanan HTTP durum kodu (201 create, 200 update, …). */
  readonly status: number;
  /** Saklanan JSON gövde — replay'de aynen döner. */
  readonly body: unknown;
  /** SHA-256(method + path + raw body) — aynı anahtar farklı gövde tespiti. */
  readonly bodyHash: string;
}

/**
 * Dedup kayıt deposu. Production ioredis (`rate-limit-redis.ts`), testler
 * in-memory fake enjekte eder. `null` → dedup kapalı (yalnız Redis'siz yerel
 * geliştirme; production her zaman verir).
 */
export interface IdempotencyStore {
  /** Kayıt yoksa `null`. */
  get(key: string): Promise<IdempotencyRecord | null>;
  /** TTL saniye cinsinden — üstüne yaz (SETEX semantiği). */
  set(key: string, record: IdempotencyRecord, ttlSec: number): Promise<void>;
}

export interface IdempotencyDedupOptions {
  /** Enjekte edilebilir kayıt deposu; `null` → dedup atlanır. */
  store: IdempotencyStore | null;
  /**
   * Store hatası raporlayıcısı (fail-open). Varsayılan: Sentry + `console.warn`.
   * Enjekte edilebilir (test'te fail-open davranışını doğrulamak için).
   */
  reportError?: (err: unknown, context: string) => void;
}

function defaultReportError(err: unknown, context: string): void {
  console.warn(
    `[api] idempotency ${context} failed (fail-open):`,
    err instanceof Error ? err.message : String(err),
  );
  Sentry.captureException(err, { tags: { area: 'idempotencyDedup', context } });
}

/** `idem:{apiKeyId}:{key}` — dedup cache anahtarı (key sahibine scope'lu). */
export function idempotencyCacheKey(apiKeyId: string, idempotencyKey: string): string {
  return `idem:${apiKeyId}:${idempotencyKey}`;
}

/** `SHA-256(method + "\n" + path + "\n" + raw body)` hex digest. */
export function computeBodyHash(method: string, path: string, rawBody: string): string {
  return createHash('sha256').update(`${method}\n${path}\n${rawBody}`).digest('hex');
}

/**
 * `Idempotency-Key` dedup Hono middleware'i. `apiKeyAuth`'tan SONRA mount edilir
 * (kimliği doğrulanmış `apiKey.id`'yi cache anahtarına scope'lar). Mutasyon
 * dışı metotlar, anahtarsız/geçersiz istekler ve store'suz kurulum dokunulmadan
 * geçer (handler'ın `requireIdempotencyKey`'i eksik anahtarda 400 döner).
 */
export function idempotencyDedup(
  options: IdempotencyDedupOptions,
): MiddlewareHandler<ApiKeyAuthEnv> {
  const { store } = options;
  const reportError = options.reportError ?? defaultReportError;

  return async (c, next) => {
    if (!store || !MUTATION_METHODS.has(c.req.method)) {
      return next();
    }

    const parsed = parseIdempotencyKey(c.req.header(IDEMPOTENCY_HEADER));
    if (!parsed.ok || !parsed.key) {
      // Eksik / geçersiz anahtar → handler'ın `requireIdempotencyKey`'i 400 verir.
      return next();
    }

    const auth = c.get('apiKeyAuth');
    if (!auth) return next(); // apiKeyAuth zinciri garanti eder — savunma.

    // Gövdeyi ÖNCE oku (bodyCache'e düşer); handler'ın `readBody`'si aynı
    // cache'lenmiş metni tekrar kullanır (çifte-tüketim yok).
    const rawBody = await c.req.text().catch(() => '');
    const bodyHash = computeBodyHash(c.req.method, c.req.path, rawBody);
    const cacheKey = idempotencyCacheKey(auth.apiKey.id, parsed.key);

    let existing: IdempotencyRecord | null = null;
    try {
      existing = await store.get(cacheKey);
    } catch (err) {
      reportError(err, 'get');
      return next(); // fail-open — dedup yok, istek normal işler.
    }

    if (existing) {
      if (existing.bodyHash === bodyHash) {
        c.header('Idempotency-Replayed', 'true');
        return c.json(existing.body as never, existing.status as ContentfulStatusCode);
      }
      return c.json(
        {
          error: {
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Bu Idempotency-Key farklı bir istek gövdesiyle zaten kullanıldı.',
          },
        },
        409,
      );
    }

    await next();

    // Yalnız 2xx yanıtlar cache'lenir (4xx/5xx retry edilebilir kalır).
    const status = c.res.status;
    if (status >= 200 && status < 300) {
      try {
        const body = await c.res.clone().json();
        await store.set(cacheKey, { status, body, bodyHash }, IDEMPOTENCY_TTL_SEC);
      } catch (err) {
        reportError(err, 'set');
      }
    }
  };
}
