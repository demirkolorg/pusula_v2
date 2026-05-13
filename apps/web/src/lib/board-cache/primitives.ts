/**
 * Pure cache transforms for the `board.get` payload (Phase 4B — DEM-79).
 *
 * `board.get` returns a flat `{ board, lists[], cards[] }` shape (active cards
 * only; archived lists kept with `archivedAt` set so the column can stay shown
 * dimmed). These transforms patch that shape immutably for optimistic UI: each
 * function takes the current cache snapshot and returns a new object (or the
 * same reference if the change is a no-op), so they're trivial to unit-test
 * without a `QueryClient`. The optimistic mutation hook (`mutations.ts`)
 * forwards a `QueryClient`-bound update through `setQueriesData` — the
 * primitives themselves stay queryClient-free on purpose.
 */

/** Minimum shape the card transforms touch. The real `BoardCard` is a superset. */
type CardLike = { id: string; listId: string; position: string };
/** Minimum shape the list transforms touch. */
type ListLike = { id: string; position: string; archivedAt: Date | string | null };

/** Generic `board.get` cache shape — `TBoard`/`TList`/`TCard` are the real
 * row types, kept generic so tests can use a minimal fixture and the runtime
 * can use the tRPC-derived `BoardCache` from `./types`.
 */
export type BoardCacheData<TBoard, TList extends ListLike, TCard extends CardLike> = {
  board: TBoard;
  lists: TList[];
  cards: TCard[];
};

function sortByPosition<T extends { position: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

/**
 * Re-parent `cardId` to `toListId` and set its `position` to `newPosition`,
 * then re-sort the cards array. No-op (same reference) if the card isn't in
 * the cache.
 */
export function applyCardMove<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  plan: { cardId: string; toListId: string; newPosition: string },
): BoardCacheData<TBoard, TList, TCard> {
  const current = data.cards.find((c) => c.id === plan.cardId);
  if (!current) return data;
  // Same parent + same position → preserve reference so React skips re-renders.
  if (current.listId === plan.toListId && current.position === plan.newPosition) return data;
  const cards = sortByPosition(
    data.cards.map((c) =>
      c.id === plan.cardId ? { ...c, listId: plan.toListId, position: plan.newPosition } : c,
    ),
  );
  return { ...data, cards };
}

/**
 * Set a new `position` on `listId` and re-sort the lists array. No-op if the
 * list isn't in the cache.
 */
export function applyListMove<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  plan: { listId: string; newPosition: string },
): BoardCacheData<TBoard, TList, TCard> {
  const current = data.lists.find((l) => l.id === plan.listId);
  if (!current) return data;
  if (current.position === plan.newPosition) return data;
  const lists = sortByPosition(
    data.lists.map((l) => (l.id === plan.listId ? { ...l, position: plan.newPosition } : l)),
  );
  return { ...data, lists };
}

/**
 * Patch one card by id (shallow-merge `patch`). Re-sorts cards when the patch
 * touches `position`. No-op if the card isn't in the cache.
 */
export function applyCardPatch<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  cardId: string,
  patch: Partial<TCard>,
): BoardCacheData<TBoard, TList, TCard> {
  if (!data.cards.some((c) => c.id === cardId)) return data;
  const mapped = data.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c));
  const cards = 'position' in patch ? sortByPosition(mapped) : mapped;
  return { ...data, cards };
}

/**
 * Append a card to the cache and re-sort. No-op if a card with the same id is
 * already in the cache.
 */
export function applyCardAdd<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  card: TCard,
): BoardCacheData<TBoard, TList, TCard> {
  if (data.cards.some((c) => c.id === card.id)) return data;
  return { ...data, cards: sortByPosition([...data.cards, card]) };
}

/** Remove a card by id. No-op if the card isn't in the cache. */
export function applyCardRemove<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  cardId: string,
): BoardCacheData<TBoard, TList, TCard> {
  if (!data.cards.some((c) => c.id === cardId)) return data;
  return { ...data, cards: data.cards.filter((c) => c.id !== cardId) };
}

/**
 * Drop the card from the cache. `board.get` only returns active cards, so an
 * optimistic `card.archive` removes the card outright (mirrors what the
 * server-side refetch would yield).
 */
export function applyCardArchive<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  cardId: string,
): BoardCacheData<TBoard, TList, TCard> {
  return applyCardRemove(data, cardId);
}

/** Append a list to the cache and re-sort. No-op if the list already exists. */
export function applyListAdd<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  list: TList,
): BoardCacheData<TBoard, TList, TCard> {
  if (data.lists.some((l) => l.id === list.id)) return data;
  return { ...data, lists: sortByPosition([...data.lists, list]) };
}

/**
 * Patch one list by id. Re-sorts lists when the patch touches `position`.
 * No-op if the list isn't in the cache.
 */
export function applyListPatch<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  listId: string,
  patch: Partial<TList>,
): BoardCacheData<TBoard, TList, TCard> {
  if (!data.lists.some((l) => l.id === listId)) return data;
  const mapped = data.lists.map((l) => (l.id === listId ? { ...l, ...patch } : l));
  const lists = 'position' in patch ? sortByPosition(mapped) : mapped;
  return { ...data, lists };
}

/**
 * Set `archivedAt` on a list. Unlike `card.archive`, `board.get` keeps
 * archived lists in the payload (with `archivedAt` set) so the column can
 * stay rendered dimmed; we patch in place and keep the array order.
 */
export function applyListArchive<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  listId: string,
  archivedAt: Date | string | null,
): BoardCacheData<TBoard, TList, TCard> {
  if (!data.lists.some((l) => l.id === listId)) return data;
  const lists = data.lists.map((l) => (l.id === listId ? { ...l, archivedAt } : l));
  return { ...data, lists };
}

/** Patch the `board.*` fields (shallow-merge). */
export function applyBoardPatch<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  patch: Partial<TBoard>,
): BoardCacheData<TBoard, TList, TCard> {
  return { ...data, board: { ...data.board, ...patch } };
}
