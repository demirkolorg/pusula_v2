'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { InviteMemberForm } from './invite-member-form';

type InviteMemberDialogProps = {
  workspaceId: string;
  workspaceName: string;
  /**
   * Called after a successful invite. The workspace management screen uses this
   * to invalidate `workspace.invitations.list` so the new pending invitation
   * shows up; on the workspaces list there's nothing to refresh, so it's omitted.
   */
  onInvited?: () => void;
};

/**
 * "Invite a member" trigger + dialog for a single workspace. Only rendered for
 * workspace owners/admins (the page gates this); the server still enforces the
 * `admin+` check on `workspace.members.invite`.
 *
 * On success the dialog closes, the mutation state is reset (so the next open is
 * clean), and `onInvited` — if provided — fires so the caller can refresh its
 * pending-invitations view.
 */
export function InviteMemberDialog({
  workspaceId,
  workspaceName,
  onInvited,
}: InviteMemberDialogProps) {
  const trpc = useTRPC();
  const copy = strings.invitations;
  // DEM-298 — block self-invite at the UI seam (server also rejects).
  const { data: session } = authClient.useSession();
  const currentUserEmail = session?.user.email;

  const [open, setOpen] = useState(false);

  const inviteMember = useMutation(
    trpc.workspace.members.invite.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        inviteMember.reset();
        onInvited?.();
      },
    }),
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) inviteMember.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {copy.inviteAction}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={strings.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.inviteDialogTitle}</DialogTitle>
          <DialogDescription>
            {copy.inviteDialogDescription} · {workspaceName}
          </DialogDescription>
        </DialogHeader>
        <InviteMemberForm
          pending={inviteMember.isPending}
          error={
            inviteMember.isError ? inviteMember.error.message || strings.common.unknownError : null
          }
          onCancel={() => handleOpenChange(false)}
          onSubmit={(email) =>
            inviteMember.mutate({ workspaceId, email, clientMutationId: crypto.randomUUID() })
          }
          currentUserEmail={currentUserEmail}
        />
      </DialogContent>
    </Dialog>
  );
}
