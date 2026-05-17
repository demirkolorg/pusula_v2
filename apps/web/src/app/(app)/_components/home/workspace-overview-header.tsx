'use client';

import { ClockIcon, LayoutGridIcon, UsersIcon } from 'lucide-react';
import { workspaceRoleAtLeast } from '@pusula/domain';
import { Badge, cn } from '@pusula/ui';
import { avatarInitials, avatarPaletteSolidClass } from '@/lib/avatar-color';
import { formatRelativeTime } from '@/lib/format';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { InviteMemberDialog } from '../invite-member-dialog';
import { CreateBoardDialog } from '../../workspaces/[id]/_components/create-board-dialog';
import type { WorkspaceRow } from './types';

type WorkspaceOverviewHeaderProps = {
  workspace: WorkspaceRow;
};

/** Maps a workspace role to a `Badge` variant. */
function roleBadgeVariant(role: WorkspaceRow['role']): 'default' | 'secondary' | 'outline' {
  if (role === 'owner') return 'default';
  if (role === 'admin') return 'secondary';
  return 'outline';
}

/**
 * Header strip for the selected workspace on the landing page (DEM-192): a
 * large palette avatar, the workspace name + role, its slug, and a meta row
 * (board / member counts + last activity). The trailing actions reuse the
 * shared invite + create-board dialogs; both are role-gated server-side, and
 * "Pano oluştur" is additionally hidden below `member`.
 */
export function WorkspaceOverviewHeader({ workspace }: WorkspaceOverviewHeaderProps) {
  const copy = strings.home.overview;
  const canInvite = workspaceRoleAtLeast(workspace.role, 'admin');
  const canCreateBoard = workspaceRoleAtLeast(workspace.role, 'member');

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <span
          className={cn(
            'inline-flex size-[3.25rem] shrink-0 items-center justify-center rounded-xl text-xl font-semibold shadow-card',
            avatarPaletteSolidClass(workspace.name),
          )}
          aria-hidden
        >
          {avatarInitials(workspace.name).slice(0, 1)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-2xl font-semibold tracking-tight">{workspace.name}</h2>
            <Badge variant={roleBadgeVariant(workspace.role)}>
              {copy.roleBadgePrefix} {workspaceRoleLabels[workspace.role]}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 truncate font-mono text-xs">{workspace.slug}</p>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <LayoutGridIcon className="size-3.5" aria-hidden />
              {copy.boardCount(workspace.boardCount)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon className="size-3.5" aria-hidden />
              {copy.memberCount(workspace.memberCount)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="size-3.5" aria-hidden />
              {workspace.lastActivityAt
                ? copy.lastActivity(formatRelativeTime(workspace.lastActivityAt))
                : copy.lastActivityNever}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {canInvite && (
          <InviteMemberDialog workspaceId={workspace.id} workspaceName={workspace.name} />
        )}
        {canCreateBoard && (
          <CreateBoardDialog
            workspaceId={workspace.id}
            triggerLabel={copy.createBoardButton}
          />
        )}
      </div>
    </header>
  );
}
