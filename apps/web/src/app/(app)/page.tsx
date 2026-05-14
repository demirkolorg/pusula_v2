'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Settings2Icon } from 'lucide-react';
import { DEFAULT_BOARD_ICON, workspaceRoleAtLeast } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  boardBackgroundClass,
  cn,
} from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { EntityIconBadge } from '@/components/entity-icon';
import {
  avatarInitials,
  avatarPaletteSolidClass,
  avatarPaletteSwatchClass,
} from '@/lib/avatar-color';
import { boardRoleLabels, strings, workspaceRoleLabels } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateWorkspaceDialog } from './_components/create-workspace-dialog';
import { OnboardingEmptyState } from './_components/onboarding-empty-state';
import { PendingInvitations } from './_components/pending-invitations';
import { CreateBoardDialog } from './workspaces/[id]/_components/create-board-dialog';

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
  icon?: string | null;
  background?: string | null;
  archived?: boolean;
  archivedAt?: Date | string | null;
  role: keyof typeof boardRoleLabels;
};

function isArchivedBoard(board: BoardRow) {
  if (typeof board.archived === 'boolean') return board.archived;
  return board.archivedAt != null;
}

/**
 * `(app)/` landing. Branches on how many workspaces the caller has (see
 * `docs/architecture/08-web-ve-mobil.md` section 8.1.3): 0 -> onboarding empty
 * state; 1+ -> workspace selector on the left and selected workspace boards on
 * the right. Workspace settings stay one click away behind the settings icon.
 */
export default function WorkspacesPage() {
  const trpc = useTRPC();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>();
  const workspaces = useQuery(trpc.workspace.list.queryOptions());
  const workspaceList = workspaces.isSuccess ? ((workspaces.data ?? []) as WorkspaceRow[]) : [];
  const selectedWorkspace =
    workspaceList.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaceList[0];

  const boards = useQuery({
    ...trpc.board.list.queryOptions({ workspaceId: selectedWorkspace?.id ?? '__none__' }),
    enabled: Boolean(selectedWorkspace),
  });
  const boardList = (boards.data ?? []) as BoardRow[];

  if (workspaces.isPending) {
    return <AppSpinner label={strings.workspace.loading} showLabel className="justify-start" />;
  }

  if (workspaces.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{strings.workspace.loadErrorTitle}</AlertTitle>
        <AlertDescription>
          {workspaces.error.message || strings.common.unknownError}
        </AlertDescription>
      </Alert>
    );
  }

  // No workspaces -> onboarding (bootstrap is best-effort). Still surface invites.
  if (workspaceList.length === 0 || !selectedWorkspace) {
    return (
      <div className="space-y-6">
        <PendingInvitations />
        <OnboardingEmptyState />
      </div>
    );
  }

  const canCreateBoard = workspaceRoleAtLeast(selectedWorkspace.role, 'member');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{strings.workspace.listTitle}</h1>
          <p className="text-muted-foreground text-sm">{strings.board.listSectionDescription}</p>
        </div>
        <CreateWorkspaceDialog />
      </div>

      <PendingInvitations />

      <div className="grid gap-4 lg:min-h-[min(640px,calc(100svh-12rem))] lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-hidden rounded-md border bg-card shadow-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{strings.shell.workspaceSwitcher.heading}</h2>
          </div>
          <ul className="pusula-scrollbar max-h-[28rem] space-y-1 overflow-y-auto p-2 lg:max-h-none">
            {workspaceList.map((workspace) => {
              const active = workspace.id === selectedWorkspace.id;
              return (
                <li key={workspace.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedWorkspaceId(workspace.id)}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60',
                      active && 'bg-accent text-accent-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                        avatarPaletteSolidClass(workspace.name),
                      )}
                      aria-hidden
                    >
                      {avatarInitials(workspace.name).slice(0, 1)}
                    </span>
                    <span className="grid min-w-0 flex-1 leading-tight">
                      <span className="truncate text-sm font-medium">{workspace.name}</span>
                      <span className="text-muted-foreground truncate text-[11px]">
                        {workspace.slug} / {workspaceRoleLabels[workspace.role]}
                      </span>
                    </span>
                  </button>
                  <Link
                    href={`/workspaces/${workspace.id}`}
                    aria-label={`${workspace.name} ${strings.workspace.manage.settingsTitle}`}
                    className="text-muted-foreground hover:text-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <Settings2Icon className="size-4" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-md border bg-card shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    avatarPaletteSwatchClass(selectedWorkspace.name),
                  )}
                  aria-hidden
                />
                <h2 className="truncate text-base font-semibold">{selectedWorkspace.name}</h2>
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                <span>{selectedWorkspace.slug}</span>
                <Badge variant="secondary">
                  {strings.workspace.roleBadgePrefix} {workspaceRoleLabels[selectedWorkspace.role]}
                </Badge>
              </div>
            </div>
            {canCreateBoard && (
              <CreateBoardDialog
                workspaceId={selectedWorkspace.id}
                triggerLabel={strings.board.newButton}
              />
            )}
          </div>

          <div className="p-4">
            {boards.isPending && (
              <AppSpinner label={strings.board.loading} showLabel className="justify-start" />
            )}

            {boards.isError && (
              <Alert variant="destructive">
                <AlertTitle>{strings.board.loadErrorTitle}</AlertTitle>
                <AlertDescription>
                  {boards.error.message || strings.common.unknownError}
                </AlertDescription>
              </Alert>
            )}

            {boards.isSuccess && boardList.length === 0 && (
              <div className="flex min-h-44 items-center justify-center rounded-md border border-dashed px-4 text-center">
                <p className="text-muted-foreground text-sm">{strings.board.empty}</p>
              </div>
            )}

            {boards.isSuccess && boardList.length > 0 && (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {boardList.map((board) => {
                  const archived = isArchivedBoard(board);
                  return (
                    <li key={board.id}>
                      <div
                        className={cn(
                          'group overflow-hidden rounded-md border bg-card transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-card-hover',
                          archived && 'opacity-65',
                        )}
                      >
                        <span
                          className={cn(
                            'block h-20 border-b',
                            boardBackgroundClass(board.background),
                          )}
                          aria-hidden
                        >
                          <span className="block h-full bg-black/5" />
                        </span>
                        <div className="space-y-3 p-3">
                          <div className="flex min-w-0 items-start gap-2">
                            <EntityIconBadge
                              icon={board.icon ?? DEFAULT_BOARD_ICON}
                              className="mt-0.5 size-7"
                            />
                            <Link
                              href={`/workspaces/${selectedWorkspace.id}/boards/${board.id}`}
                              className="min-w-0 flex-1 truncate rounded-sm text-sm font-semibold outline-none underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                            >
                              {board.title}
                            </Link>
                            <Link
                              href={`/workspaces/${selectedWorkspace.id}/boards/${board.id}/settings`}
                              aria-label={`${board.title} ${strings.board.settings.dropdownTitle}`}
                              className="text-muted-foreground hover:text-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
                            >
                              <Settings2Icon className="size-4" aria-hidden />
                            </Link>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">
                              {strings.board.roleBadgePrefix} {boardRoleLabels[board.role]}
                            </Badge>
                            {archived && (
                              <Badge variant="outline">{strings.board.archivedBadge}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
