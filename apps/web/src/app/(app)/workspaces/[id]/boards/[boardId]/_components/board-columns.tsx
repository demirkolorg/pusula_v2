'use client';

import { useMemo, useState } from 'react';
import { LayoutGridIcon } from 'lucide-react';
import { boardRoleAtLeast, type BoardRole } from '@pusula/domain';
import { EmptyState } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { AddListColumn } from './add-list-column';
import { BoardFilterBar, type BoardFilterLabel } from './board-filter-bar';
import {
  countArchivedLists,
  filterCardsByLabels,
  filterVisibleLists,
} from './board-filter';
import { ListColumn, type BoardList } from './list-column';
import { type BoardCard } from './card-item';

type BoardColumnsProps = {
  boardId: string;
  /** The board's effective role for the viewer + its archived state. */
  board: { role: BoardRole; archivedAt: Date | string | null };
  /** Lists, archived included, already sorted by `position`. */
  lists: BoardList[];
  /** Active cards, already sorted by `position` (each carries its `labels`). */
  cards: BoardCard[];
};

/**
 * Horizontal column layout for a board: one fixed-width column per list (in
 * `position` order), each with its cards grouped by `listId` (the server already
 * returns each list's cards in `position` order). A filter bar above the columns
 * lets the viewer filter cards by label (a card shows if it has at least one
 * selected label — purely client-side over `board.get` data) and toggle archived
 * lists in/out of view (hidden by default; shown dimmed when on — restore lives
 * in each column). A trailing "add list" column is shown when the viewer may edit
 * and the board is active. Fixed widths keep the layout stable — no shift on
 * hover/edit. Drag-and-drop is Phase 3 (DEM-26) — not here.
 */
export function BoardColumns({ boardId, board, lists, cards }: BoardColumnsProps) {
  const boardActive = board.archivedAt == null;
  const canEdit = boardRoleAtLeast(board.role, 'member') && boardActive;

  // --- Filter state (local — not URL-persisted this phase) -----------------
  const [selectedLabelIds, setSelectedLabelIds] = useState<ReadonlySet<string>>(() => new Set());
  const [showArchivedLists, setShowArchivedLists] = useState(false);

  // The board's label palette, derived from the cards' attached labels (the
  // board screen doesn't fetch `label.list` — `board.get` carries enough).
  const boardLabels = useMemo<BoardFilterLabel[]>(() => {
    const byId = new Map<string, BoardFilterLabel>();
    for (const card of cards) {
      for (const label of card.labels) {
        if (!byId.has(label.labelId)) {
          byId.set(label.labelId, { id: label.labelId, name: label.name, color: label.color });
        }
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.color.localeCompare(b.color));
  }, [cards]);

  // Drop any selected label ids that no longer exist (e.g. a label was deleted
  // and `board.get` refetched) so the filter doesn't get stuck.
  const liveSelectedLabelIds = useMemo<ReadonlySet<string>>(() => {
    if (selectedLabelIds.size === 0) return selectedLabelIds;
    const live = new Set<string>();
    for (const id of selectedLabelIds) if (boardLabels.some((l) => l.id === id)) live.add(id);
    return live;
  }, [selectedLabelIds, boardLabels]);

  const archivedListCount = useMemo(() => countArchivedLists(lists), [lists]);
  const visibleLists = useMemo(
    () => filterVisibleLists(lists, showArchivedLists),
    [lists, showArchivedLists],
  );

  const cardsByList = useMemo(() => {
    const filtered = filterCardsByLabels(cards, liveSelectedLabelIds);
    const map = new Map<string, BoardCard[]>();
    for (const card of filtered) {
      const bucket = map.get(card.listId);
      if (bucket) bucket.push(card);
      else map.set(card.listId, [card]);
    }
    return map;
  }, [cards, liveSelectedLabelIds]);

  const toggleLabel = (labelId: string) =>
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });

  const showFilterBar = boardLabels.length > 0 || archivedListCount > 0;

  return (
    <div className="flex flex-col gap-3">
      {showFilterBar && (
        <BoardFilterBar
          labels={boardLabels}
          selectedLabelIds={liveSelectedLabelIds}
          onToggleLabel={toggleLabel}
          onClearLabels={() => setSelectedLabelIds(new Set())}
          showArchivedLists={showArchivedLists}
          onToggleArchivedLists={() => setShowArchivedLists((v) => !v)}
          archivedListCount={archivedListCount}
        />
      )}

      {visibleLists.length === 0 && !canEdit ? (
        <EmptyState
          icon={<LayoutGridIcon className="size-8" />}
          message={strings.board.detail.emptyBoard}
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {visibleLists.map((list) => (
            <ListColumn
              key={list.id}
              boardId={boardId}
              list={list}
              cards={cardsByList.get(list.id) ?? []}
              canEdit={canEdit}
            />
          ))}
          {canEdit && <AddListColumn boardId={boardId} />}
        </div>
      )}
    </div>
  );
}
