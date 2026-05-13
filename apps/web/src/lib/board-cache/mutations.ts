/**
 * `useOptimisticBoardMutation` — higher-order hook scaffold for Phase 4
 * collaborative mutations (DEM-79; consumers wired in 4C / DEM-80).
 *
 * Standardises the optimistic lifecycle from `05-board-mekanigi.md` §5.2:
 *   onMutate:   cancel `board.get`, snapshot, apply pure cache transform.
 *   onError:    rollback snapshot; on CONFLICT also refetch + neutral notice;
 *               otherwise low-noise error notice.
 *   onSettled:  invalidate `board.get` (and `card.get` if `cardId` provided).
 *
 * `clientMutationId` (UUID v4) is injected into the variables automatically
 * unless the caller already set one — callers never re-implement that.
 *
 * The hook is generic over `TVars` / `TData` and forwards to a tRPC
 * `mutationOptions` builder (e.g. `trpc.card.update.mutationOptions`), so 4C
 * can wrap every board/list/card collaborative mutation without restating the
 * lifecycle. Snapshot/rollback uses `getQueriesData` + `setQueryData` so a
 * cached entry for *any* matching board query gets restored on error (not
 * just the most-recent one).
 */
'use client';

import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { useBoardCacheKeys } from './keys';
import type { BoardCache } from './types';

/** Rollback context returned from `onMutate` and consumed by `onError`. */
export type OptimisticRollback = {
  /** All matching `board.get` entries before the optimistic patch. */
  previous: [readonly unknown[], unknown][];
};

function isConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'data' in err &&
    typeof (err as { data?: { code?: unknown } }).data === 'object' &&
    (err as { data?: { code?: unknown } }).data?.code === 'CONFLICT'
  );
}

/**
 * tRPC's `.mutationOptions(...)` signature — accepts a `useMutation` options
 * bag and returns a (possibly enriched) options bag. We keep it structural so
 * the hook accepts any board/list/card mutation builder without naming each.
 */
type MutationOptionsBuilder<TVars, TData> = (
  options: UseMutationOptions<TData, unknown, TVars, OptimisticRollback>,
) => UseMutationOptions<TData, unknown, TVars, OptimisticRollback>;

export type UseOptimisticBoardMutationArgs<TVars, TData> = {
  /** tRPC procedure's `mutationOptions` (e.g. `trpc.card.update.mutationOptions`). */
  mutationOptions: MutationOptionsBuilder<TVars, TData>;
  /** Board whose cache is patched + invalidated. */
  boardId: string;
  /**
   * If set, `card.get` for this id is also invalidated on settle (for mutations
   * that affect a single card detail, e.g. `card.update` / `card.complete`).
   * Can be a function of the vars when the id isn't known at hook setup.
   */
  cardId?: string | ((vars: TVars) => string | undefined);
  /**
   * Pure cache transform applied in `onMutate` to the `board.get` cache.
   * Receives the current cache and the mutation vars; returns the patched cache
   * (same reference if no-op).
   *
   * Note: this hook intentionally only patches `board.get`. For mutations that
   * also want to patch `card.get` optimistically (e.g. `card.update` from an
   * open card detail modal), 4C will either compose two
   * `useOptimisticBoardMutation`s or extend this hook with a second
   * `applyCardDetail` callback — open decision, tracked on §5.2 follow-up.
   */
  apply: (data: BoardCache, vars: TVars) => BoardCache;
  /**
   * Called on `CONFLICT` after rollback + refetch. Place to show the neutral
   * "moved by someone else / reloaded" toast (`strings.board.conflict.*`).
   */
  onConflict?: (err: unknown, vars: TVars) => void;
  /**
   * Called on any non-`CONFLICT` error after rollback. Place to show the
   * destructive toast (`strings.board.optimistic.error`).
   */
  onMutationError?: (err: unknown, vars: TVars) => void;
};

/**
 * Wraps a tRPC mutation in the standard optimistic lifecycle. 4C will call
 * this once per collaborative mutation (card/list/board create/update/move/
 * archive/etc.) instead of restating onMutate/onError/onSettled each time.
 */
export function useOptimisticBoardMutation<
  TVars extends { clientMutationId?: string },
  TData = unknown,
>(args: UseOptimisticBoardMutationArgs<TVars, TData>) {
  const queryClient = useQueryClient();
  const cacheKeys = useBoardCacheKeys();
  const { boardId, apply, cardId, onConflict, onMutationError, mutationOptions } = args;

  const boardFilter = useMemo(() => cacheKeys.board(boardId), [cacheKeys, boardId]);

  const resolveCardId = useCallback(
    (vars: TVars): string | undefined => {
      if (typeof cardId === 'function') return cardId(vars);
      return cardId;
    },
    [cardId],
  );

  const onMutate = useCallback(
    async (vars: TVars): Promise<OptimisticRollback> => {
      await queryClient.cancelQueries(boardFilter);
      const previous = queryClient.getQueriesData(boardFilter);
      queryClient.setQueriesData<BoardCache>(boardFilter, (data) =>
        data == null ? data : apply(data, vars),
      );
      return { previous };
    },
    [queryClient, boardFilter, apply],
  );

  const onError = useCallback(
    async (err: unknown, vars: TVars, ctx: OptimisticRollback | undefined) => {
      if (ctx) {
        for (const [key, data] of ctx.previous) queryClient.setQueryData(key, data);
      }
      if (isConflict(err)) {
        await queryClient.invalidateQueries(boardFilter);
        onConflict?.(err, vars);
      } else {
        onMutationError?.(err, vars);
      }
    },
    [queryClient, boardFilter, onConflict, onMutationError],
  );

  const onSettled = useCallback(
    async (_data: TData | undefined, _err: unknown, vars: TVars) => {
      await queryClient.invalidateQueries(boardFilter);
      const id = resolveCardId(vars);
      if (id) await queryClient.invalidateQueries(cacheKeys.card(id));
    },
    [queryClient, boardFilter, cacheKeys, resolveCardId],
  );

  return useMutation(mutationOptions({ onMutate, onError, onSettled }));
}

/**
 * Inject a `clientMutationId` (UUID v4) when the caller hasn't set one. Tiny
 * helper so 4C call sites read `cardMove.mutate(withClientMutationId(vars))`
 * instead of sprinkling `crypto.randomUUID()` everywhere. The field stays
 * optional on the wire (server-side parse `z.string().uuid().optional()`),
 * but every UI mutation in scope of Phase 4 produces one.
 *
 * Exported now so 4C (DEM-80) consumers and 4D (DEM-81) failure tests can
 * import it from the public surface. Phase 4B itself doesn't wire it yet —
 * call sites still use inline `crypto.randomUUID()` (Phase 3B-era DnD code).
 */
export function withClientMutationId<TVars extends { clientMutationId?: string }>(
  vars: TVars,
): TVars & { clientMutationId: string } {
  return {
    ...vars,
    clientMutationId: vars.clientMutationId ?? crypto.randomUUID(),
  };
}
