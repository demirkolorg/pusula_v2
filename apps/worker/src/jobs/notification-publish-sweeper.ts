/**
 * Stale-event sweeper for the notification outbox — Faz 6A (DEM-90).
 *
 * Mirror image of `realtime-publish-sweeper.ts`. The mutation path enqueues a
 * `pusula-notifications` job after the tx commits — best-effort, fire-and-
 * forget. If the API's Redis link was down for those few hundred
 * milliseconds, the job never lands; the `notification_outbox` row(s) sit
 * with `processed_at IS NULL`. This sweeper drains that pool: every 60 s it
 * picks up *event_ids* with rows older than 30 s and re-enqueues them. BullMQ
 * debounces by `jobId = notify-{eventId}`, so a still-in-flight job is a
 * natural no-op.
 *
 * Guarantee: no notification sits `processed_at IS NULL` for longer than ~90 s
 * (30 s grace + one 60 s tick). The partial index
 * `notification_outbox_pending_idx` (migration 0009) makes the scan cheap.
 *
 * Retention cleanup (`processed_at IS NOT NULL AND created_at < NOW() - 30
 * days`) is a separate Faz 8 hardening job — not in scope here.
 */
import { and, isNull, lt, sql } from '@pusula/db';
import { notificationOutbox } from '@pusula/db';
import type { Database } from '@pusula/db';
import { extractRawSqlRows } from './raw-sql-rows';
import { SCHEDULER_TICK_EVENT_ID } from './notification-publish';

/** Repeatable job name registered against `pusula-notifications` queue. */
export const NOTIFICATION_PUBLISH_SWEEPER_JOB_NAME = 'notification-publish-sweeper';

/** How often the sweeper ticks (BullMQ `repeat.every`). */
export const NOTIFICATION_PUBLISH_SWEEPER_INTERVAL_MS = 60_000;

/** Minimum age a row must reach before the sweeper re-enqueues it. */
export const NOTIFICATION_PUBLISH_SWEEPER_GRACE_SECONDS = 30;

/** Cap on event_ids pulled in a single sweep (keeps memory bounded). */
export const NOTIFICATION_PUBLISH_SWEEPER_BATCH = 500;

/** Minimal enqueue surface — matches the producer's signature. */
export interface NotificationPublishEnqueuer {
  enqueue: (eventId: string) => Promise<void>;
}

type NotificationOutboxEventIdRow = {
  event_id: string | null;
};

/**
 * One sweeper tick: find distinct `event_id`s with stale pending rows, hand
 * each to the enqueuer. Returns the number of events re-enqueued.
 *
 * Errors in `enqueue` for one event are logged + swallowed so a transient
 * Redis blip doesn't kill the whole batch — the next tick retries the events
 * (they're still `processed_at IS NULL`).
 */
export async function sweepStaleNotificationEvents(
  db: Database,
  enqueuer: NotificationPublishEnqueuer,
): Promise<number> {
  // DISTINCT event_id — the outbox can carry multiple rows (per channel) for
  // a single event; we only need to enqueue the job once.
  //
  // `event_id IS NULL` rows are handled by a *separate* recovery branch below
  // (see `SCHEDULER_TICK_EVENT_ID`). They come from two producers whose
  // notifications have no triggering `activity_events.id`: the due-date
  // scheduler (`due_*` reminders) and scheduled report emails. Their
  // best-effort `enqueueNotificationPublish('scheduler:tick')` can be lost on
  // a Redis blip exactly like activity-driven jobs — and before this branch
  // existed, the `event_id IS NOT NULL` filter meant the sweeper could *never*
  // recover them, leaving the batch stuck `pending` forever (DEM push incident
  // 2026-05-31: a due_overdue tick lost its sentinel → 20 push + 21 in_app + 9
  // email rows permanently stranded).
  //
  // Faz 10G (DEM-141): `digest_queued` rows aren't owed a re-publish — the
  // dedicated `notification-email-digest` cron processes them on its own
  // schedule. Excluding them keeps the sweeper from re-enqueueing rows that
  // the publish processor would simply skip again (and avoids growing
  // sweeper noise as a user's digest backlog accumulates between ticks).
  const result = await db.execute(sql`
    SELECT DISTINCT event_id
    FROM ${notificationOutbox}
    WHERE ${and(
      isNull(notificationOutbox.processedAt),
      lt(
        notificationOutbox.createdAt,
        sql`NOW() - (${NOTIFICATION_PUBLISH_SWEEPER_GRACE_SECONDS} * INTERVAL '1 second')`,
      ),
      sql`${notificationOutbox.eventId} IS NOT NULL`,
      sql`${notificationOutbox.status} <> 'digest_queued'`,
    )}
    LIMIT ${NOTIFICATION_PUBLISH_SWEEPER_BATCH}
  `);

  const eventIds = extractRawSqlRows<NotificationOutboxEventIdRow>(result)
    .map((r) => r.event_id)
    .filter((id): id is string => typeof id === 'string');

  let enqueued = 0;
  for (const eventId of eventIds) {
    try {
      await enqueuer.enqueue(eventId);
      enqueued++;
    } catch (err) {
      console.warn(
        `[worker:notifications-sweeper] enqueue failed (eventId=${eventId}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Scheduler-fired recovery: if *any* stale `event_id IS NULL` pending row
  // exists, hand the `SCHEDULER_TICK_EVENT_ID` sentinel to the enqueuer once.
  // The publish processor maps that sentinel to `WHERE event_id IS NULL AND
  // processed_at IS NULL` and drains every such row in one job — so a single
  // enqueue recovers an entire lost scheduler batch. `digest_queued` rows are
  // excluded for the same reason as above (the digest cron owns them).
  // BullMQ debounces on the sentinel's stable jobId, so concurrent ticks are a
  // natural no-op.
  const staleNullRows = await db.execute(sql`
    SELECT 1
    FROM ${notificationOutbox}
    WHERE ${and(
      isNull(notificationOutbox.processedAt),
      isNull(notificationOutbox.eventId),
      lt(
        notificationOutbox.createdAt,
        sql`NOW() - (${NOTIFICATION_PUBLISH_SWEEPER_GRACE_SECONDS} * INTERVAL '1 second')`,
      ),
      sql`${notificationOutbox.status} <> 'digest_queued'`,
    )}
    LIMIT 1
  `);

  if (extractRawSqlRows(staleNullRows).length > 0) {
    try {
      await enqueuer.enqueue(SCHEDULER_TICK_EVENT_ID);
      enqueued++;
    } catch (err) {
      console.warn(
        '[worker:notifications-sweeper] scheduler-tick recovery enqueue failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return enqueued;
}
