/**
 * Faz 13E ([DEM-261](https://linear.app/demirkol/issue/DEM-261)) — `apps/api`
 * host'unda `reportCache` Redis singleton + builder. `packages/api/src/lib/
 * report-cache.ts` interface'ini gerçek ioredis instance'ı ile bağlar; ctx
 * üzerinden tRPC procedure'lerine inject edilir.
 *
 * Pattern: Faz 5B `realtime-publish-queue.ts` ile simetrik — kendi Redis
 * connection'u (BullMQ paylaşımı tartışmalı; cache şu an ayrı connection
 * — Redis SET/GET/SCAN BullMQ blocking command'lerinden bağımsız çalışır).
 */
import { Redis } from 'ioredis';
import {
  buildRedisReportCache,
  noOpReportCache,
  type ReportCache,
} from '@pusula/api/lib/report-cache';
import { env } from './env';

const connection = new Redis(env.REDIS_URL, {
  // Cache get/set BullMQ blocking command kullanmaz; default retry profili OK.
  // Ama enableReadyCheck=false reconnect süresini düşürür (Faz 5 connection
  // ile simetrik).
  enableReadyCheck: false,
});
connection.on('error', (err) => {
  console.error('[api] report-cache redis error:', err.message);
});

/** Singleton cache — tRPC procedure'leri her request'te bunu kullanır. */
export const reportCache: ReportCache = buildRedisReportCache(connection);

/** Test/dev fallback — env'de REDIS_URL eksikse host bu builder'ı kullanır. */
export function buildFallbackReportCache(): ReportCache {
  return noOpReportCache;
}

/** Shutdown — graceful Redis quit. */
export async function closeReportCache(): Promise<void> {
  await connection.quit().catch(() => {});
}
