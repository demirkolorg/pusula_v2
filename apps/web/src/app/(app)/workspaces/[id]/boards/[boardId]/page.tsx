'use client';

import { Suspense, use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { boardRoleAtLeast } from '@pusula/domain';
import { Alert, AlertDescription, AlertTitle, boardBackgroundClass, cn } from '@pusula/ui';
import { useShortcutScope } from '@/lib/shortcuts';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { useBoardRealtime } from '@/lib/realtime';
import { BoardAccessRequestScreen } from './_components/board-access-request-screen';
import { BoardColumns } from './_components/board-columns';
import { countArchivedLists } from './_components/board-filter';
import type { BoardFilterLabel } from './_components/board-filter-bar';
import { BoardSkeleton } from './_components/board-skeleton';
import { BoardTopBar } from './_components/board-top-bar';
import { CardDetailRoute } from './_components/card-detail/card-detail-route';
import { ShortcutHelpDialog } from './_components/shortcut-help-dialog';

function BoardShortcutScope({
  enabled,
  canEditBoardContent,
  hasActiveList,
  onOpenBoardSearch,
  onOpenHelp,
  onOpenFirstCardComposer,
  onOpenAddListComposer,
}: {
  enabled: boolean;
  canEditBoardContent: boolean;
  hasActiveList: boolean;
  onOpenBoardSearch: () => void;
  onOpenHelp: () => void;
  onOpenFirstCardComposer: () => void;
  onOpenAddListComposer: () => void;
}) {
  const searchParams = useSearchParams();
  const cardModalOpen = searchParams.has('card');

  useShortcutScope({
    scope: 'board',
    enabled: enabled && !cardModalOpen,
    bindings: [
      {
        id: 'board-search',
        match: (event) => event.key === '/' && !event.ctrlOrMeta && !event.alt,
        run: onOpenBoardSearch,
      },
      {
        id: 'shortcut-help',
        match: (event) => event.key === '?' && !event.ctrlOrMeta && !event.alt,
        run: onOpenHelp,
      },
      {
        id: 'new-card',
        match: (event) => event.key === 'n' && !event.shift && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEditBoardContent && hasActiveList) onOpenFirstCardComposer();
        },
      },
      {
        id: 'new-list-shift-n',
        match: (event) => event.key === 'n' && event.shift && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEditBoardContent) onOpenAddListComposer();
        },
      },
      {
        id: 'new-list-l',
        match: (event) => event.key === 'l' && !event.shift && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEditBoardContent) onOpenAddListComposer();
        },
      },
    ],
  });

  return null;
}

/**
 * Board detail (read-only CRUD, no drag-and-drop yet). One `board.get` call
 * returns `{ board (with the viewer's effective role), lists (archived included,
 * position-sorted), cards (active only, position-sorted, with labels + metadata
 * counts + members) }`. List/card CRUD goes through `list.*` / `card.*` and then
 * invalidates `board.get` — no optimistic UI yet (Phase 4 — DEM-27).
 * Drag-and-drop is Phase 3 (DEM-26). Authorization is server-side; the UI only
 * hides actions the role can't perform. Phase 2.7B (DEM-63) is the visual polish
 * pass — top bar + columns + card metadata + skeleton.
 */
export default function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const { id: workspaceId, boardId } = use(params);
  const trpc = useTRPC();
  const accessContext = useQuery(trpc.board.accessRequests.context.queryOptions({ boardId }));
  const hasBoardAccess = accessContext.data?.access.hasAccess === true;
  const board = useQuery(trpc.board.get.queryOptions({ boardId }, { enabled: hasBoardAccess }));
  const labelList = useQuery(
    trpc.label.list.queryOptions({ boardId }, { enabled: hasBoardAccess }),
  );
  const boardMembers = useQuery(
    trpc.board.members.list.queryOptions({ boardId }, { enabled: hasBoardAccess }),
  );
  // Phase 5C (DEM-85) — keep `board.get` in sync with concurrent edits from
  // other users. Subscribes to `board:{boardId}` on mount, applies envelopes,
  // refetches on `seq` gap / reconnect. `connected` drives the disconnect banner;
  // `joined` marks deterministic room readiness for e2e sync tests.
  const realtime = useBoardRealtime(boardId, { enabled: hasBoardAccess && board.isSuccess });
  const [selectedLabelIds, setSelectedLabelIds] = useState<ReadonlySet<string>>(() => new Set());
  const [showArchivedLists, setShowArchivedLists] = useState(false);
  const [boardSearchOpen, setBoardSearchOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [openFirstCardComposerToken, setOpenFirstCardComposerToken] = useState(0);
  const [openAddListComposerToken, setOpenAddListComposerToken] = useState(0);
  const boardCardsForFilters = board.data?.cards ?? [];
  const boardListsForFilters = board.data?.lists ?? [];

  const boardLabels = useMemo<BoardFilterLabel[]>(() => {
    const byId = new Map<string, BoardFilterLabel>();
    for (const card of boardCardsForFilters) {
      for (const label of card.labels) {
        if (!byId.has(label.labelId)) {
          byId.set(label.labelId, { id: label.labelId, name: label.name, color: label.color });
        }
      }
    }
    return [...byId.values()].sort(
      (a, b) => a.name.localeCompare(b.name, 'tr') || a.color.localeCompare(b.color),
    );
  }, [boardCardsForFilters]);

  const liveSelectedLabelIds = useMemo<ReadonlySet<string>>(() => {
    if (selectedLabelIds.size === 0) return selectedLabelIds;
    const live = new Set<string>();
    for (const id of selectedLabelIds) {
      if (boardLabels.some((label) => label.id === id)) live.add(id);
    }
    return live;
  }, [selectedLabelIds, boardLabels]);

  useEffect(() => {
    if (liveSelectedLabelIds.size !== selectedLabelIds.size) {
      setSelectedLabelIds(liveSelectedLabelIds);
    }
  }, [liveSelectedLabelIds, selectedLabelIds.size]);

  const toggleLabelFilter = (labelId: string) =>
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });

  const archivedListCount = useMemo(
    () => countArchivedLists(boardListsForFilters),
    [boardListsForFilters],
  );

  const backLink = (
    <Link
      href={`/workspaces/${workspaceId}`}
      className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 rounded-md text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <ArrowLeftIcon className="size-3.5" />
      {strings.board.detail.backToWorkspace}
    </Link>
  );

  if (accessContext.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {backLink}
        <BoardSkeleton />
      </div>
    );
  }

  if (accessContext.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {backLink}
        <Alert variant="destructive">
          <AlertTitle>{strings.board.detail.accessContextLoadErrorTitle}</AlertTitle>
          <AlertDescription>
            {accessContext.error.message || strings.common.unknownError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!accessContext.data.access.hasAccess) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {backLink}
        <BoardAccessRequestScreen boardId={boardId} context={accessContext.data} />
      </div>
    );
  }

  if (board.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {backLink}
        <BoardSkeleton />
      </div>
    );
  }

  if (board.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
        {backLink}
        <Alert variant="destructive">
          <AlertTitle>{strings.board.detail.loadErrorTitle}</AlertTitle>
          <AlertDescription>{board.error.message || strings.common.unknownError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { board: b, lists, cards } = board.data;
  const archived = b.archivedAt != null;
  const isBoardAdmin = b.role === 'admin';
  const canEditBoardContent = boardRoleAtLeast(b.role, 'member') && !archived;
  const hasActiveList = lists.some((list) => list.archivedAt == null);

  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col', boardBackgroundClass(b.background ?? null))}
      data-realtime-board-id={boardId}
      data-realtime-board-joined={realtime.joined ? 'true' : 'false'}
    >
      <BoardTopBar
        boardId={boardId}
        workspaceId={workspaceId}
        title={b.title}
        icon={b.icon}
        background={b.background ?? null}
        archived={archived}
        isBoardAdmin={isBoardAdmin}
        boardSearchOpen={boardSearchOpen}
        onBoardSearchOpenChange={setBoardSearchOpen}
        filter={{
          labels: boardLabels,
          selectedLabelIds: liveSelectedLabelIds,
          onToggleLabel: toggleLabelFilter,
          onClearLabels: () => setSelectedLabelIds(new Set()),
        }}
        archive={{
          lists,
          canEdit: canEditBoardContent,
          showArchivedLists,
          onToggleArchivedLists: () => setShowArchivedLists((value) => !value),
          archivedListCount,
        }}
      />

      {!realtime.connected && (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-dashed border-amber-500/50 bg-amber-500/10 px-4 py-1 text-center text-xs text-amber-700 dark:text-amber-300"
        >
          {strings.realtime.disconnected}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <BoardColumns
          boardId={boardId}
          board={{ role: b.role, archivedAt: b.archivedAt }}
          lists={lists}
          cards={cards}
          selectedLabelIds={liveSelectedLabelIds}
          showArchivedLists={showArchivedLists}
          boardLabels={labelList.data ?? boardLabels}
          boardMembers={(boardMembers.data ?? []).map((member) => ({
            userId: member.userId,
            name: member.name,
          }))}
          openFirstCardComposerToken={openFirstCardComposerToken}
          openAddListComposerToken={openAddListComposerToken}
        />
      </div>

      {/* Card detail modal — driven by `?card=<id>`; needs a Suspense boundary
          for `useSearchParams` (App Router). */}
      <Suspense fallback={null}>
        <BoardShortcutScope
          enabled
          canEditBoardContent={canEditBoardContent}
          hasActiveList={hasActiveList}
          onOpenBoardSearch={() => setBoardSearchOpen(true)}
          onOpenHelp={() => setShortcutHelpOpen(true)}
          onOpenFirstCardComposer={() => setOpenFirstCardComposerToken((value) => value + 1)}
          onOpenAddListComposer={() => setOpenAddListComposerToken((value) => value + 1)}
        />
        <CardDetailRoute boardId={boardId} />
      </Suspense>
      <ShortcutHelpDialog
        open={shortcutHelpOpen}
        onOpenChange={setShortcutHelpOpen}
        includeCardModal={false}
      />
    </div>
  );
}
