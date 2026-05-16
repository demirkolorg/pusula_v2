'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronsUpDownIcon, ListIcon, PlusIcon } from 'lucide-react';
import { DEFAULT_WORKSPACE_ICON, type EntityIcon } from '@pusula/domain';
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
import { EntityIconBadge } from '@/components/entity-icon';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateWorkspaceDialog } from './create-workspace-dialog';
import { SwitcherRowActions } from './switcher-row-actions';
import { WorkspaceMembersDialog } from './workspace-members-dialog';

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  icon?: EntityIcon | string | null;
  role: keyof typeof workspaceRoleLabels;
  createdAt: Date;
};

type BoardRow = {
  id: string;
  title: string;
  archived?: boolean;
  archivedAt?: Date | string | null;
};

const boardChromeTriggerClass =
  'text-[color:var(--board-chrome-fg)] hover:bg-white/10 hover:text-[color:var(--board-chrome-fg)] data-[state=open]:bg-white/10 data-[state=open]:text-[color:var(--board-chrome-fg)]';

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
  const onBoardChrome = Boolean(boardId);
  const copy = strings.shell.workspaceSwitcher;
  const [createOpen, setCreateOpen] = useState(false);
  // The workspace whose member-management modal is currently open (null = closed).
  const [membersTarget, setMembersTarget] = useState<WorkspaceRow | null>(null);

  const workspaceList = useQuery(trpc.workspace.list.queryOptions());
  const list = (workspaceList.data ?? []) as WorkspaceRow[];
  const hasWorkspaceAccess =
    workspaceId == null ? false : list.some((workspace) => workspace.id === workspaceId);
  const workspaceGet = useQuery({
    ...trpc.workspace.get.queryOptions({ workspaceId: workspaceId ?? '__none__' }),
    enabled: Boolean(workspaceId && hasWorkspaceAccess),
  });

  const activeWorkspace =
    workspaceId == null
      ? undefined
      : ((workspaceGet.data as WorkspaceRow | undefined) ??
        list.find((workspace) => workspace.id === workspaceId));
  const triggerLabel = activeWorkspace?.name ?? copy.placeholder;
  const roleLabel = activeWorkspace ? workspaceRoleLabels[activeWorkspace.role] : '';
  const activeIcon = activeWorkspace?.icon ?? DEFAULT_WORKSPACE_ICON;

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
          variant={onBoardChrome ? 'ghost' : 'outline'}
          size="sm"
          aria-label={copy.ariaLabel}
          className={cn('h-9 max-w-56 gap-2 px-2', onBoardChrome && boardChromeTriggerClass)}
        >
          {activeWorkspace ? (
            <EntityIconBadge
              icon={activeIcon}
              className={cn(
                onBoardChrome
                  ? 'bg-white/10 text-[color:var(--board-chrome-fg)]'
                  : 'bg-primary/10 text-primary',
              )}
            />
          ) : (
            <EntityIconBadge
              icon={DEFAULT_WORKSPACE_ICON}
              className={cn(
                onBoardChrome
                  ? 'bg-white/10 text-[color:var(--board-chrome-fg)]'
                  : 'bg-muted text-muted-foreground',
              )}
            />
          )}
          <span className="hidden min-w-0 flex-1 text-left leading-tight md:grid">
            <span className="truncate text-sm font-medium">{triggerLabel}</span>
            {roleLabel && (
              <span
                className={cn(
                  'truncate text-[10px]',
                  onBoardChrome
                    ? 'text-[color:var(--board-chrome-fg)] opacity-75'
                    : 'text-muted-foreground',
                )}
              >
                {roleLabel}
              </span>
            )}
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-64">
        <DropdownMenuLabel>{copy.heading}</DropdownMenuLabel>
        {list.length === 0 ? (
          <DropdownMenuItem disabled>{copy.empty}</DropdownMenuItem>
        ) : (
          list.map((workspace) => {
            const active = workspace.id === workspaceId;
            return (
              <div key={workspace.id} className="group/row relative">
                <DropdownMenuItem
                  data-active={active ? 'true' : undefined}
                  onSelect={() => handleSelectWorkspace(workspace.id)}
                  className="gap-2 pr-16"
                >
                  <EntityIconBadge
                    icon={workspace.icon ?? DEFAULT_WORKSPACE_ICON}
                    className={active ? 'bg-primary/10 text-primary' : undefined}
                  />
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-sm font-medium">{workspace.name}</span>
                    <span className="text-muted-foreground truncate text-[10px]">
                      {workspaceRoleLabels[workspace.role]}
                    </span>
                  </span>
                  {active && <CheckIcon className="text-primary ml-auto size-3.5" aria-hidden />}
                </DropdownMenuItem>
                <SwitcherRowActions
                  settingsLabel={copy.rowSettingsFor(workspace.name)}
                  membersLabel={copy.rowMembersFor(workspace.name)}
                  onSettings={() => router.push(`/workspaces/${workspace.id}`)}
                  onMembers={() => setMembersTarget(workspace)}
                />
              </div>
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
      <CreateWorkspaceDialog hideTrigger open={createOpen} onOpenChange={setCreateOpen} />
      {membersTarget && (
        <WorkspaceMembersDialog
          key={membersTarget.id}
          workspaceId={membersTarget.id}
          workspaceName={membersTarget.name}
          role={membersTarget.role}
          open
          onOpenChange={(open) => {
            if (!open) setMembersTarget(null);
          }}
        />
      )}
    </DropdownMenu>
  );
}
