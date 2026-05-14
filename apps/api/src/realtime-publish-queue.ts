/**
 * Producer side of the `pusula-realtime-publish` queue (Faz 5B — DEM-84).
 *
 * `apps/worker` owns the *consumer* (`apps/worker/src/jobs/realtime-publish.ts`);
 * this module is the API server's *producer*: a single BullMQ `Queue` over its
 * own Redis connection, surfaced as a best-effort `enqueueRealtimePublish` hook
 * that's injected into the tRPC context (see `src/trpc.ts`). Mutation bodies
 * call it after committing a transaction that wrote a `realtime_events` row.
 *
 * Best-effort: a Redis failure is logged and swallowed — it must never fail the
 * API request. The periodic sweeper (`apps/worker/src/jobs/realtime-publish-sweeper.ts`)
 * picks up any rows the enqueue missed (`published_at IS NULL AND created_at <
 * NOW() - INTERVAL '30s'`).
 *
 * Queue name + job name are duplicated here (rather than imported from
 * `@pusula/worker`) to keep `apps/api` from depending on the worker app — they
 * must stay in sync (`pusula-realtime-publish`, `realtime-publish`). BullMQ
 * forbids `:` in queue names and custom job ids (Redis key separator).
 */
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { EnqueueRealtimePublish } from '@pusula/api';
import { realtimePublishJobId } from './bullmq-job-ids';
import { env } from './env';

const QUEUE_NAME = 'pusula-realtime-publish';
const JOB_NAME = 'realtime-publish';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
connection.on('error', (err) => {
  console.error('[api] realtime-publish-queue redis error:', err.message);
});

const realtimePublishQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    // 3 attempts with exponential backoff — failures fall back to the sweeper.
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { age: 60 * 60 * 24, count: 5_000 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

/**
 * Enqueue a publish job for a freshly written `realtime_events` row. `jobId =
 * publish-{eventId}` so duplicate enqueues (e.g. enqueue + sweeper re-trigger)
 * are debounced by BullMQ. Swallows + logs Redis errors — fire-and-forget; the
 * sweeper guarantees delivery.
 */
export const enqueueRealtimePublish: EnqueueRealtimePublish = async ({ eventId }) => {
  try {
    await realtimePublishQueue.add(
      JOB_NAME,
      { eventId },
      { jobId: realtimePublishJobId(eventId) },
    );
  } catch (err) {
    console.warn(
      `[api] realtime-publish enqueue failed (eventId=${eventId}):`,
      err instanceof Error ? err.message : String(err),
    );
  }
};

/** Close the queue + its Redis connection (called on graceful shutdown). */
export async function closeRealtimePublishQueue(): Promise<void> {
  await realtimePublishQueue.close().catch(() => {});
  await connection.quit().catch(() => {});
}
