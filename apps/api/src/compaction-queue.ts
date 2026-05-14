/**
 * Producer side of the `pusula-compaction` queue (Faz 3C — DEM-44).
 *
 * `apps/worker` owns the *consumer* (`apps/worker/src/jobs/compaction.ts`); this
 * module is the API server's *producer*: a single BullMQ `Queue` over its own
 * Redis connection, surfaced as a best-effort `enqueueCompaction` hook that's
 * injected into the tRPC context (see `src/trpc.ts`). `list.move` / `card.move`
 * call it after committing when they produced a long fractional `position` key.
 *
 * Best-effort: a Redis failure is logged and swallowed — it must never fail the
 * API request (compaction is pure maintenance; the move already succeeded).
 *
 * Queue name + `jobId` shape are duplicated here (rather than imported from
 * `@pusula/worker`) to keep `apps/api` from depending on the worker app — they
 * must stay in sync (`pusula-compaction`, `compaction-{list|board}-{id}`,
 * job name `position-compaction`). BullMQ forbids `:` in queue names and custom
 * job ids (Redis key separator).
 */
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { CompactionScope } from '@pusula/api';
import { compactionJobId } from './bullmq-job-ids';
import { env } from './env';

const QUEUE_NAME = 'pusula-compaction';
const JOB_NAME = 'position-compaction';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
connection.on('error', (err) => {
  console.error('[api] compaction-queue redis error:', err.message);
});

const compactionQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { age: 60 * 60 * 24, count: 1_000 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

function scopeId(scope: CompactionScope): string {
  return scope.kind === 'list' ? scope.listId : scope.boardId;
}

/**
 * Enqueue a compaction job for `scope`. `jobId` debounces per scope (BullMQ
 * ignores a duplicate `jobId` while one is still waiting). Swallows + logs Redis
 * errors — fire-and-forget.
 */
export async function enqueueCompaction(scope: CompactionScope): Promise<void> {
  try {
    await compactionQueue.add(
      JOB_NAME,
      { scope },
      { jobId: compactionJobId(scope) },
    );
  } catch (err) {
    console.warn(
      `[api] compaction enqueue failed (${scope.kind}:${scopeId(scope)}):`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Close the queue + its Redis connection (called on graceful shutdown). */
export async function closeCompactionQueue(): Promise<void> {
  await compactionQueue.close().catch(() => {});
  await connection.quit().catch(() => {});
}
