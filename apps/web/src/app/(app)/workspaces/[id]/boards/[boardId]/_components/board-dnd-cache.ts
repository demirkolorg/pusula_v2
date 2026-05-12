/**
 * Optimistic `board.get` cache transforms for drag-and-drop (Phase 3B — DEM-43).
 *
 * `card.move` / `list.move` aren't optimistic at the TanStack-Query layer yet
 * (full normalized cache is Phase 4 — DEM-27). For a smooth drag we still patch
 * the `board.get` cache locally on drop, fire the single mutation, roll back on
 * error, and `invalidate`+refetch on settle so the server's authoritative
 * `position` reconciles. These pure transforms do the patching — kept separate
 * so they're trivial to unit-test with a fake `board.get` payload.
 *
 * The transforms only touch `cards[].listId` / `cards[].position` (or
 * `lists[].position`) and keep the arrays sorted by `position` (the same order
 * the server returns), so a re-render shows the moved card/column in place.
 */
import type { CardMovePlan, ListMovePlan } from './board-dnd-position';

/** Minimal card shape the cache transforms need (the real `BoardCard` is a superset). */
type CardLike = { id: string; listId: string; position: string };
/** Minimal list shape the cache transforms need. */
type ListLike = { id: string; position: string };

/** The `board.get` query data shape (only the parts the transforms touch). */
export type BoardCacheData<TCard extends CardLike, TList extends ListLike, TExtra extends object> = {
  cards: TCard[];
  lists: TList[];
} & TExtra;

function sortByPosition<T extends { position: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

/**
 * Apply a {@link CardMovePlan} to the `board.get` cache: re-parent the card to
 * `toListId` and give it `newPosition`, then re-sort the cards array. Returns a
 * new object (immutable update); if the card isn't in the cache, returns the
 * input unchanged.
 */
export function applyCardMoveToBoardCache<
  TCard extends CardLike,
  TList extends ListLike,
  TExtra extends object,
>(
  data: BoardCacheData<TCard, TList, TExtra>,
  plan: Pick<CardMovePlan, 'cardId' | 'toListId' | 'newPosition'>,
): BoardCacheData<TCard, TList, TExtra> {
  const exists = data.cards.some((c) => c.id === plan.cardId);
  if (!exists) return data;
  const cards = sortByPosition(
    data.cards.map((c) =>
      c.id === plan.cardId ? { ...c, listId: plan.toListId, position: plan.newPosition } : c,
    ),
  );
  return { ...data, cards };
}

/**
 * Apply a {@link ListMovePlan} to the `board.get` cache: give the list
 * `newPosition`, re-sort the lists array. Returns a new object; if the list
 * isn't in the cache, returns the input unchanged.
 */
export function applyListMoveToBoardCache<
  TCard extends CardLike,
  TList extends ListLike,
  TExtra extends object,
>(
  data: BoardCacheData<TCard, TList, TExtra>,
  plan: Pick<ListMovePlan, 'listId' | 'newPosition'>,
): BoardCacheData<TCard, TList, TExtra> {
  const exists = data.lists.some((l) => l.id === plan.listId);
  if (!exists) return data;
  const lists = sortByPosition(
    data.lists.map((l) => (l.id === plan.listId ? { ...l, position: plan.newPosition } : l)),
  );
  return { ...data, lists };
}
