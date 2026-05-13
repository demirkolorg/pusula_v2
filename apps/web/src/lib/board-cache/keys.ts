/**
 * Query key factory for board cache reads + invalidations (Phase 4B — DEM-79).
 *
 * Component code never writes a literal `['board', boardId]` array. It calls
 * one of these helpers, which delegates to the tRPC-generated `queryFilter`
 * (procedure path + serialized input) so the keys stay in lock-step with the
 * router — no drift between the key shape and the procedure signature. The
 * helper signatures (`board(boardId)` etc.) are the public API; the literal
 * `['board', boardId]` form lives only in this module for documentation.
 *
 * The factory is a React hook because `useTRPC()` is one — but the returned
 * object is `useMemo`-stable so callers can pass `cacheKeys.board(boardId)`
 * straight into `useMemo`/`useCallback` deps without re-running the effect on
 * every parent render.
 */
'use client';

import { useMemo } from 'react';
import { useTRPC } from '@/trpc/client';

export type BoardCacheKeys = {
  /** `board.get({ boardId })` — single board (lists + active cards). */
  board: (boardId: string) => ReturnType<ReturnType<typeof useTRPC>['board']['get']['queryFilter']>;
  /** `board.list({ workspaceId })` — workspace board summary list. */
  boards: (
    workspaceId: string,
  ) => ReturnType<ReturnType<typeof useTRPC>['board']['list']['queryFilter']>;
  /** `card.get({ cardId })` — card detail (comments/checklist/labels/members are *not* in here). */
  card: (cardId: string) => ReturnType<ReturnType<typeof useTRPC>['card']['get']['queryFilter']>;
};

export function useBoardCacheKeys(): BoardCacheKeys {
  const trpc = useTRPC();
  return useMemo<BoardCacheKeys>(
    () => ({
      board: (boardId) => trpc.board.get.queryFilter({ boardId }),
      boards: (workspaceId) => trpc.board.list.queryFilter({ workspaceId }),
      card: (cardId) => trpc.card.get.queryFilter({ cardId }),
    }),
    [trpc],
  );
}
