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
import { avatarPaletteSwatchClass } from '@/lib/avatar-color';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateBoardDialog } from '../workspaces/[id]/_components/create-board-dialog';

type BoardRow = {
  id: string;
  title: string;
  archived?: boolean;
  archivedAt?: Date | null;
};

type BoardGetPayload = {
  board: BoardRow;
};

type WorkspaceRow = {
  id: string;
};

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
  const swatchKey = activeBoard?.title ?? triggerText;

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={copy.ariaLabel}
      disabled={!workspaceId}
      className="h-9 max-w-56 gap-2 px-2"
    >
      <span
        className={cn(
          'size-2.5 shrink-0 rounded-full',
          workspaceId ? avatarPaletteSwatchClass(swatchKey) : 'bg-muted-foreground/40',
        )}
        aria-hidden
      />
      <span className="hidden min-w-0 truncate text-sm font-medium md:inline">
        {triggerText}
      </span>
      <ChevronsUpDownIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
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
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    avatarPaletteSwatchClass(displayBoard.title),
                  )}
                  aria-hidden
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
