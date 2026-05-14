'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  ChevronsUpDownIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@pusula/ui';
import {
  avatarInitials,
  avatarPaletteSolidClass,
} from '@/lib/avatar-color';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateWorkspaceDialog } from './create-workspace-dialog';

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  role: keyof typeof workspaceRoleLabels;
  createdAt: Date;
};

type BoardRow = {
  id: string;
  title: string;
  archived?: boolean;
  archivedAt?: Date | string | null;
};

function isActiveBoard(board: BoardRow) {
  if (typeof board.archived === 'boolean') return !board.archived;
  return board.archivedAt == null;
}

export function WorkspaceSwitcher() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ id?: string; boardId?: string }>();
  const workspaceId = typeof params.id === 'string' ? params.id : undefined;
  const boardId = typeof params.boardId === 'string' ? params.boardId : undefined;
  const copy = strings.shell.workspaceSwitcher;
  const [createOpen, setCreateOpen] = useState(false);

  const workspaceList = useQuery(trpc.workspace.list.queryOptions());
  const workspaceGet = useQuery({
    ...trpc.workspace.get.queryOptions({ workspaceId: workspaceId ?? '__none__' }),
    enabled: Boolean(workspaceId),
  });

  const list = (workspaceList.data ?? []) as WorkspaceRow[];
  const activeWorkspace =
    workspaceId == null
      ? undefined
      : ((workspaceGet.data as WorkspaceRow | undefined) ??
        list.find((workspace) => workspace.id === workspaceId));
  const triggerLabel = activeWorkspace?.name ?? copy.placeholder;
  const roleLabel = activeWorkspace ? workspaceRoleLabels[activeWorkspace.role] : '';
  const initial = avatarInitials(activeWorkspace?.name).slice(0, 1);

  const navigateToWorkspace = async (targetWorkspaceId: string) => {
    try {
      const boards = (await queryClient.fetchQuery(
        trpc.board.list.queryOptions({ workspaceId: targetWorkspaceId }),
      )) as BoardRow[];
      const firstActiveBoard = boards.find(isActiveBoard);
      router.push(
        firstActiveBoard
          ? `/workspaces/${targetWorkspaceId}/boards/${firstActiveBoard.id}`
          : `/workspaces/${targetWorkspaceId}`,
      );
    } catch {
      router.push(`/workspaces/${targetWorkspaceId}`);
    }
  };

  const handleSelectWorkspace = (targetWorkspaceId: string) => {
    if (targetWorkspaceId === workspaceId && boardId) return;
    void navigateToWorkspace(targetWorkspaceId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={copy.ariaLabel}
          className="h-9 max-w-56 gap-2 px-2"
        >
          {activeWorkspace ? (
            <span
              className={cn(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                avatarPaletteSolidClass(activeWorkspace.name),
              )}
              aria-hidden
            >
              {initial}
            </span>
          ) : (
            <span
              className="bg-muted text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md"
              aria-hidden
            >
              <LayoutGridIcon className="size-3.5" />
            </span>
          )}
          <span className="hidden min-w-0 flex-1 text-left leading-tight md:grid">
            <span className="truncate text-sm font-medium">{triggerLabel}</span>
            {roleLabel && (
              <span className="text-muted-foreground truncate text-[10px]">{roleLabel}</span>
            )}
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-64">
        <DropdownMenuLabel>{copy.heading}</DropdownMenuLabel>
        {list.length === 0 ? (
          <DropdownMenuItem disabled>{copy.empty}</DropdownMenuItem>
        ) : (
          list.map((workspace) => {
            const active = workspace.id === workspaceId;
            return (
              <DropdownMenuItem
                key={workspace.id}
                data-active={active ? 'true' : undefined}
                onSelect={() => handleSelectWorkspace(workspace.id)}
                className="gap-2"
              >
                <span
                  className={cn(
                    'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                    avatarPaletteSolidClass(workspace.name),
                  )}
                  aria-hidden
                >
                  {avatarInitials(workspace.name).slice(0, 1)}
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">{workspace.name}</span>
                  <span className="text-muted-foreground truncate text-[10px]">
                    {workspaceRoleLabels[workspace.role]}
                  </span>
                </span>
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
        <DropdownMenuItem onSelect={() => router.push('/')}>
          <ListIcon />
          {copy.manageAll}
        </DropdownMenuItem>
      </DropdownMenuContent>
      <CreateWorkspaceDialog
        hideTrigger
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </DropdownMenu>
  );
}
