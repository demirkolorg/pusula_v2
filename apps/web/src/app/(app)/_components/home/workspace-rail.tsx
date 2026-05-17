'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PlusIcon, Settings2Icon, SparklesIcon } from 'lucide-react';
import { Badge, Button, cn } from '@pusula/ui';
import { avatarInitials, avatarPaletteSolidClass } from '@/lib/avatar-color';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { CreateWorkspaceDialog } from '../create-workspace-dialog';
import type { WorkspaceRow } from './types';

type WorkspaceRailProps = {
  workspaces: readonly WorkspaceRow[];
  selectedWorkspaceId: string;
  onSelect: (workspaceId: string) => void;
};

/** Maps a workspace role to a `Badge` variant. */
function roleBadgeVariant(role: WorkspaceRow['role']): 'default' | 'secondary' | 'outline' {
  if (role === 'owner') return 'default';
  if (role === 'admin') return 'secondary';
  return 'outline';
}

/**
 * Left rail of the landing page (DEM-192): the workspace switcher list with an
 * "add" affordance up top and a dashed "create workspace" call-to-action at the
 * bottom. Both affordances open the shared `CreateWorkspaceDialog` (rendered
 * trigger-less and driven from local state). Selection is lifted to the page so
 * the right column reacts; this component is otherwise presentational.
 */
export function WorkspaceRail({ workspaces, selectedWorkspaceId, onSelect }: WorkspaceRailProps) {
  const copy = strings.home.rail;
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <aside className="bg-card shadow-card flex min-h-0 flex-col overflow-hidden rounded-md border">
      <CreateWorkspaceDialog hideTrigger open={createOpen} onOpenChange={setCreateOpen} />

      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
            {copy.eyebrow}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">{copy.count(workspaces.length)}</p>
        </div>
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
      </div>

      <ul className="pusula-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {workspaces.map((workspace) => {
          const active = workspace.id === selectedWorkspaceId;
          return (
            <li key={workspace.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(workspace.id)}
                className={cn(
                  'relative flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60',
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
                    {strings.home.overview.boardCount(workspace.boardCount)}
                    {' · '}
                    {strings.home.overview.memberCount(workspace.memberCount)}
                  </span>
                </span>
                <Badge variant={roleBadgeVariant(workspace.role)} className="shrink-0 text-[10px]">
                  {workspaceRoleLabels[workspace.role]}
                </Badge>
              </button>
              <Link
                href={`/workspaces/${workspace.id}`}
                aria-label={copy.settingsLabel(workspace.name)}
                className="text-muted-foreground hover:text-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Settings2Icon className="size-4" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t p-3">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="hover:border-primary/40 hover:bg-primary/5 flex w-full items-start gap-3 rounded-md border border-dashed p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span
            className="bg-primary/15 text-primary inline-flex size-7 shrink-0 items-center justify-center rounded-md"
            aria-hidden
          >
            <SparklesIcon className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{copy.createCardTitle}</span>
            <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">
              {copy.createCardDescription}
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
