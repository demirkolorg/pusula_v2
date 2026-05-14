import { Worker } from 'bullmq';
import {
  QUEUE,
  allQueues,
  notificationsEmailQueue,
  notificationsPushQueue,
  notificationsQueue,
  realtimePublishQueue,
  scheduledQueue,
} from './queues';
import { connection } from './redis';
import { db, pool } from './db';
import { env } from './env';
import { processCompactionJob, type CompactionJobData } from './jobs/compaction';
import {
  createDefaultNotificationPublisher,
  NOTIFICATION_PUBLISH_JOB_NAME,
  processNotificationPublishJob,
  type NotificationPublishJobData,
} from './jobs/notification-publish';
import {
  createResendMailer,
  NOTIFICATION_EMAIL_JOB_NAME,
  processNotificationEmailJob,
  type NotificationEmailJobData,
} from './jobs/notification-email';
import {
  createExpoClient,
  NOTIFICATION_PUSH_JOB_NAME,
  processNotificationPushJob,
  type NotificationPushJobData,
} from './jobs/notification-push';
import {
  NOTIFICATION_PUBLISH_SWEEPER_INTERVAL_MS,
  NOTIFICATION_PUBLISH_SWEEPER_JOB_NAME,
  sweepStaleNotificationEvents,
} from './jobs/notification-publish-sweeper';
import {
  DUE_DATE_SCHEDULER_INTERVAL_MS,
  DUE_DATE_SCHEDULER_JOB_NAME,
  runDueDateScheduler,
} from './jobs/due-date-scheduler';
import {
  createDefaultPublisher,
  processRealtimePublishJob,
  REALTIME_PUBLISH_JOB_NAME,
  type RealtimePublishJobData,
} from './jobs/realtime-publish';
import {
  notificationEmailJobId,
  notificationPublishJobId,
  notificationPushJobId,
  realtimePublishJobId,
} from './jobs/bullmq-job-ids';
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

// Faz 6A (DEM-90) — separate Redis client for the notification user-room
// publish channel. Same reason as the realtime publisher: BullMQ's connection
// has `maxRetriesPerRequest: null`, pub/sub wants standard retry.
const notificationPublisher = createDefaultNotificationPublisher(env.REDIS_URL);

const notificationsWorker = new Worker(
  QUEUE.notifications,
  async (job) => {
    if (job.name === NOTIFICATION_PUBLISH_SWEEPER_JOB_NAME) {
      const enqueued = await sweepStaleNotificationEvents(db, {
        enqueue: async (eventId) => {
          await notificationsQueue.add(
            NOTIFICATION_PUBLISH_JOB_NAME,
            { eventId },
            { jobId: notificationPublishJobId(eventId) },
          );
        },
      });
      if (enqueued > 0) {
        console.warn(`[worker:notifications-sweeper] re-enqueued ${enqueued} stale event(s)`);
      }
      return;
    }
    const data = job.data as NotificationPublishJobData;
    const outcome = await processNotificationPublishJob(
      db,
      notificationPublisher,
      // Faz 6B (DEM-91) — wire the channel queues. Each enqueue is
      // best-effort; a BullMQ error logs + the publish processor returns
      // `'skipped'`, the 60 s sweeper re-picks the row later.
      {
        enqueueEmail: async (outboxId) => {
          await notificationsEmailQueue.add(
            NOTIFICATION_EMAIL_JOB_NAME,
            { outboxId } satisfies NotificationEmailJobData,
            { jobId: notificationEmailJobId(outboxId) },
          );
        },
        enqueuePush: async (outboxId) => {
          await notificationsPushQueue.add(
            NOTIFICATION_PUSH_JOB_NAME,
            { outboxId } satisfies NotificationPushJobData,
            { jobId: notificationPushJobId(outboxId) },
          );
        },
      },
      data,
    );
    if (outcome.processed === 0 && outcome.skipped === 0) {
      console.warn(
        `[worker:notifications] job ${job.id} eventId=${data.eventId} — no pending rows (idempotent re-run)`,
      );
    }
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
            { jobId: realtimePublishJobId(eventId) },
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
    if (job.name === DUE_DATE_SCHEDULER_JOB_NAME) {
      const result = await runDueDateScheduler(db, async (eventId) => {
        await notificationsQueue.add(
          NOTIFICATION_PUBLISH_JOB_NAME,
          { eventId },
          { jobId: notificationPublishJobId(eventId) },
        );
      });
      if (result.written > 0) {
        console.warn(
          `[worker:due-scheduler] tick — scanned=${result.scanned} wrote=${result.written}`,
        );
      }
      return;
    }
    console.warn(`[worker:scheduled] (stub) job ${job.id} ${job.name}`);
  },
  { connection, concurrency: 2 },
);

// Faz 6B (DEM-91) — email channel. Lazy Resend client: with no key it's a
// log-only stub (dev/CI ergonomics; production must set RESEND_API_KEY).
const emailMailer = createResendMailer({
  apiKey: env.RESEND_API_KEY,
  from: env.EMAIL_FROM,
  nodeEnv: env.NODE_ENV,
});

const notificationEmailWorker = new Worker(
  QUEUE.notificationsEmail,
  async (job) => {
    const data = job.data as NotificationEmailJobData;
    const outcome = await processNotificationEmailJob(
      db,
      emailMailer,
      { from: env.EMAIL_FROM, appUrl: env.APP_URL },
      data,
    );
    if (outcome.kind === 'skipped') {
      console.warn(
        `[worker:notification-email] job ${job.id} outbox=${data.outboxId} — skipped (${outcome.reason})`,
      );
    }
  },
  // Concurrency 5: matches the 6A notifications consumer. Resend SDK is HTTP
  // I/O bound; we won't saturate it from a single worker process.
  { connection, concurrency: 5 },
);

// Faz 6B (DEM-91) — push channel. Lazy Expo client. The SDK only loads when
// `expo-server-sdk` is installed; without it (CI runs that skip optional
// deps), the Worker still boots but every job throws on `createExpoClient` —
// fine, because in that environment no token-bearing user exists to enqueue
// for in the first place.
let expoClient: ReturnType<typeof createExpoClient> | null = null;
function getExpoClient() {
  if (expoClient) return expoClient;
  try {
    expoClient = createExpoClient({ accessToken: env.EXPO_PUSH_ACCESS_TOKEN });
    return expoClient;
  } catch (err) {
    console.error(
      '[worker:notification-push] failed to load expo-server-sdk:',
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}

const notificationPushWorker = new Worker(
  QUEUE.notificationsPush,
  async (job) => {
    const data = job.data as NotificationPushJobData;
    const outcome = await processNotificationPushJob(
      db,
      getExpoClient(),
      { appUrl: env.APP_URL },
      data,
    );
    if (outcome.kind === 'skipped') {
      console.warn(
        `[worker:notification-push] job ${job.id} outbox=${data.outboxId} — skipped (${outcome.reason})`,
      );
    }
  },
  { connection, concurrency: 5 },
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

const workers = [
  notificationsWorker,
  notificationEmailWorker,
  notificationPushWorker,
  realtimeWorker,
  scheduledWorker,
  compactionWorker,
];

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

// Faz 6A (DEM-90) — same pattern for the notification outbox sweeper. 60 s
// cadence with a 30 s grace window means no row sits unprocessed for more
// than ~90 s.
void notificationsQueue
  .add(
    NOTIFICATION_PUBLISH_SWEEPER_JOB_NAME,
    {},
    {
      jobId: 'notification-publish-sweeper',
      repeat: { every: NOTIFICATION_PUBLISH_SWEEPER_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: { age: 60 * 60 * 24 },
    },
  )
  .catch((err) => {
    console.error(
      '[worker:notifications-sweeper] failed to register repeatable job:',
      err.message,
    );
  });

// Faz 6A (DEM-90) — register the 5-minute due-date scheduler. Lives on
// `pusula-scheduled` so it doesn't compete with the publish workers.
void scheduledQueue
  .add(
    DUE_DATE_SCHEDULER_JOB_NAME,
    {},
    {
      jobId: 'due-date-scheduler',
      repeat: { every: DUE_DATE_SCHEDULER_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: { age: 60 * 60 * 24 },
    },
  )
  .catch((err) => {
    console.error('[worker:due-scheduler] failed to register repeatable job:', err.message);
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
  await notificationPublisher.quit().catch(() => 'OK' as const);
  await connection.quit();
  await pool.end();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
