'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { AddBoardMemberForm } from './add-board-member-form';
import { BoardSentInvitations } from './board-sent-invitations';

type BoardInvitationsSectionProps = {
  boardId: string;
  /** Whether the viewer is board `admin` — gates invite/revoke controls. */
  canManage: boolean;
};

/**
 * Board invitation management: new member invite/add form plus pending sent
 * invitations. This is separated from the member list so the settings dropdown
 * can route "Davet et" directly to the invitation workflow.
 */
export function BoardInvitationsSection({ boardId, canManage }: BoardInvitationsSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.board.settings;
  const [addNotice, setAddNotice] = useState<string | null>(null);
  // The server's `added` / `added_as_guest` results only carry a `userId`, so
  // keep the submitted e-mail around for the success notice.
  const [pendingAddEmail, setPendingAddEmail] = useState<string | null>(null);

  const refetchMembershipSurfaces = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.board.members.list.queryFilter({ boardId })),
      queryClient.invalidateQueries(trpc.board.invitations.list.queryFilter({ boardId })),
      queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId })),
    ]);

  const addMember = useMutation(
    trpc.board.members.add.mutationOptions({
      onSuccess: async (result) => {
        const who = result.kind === 'invited' ? result.email : (pendingAddEmail ?? '');
        setAddNotice(
          result.kind === 'added'
            ? `${who} ${copy.addedNotice}`
            : result.kind === 'added_as_guest'
              ? `${who} ${copy.addedAsGuestNotice}`
              : `${result.email} ${copy.invitedNotice}`,
        );
        setPendingAddEmail(null);
        await refetchMembershipSurfaces();
      },
      onError: () => {
        setPendingAddEmail(null);
      },
    }),
  );

  return (
    <div className="space-y-5">
      {canManage && (
        <AddBoardMemberForm
          onSubmit={({ email, role }) => {
            setAddNotice(null);
            setPendingAddEmail(email);
            addMember.reset();
            addMember.mutate({ boardId, email, role, clientMutationId: crypto.randomUUID() });
          }}
          pending={addMember.isPending}
          error={addMember.isError ? addMember.error.message || strings.common.unknownError : null}
          notice={addNotice}
        />
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{copy.pendingInvitationsTitle}</h3>
        <BoardSentInvitations boardId={boardId} canManage={canManage} />
      </div>
    </div>
  );
}
