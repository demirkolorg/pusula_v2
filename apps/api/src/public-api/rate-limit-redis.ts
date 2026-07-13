/**
 * Public API + Bot Erişimi (Task 3) — `apiKeyAuth` rate limit'i için somut
 * ioredis-backed store.
 *
 * `apps/api` içindeki Redis bağlantı deseninin (BullMQ producer'ları +
 * `report-cache` + socket adapter) birebir aynısını izler: kendi
 * `new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck:
 * false })` bağlantısı, `error` event'i loglanır (bağlantı hatası süreci
 * düşürmez). `apiKeyAuth` bu store'u fixed-window sayaç için kullanır
 * (`INCR` + `EXPIRE` + `TTL`); Redis hatasında middleware **fail-open** olur.
 * Aynı bağlantı `Idempotency-Key` dedup store'unu da besler
 * (`apiKeyIdempotencyStore`, `GET` + `SETEX`) — tek ioredis singleton iki
 * public-API yan-kanalını (rate limit + dedup) taşır.
 *
 * Bu modül Task 4'te `/api/v1` mount edilirken `apiKeyAuth({ rateLimitStore:
 * apiKeyRateLimitStore })` olarak enjekte edilir — Task 3 hiçbir route mount
 * etmez. Import edilene kadar bağlantı açılmaz (module-level singleton).
 */
import { Redis } from 'ioredis';
import { env } from '../env';
import type { ApiKeyRateLimitStore } from '../middleware/api-key-auth';
import type { IdempotencyRecord, IdempotencyStore } from './idempotency-store';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
connection.on('error', (err) => {
  console.error('[api] api-key rate-limit redis error:', err.message);
});

/** `apiKeyAuth` fabrikasına enjekte edilen production store. */
export const apiKeyRateLimitStore: ApiKeyRateLimitStore = {
  incr: (key) => connection.incr(key),
  expire: (key, seconds) => connection.expire(key, seconds),
  ttl: (key) => connection.ttl(key),
};

/**
 * `idempotencyDedup` middleware'ine enjekte edilen production store. Kayıt JSON
 * serialize edilip `SET key value EX ttlSec` ile (24 saat) saklanır; okuma
 * `GET` + `JSON.parse`. Redis hatası çağıran middleware'de fail-open olur.
 */
export const apiKeyIdempotencyStore: IdempotencyStore = {
  get: async (key) => {
    const raw = await connection.get(key);
    return raw ? (JSON.parse(raw) as IdempotencyRecord) : null;
  },
  set: async (key, record, ttlSec) => {
    await connection.set(key, JSON.stringify(record), 'EX', ttlSec);
  },
};

/** Graceful shutdown — Redis bağlantısını kapat. */
export async function closeApiKeyRateLimitStore(): Promise<void> {
  await connection.quit().catch(() => {});
}
