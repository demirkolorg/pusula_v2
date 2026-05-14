/**
 * Stale-event sweeper for the realtime outbox (Faz 5B — DEM-84).
 *
 * The mutation path enqueues a `pusula-realtime-publish` job after the tx
 * commits — best-effort, fire-and-forget. If the API's Redis link was down for
 * those few hundred milliseconds, the job never lands; the `realtime_events`
 * row sits with `published_at IS NULL`. This sweeper drains that pool: every
 * 60 s it picks up rows older than 30 s and re-enqueues them. BullMQ debounces
 * by `jobId = publish-{eventId}`, so a still-in-flight job is a natural no-op.
 *
 * Guarantee: no event sits `published_at IS NULL` for longer than ~90 s
 * (30 s grace + one 60 s tick). The partial index `realtime_events_pending_idx`
 * (defined in `@pusula/db` — migration 0008) makes the scan cheap regardless
 * of the table's overall size.
 *
 * Retention cleanup (`published_at IS NOT NULL AND created_at < NOW() - 7 days`)
 * is a separate Faz 8 hardening job — not in scope here.
 */
import { and, isNull, lt, sql } from '@pusula/db';
import { realtimeEvents } from '@pusula/db';
import type { Database } from '@pusula/db';

/** Repeatable job name registered against `pusula-realtime-publish` queue. */
export const REALTIME_PUBLISH_SWEEPER_JOB_NAME = 'realtime-publish-sweeper';

/** How often the sweeper ticks (BullMQ `repeat.every`). */
export const REALTIME_PUBLISH_SWEEPER_INTERVAL_MS = 60_000;

/** Minimum age a row must reach before the sweeper re-enqueues it. */
export const REALTIME_PUBLISH_SWEEPER_GRACE_SECONDS = 30;

/** Cap on rows pulled in a single sweep (keeps memory bounded under load). */
export const REALTIME_PUBLISH_SWEEPER_BATCH = 500;

/** Minimal enqueue surface — matches the producer's signature. */
export interface RealtimePublishEnqueuer {
  enqueue: (eventId: string) => Promise<void>;
}

/**
 * One sweeper tick: find stale pending rows, hand each eventId to the
 * enqueuer. Returns the number of rows re-enqueued (for logging / metrics).
 *
 * Errors in `enqueue` for one eventId are logged + swallowed so a transient
 * Redis blip doesn't kill the whole batch — the next tick retries the row
 * (it's still `published_at IS NULL`).
 */
export async function sweepStaleRealtimeEvents(
  db: Database,
  enqueuer: RealtimePublishEnqueuer,
): Promise<number> {
  const rows = await db
    .select({ id: realtimeEvents.id })
    .from(realtimeEvents)
    .where(
      and(
        isNull(realtimeEvents.publishedAt),
        lt(
          realtimeEvents.createdAt,
          sql`NOW() - (${REALTIME_PUBLISH_SWEEPER_GRACE_SECONDS} * INTERVAL '1 second')`,
        ),
      ),
    )
    .limit(REALTIME_PUBLISH_SWEEPER_BATCH);

  let enqueued = 0;
  for (const row of rows) {
    try {
      await enqueuer.enqueue(row.id);
      enqueued++;
    } catch (err) {
      console.warn(
        `[worker:realtime-sweeper] enqueue failed (eventId=${row.id}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return enqueued;
}
