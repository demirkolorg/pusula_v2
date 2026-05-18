/**
 * Shared drag-and-drop data shapes + type guards for the board screen
 * (Phase 3B — DEM-43). Pragmatic DnD carries plain `Record<string|symbol,
 * unknown>` payloads; these tag them so `monitorForElements` can branch on
 * "is this a card or a column?" with type safety.
 */
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';

/** `getInitialData` payload for a draggable card. */
export type CardDragData = {
  type: 'card';
  cardId: string;
  /** The list the card currently belongs to. */
  fromListId: string;
  position: string;
};

/** `getData` payload for a card-shaped drop target (the cards themselves). */
export type CardDropData = {
  type: 'card';
  cardId: string;
  listId: string;
  position: string;
};

/** `getData` payload for a column's cards area (the empty-column / end-of-list target). */
export type ListCardsDropData = {
  type: 'list-cards';
  listId: string;
};

/**
 * `getInitialData` payload for a draggable quick note (DEM-205 — the "Hızlı
 * Notlar" panel). A quick note is not a board card: it has no list/position,
 * only an id + its body text (carried for the native drag preview). Dropping it
 * onto a card / list-cards target converts it to a card via `quickNote.convertToCard`.
 */
export type QuickNoteDragData = {
  type: 'quick-note';
  noteId: string;
  content: string;
};

/** `getInitialData` payload for a draggable column. */
export type ListDragData = {
  type: 'list';
  listId: string;
  position: string;
};

/** `getData` payload for a column-shaped drop target (the columns themselves). */
export type ListDropData = {
  type: 'list';
  listId: string;
  position: string;
};

export function isCardDragData(data: Record<string | symbol, unknown>): data is CardDragData {
  return (
    data.type === 'card' && typeof data.cardId === 'string' && typeof data.fromListId === 'string'
  );
}

export function isCardDropData(data: Record<string | symbol, unknown>): data is CardDropData {
  return data.type === 'card' && typeof data.cardId === 'string' && typeof data.listId === 'string';
}

export function isListCardsDropData(
  data: Record<string | symbol, unknown>,
): data is ListCardsDropData {
  return data.type === 'list-cards' && typeof data.listId === 'string';
}

export function isListDragData(data: Record<string | symbol, unknown>): data is ListDragData {
  return (
    data.type === 'list' && typeof data.listId === 'string' && typeof data.position === 'string'
  );
}

export function isQuickNoteDragData(
  data: Record<string | symbol, unknown>,
): data is QuickNoteDragData {
  return data.type === 'quick-note' && typeof data.noteId === 'string';
}

export function isListDropData(data: Record<string | symbol, unknown>): data is ListDropData {
  return (
    data.type === 'list' && typeof data.listId === 'string' && typeof data.position === 'string'
  );
}

export type { Edge };

/** What's currently being dragged on the board (drives ghosts + drop indicators). */
export type BoardDragState =
  | { kind: 'idle' }
  | { kind: 'card'; cardId: string; fromListId: string }
  | { kind: 'list'; listId: string }
  | { kind: 'quick-note'; noteId: string };
