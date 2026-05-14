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
  // a single event; we only need to enqueue the job once. Rows with
  // `event_id IS NULL` (orphans from a deleted activity_events row — ON
  // DELETE SET NULL FK) are skipped here; the retention job cleans them up.
  const rows = await db.execute(sql`
    SELECT DISTINCT event_id
    FROM ${notificationOutbox}
    WHERE ${and(
      isNull(notificationOutbox.processedAt),
      lt(
        notificationOutbox.createdAt,
        sql`NOW() - (${NOTIFICATION_PUBLISH_SWEEPER_GRACE_SECONDS} * INTERVAL '1 second')`,
      ),
      sql`${notificationOutbox.eventId} IS NOT NULL`,
    )}
    LIMIT ${NOTIFICATION_PUBLISH_SWEEPER_BATCH}
  `);

  const eventIds = (rows as unknown as { rows: Array<{ event_id: string | null }> }).rows
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
  return enqueued;
}
