'use client';

import { Suspense, use } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { useBoardRealtime } from '@/lib/realtime';
import { BoardAccessRequestScreen } from './_components/board-access-request-screen';
import { BoardColumns } from './_components/board-columns';
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
  const accessContext = useQuery(trpc.board.accessRequests.context.queryOptions({ boardId }));
  const hasBoardAccess = accessContext.data?.access.hasAccess === true;
  const board = useQuery(trpc.board.get.queryOptions({ boardId }, { enabled: hasBoardAccess }));
  // Phase 5C (DEM-85) — keep `board.get` in sync with concurrent edits from
  // other users. Subscribes to `board:{boardId}` on mount, applies envelopes,
  // refetches on `seq` gap / reconnect. `connected` drives the disconnect banner.
  const realtime = useBoardRealtime(boardId, { enabled: hasBoardAccess && board.isSuccess });

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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <BoardTopBar
        boardId={boardId}
        workspaceId={workspaceId}
        title={b.title}
        archived={archived}
        isBoardAdmin={isBoardAdmin}
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
