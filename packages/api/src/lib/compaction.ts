/**
 * Position-compaction enqueue plumbing (Faz 3C — DEM-44).
 *
 * `list.move` / `card.move` may produce a long fractional `position` key after
 * many moves between close neighbours. When they do (`@pusula/domain`
 * `shouldCompact`), the affected scope (a list's cards / a board's lists) is
 * enqueued for a background re-balance by `apps/worker` (`pusula-compaction`).
 *
 * The procedures stay framework-agnostic: they call `maybeEnqueueCompaction`
 * with the produced key(s), and the *host app* (`apps/api`) supplies the actual
 * `enqueueCompaction` on the tRPC context. In tests / Next route handlers the
 * hook is absent → enqueue is a no-op. Enqueue is best-effort: a Redis failure
 * is swallowed (and logged by the host) so it never fails the request.
 *
 * See `docs/architecture/06-bildirim-altyapisi.md` "Position compaction" and
 * `docs/domain/03-siralama-kurallari.md` "Compaction".
 */
import { shouldCompact } from '@pusula/domain';

/** Which scope a compaction run covers — mirrors `apps/worker` `CompactionScope`. */
export type CompactionScope =
  | { kind: 'list'; listId: string }
  | { kind: 'board'; boardId: string };

/**
 * Build the advisory-lock / BullMQ `jobId` key for a compaction scope.
 *
 * The shape (`compaction:list:<id>` / `compaction:board:<id>`) must stay
 * byte-identical to `compactionScopeKey` in `apps/worker/src/jobs/compaction.ts`
 * so that `hashtext(scopeKey)` resolves to the same advisory lock in both the
 * worker and the API procedures. The worker has its own copy because `apps` don't
 * share code — this comment is the safety net.
 */
export function compactionScopeKey(scope: CompactionScope): string {
  return scope.kind === 'list' ? `compaction:list:${scope.listId}` : `compaction:board:${scope.boardId}`;
}

/** Host-supplied, best-effort enqueue hook (Redis errors must be swallowed by the host). */
export type EnqueueCompaction = (scope: CompactionScope) => void | Promise<void>;

/** Minimal slice of the tRPC context this helper needs. */
interface CtxWithEnqueue {
  enqueueCompaction?: EnqueueCompaction;
}

/**
 * Enqueue a compaction job for `scope` iff (a) the host wired an enqueue hook
 * and (b) one of `producedPositions` is long enough to warrant it. Fire-and-forget:
 * the caller should `void` this — it must never block or fail the request.
 */
export function maybeEnqueueCompaction(
  ctx: CtxWithEnqueue,
  scope: CompactionScope,
  producedPositions: readonly string[],
): void {
  if (!ctx.enqueueCompaction) return;
  if (!shouldCompact(producedPositions)) return;
  void ctx.enqueueCompaction(scope);
}
