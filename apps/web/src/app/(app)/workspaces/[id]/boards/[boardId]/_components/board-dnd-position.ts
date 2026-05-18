/**
 * Pure ordering math for board drag-and-drop (Phase 3B — DEM-43).
 *
 * Given a drop target + the closest edge ("top"/"bottom" for cards, "left"/
 * "right" for columns) and the current `position`-sorted siblings, compute the
 * before/after neighbours and the new fractional `position` (via
 * `@pusula/domain` `positionBetween`). The result is what `card.move` /
 * `list.move` expect; the server validates or recomputes. No React, no I/O —
 * easy to unit-test (empty list, head/tail, between, dropped back onto itself
 * = no-op, cross-list).
 *
 * See `docs/architecture/08-web-ve-mobil.md` §8.1.8 and
 * `docs/architecture/05-board-mekanigi.md` §5.1.
 */
import { comparePosition, positionBetween } from '@pusula/domain';

/** Closest edge of a *card* drop target (vertical list). */
export type CardEdge = 'top' | 'bottom';
/** Closest edge of a *column* drop target (horizontal strip). */
export type ColumnEdge = 'left' | 'right';

type HasPosition = { position: string };

/**
 * The plan for moving a card: where it lands (`toListId`), which cards it sits
 * between, and the computed `newPosition`. `null` means "no move" (the card was
 * dropped where it already is).
 */
export type CardMovePlan = {
  cardId: string;
  fromListId: string;
  toListId: string;
  beforeCardId: string | null;
  afterCardId: string | null;
  newPosition: string | null;
};

/**
 * The plan for reordering a column within its board: which lists it sits
 * between and the computed `newPosition`. `null` means "no move".
 */
export type ListMovePlan = {
  listId: string;
  beforeListId: string | null;
  afterListId: string | null;
  newPosition: string | null;
};

/** Cards sorted ascending by `position` (a stable copy). */
function byPosition<T extends HasPosition>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => comparePosition(a.position, b.position));
}

/**
 * Resolve the drop index in `siblings` from a target item id + closest edge.
 * Returns the index the moved item should occupy *after* it has been removed
 * from `siblings` (so callers must pass siblings with the moved item already
 * excluded). Dropping above target `i` ⇒ index `i`; below ⇒ index `i + 1`.
 */
function dropIndexFromEdge(
  siblings: readonly { id: string }[],
  targetId: string,
  edgeIsAfter: boolean,
): number {
  const idx = siblings.findIndex((s) => s.id === targetId);
  if (idx === -1) return siblings.length; // unknown target ⇒ append (defensive)
  return edgeIsAfter ? idx + 1 : idx;
}

function safePositionBetween(before: string | null, after: string | null): string | null {
  try {
    return positionBetween(before, after);
  } catch {
    return null;
  }
}

/** A card sibling: just enough to order and identify it. */
export type CardSibling = { id: string } & HasPosition;

/**
 * Build a {@link CardMovePlan} for dropping `cardId` (currently in `fromListId`)
 * relative to `targetCardId` in `toListId` (which is `null` when the card is
 * dropped on an empty column body — it goes to the end). `cardsByListId(listId)`
 * returns that list's active cards (any order — sorted here). Returns `null`
 * when the move is a no-op (the gap it would land in is the one it already
 * occupies, or it was dropped onto itself).
 */
export function planCardMove(args: {
  cardId: string;
  fromListId: string;
  toListId: string;
  /** Target card id under the cursor, or `null` for "end of the column". */
  targetCardId: string | null;
  /** Which edge of the target card the cursor is closest to. Ignored when `targetCardId` is `null`. */
  edge: CardEdge;
  cardsByListId: (listId: string) => readonly CardSibling[];
}): CardMovePlan | null {
  const { cardId, fromListId, toListId, targetCardId, edge } = args;
  if (targetCardId === cardId) return null; // dropped onto itself

  // The destination's siblings, minus the dragged card itself.
  const siblings = byPosition(args.cardsByListId(toListId)).filter((c) => c.id !== cardId);
  const dropIndex =
    targetCardId == null
      ? siblings.length
      : dropIndexFromEdge(siblings, targetCardId, edge === 'bottom');

  const before = dropIndex > 0 ? siblings[dropIndex - 1] : undefined;
  const after = dropIndex < siblings.length ? siblings[dropIndex] : undefined;
  if (before?.id === cardId || after?.id === cardId) return null;

  // No-op: dropping the card exactly where it already sits within its own list.
  if (fromListId === toListId) {
    const ordered = byPosition(args.cardsByListId(fromListId));
    const currentIndex = ordered.findIndex((c) => c.id === cardId);
    if (currentIndex !== -1) {
      const currentBefore = currentIndex > 0 ? ordered[currentIndex - 1] : undefined;
      const currentAfter =
        currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : undefined;
      if (
        (before?.id ?? '∅') === (currentBefore?.id ?? '∅') &&
        (after?.id ?? '∅') === (currentAfter?.id ?? '∅')
      ) {
        return null;
      }
    }
  }

  return {
    cardId,
    fromListId,
    toListId,
    beforeCardId: before?.id ?? null,
    afterCardId: after?.id ?? null,
    newPosition: safePositionBetween(before?.position ?? null, after?.position ?? null),
  };
}

/**
 * The plan for converting a Hızlı Not (DEM-205) into a card: which list it
 * lands in, the cards it sits between, and the computed `newPosition`. Unlike
 * {@link CardMovePlan} there is never a "no-op" — a quick note always becomes a
 * new card somewhere — so this never returns `null`. `newPosition` may still be
 * `null` if the fractional math fails for degenerate sibling positions; the
 * server then recomputes from `beforeCardId` / `afterCardId`.
 */
export type QuickNoteConvertPlan = {
  toListId: string;
  beforeCardId: string | null;
  afterCardId: string | null;
  newPosition: string | null;
};

/**
 * Build a {@link QuickNoteConvertPlan} for dropping a quick note relative to
 * `targetCardId` in `toListId` (`null` target ⇒ end of the column). The note is
 * not a card, so there is no dragged-item to exclude from `siblings` and no
 * self-drop / no-op case. `cardsByListId(listId)` returns that list's active
 * cards (any order — sorted here).
 */
export function planQuickNoteConvert(args: {
  toListId: string;
  /** Target card id under the cursor, or `null` for "end of the column". */
  targetCardId: string | null;
  /** Which edge of the target card the cursor is closest to. Ignored when `targetCardId` is `null`. */
  edge: CardEdge;
  cardsByListId: (listId: string) => readonly CardSibling[];
}): QuickNoteConvertPlan {
  const { toListId, targetCardId, edge } = args;
  const siblings = byPosition(args.cardsByListId(toListId));
  const dropIndex =
    targetCardId == null
      ? siblings.length
      : dropIndexFromEdge(siblings, targetCardId, edge === 'bottom');

  const before = dropIndex > 0 ? siblings[dropIndex - 1] : undefined;
  const after = dropIndex < siblings.length ? siblings[dropIndex] : undefined;

  return {
    toListId,
    beforeCardId: before?.id ?? null,
    afterCardId: after?.id ?? null,
    newPosition: safePositionBetween(before?.position ?? null, after?.position ?? null),
  };
}

/**
 * Build a {@link ListMovePlan} for dropping column `listId` relative to
 * `targetListId` (closest edge `left`/`right`) given the board's `position`-
 * sorted lists. Returns `null` when the move is a no-op.
 */
export function planListMove(args: {
  listId: string;
  targetListId: string;
  edge: ColumnEdge;
  lists: readonly CardSibling[];
}): ListMovePlan | null {
  const { listId, targetListId, edge } = args;
  if (listId === targetListId) return null;

  const ordered = byPosition(args.lists);
  const currentIndex = ordered.findIndex((l) => l.id === listId);
  const siblings = ordered.filter((l) => l.id !== listId);

  const dropIndex = dropIndexFromEdge(siblings, targetListId, edge === 'right');
  const before = dropIndex > 0 ? siblings[dropIndex - 1] : undefined;
  const after = dropIndex < siblings.length ? siblings[dropIndex] : undefined;
  if (before?.id === listId || after?.id === listId) return null;

  // No-op: the gap it would land in equals the gap it currently occupies.
  if (currentIndex !== -1) {
    const currentBefore = currentIndex > 0 ? ordered[currentIndex - 1] : undefined;
    const currentAfter = currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : undefined;
    if (
      (before?.id ?? '∅') === (currentBefore?.id ?? '∅') &&
      (after?.id ?? '∅') === (currentAfter?.id ?? '∅')
    ) {
      return null;
    }
  }

  return {
    listId,
    beforeListId: before?.id ?? null,
    afterListId: after?.id ?? null,
    newPosition: safePositionBetween(before?.position ?? null, after?.position ?? null),
  };
}

/**
 * Append-to-end plan for the "move to list" picker (the accessible alternative).
 * Puts `cardId` after the last *active* card in `toListId` (or at the head if
 * the list is empty). Returns `null` if the card is already last there.
 */
export function planCardMoveToListEnd(args: {
  cardId: string;
  fromListId: string;
  toListId: string;
  cardsByListId: (listId: string) => readonly CardSibling[];
}): CardMovePlan | null {
  const { cardId, fromListId, toListId } = args;
  const dest = byPosition(args.cardsByListId(toListId)).filter((c) => c.id !== cardId);
  const last = dest.length > 0 ? dest[dest.length - 1] : undefined;

  if (fromListId === toListId) {
    const all = byPosition(args.cardsByListId(fromListId));
    if (all.length > 0 && all[all.length - 1]?.id === cardId) return null; // already last
  }

  return {
    cardId,
    fromListId,
    toListId,
    beforeCardId: last?.id ?? null,
    afterCardId: null,
    newPosition: safePositionBetween(last?.position ?? null, null),
  };
}

/**
 * Plan for the column ⋮ "move left" / "move right" actions: swap `listId` past
 * its immediate neighbour in the given direction. Returns `null` at the edges
 * (no neighbour that way).
 */
export function planListMoveByOne(args: {
  listId: string;
  direction: 'left' | 'right';
  lists: readonly CardSibling[];
}): ListMovePlan | null {
  const ordered = byPosition(args.lists);
  const idx = ordered.findIndex((l) => l.id === args.listId);
  if (idx === -1) return null;

  if (args.direction === 'left') {
    if (idx === 0) return null;
    const prev = ordered[idx - 1]!;
    const prevPrev = idx - 2 >= 0 ? ordered[idx - 2] : undefined;
    const newPosition = safePositionBetween(prevPrev?.position ?? null, prev.position);
    return {
      listId: args.listId,
      beforeListId: prevPrev?.id ?? null,
      afterListId: prev.id,
      newPosition,
    };
  }
  // direction === 'right'
  if (idx >= ordered.length - 1) return null;
  const next = ordered[idx + 1]!;
  const nextNext = idx + 2 < ordered.length ? ordered[idx + 2] : undefined;
  const newPosition = safePositionBetween(next.position, nextNext?.position ?? null);
  return {
    listId: args.listId,
    beforeListId: next.id,
    afterListId: nextNext?.id ?? null,
    newPosition,
  };
}
