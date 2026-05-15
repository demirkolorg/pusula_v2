'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardRole } from '@pusula/domain';
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
import { AppSpinner } from '@/components/app-spinner';
import { formatDate } from '@/lib/format';
import { boardRoleLabels, strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

type BoardSentInvitationsProps = {
  boardId: string;
  /** Whether the viewer is board `admin` — gates the "revoke" action. */
  canManage: boolean;
};

/**
 * "Sent invitations" section for a board: lists this board's `pending`
 * invitations (`board.invitations.list`, visible to board `member+`); board
 * `admin`s also get a "revoke" action per row (`board.invitations.revoke`),
 * which invalidates the list on success. Mirrors the workspace `SentInvitations`.
 * Each row owns its revoke mutation + inline error.
 */
export function BoardSentInvitations({ boardId, canManage }: BoardSentInvitationsProps) {
  const trpc = useTRPC();
  const copy = strings.board.settings;
  const invitations = useQuery(trpc.board.invitations.list.queryOptions({ boardId }));

  if (invitations.isPending) {
    return <AppSpinner label={strings.common.loading} showLabel className="justify-start" />;
  }

  if (invitations.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{copy.invitationsLoadErrorTitle}</AlertTitle>
        <AlertDescription>
          {invitations.error.message || strings.common.unknownError}
        </AlertDescription>
      </Alert>
    );
  }

  if (invitations.data.length === 0) {
    return <p className="text-muted-foreground text-sm">{copy.noSentInvitations}</p>;
  }

  return (
    <ul className="space-y-3">
      {invitations.data.map((invitation) => (
        <li key={invitation.id}>
          <BoardSentInvitationRow
            boardId={boardId}
            invitationId={invitation.id}
            email={invitation.email}
            role={invitation.role as BoardRole}
            invitedByName={invitation.invitedByName}
            expiresAt={invitation.expiresAt}
            canManage={canManage}
          />
        </li>
      ))}
    </ul>
  );
}

type BoardSentInvitationRowProps = {
  boardId: string;
  invitationId: string;
  email: string;
  role: BoardRole;
  invitedByName: string | null;
  expiresAt: Date | string;
  canManage: boolean;
};

function BoardSentInvitationRow({
  boardId,
  invitationId,
  email,
  role,
  invitedByName,
  expiresAt,
  canManage,
}: BoardSentInvitationRowProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.board.settings;
  const [open, setOpen] = useState(false);

  const revokeInvitation = useMutation(
    trpc.board.invitations.revoke.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.board.invitations.list.queryFilter({ boardId }));
        setOpen(false);
      },
    }),
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{email}</span>
          <Badge variant="secondary">{boardRoleLabels[role]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {copy.invitedBy}: {invitedByName ?? '—'} · {copy.expiresAt}: {formatDate(expiresAt)}
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
              {revokeInvitation.isPending ? copy.revoking : copy.revoke}
            </Button>
          </DialogTrigger>
          <DialogContent closeLabel={strings.common.close}>
            <DialogHeader>
              <DialogTitle>{copy.revokeConfirmTitle}</DialogTitle>
              <DialogDescription>{copy.revokeConfirmDescription}</DialogDescription>
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
                    boardId,
                    invitationId,
                    clientMutationId: crypto.randomUUID(),
                  })
                }
              >
                {copy.revokeConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
