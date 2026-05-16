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
// Faz 11C (DEM-149) — 3 retry + exponential backoff matches DEM-149 spec
// (delete trigger). The sweeper job rides on the same queue and inherits
// these defaults; sweeper failures are recovered by the next 60 min tick.
// Policy lives in `jobs/attachment-cleanup.ts` (single source of truth, unit
// tested there — see `ATTACHMENT_CLEANUP_RETRY_POLICY`).
export const attachmentCleanupQueue = new Queue(QUEUE.attachmentCleanup, {
  connection,
  defaultJobOptions: ATTACHMENT_CLEANUP_RETRY_POLICY,
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
];
