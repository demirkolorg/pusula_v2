'use client';

import { UsersIcon } from 'lucide-react';
import { workspaceRoleAtLeast, type WorkspaceRole } from '@pusula/domain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { MemberList } from '../workspaces/[id]/_components/member-list';
import { InviteMemberDialog } from './invite-member-dialog';

type WorkspaceMembersDialogProps = {
  workspaceId: string;
  workspaceName: string;
  /** The viewer's role on this workspace — gates the role/remove/invite controls. */
  role: WorkspaceRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Modal wrapper around {@link MemberList} so a workspace's members can be
 * managed straight from the workspace switcher, without leaving the current
 * screen. Authorization stays server-side; `canManage` only hides controls the
 * viewer's role can't use. Inviting a new member reuses {@link InviteMemberDialog}
 * (a nested dialog). The member list query is lazy — it only fires once the
 * dialog content mounts (i.e. when `open` becomes true).
 */
export function WorkspaceMembersDialog({
  workspaceId,
  workspaceName,
  role,
  open,
  onOpenChange,
}: WorkspaceMembersDialogProps) {
  const copy = strings.members;
  const canManage = workspaceRoleAtLeast(role, 'admin');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={strings.common.close} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="size-4" aria-hidden />
            {workspaceName}
          </DialogTitle>
          <DialogDescription>{copy.sectionDescription}</DialogDescription>
        </DialogHeader>
        {canManage && (
          <div className="flex justify-end">
            <InviteMemberDialog workspaceId={workspaceId} workspaceName={workspaceName} />
          </div>
        )}
        <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1">
          <MemberList workspaceId={workspaceId} canManage={canManage} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
