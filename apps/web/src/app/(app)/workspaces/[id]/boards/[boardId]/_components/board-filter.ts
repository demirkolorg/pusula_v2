/**
 * Pure client-side filtering helpers for the board screen (Phase 2.5E — DEM-54):
 * a label filter (a card passes if it has *at least one* of the selected labels)
 * and an archived-lists toggle. Kept framework-free so they're trivially
 * unit-testable in isolation.
 */

type CardWithLabels = { labels: { labelId: string }[] };
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
