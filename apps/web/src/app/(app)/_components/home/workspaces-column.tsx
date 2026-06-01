'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArchiveIcon,
  Building2Icon,
  FolderIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  cn,
} from '@pusula/ui';
import { canManageWorkspace } from '@pusula/domain';
import { avatarInitials, avatarPaletteSolidClass } from '@/lib/avatar-color';
import { formatRelativeTime } from '@/lib/format';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { CreateWorkspaceDialog } from '../create-workspace-dialog';
import { HomeColumnEmpty, HomeColumnShell } from './home-column-shell';
import { RowArchiveDialog, RowRenameDialog } from './row-action-dialogs';
import type { WorkspaceRow } from './types';

type WorkspacesColumnProps = {
  workspaces: readonly WorkspaceRow[];
  selectedWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

function roleBadgeVariant(role: WorkspaceRow['role']): 'default' | 'secondary' | 'outline' {
  if (role === 'owner') return 'default';
  if (role === 'admin') return 'secondary';
  return 'outline';
}

/** Workspace.list output shape — re-used for `setQueryData` patches. */
type WorkspaceListItem = WorkspaceRow;

/**
 * Sütun 1 — Workspaces (§13.11). Lists every workspace the viewer can see;
 * clicking a row promotes it to `?ws=`. The `+` button and the empty-state CTA
 * both open the shared {@link CreateWorkspaceDialog}. Workspace settings is
 * reachable from the per-row gear; **sağ tık** açar yeniden adlandır / arşivle
 * (2026-06-01 sağ tık turu) — yetkiye göre kosullu.
 */
export function WorkspacesColumn({
  workspaces,
  selectedWorkspaceId,
  onSelect,
  isPending,
  isError,
  errorMessage,
}: WorkspacesColumnProps) {
  const copy = strings.home.workspacesColumn;
  const actionsCopy = strings.home.rowActions;
  const entityLabel = strings.home.entityLabels.workspace;
  const [createOpen, setCreateOpen] = useState(false);

  // Per-row dialog tracking. Only one workspace can have a dialog open at a
  // time — anasayfanın 4 sütunlu yapısında çoklu açık dialog hem görsel olarak
  // karmaşık, hem fokus akışı için kötü.
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const renameTarget = workspaces.find((w) => w.id === renameTargetId) ?? null;
  const archiveTarget = workspaces.find((w) => w.id === archiveTargetId) ?? null;

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listQueryKey = trpc.workspace.list.queryKey();

  // Optimistic-friendly mutations: on success we patch the `workspace.list`
  // cache directly so the row update lands without a refetch round-trip. Both
  // procedures are also re-validated implicitly on next focus.
  const renameMutation = useMutation(
    trpc.workspace.update.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData<WorkspaceListItem[]>(listQueryKey, (prev) =>
          prev
            ? prev.map((w) =>
                w.id === data.id ? { ...w, name: data.name, slug: data.slug } : w,
              )
            : prev,
        );
        setRenameTargetId(null);
      },
    }),
  );

  const archiveMutation = useMutation(
    trpc.workspace.archive.mutationOptions({
      onSuccess: (_data, vars) => {
        queryClient.setQueryData<WorkspaceListItem[]>(listQueryKey, (prev) =>
          prev ? prev.filter((w) => w.id !== vars.workspaceId) : prev,
        );
        setArchiveTargetId(null);
      },
    }),
  );

  const addButton = (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-7 shrink-0"
      aria-label={copy.addLabel}
      onClick={() => setCreateOpen(true)}
    >
      <PlusIcon className="size-4" aria-hidden />
    </Button>
  );

  return (
    <HomeColumnShell
      ariaLabel={copy.eyebrow}
      eyebrow={copy.eyebrow}
      count={copy.count(workspaces.length)}
      icon={<Building2Icon className="size-4" />}
      action={addButton}
      isPending={isPending}
      isError={isError}
      errorMessage={errorMessage}
    >
      <CreateWorkspaceDialog hideTrigger open={createOpen} onOpenChange={setCreateOpen} />
      {workspaces.length === 0 ? (
        <HomeColumnEmpty
          icon={<FolderIcon className="size-5" aria-hidden />}
          title={copy.emptyTitle}
          description={copy.emptyDescription}
          cta={
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-3.5" aria-hidden />
              {copy.addLabel}
            </Button>
          }
        />
      ) : (
        <ul className="space-y-1 p-2">
          {workspaces.map((workspace) => {
            const active = workspace.id === selectedWorkspaceId;
            // Yetki gating: rename + arşivleme yalnızca admin+; arşivleme owner-only.
            // canManageWorkspace owner ve admin için true döner; archive procedure
            // ayrıca server-side owner kontrolü yapar — UI'da da owner-only
            // tutmak yetki sürprizini önler.
            const canRename = canManageWorkspace({
              workspaceRole: workspace.role,
              boardRole: null,
            });
            const canArchive = workspace.role === 'owner';
            const hasAnyAction = canRename || canArchive;
            return (
              <li key={workspace.id} className="flex items-center gap-1">
                <ContextMenu>
                  <ContextMenuTrigger asChild disabled={!hasAnyAction}>
                    <button
                      type="button"
                      aria-pressed={active}
                      data-active={active ? 'true' : undefined}
                      onClick={() => onSelect(workspace.id)}
                      className={cn(
                        'hover:bg-accent focus-visible:ring-ring/60 relative flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2',
                        active && 'bg-primary/10 text-foreground',
                      )}
                    >
                      {active && (
                        <span
                          className="bg-primary absolute inset-y-2 -left-2 w-0.5 rounded-full"
                          aria-hidden
                        />
                      )}
                      <span
                        className={cn(
                          'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold',
                          avatarPaletteSolidClass(workspace.name),
                        )}
                        aria-hidden
                      >
                        {avatarInitials(workspace.name).slice(0, 1)}
                      </span>
                      <span className="grid min-w-0 flex-1 leading-tight">
                        <span className="truncate text-sm font-semibold">{workspace.name}</span>
                        <span className="text-muted-foreground mt-0.5 truncate text-[11px]">
                          {workspace.boardCount} pano · {workspace.memberCount} üye
                          {workspace.lastActivityAt && (
                            <>
                              {' · '}
                              {copy.lastActivity(formatRelativeTime(workspace.lastActivityAt))}
                            </>
                          )}
                        </span>
                      </span>
                      <Badge
                        variant={roleBadgeVariant(workspace.role)}
                        className="shrink-0 text-[10px]"
                      >
                        {workspaceRoleLabels[workspace.role]}
                      </Badge>
                    </button>
                  </ContextMenuTrigger>
                  {hasAnyAction && (
                    <ContextMenuContent
                      aria-label={actionsCopy.triggerLabel(workspace.name)}
                    >
                      {canRename && (
                        <ContextMenuItem onSelect={() => setRenameTargetId(workspace.id)}>
                          <PencilIcon className="size-3.5" aria-hidden />
                          {actionsCopy.rename}
                        </ContextMenuItem>
                      )}
                      {canRename && canArchive && <ContextMenuSeparator />}
                      {canArchive && (
                        <ContextMenuItem
                          variant="destructive"
                          onSelect={() => setArchiveTargetId(workspace.id)}
                        >
                          <ArchiveIcon className="size-3.5" aria-hidden />
                          {actionsCopy.archive}
                        </ContextMenuItem>
                      )}
                    </ContextMenuContent>
                  )}
                </ContextMenu>
                <Link
                  href={`/workspaces/${workspace.id}`}
                  aria-label={copy.settingsLabel(workspace.name)}
                  className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 inline-flex size-9 shrink-0 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2"
                >
                  <Settings2Icon className="size-4" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <RowRenameDialog
        open={renameTarget != null}
        onOpenChange={(next) => {
          if (!next) setRenameTargetId(null);
        }}
        entityLabel={entityLabel}
        currentValue={renameTarget?.name ?? ''}
        isPending={renameMutation.isPending}
        errorMessage={renameMutation.error?.message ?? null}
        onSubmit={(nextValue) => {
          if (!renameTarget) return;
          // void: caller dialog'u açık tutar; mutation onSuccess kapatır.
          renameMutation.mutate({
            workspaceId: renameTarget.id,
            name: nextValue,
          });
        }}
      />

      <RowArchiveDialog
        open={archiveTarget != null}
        onOpenChange={(next) => {
          if (!next) setArchiveTargetId(null);
        }}
        entityLabel={entityLabel}
        isPending={archiveMutation.isPending}
        errorMessage={archiveMutation.error?.message ?? null}
        onConfirm={() => {
          if (!archiveTarget) return;
          archiveMutation.mutate({ workspaceId: archiveTarget.id });
        }}
      />
    </HomeColumnShell>
  );
}
