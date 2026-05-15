/**
 * Faz 9C (DEM-129) — basit in-memory IP/dakika rate limiter. Public share
 * endpoint'lerinin (`GET /share/:token`, `POST /share/:token/comments`)
 * önünde kullanılır. Single-process: lokal Map, restart'la sıfırlanır.
 * Production ölçeklenmesi gerektiğinde Redis-backed implementation'a göç
 * edilir (Faz 8 hardening — `docs/architecture/10-platform.md`).
 *
 * Aşımda `429 Too Many Requests` döner; body Türkçe hata mesajı.
 */
import type { MiddlewareHandler } from 'hono';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Pencere uzunluğu (ms). */
  readonly windowMs: number;
  /** Pencerede izin verilen maksimum istek. */
  readonly max: number;
  /** 429 response gövdesinde dönecek Türkçe hata mesajı. */
  readonly message?: string;
  /** Bucket anahtarı için izole prefix (örn. `share-get`, `share-post`). */
  readonly key: string;
}

const buckets = new Map<string, Bucket>();

function resolveClientIp(c: Parameters<MiddlewareHandler>[0]): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const ip = resolveClientIp(c);
    const key = `${opts.key}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.count >= opts.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return c.json(
        { error: opts.message ?? 'Çok fazla istek. Lütfen sonra tekrar deneyin.' },
        429,
        { 'Retry-After': String(retryAfterSec) },
      );
    }
    bucket.count += 1;
    await next();
  };
}

/** Test ortamı için bucket'ları sıfırla. */
export function clearRateLimitBuckets(): void {
  buckets.clear();
}
