import { Worker } from 'bullmq';
import { QUEUE, allQueues, realtimePublishQueue } from './queues';
import { connection } from './redis';
import { db, pool } from './db';
import { env } from './env';
import { processCompactionJob, type CompactionJobData } from './jobs/compaction';
import {
  createDefaultPublisher,
  processRealtimePublishJob,
  REALTIME_PUBLISH_JOB_NAME,
  type RealtimePublishJobData,
} from './jobs/realtime-publish';
import {
  REALTIME_PUBLISH_SWEEPER_INTERVAL_MS,
  REALTIME_PUBLISH_SWEEPER_JOB_NAME,
  sweepStaleRealtimeEvents,
} from './jobs/realtime-publish-sweeper';

/**
 * Worker process skeleton. The notification / scheduled processors below are
 * still placeholders — the real outbox logic lands in later phases
 * (architecture doc §9, §13). Faz 3C (DEM-44) wired the position-compaction
 * processor; Faz 5B (DEM-84) wires `realtime-publish` (DB outbox →
 * Redis pub/sub → `apps/api` Socket.IO bridge) + its 60 s sweeper.
 */

const notificationsWorker = new Worker(
  QUEUE.notifications,
  async (job) => {
    console.warn(`[worker:notifications] (stub) job ${job.id} ${job.name}`);
  },
  { connection, concurrency: 5 },
);

// Faz 5B (DEM-84) — separate Redis client for the pub/sub publish. BullMQ's
// `connection` has `maxRetriesPerRequest: null` (blocking commands); pub/sub
// wants normal retry semantics.
const realtimePublisher = createDefaultPublisher(env.REDIS_URL);

const realtimeWorker = new Worker(
  QUEUE.realtimePublish,
  async (job) => {
    if (job.name === REALTIME_PUBLISH_SWEEPER_JOB_NAME) {
      const enqueued = await sweepStaleRealtimeEvents(db, {
        enqueue: async (eventId) => {
          await realtimePublishQueue.add(
            REALTIME_PUBLISH_JOB_NAME,
            { eventId },
            { jobId: `publish:${eventId}` },
          );
        },
      });
      if (enqueued > 0) {
        console.warn(`[worker:realtime-sweeper] re-enqueued ${enqueued} stale event(s)`);
      }
      return;
    }
    const data = job.data as RealtimePublishJobData;
    const outcome = await processRealtimePublishJob(db, realtimePublisher, data);
    if (outcome === 'missing') {
      console.warn(`[worker:realtime] job ${job.id} eventId=${data.eventId} — missing/duplicate`);
    }
  },
  { connection, concurrency: 10 },
);

const scheduledWorker = new Worker(
  QUEUE.scheduled,
  async (job) => {
    console.warn(`[worker:scheduled] (stub) job ${job.id} ${job.name}`);
  },
  { connection, concurrency: 2 },
);

const compactionWorker = new Worker(
  QUEUE.compaction,
  async (job) => {
    const result = await processCompactionJob(db, job.data as CompactionJobData);
    console.warn(`[worker:compaction] job ${job.id} ${job.name} — rebalanced ${result.rebalanced}`);
  },
  // Concurrency 1: compaction runs are cheap but write-heavy; processing them
  // one at a time keeps the worker simple. The per-scope advisory lock is the
  // real correctness guard against concurrent moves.
  { connection, concurrency: 1 },
);

const workers = [notificationsWorker, realtimeWorker, scheduledWorker, compactionWorker];

for (const w of workers) {
  w.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });
}

// Faz 5B (DEM-84) — register the repeatable sweeper job. `jobId` keeps a single
// scheduler entry across restarts; the worker above filters by `job.name`.
void realtimePublishQueue
  .add(
    REALTIME_PUBLISH_SWEEPER_JOB_NAME,
    {},
    {
      jobId: 'realtime-publish-sweeper',
      repeat: { every: REALTIME_PUBLISH_SWEEPER_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: { age: 60 * 60 * 24 },
    },
  )
  .catch((err) => {
    console.error('[worker:realtime-sweeper] failed to register repeatable job:', err.message);
  });

console.warn(
  `[worker] started — queues: ${allQueues.map((q) => q.name).join(', ')} (NODE_ENV=${env.NODE_ENV})`,
);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[worker] ${signal} received — closing workers`);
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled(allQueues.map((q) => q.close()));
  await realtimePublisher.quit().catch(() => 'OK' as const);
  await connection.quit();
  await pool.end();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
