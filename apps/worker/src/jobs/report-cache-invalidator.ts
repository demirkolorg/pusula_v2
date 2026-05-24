/**
 * Faz 13E ([DEM-261](https://linear.app/demirkol/issue/DEM-261)) — rapor
 * cache invalidator job. Consumer of `pusula-report-cache-invalidator`
 * BullMQ queue.
 *
 * Tetik kaynağı: `apps/worker/src/jobs/realtime-publish.ts` her başarılı
 * publish sonrası bu queue'ya `{ event: { eventType, ids... } }` job
 * atar. Worker:
 *   1. `collectInvalidationPatterns` ile etkilenen pattern setini hesaplar.
 *   2. Her pattern için Redis SCAN+DEL (`@pusula/api/lib/report-cache`
 *      `invalidatePattern`).
 *   3. `report.invalidated` socket event'i Redis pub/sub `pusula:report:
 *      invalidated` channel'ına publish eder; `apps/api/src/socket/`
 *      bridge'i workspace room'una emit eder (Faz 5B realtime-publish
 *      ile aynı pattern).
 *
 * Best-effort: hatalar log + retry (defaultJobOptions 2 attempt). Cache
 * TTL eninde sonunda her şeyi temizler → sweeper'a gerek yok.
 */
import {
  buildRedisReportCache,
  type RedisCacheClient,
} from '@pusula/api/lib/report-cache';
import {
  collectInvalidationPatterns,
  REPORT_INVALIDATED_CHANNEL,
  type InvalidationEventContext,
  type ReportInvalidatedMessage,
} from '@pusula/api/lib/report-invalidation';

/** Job payload — producer (`realtime-publish` job) bu shape'i atar. */
export interface ReportCacheInvalidatorJobData {
  event: InvalidationEventContext;
}

/** Publisher surface — Redis pub/sub `publish` method'u. */
export interface ReportInvalidatedPublisher {
  publish: (channel: string, message: string) => Promise<number> | number;
}

export interface InvalidationResult {
  patternsScanned: number;
  totalKeysDeleted: number;
  socketPublished: boolean;
}

/**
 * Job processor. `redis` parametresi cache SCAN/DEL için (data plane);
 * `publisher` parametresi pub/sub için (signaling). Production'da
 * ikisi aynı ioredis connection (data + pub/sub Redis'te aynı conn
 * üzerinde çalışır), test'te ayrı mockable instance'lar.
 */
export async function processReportCacheInvalidatorJob(
  data: ReportCacheInvalidatorJobData,
  deps: {
    redis: RedisCacheClient;
    publisher: ReportInvalidatedPublisher;
    /** Now injection — test deterministic ISO timestamp. */
    now?: () => Date;
  },
): Promise<InvalidationResult> {
  const { event } = data;
  const { patterns, scopeKinds } = collectInvalidationPatterns(event);

  const cache = buildRedisReportCache(deps.redis);
  let totalKeysDeleted = 0;
  for (const pattern of patterns) {
    try {
      totalKeysDeleted += await cache.invalidatePattern(pattern);
    } catch (err) {
      // Tek pattern fail ederse diğerleri devam etsin (idempotent — TTL
      // eninde sonunda siler).
      console.warn(
        `[worker:report-invalidator] pattern '${pattern}' failed:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Socket event publish — `apps/api` bridge dinler ve workspace room'a
  // emit eder. Pub/sub failure cache invalidation'ı geçersiz kılmaz.
  let socketPublished = false;
  const message: ReportInvalidatedMessage = {
    event: {
      at: (deps.now ?? (() => new Date()))().toISOString(),
      scopeKinds,
      workspaceId: event.workspaceId,
      boardId: event.boardId ?? undefined,
      listId: event.listId ?? undefined,
      cardId: event.cardId ?? undefined,
      eventType: event.eventType,
    },
    room: { kind: 'workspace', id: event.workspaceId },
  };
  try {
    await deps.publisher.publish(REPORT_INVALIDATED_CHANNEL, JSON.stringify(message));
    socketPublished = true;
  } catch (err) {
    console.warn(
      '[worker:report-invalidator] socket publish failed:',
      err instanceof Error ? err.message : String(err),
    );
  }

  return {
    patternsScanned: patterns.length,
    totalKeysDeleted,
    socketPublished,
  };
}
