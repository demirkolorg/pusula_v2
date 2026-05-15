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

/**
 * Periyodik cleanup: expired bucket'ları (resetAt geçmiş) çöp toplar. Aksi
 * halde her IP yeni bir Map entry yapar, sınırsız bellek büyür (security
 * review P1 — Faz 9C 2026-05-15). Lazy cleanup: her rateLimit çağrısında
 * O(N) süpürme pahalı; bunun yerine sayaç bazlı tetik (1000 yeni bucket
 * sonrası). Production'da Redis token bucket'a göç edilecek (Faz 8).
 */
let bucketsAdded = 0;
function sweepExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function resolveClientIp(c: Parameters<MiddlewareHandler>[0]): string {
  // Production reverse proxy (nginx/Cloudflare/Dokploy) `x-forwarded-for`'u
  // override etmeli; aksi halde istemci spoofable. Production deploy
  // runbook'ta bu garantisi belgelenir (security review P1 — Faz 8 hardening
  // notunda `TRUSTED_PROXY_IPS` env kontrolü eklenir).
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
      bucketsAdded += 1;
      if (bucketsAdded >= 1000) {
        sweepExpiredBuckets(now);
        bucketsAdded = 0;
      }
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
