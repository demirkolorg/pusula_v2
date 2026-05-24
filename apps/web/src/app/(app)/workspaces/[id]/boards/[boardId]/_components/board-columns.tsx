'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGridIcon } from 'lucide-react';
import type { RouterOutputs } from '@pusula/api';
import { boardRoleAtLeast, comparePosition, type BoardRole } from '@pusula/domain';
import { EmptyState } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { AddListColumn } from './add-list-column';
import { BoardDndProvider } from './board-dnd-context';
import {
  cardAssignedToUser,
  cardPassesDueDateFilter,
  filterCardsByLabels,
  filterVisibleLists,
  type DueDateFilter,
} from './board-filter';
import { ListColumn, type BoardList } from './list-column';
import { useBoardDnd } from './use-board-dnd';
import { type BoardCard, type BoardCardLabelOption, type BoardCardMemberOption } from './card-item';

type BoardColumnsProps = {
  boardId: string;
  /**
   * Faz 13G (DEM-263) — parent route'tan gelen workspaceId; `ListColumn`
   * (ve içindeki `ListReportsSubmenu`) composer scope'unu kurmak için
   * ihtiyaç duyar.
   */
  workspaceId: string;
  /** The board's effective role for the viewer + its archived state. */
  board: { role: BoardRole; archivedAt: Date | string | null };
  /** Lists, archived included, already sorted by `position`. */
  lists: BoardList[];
  /** Active cards, already sorted by `position` (each carries its `labels`). */
  cards: BoardCard[];
  /** Archived cards, fetched separately from `card.listArchived`. */
  archivedCards?: RouterOutputs['card']['listArchived'];
  /** Label ids selected in the board top-bar filter menu. */
  selectedLabelIds: ReadonlySet<string>;
  /** Due-date filter selected in the board top-bar filter menu. */
  dueDateFilter?: DueDateFilter;
  /**
   * When non-null, only cards assigned to this user id are shown — driven by the
   * board top-bar "assigned to me" toggle. `null` disables the filter (toggle off
   * or the viewer's identity not yet resolved).
   */
  assignedToMeUserId?: string | null;
  /** Whether archived lists are visible in the board strip. */
  showArchivedLists: boolean;
  /** Whether archived cards are visible inside currently visible lists. */
  showArchivedCards?: boolean;
  /** Board label palette used by each card context menu. */
  boardLabels?: BoardCardLabelOption[];
  /** Board members used by each card context menu. */
  boardMembers?: BoardCardMemberOption[];
  openFirstCardComposerToken?: number;
  openAddListComposerToken?: number;
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

/** Stable empty-cards fallback so a card-less list always gets the same
 * reference for its `cards` prop across renders (DEM-226 #2). */
const EMPTY_CARDS: readonly BoardCard[] = [];

function archivedCardToBoardCard(card: RouterOutputs['card']['listArchived'][number]): BoardCard {
  return {
    ...card,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    members: [],
    coverImage: null,
  };
}

/**
 * Horizontal column layout for a board: one fixed-width column per list (in
 * `position` order), each with its cards grouped by `listId` (the server already
 * returns each list's cards in `position` order). The board page owns filter
 * state and passes it in, so this surface starts directly with lists. A trailing
 * "add list" column is shown when the viewer may edit and the board is active.
 * Fixed widths keep the layout stable — no shift on
 * hover/edit. Drag-and-drop is wired here via `useBoardDnd` (Atlassian Pragmatic
 * DnD — Phase 3B, DEM-43): column reorder + card reorder / cross-list move.
 */
export function BoardColumns({
  boardId,
  workspaceId,
  board,
  lists,
  cards,
  archivedCards = [],
  selectedLabelIds,
  dueDateFilter = 'all',
  assignedToMeUserId = null,
  showArchivedLists,
  showArchivedCards = false,
  boardLabels = [],
  boardMembers = [],
  openFirstCardComposerToken = 0,
  openAddListComposerToken = 0,
}: BoardColumnsProps) {
  const boardActive = board.archivedAt == null;
  const canEdit = boardRoleAtLeast(board.role, 'member') && boardActive;

  const visibleLists = useMemo(
    () => filterVisibleLists(lists, showArchivedLists),
    [lists, showArchivedLists],
  );
  const firstActiveListId = visibleLists.find((list) => list.archivedAt == null)?.id ?? null;
  const normalizedArchivedCards = useMemo(
    () => (showArchivedCards ? archivedCards.map(archivedCardToBoardCard) : []),
    [archivedCards, showArchivedCards],
  );

  const cardsByList = useMemo(() => {
    const nowMs = Date.now();
    const filtered = [
      ...filterCardsByLabels(cards, selectedLabelIds),
      ...filterCardsByLabels(normalizedArchivedCards, selectedLabelIds),
    ]
      .filter((card) => cardPassesDueDateFilter(card, dueDateFilter, nowMs))
      .filter(
        (card) => assignedToMeUserId == null || cardAssignedToUser(card, assignedToMeUserId),
      )
      .sort((a, b) => comparePosition(a.position, b.position));
    const map = new Map<string, BoardCard[]>();
    for (const card of filtered) {
      const bucket = map.get(card.listId);
      if (bucket) bucket.push(card);
      else map.set(card.listId, [card]);
    }
    return map;
  }, [cards, normalizedArchivedCards, selectedLabelIds, dueDateFilter, assignedToMeUserId]);

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
        : dnd.dragState.kind === 'quick-note'
          ? dndCopy.announceQuickNoteGrabbed
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

  return (
    <BoardDndProvider value={dnd}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        {visibleLists.length === 0 && !canEdit ? (
          <EmptyState
            icon={<LayoutGridIcon className="size-8" />}
            message={strings.board.detail.emptyBoard}
          />
        ) : (
          <div
            ref={dnd.boardStripRef}
            className="pusula-scrollbar flex min-h-0 flex-1 items-start gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-4"
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
                  workspaceId={workspaceId}
                  list={list}
                  cards={cardsByList.get(list.id) ?? (EMPTY_CARDS as BoardCard[])}
                  canEdit={canEdit}
                  allLists={lists}
                  boardLabels={boardLabels}
                  boardMembers={boardMembers}
                  openAddCardComposerToken={
                    canEdit && list.id === firstActiveListId ? openFirstCardComposerToken : 0
                  }
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
            {canEdit && (
              <AddListColumn
                boardId={boardId}
                openAddListComposerToken={openAddListComposerToken}
              />
            )}
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
