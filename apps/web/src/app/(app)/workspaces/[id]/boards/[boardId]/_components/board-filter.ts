/**
 * Pure client-side filtering helpers for the board screen (Phase 2.5E — DEM-54):
 * a label filter (a card passes if it has *at least one* of the selected labels)
 * and an archived-lists toggle. Kept framework-free so they're trivially
 * unit-testable in isolation.
 */

type CardWithLabels = { labels: { labelId: string }[] };
type CardWithDue = { dueAt: Date | string | null };
type CardWithMembers = { members: { userId: string; role: 'assignee' | 'watcher' }[] };
type ListWithArchive = { archivedAt: Date | string | null };

/**
 * Whether `card` passes the label filter. With no labels selected every card
 * passes; otherwise the card passes iff it carries at least one of the selected
 * label ids.
 */
export function cardPassesLabelFilter(
  card: CardWithLabels,
  selectedLabelIds: ReadonlySet<string>,
): boolean {
  if (selectedLabelIds.size === 0) return true;
  return card.labels.some((l) => selectedLabelIds.has(l.labelId));
}

/**
 * Filter a list of cards by the selected label ids (see {@link cardPassesLabelFilter}).
 */
export function filterCardsByLabels<T extends CardWithLabels>(
  cards: readonly T[],
  selectedLabelIds: ReadonlySet<string>,
): T[] {
  if (selectedLabelIds.size === 0) return [...cards];
  return cards.filter((card) => cardPassesLabelFilter(card, selectedLabelIds));
}

/**
 * Whether `card` is assigned to `userId` — i.e. it carries a member entry with
 * that user id and the `assignee` role. Watchers do **not** count as assignees,
 * so a card someone only watches never passes this filter.
 */
export function cardAssignedToUser(card: CardWithMembers, userId: string): boolean {
  return card.members.some((m) => m.userId === userId && m.role === 'assignee');
}

/**
 * Filter a list of cards down to those assigned to `userId` (see
 * {@link cardAssignedToUser}). A `null` `userId` disables the filter and returns
 * a copy of every card — the board screen passes `null` whenever the
 * "assigned to me" toggle is off or the viewer's identity is not yet known.
 */
export function filterCardsByAssignee<T extends CardWithMembers>(
  cards: readonly T[],
  userId: string | null,
): T[] {
  if (userId == null) return [...cards];
  return cards.filter((card) => cardAssignedToUser(card, userId));
}

/**
 * Due-date filter selection. Single-select (radio): a card passes exactly one
 * filter at a time. `all` disables the filter. The non-trivial windows are
 * measured *forward from now* (Trello-style), so they overlap by design:
 * `day` ⊂ `week` ⊂ `month`.
 */
export type DueDateFilter = 'all' | 'overdue' | 'day' | 'week' | 'month' | 'none';

/** Filter values in the order the menu renders them. */
export const DUE_DATE_FILTERS: readonly DueDateFilter[] = [
  'all',
  'overdue',
  'day',
  'week',
  'month',
  'none',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Forward window length (in days) for the bounded due-date filters. */
const DUE_WINDOW_DAYS: Partial<Record<DueDateFilter, number>> = {
  day: 1,
  week: 7,
  month: 30,
};

/**
 * Whether `card` passes the due-date `filter` evaluated at `nowMs`. `all` passes
 * every card; `none` passes only cards without a due date; `overdue` passes
 * cards whose due date is in the past; `day`/`week`/`month` pass cards due
 * within the next 1/7/30 days. An unparseable `dueAt` never passes a date-bound
 * filter.
 */
export function cardPassesDueDateFilter(
  card: CardWithDue,
  filter: DueDateFilter,
  nowMs: number,
): boolean {
  if (filter === 'all') return true;
  if (card.dueAt == null) return filter === 'none';
  if (filter === 'none') return false;

  const dueMs = (card.dueAt instanceof Date ? card.dueAt : new Date(card.dueAt)).getTime();
  if (Number.isNaN(dueMs)) return false;

  if (filter === 'overdue') return dueMs < nowMs;

  const windowDays = DUE_WINDOW_DAYS[filter];
  if (windowDays == null) return false;
  return dueMs >= nowMs && dueMs <= nowMs + windowDays * DAY_MS;
}

/**
 * Filter a list of cards by the selected due-date filter (see
 * {@link cardPassesDueDateFilter}). `all` returns a copy of every card.
 */
export function filterCardsByDueDate<T extends CardWithDue>(
  cards: readonly T[],
  filter: DueDateFilter,
  nowMs: number,
): T[] {
  if (filter === 'all') return [...cards];
  return cards.filter((card) => cardPassesDueDateFilter(card, filter, nowMs));
}

/** A list is archived iff its `archivedAt` is non-null. */
export function isListArchived(list: ListWithArchive): boolean {
  return list.archivedAt != null;
}

/**
 * Filter the visible lists: when `showArchived` is `false`, archived lists are
 * hidden; otherwise all lists are shown (in their given order).
 */
export function filterVisibleLists<T extends ListWithArchive>(
  lists: readonly T[],
  showArchived: boolean,
): T[] {
  if (showArchived) return [...lists];
  return lists.filter((list) => !isListArchived(list));
}

/** Count of archived lists in the array. */
export function countArchivedLists(lists: readonly ListWithArchive[]): number {
  return lists.reduce((n, list) => (isListArchived(list) ? n + 1 : n), 0);
}
