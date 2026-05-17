'use client';

import { useMemo, useState } from 'react';
import { LayoutGridIcon, ListIcon, PlusIcon } from 'lucide-react';
import { workspaceRoleAtLeast } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { strings } from '@/lib/strings';
import { CreateBoardDialog } from '../../workspaces/[id]/_components/create-board-dialog';
import { BoardCard } from './board-card';
import { BoardListRow } from './board-list-row';
import type { BoardRow, WorkspaceRow } from './types';

type BoardFilter = 'all' | 'starred' | 'recent';
type BoardView = 'grid' | 'list';

type BoardGridProps = {
  workspace: WorkspaceRow;
  boards: readonly BoardRow[];
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
};

/** Sortable timestamp for the "recent" filter — last activity, falling back to update time. */
function activityTime(board: BoardRow): number {
  const value = board.lastActivityAt ?? board.updatedAt;
  return new Date(value).getTime();
}

/**
 * Board section of the landing page (DEM-192): a filter row (count + Tümü /
 * Yıldızlı / Son düzenlenen tabs + grid/list view toggle) over the selected
 * workspace's boards. Filtering and sorting are client-side; the grid ends
 * with a dashed "create board" tile when the caller may create boards.
 */
export function BoardGrid({
  workspace,
  boards,
  isPending,
  isError,
  errorMessage,
}: BoardGridProps) {
  const copy = strings.home.boards;
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [view, setView] = useState<BoardView>('grid');
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const canCreateBoard = workspaceRoleAtLeast(workspace.role, 'member');

  const visibleBoards = useMemo(() => {
    if (filter === 'starred') return boards.filter((board) => board.favorited);
    if (filter === 'recent') {
      return [...boards].sort((a, b) => activityTime(b) - activityTime(a));
    }
    return boards;
  }, [boards, filter]);

  return (
    <section className="space-y-3">
      {canCreateBoard && (
        <CreateBoardDialog
          workspaceId={workspace.id}
          hideTrigger
          open={createBoardOpen}
          onOpenChange={setCreateBoardOpen}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          {copy.sectionTitle}
          <span className="text-muted-foreground text-sm font-normal">
            {copy.count(boards.length)}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as BoardFilter)}>
            <TabsList>
              <TabsTrigger value="all">{copy.filterAll}</TabsTrigger>
              <TabsTrigger value="starred">{copy.filterStarred}</TabsTrigger>
              <TabsTrigger value="recent">{copy.filterRecent}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="size-8"
              aria-pressed={view === 'grid'}
              aria-label={copy.viewGridLabel}
              onClick={() => setView('grid')}
            >
              <LayoutGridIcon className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant={view === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="size-8"
              aria-pressed={view === 'list'}
              aria-label={copy.viewListLabel}
              onClick={() => setView('list')}
            >
              <ListIcon className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {isPending && <AppSpinner label={strings.board.loading} showLabel className="justify-start" />}

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>{strings.board.loadErrorTitle}</AlertTitle>
          <AlertDescription>{errorMessage || strings.common.unknownError}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && visibleBoards.length === 0 && (
        <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed px-4 text-center">
          <p className="text-muted-foreground text-sm">
            {filter === 'starred' ? copy.emptyStarred : copy.empty}
          </p>
        </div>
      )}

      {!isPending && !isError && visibleBoards.length > 0 && view === 'grid' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleBoards.map((board) => (
            <BoardCard key={board.id} workspaceId={workspace.id} board={board} />
          ))}
          {canCreateBoard && filter === 'all' && (
            <button
              type="button"
              onClick={() => setCreateBoardOpen(true)}
              className={cn(
                'flex h-full min-h-44 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-4 text-center outline-none transition-colors',
                'hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/60',
              )}
            >
              <span
                className="bg-primary/15 text-primary inline-flex size-9 items-center justify-center rounded-md"
                aria-hidden
              >
                <PlusIcon className="size-4.5" />
              </span>
              <span className="text-sm font-semibold">{copy.newCardTitle}</span>
              <span className="text-muted-foreground text-[11px]">{copy.newCardDescription}</span>
            </button>
          )}
        </div>
      )}

      {!isPending && !isError && visibleBoards.length > 0 && view === 'list' && (
        <ul className="divide-y rounded-md border">
          {visibleBoards.map((board) => (
            <li key={board.id}>
              <BoardListRow workspaceId={workspace.id} board={board} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
