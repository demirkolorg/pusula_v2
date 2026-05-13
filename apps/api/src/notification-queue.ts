/**
 * Producer side of the `pusula-notifications` queue (Faz 6A — DEM-90).
 *
 * `apps/worker` owns the *consumer* (`apps/worker/src/jobs/notification-publish.ts`);
 * this module is the API server's *producer*: a single BullMQ `Queue` over its
 * own Redis connection, surfaced as a best-effort `enqueueNotificationPublish`
 * hook that's injected into the tRPC context (see `src/trpc.ts`). Mutation
 * gövdeleri call it after committing a transaction that wrote one or more
 * `notification_outbox` rows.
 *
 * Best-effort: a Redis failure is logged and swallowed — it must never fail the
 * API request. The periodic sweeper (`apps/worker/src/jobs/notification-publish-sweeper.ts`)
 * picks up any rows the enqueue missed (`processed_at IS NULL AND created_at <
 * NOW() - INTERVAL '30s'`).
 *
 * Queue name + job name are duplicated here (rather than imported from
 * `@pusula/worker`) to keep `apps/api` from depending on the worker app — they
 * must stay in sync (`pusula-notifications`, `notification-publish`). BullMQ
 * forbids `:` in queue names (Redis key separator); job *ids* may still use
 * `:`. Mirrors the producer pattern established by Faz 5B
 * (`realtime-publish-queue.ts`).
 */
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { EnqueueNotificationPublish } from '@pusula/api';
import { env } from './env';

const QUEUE_NAME = 'pusula-notifications';
const JOB_NAME = 'notification-publish';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
connection.on('error', (err) => {
  console.error('[api] notification-queue redis error:', err.message);
});

const notificationQueue = new Queue(QUEUE_NAME, {
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
 * Enqueue a publish job for a freshly written `notification_outbox` batch. The
 * `eventId` (activity_events.id) is enough — the worker reads every
 * `notification_outbox` row linked to it. `jobId = notify:{eventId}` so
 * duplicate enqueues (e.g. mutation + sweeper) are debounced by BullMQ.
 * Swallows + logs Redis errors — fire-and-forget; the sweeper guarantees
 * delivery.
 */
export const enqueueNotificationPublish: EnqueueNotificationPublish = async ({ eventId }) => {
  try {
    await notificationQueue.add(
      JOB_NAME,
      { eventId },
      { jobId: `notify:${eventId}` },
    );
  } catch (err) {
    console.warn(
      `[api] notification-publish enqueue failed (eventId=${eventId}):`,
      err instanceof Error ? err.message : String(err),
    );
  }
};

/** Close the queue + its Redis connection (called on graceful shutdown). */
export async function closeNotificationQueue(): Promise<void> {
  await notificationQueue.close().catch(() => {});
  await connection.quit().catch(() => {});
}
