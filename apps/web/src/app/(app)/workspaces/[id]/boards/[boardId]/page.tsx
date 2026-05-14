'use client';

import { Suspense, use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { useBoardRealtime } from '@/lib/realtime';
import { BoardColumns } from './_components/board-columns';
import { countArchivedLists } from './_components/board-filter';
import type { BoardFilterLabel } from './_components/board-filter-bar';
import { BoardSkeleton } from './_components/board-skeleton';
import { BoardTopBar } from './_components/board-top-bar';
import { CardDetailRoute } from './_components/card-detail/card-detail-route';

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
  const board = useQuery(trpc.board.get.queryOptions({ boardId }));
  // Phase 5C (DEM-85) — keep `board.get` in sync with concurrent edits from
  // other users. Subscribes to `board:{boardId}` on mount, applies envelopes,
  // refetches on `seq` gap / reconnect. `connected` drives the disconnect banner.
  const realtime = useBoardRealtime(boardId);
  const [selectedLabelIds, setSelectedLabelIds] = useState<ReadonlySet<string>>(() => new Set());
  const [showArchivedLists, setShowArchivedLists] = useState(false);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <BoardTopBar
        boardId={boardId}
        workspaceId={workspaceId}
        title={b.title}
        archived={archived}
        isBoardAdmin={isBoardAdmin}
        filter={{
          labels: boardLabels,
          selectedLabelIds: liveSelectedLabelIds,
          onToggleLabel: toggleLabelFilter,
          onClearLabels: () => setSelectedLabelIds(new Set()),
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
        />
      </div>

      {/* Card detail modal — driven by `?card=<id>`; needs a Suspense boundary
          for `useSearchParams` (App Router). */}
      <Suspense fallback={null}>
        <CardDetailRoute boardId={boardId} />
      </Suspense>
    </div>
  );
}
