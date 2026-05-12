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
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { InviteMemberForm } from './invite-member-form';

type InviteMemberDialogProps = {
  workspaceId: string;
  workspaceName: string;
};

/**
 * "Invite a member" trigger + dialog for a single workspace. Only rendered for
 * workspace owners/admins (the page gates this); the server still enforces the
 * `admin+` check on `workspace.members.invite`.
 *
 * On success the dialog closes — the sender's view of the workspace doesn't
 * change, and `invitations.list` (the management UI) isn't shown yet, so there's
 * nothing to invalidate here. The mutation state is reset so the next open is
 * clean.
 */
export function InviteMemberDialog({ workspaceId, workspaceName }: InviteMemberDialogProps) {
  const trpc = useTRPC();
  const copy = strings.invitations;

  const [open, setOpen] = useState(false);

  const inviteMember = useMutation(
    trpc.workspace.members.invite.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        inviteMember.reset();
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.inviteDialogTitle}</DialogTitle>
          <DialogDescription>
            {copy.inviteDialogDescription} · {workspaceName}
          </DialogDescription>
        </DialogHeader>
        <InviteMemberForm
          pending={inviteMember.isPending}
          error={inviteMember.isError ? inviteMember.error.message || strings.common.unknownError : null}
          onCancel={() => handleOpenChange(false)}
          onSubmit={(email) =>
            inviteMember.mutate({ workspaceId, email, clientMutationId: crypto.randomUUID() })
          }
        />
      </DialogContent>
    </Dialog>
  );
}
