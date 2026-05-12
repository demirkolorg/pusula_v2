import { Worker } from 'bullmq';
import { QUEUE, allQueues } from './queues';
import { connection } from './redis';
import { env } from './env';

/**
 * Worker process skeleton. The processors below are placeholders — the real
 * outbox/notification/realtime logic lands in later phases (architecture doc
 * §9, §13). For now they just log so the deployment topology is in place.
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

const workers = [notificationsWorker, realtimeWorker, scheduledWorker];

for (const w of workers) {
  w.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });
}

console.warn(`[worker] started — queues: ${allQueues.map((q) => q.name).join(', ')} (NODE_ENV=${env.NODE_ENV})`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[worker] ${signal} received — closing workers`);
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled(allQueues.map((q) => q.close()));
  await connection.quit();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
