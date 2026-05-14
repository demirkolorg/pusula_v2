'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from '@pusula/ui';
import { DEFAULT_BOARD_ICON } from '@pusula/domain';
import { EntityIconBadge } from '@/components/entity-icon';
import { AppSpinner } from '@/components/app-spinner';
import { boardRoleLabels, strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateBoardDialog } from './create-board-dialog';

type BoardListSectionProps = {
  workspaceId: string;
  /** Whether the current viewer may create boards (workspace `member+`). */
  canCreateBoard: boolean;
};

/**
 * "Panolar" section shown at the top of the workspace screen. Lists the
 * workspace's boards (`board.list`) — each links to the board detail. Archived
 * boards are shown dimmed + read-only; the per-board `role` badge reflects the
 * caller's effective role. Creating a board is gated to workspace `member+`
 * here, but the server enforces it too.
 */
export function BoardListSection({ workspaceId, canCreateBoard }: BoardListSectionProps) {
  const trpc = useTRPC();
  const boards = useQuery(trpc.board.list.queryOptions({ workspaceId }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canCreateBoard && <CreateBoardDialog workspaceId={workspaceId} />}
      </div>

      {boards.isPending && (
        <AppSpinner label={strings.board.loading} showLabel className="justify-start" />
      )}

      {boards.isError && (
        <Alert variant="destructive">
          <AlertTitle>{strings.board.loadErrorTitle}</AlertTitle>
          <AlertDescription>{boards.error.message || strings.common.unknownError}</AlertDescription>
        </Alert>
      )}

      {boards.isSuccess && boards.data.length === 0 && (
        <p className="text-muted-foreground text-sm">{strings.board.empty}</p>
      )}

      {boards.isSuccess && boards.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.data.map((board) => {
            const archived = board.archivedAt != null;
            return (
              <li key={board.id}>
                <Card
                  className={cn(
                    'transition-[box-shadow,border-color] hover:border-foreground/30 hover:shadow-card-hover',
                    archived && 'opacity-60',
                  )}
                >
                  <CardHeader>
                    <CardTitle className="flex min-w-0 items-center gap-2">
                      <EntityIconBadge
                        icon={board.icon ?? DEFAULT_BOARD_ICON}
                        className="bg-primary/10 text-primary"
                      />
                      <Link
                        href={`/workspaces/${workspaceId}/boards/${board.id}`}
                        className="rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        {board.title}
                      </Link>
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {strings.board.roleBadgePrefix} {boardRoleLabels[board.role]}
                      </Badge>
                      {archived && <Badge variant="outline">{strings.board.archivedBadge}</Badge>}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
