/**
 * Orphan attachment sweeper — Faz 11C (DEM-149).
 *
 * Two-phase attachment uploads (`attachment.initiate` writes a `committed_at
 * IS NULL` draft row → client uploads to MinIO → `attachment.commit` stamps
 * the row). Drafts that never get committed (network drop, user abandons,
 * client crash) leave orphaned rows + storage objects behind. This sweeper
 * runs hourly and cleans them up after a 1-hour grace window — short enough
 * to keep storage bills tidy, long enough that a slow uploader on a flaky
 * mobile connection isn't punished.
 *
 * Per row:
 *  1. MinIO `DeleteObject(storage_key)` — idempotent (`NoSuchKey` swallowed
 *     by the adapter in `attachment-cleanup.ts`).
 *  2. DB `DELETE FROM attachments WHERE id = $1 AND committed_at IS NULL` —
 *     the predicate guards against a racy commit: if `attachment.commit`
 *     stamped the row between SELECT and DELETE, the WHERE clause now sees
 *     `committed_at IS NOT NULL` and the row is preserved (the storage
 *     object is gone — that's a known small risk, deliberately accepted to
 *     keep the sweeper idempotent and the commit path fast).
 *  3. Storage-first, DB-second: if DB delete fails the next tick will
 *     re-process the row (storage delete is idempotent — `NoSuchKey`
 *     swallowed); if storage fails we *don't* delete the DB row, so the
 *     same draft surfaces again next tick.
 *
 * No `activity_events`. Drafts never surfaced to a user.
 *
 * Mirrors the `notification-publish-sweeper.ts` / `realtime-publish-sweeper.ts`
 * cadence pattern but at hourly cadence (a 1-hour grace window dominates the
 * inter-tick latency anyway). Same partial-index trick: the `committed_at IS
 * NULL` predicate matches `attachments_orphan_sweep_idx` (migration 0027 /
 * DEM-147) so the SELECT stays cheap regardless of total attachment volume.
 *
 * See `docs/architecture/06-bildirim-altyapisi.md` "Attachment cleanup queue
 * (Faz 11 — kart eki)" → Tetik 2.
 */
import { and, eq, isNull, lt, sql } from '@pusula/db';
import { attachments } from '@pusula/db';
import type { Database } from '@pusula/db';
import type { AttachmentObjectStorage } from './attachment-cleanup';

/** Repeatable job name registered against `pusula-attachment-cleanup`. */
export const ATTACHMENT_CLEANUP_SWEEPER_JOB_NAME = 'attachment-cleanup-sweeper';

/** 60 minutes — Faz 5B (60 s) / Faz 6A (60 s) sweeper pattern, larger window. */
export const ATTACHMENT_CLEANUP_SWEEPER_INTERVAL_MS = 60 * 60 * 1_000;

/** Minimum age (seconds) a draft row must reach before it's eligible for sweep. */
export const ATTACHMENT_CLEANUP_SWEEPER_GRACE_SECONDS = 60 * 60;

/** Hard cap on rows touched per tick — keeps memory and S3 RPS bounded. */
export const ATTACHMENT_CLEANUP_SWEEPER_BATCH = 500;

/** Outcome counters for logging / tests. */
export interface SweepOrphanResult {
  scanned: number;
  storageDeleted: number;
  dbDeleted: number;
  storageFailed: number;
}

/**
 * One sweeper tick. Returns counters for the worker's structured log line.
 *
 * Storage failures for a single row are caught + logged + counted but DO NOT
 * abort the rest of the batch — the next tick retries them. DB failures
 * propagate (BullMQ retries the whole tick); this is rare and indicates a
 * bigger problem (connection pool, schema drift).
 */
export async function sweepOrphanAttachments(
  db: Database,
  storage: AttachmentObjectStorage,
  bucket: string,
): Promise<SweepOrphanResult> {
  const rows = await db
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .where(
      and(
        isNull(attachments.committedAt),
        lt(
          attachments.createdAt,
          sql`NOW() - (${ATTACHMENT_CLEANUP_SWEEPER_GRACE_SECONDS} * INTERVAL '1 second')`,
        ),
      ),
    )
    .limit(ATTACHMENT_CLEANUP_SWEEPER_BATCH);

  let storageDeleted = 0;
  let dbDeleted = 0;
  let storageFailed = 0;

  for (const row of rows) {
    try {
      // Storage first — idempotent (`NoSuchKey` swallowed by adapter).
      await storage.deleteObject({ bucket, key: row.storageKey });
      storageDeleted++;
    } catch (err) {
      // A real S3 failure (5xx, network, creds) — skip this row, log it,
      // try again next tick. The DB row stays put, so the SELECT will
      // re-surface it.
      storageFailed++;
      console.warn(
        `[worker:attachment-cleanup-sweeper] storage delete failed (id=${row.id}, key=${row.storageKey}):`,
        err instanceof Error ? err.message : String(err),
      );
      continue;
    }
    // DB second — `committed_at IS NULL` guard preserves rows that raced
    // with a commit between SELECT and DELETE (the storage object is then
    // gone — a deliberately accepted small risk).
    const result = await db
      .delete(attachments)
      .where(and(eq(attachments.id, row.id), isNull(attachments.committedAt)))
      .returning({ id: attachments.id });
    if (result.length > 0) dbDeleted++;
  }

  return { scanned: rows.length, storageDeleted, dbDeleted, storageFailed };
}
