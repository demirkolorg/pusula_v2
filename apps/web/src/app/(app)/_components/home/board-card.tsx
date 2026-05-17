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

type BoardCardProps = {
  workspaceId: string;
  board: BoardRow;
};

/** Maps a board role to a `Badge` variant. */
function roleBadgeVariant(role: BoardRow['role']): 'secondary' | 'outline' {
  return role === 'admin' ? 'secondary' : 'outline';
}

/**
 * A board card in the landing-page grid (DEM-192): a token-driven cover, a
 * favorite star, the board icon + title (links to the board), a role badge +
 * relative last-activity line, the open/done task counts and a member stack.
 * Archived boards dim and carry an "Arşivli" badge. The card keeps a stable
 * height so toggling filters never shifts the grid.
 */
export function BoardCard({ workspaceId, board }: BoardCardProps) {
  const archived = isArchivedBoard(board);
  const copy = strings.home.boards;
  const activityAt = board.lastActivityAt ?? board.updatedAt;

  return (
    <article
      className={cn(
        'bg-card group flex h-full flex-col overflow-hidden rounded-md border transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-card-hover',
        archived && 'opacity-65',
      )}
    >
      <div className="relative">
        <span
          className={cn('block h-24 border-b', boardBackgroundClass(board.background))}
          aria-hidden
        >
          <span className="block h-full bg-black/5" />
        </span>
        <BoardFavoriteButton
          workspaceId={workspaceId}
          boardId={board.id}
          boardTitle={board.title}
          favorited={board.favorited}
          className="absolute right-2.5 top-2.5"
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="flex min-w-0 items-start gap-2">
          <EntityIconBadge icon={board.icon ?? DEFAULT_BOARD_ICON} className="mt-0.5 size-7" />
          <Link
            href={`/workspaces/${workspaceId}/boards/${board.id}`}
            className="min-w-0 flex-1 truncate rounded-sm text-sm font-semibold leading-snug outline-none underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {board.title}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={roleBadgeVariant(board.role)} className="text-[10px]">
            {strings.board.roleBadgePrefix} {boardRoleLabels[board.role]}
          </Badge>
          {archived && (
            <Badge variant="outline" className="text-[10px]">
              {strings.board.archivedBadge}
            </Badge>
          )}
          <span className="text-muted-foreground text-[11px]">
            {formatRelativeTime(activityAt)}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
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
          <MemberAvatarStack members={board.members} max={3} />
        </div>
      </div>
    </article>
  );
}
