'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2Icon, FolderIcon, PlusIcon, Settings2Icon } from 'lucide-react';
import { Badge, Button, cn } from '@pusula/ui';
import { avatarInitials, avatarPaletteSolidClass } from '@/lib/avatar-color';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { CreateWorkspaceDialog } from '../create-workspace-dialog';
import { HomeColumnEmpty, HomeColumnShell } from './home-column-shell';
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

/**
 * Sütun 1 — Workspaces (§13.11). Lists every workspace the viewer can see;
 * clicking a row promotes it to `?ws=`. The `+` button and the empty-state CTA
 * both open the shared {@link CreateWorkspaceDialog}. Workspace settings is
 * reachable from the per-row gear, not by clicking the row itself.
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
  const [createOpen, setCreateOpen] = useState(false);

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
            return (
              <li key={workspace.id} className="flex items-center gap-1">
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
                    </span>
                  </span>
                  <Badge
                    variant={roleBadgeVariant(workspace.role)}
                    className="shrink-0 text-[10px]"
                  >
                    {workspaceRoleLabels[workspace.role]}
                  </Badge>
                </button>
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
    </HomeColumnShell>
  );
}
