// Sentry init diğer tüm modüllerden önce çalışmalı — bu import ilk sırada kalmalı.
import './instrument';
import { Worker } from 'bullmq';
import * as Sentry from '@sentry/node';
import {
  QUEUE,
  allQueues,
  attachmentCleanupQueue,
  notificationsEmailDigestQueue,
  notificationsEmailQueue,
  notificationsPushQueue,
  notificationsQueue,
  realtimePublishQueue,
  reportCacheInvalidatorQueue,
  scheduledQueue,
} from './queues';
import { connection } from './redis';
import { db, pool } from './db';
import { env } from './env';
import {
  createAttachmentS3Client,
  processAttachmentCleanupJob,
  s3DeleteObjectAdapter,
  type AttachmentCleanupJobData,
} from './jobs/attachment-cleanup';
import {
  ATTACHMENT_CLEANUP_SWEEPER_INTERVAL_MS,
  ATTACHMENT_CLEANUP_SWEEPER_JOB_NAME,
  sweepOrphanAttachments,
} from './jobs/attachment-cleanup-sweeper';
import { processCompactionJob, type CompactionJobData } from './jobs/compaction';
import { processSearchReindexJob, type SearchReindexJobData } from './jobs/search-reindex';
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
  createDryRunExpoClient,
  createExpoClient,
  NOTIFICATION_PUSH_JOB_NAME,
  processNotificationPushJob,
  type NotificationPushJobData,
} from './jobs/notification-push';
import {
  NOTIFICATION_EMAIL_DIGEST_DAILY_CRON,
  NOTIFICATION_EMAIL_DIGEST_DAILY_JOB_NAME,
  NOTIFICATION_EMAIL_DIGEST_HOURLY_CRON,
  NOTIFICATION_EMAIL_DIGEST_HOURLY_JOB_NAME,
  processEmailDigestTick,
} from './jobs/notification-email-digest';
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
import {
  processReportCacheInvalidatorJob,
  type ReportCacheInvalidatorJobData,
} from './jobs/report-cache-invalidator';
import {
  closeBrowser as closeReportRenderBrowser,
  createReportS3Client,
  defaultPrintTokenResolver,
  defaultPuppeteerLauncher,
  processReportRenderJob,
  s3PutObjectAdapter,
  type ReportRenderJobData,
} from './jobs/report-render';

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
    // Faz 13E (DEM-261) — başarılı publish sonrası rapor cache invalidator
    // enqueue. Fire-and-forget; Redis blip publish'i etkilemez.
    const outcome = await processRealtimePublishJob(
      db,
      realtimePublisher,
      data,
      async (invalidatorData) => {
        await reportCacheInvalidatorQueue.add('invalidate', invalidatorData);
      },
    );
    if (outcome === 'missing') {
      console.warn(`[worker:realtime] job ${job.id} eventId=${data.eventId} — missing/duplicate`);
    }
  },
  { connection, concurrency: 10 },
);

// Faz 13E (DEM-261) — rapor cache invalidator. SCAN+DEL `connection`
// (BullMQ paylaşımı OK — non-blocking commands), pub/sub için ayrı
// `realtimePublisher` reuse (`pusula:report:invalidated` channel).
const reportCacheInvalidatorWorker = new Worker(
  QUEUE.reportCacheInvalidator,
  async (job) => {
    const data = job.data as ReportCacheInvalidatorJobData;
    const result = await processReportCacheInvalidatorJob(data, {
      redis: connection,
      publisher: realtimePublisher,
    });
    if (result.totalKeysDeleted > 0) {
      console.warn(
        `[worker:report-invalidator] eventType=${data.event.eventType} ` +
          `patterns=${result.patternsScanned} deleted=${result.totalKeysDeleted}`,
      );
    }
  },
  // Concurrency 10 — realtime publish (10) ile simetrik. Fan-out 1:1
  // (her publish 1 invalidator job) olduğu için düşük tutulursa kuyruk
  // birikir + stale rozeti gecikir (DEM-261 code-review S4).
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
  apiKey: env.NOTIFICATION_EXTERNAL_DRY_RUN ? undefined : env.RESEND_API_KEY,
  from: env.EMAIL_FROM,
  nodeEnv: env.NODE_ENV,
  dryRun: env.NOTIFICATION_EXTERNAL_DRY_RUN,
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
  if (env.NOTIFICATION_EXTERNAL_DRY_RUN) {
    expoClient = createDryRunExpoClient();
    return expoClient;
  }
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

// Faz 10G (DEM-141) — email digest cron. İki repeatable job adı (hourly +
// daily) aynı worker tarafından işlenir; job.name'e göre cadence türetilir.
// Concurrency 1: digest tick'leri seyrek (saatlik / günlük); paralel tick
// race yaratmaz ama bir tick uzarsa diğeri sırada bekler — `FOR UPDATE SKIP
// LOCKED` zaten cross-instance HA için yeterli güvence sağlıyor.
const notificationEmailDigestWorker = new Worker(
  QUEUE.notificationsEmailDigest,
  async (job) => {
    const cadence =
      job.name === NOTIFICATION_EMAIL_DIGEST_HOURLY_JOB_NAME ? 'hourly' : 'daily';
    const result = await processEmailDigestTick(
      db,
      emailMailer,
      { from: env.EMAIL_FROM, appUrl: env.APP_URL },
      cadence,
    );
    if (result.scanned > 0) {
      console.warn(
        `[worker:notification-email-digest] tick=${cadence} scanned=${result.scanned} ` +
          `sent=${result.emailsSent} skipped=${result.recipientsSkipped}`,
      );
    }
  },
  { connection, concurrency: 1 },
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

const searchReindexWorker = new Worker(
  QUEUE.searchReindex,
  async (job) => {
    const result = await processSearchReindexJob(db, job.data as SearchReindexJobData);
    console.warn(
      `[worker:search-reindex] job ${job.id} ${job.name} — scanned ${result.scanned}, upserted ${result.upserted}, deleted ${result.deleted}`,
    );
  },
  { connection, concurrency: 1 },
);

// Faz 11C (DEM-149) — attachment cleanup. Shared S3 client between the
// delete-trigger processor and the orphan sweeper; both go through the
// `s3DeleteObjectAdapter` so `NoSuchKey` is swallowed once.
const attachmentS3Client = createAttachmentS3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});
const attachmentStorage = s3DeleteObjectAdapter(attachmentS3Client);

// Faz 13I (DEM-265) — rapor PDF render worker. Puppeteer (system Chromium,
// Dockerfile'da `apk add chromium` + PUPPETEER_EXECUTABLE_PATH env) ile
// `/reports/print/[id]` route'unu yükler, page.pdf üretir, MinIO'ya yükler.
// S3 client AYNI account ama farklı bucket (`S3_REPORTS_BUCKET`); attachment
// pattern'iyle paralel.
const reportRenderS3Client = createReportS3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});
const reportRenderStorage = s3PutObjectAdapter(reportRenderS3Client);

const reportRenderWorker = new Worker(
  QUEUE.reportRender,
  async (job) => {
    const data = job.data as ReportRenderJobData;
    if (!env.WORKER_SHARED_SECRET) {
      // Print akışı kapalı (Faz 13D `print.requestToken` zaten UNAUTHORIZED
      // döner). Job'u retry'sız fail'le — config hatası, kullanıcı kuyruğu
      // sonsuza kadar kasmasın.
      throw new Error(
        'WORKER_SHARED_SECRET tanımlı değil — rapor render akışı kapalı (config hatası).',
      );
    }
    const result = await processReportRenderJob(data, {
      db,
      storage: reportRenderStorage,
      publisher: realtimePublisher,
      resolvePrintToken: defaultPrintTokenResolver,
      launcher: defaultPuppeteerLauncher,
      appUrl: env.APP_URL,
      internalApiUrl: env.INTERNAL_API_URL,
      workerSharedSecret: env.WORKER_SHARED_SECRET,
      bucket: env.S3_REPORTS_BUCKET,
      executablePath: env.PUPPETEER_EXECUTABLE_PATH,
      // Faz 13I code-review M1+M2: BullMQ retry koordinasyonu — yalnız
      // son denemede DB'yi 'failed' damgala. `attemptsMade` 0-indexed
      // (ilk attempt = 0, ikinci = 1, …); maxAttempts queue config'ten
      // (3, `queues.ts` reportRenderQueue defaultJobOptions).
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
    });
    if (result.outcome === 'completed') {
      console.warn(
        `[worker:report-render] job ${job.id} render=${data.renderId} → completed (${result.s3Key})`,
      );
    } else if (result.outcome === 'failed') {
      console.warn(
        `[worker:report-render] job ${job.id} render=${data.renderId} → failed (${result.errorCategory})`,
      );
    }
  },
  // Concurrency 2: Puppeteer page'leri pahalı (>200MB her biri); container
  // memory limit 1GB → max 3 page (spec §16.8). 2 worker concurrency + 1
  // page singleton browser = makul.
  { connection, concurrency: 2 },
);

const attachmentCleanupWorker = new Worker(
  QUEUE.attachmentCleanup,
  async (job) => {
    if (job.name === ATTACHMENT_CLEANUP_SWEEPER_JOB_NAME) {
      const result = await sweepOrphanAttachments(db, attachmentStorage, env.S3_BUCKET);
      if (result.scanned > 0) {
        console.warn(
          `[worker:attachment-cleanup-sweeper] tick — scanned=${result.scanned} ` +
            `storageDeleted=${result.storageDeleted} dbDeleted=${result.dbDeleted} ` +
            `storageFailed=${result.storageFailed}`,
        );
      }
      return;
    }
    const data = job.data as AttachmentCleanupJobData;
    await processAttachmentCleanupJob(attachmentStorage, env.S3_BUCKET, data);
  },
  // Concurrency 3: cleanup is HTTP-bound to MinIO; modest parallelism keeps
  // a backlog from snowballing without flooding the storage layer.
  { connection, concurrency: 3 },
);

const workers = [
  notificationsWorker,
  notificationEmailWorker,
  notificationPushWorker,
  notificationEmailDigestWorker,
  realtimeWorker,
  reportCacheInvalidatorWorker,
  reportRenderWorker,
  scheduledWorker,
  compactionWorker,
  searchReindexWorker,
  attachmentCleanupWorker,
];

for (const w of workers) {
  // §10.5.1 — job kalıcı olarak başarısız olduğunda (tüm retry'lar tükendi)
  // hatayı Sentry'ye ilet; queue/job adı tag olarak eklenir.
  w.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
    Sentry.captureException(err, {
      tags: { queue: w.name, jobName: job?.name ?? '<unknown>' },
      extra: { jobId: job?.id, attemptsMade: job?.attemptsMade },
    });
  });
  // Worker'ın kendi hatası (Redis bağlantısı vb. — job'a bağlı değil).
  w.on('error', (err) => {
    console.error(`[worker] ${w.name} worker error:`, err.message);
    Sentry.captureException(err, { tags: { queue: w.name } });
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
    console.error('[worker:notifications-sweeper] failed to register repeatable job:', err.message);
  });

// Faz 10G (DEM-141) — register the email digest cron jobs. Hourly + daily
// repeatable entries; their `jobId` keeps a single scheduler row per cadence
// across restarts (BullMQ debounces existing repeatable jobs on a re-add).
void notificationsEmailDigestQueue
  .add(
    NOTIFICATION_EMAIL_DIGEST_HOURLY_JOB_NAME,
    {},
    {
      jobId: 'notification-email-digest-hourly',
      repeat: { pattern: NOTIFICATION_EMAIL_DIGEST_HOURLY_CRON },
      removeOnComplete: true,
      removeOnFail: { age: 60 * 60 * 24 },
    },
  )
  .catch((err) => {
    console.error('[worker:notification-email-digest] hourly register failed:', err.message);
  });
void notificationsEmailDigestQueue
  .add(
    NOTIFICATION_EMAIL_DIGEST_DAILY_JOB_NAME,
    {},
    {
      jobId: 'notification-email-digest-daily',
      repeat: { pattern: NOTIFICATION_EMAIL_DIGEST_DAILY_CRON },
      removeOnComplete: true,
      removeOnFail: { age: 60 * 60 * 24 },
    },
  )
  .catch((err) => {
    console.error('[worker:notification-email-digest] daily register failed:', err.message);
  });

// Faz 11C (DEM-149) — register the hourly attachment-cleanup sweeper. Same
// shape as the 60 s realtime/notification sweepers, just on a 1-hour cadence
// (drafts get a 1 h grace window before sweep — see DEM-149).
void attachmentCleanupQueue
  .add(
    ATTACHMENT_CLEANUP_SWEEPER_JOB_NAME,
    {},
    {
      jobId: 'attachment-cleanup-sweeper',
      repeat: { every: ATTACHMENT_CLEANUP_SWEEPER_INTERVAL_MS },
      removeOnComplete: true,
      removeOnFail: { age: 60 * 60 * 24 },
    },
  )
  .catch((err) => {
    console.error('[worker:attachment-cleanup-sweeper] failed to register repeatable job:', err.message);
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
  // Faz 13I (DEM-265) — Puppeteer browser singleton'ı graceful kapa
  // (Chromium child process aksi halde zombie kalır + container shutdown
  // SIGKILL bekler).
  await closeReportRenderBrowser();
  await realtimePublisher.quit().catch(() => 'OK' as const);
  await notificationPublisher.quit().catch(() => 'OK' as const);
  await connection.quit();
  await pool.end();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
