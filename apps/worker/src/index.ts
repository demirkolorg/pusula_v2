import { Worker } from 'bullmq';
import { QUEUE, allQueues } from './queues';
import { connection } from './redis';
import { db, pool } from './db';
import { env } from './env';
import { processCompactionJob, type CompactionJobData } from './jobs/compaction';

/**
 * Worker process skeleton. The notification / realtime / scheduled processors
 * below are still placeholders — the real outbox logic lands in later phases
 * (architecture doc §9, §13). The position-compaction processor (Faz 3C —
 * DEM-44) is real: it re-balances a list's / board's fractional `position`
 * strings when they grow too long. See `jobs/compaction.ts`.
 */

const notificationsWorker = new Worker(
  QUEUE.notifications,
  async (job) => {
    console.warn(`[worker:notifications] (stub) job ${job.id} ${job.name}`);
  },
  { connection, concurrency: 5 },
);

const realtimeWorker = new Worker(
  QUEUE.realtimePublish,
  async (job) => {
    console.warn(`[worker:realtime] (stub) job ${job.id} ${job.name}`);
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
  await connection.quit();
  await pool.end();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
