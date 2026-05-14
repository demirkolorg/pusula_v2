'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
  Settings2Icon,
} from 'lucide-react';
import { DEFAULT_BOARD_ICON, type EntityIcon } from '@pusula/domain';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';
import { EntityIconBadge } from '@/components/entity-icon';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateBoardDialog } from '../workspaces/[id]/_components/create-board-dialog';

type BoardRow = {
  id: string;
  title: string;
  icon?: EntityIcon | string | null;
  archived?: boolean;
  archivedAt?: Date | null;
};

type BoardGetPayload = {
  board: BoardRow;
};

type WorkspaceRow = {
  id: string;
};

const boardChromeTriggerClass =
  'text-[color:var(--board-chrome-fg)] hover:bg-white/10 hover:text-[color:var(--board-chrome-fg)] data-[state=open]:bg-white/10 data-[state=open]:text-[color:var(--board-chrome-fg)]';

function isActiveBoard(board: BoardRow) {
  if (typeof board.archived === 'boolean') return !board.archived;
  return board.archivedAt == null;
}

export function BoardSwitcher() {
  const trpc = useTRPC();
  const router = useRouter();
  const params = useParams<{ id?: string; boardId?: string }>();
  const workspaceId = typeof params.id === 'string' ? params.id : undefined;
  const boardId = typeof params.boardId === 'string' ? params.boardId : undefined;
  const onBoardChrome = Boolean(boardId);
  const copy = strings.shell.boardSwitcher;
  const [createOpen, setCreateOpen] = useState(false);

  const workspaceList = useQuery(trpc.workspace.list.queryOptions());
  const workspaces = (workspaceList.data ?? []) as WorkspaceRow[];
  const hasWorkspaceAccess =
    workspaceId == null ? false : workspaces.some((workspace) => workspace.id === workspaceId);
  const boards = useQuery({
    ...trpc.board.list.queryOptions({ workspaceId: workspaceId ?? '__none__' }),
    enabled: Boolean(workspaceId && hasWorkspaceAccess),
  });
  const boardGet = useQuery({
    ...trpc.board.get.queryOptions({ boardId: boardId ?? '__none__' }),
    enabled: Boolean(boardId && hasWorkspaceAccess),
  });

  const list = (boards.data ?? []) as BoardRow[];
  const activeBoards = list.filter(isActiveBoard);
  const activeBoard =
    boardId == null
      ? undefined
      : (((boardGet.data as BoardGetPayload | undefined)?.board) ??
        list.find((board) => board.id === boardId));
  const triggerText = workspaceId
    ? activeBoard?.title ?? copy.placeholder
    : copy.disabled;
  const triggerIcon = activeBoard?.icon ?? DEFAULT_BOARD_ICON;

  const trigger = (
    <Button
      type="button"
      variant={onBoardChrome ? 'ghost' : 'outline'}
      size="sm"
      aria-label={copy.ariaLabel}
      disabled={!workspaceId}
      className={cn('h-9 max-w-56 gap-2 px-2', onBoardChrome && boardChromeTriggerClass)}
    >
      <EntityIconBadge
        icon={triggerIcon}
        className={cn(
          'size-7 rounded-md',
          workspaceId
            ? onBoardChrome
              ? 'bg-white/10 text-[color:var(--board-chrome-fg)]'
              : 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground',
        )}
      />
      <span className="hidden min-w-0 truncate text-sm font-medium md:inline">
        {triggerText}
      </span>
      <ChevronsUpDownIcon
        className={cn(
          'size-3.5 shrink-0',
          onBoardChrome
            ? 'text-[color:var(--board-chrome-fg)] opacity-75'
            : 'text-muted-foreground',
        )}
        aria-hidden
      />
    </Button>
  );

  if (!workspaceId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{trigger}</span>
        </TooltipTrigger>
        <TooltipContent>{copy.disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-64">
        <DropdownMenuLabel>{copy.heading}</DropdownMenuLabel>
        {activeBoards.length === 0 ? (
          <DropdownMenuItem disabled>{copy.empty}</DropdownMenuItem>
        ) : (
          activeBoards.map((board) => {
            const active = board.id === boardId;
            const displayBoard = active && activeBoard ? activeBoard : board;
            return (
              <DropdownMenuItem
                key={board.id}
                data-active={active ? 'true' : undefined}
                onSelect={() => router.push(`/workspaces/${workspaceId}/boards/${board.id}`)}
              >
                <EntityIconBadge
                  icon={displayBoard.icon ?? DEFAULT_BOARD_ICON}
                  className={cn('size-7 rounded-md', active && 'bg-primary/10 text-primary')}
                />
                <span className="min-w-0 flex-1 truncate">{displayBoard.title}</span>
                {active && <CheckIcon className="text-primary ml-auto size-3.5" aria-hidden />}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
          <PlusIcon />
          {copy.create}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`/workspaces/${workspaceId}`)}>
          <Settings2Icon />
          {copy.manageWorkspace}
        </DropdownMenuItem>
      </DropdownMenuContent>
      <CreateBoardDialog
        workspaceId={workspaceId}
        hideTrigger
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </DropdownMenu>
  );
}
