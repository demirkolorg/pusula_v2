'use client';

import { Suspense, use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle, Badge } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { ArchiveBoardDialog } from './_components/archive-board-dialog';
import { BoardColumns } from './_components/board-columns';
import { CardDetailRoute } from './_components/card-detail/card-detail-route';
import { RenameBoardForm } from './_components/rename-board-form';

/**
 * Board detail (Phase 2D — read-only CRUD, no drag-and-drop). One `board.get`
 * call returns `{ board (with the viewer's effective role), lists (archived
 * included, position-sorted), cards (active only, position-sorted) }`. List/card
 * CRUD goes through `list.*` / `card.*` and then invalidates `board.get` — no
 * optimistic UI yet (Phase 4 — DEM-27). Drag-and-drop is Phase 3 (DEM-26).
 * Authorization is server-side; this only hides actions the role can't perform.
 */
export default function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const { id: workspaceId, boardId } = use(params);
  const trpc = useTRPC();
  const board = useQuery(trpc.board.get.queryOptions({ boardId }));

  const backLink = (
    <Link
      href={`/workspaces/${workspaceId}`}
      className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
    >
      ← {strings.board.detail.backToWorkspace}
    </Link>
  );

  if (board.isPending) {
    return (
      <div className="space-y-6">
        {backLink}
        <p className="text-muted-foreground text-sm">{strings.board.detail.loading}</p>
      </div>
    );
  }

  if (board.isError) {
    return (
      <div className="space-y-6">
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
    <div className="space-y-6">
      {backLink}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          {isBoardAdmin && !archived ? (
            <RenameBoardForm boardId={boardId} title={b.title} />
          ) : (
            <h1 className="text-xl font-semibold tracking-tight">{b.title}</h1>
          )}
          {archived && <Badge variant="outline">{strings.board.detail.archivedNote}</Badge>}
        </div>
        {isBoardAdmin && <ArchiveBoardDialog boardId={boardId} archived={archived} />}
      </div>

      <BoardColumns
        boardId={boardId}
        board={{ role: b.role, archivedAt: b.archivedAt }}
        lists={lists}
        cards={cards}
      />

      {/* Card detail modal — driven by `?card=<id>`; needs a Suspense boundary
          for `useSearchParams` (App Router). */}
      <Suspense fallback={null}>
        <CardDetailRoute boardId={boardId} />
      </Suspense>
    </div>
  );
}
