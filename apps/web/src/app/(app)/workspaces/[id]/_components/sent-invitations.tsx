'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceRole } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pusula/ui';
import { strings, workspaceRoleLabels } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type SentInvitationsProps = {
  workspaceId: string;
  /** Whether the viewer is `admin+` — gates the "revoke" action. */
  canManage: boolean;
};

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });

function formatDate(value: Date | string) {
  return dateFormatter.format(value instanceof Date ? value : new Date(value));
}

/**
 * "Sent invitations" section: lists this workspace's `pending` invitations
 * (`workspace.invitations.list`, visible to `member+`); `admin+` viewers also
 * get a "revoke" action per row (`workspace.invitations.revoke`), which
 * invalidates the list on success. Each row owns its revoke mutation + inline
 * error.
 */
export function SentInvitations({ workspaceId, canManage }: SentInvitationsProps) {
  const trpc = useTRPC();
  const invitations = useQuery(trpc.workspace.invitations.list.queryOptions({ workspaceId }));

  if (invitations.isPending) {
    return <p className="text-muted-foreground text-sm">{strings.common.loading}</p>;
  }

  if (invitations.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{strings.invitations.loadErrorTitle}</AlertTitle>
        <AlertDescription>
          {invitations.error.message || strings.common.unknownError}
        </AlertDescription>
      </Alert>
    );
  }

  if (invitations.data.length === 0) {
    return <p className="text-muted-foreground text-sm">{strings.invitations.noSent}</p>;
  }

  return (
    <ul className="space-y-3">
      {invitations.data.map((invitation) => (
        <li key={invitation.id}>
          <SentInvitationRow
            workspaceId={workspaceId}
            invitationId={invitation.id}
            email={invitation.email}
            role={invitation.role as WorkspaceRole}
            invitedByName={invitation.invitedByName}
            expiresAt={invitation.expiresAt}
            canManage={canManage}
          />
        </li>
      ))}
    </ul>
  );
}

type SentInvitationRowProps = {
  workspaceId: string;
  invitationId: string;
  email: string;
  role: WorkspaceRole;
  invitedByName: string | null;
  expiresAt: Date;
  canManage: boolean;
};

function SentInvitationRow({
  workspaceId,
  invitationId,
  email,
  role,
  invitedByName,
  expiresAt,
  canManage,
}: SentInvitationRowProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const revokeInvitation = useMutation(
    trpc.workspace.invitations.revoke.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.workspace.invitations.list.queryFilter({ workspaceId }),
        );
        setOpen(false);
      },
    }),
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{email}</span>
          <Badge variant="secondary">{workspaceRoleLabels[role]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {strings.invitations.invitedBy}: {invitedByName ?? '—'} · {strings.invitations.expiresAt}:{' '}
          {formatDate(expiresAt)}
        </p>
        {revokeInvitation.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {revokeInvitation.error.message || strings.common.unknownError}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {canManage && (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (revokeInvitation.isPending) return;
            setOpen(next);
            if (!next) revokeInvitation.reset();
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={revokeInvitation.isPending}>
              {revokeInvitation.isPending
                ? strings.invitations.revoking
                : strings.invitations.revoke}
            </Button>
          </DialogTrigger>
          <DialogContent closeLabel={strings.common.close}>
            <DialogHeader>
              <DialogTitle>{strings.invitations.revokeConfirmTitle}</DialogTitle>
              <DialogDescription>{strings.invitations.revokeConfirmDescription}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={revokeInvitation.isPending}>
                  {strings.common.cancel}
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={revokeInvitation.isPending}
                onClick={() =>
                  revokeInvitation.mutate({
                    workspaceId,
                    invitationId,
                    clientMutationId: crypto.randomUUID(),
                  })
                }
              >
                {strings.invitations.revokeConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
