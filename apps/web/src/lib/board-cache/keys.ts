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
  /** `comment.list({ cardId })` — card comments. */
  comments: (
    cardId: string,
  ) => ReturnType<ReturnType<typeof useTRPC>['comment']['list']['queryFilter']>;
  /** `checklist.list({ cardId })` — card checklists with nested items. */
  checklists: (
    cardId: string,
  ) => ReturnType<ReturnType<typeof useTRPC>['checklist']['list']['queryFilter']>;
  /** `card.labels.list({ cardId })` — labels attached to a card. */
  cardLabels: (
    cardId: string,
  ) => ReturnType<ReturnType<typeof useTRPC>['card']['labels']['list']['queryFilter']>;
  /** `card.members.list({ cardId })` — members attached to a card. */
  cardMembers: (
    cardId: string,
  ) => ReturnType<ReturnType<typeof useTRPC>['card']['members']['list']['queryFilter']>;
  /** `label.list({ boardId })` — board label catalogue. */
  boardLabels: (
    boardId: string,
  ) => ReturnType<ReturnType<typeof useTRPC>['label']['list']['queryFilter']>;
  /** `board.members.list({ boardId })` — board members. */
  boardMembers: (
    boardId: string,
  ) => ReturnType<ReturnType<typeof useTRPC>['board']['members']['list']['queryFilter']>;
  /** `board.invitations.list({ boardId })` — pending board invitations. */
  boardInvitations: (
    boardId: string,
  ) => ReturnType<ReturnType<typeof useTRPC>['board']['invitations']['list']['queryFilter']>;
  /** `attachment.list({ cardId })` — committed card attachments (Faz 11D). */
  attachments: (
    cardId: string,
  ) => ReturnType<ReturnType<typeof useTRPC>['attachment']['list']['queryFilter']>;
};

export function useBoardCacheKeys(): BoardCacheKeys {
  const trpc = useTRPC();
  return useMemo<BoardCacheKeys>(
    () => ({
      board: (boardId) => trpc.board.get.queryFilter({ boardId }),
      boards: (workspaceId) => trpc.board.list.queryFilter({ workspaceId }),
      card: (cardId) => trpc.card.get.queryFilter({ cardId }),
      comments: (cardId) => trpc.comment.list.queryFilter({ cardId }),
      checklists: (cardId) => trpc.checklist.list.queryFilter({ cardId }),
      cardLabels: (cardId) => trpc.card.labels.list.queryFilter({ cardId }),
      cardMembers: (cardId) => trpc.card.members.list.queryFilter({ cardId }),
      boardLabels: (boardId) => trpc.label.list.queryFilter({ boardId }),
      boardMembers: (boardId) => trpc.board.members.list.queryFilter({ boardId }),
      boardInvitations: (boardId) => trpc.board.invitations.list.queryFilter({ boardId }),
      attachments: (cardId) => trpc.attachment.list.queryFilter({ cardId }),
    }),
    [trpc],
  );
}
