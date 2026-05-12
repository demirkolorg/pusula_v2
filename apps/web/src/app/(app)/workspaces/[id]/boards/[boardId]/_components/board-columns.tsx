'use client';

import { useMemo } from 'react';
import { boardRoleAtLeast, type BoardRole } from '@pusula/domain';
import { strings } from '@/lib/strings';
import { AddListColumn } from './add-list-column';
import { ListColumn, type BoardList } from './list-column';
import { type BoardCard } from './card-item';

type BoardColumnsProps = {
  boardId: string;
  /** The board's effective role for the viewer + its archived state. */
  board: { role: BoardRole; archivedAt: Date | string | null };
  /** Lists, archived included, already sorted by `position`. */
  lists: BoardList[];
  /** Active cards, already sorted by `position`. */
  cards: BoardCard[];
};

/**
 * Horizontal column layout for a board: one fixed-width column per list (in
 * `position` order, archived included), each with its cards grouped by `listId`
 * (the server already returns each list's cards in `position` order). A trailing
 * "add list" column is shown when the viewer may edit and the board is active.
 * Fixed widths keep the layout stable — no shift on hover/edit. Drag-and-drop is
 * Phase 3 (DEM-26) — not here.
 */
export function BoardColumns({ boardId, board, lists, cards }: BoardColumnsProps) {
  const boardActive = board.archivedAt == null;
  const canEdit = boardRoleAtLeast(board.role, 'member') && boardActive;

  const cardsByList = useMemo(() => {
    const map = new Map<string, BoardCard[]>();
    for (const card of cards) {
      const bucket = map.get(card.listId);
      if (bucket) bucket.push(card);
      else map.set(card.listId, [card]);
    }
    return map;
  }, [cards]);

  if (lists.length === 0 && !canEdit) {
    return <p className="text-muted-foreground text-sm">{strings.board.detail.emptyBoard}</p>;
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {lists.map((list) => (
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
  );
}
