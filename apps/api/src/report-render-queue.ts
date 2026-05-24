/**
 * Producer side of the `pusula-report-render` queue (Faz 13I — DEM-265).
 *
 * `apps/worker` owns the consumer (`apps/worker/src/jobs/report-render.ts`).
 * This module is the API server's *producer*: a BullMQ `Queue` over its own
 * Redis connection (BullMQ's `maxRetriesPerRequest: null` is required for the
 * blocking commands on the worker side — producers stay on a fresh client to
 * avoid cross-contamination).
 *
 * `report.export` mutation (Faz 13D — DEM-260) calls `enqueueReportRender`
 * after committing the `report_renders` row. Best-effort: a Redis blip leaves
 * the row in `status='queued'`; until a Faz 13P (DEM-272) retention/sweeper
 * worker comes online, those rows sit indefinitely (operator can manually
 * re-enqueue). Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.8.
 *
 * Queue name + job name are duplicated here (rather than imported from
 * `@pusula/worker`) to keep `apps/api` independent of the worker app — they
 * MUST stay in sync (`pusula-report-render`, `report-render`).
 */
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from './env';

const QUEUE_NAME = 'pusula-report-render';
const JOB_NAME = 'report-render';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
connection.on('error', (err) => {
  console.error('[api] report-render-queue redis error:', err.message);
});

const reportRenderQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 60 * 60 * 24, count: 500 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

/**
 * Enqueue a render job for the given `renderId`. Best-effort — a Redis blip
 * logs + returns; the DB row already exists with `status='queued'`. `jobId`
 * = renderId, which BullMQ uses to debounce duplicate enqueues (idempotent
 * tRPC retry doesn't spawn a second job).
 */
export async function enqueueReportRender(input: { renderId: string }): Promise<void> {
  try {
    await reportRenderQueue.add(JOB_NAME, input, { jobId: input.renderId });
  } catch (err) {
    console.warn(
      `[api] report-render enqueue failed (renderId=${input.renderId}):`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Close the queue + its Redis connection (called on graceful shutdown). */
export async function closeReportRenderQueue(): Promise<void> {
  await reportRenderQueue.close().catch(() => {});
  await connection.quit().catch(() => {});
}
