'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGridIcon } from 'lucide-react';
import { boardRoleAtLeast, type BoardRole } from '@pusula/domain';
import { Alert, AlertDescription, Button, EmptyState } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { AddListColumn } from './add-list-column';
import { BoardDndProvider } from './board-dnd-context';
import { BoardFilterBar, type BoardFilterLabel } from './board-filter-bar';
import { countArchivedLists, filterCardsByLabels, filterVisibleLists } from './board-filter';
import { ListColumn, type BoardList } from './list-column';
import { useBoardDnd } from './use-board-dnd';
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

function ListDropPlaceholderMarker({
  width,
  height,
}: {
  width: number | null;
  height: number | null;
}) {
  return (
    <div
      aria-hidden
      data-testid="list-drop-placeholder"
      className="border-primary/60 bg-primary/5 pointer-events-none box-border shrink-0 self-start rounded-lg border border-dashed"
      style={{ width: width ?? 288, height: height ?? 240 }}
    />
  );
}

/**
 * Horizontal column layout for a board: one fixed-width column per list (in
 * `position` order), each with its cards grouped by `listId` (the server already
 * returns each list's cards in `position` order). A filter bar above the columns
 * lets the viewer filter cards by label (a card shows if it has at least one
 * selected label — purely client-side over `board.get` data) and toggle archived
 * lists in/out of view (hidden by default; shown dimmed when on — restore lives
 * in each column). A trailing "add list" column is shown when the viewer may edit
 * and the board is active. Fixed widths keep the layout stable — no shift on
 * hover/edit. Drag-and-drop is wired here via `useBoardDnd` (Atlassian Pragmatic
 * DnD — Phase 3B, DEM-43): column reorder + card reorder / cross-list move.
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
    return [...byId.values()].sort(
      (a, b) => a.name.localeCompare(b.name, 'tr') || a.color.localeCompare(b.color),
    );
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

  // --- Drag-and-drop (Phase 3B — DEM-43) -----------------------------------
  // Enabled only when the viewer may edit and the board is active; the hook
  // re-reads `lists` / `cards` via refs, so its identity is stable per board.
  const dnd = useBoardDnd({ boardId, lists, cards, enabled: canEdit });
  const dndCopy = strings.board.dnd;
  const liveAnnouncement =
    dnd.dragState.kind === 'card'
      ? dndCopy.announceCardGrabbed
      : dnd.dragState.kind === 'list'
        ? dndCopy.announceListGrabbed
        : '';

  // Announce when a drag ends (item dropped). We watch dragState going from
  // non-idle → idle and emit announceDropped into a separate assertive region
  // so the "grabbed" message and "dropped" message don't clobber each other.
  const [dropAnnouncement, setDropAnnouncement] = useState('');
  const prevDragKindRef = useRef(dnd.dragState.kind);
  useEffect(() => {
    const prev = prevDragKindRef.current;
    const next = dnd.dragState.kind;
    prevDragKindRef.current = next;
    if (prev !== 'idle' && next === 'idle') {
      setDropAnnouncement(dndCopy.announceDropped);
      // Clear after a short delay so the region can re-announce on the next drop.
      const t = setTimeout(() => setDropAnnouncement(''), 2000);
      return () => clearTimeout(t);
    }
  }, [dnd.dragState.kind, dndCopy.announceDropped]);

  const showFilterBar = boardLabels.length > 0 || archivedListCount > 0;

  return (
    <BoardDndProvider value={dnd}>
      <div className="flex h-full min-h-0 flex-col gap-3">
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

        {dnd.error && (
          <Alert variant="destructive" className="flex items-center justify-between gap-3">
            <AlertDescription>{dnd.error}</AlertDescription>
            <Button type="button" variant="ghost" size="sm" onClick={dnd.clearError}>
              {strings.common.close}
            </Button>
          </Alert>
        )}

        {visibleLists.length === 0 && !canEdit ? (
          <EmptyState
            icon={<LayoutGridIcon className="size-8" />}
            message={strings.board.detail.emptyBoard}
          />
        ) : (
          <div
            ref={dnd.boardStripRef}
            className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto pb-4"
          >
            {visibleLists.map((list) => (
              <Fragment key={list.id}>
                {dnd.listPlaceholder?.targetListId === list.id &&
                  dnd.listPlaceholder.edge === 'left' && (
                    <ListDropPlaceholderMarker
                      width={dnd.listPlaceholder.width}
                      height={dnd.listPlaceholder.height}
                    />
                  )}
                <ListColumn
                  boardId={boardId}
                  list={list}
                  cards={cardsByList.get(list.id) ?? []}
                  canEdit={canEdit}
                  allLists={lists}
                />
                {dnd.listPlaceholder?.targetListId === list.id &&
                  dnd.listPlaceholder.edge === 'right' && (
                    <ListDropPlaceholderMarker
                      width={dnd.listPlaceholder.width}
                      height={dnd.listPlaceholder.height}
                    />
                  )}
              </Fragment>
            ))}
            {canEdit && <AddListColumn boardId={boardId} />}
          </div>
        )}

        {/* Best-effort screen-reader announcement of the drag state. */}
        <div aria-live="polite" className="sr-only" role="status">
          {liveAnnouncement}
        </div>
        {/* Drop announcement — assertive so it interrupts the grab message. */}
        <div aria-live="assertive" className="sr-only" role="status">
          {dropAnnouncement}
        </div>
      </div>
    </BoardDndProvider>
  );
}
