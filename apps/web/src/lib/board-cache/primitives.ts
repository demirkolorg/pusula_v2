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

import { comparePosition } from '@pusula/domain';

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
  return [...items].sort((a, b) => comparePosition(a.position, b.position));
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
 *
 * Faz 4 review fix (W2 DEM-79): `patch`'in tip imzasından `listId` exclude
 * edildi — list değişimi tasarım gereği yalnız `applyCardMove` üzerinden yapılır
 * (cross-list move re-sort gerektirir; `applyCardPatch` non-position patch
 * branch'inde re-sort yapmaz). Tip seviyesinde yanlış kullanım engellendi.
 */
export function applyCardPatch<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  cardId: string,
  patch: Partial<Omit<TCard, 'listId'>>,
): BoardCacheData<TBoard, TList, TCard> {
  if (!data.cards.some((c) => c.id === cardId)) return data;
  const mapped = data.cards.map((c) =>
    c.id === cardId ? ({ ...c, ...(patch as Partial<TCard>) }) : c,
  );
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
 *
 * Faz 4 review fix (W3 DEM-79): `applyCardArchive` ile `applyCardRemove`
 * implementasyon olarak aynı — fakat ayrı sembol tutulur: çağıran kod
 * "archive" niyeti ile "permanently delete" niyetini ayırt edebilsin (Faz 5C
 * realtime event handler `card.archived` → `applyCardArchive`, hypothetical
 * `card.deleted` → `applyCardRemove`). `board.get` bir gün arşivli kartları da
 * filtre opsiyonuyla döndürürse (Faz 8 board filtre UI), bu fonksiyonun ayrı
 * implementasyonu gerekecek.
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

/**
 * Remove a list by id (Faz 17 — `list.delete` kalıcı silme). Unlike
 * `applyListArchive` (which patches `archivedAt`), the list disappears from
 * the cache entirely. Server-side gate only permits this for *empty* lists, so
 * the cards filter is a no-op by contract; kept defensively for the realtime
 * path (a stale optimistic cache could still hold a card whose list was just
 * deleted by another client).
 */
export function applyListRemove<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  listId: string,
): BoardCacheData<TBoard, TList, TCard> {
  if (!data.lists.some((l) => l.id === listId)) return data;
  const lists = data.lists.filter((l) => l.id !== listId);
  const cards = data.cards.some((c) => c.listId === listId)
    ? data.cards.filter((c) => c.listId !== listId)
    : data.cards;
  return { ...data, lists, cards };
}

/** Patch the `board.*` fields (shallow-merge). */
export function applyBoardPatch<TBoard, TList extends ListLike, TCard extends CardLike>(
  data: BoardCacheData<TBoard, TList, TCard>,
  patch: Partial<TBoard>,
): BoardCacheData<TBoard, TList, TCard> {
  return { ...data, board: { ...data.board, ...patch } };
}

// --- Workspace board list (`board.list({ workspaceId })`) transforms ---------
//
// These operate on the *array* cache of `BoardSummary`s shown on the workspace
// screen — separate from the `board.get` tree above. `board.archive` filters
// out the archived board on the server side (only active boards are listed),
// so the optimistic counterpart removes it; restore inserts. Patch handles
// rename / cover updates that surface in the summary.

/** Minimum shape the workspace-list transforms touch. */
type BoardSummaryLike = { id: string };

/** Append a board to the workspace list. No-op if a board with the same id is already there. */
export function applyBoardSummaryAdd<T extends BoardSummaryLike>(
  boards: readonly T[],
  board: T,
): readonly T[] {
  if (boards.some((b) => b.id === board.id)) return boards;
  return [...boards, board];
}

/** Remove a board from the workspace list by id. No-op if not present. */
export function applyBoardSummaryRemove<T extends BoardSummaryLike>(
  boards: readonly T[],
  boardId: string,
): readonly T[] {
  if (!boards.some((b) => b.id === boardId)) return boards;
  return boards.filter((b) => b.id !== boardId);
}

/** Shallow-merge `patch` onto the board summary by id. No-op if not present. */
export function applyBoardSummaryPatch<T extends BoardSummaryLike>(
  boards: readonly T[],
  boardId: string,
  patch: Partial<T>,
): readonly T[] {
  if (!boards.some((b) => b.id === boardId)) return boards;
  return boards.map((b) => (b.id === boardId ? { ...b, ...patch } : b));
}

// --- Card detail subresource list transforms (Phase 6C) ---------------------

type RowWithId = { id: string };
type RowWithLabelId = { labelId: string };
type RowWithUserId = { userId: string };
type RowWithOptionalRole = RowWithUserId & { role?: unknown };
type ChecklistLike<TItem extends RowWithId & { position: string }> = {
  id: string;
  position: string;
  items: TItem[];
};
type ChecklistItemOf<TChecklist extends ChecklistLike<RowWithId & { position: string }>> =
  TChecklist['items'][number];

export function applyCommentAdd<T extends RowWithId>(
  comments: readonly T[],
  comment: T,
): readonly T[] {
  if (comments.some((c) => c.id === comment.id)) return comments;
  return [comment, ...comments];
}

export function applyCommentPatch<T extends RowWithId>(
  comments: readonly T[],
  commentId: string,
  patch: Partial<T>,
): readonly T[] {
  if (!comments.some((c) => c.id === commentId)) return comments;
  return comments.map((c) => (c.id === commentId ? { ...c, ...patch } : c));
}

export function applyCommentSoftDelete<T extends RowWithId & { deletedAt: unknown }>(
  comments: readonly T[],
  commentId: string,
  deletedAt: T['deletedAt'],
): readonly T[] {
  return applyCommentPatch(comments, commentId, { deletedAt } as Partial<T>);
}

export function applyChecklistAdd<T extends { id: string; position: string }>(
  checklists: readonly T[],
  checklist: T,
): readonly T[] {
  if (checklists.some((c) => c.id === checklist.id)) return checklists;
  return sortByPosition([...checklists, checklist]);
}

export function applyChecklistPatch<T extends { id: string; position: string }>(
  checklists: readonly T[],
  checklistId: string,
  patch: Partial<T>,
): readonly T[] {
  if (!checklists.some((c) => c.id === checklistId)) return checklists;
  const mapped = checklists.map((c) => (c.id === checklistId ? { ...c, ...patch } : c));
  return 'position' in patch ? sortByPosition(mapped) : mapped;
}

export function applyChecklistRemove<T extends RowWithId>(
  checklists: readonly T[],
  checklistId: string,
): readonly T[] {
  if (!checklists.some((c) => c.id === checklistId)) return checklists;
  return checklists.filter((c) => c.id !== checklistId);
}

export function applyChecklistItemAdd<
  TChecklist extends ChecklistLike<RowWithId & { position: string }>,
>(
  checklists: readonly TChecklist[],
  checklistId: string,
  item: ChecklistItemOf<TChecklist>,
): readonly TChecklist[] {
  const current = checklists.find((c) => c.id === checklistId);
  if (!current || current.items.some((i) => i.id === item.id)) return checklists;
  return checklists.map((c) =>
    c.id === checklistId ? ({ ...c, items: sortByPosition([...c.items, item]) } as TChecklist) : c,
  );
}

export function applyChecklistItemPatch<
  TChecklist extends ChecklistLike<RowWithId & { position: string }>,
>(
  checklists: readonly TChecklist[],
  checklistId: string,
  itemId: string,
  patch: Partial<ChecklistItemOf<TChecklist>>,
): readonly TChecklist[] {
  const current = checklists.find((c) => c.id === checklistId);
  if (!current || !current.items.some((i) => i.id === itemId)) return checklists;
  return checklists.map((c) => {
    if (c.id !== checklistId) return c;
    const mapped = c.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
    const items = 'position' in patch ? sortByPosition(mapped) : mapped;
    return { ...c, items } as TChecklist;
  });
}

export function applyChecklistItemToggle<
  TChecklist extends ChecklistLike<RowWithId & { position: string }>,
>(
  checklists: readonly TChecklist[],
  checklistId: string,
  itemId: string,
  patch: Partial<ChecklistItemOf<TChecklist>>,
): readonly TChecklist[] {
  return applyChecklistItemPatch(checklists, checklistId, itemId, patch);
}

export function applyChecklistItemRemove<
  TChecklist extends ChecklistLike<RowWithId & { position: string }>,
>(checklists: readonly TChecklist[], checklistId: string, itemId: string): readonly TChecklist[] {
  const current = checklists.find((c) => c.id === checklistId);
  if (!current || !current.items.some((i) => i.id === itemId)) return checklists;
  return checklists.map((c) =>
    c.id === checklistId
      ? ({ ...c, items: c.items.filter((i) => i.id !== itemId) } as TChecklist)
      : c,
  );
}

export function applyCardLabelAdd<T extends RowWithLabelId>(
  labels: readonly T[],
  label: T,
): readonly T[] {
  if (labels.some((l) => l.labelId === label.labelId)) return labels;
  return [...labels, label];
}

export function applyCardLabelRemove<T extends RowWithLabelId>(
  labels: readonly T[],
  labelId: string,
): readonly T[] {
  if (!labels.some((l) => l.labelId === labelId)) return labels;
  return labels.filter((l) => l.labelId !== labelId);
}

function sameCardMember<T extends RowWithUserId>(
  member: T,
  userId: string,
  role?: unknown,
): boolean {
  if (role !== undefined && 'role' in member) {
    return member.userId === userId && (member as RowWithOptionalRole).role === role;
  }
  return member.userId === userId;
}

export function applyCardMemberAdd<T extends RowWithUserId>(
  members: readonly T[],
  member: T,
): readonly T[] {
  const role = 'role' in member ? (member as RowWithOptionalRole).role : undefined;
  if (members.some((m) => sameCardMember(m, member.userId, role))) return members;
  return [...members, member];
}

export function applyCardMemberRemove<T extends RowWithUserId>(
  members: readonly T[],
  userId: string,
  role?: unknown,
): readonly T[] {
  if (!members.some((m) => sameCardMember(m, userId, role))) return members;
  return members.filter((m) => !sameCardMember(m, userId, role));
}

export function applyBoardLabelAdd<T extends RowWithId>(
  labels: readonly T[],
  label: T,
): readonly T[] {
  if (labels.some((l) => l.id === label.id)) return labels;
  return [...labels, label];
}

export function applyBoardLabelPatch<T extends RowWithId>(
  labels: readonly T[],
  labelId: string,
  patch: Partial<T>,
): readonly T[] {
  if (!labels.some((l) => l.id === labelId)) return labels;
  return labels.map((l) => (l.id === labelId ? { ...l, ...patch } : l));
}

export function applyBoardLabelRemove<T extends RowWithId>(
  labels: readonly T[],
  labelId: string,
): readonly T[] {
  if (!labels.some((l) => l.id === labelId)) return labels;
  return labels.filter((l) => l.id !== labelId);
}

export function applyBoardMemberAdd<T extends RowWithUserId>(
  members: readonly T[],
  member: T,
): readonly T[] {
  if (members.some((m) => m.userId === member.userId)) return members;
  return [...members, member];
}

export function applyBoardMemberRolePatch<T extends RowWithUserId & { role: unknown }>(
  members: readonly T[],
  userId: string,
  role: T['role'],
): readonly T[] {
  if (!members.some((m) => m.userId === userId)) return members;
  return members.map((m) => (m.userId === userId ? { ...m, role } : m));
}

export function applyBoardMemberRemove<T extends RowWithUserId>(
  members: readonly T[],
  userId: string,
): readonly T[] {
  if (!members.some((m) => m.userId === userId)) return members;
  return members.filter((m) => m.userId !== userId);
}
