import { Queue } from 'bullmq';
import { connection } from './redis';
import { ATTACHMENT_CLEANUP_RETRY_POLICY } from './jobs/attachment-cleanup';

/**
 * Background queue names. Each maps to a BullMQ queue consumed by a Worker in
 * `index.ts`. See architecture doc §13 for the planned job set.
 */
// BullMQ forbids `:` in queue names and custom job ids (Redis key separator), so
// both queue names and job id prefixes use `-`.
export const QUEUE = {
  /**
   * Faz 6A (DEM-90) — drains `notification_outbox` rows (channel='in_app').
   * The 6A `notification-publish` processor fans out each outbox row by
   * channel: in-app `notifications` insert + `emitToUser`, email → push
   * `notificationsEmail` queue below, push → `notificationsPush` queue
   * below. Queue name duplicated in `apps/api/src/notification-queue.ts`
   * (producer side) — must stay in sync.
   */
  notifications: 'pusula-notifications',
  /**
   * Faz 6B (DEM-91) — Resend transactional email channel. Producer: the
   * 6A `notification-publish` processor when it sees a row with
   * `channel='email'`. Consumer: `jobs/notification-email.ts`.
   */
  notificationsEmail: 'pusula-notifications-email',
  /**
   * Faz 6B (DEM-91) — Expo Push API channel. Producer: the 6A
   * `notification-publish` processor when it sees a row with
   * `channel='push'`. Consumer: `jobs/notification-push.ts`. Mobile
   * client (Faz 7 — DEM-30) wires the actual token registration; until
   * then every user has zero active tokens → no-op + warn log.
   */
  notificationsPush: 'pusula-notifications-push',
  /**
   * Faz 10G (DEM-141) — hourly/daily email digest cron.
   * Producer: BullMQ repeatable scheduler entries in `index.ts`
   * (`notification-email-digest-hourly` + `-daily`).
   * Consumer: `jobs/notification-email-digest.ts`.
   *
   * Independent from `notificationsEmail` (transactional) queue: digest
   * cron'u trafiği farklı (her recipient için tek mail), retry/backoff
   * semantiği farklı (gecikme tolere edilir), workload izole tutulur.
   */
  notificationsEmailDigest: 'pusula-notifications-email-digest',
  /** Publishes pending `realtime_events` rows to Socket.IO rooms. */
  realtimePublish: 'pusula-realtime-publish',
  /** Due-date reminders, digest emails, cleanup. */
  scheduled: 'pusula-scheduled',
  /**
   * Re-balances fractional `position` strings for a list (its cards) or a board
   * (its lists) when they grow too long. Producer: `apps/api` (`list.move` /
   * `card.move`, via the tRPC context). Job `jobId = compaction-{list|board}-{id}`
   * debounces per scope (only one pending job per scope). See `jobs/compaction.ts`
   * and `docs/architecture/06-bildirim-altyapisi.md` "Position compaction".
   *
   * Queue name duplicated in `apps/api/src/compaction-queue.ts` (producer side)
   * — must stay in sync: `'pusula-compaction'`.
   */
  compaction: 'pusula-compaction',
  /**
   * Faz 6.5B (DEM-105) — rebuilds the denormalized PostgreSQL FTS read model
   * (`search_documents`) for a board/workspace scope.
   */
  searchReindex: 'pusula-search-reindex',
  /**
   * Faz 13E ([DEM-261](https://linear.app/demirkol/issue/DEM-261)) —
   * rapor cache invalidator. Producer: `apps/worker` realtime-publish job
   * (her başarılı publish sonrası fire-and-forget). Consumer:
   * `jobs/report-cache-invalidator.ts` — Redis SCAN+DEL ile etkilenen
   * scope ailelerinin cache key'lerini siler + `report.invalidated`
   * socket event'i `workspace:{id}` room'una basar (Redis pub/sub
   * üzerinden socket bridge dinler — `apps/api/src/socket/`).
   *
   * Queue name `apps/worker` içinde tek yerde — producer da consumer da
   * worker tarafında (Faz 5B realtime-publish ile farklı: orada producer
   * apps/api, burada producer apps/worker). 13G/H veya apps/api'den
   * doğrudan enqueue yapılacaksa o zaman duplicated.
   */
  reportCacheInvalidator: 'pusula-report-cache-invalidator',
  /**
   * Faz 13I ([DEM-265](https://linear.app/demirkol/issue/DEM-265)) — rapor
   * PDF/Excel render queue. Producer: `apps/api` `report.export` mutation
   * (Faz 13D — DEM-260 — DB row insert sonrası best-effort enqueue).
   * Consumer: `jobs/report-render.ts` — Puppeteer ile `/reports/print/[id]`
   * route'unu yükler, `page.pdf()` ile A4 PDF üretir, MinIO'ya
   * `S3_REPORTS_BUCKET` bucket'ına yükler, `report_render_assets` insert
   * eder ve `report_renders.status='completed'` stamp eder. Hata → status
   * 'failed' + errorMessage.
   *
   * Queue name duplicated in `apps/api/src/report-render-queue.ts`
   * (producer side) — must stay in sync: `'pusula-report-render'`.
   */
  reportRender: 'pusula-report-render',
  /**
   * Faz 13J ([DEM-266](https://linear.app/demirkol/issue/DEM-266)) — schedule
   * cron tick queue. Repeatable job `every minute` BullMQ scheduler kayıt
   * eder; worker tick'i `due schedule → report_renders insert + report-
   * render queue enqueue` akışını koşar. `notification-email-digest` cron
   * pattern'i (Faz 10G) ile simetrik.
   */
  reportSchedule: 'pusula-report-schedule',
  /**
   * Faz 13P ([DEM-272](https://linear.app/demirkol/issue/DEM-272)) — rapor
   * render retention queue. Repeatable cron tick (daily 03:00 UTC) eski
   * (`> 90g`) saved-attached render'ları (son 5 sürüm hariç) ve ad-hoc
   * render'ları MinIO + DB'den siler. Dry-run modu (`REPORT_RETENTION_DRY
   * _RUN=true`) ilk haftada aktif kalır. Pattern: `notification-email-
   * digest` (Faz 10G) cron + `attachment-cleanup-sweeper` (Faz 11C) storage-
   * first disiplin.
   */
  reportRetention: 'pusula-report-retention',
  /**
   * Faz 11C (DEM-149) — attachment cleanup queue. Two responsibilities,
   * dispatched by `job.name`:
   *  1. Delete trigger (`attachment-cleanup`): fired by `attachment.delete`
   *     (DEM-148) tx COMMIT — payload `{ attachmentId, storageKey }`. Worker
   *     calls MinIO `DeleteObjectCommand`. Idempotent (`NoSuchKey` swallowed).
   *  2. Orphan sweep (`attachment-cleanup-sweeper`): repeatable 60 min cron
   *     (Faz 5B/6A sweeper pattern simetri — daha seyrek, 1 saatlik draft
   *     window). Drops `committed_at IS NULL AND created_at < NOW() - 1h`
   *     drafts: storage first, then DB row.
   *
   * Queue name duplicated in `apps/api/src/attachment-cleanup-queue.ts`
   * (producer side) — must stay in sync: `'pusula-attachment-cleanup'`.
   */
  attachmentCleanup: 'pusula-attachment-cleanup',
  /**
   * Faz 8F (DEM-283) — davet expiry sweeper. Tek repeatable cron tick
   * (`0 3 * * *` UTC) workspace + board davet'lerinde `status='pending' AND
   * expires_at < NOW()` satırlarını `status='expired'` damgalar. Pattern:
   * `reportRetention` daily cron + `attachment-cleanup-sweeper` tick.
   * Sadece worker tarafında — producer yok.
   */
  invitationExpirySweeper: 'pusula-invitation-expiry-sweeper',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 1_000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1_000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

export const notificationsQueue = new Queue(QUEUE.notifications, { connection, defaultJobOptions });
export const notificationsEmailQueue = new Queue(QUEUE.notificationsEmail, {
  connection,
  defaultJobOptions,
});
export const notificationsPushQueue = new Queue(QUEUE.notificationsPush, {
  connection,
  defaultJobOptions,
});
export const notificationsEmailDigestQueue = new Queue(QUEUE.notificationsEmailDigest, {
  connection,
  // Digest cron'unda 5 attempt + exponential backoff fazla; Resend transient
  // hatalarında 2 deneme + 30 sn aralık yeterli (bir sonraki cron tick
  // zaten 1 saat sonra). Yine de defaultJobOptions ile uyum için aynı
  // shape — sweeper özelliği yok, BullMQ retry'a güveniyoruz.
  defaultJobOptions,
});
export const realtimePublishQueue = new Queue(QUEUE.realtimePublish, {
  connection,
  defaultJobOptions,
});
export const scheduledQueue = new Queue(QUEUE.scheduled, { connection, defaultJobOptions });
export const compactionQueue = new Queue(QUEUE.compaction, { connection, defaultJobOptions });
export const searchReindexQueue = new Queue(QUEUE.searchReindex, { connection, defaultJobOptions });
// Faz 13E (DEM-261) — rapor cache invalidator. Fire-and-forget; başarısız
// olsa bile TTL eninde sonunda key'leri düşürür (60-300s) → defaultJobOptions
// `attempts=5` fazla; 2 attempt + short backoff. Stale rozeti gecikmeli
// gelirse UI fonksiyonel kalır (TTL).
export const reportCacheInvalidatorQueue = new Queue(QUEUE.reportCacheInvalidator, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 500 },
    removeOnComplete: { age: 60 * 60, count: 500 },
    removeOnFail: { age: 60 * 60 * 24 },
  },
});
// Faz 11C (DEM-149) — 3 retry + exponential backoff matches DEM-149 spec
// (delete trigger). The sweeper job rides on the same queue and inherits
// these defaults; sweeper failures are recovered by the next 60 min tick.
// Policy lives in `jobs/attachment-cleanup.ts` (single source of truth, unit
// tested there — see `ATTACHMENT_CLEANUP_RETRY_POLICY`).
export const attachmentCleanupQueue = new Queue(QUEUE.attachmentCleanup, {
  connection,
  defaultJobOptions: ATTACHMENT_CLEANUP_RETRY_POLICY,
});
// Faz 13I (DEM-265) — render queue retry profili: PDF üretmek pahalı
// (Puppeteer launch + chart render + S3 upload). Transient hata (MinIO
// 5xx, Puppeteer timeout) için 3 attempt yeterli; 4+ retry hem
// container memory'sini tüketir hem de kullanıcıyı bekletir. Backoff
// 5s exp — sonraki tick'de I/O kurtulabilir.
export const reportRenderQueue = new Queue(QUEUE.reportRender, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5_000 },
    removeOnComplete: { age: 60 * 60 * 24, count: 500 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});
// Faz 13J (DEM-266) — schedule tick queue. Repeatable job tek (every-minute);
// processor tarama + DB transaction'lar pahalı değil. notification-email-
// digest pattern'i (Faz 10G) ile simetrik retry profili (2 attempt + 30s).
export const reportScheduleQueue = new Queue(QUEUE.reportSchedule, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 30_000 },
    removeOnComplete: { age: 60 * 60, count: 100 },
    removeOnFail: { age: 60 * 60 * 24 },
  },
});
// Faz 13P (DEM-272) — retention tick queue. Daily cron (03:00 UTC). Tick
// idempotent (DB durumuna göre çalışır); 2 attempt + 5dk backoff yeterli.
// Bir sonraki gün tick zaten 24 saat sonra (kaçırılan iş düşük öncelik).
export const reportRetentionQueue = new Queue(QUEUE.reportRetention, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 5 * 60_000 },
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 30 },
    removeOnFail: { age: 60 * 60 * 24 * 30 },
  },
});
// Faz 8F (DEM-283) — invitation expiry sweeper. Daily 03:00 UTC tick;
// retry profili `reportRetention` ile aynı (2 attempt + 5dk backoff). Kaçırılan
// tick zaten 24 saat sonra rekapture eder (`expires_at` geriye gitmez).
export const invitationExpirySweeperQueue = new Queue(QUEUE.invitationExpirySweeper, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 5 * 60_000 },
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 30 },
    removeOnFail: { age: 60 * 60 * 24 * 30 },
  },
});

export const allQueues = [
  notificationsQueue,
  notificationsEmailQueue,
  notificationsPushQueue,
  notificationsEmailDigestQueue,
  realtimePublishQueue,
  scheduledQueue,
  compactionQueue,
  searchReindexQueue,
  attachmentCleanupQueue,
  reportCacheInvalidatorQueue,
  reportRenderQueue,
  reportScheduleQueue,
  reportRetentionQueue,
  invitationExpirySweeperQueue,
];
