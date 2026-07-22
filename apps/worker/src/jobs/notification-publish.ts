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
 * Email/push rows are only marked sent by their dedicated channel processors.
 * If the channel enqueuer is missing or temporarily unavailable, this fan-out
 * job leaves the outbox row retryable (`processed_at IS NULL`) and records the
 * handoff problem in `last_error`.
 */
import { Redis } from 'ioredis';
import { and, asc, eq, inArray, isNull, notificationOutbox, notifications, sql } from '@pusula/db';
import type { Database } from '@pusula/db';

/** Redis pub/sub channel `apps/api` subscribes to for user-room badge updates. */
export const NOTIFICATION_USER_CHANNEL = 'pusula:notifications:user';

/** BullMQ job name (documentation; the worker matches by queue, not name). */
export const NOTIFICATION_PUBLISH_JOB_NAME = 'notification-publish';

export type NotificationPublishJobData = { eventId: string; outboxIds?: string[] };

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
  // The triggering `activity_events.id` (NULL for scheduler-fired due_* rows).
  // Bildirim detay / audit (2026-06-20): in_app fan-out copies this onto
  // `notifications.activity_event_id`, and uses it to find the sibling `push`
  // outbox rows of the *same* event to back-link the new `notifications.id`.
  eventId: string | null;
  channel: 'in_app' | 'email' | 'push';
  recipientId: string | null;
  // Bildirim detay / audit (2026-06-23) — tetikleyen aktör; in_app fan-out bunu
  // `notifications.actorId`'ye kopyalar (detay ekranı aktör join'i için).
  actorId: string | null;
  type: string;
  payload: unknown;
  // Faz 10G (DEM-141): `'digest_queued'` damgalı satırlar email kanal
  // kuyruğuna push edilmez (digest worker bunları toplu olarak işler).
  // Burada okuyup `dispatchOutboxRow` içinde skip kararı veriyoruz.
  status: string;
  processedAt: Date | null;
  createdAt: Date;
};

/** Best-effort hand-off to the Faz 6B channel queues. Wired by `index.ts`. */
export interface ChannelEnqueuers {
  enqueueEmail?: (outboxId: string) => Promise<void> | void;
  enqueuePush?: (outboxId: string) => Promise<void> | void;
}

type PendingChannelHandoff = {
  channel: 'email' | 'push';
  outboxId: string;
};

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
  // Every external side effect is buffered inside the transaction and flushed
  // only after commit. This is not merely an optimisation: enqueueing a child
  // email/push job while its outbox row is still locked lets the child run
  // early, skip the lock, report `missing`, and complete without delivery.
  const pendingMessages: Array<{ outboxId: string; recipientId: string; message: string }> = [];
  const pendingHandoffs: PendingChannelHandoff[] = [];
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
    const pendingFilters = [eventFilter, isNull(notificationOutbox.processedAt)];
    if (data.outboxIds && data.outboxIds.length > 0) {
      pendingFilters.push(inArray(notificationOutbox.id, data.outboxIds));
    }
    const rows = (await tx
      .select({
        id: notificationOutbox.id,
        eventId: notificationOutbox.eventId,
        channel: notificationOutbox.channel,
        recipientId: notificationOutbox.recipientId,
        actorId: notificationOutbox.actorId,
        type: notificationOutbox.type,
        payload: notificationOutbox.payload,
        status: notificationOutbox.status,
        processedAt: notificationOutbox.processedAt,
        createdAt: notificationOutbox.createdAt,
      })
      .from(notificationOutbox)
      .where(and(...pendingFilters))
      .orderBy(asc(notificationOutbox.createdAt))
      .for('update', { skipLocked: true })) as OutboxRow[];
    if (rows.length === 0) return { processed: 0, skipped: 0 };

    let processed = 0;
    let skipped = 0;

    for (const row of rows) {
      const outcome = await dispatchOutboxRow(tx, pendingMessages, pendingHandoffs, row);
      if (outcome === 'delivered') processed++;
      else if (outcome === 'skipped') skipped++;
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

  // Channel queue handoff must happen after the transaction commits. A failed
  // handoff leaves the outbox pending and fails this parent job so BullMQ can
  // retry immediately; the periodic sweeper remains the final recovery layer.
  let handedOff = 0;
  const failures: string[] = [];
  for (const handoff of pendingHandoffs) {
    const enqueuer = handoff.channel === 'email' ? enqueuers.enqueueEmail : enqueuers.enqueuePush;
    if (!enqueuer) {
      const reason = `${handoff.channel} enqueuer is not wired`;
      await markChannelHandoffUnavailable(db, handoff.outboxId, reason);
      failures.push(`${handoff.channel}:${handoff.outboxId}: ${reason}`);
      continue;
    }

    try {
      await enqueuer(handoff.outboxId);
      await clearChannelHandoffError(db, handoff.outboxId);
      handedOff++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const reason = `${handoff.channel} enqueue failed: ${message}`;
      console.warn(
        `[worker:notifications] ${handoff.channel} enqueue failed (outbox=${handoff.outboxId}):`,
        message,
      );
      await markChannelHandoffUnavailable(db, handoff.outboxId, reason);
      failures.push(`${handoff.channel}:${handoff.outboxId}: ${reason}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`notification channel handoff failed (${failures.join('; ')})`);
  }

  return { processed: result.processed + handedOff, skipped: result.skipped };
}

type DispatchOutcome = 'delivered' | 'deferred' | 'skipped';

async function dispatchOutboxRow(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  pendingMessages: Array<{ outboxId: string; recipientId: string; message: string }>,
  pendingHandoffs: PendingChannelHandoff[],
  row: OutboxRow,
): Promise<DispatchOutcome> {
  if (row.channel === 'in_app') {
    if (!row.recipientId) {
      // Anonymous in-app rows are nonsensical (no recipient → no badge). Mark
      // them dead-letter so the sweeper doesn't re-pick them.
      await tx
        .update(notificationOutbox)
        .set({
          processedAt: new Date(),
          status: 'dead',
          lastError: 'in_app row missing recipient_id',
        })
        .where(eq(notificationOutbox.id, row.id));
      return 'skipped';
    }
    // 1. Write to `notifications` (the persistent record the badge counts +
    //    the centre lists). The Drizzle insert path picks up the schema's
    //    `$defaultFn(() => nanoid())` id default — a raw SQL INSERT skips
    //    that and the NOT NULL on `id` rejects the row.
    //
    // Scope kolonları (2026-07-20) — payload'daki workspace/board/card id'leri
    // kolonlara da yazılır (`board.moveToWorkspace` bildirim migrate'i ve
    // scope sorguları kolondan çalışabilsin; öncesinde kolonlar hep NULL
    // kalıyordu). Değer payload'dan köre kopyalanmaz: kaynak kayıt outbox
    // yazıldıktan sonra silinmiş olabilir → scalar subquery varlığı doğrular,
    // kayıt yoksa NULL düşer ve FK ihlali oluşmaz.
    const payloadObj = (row.payload ?? {}) as Record<string, unknown>;
    const scopeId = (key: string): string | null => {
      const v = payloadObj[key];
      return typeof v === 'string' && v.length > 0 ? v : null;
    };
    const wsScopeId = scopeId('workspaceId');
    const boardScopeId = scopeId('boardId');
    const cardScopeId = scopeId('cardId');
    const [insertedRow] = await tx
      .insert(notifications)
      .values({
        recipientId: row.recipientId,
        actorId: row.actorId,
        type: row.type as typeof notifications.$inferInsert.type,
        payload: payloadObj,
        workspaceId: wsScopeId ? sql`(select id from workspaces where id = ${wsScopeId})` : null,
        boardId: boardScopeId ? sql`(select id from boards where id = ${boardScopeId})` : null,
        cardId: cardScopeId ? sql`(select id from cards where id = ${cardScopeId})` : null,
        // Bildirim detay / audit (2026-06-20) — back-link the in-app record to
        // the activity event that produced it. Scheduler-fired `due_*` rows
        // carry `event_id IS NULL` (no triggering activity) → stays null, fine.
        activityEventId: row.eventId,
      })
      .returning({ id: notifications.id, createdAt: notifications.createdAt });
    const notificationId = insertedRow?.id;
    const notificationCreatedAt = insertedRow?.createdAt;
    // Bildirim detay / audit (2026-06-20) — back-link the freshly written
    // `notifications.id` onto the *same* event's `push` outbox row(s) so the
    // push processor can hand `data.notificationId` to the mobile app (push tap
    // → in-app detail screen). Guarded by `in_app_notification_id IS NULL` so a
    // sweeper re-run can't overwrite an already-set link (idempotent). Skipped
    // when `event_id IS NULL` (scheduler ticks have no sibling activity to join
    // on; a NULL `event_id` match would wrongly fan across unrelated rows).
    //
    // CRITICAL: must also match `recipient_id`. A single `event_id` fans out to
    // one `(in_app, push)` pair *per recipient*; without the recipient filter
    // the first in_app row processed claims *every* push row for the event
    // (the `IS NULL` guard then blocks the rest), so co-recipients' pushes
    // carry someone else's `notifications.id`. `byId` filters by recipient →
    // NOT_FOUND → mobile "Bildirim yüklenemedi" on push tap for all-but-one
    // recipient. Scope the link to this row's own recipient.
    if (notificationId && row.eventId) {
      await tx
        .update(notificationOutbox)
        .set({ inAppNotificationId: notificationId })
        .where(
          and(
            eq(notificationOutbox.eventId, row.eventId),
            eq(notificationOutbox.recipientId, row.recipientId),
            eq(notificationOutbox.channel, 'push'),
            isNull(notificationOutbox.inAppNotificationId),
          ),
        );
    }
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
    // Faz 10G (DEM-141): `digest_queued` damgalı satırları digest worker
    // (`notification-email-digest.ts`) recipient bazlı toplar — burada
    // email kanal kuyruğuna push etmiyoruz. Satır `processed_at` boş
    // kalır (digest worker stamp eder); 60 s sweeper bu satırları
    // yeniden buraya getirir ama yine aynı dalda skip edilirler — net
    // sonuç: digest worker tick'leyene kadar sessiz dolaşırlar, ek
    // yük yaratmazlar (status filtresi index'li).
    if (row.status === 'digest_queued') {
      return 'skipped';
    }
    pendingHandoffs.push({ channel: 'email', outboxId: row.id });
    return 'deferred';
  } else if (row.channel === 'push') {
    pendingHandoffs.push({ channel: 'push', outboxId: row.id });
    return 'deferred';
  }

  // Stamp `processed_at` on success (one-shot — idempotent re-runs see this
  // and skip via the `IS NULL` filter above). Only reached for `in_app`;
  // email and push rows are stamped by their dedicated channel processors.
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

async function markChannelHandoffUnavailable(
  db: Database,
  outboxId: string,
  reason: string,
): Promise<void> {
  await db
    .update(notificationOutbox)
    .set({
      status: 'pending',
      lastError: reason,
      attempts: sql`${notificationOutbox.attempts} + 1`,
    })
    .where(and(eq(notificationOutbox.id, outboxId), isNull(notificationOutbox.processedAt)));
}

async function clearChannelHandoffError(db: Database, outboxId: string): Promise<void> {
  await db
    .update(notificationOutbox)
    .set({
      lastError: null,
    })
    .where(and(eq(notificationOutbox.id, outboxId), isNull(notificationOutbox.processedAt)));
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
