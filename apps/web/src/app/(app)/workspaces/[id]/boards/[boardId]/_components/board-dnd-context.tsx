'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { BoardDnd } from './use-board-dnd';

/**
 * Shares the active {@link BoardDnd} instance (from `useBoardDnd` in
 * `BoardColumns`) with the column/card components without threading it through
 * every prop. Outside a provider it's `null` — so a `ListColumn` / `CardItem`
 * rendered in isolation (e.g. a unit test) simply has no drag-and-drop, instead
 * of needing the prop. Phase 3B — DEM-43.
 */
const BoardDndContext = createContext<BoardDnd | null>(null);

export function BoardDndProvider({ value, children }: { value: BoardDnd; children: ReactNode }) {
  return <BoardDndContext.Provider value={value}>{children}</BoardDndContext.Provider>;
}

/** The active board drag-and-drop, or `null` when there's no provider / it's disabled. */
export function useBoardDndContext(): BoardDnd | null {
  const dnd = useContext(BoardDndContext);
  return dnd?.enabled ? dnd : null;
}
