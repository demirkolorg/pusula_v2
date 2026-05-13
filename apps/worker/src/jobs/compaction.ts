/**
 * Position compaction job (Faz 3C — DEM-44).
 *
 * Fractional `position` strings grow with repeated moves (`a4 → a44 → a444 …`).
 * When `list.move` / `card.move` produce a key long enough (≥
 * `POSITION_COMPACTION_MAX_LEN`), `apps/api` enqueues this job for the affected
 * scope (`list` → that list's cards / `board` → that board's lists). The job
 * re-balances the scope's rows — in-order — onto short, evenly-spaced keys
 * (`positionsBetween(null, null, n)`) and bumps `boards.version` so clients
 * refresh their stale positions.
 *
 * - No `activity_events` are written (purely technical maintenance, invisible to users).
 * - No `realtime_events` / `notification_outbox` (those land in Phase 5/6).
 * - Idempotent: re-running produces the same compact keys (`positionsBetween` is
 *   deterministic from `null, null, n`); a failed run is retried by BullMQ
 *   (queue `defaultJobOptions` — exponential backoff).
 * - Concurrency with a live move: a `pg_advisory_xact_lock(hashtext(scopeKey))`
 *   serialises this job against another move/compaction on the same scope.
 *
 * See `docs/architecture/06-bildirim-altyapisi.md` "Position compaction" and
 * `docs/domain/03-siralama-kurallari.md` "Compaction".
 */
import { asc, eq, sql } from '@pusula/db';
import { boards, cards, lists } from '@pusula/db';
import type { Database } from '@pusula/db';
import { positionsBetween } from '@pusula/domain';

/**
 * BullMQ job name for this queue. Duplicated in `apps/api/src/compaction-queue.ts`
 * (producer side — `JOB_NAME`) — must stay in sync: `'position-compaction'`.
 * This constant is not consumed by the BullMQ `Worker` constructor (the worker
 * matches jobs by queue, not name); it serves as documentation and is exported
 * for tests.
 */
export const COMPACTION_JOB_NAME = 'position-compaction';

/** Which scope a compaction run covers. */
export type CompactionScope =
  | { kind: 'list'; listId: string }
  | { kind: 'board'; boardId: string };

export type CompactionJobData = { scope: CompactionScope };

/** Stable string key for the advisory lock + the BullMQ `jobId` (debounce). */
export function compactionScopeKey(scope: CompactionScope): string {
  return scope.kind === 'list' ? `compaction:list:${scope.listId}` : `compaction:board:${scope.boardId}`;
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Re-balance result for one scope: `count` rows seen, `changed` rows updated. */
interface RebalanceResult {
  count: number;
  changed: number;
}

/** Re-balance the cards of one list onto short, evenly-spaced positions. */
async function rebalanceListCards(tx: Tx, listId: string): Promise<RebalanceResult> {
  const rows = await tx
    .select({ id: cards.id, position: cards.position })
    .from(cards)
    .where(eq(cards.listId, listId))
    .orderBy(asc(cards.position));
  if (rows.length <= 1) return { count: 0, changed: 0 };

  const newPositions = positionsBetween(null, null, rows.length);
  let changed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const next = newPositions[i]!;
    if (row.position === next) continue; // already compact at this slot — skip
    await tx.update(cards).set({ position: next }).where(eq(cards.id, row.id));
    changed++;
  }
  return { count: rows.length, changed };
}

/** Re-balance the lists of one board onto short, evenly-spaced positions. */
async function rebalanceBoardLists(tx: Tx, boardId: string): Promise<RebalanceResult> {
  const rows = await tx
    .select({ id: lists.id, position: lists.position })
    .from(lists)
    .where(eq(lists.boardId, boardId))
    .orderBy(asc(lists.position));
  if (rows.length <= 1) return { count: 0, changed: 0 };

  const newPositions = positionsBetween(null, null, rows.length);
  let changed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const next = newPositions[i]!;
    if (row.position === next) continue;
    await tx.update(lists).set({ position: next }).where(eq(lists.id, row.id));
    changed++;
  }
  return { count: rows.length, changed };
}

/**
 * Re-balance a scope's `position` strings. Returns `{ rebalanced }` — the number
 * of rows in the scope that were re-balanced (0 for a no-op: ≤ 1 row, or — for a
 * `list` scope — the list no longer exists).
 */
export async function processCompactionJob(
  db: Database,
  data: CompactionJobData,
): Promise<{ rebalanced: number }> {
  const { scope } = data;
  const scopeKey = compactionScopeKey(scope);

  return db.transaction(async (tx) => {
    // Serialise against a concurrent move / compaction on the same scope. The
    // lock is transaction-scoped (released on commit/rollback). `hashtext`
    // returns int4 — enough entropy for a best-effort advisory lock.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${scopeKey}))`);

    let boardId: string;
    let result: RebalanceResult;

    if (scope.kind === 'list') {
      const [list] = await tx
        .select({ boardId: lists.boardId })
        .from(lists)
        .where(eq(lists.id, scope.listId))
        .limit(1);
      if (!list) {
        // The list was deleted between enqueue and now — nothing to do.
        return { rebalanced: 0 };
      }
      boardId = list.boardId;
      result = await rebalanceListCards(tx, scope.listId);
    } else {
      boardId = scope.boardId;
      result = await rebalanceBoardLists(tx, scope.boardId);
    }

    // Bump the board version only when something actually moved (an
    // already-compact scope, e.g. a re-run, is a true no-op).
    if (result.changed > 0) {
      await tx
        .update(boards)
        .set({ version: sql`${boards.version} + 1` })
        .where(eq(boards.id, boardId));
    }

    return { rebalanced: result.count };
  });
}
