'use client';

import { StarIcon } from 'lucide-react';
import { cn } from '@pusula/ui';
import { useOptimisticBoardListMutation } from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type BoardFavoriteButtonProps = {
  workspaceId: string;
  boardId: string;
  boardTitle: string;
  favorited: boolean;
  className?: string;
};

/**
 * Star toggle for a board card on the landing page (DEM-192). Runs through the
 * shared `useOptimisticBoardListMutation` hook so the `board.list` cache flips
 * the `favorited` flag immediately, rolls back on error, invalidates on settle,
 * and gets a `clientMutationId` injected automatically.
 *
 * Accessible: a `<button>` with `aria-pressed` reflecting the favorite state
 * and a label that names the board and the action.
 */
export function BoardFavoriteButton({
  workspaceId,
  boardId,
  boardTitle,
  favorited,
  className,
}: BoardFavoriteButtonProps) {
  const trpc = useTRPC();

  const setFavorite = useOptimisticBoardListMutation({
    mutationOptions: trpc.board.setFavorite.mutationOptions,
    workspaceId,
    apply: (boards, vars) =>
      boards.map((board) =>
        board.id === vars.boardId ? { ...board, favorited: vars.favorited } : board,
      ),
  });

  const copy = strings.home.boards;
  const label = favorited ? copy.favoriteRemove(boardTitle) : copy.favoriteAdd(boardTitle);

  return (
    <button
      type="button"
      aria-pressed={favorited}
      aria-label={label}
      title={label}
      disabled={setFavorite.isPending}
      onClick={() => setFavorite.mutate({ boardId, favorited: !favorited })}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md bg-black/35 text-white outline-none backdrop-blur-sm transition-colors hover:bg-black/50 focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60',
        className,
      )}
    >
      <StarIcon
        className={cn('size-3.5', favorited ? 'fill-warning text-warning' : 'text-white')}
        aria-hidden
      />
    </button>
  );
}
