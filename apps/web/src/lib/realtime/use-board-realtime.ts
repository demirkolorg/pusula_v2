/**
 * `useBoardRealtime` — Phase 5C (DEM-85).
 *
 * Mount on a board detail page to keep its `board.get` cache in sync with
 * concurrent edits from other users. Plumbing:
 *
 *   1. Lazily `getRealtimeSocket()` (singleton from `./client`). Connect if
 *      not already; on each `connect` event re-emit `board:join` + invalidate
 *      `board.get` (covers both first-mount + reconnect resync — `05-board-mekanigi.md`
 *      §5.3 "Reconnect resync").
 *   2. Subscribe to `REALTIME_EVENT_CHANNEL` envelopes. For each envelope:
 *        a. echo skip — if `envelope.clientMutationId` is in the in-flight
 *           set (mutation hook `onMutate` → `onSettled`), drop. The optimistic
 *           cache patch already landed; replaying would double-apply.
 *        b. seq gate — read `data.board.version` from the cache:
 *             • `seq === version + 1` → apply (`dispatchRealtimeEvent`),
 *               then bump `board.version` to `seq` so the next event lines up.
 *             • `seq > version + 1` → gap; invalidate `board.get` so the
 *               authoritative refetch carries the catch-up state (and the
 *               new `version`).
 *             • `seq <= version` → stale; drop.
 *           If the cache has no payload yet (page just opened), invalidate to
 *           let the in-flight `board.get` finish before reasoning about gaps.
 *   3. On unmount: emit `board:leave` and detach both listeners. The socket
 *      stays alive (singleton) — the next board's mount reuses it.
 *
 * `connected` reflects the underlying socket state so the page can render a
 * subtle "Bağlantı koptu, tekrar bağlanılıyor…" banner while the link is down
 * (matches `strings.realtime.disconnected`).
 *
 * Spec: `08-web-ve-mobil.md` §8.1.10, `05-board-mekanigi.md` §5.3.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeEventEnvelope } from '@pusula/domain';
import { useBoardCacheKeys } from '@/lib/board-cache/keys';
import type { BoardCache } from '@/lib/board-cache/types';
import { dispatchRealtimeEvent, type RealtimeFilters } from './event-handlers';
import { hasInFlightClientMutationId } from './in-flight-store';
import { getRealtimeSocket, REALTIME_EVENT_CHANNEL } from './client';

export interface UseBoardRealtimeResult {
  /** True while the underlying socket is connected — drives the disconnect banner. */
  connected: boolean;
}

export function useBoardRealtime(boardId: string): UseBoardRealtimeResult {
  const queryClient = useQueryClient();
  // `useBoardCacheKeys` returns a fresh `{ board, boards, card }` reference every
  // render (its memo depends on `useTRPC()` which is recreated each render in
  // some test setups). Stashing it in a ref keeps the effect deps stable so the
  // socket lifecycle isn't torn down + rebuilt on every parent render — that
  // re-mount loop would re-trigger `socket.connect()` and overwrite the
  // `connected` flag immediately after a disconnect.
  const cacheKeys = useBoardCacheKeys();
  const cacheKeysRef = useRef(cacheKeys);
  cacheKeysRef.current = cacheKeys;
  const socket = getRealtimeSocket();
  const [connected, setConnected] = useState<boolean>(() => socket.connected);

  useEffect(() => {
    const getBoardFilter = () => cacheKeysRef.current.board(boardId);
    const filters: RealtimeFilters = {
      get board() {
        return getBoardFilter();
      },
      card: (cardId: string) => cacheKeysRef.current.card(cardId),
      comments: (cardId: string) => cacheKeysRef.current.comments(cardId),
      checklists: (cardId: string) => cacheKeysRef.current.checklists(cardId),
      cardLabels: (cardId: string) => cacheKeysRef.current.cardLabels(cardId),
      cardMembers: (cardId: string) => cacheKeysRef.current.cardMembers(cardId),
      boardLabels: (boardId: string) => cacheKeysRef.current.boardLabels(boardId),
      boardMembers: (boardId: string) => cacheKeysRef.current.boardMembers(boardId),
      boardInvitations: (boardId: string) => cacheKeysRef.current.boardInvitations(boardId),
    };
    // Read the current `boards.version` straight from the cache. If multiple
    // queries match the filter (shouldn't, in practice — one board, one entry),
    // pick the first non-empty payload.
    const getCurrentVersion = (): number | undefined => {
      const entries = queryClient.getQueriesData<BoardCache>(getBoardFilter());
      for (const [, data] of entries) {
        if (data?.board && typeof (data.board as { version?: unknown }).version === 'number') {
          return (data.board as { version: number }).version;
        }
      }
      return undefined;
    };

    const handleEvent = (envelope: RealtimeEventEnvelope): void => {
      // Echo: our own optimistic mutation's server-side acknowledgement.
      if (
        envelope.clientMutationId &&
        hasInFlightClientMutationId(envelope.clientMutationId)
      ) {
        return;
      }

      const currentVersion = getCurrentVersion();
      if (currentVersion === undefined) {
        // No baseline → let the in-flight `board.get` (or a fresh invalidate)
        // bring us to a state where seq reasoning is meaningful.
        void queryClient.invalidateQueries(getBoardFilter());
        return;
      }
      if (envelope.seq <= currentVersion) {
        // Stale / duplicate (server-side re-publish after the periodic sweeper
        // re-enqueues a row whose `published_at` was already set — Karar
        // 2026-05-13(a)).
        return;
      }
      if (envelope.seq > currentVersion + 1) {
        // Gap: we missed at least one event. The authoritative `board.get`
        // refetch carries the catch-up state (no client-side outbox replay).
        void queryClient.invalidateQueries(getBoardFilter());
        return;
      }
      // seq === currentVersion + 1 → apply.
      dispatchRealtimeEvent(queryClient, filters, envelope);
      // Bump the cache's `boards.version` so the next event lines up.
      queryClient.setQueriesData<BoardCache>(getBoardFilter(), (data) =>
        data == null
          ? data
          : ({ ...data, board: { ...data.board, version: envelope.seq } } as BoardCache),
      );
    };

    // Track whether we ever actually emitted `board:join`; we only emit the
    // matching `board:leave` on cleanup if we did. Otherwise a fast
    // mount-then-unmount before `connect` fires would send the server a
    // `leave` for a board that never saw a `join`.
    let joined = false;

    const handleConnect = (): void => {
      setConnected(true);
      // Cold start + reconnect both pass through here: refetch first (server
      // is the authority over the catch-up window) and rejoin the board room.
      void queryClient.invalidateQueries(getBoardFilter());
      socket.emit('board:join', { boardId });
      joined = true;
    };

    const handleDisconnect = (): void => {
      setConnected(false);
    };

    socket.on(REALTIME_EVENT_CHANNEL, handleEvent);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (!socket.connected) {
      socket.connect();
    } else {
      // Already connected when this hook mounted (another board page just
      // unmounted, reused singleton) — emit the join + invalidate path
      // explicitly since the `connect` event won't fire.
      handleConnect();
    }

    return () => {
      socket.off(REALTIME_EVENT_CHANNEL, handleEvent);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      if (joined) socket.emit('board:leave', { boardId });
    };
  }, [boardId, queryClient, socket]);

  return { connected };
}
