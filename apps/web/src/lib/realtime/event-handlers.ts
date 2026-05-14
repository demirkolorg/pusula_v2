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
 * Payload contract (producer shape first; legacy/full-row shape accepted):
 *   - `card.moved`      → `{ cardId, fromListId, toListId, toPosition }`
 *   - `card.created`    → `{ cardId, listId, title, position }` or `{ card }`
 *   - `card.updated`    → `{ cardId, patch }` — shallow merge over the card
 *   - `card.archived`   → `{ cardId, archived }`
 *   - `card.completed`  → `{ cardId, completedAt, completedBy? }`
 *   - `card.uncompleted`→ `{ cardId }`
 *   - `list.moved`      → `{ listId, toPosition }`
 *   - `list.created`    → `{ listId, title, position }` or `{ list }`
 *   - `list.updated`    → `{ listId, patch? }` or `{ listId, fromTitle?, toTitle?, color? }`
 *   - `list.archived`   → `{ listId, archived }`
 *   - `board.updated`   → `{ patch }`
 *   - `board.archived`  → `{ archived }`
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

function isPayload(value: unknown): value is Payload {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(payload: Payload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanField(payload: Payload, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === 'boolean' ? value : undefined;
}

function createdAtDate(envelope: RealtimeEventEnvelope): Date {
  const date = new Date(envelope.createdAt);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function archivedAtFromPayload(
  payload: Payload,
  envelope: RealtimeEventEnvelope,
): string | null | undefined {
  if (Object.prototype.hasOwnProperty.call(payload, 'archivedAt')) {
    const archivedAt = payload.archivedAt;
    if (archivedAt === null || typeof archivedAt === 'string') return archivedAt;
  }
  const archived = booleanField(payload, 'archived');
  if (archived === true) return envelope.createdAt;
  if (archived === false) return null;
  return undefined;
}

function cardFromPayload(payload: Payload, envelope: RealtimeEventEnvelope): CardCache | undefined {
  const nested = payload.card;
  if (isPayload(nested) && typeof nested.id === 'string') return nested as unknown as CardCache;

  const id = stringField(payload, 'cardId');
  const listId = stringField(payload, 'listId');
  const title = stringField(payload, 'title');
  const position = stringField(payload, 'position') ?? stringField(payload, 'toPosition');
  if (!id || !listId || !title || !position) return undefined;

  const timestamp = createdAtDate(envelope);
  return {
    id,
    boardId: envelope.boardId ?? '',
    listId,
    title,
    description: null,
    position,
    dueAt: null,
    completed: false,
    completedAt: null,
    completedBy: null,
    coverColor: null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    members: [],
  } as unknown as CardCache;
}

function listFromPayload(payload: Payload, envelope: RealtimeEventEnvelope): ListCache | undefined {
  const nested = payload.list;
  if (isPayload(nested) && typeof nested.id === 'string') return nested as unknown as ListCache;

  const id = stringField(payload, 'listId');
  const title = stringField(payload, 'title');
  const position = stringField(payload, 'position') ?? stringField(payload, 'toPosition');
  if (!id || !title || !position) return undefined;

  const timestamp = createdAtDate(envelope);
  return {
    id,
    title,
    color: null,
    icon: null,
    iconColor: null,
    position,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as unknown as ListCache;
}

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
  const payload = isPayload(envelope.payload) ? envelope.payload : {};

  switch (envelope.type) {
    case 'card.moved': {
      const cardId = stringField(payload, 'cardId');
      const toListId = stringField(payload, 'toListId');
      const position = stringField(payload, 'position') ?? stringField(payload, 'toPosition');
      if (!cardId || !toListId || !position) return;
      setBoard(qc, filters, (data) => applyCardMove(data, { cardId, toListId, newPosition: position }));
      return;
    }
    case 'card.created': {
      const card = cardFromPayload(payload, envelope);
      if (!card) return;
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
      const cardId = stringField(payload, 'cardId');
      if (!cardId) return;
      if (booleanField(payload, 'archived') === false) {
        void qc.invalidateQueries(filters.board);
        return;
      }
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
      const listId = stringField(payload, 'listId');
      const position = stringField(payload, 'position') ?? stringField(payload, 'toPosition');
      if (!listId || !position) return;
      setBoard(qc, filters, (data) => applyListMove(data, { listId, newPosition: position }));
      return;
    }
    case 'list.created': {
      const list = listFromPayload(payload, envelope);
      if (!list) return;
      setBoard(qc, filters, (data) => applyListAdd(data, list));
      return;
    }
    case 'list.updated': {
      const { listId, patch, toTitle, color, icon, iconColor } = payload as {
        listId: string;
        patch?: Partial<ListCache>;
        toTitle?: string;
        color?: ListCache['color'];
        icon?: ListCache['icon'];
        iconColor?: ListCache['iconColor'];
      };
      const nextPatch: Partial<ListCache> = { ...(patch ?? {}) };
      if (toTitle !== undefined) nextPatch.title = toTitle;
      if (Object.prototype.hasOwnProperty.call(payload, 'color')) nextPatch.color = color ?? null;
      if (Object.prototype.hasOwnProperty.call(payload, 'icon')) nextPatch.icon = icon ?? null;
      if (Object.prototype.hasOwnProperty.call(payload, 'iconColor')) {
        nextPatch.iconColor = iconColor ?? null;
      }
      if (Object.keys(nextPatch).length === 0) return;
      setBoard(qc, filters, (data) => applyListPatch(data, listId, nextPatch));
      return;
    }
    case 'list.archived': {
      const listId = stringField(payload, 'listId');
      const archivedAt = archivedAtFromPayload(payload, envelope);
      if (!listId || archivedAt === undefined) return;
      setBoard(qc, filters, (data) => applyListArchive(data, listId, archivedAt));
      return;
    }
    case 'board.updated': {
      const { patch } = payload as { patch: Partial<BoardCache['board']> };
      setBoard(qc, filters, (data) => applyBoardPatch(data, patch));
      return;
    }
    case 'board.archived': {
      const archivedAt = archivedAtFromPayload(payload, envelope);
      if (archivedAt === undefined) return;
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
