/**
 * Notification publish job — Faz 6A (DEM-90).
 *
 * Consumer side of the `pusula-notifications` queue. Job payload carries only
 * `{ eventId }` (= `activity_events.id`); we read every pending
 * `notification_outbox` row tied to it and fan out per channel:
 *   - `in_app`  → insert into `notifications` + Socket.IO `emitToUser` so the
 *                 recipient's badge counter (Faz 5A `user:{userId}` room)
 *                 updates immediately.
 *   - `email`   → re-enqueue onto `pusula-notifications-email` (Faz 6B).
 *   - `push`    → re-enqueue onto `pusula-notifications-push`  (Faz 6B).
 *
 * Idempotent. Rows are locked with `FOR UPDATE SKIP LOCKED` and a row that's
 * already `processed_at IS NOT NULL` is skipped. A crash between the publish
 * and the `processed_at = NOW()` is safe — the partial pending index
 * (`notification_outbox_pending_idx`, migration 0009) lets the sweeper find it
 * again within 90 s.
 *
 * Mirrors the architectural pattern of Faz 5B `realtime-publish.ts`: the worker
 * never touches Socket.IO directly. The `apps/api` Socket.IO bridge handles
 * the user-room push by subscribing to a Redis channel
 * (`pusula:notifications:user`) and emitting `notification:created` to the
 * matching `user:{userId}` room — same idea as the realtime bridge, just a
 * different channel.
 *
 * For Faz 6A the 6B email/push channel queues are *not* yet consumed; the
 * outbox row is still stamped `delivered` (so the in-app side completes) and
 * the email/push enqueue is best-effort — if 6B isn't wired yet, the row sits
 * `pending`-but-untouched on the email/push queues until that lands.
 */
import { Redis } from 'ioredis';
import { and, asc, eq, isNull, notificationOutbox, notifications, sql } from '@pusula/db';
import type { Database } from '@pusula/db';

/** Redis pub/sub channel `apps/api` subscribes to for user-room badge updates. */
export const NOTIFICATION_USER_CHANNEL = 'pusula:notifications:user';

/** BullMQ job name (documentation; the worker matches by queue, not name). */
export const NOTIFICATION_PUBLISH_JOB_NAME = 'notification-publish';

export type NotificationPublishJobData = { eventId: string };

/**
 * Sentinel eventId — the due-date scheduler enqueues a job with this value
 * after writing scheduler-fired outbox rows (their `event_id` column is
 * NULL because there's no triggering `activity_events.id`). The processor
 * maps this back to `WHERE event_id IS NULL` so the in-app fan-out doesn't
 * have to wait for the 60 s sweeper.
 */
export const SCHEDULER_TICK_EVENT_ID = 'scheduler:tick';

/** Wire-format message pushed onto `NOTIFICATION_USER_CHANNEL`. */
export interface NotificationUserMessage {
  userId: string;
  /** The newly written `notifications.id` — the client can dedupe/scroll to it. */
  notificationId: string;
  notificationType: string;
  /** Mirrors `notifications.payload` so the badge can render a preview. */
  payload: unknown;
  createdAt: string;
}

/** Minimal publish surface — `Redis['publish']` shape; injectable for tests. */
export interface NotificationPublisher {
  publish: (channel: string, message: string) => Promise<number> | number;
}

/** What we pull from `notification_outbox` per job. */
type OutboxRow = {
  id: string;
  channel: 'in_app' | 'email' | 'push';
  recipientId: string | null;
  type: string;
  payload: unknown;
  processedAt: Date | null;
  createdAt: Date;
};

/** Best-effort hand-off to the Faz 6B channel queues. Wired by `index.ts`. */
export interface ChannelEnqueuers {
  enqueueEmail?: (outboxId: string) => Promise<void> | void;
  enqueuePush?: (outboxId: string) => Promise<void> | void;
}

/**
 * Process one publish job: read pending outbox rows for the event, fan out per
 * channel, stamp `processed_at`. Returns `{ processed, skipped }` for logs.
 */
export async function processNotificationPublishJob(
  db: Database,
  publisher: NotificationPublisher,
  enqueuers: ChannelEnqueuers,
  data: NotificationPublishJobData,
): Promise<{ processed: number; skipped: number }> {
  // Best-effort Redis publish messages are buffered inside the transaction
  // and flushed *after* the commit — that way a publish failure can't roll
  // back the `notifications` insert (which would double-deliver on the
  // sweeper's retry).
  const pendingMessages: Array<{ outboxId: string; recipientId: string; message: string }> = [];
  const result = await db.transaction(async (tx) => {
    // Lock + read pending rows for this event. SKIP LOCKED so a parallel
    // worker doesn't double-process the same row. `processed_at IS NULL`
    // filter is the idempotency anchor. The `SCHEDULER_TICK_EVENT_ID`
    // sentinel batches every pending `event_id IS NULL` row (scheduler-fired
    // reminders have no activity_events row).
    const eventFilter =
      data.eventId === SCHEDULER_TICK_EVENT_ID
        ? isNull(notificationOutbox.eventId)
        : eq(notificationOutbox.eventId, data.eventId);
    const rows = (await tx
      .select({
        id: notificationOutbox.id,
        channel: notificationOutbox.channel,
        recipientId: notificationOutbox.recipientId,
        type: notificationOutbox.type,
        payload: notificationOutbox.payload,
        processedAt: notificationOutbox.processedAt,
        createdAt: notificationOutbox.createdAt,
      })
      .from(notificationOutbox)
      .where(and(eventFilter, isNull(notificationOutbox.processedAt)))
      .orderBy(asc(notificationOutbox.createdAt))
      .for('update', { skipLocked: true })) as OutboxRow[];
    if (rows.length === 0) return { processed: 0, skipped: 0 };

    let processed = 0;
    let skipped = 0;

    for (const row of rows) {
      const outcome = await dispatchOutboxRow(tx, enqueuers, pendingMessages, row);
      // `'enqueued'` is success for the 6A processor: the row has been
      // handed off to the Faz 6B channel queue — the 6B processor stamps
      // `processed_at` itself once the email/push actually sends.
      if (outcome === 'delivered' || outcome === 'enqueued') processed++;
      else skipped++;
    }

    return { processed, skipped };
  });

  // Tx committed — now publish the badge messages we buffered. A failed
  // publish doesn't roll back the `notifications` row (which would
  // double-deliver on a sweeper retry); the recipient sees the new row on
  // next list/badge query regardless. Errors are logged and swallowed.
  for (const { outboxId, recipientId, message } of pendingMessages) {
    try {
      await publisher.publish(NOTIFICATION_USER_CHANNEL, message);
    } catch (err) {
      console.warn(
        `[worker:notifications] publish failed (outbox=${outboxId}, user=${recipientId}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return result;
}

type DispatchOutcome = 'delivered' | 'enqueued' | 'skipped';

async function dispatchOutboxRow(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  enqueuers: ChannelEnqueuers,
  pendingMessages: Array<{ outboxId: string; recipientId: string; message: string }>,
  row: OutboxRow,
): Promise<DispatchOutcome> {
  if (row.channel === 'in_app') {
    if (!row.recipientId) {
      // Anonymous in-app rows are nonsensical (no recipient → no badge). Mark
      // them dead-letter so the sweeper doesn't re-pick them.
      await tx
        .update(notificationOutbox)
        .set({ processedAt: new Date(), status: 'dead', lastError: 'in_app row missing recipient_id' })
        .where(eq(notificationOutbox.id, row.id));
      return 'skipped';
    }
    // 1. Write to `notifications` (the persistent record the badge counts +
    //    the centre lists). The Drizzle insert path picks up the schema's
    //    `$defaultFn(() => nanoid())` id default — a raw SQL INSERT skips
    //    that and the NOT NULL on `id` rejects the row.
    const [insertedRow] = await tx
      .insert(notifications)
      .values({
        recipientId: row.recipientId,
        type: row.type as typeof notifications.$inferInsert.type,
        payload: (row.payload ?? {}) as Record<string, unknown>,
      })
      .returning({ id: notifications.id, createdAt: notifications.createdAt });
    const notificationId = insertedRow?.id;
    const notificationCreatedAt = insertedRow?.createdAt;
    // 2. Buffer the badge-push payload — the caller flushes it to Redis
    //    *after* the tx commits so a publish failure can't roll back the
    //    `notifications` insert (which would double-deliver on a sweeper
    //    retry).
    if (notificationId) {
      const message: NotificationUserMessage = {
        userId: row.recipientId,
        notificationId,
        notificationType: row.type,
        payload: row.payload ?? {},
        createdAt:
          notificationCreatedAt instanceof Date
            ? notificationCreatedAt.toISOString()
            : typeof notificationCreatedAt === 'string'
              ? notificationCreatedAt
              : new Date().toISOString(),
      };
      pendingMessages.push({
        outboxId: row.id,
        recipientId: row.recipientId,
        message: JSON.stringify(message),
      });
    }
  } else if (row.channel === 'email') {
    if (enqueuers.enqueueEmail) {
      try {
        await enqueuers.enqueueEmail(row.id);
        // The Faz 6B email processor (`notification-email.ts`) stamps
        // `processed_at` after sending — we must not stamp here, otherwise
        // its `processed_at IS NULL` filter would make the row look
        // already-handled and the email would never go out.
        return 'enqueued';
      } catch (err) {
        console.warn(
          `[worker:notifications] email enqueue failed (outbox=${row.id}):`,
          err instanceof Error ? err.message : String(err),
        );
        return 'skipped';
      }
    }
    // Faz 6B not yet wired (dev box / migration window). Fall through to the
    // stamp below so the sweeper doesn't keep re-picking the row; the email
    // is lost, but only on a host that never had a 6B consumer running.
  } else if (row.channel === 'push') {
    if (enqueuers.enqueuePush) {
      try {
        await enqueuers.enqueuePush(row.id);
        // Same hand-off discipline as the email branch — the 6B push
        // processor stamps the row.
        return 'enqueued';
      } catch (err) {
        console.warn(
          `[worker:notifications] push enqueue failed (outbox=${row.id}):`,
          err instanceof Error ? err.message : String(err),
        );
        return 'skipped';
      }
    }
    // 6B not wired — fall through like the email branch.
  }

  // Stamp `processed_at` on success (one-shot — idempotent re-runs see this
  // and skip via the `IS NULL` filter above). Only reached when:
  //   - row.channel === 'in_app' (the `in_app` block above falls through), or
  //   - row.channel === 'email' / 'push' but the matching enqueuer is unwired
  //     (Faz 6B not yet deployed on this host).
  await tx
    .update(notificationOutbox)
    .set({
      processedAt: new Date(),
      status: 'sent',
      attempts: sql`${notificationOutbox.attempts} + 1`,
    })
    .where(eq(notificationOutbox.id, row.id));
  return 'delivered';
}

/** Default Redis publisher (production wiring). */
export function createDefaultNotificationPublisher(
  redisUrl: string,
): NotificationPublisher & { quit: () => Promise<'OK'> } {
  const redis = new Redis(redisUrl);
  redis.on('error', (err) => {
    console.error('[worker:notifications] redis publisher error:', err.message);
  });
  return redis;
}
