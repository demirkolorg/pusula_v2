'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardRole } from '@pusula/domain';
import { Alert, AlertDescription, AlertTitle } from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { BoardMemberRow } from './board-member-row';

type BoardMembersSectionProps = {
  boardId: string;
  /** The workspace this board lives in — used for the "leave" navigation target. */
  workspaceId: string;
  /** Whether the viewer is board `admin` — gates role/remove/add controls. */
  canManage: boolean;
};

/**
 * Board member management section: loads `board.members.list`, renders a
 * presentational {@link BoardMemberRow} per member (explicit + inherited), and —
 * remove mutation invalidates the list (+ `board.get`) on success; "leave" (the
 * viewer removing their own membership) instead invalidates `board.list` /
 * `workspace.list` and navigates to the workspace screen. Inviting/adding a new
 * board member lives in the adjacent invitations section so the settings
 * dropdown has one responsibility per tab. The active mutation's target id +
 * error live here so only that row reflects pending/error state. No optimistic
 * UI (Phase 4) — mutation → await → invalidate → refetch.
 */
export function BoardMembersSection({ boardId, workspaceId, canManage }: BoardMembersSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const viewerUserId = session?.user.id ?? '';
  const copy = strings.board.settings;

  const members = useQuery(trpc.board.members.list.queryOptions({ boardId }));

  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ userId: string; message: string } | null>(null);

  const clearRowState = () => {
    setActiveUserId(null);
    setRowError(null);
  };

  const refetchMembers = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.board.members.list.queryFilter({ boardId })),
      queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId })),
    ]);

  const updateRole = useMutation(
    trpc.board.members.updateRole.mutationOptions({
      onSuccess: async () => {
        await refetchMembers();
        clearRowState();
      },
      onError: (error, variables) => {
        setRowError({
          userId: variables.userId,
          message: error.message || strings.common.unknownError,
        });
      },
    }),
  );

  const removeMember = useMutation(
    trpc.board.members.remove.mutationOptions({
      onSuccess: async (_data, variables) => {
        if (variables.userId === viewerUserId) {
          await Promise.all([
            queryClient.invalidateQueries(trpc.board.list.queryFilter({ workspaceId })),
            queryClient.invalidateQueries(trpc.workspace.list.queryFilter()),
          ]);
          router.replace(`/workspaces/${workspaceId}`);
          return;
        }
        await refetchMembers();
        clearRowState();
      },
      onError: (error, variables) => {
        setRowError({
          userId: variables.userId,
          message: error.message || strings.common.unknownError,
        });
      },
    }),
  );

  const isBusy = updateRole.isPending || removeMember.isPending;

  if (members.isPending || sessionPending) {
    return <AppSpinner label={copy.membersLoading} showLabel className="justify-start" />;
  }

  if (members.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{copy.membersLoadErrorTitle}</AlertTitle>
        <AlertDescription>{members.error.message || strings.common.unknownError}</AlertDescription>
      </Alert>
    );
  }

  // The sole explicit board admin can't be demoted/removed — lock that row.
  const explicitAdmins = members.data.filter((m) => !m.inherited && m.role === 'admin');
  const lastExplicitAdminId = explicitAdmins.length === 1 ? explicitAdmins[0]!.userId : null;

  const handleRoleChange = (userId: string, role: BoardRole) => {
    setRowError(null);
    setActiveUserId(userId);
    updateRole.mutate({ boardId, userId, role, clientMutationId: crypto.randomUUID() });
  };

  const handleRemove = (userId: string) => {
    setRowError(null);
    setActiveUserId(userId);
    removeMember.mutate({ boardId, userId, clientMutationId: crypto.randomUUID() });
  };

  return (
    <div className="space-y-4">
      {members.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.membersEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {members.data.map((member) => {
            const rowPending = isBusy && activeUserId === member.userId;
            return (
              <li key={member.userId}>
                <BoardMemberRow
                  member={{
                    userId: member.userId,
                    name: member.name,
                    email: member.email,
                    image: member.image,
                    role: member.role as BoardRole,
                    inherited: member.inherited,
                    isBot: member.isBot,
                  }}
                  viewerUserId={viewerUserId}
                  canManage={canManage}
                  isLastAdmin={member.userId === lastExplicitAdminId}
                  disabled={isBusy}
                  pending={rowPending}
                  error={rowError?.userId === member.userId ? rowError.message : null}
                  onRoleChange={(role) => handleRoleChange(member.userId, role)}
                  onRemove={() => handleRemove(member.userId)}
                  onLeave={() => handleRemove(member.userId)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
