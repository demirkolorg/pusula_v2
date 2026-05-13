import { Queue } from 'bullmq';
import { connection } from './redis';

/**
 * Background queue names. Each maps to a BullMQ queue consumed by a Worker in
 * `index.ts`. See architecture doc §13 for the planned job set.
 */
// BullMQ forbids `:` in queue names (it's the Redis key separator), so the
// `pusula-*` segments use `-`. Job *ids* may still contain `:` (see below).
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
  /** Publishes pending `realtime_events` rows to Socket.IO rooms. */
  realtimePublish: 'pusula-realtime-publish',
  /** Due-date reminders, digest emails, cleanup. */
  scheduled: 'pusula-scheduled',
  /**
   * Re-balances fractional `position` strings for a list (its cards) or a board
   * (its lists) when they grow too long. Producer: `apps/api` (`list.move` /
   * `card.move`, via the tRPC context). Job `jobId = compaction:{list|board}:{id}`
   * debounces per scope (only one pending job per scope). See `jobs/compaction.ts`
   * and `docs/architecture/06-bildirim-altyapisi.md` "Position compaction".
   *
   * Queue name duplicated in `apps/api/src/compaction-queue.ts` (producer side)
   * — must stay in sync: `'pusula-compaction'`.
   */
  compaction: 'pusula-compaction',
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
export const realtimePublishQueue = new Queue(QUEUE.realtimePublish, {
  connection,
  defaultJobOptions,
});
export const scheduledQueue = new Queue(QUEUE.scheduled, { connection, defaultJobOptions });
export const compactionQueue = new Queue(QUEUE.compaction, { connection, defaultJobOptions });

export const allQueues = [
  notificationsQueue,
  notificationsEmailQueue,
  notificationsPushQueue,
  realtimePublishQueue,
  scheduledQueue,
  compactionQueue,
];
