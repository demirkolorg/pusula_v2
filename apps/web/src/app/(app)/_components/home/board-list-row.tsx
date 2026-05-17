'use client';

import Link from 'next/link';
import { CircleIcon, CircleCheckIcon } from 'lucide-react';
import { DEFAULT_BOARD_ICON } from '@pusula/domain';
import { Badge, boardBackgroundClass, cn } from '@pusula/ui';
import { EntityIconBadge } from '@/components/entity-icon';
import { formatRelativeTime } from '@/lib/format';
import { boardRoleLabels, strings } from '@/lib/strings';
import { BoardFavoriteButton } from './board-favorite-button';
import { MemberAvatarStack } from './member-avatar-stack';
import { isArchivedBoard, type BoardRow } from './types';

type BoardListRowProps = {
  workspaceId: string;
  board: BoardRow;
};

/** Maps a board role to a `Badge` variant. */
function roleBadgeVariant(role: BoardRow['role']): 'secondary' | 'outline' {
  return role === 'admin' ? 'secondary' : 'outline';
}

/**
 * Compact list-view row for a board on the landing page (DEM-192) — the
 * alternative to `BoardCard` when the grid/list toggle is set to "list".
 * Same data, denser layout: a small cover swatch, the board icon + title,
 * role badge, task counts, member stack and favorite star.
 */
export function BoardListRow({ workspaceId, board }: BoardListRowProps) {
  const archived = isArchivedBoard(board);
  const copy = strings.home.boards;
  const activityAt = board.lastActivityAt ?? board.updatedAt;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50',
        archived && 'opacity-65',
      )}
    >
      <span
        className={cn('size-9 shrink-0 rounded-md border', boardBackgroundClass(board.background))}
        aria-hidden
      />
      <EntityIconBadge icon={board.icon ?? DEFAULT_BOARD_ICON} className="size-7" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/workspaces/${workspaceId}/boards/${board.id}`}
          className="truncate rounded-sm text-sm font-semibold outline-none underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {board.title}
        </Link>
        <span className="text-muted-foreground truncate text-[11px]">
          {formatRelativeTime(activityAt)}
        </span>
      </div>

      <div className="hidden items-center gap-2 sm:flex">
        <Badge variant={roleBadgeVariant(board.role)} className="text-[10px]">
          {strings.board.roleBadgePrefix} {boardRoleLabels[board.role]}
        </Badge>
        {archived && (
          <Badge variant="outline" className="text-[10px]">
            {strings.board.archivedBadge}
          </Badge>
        )}
      </div>

      <div className="text-muted-foreground hidden items-center gap-3 text-[11px] md:flex">
        <span className="inline-flex items-center gap-1">
          <CircleIcon className="text-warning-foreground size-3" aria-hidden />
          {board.openCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <CircleCheckIcon className="text-success size-3" aria-hidden />
          {board.doneCount}
        </span>
        <span className="sr-only">{copy.taskCounts(board.openCount, board.doneCount)}</span>
      </div>

      <MemberAvatarStack members={board.members} max={3} className="hidden lg:flex" />

      <BoardFavoriteButton
        workspaceId={workspaceId}
        boardId={board.id}
        boardTitle={board.title}
        favorited={board.favorited}
        className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 backdrop-blur-none"
      />
    </div>
  );
}
