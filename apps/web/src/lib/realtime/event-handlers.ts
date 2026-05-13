/**
 * Realtime event dispatcher — Phase 5C (DEM-85).
 *
 * Pure routing layer between a `RealtimeEventEnvelope` (server fan-out from
 * Faz 5B's outbox + worker) and the board cache primitives. Stays pure on
 * purpose: takes a `QueryClient` + a board filter + a card filter factory,
 * pushes the cache update through `setQueriesData`, returns nothing. Unknown
 * event types log a warning and skip — Faz 5B is allowed to publish a new
 * type before this file learns to handle it (forward compatibility).
 *
 * Payload contract (matches the producer that 5B will land):
 *   - `card.moved`      → `{ cardId, fromListId, toListId, position }`
 *   - `card.created`    → `{ card }` — full row (`board.get` projection)
 *   - `card.updated`    → `{ cardId, patch }` — shallow merge over the card
 *   - `card.archived`   → `{ cardId }`
 *   - `card.completed`  → `{ cardId, completedAt, completedBy? }`
 *   - `card.uncompleted`→ `{ cardId }`
 *   - `list.moved`      → `{ listId, position }`
 *   - `list.created`    → `{ list }`
 *   - `list.updated`    → `{ listId, patch }`
 *   - `list.archived`   → `{ listId, archivedAt }`
 *   - `board.updated`   → `{ patch }`
 *   - `board.archived`  → `{ archivedAt }`
 *
 * Spec: `05-board-mekanigi.md` §5.3, `08-web-ve-mobil.md` §8.1.10.
 */
import type { QueryClient, QueryFilters } from '@tanstack/react-query';
// `QueryFilters` is re-exported below in the `RealtimeFilters` shape; the
// import is intentional — keep the reference so it isn't tree-shaken from the
// `.d.ts` consumer view.
import type { RealtimeEventEnvelope } from '@pusula/domain';
import {
  applyBoardPatch,
  applyCardAdd,
  applyCardArchive,
  applyCardMove,
  applyCardPatch,
  applyListAdd,
  applyListArchive,
  applyListMove,
  applyListPatch,
} from '@/lib/board-cache/primitives';
import type { BoardCache, CardCache, ListCache, CardDetailCache } from '@/lib/board-cache/types';

/** Filters the dispatcher needs to address the right query-client entries. */
export interface RealtimeFilters {
  /** `board.get({ boardId })` filter — the primary cache patched per event. */
  board: QueryFilters;
  /** `card.get({ cardId })` filter factory — used when the event references a single card detail. */
  card: (cardId: string) => QueryFilters;
}

type Payload = Record<string, unknown>;

function setBoard(qc: QueryClient, filters: RealtimeFilters, mutate: (data: BoardCache) => BoardCache): void {
  qc.setQueriesData<BoardCache>(filters.board, (data) => (data == null ? data : mutate(data)));
}

function patchCardDetail(
  qc: QueryClient,
  filters: RealtimeFilters,
  cardId: string,
  patch: Partial<CardDetailCache>,
): void {
  qc.setQueriesData<CardDetailCache>(filters.card(cardId), (data) =>
    data == null ? data : { ...data, ...patch },
  );
}

/**
 * Apply a single envelope to the board cache. The caller is responsible for
 * echo skipping + `seq` gating before invoking this — the dispatcher itself
 * is the cache write.
 */
export function dispatchRealtimeEvent(
  qc: QueryClient,
  filters: RealtimeFilters,
  envelope: RealtimeEventEnvelope,
): void {
  const payload = (envelope.payload ?? {}) as Payload;

  switch (envelope.type) {
    case 'card.moved': {
      const { cardId, toListId, position } = payload as {
        cardId: string;
        toListId: string;
        position: string;
      };
      setBoard(qc, filters, (data) => applyCardMove(data, { cardId, toListId, newPosition: position }));
      return;
    }
    case 'card.created': {
      const { card } = payload as { card: CardCache };
      setBoard(qc, filters, (data) => applyCardAdd(data, card));
      return;
    }
    case 'card.updated': {
      const { cardId, patch } = payload as { cardId: string; patch: Partial<CardCache> };
      setBoard(qc, filters, (data) => applyCardPatch(data, cardId, patch));
      patchCardDetail(qc, filters, cardId, patch as Partial<CardDetailCache>);
      return;
    }
    case 'card.archived': {
      const { cardId } = payload as { cardId: string };
      setBoard(qc, filters, (data) => applyCardArchive(data, cardId));
      return;
    }
    case 'card.completed': {
      const { cardId, completedAt, completedBy } = payload as {
        cardId: string;
        completedAt: string;
        completedBy?: string | null;
      };
      // `CardCache.completedAt` is `Date` (superjson reifies it client-side);
      // wire format is ISO-8601 from the producer. Convert here.
      const patch = {
        completedAt: new Date(completedAt),
        completedBy: completedBy ?? null,
      } as unknown as Partial<CardCache>;
      setBoard(qc, filters, (data) => applyCardPatch(data, cardId, patch));
      patchCardDetail(qc, filters, cardId, patch as unknown as Partial<CardDetailCache>);
      return;
    }
    case 'card.uncompleted': {
      const { cardId } = payload as { cardId: string };
      const patch = { completedAt: null, completedBy: null } as unknown as Partial<CardCache>;
      setBoard(qc, filters, (data) => applyCardPatch(data, cardId, patch));
      patchCardDetail(qc, filters, cardId, patch as unknown as Partial<CardDetailCache>);
      return;
    }
    case 'list.moved': {
      const { listId, position } = payload as { listId: string; position: string };
      setBoard(qc, filters, (data) => applyListMove(data, { listId, newPosition: position }));
      return;
    }
    case 'list.created': {
      const { list } = payload as { list: ListCache };
      setBoard(qc, filters, (data) => applyListAdd(data, list));
      return;
    }
    case 'list.updated': {
      const { listId, patch } = payload as { listId: string; patch: Partial<ListCache> };
      setBoard(qc, filters, (data) => applyListPatch(data, listId, patch));
      return;
    }
    case 'list.archived': {
      const { listId, archivedAt } = payload as {
        listId: string;
        archivedAt: string | null;
      };
      setBoard(qc, filters, (data) => applyListArchive(data, listId, archivedAt));
      return;
    }
    case 'board.updated': {
      const { patch } = payload as { patch: Partial<BoardCache['board']> };
      setBoard(qc, filters, (data) => applyBoardPatch(data, patch));
      return;
    }
    case 'board.archived': {
      const { archivedAt } = payload as { archivedAt: string | null };
      setBoard(qc, filters, (data) =>
        applyBoardPatch(data, { archivedAt } as Partial<BoardCache['board']>),
      );
      return;
    }
    default: {
      // Forward-compat: a 5B-published type the client doesn't recognise yet —
      // log once and skip rather than throwing.
      console.warn(`[realtime] unknown event type '${envelope.type}', skipping`);
      return;
    }
  }
}
