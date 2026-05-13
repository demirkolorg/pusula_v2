import { Queue } from 'bullmq';
import { connection } from './redis';

/**
 * Background queue names. Each maps to a BullMQ queue consumed by a Worker in
 * `index.ts`. See architecture doc §13 for the planned job set.
 */
export const QUEUE = {
  /** Drains `notification_outbox` → notifications table, Expo push, email. */
  notifications: 'pusula:notifications',
  /** Publishes pending `realtime_events` rows to Socket.IO rooms. */
  realtimePublish: 'pusula:realtime-publish',
  /** Due-date reminders, digest emails, cleanup. */
  scheduled: 'pusula:scheduled',
  /**
   * Re-balances fractional `position` strings for a list (its cards) or a board
   * (its lists) when they grow too long. Producer: `apps/api` (`list.move` /
   * `card.move`, via the tRPC context). Job `jobId = compaction:{list|board}:{id}`
   * debounces per scope (only one pending job per scope). See `jobs/compaction.ts`
   * and `docs/architecture/06-bildirim-altyapisi.md` "Position compaction".
   *
   * Queue name duplicated in `apps/api/src/compaction-queue.ts` (producer side)
   * — must stay in sync: `'pusula:compaction'`.
   */
  compaction: 'pusula:compaction',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 1_000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1_000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

export const notificationsQueue = new Queue(QUEUE.notifications, { connection, defaultJobOptions });
export const realtimePublishQueue = new Queue(QUEUE.realtimePublish, {
  connection,
  defaultJobOptions,
});
export const scheduledQueue = new Queue(QUEUE.scheduled, { connection, defaultJobOptions });
export const compactionQueue = new Queue(QUEUE.compaction, { connection, defaultJobOptions });

export const allQueues = [
  notificationsQueue,
  realtimePublishQueue,
  scheduledQueue,
  compactionQueue,
];
