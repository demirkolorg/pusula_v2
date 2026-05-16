/**
 * Producer side of the `pusula-attachment-cleanup` queue (Faz 11C — DEM-149).
 *
 * `apps/worker` owns the *consumer* (`apps/worker/src/jobs/attachment-cleanup.ts`
 * + `apps/worker/src/jobs/attachment-cleanup-sweeper.ts`); this module is the
 * API server's *producer*: a single BullMQ `Queue` over its own Redis
 * connection, surfaced as a best-effort `enqueueAttachmentCleanup` hook that's
 * injected into the tRPC context (see `src/trpc.ts`). The `attachment.delete`
 * mutation (Faz 11B — DEM-148) calls it after committing.
 *
 * Best-effort: a Redis failure is logged and swallowed — it must never fail
 * the API request (cleanup is maintenance; the DB row was already removed by
 * the mutation tx). The 60-min sweeper in `apps/worker` redrives any storage
 * objects that orphaned this way (it scans `committed_at IS NULL` drafts,
 * not deleted rows, so the redirect is implicit: a failed enqueue leaves an
 * orphaned object behind, which the sweeper can't see — but BullMQ's own
 * retry/backoff on a *successful* enqueue is the primary safety net here).
 *
 * Queue name + `jobId` shape are duplicated here (rather than imported from
 * `@pusula/worker`) to keep `apps/api` from depending on the worker app —
 * they must stay in sync (`pusula-attachment-cleanup`, `cleanup-{attachmentId}`,
 * job name `attachment-cleanup`). BullMQ forbids `:` in queue names and
 * custom job ids (Redis key separator). Mirrors the producer pattern
 * established by Faz 3C (`compaction-queue.ts`) and Faz 6A
 * (`notification-queue.ts`).
 */
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { EnqueueAttachmentCleanup } from '@pusula/api';
import { attachmentCleanupJobId } from './bullmq-job-ids';
import { env } from './env';

const QUEUE_NAME = 'pusula-attachment-cleanup';
const JOB_NAME = 'attachment-cleanup';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
connection.on('error', (err) => {
  console.error('[api] attachment-cleanup-queue redis error:', err.message);
});

const attachmentCleanupQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    // 3 attempts with exponential backoff — matches DEM-149 spec. A persistent
    // failure leaves the object in MinIO; ops can drain the BullMQ failed
    // list (kept 7 days via `removeOnFail`).
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { age: 60 * 60 * 24, count: 5_000 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

/**
 * Enqueue a cleanup job for an attachment whose DB row has already been
 * deleted. `jobId = cleanup-{attachmentId}` debounces duplicates (BullMQ
 * ignores a duplicate `jobId` while one is still waiting). Swallows + logs
 * Redis errors — fire-and-forget.
 */
export const enqueueAttachmentCleanup: EnqueueAttachmentCleanup = async ({
  attachmentId,
  storageKey,
}) => {
  try {
    await attachmentCleanupQueue.add(
      JOB_NAME,
      { attachmentId, storageKey },
      { jobId: attachmentCleanupJobId(attachmentId) },
    );
  } catch (err) {
    console.warn(
      `[api] attachment-cleanup enqueue failed (attachmentId=${attachmentId}):`,
      err instanceof Error ? err.message : String(err),
    );
  }
};

/** Close the queue + its Redis connection (called on graceful shutdown). */
export async function closeAttachmentCleanupQueue(): Promise<void> {
  await attachmentCleanupQueue.close().catch(() => {});
  await connection.quit().catch(() => {});
}
